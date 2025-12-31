/**
 * Request Tracing Plugin
 *
 * Provides distributed tracing capabilities with correlation IDs for debugging
 * and monitoring requests across services.
 *
 * Features:
 * - Generates unique trace IDs for each request (or accepts from X-Trace-ID header)
 * - Creates span IDs for request lifecycle tracking
 * - Propagates trace context to downstream services
 * - Includes trace IDs in all log entries
 * - Adds trace headers to responses
 * - Provides helpers for background job tracing
 */

import { randomUUID } from 'crypto';

import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

// =============================================================================
// Types
// =============================================================================

export interface TraceContext {
  /** Unique identifier for the entire request chain (propagated across services) */
  traceId: string;
  /** Unique identifier for this specific span/operation */
  spanId: string;
  /** Parent span ID if this is a child operation */
  parentSpanId?: string;
  /** Service name for identification */
  serviceName: string;
  /** When the trace started */
  startTime: number;
  /** Optional baggage items (key-value pairs propagated with trace) */
  baggage: Record<string, string>;
}

export interface TracingPluginOptions {
  /** Enable/disable tracing */
  enabled?: boolean;
  /** Service name for trace identification */
  serviceName?: string;
  /** Header name for incoming trace ID */
  traceIdHeader?: string;
  /** Header name for incoming span ID */
  spanIdHeader?: string;
  /** Header name for incoming parent span ID */
  parentSpanIdHeader?: string;
  /** Whether to include trace headers in responses */
  includeResponseHeaders?: boolean;
  /** Paths to exclude from tracing (e.g., health checks) */
  excludePaths?: string[];
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_OPTIONS: Required<TracingPluginOptions> = {
  enabled: true,
  serviceName: 'realriches-api',
  traceIdHeader: 'x-trace-id',
  spanIdHeader: 'x-span-id',
  parentSpanIdHeader: 'x-parent-span-id',
  includeResponseHeaders: true,
  excludePaths: ['/health', '/health/live', '/health/ready', '/metrics'],
};

// =============================================================================
// Trace ID Generation
// =============================================================================

/**
 * Generate a new trace ID (UUID v4 without dashes for compactness)
 */
export function generateTraceId(): string {
  return randomUUID().replace(/-/g, '');
}

/**
 * Generate a new span ID (shorter, 16 chars)
 */
export function generateSpanId(): string {
  return randomUUID().replace(/-/g, '').substring(0, 16);
}

// =============================================================================
// Trace Context Helpers
// =============================================================================

/**
 * Create a new trace context
 */
export function createTraceContext(
  serviceName: string,
  traceId?: string,
  parentSpanId?: string
): TraceContext {
  return {
    traceId: traceId || generateTraceId(),
    spanId: generateSpanId(),
    parentSpanId,
    serviceName,
    startTime: Date.now(),
    baggage: {},
  };
}

/**
 * Create a child span context (for nested operations)
 */
export function createChildSpan(parent: TraceContext): TraceContext {
  return {
    traceId: parent.traceId,
    spanId: generateSpanId(),
    parentSpanId: parent.spanId,
    serviceName: parent.serviceName,
    startTime: Date.now(),
    baggage: { ...parent.baggage },
  };
}

/**
 * Extract trace context from HTTP headers
 */
export function extractTraceFromHeaders(
  headers: Record<string, string | string[] | undefined>,
  options: Required<TracingPluginOptions>
): Partial<TraceContext> {
  const getHeader = (name: string): string | undefined => {
    const value = headers[name] || headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };

  return {
    traceId: getHeader(options.traceIdHeader),
    spanId: getHeader(options.spanIdHeader),
    parentSpanId: getHeader(options.parentSpanIdHeader),
  };
}

/**
 * Create headers for propagating trace context to downstream services
 */
export function createTraceHeaders(
  context: TraceContext,
  options: Required<TracingPluginOptions>
): Record<string, string> {
  return {
    [options.traceIdHeader]: context.traceId,
    [options.spanIdHeader]: context.spanId,
    [options.parentSpanIdHeader]: context.spanId, // Current span becomes parent for downstream
  };
}

// =============================================================================
// Background Job Tracing
// =============================================================================

/**
 * Create trace context for a background job
 * Can optionally continue from a parent trace (e.g., job triggered by HTTP request)
 */
export function createJobTraceContext(
  jobName: string,
  serviceName: string,
  parentTraceId?: string
): TraceContext {
  return {
    traceId: parentTraceId || generateTraceId(),
    spanId: generateSpanId(),
    parentSpanId: undefined,
    serviceName,
    startTime: Date.now(),
    baggage: {
      jobName,
      jobType: 'background',
    },
  };
}

/**
 * Serialize trace context for job payloads
 */
export function serializeTraceContext(context: TraceContext): string {
  return JSON.stringify(context);
}

/**
 * Deserialize trace context from job payloads
 */
export function deserializeTraceContext(serialized: string): TraceContext | null {
  try {
    return JSON.parse(serialized) as TraceContext;
  } catch {
    return null;
  }
}

// =============================================================================
// Logging Integration
// =============================================================================

/**
 * Create a child logger with trace context
 */
export function createTracedLogger(baseLogger: typeof logger, context: TraceContext) {
  return baseLogger.child({
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    service: context.serviceName,
  });
}

// =============================================================================
// Plugin
// =============================================================================

const tracingPluginCallback: FastifyPluginCallback<TracingPluginOptions> = (
  fastify,
  opts,
  done
) => {
  const options: Required<TracingPluginOptions> = {
    ...DEFAULT_OPTIONS,
    ...opts,
  };

  if (!options.enabled) {
    logger.info('Request tracing disabled');
    done();
    return;
  }

  // Decorate request with trace context
  fastify.decorateRequest('trace', null);

  // Add onRequest hook to initialize trace context
  fastify.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    // Skip excluded paths
    const isExcluded = options.excludePaths.some(path => request.url.startsWith(path));
    if (isExcluded) {
      return;
    }

    // Extract existing trace from headers or create new
    const extracted = extractTraceFromHeaders(
      request.headers as Record<string, string | string[] | undefined>,
      options
    );

    const traceContext = createTraceContext(
      options.serviceName,
      extracted.traceId,
      extracted.parentSpanId || extracted.spanId
    );

    // Attach to request
    (request as any).trace = traceContext;

    // Add trace context to request logger
    request.log = request.log.child({
      traceId: traceContext.traceId,
      spanId: traceContext.spanId,
      ...(traceContext.parentSpanId && { parentSpanId: traceContext.parentSpanId }),
    });
  });

  // Add response headers
  fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply) => {
    const trace = (request as any).trace as TraceContext | undefined;

    if (trace && options.includeResponseHeaders) {
      reply.header(options.traceIdHeader, trace.traceId);
      reply.header(options.spanIdHeader, trace.spanId);
      if (trace.parentSpanId) {
        reply.header(options.parentSpanIdHeader, trace.parentSpanId);
      }
    }
  });

  // Log trace completion on response
  fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const trace = (request as any).trace as TraceContext | undefined;

    if (trace) {
      const duration = Date.now() - trace.startTime;
      request.log.info({
        msg: 'trace_complete',
        traceId: trace.traceId,
        spanId: trace.spanId,
        durationMs: duration,
        statusCode: reply.statusCode,
        method: request.method,
        url: request.url,
      });
    }
  });

  // Decorate fastify with tracing helpers
  fastify.decorate('tracing', {
    createContext: (traceId?: string, parentSpanId?: string) =>
      createTraceContext(options.serviceName, traceId, parentSpanId),
    createChildSpan,
    createJobContext: (jobName: string, parentTraceId?: string) =>
      createJobTraceContext(jobName, options.serviceName, parentTraceId),
    createHeaders: (context: TraceContext) => createTraceHeaders(context, options),
    serialize: serializeTraceContext,
    deserialize: deserializeTraceContext,
    generateTraceId,
    generateSpanId,
  });

  logger.info({ serviceName: options.serviceName }, 'Request tracing enabled');
  done();
};

export const tracingPlugin = fp(tracingPluginCallback, {
  name: 'tracing',
});

// =============================================================================
// Type Augmentation
// =============================================================================

declare module 'fastify' {
  interface FastifyRequest {
    trace: TraceContext | null;
  }

  interface FastifyInstance {
    tracing: {
      createContext: (traceId?: string, parentSpanId?: string) => TraceContext;
      createChildSpan: (parent: TraceContext) => TraceContext;
      createJobContext: (jobName: string, parentTraceId?: string) => TraceContext;
      createHeaders: (context: TraceContext) => Record<string, string>;
      serialize: (context: TraceContext) => string;
      deserialize: (serialized: string) => TraceContext | null;
      generateTraceId: () => string;
      generateSpanId: () => string;
    };
  }
}

// =============================================================================
// Exports
// =============================================================================

export {
  TraceContext as TraceContextType,
  TracingPluginOptions,
};
