/**
 * Notification Preference Service
 *
 * Manages user notification preferences and checks if notifications
 * should be sent based on user settings.
 */

import { prisma } from '@realriches/database';
import type {
  NotificationCategory,
  NotificationChannel,
  NotificationFrequency,
  NotificationType,
  NotificationPreference,
  NotificationPreferenceInput,
  NotificationCheckResult,
  NotificationRoutingResult,
} from '@realriches/types';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  DEFAULT_NOTIFICATION_PREFERENCES,
  MANDATORY_CATEGORIES,
  MANDATORY_NOTIFICATION_TYPES,
} from '@realriches/types';
import { logger } from '@realriches/utils';

// =============================================================================
// Service Class
// =============================================================================

export class NotificationPreferenceService {
  /**
   * Get all notification preferences for a user.
   */
  static async getUserPreferences(userId: string): Promise<NotificationPreference[]> {
    const preferences = await prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: [{ category: 'asc' }, { channel: 'asc' }],
    });

    return preferences as NotificationPreference[];
  }

  /**
   * Get a specific preference for a user.
   */
  static async getPreference(
    userId: string,
    category: NotificationCategory,
    channel: NotificationChannel
  ): Promise<NotificationPreference | null> {
    const preference = await prisma.notificationPreference.findUnique({
      where: {
        userId_category_channel: { userId, category, channel },
      },
    });

    return preference as NotificationPreference | null;
  }

  /**
   * Create or update a notification preference.
   */
  static async upsertPreference(
    userId: string,
    input: NotificationPreferenceInput
  ): Promise<NotificationPreference> {
    const { category, channel, enabled, frequency, quietStart, quietEnd, metadata } = input;

    // Validate mandatory categories cannot be fully disabled
    if (MANDATORY_CATEGORIES.includes(category) && enabled === false && channel === 'email') {
      logger.warn('Attempt to disable mandatory category', { userId, category });
      // Allow disabling but log it - security notifications should still send for critical events
    }

    const preference = await prisma.notificationPreference.upsert({
      where: {
        userId_category_channel: { userId, category, channel },
      },
      update: {
        enabled: enabled ?? true,
        frequency: frequency ?? 'immediate',
        quietStart,
        quietEnd,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      },
      create: {
        userId,
        category,
        channel,
        enabled: enabled ?? true,
        frequency: frequency ?? 'immediate',
        quietStart,
        quietEnd,
        metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      },
    });

    logger.info('Notification preference updated', {
      userId,
      category,
      channel,
      enabled: preference.enabled,
    });

    return preference as NotificationPreference;
  }

  /**
   * Bulk update preferences for a user.
   */
  static async bulkUpsertPreferences(
    userId: string,
    inputs: NotificationPreferenceInput[]
  ): Promise<NotificationPreference[]> {
    const results: NotificationPreference[] = [];

    for (const input of inputs) {
      const result = await this.upsertPreference(userId, input);
      results.push(result);
    }

    return results;
  }

  /**
   * Initialize default preferences for a new user.
   */
  static async initializeDefaults(userId: string): Promise<NotificationPreference[]> {
    const existing = await prisma.notificationPreference.count({
      where: { userId },
    });

    if (existing > 0) {
      logger.debug('User already has preferences', { userId, count: existing });
      return this.getUserPreferences(userId);
    }

    const inputs: NotificationPreferenceInput[] = [];

    for (const category of NOTIFICATION_CATEGORIES) {
      for (const channel of NOTIFICATION_CHANNELS) {
        const defaults = DEFAULT_NOTIFICATION_PREFERENCES[category][channel];
        inputs.push({
          category,
          channel,
          enabled: defaults.enabled,
          frequency: defaults.frequency,
        });
      }
    }

    logger.info('Initializing default notification preferences', { userId, count: inputs.length });

    return this.bulkUpsertPreferences(userId, inputs);
  }

  /**
   * Delete a specific preference (resets to default behavior).
   */
  static async deletePreference(
    userId: string,
    category: NotificationCategory,
    channel: NotificationChannel
  ): Promise<boolean> {
    try {
      await prisma.notificationPreference.delete({
        where: {
          userId_category_channel: { userId, category, channel },
        },
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if a notification should be sent to a user via a specific channel.
   */
  static async shouldSendNotification(
    userId: string,
    notificationType: NotificationType,
    channel: NotificationChannel
  ): Promise<NotificationCheckResult> {
    // Check if this is a mandatory notification type
    const isMandatory = MANDATORY_NOTIFICATION_TYPES.includes(notificationType);

    // Get the category for this notification type
    const category = NOTIFICATION_TYPES[notificationType] as NotificationCategory;

    // Get user preference for this category/channel
    const preference = await this.getPreference(userId, category, channel);

    // If no preference exists, use defaults
    if (!preference) {
      const defaults = DEFAULT_NOTIFICATION_PREFERENCES[category][channel];
      return {
        shouldSend: isMandatory || defaults.enabled,
        channel,
        frequency: defaults.frequency,
        reason: isMandatory ? 'mandatory_notification' : 'default_settings',
      };
    }

    // For mandatory notifications, always send via at least one channel
    if (isMandatory && MANDATORY_CATEGORIES.includes(category)) {
      return {
        shouldSend: true,
        channel,
        frequency: 'immediate',
        reason: 'mandatory_notification',
      };
    }

    // Check if within quiet hours
    const isQuietHours = this.isWithinQuietHours(preference.quietStart, preference.quietEnd);

    // If in quiet hours and not immediate priority, schedule for later
    if (isQuietHours && preference.frequency !== 'immediate') {
      const scheduleFor = this.getNextDeliveryTime(preference.quietEnd);
      return {
        shouldSend: true,
        channel,
        frequency: preference.frequency as NotificationFrequency,
        isQuietHours: true,
        scheduleFor,
        reason: 'quiet_hours_delayed',
      };
    }

    return {
      shouldSend: preference.enabled,
      channel,
      frequency: preference.frequency as NotificationFrequency,
      reason: preference.enabled ? 'user_preference' : 'disabled_by_user',
    };
  }

  /**
   * Get routing decisions for all channels for a notification type.
   */
  static async getNotificationRouting(
    userId: string,
    notificationType: NotificationType
  ): Promise<NotificationRoutingResult> {
    const category = NOTIFICATION_TYPES[notificationType] as NotificationCategory;
    const isMandatory = MANDATORY_NOTIFICATION_TYPES.includes(notificationType);

    const channelResults: NotificationCheckResult[] = [];

    for (const channel of NOTIFICATION_CHANNELS) {
      const result = await this.shouldSendNotification(userId, notificationType, channel);
      channelResults.push(result);
    }

    return {
      notificationType,
      category,
      channels: channelResults,
      isMandatory,
    };
  }

  /**
   * Get preferences grouped by category for UI display.
   */
  static async getPreferencesByCategory(
    userId: string
  ): Promise<Record<NotificationCategory, Record<NotificationChannel, NotificationPreference>>> {
    const preferences = await this.getUserPreferences(userId);

    // Initialize with defaults
    const result: Record<string, Record<string, NotificationPreference>> = {};

    for (const category of NOTIFICATION_CATEGORIES) {
      result[category] = {};
      for (const channel of NOTIFICATION_CHANNELS) {
        const defaults = DEFAULT_NOTIFICATION_PREFERENCES[category][channel];
        result[category][channel] = {
          id: '',
          userId,
          category,
          channel,
          enabled: defaults.enabled,
          frequency: defaults.frequency,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
    }

    // Override with actual preferences
    for (const pref of preferences) {
      result[pref.category][pref.channel] = pref;
    }

    return result as Record<NotificationCategory, Record<NotificationChannel, NotificationPreference>>;
  }

  /**
   * Set global quiet hours for a user.
   */
  static async setQuietHours(
    userId: string,
    start: string,
    end: string
  ): Promise<void> {
    // Validate time format (HH:mm)
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!timeRegex.test(start) || !timeRegex.test(end)) {
      throw new Error('Invalid time format. Use HH:mm (24-hour format)');
    }

    // Update all preferences with quiet hours
    await prisma.notificationPreference.updateMany({
      where: { userId },
      data: { quietStart: start, quietEnd: end },
    });

    logger.info('Quiet hours updated for user', { userId, start, end });
  }

  /**
   * Clear quiet hours for a user.
   */
  static async clearQuietHours(userId: string): Promise<void> {
    await prisma.notificationPreference.updateMany({
      where: { userId },
      data: { quietStart: null, quietEnd: null },
    });

    logger.info('Quiet hours cleared for user', { userId });
  }

  /**
   * Unsubscribe from all non-mandatory notifications.
   */
  static async unsubscribeAll(userId: string): Promise<void> {
    // Disable all non-mandatory categories
    for (const category of NOTIFICATION_CATEGORIES) {
      if (!MANDATORY_CATEGORIES.includes(category)) {
        for (const channel of NOTIFICATION_CHANNELS) {
          await this.upsertPreference(userId, {
            category,
            channel,
            enabled: false,
            frequency: 'never',
          });
        }
      }
    }

    logger.info('User unsubscribed from all optional notifications', { userId });
  }

  /**
   * Resubscribe to default notifications.
   */
  static async resubscribeAll(userId: string): Promise<void> {
    // Reset all preferences to defaults
    await prisma.notificationPreference.deleteMany({
      where: { userId },
    });

    await this.initializeDefaults(userId);

    logger.info('User resubscribed to all notifications', { userId });
  }

  // =============================================================================
  // Helper Methods
  // =============================================================================

  /**
   * Check if current time is within quiet hours.
   */
  private static isWithinQuietHours(
    quietStart?: string | null,
    quietEnd?: string | null
  ): boolean {
    if (!quietStart || !quietEnd) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const [startHour, startMin] = quietStart.split(':').map(Number);
    const [endHour, endMin] = quietEnd.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // Handle overnight quiet hours (e.g., 22:00 - 07:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  /**
   * Get the next delivery time after quiet hours end.
   */
  private static getNextDeliveryTime(quietEnd?: string | null): Date {
    if (!quietEnd) return new Date();

    const now = new Date();
    const [endHour, endMin] = quietEnd.split(':').map(Number);

    const nextDelivery = new Date(now);
    nextDelivery.setHours(endHour, endMin, 0, 0);

    // If quiet hours end time has already passed today, schedule for tomorrow
    if (nextDelivery <= now) {
      nextDelivery.setDate(nextDelivery.getDate() + 1);
    }

    return nextDelivery;
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Quick check if notification should be sent.
 */
export async function shouldSendNotification(
  userId: string,
  notificationType: NotificationType,
  channel: NotificationChannel
): Promise<boolean> {
  const result = await NotificationPreferenceService.shouldSendNotification(
    userId,
    notificationType,
    channel
  );
  return result.shouldSend;
}

/**
 * Get category for a notification type.
 */
export function getNotificationCategory(notificationType: NotificationType): NotificationCategory {
  return NOTIFICATION_TYPES[notificationType] as NotificationCategory;
}
