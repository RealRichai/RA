/**
 * E-Signature Integration Module
 *
 * Provides adapters for DocuSign, HelloSign, and other e-signature providers.
 * Supports document preparation, signing workflows, and status tracking.
 */

import { prisma } from '@realriches/database';
import { generatePrefixedId, logger, AppError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Types
// =============================================================================

export type ESignProvider = 'docusign' | 'hellosign' | 'pandadoc' | 'mock';
export type EnvelopeStatus = 'draft' | 'sent' | 'delivered' | 'viewed' | 'signed' | 'completed' | 'declined' | 'voided' | 'expired';
export type SignerStatus = 'pending' | 'sent' | 'delivered' | 'signed' | 'declined';

interface SignerInfo {
  id: string;
  name: string;
  email: string;
  role: 'tenant' | 'landlord' | 'guarantor' | 'witness' | 'other';
  order: number;
  status: SignerStatus;
  signedAt?: Date;
  ipAddress?: string;
}

interface SignatureEnvelope {
  id: string;
  userId: string;
  provider: ESignProvider;
  providerEnvelopeId?: string;
  documentType: 'lease' | 'amendment' | 'addendum' | 'notice' | 'disclosure' | 'other';
  relatedEntityId?: string; // leaseId, propertyId, etc.
  relatedEntityType?: string;
  title: string;
  message?: string;
  documents: Array<{
    id: string;
    name: string;
    fileUrl: string;
    pageCount?: number;
  }>;
  signers: SignerInfo[];
  status: EnvelopeStatus;
  expiresAt?: Date;
  sentAt?: Date;
  completedAt?: Date;
  webhookUrl?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface ProviderConfig {
  provider: ESignProvider;
  apiKey?: string;
  accountId?: string;
  baseUrl?: string;
  webhookSecret?: string;
}

// =============================================================================
// Provider Interface
// =============================================================================

interface IESignProvider {
  name: ESignProvider;
  createEnvelope(envelope: SignatureEnvelope): Promise<{ providerEnvelopeId: string; signingUrls: Record<string, string> }>;
  sendEnvelope(providerEnvelopeId: string): Promise<void>;
  voidEnvelope(providerEnvelopeId: string, reason: string): Promise<void>;
  getEnvelopeStatus(providerEnvelopeId: string): Promise<EnvelopeStatus>;
  getSigningUrl(providerEnvelopeId: string, signerId: string, returnUrl: string): Promise<string>;
  downloadDocument(providerEnvelopeId: string, documentId: string): Promise<Buffer>;
  verifyWebhook(payload: string, signature: string): boolean;
}

// =============================================================================
// Mock Provider (for development/testing)
// =============================================================================

class MockESignProvider implements IESignProvider {
  name: ESignProvider = 'mock';
  private envelopes = new Map<string, { status: EnvelopeStatus; signers: Map<string, SignerStatus> }>();

  async createEnvelope(envelope: SignatureEnvelope): Promise<{ providerEnvelopeId: string; signingUrls: Record<string, string> }> {
    const providerEnvelopeId = `mock_env_${Date.now()}`;
    const signerStatuses = new Map<string, SignerStatus>();
    const signingUrls: Record<string, string> = {};

    for (const signer of envelope.signers) {
      signerStatuses.set(signer.id, 'pending');
      signingUrls[signer.id] = `https://mock-esign.example.com/sign/${providerEnvelopeId}/${signer.id}`;
    }

    this.envelopes.set(providerEnvelopeId, { status: 'draft', signers: signerStatuses });
    return { providerEnvelopeId, signingUrls };
  }

  async sendEnvelope(providerEnvelopeId: string): Promise<void> {
    const envelope = this.envelopes.get(providerEnvelopeId);
    if (envelope) {
      envelope.status = 'sent';
      for (const [signerId] of envelope.signers) {
        envelope.signers.set(signerId, 'sent');
      }
    }
  }

  async voidEnvelope(providerEnvelopeId: string, _reason: string): Promise<void> {
    const envelope = this.envelopes.get(providerEnvelopeId);
    if (envelope) {
      envelope.status = 'voided';
    }
  }

  async getEnvelopeStatus(providerEnvelopeId: string): Promise<EnvelopeStatus> {
    return this.envelopes.get(providerEnvelopeId)?.status || 'draft';
  }

  async getSigningUrl(providerEnvelopeId: string, signerId: string, returnUrl: string): Promise<string> {
    return `https://mock-esign.example.com/sign/${providerEnvelopeId}/${signerId}?return=${encodeURIComponent(returnUrl)}`;
  }

  async downloadDocument(_providerEnvelopeId: string, _documentId: string): Promise<Buffer> {
    return Buffer.from('Mock signed document PDF content');
  }

  verifyWebhook(_payload: string, _signature: string): boolean {
    return true;
  }

  // Mock helper to simulate signing
  simulateSign(providerEnvelopeId: string, signerId: string): void {
    const envelope = this.envelopes.get(providerEnvelopeId);
    if (envelope) {
      envelope.signers.set(signerId, 'signed');
      const allSigned = Array.from(envelope.signers.values()).every(s => s === 'signed');
      if (allSigned) {
        envelope.status = 'completed';
      }
    }
  }
}

// =============================================================================
// DocuSign Provider
// =============================================================================

class DocuSignProvider implements IESignProvider {
  name: ESignProvider = 'docusign';
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async createEnvelope(envelope: SignatureEnvelope): Promise<{ providerEnvelopeId: string; signingUrls: Record<string, string> }> {
    // In production, this would call DocuSign API
    // POST /restapi/v2.1/accounts/{accountId}/envelopes
    logger.info({ envelopeId: envelope.id }, 'DocuSign: Creating envelope');

    // Placeholder - would make actual API call
    const providerEnvelopeId = `ds_${generatePrefixedId('env')}`;
    const signingUrls: Record<string, string> = {};

    for (const signer of envelope.signers) {
      signingUrls[signer.id] = `https://demo.docusign.net/Signing/${providerEnvelopeId}?r=${signer.id}`;
    }

    return { providerEnvelopeId, signingUrls };
  }

  async sendEnvelope(providerEnvelopeId: string): Promise<void> {
    // PUT /restapi/v2.1/accounts/{accountId}/envelopes/{envelopeId}
    // { "status": "sent" }
    logger.info({ providerEnvelopeId }, 'DocuSign: Sending envelope');
  }

  async voidEnvelope(providerEnvelopeId: string, reason: string): Promise<void> {
    // PUT /restapi/v2.1/accounts/{accountId}/envelopes/{envelopeId}
    // { "status": "voided", "voidedReason": reason }
    logger.info({ providerEnvelopeId, reason }, 'DocuSign: Voiding envelope');
  }

  async getEnvelopeStatus(providerEnvelopeId: string): Promise<EnvelopeStatus> {
    // GET /restapi/v2.1/accounts/{accountId}/envelopes/{envelopeId}
    logger.info({ providerEnvelopeId }, 'DocuSign: Getting status');
    return 'sent'; // Placeholder
  }

  async getSigningUrl(providerEnvelopeId: string, signerId: string, returnUrl: string): Promise<string> {
    // POST /restapi/v2.1/accounts/{accountId}/envelopes/{envelopeId}/views/recipient
    logger.info({ providerEnvelopeId, signerId }, 'DocuSign: Getting signing URL');
    return `https://demo.docusign.net/Signing/${providerEnvelopeId}?r=${signerId}&return=${encodeURIComponent(returnUrl)}`;
  }

  async downloadDocument(providerEnvelopeId: string, documentId: string): Promise<Buffer> {
    // GET /restapi/v2.1/accounts/{accountId}/envelopes/{envelopeId}/documents/{documentId}
    logger.info({ providerEnvelopeId, documentId }, 'DocuSign: Downloading document');
    return Buffer.from('DocuSign signed document');
  }

  verifyWebhook(payload: string, signature: string): boolean {
    // Verify HMAC signature
    // In production, use crypto.createHmac with webhook secret
    return !!signature && !!payload;
  }
}

// =============================================================================
// HelloSign Provider
// =============================================================================

class HelloSignProvider implements IESignProvider {
  name: ESignProvider = 'hellosign';
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async createEnvelope(envelope: SignatureEnvelope): Promise<{ providerEnvelopeId: string; signingUrls: Record<string, string> }> {
    // POST /signature_request/send
    logger.info({ envelopeId: envelope.id }, 'HelloSign: Creating signature request');

    const providerEnvelopeId = `hs_${generatePrefixedId('sig')}`;
    const signingUrls: Record<string, string> = {};

    for (const signer of envelope.signers) {
      signingUrls[signer.id] = `https://app.hellosign.com/sign/${providerEnvelopeId}?s=${signer.id}`;
    }

    return { providerEnvelopeId, signingUrls };
  }

  async sendEnvelope(providerEnvelopeId: string): Promise<void> {
    // HelloSign sends immediately on create, this is a no-op
    logger.info({ providerEnvelopeId }, 'HelloSign: Envelope already sent on creation');
  }

  async voidEnvelope(providerEnvelopeId: string, reason: string): Promise<void> {
    // POST /signature_request/cancel/{signature_request_id}
    logger.info({ providerEnvelopeId, reason }, 'HelloSign: Canceling request');
  }

  async getEnvelopeStatus(providerEnvelopeId: string): Promise<EnvelopeStatus> {
    // GET /signature_request/{signature_request_id}
    logger.info({ providerEnvelopeId }, 'HelloSign: Getting status');
    return 'sent';
  }

  async getSigningUrl(providerEnvelopeId: string, signerId: string, returnUrl: string): Promise<string> {
    // GET /embedded/sign_url/{signature_id}
    logger.info({ providerEnvelopeId, signerId }, 'HelloSign: Getting embedded URL');
    return `https://app.hellosign.com/editor/embeddedSign?signature_id=${signerId}&return=${encodeURIComponent(returnUrl)}`;
  }

  async downloadDocument(providerEnvelopeId: string, documentId: string): Promise<Buffer> {
    // GET /signature_request/files/{signature_request_id}
    logger.info({ providerEnvelopeId, documentId }, 'HelloSign: Downloading files');
    return Buffer.from('HelloSign signed document');
  }

  verifyWebhook(payload: string, signature: string): boolean {
    // Verify event hash
    return !!signature && !!payload;
  }
}

// =============================================================================
// Provider Factory
// =============================================================================

const providers = new Map<ESignProvider, IESignProvider>();

function getProvider(provider: ESignProvider): IESignProvider {
  if (!providers.has(provider)) {
    switch (provider) {
      case 'docusign':
        providers.set(provider, new DocuSignProvider({
          provider: 'docusign',
          apiKey: process.env.DOCUSIGN_API_KEY,
          accountId: process.env.DOCUSIGN_ACCOUNT_ID,
        }));
        break;
      case 'hellosign':
        providers.set(provider, new HelloSignProvider({
          provider: 'hellosign',
          apiKey: process.env.HELLOSIGN_API_KEY,
        }));
        break;
      default:
        providers.set(provider, new MockESignProvider());
    }
  }
  return providers.get(provider)!;
}

// =============================================================================
// In-Memory Storage (would be Prisma in production)
// =============================================================================

const envelopes = new Map<string, SignatureEnvelope>();

// =============================================================================
// Schemas
// =============================================================================

const CreateEnvelopeSchema = z.object({
  provider: z.enum(['docusign', 'hellosign', 'pandadoc', 'mock']).default('mock'),
  documentType: z.enum(['lease', 'amendment', 'addendum', 'notice', 'disclosure', 'other']),
  relatedEntityId: z.string().optional(),
  relatedEntityType: z.string().optional(),
  title: z.string().min(1).max(200),
  message: z.string().optional(),
  documents: z.array(z.object({
    name: z.string(),
    fileUrl: z.string().url(),
  })).min(1),
  signers: z.array(z.object({
    name: z.string(),
    email: z.string().email(),
    role: z.enum(['tenant', 'landlord', 'guarantor', 'witness', 'other']),
    order: z.number().min(1).default(1),
  })).min(1),
  expiresInDays: z.number().min(1).max(365).default(30),
});

const SendEnvelopeSchema = z.object({
  message: z.string().optional(),
});

// =============================================================================
// Routes
// =============================================================================

export async function esignatureRoutes(app: FastifyInstance): Promise<void> {
  // List envelopes
  app.get(
    '/envelopes',
    {
      schema: {
        description: 'List signature envelopes',
        tags: ['E-Signature'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            documentType: { type: 'string' },
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 20 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { status?: string; documentType?: string; page?: number; limit?: number };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { status, documentType, page = 1, limit = 20 } = request.query;

      let userEnvelopes = Array.from(envelopes.values())
        .filter(e => e.userId === request.user!.id);

      if (status) {
        userEnvelopes = userEnvelopes.filter(e => e.status === status);
      }
      if (documentType) {
        userEnvelopes = userEnvelopes.filter(e => e.documentType === documentType);
      }

      userEnvelopes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const total = userEnvelopes.length;
      const offset = (page - 1) * limit;
      userEnvelopes = userEnvelopes.slice(offset, offset + limit);

      return reply.send({
        success: true,
        data: {
          envelopes: userEnvelopes,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        },
      });
    }
  );

  // Create envelope
  app.post(
    '/envelopes',
    {
      schema: {
        description: 'Create a signature envelope',
        tags: ['E-Signature'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof CreateEnvelopeSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = CreateEnvelopeSchema.parse(request.body);
      const now = new Date();

      const envelope: SignatureEnvelope = {
        id: generatePrefixedId('env'),
        userId: request.user.id,
        provider: data.provider,
        documentType: data.documentType,
        relatedEntityId: data.relatedEntityId,
        relatedEntityType: data.relatedEntityType,
        title: data.title,
        message: data.message,
        documents: data.documents.map((d, i) => ({
          id: generatePrefixedId('doc'),
          name: d.name,
          fileUrl: d.fileUrl,
        })),
        signers: data.signers.map((s, i) => ({
          id: generatePrefixedId('sig'),
          name: s.name,
          email: s.email,
          role: s.role,
          order: s.order,
          status: 'pending' as SignerStatus,
        })),
        status: 'draft',
        expiresAt: new Date(now.getTime() + data.expiresInDays * 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      };

      // Create envelope with provider
      const provider = getProvider(data.provider);
      const { providerEnvelopeId, signingUrls } = await provider.createEnvelope(envelope);
      envelope.providerEnvelopeId = providerEnvelopeId;

      envelopes.set(envelope.id, envelope);

      logger.info({
        envelopeId: envelope.id,
        provider: data.provider,
        signerCount: envelope.signers.length,
      }, 'E-signature envelope created');

      return reply.status(201).send({
        success: true,
        data: { envelope, signingUrls },
      });
    }
  );

  // Get envelope details
  app.get(
    '/envelopes/:envelopeId',
    {
      schema: {
        description: 'Get envelope details',
        tags: ['E-Signature'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { envelopeId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { envelopeId } = request.params;
      const envelope = envelopes.get(envelopeId);

      if (!envelope || envelope.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Envelope not found', 404);
      }

      // Refresh status from provider
      if (envelope.providerEnvelopeId) {
        const provider = getProvider(envelope.provider);
        const providerStatus = await provider.getEnvelopeStatus(envelope.providerEnvelopeId);
        envelope.status = providerStatus;
      }

      return reply.send({
        success: true,
        data: { envelope },
      });
    }
  );

  // Send envelope
  app.post(
    '/envelopes/:envelopeId/send',
    {
      schema: {
        description: 'Send envelope to signers',
        tags: ['E-Signature'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Params: { envelopeId: string };
        Body: z.infer<typeof SendEnvelopeSchema>;
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { envelopeId } = request.params;
      const envelope = envelopes.get(envelopeId);

      if (!envelope || envelope.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Envelope not found', 404);
      }

      if (envelope.status !== 'draft') {
        throw new AppError('INVALID_STATE', 'Envelope has already been sent', 400);
      }

      const provider = getProvider(envelope.provider);
      await provider.sendEnvelope(envelope.providerEnvelopeId!);

      envelope.status = 'sent';
      envelope.sentAt = new Date();
      envelope.updatedAt = new Date();

      for (const signer of envelope.signers) {
        signer.status = 'sent';
      }

      logger.info({ envelopeId }, 'Envelope sent to signers');

      return reply.send({
        success: true,
        data: { envelope },
        message: 'Envelope sent to signers',
      });
    }
  );

  // Get signing URL
  app.get(
    '/envelopes/:envelopeId/sign/:signerId',
    {
      schema: {
        description: 'Get embedded signing URL for a signer',
        tags: ['E-Signature'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            returnUrl: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Params: { envelopeId: string; signerId: string };
        Querystring: { returnUrl?: string };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { envelopeId, signerId } = request.params;
      const { returnUrl = 'https://app.realriches.com/documents/signed' } = request.query;

      const envelope = envelopes.get(envelopeId);

      if (!envelope) {
        throw new AppError('NOT_FOUND', 'Envelope not found', 404);
      }

      const signer = envelope.signers.find(s => s.id === signerId);
      if (!signer) {
        throw new AppError('NOT_FOUND', 'Signer not found', 404);
      }

      // Verify the requester is the signer or the envelope owner
      if (envelope.userId !== request.user.id && signer.email !== request.user.email) {
        throw new AppError('FORBIDDEN', 'Not authorized to sign this document', 403);
      }

      const provider = getProvider(envelope.provider);
      const signingUrl = await provider.getSigningUrl(envelope.providerEnvelopeId!, signerId, returnUrl);

      return reply.send({
        success: true,
        data: { signingUrl, expiresIn: 300 }, // URL typically expires in 5 minutes
      });
    }
  );

  // Void envelope
  app.post(
    '/envelopes/:envelopeId/void',
    {
      schema: {
        description: 'Void an envelope',
        tags: ['E-Signature'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Params: { envelopeId: string };
        Body: { reason: string };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { envelopeId } = request.params;
      const { reason } = request.body;

      const envelope = envelopes.get(envelopeId);

      if (!envelope || envelope.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Envelope not found', 404);
      }

      if (['completed', 'voided'].includes(envelope.status)) {
        throw new AppError('INVALID_STATE', 'Cannot void this envelope', 400);
      }

      const provider = getProvider(envelope.provider);
      await provider.voidEnvelope(envelope.providerEnvelopeId!, reason);

      envelope.status = 'voided';
      envelope.updatedAt = new Date();

      logger.info({ envelopeId, reason }, 'Envelope voided');

      return reply.send({
        success: true,
        data: { envelope },
        message: 'Envelope voided',
      });
    }
  );

  // Download signed document
  app.get(
    '/envelopes/:envelopeId/download/:documentId',
    {
      schema: {
        description: 'Download signed document',
        tags: ['E-Signature'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { envelopeId: string; documentId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { envelopeId, documentId } = request.params;
      const envelope = envelopes.get(envelopeId);

      if (!envelope || envelope.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Envelope not found', 404);
      }

      const document = envelope.documents.find(d => d.id === documentId);
      if (!document) {
        throw new AppError('NOT_FOUND', 'Document not found', 404);
      }

      const provider = getProvider(envelope.provider);
      const pdfBuffer = await provider.downloadDocument(envelope.providerEnvelopeId!, documentId);

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="${document.name}.pdf"`)
        .send(pdfBuffer);
    }
  );

  // Webhook handler for provider callbacks
  app.post(
    '/webhooks/:provider',
    {
      schema: {
        description: 'Webhook endpoint for e-signature providers',
        tags: ['E-Signature'],
      },
    },
    async (
      request: FastifyRequest<{
        Params: { provider: ESignProvider };
        Body: Record<string, unknown>;
      }>,
      reply: FastifyReply
    ) => {
      const { provider: providerName } = request.params;
      const signature = request.headers['x-signature'] as string || '';

      const provider = getProvider(providerName);
      const payload = JSON.stringify(request.body);

      if (!provider.verifyWebhook(payload, signature)) {
        throw new AppError('UNAUTHORIZED', 'Invalid webhook signature', 401);
      }

      // Process webhook event
      const event = request.body;
      logger.info({ provider: providerName, eventType: event.type || 'unknown' }, 'E-signature webhook received');

      // Update envelope status based on event
      // This would be provider-specific parsing

      return reply.send({ received: true });
    }
  );

  // Create envelope from lease
  app.post(
    '/envelopes/from-lease/:leaseId',
    {
      schema: {
        description: 'Create signature envelope from lease',
        tags: ['E-Signature'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Params: { leaseId: string };
        Body: { provider?: ESignProvider };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { leaseId } = request.params;
      const { provider: providerName = 'mock' } = request.body;

      const lease = await prisma.lease.findUnique({
        where: { id: leaseId },
        include: {
          unit: {
            include: {
              property: true,
            },
          },
          tenant: true,
        },
      });

      if (!lease) {
        throw new AppError('NOT_FOUND', 'Lease not found', 404);
      }

      if (lease.unit.property.ownerId !== request.user.id) {
        throw new AppError('FORBIDDEN', 'Not authorized', 403);
      }

      const now = new Date();

      const envelope: SignatureEnvelope = {
        id: generatePrefixedId('env'),
        userId: request.user.id,
        provider: providerName,
        documentType: 'lease',
        relatedEntityId: leaseId,
        relatedEntityType: 'lease',
        title: `Lease Agreement - ${lease.unit.property.name} Unit ${lease.unit.unitNumber}`,
        documents: [{
          id: generatePrefixedId('doc'),
          name: 'Lease Agreement',
          fileUrl: `https://storage.realriches.com/leases/${leaseId}/agreement.pdf`,
        }],
        signers: [
          {
            id: generatePrefixedId('sig'),
            name: lease.tenant ? `${lease.tenant.firstName} ${lease.tenant.lastName}` : 'Tenant',
            email: lease.tenant?.email || '',
            role: 'tenant',
            order: 1,
            status: 'pending',
          },
          {
            id: generatePrefixedId('sig'),
            name: request.user.name || 'Landlord',
            email: request.user.email || '',
            role: 'landlord',
            order: 2,
            status: 'pending',
          },
        ],
        status: 'draft',
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        createdAt: now,
        updatedAt: now,
      };

      const provider = getProvider(providerName);
      const { providerEnvelopeId, signingUrls } = await provider.createEnvelope(envelope);
      envelope.providerEnvelopeId = providerEnvelopeId;

      envelopes.set(envelope.id, envelope);

      logger.info({ envelopeId: envelope.id, leaseId }, 'Lease signature envelope created');

      return reply.status(201).send({
        success: true,
        data: { envelope, signingUrls },
      });
    }
  );
}

// =============================================================================
// Exports
// =============================================================================

export {
  envelopes,
  getProvider,
  MockESignProvider,
  DocuSignProvider,
  HelloSignProvider,
};
