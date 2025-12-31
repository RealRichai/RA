import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Types
export type MessageChannel = 'email' | 'sms' | 'in_app' | 'portal';
export type MessageStatus = 'draft' | 'queued' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'read';
export type MessageDirection = 'inbound' | 'outbound';
export type ParticipantType = 'tenant' | 'owner' | 'vendor' | 'prospect' | 'staff';
export type ThreadStatus = 'open' | 'pending' | 'resolved' | 'archived';
export type TemplateCategory = 'lease' | 'maintenance' | 'payment' | 'notice' | 'marketing' | 'general';

export interface MessageThread {
  id: string;
  propertyId: string | null;
  unitId: string | null;
  subject: string;
  participants: ThreadParticipant[];
  status: ThreadStatus;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  labels: string[];
  assignedTo: string | null;
  lastMessageAt: Date;
  messageCount: number;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ThreadParticipant {
  id: string;
  type: ParticipantType;
  name: string;
  email: string | null;
  phone: string | null;
  userId: string | null;
}

export interface Message {
  id: string;
  threadId: string;
  senderId: string;
  senderType: ParticipantType;
  senderName: string;
  direction: MessageDirection;
  channel: MessageChannel;
  subject: string | null;
  body: string;
  htmlBody: string | null;
  attachments: Attachment[];
  status: MessageStatus;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failureReason: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
}

export interface SMSMessage {
  id: string;
  to: string;
  from: string;
  body: string;
  status: MessageStatus;
  direction: MessageDirection;
  provider: 'twilio' | 'mock';
  providerMessageId: string | null;
  segments: number;
  sentAt: Date | null;
  deliveredAt: Date | null;
  failureReason: string | null;
  cost: number | null;
  createdAt: Date;
}

export interface MessageTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  channel: MessageChannel;
  subject: string | null;
  body: string;
  htmlBody: string | null;
  variables: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface BroadcastMessage {
  id: string;
  name: string;
  templateId: string | null;
  channel: MessageChannel;
  subject: string | null;
  body: string;
  recipients: BroadcastRecipient[];
  filters: BroadcastFilter;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';
  scheduledAt: Date | null;
  sentAt: Date | null;
  stats: BroadcastStats;
  createdById: string;
  createdAt: Date;
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

// In-memory stores
const threads = new Map<string, MessageThread>();
const messages = new Map<string, Message>();
const smsMessages = new Map<string, SMSMessage>();
const templates = new Map<string, MessageTemplate>();
const broadcasts = new Map<string, BroadcastMessage>();

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

function extractVariables(template: string): string[] {
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

function interpolateTemplate(template: string, variables: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

function truncatePreview(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// Initialize default templates
function initializeDefaultTemplates(): void {
  const defaultTemplates: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
    {
      name: 'Rent Reminder',
      category: 'payment',
      channel: 'email',
      subject: 'Rent Reminder - Payment Due {{due_date}}',
      body: 'Dear {{tenant_name}},\n\nThis is a friendly reminder that your rent payment of {{amount}} is due on {{due_date}}.\n\nPlease log in to your portal to make a payment.\n\nThank you,\n{{property_name}}',
      htmlBody: null,
      variables: ['tenant_name', 'amount', 'due_date', 'property_name'],
      isActive: true,
    },
    {
      name: 'Rent Reminder SMS',
      category: 'payment',
      channel: 'sms',
      subject: null,
      body: 'Hi {{tenant_name}}, your rent of {{amount}} is due on {{due_date}}. Pay online at {{portal_url}}',
      htmlBody: null,
      variables: ['tenant_name', 'amount', 'due_date', 'portal_url'],
      isActive: true,
    },
    {
      name: 'Maintenance Scheduled',
      category: 'maintenance',
      channel: 'email',
      subject: 'Maintenance Visit Scheduled - {{date}}',
      body: 'Dear {{tenant_name}},\n\nA maintenance visit has been scheduled for {{date}} between {{time_window}}.\n\nWork to be performed: {{description}}\n\nPlease ensure access to the unit.\n\nThank you,\n{{property_name}}',
      htmlBody: null,
      variables: ['tenant_name', 'date', 'time_window', 'description', 'property_name'],
      isActive: true,
    },
    {
      name: 'Lease Expiration Notice',
      category: 'lease',
      channel: 'email',
      subject: 'Your Lease is Expiring on {{expiration_date}}',
      body: 'Dear {{tenant_name}},\n\nYour lease at {{property_address}} will expire on {{expiration_date}}.\n\nPlease contact us to discuss renewal options.\n\nThank you,\n{{property_name}}',
      htmlBody: null,
      variables: ['tenant_name', 'property_address', 'expiration_date', 'property_name'],
      isActive: true,
    },
    {
      name: 'Payment Confirmation',
      category: 'payment',
      channel: 'email',
      subject: 'Payment Received - Thank You',
      body: 'Dear {{tenant_name}},\n\nWe have received your payment of {{amount}} on {{payment_date}}.\n\nTransaction ID: {{transaction_id}}\n\nThank you,\n{{property_name}}',
      htmlBody: null,
      variables: ['tenant_name', 'amount', 'payment_date', 'transaction_id', 'property_name'],
      isActive: true,
    },
  ];

  const now = new Date();
  for (const template of defaultTemplates) {
    const t: MessageTemplate = {
      id: generateId(),
      ...template,
      createdAt: now,
      updatedAt: now,
    };
    templates.set(t.id, t);
  }
}

initializeDefaultTemplates();

// Route handlers
export async function communicationRoutes(app: FastifyInstance): Promise<void> {
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

    // Combine threads and SMS into unified inbox
    const inboxItems: UnifiedInboxItem[] = [];

    // Add thread items
    for (const thread of threads.values()) {
      if (query.propertyId && thread.propertyId !== query.propertyId) continue;
      if (query.status && thread.status !== query.status) continue;
      if (query.unreadOnly === 'true' && thread.unreadCount === 0) continue;

      const threadMessages = Array.from(messages.values())
        .filter((m) => m.threadId === thread.id)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      const lastMessage = threadMessages[0];
      if (!lastMessage) continue;

      if (query.channel && lastMessage.channel !== query.channel) continue;

      inboxItems.push({
        id: thread.id,
        type: 'thread',
        threadId: thread.id,
        smsId: null,
        channel: lastMessage.channel,
        direction: lastMessage.direction,
        from: {
          name: lastMessage.senderName,
          email: thread.participants.find((p) => p.name === lastMessage.senderName)?.email || null,
          phone: thread.participants.find((p) => p.name === lastMessage.senderName)?.phone || null,
        },
        subject: thread.subject,
        preview: truncatePreview(lastMessage.body),
        status: lastMessage.status,
        isRead: thread.unreadCount === 0,
        timestamp: lastMessage.createdAt,
        propertyId: thread.propertyId,
        propertyName: thread.propertyId ? `Property ${thread.propertyId.substring(0, 8)}` : null,
      });
    }

    // Add standalone SMS items
    for (const sms of smsMessages.values()) {
      if (query.channel && query.channel !== 'sms') continue;

      // Check if SMS is part of a thread
      const isInThread = Array.from(messages.values()).some(
        (m) => m.channel === 'sms' && m.body === sms.body
      );
      if (isInThread) continue;

      inboxItems.push({
        id: sms.id,
        type: 'sms',
        threadId: null,
        smsId: sms.id,
        channel: 'sms',
        direction: sms.direction,
        from: {
          name: sms.direction === 'inbound' ? sms.from : 'System',
          email: null,
          phone: sms.direction === 'inbound' ? sms.from : sms.to,
        },
        subject: null,
        preview: truncatePreview(sms.body),
        status: sms.status,
        isRead: sms.status === 'read',
        timestamp: sms.createdAt,
        propertyId: null,
        propertyName: null,
      });
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

    const thread: MessageThread = {
      id: generateId(),
      propertyId: body.propertyId || null,
      unitId: body.unitId || null,
      subject: body.subject,
      participants,
      status: 'open',
      priority: body.priority,
      labels: body.labels || [],
      assignedTo: null,
      lastMessageAt: now,
      messageCount: 0,
      unreadCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    threads.set(thread.id, thread);

    return reply.status(201).send({
      success: true,
      data: thread,
    });
  });

  // Get thread by ID
  app.get('/threads/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const thread = threads.get(id);

    if (!thread) {
      return reply.status(404).send({
        success: false,
        error: 'Thread not found',
      });
    }

    const threadMessages = Array.from(messages.values())
      .filter((m) => m.threadId === id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return reply.send({
      success: true,
      data: {
        ...thread,
        messages: threadMessages,
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

    let results = Array.from(threads.values());

    if (query.propertyId) {
      results = results.filter((t) => t.propertyId === query.propertyId);
    }
    if (query.status) {
      results = results.filter((t) => t.status === query.status);
    }
    if (query.assignedTo) {
      results = results.filter((t) => t.assignedTo === query.assignedTo);
    }
    if (query.priority) {
      results = results.filter((t) => t.priority === query.priority);
    }

    results.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());

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
    const thread = threads.get(id);

    if (!thread) {
      return reply.status(404).send({
        success: false,
        error: 'Thread not found',
      });
    }

    if (body.status) thread.status = body.status;
    if (body.assignedTo !== undefined) thread.assignedTo = body.assignedTo;
    if (body.priority) thread.priority = body.priority as MessageThread['priority'];
    if (body.labels) thread.labels = body.labels;
    thread.updatedAt = new Date();

    threads.set(id, thread);

    return reply.send({
      success: true,
      data: thread,
    });
  });

  // Send message in thread
  app.post('/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = sendMessageSchema.parse(request.body);
    const thread = threads.get(body.threadId);

    if (!thread) {
      return reply.status(404).send({
        success: false,
        error: 'Thread not found',
      });
    }

    const now = new Date();

    const message: Message = {
      id: generateId(),
      threadId: body.threadId,
      senderId: 'current-user',
      senderType: 'staff',
      senderName: 'Property Manager',
      direction: 'outbound',
      channel: body.channel,
      subject: thread.subject,
      body: body.body,
      htmlBody: body.htmlBody || null,
      attachments: (body.attachments || []).map((a) => ({
        id: generateId(),
        ...a,
      })),
      status: 'sent',
      sentAt: now,
      deliveredAt: null,
      readAt: null,
      failureReason: null,
      metadata: {},
      createdAt: now,
    };

    messages.set(message.id, message);

    // Update thread
    thread.lastMessageAt = now;
    thread.messageCount += 1;
    thread.updatedAt = now;
    threads.set(body.threadId, thread);

    // If SMS, also create SMS record
    if (body.channel === 'sms') {
      const recipient = thread.participants.find((p) => p.phone);
      if (recipient?.phone) {
        const smsResult = await mockSMSProvider.send(recipient.phone, body.body);
        const sms: SMSMessage = {
          id: generateId(),
          to: recipient.phone,
          from: '+15551234567',
          body: body.body,
          status: 'sent',
          direction: 'outbound',
          provider: 'mock',
          providerMessageId: smsResult.messageId,
          segments: smsResult.segments,
          sentAt: now,
          deliveredAt: null,
          failureReason: null,
          cost: smsResult.segments * 0.0075,
          createdAt: now,
        };
        smsMessages.set(sms.id, sms);
      }
    }

    return reply.status(201).send({
      success: true,
      data: message,
    });
  });

  // Send standalone SMS
  app.post('/sms/send', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = sendSMSSchema.parse(request.body);
    const now = new Date();

    const smsResult = await mockSMSProvider.send(body.to, body.body, body.from);

    const sms: SMSMessage = {
      id: generateId(),
      to: body.to,
      from: body.from || '+15551234567',
      body: body.body,
      status: 'sent',
      direction: 'outbound',
      provider: 'mock',
      providerMessageId: smsResult.messageId,
      segments: smsResult.segments,
      sentAt: now,
      deliveredAt: null,
      failureReason: null,
      cost: smsResult.segments * 0.0075,
      createdAt: now,
    };

    smsMessages.set(sms.id, sms);

    // If threadId provided, also add as message
    if (body.threadId) {
      const thread = threads.get(body.threadId);
      if (thread) {
        const message: Message = {
          id: generateId(),
          threadId: body.threadId,
          senderId: 'current-user',
          senderType: 'staff',
          senderName: 'Property Manager',
          direction: 'outbound',
          channel: 'sms',
          subject: null,
          body: body.body,
          htmlBody: null,
          attachments: [],
          status: 'sent',
          sentAt: now,
          deliveredAt: null,
          readAt: null,
          failureReason: null,
          metadata: { smsId: sms.id },
          createdAt: now,
        };
        messages.set(message.id, message);

        thread.lastMessageAt = now;
        thread.messageCount += 1;
        threads.set(body.threadId, thread);
      }
    }

    return reply.status(201).send({
      success: true,
      data: sms,
    });
  });

  // Get SMS messages
  app.get('/sms', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      direction?: MessageDirection;
      status?: MessageStatus;
      phone?: string;
    };

    let results = Array.from(smsMessages.values());

    if (query.direction) {
      results = results.filter((s) => s.direction === query.direction);
    }
    if (query.status) {
      results = results.filter((s) => s.status === query.status);
    }
    if (query.phone) {
      results = results.filter((s) => s.to === query.phone || s.from === query.phone);
    }

    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return reply.send({
      success: true,
      data: results,
      total: results.length,
    });
  });

  // Template routes
  app.get('/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { category?: TemplateCategory; channel?: MessageChannel };

    let results = Array.from(templates.values());

    if (query.category) {
      results = results.filter((t) => t.category === query.category);
    }
    if (query.channel) {
      results = results.filter((t) => t.channel === query.channel);
    }

    return reply.send({
      success: true,
      data: results,
    });
  });

  app.post('/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createTemplateSchema.parse(request.body);
    const now = new Date();

    const template: MessageTemplate = {
      id: generateId(),
      name: body.name,
      category: body.category,
      channel: body.channel,
      subject: body.subject || null,
      body: body.body,
      htmlBody: body.htmlBody || null,
      variables: extractVariables(body.body + (body.subject || '')),
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    templates.set(template.id, template);

    return reply.status(201).send({
      success: true,
      data: template,
    });
  });

  app.get('/templates/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const template = templates.get(id);

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
    const template = templates.get(id);

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
    const now = new Date();

    // Mock recipients based on filters
    const recipients: BroadcastRecipient[] = [
      { id: generateId(), type: 'tenant', name: 'John Doe', email: 'john@example.com', phone: '+15551234567', status: 'queued', sentAt: null, error: null },
      { id: generateId(), type: 'tenant', name: 'Jane Smith', email: 'jane@example.com', phone: '+15559876543', status: 'queued', sentAt: null, error: null },
      { id: generateId(), type: 'tenant', name: 'Bob Wilson', email: 'bob@example.com', phone: '+15555555555', status: 'queued', sentAt: null, error: null },
    ];

    const broadcast: BroadcastMessage = {
      id: generateId(),
      name: body.name,
      templateId: body.templateId || null,
      channel: body.channel,
      subject: body.subject || null,
      body: body.body,
      recipients,
      filters: body.filters || {},
      status: body.scheduledAt ? 'scheduled' : 'draft',
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      sentAt: null,
      stats: {
        totalRecipients: recipients.length,
        sent: 0,
        delivered: 0,
        failed: 0,
        opened: 0,
        clicked: 0,
      },
      createdById: body.createdById,
      createdAt: now,
    };

    broadcasts.set(broadcast.id, broadcast);

    return reply.status(201).send({
      success: true,
      data: broadcast,
    });
  });

  app.get('/broadcasts', async (_request: FastifyRequest, reply: FastifyReply) => {
    const results = Array.from(broadcasts.values());
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return reply.send({
      success: true,
      data: results,
    });
  });

  app.get('/broadcasts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const broadcast = broadcasts.get(id);

    if (!broadcast) {
      return reply.status(404).send({
        success: false,
        error: 'Broadcast not found',
      });
    }

    return reply.send({
      success: true,
      data: broadcast,
    });
  });

  // Send broadcast
  app.post('/broadcasts/:id/send', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const broadcast = broadcasts.get(id);

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
    broadcast.status = 'sending';

    // Simulate sending to recipients
    for (const recipient of broadcast.recipients) {
      try {
        if (broadcast.channel === 'sms' && recipient.phone) {
          await mockSMSProvider.send(recipient.phone, broadcast.body);
        }
        recipient.status = 'sent';
        recipient.sentAt = now;
        broadcast.stats.sent++;
      } catch {
        recipient.status = 'failed';
        recipient.error = 'Send failed';
        broadcast.stats.failed++;
      }
    }

    broadcast.status = 'sent';
    broadcast.sentAt = now;
    broadcasts.set(id, broadcast);

    return reply.send({
      success: true,
      data: broadcast,
    });
  });

  // Mark messages as read
  app.post('/threads/:id/read', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const thread = threads.get(id);

    if (!thread) {
      return reply.status(404).send({
        success: false,
        error: 'Thread not found',
      });
    }

    const now = new Date();
    const threadMessages = Array.from(messages.values()).filter((m) => m.threadId === id);

    for (const message of threadMessages) {
      if (!message.readAt) {
        message.readAt = now;
        message.status = 'read';
        messages.set(message.id, message);
      }
    }

    thread.unreadCount = 0;
    thread.updatedAt = now;
    threads.set(id, thread);

    return reply.send({
      success: true,
      message: 'Messages marked as read',
    });
  });
}

// Export for testing
export {
  threads,
  messages,
  smsMessages,
  templates,
  broadcasts,
  extractVariables,
  interpolateTemplate,
  truncatePreview,
};
