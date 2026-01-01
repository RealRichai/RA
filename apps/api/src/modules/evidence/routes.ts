/**
 * Evidence Admin Routes
 *
 * API routes for querying and managing SOC2 evidence records.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

import { SOC2_CONTROLS, getControlDetails, getEventTypesForControl } from './control-mappings';
import { getEvidenceService } from './service';
import { EvidenceQueryParamsSchema, SOC2CategorySchema } from './types';

export async function evidenceRoutes(fastify: FastifyInstance) {
  const evidenceService = getEvidenceService();

  // All evidence routes require admin authentication
  const adminAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    fastify.authorize(request, reply, { roles: ['admin', 'super_admin'] });
  };

  // ==========================================================================
  // Query Evidence Records
  // ==========================================================================

  fastify.get(
    '/admin/evidence',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'Query evidence records with filters',
        tags: ['Evidence'],
        querystring: EvidenceQueryParamsSchema,
        response: {
          200: z.object({
            records: z.array(z.unknown()),
            total: z.number(),
            page: z.number(),
            limit: z.number(),
          }),
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: z.infer<typeof EvidenceQueryParamsSchema> }>) => {
      const params = EvidenceQueryParamsSchema.parse(request.query);
      return evidenceService.query(params);
    }
  );

  // ==========================================================================
  // Get Single Evidence Record
  // ==========================================================================

  fastify.get(
    '/admin/evidence/:id',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'Get a single evidence record by ID',
        tags: ['Evidence'],
        params: z.object({
          id: z.string().uuid(),
        }),
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply
    ) => {
      const { id } = request.params;
      const result = await evidenceService.query({ page: 1, limit: 1 });
      const record = result.records.find((r) => r.id === id);

      if (!record) {
        return reply.status(404).send({ error: 'Evidence record not found' });
      }

      return record;
    }
  );

  // ==========================================================================
  // Verify Record Integrity
  // ==========================================================================

  fastify.get(
    '/admin/evidence/:id/verify',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'Verify integrity of an evidence record',
        tags: ['Evidence'],
        params: z.object({
          id: z.string().uuid(),
        }),
        response: {
          200: z.object({
            valid: z.boolean(),
            recordId: z.string(),
            expectedHash: z.string(),
            actualHash: z.string(),
            errors: z.array(z.string()),
          }),
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const { id } = request.params;
      return evidenceService.verifyRecord(id);
    }
  );

  // ==========================================================================
  // Generate Audit Report
  // ==========================================================================

  fastify.get(
    '/admin/evidence/audit-report',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'Generate SOC2 audit report for a time period',
        tags: ['Evidence'],
        querystring: z.object({
          startDate: z.coerce.date(),
          endDate: z.coerce.date(),
          organizationId: z.string().uuid().optional(),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { startDate: Date; endDate: Date; organizationId?: string };
      }>
    ) => {
      const { startDate, endDate, organizationId } = request.query;
      return evidenceService.generateAuditReport(startDate, endDate, organizationId);
    }
  );

  // ==========================================================================
  // Verify Chain Integrity
  // ==========================================================================

  fastify.get(
    '/admin/evidence/chain-verify',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'Verify chain integrity for a time period',
        tags: ['Evidence'],
        querystring: z.object({
          startDate: z.coerce.date(),
          endDate: z.coerce.date(),
          organizationId: z.string().uuid().optional(),
        }),
        response: {
          200: z.object({
            valid: z.boolean(),
            recordsChecked: z.number(),
            brokenAt: z.string().optional(),
            errors: z.array(z.string()),
          }),
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { startDate: Date; endDate: Date; organizationId?: string };
      }>
    ) => {
      const { startDate, endDate, organizationId } = request.query;
      return evidenceService.verifyChain(startDate, endDate, organizationId);
    }
  );

  // ==========================================================================
  // List SOC2 Controls
  // ==========================================================================

  fastify.get(
    '/admin/evidence/controls',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'List SOC2 controls with evidence counts',
        tags: ['Evidence'],
        querystring: z.object({
          organizationId: z.string().uuid().optional(),
        }),
      },
    },
    async (request: FastifyRequest<{ Querystring: { organizationId?: string } }>) => {
      const { organizationId } = request.query;
      const stats = await evidenceService.getControlStats(organizationId);

      // Merge with control definitions
      return Object.entries(SOC2_CONTROLS).map(([controlId, control]) => {
        const stat = stats.find((s) => s.controlId === controlId);
        return {
          ...control,
          evidenceCount: stat?.count || 0,
          lastOccurredAt: stat?.lastOccurredAt || null,
          eventTypes: getEventTypesForControl(controlId),
        };
      });
    }
  );

  // ==========================================================================
  // Get Control Details
  // ==========================================================================

  fastify.get(
    '/admin/evidence/controls/:controlId',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'Get details for a specific SOC2 control',
        tags: ['Evidence'],
        params: z.object({
          controlId: z.string(),
        }),
      },
    },
    async (request: FastifyRequest<{ Params: { controlId: string } }>, reply) => {
      const { controlId } = request.params;
      const control = getControlDetails(controlId);

      if (!control) {
        return reply.status(404).send({ error: 'Control not found' });
      }

      const eventTypes = getEventTypesForControl(controlId);
      return { ...control, eventTypes };
    }
  );

  // ==========================================================================
  // Query by Organization
  // ==========================================================================

  fastify.get(
    '/admin/evidence/organization/:organizationId',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'Query evidence for a specific organization',
        tags: ['Evidence'],
        params: z.object({
          organizationId: z.string().uuid(),
        }),
        querystring: EvidenceQueryParamsSchema.omit({ organizationId: true }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { organizationId: string };
        Querystring: Omit<z.infer<typeof EvidenceQueryParamsSchema>, 'organizationId'>;
      }>
    ) => {
      const { organizationId } = request.params;
      const params = EvidenceQueryParamsSchema.omit({ organizationId: true }).parse(request.query);
      return evidenceService.queryByOrganization(organizationId, params);
    }
  );

  // ==========================================================================
  // Query by Category
  // ==========================================================================

  fastify.get(
    '/admin/evidence/category/:category',
    {
      preHandler: [adminAuth],
      schema: {
        description: 'Query evidence for a specific SOC2 category',
        tags: ['Evidence'],
        params: z.object({
          category: SOC2CategorySchema,
        }),
        querystring: EvidenceQueryParamsSchema.omit({ category: true }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { category: z.infer<typeof SOC2CategorySchema> };
        Querystring: Omit<z.infer<typeof EvidenceQueryParamsSchema>, 'category'>;
      }>
    ) => {
      const { category } = request.params;
      const params = EvidenceQueryParamsSchema.omit({ category: true }).parse(request.query);
      return evidenceService.query({ ...params, category, page: params.page || 1, limit: params.limit || 50 });
    }
  );
}

export default evidenceRoutes;
