/**
 * WebSocket Server for Real-time Notifications
 *
 * Provides live updates for events like new leads, payments, lease signings, etc.
 */

import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import type { RawData, WebSocket } from 'ws';
import { WebSocketServer } from 'ws';

// =============================================================================
// Constants
// =============================================================================

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 60000; // 60 seconds

// =============================================================================
// Types
// =============================================================================

interface AuthenticatedWebSocket extends WebSocket {
  isAlive: boolean;
  userId?: string;
  subscriptions: Set<string>;
  connectedAt: Date;
}

interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'ping' | 'pong';
  channel?: string;
  channels?: string[];
}

interface BroadcastMessage {
  channel: string;
  event: string;
  data: unknown;
  timestamp: string;
}

// =============================================================================
// Channel Types
// =============================================================================

const VALID_CHANNELS = [
  'leads',           // New inquiries and showing requests
  'payments',        // Payment received, failed, etc.
  'leases',          // Lease signed, renewed, expired
  'maintenance',     // Work orders created, updated
  'documents',       // Documents signed, uploaded
  'properties',      // Property status changes
  'listings',        // Listing published, viewed
  'notifications',   // General notifications
  'system',          // System-wide announcements
] as const;

type Channel = typeof VALID_CHANNELS[number];

// =============================================================================
// WebSocket Manager
// =============================================================================

class WebSocketManager {
  // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
  private wss: WebSocketServer | null = null;
  private clients: Map<string, AuthenticatedWebSocket> = new Map();
  private channelSubscribers: Map<string, Set<string>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private redis: Redis | null = null;
  private redisSub: Redis | null = null;

  constructor() {
    // Initialize channel maps
    for (const channel of VALID_CHANNELS) {
      this.channelSubscribers.set(channel, new Set());
    }
  }

  async initialize(app: FastifyInstance): Promise<void> {
    // Get Redis from app
    this.redis = (app as unknown as { redis?: Redis }).redis || null;

    // Create Redis subscriber for pub/sub
    if (this.redis) {
      this.redisSub = this.redis.duplicate();
      await this.setupRedisPubSub();
    }

    // Create WebSocket server
    this.wss = new WebSocketServer({ noServer: true });

    // Handle upgrade requests
    app.server.on('upgrade', (request, socket, head) => {
      // Check if this is a WebSocket request for our path
      if (request.url?.startsWith('/ws')) {
        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.wss?.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    // Handle new connections
    this.wss.on('connection', (ws: WebSocket, request) => {
      this.handleConnection(ws as AuthenticatedWebSocket, request);
    });

    // Start heartbeat
    this.startHeartbeat();

    logger.info({ msg: 'websocket_server_started' });
  }

  private async setupRedisPubSub(): Promise<void> {
    if (!this.redisSub) return;

    // Subscribe to all channels
    for (const channel of VALID_CHANNELS) {
      await this.redisSub.subscribe(`ws:${channel}`);
    }

    // Handle messages from Redis
    this.redisSub.on('message', (channel, message) => {
      const channelName = channel.replace('ws:', '') as Channel;
      try {
        const data = JSON.parse(message);
        this.broadcastToChannel(channelName, data.event, data.data);
      } catch (error) {
        logger.error({ error, channel, message }, 'Failed to process Redis message');
      }
    });
  }

  private handleConnection(ws: AuthenticatedWebSocket, request: { url?: string }): void {
    // Initialize connection properties
    ws.isAlive = true;
    ws.subscriptions = new Set();
    ws.connectedAt = new Date();

    // Extract user ID from query string (should be validated with JWT in production)
    const url = new URL(request.url || '', 'http://localhost');
    const userId = url.searchParams.get('userId');

    if (!userId) {
      ws.close(4001, 'Missing userId');
      return;
    }

    ws.userId = userId;

    // Store client
    const clientId = this.generateClientId(userId);
    this.clients.set(clientId, ws);

    logger.info({
      msg: 'websocket_connected',
      userId,
      clientId,
    });

    // Handle pong (response to ping)
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Handle messages
    ws.on('message', (data: RawData) => {
      this.handleMessage(ws, clientId, data);
    });

    // Handle close
    ws.on('close', () => {
      this.handleDisconnect(ws, clientId);
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error({ error, clientId }, 'WebSocket error');
    });

    // Send welcome message
    this.sendToClient(ws, {
      type: 'connected',
      clientId,
      availableChannels: VALID_CHANNELS,
      timestamp: new Date().toISOString(),
    });
  }

  private handleMessage(ws: AuthenticatedWebSocket, clientId: string, data: RawData): void {
    try {
      const message: WebSocketMessage = JSON.parse(data.toString());

      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(ws, clientId, message.channels || (message.channel ? [message.channel] : []));
          break;

        case 'unsubscribe':
          this.handleUnsubscribe(ws, clientId, message.channels || (message.channel ? [message.channel] : []));
          break;

        case 'ping':
          this.sendToClient(ws, { type: 'pong', timestamp: new Date().toISOString() });
          break;

        default:
          this.sendToClient(ws, { type: 'error', message: 'Unknown message type' });
      }
    } catch (error) {
      logger.error({ error, clientId }, 'Failed to parse WebSocket message');
      this.sendToClient(ws, { type: 'error', message: 'Invalid message format' });
    }
  }

  private handleSubscribe(ws: AuthenticatedWebSocket, clientId: string, channels: string[]): void {
    const subscribed: string[] = [];
    const invalid: string[] = [];

    for (const channel of channels) {
      if (VALID_CHANNELS.includes(channel as Channel)) {
        ws.subscriptions.add(channel);
        this.channelSubscribers.get(channel)?.add(clientId);
        subscribed.push(channel);
      } else {
        invalid.push(channel);
      }
    }

    this.sendToClient(ws, {
      type: 'subscribed',
      channels: subscribed,
      invalid: invalid.length > 0 ? invalid : undefined,
      timestamp: new Date().toISOString(),
    });

    logger.debug({
      msg: 'websocket_subscribed',
      clientId,
      channels: subscribed,
    });
  }

  private handleUnsubscribe(ws: AuthenticatedWebSocket, clientId: string, channels: string[]): void {
    for (const channel of channels) {
      ws.subscriptions.delete(channel);
      this.channelSubscribers.get(channel)?.delete(clientId);
    }

    this.sendToClient(ws, {
      type: 'unsubscribed',
      channels,
      timestamp: new Date().toISOString(),
    });
  }

  private handleDisconnect(ws: AuthenticatedWebSocket, clientId: string): void {
    // Remove from all channel subscriptions
    for (const channel of ws.subscriptions) {
      this.channelSubscribers.get(channel)?.delete(clientId);
    }

    // Remove client
    this.clients.delete(clientId);

    logger.info({
      msg: 'websocket_disconnected',
      clientId,
      userId: ws.userId,
      duration: Date.now() - ws.connectedAt.getTime(),
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.clients.forEach((ws, clientId) => {
        if (!ws.isAlive) {
          ws.terminate();
          this.clients.delete(clientId);
          return;
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, HEARTBEAT_INTERVAL);
  }

  private sendToClient(ws: WebSocket, data: unknown): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  private generateClientId(userId: string): string {
    return `${userId}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  // ==========================================================================
  // Public Methods
  // ==========================================================================

  /**
   * Broadcast a message to all subscribers of a channel.
   */
  broadcastToChannel(channel: Channel, event: string, data: unknown): void {
    const message: BroadcastMessage = {
      channel,
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    const subscribers = this.channelSubscribers.get(channel);
    if (!subscribers || subscribers.size === 0) return;

    let sent = 0;
    for (const clientId of subscribers) {
      const ws = this.clients.get(clientId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        sent++;
      }
    }

    logger.debug({
      msg: 'websocket_broadcast',
      channel,
      event,
      recipients: sent,
    });
  }

  /**
   * Send a message to a specific user (all their connections).
   */
  sendToUser(userId: string, channel: Channel, event: string, data: unknown): void {
    const message: BroadcastMessage = {
      channel,
      event,
      data,
      timestamp: new Date().toISOString(),
    };

    let sent = 0;
    for (const [clientId, ws] of this.clients) {
      if (ws.userId === userId && ws.subscriptions.has(channel) && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        sent++;
      }
    }

    logger.debug({
      msg: 'websocket_send_to_user',
      userId,
      channel,
      event,
      connections: sent,
    });
  }

  /**
   * Publish a message via Redis for multi-instance broadcasting.
   */
  async publish(channel: Channel, event: string, data: unknown): Promise<void> {
    if (this.redis) {
      await this.redis.publish(`ws:${channel}`, JSON.stringify({ event, data }));
    } else {
      // Fallback to local broadcast
      this.broadcastToChannel(channel, event, data);
    }
  }

  /**
   * Get connection statistics.
   */
  getStats(): {
    totalConnections: number;
    channelStats: Record<string, number>;
    userStats: Record<string, number>;
  } {
    const channelStats: Record<string, number> = {};
    for (const [channel, subscribers] of this.channelSubscribers) {
      channelStats[channel] = subscribers.size;
    }

    const userStats: Record<string, number> = {};
    for (const ws of this.clients.values()) {
      if (ws.userId) {
        userStats[ws.userId] = (userStats[ws.userId] || 0) + 1;
      }
    }

    return {
      totalConnections: this.clients.size,
      channelStats,
      userStats,
    };
  }

  /**
   * Shutdown the WebSocket server.
   */
  async shutdown(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    // Close all connections
    for (const ws of this.clients.values()) {
      ws.close(1001, 'Server shutting down');
    }

    // Close WebSocket server
    this.wss?.close();

    // Close Redis subscriber
    if (this.redisSub) {
      await this.redisSub.quit();
    }

    logger.info({ msg: 'websocket_server_stopped' });
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let wsManager: WebSocketManager | null = null;

export function getWebSocketManager(): WebSocketManager | null {
  return wsManager;
}

// =============================================================================
// Fastify Plugin
// =============================================================================

export async function websocketPlugin(app: FastifyInstance): Promise<void> {
  wsManager = new WebSocketManager();
  await wsManager.initialize(app);

  // Decorate app with WebSocket manager
  app.decorate('ws', wsManager);

  // Cleanup on shutdown
  app.addHook('onClose', async () => {
    await wsManager?.shutdown();
  });

  // Add REST endpoints for WebSocket stats
  app.get(
    '/realtime/stats',
    {
      schema: {
        description: 'Get WebSocket connection statistics',
        tags: ['Realtime'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (_request: FastifyRequest, reply) => {
      const stats = wsManager?.getStats() || {
        totalConnections: 0,
        channelStats: {},
        userStats: {},
      };

      return reply.send({
        success: true,
        data: stats,
      });
    }
  );

  // Endpoint to broadcast a message (admin only)
  app.post(
    '/realtime/broadcast',
    {
      schema: {
        description: 'Broadcast a message to a channel',
        tags: ['Realtime'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['channel', 'event', 'data'],
          properties: {
            channel: { type: 'string', enum: VALID_CHANNELS as unknown as string[] },
            event: { type: 'string' },
            data: { type: 'object' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['admin'] });
      },
    },
    async (
      request: FastifyRequest<{ Body: { channel: Channel; event: string; data: unknown } }>,
      reply
    ) => {
      const { channel, event, data } = request.body;

      await wsManager?.publish(channel, event, data);

      logger.info({
        msg: 'admin_broadcast',
        adminId: request.user?.id,
        channel,
        event,
      });

      return reply.send({
        success: true,
        message: 'Broadcast sent',
      });
    }
  );
}

// =============================================================================
// Helper Functions for Other Modules
// =============================================================================

/**
 * Notify about a new lead/inquiry.
 */
export async function notifyNewLead(ownerId: string, data: {
  propertyId: string;
  listingId: string;
  inquiryId: string;
  prospectName: string;
  prospectEmail: string;
}): Promise<void> {
  const ws = getWebSocketManager();
  if (ws) {
    ws.sendToUser(ownerId, 'leads', 'new_inquiry', data);
  }
}

/**
 * Notify about a payment.
 */
export async function notifyPayment(userId: string, data: {
  paymentId: string;
  amount: number;
  type: string;
  status: string;
}): Promise<void> {
  const ws = getWebSocketManager();
  if (ws) {
    ws.sendToUser(userId, 'payments', 'payment_update', data);
  }
}

/**
 * Notify about a lease event.
 */
export async function notifyLeaseEvent(userIds: string[], event: string, data: {
  leaseId: string;
  propertyAddress: string;
  event: string;
}): Promise<void> {
  const ws = getWebSocketManager();
  if (ws) {
    for (const userId of userIds) {
      ws.sendToUser(userId, 'leases', event, data);
    }
  }
}

/**
 * Broadcast a system message.
 */
export async function broadcastSystemMessage(message: string, type: 'info' | 'warning' | 'alert' = 'info'): Promise<void> {
  const ws = getWebSocketManager();
  if (ws) {
    await ws.publish('system', 'announcement', { message, type });
  }
}
