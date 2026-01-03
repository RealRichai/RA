/**
 * SLO Metrics Stubs
 *
 * Minimal metrics collection for SLO tracking without vendor lock-in.
 * Designed to be compatible with Prometheus, OpenTelemetry, or custom backends.
 *
 * Metrics tracked:
 * - API request latency (p50, p95, p99)
 * - Error rate by endpoint
 * - Queue depth (background jobs)
 * - Conversion success rate (3D tours)
 *
 * @example
 * // Record request latency
 * metrics.recordLatency('api', '/users', 150);
 *
 * // Increment error count
 * metrics.recordError('api', '/users', 500);
 *
 * // Get current SLO status
 * const status = metrics.getSLOStatus();
 */

// =============================================================================
// Types
// =============================================================================

export interface MetricPoint {
  timestamp: number;
  value: number;
  labels: Record<string, string>;
}

export interface LatencyHistogram {
  count: number;
  sum: number;
  buckets: Map<number, number>; // bucket upper bound -> count
  values: number[]; // For percentile calculation
}

export interface SLOTarget {
  name: string;
  target: number;
  current: number;
  status: 'healthy' | 'warning' | 'critical';
}

export interface SLOStatus {
  timestamp: number;
  slos: SLOTarget[];
  overall: 'healthy' | 'warning' | 'critical';
}

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
const MAX_VALUES_STORED = 10000; // For percentile calculation

// SLO Targets
const SLO_TARGETS = {
  p95_latency_ms: 500,      // 500ms p95 latency target
  error_rate_percent: 1,    // 1% error rate target
  queue_depth_max: 1000,    // Max 1000 jobs in queue
  conversion_success_rate: 95, // 95% conversion success target
};

// =============================================================================
// Metrics Store
// =============================================================================

class MetricsStore {
  private latencyHistograms: Map<string, LatencyHistogram> = new Map();
  private errorCounts: Map<string, number> = new Map();
  private requestCounts: Map<string, number> = new Map();
  private queueDepth: number = 0;
  private conversionAttempts: number = 0;
  private conversionSuccesses: number = 0;
  private lastReset: number = Date.now();

  // ===========================================================================
  // Latency Metrics
  // ===========================================================================

  /**
   * Record a latency measurement in milliseconds.
   */
  recordLatency(service: string, endpoint: string, durationMs: number): void {
    const key = `${service}:${endpoint}`;
    let histogram = this.latencyHistograms.get(key);

    if (!histogram) {
      histogram = {
        count: 0,
        sum: 0,
        buckets: new Map(DEFAULT_BUCKETS.map((b) => [b, 0])),
        values: [],
      };
      this.latencyHistograms.set(key, histogram);
    }

    histogram.count++;
    histogram.sum += durationMs;

    // Update bucket counts
    for (const bucket of DEFAULT_BUCKETS) {
      if (durationMs <= bucket) {
        histogram.buckets.set(bucket, (histogram.buckets.get(bucket) || 0) + 1);
      }
    }

    // Store value for percentile calculation (with cap)
    if (histogram.values.length < MAX_VALUES_STORED) {
      histogram.values.push(durationMs);
    } else {
      // Reservoir sampling for large datasets
      const idx = Math.floor(Math.random() * histogram.count);
      if (idx < MAX_VALUES_STORED) {
        histogram.values[idx] = durationMs;
      }
    }

    // Track request count
    this.requestCounts.set(key, (this.requestCounts.get(key) || 0) + 1);
  }

  /**
   * Get latency percentile for a service/endpoint.
   */
  getLatencyPercentile(service: string, endpoint: string, percentile: number): number {
    const key = `${service}:${endpoint}`;
    const histogram = this.latencyHistograms.get(key);

    if (!histogram || histogram.values.length === 0) {
      return 0;
    }

    const sorted = [...histogram.values].sort((a, b) => a - b);
    const idx = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)] || 0;
  }

  /**
   * Get overall p95 latency across all endpoints.
   */
  getOverallP95(): number {
    const allValues: number[] = [];

    for (const histogram of this.latencyHistograms.values()) {
      allValues.push(...histogram.values);
    }

    if (allValues.length === 0) return 0;

    const sorted = allValues.sort((a, b) => a - b);
    const idx = Math.ceil(0.95 * sorted.length) - 1;
    return sorted[Math.max(0, idx)] || 0;
  }

  // ===========================================================================
  // Error Rate Metrics
  // ===========================================================================

  /**
   * Record an error occurrence.
   */
  recordError(service: string, endpoint: string, statusCode: number): void {
    const key = `${service}:${endpoint}:${statusCode}`;
    this.errorCounts.set(key, (this.errorCounts.get(key) || 0) + 1);

    // Also track in general endpoint errors
    const endpointKey = `${service}:${endpoint}:error`;
    this.errorCounts.set(endpointKey, (this.errorCounts.get(endpointKey) || 0) + 1);
  }

  /**
   * Get error rate as a percentage.
   */
  getErrorRate(service: string, endpoint: string): number {
    const requestKey = `${service}:${endpoint}`;
    const errorKey = `${service}:${endpoint}:error`;

    const requests = this.requestCounts.get(requestKey) || 0;
    const errors = this.errorCounts.get(errorKey) || 0;

    if (requests === 0) return 0;
    return (errors / requests) * 100;
  }

  /**
   * Get overall error rate.
   */
  getOverallErrorRate(): number {
    let totalRequests = 0;
    let totalErrors = 0;

    for (const [, count] of this.requestCounts) {
      totalRequests += count;
    }

    for (const [key, count] of this.errorCounts) {
      if (key.endsWith(':error')) {
        totalErrors += count;
      }
    }

    if (totalRequests === 0) return 0;
    return (totalErrors / totalRequests) * 100;
  }

  // ===========================================================================
  // Queue Depth Metrics
  // ===========================================================================

  /**
   * Set current queue depth.
   */
  setQueueDepth(depth: number): void {
    this.queueDepth = depth;
  }

  /**
   * Increment queue depth.
   */
  incrementQueueDepth(delta: number = 1): void {
    this.queueDepth += delta;
  }

  /**
   * Decrement queue depth.
   */
  decrementQueueDepth(delta: number = 1): void {
    this.queueDepth = Math.max(0, this.queueDepth - delta);
  }

  /**
   * Get current queue depth.
   */
  getQueueDepth(): number {
    return this.queueDepth;
  }

  // ===========================================================================
  // Conversion Metrics
  // ===========================================================================

  /**
   * Record a conversion attempt.
   */
  recordConversionAttempt(): void {
    this.conversionAttempts++;
  }

  /**
   * Record a successful conversion.
   */
  recordConversionSuccess(): void {
    this.conversionSuccesses++;
  }

  /**
   * Record a failed conversion.
   */
  recordConversionFailure(): void {
    // Attempt was already recorded, nothing extra needed
  }

  /**
   * Get conversion success rate as a percentage.
   */
  getConversionSuccessRate(): number {
    if (this.conversionAttempts === 0) return 100; // No attempts = healthy
    return (this.conversionSuccesses / this.conversionAttempts) * 100;
  }

  // ===========================================================================
  // SLO Status
  // ===========================================================================

  /**
   * Get current SLO status.
   */
  getSLOStatus(): SLOStatus {
    const p95 = this.getOverallP95();
    const errorRate = this.getOverallErrorRate();
    const queueDepth = this.getQueueDepth();
    const conversionRate = this.getConversionSuccessRate();

    const slos: SLOTarget[] = [
      {
        name: 'p95_latency_ms',
        target: SLO_TARGETS.p95_latency_ms,
        current: p95,
        status: this.getSLOHealth(p95, SLO_TARGETS.p95_latency_ms, 'lower'),
      },
      {
        name: 'error_rate_percent',
        target: SLO_TARGETS.error_rate_percent,
        current: errorRate,
        status: this.getSLOHealth(errorRate, SLO_TARGETS.error_rate_percent, 'lower'),
      },
      {
        name: 'queue_depth',
        target: SLO_TARGETS.queue_depth_max,
        current: queueDepth,
        status: this.getSLOHealth(queueDepth, SLO_TARGETS.queue_depth_max, 'lower'),
      },
      {
        name: 'conversion_success_rate',
        target: SLO_TARGETS.conversion_success_rate,
        current: conversionRate,
        status: this.getSLOHealth(conversionRate, SLO_TARGETS.conversion_success_rate, 'higher'),
      },
    ];

    const criticalCount = slos.filter((s) => s.status === 'critical').length;
    const warningCount = slos.filter((s) => s.status === 'warning').length;

    let overall: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (criticalCount > 0) overall = 'critical';
    else if (warningCount > 0) overall = 'warning';

    return {
      timestamp: Date.now(),
      slos,
      overall,
    };
  }

  private getSLOHealth(
    current: number,
    target: number,
    direction: 'lower' | 'higher'
  ): 'healthy' | 'warning' | 'critical' {
    if (direction === 'lower') {
      if (current <= target) return 'healthy';
      if (current <= target * 1.5) return 'warning';
      return 'critical';
    } else {
      if (current >= target) return 'healthy';
      if (current >= target * 0.9) return 'warning';
      return 'critical';
    }
  }

  // ===========================================================================
  // Export & Reset
  // ===========================================================================

  /**
   * Export metrics in Prometheus format.
   */
  toPrometheusFormat(): string {
    const lines: string[] = [];

    // Latency histograms
    for (const [key, histogram] of this.latencyHistograms) {
      const [service, endpoint] = key.split(':');
      const labels = `service="${service}",endpoint="${endpoint}"`;

      lines.push(`# HELP http_request_duration_ms HTTP request latency in milliseconds`);
      lines.push(`# TYPE http_request_duration_ms histogram`);

      for (const [bucket, count] of histogram.buckets) {
        lines.push(`http_request_duration_ms_bucket{${labels},le="${bucket}"} ${count}`);
      }
      lines.push(`http_request_duration_ms_bucket{${labels},le="+Inf"} ${histogram.count}`);
      lines.push(`http_request_duration_ms_sum{${labels}} ${histogram.sum}`);
      lines.push(`http_request_duration_ms_count{${labels}} ${histogram.count}`);
    }

    // Error counts
    lines.push(`# HELP http_requests_errors_total Total HTTP errors`);
    lines.push(`# TYPE http_requests_errors_total counter`);
    for (const [key, count] of this.errorCounts) {
      if (!key.endsWith(':error')) {
        const [service, endpoint, code] = key.split(':');
        lines.push(`http_requests_errors_total{service="${service}",endpoint="${endpoint}",code="${code}"} ${count}`);
      }
    }

    // Queue depth
    lines.push(`# HELP job_queue_depth Current number of jobs in queue`);
    lines.push(`# TYPE job_queue_depth gauge`);
    lines.push(`job_queue_depth ${this.queueDepth}`);

    // Conversion rate
    lines.push(`# HELP tour_conversion_total Total tour conversion attempts`);
    lines.push(`# TYPE tour_conversion_total counter`);
    lines.push(`tour_conversion_total{result="success"} ${this.conversionSuccesses}`);
    lines.push(`tour_conversion_total{result="failure"} ${this.conversionAttempts - this.conversionSuccesses}`);

    return lines.join('\n');
  }

  /**
   * Reset all metrics (for testing or periodic reset).
   */
  reset(): void {
    this.latencyHistograms.clear();
    this.errorCounts.clear();
    this.requestCounts.clear();
    this.queueDepth = 0;
    this.conversionAttempts = 0;
    this.conversionSuccesses = 0;
    this.lastReset = Date.now();
  }

  /**
   * Get metrics summary as JSON.
   */
  toJSON(): Record<string, unknown> {
    return {
      timestamp: Date.now(),
      window_start: this.lastReset,
      latency: {
        p50: this.getOverallP95() * 0.5, // Approximation
        p95: this.getOverallP95(),
        p99: this.getOverallP95() * 1.3, // Approximation
      },
      error_rate_percent: this.getOverallErrorRate(),
      queue_depth: this.queueDepth,
      conversion: {
        attempts: this.conversionAttempts,
        successes: this.conversionSuccesses,
        rate_percent: this.getConversionSuccessRate(),
      },
      slo_status: this.getSLOStatus(),
    };
  }
}

// =============================================================================
// Singleton Export
// =============================================================================

export const metrics = new MetricsStore();

// Convenience exports
export const recordLatency = metrics.recordLatency.bind(metrics);
export const recordError = metrics.recordError.bind(metrics);
export const setQueueDepth = metrics.setQueueDepth.bind(metrics);
export const incrementQueueDepth = metrics.incrementQueueDepth.bind(metrics);
export const decrementQueueDepth = metrics.decrementQueueDepth.bind(metrics);
export const recordConversionAttempt = metrics.recordConversionAttempt.bind(metrics);
export const recordConversionSuccess = metrics.recordConversionSuccess.bind(metrics);
export const recordConversionFailure = metrics.recordConversionFailure.bind(metrics);
export const getSLOStatus = metrics.getSLOStatus.bind(metrics);
export const getMetricsJSON = metrics.toJSON.bind(metrics);
export const getMetricsPrometheus = metrics.toPrometheusFormat.bind(metrics);
export const resetMetrics = metrics.reset.bind(metrics);
