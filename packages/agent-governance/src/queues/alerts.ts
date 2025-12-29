/**
 * Alert System
 *
 * Configurable alerts for queue health, costs, and violations.
 */

import { randomUUID } from 'crypto';

import type {
  AlertConfig,
  QueueHealth,
  AgentRunSummary,
  TaskOutcome,
  Result,
} from '../types';
import { Ok, Err } from '../types';

// =============================================================================
// Alert Types
// =============================================================================

export type AlertChannel = 'email' | 'slack' | 'pagerduty' | 'webhook';

export interface Alert {
  id: string;
  configId: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  data: Record<string, unknown>;
  triggeredAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  channels: AlertChannel[];
}

export interface AlertTrigger {
  conditionMet: boolean;
  severity: Alert['severity'];
  title: string;
  message: string;
  data: Record<string, unknown>;
}

// =============================================================================
// Alert Manager
// =============================================================================

export interface AlertManagerConfig {
  handlers: {
    email?: (alert: Alert) => Promise<void>;
    slack?: (alert: Alert) => Promise<void>;
    pagerduty?: (alert: Alert) => Promise<void>;
    webhook?: (alert: Alert) => Promise<void>;
  };
  defaultCooldownMinutes?: number;
}

export class AlertManager {
  private config: AlertManagerConfig;
  private alertConfigs: Map<string, AlertConfig> = new Map();
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private lastTriggered: Map<string, Date> = new Map();

  constructor(config: AlertManagerConfig = { handlers: {} }) {
    this.config = {
      defaultCooldownMinutes: 15,
      ...config,
    };
  }

  /**
   * Register an alert configuration.
   */
  registerConfig(config: AlertConfig): void {
    this.alertConfigs.set(config.id, config);
  }

  /**
   * Remove an alert configuration.
   */
  removeConfig(configId: string): void {
    this.alertConfigs.delete(configId);
  }

  /**
   * Get all alert configurations.
   */
  getConfigs(): AlertConfig[] {
    return Array.from(this.alertConfigs.values());
  }

  /**
   * Check queue health and trigger alerts.
   */
  async checkQueueHealth(health: QueueHealth): Promise<Alert[]> {
    const triggeredAlerts: Alert[] = [];

    for (const config of this.alertConfigs.values()) {
      if (!config.enabled) continue;

      const triggers: AlertTrigger[] = [];

      // Check queue depth
      if (config.conditions.queueDepthThreshold !== undefined) {
        const totalQueued = health.waiting + health.active + health.delayed;
        if (totalQueued >= config.conditions.queueDepthThreshold) {
          triggers.push({
            conditionMet: true,
            severity: totalQueued >= config.conditions.queueDepthThreshold * 2 ? 'critical' : 'warning',
            title: 'Queue Depth Alert',
            message: `Queue ${health.queueName} has ${totalQueued} jobs (threshold: ${config.conditions.queueDepthThreshold})`,
            data: { queueName: health.queueName, depth: totalQueued, threshold: config.conditions.queueDepthThreshold },
          });
        }
      }

      // Check if paused
      if (health.paused) {
        triggers.push({
          conditionMet: true,
          severity: 'warning',
          title: 'Queue Paused',
          message: `Queue ${health.queueName} is paused`,
          data: { queueName: health.queueName },
        });
      }

      // Create alerts for triggered conditions
      for (const trigger of triggers) {
        if (this.canTrigger(config.id)) {
          const alert = await this.createAndSendAlert(config, trigger);
          triggeredAlerts.push(alert);
        }
      }
    }

    return triggeredAlerts;
  }

  /**
   * Check agent run summary and trigger alerts.
   */
  async checkRunSummary(summary: AgentRunSummary): Promise<Alert[]> {
    const triggeredAlerts: Alert[] = [];

    for (const config of this.alertConfigs.values()) {
      if (!config.enabled) continue;

      const triggers: AlertTrigger[] = [];

      // Check failure rate
      if (config.conditions.failureRateThreshold !== undefined && summary.totalRuns > 0) {
        const failureRate = summary.failedRuns / summary.totalRuns;
        if (failureRate >= config.conditions.failureRateThreshold) {
          triggers.push({
            conditionMet: true,
            severity: failureRate >= config.conditions.failureRateThreshold * 1.5 ? 'critical' : 'warning',
            title: 'High Failure Rate',
            message: `Agent failure rate is ${(failureRate * 100).toFixed(1)}% (threshold: ${(config.conditions.failureRateThreshold * 100).toFixed(1)}%)`,
            data: { failureRate, threshold: config.conditions.failureRateThreshold, totalRuns: summary.totalRuns },
          });
        }
      }

      // Check average latency
      if (config.conditions.avgLatencyThresholdMs !== undefined) {
        if (summary.avgDurationMs >= config.conditions.avgLatencyThresholdMs) {
          triggers.push({
            conditionMet: true,
            severity: summary.avgDurationMs >= config.conditions.avgLatencyThresholdMs * 2 ? 'critical' : 'warning',
            title: 'High Latency Alert',
            message: `Average agent duration is ${summary.avgDurationMs.toFixed(0)}ms (threshold: ${config.conditions.avgLatencyThresholdMs}ms)`,
            data: { avgDurationMs: summary.avgDurationMs, threshold: config.conditions.avgLatencyThresholdMs },
          });
        }
      }

      // Check cost threshold
      if (config.conditions.costThresholdUsd !== undefined) {
        if (summary.totalCostUsd >= config.conditions.costThresholdUsd) {
          triggers.push({
            conditionMet: true,
            severity: summary.totalCostUsd >= config.conditions.costThresholdUsd * 2 ? 'critical' : 'warning',
            title: 'Cost Threshold Alert',
            message: `Total cost is $${summary.totalCostUsd.toFixed(2)} (threshold: $${config.conditions.costThresholdUsd.toFixed(2)})`,
            data: { totalCostUsd: summary.totalCostUsd, threshold: config.conditions.costThresholdUsd },
          });
        }
      }

      // Check policy violations
      if (config.conditions.policyViolationCount !== undefined) {
        if (summary.policyBlockedRuns >= config.conditions.policyViolationCount) {
          triggers.push({
            conditionMet: true,
            severity: 'critical',
            title: 'Policy Violation Alert',
            message: `${summary.policyBlockedRuns} runs blocked by policy (threshold: ${config.conditions.policyViolationCount})`,
            data: { policyBlockedRuns: summary.policyBlockedRuns, threshold: config.conditions.policyViolationCount },
          });
        }
      }

      // Create alerts for triggered conditions
      for (const trigger of triggers) {
        if (this.canTrigger(config.id)) {
          const alert = await this.createAndSendAlert(config, trigger);
          triggeredAlerts.push(alert);
        }
      }
    }

    return triggeredAlerts;
  }

  /**
   * Check task outcome and trigger alerts.
   */
  async checkTaskOutcome(outcome: TaskOutcome): Promise<Alert | null> {
    if (outcome.success) return null;

    // Find relevant alert config for task failures
    for (const config of this.alertConfigs.values()) {
      if (!config.enabled) continue;

      // Skip if in cooldown
      if (!this.canTrigger(config.id)) continue;

      // Check if this config handles task failures
      if (config.conditions.failureRateThreshold !== undefined) {
        const trigger: AlertTrigger = {
          conditionMet: true,
          severity: 'warning',
          title: 'Task Failed',
          message: `Task ${outcome.taskId} failed: ${outcome.error?.message || 'Unknown error'}`,
          data: {
            taskId: outcome.taskId,
            runId: outcome.runId,
            error: outcome.error,
            retried: outcome.retried,
          },
        };

        return this.createAndSendAlert(config, trigger);
      }
    }

    return null;
  }

  /**
   * Acknowledge an alert.
   */
  acknowledge(alertId: string, acknowledgedBy: string): Result<Alert> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return Err('NOT_FOUND', `Alert ${alertId} not found`);
    }

    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = acknowledgedBy;
    this.activeAlerts.set(alertId, alert);

    return Ok(alert);
  }

  /**
   * Resolve an alert.
   */
  resolve(alertId: string): Result<Alert> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return Err('NOT_FOUND', `Alert ${alertId} not found`);
    }

    alert.resolvedAt = new Date();
    this.activeAlerts.delete(alertId);
    this.alertHistory.push(alert);

    return Ok(alert);
  }

  /**
   * Get active alerts.
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get alert history.
   */
  getAlertHistory(limit: number = 100): Alert[] {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Check if an alert config can trigger (cooldown check).
   */
  private canTrigger(configId: string): boolean {
    const config = this.alertConfigs.get(configId);
    if (!config) return false;

    const lastTriggeredAt = this.lastTriggered.get(configId);
    if (!lastTriggeredAt) return true;

    const cooldownMs = (config.cooldownMinutes || this.config.defaultCooldownMinutes || 15) * 60 * 1000;
    return Date.now() - lastTriggeredAt.getTime() >= cooldownMs;
  }

  /**
   * Create and send an alert.
   */
  private async createAndSendAlert(config: AlertConfig, trigger: AlertTrigger): Promise<Alert> {
    const alert: Alert = {
      id: `alert_${randomUUID()}`,
      configId: config.id,
      severity: trigger.severity,
      title: trigger.title,
      message: trigger.message,
      data: trigger.data,
      triggeredAt: new Date(),
      channels: config.channels,
    };

    this.activeAlerts.set(alert.id, alert);
    this.lastTriggered.set(config.id, new Date());

    // Send to channels
    await this.sendToChannels(alert);

    return alert;
  }

  /**
   * Send alert to configured channels.
   */
  private async sendToChannels(alert: Alert): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const channel of alert.channels) {
      const handler = this.config.handlers[channel];
      if (handler) {
        promises.push(handler(alert).catch(() => {
          // Log error but don't fail
        }));
      }
    }

    await Promise.all(promises);
  }

  /**
   * Clear all alerts (for testing).
   */
  clear(): void {
    this.activeAlerts.clear();
    this.alertHistory = [];
    this.lastTriggered.clear();
  }
}

// =============================================================================
// Default Alert Configurations
// =============================================================================

export function createDefaultAlertConfigs(): AlertConfig[] {
  return [
    {
      id: 'queue_depth_high',
      name: 'Queue Depth High',
      enabled: true,
      conditions: {
        queueDepthThreshold: 100,
      },
      channels: ['slack'],
      cooldownMinutes: 15,
    },
    {
      id: 'failure_rate_high',
      name: 'High Failure Rate',
      enabled: true,
      conditions: {
        failureRateThreshold: 0.1, // 10%
      },
      channels: ['slack', 'email'],
      cooldownMinutes: 30,
    },
    {
      id: 'cost_threshold',
      name: 'Cost Threshold',
      enabled: true,
      conditions: {
        costThresholdUsd: 100,
      },
      channels: ['email'],
      cooldownMinutes: 60,
    },
    {
      id: 'policy_violations',
      name: 'Policy Violations',
      enabled: true,
      conditions: {
        policyViolationCount: 5,
      },
      channels: ['slack', 'pagerduty'],
      cooldownMinutes: 15,
    },
    {
      id: 'high_latency',
      name: 'High Latency',
      enabled: true,
      conditions: {
        avgLatencyThresholdMs: 30000, // 30 seconds
      },
      channels: ['slack'],
      cooldownMinutes: 15,
    },
  ];
}
