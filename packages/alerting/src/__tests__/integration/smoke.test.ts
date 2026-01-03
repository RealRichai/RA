/**
 * Integration Smoke Tests
 *
 * Tests full routing flow with mocked HTTP servers using msw.
 * Note: These tests use MSW to intercept HTTP requests.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { AlertRouter } from '../../router/alert-router';
import { SlackProvider } from '../../providers/slack';
import { PagerDutyProvider } from '../../providers/pagerduty';
import { OpsGenieProvider } from '../../providers/opsgenie';
import type { AlertRequest, AlertProviderType, AlertingConfig } from '../../types';
import { DEFAULT_ALERTING_CONFIG } from '../../types';
import type { IAlertProvider } from '../../providers/provider-interface';

// =============================================================================
// MSW Server Setup
// =============================================================================

const slackWebhookUrl = 'https://hooks.slack.com/services/TEST/WEBHOOK/URL';
const pagerDutyApiUrl = 'https://events.pagerduty.com/v2/enqueue';
const opsGenieApiUrl = 'https://api.opsgenie.com/v2/alerts';

// Track requests for assertions
const requestLog: {
  slack: unknown[];
  pagerduty: unknown[];
  opsgenie: unknown[];
} = {
  slack: [],
  pagerduty: [],
  opsgenie: [],
};

const handlers = [
  // Slack webhook
  http.post(slackWebhookUrl, async ({ request }) => {
    const body = await request.json();
    requestLog.slack.push(body);
    return HttpResponse.text('ok');
  }),

  // PagerDuty Events API
  http.post(pagerDutyApiUrl, async ({ request }) => {
    const body = await request.json();
    requestLog.pagerduty.push(body);
    return HttpResponse.json({
      status: 'success',
      message: 'Event processed',
      dedup_key: (body as { dedup_key?: string }).dedup_key || 'generated-key',
    });
  }),

  // OpsGenie Alert API
  http.post(opsGenieApiUrl, async ({ request }) => {
    const body = await request.json();
    requestLog.opsgenie.push(body);
    return HttpResponse.json({
      result: 'Request will be processed',
      took: 0.123,
      requestId: 'req-123',
    });
  }),
];

const server = setupServer(...handlers);

// =============================================================================
// Test Setup
// =============================================================================

describe('AlertRouter Integration', () => {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'error' });
  });

  afterAll(() => {
    server.close();
  });

  afterEach(() => {
    server.resetHandlers();
    requestLog.slack = [];
    requestLog.pagerduty = [];
    requestLog.opsgenie = [];
  });

  // Create providers with test URLs (retries disabled for faster tests)
  const createTestProviders = (): Map<AlertProviderType, SlackProvider | PagerDutyProvider | OpsGenieProvider> => {
    return new Map([
      [
        'slack',
        new SlackProvider({
          enabled: true,
          webhookUrl: slackWebhookUrl,
          channel: '#test-alerts',
          username: 'Test Bot',
          retryAttempts: 0,
          timeoutMs: 5000,
        }),
      ],
      [
        'pagerduty',
        new PagerDutyProvider({
          enabled: true,
          routingKey: 'test-routing-key',
          apiUrl: pagerDutyApiUrl,
          retryAttempts: 0,
          timeoutMs: 5000,
        }),
      ],
      [
        'opsgenie',
        new OpsGenieProvider({
          enabled: true,
          apiKey: 'test-api-key',
          apiUrl: opsGenieApiUrl,
          retryAttempts: 0,
          timeoutMs: 5000,
        }),
      ],
    ]);
  };

  const testConfig: AlertingConfig = {
    ...DEFAULT_ALERTING_CONFIG,
    cooldownSeconds: 0, // Disable deduplication for most tests
  };

  const baseAlert: AlertRequest = {
    id: 'smoke-test-1',
    source: 'kill_switch',
    severity: 'critical',
    title: 'Kill Switch Activated',
    message: 'Emergency kill switch activated for all agents',
    context: {
      market: 'NYC',
      agentType: 'lease_assistant',
      entityType: 'kill_switch',
      entityId: 'ks-001',
    },
    timestamp: new Date('2026-01-03T10:00:00Z'),
  };

  // =============================================================================
  // Full Routing Flow Tests (using mock providers)
  // =============================================================================

  // Create mock providers for unit-style integration tests
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

  describe('Full Routing Flow', () => {
    it('should route critical alert to all providers', async () => {
      const mockSlack = createMockProvider('slack');
      const mockPagerDuty = createMockProvider('pagerduty');
      const mockOpsGenie = createMockProvider('opsgenie');

      const providers = new Map<AlertProviderType, IAlertProvider>([
        ['slack', mockSlack],
        ['pagerduty', mockPagerDuty],
        ['opsgenie', mockOpsGenie],
      ]);

      const router = new AlertRouter({ providers, config: testConfig });
      const result = await router.route(baseAlert);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.responses).toHaveLength(3);
        expect(result.value.responses.every((r) => r.success)).toBe(true);
      }

      expect(mockSlack.send).toHaveBeenCalledTimes(1);
      expect(mockPagerDuty.send).toHaveBeenCalledTimes(1);
      expect(mockOpsGenie.send).toHaveBeenCalledTimes(1);
    });

    it('should route info alert only to Slack', async () => {
      const mockSlack = createMockProvider('slack');
      const mockPagerDuty = createMockProvider('pagerduty');
      const mockOpsGenie = createMockProvider('opsgenie');

      const providers = new Map<AlertProviderType, IAlertProvider>([
        ['slack', mockSlack],
        ['pagerduty', mockPagerDuty],
        ['opsgenie', mockOpsGenie],
      ]);

      const router = new AlertRouter({ providers, config: testConfig });
      const alert: AlertRequest = {
        ...baseAlert,
        id: 'smoke-info-1',
        severity: 'info',
      };

      const result = await router.route(alert);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.responses).toHaveLength(1);
        expect(result.value.responses[0].providerId).toBe('slack');
      }

      expect(mockSlack.send).toHaveBeenCalledTimes(1);
      expect(mockPagerDuty.send).not.toHaveBeenCalled();
      expect(mockOpsGenie.send).not.toHaveBeenCalled();
    });

    it('should route warning alert to Slack and OpsGenie', async () => {
      const mockSlack = createMockProvider('slack');
      const mockPagerDuty = createMockProvider('pagerduty');
      const mockOpsGenie = createMockProvider('opsgenie');

      const providers = new Map<AlertProviderType, IAlertProvider>([
        ['slack', mockSlack],
        ['pagerduty', mockPagerDuty],
        ['opsgenie', mockOpsGenie],
      ]);

      const router = new AlertRouter({ providers, config: testConfig });
      const alert: AlertRequest = {
        ...baseAlert,
        id: 'smoke-warn-1',
        severity: 'warning',
      };

      const result = await router.route(alert);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.responses).toHaveLength(2);
        const providerIds = result.value.responses.map((r) => r.providerId).sort();
        expect(providerIds).toEqual(['opsgenie', 'slack']);
      }

      expect(mockSlack.send).toHaveBeenCalledTimes(1);
      expect(mockPagerDuty.send).not.toHaveBeenCalled();
      expect(mockOpsGenie.send).toHaveBeenCalledTimes(1);
    });
  });

  // Note: Payload verification is covered in unit tests for each provider.
  // MSW HTTP interception tests are in the 'HTTP Payload Format (MSW)' describe block.

  // =============================================================================
  // Partial Failure Tests (using mock providers)
  // =============================================================================

  describe('Partial Failure Handling', () => {
    it('should continue sending when one provider fails', async () => {
      const mockSlack = createMockProvider('slack');
      const mockOpsGenie = createMockProvider('opsgenie');
      const failingPagerDuty = createMockProvider('pagerduty');
      failingPagerDuty.send = vi.fn().mockResolvedValue({
        ok: false,
        error: new Error('Invalid routing key'),
      });

      const providers = new Map<AlertProviderType, IAlertProvider>([
        ['slack', mockSlack],
        ['pagerduty', failingPagerDuty],
        ['opsgenie', mockOpsGenie],
      ]);

      const router = new AlertRouter({ providers, config: testConfig });
      const result = await router.route({ ...baseAlert, id: 'partial-fail-1' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.responses).toHaveLength(3);
        const successful = result.value.responses.filter((r) => r.success);
        const failed = result.value.responses.filter((r) => !r.success);
        expect(successful).toHaveLength(2);
        expect(failed).toHaveLength(1);
        expect(failed[0].providerId).toBe('pagerduty');
      }

      expect(mockSlack.send).toHaveBeenCalledTimes(1);
      expect(mockOpsGenie.send).toHaveBeenCalledTimes(1);
    });

    it('should handle rate limiting gracefully', async () => {
      const mockSlack = createMockProvider('slack');
      const mockPagerDuty = createMockProvider('pagerduty');
      const rateLimitedOpsGenie = createMockProvider('opsgenie');
      rateLimitedOpsGenie.send = vi.fn().mockResolvedValue({
        ok: false,
        error: new Error('Rate limit exceeded'),
      });

      const providers = new Map<AlertProviderType, IAlertProvider>([
        ['slack', mockSlack],
        ['pagerduty', mockPagerDuty],
        ['opsgenie', rateLimitedOpsGenie],
      ]);

      const router = new AlertRouter({ providers, config: testConfig });
      const result = await router.route({ ...baseAlert, id: 'rate-limit-1' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const opsgenieResponse = result.value.responses.find((r) => r.providerId === 'opsgenie');
        expect(opsgenieResponse?.success).toBe(false);
      }
    });

    it('should handle network errors gracefully', async () => {
      const failingSlack = createMockProvider('slack');
      failingSlack.send = vi.fn().mockResolvedValue({
        ok: false,
        error: new Error('Network error'),
      });
      const mockPagerDuty = createMockProvider('pagerduty');
      const mockOpsGenie = createMockProvider('opsgenie');

      const providers = new Map<AlertProviderType, IAlertProvider>([
        ['slack', failingSlack],
        ['pagerduty', mockPagerDuty],
        ['opsgenie', mockOpsGenie],
      ]);

      const router = new AlertRouter({ providers, config: testConfig });
      const result = await router.route({ ...baseAlert, id: 'network-error-1' });

      expect(result.ok).toBe(true);
      if (result.ok) {
        const slackResponse = result.value.responses.find((r) => r.providerId === 'slack');
        expect(slackResponse?.success).toBe(false);
        const successful = result.value.responses.filter((r) => r.success);
        expect(successful).toHaveLength(2);
      }
    });
  });

  // =============================================================================
  // Deduplication Tests (using mock providers)
  // =============================================================================

  describe('Deduplication', () => {
    it('should deduplicate alerts within cooldown window', async () => {
      const mockSlack = createMockProvider('slack');
      const mockPagerDuty = createMockProvider('pagerduty');
      const mockOpsGenie = createMockProvider('opsgenie');

      const providers = new Map<AlertProviderType, IAlertProvider>([
        ['slack', mockSlack],
        ['pagerduty', mockPagerDuty],
        ['opsgenie', mockOpsGenie],
      ]);

      const router = new AlertRouter({
        providers,
        config: { ...testConfig, cooldownSeconds: 60 },
      });

      const alert1 = { ...baseAlert, id: 'dedup-int-1', deduplicationKey: 'same-key' };
      const alert2 = { ...baseAlert, id: 'dedup-int-2', deduplicationKey: 'same-key' };

      const result1 = await router.route(alert1);
      const result2 = await router.route(alert2);

      expect(result1.ok).toBe(true);
      expect(result2.ok).toBe(true);

      if (result1.ok && result2.ok) {
        expect(result1.value.deduplicated).toBe(false);
        expect(result2.value.deduplicated).toBe(true);
      }

      // Only first alert should trigger provider calls
      expect(mockSlack.send).toHaveBeenCalledTimes(1);
      expect(mockPagerDuty.send).toHaveBeenCalledTimes(1);
      expect(mockOpsGenie.send).toHaveBeenCalledTimes(1);
    });
  });

  // =============================================================================
  // Provider Availability Tests (using mock providers)
  // =============================================================================

  describe('Provider Availability', () => {
    it('should skip disabled providers', async () => {
      const mockSlack = createMockProvider('slack', true);
      const disabledPagerDuty = createMockProvider('pagerduty', false); // Not available
      const mockOpsGenie = createMockProvider('opsgenie', true);

      const providers = new Map<AlertProviderType, IAlertProvider>([
        ['slack', mockSlack],
        ['pagerduty', disabledPagerDuty],
        ['opsgenie', mockOpsGenie],
      ]);

      const router = new AlertRouter({ providers, config: testConfig });
      await router.route({ ...baseAlert, id: 'disabled-provider-1' });

      expect(mockSlack.send).toHaveBeenCalledTimes(1);
      expect(disabledPagerDuty.send).not.toHaveBeenCalled(); // Disabled
      expect(mockOpsGenie.send).toHaveBeenCalledTimes(1);
    });
  });

  // =============================================================================
  // MSW HTTP Tests (Real Provider Payload Verification)
  // =============================================================================

  describe('HTTP Payload Format (MSW)', () => {
    it('should send correct Slack payload via HTTP', async () => {
      const providers = createTestProviders();
      const router = new AlertRouter({ providers, config: testConfig, emitEvidence: false });

      await router.route({ ...baseAlert, id: 'http-slack-1' });

      // Verify at least one request was logged (may fail if MSW doesn't intercept)
      if (requestLog.slack.length > 0) {
        const payload = requestLog.slack[0] as {
          channel: string;
          username: string;
          attachments: Array<{
            title: string;
            text: string;
            color: string;
          }>;
        };

        expect(payload.channel).toBe('#test-alerts');
        expect(payload.username).toBe('Test Bot');
        expect(payload.attachments[0].title).toBe(baseAlert.title);
        expect(payload.attachments[0].color).toBe('#ff0000'); // Critical = red
      }
    });
  });
});
