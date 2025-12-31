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
  propertyId?: string; // null for global templates
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
// IN-MEMORY STORAGE
// ============================================================================

const workflows = new Map<string, MoveWorkflow>();
const checklistTemplates = new Map<string, ChecklistTemplate>();
const checklistItems = new Map<string, ChecklistItem>();
const conditionReports = new Map<string, ConditionReport>();
const keyRecords = new Map<string, KeyRecord>();
const depositRecords = new Map<string, DepositRecord>();
const depositDeductions = new Map<string, DepositDeduction>();
const utilityTransfers = new Map<string, UtilityTransfer>();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function calculateDepositRefund(
  deposit: DepositRecord,
  deductions: DepositDeduction[]
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
  template: ChecklistTemplate,
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

export function calculateWorkflowProgress(items: ChecklistItem[]): {
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
  deposit: DepositRecord,
  deductions: DepositDeduction[]
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
  leaseId: z.string(),
  propertyId: z.string(),
  unitId: z.string(),
  tenantId: z.string(),
  type: z.enum(['move_in', 'move_out']),
  scheduledDate: z.string(),
  inspectorId: z.string().optional(),
  notes: z.string().optional(),
});

const ChecklistTemplateSchema = z.object({
  name: z.string(),
  type: z.enum(['move_in', 'move_out']),
  propertyId: z.string().optional(),
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
  workflowId: z.string(),
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
  propertyId: z.string(),
  unitId: z.string(),
  keyType: z.enum(['unit', 'mailbox', 'garage', 'storage', 'amenity', 'fob', 'other']),
  keyNumber: z.string(),
  quantity: z.number().default(1),
  notes: z.string().optional(),
});

const KeyIssueSchema = z.object({
  issuedTo: z.string(),
});

const DepositSchema = z.object({
  leaseId: z.string(),
  tenantId: z.string(),
  amount: z.number(),
  depositType: z.enum(['security', 'pet', 'last_month', 'key', 'other']),
  heldInAccount: z.string().optional(),
});

const DeductionSchema = z.object({
  depositId: z.string(),
  category: z.string(),
  description: z.string(),
  amount: z.number(),
  invoiceId: z.string().optional(),
  photos: z.array(z.string()).default([]),
});

const DepositRefundSchema = z.object({
  refundMethod: z.enum(['check', 'ach', 'credit']),
});

const UtilityTransferSchema = z.object({
  workflowId: z.string(),
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
      const now = new Date().toISOString();

      const workflow: MoveWorkflow = {
        id: `wf_${Date.now()}`,
        ...data,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };

      workflows.set(workflow.id, workflow);

      // Auto-generate checklist from template if available
      const template = Array.from(checklistTemplates.values()).find(
        (t) => t.type === data.type && t.isActive && (!t.propertyId || t.propertyId === data.propertyId)
      );

      if (template) {
        const items = generateChecklistFromTemplate(template, workflow.id);
        items.forEach((item) => {
          const checklistItem: ChecklistItem = {
            id: `cli_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            ...item,
          };
          checklistItems.set(checklistItem.id, checklistItem);
        });
      }

      return reply.status(201).send(workflow);
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

      let results = Array.from(workflows.values());

      if (propertyId) {
        results = results.filter((w) => w.propertyId === propertyId);
      }
      if (type) {
        results = results.filter((w) => w.type === type);
      }
      if (status) {
        results = results.filter((w) => w.status === status);
      }

      // Add progress to each workflow
      const workflowsWithProgress = results.map((w) => {
        const items = Array.from(checklistItems.values()).filter(
          (i) => i.workflowId === w.id
        );
        return {
          ...w,
          progress: calculateWorkflowProgress(items),
        };
      });

      return reply.send({ workflows: workflowsWithProgress });
    }
  );

  // Get workflow
  app.get(
    '/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const workflow = workflows.get(request.params.id);
      if (!workflow) {
        return reply.status(404).send({ error: 'Workflow not found' });
      }

      const items = Array.from(checklistItems.values()).filter(
        (i) => i.workflowId === workflow.id
      );
      const conditions = Array.from(conditionReports.values()).filter(
        (c) => c.workflowId === workflow.id
      );
      const transfers = Array.from(utilityTransfers.values()).filter(
        (t) => t.workflowId === workflow.id
      );

      return reply.send({
        ...workflow,
        progress: calculateWorkflowProgress(items),
        checklist: items.sort((a, b) => a.order - b.order),
        conditionReports: conditions,
        utilityTransfers: transfers,
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
      const workflow = workflows.get(request.params.id);
      if (!workflow) {
        return reply.status(404).send({ error: 'Workflow not found' });
      }

      workflow.status = request.body.status;
      workflow.updatedAt = new Date().toISOString();

      if (request.body.status === 'completed') {
        workflow.completedDate = new Date().toISOString();
      }

      workflows.set(workflow.id, workflow);
      return reply.send(workflow);
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

      const template: ChecklistTemplate = {
        id: `tpl_${Date.now()}`,
        ...data,
        items: data.items.map((item, index) => ({
          id: `tpli_${Date.now()}_${index}`,
          ...item,
        })),
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      checklistTemplates.set(template.id, template);
      return reply.status(201).send(template);
    }
  );

  // List templates
  app.get(
    '/templates',
    async (
      request: FastifyRequest<{ Querystring: { type?: string } }>,
      reply
    ) => {
      let results = Array.from(checklistTemplates.values());

      if (request.query.type) {
        results = results.filter((t) => t.type === request.query.type);
      }

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
      const item = checklistItems.get(request.params.itemId);
      if (!item || item.workflowId !== request.params.workflowId) {
        return reply.status(404).send({ error: 'Checklist item not found' });
      }

      const updates = ChecklistItemUpdateSchema.parse(request.body);

      if (updates.status) {
        item.status = updates.status;
        if (updates.status === 'completed') {
          item.completedAt = new Date().toISOString();
        }
      }
      if (updates.notes !== undefined) item.notes = updates.notes;
      if (updates.photos) item.photos = updates.photos;

      checklistItems.set(item.id, item);
      return reply.send(item);
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
      const workflow = workflows.get(request.params.workflowId);
      if (!workflow) {
        return reply.status(404).send({ error: 'Workflow not found' });
      }

      const existingItems = Array.from(checklistItems.values()).filter(
        (i) => i.workflowId === workflow.id
      );

      const item: ChecklistItem = {
        id: `cli_${Date.now()}`,
        workflowId: workflow.id,
        category: request.body.category,
        description: request.body.description,
        status: 'pending',
        photos: [],
        isRequired: request.body.isRequired ?? false,
        order: existingItems.length + 1,
      };

      checklistItems.set(item.id, item);
      return reply.status(201).send(item);
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
      const now = new Date().toISOString();

      // Check if report exists for this room/area
      const existing = Array.from(conditionReports.values()).find(
        (r) =>
          r.workflowId === data.workflowId &&
          r.room === data.room &&
          r.area === data.area
      );

      if (existing) {
        // Update existing
        Object.assign(existing, data, { updatedAt: now });
        conditionReports.set(existing.id, existing);
        return reply.send(existing);
      }

      const report: ConditionReport = {
        id: `cr_${Date.now()}`,
        ...data,
        createdAt: now,
        updatedAt: now,
      };

      conditionReports.set(report.id, report);
      return reply.status(201).send(report);
    }
  );

  // Get condition comparison
  app.get(
    '/:workflowId/conditions/compare',
    async (request: FastifyRequest<{ Params: { workflowId: string } }>, reply) => {
      const conditions = Array.from(conditionReports.values()).filter(
        (c) => c.workflowId === request.params.workflowId
      );

      const comparison = conditions
        .filter((c) => c.conditionIn && c.conditionOut)
        .map((c) => ({
          room: c.room,
          area: c.area,
          conditionIn: c.conditionIn,
          conditionOut: c.conditionOut,
          ...compareConditions(c.conditionIn!, c.conditionOut!),
          damageDescription: c.damageDescription,
          estimatedRepairCost: c.estimatedRepairCost,
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

      const key: KeyRecord = {
        id: `key_${Date.now()}`,
        ...data,
        createdAt: new Date().toISOString(),
      };

      keyRecords.set(key.id, key);
      return reply.status(201).send(key);
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
      let results = Array.from(keyRecords.values());

      if (request.query.propertyId) {
        results = results.filter((k) => k.propertyId === request.query.propertyId);
      }
      if (request.query.unitId) {
        results = results.filter((k) => k.unitId === request.query.unitId);
      }
      if (request.query.available === 'true') {
        results = results.filter((k) => !k.issuedTo || k.returnedDate);
      }

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
      const key = keyRecords.get(request.params.id);
      if (!key) {
        return reply.status(404).send({ error: 'Key not found' });
      }

      const data = KeyIssueSchema.parse(request.body);
      key.issuedTo = data.issuedTo;
      key.issuedDate = new Date().toISOString();
      key.returnedDate = undefined;

      keyRecords.set(key.id, key);
      return reply.send(key);
    }
  );

  // Return key
  app.post(
    '/keys/:id/return',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const key = keyRecords.get(request.params.id);
      if (!key) {
        return reply.status(404).send({ error: 'Key not found' });
      }

      key.returnedDate = new Date().toISOString();
      keyRecords.set(key.id, key);
      return reply.send(key);
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
      const now = new Date().toISOString();

      const deposit: DepositRecord = {
        id: `dep_${Date.now()}`,
        ...data,
        status: 'held',
        interestAccrued: 0,
        deductions: [],
        createdAt: now,
        updatedAt: now,
      };

      depositRecords.set(deposit.id, deposit);
      return reply.status(201).send(deposit);
    }
  );

  // Get deposit
  app.get(
    '/deposits/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const deposit = depositRecords.get(request.params.id);
      if (!deposit) {
        return reply.status(404).send({ error: 'Deposit not found' });
      }

      const deductions = Array.from(depositDeductions.values()).filter(
        (d) => d.depositId === deposit.id
      );

      const refundCalc = calculateDepositRefund(deposit, deductions);

      return reply.send({
        ...deposit,
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
      let results = Array.from(depositRecords.values());

      if (request.query.leaseId) {
        results = results.filter((d) => d.leaseId === request.query.leaseId);
      }
      if (request.query.tenantId) {
        results = results.filter((d) => d.tenantId === request.query.tenantId);
      }
      if (request.query.status) {
        results = results.filter((d) => d.status === request.query.status);
      }

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
      const deposit = depositRecords.get(request.params.id);
      if (!deposit) {
        return reply.status(404).send({ error: 'Deposit not found' });
      }

      const data = DeductionSchema.parse({
        ...request.body,
        depositId: deposit.id,
      });

      const deduction: DepositDeduction = {
        id: `ded_${Date.now()}`,
        ...data,
        createdAt: new Date().toISOString(),
      };

      depositDeductions.set(deduction.id, deduction);
      deposit.updatedAt = new Date().toISOString();
      depositRecords.set(deposit.id, deposit);

      return reply.status(201).send(deduction);
    }
  );

  // Generate itemization
  app.get(
    '/deposits/:id/itemization',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const deposit = depositRecords.get(request.params.id);
      if (!deposit) {
        return reply.status(404).send({ error: 'Deposit not found' });
      }

      const deductions = Array.from(depositDeductions.values()).filter(
        (d) => d.depositId === deposit.id
      );

      const itemization = generateDepositItemization(deposit, deductions);

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
      const deposit = depositRecords.get(request.params.id);
      if (!deposit) {
        return reply.status(404).send({ error: 'Deposit not found' });
      }

      const data = DepositRefundSchema.parse(request.body);
      const deductions = Array.from(depositDeductions.values()).filter(
        (d) => d.depositId === deposit.id
      );

      const { refundAmount, totalDeductions } = calculateDepositRefund(deposit, deductions);

      deposit.refundAmount = refundAmount;
      deposit.refundMethod = data.refundMethod;
      deposit.refundDate = new Date().toISOString();
      deposit.itemizationSentDate = new Date().toISOString();
      deposit.status =
        refundAmount === 0
          ? 'forfeited'
          : totalDeductions > 0
            ? 'partial_refund'
            : 'full_refund';
      deposit.updatedAt = new Date().toISOString();

      depositRecords.set(deposit.id, deposit);
      return reply.send(deposit);
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

      const transfer: UtilityTransfer = {
        id: `ut_${Date.now()}`,
        ...data,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };

      utilityTransfers.set(transfer.id, transfer);
      return reply.status(201).send(transfer);
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
      const transfer = utilityTransfers.get(request.params.id);
      if (!transfer) {
        return reply.status(404).send({ error: 'Utility transfer not found' });
      }

      transfer.status = request.body.status as UtilityTransfer['status'];
      if (request.body.confirmationNumber) {
        transfer.confirmationNumber = request.body.confirmationNumber;
      }

      utilityTransfers.set(transfer.id, transfer);
      return reply.send(transfer);
    }
  );
}

// Export for testing
export {
  workflows,
  checklistTemplates,
  checklistItems,
  conditionReports,
  keyRecords,
  depositRecords,
  depositDeductions,
  utilityTransfers,
};
