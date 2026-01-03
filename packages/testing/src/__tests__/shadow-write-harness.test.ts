/**
 * Shadow Write Harness Unit Tests
 *
 * Tests for dual-write behavior with fault injection.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { FaultInjector, InjectedFaultError, resetFaultInjector } from '../fault-injector.js';
import {
  ShadowWriteHarness,
  ShadowStore,
  ShadowFailureRecord,
  ShadowWriteMetricEvent,
} from '../shadow-write-harness.js';

// Test entity type
interface TestEntity {
  id: string;
  name: string;
  value: number;
}

// In-memory store implementation for testing
class InMemoryStore implements ShadowStore<TestEntity> {
  private data = new Map<string, TestEntity>();
  private nextId = 1;

  async create(entity: TestEntity): Promise<TestEntity> {
    const id = entity.id || `entity-${this.nextId++}`;
    const created = { ...entity, id };
    this.data.set(id, created);
    return created;
  }

  async update(id: string, data: Partial<TestEntity>): Promise<TestEntity> {
    const existing = this.data.get(id);
    if (!existing) {
      throw new Error(`Entity ${id} not found`);
    }
    const updated = { ...existing, ...data };
    this.data.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<void> {
    this.data.delete(id);
  }

  async findById(id: string): Promise<TestEntity | null> {
    return this.data.get(id) || null;
  }

  async findAll(options?: { limit?: number; offset?: number }): Promise<TestEntity[]> {
    const all = Array.from(this.data.values());
    const offset = options?.offset || 0;
    const limit = options?.limit || all.length;
    return all.slice(offset, offset + limit);
  }

  clear(): void {
    this.data.clear();
  }

  size(): number {
    return this.data.size;
  }
}

describe('ShadowWriteHarness', () => {
  let primaryStore: InMemoryStore;
  let shadowStore: InMemoryStore;
  let faultInjector: FaultInjector;
  let failureRecords: ShadowFailureRecord[];
  let metricEvents: ShadowWriteMetricEvent[];

  beforeEach(() => {
    resetFaultInjector();
    primaryStore = new InMemoryStore();
    shadowStore = new InMemoryStore();
    failureRecords = [];
    metricEvents = [];

    // Create injector with chaos disabled by default
    faultInjector = FaultInjector.createForTest({
      enabled: false,
      failRate: 0,
      seed: 'test-seed',
      scope: 'shadow_write_only',
    });
  });

  function createHarness(injectorOverride?: FaultInjector) {
    return new ShadowWriteHarness<TestEntity>({
      entityType: 'TestEntity',
      faultInjector: injectorOverride || faultInjector,
      onShadowFailure: async (failure) => {
        failureRecords.push(failure);
      },
      onMetric: (metric) => {
        metricEvents.push(metric);
      },
    });
  }

  describe('Create Operation', () => {
    it('should write to both stores when no fault', async () => {
      const harness = createHarness();
      const entity = { id: 'test-1', name: 'Test', value: 100 };

      const result = await harness.create(primaryStore, shadowStore, entity);

      expect(result.canonical).toEqual(entity);
      expect(result.shadowSuccess).toBe(true);
      expect(result.shadowError).toBeUndefined();
      expect(result.faultId).toBeUndefined();

      // Both stores should have the entity
      expect(await primaryStore.findById('test-1')).toEqual(entity);
      expect(await shadowStore.findById('test-1')).toEqual(entity);
    });

    it('should succeed primary and fail shadow when fault injected', async () => {
      const chaosInjector = FaultInjector.createForTest({
        enabled: true,
        failRate: 1, // Always fail
        seed: 'chaos-seed',
        scope: 'shadow_write_only',
      });

      const harness = createHarness(chaosInjector);
      const entity = { id: 'test-2', name: 'Test', value: 200 };

      const result = await harness.create(primaryStore, shadowStore, entity);

      // Primary should succeed
      expect(result.canonical).toEqual(entity);
      expect(await primaryStore.findById('test-2')).toEqual(entity);

      // Shadow should fail
      expect(result.shadowSuccess).toBe(false);
      expect(result.shadowError).toBeInstanceOf(InjectedFaultError);
      expect(result.faultId).toBeDefined();

      // Shadow store should NOT have the entity
      expect(await shadowStore.findById('test-2')).toBeNull();
    });

    it('should record failure when shadow fails', async () => {
      const chaosInjector = FaultInjector.createForTest({
        enabled: true,
        failRate: 1,
        seed: 'failure-record-seed',
        scope: 'shadow_write_only',
      });

      const harness = createHarness(chaosInjector);

      await harness.create(primaryStore, shadowStore, {
        id: 'test-3',
        name: 'Test',
        value: 300,
      }, { requestId: 'req-123' });

      expect(failureRecords).toHaveLength(1);
      expect(failureRecords[0]).toMatchObject({
        entityType: 'TestEntity',
        entityId: 'test-3',
        operation: 'create',
        primarySuccess: true,
        requestId: 'req-123',
      });
      expect(failureRecords[0].faultId).toBeDefined();
    });

    it('should emit metrics for successful shadow write', async () => {
      const harness = createHarness();

      await harness.create(primaryStore, shadowStore, {
        id: 'test-4',
        name: 'Test',
        value: 400,
      });

      expect(metricEvents).toContainEqual(
        expect.objectContaining({
          type: 'shadow_write_success',
          entityType: 'TestEntity',
          operation: 'create',
        })
      );
      expect(metricEvents).toContainEqual(
        expect.objectContaining({
          type: 'shadow_write_duration',
          entityType: 'TestEntity',
          operation: 'create',
        })
      );
    });

    it('should emit metrics for failed shadow write', async () => {
      const chaosInjector = FaultInjector.createForTest({
        enabled: true,
        failRate: 1,
        seed: 'metric-fail-seed',
        scope: 'shadow_write_only',
      });

      const harness = createHarness(chaosInjector);

      await harness.create(primaryStore, shadowStore, {
        id: 'test-5',
        name: 'Test',
        value: 500,
      });

      expect(metricEvents).toContainEqual(
        expect.objectContaining({
          type: 'shadow_write_failure',
          entityType: 'TestEntity',
          operation: 'create',
        })
      );
    });
  });

  describe('Update Operation', () => {
    it('should update both stores when no fault', async () => {
      const harness = createHarness();

      // First create
      await harness.create(primaryStore, shadowStore, {
        id: 'update-1',
        name: 'Original',
        value: 100,
      });

      // Then update
      const result = await harness.update(
        primaryStore,
        shadowStore,
        'update-1',
        { name: 'Updated', value: 200 }
      );

      expect(result.canonical.name).toBe('Updated');
      expect(result.canonical.value).toBe(200);
      expect(result.shadowSuccess).toBe(true);

      // Both stores should have updated entity
      const primary = await primaryStore.findById('update-1');
      const shadow = await shadowStore.findById('update-1');
      expect(primary?.name).toBe('Updated');
      expect(shadow?.name).toBe('Updated');
    });

    it('should succeed primary and fail shadow update when fault injected', async () => {
      // Create without chaos
      const harness = createHarness();
      await harness.create(primaryStore, shadowStore, {
        id: 'update-2',
        name: 'Original',
        value: 100,
      });

      // Update with chaos
      const chaosInjector = FaultInjector.createForTest({
        enabled: true,
        failRate: 1,
        seed: 'update-chaos-seed',
        scope: 'shadow_write_only',
      });
      const chaosHarness = createHarness(chaosInjector);

      const result = await chaosHarness.update(
        primaryStore,
        shadowStore,
        'update-2',
        { name: 'Updated' }
      );

      // Primary should be updated
      expect(result.canonical.name).toBe('Updated');
      expect(result.shadowSuccess).toBe(false);

      // Primary updated, shadow still has old value
      expect((await primaryStore.findById('update-2'))?.name).toBe('Updated');
      expect((await shadowStore.findById('update-2'))?.name).toBe('Original');
    });
  });

  describe('Delete Operation', () => {
    it('should delete from both stores when no fault', async () => {
      const harness = createHarness();

      // Create first
      await harness.create(primaryStore, shadowStore, {
        id: 'delete-1',
        name: 'ToDelete',
        value: 100,
      });

      // Then delete
      const result = await harness.delete(primaryStore, shadowStore, 'delete-1');

      expect(result.shadowSuccess).toBe(true);
      expect(await primaryStore.findById('delete-1')).toBeNull();
      expect(await shadowStore.findById('delete-1')).toBeNull();
    });

    it('should succeed primary and fail shadow delete when fault injected', async () => {
      // Create without chaos
      const harness = createHarness();
      await harness.create(primaryStore, shadowStore, {
        id: 'delete-2',
        name: 'ToDelete',
        value: 100,
      });

      // Delete with chaos
      const chaosInjector = FaultInjector.createForTest({
        enabled: true,
        failRate: 1,
        seed: 'delete-chaos-seed',
        scope: 'shadow_write_only',
      });
      const chaosHarness = createHarness(chaosInjector);

      const result = await chaosHarness.delete(primaryStore, shadowStore, 'delete-2');

      expect(result.shadowSuccess).toBe(false);
      // Primary deleted, shadow still has entity
      expect(await primaryStore.findById('delete-2')).toBeNull();
      expect(await shadowStore.findById('delete-2')).not.toBeNull();
    });
  });

  describe('Read Operation', () => {
    it('should read from primary store only', async () => {
      const harness = createHarness();

      // Create in primary only
      await primaryStore.create({ id: 'read-1', name: 'Primary', value: 100 });
      await shadowStore.create({ id: 'read-1', name: 'Shadow', value: 200 });

      // Read should come from primary
      const result = await harness.read(primaryStore, 'read-1');

      expect(result?.name).toBe('Primary');
      expect(result?.value).toBe(100);
    });
  });

  describe('Metrics Tracking', () => {
    it('should track cumulative metrics', async () => {
      const harness = createHarness();

      // Perform multiple operations
      await harness.create(primaryStore, shadowStore, { id: 'm1', name: 'T1', value: 1 });
      await harness.create(primaryStore, shadowStore, { id: 'm2', name: 'T2', value: 2 });
      await harness.update(primaryStore, shadowStore, 'm1', { value: 10 });

      const metrics = harness.getMetrics();

      expect(metrics.totalWrites).toBe(3);
      expect(metrics.shadowSuccesses).toBe(3);
      expect(metrics.shadowFailures).toBe(0);
      expect(metrics.avgShadowDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('should track failures separately from injected faults', async () => {
      // Create a store that throws real errors
      const failingStore: ShadowStore<TestEntity> = {
        create: vi.fn().mockRejectedValue(new Error('Real DB error')),
        update: vi.fn().mockRejectedValue(new Error('Real DB error')),
        delete: vi.fn().mockRejectedValue(new Error('Real DB error')),
        findById: vi.fn().mockResolvedValue(null),
        findAll: vi.fn().mockResolvedValue([]),
      };

      const harness = createHarness();

      await harness.create(primaryStore, failingStore, { id: 'f1', name: 'T1', value: 1 });

      const metrics = harness.getMetrics();
      expect(metrics.shadowFailures).toBe(1);
      expect(metrics.realErrors).toBe(1);
      expect(metrics.injectedFaults).toBe(0);
    });

    it('should reset metrics', async () => {
      const harness = createHarness();

      await harness.create(primaryStore, shadowStore, { id: 'r1', name: 'T1', value: 1 });
      expect(harness.getMetrics().totalWrites).toBe(1);

      harness.resetMetrics();
      expect(harness.getMetrics().totalWrites).toBe(0);
    });
  });

  describe('Partial Failure Rate', () => {
    it('should have some successes and some failures with 50% rate', async () => {
      const chaosInjector = FaultInjector.createForTest({
        enabled: true,
        failRate: 0.5,
        seed: 'partial-rate-seed',
        scope: 'shadow_write_only',
      });

      const harness = createHarness(chaosInjector);
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        await harness.create(primaryStore, shadowStore, {
          id: `partial-${i}`,
          name: `Test ${i}`,
          value: i,
        });
      }

      const metrics = harness.getMetrics();

      // Primary should always succeed
      expect(primaryStore.size()).toBe(iterations);

      // Shadow should have partial success
      expect(metrics.shadowSuccesses).toBeGreaterThan(0);
      expect(metrics.shadowFailures).toBeGreaterThan(0);
      expect(metrics.injectedFaults).toBe(metrics.shadowFailures);

      // Actual rate should be approximately 50%
      const actualRate = metrics.shadowFailures / iterations;
      expect(actualRate).toBeGreaterThan(0.3);
      expect(actualRate).toBeLessThan(0.7);
    });
  });

  describe('Error Handling', () => {
    it('should not break if onShadowFailure throws', async () => {
      const chaosInjector = FaultInjector.createForTest({
        enabled: true,
        failRate: 1,
        seed: 'callback-error-seed',
        scope: 'shadow_write_only',
      });

      const harness = new ShadowWriteHarness<TestEntity>({
        entityType: 'TestEntity',
        faultInjector: chaosInjector,
        onShadowFailure: async () => {
          throw new Error('Callback error');
        },
      });

      // Should not throw
      const result = await harness.create(primaryStore, shadowStore, {
        id: 'err-1',
        name: 'Test',
        value: 1,
      });

      // Primary still succeeds
      expect(result.canonical).toBeDefined();
      expect(result.shadowSuccess).toBe(false);
    });
  });
});
