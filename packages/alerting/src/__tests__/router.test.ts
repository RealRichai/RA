/**
 * AlertRouter Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  AlertRouter,
  createAlertRouter,
  getAlertRouter,
  setAlertRouter,
  resetAlertRouter,
} from '../router/alert-router';
import type { IAlertProvider } from '../providers/provider-interface';
import type { AlertRequest, AlertProviderType, AlertingConfig } from '../types';
import { DEFAULT_ALERTING_CONFIG } from '../types';

// Mock evidence emitter
vi.mock('../evidence/alert-evidence', () => ({
  emitAlertEvidence: vi.fn(),
}));

describe('AlertRouter', () => {
  // Mock providers
  const createMockProvider = (id: AlertProviderType, available = true): IAlertProvider => ({
    providerId: id,
    isAvailable: vi.fn().mockReturnValue(available),
    validateCredentials: vi.fn().mockResolvedValue(available),
    send: vi.fn().mockResolvedValue({
      ok: true,
      value: {
        success: true,
        providerId: id,
        durationMs: 50,
        sentAt: new Date(),
      },
    }),
  });

  let mockSlack: IAlertProvider;
  let mockPagerDuty: IAlertProvider;
  let mockOpsGenie: IAlertProvider;
  let providers: Map<AlertProviderType, IAlertProvider>;

  const testConfig: AlertingConfig = {
    ...DEFAULT_ALERTING_CONFIG,
    cooldownSeconds: 1, // Short cooldown for tests
  };

  const baseAlert: AlertRequest = {
    id: 'test-alert-1',
    source: 'kill_switch',
    severity: 'critical',
    title: 'Test Alert',
    message: 'This is a test alert',
    timestamp: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetAlertRouter();

    mockSlack = createMockProvider('slack');
    mockPagerDuty = createMockProvider('pagerduty');
    mockOpsGenie = createMockProvider('opsgenie');

    providers = new Map([
      ['slack', mockSlack],
      ['pagerduty', mockPagerDuty],
      ['opsgenie', mockOpsGenie],
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetAlertRouter();
  });

  describe('constructor and factory', () => {
    it('should create router with providers', () => {
      const router = new AlertRouter({ providers, config: testConfig });
      expect(router).toBeInstanceOf(AlertRouter);
    });

    it('should create router via factory function', () => {
      const router = createAlertRouter({ providers, config: testConfig });
      expect(router).toBeInstanceOf(AlertRouter);
    });
  });

  describe('singleton management', () => {
    it('should set and get router singleton', () => {
      const router = new AlertRouter({ providers, config: testConfig });
      setAlertRouter(router);
      expect(getAlertRouter()).toBe(router);
    });

    it('should return null when no router set', () => {
      expect(getAlertRouter()).toBeNull();
    });

    it('should reset router singleton', () => {
      const router = new AlertRouter({ providers, config: testConfig });
      setAlertRouter(router);
      resetAlertRouter();
      expect(getAlertRouter()).toBeNull();
    });
  });

  describe('severity-based routing', () => {
    it('should route info alerts to slack only', async () => {
      const router = new AlertRouter({ providers, config: testConfig });
      const alert = { ...baseAlert, id: 'info-1', severity: 'info' as const };

      const result = await router.route(alert);

      expect(result.ok).toBe(true);
      expect(mockSlack.send).toHaveBeenCalledTimes(1);
      expect(mockPagerDuty.send).not.toHaveBeenCalled();
      expect(mockOpsGenie.send).not.toHaveBeenCalled();
    });

    it('should route warning alerts to slack and opsgenie', async () => {
      const router = new AlertRouter({ providers, config: testConfig });
      const alert = { ...baseAlert, id: 'warn-1', severity: 'warning' as const };

      const result = await router.route(alert);

      expect(result.ok).toBe(true);
      expect(mockSlack.send).toHaveBeenCalledTimes(1);
      expect(mockPagerDuty.send).not.toHaveBeenCalled();
      expect(mockOpsGenie.send).toHaveBeenCalledTimes(1);
    });

    it('should route critical alerts to all providers', async () => {
      const router = new AlertRouter({ providers, config: testConfig });
      const alert = { ...baseAlert, id: 'crit-1', severity: 'critical' as const };

      const result = await router.route(alert);

      expect(result.ok).toBe(true);
      expect(mockSlack.send).toHaveBeenCalledTimes(1);
      expect(mockPagerDuty.send).toHaveBeenCalledTimes(1);
      expect(mockOpsGenie.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('explicit provider targeting', () => {
    it('should override routing when targetProviders specified', async () => {
      const router = new AlertRouter({ providers, config: testConfig });
      const alert = {
        ...baseAlert,
        id: 'target-1',
        severity: 'info' as const,
        targetProviders: ['pagerduty'] as AlertProviderType[],
      };

      const result = await router.route(alert);

      expect(result.ok).toBe(true);
      expect(mockSlack.send).not.toHaveBeenCalled();
      expect(mockPagerDuty.send).toHaveBeenCalledTimes(1);
      expect(mockOpsGenie.send).not.toHaveBeenCalled();
    });

    it('should send to multiple explicit providers', async () => {
      const router = new AlertRouter({ providers, config: testConfig });
      const alert = {
        ...baseAlert,
        id: 'target-2',
        targetProviders: ['slack', 'opsgenie'] as AlertProviderType[],
      };

      const result = await router.route(alert);

      expect(result.ok).toBe(true);
      expect(mockSlack.send).toHaveBeenCalledTimes(1);
      expect(mockPagerDuty.send).not.toHaveBeenCalled();
      expect(mockOpsGenie.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('provider availability', () => {
    it('should skip unavailable providers', async () => {
      mockPagerDuty.isAvailable = vi.fn().mockReturnValue(false);
      const router = new AlertRouter({ providers, config: testConfig });
      const alert = { ...baseAlert, id: 'avail-1' };

      const result = await router.route(alert);

      expect(result.ok).toBe(true);
      expect(mockSlack.send).toHaveBeenCalledTimes(1);
      expect(mockPagerDuty.send).not.toHaveBeenCalled();
      expect(mockOpsGenie.send).toHaveBeenCalledTimes(1);
    });

    it('should return empty result when no providers available', async () => {
      const emptyProviders = new Map<AlertProviderType, IAlertProvider>();
      const router = new AlertRouter({ providers: emptyProviders, config: testConfig });

      const result = await router.route({ ...baseAlert, id: 'empty-1' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.responses).toHaveLength(0);
      }
    });
  });

  describe('deduplication', () => {
    it('should deduplicate alerts with same deduplicationKey within cooldown', async () => {
      const router = new AlertRouter({
        providers,
        config: { ...testConfig, cooldownSeconds: 60 },
      });

      const alert1 = { ...baseAlert, id: 'dedup-1', deduplicationKey: 'same-key' };
      const alert2 = { ...baseAlert, id: 'dedup-2', deduplicationKey: 'same-key' };

      const result1 = await router.route(alert1);
      const result2 = await router.route(alert2);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);

      if (result1.ok && result2.ok) {
        expect(result1.value.deduplicated).toBe(false);
        expect(result2.value.deduplicated).toBe(true);
        expect(result2.value.responses).toHaveLength(0);
      }

      // First alert sends to all, second is deduped
      expect(mockSlack.send).toHaveBeenCalledTimes(1);
    });

    it('should not deduplicate alerts with different deduplicationKeys', async () => {
      const router = new AlertRouter({
        providers,
        config: { ...testConfig, cooldownSeconds: 60 },
      });

      const alert1 = { ...baseAlert, id: 'dedup-3', deduplicationKey: 'key-a' };
      const alert2 = { ...baseAlert, id: 'dedup-4', deduplicationKey: 'key-b' };

      await router.route(alert1);
      await router.route(alert2);

      // Both alerts should be sent
      expect(mockSlack.send).toHaveBeenCalledTimes(2);
    });

    it('should allow alert after cooldown expires', async () => {
      const router = new AlertRouter({
        providers,
        config: { ...testConfig, cooldownSeconds: 0.1 }, // 100ms cooldown
      });

      const alert1 = { ...baseAlert, id: 'dedup-5', deduplicationKey: 'expire-key' };
      const alert2 = { ...baseAlert, id: 'dedup-6', deduplicationKey: 'expire-key' };

      await router.route(alert1);

      // Wait for cooldown to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      const result2 = await router.route(alert2);

      expect(result2.ok).toBe(true);
      if (result2.ok) {
        expect(result2.value.deduplicated).toBe(false);
      }

      expect(mockSlack.send).toHaveBeenCalledTimes(2);
    });

    it('should use alert.id as default deduplication key', async () => {
      const router = new AlertRouter({
        providers,
        config: { ...testConfig, cooldownSeconds: 60 },
      });

      const alert1 = { ...baseAlert, id: 'same-id' };
      const alert2 = { ...baseAlert, id: 'same-id' };

      await router.route(alert1);
      const result2 = await router.route(alert2);

      expect(result2.ok).toBe(true);
      if (result2.ok) {
        expect(result2.value.deduplicated).toBe(true);
      }
    });
  });

  describe('partial failure handling', () => {
    it('should continue sending when one provider fails', async () => {
      mockPagerDuty.send = vi.fn().mockResolvedValue({
        ok: false,
        error: new Error('PagerDuty API error'),
      });

      const router = new AlertRouter({ providers, config: testConfig });
      const result = await router.route({ ...baseAlert, id: 'partial-1' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.responses).toHaveLength(3);
        const successCount = result.value.responses.filter((r) => r.success).length;
        const failCount = result.value.responses.filter((r) => !r.success).length;
        expect(successCount).toBe(2);
        expect(failCount).toBe(1);
      }
    });

    it('should include error details for failed providers', async () => {
      // Create fresh mock provider that returns a failure
      const failingOpsGenie = createMockProvider('opsgenie', true);
      failingOpsGenie.send = vi.fn().mockResolvedValue({
        ok: false,
        error: new Error('OpsGenie timeout'),
      });

      const testProviders = new Map<AlertProviderType, IAlertProvider>([
        ['slack', mockSlack],
        ['pagerduty', mockPagerDuty],
        ['opsgenie', failingOpsGenie],
      ]);

      const router = new AlertRouter({ providers: testProviders, config: testConfig });
      const result = await router.route({ ...baseAlert, id: 'partial-2' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const failedResponse = result.value.responses.find(
          (r) => r.providerId === 'opsgenie'
        );
        expect(failedResponse).toBeDefined();
        expect(failedResponse!.success).toBe(false);
        expect(failedResponse!.error).toContain('OpsGenie timeout');
      }
    });
  });

  describe('result aggregation', () => {
    it('should aggregate all provider responses', async () => {
      const router = new AlertRouter({ providers, config: testConfig });
      const result = await router.route({ ...baseAlert, id: 'agg-1' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.responses).toHaveLength(3);
        expect(result.value.responses.map((r) => r.providerId).sort()).toEqual([
          'opsgenie',
          'pagerduty',
          'slack',
        ]);
      }
    });

    it('should include alert ID in result', async () => {
      const router = new AlertRouter({ providers, config: testConfig });
      const result = await router.route({ ...baseAlert, id: 'agg-2' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.alertId).toBe('agg-2');
      }
    });

    it('should indicate whether all providers succeeded', async () => {
      const router = new AlertRouter({ providers, config: testConfig });
      const result = await router.route({ ...baseAlert, id: 'agg-3' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.allSuccessful).toBe(true);
        expect(result.value.deduplicated).toBe(false);
      }
    });
  });

  describe('validation', () => {
    it('should reject invalid alert requests', async () => {
      const router = new AlertRouter({ providers, config: testConfig });

      // Missing required fields
      const invalidAlert = {
        id: 'invalid-1',
        // missing source, severity, title, message
      } as unknown as AlertRequest;

      const result = await router.route(invalidAlert);

      expect(result.ok).toBe(false);
    });

    it('should reject invalid severity', async () => {
      const router = new AlertRouter({ providers, config: testConfig });

      const invalidAlert = {
        ...baseAlert,
        id: 'invalid-2',
        severity: 'extreme' as unknown,
      } as AlertRequest;

      const result = await router.route(invalidAlert);

      expect(result.ok).toBe(false);
    });
  });

  describe('evidence emission', () => {
    it('should set evidenceRecorded flag when configured', async () => {
      const router = new AlertRouter({
        providers,
        config: testConfig,
        emitEvidence: true,
      });

      const result = await router.route({ ...baseAlert, id: 'evidence-1' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.evidenceRecorded).toBe(true);
      }
    });

    it('should not set evidenceRecorded flag when disabled', async () => {
      const router = new AlertRouter({
        providers,
        config: testConfig,
        emitEvidence: false,
      });

      const result = await router.route({ ...baseAlert, id: 'evidence-2' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.evidenceRecorded).toBe(false);
      }
    });

    it('should mark deduplicated alerts correctly', async () => {
      const router = new AlertRouter({
        providers,
        config: { ...testConfig, cooldownSeconds: 60 },
        emitEvidence: true,
      });

      const alert = { ...baseAlert, id: 'evidence-3', deduplicationKey: 'dup-evidence' };

      const result1 = await router.route(alert);
      const result2 = await router.route({ ...alert, id: 'evidence-4' });

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);
      if (result1.ok && result2.ok) {
        expect(result1.value.deduplicated).toBe(false);
        expect(result2.value.deduplicated).toBe(true);
      }
    });
  });
});
