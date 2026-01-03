/**
 * Copilot Routes
 *
 * API endpoints for the Listing Copilot workflow.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

import {
  ExecuteCopilotRequestSchema,
  UploadTemplateRequestSchema,
} from './schemas';

// =============================================================================
// Routes
// =============================================================================

export async function copilotRoutes(app: FastifyInstance): Promise<void> {
  // ===========================================================================
  // POST /copilot/execute - Execute copilot workflow
  // ===========================================================================
  app.post(
    '/copilot/execute',
    {
      schema: {
        description: 'Execute the Listing Copilot workflow to generate optimized listing copy and collateral',
        tags: ['Copilot'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            listingDraft: { type: 'object' },
            propertyFacts: { type: 'object' },
            marketId: { type: 'string' },
            templateOverrides: { type: 'object' },
            options: {
              type: 'object',
              properties: {
                dryRun: { type: 'boolean', default: true },
                skipCompliance: { type: 'boolean', default: false },
                channels: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          required: ['listingDraft', 'propertyFacts', 'marketId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  runId: { type: 'string' },
                  status: { type: 'string' },
                  generatedCopy: { type: 'object' },
                  artifacts: { type: 'object' },
                  complianceResult: { type: 'object' },
                  channelResults: { type: 'array' },
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'object' },
            },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = ExecuteCopilotRequestSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parseResult.error.errors,
          },
        });
      }

      const input = parseResult.data;
      const tenantId = request.user?.organizationId ?? request.user?.id ?? 'unknown';

      try {
        // TODO: Wire up actual ListingCopilotWorkflow
        // For now, return a stub response indicating the workflow would run
        const result = {
          runId: `run_${Date.now()}`,
          status: 'completed' as const,
          generatedCopy: {
            title: `Optimized: ${input.listingDraft.title ?? 'Untitled Listing'}`,
            description: 'This is a placeholder for the generated description.',
            highlights: ['Feature 1', 'Feature 2', 'Feature 3'],
            seoKeywords: ['rental', input.listingDraft.propertyType, input.marketId],
            promptHash: 'placeholder_hash',
            tokensUsed: 0,
          },
          artifacts: {},
          complianceResult: {
            passed: true,
            violations: [],
            marketPack: 'DEFAULT',
            gatedAt: new Date().toISOString(),
          },
          channelResults: [],
          dryRun: input.options?.dryRun ?? true,
        };

        app.log.info({
          event: 'copilot_executed',
          runId: result.runId,
          tenantId,
          marketId: input.marketId,
          dryRun: result.dryRun,
        });

        return reply.send({ success: true, data: result });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        const code = (error as { code?: string })?.code ?? 'WORKFLOW_ERROR';

        app.log.error({
          event: 'copilot_error',
          tenantId,
          error: message,
        });

        const status = code === 'COMPLIANCE_BLOCKED' ? 422 :
                       code === 'BUDGET_EXCEEDED' ? 429 :
                       code === 'KILL_SWITCH_ACTIVE' ? 503 : 500;

        return reply.status(status).send({
          success: false,
          error: { code, message },
        });
      }
    }
  );

  // ===========================================================================
  // GET /copilot/runs/:runId - Get copilot run status
  // ===========================================================================
  app.get<{ Params: { runId: string } }>(
    '/copilot/runs/:runId',
    {
      schema: {
        description: 'Get status and result of a copilot run',
        tags: ['Copilot'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { runId: { type: 'string' } },
          required: ['runId'],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' },
            },
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'object' },
            },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request, reply) => {
      const { runId } = request.params;

      // TODO: Look up run from database
      // For now, return a stub
      return reply.send({
        success: true,
        data: {
          runId,
          status: 'completed',
          createdAt: new Date().toISOString(),
        },
      });
    }
  );

  // ===========================================================================
  // GET /copilot/artifacts/:artifactId - Download generated artifact
  // ===========================================================================
  app.get<{ Params: { artifactId: string } }>(
    '/copilot/artifacts/:artifactId',
    {
      schema: {
        description: 'Download a generated artifact (PDF/PPTX)',
        tags: ['Copilot'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { artifactId: { type: 'string', format: 'uuid' } },
          required: ['artifactId'],
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request, reply) => {
      const { artifactId } = request.params;

      // TODO: Look up artifact and generate presigned URL
      // For now, return a stub
      return reply.send({
        success: true,
        data: {
          artifactId,
          downloadUrl: `https://vault.example.com/artifacts/${artifactId}?token=stub`,
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        },
      });
    }
  );

  // ===========================================================================
  // POST /copilot/templates - Upload custom template
  // ===========================================================================
  app.post(
    '/copilot/templates',
    {
      schema: {
        description: 'Upload a custom template for PDF/PPTX generation',
        tags: ['Copilot'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            type: { type: 'string', enum: ['flyer', 'brochure', 'broker_deck'] },
            content: { type: 'string' },
          },
          required: ['name', 'type', 'content'],
        },
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  templateId: { type: 'string' },
                  validated: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = UploadTemplateRequestSchema.safeParse(request.body);

      if (!parseResult.success) {
        return reply.status(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body',
            details: parseResult.error.errors,
          },
        });
      }

      const { name, type, content } = parseResult.data;
      const tenantId = request.user?.organizationId ?? request.user?.id ?? 'unknown';

      // TODO: Sanitize template and store in vault
      // For now, return a stub
      const templateId = `tmpl_${Date.now()}`;

      app.log.info({
        event: 'template_uploaded',
        templateId,
        tenantId,
        type,
        name,
      });

      return reply.status(201).send({
        success: true,
        data: {
          templateId,
          validated: true,
          warnings: [],
        },
      });
    }
  );

  // ===========================================================================
  // GET /copilot/templates - List custom templates
  // ===========================================================================
  app.get(
    '/copilot/templates',
    {
      schema: {
        description: 'List custom templates for the current tenant',
        tags: ['Copilot'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    type: { type: 'string' },
                    validated: { type: 'boolean' },
                    createdAt: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (_request, reply) => {
      // TODO: Look up templates from database
      return reply.send({
        success: true,
        data: [],
      });
    }
  );

  // ===========================================================================
  // DELETE /copilot/templates/:templateId - Delete custom template
  // ===========================================================================
  app.delete<{ Params: { templateId: string } }>(
    '/copilot/templates/:templateId',
    {
      schema: {
        description: 'Delete a custom template',
        tags: ['Copilot'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { templateId: { type: 'string', format: 'uuid' } },
          required: ['templateId'],
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request, reply) => {
      const { templateId } = request.params;

      // TODO: Delete template from database and vault
      app.log.info({
        event: 'template_deleted',
        templateId,
      });

      return reply.send({ success: true });
    }
  );
}

export default copilotRoutes;
