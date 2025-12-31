import {
  prisma,
  Prisma,
  type MoveWorkflowType as PrismaMoveWorkflowType,
  type MoveWorkflowStatus as PrismaMoveWorkflowStatus,
  type MoveChecklistItemStatus as PrismaChecklistItemStatus,
  type MoveConditionRating as PrismaConditionRating,
  type MoveKeyType as PrismaMoveKeyType,
  type MoveDepositType as PrismaMoveDepositType,
  type MoveDepositStatus as PrismaMoveDepositStatus,
  type MoveUtilityTransferStatus as PrismaUtilityTransferStatus,
} from '@realriches/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

type WorkflowType = 'move_in' | 'move_out';
type WorkflowStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
type ChecklistItemStatus = 'pending' | 'completed' | 'skipped' | 'failed';
type ConditionRating = 'excellent' | 'good' | 'fair' | 'poor' | 'damaged';
type KeyType = 'unit' | 'mailbox' | 'garage' | 'storage' | 'amenity' | 'fob' | 'other';
type DepositStatus = 'held' | 'partial_refund' | 'full_refund' | 'forfeited';

interface MoveWorkflow {
  id: string;
  leaseId: string;
  propertyId: string;
  unitId: string;
  tenantId: string;
  type: WorkflowType;
  status: WorkflowStatus;
  scheduledDate: string;
  completedDate?: string;
  inspectorId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface ChecklistTemplate {
  id: string;
  name: string;
  type: WorkflowType;
  propertyId?: string;
  items: ChecklistTemplateItem[];
  isActive: boolean;
  createdAt: string;
}

interface ChecklistTemplateItem {
  id: string;
  category: string;
  description: string;
  isRequired: boolean;
  order: number;
}

interface ChecklistItem {
  id: string;
  workflowId: string;
  templateItemId?: string;
  category: string;
  description: string;
  status: ChecklistItemStatus;
  completedAt?: string;
  completedBy?: string;
  notes?: string;
  photos: string[];
  isRequired: boolean;
  order: number;
}

interface ConditionReport {
  id: string;
  workflowId: string;
  room: string;
  area: string;
  conditionIn?: ConditionRating;
  conditionOut?: ConditionRating;
  notesIn?: string;
  notesOut?: string;
  photosIn: string[];
  photosOut: string[];
  damageDescription?: string;
  estimatedRepairCost?: number;
  createdAt: string;
  updatedAt: string;
}

interface KeyRecord {
  id: string;
  propertyId: string;
  unitId: string;
  keyType: KeyType;
  keyNumber: string;
  quantity: number;
  issuedTo?: string;
  issuedDate?: string;
  returnedDate?: string;
  notes?: string;
  createdAt: string;
}

interface DepositRecord {
  id: string;
  leaseId: string;
  tenantId: string;
  amount: number;
  depositType: 'security' | 'pet' | 'last_month' | 'key' | 'other';
  status: DepositStatus;
  heldInAccount?: string;
  interestAccrued: number;
  deductions: DepositDeduction[];
  refundAmount?: number;
  refundDate?: string;
  refundMethod?: 'check' | 'ach' | 'credit';
  itemizationSentDate?: string;
  createdAt: string;
  updatedAt: string;
}

interface DepositDeduction {
  id: string;
  depositId: string;
  category: string;
  description: string;
  amount: number;
  invoiceId?: string;
  photos: string[];
  createdAt: string;
}

interface UtilityTransfer {
  id: string;
  workflowId: string;
  utilityType: string;
  accountNumber?: string;
  provider: string;
  transferDate: string;
  status: 'pending' | 'scheduled' | 'completed' | 'failed';
  confirmationNumber?: string;
  notes?: string;
  createdAt: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

export function calculateDepositRefund(
  deposit: { amount: number; interestAccrued: number },
  deductions: { amount: number }[]
): { totalDeductions: number; refundAmount: number; refundPercentage: number } {
  const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
  const refundAmount = Math.max(0, deposit.amount + deposit.interestAccrued - totalDeductions);
  const refundPercentage = deposit.amount > 0 ? (refundAmount / deposit.amount) * 100 : 0;

  return {
    totalDeductions,
    refundAmount,
    refundPercentage,
  };
}

export function generateChecklistFromTemplate(
  template: { items: ChecklistTemplateItem[] },
  workflowId: string
): Omit<ChecklistItem, 'id'>[] {
  return template.items.map((item) => ({
    workflowId,
    templateItemId: item.id,
    category: item.category,
    description: item.description,
    status: 'pending' as ChecklistItemStatus,
    notes: undefined,
    photos: [],
    isRequired: item.isRequired,
    order: item.order,
  }));
}

export function calculateWorkflowProgress(items: { status: ChecklistItemStatus }[]): {
  total: number;
  completed: number;
  pending: number;
  failed: number;
  percentage: number;
} {
  const total = items.length;
  const completed = items.filter((i) => i.status === 'completed' || i.status === 'skipped').length;
  const pending = items.filter((i) => i.status === 'pending').length;
  const failed = items.filter((i) => i.status === 'failed').length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, pending, failed, percentage };
}

export function compareConditions(
  conditionIn: ConditionRating,
  conditionOut: ConditionRating
): { degraded: boolean; severity: 'none' | 'minor' | 'moderate' | 'severe' } {
  const ratings: Record<ConditionRating, number> = {
    excellent: 5,
    good: 4,
    fair: 3,
    poor: 2,
    damaged: 1,
  };

  const diff = ratings[conditionIn] - ratings[conditionOut];

  if (diff <= 0) {
    return { degraded: false, severity: 'none' };
  } else if (diff === 1) {
    return { degraded: true, severity: 'minor' };
  } else if (diff === 2) {
    return { degraded: true, severity: 'moderate' };
  } else {
    return { degraded: true, severity: 'severe' };
  }
}

export function generateDepositItemization(
  deposit: { amount: number; interestAccrued: number },
  deductions: { category: string; description: string; amount: number }[]
): {
  depositAmount: number;
  interestAccrued: number;
  deductionItems: Array<{ category: string; description: string; amount: number }>;
  totalDeductions: number;
  refundAmount: number;
} {
  const deductionItems = deductions.map((d) => ({
    category: d.category,
    description: d.description,
    amount: d.amount,
  }));

  const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
  const refundAmount = Math.max(0, deposit.amount + deposit.interestAccrued - totalDeductions);

  return {
    depositAmount: deposit.amount,
    interestAccrued: deposit.interestAccrued,
    deductionItems,
    totalDeductions,
    refundAmount,
  };
}

export function getDepositDeadline(moveOutDate: string, stateDays: number = 30): string {
  const date = new Date(moveOutDate);
  date.setDate(date.getDate() + stateDays);
  return date.toISOString().split('T')[0];
}

// ============================================================================
// SCHEMAS
// ============================================================================

const WorkflowSchema = z.object({
  leaseId: z.string().uuid(),
  propertyId: z.string().uuid(),
  unitId: z.string().uuid(),
  tenantId: z.string().uuid(),
  type: z.enum(['move_in', 'move_out']),
  scheduledDate: z.string(),
  inspectorId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const ChecklistTemplateSchema = z.object({
  name: z.string(),
  type: z.enum(['move_in', 'move_out']),
  propertyId: z.string().uuid().optional(),
  items: z.array(
    z.object({
      category: z.string(),
      description: z.string(),
      isRequired: z.boolean().default(true),
      order: z.number(),
    })
  ),
});

const ChecklistItemUpdateSchema = z.object({
  status: z.enum(['pending', 'completed', 'skipped', 'failed']).optional(),
  notes: z.string().optional(),
  photos: z.array(z.string()).optional(),
});

const ConditionReportSchema = z.object({
  workflowId: z.string().uuid(),
  room: z.string(),
  area: z.string(),
  conditionIn: z.enum(['excellent', 'good', 'fair', 'poor', 'damaged']).optional(),
  conditionOut: z.enum(['excellent', 'good', 'fair', 'poor', 'damaged']).optional(),
  notesIn: z.string().optional(),
  notesOut: z.string().optional(),
  photosIn: z.array(z.string()).default([]),
  photosOut: z.array(z.string()).default([]),
  damageDescription: z.string().optional(),
  estimatedRepairCost: z.number().optional(),
});

const KeyRecordSchema = z.object({
  propertyId: z.string().uuid(),
  unitId: z.string().uuid(),
  keyType: z.enum(['unit', 'mailbox', 'garage', 'storage', 'amenity', 'fob', 'other']),
  keyNumber: z.string(),
  quantity: z.number().default(1),
  notes: z.string().optional(),
});

const KeyIssueSchema = z.object({
  issuedTo: z.string().uuid(),
});

const DepositSchema = z.object({
  leaseId: z.string().uuid(),
  tenantId: z.string().uuid(),
  amount: z.number(),
  depositType: z.enum(['security', 'pet', 'last_month', 'key', 'other']),
  heldInAccount: z.string().optional(),
});

const DeductionSchema = z.object({
  depositId: z.string().uuid(),
  category: z.string(),
  description: z.string(),
  amount: z.number(),
  invoiceId: z.string().uuid().optional(),
  photos: z.array(z.string()).default([]),
});

const DepositRefundSchema = z.object({
  refundMethod: z.enum(['check', 'ach', 'credit']),
});

const UtilityTransferSchema = z.object({
  workflowId: z.string().uuid(),
  utilityType: z.string(),
  accountNumber: z.string().optional(),
  provider: z.string(),
  transferDate: z.string(),
  notes: z.string().optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

export async function moveWorkflowRoutes(app: FastifyInstance): Promise<void> {
  // ─────────────────────────────────────────────────────────────────────────
  // WORKFLOWS
  // ─────────────────────────────────────────────────────────────────────────

  // Create workflow
  app.post(
    '/',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof WorkflowSchema> }>,
      reply
    ) => {
      const data = WorkflowSchema.parse(request.body);

      const workflow = await prisma.moveWorkflow.create({
        data: {
          leaseId: data.leaseId,
          propertyId: data.propertyId,
          unitId: data.unitId,
          tenantId: data.tenantId,
          type: data.type as PrismaMoveWorkflowType,
          status: 'pending' as PrismaMoveWorkflowStatus,
          scheduledDate: new Date(data.scheduledDate),
          inspectorId: data.inspectorId,
          notes: data.notes,
        },
      });

      // Auto-generate checklist from template if available
      const template = await prisma.moveChecklistTemplate.findFirst({
        where: {
          type: data.type as PrismaMoveWorkflowType,
          isActive: true,
          OR: [
            { propertyId: null },
            { propertyId: data.propertyId },
          ],
        },
        orderBy: { propertyId: 'desc' }, // Prefer property-specific template
      });

      if (template) {
        const templateItems = (template.items || []) as ChecklistTemplateItem[];
        const checklistData = templateItems.map((item, index) => ({
          workflowId: workflow.id,
          templateItemId: item.id,
          category: item.category,
          description: item.description,
          status: 'pending' as PrismaChecklistItemStatus,
          photos: [],
          isRequired: item.isRequired,
          order: item.order ?? index,
        }));

        if (checklistData.length > 0) {
          await prisma.moveChecklistItem.createMany({
            data: checklistData,
          });
        }
      }

      return reply.status(201).send({
        id: workflow.id,
        leaseId: workflow.leaseId,
        propertyId: workflow.propertyId,
        unitId: workflow.unitId,
        tenantId: workflow.tenantId,
        type: workflow.type,
        status: workflow.status,
        scheduledDate: workflow.scheduledDate.toISOString(),
        inspectorId: workflow.inspectorId,
        notes: workflow.notes,
        createdAt: workflow.createdAt.toISOString(),
        updatedAt: workflow.updatedAt.toISOString(),
      });
    }
  );

  // List workflows
  app.get(
    '/',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; type?: string; status?: string };
      }>,
      reply
    ) => {
      const { propertyId, type, status } = request.query;

      const where: Prisma.MoveWorkflowWhereInput = {};
      if (propertyId) where.propertyId = propertyId;
      if (type) where.type = type as PrismaMoveWorkflowType;
      if (status) where.status = status as PrismaMoveWorkflowStatus;

      const workflows = await prisma.moveWorkflow.findMany({
        where,
        include: { checklistItems: true },
        orderBy: { createdAt: 'desc' },
      });

      const workflowsWithProgress = workflows.map((w) => ({
        id: w.id,
        leaseId: w.leaseId,
        propertyId: w.propertyId,
        unitId: w.unitId,
        tenantId: w.tenantId,
        type: w.type,
        status: w.status,
        scheduledDate: w.scheduledDate.toISOString(),
        completedDate: w.completedDate?.toISOString(),
        inspectorId: w.inspectorId,
        notes: w.notes,
        createdAt: w.createdAt.toISOString(),
        updatedAt: w.updatedAt.toISOString(),
        progress: calculateWorkflowProgress(
          w.checklistItems.map((i) => ({ status: i.status as ChecklistItemStatus }))
        ),
      }));

      return reply.send({ workflows: workflowsWithProgress });
    }
  );

  // Get workflow
  app.get(
    '/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const workflow = await prisma.moveWorkflow.findUnique({
        where: { id: request.params.id },
        include: {
          checklistItems: { orderBy: { order: 'asc' } },
          conditionReports: true,
          utilityTransfers: true,
        },
      });

      if (!workflow) {
        return reply.status(404).send({ error: 'Workflow not found' });
      }

      const checklist = workflow.checklistItems.map((i) => ({
        id: i.id,
        workflowId: i.workflowId,
        templateItemId: i.templateItemId,
        category: i.category,
        description: i.description,
        status: i.status,
        completedAt: i.completedAt?.toISOString(),
        completedBy: i.completedBy,
        notes: i.notes,
        photos: i.photos,
        isRequired: i.isRequired,
        order: i.order,
      }));

      const conditionReports = workflow.conditionReports.map((c) => ({
        id: c.id,
        workflowId: c.workflowId,
        room: c.room,
        area: c.area,
        conditionIn: c.conditionIn,
        conditionOut: c.conditionOut,
        notesIn: c.notesIn,
        notesOut: c.notesOut,
        photosIn: c.photosIn,
        photosOut: c.photosOut,
        damageDescription: c.damageDescription,
        estimatedRepairCost: c.estimatedRepairCost ? toNumber(c.estimatedRepairCost) : undefined,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      }));

      const utilityTransfers = workflow.utilityTransfers.map((t) => ({
        id: t.id,
        workflowId: t.workflowId,
        utilityType: t.utilityType,
        accountNumber: t.accountNumber,
        provider: t.provider,
        transferDate: t.transferDate.toISOString(),
        status: t.status,
        confirmationNumber: t.confirmationNumber,
        notes: t.notes,
        createdAt: t.createdAt.toISOString(),
      }));

      return reply.send({
        id: workflow.id,
        leaseId: workflow.leaseId,
        propertyId: workflow.propertyId,
        unitId: workflow.unitId,
        tenantId: workflow.tenantId,
        type: workflow.type,
        status: workflow.status,
        scheduledDate: workflow.scheduledDate.toISOString(),
        completedDate: workflow.completedDate?.toISOString(),
        inspectorId: workflow.inspectorId,
        notes: workflow.notes,
        createdAt: workflow.createdAt.toISOString(),
        updatedAt: workflow.updatedAt.toISOString(),
        progress: calculateWorkflowProgress(
          workflow.checklistItems.map((i) => ({ status: i.status as ChecklistItemStatus }))
        ),
        checklist,
        conditionReports,
        utilityTransfers,
      });
    }
  );

  // Update workflow status
  app.patch(
    '/:id/status',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { status: WorkflowStatus };
      }>,
      reply
    ) => {
      const workflow = await prisma.moveWorkflow.findUnique({
        where: { id: request.params.id },
      });

      if (!workflow) {
        return reply.status(404).send({ error: 'Workflow not found' });
      }

      const updateData: Prisma.MoveWorkflowUpdateInput = {
        status: request.body.status as PrismaMoveWorkflowStatus,
      };

      if (request.body.status === 'completed') {
        updateData.completedDate = new Date();
      }

      const updated = await prisma.moveWorkflow.update({
        where: { id: request.params.id },
        data: updateData,
      });

      return reply.send({
        id: updated.id,
        leaseId: updated.leaseId,
        propertyId: updated.propertyId,
        unitId: updated.unitId,
        tenantId: updated.tenantId,
        type: updated.type,
        status: updated.status,
        scheduledDate: updated.scheduledDate.toISOString(),
        completedDate: updated.completedDate?.toISOString(),
        inspectorId: updated.inspectorId,
        notes: updated.notes,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // CHECKLIST TEMPLATES
  // ─────────────────────────────────────────────────────────────────────────

  // Create checklist template
  app.post(
    '/templates',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof ChecklistTemplateSchema> }>,
      reply
    ) => {
      const data = ChecklistTemplateSchema.parse(request.body);

      const templateItems = data.items.map((item, index) => ({
        id: `tpli_${Date.now()}_${index}`,
        ...item,
      }));

      const template = await prisma.moveChecklistTemplate.create({
        data: {
          name: data.name,
          type: data.type as PrismaMoveWorkflowType,
          propertyId: data.propertyId,
          items: templateItems as unknown as Prisma.JsonValue,
          isActive: true,
        },
      });

      return reply.status(201).send({
        id: template.id,
        name: template.name,
        type: template.type,
        propertyId: template.propertyId,
        items: templateItems,
        isActive: template.isActive,
        createdAt: template.createdAt.toISOString(),
      });
    }
  );

  // List templates
  app.get(
    '/templates',
    async (
      request: FastifyRequest<{ Querystring: { type?: string } }>,
      reply
    ) => {
      const where: Prisma.MoveChecklistTemplateWhereInput = {};
      if (request.query.type) {
        where.type = request.query.type as PrismaMoveWorkflowType;
      }

      const templates = await prisma.moveChecklistTemplate.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      const results = templates.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        propertyId: t.propertyId,
        items: t.items as ChecklistTemplateItem[],
        isActive: t.isActive,
        createdAt: t.createdAt.toISOString(),
      }));

      return reply.send({ templates: results });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // CHECKLIST ITEMS
  // ─────────────────────────────────────────────────────────────────────────

  // Update checklist item
  app.patch(
    '/:workflowId/checklist/:itemId',
    async (
      request: FastifyRequest<{
        Params: { workflowId: string; itemId: string };
        Body: z.infer<typeof ChecklistItemUpdateSchema>;
      }>,
      reply
    ) => {
      const item = await prisma.moveChecklistItem.findUnique({
        where: { id: request.params.itemId },
      });

      if (!item || item.workflowId !== request.params.workflowId) {
        return reply.status(404).send({ error: 'Checklist item not found' });
      }

      const updates = ChecklistItemUpdateSchema.parse(request.body);
      const updateData: Prisma.MoveChecklistItemUpdateInput = {};

      if (updates.status) {
        updateData.status = updates.status as PrismaChecklistItemStatus;
        if (updates.status === 'completed') {
          updateData.completedAt = new Date();
        }
      }
      if (updates.notes !== undefined) updateData.notes = updates.notes;
      if (updates.photos) updateData.photos = updates.photos;

      const updated = await prisma.moveChecklistItem.update({
        where: { id: item.id },
        data: updateData,
      });

      return reply.send({
        id: updated.id,
        workflowId: updated.workflowId,
        templateItemId: updated.templateItemId,
        category: updated.category,
        description: updated.description,
        status: updated.status,
        completedAt: updated.completedAt?.toISOString(),
        completedBy: updated.completedBy,
        notes: updated.notes,
        photos: updated.photos,
        isRequired: updated.isRequired,
        order: updated.order,
      });
    }
  );

  // Add custom checklist item
  app.post(
    '/:workflowId/checklist',
    async (
      request: FastifyRequest<{
        Params: { workflowId: string };
        Body: { category: string; description: string; isRequired?: boolean };
      }>,
      reply
    ) => {
      const workflow = await prisma.moveWorkflow.findUnique({
        where: { id: request.params.workflowId },
        include: { checklistItems: true },
      });

      if (!workflow) {
        return reply.status(404).send({ error: 'Workflow not found' });
      }

      const item = await prisma.moveChecklistItem.create({
        data: {
          workflowId: workflow.id,
          category: request.body.category,
          description: request.body.description,
          status: 'pending' as PrismaChecklistItemStatus,
          photos: [],
          isRequired: request.body.isRequired ?? false,
          order: workflow.checklistItems.length + 1,
        },
      });

      return reply.status(201).send({
        id: item.id,
        workflowId: item.workflowId,
        templateItemId: item.templateItemId,
        category: item.category,
        description: item.description,
        status: item.status,
        photos: item.photos,
        isRequired: item.isRequired,
        order: item.order,
      });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // CONDITION REPORTS
  // ─────────────────────────────────────────────────────────────────────────

  // Create/Update condition report
  app.post(
    '/conditions',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof ConditionReportSchema> }>,
      reply
    ) => {
      const data = ConditionReportSchema.parse(request.body);

      // Check if report exists for this room/area
      const existing = await prisma.moveConditionReport.findFirst({
        where: {
          workflowId: data.workflowId,
          room: data.room,
          area: data.area,
        },
      });

      if (existing) {
        // Update existing
        const updated = await prisma.moveConditionReport.update({
          where: { id: existing.id },
          data: {
            conditionIn: data.conditionIn as PrismaConditionRating | undefined,
            conditionOut: data.conditionOut as PrismaConditionRating | undefined,
            notesIn: data.notesIn,
            notesOut: data.notesOut,
            photosIn: data.photosIn,
            photosOut: data.photosOut,
            damageDescription: data.damageDescription,
            estimatedRepairCost: data.estimatedRepairCost,
          },
        });

        return reply.send({
          id: updated.id,
          workflowId: updated.workflowId,
          room: updated.room,
          area: updated.area,
          conditionIn: updated.conditionIn,
          conditionOut: updated.conditionOut,
          notesIn: updated.notesIn,
          notesOut: updated.notesOut,
          photosIn: updated.photosIn,
          photosOut: updated.photosOut,
          damageDescription: updated.damageDescription,
          estimatedRepairCost: updated.estimatedRepairCost ? toNumber(updated.estimatedRepairCost) : undefined,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        });
      }

      const report = await prisma.moveConditionReport.create({
        data: {
          workflowId: data.workflowId,
          room: data.room,
          area: data.area,
          conditionIn: data.conditionIn as PrismaConditionRating | undefined,
          conditionOut: data.conditionOut as PrismaConditionRating | undefined,
          notesIn: data.notesIn,
          notesOut: data.notesOut,
          photosIn: data.photosIn,
          photosOut: data.photosOut,
          damageDescription: data.damageDescription,
          estimatedRepairCost: data.estimatedRepairCost,
        },
      });

      return reply.status(201).send({
        id: report.id,
        workflowId: report.workflowId,
        room: report.room,
        area: report.area,
        conditionIn: report.conditionIn,
        conditionOut: report.conditionOut,
        notesIn: report.notesIn,
        notesOut: report.notesOut,
        photosIn: report.photosIn,
        photosOut: report.photosOut,
        damageDescription: report.damageDescription,
        estimatedRepairCost: report.estimatedRepairCost ? toNumber(report.estimatedRepairCost) : undefined,
        createdAt: report.createdAt.toISOString(),
        updatedAt: report.updatedAt.toISOString(),
      });
    }
  );

  // Get condition comparison
  app.get(
    '/:workflowId/conditions/compare',
    async (request: FastifyRequest<{ Params: { workflowId: string } }>, reply) => {
      const conditions = await prisma.moveConditionReport.findMany({
        where: { workflowId: request.params.workflowId },
      });

      const comparison = conditions
        .filter((c) => c.conditionIn && c.conditionOut)
        .map((c) => ({
          room: c.room,
          area: c.area,
          conditionIn: c.conditionIn,
          conditionOut: c.conditionOut,
          ...compareConditions(c.conditionIn as ConditionRating, c.conditionOut as ConditionRating),
          damageDescription: c.damageDescription,
          estimatedRepairCost: c.estimatedRepairCost ? toNumber(c.estimatedRepairCost) : undefined,
        }));

      const totalEstimatedCost = comparison
        .filter((c) => c.degraded && c.estimatedRepairCost)
        .reduce((sum, c) => sum + (c.estimatedRepairCost || 0), 0);

      return reply.send({
        items: comparison,
        summary: {
          totalAreas: comparison.length,
          degradedAreas: comparison.filter((c) => c.degraded).length,
          severityBreakdown: {
            minor: comparison.filter((c) => c.severity === 'minor').length,
            moderate: comparison.filter((c) => c.severity === 'moderate').length,
            severe: comparison.filter((c) => c.severity === 'severe').length,
          },
          totalEstimatedCost,
        },
      });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // KEY MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────

  // Create key record
  app.post(
    '/keys',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof KeyRecordSchema> }>,
      reply
    ) => {
      const data = KeyRecordSchema.parse(request.body);

      const key = await prisma.moveKeyRecord.create({
        data: {
          propertyId: data.propertyId,
          unitId: data.unitId,
          keyType: data.keyType as PrismaMoveKeyType,
          keyNumber: data.keyNumber,
          quantity: data.quantity,
          notes: data.notes,
        },
      });

      return reply.status(201).send({
        id: key.id,
        propertyId: key.propertyId,
        unitId: key.unitId,
        keyType: key.keyType,
        keyNumber: key.keyNumber,
        quantity: key.quantity,
        issuedTo: key.issuedTo,
        issuedDate: key.issuedDate?.toISOString(),
        returnedDate: key.returnedDate?.toISOString(),
        notes: key.notes,
        createdAt: key.createdAt.toISOString(),
      });
    }
  );

  // List keys for unit
  app.get(
    '/keys',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; unitId?: string; available?: string };
      }>,
      reply
    ) => {
      const where: Prisma.MoveKeyRecordWhereInput = {};

      if (request.query.propertyId) {
        where.propertyId = request.query.propertyId;
      }
      if (request.query.unitId) {
        where.unitId = request.query.unitId;
      }
      if (request.query.available === 'true') {
        where.OR = [
          { issuedTo: null },
          { returnedDate: { not: null } },
        ];
      }

      const keys = await prisma.moveKeyRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      const results = keys.map((k) => ({
        id: k.id,
        propertyId: k.propertyId,
        unitId: k.unitId,
        keyType: k.keyType,
        keyNumber: k.keyNumber,
        quantity: k.quantity,
        issuedTo: k.issuedTo,
        issuedDate: k.issuedDate?.toISOString(),
        returnedDate: k.returnedDate?.toISOString(),
        notes: k.notes,
        createdAt: k.createdAt.toISOString(),
      }));

      return reply.send({ keys: results });
    }
  );

  // Issue key
  app.post(
    '/keys/:id/issue',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof KeyIssueSchema>;
      }>,
      reply
    ) => {
      const key = await prisma.moveKeyRecord.findUnique({
        where: { id: request.params.id },
      });

      if (!key) {
        return reply.status(404).send({ error: 'Key not found' });
      }

      const data = KeyIssueSchema.parse(request.body);
      const updated = await prisma.moveKeyRecord.update({
        where: { id: key.id },
        data: {
          issuedTo: data.issuedTo,
          issuedDate: new Date(),
          returnedDate: null,
        },
      });

      return reply.send({
        id: updated.id,
        propertyId: updated.propertyId,
        unitId: updated.unitId,
        keyType: updated.keyType,
        keyNumber: updated.keyNumber,
        quantity: updated.quantity,
        issuedTo: updated.issuedTo,
        issuedDate: updated.issuedDate?.toISOString(),
        returnedDate: updated.returnedDate?.toISOString(),
        notes: updated.notes,
        createdAt: updated.createdAt.toISOString(),
      });
    }
  );

  // Return key
  app.post(
    '/keys/:id/return',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const key = await prisma.moveKeyRecord.findUnique({
        where: { id: request.params.id },
      });

      if (!key) {
        return reply.status(404).send({ error: 'Key not found' });
      }

      const updated = await prisma.moveKeyRecord.update({
        where: { id: key.id },
        data: { returnedDate: new Date() },
      });

      return reply.send({
        id: updated.id,
        propertyId: updated.propertyId,
        unitId: updated.unitId,
        keyType: updated.keyType,
        keyNumber: updated.keyNumber,
        quantity: updated.quantity,
        issuedTo: updated.issuedTo,
        issuedDate: updated.issuedDate?.toISOString(),
        returnedDate: updated.returnedDate?.toISOString(),
        notes: updated.notes,
        createdAt: updated.createdAt.toISOString(),
      });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SECURITY DEPOSITS
  // ─────────────────────────────────────────────────────────────────────────

  // Create deposit
  app.post(
    '/deposits',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof DepositSchema> }>,
      reply
    ) => {
      const data = DepositSchema.parse(request.body);

      const deposit = await prisma.moveDepositRecord.create({
        data: {
          leaseId: data.leaseId,
          tenantId: data.tenantId,
          amount: data.amount,
          depositType: data.depositType as PrismaMoveDepositType,
          status: 'held' as PrismaMoveDepositStatus,
          heldInAccount: data.heldInAccount,
          interestAccrued: 0,
        },
      });

      return reply.status(201).send({
        id: deposit.id,
        leaseId: deposit.leaseId,
        tenantId: deposit.tenantId,
        amount: toNumber(deposit.amount),
        depositType: deposit.depositType,
        status: deposit.status,
        heldInAccount: deposit.heldInAccount,
        interestAccrued: toNumber(deposit.interestAccrued),
        deductions: [],
        createdAt: deposit.createdAt.toISOString(),
        updatedAt: deposit.updatedAt.toISOString(),
      });
    }
  );

  // Get deposit
  app.get(
    '/deposits/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const deposit = await prisma.moveDepositRecord.findUnique({
        where: { id: request.params.id },
        include: { deductions: true },
      });

      if (!deposit) {
        return reply.status(404).send({ error: 'Deposit not found' });
      }

      const deductions = deposit.deductions.map((d) => ({
        id: d.id,
        depositId: d.depositId,
        category: d.category,
        description: d.description,
        amount: toNumber(d.amount),
        invoiceId: d.invoiceId,
        photos: d.photos,
        createdAt: d.createdAt.toISOString(),
      }));

      const refundCalc = calculateDepositRefund(
        { amount: toNumber(deposit.amount), interestAccrued: toNumber(deposit.interestAccrued) },
        deductions
      );

      return reply.send({
        id: deposit.id,
        leaseId: deposit.leaseId,
        tenantId: deposit.tenantId,
        amount: toNumber(deposit.amount),
        depositType: deposit.depositType,
        status: deposit.status,
        heldInAccount: deposit.heldInAccount,
        interestAccrued: toNumber(deposit.interestAccrued),
        refundAmount: deposit.refundAmount ? toNumber(deposit.refundAmount) : undefined,
        refundDate: deposit.refundDate?.toISOString(),
        refundMethod: deposit.refundMethod,
        itemizationSentDate: deposit.itemizationSentDate?.toISOString(),
        createdAt: deposit.createdAt.toISOString(),
        updatedAt: deposit.updatedAt.toISOString(),
        deductions,
        calculation: refundCalc,
      });
    }
  );

  // List deposits for lease
  app.get(
    '/deposits',
    async (
      request: FastifyRequest<{
        Querystring: { leaseId?: string; tenantId?: string; status?: string };
      }>,
      reply
    ) => {
      const where: Prisma.MoveDepositRecordWhereInput = {};

      if (request.query.leaseId) {
        where.leaseId = request.query.leaseId;
      }
      if (request.query.tenantId) {
        where.tenantId = request.query.tenantId;
      }
      if (request.query.status) {
        where.status = request.query.status as PrismaMoveDepositStatus;
      }

      const deposits = await prisma.moveDepositRecord.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      const results = deposits.map((d) => ({
        id: d.id,
        leaseId: d.leaseId,
        tenantId: d.tenantId,
        amount: toNumber(d.amount),
        depositType: d.depositType,
        status: d.status,
        heldInAccount: d.heldInAccount,
        interestAccrued: toNumber(d.interestAccrued),
        refundAmount: d.refundAmount ? toNumber(d.refundAmount) : undefined,
        refundDate: d.refundDate?.toISOString(),
        refundMethod: d.refundMethod,
        itemizationSentDate: d.itemizationSentDate?.toISOString(),
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
      }));

      return reply.send({ deposits: results });
    }
  );

  // Add deduction
  app.post(
    '/deposits/:id/deductions',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: Omit<z.infer<typeof DeductionSchema>, 'depositId'>;
      }>,
      reply
    ) => {
      const deposit = await prisma.moveDepositRecord.findUnique({
        where: { id: request.params.id },
      });

      if (!deposit) {
        return reply.status(404).send({ error: 'Deposit not found' });
      }

      const data = DeductionSchema.parse({
        ...request.body,
        depositId: deposit.id,
      });

      const deduction = await prisma.moveDepositDeduction.create({
        data: {
          depositId: deposit.id,
          category: data.category,
          description: data.description,
          amount: data.amount,
          invoiceId: data.invoiceId,
          photos: data.photos,
        },
      });

      return reply.status(201).send({
        id: deduction.id,
        depositId: deduction.depositId,
        category: deduction.category,
        description: deduction.description,
        amount: toNumber(deduction.amount),
        invoiceId: deduction.invoiceId,
        photos: deduction.photos,
        createdAt: deduction.createdAt.toISOString(),
      });
    }
  );

  // Generate itemization
  app.get(
    '/deposits/:id/itemization',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const deposit = await prisma.moveDepositRecord.findUnique({
        where: { id: request.params.id },
        include: { deductions: true },
      });

      if (!deposit) {
        return reply.status(404).send({ error: 'Deposit not found' });
      }

      const deductions = deposit.deductions.map((d) => ({
        category: d.category,
        description: d.description,
        amount: toNumber(d.amount),
      }));

      const itemization = generateDepositItemization(
        { amount: toNumber(deposit.amount), interestAccrued: toNumber(deposit.interestAccrued) },
        deductions
      );

      return reply.send(itemization);
    }
  );

  // Process refund
  app.post(
    '/deposits/:id/refund',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof DepositRefundSchema>;
      }>,
      reply
    ) => {
      const deposit = await prisma.moveDepositRecord.findUnique({
        where: { id: request.params.id },
        include: { deductions: true },
      });

      if (!deposit) {
        return reply.status(404).send({ error: 'Deposit not found' });
      }

      const data = DepositRefundSchema.parse(request.body);
      const deductions = deposit.deductions.map((d) => ({ amount: toNumber(d.amount) }));

      const { refundAmount, totalDeductions } = calculateDepositRefund(
        { amount: toNumber(deposit.amount), interestAccrued: toNumber(deposit.interestAccrued) },
        deductions
      );

      const status: PrismaMoveDepositStatus =
        refundAmount === 0
          ? 'forfeited'
          : totalDeductions > 0
            ? 'partial_refund'
            : 'full_refund';

      const updated = await prisma.moveDepositRecord.update({
        where: { id: deposit.id },
        data: {
          refundAmount,
          refundMethod: data.refundMethod,
          refundDate: new Date(),
          itemizationSentDate: new Date(),
          status,
        },
      });

      return reply.send({
        id: updated.id,
        leaseId: updated.leaseId,
        tenantId: updated.tenantId,
        amount: toNumber(updated.amount),
        depositType: updated.depositType,
        status: updated.status,
        heldInAccount: updated.heldInAccount,
        interestAccrued: toNumber(updated.interestAccrued),
        refundAmount: updated.refundAmount ? toNumber(updated.refundAmount) : undefined,
        refundDate: updated.refundDate?.toISOString(),
        refundMethod: updated.refundMethod,
        itemizationSentDate: updated.itemizationSentDate?.toISOString(),
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // UTILITY TRANSFERS
  // ─────────────────────────────────────────────────────────────────────────

  // Create utility transfer
  app.post(
    '/utilities',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof UtilityTransferSchema> }>,
      reply
    ) => {
      const data = UtilityTransferSchema.parse(request.body);

      const transfer = await prisma.moveUtilityTransfer.create({
        data: {
          workflowId: data.workflowId,
          utilityType: data.utilityType,
          accountNumber: data.accountNumber,
          provider: data.provider,
          transferDate: new Date(data.transferDate),
          status: 'pending' as PrismaUtilityTransferStatus,
          notes: data.notes,
        },
      });

      return reply.status(201).send({
        id: transfer.id,
        workflowId: transfer.workflowId,
        utilityType: transfer.utilityType,
        accountNumber: transfer.accountNumber,
        provider: transfer.provider,
        transferDate: transfer.transferDate.toISOString(),
        status: transfer.status,
        confirmationNumber: transfer.confirmationNumber,
        notes: transfer.notes,
        createdAt: transfer.createdAt.toISOString(),
      });
    }
  );

  // Update utility transfer status
  app.patch(
    '/utilities/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { status: string; confirmationNumber?: string };
      }>,
      reply
    ) => {
      const transfer = await prisma.moveUtilityTransfer.findUnique({
        where: { id: request.params.id },
      });

      if (!transfer) {
        return reply.status(404).send({ error: 'Utility transfer not found' });
      }

      const updated = await prisma.moveUtilityTransfer.update({
        where: { id: transfer.id },
        data: {
          status: request.body.status as PrismaUtilityTransferStatus,
          confirmationNumber: request.body.confirmationNumber,
        },
      });

      return reply.send({
        id: updated.id,
        workflowId: updated.workflowId,
        utilityType: updated.utilityType,
        accountNumber: updated.accountNumber,
        provider: updated.provider,
        transferDate: updated.transferDate.toISOString(),
        status: updated.status,
        confirmationNumber: updated.confirmationNumber,
        notes: updated.notes,
        createdAt: updated.createdAt.toISOString(),
      });
    }
  );
}

