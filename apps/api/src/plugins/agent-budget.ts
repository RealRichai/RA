/**
 * Agent Budget Enforcement Plugin
 *
 * Enforces daily and monthly agent cost budgets.
 * Uses Redis for real-time cost tracking with database persistence.
 */

import {
  AgentUsageService,
  PrismaAgentRunStore,
  type BudgetCheck,
} from '@realriches/agent-governance';
import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

// =============================================================================
// Types
// =============================================================================

export interface AgentBudgetOptions {
  enabled?: boolean;
  /** Allow usage even when over budget (soft limit) */
  softLimit?: boolean;
  /** Custom error message */
  errorMessage?: string;
}

export interface BudgetEnforcementResult {
  allowed: boolean;
  daily: BudgetCheck;
  monthly: BudgetCheck;
  organizationId: string;
  budgetExceeded: 'none' | 'daily' | 'monthly' | 'both';
}

interface AgentBudgetPluginOptions {
  enabled?: boolean;
}

// =============================================================================
// Plugin Implementation
// =============================================================================

let agentUsageService: AgentUsageService | null = null;
let agentRunStore: PrismaAgentRunStore | null = null;

const agentBudgetPluginCallback: FastifyPluginCallback<AgentBudgetPluginOptions> = (
  fastify,
  opts,
  done
) => {
  const { enabled = true } = opts;

  if (!enabled) {
    logger.info('Agent budget enforcement disabled');
    done();
    return;
  }

  // Initialize stores and service with Redis and Prisma
  agentRunStore = new PrismaAgentRunStore(fastify.prisma);
  agentUsageService = new AgentUsageService(fastify.redis, agentRunStore);

  // Decorate fastify with agent usage service
  fastify.decorate('agentUsageService', agentUsageService);
  fastify.decorate('agentRunStore', agentRunStore);

  // Add budget enforcement decorator function
  fastify.decorate(
    'enforceAgentBudget',
    async function (
      request: FastifyRequest,
      reply: FastifyReply,
      options: AgentBudgetOptions = {}
    ): Promise<BudgetEnforcementResult | null> {
      if (options.enabled === false) {
        return null; // Skip enforcement
      }

      if (!agentUsageService) {
        logger.warn('Agent usage service not initialized');
        return null;
      }

      // Get organization ID from request
      const organizationId = getOrganizationId(request);
      if (!organizationId) {
        // No organization context - allow request (anonymous/public endpoints)
        return null;
      }

      // Check both daily and monthly budgets
      const { daily, monthly } = await agentUsageService.checkBudget(organizationId);

      // Determine if budget is exceeded
      let budgetExceeded: 'none' | 'daily' | 'monthly' | 'both' = 'none';
      if (!daily.allowed && !monthly.allowed) {
        budgetExceeded = 'both';
      } else if (!daily.allowed) {
        budgetExceeded = 'daily';
      } else if (!monthly.allowed) {
        budgetExceeded = 'monthly';
      }

      const allowed = daily.allowed && monthly.allowed;

      if (!allowed && !options.softLimit) {
        const message = options.errorMessage || getBudgetExceededMessage(budgetExceeded, daily, monthly);

        reply.status(429).send({
          success: false,
          error: {
            code: 'AGENT_BUDGET_EXCEEDED',
            message,
            details: {
              budgetExceeded,
              daily: {
                currentCostUsd: daily.currentCostCents / 100,
                limitUsd: daily.budgetLimitCents / 100,
                percentUsed: daily.percentUsed,
              },
              monthly: {
                currentCostUsd: monthly.currentCostCents / 100,
                limitUsd: monthly.budgetLimitCents / 100,
                percentUsed: monthly.percentUsed,
              },
            },
          },
        });

        logger.warn({
          organizationId,
          budgetExceeded,
          dailyCost: daily.currentCostCents,
          dailyLimit: daily.budgetLimitCents,
          monthlyCost: monthly.currentCostCents,
          monthlyLimit: monthly.budgetLimitCents,
          endpoint: request.url,
        }, 'Agent budget exceeded');

        return {
          allowed: false,
          daily,
          monthly,
          organizationId,
          budgetExceeded,
        };
      }

      // Add budget headers to response
      addBudgetHeaders(reply, daily, monthly);

      return {
        allowed: true,
        daily,
        monthly,
        organizationId,
        budgetExceeded,
      };
    }
  );

  // Add cost recording decorator (called after agent run completes)
  fastify.decorate(
    'recordAgentCost',
    async function (
      organizationId: string,
      costCents: number,
      model?: string,
      tokensIn?: number,
      tokensOut?: number
    ): Promise<void> {
      if (!agentUsageService) {
        logger.warn('Agent usage service not initialized');
        return;
      }

      // Increment cost counters
      await agentUsageService.incrementCost(organizationId, costCents);

      // Record token usage if provided
      if (model && tokensIn !== undefined && tokensOut !== undefined) {
        await agentUsageService.recordTokenUsage(organizationId, model, tokensIn, tokensOut);
      }

      // Check for budget alerts
      const alerts = await agentUsageService.checkBudgetThresholds(organizationId);
      for (const alert of alerts) {
        logger.warn({
          organizationId,
          alertType: alert.type,
          threshold: alert.threshold,
          percentUsed: alert.currentPercent,
          periodType: alert.periodType,
        }, alert.message);
      }
    }
  );

  // Add budget status decorator
  fastify.decorate(
    'getAgentBudgetStatus',
    async function (organizationId: string) {
      if (!agentUsageService) {
        return null;
      }
      return agentUsageService.getUsageStatus(organizationId);
    }
  );

  // Add preHandler hook for AI routes that should be budget-gated
  fastify.decorate(
    'agentBudgetPreHandler',
    async function (request: FastifyRequest, reply: FastifyReply) {
      const result = await fastify.enforceAgentBudget(request, reply);
      if (result && !result.allowed) {
        // Reply already sent by enforceAgentBudget
        return;
      }
    }
  );

  logger.info('Agent budget enforcement enabled');
  done();
};

// =============================================================================
// Helper Functions
// =============================================================================

function getOrganizationId(request: FastifyRequest): string | null {
  return (
    (request as { organizationId?: string }).organizationId ||
    request.user?.organizationId ||
    null
  );
}

function getBudgetExceededMessage(
  exceeded: 'none' | 'daily' | 'monthly' | 'both',
  daily: BudgetCheck,
  monthly: BudgetCheck
): string {
  switch (exceeded) {
    case 'daily':
      return `Daily AI budget exceeded ($${(daily.currentCostCents / 100).toFixed(2)} of $${(daily.budgetLimitCents / 100).toFixed(2)}). Try again tomorrow or contact support to increase your limit.`;
    case 'monthly':
      return `Monthly AI budget exceeded ($${(monthly.currentCostCents / 100).toFixed(2)} of $${(monthly.budgetLimitCents / 100).toFixed(2)}). Contact support to increase your limit.`;
    case 'both':
      return 'Both daily and monthly AI budgets exceeded. Contact support to increase your limits.';
    default:
      return 'AI budget exceeded. Please try again later.';
  }
}

function addBudgetHeaders(reply: FastifyReply, daily: BudgetCheck, monthly: BudgetCheck): void {
  // Daily budget headers
  reply.header('X-Agent-Daily-Cost-Cents', String(Math.round(daily.currentCostCents)));
  reply.header('X-Agent-Daily-Limit-Cents', daily.budgetLimitCents === -1 ? 'unlimited' : String(daily.budgetLimitCents));
  reply.header('X-Agent-Daily-Remaining-Cents', daily.budgetLimitCents === -1 ? 'unlimited' : String(Math.round(daily.remainingCents)));
  reply.header('X-Agent-Daily-Percent-Used', String(daily.percentUsed.toFixed(1)));

  // Monthly budget headers
  reply.header('X-Agent-Monthly-Cost-Cents', String(Math.round(monthly.currentCostCents)));
  reply.header('X-Agent-Monthly-Limit-Cents', monthly.budgetLimitCents === -1 ? 'unlimited' : String(monthly.budgetLimitCents));
  reply.header('X-Agent-Monthly-Remaining-Cents', monthly.budgetLimitCents === -1 ? 'unlimited' : String(Math.round(monthly.remainingCents)));
  reply.header('X-Agent-Monthly-Percent-Used', String(monthly.percentUsed.toFixed(1)));
}

// =============================================================================
// Plugin Export
// =============================================================================

export const agentBudgetPlugin = fp(agentBudgetPluginCallback, {
  name: 'agent-budget',
  dependencies: ['redis', 'prisma'],
});

// Type augmentation
declare module 'fastify' {
  interface FastifyInstance {
    agentUsageService: AgentUsageService;
    agentRunStore: PrismaAgentRunStore;
    enforceAgentBudget: (
      request: FastifyRequest,
      reply: FastifyReply,
      options?: AgentBudgetOptions
    ) => Promise<BudgetEnforcementResult | null>;
    recordAgentCost: (
      organizationId: string,
      costCents: number,
      model?: string,
      tokensIn?: number,
      tokensOut?: number
    ) => Promise<void>;
    getAgentBudgetStatus: (organizationId: string) => Promise<{
      daily: BudgetCheck;
      monthly: BudgetCheck;
      config: {
        organizationId: string;
        dailyLimitCents: number;
        monthlyLimitCents: number;
        alertThresholds: number[];
        isEnabled: boolean;
      };
      runCount: number;
    } | null>;
    agentBudgetPreHandler: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// =============================================================================
// Exports
// =============================================================================

export function getAgentUsageService(): AgentUsageService | null {
  return agentUsageService;
}

export function getAgentRunStore(): PrismaAgentRunStore | null {
  return agentRunStore;
}
