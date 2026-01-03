/**
 * Slack Alert Provider
 *
 * Sends alerts to Slack via Incoming Webhooks.
 * https://api.slack.com/messaging/webhooks
 */

import type { Result } from '@realriches/utils';

import type { AlertRequest, AlertResponse, SlackProviderConfig, AlertSeverity } from '../types';
import { BaseAlertProvider, AlertProviderError } from './provider-interface';

// =============================================================================
// Slack Payload Types
// =============================================================================

interface SlackAttachmentField {
  title: string;
  value: string;
  short: boolean;
}

interface SlackAttachment {
  color: string;
  title: string;
  text: string;
  fields: SlackAttachmentField[];
  footer: string;
  ts: number;
}

interface SlackPayload {
  username?: string;
  icon_emoji?: string;
  channel?: string;
  text?: string;
  attachments: SlackAttachment[];
}

interface SlackWebhookResponse {
  ok?: boolean;
  error?: string;
}

// =============================================================================
// Slack Provider
// =============================================================================

export class SlackProvider extends BaseAlertProvider {
  readonly providerId = 'slack' as const;

  private webhookUrl: string;
  private channel?: string;
  private username: string;
  private iconEmoji: string;

  constructor(config: SlackProviderConfig) {
    super({
      enabled: config.enabled,
      timeoutMs: config.timeoutMs,
      retryAttempts: config.retryAttempts,
    });

    this.webhookUrl = config.webhookUrl;
    this.channel = config.channel;
    this.username = config.username ?? 'RealRiches Alert';
    this.iconEmoji = config.iconEmoji ?? ':warning:';
    this.isConfigured = !!config.webhookUrl && config.enabled;
  }

  async validateCredentials(): Promise<boolean> {
    // Slack webhooks don't have a validation endpoint
    // We consider it valid if the URL is configured
    return this.isConfigured;
  }

  async send(alert: AlertRequest): Promise<Result<AlertResponse, Error>> {
    if (!this.isConfigured) {
      return this.failureResponse(
        new AlertProviderError('Slack provider not configured', 'NOT_CONFIGURED', this.providerId)
      );
    }

    const startTime = Date.now();

    try {
      const payload = this.buildPayload(alert);

      await this.executeWithRetry(async () => {
        const response = await this.makeRequest<SlackWebhookResponse | string>(
          'POST',
          this.webhookUrl,
          payload
        );

        // Slack webhook returns 'ok' as plain text on success
        if (response === 'ok' || (typeof response === 'object' && response.ok !== false)) {
          return response;
        }

        const error = typeof response === 'object' ? response.error : String(response);
        throw new AlertProviderError(
          `Slack API error: ${error}`,
          'API_ERROR',
          this.providerId,
          false
        );
      }, 'send_alert');

      const durationMs = Date.now() - startTime;
      this.log('Alert sent successfully', { alertId: alert.id, durationMs });

      return this.successResponse(alert, undefined, durationMs);
    } catch (error) {
      this.log('Failed to send alert', {
        alertId: alert.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return this.failureResponse(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Build Slack webhook payload
   */
  private buildPayload(alert: AlertRequest): SlackPayload {
    const fields = this.buildFields(alert);

    return {
      username: this.username,
      icon_emoji: this.iconEmoji,
      channel: this.channel,
      attachments: [
        {
          color: this.severityToColor(alert.severity),
          title: alert.title,
          text: alert.message,
          fields,
          footer: `Source: ${alert.source} | ID: ${alert.id}`,
          ts: Math.floor(alert.timestamp.getTime() / 1000),
        },
      ],
    };
  }

  /**
   * Build attachment fields from alert context
   */
  private buildFields(alert: AlertRequest): SlackAttachmentField[] {
    const fields: SlackAttachmentField[] = [
      { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
      { title: 'Source', value: alert.source, short: true },
    ];

    if (alert.context) {
      if (alert.context.market) {
        fields.push({ title: 'Market', value: alert.context.market, short: true });
      }
      if (alert.context.entityType && alert.context.entityId) {
        fields.push({
          title: 'Entity',
          value: `${alert.context.entityType}:${alert.context.entityId}`,
          short: true,
        });
      }
      if (alert.context.agentType) {
        fields.push({ title: 'Agent Type', value: alert.context.agentType, short: true });
      }
    }

    return fields;
  }

  /**
   * Map severity to Slack attachment color
   */
  private severityToColor(severity: AlertSeverity): string {
    switch (severity) {
      case 'critical':
        return '#ff0000'; // Red
      case 'warning':
        return '#ff9900'; // Orange
      case 'info':
        return '#0099ff'; // Blue
      default:
        return '#999999'; // Gray
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createSlackProvider(config: SlackProviderConfig): SlackProvider {
  return new SlackProvider(config);
}
