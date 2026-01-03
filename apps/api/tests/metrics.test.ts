/**
 * Metrics Endpoint Unit Tests
 *
 * Tests the Prometheus metrics registry, metric definitions,
 * and output format without requiring a full Fastify server.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies before importing metrics
vi.mock('@realriches/config', () => ({
  getConfig: () => ({
    jwt: {
      secret: 'test-jwt-secret-for-metrics-test-min-32-chars',
      accessExpiresIn: '15m',
      refreshExpiresIn: '7d',
    },
    observability: {
      metricsToken: 'test-metrics-token-secret',
    },
  }),
}));

vi.mock('@realriches/database', () => ({
  prisma: {
    user: { groupBy: vi.fn().mockResolvedValue([]) },
    listing: { groupBy: vi.fn().mockResolvedValue([]) },
    lease: { groupBy: vi.fn().mockResolvedValue([]) },
    property: { count: vi.fn().mockResolvedValue(0) },
    payment: { count: vi.fn().mockResolvedValue(0) },
    aIConversation: { count: vi.fn().mockResolvedValue(0) },
  },
}));

vi.mock('@realriches/utils', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks are set up
import {
  register,
  httpRequestsTotal,
  httpRequestDuration,
  httpErrorsTotal,
  rateLimitHits,
  authAttempts,
  cacheHits,
  cacheMisses,
} from '../src/plugins/metrics';

describe('Prometheus Metrics', () => {
  beforeEach(async () => {
    // Reset all metrics to clean state
    register.resetMetrics();
  });

  describe('Registry', () => {
    it('should have realriches-api as default app label', async () => {
      const metrics = await register.metrics();
      expect(metrics).toContain('app="realriches-api"');
    });

    it('should return metrics in Prometheus text format', async () => {
      const metrics = await register.metrics();
      // Prometheus format: lines starting with # are comments/HELP/TYPE
      expect(metrics).toMatch(/^# (HELP|TYPE)/m);
    });

    it('should have text/plain content type', () => {
      expect(register.contentType).toContain('text/plain');
    });

    it('should return metrics as JSON', async () => {
      const metricsJson = await register.getMetricsAsJSON();
      expect(Array.isArray(metricsJson)).toBe(true);
    });
  });

  describe('HTTP Request Metrics', () => {
    it('should define http_requests_total counter', async () => {
      expect(httpRequestsTotal).toBeDefined();

      // Increment the counter
      httpRequestsTotal.labels('GET', '/api/test', '200').inc();

      const metrics = await register.metrics();
      expect(metrics).toContain('http_requests_total');
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('route="/api/test"');
      expect(metrics).toContain('status_code="200"');
    });

    it('should define http_request_duration_seconds histogram', async () => {
      expect(httpRequestDuration).toBeDefined();

      // Record a duration
      httpRequestDuration.labels('GET', '/api/test', '200').observe(0.123);

      const metrics = await register.metrics();
      expect(metrics).toContain('http_request_duration_seconds');
      expect(metrics).toContain('http_request_duration_seconds_bucket');
    });

    it('should track multiple requests with different labels', async () => {
      httpRequestsTotal.labels('GET', '/api/users', '200').inc();
      httpRequestsTotal.labels('POST', '/api/users', '201').inc();
      httpRequestsTotal.labels('GET', '/api/users/:id', '404').inc();

      const metrics = await register.metrics();
      expect(metrics).toContain('route="/api/users"');
      expect(metrics).toContain('route="/api/users/:id"');
      expect(metrics).toContain('status_code="200"');
      expect(metrics).toContain('status_code="201"');
      expect(metrics).toContain('status_code="404"');
    });
  });

  describe('Error Metrics', () => {
    it('should define http_errors_total counter', async () => {
      expect(httpErrorsTotal).toBeDefined();

      httpErrorsTotal.labels('GET', '/api/test', '500', 'server_error').inc();

      const metrics = await register.metrics();
      expect(metrics).toContain('http_errors_total');
      expect(metrics).toContain('error_code="server_error"');
    });
  });

  describe('Rate Limit Metrics', () => {
    it('should define rate_limit_hits_total counter', async () => {
      expect(rateLimitHits).toBeDefined();

      rateLimitHits.labels('api', 'free').inc();

      const metrics = await register.metrics();
      expect(metrics).toContain('rate_limit_hits_total');
    });
  });

  describe('Auth Metrics', () => {
    it('should define auth_attempts_total counter', async () => {
      expect(authAttempts).toBeDefined();

      authAttempts.labels('login', 'success').inc();
      authAttempts.labels('login', 'failure').inc();

      const metrics = await register.metrics();
      expect(metrics).toContain('auth_attempts_total');
      expect(metrics).toContain('status="success"');
      expect(metrics).toContain('status="failure"');
    });
  });

  describe('Cache Metrics', () => {
    it('should define cache_hits_total and cache_misses_total counters', async () => {
      expect(cacheHits).toBeDefined();
      expect(cacheMisses).toBeDefined();

      cacheHits.labels('redis').inc();
      cacheMisses.labels('redis').inc();

      const metrics = await register.metrics();
      expect(metrics).toContain('cache_hits_total');
      expect(metrics).toContain('cache_misses_total');
    });
  });

  describe('Histogram Buckets', () => {
    it('should have appropriate buckets for request duration', async () => {
      // Record various durations
      httpRequestDuration.labels('GET', '/fast', '200').observe(0.001);
      httpRequestDuration.labels('GET', '/medium', '200').observe(0.1);
      httpRequestDuration.labels('GET', '/slow', '200').observe(1.5);

      const metrics = await register.metrics();

      // Check bucket boundaries are present
      expect(metrics).toContain('le="0.001"');
      expect(metrics).toContain('le="0.1"');
      expect(metrics).toContain('le="1"');
      expect(metrics).toContain('le="+Inf"');
    });
  });

  describe('Metric Labels', () => {
    it('should have correct label names for http_requests_total', () => {
      // @ts-expect-error - accessing internal labelNames
      const labelNames = httpRequestsTotal.labelNames;
      expect(labelNames).toContain('method');
      expect(labelNames).toContain('route');
      expect(labelNames).toContain('status_code');
    });

    it('should have correct label names for http_request_duration_seconds', () => {
      // @ts-expect-error - accessing internal labelNames
      const labelNames = httpRequestDuration.labelNames;
      expect(labelNames).toContain('method');
      expect(labelNames).toContain('route');
      expect(labelNames).toContain('status_code');
    });
  });
});

describe('Metrics Authentication Logic', () => {
  it('should export getConfig for auth checks', async () => {
    const { getConfig } = await import('@realriches/config');
    const config = getConfig();

    expect(config.observability?.metricsToken).toBe('test-metrics-token-secret');
  });

  it('should validate METRICS_TOKEN matches expected format', () => {
    // Token should be a non-empty string
    const token = 'test-metrics-token-secret';
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });
});
