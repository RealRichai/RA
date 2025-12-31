/**
 * Mobile Push Notifications Module
 *
 * FCM (Firebase Cloud Messaging) and APNs (Apple Push Notification service) integration.
 * Supports device registration, notification sending, and delivery tracking.
 */

import { prisma } from '@realriches/database';
import { generatePrefixedId, logger, AppError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Types
// =============================================================================

export type PushProvider = 'fcm' | 'apns' | 'mock';
export type DevicePlatform = 'ios' | 'android' | 'web';
export type NotificationPriority = 'low' | 'normal' | 'high';
export type DeliveryStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'clicked';

interface DeviceRegistration {
  id: string;
  userId: string;
  platform: DevicePlatform;
  provider: PushProvider;
  deviceToken: string;
  deviceName?: string;
  deviceModel?: string;
  osVersion?: string;
  appVersion?: string;
  isActive: boolean;
  lastActiveAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface PushNotification {
  id: string;
  userId: string;
  deviceId?: string; // null = send to all user devices
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
  category?: string;
  priority: NotificationPriority;
  badge?: number;
  sound?: string;
  collapseKey?: string;
  ttl?: number; // seconds
  status: DeliveryStatus;
  providerMessageId?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  clickedAt?: Date;
  error?: string;
  createdAt: Date;
}

interface NotificationTemplate {
  id: string;
  name: string;
  category: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
  priority: NotificationPriority;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface PushStats {
  total: number;
  sent: number;
  delivered: number;
  failed: number;
  clicked: number;
  deliveryRate: number;
  clickRate: number;
}

// =============================================================================
// Push Provider Interface
// =============================================================================

interface IPushProvider {
  name: PushProvider;
  send(deviceToken: string, notification: PushNotification): Promise<{ messageId: string }>;
  sendBatch(tokens: string[], notification: PushNotification): Promise<{ successCount: number; failureCount: number; results: Array<{ token: string; messageId?: string; error?: string }> }>;
  validateToken(deviceToken: string): Promise<boolean>;
}

// =============================================================================
// Mock Provider
// =============================================================================

class MockPushProvider implements IPushProvider {
  name: PushProvider = 'mock';
  private sentNotifications: Map<string, PushNotification> = new Map();

  async send(deviceToken: string, notification: PushNotification): Promise<{ messageId: string }> {
    const messageId = `mock_msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.sentNotifications.set(messageId, notification);
    logger.debug({ deviceToken, title: notification.title }, 'Mock push sent');
    return { messageId };
  }

  async sendBatch(tokens: string[], notification: PushNotification): Promise<{ successCount: number; failureCount: number; results: Array<{ token: string; messageId?: string; error?: string }> }> {
    const results = tokens.map(token => {
      const messageId = `mock_msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      return { token, messageId };
    });
    return {
      successCount: tokens.length,
      failureCount: 0,
      results,
    };
  }

  async validateToken(_deviceToken: string): Promise<boolean> {
    return true;
  }
}

// =============================================================================
// FCM Provider
// =============================================================================

class FCMProvider implements IPushProvider {
  name: PushProvider = 'fcm';
  private serverKey: string;

  constructor() {
    this.serverKey = process.env.FCM_SERVER_KEY || '';
  }

  async send(deviceToken: string, notification: PushNotification): Promise<{ messageId: string }> {
    // In production, use firebase-admin SDK or HTTP v1 API
    // POST https://fcm.googleapis.com/v1/projects/{project}/messages:send
    logger.info({ deviceToken: deviceToken.slice(0, 20) + '...', title: notification.title }, 'FCM: Sending notification');

    const messageId = `fcm_${generatePrefixedId('msg')}`;

    // Placeholder for actual FCM call
    // const message = {
    //   token: deviceToken,
    //   notification: { title: notification.title, body: notification.body },
    //   data: notification.data,
    //   android: { priority: notification.priority === 'high' ? 'high' : 'normal' },
    // };

    return { messageId };
  }

  async sendBatch(tokens: string[], notification: PushNotification): Promise<{ successCount: number; failureCount: number; results: Array<{ token: string; messageId?: string; error?: string }> }> {
    // Use sendMulticast or batch HTTP requests
    logger.info({ tokenCount: tokens.length, title: notification.title }, 'FCM: Sending batch');

    const results = tokens.map(token => ({
      token,
      messageId: `fcm_${generatePrefixedId('msg')}`,
    }));

    return {
      successCount: tokens.length,
      failureCount: 0,
      results,
    };
  }

  async validateToken(deviceToken: string): Promise<boolean> {
    // Dry run to validate token
    return deviceToken.length > 100; // FCM tokens are typically 150+ chars
  }
}

// =============================================================================
// APNs Provider
// =============================================================================

class APNsProvider implements IPushProvider {
  name: PushProvider = 'apns';
  private teamId: string;
  private keyId: string;
  private bundleId: string;

  constructor() {
    this.teamId = process.env.APNS_TEAM_ID || '';
    this.keyId = process.env.APNS_KEY_ID || '';
    this.bundleId = process.env.APNS_BUNDLE_ID || 'com.realriches.app';
  }

  async send(deviceToken: string, notification: PushNotification): Promise<{ messageId: string }> {
    // In production, use apn package or HTTP/2 API
    // POST https://api.push.apple.com/3/device/{deviceToken}
    logger.info({ deviceToken: deviceToken.slice(0, 20) + '...', title: notification.title }, 'APNs: Sending notification');

    const messageId = `apns_${generatePrefixedId('msg')}`;

    // Placeholder for actual APNs call
    // const payload = {
    //   aps: {
    //     alert: { title: notification.title, body: notification.body },
    //     badge: notification.badge,
    //     sound: notification.sound || 'default',
    //   },
    //   ...notification.data,
    // };

    return { messageId };
  }

  async sendBatch(tokens: string[], notification: PushNotification): Promise<{ successCount: number; failureCount: number; results: Array<{ token: string; messageId?: string; error?: string }> }> {
    // APNs requires individual requests, but can use HTTP/2 multiplexing
    logger.info({ tokenCount: tokens.length, title: notification.title }, 'APNs: Sending batch');

    const results = await Promise.all(
      tokens.map(async token => {
        const { messageId } = await this.send(token, notification);
        return { token, messageId };
      })
    );

    return {
      successCount: tokens.length,
      failureCount: 0,
      results,
    };
  }

  async validateToken(deviceToken: string): Promise<boolean> {
    // APNs tokens are 64 hex characters
    return /^[a-f0-9]{64}$/i.test(deviceToken);
  }
}

// =============================================================================
// Provider Factory
// =============================================================================

const providers = new Map<PushProvider, IPushProvider>();

function getProvider(provider: PushProvider): IPushProvider {
  if (!providers.has(provider)) {
    switch (provider) {
      case 'fcm':
        providers.set(provider, new FCMProvider());
        break;
      case 'apns':
        providers.set(provider, new APNsProvider());
        break;
      default:
        providers.set(provider, new MockPushProvider());
    }
  }
  return providers.get(provider)!;
}

function getProviderForPlatform(platform: DevicePlatform): PushProvider {
  switch (platform) {
    case 'android':
      return 'fcm';
    case 'ios':
      return process.env.USE_FCM_FOR_IOS === 'true' ? 'fcm' : 'apns';
    case 'web':
      return 'fcm';
    default:
      return 'mock';
  }
}

// =============================================================================
// In-Memory Storage
// =============================================================================

const deviceRegistrations = new Map<string, DeviceRegistration>();
const pushNotifications = new Map<string, PushNotification>();
const notificationTemplates = new Map<string, NotificationTemplate>();

// Initialize default templates
const defaultTemplates: Omit<NotificationTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'new_lead',
    category: 'leads',
    title: 'New Inquiry',
    body: 'You have a new inquiry for {{propertyName}}',
    priority: 'high',
    isActive: true,
  },
  {
    name: 'payment_received',
    category: 'payments',
    title: 'Payment Received',
    body: '{{tenantName}} paid ${{amount}} for {{propertyName}}',
    priority: 'normal',
    isActive: true,
  },
  {
    name: 'lease_expiring',
    category: 'leases',
    title: 'Lease Expiring Soon',
    body: 'Lease for {{unitAddress}} expires in {{daysRemaining}} days',
    priority: 'normal',
    isActive: true,
  },
  {
    name: 'maintenance_urgent',
    category: 'maintenance',
    title: 'Urgent Maintenance Request',
    body: '{{category}} issue reported at {{propertyName}}',
    priority: 'high',
    isActive: true,
  },
  {
    name: 'document_signed',
    category: 'documents',
    title: 'Document Signed',
    body: '{{signerName}} signed {{documentName}}',
    priority: 'normal',
    isActive: true,
  },
];

// Initialize templates
for (const template of defaultTemplates) {
  const id = generatePrefixedId('tpl');
  notificationTemplates.set(id, {
    ...template,
    id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

// =============================================================================
// Schemas
// =============================================================================

const RegisterDeviceSchema = z.object({
  platform: z.enum(['ios', 'android', 'web']),
  deviceToken: z.string().min(20),
  deviceName: z.string().optional(),
  deviceModel: z.string().optional(),
  osVersion: z.string().optional(),
  appVersion: z.string().optional(),
});

const SendNotificationSchema = z.object({
  userId: z.string().optional(),
  deviceId: z.string().optional(),
  title: z.string().min(1).max(100),
  body: z.string().min(1).max(500),
  imageUrl: z.string().url().optional(),
  data: z.record(z.string()).optional(),
  category: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  badge: z.number().optional(),
  sound: z.string().optional(),
  collapseKey: z.string().optional(),
  ttl: z.number().min(0).max(2419200).optional(), // Max 28 days
});

const SendTemplatedSchema = z.object({
  templateName: z.string(),
  userId: z.string(),
  variables: z.record(z.string()),
});

// =============================================================================
// Helper Functions
// =============================================================================

function interpolateTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
}

// =============================================================================
// Routes
// =============================================================================

export async function pushNotificationRoutes(app: FastifyInstance): Promise<void> {
  // ==========================================================================
  // Device Registration
  // ==========================================================================

  // Register device
  app.post(
    '/devices',
    {
      schema: {
        description: 'Register a device for push notifications',
        tags: ['Push Notifications'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof RegisterDeviceSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = RegisterDeviceSchema.parse(request.body);
      const providerName = getProviderForPlatform(data.platform);
      const provider = getProvider(providerName);

      // Validate token
      const isValid = await provider.validateToken(data.deviceToken);
      if (!isValid) {
        throw new AppError('VALIDATION_ERROR', 'Invalid device token', 400);
      }

      // Check for existing registration with same token
      const existing = Array.from(deviceRegistrations.values())
        .find(d => d.deviceToken === data.deviceToken);

      if (existing) {
        // Update existing registration
        existing.userId = request.user.id;
        existing.isActive = true;
        existing.lastActiveAt = new Date();
        existing.updatedAt = new Date();
        if (data.deviceName) existing.deviceName = data.deviceName;
        if (data.appVersion) existing.appVersion = data.appVersion;

        return reply.send({
          success: true,
          data: { device: existing },
          message: 'Device updated',
        });
      }

      const now = new Date();
      const device: DeviceRegistration = {
        id: generatePrefixedId('dev'),
        userId: request.user.id,
        platform: data.platform,
        provider: providerName,
        deviceToken: data.deviceToken,
        deviceName: data.deviceName,
        deviceModel: data.deviceModel,
        osVersion: data.osVersion,
        appVersion: data.appVersion,
        isActive: true,
        lastActiveAt: now,
        createdAt: now,
        updatedAt: now,
      };

      deviceRegistrations.set(device.id, device);

      logger.info({
        deviceId: device.id,
        platform: data.platform,
        userId: request.user.id,
      }, 'Device registered for push notifications');

      return reply.status(201).send({
        success: true,
        data: { device },
      });
    }
  );

  // List user's devices
  app.get(
    '/devices',
    {
      schema: {
        description: 'List registered devices',
        tags: ['Push Notifications'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const devices = Array.from(deviceRegistrations.values())
        .filter(d => d.userId === request.user!.id && d.isActive)
        .map(d => ({
          ...d,
          deviceToken: d.deviceToken.slice(0, 20) + '...', // Redact token
        }));

      return reply.send({
        success: true,
        data: { devices },
      });
    }
  );

  // Unregister device
  app.delete(
    '/devices/:deviceId',
    {
      schema: {
        description: 'Unregister a device',
        tags: ['Push Notifications'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { deviceId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { deviceId } = request.params;
      const device = deviceRegistrations.get(deviceId);

      if (!device || device.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Device not found', 404);
      }

      device.isActive = false;
      device.updatedAt = new Date();

      return reply.send({
        success: true,
        message: 'Device unregistered',
      });
    }
  );

  // ==========================================================================
  // Send Notifications
  // ==========================================================================

  // Send notification
  app.post(
    '/send',
    {
      schema: {
        description: 'Send a push notification',
        tags: ['Push Notifications'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin', 'landlord'] });
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof SendNotificationSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = SendNotificationSchema.parse(request.body);
      const now = new Date();

      // Get target devices
      let targetDevices: DeviceRegistration[] = [];

      if (data.deviceId) {
        const device = deviceRegistrations.get(data.deviceId);
        if (device?.isActive) {
          targetDevices = [device];
        }
      } else if (data.userId) {
        targetDevices = Array.from(deviceRegistrations.values())
          .filter(d => d.userId === data.userId && d.isActive);
      } else {
        throw new AppError('VALIDATION_ERROR', 'Must specify userId or deviceId', 400);
      }

      if (targetDevices.length === 0) {
        throw new AppError('NOT_FOUND', 'No active devices found', 404);
      }

      const results: Array<{ deviceId: string; status: DeliveryStatus; messageId?: string; error?: string }> = [];

      for (const device of targetDevices) {
        const notification: PushNotification = {
          id: generatePrefixedId('psh'),
          userId: device.userId,
          deviceId: device.id,
          title: data.title,
          body: data.body,
          imageUrl: data.imageUrl,
          data: data.data,
          category: data.category,
          priority: data.priority,
          badge: data.badge,
          sound: data.sound,
          collapseKey: data.collapseKey,
          ttl: data.ttl,
          status: 'pending',
          createdAt: now,
        };

        try {
          const provider = getProvider(device.provider);
          const { messageId } = await provider.send(device.deviceToken, notification);

          notification.status = 'sent';
          notification.providerMessageId = messageId;
          notification.sentAt = new Date();

          results.push({ deviceId: device.id, status: 'sent', messageId });
        } catch (error) {
          notification.status = 'failed';
          notification.error = error instanceof Error ? error.message : 'Unknown error';

          results.push({ deviceId: device.id, status: 'failed', error: notification.error });
        }

        pushNotifications.set(notification.id, notification);
      }

      const successCount = results.filter(r => r.status === 'sent').length;

      logger.info({
        targetCount: targetDevices.length,
        successCount,
        title: data.title,
      }, 'Push notifications sent');

      return reply.send({
        success: true,
        data: {
          sent: successCount,
          failed: targetDevices.length - successCount,
          results,
        },
      });
    }
  );

  // Send templated notification
  app.post(
    '/send/template',
    {
      schema: {
        description: 'Send a notification using a template',
        tags: ['Push Notifications'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin', 'landlord'] });
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof SendTemplatedSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = SendTemplatedSchema.parse(request.body);

      const template = Array.from(notificationTemplates.values())
        .find(t => t.name === data.templateName && t.isActive);

      if (!template) {
        throw new AppError('NOT_FOUND', 'Template not found', 404);
      }

      const title = interpolateTemplate(template.title, data.variables);
      const body = interpolateTemplate(template.body, data.variables);

      // Reuse send logic
      const targetDevices = Array.from(deviceRegistrations.values())
        .filter(d => d.userId === data.userId && d.isActive);

      if (targetDevices.length === 0) {
        throw new AppError('NOT_FOUND', 'No active devices found', 404);
      }

      const now = new Date();
      const results: Array<{ deviceId: string; status: DeliveryStatus }> = [];

      for (const device of targetDevices) {
        const notification: PushNotification = {
          id: generatePrefixedId('psh'),
          userId: device.userId,
          deviceId: device.id,
          title,
          body,
          imageUrl: template.imageUrl,
          data: template.data,
          category: template.category,
          priority: template.priority,
          status: 'pending',
          createdAt: now,
        };

        try {
          const provider = getProvider(device.provider);
          const { messageId } = await provider.send(device.deviceToken, notification);

          notification.status = 'sent';
          notification.providerMessageId = messageId;
          notification.sentAt = new Date();

          results.push({ deviceId: device.id, status: 'sent' });
        } catch {
          notification.status = 'failed';
          results.push({ deviceId: device.id, status: 'failed' });
        }

        pushNotifications.set(notification.id, notification);
      }

      return reply.send({
        success: true,
        data: {
          templateName: data.templateName,
          sent: results.filter(r => r.status === 'sent').length,
          results,
        },
      });
    }
  );

  // Broadcast to all users (admin only)
  app.post(
    '/broadcast',
    {
      schema: {
        description: 'Broadcast notification to all users',
        tags: ['Push Notifications'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (
      request: FastifyRequest<{
        Body: { title: string; body: string; priority?: NotificationPriority };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { title, body, priority = 'normal' } = request.body;

      const activeDevices = Array.from(deviceRegistrations.values())
        .filter(d => d.isActive);

      // Group by provider for batch sending
      const byProvider = new Map<PushProvider, DeviceRegistration[]>();
      for (const device of activeDevices) {
        if (!byProvider.has(device.provider)) {
          byProvider.set(device.provider, []);
        }
        byProvider.get(device.provider)!.push(device);
      }

      let totalSuccess = 0;
      let totalFailed = 0;

      for (const [providerName, devices] of byProvider) {
        const provider = getProvider(providerName);
        const tokens = devices.map(d => d.deviceToken);

        const notification: PushNotification = {
          id: generatePrefixedId('psh'),
          userId: 'broadcast',
          title,
          body,
          priority,
          status: 'pending',
          createdAt: new Date(),
        };

        const result = await provider.sendBatch(tokens, notification);
        totalSuccess += result.successCount;
        totalFailed += result.failureCount;
      }

      logger.info({
        totalDevices: activeDevices.length,
        totalSuccess,
        totalFailed,
        title,
      }, 'Broadcast notification sent');

      return reply.send({
        success: true,
        data: {
          totalDevices: activeDevices.length,
          sent: totalSuccess,
          failed: totalFailed,
        },
      });
    }
  );

  // ==========================================================================
  // Notification History & Stats
  // ==========================================================================

  // Get notification history
  app.get(
    '/history',
    {
      schema: {
        description: 'Get notification history',
        tags: ['Push Notifications'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', default: 50 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { limit?: number } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { limit = 50 } = request.query;

      const notifications = Array.from(pushNotifications.values())
        .filter(n => n.userId === request.user!.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit);

      return reply.send({
        success: true,
        data: { notifications },
      });
    }
  );

  // Get push stats (admin)
  app.get(
    '/stats',
    {
      schema: {
        description: 'Get push notification statistics',
        tags: ['Push Notifications'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            periodDays: { type: 'integer', default: 7 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { periodDays?: number } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { periodDays = 7 } = request.query;
      const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

      const recentNotifications = Array.from(pushNotifications.values())
        .filter(n => n.createdAt >= startDate);

      const stats: PushStats = {
        total: recentNotifications.length,
        sent: recentNotifications.filter(n => n.status === 'sent').length,
        delivered: recentNotifications.filter(n => n.status === 'delivered').length,
        failed: recentNotifications.filter(n => n.status === 'failed').length,
        clicked: recentNotifications.filter(n => n.status === 'clicked').length,
        deliveryRate: 0,
        clickRate: 0,
      };

      stats.deliveryRate = stats.sent > 0 ? (stats.delivered / stats.sent) * 100 : 0;
      stats.clickRate = stats.delivered > 0 ? (stats.clicked / stats.delivered) * 100 : 0;

      const deviceStats = {
        total: deviceRegistrations.size,
        active: Array.from(deviceRegistrations.values()).filter(d => d.isActive).length,
        byPlatform: {
          ios: Array.from(deviceRegistrations.values()).filter(d => d.platform === 'ios' && d.isActive).length,
          android: Array.from(deviceRegistrations.values()).filter(d => d.platform === 'android' && d.isActive).length,
          web: Array.from(deviceRegistrations.values()).filter(d => d.platform === 'web' && d.isActive).length,
        },
      };

      return reply.send({
        success: true,
        data: {
          period: { days: periodDays, start: startDate.toISOString() },
          notifications: stats,
          devices: deviceStats,
        },
      });
    }
  );

  // ==========================================================================
  // Templates (Admin)
  // ==========================================================================

  // List templates
  app.get(
    '/templates',
    {
      schema: {
        description: 'List notification templates',
        tags: ['Push Notifications'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const templates = Array.from(notificationTemplates.values());

      return reply.send({
        success: true,
        data: { templates },
      });
    }
  );
}

// =============================================================================
// Helper Functions for Other Modules
// =============================================================================

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<{ sent: number; failed: number }> {
  const devices = Array.from(deviceRegistrations.values())
    .filter(d => d.userId === userId && d.isActive);

  let sent = 0;
  let failed = 0;

  for (const device of devices) {
    const notification: PushNotification = {
      id: generatePrefixedId('psh'),
      userId,
      deviceId: device.id,
      title,
      body,
      data,
      priority: 'normal',
      status: 'pending',
      createdAt: new Date(),
    };

    try {
      const provider = getProvider(device.provider);
      await provider.send(device.deviceToken, notification);
      notification.status = 'sent';
      sent++;
    } catch {
      notification.status = 'failed';
      failed++;
    }

    pushNotifications.set(notification.id, notification);
  }

  return { sent, failed };
}

// =============================================================================
// Exports
// =============================================================================

export {
  deviceRegistrations,
  pushNotifications,
  notificationTemplates,
  getProvider,
  getProviderForPlatform,
};
