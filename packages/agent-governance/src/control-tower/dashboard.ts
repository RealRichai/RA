/**
 * Control Tower Dashboard
 *
 * Admin view for agent runs, queue health, and costs.
 */

import type { AgentRunStore } from '../runtime/agent-run';
import type {
  ControlTowerDashboard,
  AgentRunSummary,
  QueueHealth,
  AgentRun,
  AgentType,
  AgentRunStatus,
  PolicyViolationSeverity,
} from '../types';

import { getKillSwitchManager } from './kill-switch';

// =============================================================================
// Dashboard Service
// =============================================================================

export interface DashboardServiceConfig {
  runStore: AgentRunStore;
  queueHealthProvider?: () => Promise<QueueHealth[]>;
  alertsProvider?: () => Promise<number>;
}

export class DashboardService {
  private config: DashboardServiceConfig;

  constructor(config: DashboardServiceConfig) {
    this.config = config;
  }

  /**
   * Get full dashboard data.
   */
  async getDashboard(options?: {
    tenantId?: string;
    timeRangeHours?: number;
  }): Promise<ControlTowerDashboard> {
    const timeRangeHours = options?.timeRangeHours || 24;
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - timeRangeHours * 60 * 60 * 1000);

    const [summary, queueHealth, recentViolations, alertsTriggered] = await Promise.all([
      this.getRunSummary({ tenantId: options?.tenantId, startDate, endDate }),
      this.config.queueHealthProvider?.() || Promise.resolve([]),
      this.getRecentViolations({ tenantId: options?.tenantId, limit: 20 }),
      this.config.alertsProvider?.() || Promise.resolve(0),
    ]);

    const killSwitchManager = getKillSwitchManager();

    return {
      summary,
      queueHealth,
      activeKillSwitches: killSwitchManager.getActive(),
      recentViolations,
      alertsTriggered,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get agent run summary.
   */
  async getRunSummary(options: {
    tenantId?: string;
    startDate: Date;
    endDate: Date;
    agentType?: AgentType;
  }): Promise<AgentRunSummary> {
    const listResult = await this.config.runStore.list({
      tenantId: options.tenantId,
      agentType: options.agentType,
      startDate: options.startDate,
      endDate: options.endDate,
      limit: 10000,
    });

    if (!listResult.ok) {
      return this.getEmptySummary(options.startDate, options.endDate);
    }

    const runs = listResult.data;

    // Calculate metrics
    const totalRuns = runs.length;
    const successfulRuns = runs.filter((r) => r.status === 'completed' && r.outcome?.success).length;
    const failedRuns = runs.filter((r) => r.status === 'failed' || (r.outcome && !r.outcome.success)).length;
    const policyBlockedRuns = runs.filter((r) => r.status === 'policy_blocked').length;
    const totalCostUsd = runs.reduce((sum, r) => sum + r.totalCostUsd, 0);

    // Calculate average duration (only for completed runs)
    const completedRuns = runs.filter((r) => r.durationMs !== undefined);
    const avgDurationMs = completedRuns.length > 0
      ? completedRuns.reduce((sum, r) => sum + (r.durationMs || 0), 0) / completedRuns.length
      : 0;

    // Count by agent type
    const byAgentType: Record<string, number> = {};
    for (const run of runs) {
      byAgentType[run.agentType] = (byAgentType[run.agentType] || 0) + 1;
    }

    // Count by status
    const byStatus: Record<string, number> = {};
    for (const run of runs) {
      byStatus[run.status] = (byStatus[run.status] || 0) + 1;
    }

    return {
      totalRuns,
      successfulRuns,
      failedRuns,
      policyBlockedRuns,
      totalCostUsd,
      avgDurationMs,
      byAgentType,
      byStatus,
      timeRange: {
        start: options.startDate,
        end: options.endDate,
      },
    };
  }

  /**
   * Get recent policy violations.
   */
  async getRecentViolations(options: {
    tenantId?: string;
    limit?: number;
  }): Promise<Array<{
    runId: string;
    ruleId: string;
    severity: PolicyViolationSeverity;
    message: string;
    timestamp: Date;
  }>> {
    const listResult = await this.config.runStore.list({
      tenantId: options.tenantId,
      limit: options.limit || 100,
    });

    if (!listResult.ok) {
      return [];
    }

    const violations: Array<{
      runId: string;
      ruleId: string;
      severity: PolicyViolationSeverity;
      message: string;
      timestamp: Date;
    }> = [];

    for (const run of listResult.data) {
      for (const violation of run.policyViolations) {
        violations.push({
          runId: run.id,
          ruleId: violation.ruleId,
          severity: violation.severity,
          message: violation.message,
          timestamp: violation.timestamp,
        });
      }
    }

    // Sort by timestamp descending
    violations.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return violations.slice(0, options.limit || 20);
  }

  /**
   * Get cost breakdown.
   */
  async getCostBreakdown(options: {
    tenantId?: string;
    startDate: Date;
    endDate: Date;
    groupBy: 'agent_type' | 'model' | 'day' | 'hour';
  }): Promise<Record<string, number>> {
    const listResult = await this.config.runStore.list({
      tenantId: options.tenantId,
      startDate: options.startDate,
      endDate: options.endDate,
      limit: 10000,
    });

    if (!listResult.ok) {
      return {};
    }

    const breakdown: Record<string, number> = {};

    for (const run of listResult.data) {
      let key: string;

      switch (options.groupBy) {
        case 'agent_type':
          key = run.agentType;
          break;
        case 'model':
          key = run.modelId;
          break;
        case 'day':
          key = run.startedAt.toISOString().split('T')[0] || 'unknown';
          break;
        case 'hour':
          key = run.startedAt.toISOString().substring(0, 13);
          break;
        default:
          key = 'unknown';
      }

      breakdown[key] = (breakdown[key] || 0) + run.totalCostUsd;
    }

    return breakdown;
  }

  /**
   * Get run history for a tenant.
   */
  async getRunHistory(options: {
    tenantId?: string;
    agentType?: AgentType;
    status?: AgentRunStatus;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{
    runs: AgentRun[];
    total: number;
    hasMore: boolean;
  }> {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const [listResult, countResult] = await Promise.all([
      this.config.runStore.list({
        ...options,
        limit: limit + 1,
        offset,
      }),
      this.config.runStore.count(options),
    ]);

    if (!listResult.ok) {
      return { runs: [], total: 0, hasMore: false };
    }

    const runs = listResult.data;
    const hasMore = runs.length > limit;
    const total = countResult.ok ? countResult.data : runs.length;

    return {
      runs: runs.slice(0, limit),
      total,
      hasMore,
    };
  }

  /**
   * Get empty summary (helper for error cases).
   */
  private getEmptySummary(startDate: Date, endDate: Date): AgentRunSummary {
    return {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
      policyBlockedRuns: 0,
      totalCostUsd: 0,
      avgDurationMs: 0,
      byAgentType: {},
      byStatus: {},
      timeRange: { start: startDate, end: endDate },
    };
  }
}

// =============================================================================
// Dashboard Metrics Helpers
// =============================================================================

/**
 * Calculate success rate from summary.
 */
export function calculateSuccessRate(summary: AgentRunSummary): number {
  if (summary.totalRuns === 0) return 0;
  return (summary.successfulRuns / summary.totalRuns) * 100;
}

/**
 * Calculate policy block rate from summary.
 */
export function calculatePolicyBlockRate(summary: AgentRunSummary): number {
  if (summary.totalRuns === 0) return 0;
  return (summary.policyBlockedRuns / summary.totalRuns) * 100;
}

/**
 * Calculate average cost per run.
 */
export function calculateAvgCostPerRun(summary: AgentRunSummary): number {
  if (summary.totalRuns === 0) return 0;
  return summary.totalCostUsd / summary.totalRuns;
}

/**
 * Format duration for display.
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Format cost for display.
 */
export function formatCost(usd: number): string {
  if (usd < 0.01) return `<$0.01`;
  if (usd < 1) return `$${usd.toFixed(2)}`;
  return `$${usd.toFixed(2)}`;
}
