/**
 * FaultInjector Unit Tests
 *
 * Tests for determinism, safety guards, and fault injection behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  FaultInjector,
  ChaosProductionError,
  InjectedFaultError,
  loadConfigFromEnv,
  getFaultInjector,
  resetFaultInjector,
} from '../fault-injector.js';

describe('FaultInjector', () => {
  beforeEach(() => {
    // Reset global state
    resetFaultInjector();
    // Clear relevant env vars
    delete process.env.CHAOS_ENABLED;
    delete process.env.CHAOS_FAIL_RATE;
    delete process.env.CHAOS_SEED;
    delete process.env.CHAOS_SCOPE;
  });

  afterEach(() => {
    resetFaultInjector();
  });

  describe('loadConfigFromEnv', () => {
    it('should return safe defaults when no env vars set', () => {
      const config = loadConfigFromEnv();

      expect(config.enabled).toBe(false);
      expect(config.failRate).toBe(0);
      expect(config.seed).toBeUndefined();
      expect(config.scope).toBe('shadow_write_only');
    });

    it('should parse CHAOS_ENABLED=true', () => {
      process.env.CHAOS_ENABLED = 'true';
      const config = loadConfigFromEnv();
      expect(config.enabled).toBe(true);
    });

    it('should parse CHAOS_FAIL_RATE', () => {
      process.env.CHAOS_FAIL_RATE = '0.5';
      const config = loadConfigFromEnv();
      expect(config.failRate).toBe(0.5);
    });

    it('should clamp invalid CHAOS_FAIL_RATE to 0', () => {
      process.env.CHAOS_FAIL_RATE = 'invalid';
      const config = loadConfigFromEnv();
      expect(config.failRate).toBe(0);
    });

    it('should parse CHAOS_SEED', () => {
      process.env.CHAOS_SEED = 'test-seed-123';
      const config = loadConfigFromEnv();
      expect(config.seed).toBe('test-seed-123');
    });

    it('should parse valid CHAOS_SCOPE', () => {
      process.env.CHAOS_SCOPE = 'all_writes';
      const config = loadConfigFromEnv();
      expect(config.scope).toBe('all_writes');
    });

    it('should default invalid CHAOS_SCOPE to shadow_write_only', () => {
      process.env.CHAOS_SCOPE = 'invalid_scope';
      const config = loadConfigFromEnv();
      expect(config.scope).toBe('shadow_write_only');
    });
  });

  describe('Production Safety Guard', () => {
    it('should throw ChaosProductionError when enabled in production', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        expect(() => {
          FaultInjector.create({ enabled: true, failRate: 0.5, scope: 'shadow_write_only' });
        }).toThrow(ChaosProductionError);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('should throw ChaosProductionError in createForTest when production', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        expect(() => {
          FaultInjector.createForTest({
            enabled: true,
            failRate: 0.5,
            scope: 'shadow_write_only',
          });
        }).toThrow(ChaosProductionError);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('should allow disabled chaos in production', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const injector = FaultInjector.create({ enabled: false, failRate: 0, scope: 'shadow_write_only' });
        expect(injector.isEnabled()).toBe(false);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });

  describe('Determinism with Seed', () => {
    it('should produce identical results with same seed', () => {
      const seed = 'deterministic-test-seed';

      const injector1 = FaultInjector.createForTest({
        enabled: true,
        failRate: 0.5,
        seed,
        scope: 'shadow_write_only',
      });

      const injector2 = FaultInjector.createForTest({
        enabled: true,
        failRate: 0.5,
        seed,
        scope: 'shadow_write_only',
      });

      // Generate 100 results from each
      const results1: boolean[] = [];
      const results2: boolean[] = [];

      for (let i = 0; i < 100; i++) {
        results1.push(injector1.check('shadow_write_only', `op-${i}`).shouldFail);
        results2.push(injector2.check('shadow_write_only', `op-${i}`).shouldFail);
      }

      expect(results1).toEqual(results2);
    });

    it('should produce different results with different seeds', () => {
      const injector1 = FaultInjector.createForTest({
        enabled: true,
        failRate: 0.5,
        seed: 'seed-alpha',
        scope: 'shadow_write_only',
      });

      const injector2 = FaultInjector.createForTest({
        enabled: true,
        failRate: 0.5,
        seed: 'seed-beta',
        scope: 'shadow_write_only',
      });

      // Generate 100 results from each
      const results1: boolean[] = [];
      const results2: boolean[] = [];

      for (let i = 0; i < 100; i++) {
        results1.push(injector1.check('shadow_write_only', `op-${i}`).shouldFail);
        results2.push(injector2.check('shadow_write_only', `op-${i}`).shouldFail);
      }

      // Results should differ (extremely unlikely to be identical with different seeds)
      expect(results1).not.toEqual(results2);
    });
  });

  describe('Fail Rate Behavior', () => {
    it('should never fail when failRate is 0', () => {
      const injector = FaultInjector.createForTest({
        enabled: true,
        failRate: 0,
        seed: 'zero-rate-test',
        scope: 'shadow_write_only',
      });

      for (let i = 0; i < 1000; i++) {
        const result = injector.check('shadow_write_only', `op-${i}`);
        expect(result.shouldFail).toBe(false);
      }
    });

    it('should always fail when failRate is 1', () => {
      const injector = FaultInjector.createForTest({
        enabled: true,
        failRate: 1,
        seed: 'full-rate-test',
        scope: 'shadow_write_only',
      });

      for (let i = 0; i < 100; i++) {
        const result = injector.check('shadow_write_only', `op-${i}`);
        expect(result.shouldFail).toBe(true);
      }
    });

    it('should fail approximately at the configured rate', () => {
      const failRate = 0.3;
      const iterations = 10000;

      const injector = FaultInjector.createForTest({
        enabled: true,
        failRate,
        seed: 'rate-accuracy-test',
        scope: 'shadow_write_only',
      });

      let failures = 0;
      for (let i = 0; i < iterations; i++) {
        if (injector.check('shadow_write_only', `op-${i}`).shouldFail) {
          failures++;
        }
      }

      const actualRate = failures / iterations;
      // Allow 5% tolerance
      expect(actualRate).toBeGreaterThan(failRate - 0.05);
      expect(actualRate).toBeLessThan(failRate + 0.05);
    });
  });

  describe('Scope Matching', () => {
    it('should only fail shadow_write_only when scope is shadow_write_only', () => {
      const injector = FaultInjector.createForTest({
        enabled: true,
        failRate: 1,
        seed: 'scope-test',
        scope: 'shadow_write_only',
      });

      expect(injector.check('shadow_write_only', 'op1').shouldFail).toBe(true);
      expect(injector.check('all_writes', 'op2').shouldFail).toBe(false);
      expect(injector.check('reads', 'op3').shouldFail).toBe(false);
    });

    it('should fail shadow_write_only and all_writes when scope is all_writes', () => {
      const injector = FaultInjector.createForTest({
        enabled: true,
        failRate: 1,
        seed: 'scope-test-2',
        scope: 'all_writes',
      });

      expect(injector.check('shadow_write_only', 'op1').shouldFail).toBe(true);
      expect(injector.check('all_writes', 'op2').shouldFail).toBe(true);
      expect(injector.check('reads', 'op3').shouldFail).toBe(false);
    });

    it('should fail all scopes when scope is reads', () => {
      const injector = FaultInjector.createForTest({
        enabled: true,
        failRate: 1,
        seed: 'scope-test-3',
        scope: 'reads',
      });

      expect(injector.check('shadow_write_only', 'op1').shouldFail).toBe(true);
      expect(injector.check('all_writes', 'op2').shouldFail).toBe(true);
      expect(injector.check('reads', 'op3').shouldFail).toBe(true);
    });
  });

  describe('Disabled Behavior', () => {
    it('should never fail when disabled', () => {
      const injector = FaultInjector.createForTest({
        enabled: false,
        failRate: 1, // Even with 100% fail rate
        seed: 'disabled-test',
        scope: 'shadow_write_only',
      });

      for (let i = 0; i < 100; i++) {
        const result = injector.check('shadow_write_only', `op-${i}`);
        expect(result.shouldFail).toBe(false);
        expect(result.reason).toBe('chaos_disabled');
      }
    });
  });

  describe('maybeInjectFault', () => {
    it('should throw InjectedFaultError when fault triggers', () => {
      const injector = FaultInjector.createForTest({
        enabled: true,
        failRate: 1,
        seed: 'throw-test',
        scope: 'shadow_write_only',
      });

      expect(() => {
        injector.maybeInjectFault('shadow_write_only', 'test-operation');
      }).toThrow(InjectedFaultError);
    });

    it('should not throw when fault does not trigger', () => {
      const injector = FaultInjector.createForTest({
        enabled: true,
        failRate: 0,
        seed: 'no-throw-test',
        scope: 'shadow_write_only',
      });

      expect(() => {
        injector.maybeInjectFault('shadow_write_only', 'test-operation');
      }).not.toThrow();
    });

    it('should include operation in error message', () => {
      const injector = FaultInjector.createForTest({
        enabled: true,
        failRate: 1,
        seed: 'error-msg-test',
        scope: 'shadow_write_only',
      });

      try {
        injector.maybeInjectFault('shadow_write_only', 'my-specific-operation');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(InjectedFaultError);
        expect((error as InjectedFaultError).message).toContain('my-specific-operation');
      }
    });
  });

  describe('wrapAsync', () => {
    it('should execute function when fault does not trigger', async () => {
      const injector = FaultInjector.createForTest({
        enabled: true,
        failRate: 0,
        seed: 'wrap-async-pass',
        scope: 'shadow_write_only',
      });

      const fn = vi.fn().mockResolvedValue('success');
      const result = await injector.wrapAsync('shadow_write_only', 'test-op', fn);

      expect(fn).toHaveBeenCalled();
      expect(result).toBe('success');
    });

    it('should throw before executing function when fault triggers', async () => {
      const injector = FaultInjector.createForTest({
        enabled: true,
        failRate: 1,
        seed: 'wrap-async-fail',
        scope: 'shadow_write_only',
      });

      const fn = vi.fn().mockResolvedValue('should-not-reach');

      await expect(
        injector.wrapAsync('shadow_write_only', 'test-op', fn)
      ).rejects.toThrow(InjectedFaultError);

      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('Statistics', () => {
    it('should track check and fault counts', () => {
      const injector = FaultInjector.createForTest({
        enabled: true,
        failRate: 0.5,
        seed: 'stats-test',
        scope: 'shadow_write_only',
      });

      // Perform 100 checks
      for (let i = 0; i < 100; i++) {
        injector.check('shadow_write_only', `op-${i}`);
      }

      const stats = injector.getStats();
      expect(stats.checks).toBe(100);
      expect(stats.faults).toBeGreaterThan(0);
      expect(stats.faults).toBeLessThan(100);
      expect(stats.faultRate).toBeCloseTo(stats.faults / 100, 2);
    });

    it('should reset statistics', () => {
      const injector = FaultInjector.createForTest({
        enabled: true,
        failRate: 1,
        seed: 'reset-stats-test',
        scope: 'shadow_write_only',
      });

      injector.check('shadow_write_only', 'op1');
      expect(injector.getStats().checks).toBe(1);

      injector.resetStats();
      expect(injector.getStats().checks).toBe(0);
      expect(injector.getStats().faults).toBe(0);
    });
  });

  describe('Global Singleton', () => {
    it('should return same instance from getFaultInjector', () => {
      const instance1 = getFaultInjector();
      const instance2 = getFaultInjector();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getFaultInjector();
      resetFaultInjector();
      const instance2 = getFaultInjector();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Fault ID Generation', () => {
    it('should generate unique fault IDs', () => {
      const injector = FaultInjector.createForTest({
        enabled: true,
        failRate: 1,
        seed: 'fault-id-test',
        scope: 'shadow_write_only',
      });

      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const result = injector.check('shadow_write_only', `op-${i}`);
        if (result.faultId) {
          ids.add(result.faultId);
        }
      }

      expect(ids.size).toBe(100); // All unique
    });

    it('should include fault_ prefix in fault IDs', () => {
      const injector = FaultInjector.createForTest({
        enabled: true,
        failRate: 1,
        seed: 'fault-prefix-test',
        scope: 'shadow_write_only',
      });

      const result = injector.check('shadow_write_only', 'test-op');
      expect(result.faultId).toMatch(/^fault_/);
    });
  });
});
