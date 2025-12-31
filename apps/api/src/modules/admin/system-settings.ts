/**
 * System Settings Admin API
 *
 * Provides admin endpoints for managing global platform configuration.
 * Settings are stored in Redis with database fallback for persistence.
 */

import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';
import { z } from 'zod';

// =============================================================================
// Constants
// =============================================================================

const SETTINGS_PREFIX = 'settings:';
const SETTINGS_LIST_KEY = 'settings:__all__';

// =============================================================================
// Default Settings
// =============================================================================

const DEFAULT_SETTINGS: Record<string, SystemSetting> = {
  'platform.maintenance_mode': {
    key: 'platform.maintenance_mode',
    value: false,
    type: 'boolean',
    category: 'platform',
    description: 'Enable maintenance mode (blocks all non-admin access)',
    updatedAt: new Date().toISOString(),
  },
  'platform.maintenance_message': {
    key: 'platform.maintenance_message',
    value: 'We are currently performing scheduled maintenance. Please try again later.',
    type: 'string',
    category: 'platform',
    description: 'Message shown during maintenance mode',
    updatedAt: new Date().toISOString(),
  },
  'platform.allowed_during_maintenance': {
    key: 'platform.allowed_during_maintenance',
    value: [],
    type: 'array',
    category: 'platform',
    description: 'User IDs allowed access during maintenance',
    updatedAt: new Date().toISOString(),
  },
  'limits.max_properties_per_user': {
    key: 'limits.max_properties_per_user',
    value: 100,
    type: 'number',
    category: 'limits',
    description: 'Maximum properties a user can create',
    updatedAt: new Date().toISOString(),
  },
  'limits.max_units_per_property': {
    key: 'limits.max_units_per_property',
    value: 500,
    type: 'number',
    category: 'limits',
    description: 'Maximum units per property',
    updatedAt: new Date().toISOString(),
  },
  'limits.max_file_upload_mb': {
    key: 'limits.max_file_upload_mb',
    value: 50,
    type: 'number',
    category: 'limits',
    description: 'Maximum file upload size in MB',
    updatedAt: new Date().toISOString(),
  },
  'notifications.email_enabled': {
    key: 'notifications.email_enabled',
    value: true,
    type: 'boolean',
    category: 'notifications',
    description: 'Enable email notifications globally',
    updatedAt: new Date().toISOString(),
  },
  'notifications.sms_enabled': {
    key: 'notifications.sms_enabled',
    value: false,
    type: 'boolean',
    category: 'notifications',
    description: 'Enable SMS notifications globally',
    updatedAt: new Date().toISOString(),
  },
  'notifications.push_enabled': {
    key: 'notifications.push_enabled',
    value: true,
    type: 'boolean',
    category: 'notifications',
    description: 'Enable push notifications globally',
    updatedAt: new Date().toISOString(),
  },
  'branding.platform_name': {
    key: 'branding.platform_name',
    value: 'RealRiches',
    type: 'string',
    category: 'branding',
    description: 'Platform display name',
    updatedAt: new Date().toISOString(),
  },
  'branding.support_email': {
    key: 'branding.support_email',
    value: 'support@realriches.com',
    type: 'string',
    category: 'branding',
    description: 'Support email address',
    updatedAt: new Date().toISOString(),
  },
  'branding.support_phone': {
    key: 'branding.support_phone',
    value: '',
    type: 'string',
    category: 'branding',
    description: 'Support phone number',
    updatedAt: new Date().toISOString(),
  },
  'security.session_timeout_hours': {
    key: 'security.session_timeout_hours',
    value: 24,
    type: 'number',
    category: 'security',
    description: 'Session timeout in hours',
    updatedAt: new Date().toISOString(),
  },
  'security.max_login_attempts': {
    key: 'security.max_login_attempts',
    value: 5,
    type: 'number',
    category: 'security',
    description: 'Maximum failed login attempts before lockout',
    updatedAt: new Date().toISOString(),
  },
  'security.lockout_duration_minutes': {
    key: 'security.lockout_duration_minutes',
    value: 30,
    type: 'number',
    category: 'security',
    description: 'Account lockout duration in minutes',
    updatedAt: new Date().toISOString(),
  },
  'security.require_2fa_for_admins': {
    key: 'security.require_2fa_for_admins',
    value: false,
    type: 'boolean',
    category: 'security',
    description: 'Require 2FA for admin accounts',
    updatedAt: new Date().toISOString(),
  },
  'ai.enabled': {
    key: 'ai.enabled',
    value: true,
    type: 'boolean',
    category: 'ai',
    description: 'Enable AI features globally',
    updatedAt: new Date().toISOString(),
  },
  'ai.max_tokens_per_request': {
    key: 'ai.max_tokens_per_request',
    value: 4096,
    type: 'number',
    category: 'ai',
    description: 'Maximum tokens per AI request',
    updatedAt: new Date().toISOString(),
  },
  'ai.daily_budget_usd': {
    key: 'ai.daily_budget_usd',
    value: 100,
    type: 'number',
    category: 'ai',
    description: 'Daily AI budget in USD',
    updatedAt: new Date().toISOString(),
  },
};

// =============================================================================
// Types
// =============================================================================

interface SystemSetting {
  key: string;
  value: unknown;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  category: string;
  description: string;
  updatedAt: string;
  updatedBy?: string;
}

// =============================================================================
// Schemas
// =============================================================================

const UpdateSettingSchema = z.object({
  value: z.unknown(),
});

const UpdateBulkSettingsSchema = z.object({
  settings: z.record(z.unknown()),
});

// =============================================================================
// Helper Functions
// =============================================================================

function getRedis(app: FastifyInstance): Redis | null {
  return (app as unknown as { redis?: Redis }).redis || null;
}

async function getSetting(redis: Redis | null, key: string): Promise<SystemSetting | null> {
  if (!redis) return DEFAULT_SETTINGS[key] || null;

  const data = await redis.get(`${SETTINGS_PREFIX}${key}`);
  if (data) return JSON.parse(data);

  // Return default if not set
  return DEFAULT_SETTINGS[key] || null;
}

async function setSetting(redis: Redis | null, setting: SystemSetting): Promise<void> {
  if (!redis) return;
  await redis.set(`${SETTINGS_PREFIX}${setting.key}`, JSON.stringify(setting));
  await redis.sadd(SETTINGS_LIST_KEY, setting.key);
}

async function getAllSettings(redis: Redis | null): Promise<SystemSetting[]> {
  if (!redis) return Object.values(DEFAULT_SETTINGS);

  const customKeys = await redis.smembers(SETTINGS_LIST_KEY);
  const settings: SystemSetting[] = [];

  // Get custom settings
  if (customKeys.length > 0) {
    const pipeline = redis.pipeline();
    for (const key of customKeys) {
      pipeline.get(`${SETTINGS_PREFIX}${key}`);
    }
    const results = await pipeline.exec();
    if (results) {
      for (const [err, data] of results) {
        if (!err && data) {
          settings.push(JSON.parse(data as string));
        }
      }
    }
  }

  // Merge with defaults (custom overrides default)
  const settingsMap = new Map(settings.map((s) => [s.key, s]));
  for (const defaultSetting of Object.values(DEFAULT_SETTINGS)) {
    if (!settingsMap.has(defaultSetting.key)) {
      settings.push(defaultSetting);
    }
  }

  return settings.sort((a, b) => a.key.localeCompare(b.key));
}

// =============================================================================
// Routes
// =============================================================================

export async function systemSettingsAdminRoutes(app: FastifyInstance): Promise<void> {
  // ===========================================================================
  // GET /admin/settings - List all settings
  // ===========================================================================
  app.get(
    '/',
    {
      schema: {
        description: 'List all system settings',
        tags: ['Admin', 'Settings'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            category: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Querystring: { category?: string } }>, reply: FastifyReply) => {
      try {
        const redis = getRedis(app);
        let settings = await getAllSettings(redis);

        if (request.query.category) {
          settings = settings.filter((s) => s.category === request.query.category);
        }

        // Group by category
        const byCategory = settings.reduce((acc, setting) => {
          if (!acc[setting.category]) {
            acc[setting.category] = [];
          }
          acc[setting.category].push(setting);
          return acc;
        }, {} as Record<string, SystemSetting[]>);

        return reply.send({
          success: true,
          data: {
            settings,
            byCategory,
            categories: [...new Set(settings.map((s) => s.category))],
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to list settings');
        return reply.status(500).send({
          success: false,
          error: { code: 'LIST_ERROR', message: 'Failed to list settings' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/settings/:key - Get a specific setting
  // ===========================================================================
  app.get(
    '/:key',
    {
      schema: {
        description: 'Get a specific setting',
        tags: ['Admin', 'Settings'],
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
        const setting = await getSetting(redis, request.params.key);

        if (!setting) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Setting not found' },
          });
        }

        return reply.send({ success: true, data: setting });
      } catch (error) {
        logger.error({ error }, 'Failed to get setting');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_ERROR', message: 'Failed to get setting' },
        });
      }
    }
  );

  // ===========================================================================
  // PUT /admin/settings/:key - Update a setting
  // ===========================================================================
  app.put(
    '/:key',
    {
      schema: {
        description: 'Update a setting',
        tags: ['Admin', 'Settings'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          required: ['key'],
          properties: { key: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['value'],
          properties: { value: {} },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { key: string }; Body: { value: unknown } }>, reply: FastifyReply) => {
      try {
        const redis = getRedis(app);
        const existing = await getSetting(redis, request.params.key);

        if (!existing) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Setting not found' },
          });
        }

        // Validate type
        const newValue = request.body.value;
        const expectedType = existing.type;
        const actualType = Array.isArray(newValue) ? 'array' : typeof newValue;

        if (actualType !== expectedType && !(expectedType === 'object' && actualType === 'object')) {
          return reply.status(400).send({
            success: false,
            error: {
              code: 'TYPE_MISMATCH',
              message: `Expected ${expectedType}, got ${actualType}`,
            },
          });
        }

        const updated: SystemSetting = {
          ...existing,
          value: newValue,
          updatedAt: new Date().toISOString(),
          updatedBy: request.user?.id,
        };

        await setSetting(redis, updated);

        logger.info({
          msg: 'setting_updated',
          adminUserId: request.user?.id,
          key: request.params.key,
          oldValue: existing.value,
          newValue,
        });

        return reply.send({ success: true, data: updated });
      } catch (error) {
        logger.error({ error }, 'Failed to update setting');
        return reply.status(500).send({
          success: false,
          error: { code: 'UPDATE_ERROR', message: 'Failed to update setting' },
        });
      }
    }
  );

  // ===========================================================================
  // PUT /admin/settings - Bulk update settings
  // ===========================================================================
  app.put(
    '/',
    {
      schema: {
        description: 'Bulk update settings',
        tags: ['Admin', 'Settings'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['settings'],
          properties: {
            settings: { type: 'object' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest<{ Body: { settings: Record<string, unknown> } }>, reply: FastifyReply) => {
      try {
        const redis = getRedis(app);
        const { settings } = request.body;
        const results: { key: string; success: boolean; error?: string }[] = [];

        for (const [key, value] of Object.entries(settings)) {
          const existing = await getSetting(redis, key);
          if (!existing) {
            results.push({ key, success: false, error: 'Setting not found' });
            continue;
          }

          const updated: SystemSetting = {
            ...existing,
            value,
            updatedAt: new Date().toISOString(),
            updatedBy: request.user?.id,
          };

          await setSetting(redis, updated);
          results.push({ key, success: true });
        }

        logger.info({
          msg: 'settings_bulk_updated',
          adminUserId: request.user?.id,
          count: results.filter((r) => r.success).length,
        });

        return reply.send({
          success: true,
          data: {
            results,
            succeeded: results.filter((r) => r.success).length,
            failed: results.filter((r) => !r.success).length,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to bulk update settings');
        return reply.status(500).send({
          success: false,
          error: { code: 'UPDATE_ERROR', message: 'Failed to bulk update settings' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/settings/:key/reset - Reset setting to default
  // ===========================================================================
  app.post(
    '/:key/reset',
    {
      schema: {
        description: 'Reset a setting to its default value',
        tags: ['Admin', 'Settings'],
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
        const defaultSetting = DEFAULT_SETTINGS[request.params.key];

        if (!defaultSetting) {
          return reply.status(404).send({
            success: false,
            error: { code: 'NOT_FOUND', message: 'No default value for this setting' },
          });
        }

        const redis = getRedis(app);
        const reset: SystemSetting = {
          ...defaultSetting,
          updatedAt: new Date().toISOString(),
          updatedBy: request.user?.id,
        };

        await setSetting(redis, reset);

        logger.info({
          msg: 'setting_reset',
          adminUserId: request.user?.id,
          key: request.params.key,
        });

        return reply.send({ success: true, data: reset });
      } catch (error) {
        logger.error({ error }, 'Failed to reset setting');
        return reply.status(500).send({
          success: false,
          error: { code: 'RESET_ERROR', message: 'Failed to reset setting' },
        });
      }
    }
  );

  // ===========================================================================
  // GET /admin/settings/maintenance/status - Get maintenance mode status
  // ===========================================================================
  app.get(
    '/maintenance/status',
    {
      schema: {
        description: 'Get maintenance mode status',
        tags: ['Admin', 'Settings'],
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
        const [enabled, message, allowed] = await Promise.all([
          getSetting(redis, 'platform.maintenance_mode'),
          getSetting(redis, 'platform.maintenance_message'),
          getSetting(redis, 'platform.allowed_during_maintenance'),
        ]);

        return reply.send({
          success: true,
          data: {
            enabled: enabled?.value ?? false,
            message: message?.value ?? '',
            allowedUsers: allowed?.value ?? [],
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to get maintenance status');
        return reply.status(500).send({
          success: false,
          error: { code: 'FETCH_ERROR', message: 'Failed to get maintenance status' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/settings/maintenance/enable - Enable maintenance mode
  // ===========================================================================
  app.post(
    '/maintenance/enable',
    {
      schema: {
        description: 'Enable maintenance mode',
        tags: ['Admin', 'Settings'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            allowedUserIds: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (
      request: FastifyRequest<{ Body: { message?: string; allowedUserIds?: string[] } }>,
      reply: FastifyReply
    ) => {
      try {
        const redis = getRedis(app);
        const now = new Date().toISOString();

        // Enable maintenance mode
        await setSetting(redis, {
          ...DEFAULT_SETTINGS['platform.maintenance_mode'],
          value: true,
          updatedAt: now,
          updatedBy: request.user?.id,
        });

        // Update message if provided
        if (request.body.message) {
          await setSetting(redis, {
            ...DEFAULT_SETTINGS['platform.maintenance_message'],
            value: request.body.message,
            updatedAt: now,
            updatedBy: request.user?.id,
          });
        }

        // Update allowed users if provided
        if (request.body.allowedUserIds) {
          await setSetting(redis, {
            ...DEFAULT_SETTINGS['platform.allowed_during_maintenance'],
            value: request.body.allowedUserIds,
            updatedAt: now,
            updatedBy: request.user?.id,
          });
        }

        logger.info({
          msg: 'maintenance_mode_enabled',
          adminUserId: request.user?.id,
        });

        return reply.send({
          success: true,
          message: 'Maintenance mode enabled',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to enable maintenance mode');
        return reply.status(500).send({
          success: false,
          error: { code: 'UPDATE_ERROR', message: 'Failed to enable maintenance mode' },
        });
      }
    }
  );

  // ===========================================================================
  // POST /admin/settings/maintenance/disable - Disable maintenance mode
  // ===========================================================================
  app.post(
    '/maintenance/disable',
    {
      schema: {
        description: 'Disable maintenance mode',
        tags: ['Admin', 'Settings'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const redis = getRedis(app);

        await setSetting(redis, {
          ...DEFAULT_SETTINGS['platform.maintenance_mode'],
          value: false,
          updatedAt: new Date().toISOString(),
          updatedBy: request.user?.id,
        });

        logger.info({
          msg: 'maintenance_mode_disabled',
          adminUserId: request.user?.id,
        });

        return reply.send({
          success: true,
          message: 'Maintenance mode disabled',
        });
      } catch (error) {
        logger.error({ error }, 'Failed to disable maintenance mode');
        return reply.status(500).send({
          success: false,
          error: { code: 'UPDATE_ERROR', message: 'Failed to disable maintenance mode' },
        });
      }
    }
  );
}
