/**
 * OpsGenie Alert Provider
 *
 * Sends alerts to OpsGenie via Alert API.
 * https://docs.opsgenie.com/docs/alert-api
 */

import type { Result } from '@realriches/utils';

import type {
  AlertRequest,
  AlertResponse,
  OpsGenieProviderConfig,
  OpsGenieResponder,
  AlertSeverity,
} from '../types';

import { BaseAlertProvider, AlertProviderError } from './provider-interface';

// =============================================================================
// OpsGenie Payload Types
// =============================================================================

interface OpsGeniePayload {
  message: string;
  alias?: string;
  description?: string;
  responders?: OpsGenieResponder[];
  visibleTo?: OpsGenieResponder[];
  actions?: string[];
  tags?: string[];
  details?: Record<string, string>;
  entity?: string;
  source?: string;
  priority?: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  user?: string;
  note?: string;
}

interface OpsGenieResponse {
  result: string;
  took: number;
  requestId: string;
}

// =============================================================================
// OpsGenie Provider
// =============================================================================

const OPSGENIE_API_URL = 'https://api.opsgenie.com/v2/alerts';

export class OpsGenieProvider extends BaseAlertProvider {
  readonly providerId = 'opsgenie' as const;

  private apiKey: string;
  private apiUrl: string;
  private responders?: OpsGenieResponder[];

  constructor(config: OpsGenieProviderConfig) {
    super({
      enabled: config.enabled,
      timeoutMs: config.timeoutMs,
      retryAttempts: config.retryAttempts,
    });

    this.apiKey = config.apiKey;
    this.apiUrl = config.apiUrl ?? OPSGENIE_API_URL;
    this.responders = config.responders;
    this.isConfigured = !!config.apiKey && config.enabled;
  }

  async validateCredentials(): Promise<boolean> {
    if (!this.isConfigured) {
      return false;
    }

    try {
      // Try to list alerts to validate API key
      const response = await fetch(`${this.apiUrl}?limit=1`, {
        method: 'GET',
        headers: {
          Authorization: `GenieKey ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  async send(alert: AlertRequest): Promise<Result<AlertResponse, Error>> {
    if (!this.isConfigured) {
      return this.failureResponse(
        new AlertProviderError('OpsGenie provider not configured', 'NOT_CONFIGURED', this.providerId)
      );
    }

    const startTime = Date.now();

    try {
      const payload = this.buildPayload(alert);

      const response = await this.executeWithRetry(async () => {
        return this.makeRequest<OpsGenieResponse>('POST', this.apiUrl, payload, {
          Authorization: `GenieKey ${this.apiKey}`,
        });
      }, 'send_alert');

      if (!response.requestId) {
        throw new AlertProviderError(
          'OpsGenie API did not return a request ID',
          'API_ERROR',
          this.providerId,
          false
        );
      }

      const durationMs = Date.now() - startTime;
      this.log('Alert sent successfully', {
        alertId: alert.id,
        requestId: response.requestId,
        took: response.took,
        durationMs,
      });

      return this.successResponse(alert, response.requestId, durationMs);
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
   * Build OpsGenie Alert API payload
   */
  private buildPayload(alert: AlertRequest): OpsGeniePayload {
    const details: Record<string, string> = {
      alertId: alert.id,
      source: alert.source,
    };

    // Add context to details
    if (alert.context) {
      if (alert.context.market) details['market'] = alert.context.market;
      if (alert.context.tenantId) details['tenantId'] = alert.context.tenantId;
      if (alert.context.entityType) details['entityType'] = alert.context.entityType;
      if (alert.context.entityId) details['entityId'] = alert.context.entityId;
      if (alert.context.agentType) details['agentType'] = alert.context.agentType;
      if (alert.context.requestId) details['requestId'] = alert.context.requestId;
    }

    const tags = [alert.source, alert.severity];
    if (alert.context?.market) {
      tags.push(alert.context.market);
    }

    return {
      message: `[${alert.severity.toUpperCase()}] ${alert.title}`,
      alias: alert.deduplicationKey ?? alert.id,
      description: alert.message,
      responders: this.responders,
      tags,
      details,
      entity: alert.context?.entityType,
      source: 'RealRiches',
      priority: this.mapPriority(alert.severity),
    };
  }

  /**
   * Map internal severity to OpsGenie priority
   */
  private mapPriority(severity: AlertSeverity): 'P1' | 'P2' | 'P3' | 'P4' | 'P5' {
    switch (severity) {
      case 'critical':
        return 'P1';
      case 'warning':
        return 'P3';
      case 'info':
        return 'P4';
      default:
        return 'P4';
    }
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createOpsGenieProvider(config: OpsGenieProviderConfig): OpsGenieProvider {
  return new OpsGenieProvider(config);
}
