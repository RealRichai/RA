/**
 * Maintenance Workflows Module
 *
 * Vendor assignment rules, SLA tracking, and tenant communication automation.
 * Supports emergency escalation, vendor performance tracking, and cost management.
 */

import { prisma } from '@realriches/database';
import { generatePrefixedId, logger, AppError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Types
// =============================================================================

export type WorkOrderCategory = 'plumbing' | 'electrical' | 'hvac' | 'appliance' | 'structural' | 'pest' | 'safety' | 'other';
export type WorkOrderPriority = 'low' | 'normal' | 'high' | 'emergency';
export type SLAStatus = 'within_sla' | 'at_risk' | 'breached';

interface VendorAssignmentRule {
  id: string;
  userId: string;
  name: string;
  isActive: boolean;
  priority: number; // Lower = higher priority
  conditions: {
    categories: WorkOrderCategory[];
    priorities?: WorkOrderPriority[];
    propertyIds?: string[];
    timeWindow?: {
      startHour: number;
      endHour: number;
      daysOfWeek: number[];
    };
  };
  actions: {
    vendorId: string;
    vendorName: string;
    autoAssign: boolean;
    notifyVendor: boolean;
    notifyTenant: boolean;
    maxBudget?: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface SLADefinition {
  id: string;
  userId: string;
  name: string;
  isActive: boolean;
  conditions: {
    category?: WorkOrderCategory;
    priority: WorkOrderPriority;
  };
  targets: {
    acknowledgeWithinHours: number;
    resolveWithinHours: number;
    escalateAfterHours: number;
  };
  escalation: {
    notifyEmail: string[];
    notifySms?: string[];
    autoReassign: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface WorkOrderSLA {
  workOrderId: string;
  slaDefinitionId: string;
  acknowledgeDeadline: Date;
  resolveDeadline: Date;
  escalationDeadline: Date;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  escalatedAt?: Date;
  status: SLAStatus;
  breachReason?: string;
}

interface VendorPerformance {
  vendorId: string;
  vendorName: string;
  period: { start: Date; end: Date };
  metrics: {
    totalAssigned: number;
    completed: number;
    completionRate: number;
    avgResponseTimeHours: number;
    avgResolutionTimeHours: number;
    slaCompliance: number;
    avgCost: number;
    totalCost: number;
    customerRating: number;
    ratingCount: number;
  };
}

interface CommunicationLog {
  id: string;
  workOrderId: string;
  type: 'email' | 'sms' | 'push' | 'in_app';
  recipient: string;
  recipientType: 'tenant' | 'landlord' | 'vendor';
  templateId: string;
  subject?: string;
  sentAt: Date;
  deliveredAt?: Date;
  openedAt?: Date;
}

// =============================================================================
// In-Memory Storage (would be Prisma in production)
// =============================================================================

const vendorAssignmentRules = new Map<string, VendorAssignmentRule>();
const slaDefinitions = new Map<string, SLADefinition>();
const workOrderSLAs = new Map<string, WorkOrderSLA>();
const communicationLogs = new Map<string, CommunicationLog>();

// =============================================================================
// Schemas
// =============================================================================

const CreateVendorRuleSchema = z.object({
  name: z.string().min(1).max(100),
  priority: z.number().min(1).max(100).default(50),
  conditions: z.object({
    categories: z.array(z.enum(['plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'pest', 'safety', 'other'])),
    priorities: z.array(z.enum(['low', 'normal', 'high', 'emergency'])).optional(),
    propertyIds: z.array(z.string()).optional(),
    timeWindow: z.object({
      startHour: z.number().min(0).max(23),
      endHour: z.number().min(0).max(23),
      daysOfWeek: z.array(z.number().min(0).max(6)),
    }).optional(),
  }),
  actions: z.object({
    vendorId: z.string(),
    vendorName: z.string(),
    autoAssign: z.boolean().default(true),
    notifyVendor: z.boolean().default(true),
    notifyTenant: z.boolean().default(true),
    maxBudget: z.number().min(0).optional(),
  }),
});

const CreateSLASchema = z.object({
  name: z.string().min(1).max(100),
  conditions: z.object({
    category: z.enum(['plumbing', 'electrical', 'hvac', 'appliance', 'structural', 'pest', 'safety', 'other']).optional(),
    priority: z.enum(['low', 'normal', 'high', 'emergency']),
  }),
  targets: z.object({
    acknowledgeWithinHours: z.number().min(0.5).max(168),
    resolveWithinHours: z.number().min(1).max(720),
    escalateAfterHours: z.number().min(1).max(168),
  }),
  escalation: z.object({
    notifyEmail: z.array(z.string().email()),
    notifySms: z.array(z.string()).optional(),
    autoReassign: z.boolean().default(false),
  }),
});

// =============================================================================
// Helper Functions
// =============================================================================

function findMatchingVendorRule(
  rules: VendorAssignmentRule[],
  category: WorkOrderCategory,
  priority: WorkOrderPriority,
  propertyId: string
): VendorAssignmentRule | null {
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();

  const matchingRules = rules
    .filter(r => r.isActive)
    .filter(r => r.conditions.categories.includes(category))
    .filter(r => !r.conditions.priorities || r.conditions.priorities.includes(priority))
    .filter(r => !r.conditions.propertyIds || r.conditions.propertyIds.includes(propertyId))
    .filter(r => {
      if (!r.conditions.timeWindow) return true;
      const tw = r.conditions.timeWindow;
      if (!tw.daysOfWeek.includes(currentDay)) return false;
      if (tw.startHour <= tw.endHour) {
        return currentHour >= tw.startHour && currentHour < tw.endHour;
      } else {
        // Overnight window (e.g., 22:00 - 06:00)
        return currentHour >= tw.startHour || currentHour < tw.endHour;
      }
    })
    .sort((a, b) => a.priority - b.priority);

  return matchingRules[0] || null;
}

function findMatchingSLA(
  slas: SLADefinition[],
  category: WorkOrderCategory,
  priority: WorkOrderPriority
): SLADefinition | null {
  const matchingSLAs = slas
    .filter(s => s.isActive)
    .filter(s => s.conditions.priority === priority)
    .filter(s => !s.conditions.category || s.conditions.category === category);

  return matchingSLAs[0] || null;
}

function calculateSLAStatus(sla: WorkOrderSLA): SLAStatus {
  const now = new Date();

  // If resolved, check if it was within SLA
  if (sla.resolvedAt) {
    return sla.resolvedAt <= sla.resolveDeadline ? 'within_sla' : 'breached';
  }

  // If not acknowledged yet
  if (!sla.acknowledgedAt) {
    if (now > sla.acknowledgeDeadline) return 'breached';
    const timeToDeadline = sla.acknowledgeDeadline.getTime() - now.getTime();
    const totalTime = sla.acknowledgeDeadline.getTime() - (sla.acknowledgeDeadline.getTime() - 2 * 60 * 60 * 1000);
    if (timeToDeadline < totalTime * 0.25) return 'at_risk';
    return 'within_sla';
  }

  // Acknowledged but not resolved
  if (now > sla.resolveDeadline) return 'breached';
  const timeToResolve = sla.resolveDeadline.getTime() - now.getTime();
  const totalResolveTime = sla.resolveDeadline.getTime() - sla.acknowledgedAt.getTime();
  if (timeToResolve < totalResolveTime * 0.25) return 'at_risk';

  return 'within_sla';
}

// =============================================================================
// Routes
// =============================================================================

export async function workflowRoutes(app: FastifyInstance): Promise<void> {
  // ==========================================================================
  // Vendor Assignment Rules
  // ==========================================================================

  // List vendor assignment rules
  app.get(
    '/vendor-rules',
    {
      schema: {
        description: 'List vendor assignment rules',
        tags: ['Maintenance Workflows'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const rules = Array.from(vendorAssignmentRules.values())
        .filter(r => r.userId === request.user!.id)
        .sort((a, b) => a.priority - b.priority);

      return reply.send({
        success: true,
        data: { rules },
      });
    }
  );

  // Create vendor assignment rule
  app.post(
    '/vendor-rules',
    {
      schema: {
        description: 'Create vendor assignment rule',
        tags: ['Maintenance Workflows'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof CreateVendorRuleSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = CreateVendorRuleSchema.parse(request.body);
      const now = new Date();

      const rule: VendorAssignmentRule = {
        id: generatePrefixedId('var'),
        userId: request.user.id,
        name: data.name,
        isActive: true,
        priority: data.priority,
        conditions: {
          categories: data.conditions.categories || [],
          priorities: data.conditions.priorities,
          propertyIds: data.conditions.propertyIds,
          timeWindow: data.conditions.timeWindow ? {
            startHour: data.conditions.timeWindow.startHour ?? 9,
            endHour: data.conditions.timeWindow.endHour ?? 17,
            daysOfWeek: data.conditions.timeWindow.daysOfWeek ?? [1, 2, 3, 4, 5],
          } : undefined,
        },
        actions: {
          vendorId: data.actions.vendorId || '',
          vendorName: data.actions.vendorName || '',
          autoAssign: data.actions.autoAssign ?? false,
          notifyVendor: data.actions.notifyVendor ?? true,
          notifyTenant: data.actions.notifyTenant ?? true,
          maxBudget: data.actions.maxBudget,
        },
        createdAt: now,
        updatedAt: now,
      };

      vendorAssignmentRules.set(rule.id, rule);

      logger.info({ ruleId: rule.id, name: rule.name }, 'Vendor assignment rule created');

      return reply.status(201).send({
        success: true,
        data: { rule },
      });
    }
  );

  // Update vendor rule
  app.patch(
    '/vendor-rules/:ruleId',
    {
      schema: {
        description: 'Update vendor assignment rule',
        tags: ['Maintenance Workflows'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Params: { ruleId: string };
        Body: Partial<z.infer<typeof CreateVendorRuleSchema>> & { isActive?: boolean };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { ruleId } = request.params;
      const rule = vendorAssignmentRules.get(ruleId);

      if (!rule || rule.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Rule not found', 404);
      }

      const updates = request.body;
      if (updates.name) rule.name = updates.name;
      if (updates.priority !== undefined) rule.priority = updates.priority;
      if (updates.conditions) {
        rule.conditions = {
          categories: updates.conditions.categories ?? rule.conditions.categories,
          priorities: updates.conditions.priorities ?? rule.conditions.priorities,
          propertyIds: updates.conditions.propertyIds ?? rule.conditions.propertyIds,
          timeWindow: updates.conditions.timeWindow ? {
            startHour: updates.conditions.timeWindow.startHour ?? rule.conditions.timeWindow?.startHour ?? 9,
            endHour: updates.conditions.timeWindow.endHour ?? rule.conditions.timeWindow?.endHour ?? 17,
            daysOfWeek: updates.conditions.timeWindow.daysOfWeek ?? rule.conditions.timeWindow?.daysOfWeek ?? [1, 2, 3, 4, 5],
          } : rule.conditions.timeWindow,
        };
      }
      if (updates.actions) {
        rule.actions = {
          vendorId: updates.actions.vendorId ?? rule.actions.vendorId,
          vendorName: updates.actions.vendorName ?? rule.actions.vendorName,
          autoAssign: updates.actions.autoAssign ?? rule.actions.autoAssign,
          notifyVendor: updates.actions.notifyVendor ?? rule.actions.notifyVendor,
          notifyTenant: updates.actions.notifyTenant ?? rule.actions.notifyTenant,
          maxBudget: updates.actions.maxBudget ?? rule.actions.maxBudget,
        };
      }
      if (updates.isActive !== undefined) rule.isActive = updates.isActive;
      rule.updatedAt = new Date();

      return reply.send({
        success: true,
        data: { rule },
      });
    }
  );

  // Delete vendor rule
  app.delete(
    '/vendor-rules/:ruleId',
    {
      schema: {
        description: 'Delete vendor assignment rule',
        tags: ['Maintenance Workflows'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { ruleId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { ruleId } = request.params;
      const rule = vendorAssignmentRules.get(ruleId);

      if (!rule || rule.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Rule not found', 404);
      }

      vendorAssignmentRules.delete(ruleId);

      return reply.send({
        success: true,
        message: 'Rule deleted',
      });
    }
  );

  // Test vendor rule matching
  app.post(
    '/vendor-rules/test',
    {
      schema: {
        description: 'Test which vendor rule would match for a given work order',
        tags: ['Maintenance Workflows'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Body: { category: WorkOrderCategory; priority: WorkOrderPriority; propertyId: string };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { category, priority, propertyId } = request.body;
      const userRules = Array.from(vendorAssignmentRules.values())
        .filter(r => r.userId === request.user!.id);

      const matchingRule = findMatchingVendorRule(userRules, category, priority, propertyId);

      return reply.send({
        success: true,
        data: {
          match: matchingRule ? {
            ruleId: matchingRule.id,
            ruleName: matchingRule.name,
            vendorId: matchingRule.actions.vendorId,
            vendorName: matchingRule.actions.vendorName,
            autoAssign: matchingRule.actions.autoAssign,
          } : null,
        },
      });
    }
  );

  // ==========================================================================
  // SLA Definitions
  // ==========================================================================

  // List SLA definitions
  app.get(
    '/sla',
    {
      schema: {
        description: 'List SLA definitions',
        tags: ['Maintenance Workflows'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const slas = Array.from(slaDefinitions.values())
        .filter(s => s.userId === request.user!.id);

      return reply.send({
        success: true,
        data: { slaDefinitions: slas },
      });
    }
  );

  // Create SLA definition
  app.post(
    '/sla',
    {
      schema: {
        description: 'Create SLA definition',
        tags: ['Maintenance Workflows'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof CreateSLASchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = CreateSLASchema.parse(request.body);
      const now = new Date();

      const sla: SLADefinition = {
        id: generatePrefixedId('sla'),
        userId: request.user.id,
        name: data.name,
        isActive: true,
        conditions: {
          category: data.conditions.category,
          priority: data.conditions.priority,
        },
        targets: {
          acknowledgeWithinHours: data.targets.acknowledgeWithinHours,
          resolveWithinHours: data.targets.resolveWithinHours,
          escalateAfterHours: data.targets.escalateAfterHours,
        },
        escalation: {
          notifyEmail: data.escalation.notifyEmail,
          notifySms: data.escalation.notifySms,
          autoReassign: data.escalation.autoReassign ?? false,
        },
        createdAt: now,
        updatedAt: now,
      };

      slaDefinitions.set(sla.id, sla);

      logger.info({ slaId: sla.id, name: sla.name }, 'SLA definition created');

      return reply.status(201).send({
        success: true,
        data: { sla },
      });
    }
  );

  // Delete SLA definition
  app.delete(
    '/sla/:slaId',
    {
      schema: {
        description: 'Delete SLA definition',
        tags: ['Maintenance Workflows'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { slaId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { slaId } = request.params;
      const sla = slaDefinitions.get(slaId);

      if (!sla || sla.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'SLA not found', 404);
      }

      slaDefinitions.delete(slaId);

      return reply.send({
        success: true,
        message: 'SLA deleted',
      });
    }
  );

  // ==========================================================================
  // SLA Tracking
  // ==========================================================================

  // Get SLA status for work orders
  app.get(
    '/sla/status',
    {
      schema: {
        description: 'Get SLA status for active work orders',
        tags: ['Maintenance Workflows'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['within_sla', 'at_risk', 'breached'] },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { status?: SLAStatus } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { status } = request.query;

      let slas = Array.from(workOrderSLAs.values()).map(sla => ({
        ...sla,
        status: calculateSLAStatus(sla),
      }));

      if (status) {
        slas = slas.filter(s => s.status === status);
      }

      const summary = {
        total: slas.length,
        withinSla: slas.filter(s => s.status === 'within_sla').length,
        atRisk: slas.filter(s => s.status === 'at_risk').length,
        breached: slas.filter(s => s.status === 'breached').length,
      };

      return reply.send({
        success: true,
        data: { slas, summary },
      });
    }
  );

  // Acknowledge work order (for SLA tracking)
  app.post(
    '/sla/:workOrderId/acknowledge',
    {
      schema: {
        description: 'Acknowledge work order for SLA tracking',
        tags: ['Maintenance Workflows'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { workOrderId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { workOrderId } = request.params;
      const sla = workOrderSLAs.get(workOrderId);

      if (!sla) {
        throw new AppError('NOT_FOUND', 'SLA tracking not found for this work order', 404);
      }

      if (sla.acknowledgedAt) {
        throw new AppError('INVALID_STATE', 'Work order already acknowledged', 400);
      }

      sla.acknowledgedAt = new Date();
      sla.status = calculateSLAStatus(sla);

      logger.info({ workOrderId }, 'Work order acknowledged for SLA');

      return reply.send({
        success: true,
        data: { sla },
      });
    }
  );

  // ==========================================================================
  // Vendor Performance
  // ==========================================================================

  // Get vendor performance metrics
  app.get(
    '/vendor-performance',
    {
      schema: {
        description: 'Get vendor performance metrics',
        tags: ['Maintenance Workflows'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            vendorId: { type: 'string' },
            periodDays: { type: 'integer', default: 30 },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { vendorId?: string; periodDays?: number } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { vendorId, periodDays = 30 } = request.query;
      const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);
      const endDate = new Date();

      // Get work orders for the period
      const workOrders = await prisma.workOrder.findMany({
        where: {
          unit: {
            property: {
              ownerId: request.user.id,
            },
          },
          createdAt: { gte: startDate },
          ...(vendorId && { vendorId }),
        },
        include: {
          vendor: true,
        },
      });

      // Group by vendor
      const vendorStats = new Map<string, {
        vendorId: string;
        vendorName: string;
        workOrders: typeof workOrders;
      }>();

      for (const wo of workOrders) {
        if (!wo.vendorId) continue;
        const key = wo.vendorId;
        if (!vendorStats.has(key)) {
          vendorStats.set(key, {
            vendorId: wo.vendorId,
            vendorName: wo.vendor?.companyName || 'Unknown',
            workOrders: [],
          });
        }
        vendorStats.get(key)!.workOrders.push(wo);
      }

      const performance: VendorPerformance[] = [];

      for (const [, stats] of vendorStats) {
        const completed = stats.workOrders.filter(wo => wo.status === 'completed');
        const totalCost = completed.reduce((sum, wo) => sum + (wo.actualCost || 0), 0);

        // Calculate response times (using scheduledDate as proxy since acknowledgedAt doesn't exist)
        const responseTimes = stats.workOrders
          .filter(wo => wo.scheduledDate)
          .map(wo => (new Date(wo.scheduledDate!).getTime() - new Date(wo.createdAt).getTime()) / (1000 * 60 * 60));

        const resolutionTimes = completed
          .filter(wo => wo.completedAt)
          .map(wo => (new Date(wo.completedAt!).getTime() - new Date(wo.createdAt).getTime()) / (1000 * 60 * 60));

        performance.push({
          vendorId: stats.vendorId,
          vendorName: stats.vendorName,
          period: { start: startDate, end: endDate },
          metrics: {
            totalAssigned: stats.workOrders.length,
            completed: completed.length,
            completionRate: stats.workOrders.length > 0 ? (completed.length / stats.workOrders.length) * 100 : 0,
            avgResponseTimeHours: responseTimes.length > 0
              ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
              : 0,
            avgResolutionTimeHours: resolutionTimes.length > 0
              ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
              : 0,
            slaCompliance: 85, // Placeholder - would calculate from SLA data
            avgCost: completed.length > 0 ? totalCost / completed.length : 0,
            totalCost,
            customerRating: 4.2, // Placeholder - would come from ratings
            ratingCount: completed.length,
          },
        });
      }

      return reply.send({
        success: true,
        data: { performance },
      });
    }
  );

  // ==========================================================================
  // Communication Logs
  // ==========================================================================

  // Get communication history for a work order
  app.get(
    '/communications/:workOrderId',
    {
      schema: {
        description: 'Get communication history for a work order',
        tags: ['Maintenance Workflows'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { workOrderId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { workOrderId } = request.params;

      const logs = Array.from(communicationLogs.values())
        .filter(l => l.workOrderId === workOrderId)
        .sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());

      return reply.send({
        success: true,
        data: { communications: logs },
      });
    }
  );

  // Send communication
  app.post(
    '/communications',
    {
      schema: {
        description: 'Send communication to tenant/vendor',
        tags: ['Maintenance Workflows'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          workOrderId: string;
          type: 'email' | 'sms' | 'push' | 'in_app';
          recipientType: 'tenant' | 'vendor';
          templateId: string;
          customMessage?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { workOrderId, type, recipientType, templateId } = request.body;

      const workOrder = await prisma.workOrder.findUnique({
        where: { id: workOrderId },
        include: {
          unit: {
            include: {
              property: true,
              leases: {
                where: { status: 'active' },
                include: { primaryTenant: true },
              },
            },
          },
          vendor: true,
        },
      });

      if (!workOrder) {
        throw new AppError('NOT_FOUND', 'Work order not found', 404);
      }

      let recipient = '';
      if (recipientType === 'tenant') {
        const activeLease = workOrder.unit.leases[0];
        recipient = activeLease?.primaryTenant?.email || '';
      } else {
        recipient = workOrder.vendor?.email || '';
      }

      if (!recipient) {
        throw new AppError('VALIDATION_ERROR', `No ${recipientType} contact found`, 400);
      }

      const log: CommunicationLog = {
        id: generatePrefixedId('com'),
        workOrderId,
        type,
        recipient,
        recipientType,
        templateId,
        sentAt: new Date(),
      };

      communicationLogs.set(log.id, log);

      // In production: Actually send the communication
      logger.info({
        communicationId: log.id,
        workOrderId,
        type,
        recipientType,
        recipient,
      }, 'Communication sent');

      return reply.status(201).send({
        success: true,
        data: { communication: log },
      });
    }
  );

  // ==========================================================================
  // Dashboard / Summary
  // ==========================================================================

  // Get workflow dashboard
  app.get(
    '/dashboard',
    {
      schema: {
        description: 'Get maintenance workflow dashboard',
        tags: ['Maintenance Workflows'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      // Get work order counts
      const workOrders = await prisma.workOrder.findMany({
        where: {
          unit: {
            property: {
              ownerId: request.user.id,
            },
          },
        },
        select: {
          status: true,
          priority: true,
          createdAt: true,
        },
      });

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const recentOrders = workOrders.filter(wo => new Date(wo.createdAt) >= thirtyDaysAgo);

      // SLA summary
      const slas = Array.from(workOrderSLAs.values()).map(sla => ({
        ...sla,
        status: calculateSLAStatus(sla),
      }));

      const dashboard = {
        workOrders: {
          total: workOrders.length,
          byStatus: {
            submitted: workOrders.filter(wo => wo.status === 'submitted').length,
            acknowledged: workOrders.filter(wo => wo.status === 'acknowledged').length,
            inProgress: workOrders.filter(wo => wo.status === 'in_progress').length,
            completed: workOrders.filter(wo => wo.status === 'completed').length,
          },
          byPriority: {
            emergency: workOrders.filter(wo => wo.priority === 'emergency').length,
            high: workOrders.filter(wo => wo.priority === 'high').length,
            normal: workOrders.filter(wo => wo.priority === 'normal').length,
            low: workOrders.filter(wo => wo.priority === 'low').length,
          },
          last30Days: recentOrders.length,
        },
        sla: {
          tracked: slas.length,
          withinSla: slas.filter(s => s.status === 'within_sla').length,
          atRisk: slas.filter(s => s.status === 'at_risk').length,
          breached: slas.filter(s => s.status === 'breached').length,
        },
        automation: {
          vendorRules: Array.from(vendorAssignmentRules.values()).filter(r => r.userId === request.user!.id).length,
          slaDefinitions: Array.from(slaDefinitions.values()).filter(s => s.userId === request.user!.id).length,
        },
      };

      return reply.send({
        success: true,
        data: { dashboard },
      });
    }
  );
}

// =============================================================================
// Exports
// =============================================================================

export {
  vendorAssignmentRules,
  slaDefinitions,
  workOrderSLAs,
  communicationLogs,
  findMatchingVendorRule,
  findMatchingSLA,
  calculateSLAStatus,
};
