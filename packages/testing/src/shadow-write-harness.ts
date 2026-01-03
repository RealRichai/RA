/**
 * Shadow Write Harness
 *
 * Implements dual-write pattern with fault injection support:
 * - Canonical write to primary store (must succeed)
 * - Shadow write to secondary store (may fail under chaos)
 * - Reads always from primary
 * - Records all shadow failures for observability
 */

import {
  FaultInjector,
  InjectedFaultError,
  getFaultInjector,
} from './fault-injector.js';

/**
 * Result of a shadow write operation
 */
export interface ShadowWriteResult<T> {
  /** The canonical result from primary write */
  canonical: T;
  /** Whether shadow write succeeded */
  shadowSuccess: boolean;
  /** Error if shadow write failed */
  shadowError?: Error;
  /** Fault ID if failure was injected */
  faultId?: string;
  /** Duration of shadow write in ms */
  shadowDurationMs: number;
}

/**
 * Configuration for the shadow write harness
 */
export interface ShadowWriteConfig {
  /** Name of the entity being written (for logging/metrics) */
  entityType: string;
  /** Custom fault injector (uses global by default) */
  faultInjector?: FaultInjector;
  /** Callback for recording shadow failures */
  onShadowFailure?: (failure: ShadowFailureRecord) => void | Promise<void>;
  /** Callback for recording metrics */
  onMetric?: (metric: ShadowWriteMetricEvent) => void;
}

/**
 * Record of a shadow write failure
 */
export interface ShadowFailureRecord {
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  error: Error;
  faultId?: string;
  requestId?: string;
  timestamp: Date;
  primarySuccess: boolean;
}

/**
 * Metric event for shadow writes
 */
export interface ShadowWriteMetricEvent {
  type: 'shadow_write_success' | 'shadow_write_failure' | 'shadow_write_duration';
  entityType: string;
  operation: 'create' | 'update' | 'delete';
  value: number;
  labels?: Record<string, string>;
}

/**
 * Aggregated metrics for shadow writes
 */
export interface ShadowWriteMetrics {
  totalWrites: number;
  shadowSuccesses: number;
  shadowFailures: number;
  injectedFaults: number;
  realErrors: number;
  avgShadowDurationMs: number;
}

/**
 * Generic store interface for shadow write operations
 */
export interface ShadowStore<T, ID = string> {
  create(data: T): Promise<T>;
  update(id: ID, data: Partial<T>): Promise<T>;
  delete(id: ID): Promise<void>;
  findById(id: ID): Promise<T | null>;
  findAll(options?: { limit?: number; offset?: number }): Promise<T[]>;
}

/**
 * Shadow Write Harness - Orchestrates dual-write with fault injection
 *
 * @example
 * ```typescript
 * const harness = new ShadowWriteHarness({
 *   entityType: 'Listing',
 *   onShadowFailure: async (failure) => {
 *     await evidenceService.emit({
 *       eventType: 'SHADOW_WRITE_FAILURE',
 *       ...failure
 *     });
 *   },
 *   onMetric: (metric) => {
 *     prometheusCounter.inc(metric.labels);
 *   }
 * });
 *
 * const result = await harness.create(
 *   primaryStore,
 *   shadowStore,
 *   listingData,
 *   { requestId: ctx.requestId }
 * );
 * ```
 */
export class ShadowWriteHarness<T extends { id: string }> {
  private readonly config: ShadowWriteConfig;
  private readonly faultInjector: FaultInjector;
  private metrics: ShadowWriteMetrics = {
    totalWrites: 0,
    shadowSuccesses: 0,
    shadowFailures: 0,
    injectedFaults: 0,
    realErrors: 0,
    avgShadowDurationMs: 0,
  };
  private totalShadowDurationMs = 0;

  constructor(config: ShadowWriteConfig) {
    this.config = config;
    this.faultInjector = config.faultInjector ?? getFaultInjector();
  }

  /**
   * Create with dual-write pattern
   *
   * 1. Write to primary (canonical) - must succeed
   * 2. Write to shadow - may fail under chaos
   * 3. Record any shadow failures
   */
  async create(
    primaryStore: ShadowStore<T>,
    shadowStore: ShadowStore<T>,
    data: Omit<T, 'id'> & { id?: string },
    context?: { requestId?: string }
  ): Promise<ShadowWriteResult<T>> {
    this.metrics.totalWrites++;

    // Step 1: Canonical write to primary (must succeed)
    const canonical = await primaryStore.create(data as T);

    // Step 2: Shadow write with fault injection
    const shadowStart = Date.now();
    let shadowSuccess = false;
    let shadowError: Error | undefined;
    let faultId: string | undefined;

    try {
      // Check for fault injection before shadow write
      this.faultInjector.maybeInjectFault(
        'shadow_write_only',
        `${this.config.entityType}:create`
      );

      // Attempt shadow write
      await shadowStore.create(canonical);
      shadowSuccess = true;
      this.metrics.shadowSuccesses++;
    } catch (error) {
      shadowSuccess = false;
      shadowError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof InjectedFaultError) {
        faultId = error.faultId;
        this.metrics.injectedFaults++;
      } else {
        this.metrics.realErrors++;
      }

      this.metrics.shadowFailures++;

      // Record failure
      await this.recordFailure({
        entityType: this.config.entityType,
        entityId: canonical.id,
        operation: 'create',
        error: shadowError,
        faultId,
        requestId: context?.requestId,
        timestamp: new Date(),
        primarySuccess: true,
      });
    }

    const shadowDurationMs = Date.now() - shadowStart;
    this.updateDurationMetrics(shadowDurationMs);
    this.emitMetrics('create', shadowSuccess, shadowDurationMs);

    return {
      canonical,
      shadowSuccess,
      shadowError,
      faultId,
      shadowDurationMs,
    };
  }

  /**
   * Update with dual-write pattern
   */
  async update(
    primaryStore: ShadowStore<T>,
    shadowStore: ShadowStore<T>,
    id: string,
    data: Partial<T>,
    context?: { requestId?: string }
  ): Promise<ShadowWriteResult<T>> {
    this.metrics.totalWrites++;

    // Step 1: Canonical update to primary
    const canonical = await primaryStore.update(id, data);

    // Step 2: Shadow update with fault injection
    const shadowStart = Date.now();
    let shadowSuccess = false;
    let shadowError: Error | undefined;
    let faultId: string | undefined;

    try {
      this.faultInjector.maybeInjectFault(
        'shadow_write_only',
        `${this.config.entityType}:update`
      );

      await shadowStore.update(id, data);
      shadowSuccess = true;
      this.metrics.shadowSuccesses++;
    } catch (error) {
      shadowSuccess = false;
      shadowError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof InjectedFaultError) {
        faultId = error.faultId;
        this.metrics.injectedFaults++;
      } else {
        this.metrics.realErrors++;
      }

      this.metrics.shadowFailures++;

      await this.recordFailure({
        entityType: this.config.entityType,
        entityId: id,
        operation: 'update',
        error: shadowError,
        faultId,
        requestId: context?.requestId,
        timestamp: new Date(),
        primarySuccess: true,
      });
    }

    const shadowDurationMs = Date.now() - shadowStart;
    this.updateDurationMetrics(shadowDurationMs);
    this.emitMetrics('update', shadowSuccess, shadowDurationMs);

    return {
      canonical,
      shadowSuccess,
      shadowError,
      faultId,
      shadowDurationMs,
    };
  }

  /**
   * Delete with dual-write pattern
   */
  async delete(
    primaryStore: ShadowStore<T>,
    shadowStore: ShadowStore<T>,
    id: string,
    context?: { requestId?: string }
  ): Promise<ShadowWriteResult<void> & { canonical: void }> {
    this.metrics.totalWrites++;

    // Step 1: Canonical delete from primary
    await primaryStore.delete(id);

    // Step 2: Shadow delete with fault injection
    const shadowStart = Date.now();
    let shadowSuccess = false;
    let shadowError: Error | undefined;
    let faultId: string | undefined;

    try {
      this.faultInjector.maybeInjectFault(
        'shadow_write_only',
        `${this.config.entityType}:delete`
      );

      await shadowStore.delete(id);
      shadowSuccess = true;
      this.metrics.shadowSuccesses++;
    } catch (error) {
      shadowSuccess = false;
      shadowError = error instanceof Error ? error : new Error(String(error));

      if (error instanceof InjectedFaultError) {
        faultId = error.faultId;
        this.metrics.injectedFaults++;
      } else {
        this.metrics.realErrors++;
      }

      this.metrics.shadowFailures++;

      await this.recordFailure({
        entityType: this.config.entityType,
        entityId: id,
        operation: 'delete',
        error: shadowError,
        faultId,
        requestId: context?.requestId,
        timestamp: new Date(),
        primarySuccess: true,
      });
    }

    const shadowDurationMs = Date.now() - shadowStart;
    this.updateDurationMetrics(shadowDurationMs);
    this.emitMetrics('delete', shadowSuccess, shadowDurationMs);

    return {
      canonical: undefined as void,
      shadowSuccess,
      shadowError,
      faultId,
      shadowDurationMs,
    };
  }

  /**
   * Read from primary store (shadow is write-only for reads)
   */
  async read(primaryStore: ShadowStore<T>, id: string): Promise<T | null> {
    return primaryStore.findById(id);
  }

  /**
   * Get current metrics
   */
  getMetrics(): ShadowWriteMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      totalWrites: 0,
      shadowSuccesses: 0,
      shadowFailures: 0,
      injectedFaults: 0,
      realErrors: 0,
      avgShadowDurationMs: 0,
    };
    this.totalShadowDurationMs = 0;
  }

  private async recordFailure(failure: ShadowFailureRecord): Promise<void> {
    if (this.config.onShadowFailure) {
      try {
        await this.config.onShadowFailure(failure);
      } catch {
        // Don't let failure recording break the flow
        console.error('[ShadowWriteHarness] Failed to record shadow failure');
      }
    }
  }

  private emitMetrics(
    operation: 'create' | 'update' | 'delete',
    success: boolean,
    durationMs: number
  ): void {
    if (!this.config.onMetric) return;

    this.config.onMetric({
      type: success ? 'shadow_write_success' : 'shadow_write_failure',
      entityType: this.config.entityType,
      operation,
      value: 1,
    });

    this.config.onMetric({
      type: 'shadow_write_duration',
      entityType: this.config.entityType,
      operation,
      value: durationMs,
    });
  }

  private updateDurationMetrics(durationMs: number): void {
    this.totalShadowDurationMs += durationMs;
    this.metrics.avgShadowDurationMs =
      this.totalShadowDurationMs / this.metrics.totalWrites;
  }
}

/**
 * Factory function for creating shadow write harness
 */
export function createShadowWriteHarness<T extends { id: string }>(
  config: ShadowWriteConfig
): ShadowWriteHarness<T> {
  return new ShadowWriteHarness<T>(config);
}
