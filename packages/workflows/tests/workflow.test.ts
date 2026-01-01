/**
 * Workflow Package Unit Tests
 *
 * Tests for the workflow foundation types, utilities, and runtime.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  RetryPolicies,
  createRetryPolicy,
  calculateRetryDelay,
  addJitter,
  isRetryableError,
} from '../src/retry/policies';
import {
  generateIdempotencyKey,
  hashContent,
  InMemoryActivityCache,
} from '../src/activities/idempotency';
import { defineActivity } from '../src/activities/types';
import {
  registerActivity,
  getActivity,
  hasActivity,
  getActivityNames,
  clearRegistry,
} from '../src/activities/registry';
import { InMemorySignalStore } from '../src/runtime/local-runtime';
import type { RetryPolicy } from '../src/types';

describe('Retry Policies', () => {
  describe('RetryPolicies presets', () => {
    it('should have validation policy with single attempt', () => {
      expect(RetryPolicies.validation.maximumAttempts).toBe(1);
      expect(RetryPolicies.validation.nonRetryableErrors).toContain('ValidationError');
    });

    it('should have database policy with 5 attempts', () => {
      expect(RetryPolicies.database.maximumAttempts).toBe(5);
      expect(RetryPolicies.database.initialInterval).toBe(500);
    });

    it('should have external service policy with 10 attempts', () => {
      expect(RetryPolicies.externalService.maximumAttempts).toBe(10);
      expect(RetryPolicies.externalService.maximumInterval).toBe(60000);
    });

    it('should have payment policy with limited retries', () => {
      expect(RetryPolicies.payment.maximumAttempts).toBe(3);
      expect(RetryPolicies.payment.nonRetryableErrors).toContain('CardDeclinedError');
    });
  });

  describe('createRetryPolicy', () => {
    it('should create policy with defaults', () => {
      const policy = createRetryPolicy({});
      expect(policy.initialInterval).toBe(1000);
      expect(policy.backoffCoefficient).toBe(2);
      expect(policy.maximumAttempts).toBe(5);
    });

    it('should override defaults with provided values', () => {
      const policy = createRetryPolicy({
        maximumAttempts: 10,
        initialInterval: 500,
      });
      expect(policy.maximumAttempts).toBe(10);
      expect(policy.initialInterval).toBe(500);
      expect(policy.backoffCoefficient).toBe(2); // default preserved
    });
  });

  describe('calculateRetryDelay', () => {
    const policy: RetryPolicy = {
      initialInterval: 1000,
      backoffCoefficient: 2,
      maximumInterval: 60000,
      maximumAttempts: 5,
    };

    it('should return initial interval for first attempt', () => {
      expect(calculateRetryDelay(policy, 1)).toBe(1000);
    });

    it('should apply exponential backoff', () => {
      expect(calculateRetryDelay(policy, 2)).toBe(2000);
      expect(calculateRetryDelay(policy, 3)).toBe(4000);
      expect(calculateRetryDelay(policy, 4)).toBe(8000);
    });

    it('should cap at maximum interval', () => {
      expect(calculateRetryDelay(policy, 10)).toBe(60000);
    });
  });

  describe('addJitter', () => {
    it('should return value close to original', () => {
      const delay = 1000;
      const jitteredDelay = addJitter(delay, 0.1);
      expect(jitteredDelay).toBeGreaterThanOrEqual(delay * 0.9);
      expect(jitteredDelay).toBeLessThanOrEqual(delay * 1.1);
    });

    it('should never return negative', () => {
      const delay = 100;
      for (let i = 0; i < 100; i++) {
        expect(addJitter(delay, 0.5)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('isRetryableError', () => {
    const policy: RetryPolicy = {
      initialInterval: 1000,
      backoffCoefficient: 2,
      maximumInterval: 60000,
      maximumAttempts: 5,
      nonRetryableErrors: ['ValidationError', 'AuthError'],
    };

    it('should return false for non-retryable errors', () => {
      const error = new Error('Invalid input');
      error.name = 'ValidationError';
      expect(isRetryableError(error, policy)).toBe(false);
    });

    it('should return true for retryable errors', () => {
      const error = new Error('Connection failed');
      error.name = 'ConnectionError';
      expect(isRetryableError(error, policy)).toBe(true);
    });

    it('should return true when no non-retryable errors specified', () => {
      const policyNoExclusions: RetryPolicy = {
        ...policy,
        nonRetryableErrors: [],
      };
      const error = new Error('Any error');
      expect(isRetryableError(error, policyNoExclusions)).toBe(true);
    });
  });
});

describe('Idempotency', () => {
  describe('generateIdempotencyKey', () => {
    it('should generate consistent keys for same input', () => {
      const input = { userId: '123', action: 'create' };
      const key1 = generateIdempotencyKey('test-activity', input);
      const key2 = generateIdempotencyKey('test-activity', input);
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different inputs', () => {
      const input1 = { userId: '123' };
      const input2 = { userId: '456' };
      const key1 = generateIdempotencyKey('test-activity', input1);
      const key2 = generateIdempotencyKey('test-activity', input2);
      expect(key1).not.toBe(key2);
    });

    it('should include activity name in key', () => {
      const input = { id: '123' };
      const key = generateIdempotencyKey('my-activity', input);
      expect(key).toContain('my-activity:');
    });
  });

  describe('hashContent', () => {
    it('should produce consistent hashes', () => {
      const content = { a: 1, b: 2 };
      const hash1 = hashContent(content);
      const hash2 = hashContent(content);
      expect(hash1).toBe(hash2);
    });

    it('should produce same hash regardless of property order', () => {
      const content1 = { a: 1, b: 2 };
      const content2 = { b: 2, a: 1 };
      expect(hashContent(content1)).toBe(hashContent(content2));
    });

    it('should produce different hashes for different content', () => {
      const hash1 = hashContent({ value: 1 });
      const hash2 = hashContent({ value: 2 });
      expect(hash1).not.toBe(hash2);
    });

    it('should be 16 characters long', () => {
      const hash = hashContent({ test: 'data' });
      expect(hash.length).toBe(16);
    });
  });

  describe('InMemoryActivityCache', () => {
    let cache: InMemoryActivityCache;

    beforeEach(() => {
      cache = new InMemoryActivityCache();
    });

    it('should store and retrieve results', async () => {
      await cache.set('key1', { result: 'value' }, 3600);
      const result = await cache.get('key1');
      expect(result?.result).toEqual({ result: 'value' });
    });

    it('should return null for missing keys', async () => {
      const result = await cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should delete entries', async () => {
      await cache.set('key1', 'value', 3600);
      await cache.delete('key1');
      expect(await cache.exists('key1')).toBe(false);
    });

    it('should check existence', async () => {
      expect(await cache.exists('key1')).toBe(false);
      await cache.set('key1', 'value', 3600);
      expect(await cache.exists('key1')).toBe(true);
    });

    it('should track size', async () => {
      expect(cache.size()).toBe(0);
      await cache.set('key1', 'value', 3600);
      expect(cache.size()).toBe(1);
    });

    it('should clear all entries', async () => {
      await cache.set('key1', 'value1', 3600);
      await cache.set('key2', 'value2', 3600);
      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });
});

describe('Activity Registry', () => {
  beforeEach(() => {
    clearRegistry();
  });

  afterEach(() => {
    clearRegistry();
  });

  it('should register an activity', () => {
    const activity = defineActivity({
      name: 'test-activity',
      retryPolicy: RetryPolicies.database,
      timeout: 5000,
      idempotencyKey: (input: { id: string }) => `test:${input.id}`,
      execute: async (input: { id: string }) => ({ id: input.id }),
    });

    registerActivity(activity);
    expect(hasActivity('test-activity')).toBe(true);
  });

  it('should throw error on duplicate registration', () => {
    const activity = defineActivity({
      name: 'test-activity',
      retryPolicy: RetryPolicies.database,
      timeout: 5000,
      idempotencyKey: (input: { id: string }) => `test:${input.id}`,
      execute: async (input: { id: string }) => ({ id: input.id }),
    });

    registerActivity(activity);
    expect(() => registerActivity(activity)).toThrow('already registered');
  });

  it('should get registered activity', () => {
    const activity = defineActivity({
      name: 'test-activity',
      retryPolicy: RetryPolicies.database,
      timeout: 5000,
      idempotencyKey: (input: { id: string }) => `test:${input.id}`,
      execute: async (input: { id: string }) => ({ id: input.id }),
    });

    registerActivity(activity);
    const retrieved = getActivity('test-activity');
    expect(retrieved?.name).toBe('test-activity');
  });

  it('should return undefined for unregistered activity', () => {
    expect(getActivity('nonexistent')).toBeUndefined();
  });

  it('should list all activity names', () => {
    const activity1 = defineActivity({
      name: 'activity-1',
      retryPolicy: RetryPolicies.database,
      timeout: 5000,
      idempotencyKey: () => 'key1',
      execute: async () => ({}),
    });

    const activity2 = defineActivity({
      name: 'activity-2',
      retryPolicy: RetryPolicies.database,
      timeout: 5000,
      idempotencyKey: () => 'key2',
      execute: async () => ({}),
    });

    registerActivity(activity1);
    registerActivity(activity2);

    const names = getActivityNames();
    expect(names).toContain('activity-1');
    expect(names).toContain('activity-2');
  });
});

describe('Signal Store', () => {
  let signalStore: InMemorySignalStore;

  beforeEach(() => {
    signalStore = new InMemorySignalStore();
  });

  afterEach(() => {
    signalStore.clear();
  });

  it('should send and receive signals', async () => {
    await signalStore.send('workflow-1', 'test-signal', { data: 'value' });
    expect(await signalStore.exists('workflow-1', 'test-signal')).toBe(true);
  });

  it('should return signal payload when waiting', async () => {
    // Send signal first
    await signalStore.send('workflow-1', 'test-signal', { data: 'value' });

    // Wait should return immediately with payload
    const result = await signalStore.waitFor('workflow-1', 'test-signal', 1000);
    expect(result).toEqual({ data: 'value' });
  });

  it('should return null on timeout', async () => {
    const result = await signalStore.waitFor('workflow-1', 'nonexistent', 100);
    expect(result).toBeNull();
  });

  it('should resolve waiter when signal arrives', async () => {
    // Start waiting
    const waitPromise = signalStore.waitFor('workflow-1', 'delayed-signal', 5000);

    // Send signal after a short delay
    setTimeout(async () => {
      await signalStore.send('workflow-1', 'delayed-signal', { arrived: true });
    }, 50);

    const result = await waitPromise;
    expect(result).toEqual({ arrived: true });
  });
});

describe('Activity Definition', () => {
  it('should create activity with all properties', () => {
    const activity = defineActivity({
      name: 'test-activity',
      retryPolicy: RetryPolicies.database,
      timeout: 5000,
      idempotencyKey: (input: { id: string }) => `test:${input.id}`,
      execute: async (input: { id: string }) => ({ id: input.id }),
      description: 'A test activity',
    });

    expect(activity.name).toBe('test-activity');
    expect(activity.timeout).toBe(5000);
    expect(activity.retryPolicy).toBe(RetryPolicies.database);
    expect(activity.description).toBe('A test activity');
  });

  it('should generate idempotency keys correctly', () => {
    const activity = defineActivity({
      name: 'user-activity',
      retryPolicy: RetryPolicies.database,
      timeout: 5000,
      idempotencyKey: (input: { userId: string; action: string }) =>
        `user:${input.userId}:${input.action}`,
      execute: async () => ({}),
    });

    const key = activity.idempotencyKey({ userId: '123', action: 'create' });
    expect(key).toBe('user:123:create');
  });

  it('should execute activity function', async () => {
    const activity = defineActivity({
      name: 'compute-activity',
      retryPolicy: RetryPolicies.validation,
      timeout: 1000,
      idempotencyKey: (input: { value: number }) => `compute:${input.value}`,
      execute: async (input: { value: number }) => ({ result: input.value * 2 }),
    });

    const result = await activity.execute({ value: 5 });
    expect(result).toEqual({ result: 10 });
  });
});
