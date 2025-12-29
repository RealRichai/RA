import { z } from 'zod';
import { UUIDSchema } from './common';

// ============================================================================
// Event/Message Types for Event-Driven Architecture
// ============================================================================

export const EventPrioritySchema = z.enum(['low', 'normal', 'high', 'critical']);
export type EventPriority = z.infer<typeof EventPrioritySchema>;

// Base event schema
export const BaseEventSchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  version: z.string().default('1.0'),
  source: z.string(), // Service that emitted the event
  timestamp: z.string().datetime(),
  correlationId: z.string().uuid().optional(),
  causationId: z.string().uuid().optional(),
  userId: UUIDSchema.optional(),
  organizationId: UUIDSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type BaseEvent = z.infer<typeof BaseEventSchema>;

// Domain events
export const DomainEventSchema = BaseEventSchema.extend({
  aggregateType: z.string(),
  aggregateId: UUIDSchema,
  payload: z.record(z.unknown()),
  priority: EventPrioritySchema.default('normal'),
});
export type DomainEvent = z.infer<typeof DomainEventSchema>;

// Property events
export const PropertyEventSchema = DomainEventSchema.extend({
  aggregateType: z.literal('property'),
  type: z.enum([
    'property.created',
    'property.updated',
    'property.deleted',
    'property.status_changed',
    'property.compliance_updated',
    'property.unit_added',
    'property.unit_removed',
  ]),
});
export type PropertyEvent = z.infer<typeof PropertyEventSchema>;

// Listing events
export const ListingEventSchema = DomainEventSchema.extend({
  aggregateType: z.literal('listing'),
  type: z.enum([
    'listing.created',
    'listing.updated',
    'listing.published',
    'listing.unpublished',
    'listing.expired',
    'listing.viewed',
    'listing.inquired',
    'listing.saved',
    'listing.shared',
    'listing.syndication_updated',
  ]),
});
export type ListingEvent = z.infer<typeof ListingEventSchema>;

// Lease events
export const LeaseEventSchema = DomainEventSchema.extend({
  aggregateType: z.literal('lease'),
  type: z.enum([
    'lease.created',
    'lease.updated',
    'lease.sent_for_signature',
    'lease.signed',
    'lease.fully_executed',
    'lease.activated',
    'lease.expiring_soon',
    'lease.expired',
    'lease.renewal_offered',
    'lease.renewed',
    'lease.terminated',
    'lease.amended',
  ]),
});
export type LeaseEvent = z.infer<typeof LeaseEventSchema>;

// Application events
export const ApplicationEventSchema = DomainEventSchema.extend({
  aggregateType: z.literal('application'),
  type: z.enum([
    'application.started',
    'application.submitted',
    'application.documents_requested',
    'application.screening_started',
    'application.screening_completed',
    'application.approved',
    'application.conditionally_approved',
    'application.denied',
    'application.withdrawn',
    'application.expired',
  ]),
});
export type ApplicationEvent = z.infer<typeof ApplicationEventSchema>;

// Payment events
export const PaymentEventSchema = DomainEventSchema.extend({
  aggregateType: z.literal('payment'),
  type: z.enum([
    'payment.initiated',
    'payment.processing',
    'payment.completed',
    'payment.failed',
    'payment.refunded',
    'payment.disputed',
    'payment.retry_scheduled',
    'invoice.created',
    'invoice.sent',
    'invoice.viewed',
    'invoice.paid',
    'invoice.overdue',
    'invoice.cancelled',
    'payout.initiated',
    'payout.completed',
    'payout.failed',
  ]),
});
export type PaymentEvent = z.infer<typeof PaymentEventSchema>;

// Maintenance events
export const MaintenanceEventSchema = DomainEventSchema.extend({
  aggregateType: z.literal('workorder'),
  type: z.enum([
    'workorder.created',
    'workorder.assigned',
    'workorder.status_changed',
    'workorder.scheduled',
    'workorder.started',
    'workorder.completed',
    'workorder.cancelled',
    'workorder.escalated',
    'workorder.rated',
  ]),
});
export type MaintenanceEvent = z.infer<typeof MaintenanceEventSchema>;

// Compliance events
export const ComplianceEventSchema = DomainEventSchema.extend({
  aggregateType: z.literal('compliance'),
  type: z.enum([
    'compliance.check_performed',
    'compliance.violation_detected',
    'compliance.violation_resolved',
    'compliance.disclosure_required',
    'compliance.disclosure_sent',
    'compliance.disclosure_acknowledged',
    'compliance.audit_scheduled',
    'compliance.audit_completed',
    'compliance.regulation_updated',
  ]),
});
export type ComplianceEvent = z.infer<typeof ComplianceEventSchema>;

// AI events
export const AIEventSchema = DomainEventSchema.extend({
  aggregateType: z.literal('ai'),
  type: z.enum([
    'ai.conversation_started',
    'ai.message_received',
    'ai.message_sent',
    'ai.function_called',
    'ai.handoff_initiated',
    'ai.conversation_ended',
    'ai.feedback_received',
    'ai.escalation_triggered',
    'ai.context_transferred',
  ]),
});
export type AIEvent = z.infer<typeof AIEventSchema>;

// User events
export const UserEventSchema = DomainEventSchema.extend({
  aggregateType: z.literal('user'),
  type: z.enum([
    'user.registered',
    'user.verified',
    'user.logged_in',
    'user.logged_out',
    'user.password_changed',
    'user.mfa_enabled',
    'user.mfa_disabled',
    'user.profile_updated',
    'user.suspended',
    'user.reactivated',
    'user.deleted',
  ]),
});
export type UserEvent = z.infer<typeof UserEventSchema>;

// Notification event (for sending notifications)
export const NotificationEventSchema = BaseEventSchema.extend({
  type: z.literal('notification.send'),
  payload: z.object({
    channel: z.enum(['email', 'sms', 'push', 'in_app']),
    templateId: z.string(),
    recipientId: UUIDSchema,
    recipientEmail: z.string().email().optional(),
    recipientPhone: z.string().optional(),
    data: z.record(z.unknown()),
    priority: EventPrioritySchema.default('normal'),
    scheduledAt: z.string().datetime().optional(),
  }),
});
export type NotificationEvent = z.infer<typeof NotificationEventSchema>;

// Job event (for background jobs)
export const JobEventSchema = BaseEventSchema.extend({
  type: z.string(),
  payload: z.object({
    jobName: z.string(),
    jobId: z.string(),
    data: z.record(z.unknown()),
    attempts: z.number().int().default(0),
    maxAttempts: z.number().int().default(3),
    delay: z.number().int().optional(), // ms
    priority: z.number().int().default(0),
    removeOnComplete: z.boolean().default(true),
    removeOnFail: z.boolean().default(false),
  }),
});
export type JobEvent = z.infer<typeof JobEventSchema>;

// Event subscription
export const EventSubscriptionSchema = z.object({
  id: UUIDSchema,
  name: z.string(),
  eventTypes: z.array(z.string()),
  endpoint: z.string().url(),
  secret: z.string(), // For webhook signature verification
  isActive: z.boolean().default(true),
  retryPolicy: z.object({
    maxRetries: z.number().int().default(3),
    initialDelay: z.number().int().default(1000), // ms
    maxDelay: z.number().int().default(60000),
    backoffMultiplier: z.number().default(2),
  }),
  filters: z.record(z.unknown()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type EventSubscription = z.infer<typeof EventSubscriptionSchema>;

// Event delivery record
export const EventDeliverySchema = z.object({
  id: UUIDSchema,
  eventId: UUIDSchema,
  subscriptionId: UUIDSchema,
  attempt: z.number().int(),
  status: z.enum(['pending', 'delivered', 'failed', 'retrying']),
  statusCode: z.number().int().optional(),
  response: z.string().optional(),
  error: z.string().optional(),
  deliveredAt: z.string().datetime().optional(),
  nextRetryAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});
export type EventDelivery = z.infer<typeof EventDeliverySchema>;

// Dead letter event (failed events)
export const DeadLetterEventSchema = z.object({
  id: UUIDSchema,
  originalEventId: UUIDSchema,
  event: DomainEventSchema,
  error: z.string(),
  failedAt: z.string().datetime(),
  retryCount: z.number().int(),
  lastRetryAt: z.string().datetime().optional(),
  resolvedAt: z.string().datetime().optional(),
  resolvedBy: UUIDSchema.optional(),
  resolution: z.string().optional(),
});
export type DeadLetterEvent = z.infer<typeof DeadLetterEventSchema>;
