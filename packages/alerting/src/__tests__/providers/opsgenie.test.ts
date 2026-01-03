/**
 * OpsGenie Provider Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { OpsGenieProvider, createOpsGenieProvider } from '../../providers/opsgenie';
import type { AlertRequest } from '../../types';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OpsGenieProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validConfig = {
    enabled: true,
    apiKey: 'test-api-key-123',
    apiUrl: 'https://api.opsgenie.com/v2/alerts',
  };

  const testAlert: AlertRequest = {
    id: 'alert-789',
    source: 'policy_violation',
    severity: 'warning',
    title: 'Policy Violation Detected',
    message: 'Agent exceeded daily API call limit',
    context: {
      market: 'LA',
      agentType: 'property_analyzer',
      entityType: 'policy',
      entityId: 'policy-123',
    },
    timestamp: new Date('2026-01-03T14:30:00Z'),
  };

  describe('isAvailable', () => {
    it('should return true when configured and enabled', () => {
      const provider = createOpsGenieProvider(validConfig);
      expect(provider.isAvailable()).toBe(true);
    });

    it('should return false when disabled', () => {
      const provider = createOpsGenieProvider({ ...validConfig, enabled: false });
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return false when API key is missing', () => {
      const provider = createOpsGenieProvider({
        ...validConfig,
        apiKey: '',
      });
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe('validateCredentials', () => {
    it('should return true when API responds successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      const provider = createOpsGenieProvider(validConfig);
      const result = await provider.validateCredentials();
      expect(result).toBe(true);
    });

    it('should return false when not configured', async () => {
      const provider = createOpsGenieProvider({ ...validConfig, apiKey: '' });
      const result = await provider.validateCredentials();
      expect(result).toBe(false);
    });

    it('should return false when API returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const provider = createOpsGenieProvider(validConfig);
      const result = await provider.validateCredentials();
      expect(result).toBe(false);
    });
  });

  describe('send', () => {
    it('should send alert successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: 'Request will be processed',
          took: 0.123,
          requestId: 'req-123',
        }),
      });

      const provider = createOpsGenieProvider(validConfig);
      const result = await provider.send(testAlert);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.providerId).toBe('opsgenie');
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(validConfig.apiUrl);
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['Authorization']).toBe(`GenieKey ${validConfig.apiKey}`);

      // Verify payload structure
      const payload = JSON.parse(options.body);
      expect(payload.message).toBe(`[WARNING] ${testAlert.title}`);
      expect(payload.description).toBe(testAlert.message);
      expect(payload.alias).toBe(testAlert.id);
      expect(payload.source).toBe('RealRiches');
      expect(payload.priority).toBe('P3'); // warning = P3
    });

    it('should map severity to correct priority', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ result: 'processed', requestId: 'test' }),
      });

      const provider = createOpsGenieProvider(validConfig);

      // Test critical -> P1
      await provider.send({ ...testAlert, severity: 'critical' });
      let payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.priority).toBe('P1');

      // Test warning -> P3
      mockFetch.mockClear();
      await provider.send({ ...testAlert, severity: 'warning' });
      payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.priority).toBe('P3');

      // Test info -> P4
      mockFetch.mockClear();
      await provider.send({ ...testAlert, severity: 'info' });
      payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.priority).toBe('P4');
    });

    it('should use custom alias when deduplicationKey provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: 'processed', requestId: 'test' }),
      });

      const provider = createOpsGenieProvider(validConfig);
      await provider.send({ ...testAlert, deduplicationKey: 'custom-alias' });

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.alias).toBe('custom-alias');
    });

    it('should include context as details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: 'processed', requestId: 'test' }),
      });

      const provider = createOpsGenieProvider(validConfig);
      await provider.send(testAlert);

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.details.market).toBe('LA');
      expect(payload.details.agentType).toBe('property_analyzer');
      expect(payload.details.entityId).toBe('policy-123');
      expect(payload.details.source).toBe('policy_violation');
    });

    it('should include tags based on source and severity', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: 'processed', requestId: 'test' }),
      });

      const provider = createOpsGenieProvider(validConfig);
      await provider.send(testAlert);

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.tags).toContain('policy_violation');
      expect(payload.tags).toContain('warning');
      expect(payload.tags).toContain('LA'); // Market from context
    });

    it('should return failure when not configured', async () => {
      const provider = createOpsGenieProvider({ ...validConfig, apiKey: '' });
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
          message: 'Invalid request',
          errors: ['message field is required'],
        }),
      });

      const provider = createOpsGenieProvider({
        ...validConfig,
        retryAttempts: 0,
      });
      const result = await provider.send(testAlert);

      expect(result.ok).toBe(false);
    });

    it('should handle authentication error (401)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Invalid API key' }),
      });

      const provider = createOpsGenieProvider({
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

      const provider = createOpsGenieProvider({
        ...validConfig,
        retryAttempts: 0,
      });
      const result = await provider.send(testAlert);

      expect(result.ok).toBe(false);
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const provider = createOpsGenieProvider({
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

  describe('responders', () => {
    it('should include responders when configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: 'processed', requestId: 'test' }),
      });

      const provider = createOpsGenieProvider({
        ...validConfig,
        responders: [
          { type: 'team', name: 'ops-team' },
          { type: 'user', username: 'oncall@example.com' },
        ],
      });
      await provider.send(testAlert);

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.responders).toHaveLength(2);
      expect(payload.responders[0]).toEqual({ type: 'team', name: 'ops-team' });
      expect(payload.responders[1]).toEqual({ type: 'user', username: 'oncall@example.com' });
    });
  });
});
