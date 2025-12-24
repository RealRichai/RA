/**
 * SendGrid Integration
 * Email service for transactional and marketing emails
 */

import { logger, createModuleLogger } from '../lib/logger.js';
import { Result, ok, err } from '../lib/result.js';
import { AppError, ErrorCode } from '../lib/errors.js';
import { env } from '../config/env.js';

const log = createModuleLogger('sendgrid');

// =============================================================================
// TYPES
// =============================================================================

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface EmailAttachment {
  content: string; // Base64 encoded
  filename: string;
  type: string;
  disposition?: 'attachment' | 'inline';
  contentId?: string;
}

export interface SendEmailOptions {
  to: EmailRecipient | EmailRecipient[];
  from?: EmailRecipient;
  replyTo?: EmailRecipient;
  subject: string;
  text?: string;
  html?: string;
  templateId?: string;
  dynamicTemplateData?: Record<string, unknown>;
  attachments?: EmailAttachment[];
  categories?: string[];
  sendAt?: Date;
  batchId?: string;
}

export interface EmailResult {
  messageId: string;
  accepted: string[];
  rejected: string[];
}

// =============================================================================
// SENDGRID CLIENT
// =============================================================================

class SendGridClient {
  private apiKey: string;
  private baseUrl = 'https://api.sendgrid.com/v3';
  private defaultFrom: EmailRecipient;

  constructor() {
    this.apiKey = env.SENDGRID_API_KEY || '';
    this.defaultFrom = {
      email: env.SENDGRID_FROM_EMAIL || 'noreply@realriches.com',
      name: env.SENDGRID_FROM_NAME || 'RealRiches',
    };
  }

  private isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async sendEmail(options: SendEmailOptions): Promise<Result<EmailResult, AppError>> {
    if (!this.isConfigured()) {
      log.warn('SendGrid not configured, skipping email send');
      return ok({
        messageId: `mock-${Date.now()}`,
        accepted: Array.isArray(options.to)
          ? options.to.map(r => r.email)
          : [options.to.email],
        rejected: [],
      });
    }

    try {
      const recipients = Array.isArray(options.to) ? options.to : [options.to];

      const payload: Record<string, unknown> = {
        personalizations: [{
          to: recipients.map(r => ({ email: r.email, name: r.name })),
          dynamic_template_data: options.dynamicTemplateData,
        }],
        from: options.from || this.defaultFrom,
        subject: options.subject,
        categories: options.categories,
      };

      if (options.replyTo) {
        payload.reply_to = options.replyTo;
      }

      if (options.templateId) {
        payload.template_id = options.templateId;
      } else {
        payload.content = [];
        if (options.text) {
          (payload.content as Array<Record<string, string>>).push({ type: 'text/plain', value: options.text });
        }
        if (options.html) {
          (payload.content as Array<Record<string, string>>).push({ type: 'text/html', value: options.html });
        }
      }

      if (options.attachments?.length) {
        payload.attachments = options.attachments.map(a => ({
          content: a.content,
          filename: a.filename,
          type: a.type,
          disposition: a.disposition || 'attachment',
          content_id: a.contentId,
        }));
      }

      if (options.sendAt) {
        payload.send_at = Math.floor(options.sendAt.getTime() / 1000);
      }

      if (options.batchId) {
        payload.batch_id = options.batchId;
      }

      const response = await fetch(`${this.baseUrl}/mail/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        log.error({ status: response.status, body: errorBody }, 'SendGrid API error');
        return err(new AppError({
          code: ErrorCode.EXTERNAL_SERVICE_ERROR,
          message: `SendGrid API error: ${response.status}`,
        }));
      }

      const messageId = response.headers.get('x-message-id') || `sg-${Date.now()}`;

      log.info({
        messageId,
        recipients: recipients.map(r => r.email),
        subject: options.subject,
        templateId: options.templateId,
      }, 'Email sent successfully');

      return ok({
        messageId,
        accepted: recipients.map(r => r.email),
        rejected: [],
      });
    } catch (error) {
      log.error({ error }, 'Failed to send email');
      return err(new AppError({
        code: ErrorCode.EXTERNAL_SERVICE_ERROR,
        message: 'Failed to send email',
      }));
    }
  }

  async sendBatch(emails: SendEmailOptions[]): Promise<Result<EmailResult[], AppError>> {
    const results: EmailResult[] = [];
    const errors: AppError[] = [];

    for (const email of emails) {
      const result = await this.sendEmail(email);
      if (result.isOk()) {
        results.push(result.value);
      } else {
        errors.push(result.error);
      }
    }

    if (errors.length > 0 && results.length === 0) {
      return err(errors[0]);
    }

    return ok(results);
  }
}

// =============================================================================
// EXPORTED INSTANCE & HELPERS
// =============================================================================

export const sendgrid = new SendGridClient();

// Template IDs (configure in SendGrid dashboard)
export const EMAIL_TEMPLATES = {
  WELCOME: 'd-welcome-template-id',
  PASSWORD_RESET: 'd-password-reset-template-id',
  EMAIL_VERIFICATION: 'd-email-verification-template-id',
  LEASE_EXPIRING: 'd-lease-expiring-template-id',
  PAYMENT_DUE: 'd-payment-due-template-id',
  PAYMENT_RECEIVED: 'd-payment-received-template-id',
  APPLICATION_RECEIVED: 'd-application-received-template-id',
  APPLICATION_STATUS: 'd-application-status-template-id',
  TOUR_CONFIRMATION: 'd-tour-confirmation-template-id',
  TOUR_REMINDER: 'd-tour-reminder-template-id',
  NEW_MESSAGE: 'd-new-message-template-id',
} as const;

// Helper functions for common emails
export async function sendWelcomeEmail(
  email: string,
  name: string
): Promise<Result<EmailResult, AppError>> {
  return sendgrid.sendEmail({
    to: { email, name },
    subject: 'Welcome to RealRiches!',
    templateId: EMAIL_TEMPLATES.WELCOME,
    dynamicTemplateData: { name },
    categories: ['welcome', 'transactional'],
  });
}

export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string
): Promise<Result<EmailResult, AppError>> {
  return sendgrid.sendEmail({
    to: { email },
    subject: 'Reset Your Password',
    templateId: EMAIL_TEMPLATES.PASSWORD_RESET,
    dynamicTemplateData: { resetUrl },
    categories: ['password-reset', 'transactional'],
  });
}

export async function sendEmailVerification(
  email: string,
  name: string,
  verificationUrl: string
): Promise<Result<EmailResult, AppError>> {
  return sendgrid.sendEmail({
    to: { email, name },
    subject: 'Verify Your Email',
    templateId: EMAIL_TEMPLATES.EMAIL_VERIFICATION,
    dynamicTemplateData: { name, verificationUrl },
    categories: ['email-verification', 'transactional'],
  });
}

export async function sendLeaseExpiringEmail(
  email: string,
  name: string,
  address: string,
  daysLeft: number,
  renewalUrl: string
): Promise<Result<EmailResult, AppError>> {
  return sendgrid.sendEmail({
    to: { email, name },
    subject: `Your Lease at ${address} Expires in ${daysLeft} Days`,
    templateId: EMAIL_TEMPLATES.LEASE_EXPIRING,
    dynamicTemplateData: { name, address, daysLeft, renewalUrl },
    categories: ['lease-expiring', 'transactional'],
  });
}

export async function sendPaymentDueEmail(
  email: string,
  name: string,
  amount: number,
  dueDate: string,
  paymentUrl: string
): Promise<Result<EmailResult, AppError>> {
  return sendgrid.sendEmail({
    to: { email, name },
    subject: `Payment of $${amount.toLocaleString()} Due on ${dueDate}`,
    templateId: EMAIL_TEMPLATES.PAYMENT_DUE,
    dynamicTemplateData: { name, amount, dueDate, paymentUrl },
    categories: ['payment-due', 'transactional'],
  });
}

export async function sendTourConfirmationEmail(
  email: string,
  name: string,
  address: string,
  scheduledDate: string,
  scheduledTime: string
): Promise<Result<EmailResult, AppError>> {
  return sendgrid.sendEmail({
    to: { email, name },
    subject: `Tour Confirmed at ${address}`,
    templateId: EMAIL_TEMPLATES.TOUR_CONFIRMATION,
    dynamicTemplateData: { name, address, scheduledDate, scheduledTime },
    categories: ['tour-confirmation', 'transactional'],
  });
}
