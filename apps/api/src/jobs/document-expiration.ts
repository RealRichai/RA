/**
 * Document Expiration Job
 *
 * Tracks expiring documents and sends notifications to document owners.
 * Handles tenant IDs, insurance certificates, licenses, and other dated documents.
 */

import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';

import type { JobDefinition } from './scheduler';

// =============================================================================
// Types
// =============================================================================

interface ExpiringDocument {
  id: string;
  name: string;
  type: string;
  expiresAt: Date;
  daysUntilExpiration: number;
  uploadedById: string;
  ownerId: string | null;
  entityType: string | null;
  entityId: string | null;
}

interface ExpirationSummary {
  date: string;
  duration: number;
  expiringSoon: {
    '30days': number;
    '14days': number;
    '7days': number;
    '1day': number;
  };
  expired: number;
  notificationsSent: number;
  byType: Record<string, number>;
}

// =============================================================================
// Constants
// =============================================================================

const NOTIFICATION_THRESHOLDS = [30, 14, 7, 1]; // Days before expiration
const BATCH_SIZE = 100;
const STATS_KEY = 'documents:expiration:stats';
const NOTIFIED_KEY_PREFIX = 'documents:expiration:notified:';

// Document type labels for notifications
const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  'id': 'ID Document',
  'drivers_license': "Driver's License",
  'passport': 'Passport',
  'insurance': 'Insurance Certificate',
  'renters_insurance': "Renter's Insurance",
  'license': 'Professional License',
  'agent_license': 'Agent License',
  'broker_license': 'Broker License',
  'inspection': 'Inspection Report',
  'certification': 'Certification',
  'lease': 'Lease Agreement',
  'background_check': 'Background Check',
  'income_verification': 'Income Verification',
  'employment_verification': 'Employment Verification',
  'bank_statement': 'Bank Statement',
  'tax_return': 'Tax Return',
  'w2': 'W-2 Form',
  'pay_stub': 'Pay Stub',
};

// Store Redis connection
let redisClient: Redis | null = null;

// =============================================================================
// Document Expiration Job
// =============================================================================

export class DocumentExpirationJob {
  /**
   * Get job definition for the scheduler.
   * Runs daily at 6 AM.
   */
  static getDefinition(): JobDefinition {
    return {
      name: 'document-expiration',
      handler: (job: Job) => DocumentExpirationJob.execute(job),
      cron: '0 6 * * *', // Daily at 6 AM
      options: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 300000 },
        removeOnComplete: 30,
        removeOnFail: 60,
      },
    };
  }

  /**
   * Initialize with Redis connection.
   */
  static initializeRedis(redis: Redis): void {
    redisClient = redis;
  }

  /**
   * Execute the document expiration check.
   */
  static async execute(job: Job): Promise<ExpirationSummary> {
    const startTime = Date.now();
    const dateStr = new Date().toISOString().split('T')[0];

    logger.info({ jobId: job.id }, 'Starting document expiration check');

    const summary: ExpirationSummary = {
      date: dateStr,
      duration: 0,
      expiringSoon: {
        '30days': 0,
        '14days': 0,
        '7days': 0,
        '1day': 0,
      },
      expired: 0,
      notificationsSent: 0,
      byType: {},
    };

    try {
      // Process each notification threshold
      for (const days of NOTIFICATION_THRESHOLDS) {
        const documents = await DocumentExpirationJob.getExpiringDocuments(days);
        const key = `${days}days` as keyof typeof summary.expiringSoon;
        summary.expiringSoon[key] = documents.length;

        // Count by type
        for (const doc of documents) {
          summary.byType[doc.type] = (summary.byType[doc.type] || 0) + 1;
        }

        // Send notifications for each document
        for (const doc of documents) {
          const sent = await DocumentExpirationJob.notifyIfNeeded(doc, days);
          if (sent) {
            summary.notificationsSent++;
          }
        }
      }

      // Mark expired documents
      const expiredCount = await DocumentExpirationJob.markExpiredDocuments();
      summary.expired = expiredCount;

      // Store summary
      if (redisClient) {
        await redisClient.set(STATS_KEY, JSON.stringify(summary));
      }

      summary.duration = Date.now() - startTime;

      logger.info(
        {
          jobId: job.id,
          duration: summary.duration,
          expiringSoon: summary.expiringSoon,
          expired: summary.expired,
          notificationsSent: summary.notificationsSent,
        },
        'Document expiration check completed'
      );

      return summary;
    } catch (error) {
      logger.error({ jobId: job.id, error }, 'Document expiration check failed');
      throw error;
    }
  }

  // ===========================================================================
  // Document Scanning Functions
  // ===========================================================================

  /**
   * Get documents expiring within a given number of days.
   */
  private static async getExpiringDocuments(days: number): Promise<ExpiringDocument[]> {
    const now = new Date();
    const targetDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const previousDay = new Date(now.getTime() + (days - 1) * 24 * 60 * 60 * 1000);

    // Get documents expiring on exactly this threshold day
    const documents = await prisma.document.findMany({
      where: {
        expiresAt: {
          gte: previousDay,
          lt: targetDate,
        },
        status: { not: 'expired' },
        isLatestVersion: true,
      },
      select: {
        id: true,
        name: true,
        type: true,
        expiresAt: true,
        uploadedBy: true,
        ownerId: true,
        entityType: true,
        entityId: true,
      },
      take: BATCH_SIZE * 10, // Allow more since we're grouping by threshold
    });

    return documents.map((doc) => ({
      id: doc.id,
      name: doc.name,
      type: doc.type,
      expiresAt: doc.expiresAt!,
      daysUntilExpiration: days,
      uploadedById: doc.uploadedBy,
      ownerId: doc.ownerId,
      entityType: doc.entityType,
      entityId: doc.entityId,
    }));
  }

  /**
   * Mark documents as expired.
   */
  private static async markExpiredDocuments(): Promise<number> {
    const result = await prisma.document.updateMany({
      where: {
        expiresAt: { lt: new Date() },
        status: { not: 'expired' },
      },
      data: {
        status: 'expired',
      },
    });

    if (result.count > 0) {
      logger.info({ count: result.count }, 'Marked documents as expired');
    }

    return result.count;
  }

  // ===========================================================================
  // Notification Functions
  // ===========================================================================

  /**
   * Send notification if not already sent for this threshold.
   */
  private static async notifyIfNeeded(
    doc: ExpiringDocument,
    days: number
  ): Promise<boolean> {
    // Check if we already notified for this document/threshold
    if (redisClient) {
      const notifiedKey = `${NOTIFIED_KEY_PREFIX}${doc.id}:${days}`;
      const alreadyNotified = await redisClient.get(notifiedKey);
      if (alreadyNotified) {
        return false;
      }
    }

    // Determine who to notify
    const recipientId = doc.ownerId || doc.uploadedById;

    // Get document type label
    const typeLabel = DOCUMENT_TYPE_LABELS[doc.type] || doc.type;

    // Determine urgency
    const urgency = days <= 7 ? 'URGENT: ' : '';
    const priority = days <= 7 ? 'high' : 'normal';

    // Create notification
    await prisma.notification.create({
      data: {
        userId: recipientId,
        type: 'document_expiring',
        channel: 'in_app',
        title: `${urgency}${typeLabel} expiring in ${days} day${days === 1 ? '' : 's'}`,
        body: `Your document "${doc.name}" will expire on ${doc.expiresAt.toLocaleDateString()}. Please renew or upload an updated version.`,
        data: {
          documentId: doc.id,
          documentName: doc.name,
          documentType: doc.type,
          expiresAt: doc.expiresAt.toISOString(),
          daysUntilExpiration: days,
          entityType: doc.entityType,
          entityId: doc.entityId,
          priority,
        },
        status: 'sent',
      },
    });

    // Mark as notified (expires after the document expires + 7 days)
    if (redisClient) {
      const notifiedKey = `${NOTIFIED_KEY_PREFIX}${doc.id}:${days}`;
      const ttl = (days + 7) * 24 * 60 * 60; // Keep for days + 7 days
      await redisClient.setex(notifiedKey, ttl, '1');
    }

    // If document is associated with a lease, also notify the landlord
    if (doc.entityType === 'lease' && doc.entityId) {
      await DocumentExpirationJob.notifyLandlordForLease(doc, days, typeLabel);
    }

    logger.debug(
      { documentId: doc.id, type: doc.type, days, recipientId },
      'Sent document expiration notification'
    );

    return true;
  }

  /**
   * Notify landlord when a tenant's document is expiring.
   */
  private static async notifyLandlordForLease(
    doc: ExpiringDocument,
    days: number,
    typeLabel: string
  ): Promise<void> {
    const lease = await prisma.lease.findUnique({
      where: { id: doc.entityId! },
      include: {
        unit: {
          include: {
            property: true,
          },
        },
        primaryTenant: true,
      },
    });

    if (!lease?.unit?.property?.ownerId) return;

    const tenantName = lease.primaryTenant
      ? `${lease.primaryTenant.firstName} ${lease.primaryTenant.lastName}`
      : 'Tenant';

    await prisma.notification.create({
      data: {
        userId: lease.unit.property.ownerId,
        type: 'tenant_document_expiring',
        channel: 'in_app',
        title: `Tenant ${typeLabel} expiring in ${days} day${days === 1 ? '' : 's'}`,
        body: `${tenantName}'s ${typeLabel} for ${lease.unit.property.name} will expire on ${doc.expiresAt.toLocaleDateString()}.`,
        data: {
          documentId: doc.id,
          documentType: doc.type,
          leaseId: lease.id,
          tenantId: lease.primaryTenantId,
          tenantName,
          propertyId: lease.unit.propertyId,
          propertyName: lease.unit.property.name,
          expiresAt: doc.expiresAt.toISOString(),
          daysUntilExpiration: days,
          priority: days <= 7 ? 'high' : 'normal',
        },
        status: 'sent',
      },
    });
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get expiration statistics.
   */
  static async getExpirationStats(): Promise<ExpirationSummary | null> {
    if (!redisClient) return null;

    const data = await redisClient.get(STATS_KEY);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get documents expiring soon (for admin dashboard).
   */
  static async getExpiringDocumentsList(options: {
    days?: number;
    type?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    documents: ExpiringDocument[];
    total: number;
  }> {
    const { days = 30, type, limit = 50, offset = 0 } = options;

    const targetDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const where = {
      expiresAt: {
        gte: new Date(),
        lte: targetDate,
      },
      status: { not: 'expired' },
      isLatestVersion: true,
      ...(type ? { type } : {}),
    };

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        select: {
          id: true,
          name: true,
          type: true,
          expiresAt: true,
          uploadedBy: true,
          ownerId: true,
          entityType: true,
          entityId: true,
        },
        orderBy: { expiresAt: 'asc' },
        skip: offset,
        take: limit,
      }),
      prisma.document.count({ where }),
    ]);

    const now = new Date();
    return {
      documents: documents.map((doc) => ({
        id: doc.id,
        name: doc.name,
        type: doc.type,
        expiresAt: doc.expiresAt!,
        daysUntilExpiration: Math.ceil(
          (doc.expiresAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        ),
        uploadedById: doc.uploadedBy,
        ownerId: doc.ownerId,
        entityType: doc.entityType,
        entityId: doc.entityId,
      })),
      total,
    };
  }

  /**
   * Get expired documents (for cleanup/reporting).
   */
  static async getExpiredDocuments(options: {
    type?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    documents: Array<{
      id: string;
      name: string;
      type: string;
      expiresAt: Date;
      expiredDaysAgo: number;
    }>;
    total: number;
  }> {
    const { type, limit = 50, offset = 0 } = options;

    const where = {
      expiresAt: { lt: new Date() },
      status: 'expired',
      isLatestVersion: true,
      ...(type ? { type } : {}),
    };

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        select: {
          id: true,
          name: true,
          type: true,
          expiresAt: true,
        },
        orderBy: { expiresAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.document.count({ where }),
    ]);

    const now = new Date();
    return {
      documents: documents.map((doc) => ({
        id: doc.id,
        name: doc.name,
        type: doc.type,
        expiresAt: doc.expiresAt!,
        expiredDaysAgo: Math.ceil(
          (now.getTime() - doc.expiresAt!.getTime()) / (24 * 60 * 60 * 1000)
        ),
      })),
      total,
    };
  }

  /**
   * Get document type counts for expiring documents.
   */
  static async getExpiringByType(days: number = 30): Promise<Record<string, number>> {
    const targetDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const counts = await prisma.document.groupBy({
      by: ['type'],
      where: {
        expiresAt: {
          gte: new Date(),
          lte: targetDate,
        },
        status: { not: 'expired' },
        isLatestVersion: true,
      },
      _count: true,
    });

    return counts.reduce(
      (acc, c) => {
        acc[c.type] = c._count;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  /**
   * Send renewal reminder for a specific document.
   */
  static async sendRenewalReminder(documentId: string): Promise<boolean> {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        name: true,
        type: true,
        expiresAt: true,
        uploadedBy: true,
        ownerId: true,
        entityType: true,
        entityId: true,
        status: true,
      },
    });

    if (!doc || !doc.expiresAt) {
      return false;
    }

    const now = new Date();
    const daysUntilExpiration = Math.ceil(
      (doc.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );

    const typeLabel = DOCUMENT_TYPE_LABELS[doc.type] || doc.type;
    const recipientId = doc.ownerId || doc.uploadedBy;

    await prisma.notification.create({
      data: {
        userId: recipientId,
        type: 'document_renewal_reminder',
        channel: 'in_app',
        title: `Reminder: Renew your ${typeLabel}`,
        body:
          daysUntilExpiration > 0
            ? `Your document "${doc.name}" will expire in ${daysUntilExpiration} days. Please renew it soon.`
            : `Your document "${doc.name}" has expired. Please upload an updated version.`,
        data: {
          documentId: doc.id,
          documentName: doc.name,
          documentType: doc.type,
          expiresAt: doc.expiresAt.toISOString(),
          daysUntilExpiration,
          priority: daysUntilExpiration <= 7 ? 'high' : 'normal',
        },
        status: 'sent',
      },
    });

    logger.info({ documentId, recipientId }, 'Sent manual renewal reminder');
    return true;
  }
}
