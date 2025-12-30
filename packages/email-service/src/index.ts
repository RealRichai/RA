/**
 * Email Service Package
 *
 * Production email delivery with provider adapters, templates, and queue-based sending.
 *
 * @example
 * ```typescript
 * import { EmailService, createSESProvider } from '@realriches/email-service';
 * import Redis from 'ioredis';
 *
 * const redis = new Redis(process.env.REDIS_URL);
 * const provider = createSESProvider({
 *   region: 'us-east-1',
 *   from: { email: 'noreply@realriches.com', name: 'RealRiches' },
 * });
 *
 * const emailService = new EmailService({
 *   connection: redis,
 *   provider,
 * });
 *
 * // Send via queue (recommended)
 * const messageId = await emailService.send({
 *   templateId: 'auth:password-reset',
 *   to: 'user@example.com',
 *   data: { resetUrl: 'https://...', userName: 'John' },
 * });
 *
 * // Send immediately (for critical emails)
 * const result = await emailService.sendImmediate({
 *   templateId: 'auth:email-verification',
 *   to: 'user@example.com',
 *   data: { verificationUrl: 'https://...', userName: 'John' },
 * });
 * ```
 */

// Types
export * from './types';

// Providers
export {
  type IEmailProvider,
  BaseEmailProvider,
  EmailProviderError,
  RateLimitError,
  AuthenticationError,
  InvalidRecipientError,
  SESEmailProvider,
  createSESProvider,
  ConsoleEmailProvider,
  createProvider,
  createProviderFromEnv,
} from './providers';

// Templates
export {
  registerTemplate,
  getTemplate,
  renderTemplate,
  getTemplateIds,
  registerAllTemplates,
  TemplateNotFoundError,
  MissingFieldsError,
  // Template helpers
  wrapInLayout,
  createButton,
  createParagraph,
  createHeading,
  createMutedText,
  createDivider,
  escapeHtml,
} from './templates';

// Queue
export {
  EmailQueue,
  EmailWorker,
  type EmailWorkerOptions,
  DLQHandler,
  type DLQHandlerOptions,
  type DLQRecord,
  createDLQHandler,
} from './queue';

// Service
export {
  EmailService,
  type EmailServiceConfig,
  createEmailService,
  type INotificationLogger,
  type NotificationRecord,
  InMemoryNotificationLogger,
  ConsoleNotificationLogger,
} from './service';
