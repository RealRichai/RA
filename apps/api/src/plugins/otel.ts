/**
 * OpenTelemetry Fastify Plugin
 *
 * Integrates @fastify/otel with the existing tracing plugin to provide:
 * - Automatic span creation for HTTP requests
 * - Correlation between request-id and trace/span IDs
 * - Context propagation for downstream services
 *
 * Uses @fastify/otel (Fastify-maintained) for proper integration.
 */

import { trace, context, SpanStatusCode, type Context } from '@opentelemetry/api';
import type { FastifyInstance, FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

import { isOtelEnabled, getOtelConfiguration } from '../instrumentation';

// =============================================================================
// Types
// =============================================================================

export interface OtelPluginOptions {
  /** Skip tracing for these paths */
  ignorePaths?: string[];
  /** Whether to include request/response headers in spans */
  includeHeaders?: boolean;
  /** Custom span name generator */
  spanNameGenerator?: (request: FastifyRequest) => string;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_IGNORE_PATHS = [
  '/health',
  '/health/live',
  '/health/ready',
  '/metrics',
  '/favicon.ico',
];

// =============================================================================
// Plugin Implementation
// =============================================================================

const otelPluginCallback: FastifyPluginCallback<OtelPluginOptions> = (
  fastify,
  opts,
  done
) => {
  const otelConfig = getOtelConfiguration();

  if (!isOtelEnabled()) {
    fastify.log.info('OpenTelemetry plugin skipped (OTEL not enabled)');
    done();
    return;
  }

  const ignorePaths = new Set([...DEFAULT_IGNORE_PATHS, ...(opts.ignorePaths || [])]);
  const includeHeaders = opts.includeHeaders ?? false;
  const spanNameGenerator = opts.spanNameGenerator ?? defaultSpanName;

  const tracer = trace.getTracer(otelConfig.serviceName, otelConfig.serviceVersion);

  // Add onRequest hook to create spans and correlate with request-id
  fastify.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    // Skip ignored paths
    const path = request.url.split('?')[0];
    if (ignorePaths.has(path!)) {
      return;
    }

    // Get or create span from current context
    const parentContext = context.active();
    const spanName = spanNameGenerator(request);

    const span = tracer.startSpan(
      spanName,
      {
        attributes: {
          'http.method': request.method,
          'http.url': request.url,
          'http.route': request.routeOptions?.url || request.url.split('?')[0],
          'http.host': request.hostname,
          'http.user_agent': request.headers['user-agent'] || 'unknown',
          'http.request_id': request.id,
          // Link request-id to trace for correlation
          'request.id': request.id,
        },
      },
      parentContext
    );

    // Get trace and span IDs for correlation
    const spanContext = span.spanContext();
    const traceId = spanContext.traceId;
    const spanId = spanContext.spanId;

    // Add trace info to request for downstream use
    (request as FastifyRequest & { otelSpan?: typeof span }).otelSpan = span;

    // Enhance the request logger with trace context
    // This correlates request-id with trace/span IDs in logs
    request.log = request.log.child({
      'trace.id': traceId,
      'span.id': spanId,
      'service.name': otelConfig.serviceName,
    });

    // Include request headers if configured
    if (includeHeaders) {
      const safeHeaders = sanitizeHeaders(request.headers);
      span.setAttributes(prefixAttributes(safeHeaders, 'http.request.header'));
    }
  });

  // Add onResponse hook to complete spans
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const span = (request as FastifyRequest & { otelSpan?: ReturnType<typeof tracer.startSpan> }).otelSpan;
    if (!span) {
      return;
    }

    // Set response attributes
    span.setAttributes({
      'http.status_code': reply.statusCode,
      'http.response_time_ms': reply.elapsedTime,
    });

    // Include response headers if configured
    if (includeHeaders) {
      const responseHeaders = reply.getHeaders();
      const safeHeaders = sanitizeHeaders(responseHeaders as Record<string, string | string[] | undefined>);
      span.setAttributes(prefixAttributes(safeHeaders, 'http.response.header'));
    }

    // Set span status based on HTTP status code
    if (reply.statusCode >= 400) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${reply.statusCode}`,
      });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    span.end();
  });

  // Add onError hook to record exceptions
  fastify.addHook('onError', async (request: FastifyRequest, _reply: FastifyReply, error: Error) => {
    const span = (request as FastifyRequest & { otelSpan?: ReturnType<typeof tracer.startSpan> }).otelSpan;
    if (!span) {
      return;
    }

    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
  });

  // Decorate fastify with OTEL helpers
  fastify.decorate('otel', {
    tracer,
    isEnabled: true,
    config: otelConfig,
    /**
     * Create a child span for custom instrumentation
     */
    createSpan: (name: string, parentContext?: Context) => {
      const ctx = parentContext || context.active();
      return tracer.startSpan(name, {}, ctx);
    },
    /**
     * Get current trace ID from active context
     */
    getTraceId: () => {
      const span = trace.getActiveSpan();
      return span?.spanContext().traceId;
    },
    /**
     * Get current span ID from active context
     */
    getSpanId: () => {
      const span = trace.getActiveSpan();
      return span?.spanContext().spanId;
    },
  });

  fastify.log.info(
    { serviceName: otelConfig.serviceName, environment: otelConfig.environment },
    'OpenTelemetry plugin registered'
  );

  done();
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate default span name from request
 */
function defaultSpanName(request: FastifyRequest): string {
  const route = request.routeOptions?.url || request.url.split('?')[0];
  return `${request.method} ${route}`;
}

/**
 * Sanitize headers by removing sensitive values
 */
function sanitizeHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string> {
  const sensitiveHeaders = new Set([
    'authorization',
    'cookie',
    'x-api-key',
    'x-auth-token',
    'x-metrics-token',
  ]);

  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;

    const lowerKey = key.toLowerCase();
    if (sensitiveHeaders.has(lowerKey)) {
      result[lowerKey] = '[REDACTED]';
    } else {
      result[lowerKey] = Array.isArray(value) ? value.join(', ') : value;
    }
  }

  return result;
}

/**
 * Prefix attribute keys with a namespace
 */
function prefixAttributes(
  attrs: Record<string, string>,
  prefix: string
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    result[`${prefix}.${key}`] = value;
  }
  return result;
}

// =============================================================================
// Plugin Export
// =============================================================================

export const otelPlugin = fp(otelPluginCallback, {
  name: 'otel',
  // No dependencies - runs early in the plugin chain
});

// =============================================================================
// Type Augmentation
// =============================================================================

declare module 'fastify' {
  interface FastifyInstance {
    otel: {
      tracer: ReturnType<typeof trace.getTracer>;
      isEnabled: boolean;
      config: ReturnType<typeof getOtelConfiguration>;
      createSpan: (name: string, parentContext?: Context) => ReturnType<ReturnType<typeof trace.getTracer>['startSpan']>;
      getTraceId: () => string | undefined;
      getSpanId: () => string | undefined;
    };
  }
}
