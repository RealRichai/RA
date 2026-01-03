/**
 * PagerDuty Alert Provider
 *
 * Sends alerts to PagerDuty via Events API v2.
 * https://developer.pagerduty.com/docs/events-api-v2/trigger-events/
 */

import type { Result } from '@realriches/utils';

import type { AlertRequest, AlertResponse, PagerDutyProviderConfig, AlertSeverity } from '../types';
import { BaseAlertProvider, AlertProviderError } from './provider-interface';

// =============================================================================
// PagerDuty Payload Types
// =============================================================================

interface PagerDutyPayload {
  routing_key: string;
  event_action: 'trigger' | 'acknowledge' | 'resolve';
  dedup_key?: string;
  payload: {
    summary: string;
    severity: 'critical' | 'error' | 'warning' | 'info';
    source: string;
    timestamp?: string;
    component?: string;
    group?: string;
    class?: string;
    custom_details?: Record<string, unknown>;
  };
  images?: Array<{ src: string; href?: string; alt?: string }>;
  links?: Array<{ href: string; text?: string }>;
  client?: string;
  client_url?: string;
}

interface PagerDutyResponse {
  status: string;
  message: string;
  dedup_key?: string;
}

// =============================================================================
// PagerDuty Provider
// =============================================================================

const PAGERDUTY_EVENTS_API_URL = 'https://events.pagerduty.com/v2/enqueue';

export class PagerDutyProvider extends BaseAlertProvider {
  readonly providerId = 'pagerduty' as const;

  private routingKey: string;
  private apiUrl: string;

  constructor(config: PagerDutyProviderConfig) {
    super({
      enabled: config.enabled,
      timeoutMs: config.timeoutMs,
      retryAttempts: config.retryAttempts,
    });

    this.routingKey = config.routingKey;
    this.apiUrl = config.apiUrl ?? PAGERDUTY_EVENTS_API_URL;
    this.isConfigured = !!config.routingKey && config.enabled;
  }

  async validateCredentials(): Promise<boolean> {
    // PagerDuty Events API v2 doesn't have a validation endpoint
    // We consider it valid if the routing key is configured
    return this.isConfigured;
  }

  async send(alert: AlertRequest): Promise<Result<AlertResponse, Error>> {
    if (!this.isConfigured) {
      return this.failureResponse(
        new AlertProviderError('PagerDuty provider not configured', 'NOT_CONFIGURED', this.providerId)
      );
    }

    const startTime = Date.now();

    try {
      const payload = this.buildPayload(alert);

      const response = await this.executeWithRetry(async () => {
        return this.makeRequest<PagerDutyResponse>('POST', this.apiUrl, payload);
      }, 'send_alert');

      if (response.status !== 'success') {
        throw new AlertProviderError(
          `PagerDuty API error: ${response.message}`,
          'API_ERROR',
          this.providerId,
          false
        );
      }

      const durationMs = Date.now() - startTime;
      this.log('Alert sent successfully', {
        alertId: alert.id,
        dedupKey: response.dedup_key,
        durationMs,
      });

      return this.successResponse(alert, response.dedup_key, durationMs);
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
   * Build PagerDuty Events API v2 payload
   */
  private buildPayload(alert: AlertRequest): PagerDutyPayload {
    const customDetails: Record<string, unknown> = {
      message: alert.message,
      alertId: alert.id,
    };

    // Add context to custom_details
    if (alert.context) {
      if (alert.context.market) customDetails['market'] = alert.context.market;
      if (alert.context.tenantId) customDetails['tenantId'] = alert.context.tenantId;
      if (alert.context.entityType) customDetails['entityType'] = alert.context.entityType;
      if (alert.context.entityId) customDetails['entityId'] = alert.context.entityId;
      if (alert.context.agentType) customDetails['agentType'] = alert.context.agentType;
      if (alert.context.requestId) customDetails['requestId'] = alert.context.requestId;
    }

    return {
      routing_key: this.routingKey,
      event_action: 'trigger',
      dedup_key: alert.deduplicationKey ?? alert.id,
      payload: {
        summary: `[${alert.severity.toUpperCase()}] ${alert.title}`,
        severity: this.mapSeverity(alert.severity),
        source: alert.source,
        timestamp: alert.timestamp.toISOString(),
        component: alert.context?.entityType,
        group: alert.context?.market,
        custom_details: customDetails,
      },
      client: 'RealRiches',
      client_url: 'https://realriches.com',
    };
  }

  /**
   * Map internal severity to PagerDuty severity
   */
  private mapSeverity(severity: AlertSeverity): 'critical' | 'error' | 'warning' | 'info' {
    switch (severity) {
      case 'critical':
        return 'critical';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      default:
        return 'info';
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createPagerDutyProvider(config: PagerDutyProviderConfig): PagerDutyProvider {
  return new PagerDutyProvider(config);
}
