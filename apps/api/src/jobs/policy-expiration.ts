/**
 * Policy Expiration Job
 *
 * Scans for expiring policies and sends notifications.
 * Also handles auto-renewal for eligible policies.
 *
 * Notification Schedule:
 * - 30 days before: First reminder
 * - 7 days before: Urgent reminder
 * - 1 day before: Final reminder
 * - On expiration: Expired notice
 */

import { prisma } from '@realriches/database';
import { getProviderRegistry } from '@realriches/revenue-engine';
import type { PartnerProvider } from '@realriches/revenue-engine';
import { logger } from '@realriches/utils';
import type { Job } from 'bullmq';

import type { JobDefinition } from './scheduler';

// =============================================================================
// Types
// =============================================================================

interface ExpiringPolicy {
  id: string;
  type: 'deposit_alternative' | 'renters_insurance' | 'guarantor';
  provider: string;
  providerPolicyId: string;
  expirationDate: Date;
  autoRenew: boolean;
  userId: string;
  userEmail: string;
  userName: string;
  propertyAddress: string;
  premium: number;
  daysUntilExpiration: number;
}

interface NotificationResult {
  policyId: string;
  notificationType: 'reminder_30d' | 'reminder_7d' | 'reminder_1d' | 'expired' | 'renewed';
  success: boolean;
  error?: string;
}

// =============================================================================
// Policy Expiration Scanner
// =============================================================================

export class PolicyExpirationJob {
  /**
   * Get job definition for the scheduler.
   * Runs daily at 8 AM UTC.
   */
  static getDefinition(): JobDefinition {
    return {
      name: 'policy-expiration-scan',
      handler: (job: Job) => PolicyExpirationJob.execute(job),
      cron: '0 8 * * *', // Daily at 8 AM UTC
      options: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    };
  }

  /**
   * Execute the policy expiration scan.
   */
  static async execute(job: Job): Promise<void> {
    const startTime = Date.now();
    const results: NotificationResult[] = [];

    logger.info({ jobId: job.id }, 'Starting policy expiration scan');

    try {
      // Find all expiring policies in different time windows
      const [expiring30d, expiring7d, expiring1d, expired] = await Promise.all([
        PolicyExpirationJob.findExpiringPolicies(30, 31),
        PolicyExpirationJob.findExpiringPolicies(7, 8),
        PolicyExpirationJob.findExpiringPolicies(1, 2),
        PolicyExpirationJob.findExpiringPolicies(-1, 0), // Already expired
      ]);

      logger.info(
        {
          expiring30d: expiring30d.length,
          expiring7d: expiring7d.length,
          expiring1d: expiring1d.length,
          expired: expired.length,
        },
        'Found expiring policies'
      );

      // Process 30-day reminders
      for (const policy of expiring30d) {
        const result = await PolicyExpirationJob.sendReminder(policy, 'reminder_30d');
        results.push(result);
      }

      // Process 7-day reminders
      for (const policy of expiring7d) {
        const result = await PolicyExpirationJob.sendReminder(policy, 'reminder_7d');
        results.push(result);
      }

      // Process 1-day reminders - also attempt auto-renewal
      for (const policy of expiring1d) {
        if (policy.autoRenew) {
          const renewResult = await PolicyExpirationJob.attemptAutoRenewal(policy);
          results.push(renewResult);
        } else {
          const result = await PolicyExpirationJob.sendReminder(policy, 'reminder_1d');
          results.push(result);
        }
      }

      // Process expired policies
      for (const policy of expired) {
        const result = await PolicyExpirationJob.sendExpiredNotice(policy);
        results.push(result);
      }

      // Log summary
      const successful = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;

      logger.info(
        {
          jobId: job.id,
          duration: Date.now() - startTime,
          total: results.length,
          successful,
          failed,
        },
        'Policy expiration scan completed'
      );
    } catch (error) {
      logger.error({ jobId: job.id, error }, 'Policy expiration scan failed');
      throw error;
    }
  }

  /**
   * Find policies expiring within a date range.
   */
  private static async findExpiringPolicies(
    daysFromNow: number,
    daysToNow: number
  ): Promise<ExpiringPolicy[]> {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() + daysFromNow);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + daysToNow);
    endDate.setHours(23, 59, 59, 999);

    const policies: ExpiringPolicy[] = [];

    // Find expiring deposit alternatives
    const depositAlternatives = await prisma.depositAlternative.findMany({
      where: {
        status: 'active',
        expirationDate: {
          gte: startDate,
          lt: endDate,
        },
      },
      include: {
        lease: {
          include: {
            primaryTenant: true,
            unit: {
              include: {
                property: true,
              },
            },
          },
        },
      },
    });

    for (const da of depositAlternatives) {
      if (da.lease?.primaryTenant && da.expirationDate) {
        const tenant = da.lease.primaryTenant;
        const address = da.lease.unit?.property?.address ||
          `${da.lease.unit?.property?.street1}, ${da.lease.unit?.property?.city}`;
        policies.push({
          id: da.id,
          type: 'deposit_alternative',
          provider: da.provider,
          providerPolicyId: da.providerPolicyId || '',
          expirationDate: da.expirationDate,
          autoRenew: false, // DepositAlternative doesn't have autoRenew
          userId: tenant.id,
          userEmail: tenant.email,
          userName: `${tenant.firstName} ${tenant.lastName}`,
          propertyAddress: address || 'Unknown',
          premium: da.monthlyPremiumAmount,
          daysUntilExpiration: Math.ceil(
            (da.expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          ),
        });
      }
    }

    // Find expiring renters insurance
    const rentersInsurance = await prisma.rentersInsurance.findMany({
      where: {
        status: 'active',
        expirationDate: {
          gte: startDate,
          lt: endDate,
        },
      },
      include: {
        lease: {
          include: {
            primaryTenant: true,
            unit: {
              include: {
                property: true,
              },
            },
          },
        },
      },
    });

    for (const ri of rentersInsurance) {
      if (ri.lease?.primaryTenant && ri.expirationDate) {
        const tenant = ri.lease.primaryTenant;
        const address = ri.lease.unit?.property?.address ||
          `${ri.lease.unit?.property?.street1}, ${ri.lease.unit?.property?.city}`;
        policies.push({
          id: ri.id,
          type: 'renters_insurance',
          provider: ri.provider,
          providerPolicyId: ri.policyNumber || '',
          expirationDate: ri.expirationDate,
          autoRenew: ri.autoRenew,
          userId: tenant.id,
          userEmail: tenant.email,
          userName: `${tenant.firstName} ${tenant.lastName}`,
          propertyAddress: address || 'Unknown',
          premium: ri.monthlyPremiumAmount,
          daysUntilExpiration: Math.ceil(
            (ri.expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          ),
        });
      }
    }

    // Find expiring guarantor products
    const guarantorProducts = await prisma.guarantorProduct.findMany({
      where: {
        status: 'active',
        expirationDate: {
          gte: startDate,
          lt: endDate,
        },
      },
      include: {
        lease: {
          include: {
            primaryTenant: true,
            unit: {
              include: {
                property: true,
              },
            },
          },
        },
      },
    });

    for (const gp of guarantorProducts) {
      if (gp.lease?.primaryTenant && gp.expirationDate) {
        const tenant = gp.lease.primaryTenant;
        const address = gp.lease.unit?.property?.address ||
          `${gp.lease.unit?.property?.street1}, ${gp.lease.unit?.property?.city}`;
        policies.push({
          id: gp.id,
          type: 'guarantor',
          provider: gp.provider,
          providerPolicyId: gp.providerContractId || '',
          expirationDate: gp.expirationDate,
          autoRenew: false, // GuarantorProduct doesn't have autoRenew
          userId: tenant.id,
          userEmail: tenant.email,
          userName: `${tenant.firstName} ${tenant.lastName}`,
          propertyAddress: address || 'Unknown',
          premium: gp.monthlyPremiumAmount,
          daysUntilExpiration: Math.ceil(
            (gp.expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          ),
        });
      }
    }

    return policies;
  }

  /**
   * Send a reminder notification for an expiring policy.
   */
  private static async sendReminder(
    policy: ExpiringPolicy,
    notificationType: 'reminder_30d' | 'reminder_7d' | 'reminder_1d'
  ): Promise<NotificationResult> {
    try {
      // Check if we already sent this notification today
      const existingNotification = await prisma.notification.findFirst({
        where: {
          userId: policy.userId,
          type: `policy_${notificationType}`,
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
          data: {
            path: ['policyId'],
            equals: policy.id,
          },
        },
      });

      if (existingNotification) {
        logger.debug({ policyId: policy.id, notificationType }, 'Notification already sent today');
        return { policyId: policy.id, notificationType, success: true };
      }

      // Create notification record
      await prisma.notification.create({
        data: {
          userId: policy.userId,
          type: `policy_${notificationType}`,
          channel: 'in_app',
          title: getNotificationTitle(policy, notificationType),
          body: getNotificationMessage(policy, notificationType),
          data: {
            policyId: policy.id,
            policyType: policy.type,
            provider: policy.provider,
            expirationDate: policy.expirationDate.toISOString(),
            daysRemaining: policy.daysUntilExpiration,
            autoRenew: policy.autoRenew,
            premium: policy.premium,
          },
          status: 'sent',
        },
      });

      logger.info(
        { policyId: policy.id, userId: policy.userId, notificationType },
        'Policy expiration reminder sent'
      );

      return { policyId: policy.id, notificationType, success: true };
    } catch (error) {
      logger.error({ policyId: policy.id, notificationType, error }, 'Failed to send reminder');
      return {
        policyId: policy.id,
        notificationType,
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Send notification when policy has expired.
   */
  private static async sendExpiredNotice(policy: ExpiringPolicy): Promise<NotificationResult> {
    try {
      // Update policy status to expired
      await PolicyExpirationJob.updatePolicyStatus(policy, 'expired');

      // Create notification
      await prisma.notification.create({
        data: {
          userId: policy.userId,
          type: 'policy_expired',
          channel: 'in_app',
          title: `Your ${formatPolicyType(policy.type)} has expired`,
          body: `Your ${formatPolicyType(policy.type)} for ${policy.propertyAddress} expired on ${policy.expirationDate.toLocaleDateString()}. Please renew to maintain coverage.`,
          data: {
            policyId: policy.id,
            policyType: policy.type,
            provider: policy.provider,
            expirationDate: policy.expirationDate.toISOString(),
            priority: 'high',
          },
          status: 'sent',
        },
      });

      logger.info({ policyId: policy.id, userId: policy.userId }, 'Policy expired notice sent');

      return { policyId: policy.id, notificationType: 'expired', success: true };
    } catch (error) {
      logger.error({ policyId: policy.id, error }, 'Failed to send expired notice');
      return {
        policyId: policy.id,
        notificationType: 'expired',
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Attempt auto-renewal for eligible policies.
   */
  private static async attemptAutoRenewal(policy: ExpiringPolicy): Promise<NotificationResult> {
    try {
      const registry = getProviderRegistry();
      const provider = registry.getProvider(policy.provider as PartnerProvider);

      if (!provider) {
        logger.warn({ policyId: policy.id, provider: policy.provider }, 'Provider not found for auto-renewal');
        // Fall back to sending reminder
        return PolicyExpirationJob.sendReminder(policy, 'reminder_1d');
      }

      // Attempt renewal with provider
      const renewalQuote = await provider.renew({
        policyId: policy.id,
        provider: policy.provider as PartnerProvider,
        providerPolicyId: policy.providerPolicyId,
        idempotencyKey: `renew_${policy.id}_${Date.now()}`,
      });

      if (renewalQuote.status !== 'success') {
        logger.warn(
          { policyId: policy.id, status: renewalQuote.status },
          'Auto-renewal quote not successful'
        );
        return PolicyExpirationJob.sendReminder(policy, 'reminder_1d');
      }

      // Calculate new expiration date (typically 12 months)
      const newExpirationDate = new Date(policy.expirationDate);
      newExpirationDate.setFullYear(newExpirationDate.getFullYear() + 1);

      // Update policy with new expiration
      await PolicyExpirationJob.updatePolicyExpiration(policy, newExpirationDate, renewalQuote.premium);

      // Send renewal confirmation
      await prisma.notification.create({
        data: {
          userId: policy.userId,
          type: 'policy_renewed',
          channel: 'in_app',
          title: `Your ${formatPolicyType(policy.type)} has been renewed`,
          body: `Your ${formatPolicyType(policy.type)} for ${policy.propertyAddress} has been automatically renewed until ${newExpirationDate.toLocaleDateString()}.`,
          data: {
            policyId: policy.id,
            policyType: policy.type,
            provider: policy.provider,
            newExpirationDate: newExpirationDate.toISOString(),
            newPremium: renewalQuote.premium,
          },
          status: 'sent',
        },
      });

      logger.info(
        { policyId: policy.id, newExpirationDate },
        'Policy auto-renewed successfully'
      );

      return { policyId: policy.id, notificationType: 'renewed', success: true };
    } catch (error) {
      logger.error({ policyId: policy.id, error }, 'Auto-renewal failed');

      // Fall back to sending reminder
      return PolicyExpirationJob.sendReminder(policy, 'reminder_1d');
    }
  }

  /**
   * Update policy status in the database.
   */
  private static async updatePolicyStatus(
    policy: ExpiringPolicy,
    status: 'active' | 'expired' | 'cancelled'
  ): Promise<void> {
    switch (policy.type) {
      case 'deposit_alternative':
        await prisma.depositAlternative.update({
          where: { id: policy.id },
          data: { status, updatedAt: new Date() },
        });
        break;
      case 'renters_insurance':
        await prisma.rentersInsurance.update({
          where: { id: policy.id },
          data: { status, updatedAt: new Date() },
        });
        break;
      case 'guarantor':
        await prisma.guarantorProduct.update({
          where: { id: policy.id },
          data: { status, updatedAt: new Date() },
        });
        break;
    }
  }

  /**
   * Update policy with new expiration date after renewal.
   */
  private static async updatePolicyExpiration(
    policy: ExpiringPolicy,
    newExpirationDate: Date,
    newPremium: number
  ): Promise<void> {
    switch (policy.type) {
      case 'deposit_alternative':
        await prisma.depositAlternative.update({
          where: { id: policy.id },
          data: {
            expirationDate: newExpirationDate,
            monthlyPremiumAmount: newPremium,
            updatedAt: new Date(),
          },
        });
        break;
      case 'renters_insurance':
        await prisma.rentersInsurance.update({
          where: { id: policy.id },
          data: {
            expirationDate: newExpirationDate,
            monthlyPremiumAmount: newPremium,
            updatedAt: new Date(),
          },
        });
        break;
      case 'guarantor':
        await prisma.guarantorProduct.update({
          where: { id: policy.id },
          data: {
            expirationDate: newExpirationDate,
            monthlyPremiumAmount: newPremium,
            updatedAt: new Date(),
          },
        });
        break;
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatPolicyType(type: string): string {
  switch (type) {
    case 'deposit_alternative':
      return 'security deposit alternative';
    case 'renters_insurance':
      return 'renters insurance';
    case 'guarantor':
      return 'lease guarantor';
    default:
      return type;
  }
}

function getNotificationTitle(
  policy: ExpiringPolicy,
  type: 'reminder_30d' | 'reminder_7d' | 'reminder_1d'
): string {
  const policyType = formatPolicyType(policy.type);
  switch (type) {
    case 'reminder_30d':
      return `Your ${policyType} expires in 30 days`;
    case 'reminder_7d':
      return `Your ${policyType} expires in 7 days`;
    case 'reminder_1d':
      return `Your ${policyType} expires tomorrow`;
  }
}

function getNotificationMessage(
  policy: ExpiringPolicy,
  type: 'reminder_30d' | 'reminder_7d' | 'reminder_1d'
): string {
  const policyType = formatPolicyType(policy.type);
  const expirationDate = policy.expirationDate.toLocaleDateString();

  let urgency = '';
  switch (type) {
    case 'reminder_30d':
      urgency = 'You have 30 days to renew.';
      break;
    case 'reminder_7d':
      urgency = 'Please renew soon to avoid a lapse in coverage.';
      break;
    case 'reminder_1d':
      urgency = 'Renew now to avoid losing your coverage.';
      break;
  }

  if (policy.autoRenew) {
    return `Your ${policyType} for ${policy.propertyAddress} expires on ${expirationDate}. Auto-renewal is enabled and will process automatically.`;
  }

  return `Your ${policyType} for ${policy.propertyAddress} expires on ${expirationDate}. ${urgency}`;
}
