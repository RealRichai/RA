/**
 * Shadow Write Metrics
 *
 * Prometheus metrics for shadow write operations and discrepancy detection.
 */

import client from 'prom-client';

// Get the default registry
const register = client.register;

// =============================================================================
// Shadow Write Metrics
// =============================================================================

/**
 * Counter for shadow write failures
 */
export const shadowWriteFailuresTotal = new client.Counter({
  name: 'shadow_write_failures_total',
  help: 'Total number of shadow write failures',
  labelNames: ['entity_type', 'operation', 'failure_type'],
  registers: [register],
});

/**
 * Counter for shadow write successes
 */
export const shadowWriteSuccessesTotal = new client.Counter({
  name: 'shadow_write_successes_total',
  help: 'Total number of successful shadow writes',
  labelNames: ['entity_type', 'operation'],
  registers: [register],
});

/**
 * Histogram for shadow write duration
 */
export const shadowWriteDuration = new client.Histogram({
  name: 'shadow_write_duration_seconds',
  help: 'Shadow write duration in seconds',
  labelNames: ['entity_type', 'operation', 'success'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

/**
 * Counter for discrepancies found
 */
export const shadowDiscrepanciesTotal = new client.Counter({
  name: 'shadow_discrepancies_total',
  help: 'Total number of discrepancies found between primary and shadow stores',
  labelNames: ['entity_type', 'discrepancy_type'],
  registers: [register],
});

/**
 * Gauge for last discrepancy check timestamp
 */
export const lastDiscrepancyCheck = new client.Gauge({
  name: 'shadow_discrepancy_last_check_timestamp',
  help: 'Timestamp of last discrepancy check',
  labelNames: ['entity_type'],
  registers: [register],
});

/**
 * Counter for chaos injected faults
 */
export const chaosInjectedFaultsTotal = new client.Counter({
  name: 'chaos_injected_faults_total',
  help: 'Total number of faults injected by chaos engineering',
  labelNames: ['entity_type', 'operation'],
  registers: [register],
});

// =============================================================================
// Metric Recording Functions
// =============================================================================

export interface ShadowWriteMetricLabels {
  entityType: string;
  operation: 'create' | 'update' | 'delete';
}

/**
 * Record a shadow write success
 */
export function recordShadowWriteSuccess(labels: ShadowWriteMetricLabels): void {
  shadowWriteSuccessesTotal.inc({
    entity_type: labels.entityType,
    operation: labels.operation,
  });
}

/**
 * Record a shadow write failure
 */
export function recordShadowWriteFailure(
  labels: ShadowWriteMetricLabels,
  isInjectedFault: boolean
): void {
  shadowWriteFailuresTotal.inc({
    entity_type: labels.entityType,
    operation: labels.operation,
    failure_type: isInjectedFault ? 'injected' : 'real',
  });

  if (isInjectedFault) {
    chaosInjectedFaultsTotal.inc({
      entity_type: labels.entityType,
      operation: labels.operation,
    });
  }
}

/**
 * Record shadow write duration
 */
export function recordShadowWriteDuration(
  labels: ShadowWriteMetricLabels,
  durationMs: number,
  success: boolean
): void {
  shadowWriteDuration.observe(
    {
      entity_type: labels.entityType,
      operation: labels.operation,
      success: success ? 'true' : 'false',
    },
    durationMs / 1000
  );
}

/**
 * Record a discrepancy found
 */
export function recordDiscrepancy(
  entityType: string,
  discrepancyType: 'missing_in_shadow' | 'missing_in_primary' | 'data_mismatch'
): void {
  shadowDiscrepanciesTotal.inc({
    entity_type: entityType,
    discrepancy_type: discrepancyType,
  });
}

/**
 * Update last discrepancy check timestamp
 */
export function updateLastDiscrepancyCheck(entityType: string): void {
  lastDiscrepancyCheck.set(
    { entity_type: entityType },
    Date.now() / 1000
  );
}
