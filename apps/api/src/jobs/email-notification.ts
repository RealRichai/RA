/**
 * Email Notification Job
 *
 * Processes in-app notifications and sends corresponding emails.
 * Runs frequently to ensure timely email delivery.
 */

import { prisma } from '@realriches/database';
import {
  EmailService,
  createProviderFromEnv,
  registerAllTemplates,
} from '@realriches/email-service';
import { logger } from '@realriches/utils';
import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';

import type { JobDefinition } from './scheduler';

// =============================================================================
// Types
// =============================================================================

interface NotificationEmailMapping {
  templateId: string;
  priority: 'critical' | 'high' | 'normal' | 'low';
  mapData: (notification: NotificationWithUser) => Record<string, unknown>;
}

interface NotificationWithUser {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  user: {
    email: string;
    firstName: string;
    lastName: string;
  };
}

// =============================================================================
// Notification to Email Mappings
// =============================================================================

const NOTIFICATION_EMAIL_MAPPINGS: Record<string, NotificationEmailMapping> = {
  // Payment reminders
  'payment_reminder_7d': {
    templateId: 'payment.reminder',
    priority: 'normal',
    mapData: (n) => ({
      tenantFirstName: n.user.firstName,
      propertyAddress: (n.data?.propertyAddress as string) || 'Your property',
      amount: formatCurrency(n.data?.amount as number),
      dueDate: formatDate(n.data?.dueDate as string),
      daysUntilDue: n.data?.daysUntilDue || 7,
      autoPayEnabled: n.data?.autoPayEnabled || false,
      paymentUrl: 'https://app.realriches.com/payments',
      supportEmail: 'support@realriches.com',
    }),
  },
  'payment_reminder_3d': {
    templateId: 'payment.reminder',
    priority: 'high',
    mapData: (n) => ({
      tenantFirstName: n.user.firstName,
      propertyAddress: (n.data?.propertyAddress as string) || 'Your property',
      amount: formatCurrency(n.data?.amount as number),
      dueDate: formatDate(n.data?.dueDate as string),
      daysUntilDue: n.data?.daysUntilDue || 3,
      autoPayEnabled: n.data?.autoPayEnabled || false,
      paymentUrl: 'https://app.realriches.com/payments',
      supportEmail: 'support@realriches.com',
    }),
  },
  'payment_reminder_1d': {
    templateId: 'payment.reminder',
    priority: 'high',
    mapData: (n) => ({
      tenantFirstName: n.user.firstName,
      propertyAddress: (n.data?.propertyAddress as string) || 'Your property',
      amount: formatCurrency(n.data?.amount as number),
      dueDate: formatDate(n.data?.dueDate as string),
      daysUntilDue: n.data?.daysUntilDue || 1,
      autoPayEnabled: n.data?.autoPayEnabled || false,
      paymentUrl: 'https://app.realriches.com/payments',
      supportEmail: 'support@realriches.com',
    }),
  },
  'payment_late_notice': {
    templateId: 'payment.late',
    priority: 'critical',
    mapData: (n) => ({
      tenantFirstName: n.user.firstName,
      propertyAddress: (n.data?.propertyAddress as string) || 'Your property',
      amountDue: formatCurrency(n.data?.amountDue as number),
      dueDate: formatDate(n.data?.dueDate as string),
      daysOverdue: n.data?.daysOverdue || 1,
      lateFeeAmount: n.data?.lateFeeAmount ? formatCurrency(n.data.lateFeeAmount as number) : undefined,
      lateFeeApplied: (n.data?.lateFeeApplied as boolean) || false,
      gracePeriodDays: n.data?.gracePeriodDays as number,
      paymentUrl: 'https://app.realriches.com/payments',
      supportEmail: 'support@realriches.com',
    }),
  },
  'payment_late_fee': {
    templateId: 'payment.late',
    priority: 'high',
    mapData: (n) => ({
      tenantFirstName: n.user.firstName,
      propertyAddress: (n.data?.propertyAddress as string) || 'Your property',
      amountDue: formatCurrency(n.data?.newAmountDue as number),
      dueDate: formatDate(n.data?.dueDate as string),
      daysOverdue: n.data?.daysOverdue || 1,
      lateFeeAmount: formatCurrency(n.data?.lateFeeAmount as number),
      lateFeeApplied: true,
      paymentUrl: 'https://app.realriches.com/payments',
      supportEmail: 'support@realriches.com',
    }),
  },

  // Policy notifications
  'policy_reminder_30d': {
    templateId: 'policy.expiring',
    priority: 'normal',
    mapData: (n) => ({
      tenantFirstName: n.user.firstName,
      propertyAddress: (n.data?.propertyAddress as string) || 'Your property',
      policyType: formatPolicyType(n.data?.policyType as string),
      provider: (n.data?.provider as string) || 'Your provider',
      expirationDate: formatDate(n.data?.expirationDate as string),
      daysRemaining: n.data?.daysRemaining || 30,
      premium: formatCurrency(n.data?.premium as number),
      autoRenew: (n.data?.autoRenew as boolean) || false,
      renewalUrl: 'https://app.realriches.com/policies',
      supportEmail: 'support@realriches.com',
    }),
  },
  'policy_reminder_7d': {
    templateId: 'policy.expiring',
    priority: 'high',
    mapData: (n) => ({
      tenantFirstName: n.user.firstName,
      propertyAddress: (n.data?.propertyAddress as string) || 'Your property',
      policyType: formatPolicyType(n.data?.policyType as string),
      provider: (n.data?.provider as string) || 'Your provider',
      expirationDate: formatDate(n.data?.expirationDate as string),
      daysRemaining: n.data?.daysRemaining || 7,
      premium: formatCurrency(n.data?.premium as number),
      autoRenew: (n.data?.autoRenew as boolean) || false,
      renewalUrl: 'https://app.realriches.com/policies',
      supportEmail: 'support@realriches.com',
    }),
  },
  'policy_reminder_1d': {
    templateId: 'policy.expiring',
    priority: 'critical',
    mapData: (n) => ({
      tenantFirstName: n.user.firstName,
      propertyAddress: (n.data?.propertyAddress as string) || 'Your property',
      policyType: formatPolicyType(n.data?.policyType as string),
      provider: (n.data?.provider as string) || 'Your provider',
      expirationDate: formatDate(n.data?.expirationDate as string),
      daysRemaining: n.data?.daysRemaining || 1,
      premium: formatCurrency(n.data?.premium as number),
      autoRenew: (n.data?.autoRenew as boolean) || false,
      renewalUrl: 'https://app.realriches.com/policies',
      supportEmail: 'support@realriches.com',
    }),
  },
  'policy_renewed': {
    templateId: 'policy.renewed',
    priority: 'normal',
    mapData: (n) => ({
      tenantFirstName: n.user.firstName,
      propertyAddress: (n.data?.propertyAddress as string) || 'Your property',
      policyType: formatPolicyType(n.data?.policyType as string),
      provider: (n.data?.provider as string) || 'Your provider',
      newExpirationDate: formatDate(n.data?.newExpirationDate as string),
      newPremium: formatCurrency(n.data?.newPremium as number),
      supportEmail: 'support@realriches.com',
    }),
  },
  'policy_expired': {
    templateId: 'policy.expiring',
    priority: 'critical',
    mapData: (n) => ({
      tenantFirstName: n.user.firstName,
      propertyAddress: (n.data?.propertyAddress as string) || 'Your property',
      policyType: formatPolicyType(n.data?.policyType as string),
      provider: (n.data?.provider as string) || 'Your provider',
      expirationDate: formatDate(n.data?.expirationDate as string),
      daysRemaining: 0,
      premium: formatCurrency(n.data?.premium as number),
      autoRenew: false,
      renewalUrl: 'https://app.realriches.com/policies',
      supportEmail: 'support@realriches.com',
    }),
  },

  // Lease renewal notifications
  'lease_renewal_offer': {
    templateId: 'lease.expiring',
    priority: 'high',
    mapData: (n) => ({
      tenantFirstName: n.user.firstName,
      propertyAddress: (n.data?.propertyAddress as string) || 'Your property',
      expirationDate: formatDate(n.data?.currentEndDate as string),
      daysRemaining: calculateDaysRemaining(n.data?.currentEndDate as string),
      renewalUrl: 'https://app.realriches.com/lease/renewal',
      contactEmail: 'support@realriches.com',
    }),
  },
  'lease_renewal_urgent': {
    templateId: 'lease.expiring',
    priority: 'critical',
    mapData: (n) => ({
      tenantFirstName: n.user.firstName,
      propertyAddress: (n.data?.propertyAddress as string) || 'Your property',
      expirationDate: formatDate(n.data?.endDate as string),
      daysRemaining: n.data?.daysRemaining || 30,
      renewalUrl: 'https://app.realriches.com/lease/renewal',
      contactEmail: 'support@realriches.com',
    }),
  },
  'lease_renewal_final': {
    templateId: 'lease.expiring',
    priority: 'critical',
    mapData: (n) => ({
      tenantFirstName: n.user.firstName,
      propertyAddress: (n.data?.propertyAddress as string) || 'Your property',
      expirationDate: formatDate(n.data?.endDate as string),
      daysRemaining: n.data?.daysRemaining || 14,
      renewalUrl: 'https://app.realriches.com/lease/renewal',
      contactEmail: 'support@realriches.com',
    }),
  },
};

// Types that should receive emails
const EMAIL_NOTIFICATION_TYPES = Object.keys(NOTIFICATION_EMAIL_MAPPINGS);

// =============================================================================
// Email Notification Job
// =============================================================================

// Store email service instance for reuse
let emailService: EmailService | null = null;

export class EmailNotificationJob {
  /**
   * Get job definition for the scheduler.
   * Runs every 5 minutes.
   */
  static getDefinition(): JobDefinition {
    return {
      name: 'email-notification',
      handler: (job: Job) => EmailNotificationJob.execute(job),
      cron: '*/5 * * * *', // Every 5 minutes
      options: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    };
  }

  /**
   * Initialize email service with Redis connection.
   */
  static initializeEmailService(redis: Redis): void {
    if (emailService) return;

    registerAllTemplates();
    const provider = createProviderFromEnv();
    emailService = new EmailService({
      connection: redis,
      provider,
      startWorker: false, // Main app handles worker
    });

    logger.info('Email notification job: email service initialized');
  }

  /**
   * Execute the email notification processing.
   */
  static async execute(job: Job): Promise<void> {
    const startTime = Date.now();
    let processed = 0;
    let failed = 0;

    logger.info({ jobId: job.id }, 'Starting email notification processing');

    try {
      // Find notifications that need email delivery
      // Look for recent notifications (last hour) that haven't been emailed
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const notifications = await prisma.notification.findMany({
        where: {
          type: { in: EMAIL_NOTIFICATION_TYPES },
          status: 'sent',
          createdAt: { gte: oneHourAgo },
          // Check if email was already sent via data field
          NOT: {
            data: {
              path: ['emailSent'],
              equals: true,
            },
          },
        },
        include: {
          user: {
            select: {
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        take: 100, // Process in batches
        orderBy: { createdAt: 'asc' },
      });

      if (notifications.length === 0) {
        logger.debug({ jobId: job.id }, 'No notifications to process');
        return;
      }

      logger.info(
        { jobId: job.id, count: notifications.length },
        'Found notifications to email'
      );

      for (const notification of notifications) {
        try {
          await EmailNotificationJob.sendEmailForNotification(
            notification as unknown as NotificationWithUser
          );
          processed++;
        } catch (error) {
          logger.error(
            { notificationId: notification.id, error },
            'Failed to send email for notification'
          );
          failed++;
        }
      }

      logger.info(
        {
          jobId: job.id,
          duration: Date.now() - startTime,
          processed,
          failed,
        },
        'Email notification processing completed'
      );
    } catch (error) {
      logger.error({ jobId: job.id, error }, 'Email notification processing failed');
      throw error;
    }
  }

  /**
   * Send email for a single notification.
   */
  private static async sendEmailForNotification(
    notification: NotificationWithUser
  ): Promise<void> {
    const mapping = NOTIFICATION_EMAIL_MAPPINGS[notification.type];
    if (!mapping) {
      logger.warn({ type: notification.type }, 'No email mapping for notification type');
      return;
    }

    if (!emailService) {
      logger.error('Email service not initialized');
      return;
    }

    // Map notification data to template data
    const templateData = mapping.mapData(notification);

    // Queue email
    await emailService.send({
      templateId: mapping.templateId,
      to: { email: notification.user.email, name: `${notification.user.firstName} ${notification.user.lastName}` },
      data: templateData,
      priority: mapping.priority,
      userId: notification.userId,
      entityType: 'notification',
      entityId: notification.id,
    });

    // Mark notification as emailed
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        data: {
          ...(notification.data || {}),
          emailSent: true,
          emailSentAt: new Date().toISOString(),
        },
      },
    });

    logger.debug(
      { notificationId: notification.id, templateId: mapping.templateId },
      'Email queued for notification'
    );
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatCurrency(amount: number | undefined): string {
  if (!amount) return '$0.00';
  return `$${(amount / 100).toFixed(2)}`;
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return 'N/A';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function formatPolicyType(type: string | undefined): string {
  if (!type) return 'Policy';
  switch (type) {
    case 'deposit_alternative':
      return 'Security Deposit Alternative';
    case 'renters_insurance':
      return 'Renters Insurance';
    case 'guarantor':
      return 'Lease Guarantor';
    default:
      return type;
  }
}

function calculateDaysRemaining(dateStr: string | undefined): number {
  if (!dateStr) return 0;
  try {
    const date = new Date(dateStr);
    const now = new Date();
    return Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}
