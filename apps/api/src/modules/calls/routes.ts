/**
 * Call Management Routes
 *
 * API endpoints for voice call management with Twilio integration.
 */

import {
  getTwilioProductionProvider,
  requiresTwoPartyConsent,
} from '@realriches/agent-governance';
import type { TwilioConfig, VoiceCall } from '@realriches/agent-governance';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Schemas
// =============================================================================

const InitiateCallSchema = z.object({
  toNumber: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number format'),
  fromNumber: z.string().regex(/^\+[1-9]\d{1,14}$/).optional(),
  recordingEnabled: z.boolean().default(false),
  transcriptionEnabled: z.boolean().default(false),
  aiAnalysisEnabled: z.boolean().default(false),
  propertyId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const EndCallSchema = z.object({
  reason: z.string().optional(),
});

// =============================================================================
// Routes
// =============================================================================

export async function callRoutes(fastify: FastifyInstance) {
  // Get Twilio config from environment
  const twilioConfig: TwilioConfig = {
    accountSid: process.env['TWILIO_ACCOUNT_SID'] || '',
    authToken: process.env['TWILIO_AUTH_TOKEN'] || '',
    defaultFromNumber: process.env['TWILIO_FROM_NUMBER'],
    statusCallbackUrl: `${process.env['API_BASE_URL']}/webhooks/twilio/status`,
    recordingStatusCallbackUrl: `${process.env['API_BASE_URL']}/webhooks/twilio/recording`,
    transcriptionCallbackUrl: `${process.env['API_BASE_URL']}/webhooks/twilio/transcription`,
  };

  // ---------------------------------------------------------------------------
  // POST /calls - Initiate outbound call
  // ---------------------------------------------------------------------------
  fastify.post<{ Body: z.infer<typeof InitiateCallSchema> }>(
    '/',
    {
      preHandler: async (request, reply) => {
        await fastify.authenticate(request, reply);
      },
      schema: {
        description: 'Initiate an outbound voice call',
        tags: ['Calls'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['toNumber'],
          properties: {
            toNumber: { type: 'string' },
            fromNumber: { type: 'string' },
            recordingEnabled: { type: 'boolean' },
            transcriptionEnabled: { type: 'boolean' },
            aiAnalysisEnabled: { type: 'boolean' },
            propertyId: { type: 'string', format: 'uuid' },
            leadId: { type: 'string', format: 'uuid' },
            metadata: { type: 'object' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = InitiateCallSchema.parse(request.body);
      // Get organizationId from user's organization membership (via JWT payload extension)
      const organizationId = (request.user as { organizationId?: string } | null)?.organizationId;

      if (!organizationId) {
        return reply.status(400).send({
          success: false,
          error: { code: 'NO_ORGANIZATION', message: 'User has no organization' },
        });
      }

      // Enforce plan limits
      const enforcement = await fastify.enforcePlanLimit(request, reply, 'calls');
      if (enforcement && !enforcement.allowed) {
        return; // Reply already sent by enforcer
      }

      // Get market from organization
      const org = await fastify.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { defaultMarket: true },
      });
      const market = org?.defaultMarket || 'DEFAULT';

      // Initialize provider
      const provider = getTwilioProductionProvider(twilioConfig);

      const result = await provider.initiateCall({
        fromNumber: body.fromNumber || twilioConfig.defaultFromNumber || '',
        toNumber: body.toNumber,
        tenantId: organizationId,
        userId: request.user?.id,
        propertyId: body.propertyId,
        leadId: body.leadId,
        market,
        recordingEnabled: body.recordingEnabled,
        transcriptionEnabled: body.transcriptionEnabled,
        aiAnalysisEnabled: body.aiAnalysisEnabled,
        metadata: body.metadata,
      });

      if (!result.ok) {
        return reply.status(500).send({
          success: false,
          error: { code: result.error.code, message: result.error.message },
        });
      }

      // Persist to database
      await fastify.prisma.call.create({
        data: {
          id: result.data.id,
          organizationId,
          provider: 'twilio',
          providerCallId: result.data.externalId,
          direction: 'outbound',
          status: 'initiated',
          fromNumber: result.data.fromNumber,
          toNumber: result.data.toNumber,
          userId: request.user?.id,
          recordingConsent: false,
          transcriptionConsent: false,
          market,
          twoPartyConsentRequired: result.data.twoPartyConsentRequired,
          initiatedAt: result.data.initiatedAt,
        },
      });

      return reply.send({
        success: true,
        data: {
          id: result.data.id,
          externalId: result.data.externalId,
          status: result.data.status,
          fromNumber: result.data.fromNumber,
          toNumber: result.data.toNumber,
          twoPartyConsentRequired: result.data.twoPartyConsentRequired,
          initiatedAt: result.data.initiatedAt,
        },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // GET /calls/:id - Get call details
  // ---------------------------------------------------------------------------
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    {
      preHandler: async (request, reply) => {
        await fastify.authenticate(request, reply);
      },
      schema: {
        description: 'Get call details',
        tags: ['Calls'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const organizationId = (request.user as { organizationId?: string } | null)?.organizationId;

      const call = await fastify.prisma.call.findFirst({
        where: {
          id,
          ...(organizationId && { organizationId }),
        },
        include: {
          consents: true,
          recordings: {
            select: {
              id: true,
              durationSeconds: true,
              createdAt: true,
            },
          },
        },
      });

      if (!call) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Call not found' },
        });
      }

      return reply.send({
        success: true,
        data: {
          id: call.id,
          direction: call.direction,
          status: call.status,
          fromNumber: call.fromNumber,
          toNumber: call.toNumber,
          initiatedAt: call.initiatedAt,
          answeredAt: call.answeredAt,
          endedAt: call.endedAt,
          durationSeconds: call.durationSeconds,
          recordingConsent: call.recordingConsent,
          transcriptionConsent: call.transcriptionConsent,
          twoPartyConsentRequired: call.twoPartyConsentRequired,
          summary: call.summary,
          consents: call.consents.map(c => ({
            type: c.consentType,
            status: c.status,
            grantedAt: c.grantedAt,
          })),
          recordings: call.recordings,
        },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // GET /calls/:id/transcript - Get redacted transcript
  // ---------------------------------------------------------------------------
  fastify.get<{ Params: { id: string } }>(
    '/:id/transcript',
    {
      preHandler: async (request, reply) => {
        await fastify.authenticate(request, reply);
      },
      schema: {
        description: 'Get call transcript (PII redacted)',
        tags: ['Calls'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const organizationId = (request.user as { organizationId?: string } | null)?.organizationId;

      const call = await fastify.prisma.call.findFirst({
        where: { id, ...(organizationId && { organizationId }) },
        include: {
          recordings: {
            include: {
              transcript: true,
            },
          },
        },
      });

      if (!call) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Call not found' },
        });
      }

      const transcripts = call.recordings
        .map(r => r.transcript)
        .filter(Boolean);

      if (transcripts.length === 0) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NO_TRANSCRIPT', message: 'No transcript available for this call' },
        });
      }

      // Return redacted text only (not encrypted original)
      return reply.send({
        success: true,
        data: {
          callId: call.id,
          transcripts: transcripts.map(t => ({
            id: t!.id,
            redactedText: t!.redactedFullText,
            piiDetected: t!.piiDetected,
            piiTypesFound: t!.piiTypesFound,
            language: t!.language,
            createdAt: t!.createdAt,
          })),
        },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // POST /calls/:id/end - End an active call
  // ---------------------------------------------------------------------------
  fastify.post<{ Params: { id: string }; Body: z.infer<typeof EndCallSchema> }>(
    '/:id/end',
    {
      preHandler: async (request, reply) => {
        await fastify.authenticate(request, reply);
      },
      schema: {
        description: 'End an active call',
        tags: ['Calls'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: { reason: { type: 'string' } },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const body = EndCallSchema.parse(request.body);
      const organizationId = (request.user as { organizationId?: string } | null)?.organizationId;

      const call = await fastify.prisma.call.findFirst({
        where: { id, ...(organizationId && { organizationId }) },
      });

      if (!call) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Call not found' },
        });
      }

      if (call.status === 'completed' || call.status === 'failed') {
        return reply.status(400).send({
          success: false,
          error: { code: 'ALREADY_ENDED', message: 'Call has already ended' },
        });
      }

      const provider = getTwilioProductionProvider(twilioConfig);
      const result = await provider.endCall(id, body.reason);

      if (!result.ok) {
        return reply.status(500).send({
          success: false,
          error: { code: result.error.code, message: result.error.message },
        });
      }

      // Update database
      await fastify.prisma.call.update({
        where: { id },
        data: {
          status: 'completed',
          endedAt: new Date(),
        },
      });

      return reply.send({
        success: true,
        data: { id, status: 'completed', endedAt: new Date() },
      });
    }
  );

  // ---------------------------------------------------------------------------
  // POST /webhooks/twilio/status - Twilio status callback
  // ---------------------------------------------------------------------------
  fastify.post(
    '/webhooks/twilio/status',
    {
      schema: {
        description: 'Twilio call status webhook',
        tags: ['Webhooks'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as Record<string, string>;
      const provider = getTwilioProductionProvider(twilioConfig);

      const result = await provider.handleWebhook(body);

      if (!result.ok) {
        request.log.error({ error: result.error }, 'Webhook processing failed');
        return reply.status(500).send();
      }

      const event = result.data;
      const callId = event.data['internalCallId'] as string | undefined;

      if (callId) {
        // Update call in database
        const updateData: Record<string, unknown> = {
          status: mapEventToStatus(event.type),
        };

        if (event.type === 'call.answered') {
          updateData['answeredAt'] = new Date();
        }

        if (event.type === 'call.completed' || event.type === 'call.failed') {
          updateData['endedAt'] = new Date();
          if (event.data['CallDuration']) {
            updateData['durationSeconds'] = parseInt(event.data['CallDuration'] as string, 10);
          }
        }

        await fastify.prisma.call.update({
          where: { id: callId },
          data: updateData,
        });
      }

      // Return empty TwiML response
      reply.type('text/xml');
      return reply.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  );

  // ---------------------------------------------------------------------------
  // POST /webhooks/twilio/recording - Twilio recording callback
  // ---------------------------------------------------------------------------
  fastify.post(
    '/webhooks/twilio/recording',
    {
      schema: {
        description: 'Twilio recording status webhook',
        tags: ['Webhooks'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as Record<string, string>;

      const callSid = body['CallSid'];
      const recordingSid = body['RecordingSid'];
      const recordingUrl = body['RecordingUrl'];
      const recordingStatus = body['RecordingStatus'];
      const recordingDuration = body['RecordingDuration'];

      if (recordingStatus === 'completed' && recordingSid && recordingUrl) {
        // Find the call by provider ID
        const call = await fastify.prisma.call.findFirst({
          where: { providerCallId: callSid },
        });

        if (call) {
          // Create recording record
          await fastify.prisma.callRecording.create({
            data: {
              callId: call.id,
              providerRecordingId: recordingSid,
              encrypted: true, // Will be encrypted when stored
              retentionDays: 90, // Default retention
              retentionExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
              format: 'wav',
              channels: 2,
              durationSeconds: recordingDuration ? parseInt(recordingDuration, 10) : null,
            },
          });

          // TODO: Queue job to download, encrypt, and store recording
        }
      }

      reply.type('text/xml');
      return reply.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }
  );
}

// =============================================================================
// Helpers
// =============================================================================

function mapEventToStatus(eventType: string): string {
  switch (eventType) {
    case 'call.initiated':
      return 'initiated';
    case 'call.ringing':
      return 'ringing';
    case 'call.answered':
      return 'in_progress';
    case 'call.completed':
      return 'completed';
    case 'call.failed':
      return 'failed';
    default:
      return 'initiated';
  }
}

export default callRoutes;
