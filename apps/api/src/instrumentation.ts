/**
 * OpenTelemetry Instrumentation
 *
 * IMPORTANT: This module MUST be imported BEFORE any other modules
 * to ensure all instrumented packages are properly traced.
 *
 * Configuration via environment variables:
 * - OTEL_SERVICE_NAME: Service name (default: realriches-api)
 * - OTEL_EXPORTER_OTLP_ENDPOINT: OTLP collector endpoint
 * - OTEL_TRACES_EXPORTER: Exporter type (otlp, console, none)
 * - OTEL_ENABLED: Enable/disable tracing (default: false in dev, true in prod)
 * - OTEL_LOG_LEVEL: SDK log level (default: info)
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  SEMRESATTRS_DEPLOYMENT_ENVIRONMENT,
} from '@opentelemetry/semantic-conventions';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

// =============================================================================
// Configuration
// =============================================================================

export interface OtelConfig {
  enabled: boolean;
  serviceName: string;
  serviceVersion: string;
  environment: string;
  otlpEndpoint?: string;
  tracesExporter: 'otlp' | 'console' | 'none';
  logLevel: DiagLogLevel;
}

function getOtelConfig(): OtelConfig {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProduction = nodeEnv === 'production';

  // Parse OTEL_ENABLED with sensible defaults
  // Enabled by default in production if OTLP endpoint is set
  const explicitEnabled = process.env.OTEL_ENABLED;
  const hasEndpoint = !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const enabled =
    explicitEnabled !== undefined
      ? explicitEnabled === 'true' || explicitEnabled === '1'
      : isProduction && hasEndpoint;

  // Parse log level
  const logLevelMap: Record<string, DiagLogLevel> = {
    none: DiagLogLevel.NONE,
    error: DiagLogLevel.ERROR,
    warn: DiagLogLevel.WARN,
    info: DiagLogLevel.INFO,
    debug: DiagLogLevel.DEBUG,
    verbose: DiagLogLevel.VERBOSE,
    all: DiagLogLevel.ALL,
  };
  const logLevel = logLevelMap[process.env.OTEL_LOG_LEVEL?.toLowerCase() || 'info'] || DiagLogLevel.INFO;

  return {
    enabled,
    serviceName: process.env.OTEL_SERVICE_NAME || 'realriches-api',
    serviceVersion: process.env.npm_package_version || '1.0.0',
    environment: nodeEnv,
    otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    tracesExporter: (process.env.OTEL_TRACES_EXPORTER as OtelConfig['tracesExporter']) || 'otlp',
    logLevel,
  };
}

// =============================================================================
// SDK Initialization
// =============================================================================

let sdk: NodeSDK | null = null;
let isInitialized = false;

/**
 * Initialize OpenTelemetry SDK.
 * Must be called before any instrumented modules are imported.
 */
export function initializeOtel(): void {
  if (isInitialized) {
    return;
  }

  const config = getOtelConfig();

  if (!config.enabled) {
    // Log but don't initialize - keeps module tree-shakable
    if (process.env.NODE_ENV !== 'test') {
      console.log('[OTEL] Tracing disabled (set OTEL_ENABLED=true and OTEL_EXPORTER_OTLP_ENDPOINT to enable)');
    }
    isInitialized = true;
    return;
  }

  // Set up diagnostic logging
  diag.setLogger(new DiagConsoleLogger(), config.logLevel);

  // Create resource with service attributes
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion,
    [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: config.environment,
  });

  // Create trace exporter based on config
  let traceExporter: OTLPTraceExporter | undefined;

  if (config.tracesExporter === 'otlp') {
    if (!config.otlpEndpoint) {
      console.warn('[OTEL] OTEL_EXPORTER_OTLP_ENDPOINT not set, disabling OTLP export');
    } else {
      traceExporter = new OTLPTraceExporter({
        url: `${config.otlpEndpoint}/v1/traces`,
      });
    }
  }

  // Initialize SDK
  sdk = new NodeSDK({
    resource,
    traceExporter,
  });

  // Start SDK
  sdk.start();

  console.log(`[OTEL] Tracing initialized for ${config.serviceName} (${config.environment})`);
  if (config.otlpEndpoint) {
    console.log(`[OTEL] Exporting traces to ${config.otlpEndpoint}`);
  }

  isInitialized = true;
}

/**
 * Shutdown OpenTelemetry SDK gracefully.
 * Should be called during application shutdown.
 */
export async function shutdownOtel(): Promise<void> {
  if (sdk) {
    try {
      await sdk.shutdown();
      console.log('[OTEL] Tracing shutdown complete');
    } catch (error) {
      console.error('[OTEL] Error during shutdown:', error);
    }
  }
}

/**
 * Check if OpenTelemetry is enabled and initialized.
 */
export function isOtelEnabled(): boolean {
  return isInitialized && sdk !== null;
}

/**
 * Get the current OTEL configuration.
 */
export function getOtelConfiguration(): OtelConfig {
  return getOtelConfig();
}

// =============================================================================
// Auto-initialize if this module is imported
// =============================================================================

// Initialize immediately when module is loaded
initializeOtel();
