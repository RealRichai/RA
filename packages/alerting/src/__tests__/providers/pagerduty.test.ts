/**
 * PagerDuty Provider Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { PagerDutyProvider, createPagerDutyProvider } from '../../providers/pagerduty';
import type { AlertRequest } from '../../types';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('PagerDutyProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validConfig = {
    enabled: true,
    routingKey: 'test-routing-key-123',
    apiUrl: 'https://events.pagerduty.com/v2/enqueue',
  };

  const testAlert: AlertRequest = {
    id: 'alert-456',
    source: 'kill_switch',
    severity: 'critical',
    title: 'Kill Switch Activated',
    message: 'Emergency kill switch activated for agent type: lease_assistant',
    context: {
      market: 'NYC',
      agentType: 'lease_assistant',
      entityType: 'kill_switch',
      entityId: 'ks-789',
    },
    timestamp: new Date('2026-01-03T12:00:00Z'),
  };

  describe('isAvailable', () => {
    it('should return true when configured and enabled', () => {
      const provider = createPagerDutyProvider(validConfig);
      expect(provider.isAvailable()).toBe(true);
    });

    it('should return false when disabled', () => {
      const provider = createPagerDutyProvider({ ...validConfig, enabled: false });
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return false when routing key is missing', () => {
      const provider = createPagerDutyProvider({
        ...validConfig,
        routingKey: '',
      });
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe('validateCredentials', () => {
    it('should return true when configured', async () => {
      const provider = createPagerDutyProvider(validConfig);
      const result = await provider.validateCredentials();
      expect(result).toBe(true);
    });

    it('should return false when not configured', async () => {
      const provider = createPagerDutyProvider({ ...validConfig, routingKey: '' });
      const result = await provider.validateCredentials();
      expect(result).toBe(false);
    });
  });

  describe('send', () => {
    it('should send alert successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'success',
          message: 'Event processed',
          dedup_key: 'alert-456',
        }),
      });

      const provider = createPagerDutyProvider(validConfig);
      const result = await provider.send(testAlert);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.providerId).toBe('pagerduty');
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(validConfig.apiUrl);
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      // Verify payload structure
      const payload = JSON.parse(options.body);
      expect(payload.routing_key).toBe(validConfig.routingKey);
      expect(payload.event_action).toBe('trigger');
      expect(payload.dedup_key).toBe(testAlert.id);
      expect(payload.payload.summary).toBe(`[CRITICAL] ${testAlert.title}`);
      expect(payload.payload.severity).toBe('critical');
      expect(payload.payload.source).toBe('kill_switch');
    });

    it('should map severity correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'success', dedup_key: 'test' }),
      });

      const provider = createPagerDutyProvider(validConfig);

      // Test critical
      await provider.send({ ...testAlert, severity: 'critical' });
      let payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.payload.severity).toBe('critical');

      // Test warning
      mockFetch.mockClear();
      await provider.send({ ...testAlert, severity: 'warning' });
      payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.payload.severity).toBe('warning');

      // Test info
      mockFetch.mockClear();
      await provider.send({ ...testAlert, severity: 'info' });
      payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.payload.severity).toBe('info');
    });

    it('should use custom deduplication key when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'success', dedup_key: 'custom-key' }),
      });

      const provider = createPagerDutyProvider(validConfig);
      await provider.send({ ...testAlert, deduplicationKey: 'custom-dedup-key' });

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.dedup_key).toBe('custom-dedup-key');
    });

    it('should include context in custom_details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'success', dedup_key: 'test' }),
      });

      const provider = createPagerDutyProvider(validConfig);
      await provider.send(testAlert);

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.payload.custom_details.market).toBe('NYC');
      expect(payload.payload.custom_details.agentType).toBe('lease_assistant');
      expect(payload.payload.custom_details.entityId).toBe('ks-789');
    });

    it('should return failure when not configured', async () => {
      const provider = createPagerDutyProvider({ ...validConfig, routingKey: '' });
      const result = await provider.send(testAlert);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('not configured');
      }
    });

    it('should handle API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          status: 'invalid event',
          message: 'Event object is invalid',
        }),
      });

      const provider = createPagerDutyProvider({
        ...validConfig,
        retryAttempts: 0,
      });
      const result = await provider.send(testAlert);

      expect(result.ok).toBe(false);
    });

    it('should handle rate limiting (429)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ message: 'Rate limit exceeded' }),
      });

      const provider = createPagerDutyProvider({
        ...validConfig,
        retryAttempts: 0,
      });
      const result = await provider.send(testAlert);

      expect(result.ok).toBe(false);
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const provider = createPagerDutyProvider({
        ...validConfig,
        retryAttempts: 0,
      });
      const result = await provider.send(testAlert);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Network error');
      }
    });
  });

  describe('payload format', () => {
    it('should include timestamp in ISO format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'success', dedup_key: 'test' }),
      });

      const provider = createPagerDutyProvider(validConfig);
      await provider.send(testAlert);

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.payload.timestamp).toBe('2026-01-03T12:00:00.000Z');
    });

    it('should include component from context entityType', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'success', dedup_key: 'test' }),
      });

      const provider = createPagerDutyProvider(validConfig);
      await provider.send(testAlert);

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.payload.component).toBe('kill_switch'); // From context.entityType
      expect(payload.payload.group).toBe('NYC'); // From context.market
    });
  });
});
