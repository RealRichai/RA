/**
 * OpenTelemetry Smoke Tests
 *
 * Tests that OTEL initialization works correctly in various configurations:
 * - Disabled (default in dev)
 * - Enabled without endpoint
 * - Enabled with endpoint
 * - Works when env vars are missing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original env
const originalEnv = { ...process.env };

describe('OpenTelemetry Instrumentation', () => {
  beforeEach(() => {
    // Reset module cache to get fresh imports
    vi.resetModules();
    // Reset env
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore env
    process.env = originalEnv;
  });

  describe('Configuration', () => {
    it('should be disabled by default in development', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.OTEL_ENABLED;
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

      const { getOtelConfiguration, isOtelEnabled } = await import('../src/instrumentation');

      const config = getOtelConfiguration();
      expect(config.enabled).toBe(false);
      expect(isOtelEnabled()).toBe(false);
    });

    it('should be enabled when OTEL_ENABLED=true is set', async () => {
      process.env.OTEL_ENABLED = 'true';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';

      const { getOtelConfiguration } = await import('../src/instrumentation');

      const config = getOtelConfiguration();
      expect(config.enabled).toBe(true);
      expect(config.otlpEndpoint).toBe('http://localhost:4318');
    });

    it('should use default service name when not set', async () => {
      delete process.env.OTEL_SERVICE_NAME;

      const { getOtelConfiguration } = await import('../src/instrumentation');

      const config = getOtelConfiguration();
      expect(config.serviceName).toBe('realriches-api');
    });

    it('should use custom service name when set', async () => {
      process.env.OTEL_SERVICE_NAME = 'my-custom-service';

      const { getOtelConfiguration } = await import('../src/instrumentation');

      const config = getOtelConfiguration();
      expect(config.serviceName).toBe('my-custom-service');
    });

    it('should parse OTEL_ENABLED=1 as true', async () => {
      process.env.OTEL_ENABLED = '1';
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';

      const { getOtelConfiguration } = await import('../src/instrumentation');

      const config = getOtelConfiguration();
      expect(config.enabled).toBe(true);
    });

    it('should parse OTEL_ENABLED=false as false', async () => {
      process.env.OTEL_ENABLED = 'false';

      const { getOtelConfiguration } = await import('../src/instrumentation');

      const config = getOtelConfiguration();
      expect(config.enabled).toBe(false);
    });

    it('should use environment from NODE_ENV', async () => {
      process.env.NODE_ENV = 'staging';

      const { getOtelConfiguration } = await import('../src/instrumentation');

      const config = getOtelConfiguration();
      expect(config.environment).toBe('staging');
    });

    it('should default to otlp exporter', async () => {
      delete process.env.OTEL_TRACES_EXPORTER;

      const { getOtelConfiguration } = await import('../src/instrumentation');

      const config = getOtelConfiguration();
      expect(config.tracesExporter).toBe('otlp');
    });
  });

  describe('Initialization', () => {
    it('should not crash when OTEL is disabled', async () => {
      process.env.NODE_ENV = 'test';
      process.env.OTEL_ENABLED = 'false';

      // This should not throw
      const module = await import('../src/instrumentation');

      expect(module.isOtelEnabled).toBeDefined();
      expect(module.shutdownOtel).toBeDefined();
      expect(module.getOtelConfiguration).toBeDefined();
    });

    it('should not crash when OTEL endpoint is missing', async () => {
      process.env.OTEL_ENABLED = 'true';
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

      // This should not throw (just logs a warning)
      const module = await import('../src/instrumentation');

      expect(module.isOtelEnabled).toBeDefined();
    });

    it('should provide shutdown function', async () => {
      process.env.OTEL_ENABLED = 'false';

      const { shutdownOtel } = await import('../src/instrumentation');

      // Should not throw
      await expect(shutdownOtel()).resolves.not.toThrow();
    });
  });

  describe('Tree-shaking', () => {
    it('should allow importing without side effects when disabled', async () => {
      process.env.NODE_ENV = 'test';
      process.env.OTEL_ENABLED = 'false';

      // The module should be importable without starting OTEL
      const { isOtelEnabled, getOtelConfiguration } = await import('../src/instrumentation');

      expect(isOtelEnabled()).toBe(false);
      expect(getOtelConfiguration().enabled).toBe(false);
    });
  });
});

describe('OpenTelemetry Plugin', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'test';
    process.env.OTEL_ENABLED = 'false';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should export otelPlugin', async () => {
    const { otelPlugin } = await import('../src/plugins/otel');

    expect(otelPlugin).toBeDefined();
    expect(typeof otelPlugin).toBe('function');
  });

  it('should have default ignore paths', async () => {
    // The plugin should ignore health and metrics endpoints by default
    // This is a structural test - actual behavior requires Fastify integration
    const { otelPlugin } = await import('../src/plugins/otel');

    expect(otelPlugin).toBeDefined();
  });
});

describe('Local Development', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should work without any OTEL env vars set', async () => {
    // Clear all OTEL-related env vars
    delete process.env.OTEL_ENABLED;
    delete process.env.OTEL_SERVICE_NAME;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_TRACES_EXPORTER;
    delete process.env.OTEL_LOG_LEVEL;
    process.env.NODE_ENV = 'development';

    // This should not throw
    const { isOtelEnabled, getOtelConfiguration } = await import('../src/instrumentation');

    expect(isOtelEnabled()).toBe(false);

    const config = getOtelConfiguration();
    expect(config.serviceName).toBe('realriches-api');
    expect(config.environment).toBe('development');
    expect(config.tracesExporter).toBe('otlp');
  });

  it('should work in production without OTLP endpoint', async () => {
    delete process.env.OTEL_ENABLED;
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    process.env.NODE_ENV = 'production';

    // Without endpoint, even in production, OTEL should be disabled
    const { getOtelConfiguration } = await import('../src/instrumentation');

    const config = getOtelConfiguration();
    expect(config.enabled).toBe(false);
  });

  it('should auto-enable in production with OTLP endpoint', async () => {
    delete process.env.OTEL_ENABLED;
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318';
    process.env.NODE_ENV = 'production';

    const { getOtelConfiguration } = await import('../src/instrumentation');

    const config = getOtelConfiguration();
    expect(config.enabled).toBe(true);
  });
});
