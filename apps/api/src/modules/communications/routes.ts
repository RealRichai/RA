import {
  prisma,
  Prisma,
  type MessageChannel as PrismaMessageChannel,
  type MessageStatus as PrismaMessageStatus,
  type MessageDirection as PrismaMessageDirection,
  type ThreadStatus as PrismaThreadStatus,
  type ThreadPriority as PrismaThreadPriority,
  type ParticipantType as PrismaParticipantType,
  type TemplateCategory as PrismaTemplateCategory,
  type BroadcastStatus as PrismaBroadcastStatus,
} from '@realriches/database';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Types
export type MessageChannel = 'email' | 'sms' | 'in_app' | 'portal';
export type MessageStatus = 'draft' | 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'read';
export type MessageDirection = 'inbound' | 'outbound';
export type ParticipantType = 'tenant' | 'owner' | 'vendor' | 'prospect' | 'staff';
export type ThreadStatus = 'open' | 'pending' | 'resolved' | 'archived';
export type TemplateCategory = 'lease' | 'maintenance' | 'payment' | 'notice' | 'marketing' | 'general';

export interface ThreadParticipant {
  id: string;
  type: ParticipantType;
  name: string;
  email: string | null;
  phone: string | null;
  userId: string | null;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface BroadcastRecipient {
  id: string;
  type: ParticipantType;
  name: string;
  email: string | null;
  phone: string | null;
  status: MessageStatus;
  sentAt: Date | null;
  error: string | null;
}

export interface BroadcastFilter {
  propertyIds?: string[];
  participantTypes?: ParticipantType[];
  leaseStatus?: string[];
  paymentStatus?: string[];
}

export interface BroadcastStats {
  totalRecipients: number;
  sent: number;
  delivered: number;
  failed: number;
  opened: number;
  clicked: number;
}

export interface UnifiedInboxItem {
  id: string;
  type: 'thread' | 'sms';
  threadId: string | null;
  smsId: string | null;
  channel: MessageChannel;
  direction: MessageDirection;
  from: { name: string; email: string | null; phone: string | null };
  subject: string | null;
  preview: string;
  status: MessageStatus;
  isRead: boolean;
  timestamp: Date;
  propertyId: string | null;
  propertyName: string | null;
}

// SMS Provider interface
interface SMSProvider {
  name: string;
  send(to: string, body: string, from?: string): Promise<{ messageId: string; segments: number }>;
  getStatus(messageId: string): Promise<MessageStatus>;
}

// Mock SMS Provider
const mockSMSProvider: SMSProvider = {
  name: 'mock',
  async send(to: string, body: string, _from?: string) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      messageId: `sms_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      segments: Math.ceil(body.length / 160),
    };
  },
  async getStatus(_messageId: string) {
    return 'delivered' as MessageStatus;
  },
};

// Schemas
const createThreadSchema = z.object({
  propertyId: z.string().uuid().optional(),
  unitId: z.string().uuid().optional(),
  subject: z.string().min(1),
  participants: z.array(z.object({
    type: z.enum(['tenant', 'owner', 'vendor', 'prospect', 'staff']),
    name: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    userId: z.string().uuid().optional(),
  })).min(1),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  labels: z.array(z.string()).optional(),
});

const sendMessageSchema = z.object({
  threadId: z.string().uuid(),
  channel: z.enum(['email', 'sms', 'in_app', 'portal']),
  body: z.string().min(1),
  htmlBody: z.string().optional(),
  attachments: z.array(z.object({
    filename: z.string(),
    mimeType: z.string(),
    size: z.number(),
    url: z.string().url(),
  })).optional(),
});

const sendSMSSchema = z.object({
  to: z.string().min(10),
  body: z.string().min(1).max(1600),
  from: z.string().optional(),
  threadId: z.string().uuid().optional(),
});

const createTemplateSchema = z.object({
  name: z.string().min(1),
  category: z.enum(['lease', 'maintenance', 'payment', 'notice', 'marketing', 'general']),
  channel: z.enum(['email', 'sms', 'in_app', 'portal']),
  subject: z.string().optional(),
  body: z.string().min(1),
  htmlBody: z.string().optional(),
});

const createBroadcastSchema = z.object({
  name: z.string().min(1),
  templateId: z.string().uuid().optional(),
  channel: z.enum(['email', 'sms', 'in_app']),
  subject: z.string().optional(),
  body: z.string().min(1),
  filters: z.object({
    propertyIds: z.array(z.string().uuid()).optional(),
    participantTypes: z.array(z.enum(['tenant', 'owner', 'vendor', 'prospect'])).optional(),
    leaseStatus: z.array(z.string()).optional(),
    paymentStatus: z.array(z.string()).optional(),
  }).optional(),
  scheduledAt: z.string().datetime().optional(),
  createdById: z.string().uuid(),
});

// Helper functions
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function extractVariables(template: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const variables: string[] = [];
  let match;
  while ((match = regex.exec(template)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }
  return variables;
}

export function interpolateTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

export function truncatePreview(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

// Default templates data
const defaultTemplatesData = [
  {
    name: 'Rent Reminder',
    category: 'payment' as TemplateCategory,
    channel: 'email' as MessageChannel,
    subject: 'Rent Reminder - Payment Due {{due_date}}',
    body: 'Dear {{tenant_name}},\n\nThis is a friendly reminder that your rent payment of {{amount}} is due on {{due_date}}.\n\nPlease log in to your portal to make a payment.\n\nThank you,\n{{property_name}}',
    variables: ['tenant_name', 'amount', 'due_date', 'property_name'],
  },
  {
    name: 'Rent Reminder SMS',
    category: 'payment' as TemplateCategory,
    channel: 'sms' as MessageChannel,
    subject: null,
    body: 'Hi {{tenant_name}}, your rent of {{amount}} is due on {{due_date}}. Pay online at {{portal_url}}',
    variables: ['tenant_name', 'amount', 'due_date', 'portal_url'],
  },
  {
    name: 'Maintenance Scheduled',
    category: 'maintenance' as TemplateCategory,
    channel: 'email' as MessageChannel,
    subject: 'Maintenance Visit Scheduled - {{date}}',
    body: 'Dear {{tenant_name}},\n\nA maintenance visit has been scheduled for {{date}} between {{time_window}}.\n\nWork to be performed: {{description}}\n\nPlease ensure access to the unit.\n\nThank you,\n{{property_name}}',
    variables: ['tenant_name', 'date', 'time_window', 'description', 'property_name'],
  },
  {
    name: 'Lease Expiration Notice',
    category: 'lease' as TemplateCategory,
    channel: 'email' as MessageChannel,
    subject: 'Your Lease is Expiring on {{expiration_date}}',
    body: 'Dear {{tenant_name}},\n\nYour lease at {{property_address}} will expire on {{expiration_date}}.\n\nPlease contact us to discuss renewal options.\n\nThank you,\n{{property_name}}',
    variables: ['tenant_name', 'property_address', 'expiration_date', 'property_name'],
  },
  {
    name: 'Payment Confirmation',
    category: 'payment' as TemplateCategory,
    channel: 'email' as MessageChannel,
    subject: 'Payment Received - Thank You',
    body: 'Dear {{tenant_name}},\n\nWe have received your payment of {{amount}} on {{payment_date}}.\n\nTransaction ID: {{transaction_id}}\n\nThank you,\n{{property_name}}',
    variables: ['tenant_name', 'amount', 'payment_date', 'transaction_id', 'property_name'],
  },
];

// Initialize default templates
async function initializeDefaultTemplates(): Promise<void> {
  const existingCount = await prisma.messageTemplate.count();
  if (existingCount > 0) return;

  for (const template of defaultTemplatesData) {
    await prisma.messageTemplate.create({
      data: {
        name: template.name,
        category: template.category as PrismaTemplateCategory,
        channel: template.channel as PrismaMessageChannel,
        subject: template.subject,
        body: template.body,
        variables: template.variables,
        isActive: true,
      },
    });
  }
}

// Route handlers
export async function communicationRoutes(app: FastifyInstance): Promise<void> {
  // Initialize default templates on startup
  await initializeDefaultTemplates();

  // Unified inbox
  app.get('/inbox', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      channel?: MessageChannel;
      status?: ThreadStatus;
      unreadOnly?: string;
      propertyId?: string;
      limit?: string;
      offset?: string;
    };

    const limit = parseInt(query.limit || '50', 10);
    const offset = parseInt(query.offset || '0', 10);

    const inboxItems: UnifiedInboxItem[] = [];

    // Build thread query
    const threadWhere: Prisma.MessageThreadWhereInput = {};
    if (query.propertyId) threadWhere.propertyId = query.propertyId;
    if (query.status) threadWhere.status = query.status as PrismaThreadStatus;
    if (query.unreadOnly === 'true') threadWhere.unreadCount = { gt: 0 };

    const threads = await prisma.messageThread.findMany({
      where: threadWhere,
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    for (const thread of threads) {
      const lastMessage = thread.messages[0];
      if (!lastMessage) continue;

      if (query.channel && lastMessage.channel !== query.channel) continue;

      const participants = (thread.participants || []) as unknown as ThreadParticipant[];

      inboxItems.push({
        id: thread.id,
        type: 'thread',
        threadId: thread.id,
        smsId: null,
        channel: lastMessage.channel as MessageChannel,
        direction: lastMessage.direction as MessageDirection,
        from: {
          name: lastMessage.senderName,
          email: participants.find((p) => p.name === lastMessage.senderName)?.email || null,
          phone: participants.find((p) => p.name === lastMessage.senderName)?.phone || null,
        },
        subject: thread.subject,
        preview: truncatePreview(lastMessage.body),
        status: lastMessage.status as MessageStatus,
        isRead: thread.unreadCount === 0,
        timestamp: lastMessage.createdAt,
        propertyId: thread.propertyId,
        propertyName: thread.propertyId ? `Property ${thread.propertyId.substring(0, 8)}` : null,
      });
    }

    // Add standalone SMS items
    if (!query.channel || query.channel === 'sms') {
      const smsMessages = await prisma.sMSMessage.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      for (const sms of smsMessages) {
        inboxItems.push({
          id: sms.id,
          type: 'sms',
          threadId: null,
          smsId: sms.id,
          channel: 'sms',
          direction: sms.direction as MessageDirection,
          from: {
            name: sms.direction === 'inbound' ? sms.fromNumber : 'System',
            email: null,
            phone: sms.direction === 'inbound' ? sms.fromNumber : sms.toNumber,
          },
          subject: null,
          preview: truncatePreview(sms.body),
          status: sms.status as MessageStatus,
          isRead: sms.status === 'read',
          timestamp: sms.createdAt,
          propertyId: null,
          propertyName: null,
        });
      }
    }

    // Sort by timestamp
    inboxItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Paginate
    const paginated = inboxItems.slice(offset, offset + limit);

    return reply.send({
      success: true,
      data: paginated,
      total: inboxItems.length,
      unreadCount: inboxItems.filter((i) => !i.isRead).length,
    });
  });

  // Create message thread
  app.post('/threads', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createThreadSchema.parse(request.body);
    const now = new Date();

    const participants: ThreadParticipant[] = body.participants.map((p) => ({
      id: generateId(),
      type: p.type,
      name: p.name,
      email: p.email || null,
      phone: p.phone || null,
      userId: p.userId || null,
    }));

    const thread = await prisma.messageThread.create({
      data: {
        propertyId: body.propertyId,
        unitId: body.unitId,
        subject: body.subject,
        participants: participants as unknown as Prisma.JsonValue,
        status: 'open' as PrismaThreadStatus,
        priority: body.priority as PrismaThreadPriority,
        labels: body.labels || [],
        lastMessageAt: now,
        messageCount: 0,
        unreadCount: 0,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...thread,
        participants,
      },
    });
  });

  // Get thread by ID
  app.get('/threads/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const thread = await prisma.messageThread.findUnique({
      where: { id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!thread) {
      return reply.status(404).send({
        success: false,
        error: 'Thread not found',
      });
    }

    return reply.send({
      success: true,
      data: {
        ...thread,
        participants: thread.participants as unknown as ThreadParticipant[],
        messages: thread.messages,
      },
    });
  });

  // List threads
  app.get('/threads', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      propertyId?: string;
      status?: ThreadStatus;
      assignedTo?: string;
      priority?: string;
    };

    const where: Prisma.MessageThreadWhereInput = {};
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.status) where.status = query.status as PrismaThreadStatus;
    if (query.assignedTo) where.assignedTo = query.assignedTo;
    if (query.priority) where.priority = query.priority as PrismaThreadPriority;

    const threads = await prisma.messageThread.findMany({
      where,
      orderBy: { lastMessageAt: 'desc' },
    });

    const results = threads.map((t) => ({
      ...t,
      participants: t.participants as unknown as ThreadParticipant[],
    }));

    return reply.send({
      success: true,
      data: results,
      total: results.length,
    });
  });

  // Update thread
  app.patch('/threads/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      status?: ThreadStatus;
      assignedTo?: string;
      priority?: string;
      labels?: string[];
    };

    const thread = await prisma.messageThread.findUnique({
      where: { id },
    });

    if (!thread) {
      return reply.status(404).send({
        success: false,
        error: 'Thread not found',
      });
    }

    const updateData: Prisma.MessageThreadUpdateInput = {};
    if (body.status) updateData.status = body.status as PrismaThreadStatus;
    if (body.assignedTo !== undefined) updateData.assignedTo = body.assignedTo;
    if (body.priority) updateData.priority = body.priority as PrismaThreadPriority;
    if (body.labels) updateData.labels = body.labels;

    const updated = await prisma.messageThread.update({
      where: { id },
      data: updateData,
    });

    return reply.send({
      success: true,
      data: {
        ...updated,
        participants: updated.participants as unknown as ThreadParticipant[],
      },
    });
  });

  // Send message in thread
  app.post('/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = sendMessageSchema.parse(request.body);

    const thread = await prisma.messageThread.findUnique({
      where: { id: body.threadId },
    });

    if (!thread) {
      return reply.status(404).send({
        success: false,
        error: 'Thread not found',
      });
    }

    const now = new Date();

    const attachments = (body.attachments || []).map((a) => ({
      id: generateId(),
      ...a,
    }));

    const message = await prisma.message.create({
      data: {
        threadId: body.threadId,
        senderId: 'current-user',
        senderType: 'staff' as PrismaParticipantType,
        senderName: 'Property Manager',
        direction: 'outbound' as PrismaMessageDirection,
        channel: body.channel as PrismaMessageChannel,
        subject: thread.subject,
        body: body.body,
        htmlBody: body.htmlBody,
        attachments: attachments as unknown as Prisma.JsonValue,
        status: 'sent' as PrismaMessageStatus,
        sentAt: now,
      },
    });

    // Update thread
    await prisma.messageThread.update({
      where: { id: body.threadId },
      data: {
        lastMessageAt: now,
        messageCount: { increment: 1 },
      },
    });

    // If SMS, also create SMS record
    if (body.channel === 'sms') {
      const participants = (thread.participants || []) as unknown as ThreadParticipant[];
      const recipient = participants.find((p) => p.phone);
      if (recipient?.phone) {
        const smsResult = await mockSMSProvider.send(recipient.phone, body.body);
        await prisma.sMSMessage.create({
          data: {
            toNumber: recipient.phone,
            fromNumber: '+15551234567',
            body: body.body,
            status: 'sent' as PrismaMessageStatus,
            direction: 'outbound' as PrismaMessageDirection,
            provider: 'mock',
            providerMessageId: smsResult.messageId,
            segments: smsResult.segments,
            sentAt: now,
            cost: smsResult.segments * 0.0075,
          },
        });
      }
    }

    return reply.status(201).send({
      success: true,
      data: {
        ...message,
        attachments,
      },
    });
  });

  // Send standalone SMS
  app.post('/sms/send', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = sendSMSSchema.parse(request.body);
    const now = new Date();

    const smsResult = await mockSMSProvider.send(body.to, body.body, body.from);

    const sms = await prisma.sMSMessage.create({
      data: {
        toNumber: body.to,
        fromNumber: body.from || '+15551234567',
        body: body.body,
        status: 'sent' as PrismaMessageStatus,
        direction: 'outbound' as PrismaMessageDirection,
        provider: 'mock',
        providerMessageId: smsResult.messageId,
        segments: smsResult.segments,
        sentAt: now,
        cost: smsResult.segments * 0.0075,
      },
    });

    // If threadId provided, also add as message
    if (body.threadId) {
      const thread = await prisma.messageThread.findUnique({
        where: { id: body.threadId },
      });

      if (thread) {
        await prisma.message.create({
          data: {
            threadId: body.threadId,
            senderId: 'current-user',
            senderType: 'staff' as PrismaParticipantType,
            senderName: 'Property Manager',
            direction: 'outbound' as PrismaMessageDirection,
            channel: 'sms' as PrismaMessageChannel,
            body: body.body,
            attachments: [],
            status: 'sent' as PrismaMessageStatus,
            sentAt: now,
            metadata: { smsId: sms.id } as unknown as Prisma.JsonValue,
          },
        });

        await prisma.messageThread.update({
          where: { id: body.threadId },
          data: {
            lastMessageAt: now,
            messageCount: { increment: 1 },
          },
        });
      }
    }

    return reply.status(201).send({
      success: true,
      data: {
        ...sms,
        cost: sms.cost ? toNumber(sms.cost) : null,
      },
    });
  });

  // Get SMS messages
  app.get('/sms', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      direction?: MessageDirection;
      status?: MessageStatus;
      phone?: string;
    };

    const where: Prisma.SMSMessageWhereInput = {};
    if (query.direction) where.direction = query.direction as PrismaMessageDirection;
    if (query.status) where.status = query.status as PrismaMessageStatus;
    if (query.phone) {
      where.OR = [
        { toNumber: query.phone },
        { fromNumber: query.phone },
      ];
    }

    const results = await prisma.sMSMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const mapped = results.map((s) => ({
      ...s,
      to: s.toNumber,
      from: s.fromNumber,
      cost: s.cost ? toNumber(s.cost) : null,
    }));

    return reply.send({
      success: true,
      data: mapped,
      total: mapped.length,
    });
  });

  // Template routes
  app.get('/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { category?: TemplateCategory; channel?: MessageChannel };

    const where: Prisma.MessageTemplateWhereInput = {};
    if (query.category) where.category = query.category as PrismaTemplateCategory;
    if (query.channel) where.channel = query.channel as PrismaMessageChannel;

    const results = await prisma.messageTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      success: true,
      data: results,
    });
  });

  app.post('/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createTemplateSchema.parse(request.body);

    const variables = extractVariables(body.body + (body.subject || ''));

    const template = await prisma.messageTemplate.create({
      data: {
        name: body.name,
        category: body.category as PrismaTemplateCategory,
        channel: body.channel as PrismaMessageChannel,
        subject: body.subject,
        body: body.body,
        htmlBody: body.htmlBody,
        variables,
        isActive: true,
      },
    });

    return reply.status(201).send({
      success: true,
      data: template,
    });
  });

  app.get('/templates/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const template = await prisma.messageTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: 'Template not found',
      });
    }

    return reply.send({
      success: true,
      data: template,
    });
  });

  // Preview template with variables
  app.post('/templates/:id/preview', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { variables: Record<string, string> };

    const template = await prisma.messageTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return reply.status(404).send({
        success: false,
        error: 'Template not found',
      });
    }

    const previewBody = interpolateTemplate(template.body, body.variables || {});
    const previewSubject = template.subject
      ? interpolateTemplate(template.subject, body.variables || {})
      : null;

    return reply.send({
      success: true,
      data: {
        subject: previewSubject,
        body: previewBody,
        missingVariables: template.variables.filter((v) => !body.variables?.[v]),
      },
    });
  });

  // Broadcast routes
  app.post('/broadcasts', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createBroadcastSchema.parse(request.body);

    // Mock recipients based on filters
    const recipients: BroadcastRecipient[] = [
      { id: generateId(), type: 'tenant', name: 'John Doe', email: 'john@example.com', phone: '+15551234567', status: 'queued', sentAt: null, error: null },
      { id: generateId(), type: 'tenant', name: 'Jane Smith', email: 'jane@example.com', phone: '+15559876543', status: 'queued', sentAt: null, error: null },
      { id: generateId(), type: 'tenant', name: 'Bob Wilson', email: 'bob@example.com', phone: '+15555555555', status: 'queued', sentAt: null, error: null },
    ];

    const stats: BroadcastStats = {
      totalRecipients: recipients.length,
      sent: 0,
      delivered: 0,
      failed: 0,
      opened: 0,
      clicked: 0,
    };

    const broadcast = await prisma.broadcastMessage.create({
      data: {
        name: body.name,
        templateId: body.templateId,
        channel: body.channel as PrismaMessageChannel,
        subject: body.subject,
        body: body.body,
        recipients: recipients as unknown as Prisma.JsonValue,
        filters: (body.filters || {}) as unknown as Prisma.JsonValue,
        status: body.scheduledAt ? 'scheduled' : 'draft' as PrismaBroadcastStatus,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        stats: stats as unknown as Prisma.JsonValue,
        createdById: body.createdById,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...broadcast,
        recipients,
        filters: body.filters || {},
        stats,
      },
    });
  });

  app.get('/broadcasts', async (_request: FastifyRequest, reply: FastifyReply) => {
    const results = await prisma.broadcastMessage.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const mapped = results.map((b) => ({
      ...b,
      recipients: b.recipients as unknown as BroadcastRecipient[],
      filters: b.filters as unknown as BroadcastFilter,
      stats: b.stats as unknown as BroadcastStats,
    }));

    return reply.send({
      success: true,
      data: mapped,
    });
  });

  app.get('/broadcasts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const broadcast = await prisma.broadcastMessage.findUnique({
      where: { id },
    });

    if (!broadcast) {
      return reply.status(404).send({
        success: false,
        error: 'Broadcast not found',
      });
    }

    return reply.send({
      success: true,
      data: {
        ...broadcast,
        recipients: broadcast.recipients as unknown as BroadcastRecipient[],
        filters: broadcast.filters as unknown as BroadcastFilter,
        stats: broadcast.stats as unknown as BroadcastStats,
      },
    });
  });

  // Send broadcast
  app.post('/broadcasts/:id/send', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const broadcast = await prisma.broadcastMessage.findUnique({
      where: { id },
    });

    if (!broadcast) {
      return reply.status(404).send({
        success: false,
        error: 'Broadcast not found',
      });
    }

    if (broadcast.status !== 'draft' && broadcast.status !== 'scheduled') {
      return reply.status(400).send({
        success: false,
        error: 'Broadcast cannot be sent',
      });
    }

    const now = new Date();
    const recipients = (broadcast.recipients || []) as unknown as BroadcastRecipient[];
    const stats = (broadcast.stats || {}) as unknown as BroadcastStats;

    // Simulate sending to recipients
    for (const recipient of recipients) {
      try {
        if (broadcast.channel === 'sms' && recipient.phone) {
          await mockSMSProvider.send(recipient.phone, broadcast.body);
        }
        recipient.status = 'sent';
        recipient.sentAt = now;
        stats.sent++;
      } catch {
        recipient.status = 'failed';
        recipient.error = 'Send failed';
        stats.failed++;
      }
    }

    const updated = await prisma.broadcastMessage.update({
      where: { id },
      data: {
        status: 'sent' as PrismaBroadcastStatus,
        sentAt: now,
        recipients: recipients as unknown as Prisma.JsonValue,
        stats: stats as unknown as Prisma.JsonValue,
      },
    });

    return reply.send({
      success: true,
      data: {
        ...updated,
        recipients,
        filters: updated.filters as BroadcastFilter,
        stats,
      },
    });
  });

  // Mark messages as read
  app.post('/threads/:id/read', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const thread = await prisma.messageThread.findUnique({
      where: { id },
    });

    if (!thread) {
      return reply.status(404).send({
        success: false,
        error: 'Thread not found',
      });
    }

    const now = new Date();

    await prisma.message.updateMany({
      where: {
        threadId: id,
        readAt: null,
      },
      data: {
        readAt: now,
        status: 'read',
      },
    });

    await prisma.messageThread.update({
      where: { id },
      data: {
        unreadCount: 0,
      },
    });

    return reply.send({
      success: true,
      message: 'Messages marked as read',
    });
  });
}
