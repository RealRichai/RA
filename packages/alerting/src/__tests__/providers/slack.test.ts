/**
 * Slack Provider Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { SlackProvider, createSlackProvider } from '../../providers/slack';
import type { AlertRequest } from '../../types';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('SlackProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const validConfig = {
    enabled: true,
    webhookUrl: 'https://hooks.slack.com/services/XXX/YYY/ZZZ',
    channel: '#alerts',
    username: 'Test Bot',
    iconEmoji: ':robot_face:',
  };

  const testAlert: AlertRequest = {
    id: 'alert-123',
    source: 'kill_switch',
    severity: 'critical',
    title: 'Kill Switch Activated',
    message: 'Emergency kill switch activated for agent type: lease_assistant',
    context: {
      market: 'NYC',
      agentType: 'lease_assistant',
      entityType: 'kill_switch',
      entityId: 'ks-456',
    },
    timestamp: new Date('2026-01-03T12:00:00Z'),
  };

  describe('isAvailable', () => {
    it('should return true when configured and enabled', () => {
      const provider = createSlackProvider(validConfig);
      expect(provider.isAvailable()).toBe(true);
    });

    it('should return false when disabled', () => {
      const provider = createSlackProvider({ ...validConfig, enabled: false });
      expect(provider.isAvailable()).toBe(false);
    });

    it('should return false when webhook URL is missing', () => {
      const provider = createSlackProvider({
        ...validConfig,
        webhookUrl: '',
      });
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe('validateCredentials', () => {
    it('should return true when configured', async () => {
      const provider = createSlackProvider(validConfig);
      const result = await provider.validateCredentials();
      expect(result).toBe(true);
    });

    it('should return false when not configured', async () => {
      const provider = createSlackProvider({ ...validConfig, webhookUrl: '' });
      const result = await provider.validateCredentials();
      expect(result).toBe(false);
    });
  });

  describe('send', () => {
    it('should send alert successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => 'ok',
        text: async () => 'ok',
      });

      const provider = createSlackProvider(validConfig);
      const result = await provider.send(testAlert);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.success).toBe(true);
        expect(result.value.providerId).toBe('slack');
        expect(result.value.durationMs).toBeGreaterThanOrEqual(0);
      }

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(validConfig.webhookUrl);
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');

      // Verify payload
      const payload = JSON.parse(options.body);
      expect(payload.username).toBe('Test Bot');
      expect(payload.icon_emoji).toBe(':robot_face:');
      expect(payload.channel).toBe('#alerts');
      expect(payload.attachments).toHaveLength(1);
      expect(payload.attachments[0].title).toBe(testAlert.title);
      expect(payload.attachments[0].text).toBe(testAlert.message);
      expect(payload.attachments[0].color).toBe('#ff0000'); // Critical = red
    });

    it('should map severity to correct colors', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => 'ok',
        text: async () => 'ok',
      });

      const provider = createSlackProvider(validConfig);

      // Test critical
      await provider.send({ ...testAlert, severity: 'critical' });
      let payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.attachments[0].color).toBe('#ff0000');

      // Test warning
      mockFetch.mockClear();
      await provider.send({ ...testAlert, severity: 'warning' });
      payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.attachments[0].color).toBe('#ff9900');

      // Test info
      mockFetch.mockClear();
      await provider.send({ ...testAlert, severity: 'info' });
      payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.attachments[0].color).toBe('#0099ff');
    });

    it('should include context fields in attachment', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => 'ok',
        text: async () => 'ok',
      });

      const provider = createSlackProvider(validConfig);
      await provider.send(testAlert);

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      const fields = payload.attachments[0].fields;

      expect(fields).toContainEqual({ title: 'Severity', value: 'CRITICAL', short: true });
      expect(fields).toContainEqual({ title: 'Source', value: 'kill_switch', short: true });
      expect(fields).toContainEqual({ title: 'Market', value: 'NYC', short: true });
      expect(fields).toContainEqual({ title: 'Agent Type', value: 'lease_assistant', short: true });
    });

    it('should return failure when not configured', async () => {
      const provider = createSlackProvider({ ...validConfig, webhookUrl: '' });
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
        text: async () => 'invalid_payload',
      });

      const provider = createSlackProvider(validConfig);
      const result = await provider.send(testAlert);

      expect(result.ok).toBe(false);
    });

    it('should handle network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const provider = createSlackProvider({
        ...validConfig,
        retryAttempts: 0, // Disable retries for this test
      });
      const result = await provider.send(testAlert);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('Network error');
      }
    });
  });

  describe('payload format', () => {
    it('should include footer with source and ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => 'ok',
        text: async () => 'ok',
      });

      const provider = createSlackProvider(validConfig);
      await provider.send(testAlert);

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.attachments[0].footer).toBe('Source: kill_switch | ID: alert-123');
    });

    it('should include timestamp', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => 'ok',
        text: async () => 'ok',
      });

      const provider = createSlackProvider(validConfig);
      await provider.send(testAlert);

      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.attachments[0].ts).toBe(Math.floor(testAlert.timestamp.getTime() / 1000));
    });
  });
});
