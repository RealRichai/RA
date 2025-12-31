/**
 * Email Template Admin API
 *
 * Provides admin endpoints for managing and previewing email templates.
 */

import {
  getTemplate,
  getTemplateIds,
  renderTemplate,
  registerAllTemplates,
  TemplateNotFoundError,
  MissingFieldsError,
} from '@realriches/email-service';
import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Initialize Templates
// =============================================================================

// Register all templates on module load
registerAllTemplates();

// =============================================================================
// Schemas
// =============================================================================

const RenderTemplateSchema = z.object({
  templateId: z.string().min(1),
  data: z.record(z.unknown()),
});

const ListTemplatesQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
});

// =============================================================================
// Routes
// =============================================================================

export async function emailTemplateAdminRoutes(app: FastifyInstance): Promise<void> {
  // ===========================================================================
  // GET /admin/email-templates - List all templates
  // ===========================================================================
  app.get(
    '/',
    {
      schema: {
        description: 'List all available email templates',
        tags: ['Admin', 'Email Templates'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            category: { type: 'string' },
            search: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Querystring: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const params = ListTemplatesQuerySchema.parse(request.query);
        const templateIds = getTemplateIds();

        // Build template list with metadata
        const templates = templateIds.map((id) => {
          const template = getTemplate(id);
          const [category, name] = id.includes(':') ? id.split(':') : ['general', id];

          return {
            id,
            category,
            name,
            requiredFields: template?.requiredFields || [],
            description: template?.description || null,
          };
        });

        // Filter by category if specified
        let filtered = templates;
        if (params.category) {
          filtered = filtered.filter((t) => t.category === params.category);
        }
        if (params.search) {
          const search = params.search.toLowerCase();
          filtered = filtered.filter(
            (t) =>
              t.id.toLowerCase().includes(search) ||
              t.name.toLowerCase().includes(search) ||
              t.category.toLowerCase().includes(search)
          );
        }

        // Group by category
        const byCategory = filtered.reduce((acc, template) => {
          if (!acc[template.category]) {
            acc[template.category] = [];
          }
          acc[template.category].push(template);
          return acc;
        }, {} as Record<string, typeof templates>);

        return reply.send({
          success: true,
          data: {
            templates: filtered,
            byCategory,
            total: filtered.length,
            categories: [...new Set(templates.map((t) => t.category))],
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to list email templates');
        return reply.status(500).send({
          success: false,
          error: { code: 'LIST_ERROR', message: 'Failed to list email templates' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/email-templates/:id - Get template details
  // ===========================================================================
  app.get(
    '/:id',
    {
      schema: {
        description: 'Get email template details',
        tags: ['Admin', 'Email Templates'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const template = getTemplate(request.params.id);

        if (!template) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Template not found' },
          });
        }

        const [category, name] = template.id.includes(':')
          ? template.id.split(':')
          : ['general', template.id];

        return reply.send({
          success: true,
          data: {
            id: template.id,
            category,
            name,
            description: template.description || null,
            requiredFields: template.requiredFields,
            subject: typeof template.subject === 'string' ? template.subject : '(dynamic)',
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get email template');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_ERROR', message: 'Failed to get email template' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/email-templates/render - Render a template preview
  // ===========================================================================
  app.post(
    '/render',
    {
      schema: {
        description: 'Render an email template with provided data',
        tags: ['Admin', 'Email Templates'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['templateId', 'data'],
          properties: {
            templateId: { type: 'string' },
            data: { type: 'object' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Body: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const params = RenderTemplateSchema.parse(request.body);

        const result = renderTemplate(params.templateId, params.data);

        logger.info({
          msg: 'email_template_rendered',
          userId: request.user?.id,
          templateId: params.templateId,
        });

        return reply.send({
          success: true,
          data: {
            templateId: params.templateId,
            subject: result.subject,
            html: result.html,
            text: result.text,
          },
        });
      } catch (error) {
        // Check error name for compatibility with mocking
        const errorName = (error as Error).name;
        if (errorName === 'TemplateNotFoundError') {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: (error as Error).message },
          });
        }
        if (errorName === 'MissingFieldsError') {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'MISSING_FIELDS',
              message: (error as Error).message,
              details: { missingFields: (error as MissingFieldsError).missingFields },
            },
          });
        }
        logger.error({ error }, 'Failed to render email template');
        return reply.status(500).send({
          success: false,
          error: { code: 'RENDER_ERROR', message: 'Failed to render email template' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/email-templates/validate - Validate template data
  // ===========================================================================
  app.post(
    '/validate',
    {
      schema: {
        description: 'Validate data against a template without rendering',
        tags: ['Admin', 'Email Templates'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['templateId', 'data'],
          properties: {
            templateId: { type: 'string' },
            data: { type: 'object' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Body: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const params = RenderTemplateSchema.parse(request.body);
        const template = getTemplate(params.templateId);

        if (!template) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Template not found' },
          });
        }

        const missingFields = template.requiredFields.filter(
          (field) => params.data[field] === undefined || params.data[field] === null
        );

        return reply.send({
          success: true,
          data: {
            templateId: params.templateId,
            valid: missingFields.length === 0,
            requiredFields: template.requiredFields,
            providedFields: Object.keys(params.data),
            missingFields,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to validate template data');
        return reply.status(500).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Failed to validate template data' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/email-templates/categories - Get template categories
  // ===========================================================================
  app.get(
    '/categories',
    {
      schema: {
        description: 'Get list of template categories with counts',
        tags: ['Admin', 'Email Templates'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const templateIds = getTemplateIds();

        // Count by category
        const categoryCounts: Record<string, number> = {};
        for (const id of templateIds) {
          const [category] = id.includes(':') ? id.split(':') : ['general'];
          categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        }

        const categories = Object.entries(categoryCounts).map(([name, count]) => ({
          name,
          count,
          description: getCategoryDescription(name),
        }));

        return reply.send({
          success: true,
          data: {
            categories,
            total: templateIds.length,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get template categories');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_ERROR', message: 'Failed to get template categories' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/email-templates/stats - Get template usage stats
  // ===========================================================================
  app.get(
    '/stats',
    {
      schema: {
        description: 'Get email template usage statistics',
        tags: ['Admin', 'Email Templates'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const templateIds = getTemplateIds();

        // Count by category
        const byCategory: Record<string, number> = {};
        for (const id of templateIds) {
          const [category] = id.includes(':') ? id.split(':') : ['general'];
          byCategory[category] = (byCategory[category] || 0) + 1;
        }

        return reply.send({
          success: true,
          data: {
            total: templateIds.length,
            byCategory,
            templates: templateIds,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get template stats');
        return reply.status(500).send({
          success: false,
          error: { code: 'STATS_ERROR', message: 'Failed to get template statistics' },
        });
      }
    }
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

function getCategoryDescription(category: string): string {
  const descriptions: Record<string, string> = {
    auth: 'Authentication and account security emails',
    lease: 'Lease-related notifications and documents',
    documents: 'Document sharing and signing notifications',
    alerts: 'System alerts and notifications',
    payments: 'Payment confirmations and reminders',
    policies: 'Insurance and policy-related emails',
    system: 'System notifications and admin emails',
    general: 'General purpose emails',
  };
  return descriptions[category] || 'Email templates';
}
