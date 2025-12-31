/**
 * Email Service Types
 *
 * Zod schemas and TypeScript types for the email delivery system.
 */

import { z } from 'zod';

// Email Provider Types
export const EmailProviderSchema = z.enum(['ses', 'postmark', 'sendgrid', 'console']);
export type EmailProvider = z.infer<typeof EmailProviderSchema>;

// Email Priority
export const EmailPrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);
export type EmailPriority = z.infer<typeof EmailPrioritySchema>;

// Email Status
export const EmailStatusSchema = z.enum([
  'pending',
  'queued',
  'sending',
  'sent',
  'delivered',
  'bounced',
  'failed',
  'complaint',
]);
export type EmailStatus = z.infer<typeof EmailStatusSchema>;

// Email Address
export const EmailAddressSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});
export type EmailAddress = z.infer<typeof EmailAddressSchema>;

// Email Message
export const EmailMessageSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  to: z.array(EmailAddressSchema),
  cc: z.array(EmailAddressSchema).optional(),
  bcc: z.array(EmailAddressSchema).optional(),
  from: EmailAddressSchema.optional(),
  replyTo: EmailAddressSchema.optional(),
  subject: z.string(),
  html: z.string(),
  text: z.string().optional(),
  priority: EmailPrioritySchema.default('normal'),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  // Audit context
  userId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
});
export type EmailMessage = z.infer<typeof EmailMessageSchema>;

// Send Result
export const SendResultSchema = z.object({
  success: z.boolean(),
  messageId: z.string().optional(),
  providerMessageId: z.string().optional(),
  error: z.string().optional(),
  errorCode: z.string().optional(),
  sentAt: z.date().optional(),
});
export type SendResult = z.infer<typeof SendResultSchema>;

// Email Job Data (for BullMQ)
export const EmailJobDataSchema = z.object({
  messageId: z.string(),
  templateId: z.string(),
  to: z.array(EmailAddressSchema),
  cc: z.array(EmailAddressSchema).optional(),
  bcc: z.array(EmailAddressSchema).optional(),
  templateData: z.record(z.unknown()),
  priority: EmailPrioritySchema.default('normal'),
  scheduledAt: z.date().optional(),
  // Audit context
  userId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  // Retry tracking
  attempt: z.number().default(0),
  maxAttempts: z.number().default(3),
  // Idempotency
  idempotencyKey: z.string(),
});
export type EmailJobData = z.infer<typeof EmailJobDataSchema>;

// Email Job Result
export const EmailJobResultSchema = z.object({
  success: z.boolean(),
  messageId: z.string(),
  providerMessageId: z.string().optional(),
  sentAt: z.date().optional(),
  error: z.string().optional(),
  errorCode: z.string().optional(),
});
export type EmailJobResult = z.infer<typeof EmailJobResultSchema>;

// Send Email Options (public API)
export interface SendEmailOptions {
  templateId: string;
  to: string | EmailAddress | EmailAddress[];
  cc?: string | EmailAddress | EmailAddress[];
  bcc?: string | EmailAddress | EmailAddress[];
  data: Record<string, unknown>;
  priority?: EmailPriority;
  scheduledAt?: Date;
  // Audit context
  userId?: string;
  organizationId?: string;
  entityType?: string;
  entityId?: string;
  // Options
  idempotencyKey?: string;
  skipQueue?: boolean;
}

// Provider Config
export interface EmailProviderConfig {
  // AWS SES
  sesRegion?: string;
  sesAccessKeyId?: string;
  sesSecretAccessKey?: string;
  sesConfigurationSet?: string;
  // Common
  fromEmail: string;
  fromName: string;
  replyToEmail?: string;
  sandbox?: boolean;
  timeout?: number;
}

// Template Types
export interface EmailTemplate<TData = Record<string, unknown>> {
  id: string;
  name: string;
  description?: string;
  subject: string | ((data: TData) => string);
  html: (data: TData) => string;
  text?: (data: TData) => string;
  defaultPriority: EmailPriority;
  requiredFields: (keyof TData)[];
}

export interface TemplateRenderResult {
  subject: string;
  html: string;
  text: string;
}

// Queue Config
export interface EmailQueueConfig {
  queueName?: string;
  concurrency?: number;
  maxRetries?: number;
  retryDelay?: number;
  removeOnComplete?: number;
  removeOnFail?: number;
}

export const DEFAULT_QUEUE_CONFIG: Required<EmailQueueConfig> = {
  queueName: 'email-send',
  concurrency: 5,
  maxRetries: 3,
  retryDelay: 1000,
  removeOnComplete: 100,
  removeOnFail: 500,
};
