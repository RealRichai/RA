/**
 * External Alerting Types
 *
 * Defines all types and Zod schemas for the alerting system.
 */

import { z } from 'zod';

// =============================================================================
// Alert Severity (matches existing AlertManager in agent-governance)
// =============================================================================

export const AlertSeveritySchema = z.enum(['info', 'warning', 'critical']);
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;

// =============================================================================
// Alert Source Types
// =============================================================================

export const AlertSourceSchema = z.enum([
  'kill_switch',
  'policy_violation',
  'dlq_growth',
  'compliance_failure',
  'queue_health',
  'cost_threshold',
  'system_error',
]);
export type AlertSource = z.infer<typeof AlertSourceSchema>;

// =============================================================================
// Provider Types
// =============================================================================

export const AlertProviderTypeSchema = z.enum(['slack', 'pagerduty', 'opsgenie']);
export type AlertProviderType = z.infer<typeof AlertProviderTypeSchema>;

// =============================================================================
// Alert Context (no PII allowed)
// =============================================================================

export const AlertContextSchema = z.object({
  tenantId: z.string().optional(),
  organizationId: z.string().optional(),
  market: z.string().optional(),
  agentType: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  requestId: z.string().optional(),
});
export type AlertContext = z.infer<typeof AlertContextSchema>;

// =============================================================================
// Alert Request (input to AlertRouter)
// =============================================================================

export const AlertRequestSchema = z.object({
  id: z.string().min(1),
  source: AlertSourceSchema,
  severity: AlertSeveritySchema,
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(4000),
  context: AlertContextSchema.optional(),
  targetProviders: z.array(AlertProviderTypeSchema).optional(),
  deduplicationKey: z.string().optional(),
  timestamp: z.date().default(() => new Date()),
  metadata: z.record(z.unknown()).optional(),
});
export type AlertRequest = z.infer<typeof AlertRequestSchema>;

// =============================================================================
// Alert Response (from providers)
// =============================================================================

export const AlertResponseSchema = z.object({
  providerId: AlertProviderTypeSchema,
  success: z.boolean(),
  providerAlertId: z.string().optional(),
  error: z.string().optional(),
  sentAt: z.date(),
  durationMs: z.number(),
});
export type AlertResponse = z.infer<typeof AlertResponseSchema>;

// =============================================================================
// Router Result (aggregated)
// =============================================================================

export const AlertRouterResultSchema = z.object({
  alertId: z.string(),
  responses: z.array(AlertResponseSchema),
  allSuccessful: z.boolean(),
  deduplicated: z.boolean(),
  evidenceRecorded: z.boolean(),
});
export type AlertRouterResult = z.infer<typeof AlertRouterResultSchema>;

// =============================================================================
// Provider Configurations
// =============================================================================

export interface SlackProviderConfig {
  webhookUrl: string;
  channel?: string;
  username?: string;
  iconEmoji?: string;
  enabled: boolean;
  timeoutMs?: number;
  retryAttempts?: number;
}

export interface PagerDutyProviderConfig {
  routingKey: string;
  apiUrl?: string;
  enabled: boolean;
  timeoutMs?: number;
  retryAttempts?: number;
}

export interface OpsGenieResponder {
  type: 'team' | 'user' | 'escalation' | 'schedule';
  id?: string;
  name?: string;
}

export interface OpsGenieProviderConfig {
  apiKey: string;
  apiUrl?: string;
  responders?: OpsGenieResponder[];
  enabled: boolean;
  timeoutMs?: number;
  retryAttempts?: number;
}

// =============================================================================
// Alerting Configuration
// =============================================================================

export interface RoutingConfig {
  info: AlertProviderType[];
  warning: AlertProviderType[];
  critical: AlertProviderType[];
}

export interface AlertingConfig {
  slack?: SlackProviderConfig;
  pagerduty?: PagerDutyProviderConfig;
  opsgenie?: OpsGenieProviderConfig;
  routing: RoutingConfig;
  cooldownSeconds: number;
  retryAttempts: number;
  timeoutMs: number;
}

// =============================================================================
// Default Configuration
// =============================================================================

export const DEFAULT_ALERTING_CONFIG: Omit<AlertingConfig, 'slack' | 'pagerduty' | 'opsgenie'> = {
  routing: {
    info: ['slack'],
    warning: ['slack', 'opsgenie'],
    critical: ['slack', 'pagerduty', 'opsgenie'],
  },
  cooldownSeconds: 300,
  retryAttempts: 3,
  timeoutMs: 10000,
};

// =============================================================================
// Evidence Types
// =============================================================================

export interface AlertEvidenceInput {
  alert: AlertRequest;
  result: AlertRouterResult;
  organizationId?: string;
  tenantId?: string;
}

export interface AlertEvidenceRecord {
  controlId: string;
  category: 'Security';
  eventType: 'alert.dispatched' | 'alert.failed' | 'alert.deduplicated';
  eventOutcome: 'success' | 'failure' | 'blocked';
  summary: string;
  scope: 'org' | 'tenant' | 'user';
  actorType: 'system';
  details: {
    alertId: string;
    source: AlertSource;
    severity: AlertSeverity;
    providers: AlertProviderType[];
    successCount: number;
    failureCount: number;
  };
}
