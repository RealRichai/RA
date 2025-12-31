/**
 * Request Tracing Plugin Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import {
  tracingPlugin,
  generateTraceId,
  generateSpanId,
  createTraceContext,
  createChildSpan,
  createJobTraceContext,
  serializeTraceContext,
  deserializeTraceContext,
} from '../src/plugins/tracing';

describe('Tracing Utility Functions', () => {
  describe('generateTraceId', () => {
    it('should generate a 32-character hex string', () => {
      const traceId = generateTraceId();
      expect(traceId).toHaveLength(32);
      expect(traceId).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateTraceId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('generateSpanId', () => {
    it('should generate a 16-character hex string', () => {
      const spanId = generateSpanId();
      expect(spanId).toHaveLength(16);
      expect(spanId).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSpanId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('createTraceContext', () => {
    it('should create a trace context with generated IDs', () => {
      const context = createTraceContext('test-service');

      expect(context.traceId).toHaveLength(32);
      expect(context.spanId).toHaveLength(16);
      expect(context.serviceName).toBe('test-service');
      expect(context.startTime).toBeLessThanOrEqual(Date.now());
      expect(context.baggage).toEqual({});
      expect(context.parentSpanId).toBeUndefined();
    });

    it('should use provided trace ID', () => {
      const traceId = 'a'.repeat(32);
      const context = createTraceContext('test-service', traceId);

      expect(context.traceId).toBe(traceId);
    });

    it('should set parent span ID when provided', () => {
      const parentSpanId = 'b'.repeat(16);
      const context = createTraceContext('test-service', undefined, parentSpanId);

      expect(context.parentSpanId).toBe(parentSpanId);
    });
  });

  describe('createChildSpan', () => {
    it('should create a child span with same trace ID', () => {
      const parent = createTraceContext('test-service');
      const child = createChildSpan(parent);

      expect(child.traceId).toBe(parent.traceId);
      expect(child.spanId).not.toBe(parent.spanId);
      expect(child.parentSpanId).toBe(parent.spanId);
      expect(child.serviceName).toBe(parent.serviceName);
    });

    it('should copy baggage from parent', () => {
      const parent = createTraceContext('test-service');
      parent.baggage = { key: 'value' };

      const child = createChildSpan(parent);

      expect(child.baggage).toEqual({ key: 'value' });
      // Should be a copy, not the same reference
      expect(child.baggage).not.toBe(parent.baggage);
    });
  });

  describe('createJobTraceContext', () => {
    it('should create a job trace context', () => {
      const context = createJobTraceContext('email-sender', 'job-service');

      expect(context.traceId).toHaveLength(32);
      expect(context.spanId).toHaveLength(16);
      expect(context.serviceName).toBe('job-service');
      expect(context.baggage.jobName).toBe('email-sender');
      expect(context.baggage.jobType).toBe('background');
    });

    it('should use parent trace ID when provided', () => {
      const parentTraceId = 'c'.repeat(32);
      const context = createJobTraceContext('email-sender', 'job-service', parentTraceId);

      expect(context.traceId).toBe(parentTraceId);
    });
  });

  describe('serializeTraceContext / deserializeTraceContext', () => {
    it('should serialize and deserialize trace context', () => {
      const original = createTraceContext('test-service');
      original.baggage = { key: 'value' };

      const serialized = serializeTraceContext(original);
      const deserialized = deserializeTraceContext(serialized);

      expect(deserialized).toEqual(original);
    });

    it('should return null for invalid JSON', () => {
      const result = deserializeTraceContext('not-json');
      expect(result).toBeNull();
    });
  });
});

describe('Tracing Plugin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
  });

  afterEach(async () => {
    await app.close();
  });

  it('should add trace context to requests', async () => {
    await app.register(tracingPlugin, {
      enabled: true,
      serviceName: 'test-api',
    });

    let capturedTrace: any = null;

    app.get('/test', (request, reply) => {
      capturedTrace = request.trace;
      return reply.send({ ok: true });
    });

    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(200);
    expect(capturedTrace).not.toBeNull();
    expect(capturedTrace.traceId).toHaveLength(32);
    expect(capturedTrace.spanId).toHaveLength(16);
    expect(capturedTrace.serviceName).toBe('test-api');
  });

  it('should accept trace ID from header', async () => {
    await app.register(tracingPlugin, {
      enabled: true,
      serviceName: 'test-api',
    });

    let capturedTrace: any = null;

    app.get('/test', (request, reply) => {
      capturedTrace = request.trace;
      return reply.send({ ok: true });
    });

    await app.ready();

    const incomingTraceId = 'd'.repeat(32);

    const response = await app.inject({
      method: 'GET',
      url: '/test',
      headers: {
        'x-trace-id': incomingTraceId,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(capturedTrace.traceId).toBe(incomingTraceId);
  });

  it('should include trace headers in response', async () => {
    await app.register(tracingPlugin, {
      enabled: true,
      serviceName: 'test-api',
      includeResponseHeaders: true,
    });

    app.get('/test', (_request, reply) => {
      return reply.send({ ok: true });
    });

    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-trace-id']).toBeDefined();
    expect(response.headers['x-span-id']).toBeDefined();
  });

  it('should not trace excluded paths', async () => {
    await app.register(tracingPlugin, {
      enabled: true,
      serviceName: 'test-api',
      excludePaths: ['/health'],
    });

    let capturedTrace: any = null;

    app.get('/health', (request, reply) => {
      capturedTrace = request.trace;
      return reply.send({ ok: true });
    });

    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(capturedTrace).toBeNull();
  });

  it('should expose tracing helpers on fastify instance', async () => {
    await app.register(tracingPlugin, {
      enabled: true,
      serviceName: 'test-api',
    });

    await app.ready();

    expect(app.tracing).toBeDefined();
    expect(app.tracing.createContext).toBeInstanceOf(Function);
    expect(app.tracing.createChildSpan).toBeInstanceOf(Function);
    expect(app.tracing.createJobContext).toBeInstanceOf(Function);
    expect(app.tracing.createHeaders).toBeInstanceOf(Function);
    expect(app.tracing.generateTraceId).toBeInstanceOf(Function);
    expect(app.tracing.generateSpanId).toBeInstanceOf(Function);
  });

  it('should create proper headers for downstream requests', async () => {
    await app.register(tracingPlugin, {
      enabled: true,
      serviceName: 'test-api',
    });

    await app.ready();

    const context = app.tracing.createContext();
    const headers = app.tracing.createHeaders(context);

    expect(headers['x-trace-id']).toBe(context.traceId);
    expect(headers['x-span-id']).toBe(context.spanId);
  });

  it('should be disabled when enabled is false', async () => {
    await app.register(tracingPlugin, {
      enabled: false,
      serviceName: 'test-api',
    });

    let capturedTrace: any = 'not-set';

    app.get('/test', (request, reply) => {
      capturedTrace = request.trace;
      return reply.send({ ok: true });
    });

    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/test',
    });

    expect(response.statusCode).toBe(200);
    // When disabled, trace should not be set (remains undefined)
    expect(capturedTrace).toBeUndefined();
  });
});
