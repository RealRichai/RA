/**
 * Prisma Agent Run Store
 *
 * Database-backed implementation of AgentRunStore using Prisma.
 * Also implements UsageDatabaseAdapter for cost tracking integration.
 */

import type { Prisma, PrismaClient, AgentRun as DbAgentRun, AgentRunStatus as DbAgentRunStatus } from '@realriches/database';

import type { AgentRunStore } from '../runtime/agent-run';
import type {
  AgentRun,
  AgentRunStatus,
  AgentType,
  Result,
} from '../types';
import { Ok, Err } from '../types';
import type { UsageDatabaseAdapter } from '../usage/agent-usage.service';
import type {
  AgentBudgetConfig,
  CostSummary,
  CostBreakdown,
  ModelCost,
} from '../usage/types';

// =============================================================================
// Status Mapping
// =============================================================================

const STATUS_TO_DB: Record<AgentRunStatus, DbAgentRunStatus> = {
  pending: 'pending',
  running: 'processing',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'failed', // Map cancelled to failed in DB
  timeout: 'failed',   // Map timeout to failed in DB
  policy_blocked: 'blocked',
};

const STATUS_FROM_DB: Record<DbAgentRunStatus, AgentRunStatus> = {
  pending: 'pending',
  processing: 'running',
  completed: 'completed',
  failed: 'failed',
  blocked: 'policy_blocked',
};

// =============================================================================
// Type Conversions
// =============================================================================

function toDbAgentRun(run: AgentRun): Prisma.AgentRunCreateInput {
  return {
    id: run.id,
    organizationId: run.tenantId,
    userId: run.userId,
    marketId: run.market,
    model: run.modelId,
    provider: 'anthropic', // Default provider, should be derived from modelId
    agentType: run.agentType,
    promptRedacted: JSON.stringify(run.prompts),
    outputRedacted: run.outcome ? JSON.stringify(run.outcome) : null,
    promptRedactionReport: run.redactionReport ? (run.redactionReport as unknown as Prisma.InputJsonValue) : undefined,
    policyCheckResult: run.policyViolations.length > 0
      ? (run.policyViolations as unknown as Prisma.InputJsonValue)
      : undefined,
    tokensPrompt: run.totalTokensIn,
    tokensCompletion: run.totalTokensOut,
    tokensTotal: run.totalTokensIn + run.totalTokensOut,
    cost: Math.round(run.totalCostUsd * 100), // Convert USD to cents
    status: STATUS_TO_DB[run.status],
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    processingTimeMs: run.durationMs,
    requestId: run.requestId,
  };
}

function fromDbAgentRun(dbRun: DbAgentRun): AgentRun {
  let prompts: AgentRun['prompts'] = [];
  let outcome: AgentRun['outcome'];
  let policyViolations: AgentRun['policyViolations'] = [];

  try {
    if (dbRun.promptRedacted) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      prompts = JSON.parse(dbRun.promptRedacted);
    }
  } catch {
    // Invalid JSON, leave empty
  }

  try {
    if (dbRun.outputRedacted) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      outcome = JSON.parse(dbRun.outputRedacted);
    }
  } catch {
    // Invalid JSON, leave undefined
  }

  if (dbRun.policyCheckResult && Array.isArray(dbRun.policyCheckResult)) {
    policyViolations = dbRun.policyCheckResult as unknown as AgentRun['policyViolations'];
  }

  const status = STATUS_FROM_DB[dbRun.status] || 'pending';

  return {
    id: dbRun.id,
    requestId: dbRun.requestId || `req_${dbRun.id}`,
    agentType: (dbRun.agentType || 'analytics_agent') as AgentType,
    status,
    tenantId: dbRun.organizationId || '',
    userId: dbRun.userId || undefined,
    market: dbRun.marketId || undefined,
    inputsHash: '', // Not stored in DB, compute if needed
    inputs: {},     // Not stored in DB
    prompts,
    totalTokensIn: dbRun.tokensPrompt,
    totalTokensOut: dbRun.tokensCompletion,
    toolCalls: [], // Not stored in DB schema
    outcome,
    policyVersion: 'v1', // Not stored in DB
    policyViolations,
    totalCostUsd: dbRun.cost / 100, // Convert cents to USD
    modelId: dbRun.model,
    startedAt: dbRun.startedAt,
    completedAt: dbRun.completedAt || undefined,
    durationMs: dbRun.processingTimeMs || undefined,
    retryCount: 0,
  };
}

// =============================================================================
// Prisma Agent Run Store
// =============================================================================

export interface PrismaAgentRunStoreConfig {
  /** Enable verbose logging */
  debug?: boolean;
}

export class PrismaAgentRunStore implements AgentRunStore, UsageDatabaseAdapter {
  constructor(
    private prisma: PrismaClient,
    private config: PrismaAgentRunStoreConfig = {}
  ) {}

  // ===========================================================================
  // AgentRunStore Implementation
  // ===========================================================================

  async save(run: AgentRun): Promise<Result<AgentRun>> {
    try {
      const data = toDbAgentRun(run);

      await this.prisma.agentRun.upsert({
        where: { id: run.id },
        create: data,
        update: {
          status: data.status,
          completedAt: data.completedAt,
          processingTimeMs: data.processingTimeMs,
          tokensPrompt: data.tokensPrompt,
          tokensCompletion: data.tokensCompletion,
          tokensTotal: data.tokensTotal,
          cost: data.cost,
          outputRedacted: data.outputRedacted,
          policyCheckResult: data.policyCheckResult,
          errorCode: run.status === 'failed' ? 'AGENT_FAILED' : null,
          errorMessage: run.outcome?.success === false ? run.outcome.summaryForHuman : null,
        },
      });

      return Ok(run);
    } catch (error) {
      // Debug logging handled by caller
      void this.config.debug;
      return Err('SAVE_ERROR', `Failed to save agent run: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async get(runId: string): Promise<Result<AgentRun | null>> {
    try {
      const dbRun = await this.prisma.agentRun.findUnique({
        where: { id: runId },
      });

      if (!dbRun) {
        return Ok(null);
      }

      return Ok(fromDbAgentRun(dbRun));
    } catch (error) {
      return Err('GET_ERROR', `Failed to get agent run: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getByRequestId(requestId: string): Promise<Result<AgentRun[]>> {
    try {
      const dbRuns = await this.prisma.agentRun.findMany({
        where: { requestId },
        orderBy: { createdAt: 'desc' },
      });

      return Ok(dbRuns.map(fromDbAgentRun));
    } catch (error) {
      return Err('GET_ERROR', `Failed to get agent runs by request ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getByInputsHash(inputsHash: string, tenantId: string): Promise<Result<AgentRun | null>> {
    // Note: inputsHash is not stored in the DB schema, so we can't query by it
    // This would require schema changes to support idempotency
    void inputsHash;
    void tenantId;
    return Promise.resolve(Ok(null));
  }

  async list(options: {
    tenantId?: string;
    agentType?: AgentType;
    status?: AgentRunStatus;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<Result<AgentRun[]>> {
    try {
      const where: Prisma.AgentRunWhereInput = {};

      if (options.tenantId) {
        where.organizationId = options.tenantId;
      }
      if (options.agentType) {
        where.agentType = options.agentType;
      }
      if (options.status) {
        where.status = STATUS_TO_DB[options.status];
      }
      if (options.startDate || options.endDate) {
        where.startedAt = {};
        if (options.startDate) {
          where.startedAt.gte = options.startDate;
        }
        if (options.endDate) {
          where.startedAt.lte = options.endDate;
        }
      }

      const dbRuns = await this.prisma.agentRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: options.offset || 0,
        take: options.limit || 100,
      });

      return Ok(dbRuns.map(fromDbAgentRun));
    } catch (error) {
      return Err('LIST_ERROR', `Failed to list agent runs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async count(options: {
    tenantId?: string;
    agentType?: AgentType;
    status?: AgentRunStatus;
    startDate?: Date;
    endDate?: Date;
  }): Promise<Result<number>> {
    try {
      const where: Prisma.AgentRunWhereInput = {};

      if (options.tenantId) {
        where.organizationId = options.tenantId;
      }
      if (options.agentType) {
        where.agentType = options.agentType;
      }
      if (options.status) {
        where.status = STATUS_TO_DB[options.status];
      }
      if (options.startDate || options.endDate) {
        where.startedAt = {};
        if (options.startDate) {
          where.startedAt.gte = options.startDate;
        }
        if (options.endDate) {
          where.startedAt.lte = options.endDate;
        }
      }

      const count = await this.prisma.agentRun.count({ where });
      return Ok(count);
    } catch (error) {
      return Err('COUNT_ERROR', `Failed to count agent runs: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ===========================================================================
  // UsageDatabaseAdapter Implementation
  // ===========================================================================

  async getBudget(organizationId: string): Promise<AgentBudgetConfig | null> {
    try {
      /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
      const budget = await (this.prisma as any).agentBudget.findUnique({
        where: { organizationId },
      });

      if (!budget) {
        return null;
      }

      return {
        organizationId: budget.organizationId as string,
        dailyLimitCents: budget.dailyLimitCents as number,
        monthlyLimitCents: budget.monthlyLimitCents as number,
        alertThresholds: budget.alertThresholds as number[],
        isEnabled: budget.isEnabled as boolean,
      };
      /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    } catch {
      // Budget not found or error - return null
      return null;
    }
  }

  async upsertBudget(config: AgentBudgetConfig): Promise<AgentBudgetConfig> {
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
    const budget = await (this.prisma as any).agentBudget.upsert({
      where: { organizationId: config.organizationId },
      create: {
        organizationId: config.organizationId,
        dailyLimitCents: config.dailyLimitCents,
        monthlyLimitCents: config.monthlyLimitCents,
        alertThresholds: config.alertThresholds,
        isEnabled: config.isEnabled,
      },
      update: {
        dailyLimitCents: config.dailyLimitCents,
        monthlyLimitCents: config.monthlyLimitCents,
        alertThresholds: config.alertThresholds,
        isEnabled: config.isEnabled,
      },
    });

    return {
      organizationId: budget.organizationId as string,
      dailyLimitCents: budget.dailyLimitCents as number,
      monthlyLimitCents: budget.monthlyLimitCents as number,
      alertThresholds: budget.alertThresholds as number[],
      isEnabled: budget.isEnabled as boolean,
    };
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
  }

  async getCostSummary(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CostSummary> {
    const runs = await this.prisma.agentRun.findMany({
      where: {
        organizationId,
        startedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        cost: true,
        tokensPrompt: true,
        tokensCompletion: true,
        model: true,
        agentType: true,
      },
    });

    const byModel: Record<string, ModelCost> = {};
    const byAgentType: Record<string, number> = {};
    let totalCostCents = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;

    for (const run of runs) {
      totalCostCents += run.cost;
      totalTokensIn += run.tokensPrompt;
      totalTokensOut += run.tokensCompletion;

      // Aggregate by model
      const model = run.model;
      if (!byModel[model]) {
        byModel[model] = {
          model,
          totalCostCents: 0,
          tokensIn: 0,
          tokensOut: 0,
          runCount: 0,
        };
      }
      byModel[model].totalCostCents += run.cost;
      byModel[model].tokensIn += run.tokensPrompt;
      byModel[model].tokensOut += run.tokensCompletion;
      byModel[model].runCount += 1;

      // Aggregate by agent type
      const agentType = run.agentType || 'unknown';
      byAgentType[agentType] = (byAgentType[agentType] || 0) + run.cost;
    }

    const totalRuns = runs.length;
    const avgCostPerRunCents = totalRuns > 0 ? totalCostCents / totalRuns : 0;

    return {
      organizationId,
      periodStart: startDate,
      periodEnd: endDate,
      totalCostCents,
      totalTokensIn,
      totalTokensOut,
      totalRuns,
      avgCostPerRunCents,
      byModel,
      byAgentType,
    };
  }

  async getCostBreakdown(
    organizationId: string,
    groupBy: 'model' | 'agent_type' | 'day' | 'hour',
    startDate: Date,
    endDate: Date
  ): Promise<CostBreakdown[]> {
    const runs = await this.prisma.agentRun.findMany({
      where: {
        organizationId,
        startedAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        cost: true,
        tokensPrompt: true,
        tokensCompletion: true,
        model: true,
        agentType: true,
        startedAt: true,
      },
    });

    const breakdown: Record<string, CostBreakdown> = {};

    for (const run of runs) {
      let key: string;

      switch (groupBy) {
        case 'model':
          key = run.model;
          break;
        case 'agent_type':
          key = run.agentType || 'unknown';
          break;
        case 'day':
          key = run.startedAt.toISOString().split('T')[0]!;
          break;
        case 'hour':
          key = run.startedAt.toISOString().slice(0, 13); // YYYY-MM-DDTHH
          break;
      }

      if (!breakdown[key]) {
        breakdown[key] = {
          key,
          costCents: 0,
          runCount: 0,
          tokensIn: 0,
          tokensOut: 0,
        };
      }

      const entry = breakdown[key]!;
      entry.costCents += run.cost;
      entry.runCount += 1;
      entry.tokensIn += run.tokensPrompt;
      entry.tokensOut += run.tokensCompletion;
    }

    return Object.values(breakdown).sort((a, b) => b.costCents - a.costCents);
  }

  async getDailyUsage(
    organizationId: string,
    date: Date
  ): Promise<{ totalCostCents: number; totalTokens: number; requestCount: number } | null> {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 86400000 - 1);

    // First try AIBudgetUsage table
    const budgetUsage = await this.prisma.aIBudgetUsage.findFirst({
      where: {
        organizationId,
        date: startOfDay,
      },
    });

    if (budgetUsage) {
      return {
        totalCostCents: budgetUsage.totalCost,
        totalTokens: budgetUsage.totalTokens,
        requestCount: budgetUsage.requestCount,
      };
    }

    // Fallback to aggregating from AgentRun
    const result = await this.prisma.agentRun.aggregate({
      where: {
        organizationId,
        startedAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      _sum: {
        cost: true,
        tokensTotal: true,
      },
      _count: true,
    });

    if (!result._count) {
      return null;
    }

    return {
      totalCostCents: result._sum.cost || 0,
      totalTokens: result._sum.tokensTotal || 0,
      requestCount: result._count,
    };
  }

  async upsertDailyUsage(
    organizationId: string,
    date: Date,
    costCents: number,
    tokens: number,
    requests: number
  ): Promise<void> {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    await this.prisma.aIBudgetUsage.upsert({
      where: {
        // AIBudgetUsage uses composite key, need to find by org + date
        id: `${organizationId}_${startOfDay.toISOString().split('T')[0]}`,
      },
      create: {
        organizationId,
        date: startOfDay,
        totalCost: costCents,
        totalTokens: tokens,
        requestCount: requests,
      },
      update: {
        totalCost: { increment: costCents },
        totalTokens: { increment: tokens },
        requestCount: { increment: requests },
      },
    });
  }

  async getMonthlyUsage(
    organizationId: string,
    year: number,
    month: number
  ): Promise<{ totalCostCents: number; totalTokens: number; requestCount: number }> {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

    const result = await this.prisma.agentRun.aggregate({
      where: {
        organizationId,
        startedAt: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
      _sum: {
        cost: true,
        tokensTotal: true,
      },
      _count: true,
    });

    return {
      totalCostCents: result._sum.cost || 0,
      totalTokens: result._sum.tokensTotal || 0,
      requestCount: result._count,
    };
  }
}
