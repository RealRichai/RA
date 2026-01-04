/**
 * Vault Onboarding Routes
 *
 * API endpoints for Property Record Vault onboarding workflow.
 * Includes ACL enforcement, evidence logging, and upsell triggers.
 *
 * Feature gated by: PROPERTY_VAULT_ONBOARDING
 */

import {
  getVaultOnboardingService,
  getVaultEvidencePersistence,
  getUpsellTriggerService,
  detectUpsellTriggers,
  InitializeVaultSchema,
  UploadVaultDocumentSchema,
  type VaultEvidenceRecord,
} from '@realriches/document-storage';
import { FeatureFlag, isFeatureEnabled } from '@realriches/feature-flags';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Feature Flag Guard
// =============================================================================

async function checkFeatureFlag(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const enabled = isFeatureEnabled(FeatureFlag.PROPERTY_VAULT_ONBOARDING, {
    userId: request.user?.id,
  });

  if (!enabled) {
    reply.status(404).send({
      success: false,
      error: {
        code: 'FEATURE_DISABLED',
        message: 'Property Vault Onboarding feature is not available',
      },
    });
  }
}

// =============================================================================
// ACL Helper
// =============================================================================

async function checkPropertyAccess(
  prisma: FastifyInstance['prisma'],
  userId: string,
  propertyId: string,
  action: 'read' | 'write' | 'admin'
): Promise<{ allowed: boolean; role: string; reason?: string }> {
  // Get property with ownership info
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      ownerId: true,
      managerId: true,
    },
  });

  if (!property) {
    return { allowed: false, role: 'unknown', reason: 'Property not found' };
  }

  // Owner has full access
  if (property.ownerId === userId) {
    return { allowed: true, role: 'owner' };
  }

  // Manager has read/write access
  if (property.managerId === userId) {
    if (action === 'admin') {
      return { allowed: false, role: 'manager', reason: 'Manager cannot perform admin actions' };
    }
    return { allowed: true, role: 'manager' };
  }

  // Check if user is admin
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN') {
    return { allowed: true, role: user.role.toLowerCase() };
  }

  return { allowed: false, role: 'unknown', reason: 'No access to this property' };
}

// =============================================================================
// Evidence Helper
// =============================================================================

async function emitEvidence(
  prisma: FastifyInstance['prisma'],
  record: VaultEvidenceRecord
): Promise<void> {
  const persistence = getVaultEvidencePersistence(prisma);
  await persistence.persist(record);
}

// =============================================================================
// Routes
// =============================================================================

export async function vaultOnboardingRoutes(app: FastifyInstance): Promise<void> {
  const prisma = app.prisma;

  // ===========================================================================
  // VAULT INITIALIZATION
  // ===========================================================================

  /**
   * POST /properties/:propertyId/vault/initialize - Initialize vault for a property
   */
  app.post<{
    Params: { propertyId: string };
    Body: { propertyType: string; enabledFolders?: string[] };
  }>(
    '/properties/:propertyId/vault/initialize',
    {
      schema: {
        description: 'Initialize a property record vault',
        tags: ['Vault Onboarding'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            propertyId: { type: 'string', format: 'uuid' },
          },
          required: ['propertyId'],
        },
        body: {
          type: 'object',
          properties: {
            propertyType: { type: 'string' },
            enabledFolders: { type: 'array', items: { type: 'string' } },
          },
          required: ['propertyType'],
        },
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { propertyId } = request.params;
      const userId = request.user!.id;

      // Check ACL
      const access = await checkPropertyAccess(prisma, userId, propertyId, 'write');

      // Emit evidence regardless of outcome
      await emitEvidence(prisma, {
        eventType: 'ACL_CHECK',
        eventOutcome: access.allowed ? 'SUCCESS' : 'DENIED',
        controlId: 'CC6.1',
        propertyId,
        actorUserId: userId,
        actorRole: access.role,
        actorEmail: request.user!.email,
        resourcePath: `/properties/${propertyId}/vault/initialize`,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
        requestId: request.id,
        metadata: { action: 'initialize' },
      });

      if (!access.allowed) {
        return reply.status(403).send({
          success: false,
          error: { code: 'ACCESS_DENIED', message: access.reason },
        });
      }

      // Parse and validate input
      const parsed = InitializeVaultSchema.safeParse({
        propertyId,
        ...request.body,
      });

      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', details: parsed.error.issues },
        });
      }

      // Initialize vault
      const service = getVaultOnboardingService(prisma);
      const state = await service.initializeVault(parsed.data, userId);

      // Emit upload evidence
      await emitEvidence(prisma, {
        eventType: 'UPLOAD',
        eventOutcome: 'SUCCESS',
        controlId: 'CC7.2',
        propertyId,
        vaultId: state.vaultId,
        actorUserId: userId,
        actorRole: access.role,
        actorEmail: request.user!.email,
        resourcePath: `/properties/${propertyId}/vault`,
        requestId: request.id,
        metadata: { action: 'vault_initialized', propertyType: request.body.propertyType },
      });

      return reply.status(201).send({ success: true, data: state });
    }
  );

  // ===========================================================================
  // VAULT STATUS
  // ===========================================================================

  /**
   * GET /properties/:propertyId/vault/status - Get vault onboarding status
   */
  app.get<{ Params: { propertyId: string } }>(
    '/properties/:propertyId/vault/status',
    {
      schema: {
        description: 'Get vault onboarding status',
        tags: ['Vault Onboarding'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            propertyId: { type: 'string', format: 'uuid' },
          },
          required: ['propertyId'],
        },
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { propertyId } = request.params;
      const userId = request.user!.id;

      // Check ACL
      const access = await checkPropertyAccess(prisma, userId, propertyId, 'read');

      // Emit evidence
      await emitEvidence(prisma, {
        eventType: 'ACL_CHECK',
        eventOutcome: access.allowed ? 'SUCCESS' : 'DENIED',
        controlId: 'CC6.1',
        propertyId,
        actorUserId: userId,
        actorRole: access.role,
        actorEmail: request.user!.email,
        resourcePath: `/properties/${propertyId}/vault/status`,
        requestId: request.id,
      });

      if (!access.allowed) {
        return reply.status(403).send({
          success: false,
          error: { code: 'ACCESS_DENIED', message: access.reason },
        });
      }

      const service = getVaultOnboardingService(prisma);
      const state = await service.getVaultStatus(propertyId, userId);

      if (!state) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Vault not initialized' },
        });
      }

      return reply.send({ success: true, data: state });
    }
  );

  // ===========================================================================
  // DOCUMENT UPLOAD
  // ===========================================================================

  /**
   * POST /properties/:propertyId/vault/documents - Upload document to vault
   */
  app.post<{
    Params: { propertyId: string };
    Body: z.infer<typeof UploadVaultDocumentSchema>;
  }>(
    '/properties/:propertyId/vault/documents',
    {
      schema: {
        description: 'Upload document to vault',
        tags: ['Vault Onboarding'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { propertyId } = request.params;
      const userId = request.user!.id;

      // Check ACL
      const access = await checkPropertyAccess(prisma, userId, propertyId, 'write');

      await emitEvidence(prisma, {
        eventType: 'ACL_CHECK',
        eventOutcome: access.allowed ? 'SUCCESS' : 'DENIED',
        controlId: 'CC6.1',
        propertyId,
        actorUserId: userId,
        actorRole: access.role,
        actorEmail: request.user!.email,
        resourcePath: `/properties/${propertyId}/vault/documents`,
        requestId: request.id,
      });

      if (!access.allowed) {
        return reply.status(403).send({
          success: false,
          error: { code: 'ACCESS_DENIED', message: access.reason },
        });
      }

      // Validate input
      const parsed = UploadVaultDocumentSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', details: parsed.error.issues },
        });
      }

      // Upload document
      const service = getVaultOnboardingService(prisma);
      await service.uploadDocument(parsed.data, userId);

      // Emit upload evidence
      await emitEvidence(prisma, {
        eventType: 'UPLOAD',
        eventOutcome: 'SUCCESS',
        controlId: 'CC6.6',
        propertyId,
        vaultId: parsed.data.vaultId,
        documentId: parsed.data.documentId,
        actorUserId: userId,
        actorRole: access.role,
        actorEmail: request.user!.email,
        resourcePath: `/properties/${propertyId}/vault/documents`,
        requestId: request.id,
        metadata: { folder: parsed.data.folder, category: parsed.data.category },
      });

      return reply.status(201).send({ success: true });
    }
  );

  // ===========================================================================
  // MISSING DOCUMENTS
  // ===========================================================================

  /**
   * GET /properties/:propertyId/vault/missing - Get missing required documents
   */
  app.get<{ Params: { propertyId: string } }>(
    '/properties/:propertyId/vault/missing',
    {
      schema: {
        description: 'Get missing required documents',
        tags: ['Vault Onboarding'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { propertyId } = request.params;
      const userId = request.user!.id;

      const access = await checkPropertyAccess(prisma, userId, propertyId, 'read');
      if (!access.allowed) {
        return reply.status(403).send({
          success: false,
          error: { code: 'ACCESS_DENIED', message: access.reason },
        });
      }

      const service = getVaultOnboardingService(prisma);
      const missingDocs = await service.getMissingDocuments(propertyId);

      return reply.send({ success: true, data: { missing: missingDocs } });
    }
  );

  // ===========================================================================
  // UPSELL TRIGGERS
  // ===========================================================================

  /**
   * GET /properties/:propertyId/vault/upsells - Get active upsell triggers
   */
  app.get<{ Params: { propertyId: string } }>(
    '/properties/:propertyId/vault/upsells',
    {
      schema: {
        description: 'Get active upsell triggers (market-gated)',
        tags: ['Vault Onboarding'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { propertyId } = request.params;
      const userId = request.user!.id;

      const access = await checkPropertyAccess(prisma, userId, propertyId, 'read');
      if (!access.allowed) {
        return reply.status(403).send({
          success: false,
          error: { code: 'ACCESS_DENIED', message: access.reason },
        });
      }

      // Get property for market info
      const property = await prisma.property.findUnique({
        where: { id: propertyId },
        select: { marketId: true },
      });

      if (!property) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Property not found' },
        });
      }

      // Get active triggers
      const upsellService = getUpsellTriggerService(prisma);
      const triggers = await upsellService.getActiveTriggers(propertyId);

      // Emit view evidence
      await emitEvidence(prisma, {
        eventType: 'UPSELL_VIEW',
        eventOutcome: 'SUCCESS',
        controlId: 'CC7.2',
        propertyId,
        actorUserId: userId,
        actorRole: access.role,
        actorEmail: request.user!.email,
        resourcePath: `/properties/${propertyId}/vault/upsells`,
        requestId: request.id,
        metadata: { triggerCount: triggers.length, market: property.marketId },
      });

      return reply.send({ success: true, data: { triggers } });
    }
  );

  /**
   * POST /properties/:propertyId/vault/upsells/:triggerId/dismiss - Dismiss upsell
   */
  app.post<{ Params: { propertyId: string; triggerId: string } }>(
    '/properties/:propertyId/vault/upsells/:triggerId/dismiss',
    {
      schema: {
        description: 'Dismiss an upsell trigger',
        tags: ['Vault Onboarding'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { propertyId, triggerId } = request.params;
      const userId = request.user!.id;

      const access = await checkPropertyAccess(prisma, userId, propertyId, 'write');
      if (!access.allowed) {
        return reply.status(403).send({
          success: false,
          error: { code: 'ACCESS_DENIED', message: access.reason },
        });
      }

      const upsellService = getUpsellTriggerService(prisma);
      const trigger = await upsellService.dismissTrigger(triggerId, userId);

      // Emit dismiss evidence
      await emitEvidence(prisma, {
        eventType: 'UPSELL_DISMISS',
        eventOutcome: 'SUCCESS',
        controlId: 'CC7.2',
        propertyId,
        actorUserId: userId,
        actorRole: access.role,
        actorEmail: request.user!.email,
        resourcePath: `/properties/${propertyId}/vault/upsells/${triggerId}/dismiss`,
        requestId: request.id,
        metadata: { triggerId, triggerType: trigger.triggerType },
      });

      return reply.send({ success: true, data: { trigger } });
    }
  );

  /**
   * POST /properties/:propertyId/vault/upsells/:triggerId/convert - Track conversion
   */
  app.post<{
    Params: { propertyId: string; triggerId: string };
    Body: { partnerId: string; attributionId?: string };
  }>(
    '/properties/:propertyId/vault/upsells/:triggerId/convert',
    {
      schema: {
        description: 'Track upsell conversion',
        tags: ['Vault Onboarding'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            partnerId: { type: 'string' },
            attributionId: { type: 'string', format: 'uuid' },
          },
          required: ['partnerId'],
        },
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { propertyId, triggerId } = request.params;
      const { partnerId, attributionId } = request.body;
      const userId = request.user!.id;

      const access = await checkPropertyAccess(prisma, userId, propertyId, 'write');
      if (!access.allowed) {
        return reply.status(403).send({
          success: false,
          error: { code: 'ACCESS_DENIED', message: access.reason },
        });
      }

      const upsellService = getUpsellTriggerService(prisma);
      const trigger = await upsellService.convertTrigger(
        triggerId,
        userId,
        partnerId,
        attributionId
      );

      // Emit conversion evidence
      await emitEvidence(prisma, {
        eventType: 'UPSELL_CONVERT',
        eventOutcome: 'SUCCESS',
        controlId: 'CC7.2',
        propertyId,
        actorUserId: userId,
        actorRole: access.role,
        actorEmail: request.user!.email,
        resourcePath: `/properties/${propertyId}/vault/upsells/${triggerId}/convert`,
        requestId: request.id,
        metadata: {
          triggerId,
          triggerType: trigger.triggerType,
          partnerId,
          attributionId,
        },
      });

      return reply.send({ success: true, data: { trigger } });
    }
  );

  // ===========================================================================
  // EVIDENCE QUERY
  // ===========================================================================

  /**
   * GET /properties/:propertyId/vault/evidence - Query evidence logs
   */
  app.get<{
    Params: { propertyId: string };
    Querystring: { limit?: string; offset?: string; eventType?: string };
  }>(
    '/properties/:propertyId/vault/evidence',
    {
      schema: {
        description: 'Query vault evidence logs (admin only)',
        tags: ['Vault Onboarding'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: [
        async (request, reply) => app.authenticate(request, reply),
        checkFeatureFlag,
      ],
    },
    async (request, reply) => {
      const { propertyId } = request.params;
      const { limit = '50', offset = '0', eventType } = request.query;
      const userId = request.user!.id;

      // Admin only
      const access = await checkPropertyAccess(prisma, userId, propertyId, 'admin');
      if (!access.allowed) {
        // Fall back to owner/manager read for their own property
        const readAccess = await checkPropertyAccess(prisma, userId, propertyId, 'read');
        if (!readAccess.allowed) {
          return reply.status(403).send({
            success: false,
            error: { code: 'ACCESS_DENIED', message: 'Evidence logs require admin or owner access' },
          });
        }
      }

      const persistence = getVaultEvidencePersistence(prisma);
      const evidence = await persistence.query({
        propertyId,
        eventType: eventType as VaultEvidenceRecord['eventType'],
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      });

      return reply.send({ success: true, data: { evidence } });
    }
  );
}
