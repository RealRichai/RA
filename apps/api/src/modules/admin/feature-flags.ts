/**
 * Feature Flag Admin API
 *
 * Provides admin endpoints for managing feature flags.
 * Uses Redis for flag storage with database fallback for persistence.
 */

import { prisma } from '@realriches/database';
import { PLATFORM_FEATURE_FLAGS } from '@realriches/types';
import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

const FLAG_PREFIX = 'ff:';
const FLAG_LIST_KEY = 'ff:__all__';

// =============================================================================
// Schemas
// =============================================================================

const CreateFlagSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(['boolean', 'percentage', 'user_segment', 'variant']).default('boolean'),
  enabled: z.boolean().default(false),
  defaultValue: z.unknown().optional(),
  rules: z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
    conditions: z.array(z.object({
      attribute: z.string(),
      operator: z.string(),
      value: z.unknown(),
    })),
    variation: z.unknown(),
    percentage: z.number().min(0).max(100).optional(),
  })).default([]),
  targetedUsers: z.array(z.string().uuid()).default([]),
  targetedOrganizations: z.array(z.string().uuid()).default([]),
  targetedMarkets: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  category: z.string().optional(),
});

const UpdateFlagSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  defaultValue: z.unknown().optional(),
  rules: z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
    conditions: z.array(z.object({
      attribute: z.string(),
      operator: z.string(),
      value: z.unknown(),
    })),
    variation: z.unknown(),
    percentage: z.number().min(0).max(100).optional(),
  })).optional(),
  targetedUsers: z.array(z.string().uuid()).optional(),
  targetedOrganizations: z.array(z.string().uuid()).optional(),
  targetedMarkets: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
});

const EvaluateFlagSchema = z.object({
  userId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  marketId: z.string().optional(),
  userRole: z.string().optional(),
  customAttributes: z.record(z.unknown()).optional(),
});

const ListFlagsQuerySchema = z.object({
  enabled: z.enum(['true', 'false']).optional(),
  category: z.string().optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
});

// =============================================================================
// Types
// =============================================================================

interface FeatureFlag {
  key: string;
  name: string;
  description?: string;
  type: 'boolean' | 'percentage' | 'user_segment' | 'variant';
  enabled: boolean;
  defaultValue?: unknown;
  rules: Array<{
    id: string;
    name?: string;
    conditions: Array<{
      attribute: string;
      operator: string;
      value: unknown;
    }>;
    variation: unknown;
    percentage?: number;
  }>;
  targetedUsers: string[];
  targetedOrganizations: string[];
  targetedMarkets: string[];
  tags: string[];
  category?: string;
  createdAt: string;
  updatedAt: string;
  evaluationCount: number;
  lastEvaluatedAt?: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

function getRedis(app: FastifyInstance): Redis | null {
  return (app as unknown as { redis?: Redis }).redis || null;
}

async function getFlag(redis: Redis | null, key: string): Promise<FeatureFlag | null> {
  if (!redis) return null;
  const data = await redis.get(`${FLAG_PREFIX}${key}`);
  return data ? JSON.parse(data) : null;
}

async function setFlag(redis: Redis | null, flag: FeatureFlag): Promise<void> {
  if (!redis) return;
  await redis.set(`${FLAG_PREFIX}${flag.key}`, JSON.stringify(flag));
  await redis.sadd(FLAG_LIST_KEY, flag.key);
}

async function deleteFlag(redis: Redis | null, key: string): Promise<void> {
  if (!redis) return;
  await redis.del(`${FLAG_PREFIX}${key}`);
  await redis.srem(FLAG_LIST_KEY, key);
}

async function getAllFlags(redis: Redis | null): Promise<FeatureFlag[]> {
  if (!redis) return [];
  const keys = await redis.smembers(FLAG_LIST_KEY);
  if (keys.length === 0) return [];

  const pipeline = redis.pipeline();
  for (const key of keys) {
    pipeline.get(`${FLAG_PREFIX}${key}`);
  }
  const results = await pipeline.exec();

  const flags: FeatureFlag[] = [];
  if (results) {
    for (const [err, data] of results) {
      if (!err && data) {
        flags.push(JSON.parse(data as string));
      }
    }
  }
  return flags;
}

function evaluateFlag(flag: FeatureFlag, context: z.infer<typeof EvaluateFlagSchema>): {
  value: unknown;
  reason: string;
  ruleIndex?: number;
} {
  // If disabled, return default
  if (!flag.enabled) {
    return { value: flag.defaultValue ?? false, reason: 'off' };
  }

  // Check targeted users
  if (context.userId && flag.targetedUsers.includes(context.userId)) {
    return { value: flag.defaultValue ?? true, reason: 'target_match' };
  }

  // Check targeted organizations
  if (context.organizationId && flag.targetedOrganizations.includes(context.organizationId)) {
    return { value: flag.defaultValue ?? true, reason: 'target_match' };
  }

  // Check targeted markets
  if (context.marketId && flag.targetedMarkets.includes(context.marketId)) {
    return { value: flag.defaultValue ?? true, reason: 'target_match' };
  }

  // Evaluate rules in order
  for (let i = 0; i < flag.rules.length; i++) {
    const rule = flag.rules[i];
    const matches = rule.conditions.every((condition) => {
      const attrValue = context.customAttributes?.[condition.attribute];
      return evaluateCondition(attrValue, condition.operator, condition.value);
    });

    if (matches) {
      // Handle percentage rollout
      if (rule.percentage !== undefined && rule.percentage < 100) {
        const hash = simpleHash(context.userId || 'anonymous');
        if ((hash % 100) >= rule.percentage) {
          continue; // Skip this rule for this user
        }
      }
      return { value: rule.variation, reason: 'rule_match', ruleIndex: i };
    }
  }

  // Fallthrough - return default value
  return { value: flag.defaultValue ?? flag.enabled, reason: 'fallthrough' };
}

function evaluateCondition(attrValue: unknown, operator: string, condValue: unknown): boolean {
  switch (operator) {
    case 'equals':
      return attrValue === condValue;
    case 'not_equals':
      return attrValue !== condValue;
    case 'in':
      return Array.isArray(condValue) && condValue.includes(attrValue);
    case 'not_in':
      return Array.isArray(condValue) && !condValue.includes(attrValue);
    case 'contains':
      return typeof attrValue === 'string' && typeof condValue === 'string' && attrValue.includes(condValue);
    case 'greater_than':
      return typeof attrValue === 'number' && typeof condValue === 'number' && attrValue > condValue;
    case 'less_than':
      return typeof attrValue === 'number' && typeof condValue === 'number' && attrValue < condValue;
    default:
      return false;
  }
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// =============================================================================
// Routes
// =============================================================================

export async function featureFlagAdminRoutes(app: FastifyInstance): Promise<void> {
  // ===========================================================================
  // GET /admin/feature-flags - List all feature flags
  // ===========================================================================
  app.get(
    '/',
    {
      schema: {
        description: 'List all feature flags',
        tags: ['Admin', 'Feature Flags'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            enabled: { type: 'string', enum: ['true', 'false'] },
            category: { type: 'string' },
            tag: { type: 'string' },
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
        const params = ListFlagsQuerySchema.parse(request.query);
        const redis = getRedis(app);
        let flags = await getAllFlags(redis);

        // Apply filters
        if (params.enabled !== undefined) {
          const isEnabled = params.enabled === 'true';
          flags = flags.filter((f) => f.enabled === isEnabled);
        }
        if (params.category) {
          flags = flags.filter((f) => f.category === params.category);
        }
        if (params.tag) {
          flags = flags.filter((f) => f.tags.includes(params.tag));
        }
        if (params.search) {
          const search = params.search.toLowerCase();
          flags = flags.filter(
            (f) =>
              f.key.toLowerCase().includes(search) ||
              f.name.toLowerCase().includes(search) ||
              f.description?.toLowerCase().includes(search)
          );
        }

        // Sort by key
        flags.sort((a, b) => a.key.localeCompare(b.key));

        return reply.send({
          success: true,
          data: flags,
          meta: {
            total: flags.length,
            enabled: flags.filter((f) => f.enabled).length,
            disabled: flags.filter((f) => !f.enabled).length,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to list feature flags');
        return reply.status(500).send({
          success: false,
          error: { code: 'LIST_ERROR', message: 'Failed to list feature flags' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/feature-flags/predefined - List predefined platform flags
  // ===========================================================================
  app.get(
    '/predefined',
    {
      schema: {
        description: 'List predefined platform feature flags',
        tags: ['Admin', 'Feature Flags'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const flags = Object.entries(PLATFORM_FEATURE_FLAGS).map(([name, key]) => ({
          name,
          key,
          category: getCategoryFromFlagName(name),
        }));

        // Group by category
        const byCategory = flags.reduce((acc, flag) => {
          if (!acc[flag.category]) {
            acc[flag.category] = [];
          }
          acc[flag.category].push(flag);
          return acc;
        }, {} as Record<string, typeof flags>);

        return reply.send({
          success: true,
          data: {
            flags,
            byCategory,
            total: flags.length,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to list predefined flags');
        return reply.status(500).send({
          success: false,
          error: { code: 'LIST_ERROR', message: 'Failed to list predefined flags' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/feature-flags - Create feature flag
  // ===========================================================================
  app.post(
    '/',
    {
      schema: {
        description: 'Create a new feature flag',
        tags: ['Admin', 'Feature Flags'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['key', 'name'],
          properties: {
            key: { type: 'string', pattern: '^[a-z][a-z0-9_]*$' },
            name: { type: 'string' },
            description: { type: 'string' },
            type: { type: 'string', enum: ['boolean', 'percentage', 'user_segment', 'variant'] },
            enabled: { type: 'boolean' },
            defaultValue: {},
            rules: { type: 'array' },
            targetedUsers: { type: 'array', items: { type: 'string' } },
            targetedOrganizations: { type: 'array', items: { type: 'string' } },
            targetedMarkets: { type: 'array', items: { type: 'string' } },
            tags: { type: 'array', items: { type: 'string' } },
            category: { type: 'string' },
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
        const params = CreateFlagSchema.parse(request.body);
        const redis = getRedis(app);

        // Check if flag already exists
        const existing = await getFlag(redis, params.key);
        if (existing) {
          return reply.status(409).send({
            success: false,
            error: { code: 'ALREADY_EXISTS', message: 'Feature flag already exists' },
          });
        }

        const now = new Date().toISOString();
        const flag: FeatureFlag = {
          key: params.key,
          name: params.name,
          type: params.type ?? 'boolean',
          enabled: params.enabled ?? false,
          rules: (params.rules ?? []).map(rule => ({
            id: rule.id,
            name: rule.name,
            conditions: rule.conditions.map(c => ({
              attribute: c.attribute,
              operator: c.operator,
              value: c.value,
            })),
            variation: rule.variation,
            percentage: rule.percentage,
          })),
          targetedUsers: params.targetedUsers ?? [],
          targetedOrganizations: params.targetedOrganizations ?? [],
          targetedMarkets: params.targetedMarkets ?? [],
          tags: params.tags ?? [],
          description: params.description,
          defaultValue: params.defaultValue,
          category: params.category,
          createdAt: now,
          updatedAt: now,
          evaluationCount: 0,
        };

        await setFlag(redis, flag);

        logger.info({
          msg: 'feature_flag_created',
          adminUserId: request.user?.id,
          flagKey: params.key,
        });

        return reply.status(201).send({
          success: true,
          data: flag,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to create feature flag');
        return reply.status(500).send({
          success: false,
          error: { code: 'CREATE_ERROR', message: 'Failed to create feature flag' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/feature-flags/:key - Get feature flag details
  // ===========================================================================
  app.get(
    '/:key',
    {
      schema: {
        description: 'Get feature flag details',
        tags: ['Admin', 'Feature Flags'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['key'],
          properties: { key: { type: 'string' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { key: string } }>, reply: FastifyReply) => {
      try {
        const redis = getRedis(app);
        const flag = await getFlag(redis, request.params.key);

        if (!flag) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Feature flag not found' },
          });
        }

        return reply.send({
          success: true,
          data: flag,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get feature flag');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_ERROR', message: 'Failed to get feature flag' },
        });
      }
    }
  );

  // ===========================================================================
  // PATCH /admin/feature-flags/:key - Update feature flag
  // ===========================================================================
  app.patch(
    '/:key',
    {
      schema: {
        description: 'Update a feature flag',
        tags: ['Admin', 'Feature Flags'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['key'],
          properties: { key: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            enabled: { type: 'boolean' },
            defaultValue: {},
            rules: { type: 'array' },
            targetedUsers: { type: 'array' },
            targetedOrganizations: { type: 'array' },
            targetedMarkets: { type: 'array' },
            tags: { type: 'array' },
            category: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { key: string }; Body: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const params = UpdateFlagSchema.parse(request.body);
        const redis = getRedis(app);

        const flag = await getFlag(redis, request.params.key);
        if (!flag) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Feature flag not found' },
          });
        }

        const updated: FeatureFlag = {
          key: flag.key,
          name: params.name ?? flag.name,
          type: flag.type,
          enabled: params.enabled ?? flag.enabled,
          rules: params.rules
            ? params.rules.map(rule => ({
                id: rule.id,
                name: rule.name,
                conditions: rule.conditions.map(c => ({
                  attribute: c.attribute,
                  operator: c.operator,
                  value: c.value,
                })),
                variation: rule.variation,
                percentage: rule.percentage,
              }))
            : flag.rules,
          targetedUsers: params.targetedUsers ?? flag.targetedUsers,
          targetedOrganizations: params.targetedOrganizations ?? flag.targetedOrganizations,
          targetedMarkets: params.targetedMarkets ?? flag.targetedMarkets,
          tags: params.tags ?? flag.tags,
          description: params.description ?? flag.description,
          defaultValue: params.defaultValue ?? flag.defaultValue,
          category: params.category ?? flag.category,
          createdAt: flag.createdAt,
          updatedAt: new Date().toISOString(),
          evaluationCount: flag.evaluationCount,
          lastEvaluatedAt: flag.lastEvaluatedAt,
        };

        await setFlag(redis, updated);

        logger.info({
          msg: 'feature_flag_updated',
          adminUserId: request.user?.id,
          flagKey: request.params.key,
          changes: Object.keys(params),
        });

        return reply.send({
          success: true,
          data: updated,
        });
      } catch (error) {
        logger.error({ error }, 'Failed to update feature flag');
        return reply.status(500).send({
          success: false,
          error: { code: 'UPDATE_ERROR', message: 'Failed to update feature flag' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/feature-flags/:key/toggle - Quick toggle enable/disable
  // ===========================================================================
  app.post(
    '/:key/toggle',
    {
      schema: {
        description: 'Toggle feature flag enabled/disabled',
        tags: ['Admin', 'Feature Flags'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['key'],
          properties: { key: { type: 'string' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { key: string } }>, reply: FastifyReply) => {
      try {
        const redis = getRedis(app);
        const flag = await getFlag(redis, request.params.key);

        if (!flag) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Feature flag not found' },
          });
        }

        flag.enabled = !flag.enabled;
        flag.updatedAt = new Date().toISOString();

        await setFlag(redis, flag);

        logger.info({
          msg: 'feature_flag_toggled',
          adminUserId: request.user?.id,
          flagKey: request.params.key,
          enabled: flag.enabled,
        });

        return reply.send({
          success: true,
          data: { key: flag.key, enabled: flag.enabled },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to toggle feature flag');
        return reply.status(500).send({
          success: false,
          error: { code: 'TOGGLE_ERROR', message: 'Failed to toggle feature flag' },
        });
      }
    }
  );

  // ===========================================================================
  // DELETE /admin/feature-flags/:key - Delete feature flag
  // ===========================================================================
  app.delete(
    '/:key',
    {
      schema: {
        description: 'Delete a feature flag',
        tags: ['Admin', 'Feature Flags'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['key'],
          properties: { key: { type: 'string' } },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { key: string } }>, reply: FastifyReply) => {
      try {
        const redis = getRedis(app);
        const flag = await getFlag(redis, request.params.key);

        if (!flag) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Feature flag not found' },
          });
        }

        await deleteFlag(redis, request.params.key);

        logger.info({
          msg: 'feature_flag_deleted',
          adminUserId: request.user?.id,
          flagKey: request.params.key,
        });

        return reply.send({
          success: true,
          message: 'Feature flag deleted',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to delete feature flag');
        return reply.status(500).send({
          success: false,
          error: { code: 'DELETE_ERROR', message: 'Failed to delete feature flag' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/feature-flags/:key/evaluate - Evaluate flag for context
  // ===========================================================================
  app.post(
    '/:key/evaluate',
    {
      schema: {
        description: 'Evaluate a feature flag for a given context',
        tags: ['Admin', 'Feature Flags'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['key'],
          properties: { key: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            userId: { type: 'string', format: 'uuid' },
            organizationId: { type: 'string', format: 'uuid' },
            marketId: { type: 'string' },
            userRole: { type: 'string' },
            customAttributes: { type: 'object' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (
      request: FastifyRequest<{ Params: { key: string }; Body: Record<string, unknown> }>,
      reply: FastifyReply
    ) => {
      try {
        const context = EvaluateFlagSchema.parse(request.body);
        const redis = getRedis(app);
        const flag = await getFlag(redis, request.params.key);

        if (!flag) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Feature flag not found' },
          });
        }

        const result = evaluateFlag(flag, context);

        // Update evaluation stats
        flag.evaluationCount++;
        flag.lastEvaluatedAt = new Date().toISOString();
        await setFlag(redis, flag);

        return reply.send({
          success: true,
          data: {
            flagKey: request.params.key,
            ...result,
            context,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to evaluate feature flag');
        return reply.status(500).send({
          success: false,
          error: { code: 'EVALUATE_ERROR', message: 'Failed to evaluate feature flag' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/feature-flags/stats - Get feature flag statistics
  // ===========================================================================
  app.get(
    '/stats',
    {
      schema: {
        description: 'Get feature flag statistics',
        tags: ['Admin', 'Feature Flags'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const redis = getRedis(app);
        const flags = await getAllFlags(redis);

        const byCategory: Record<string, number> = {};
        const byType: Record<string, number> = {};

        for (const flag of flags) {
          const category = flag.category || 'uncategorized';
          byCategory[category] = (byCategory[category] || 0) + 1;
          byType[flag.type] = (byType[flag.type] || 0) + 1;
        }

        // Top evaluated flags
        const topEvaluated = [...flags]
          .sort((a, b) => b.evaluationCount - a.evaluationCount)
          .slice(0, 10)
          .map((f) => ({
            key: f.key,
            name: f.name,
            evaluationCount: f.evaluationCount,
            lastEvaluatedAt: f.lastEvaluatedAt,
          }));

        return reply.send({
          success: true,
          data: {
            total: flags.length,
            enabled: flags.filter((f) => f.enabled).length,
            disabled: flags.filter((f) => !f.enabled).length,
            byCategory,
            byType,
            topEvaluated,
            predefinedCount: Object.keys(PLATFORM_FEATURE_FLAGS).length,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get feature flag stats');
        return reply.status(500).send({
          success: false,
          error: { code: 'STATS_ERROR', message: 'Failed to get feature flag statistics' },
        });
      }
    }
  );
}

// =============================================================================
// Helper Functions
// =============================================================================

function getCategoryFromFlagName(name: string): string {
  if (name.startsWith('AI_')) return 'ai';
  if (name.includes('PAYMENT') || name.includes('ACH') || name.includes('CARD') || name.includes('CREDIT')) return 'payments';
  if (name.includes('COMPLIANCE') || name.includes('FARE') || name.includes('GOOD_CAUSE')) return 'compliance';
  if (name.includes('LEASELOCK') || name.includes('RHINO') || name.includes('GUARANTOR')) return 'partners';
  if (name.includes('FLYER') || name.includes('VIDEO') || name.includes('STAGING') || name.includes('VR')) return 'marketing';
  if (name.includes('COMMERCIAL') || name.includes('UNDERWRITING') || name.includes('STACKING')) return 'commercial';
  if (name.includes('UTILITY') || name.includes('MOVING') || name.includes('VENDOR')) return 'commerce';
  if (name.includes('GOD_VIEW') || name.includes('ANALYTICS')) return 'admin';
  if (name.includes('REBNY')) return 'rebny';
  if (name.includes('VAULT') || name.includes('SIGNATURE')) return 'documents';
  return 'core';
}
