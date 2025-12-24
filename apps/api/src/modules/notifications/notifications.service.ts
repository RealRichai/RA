/**
 * Notifications Service
 * Multi-channel notification management
 */

import { Prisma, Notification, NotificationType, NotificationChannel, NotificationStatus } from '@prisma/client';
import { db } from '../../lib/database.js';
import { Result, ok, err } from '../../lib/result.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import { logger, createModuleLogger } from '../../lib/logger.js';
import { z } from 'zod';

const log = createModuleLogger('notifications-service');

// =============================================================================
// SCHEMAS
// =============================================================================

export const NotificationTypeEnum = z.nativeEnum(NotificationType);
export const NotificationChannelEnum = z.nativeEnum(NotificationChannel);

export const CreateNotificationSchema = z.object({
  userId: z.string().cuid(),
  type: NotificationTypeEnum,
  title: z.string().max(200),
  message: z.string().max(2000),
  channels: z.array(NotificationChannelEnum).min(1),
  data: z.record(z.unknown()).optional(),
  actionUrl: z.string().url().optional(),
  scheduledFor: z.coerce.date().optional(),
});

export type CreateNotificationInput = z.infer<typeof CreateNotificationSchema>;

export const NotificationFiltersSchema = z.object({
  type: NotificationTypeEnum.optional(),
  channel: NotificationChannelEnum.optional(),
  status: z.nativeEnum(NotificationStatus).optional(),
  read: z.coerce.boolean().optional(),
});

export type NotificationFiltersInput = z.infer<typeof NotificationFiltersSchema>;

// =============================================================================
// TYPES
// =============================================================================

export interface NotificationWithDetails extends Notification {
  isNew: boolean;
}

// =============================================================================
// CREATE NOTIFICATION
// =============================================================================

export async function createNotification(
  input: CreateNotificationInput
): Promise<Result<Notification, AppError>> {
  try {
    const notification = await db.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        channels: input.channels,
        data: input.data as Prisma.JsonValue,
        actionUrl: input.actionUrl,
        scheduledFor: input.scheduledFor,
        status: input.scheduledFor ? NotificationStatus.PENDING : NotificationStatus.SENT,
      },
    });

    // TODO: Integrate with actual notification services (SendGrid, Twilio, etc.)
    // For now, just mark as sent if no scheduled time
    if (!input.scheduledFor) {
      await sendNotification(notification);
    }

    log.info({
      notificationId: notification.id,
      userId: input.userId,
      type: input.type,
    }, 'Notification created');

    return ok(notification);
  } catch (error) {
    log.error({ error, input }, 'Failed to create notification');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to create notification' }));
  }
}

// =============================================================================
// SEND NOTIFICATION
// =============================================================================

async function sendNotification(notification: Notification): Promise<void> {
  const channels = notification.channels as NotificationChannel[];

  for (const channel of channels) {
    try {
      switch (channel) {
        case NotificationChannel.EMAIL:
          // TODO: Integrate with SendGrid
          log.info({ notificationId: notification.id }, 'Would send email notification');
          break;
        case NotificationChannel.SMS:
          // TODO: Integrate with Twilio
          log.info({ notificationId: notification.id }, 'Would send SMS notification');
          break;
        case NotificationChannel.PUSH:
          // TODO: Integrate with push service
          log.info({ notificationId: notification.id }, 'Would send push notification');
          break;
        case NotificationChannel.IN_APP:
          // Already stored in database
          break;
      }
    } catch (error) {
      log.error({ error, notificationId: notification.id, channel }, 'Failed to send notification via channel');
    }
  }

  await db.notification.update({
    where: { id: notification.id },
    data: {
      status: NotificationStatus.SENT,
      sentAt: new Date(),
    },
  });
}

// =============================================================================
// GET USER NOTIFICATIONS
// =============================================================================

export async function getUserNotifications(
  userId: string,
  filters: NotificationFiltersInput,
  page: number = 1,
  limit: number = 20
): Promise<Result<{
  notifications: NotificationWithDetails[];
  total: number;
  unreadCount: number;
  page: number;
  totalPages: number;
}, AppError>> {
  try {
    const where: Prisma.NotificationWhereInput = {
      userId,
      deletedAt: null,
      ...(filters.type && { type: filters.type }),
      ...(filters.channel && { channels: { has: filters.channel } }),
      ...(filters.status && { status: filters.status }),
      ...(filters.read !== undefined && { readAt: filters.read ? { not: null } : null }),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.notification.count({ where }),
      db.notification.count({ where: { userId, readAt: null, deletedAt: null } }),
    ]);

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours

    return ok({
      notifications: notifications.map(n => ({
        ...n,
        isNew: !n.readAt && new Date(n.createdAt) > cutoff,
      })),
      total,
      unreadCount,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    log.error({ error, userId }, 'Failed to get user notifications');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to get notifications' }));
  }
}

// =============================================================================
// MARK AS READ
// =============================================================================

export async function markAsRead(
  id: string,
  userId: string
): Promise<Result<Notification, AppError>> {
  try {
    const notification = await db.notification.findUnique({
      where: { id, deletedAt: null },
    });

    if (!notification) {
      return err(new AppError({ code: ErrorCode.NOTIFICATION_NOT_FOUND, message: 'Notification not found' }));
    }

    if (notification.userId !== userId) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    const updated = await db.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });

    return ok(updated);
  } catch (error) {
    log.error({ error, notificationId: id }, 'Failed to mark notification as read');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to update notification' }));
  }
}

export async function markAllAsRead(userId: string): Promise<Result<number, AppError>> {
  try {
    const result = await db.notification.updateMany({
      where: { userId, readAt: null, deletedAt: null },
      data: { readAt: new Date() },
    });

    return ok(result.count);
  } catch (error) {
    log.error({ error, userId }, 'Failed to mark all notifications as read');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to update notifications' }));
  }
}

// =============================================================================
// DELETE NOTIFICATION
// =============================================================================

export async function deleteNotification(
  id: string,
  userId: string
): Promise<Result<void, AppError>> {
  try {
    const notification = await db.notification.findUnique({
      where: { id, deletedAt: null },
    });

    if (!notification) {
      return err(new AppError({ code: ErrorCode.NOTIFICATION_NOT_FOUND, message: 'Notification not found' }));
    }

    if (notification.userId !== userId) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    await db.notification.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return ok(undefined);
  } catch (error) {
    log.error({ error, notificationId: id }, 'Failed to delete notification');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to delete notification' }));
  }
}

// =============================================================================
// NOTIFICATION HELPERS (for other modules to use)
// =============================================================================

export async function notifyUser(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  data?: Record<string, unknown>,
  actionUrl?: string
): Promise<void> {
  await createNotification({
    userId,
    type,
    title,
    message,
    channels: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
    data,
    actionUrl,
  });
}

export async function notifyLeaseExpiring(
  userId: string,
  leaseId: string,
  daysLeft: number,
  address: string
): Promise<void> {
  await notifyUser(
    userId,
    NotificationType.LEASE_EXPIRING,
    'Lease Expiring Soon',
    `Your lease at ${address} expires in ${daysLeft} days. Review renewal options.`,
    { leaseId, daysLeft },
    `/leases/${leaseId}/renewal`
  );
}

export async function notifyPaymentDue(
  userId: string,
  paymentId: string,
  amount: number,
  dueDate: Date
): Promise<void> {
  await notifyUser(
    userId,
    NotificationType.PAYMENT_DUE,
    'Payment Due',
    `Payment of $${amount.toLocaleString()} is due on ${dueDate.toLocaleDateString()}.`,
    { paymentId, amount, dueDate },
    `/payments/${paymentId}`
  );
}

export async function notifyNewApplication(
  userId: string,
  applicationId: string,
  applicantName: string,
  listingAddress: string
): Promise<void> {
  await notifyUser(
    userId,
    NotificationType.NEW_APPLICATION,
    'New Application Received',
    `${applicantName} has applied for ${listingAddress}.`,
    { applicationId },
    `/applications/${applicationId}`
  );
}

export async function notifyTourScheduled(
  userId: string,
  tourId: string,
  scheduledDate: Date,
  address: string
): Promise<void> {
  await notifyUser(
    userId,
    NotificationType.TOUR_SCHEDULED,
    'Tour Scheduled',
    `Tour scheduled at ${address} on ${scheduledDate.toLocaleDateString()} at ${scheduledDate.toLocaleTimeString()}.`,
    { tourId, scheduledDate },
    `/tours/${tourId}`
  );
}
