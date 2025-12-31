/**
 * Notification Types
 *
 * Defines notification categories, channels, frequencies, and preference types.
 */

// =============================================================================
// Notification Categories
// =============================================================================

/**
 * Categories of notifications users can receive.
 */
export const NOTIFICATION_CATEGORIES = [
  'payments',      // Rent reminders, late notices, payment confirmations
  'leases',        // Renewal offers, expiration notices, lease updates
  'compliance',    // Violations, required actions, regulatory updates
  'documents',     // Expiring docs, signature requests, upload confirmations
  'maintenance',   // Work orders, repair updates, inspections
  'marketing',     // Promotions, market insights, newsletters
  'security',      // Login alerts, password changes, MFA events
  'system',        // Account updates, feature announcements, downtime
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * Human-readable labels for notification categories.
 */
export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  payments: 'Payments & Billing',
  leases: 'Lease Management',
  compliance: 'Compliance & Legal',
  documents: 'Documents',
  maintenance: 'Maintenance & Repairs',
  marketing: 'Marketing & Promotions',
  security: 'Security Alerts',
  system: 'System Notifications',
};

/**
 * Descriptions for each notification category.
 */
export const NOTIFICATION_CATEGORY_DESCRIPTIONS: Record<NotificationCategory, string> = {
  payments: 'Rent payment reminders, late notices, and payment confirmations',
  leases: 'Lease renewal offers, expiration warnings, and lease updates',
  compliance: 'Regulatory violations, required actions, and compliance updates',
  documents: 'Expiring documents, signature requests, and upload confirmations',
  maintenance: 'Work order updates, repair schedules, and inspection notices',
  marketing: 'Market insights, property recommendations, and newsletters',
  security: 'Login alerts, password changes, and security notifications',
  system: 'Account updates, new features, and scheduled maintenance',
};

// =============================================================================
// Notification Channels
// =============================================================================

/**
 * Channels through which notifications can be delivered.
 */
export const NOTIFICATION_CHANNELS = [
  'email',    // Email delivery
  'in_app',   // In-app notification center
  'sms',      // SMS text messages
  'push',     // Push notifications (mobile/desktop)
] as const;

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * Human-readable labels for notification channels.
 */
export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  email: 'Email',
  in_app: 'In-App',
  sms: 'SMS',
  push: 'Push Notifications',
};

// =============================================================================
// Notification Frequency
// =============================================================================

/**
 * How often notifications should be delivered.
 */
export const NOTIFICATION_FREQUENCIES = [
  'immediate',      // Send as soon as event occurs
  'daily_digest',   // Combine into daily summary
  'weekly_digest',  // Combine into weekly summary
  'never',          // Don't send for this category/channel
] as const;

export type NotificationFrequency = (typeof NOTIFICATION_FREQUENCIES)[number];

/**
 * Human-readable labels for frequencies.
 */
export const NOTIFICATION_FREQUENCY_LABELS: Record<NotificationFrequency, string> = {
  immediate: 'Immediately',
  daily_digest: 'Daily Digest',
  weekly_digest: 'Weekly Digest',
  never: 'Never',
};

// =============================================================================
// Notification Types (Specific Events)
// =============================================================================

/**
 * Specific notification types mapped to their category.
 */
export const NOTIFICATION_TYPES = {
  // Payments
  payment_reminder_7d: 'payments',
  payment_reminder_3d: 'payments',
  payment_reminder_1d: 'payments',
  payment_due_today: 'payments',
  payment_late_notice: 'payments',
  payment_late_fee: 'payments',
  payment_received: 'payments',
  payment_failed: 'payments',
  autopay_reminder: 'payments',

  // Leases
  lease_renewal_90d: 'leases',
  lease_renewal_60d: 'leases',
  lease_renewal_30d: 'leases',
  lease_renewal_offer: 'leases',
  lease_renewal_urgent: 'leases',
  lease_renewal_final: 'leases',
  lease_signed: 'leases',
  lease_expired: 'leases',
  lease_terminated: 'leases',

  // Compliance
  compliance_violation_critical: 'compliance',
  compliance_violation_high: 'compliance',
  compliance_violation_medium: 'compliance',
  compliance_violation_low: 'compliance',
  compliance_resolved: 'compliance',
  compliance_deadline: 'compliance',

  // Documents
  document_expiring_30d: 'documents',
  document_expiring_14d: 'documents',
  document_expiring_7d: 'documents',
  document_expiring_1d: 'documents',
  document_expired: 'documents',
  document_uploaded: 'documents',
  document_signature_requested: 'documents',
  document_signed: 'documents',

  // Maintenance
  work_order_created: 'maintenance',
  work_order_assigned: 'maintenance',
  work_order_in_progress: 'maintenance',
  work_order_completed: 'maintenance',
  work_order_cancelled: 'maintenance',
  inspection_scheduled: 'maintenance',
  inspection_reminder: 'maintenance',

  // Marketing
  market_update: 'marketing',
  property_recommendation: 'marketing',
  newsletter: 'marketing',
  promotion: 'marketing',

  // Security
  login_new_device: 'security',
  login_new_location: 'security',
  password_changed: 'security',
  mfa_enabled: 'security',
  mfa_disabled: 'security',
  api_key_created: 'security',
  suspicious_activity: 'security',

  // System
  account_created: 'system',
  account_verified: 'system',
  profile_updated: 'system',
  feature_announcement: 'system',
  scheduled_maintenance: 'system',
  partner_health_alert: 'system',
} as const;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

// =============================================================================
// Preference Types
// =============================================================================

/**
 * A single notification preference entry.
 */
export interface NotificationPreference {
  id: string;
  userId: string;
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
  frequency: NotificationFrequency;
  quietStart?: string; // HH:mm format
  quietEnd?: string;   // HH:mm format
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating/updating a preference.
 */
export interface NotificationPreferenceInput {
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled?: boolean;
  frequency?: NotificationFrequency;
  quietStart?: string;
  quietEnd?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Bulk update input for multiple preferences.
 */
export interface NotificationPreferencesBulkInput {
  preferences: NotificationPreferenceInput[];
}

/**
 * User's complete notification settings.
 */
export interface UserNotificationSettings {
  userId: string;
  preferences: NotificationPreference[];
  globalQuietHours?: {
    enabled: boolean;
    start: string; // HH:mm
    end: string;   // HH:mm
    timezone: string;
  };
  unsubscribeAll?: boolean;
  digestTime?: string; // HH:mm for daily digest delivery
  digestTimezone?: string;
}

// =============================================================================
// Default Preferences
// =============================================================================

/**
 * Default preference settings for each category.
 * Used when initializing new user preferences.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: Record<
  NotificationCategory,
  Record<NotificationChannel, { enabled: boolean; frequency: NotificationFrequency }>
> = {
  payments: {
    email: { enabled: true, frequency: 'immediate' },
    in_app: { enabled: true, frequency: 'immediate' },
    sms: { enabled: false, frequency: 'immediate' },
    push: { enabled: true, frequency: 'immediate' },
  },
  leases: {
    email: { enabled: true, frequency: 'immediate' },
    in_app: { enabled: true, frequency: 'immediate' },
    sms: { enabled: false, frequency: 'immediate' },
    push: { enabled: true, frequency: 'immediate' },
  },
  compliance: {
    email: { enabled: true, frequency: 'immediate' },
    in_app: { enabled: true, frequency: 'immediate' },
    sms: { enabled: false, frequency: 'immediate' },
    push: { enabled: true, frequency: 'immediate' },
  },
  documents: {
    email: { enabled: true, frequency: 'immediate' },
    in_app: { enabled: true, frequency: 'immediate' },
    sms: { enabled: false, frequency: 'immediate' },
    push: { enabled: false, frequency: 'immediate' },
  },
  maintenance: {
    email: { enabled: true, frequency: 'immediate' },
    in_app: { enabled: true, frequency: 'immediate' },
    sms: { enabled: false, frequency: 'immediate' },
    push: { enabled: true, frequency: 'immediate' },
  },
  marketing: {
    email: { enabled: true, frequency: 'weekly_digest' },
    in_app: { enabled: true, frequency: 'daily_digest' },
    sms: { enabled: false, frequency: 'never' },
    push: { enabled: false, frequency: 'never' },
  },
  security: {
    email: { enabled: true, frequency: 'immediate' },
    in_app: { enabled: true, frequency: 'immediate' },
    sms: { enabled: true, frequency: 'immediate' },
    push: { enabled: true, frequency: 'immediate' },
  },
  system: {
    email: { enabled: true, frequency: 'immediate' },
    in_app: { enabled: true, frequency: 'immediate' },
    sms: { enabled: false, frequency: 'never' },
    push: { enabled: false, frequency: 'immediate' },
  },
};

// =============================================================================
// Priority Categories
// =============================================================================

/**
 * Categories that should always be delivered (cannot be disabled).
 */
export const MANDATORY_CATEGORIES: NotificationCategory[] = [
  'security',
  'compliance',
];

/**
 * Notification types that should always be delivered regardless of preferences.
 */
export const MANDATORY_NOTIFICATION_TYPES: NotificationType[] = [
  'login_new_device',
  'login_new_location',
  'suspicious_activity',
  'compliance_violation_critical',
  'payment_late_notice',
];

// =============================================================================
// Check Result Types
// =============================================================================

/**
 * Result of checking if a notification should be sent.
 */
export interface NotificationCheckResult {
  shouldSend: boolean;
  channel: NotificationChannel;
  frequency: NotificationFrequency;
  reason?: string;
  isQuietHours?: boolean;
  scheduleFor?: Date; // If digest, when to deliver
}

/**
 * Result of checking all channels for a notification type.
 */
export interface NotificationRoutingResult {
  notificationType: NotificationType;
  category: NotificationCategory;
  channels: NotificationCheckResult[];
  isMandatory: boolean;
}
