/**
 * Agent Usage & Cost Tracking Types
 *
 * Types for tracking agent usage, costs, and budget enforcement.
 */

import { z } from 'zod';

// =============================================================================
// Cost Summary Types
// =============================================================================

export interface ModelCost {
  model: string;
  totalCostCents: number;
  tokensIn: number;
  tokensOut: number;
  runCount: number;
}

export interface CostSummary {
  organizationId: string;
  periodStart: Date;
  periodEnd: Date;
  totalCostCents: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalRuns: number;
  avgCostPerRunCents: number;
  byModel: Record<string, ModelCost>;
  byAgentType: Record<string, number>;
}

export interface CostBreakdown {
  key: string; // model name, agent type, or date string
  costCents: number;
  runCount: number;
  tokensIn: number;
  tokensOut: number;
}

// =============================================================================
// Budget Types
// =============================================================================

export interface BudgetCheck {
  allowed: boolean;
  currentCostCents: number;
  budgetLimitCents: number;
  remainingCents: number;
  percentUsed: number;
  periodType: 'daily' | 'monthly';
}

export const BudgetAlertTypeSchema = z.enum(['warning', 'critical', 'exceeded']);
export type BudgetAlertType = z.infer<typeof BudgetAlertTypeSchema>;

export interface BudgetAlert {
  type: BudgetAlertType;
  threshold: number; // 0.8, 0.9, 1.0
  currentPercent: number;
  periodType: 'daily' | 'monthly';
  message: string;
  triggeredAt: Date;
}

export interface AgentBudgetConfig {
  organizationId: string;
  dailyLimitCents: number;
  monthlyLimitCents: number;
  alertThresholds: number[]; // [0.8, 0.9, 1.0]
  isEnabled: boolean;
}

// =============================================================================
// Token Usage Types
// =============================================================================

export interface TokenUsage {
  model: string;
  tokensIn: number;
  tokensOut: number;
  costCents: number;
}

export interface TokenUsageSummary {
  organizationId: string;
  period: string;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostCents: number;
  byModel: TokenUsage[];
}

// =============================================================================
// Configuration Types
// =============================================================================

export interface UsageServiceConfig {
  /** Default daily budget in cents ($100 = 10000) */
  defaultDailyBudgetCents: number;
  /** Default monthly budget in cents ($1000 = 100000) */
  defaultMonthlyBudgetCents: number;
  /** Warning threshold (default 0.8 = 80%) */
  warningThreshold: number;
  /** Critical threshold (default 0.9 = 90%) */
  criticalThreshold: number;
  /** Token cost rates per model (cost per 1000 tokens in cents) */
  tokenCostRates: Record<string, { input: number; output: number }>;
  /** Redis key TTL in seconds for daily counters */
  dailyKeyTtlSeconds: number;
  /** Redis key TTL in seconds for monthly counters */
  monthlyKeyTtlSeconds: number;
}

/**
 * Default token cost rates per 1000 tokens (in cents)
 * Updated based on current pricing as of 2025
 */
export const DEFAULT_TOKEN_COST_RATES: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4': { input: 3, output: 6 },           // $0.03/$0.06 per 1K
  'gpt-4-turbo': { input: 1, output: 3 },     // $0.01/$0.03 per 1K
  'gpt-4o': { input: 0.5, output: 1.5 },      // $0.005/$0.015 per 1K
  'gpt-4o-mini': { input: 0.015, output: 0.06 }, // $0.00015/$0.0006 per 1K
  'gpt-3.5-turbo': { input: 0.05, output: 0.15 }, // $0.0005/$0.0015 per 1K

  // Anthropic
  'claude-3-opus': { input: 1.5, output: 7.5 },   // $0.015/$0.075 per 1K
  'claude-3-sonnet': { input: 0.3, output: 1.5 }, // $0.003/$0.015 per 1K
  'claude-3-haiku': { input: 0.025, output: 0.125 }, // $0.00025/$0.00125 per 1K
  'claude-3.5-sonnet': { input: 0.3, output: 1.5 },
  'claude-opus-4': { input: 1.5, output: 7.5 },

  // Default fallback
  'default': { input: 1, output: 3 },
};

export const DEFAULT_USAGE_CONFIG: UsageServiceConfig = {
  defaultDailyBudgetCents: 10000,    // $100
  defaultMonthlyBudgetCents: 100000, // $1000
  warningThreshold: 0.8,
  criticalThreshold: 0.9,
  tokenCostRates: DEFAULT_TOKEN_COST_RATES,
  dailyKeyTtlSeconds: 86400 * 2,     // 2 days
  monthlyKeyTtlSeconds: 86400 * 35,  // 35 days
};

// =============================================================================
// Period Helpers
// =============================================================================

export type Period = 'today' | 'week' | 'month' | 'custom';

export interface PeriodRange {
  start: Date;
  end: Date;
}

export function getPeriodRange(period: Period, customStart?: Date, customEnd?: Date): PeriodRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case 'today':
      return {
        start: today,
        end: new Date(today.getTime() + 86400000 - 1),
      };
    case 'week': {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      return {
        start: weekStart,
        end: new Date(now.getTime()),
      };
    }
    case 'month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return {
        start: monthStart,
        end: now,
      };
    }
    case 'custom':
      if (!customStart || !customEnd) {
        throw new Error('Custom period requires start and end dates');
      }
      return { start: customStart, end: customEnd };
  }
}

// =============================================================================
// Redis Key Helpers
// =============================================================================

export function getDailyRedisKey(organizationId: string, date: Date = new Date()): string {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  return `agent:cost:daily:${organizationId}:${dateStr}`;
}

export function getMonthlyRedisKey(organizationId: string, date: Date = new Date()): string {
  const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `agent:cost:monthly:${organizationId}:${monthStr}`;
}

export function getTokenUsageRedisKey(organizationId: string, model: string, date: Date = new Date()): string {
  const dateStr = date.toISOString().split('T')[0];
  return `agent:tokens:${organizationId}:${model}:${dateStr}`;
}

export function getRunCountRedisKey(organizationId: string, date: Date = new Date()): string {
  const dateStr = date.toISOString().split('T')[0];
  return `agent:runs:count:${organizationId}:${dateStr}`;
}

export function getBudgetAlertRedisKey(organizationId: string, threshold: number, periodType: 'daily' | 'monthly'): string {
  return `agent:budget:alert:${organizationId}:${periodType}:${threshold}`;
}
