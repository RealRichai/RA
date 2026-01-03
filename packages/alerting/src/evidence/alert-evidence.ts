/**
 * Alert Evidence Emitter
 *
 * Records evidence for alert dispatch events for SOC2 compliance.
 * Fire-and-forget, non-blocking implementation.
 */

import { logger } from '@realriches/utils';

import type { AlertRequest, AlertRouterResult, AlertProviderType } from '../types';

// =============================================================================
// Evidence Types
// =============================================================================

export interface AlertEvidenceInput {
  alert: AlertRequest;
  result: AlertRouterResult;
  outcome: 'success' | 'failure' | 'deduplicated';
  organizationId?: string;
  tenantId?: string;
}

export interface AlertEvidenceRecord {
  controlId: string;
  category: 'Security';
  eventType: 'alert.dispatched' | 'alert.failed' | 'alert.deduplicated';
  eventOutcome: 'success' | 'failure' | 'blocked';
  summary: string;
  scope: 'org' | 'tenant';
  actorType: 'system';
  organizationId?: string;
  tenantId?: string;
  details: {
    alertId: string;
    source: string;
    severity: string;
    providers: AlertProviderType[];
    successCount: number;
    failureCount: number;
    deduplicated: boolean;
  };
  occurredAt: Date;
}

// =============================================================================
// PII Sanitization
// =============================================================================

/**
 * List of keys that may contain PII and should be excluded from evidence
 */
const PII_KEYS = new Set([
  'email',
  'phone',
  'ssn',
  'socialSecurityNumber',
  'creditCard',
  'password',
  'token',
  'apiKey',
  'secret',
  'firstName',
  'lastName',
  'name',
  'address',
  'dob',
  'dateOfBirth',
  'ipAddress',
]);

/**
 * Sanitize an object by removing potential PII fields
 */
function sanitizeForEvidence(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip PII keys
    if (PII_KEYS.has(key.toLowerCase())) {
      continue;
    }

    // Recursively sanitize nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeForEvidence(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      // Sanitize arrays of objects
      sanitized[key] = value.map((item): unknown =>
        typeof item === 'object' && item !== null
          ? sanitizeForEvidence(item as Record<string, unknown>)
          : item
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// =============================================================================
// Evidence Emitter
// =============================================================================

/**
 * Emit evidence record for an alert dispatch event.
 * This is a synchronous function that logs the evidence record.
 * In production, this would integrate with the EvidenceService.
 */
export function emitAlertEvidence(input: AlertEvidenceInput): void {
  const { alert, result, outcome, organizationId, tenantId } = input;

  // Determine event type and outcome
  let eventType: AlertEvidenceRecord['eventType'];
  let eventOutcome: AlertEvidenceRecord['eventOutcome'];

  if (outcome === 'deduplicated') {
    eventType = 'alert.deduplicated';
    eventOutcome = 'blocked';
  } else if (outcome === 'success') {
    eventType = 'alert.dispatched';
    eventOutcome = 'success';
  } else {
    eventType = 'alert.failed';
    eventOutcome = 'failure';
  }

  // Build summary
  const successCount = result.responses.filter((r) => r.success).length;
  const failureCount = result.responses.filter((r) => !r.success).length;
  const providers = result.responses.map((r) => r.providerId);

  let summary: string;
  if (outcome === 'deduplicated') {
    summary = `Alert ${alert.id} deduplicated (cooldown active)`;
  } else if (outcome === 'success') {
    summary = `Alert ${alert.id} dispatched to ${providers.join(', ')}`;
  } else {
    summary = `Alert ${alert.id} failed: ${failureCount}/${result.responses.length} providers failed`;
  }

  // Build evidence record
  const record: AlertEvidenceRecord = {
    controlId: 'CC7.4', // Communication procedures
    category: 'Security',
    eventType,
    eventOutcome,
    summary,
    scope: tenantId ? 'tenant' : 'org',
    actorType: 'system',
    organizationId,
    tenantId,
    details: {
      alertId: alert.id,
      source: alert.source,
      severity: alert.severity,
      providers,
      successCount,
      failureCount,
      deduplicated: result.deduplicated,
    },
    occurredAt: new Date(),
  };

  // Log the evidence record
  logger.info({
    msg: 'alert_evidence',
    ...record,
    details: sanitizeForEvidence(record.details as unknown as Record<string, unknown>),
  });
}

// =============================================================================
// Evidence Query Helpers
// =============================================================================

/**
 * Build a standardized alert ID for evidence correlation
 */
export function buildAlertEvidenceId(source: string, entityId?: string): string {
  const timestamp = Date.now();
  const suffix = entityId ? `_${entityId}` : '';
  return `alert_${source}${suffix}_${timestamp}`;
}
