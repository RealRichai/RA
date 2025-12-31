/**
 * Lease Renewal Job
 *
 * Notifies landlords and tenants before leases expire.
 * Generates renewal offers for eligible leases.
 *
 * Notification Schedule:
 * - 90 days before: Early notice to landlord (time to decide on renewal terms)
 * - 60 days before: Renewal offer sent to tenant (if landlord approved)
 * - 30 days before: Urgent reminder to both parties
 * - 14 days before: Final notice if no action taken
 */

import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { Job } from 'bullmq';

import type { JobDefinition } from './scheduler';

// =============================================================================
// Types
// =============================================================================

interface ExpiringLease {
  id: string;
  leaseNumber: string;
  landlordId: string;
  landlordEmail: string;
  landlordName: string;
  tenantId: string;
  tenantEmail: string;
  tenantName: string;
  propertyAddress: string;
  unitNumber: string;
  monthlyRent: number;
  endDate: Date;
  daysUntilExpiration: number;
  renewalOffered: boolean;
  renewalStatus: string;
  isRentStabilized: boolean;
}

interface RenewalResult {
  leaseId: string;
  action: 'landlord_notice' | 'tenant_offer' | 'urgent_reminder' | 'final_notice' | 'renewal_generated';
  success: boolean;
  error?: string;
}

// Typical rent increase percentages by market
const DEFAULT_RENEWAL_INCREASE_PERCENT = 3;
const RENT_STABILIZED_MAX_INCREASE_PERCENT = 2.75; // NYC RGB 2024 guideline

// =============================================================================
// Lease Renewal Job
// =============================================================================

export class LeaseRenewalJob {
  /**
   * Get job definition for the scheduler.
   * Runs daily at 10 AM UTC.
   */
  static getDefinition(): JobDefinition {
    return {
      name: 'lease-renewal',
      handler: (job: Job) => LeaseRenewalJob.execute(job),
      cron: '0 10 * * *', // Daily at 10 AM UTC
      options: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    };
  }

  /**
   * Execute the lease renewal scan.
   */
  static async execute(job: Job): Promise<void> {
    const startTime = Date.now();
    const results: RenewalResult[] = [];

    logger.info({ jobId: job.id }, 'Starting lease renewal scan');

    try {
      // Find leases expiring in different time windows
      const [expiring90d, expiring60d, expiring30d, expiring14d] = await Promise.all([
        LeaseRenewalJob.findExpiringLeases(90, 91),
        LeaseRenewalJob.findExpiringLeases(60, 61),
        LeaseRenewalJob.findExpiringLeases(30, 31),
        LeaseRenewalJob.findExpiringLeases(14, 15),
      ]);

      logger.info(
        {
          expiring90d: expiring90d.length,
          expiring60d: expiring60d.length,
          expiring30d: expiring30d.length,
          expiring14d: expiring14d.length,
        },
        'Found expiring leases'
      );

      // 90 days: Notify landlord to prepare renewal terms
      for (const lease of expiring90d) {
        if (!lease.renewalOffered) {
          const result = await LeaseRenewalJob.notifyLandlord90Days(lease);
          results.push(result);
        }
      }

      // 60 days: Send renewal offer to tenant (if landlord hasn't acted, auto-generate)
      for (const lease of expiring60d) {
        const result = await LeaseRenewalJob.handleRenewalOffer(lease);
        results.push(result);
      }

      // 30 days: Urgent reminder to both parties
      for (const lease of expiring30d) {
        if (lease.renewalStatus === 'offered' || lease.renewalStatus === 'pending') {
          const result = await LeaseRenewalJob.sendUrgentReminder(lease);
          results.push(result);
        }
      }

      // 14 days: Final notice
      for (const lease of expiring14d) {
        if (lease.renewalStatus !== 'accepted' && lease.renewalStatus !== 'declined') {
          const result = await LeaseRenewalJob.sendFinalNotice(lease);
          results.push(result);
        }
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
        'Lease renewal scan completed'
      );
    } catch (error) {
      logger.error({ jobId: job.id, error }, 'Lease renewal scan failed');
      throw error;
    }
  }

  /**
   * Find active leases expiring within a date range.
   */
  private static async findExpiringLeases(
    daysFromNow: number,
    daysToNow: number
  ): Promise<ExpiringLease[]> {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() + daysFromNow);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(now);
    endDate.setDate(endDate.getDate() + daysToNow);
    endDate.setHours(23, 59, 59, 999);

    const leases = await prisma.lease.findMany({
      where: {
        status: 'active',
        endDate: {
          gte: startDate,
          lt: endDate,
        },
      },
      include: {
        landlord: true,
        primaryTenant: true,
        unit: {
          include: {
            property: true,
          },
        },
      },
    });

    return leases.map((lease) => {
      const address = lease.unit?.property?.address ||
        `${lease.unit?.property?.street1}, ${lease.unit?.property?.city}`;
      return {
        id: lease.id,
        leaseNumber: lease.leaseNumber,
        landlordId: lease.landlord.id,
        landlordEmail: lease.landlord.email,
        landlordName: `${lease.landlord.firstName} ${lease.landlord.lastName}`,
        tenantId: lease.primaryTenant.id,
        tenantEmail: lease.primaryTenant.email,
        tenantName: `${lease.primaryTenant.firstName} ${lease.primaryTenant.lastName}`,
        propertyAddress: address || 'Unknown',
        unitNumber: lease.unit?.unitNumber || '',
        monthlyRent: lease.monthlyRentAmount,
        endDate: lease.endDate,
        daysUntilExpiration: Math.ceil(
          (lease.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        ),
        renewalOffered: lease.renewalOffered,
        renewalStatus: lease.renewalStatus,
        isRentStabilized: lease.isRentStabilized,
      };
    });
  }

  /**
   * Notify landlord at 90 days to prepare renewal terms.
   */
  private static async notifyLandlord90Days(lease: ExpiringLease): Promise<RenewalResult> {
    try {
      // Check if already notified today
      const existingNotification = await prisma.notification.findFirst({
        where: {
          userId: lease.landlordId,
          type: 'lease_renewal_landlord_90d',
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
          data: {
            path: ['leaseId'],
            equals: lease.id,
          },
        },
      });

      if (existingNotification) {
        return { leaseId: lease.id, action: 'landlord_notice', success: true };
      }

      // Calculate suggested renewal rent
      const increasePercent = lease.isRentStabilized
        ? RENT_STABILIZED_MAX_INCREASE_PERCENT
        : DEFAULT_RENEWAL_INCREASE_PERCENT;
      const suggestedRent = Math.round(lease.monthlyRent * (1 + increasePercent / 100));

      // Update lease status
      await prisma.lease.update({
        where: { id: lease.id },
        data: {
          renewalStatus: 'pending_landlord',
        },
      });

      // Notify landlord
      await prisma.notification.create({
        data: {
          userId: lease.landlordId,
          type: 'lease_renewal_landlord_90d',
          channel: 'in_app',
          title: `Lease expiring in 90 days - ${lease.propertyAddress}`,
          body: `The lease for ${lease.tenantName} at ${lease.propertyAddress}${lease.unitNumber ? ` Unit ${lease.unitNumber}` : ''} expires on ${lease.endDate.toLocaleDateString()}. Current rent: $${(lease.monthlyRent / 100).toFixed(2)}/mo. Suggested renewal: $${(suggestedRent / 100).toFixed(2)}/mo${lease.isRentStabilized ? ' (rent stabilized max)' : ''}. Review and set renewal terms.`,
          data: {
            leaseId: lease.id,
            leaseNumber: lease.leaseNumber,
            tenantName: lease.tenantName,
            currentRent: lease.monthlyRent,
            suggestedRent,
            endDate: lease.endDate.toISOString(),
            isRentStabilized: lease.isRentStabilized,
          },
          status: 'sent',
        },
      });

      logger.info(
        { leaseId: lease.id, landlordId: lease.landlordId },
        '90-day landlord notice sent'
      );

      return { leaseId: lease.id, action: 'landlord_notice', success: true };
    } catch (error) {
      logger.error({ leaseId: lease.id, error }, 'Failed to send 90-day landlord notice');
      return {
        leaseId: lease.id,
        action: 'landlord_notice',
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Handle renewal offer at 60 days.
   * If landlord hasn't set terms, auto-generate offer.
   */
  private static async handleRenewalOffer(lease: ExpiringLease): Promise<RenewalResult> {
    try {
      // If already offered, skip
      if (lease.renewalOffered) {
        return { leaseId: lease.id, action: 'tenant_offer', success: true };
      }

      // Check if already notified today
      const existingNotification = await prisma.notification.findFirst({
        where: {
          userId: lease.tenantId,
          type: 'lease_renewal_offer',
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
          data: {
            path: ['leaseId'],
            equals: lease.id,
          },
        },
      });

      if (existingNotification) {
        return { leaseId: lease.id, action: 'tenant_offer', success: true };
      }

      // Calculate renewal rent
      const increasePercent = lease.isRentStabilized
        ? RENT_STABILIZED_MAX_INCREASE_PERCENT
        : DEFAULT_RENEWAL_INCREASE_PERCENT;
      const renewalRent = Math.round(lease.monthlyRent * (1 + increasePercent / 100));

      // Calculate new lease dates (1 year renewal)
      const newStartDate = new Date(lease.endDate);
      newStartDate.setDate(newStartDate.getDate() + 1);
      const newEndDate = new Date(newStartDate);
      newEndDate.setFullYear(newEndDate.getFullYear() + 1);

      // Update lease with renewal offer
      await prisma.lease.update({
        where: { id: lease.id },
        data: {
          renewalOffered: true,
          renewalOfferDate: new Date(),
          renewalStatus: 'offered',
        },
      });

      // Notify tenant
      await prisma.notification.create({
        data: {
          userId: lease.tenantId,
          type: 'lease_renewal_offer',
          channel: 'in_app',
          title: `Lease renewal offer - ${lease.propertyAddress}`,
          body: `Your lease at ${lease.propertyAddress}${lease.unitNumber ? ` Unit ${lease.unitNumber}` : ''} expires on ${lease.endDate.toLocaleDateString()}. We'd like to offer you a renewal at $${(renewalRent / 100).toFixed(2)}/mo (${increasePercent}% increase) for another year. Please respond within 30 days.`,
          data: {
            leaseId: lease.id,
            leaseNumber: lease.leaseNumber,
            currentRent: lease.monthlyRent,
            renewalRent,
            increasePercent,
            currentEndDate: lease.endDate.toISOString(),
            newStartDate: newStartDate.toISOString(),
            newEndDate: newEndDate.toISOString(),
            responseDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          },
          status: 'sent',
        },
      });

      // Also notify landlord that offer was sent
      await prisma.notification.create({
        data: {
          userId: lease.landlordId,
          type: 'lease_renewal_offer_sent',
          channel: 'in_app',
          title: `Renewal offer sent to ${lease.tenantName}`,
          body: `A renewal offer has been sent to ${lease.tenantName} for ${lease.propertyAddress}${lease.unitNumber ? ` Unit ${lease.unitNumber}` : ''} at $${(renewalRent / 100).toFixed(2)}/mo. Awaiting tenant response.`,
          data: {
            leaseId: lease.id,
            leaseNumber: lease.leaseNumber,
            tenantName: lease.tenantName,
            renewalRent,
          },
          status: 'sent',
        },
      });

      logger.info(
        { leaseId: lease.id, tenantId: lease.tenantId, renewalRent },
        'Renewal offer sent to tenant'
      );

      return { leaseId: lease.id, action: 'renewal_generated', success: true };
    } catch (error) {
      logger.error({ leaseId: lease.id, error }, 'Failed to send renewal offer');
      return {
        leaseId: lease.id,
        action: 'tenant_offer',
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Send urgent reminder at 30 days to both parties.
   */
  private static async sendUrgentReminder(lease: ExpiringLease): Promise<RenewalResult> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check if already sent today
      const existingNotification = await prisma.notification.findFirst({
        where: {
          type: 'lease_renewal_urgent',
          createdAt: { gte: today },
          data: {
            path: ['leaseId'],
            equals: lease.id,
          },
        },
      });

      if (existingNotification) {
        return { leaseId: lease.id, action: 'urgent_reminder', success: true };
      }

      // Notify tenant
      await prisma.notification.create({
        data: {
          userId: lease.tenantId,
          type: 'lease_renewal_urgent',
          channel: 'in_app',
          title: `Lease expires in 30 days - Action required`,
          body: `Your lease at ${lease.propertyAddress}${lease.unitNumber ? ` Unit ${lease.unitNumber}` : ''} expires on ${lease.endDate.toLocaleDateString()}. Please respond to the renewal offer to secure your home. If you haven't received an offer, contact your landlord.`,
          data: {
            leaseId: lease.id,
            leaseNumber: lease.leaseNumber,
            endDate: lease.endDate.toISOString(),
            daysRemaining: lease.daysUntilExpiration,
            priority: 'high',
          },
          status: 'sent',
        },
      });

      // Notify landlord
      await prisma.notification.create({
        data: {
          userId: lease.landlordId,
          type: 'lease_renewal_urgent',
          channel: 'in_app',
          title: `Lease expires in 30 days - ${lease.tenantName}`,
          body: `The lease for ${lease.tenantName} at ${lease.propertyAddress}${lease.unitNumber ? ` Unit ${lease.unitNumber}` : ''} expires on ${lease.endDate.toLocaleDateString()}. Renewal status: ${formatRenewalStatus(lease.renewalStatus)}. Take action now to avoid vacancy.`,
          data: {
            leaseId: lease.id,
            leaseNumber: lease.leaseNumber,
            tenantName: lease.tenantName,
            endDate: lease.endDate.toISOString(),
            renewalStatus: lease.renewalStatus,
            priority: 'high',
          },
          status: 'sent',
        },
      });

      logger.info({ leaseId: lease.id }, '30-day urgent reminder sent');

      return { leaseId: lease.id, action: 'urgent_reminder', success: true };
    } catch (error) {
      logger.error({ leaseId: lease.id, error }, 'Failed to send urgent reminder');
      return {
        leaseId: lease.id,
        action: 'urgent_reminder',
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Send final notice at 14 days.
   */
  private static async sendFinalNotice(lease: ExpiringLease): Promise<RenewalResult> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Check if already sent today
      const existingNotification = await prisma.notification.findFirst({
        where: {
          type: 'lease_renewal_final',
          createdAt: { gte: today },
          data: {
            path: ['leaseId'],
            equals: lease.id,
          },
        },
      });

      if (existingNotification) {
        return { leaseId: lease.id, action: 'final_notice', success: true };
      }

      // Update status
      await prisma.lease.update({
        where: { id: lease.id },
        data: {
          renewalStatus: 'expiring_soon',
        },
      });

      // Notify tenant
      await prisma.notification.create({
        data: {
          userId: lease.tenantId,
          type: 'lease_renewal_final',
          channel: 'in_app',
          title: `FINAL NOTICE: Lease expires in 14 days`,
          body: `Your lease at ${lease.propertyAddress}${lease.unitNumber ? ` Unit ${lease.unitNumber}` : ''} expires on ${lease.endDate.toLocaleDateString()}. Without a signed renewal, you must vacate by this date. Contact your landlord immediately.`,
          data: {
            leaseId: lease.id,
            leaseNumber: lease.leaseNumber,
            endDate: lease.endDate.toISOString(),
            daysRemaining: lease.daysUntilExpiration,
            priority: 'urgent',
          },
          status: 'sent',
        },
      });

      // Notify landlord
      await prisma.notification.create({
        data: {
          userId: lease.landlordId,
          type: 'lease_renewal_final',
          channel: 'in_app',
          title: `FINAL NOTICE: Lease expires in 14 days - ${lease.tenantName}`,
          body: `The lease for ${lease.tenantName} at ${lease.propertyAddress}${lease.unitNumber ? ` Unit ${lease.unitNumber}` : ''} expires on ${lease.endDate.toLocaleDateString()}. No renewal has been confirmed. Prepare for potential vacancy or contact tenant immediately.`,
          data: {
            leaseId: lease.id,
            leaseNumber: lease.leaseNumber,
            tenantName: lease.tenantName,
            endDate: lease.endDate.toISOString(),
            renewalStatus: lease.renewalStatus,
            priority: 'urgent',
          },
          status: 'sent',
        },
      });

      logger.info({ leaseId: lease.id }, '14-day final notice sent');

      return { leaseId: lease.id, action: 'final_notice', success: true };
    } catch (error) {
      logger.error({ leaseId: lease.id, error }, 'Failed to send final notice');
      return {
        leaseId: lease.id,
        action: 'final_notice',
        success: false,
        error: (error as Error).message,
      };
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function formatRenewalStatus(status: string): string {
  switch (status) {
    case 'not_offered':
      return 'No offer sent';
    case 'pending_landlord':
      return 'Awaiting landlord terms';
    case 'offered':
      return 'Offer sent, awaiting response';
    case 'pending':
      return 'Under review';
    case 'accepted':
      return 'Accepted';
    case 'declined':
      return 'Declined';
    case 'expiring_soon':
      return 'Expiring soon - no action taken';
    default:
      return status;
  }
}
