/**
 * Plan Enforcement Plugin
 *
 * Enforces subscription plan limits (calls, generations, tasks).
 * Uses Redis-cached usage tracking from @realriches/agent-plans.
 */

import type { UsageType, UsageCheckResult } from '@realriches/agent-plans';
import { PlanUsageService } from '@realriches/agent-plans';
import { logger } from '@realriches/utils';
import type { FastifyInstance, FastifyPluginCallback, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

// =============================================================================
// Types
// =============================================================================

export interface PlanEnforcementOptions {
  enabled?: boolean;
  /** Allow overage usage (for paid plans) */
  allowOverage?: boolean;
  /** Custom error message */
  errorMessage?: string;
}

export interface EnforcementResult {
  allowed: boolean;
  usage: UsageCheckResult;
  organizationId: string;
  usageType: UsageType;
}

interface PlanEnforcementPluginOptions {
  enabled?: boolean;
  cacheTtlSeconds?: number;
}

// =============================================================================
// Plugin Implementation
// =============================================================================

let planUsageService: PlanUsageService | null = null;

const planEnforcementPluginCallback: FastifyPluginCallback<PlanEnforcementPluginOptions> = (
  fastify,
  opts,
  done
) => {
  const { enabled = true, cacheTtlSeconds = 60 } = opts;

  if (!enabled) {
    logger.info('Plan enforcement disabled');
    done();
    return;
  }

  // Initialize service with Redis
  planUsageService = new PlanUsageService({
    redis: fastify.redis,
    cacheTtlSeconds,
    db: createDatabaseAdapter(fastify),
  });

  // Decorate fastify with plan usage service
  fastify.decorate('planUsageService', planUsageService);

  // Add enforcement decorator function
  fastify.decorate(
    'enforcePlanLimit',
    async function (
      request: FastifyRequest,
      reply: FastifyReply,
      usageType: UsageType,
      options: PlanEnforcementOptions = {}
    ): Promise<EnforcementResult | null> {
      if (!options.enabled && options.enabled !== undefined) {
        return null; // Skip enforcement
      }

      if (!planUsageService) {
        logger.warn('Plan usage service not initialized');
        return null;
      }

      // Get organization ID from request
      const organizationId = getOrganizationId(request);
      if (!organizationId) {
        // No organization context - allow request (anonymous/public endpoints)
        return null;
      }

      // Check usage limits
      const usage = await planUsageService.checkUsage(organizationId, usageType, 1);

      if (!usage.allowed) {
        const message = options.errorMessage || getLimitExceededMessage(usageType);

        reply.status(429).send({
          success: false,
          error: {
            code: 'PLAN_LIMIT_EXCEEDED',
            message,
            details: {
              usageType,
              currentUsage: usage.currentUsage,
              limit: usage.limit,
              remaining: usage.remaining,
              upgradeUrl: '/plans/upgrade',
            },
          },
        });

        logger.warn({
          organizationId,
          usageType,
          currentUsage: usage.currentUsage,
          limit: usage.limit,
          endpoint: request.url,
        }, 'Plan limit exceeded');

        return {
          allowed: false,
          usage,
          organizationId,
          usageType,
        };
      }

      // Increment usage counter
      await planUsageService.incrementUsage(organizationId, usageType, 1);

      // Add usage headers
      reply.header('X-Plan-Usage-Type', usageType);
      reply.header('X-Plan-Usage-Current', String(usage.currentUsage + 1));
      reply.header('X-Plan-Usage-Limit', usage.limit === -1 ? 'unlimited' : String(usage.limit));
      reply.header('X-Plan-Usage-Remaining', usage.limit === -1 ? 'unlimited' : String(usage.remaining - 1));

      return {
        allowed: true,
        usage: {
          ...usage,
          currentUsage: usage.currentUsage + 1,
          remaining: usage.limit === -1 ? Infinity : usage.remaining - 1,
        },
        organizationId,
        usageType,
      };
    }
  );

  // Add batch usage check (for operations that consume multiple units)
  fastify.decorate(
    'enforcePlanLimitBatch',
    async function (
      request: FastifyRequest,
      reply: FastifyReply,
      usageType: UsageType,
      amount: number,
      options: PlanEnforcementOptions = {}
    ): Promise<EnforcementResult | null> {
      if (!planUsageService) return null;

      const organizationId = getOrganizationId(request);
      if (!organizationId) return null;

      const usage = await planUsageService.checkUsage(organizationId, usageType, amount);

      if (!usage.allowed && !options.allowOverage) {
        const message = options.errorMessage || getLimitExceededMessage(usageType);

        reply.status(429).send({
          success: false,
          error: {
            code: 'PLAN_LIMIT_EXCEEDED',
            message,
            details: {
              usageType,
              requestedAmount: amount,
              currentUsage: usage.currentUsage,
              limit: usage.limit,
              remaining: usage.remaining,
            },
          },
        });

        return {
          allowed: false,
          usage,
          organizationId,
          usageType,
        };
      }

      await planUsageService.incrementUsage(organizationId, usageType, amount);

      return {
        allowed: true,
        usage: {
          ...usage,
          currentUsage: usage.currentUsage + amount,
          remaining: usage.limit === -1 ? Infinity : Math.max(0, usage.remaining - amount),
        },
        organizationId,
        usageType,
      };
    }
  );

  // Add usage summary endpoint decorator
  fastify.decorate(
    'getUsageSummary',
    async function (organizationId: string) {
      if (!planUsageService) {
        return null;
      }
      return planUsageService.getUsageSummary(organizationId);
    }
  );

  logger.info('Plan enforcement enabled');
  done();
};

// =============================================================================
// Helper Functions
// =============================================================================

function getOrganizationId(request: FastifyRequest): string | null {
  // Try to get organization ID from various sources
  return (
    (request as { organizationId?: string }).organizationId ||
    request.user?.organizationId ||
    null
  );
}

function getLimitExceededMessage(usageType: UsageType): string {
  switch (usageType) {
    case 'calls':
      return 'Monthly voice call limit reached. Upgrade your plan for more calls.';
    case 'generations':
      return 'Monthly content generation limit reached. Upgrade your plan for more generations.';
    case 'tasks':
      return 'Monthly AI task limit reached. Upgrade your plan for more tasks.';
    default:
      return 'Plan limit exceeded. Please upgrade your plan.';
  }
}

function createDatabaseAdapter(fastify: FastifyInstance) {
  return {
    async getOrganizationPlan(organizationId: string) {
      const orgPlan = await fastify.prisma.organizationPlan.findUnique({
        where: { organizationId },
        include: { plan: true },
      });

      if (!orgPlan) return null;

      return {
        id: orgPlan.id,
        planId: orgPlan.planId,
        limits: {
          monthlyCallLimit: orgPlan.plan.monthlyCallLimit,
          monthlyGenerationLimit: orgPlan.plan.monthlyGenerationLimit,
          monthlyTaskLimit: orgPlan.plan.monthlyTaskLimit,
          callsPerMinute: orgPlan.plan.callsPerMinute,
        },
        customCallLimit: orgPlan.customCallLimit ?? undefined,
        customGenerationLimit: orgPlan.customGenerationLimit ?? undefined,
        customTaskLimit: orgPlan.customTaskLimit ?? undefined,
        billingCycleStart: orgPlan.billingCycleStart,
        billingCycleEnd: orgPlan.billingCycleEnd,
      };
    },

    async getCurrentUsage(organizationId: string, periodStart: Date) {
      const usage = await fastify.prisma.planUsage.findFirst({
        where: {
          organizationId,
          periodStart: {
            gte: new Date(periodStart.getFullYear(), periodStart.getMonth(), 1),
          },
        },
      });

      if (!usage) return null;

      return {
        callsUsed: usage.callsUsed,
        generationsUsed: usage.generationsUsed,
        tasksUsed: usage.tasksUsed,
      };
    },

    async incrementUsage(
      organizationId: string,
      periodStart: Date,
      type: UsageType,
      amount: number
    ) {
      const startOfMonth = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1);

      const updateField = type === 'calls' ? 'callsUsed' :
                          type === 'generations' ? 'generationsUsed' : 'tasksUsed';

      const result = await fastify.prisma.planUsage.upsert({
        where: {
          organizationId_periodStart: {
            organizationId,
            periodStart: startOfMonth,
          },
        },
        create: {
          organizationId,
          organizationPlanId: '', // Will be set on first usage
          periodStart: startOfMonth,
          [updateField]: amount,
          callsLimit: 0,
          generationsLimit: 0,
          tasksLimit: 0,
        },
        update: {
          [updateField]: { increment: amount },
        },
      });

      return result[updateField as keyof typeof result] as number;
    },

    async recordOverage(
      organizationId: string,
      periodStart: Date,
      type: UsageType,
      amount: number
    ) {
      const startOfMonth = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1);
      const overageField = type === 'calls' ? 'callsOverageUsed' :
                           type === 'generations' ? 'generationsOverageUsed' : 'tasksOverageUsed';

      await fastify.prisma.planUsage.update({
        where: {
          organizationId_periodStart: {
            organizationId,
            periodStart: startOfMonth,
          },
        },
        data: {
          [overageField]: { increment: amount },
        },
      });
    },
  };
}

// =============================================================================
// Plugin Export
// =============================================================================

export const planEnforcementPlugin = fp(planEnforcementPluginCallback, {
  name: 'plan-enforcement',
  dependencies: ['redis', 'prisma'],
});

// Type augmentation
declare module 'fastify' {
  interface FastifyInstance {
    planUsageService: PlanUsageService;
    enforcePlanLimit: (
      request: FastifyRequest,
      reply: FastifyReply,
      usageType: UsageType,
      options?: PlanEnforcementOptions
    ) => Promise<EnforcementResult | null>;
    enforcePlanLimitBatch: (
      request: FastifyRequest,
      reply: FastifyReply,
      usageType: UsageType,
      amount: number,
      options?: PlanEnforcementOptions
    ) => Promise<EnforcementResult | null>;
    getUsageSummary: (organizationId: string) => Promise<{
      calls: UsageCheckResult;
      generations: UsageCheckResult;
      tasks: UsageCheckResult;
    } | null>;
  }
}

// =============================================================================
// Exports
// =============================================================================

export function getPlanUsageService(): PlanUsageService | null {
  return planUsageService;
}
