/**
 * Alert Router
 *
 * Coordinates alert routing to multiple providers based on severity.
 * Handles deduplication, evidence logging, and parallel sending.
 */

import { type Result, success, failure, logger } from '@realriches/utils';

import { emitAlertEvidence } from '../evidence/alert-evidence';
import type { IAlertProvider } from '../providers/provider-interface';
import type {
  AlertRequest,
  AlertResponse,
  AlertRouterResult,
  AlertingConfig,
  AlertProviderType,
  AlertSeverity,
} from '../types';
import { AlertRequestSchema, DEFAULT_ALERTING_CONFIG } from '../types';

// =============================================================================
// Router Configuration
// =============================================================================

export interface AlertRouterOptions {
  providers: Map<AlertProviderType, IAlertProvider>;
  config?: Partial<AlertingConfig>;
  emitEvidence?: boolean;
}

// =============================================================================
// Deduplication Cache Entry
// =============================================================================

interface DeduplicationEntry {
  timestamp: Date;
  alertId: string;
}

// =============================================================================
// Alert Router
// =============================================================================

export class AlertRouter {
  private providers: Map<AlertProviderType, IAlertProvider>;
  private config: AlertingConfig;
  private emitEvidence: boolean;

  // In-memory deduplication cache
  private recentAlerts: Map<string, DeduplicationEntry> = new Map();

  // Cleanup interval reference
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: AlertRouterOptions) {
    this.providers = options.providers;
    this.config = {
      ...DEFAULT_ALERTING_CONFIG,
      ...options.config,
    } as AlertingConfig;
    this.emitEvidence = options.emitEvidence ?? true;

    // Start cleanup interval (every 60 seconds)
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Route an alert to appropriate providers
   */
  async route(alertInput: AlertRequest): Promise<Result<AlertRouterResult, Error>> {
    // 1. Validate alert
    const parseResult = AlertRequestSchema.safeParse(alertInput);
    if (!parseResult.success) {
      return failure(new Error(`Invalid alert: ${parseResult.error.message}`));
    }
    const alert = parseResult.data;

    // 2. Check deduplication
    if (this.shouldDeduplicate(alert)) {
      const result: AlertRouterResult = {
        alertId: alert.id,
        responses: [],
        allSuccessful: true,
        deduplicated: true,
        evidenceRecorded: false,
      };

      this.log('Alert deduplicated', {
        alertId: alert.id,
        deduplicationKey: alert.deduplicationKey ?? alert.id,
      });

      // Record evidence for deduplicated alert
      if (this.emitEvidence) {
        this.emitEvidenceAsync(alert, result, 'deduplicated');
      }

      return success(result);
    }

    // 3. Record in dedup cache
    this.recordAlert(alert);

    // 4. Determine target providers
    const targetProviders = this.getTargetProviders(alert);

    if (targetProviders.length === 0) {
      this.log('No providers available for alert', {
        alertId: alert.id,
        severity: alert.severity,
      });

      const result: AlertRouterResult = {
        alertId: alert.id,
        responses: [],
        allSuccessful: false,
        deduplicated: false,
        evidenceRecorded: false,
      };

      return success(result);
    }

    // 5. Send to all targets in parallel
    const responses = await this.sendToProviders(alert, targetProviders);

    // 6. Build result
    const allSuccessful = responses.every((r) => r.success);
    const result: AlertRouterResult = {
      alertId: alert.id,
      responses,
      allSuccessful,
      deduplicated: false,
      evidenceRecorded: this.emitEvidence,
    };

    // 7. Emit evidence record
    if (this.emitEvidence) {
      this.emitEvidenceAsync(alert, result, allSuccessful ? 'success' : 'failure');
    }

    this.log('Alert routed', {
      alertId: alert.id,
      severity: alert.severity,
      providerCount: targetProviders.length,
      successCount: responses.filter((r) => r.success).length,
      failureCount: responses.filter((r) => !r.success).length,
    });

    return success(result);
  }

  /**
   * Send alert to multiple providers in parallel
   */
  private async sendToProviders(
    alert: AlertRequest,
    providers: IAlertProvider[]
  ): Promise<AlertResponse[]> {
    const results = await Promise.allSettled(
      providers.map((provider) => provider.send(alert))
    );

    return results.map((result, index) => {
      // Provider is guaranteed to exist since index comes from the same array
      const provider = providers[index]!;

      if (result.status === 'fulfilled') {
        if (result.value.ok) {
          return result.value.value;
        }
        // Result is failure
        return {
          providerId: provider.providerId,
          success: false,
          error: result.value.error.message,
          sentAt: new Date(),
          durationMs: 0,
        };
      }

      // Promise rejected
      return {
        providerId: provider.providerId,
        success: false,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        sentAt: new Date(),
        durationMs: 0,
      };
    });
  }

  /**
   * Get providers for an alert based on severity or explicit targets
   */
  private getTargetProviders(alert: AlertRequest): IAlertProvider[] {
    // Use explicit targets if provided
    const targetTypes = alert.targetProviders ?? this.getProvidersForSeverity(alert.severity);

    return targetTypes
      .map((type) => this.providers.get(type))
      .filter((provider): provider is IAlertProvider => {
        return provider !== undefined && provider.isAvailable();
      });
  }

  /**
   * Get provider types for a severity level
   */
  private getProvidersForSeverity(severity: AlertSeverity): AlertProviderType[] {
    return this.config.routing[severity] ?? [];
  }

  /**
   * Check if alert should be deduplicated
   */
  private shouldDeduplicate(alert: AlertRequest): boolean {
    const key = alert.deduplicationKey ?? alert.id;
    const entry = this.recentAlerts.get(key);

    if (!entry) {
      return false;
    }

    const cooldownMs = this.config.cooldownSeconds * 1000;
    const elapsed = Date.now() - entry.timestamp.getTime();

    return elapsed < cooldownMs;
  }

  /**
   * Record alert in deduplication cache
   */
  private recordAlert(alert: AlertRequest): void {
    const key = alert.deduplicationKey ?? alert.id;
    this.recentAlerts.set(key, {
      timestamp: new Date(),
      alertId: alert.id,
    });
  }

  /**
   * Clean up expired deduplication entries
   */
  cleanup(): void {
    const cooldownMs = this.config.cooldownSeconds * 1000;
    const now = Date.now();

    for (const [key, entry] of this.recentAlerts.entries()) {
      if (now - entry.timestamp.getTime() > cooldownMs) {
        this.recentAlerts.delete(key);
      }
    }
  }

  /**
   * Emit evidence asynchronously (fire-and-forget)
   */
  private emitEvidenceAsync(
    alert: AlertRequest,
    result: AlertRouterResult,
    outcome: 'success' | 'failure' | 'deduplicated'
  ): void {
    setImmediate(() => {
      try {
        emitAlertEvidence({
          alert,
          result,
          outcome,
          organizationId: alert.context?.organizationId,
          tenantId: alert.context?.tenantId,
        });
      } catch (error) {
        logger.error({
          msg: 'Failed to emit alert evidence',
          alertId: alert.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  /**
   * Log router activity
   */
  private log(message: string, data?: Record<string, unknown>): void {
    logger.info({
      msg: `[AlertRouter] ${message}`,
      ...data,
    });
  }

  /**
   * Get router statistics
   */
  getStats(): { cachedAlerts: number; providerCount: number } {
    return {
      cachedAlerts: this.recentAlerts.size,
      providerCount: this.providers.size,
    };
  }

  /**
   * Shutdown router
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.recentAlerts.clear();
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

let defaultRouter: AlertRouter | null = null;

/**
 * Get the default alert router singleton
 */
export function getAlertRouter(): AlertRouter | null {
  return defaultRouter;
}

/**
 * Set the default alert router singleton
 */
export function setAlertRouter(router: AlertRouter): void {
  defaultRouter = router;
}

/**
 * Reset the default router (for testing)
 */
export function resetAlertRouter(): void {
  if (defaultRouter) {
    defaultRouter.shutdown();
  }
  defaultRouter = null;
}

/**
 * Create an alert router with the given providers
 */
export function createAlertRouter(options: AlertRouterOptions): AlertRouter {
  return new AlertRouter(options);
}
