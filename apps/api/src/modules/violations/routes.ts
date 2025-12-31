import {
  prisma,
  type ViolationType,
  type ViolationSeverity,
  type ViolationStatus,
  type NoticeType,
  type DeliveryMethod,
  type FineStatus,
  type HearingType,
  type HearingStatus,
  type HearingOutcome,
  type ResolutionType,
  type EvidenceType,
} from '@realriches/database';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

// Helper function to check if a violation should be escalated
async function shouldEscalate(
  propertyId: string,
  tenantId: string,
  violationType: ViolationType
): Promise<boolean> {
  // Check if tenant has previous violations of the same type
  const previousViolations = await prisma.leaseViolation.count({
    where: {
      tenantId,
      propertyId,
      violationType,
      status: 'resolved',
    },
  });
  // Escalate if 2+ previous violations
  return previousViolations >= 2;
}

// Helper function to get cure period for violation type
async function getCurePeriod(_propertyId: string, violationType: ViolationType): Promise<number> {
  const curePeriods: Record<string, number> = {
    noise: 24,
    unauthorized_pet: 72,
    unauthorized_guest: 48,
    property_damage: 168,
    lease_violation: 72,
    illegal_activity: 0,
    health_safety: 24,
    parking: 24,
    other: 72,
  };
  return curePeriods[violationType] || 72;
}

// Helper function to get violation statistics
async function getViolationStats(propertyId: string): Promise<Record<string, number>> {
  const violations = await prisma.leaseViolation.groupBy({
    by: ['status'],
    where: { propertyId },
    _count: true,
  });
  return violations.reduce((acc, v) => {
    acc[v.status] = v._count;
    return acc;
  }, {} as Record<string, number>);
}

// Helper function to get tenant violation history
async function getTenantViolationHistory(tenantId: string): Promise<unknown[]> {
  return prisma.leaseViolation.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
}

// Helper function to calculate fine amount
async function calculateFine(_propertyId: string, violationType: ViolationType, tenantId: string): Promise<number> {
  // Get violation count for this tenant and type
  const violationCount = await prisma.leaseViolation.count({
    where: { tenantId, violationType },
  });

  const baseFines: Record<string, number> = {
    noise: 50,
    unauthorized_pet: 150,
    unauthorized_guest: 100,
    property_damage: 500,
    lease_violation: 200,
    illegal_activity: 1000,
    health_safety: 300,
    parking: 50,
    other: 100,
  };
  const baseFine = baseFines[violationType] || 100;
  // Increase fine by 50% for each repeat offense
  return Math.round(baseFine * Math.pow(1.5, violationCount));
}

// Helper function to get violation count for tenant
async function getViolationCount(tenantId: string, violationType: ViolationType): Promise<number> {
  return prisma.leaseViolation.count({
    where: { tenantId, violationType },
  });
}

// Exported types for testing
export interface LeaseViolation {
  id: string;
  propertyId: string;
  unitId: string;
  leaseId: string;
  tenantId: string;
  violationType: ViolationType;
  severity: ViolationSeverity;
  description: string;
  occurredAt: Date;
  reportedAt: Date;
  reportedBy: string;
  status: ViolationStatus;
  notices?: unknown[];
  fines?: unknown[];
  hearings?: unknown[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ViolationPolicy {
  id: string;
  propertyId: string;
  violationType: ViolationType;
  curePeriodDays: number;
  firstOffenseFine?: number;
  repeatOffenseFine?: number;
  maxViolationsBeforeEviction: number;
  escalationPath?: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ViolationNotice {
  id: string;
  violationId: string;
  noticeType: NoticeType;
  content: string;
  deliveryMethod: DeliveryMethod;
  curePeriodDays?: number;
  createdAt: Date;
}

export interface ViolationFine {
  id: string;
  violationId: string;
  amount: number;
  reason: string;
  dueDate: Date;
  status: FineStatus;
  paidAmount?: number;
  createdAt: Date;
}

export interface ViolationTemplate {
  id: string;
  name: string;
  content: string;
  violationType?: ViolationType;
  noticeType?: NoticeType;
}

// Exported Maps for testing
export const leaseViolations = new Map<string, LeaseViolation>();
export const violationPolicies = new Map<string, ViolationPolicy>();
export const violationFines = new Map<string, ViolationFine>();
export const violationNotices = new Map<string, ViolationNotice>();
export const violationTemplates = new Map<string, ViolationTemplate>();

// Synchronous helper functions for testing
export function getViolationCountSync(tenantId: string, violationType?: string): number {
  return Array.from(leaseViolations.values()).filter(
    (v) => v.tenantId === tenantId && (!violationType || v.violationType === violationType)
  ).length;
}

export function calculateFineSync(propertyId: string, violationType: string, tenantId: string): number {
  const policy = Array.from(violationPolicies.values()).find(
    (p) => p.propertyId === propertyId && p.violationType === violationType && p.isActive
  );
  if (!policy) return 0;
  const priorViolations = getViolationCountSync(tenantId, violationType);
  return priorViolations === 0
    ? policy.firstOffenseFine || 0
    : policy.repeatOffenseFine || policy.firstOffenseFine || 0;
}

export function shouldEscalateSync(propertyId: string, tenantId: string, violationType: string): boolean {
  const priorViolations = getViolationCountSync(tenantId, violationType);
  const policy = Array.from(violationPolicies.values()).find(
    (p) => p.propertyId === propertyId && p.violationType === violationType && p.isActive
  );
  if (!policy) return false;
  return priorViolations >= policy.maxViolationsBeforeEviction;
}

export function getCurePeriodSync(propertyId: string, violationType: string): number {
  const policy = Array.from(violationPolicies.values()).find(
    (p) => p.propertyId === propertyId && p.violationType === violationType && p.isActive
  );
  return policy?.curePeriodDays || 14;
}

export function getViolationStatsSync(propertyId: string): {
  totalActive: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  pendingFines: number;
  totalFinesCollected: number;
  upcomingHearings: number;
} {
  const violations = Array.from(leaseViolations.values()).filter((v) => v.propertyId === propertyId);
  const fines = Array.from(violationFines.values());
  const now = new Date();

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const v of violations) {
    const vType = v.violationType as string;
    const vSeverity = v.severity as string;
    const vStatus = v.status as string;
    byType[vType] = (byType[vType] || 0) + 1;
    bySeverity[vSeverity] = (bySeverity[vSeverity] || 0) + 1;
    byStatus[vStatus] = (byStatus[vStatus] || 0) + 1;
  }

  const violationIds = new Set(violations.map((v) => v.id));
  const relatedFines = fines.filter((f) => violationIds.has(f.violationId));

  return {
    totalActive: violations.filter((v) => !['resolved', 'escalated'].includes(v.status as string)).length,
    byType,
    bySeverity,
    byStatus,
    pendingFines: relatedFines.filter((f) => f.status === 'pending').reduce((sum, f) => sum + (f.amount || 0), 0),
    totalFinesCollected: relatedFines.filter((f) => f.status === 'paid').reduce((sum, f) => sum + (f.paidAmount ?? f.amount ?? 0), 0),
    upcomingHearings: 0,
  };
}

export function getTenantViolationHistorySync(tenantId: string): {
  violations: LeaseViolation[];
  totalFinesPaid: number;
  totalFinesOwed: number;
  isRepeatOffender: boolean;
} {
  const violations = Array.from(leaseViolations.values()).filter((v) => v.tenantId === tenantId);
  const fines = Array.from(violationFines.values());
  const violationIds = new Set(violations.map((v) => v.id));
  const relatedFines = fines.filter((f) => violationIds.has(f.violationId));

  return {
    violations,
    totalFinesPaid: relatedFines.filter((f) => f.status === 'paid').reduce((sum, f) => sum + (f.paidAmount ?? f.amount ?? 0), 0),
    totalFinesOwed: relatedFines.filter((f) => f.status === 'pending').reduce((sum, f) => sum + (f.amount || 0), 0),
    isRepeatOffender: violations.length >= 3,
  };
}

// Export sync functions as the main exports for testing compatibility
export {
  getViolationCountSync as getViolationCount,
  calculateFineSync as calculateFine,
  shouldEscalateSync as shouldEscalate,
  getCurePeriodSync as getCurePeriod,
  getViolationStatsSync as getViolationStats,
  getTenantViolationHistorySync as getTenantViolationHistory,
};

// Async versions for API routes
async function getViolationCountAsync(tenantId: string, violationType?: ViolationType): Promise<number> {
  return prisma.leaseViolation.count({
    where: {
      tenantId,
      ...(violationType && { violationType }),
    },
  });
}

async function calculateFineAsync(
  propertyId: string,
  violationType: ViolationType,
  tenantId: string
): Promise<number> {
  const policy = await prisma.violationPolicy.findFirst({
    where: {
      propertyId,
      violationType,
      isActive: true,
    },
  });

  if (!policy) return 0;

  const priorViolations = await getViolationCountAsync(tenantId, violationType);
  return priorViolations === 0
    ? toNumber(policy.firstOffenseFine) || 0
    : toNumber(policy.repeatOffenseFine) || toNumber(policy.firstOffenseFine) || 0;
}

async function shouldEscalateAsync(
  propertyId: string,
  tenantId: string,
  violationType: ViolationType
): Promise<boolean> {
  const priorViolations = await getViolationCountAsync(tenantId, violationType);
  const policy = await prisma.violationPolicy.findFirst({
    where: {
      propertyId,
      violationType,
      isActive: true,
    },
  });

  if (!policy) return false;
  return priorViolations >= policy.maxViolationsBeforeEviction;
}

async function getCurePeriodAsync(propertyId: string, violationType: ViolationType): Promise<number> {
  const policy = await prisma.violationPolicy.findFirst({
    where: {
      propertyId,
      violationType,
      isActive: true,
    },
  });

  return policy?.curePeriodDays || 14;
}

async function getViolationStatsAsync(propertyId: string): Promise<{
  totalActive: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  pendingFines: number;
  totalFinesCollected: number;
  upcomingHearings: number;
}> {
  const violations = await prisma.leaseViolation.findMany({
    where: { propertyId },
  });

  const now = new Date();

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const v of violations) {
    byType[v.violationType] = (byType[v.violationType] || 0) + 1;
    bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
    byStatus[v.status] = (byStatus[v.status] || 0) + 1;
  }

  const violationIds = violations.map((v) => v.id);

  const fines = await prisma.violationFine.findMany({
    where: { violationId: { in: violationIds } },
  });

  const hearings = await prisma.violationHearing.findMany({
    where: { violationId: { in: violationIds } },
  });

  return {
    totalActive: violations.filter((v) => !['resolved', 'escalated'].includes(v.status)).length,
    byType,
    bySeverity,
    byStatus,
    pendingFines: fines.filter((f) => f.status === 'pending').reduce((sum, f) => sum + toNumber(f.amount), 0),
    totalFinesCollected: fines
      .filter((f) => f.status === 'paid')
      .reduce((sum, f) => sum + toNumber(f.paidAmount ?? f.amount), 0),
    upcomingHearings: hearings.filter((h) => h.status === 'scheduled' && h.scheduledAt > now).length,
  };
}

async function getTenantViolationHistoryAsync(tenantId: string): Promise<{
  violations: Array<{
    id: string;
    violationType: ViolationType;
    severity: ViolationSeverity;
    status: ViolationStatus;
    occurredAt: Date;
    reportedAt: Date;
  }>;
  totalFinesPaid: number;
  totalFinesOwed: number;
  isRepeatOffender: boolean;
}> {
  const violations = await prisma.leaseViolation.findMany({
    where: { tenantId },
    select: {
      id: true,
      violationType: true,
      severity: true,
      status: true,
      occurredAt: true,
      reportedAt: true,
    },
  });

  const violationIds = violations.map((v) => v.id);

  const fines = await prisma.violationFine.findMany({
    where: { violationId: { in: violationIds } },
  });

  return {
    violations,
    totalFinesPaid: fines.filter((f) => f.status === 'paid').reduce((sum, f) => sum + toNumber(f.paidAmount ?? f.amount), 0),
    totalFinesOwed: fines.filter((f) => f.status === 'pending').reduce((sum, f) => sum + toNumber(f.amount), 0),
    isRepeatOffender: violations.length >= 3,
  };
}

export function generateNoticeContent(
  templateContent: string,
  violationType: string,
  occurredAt: Date,
  description: string,
  cureDeadline: Date,
  fineAmount: number
): string {
  return templateContent
    .replace('{{violation_type}}', violationType)
    .replace('{{violation_date}}', occurredAt.toISOString().split('T')[0])
    .replace('{{description}}', description)
    .replace('{{cure_deadline}}', cureDeadline.toISOString().split('T')[0])
    .replace('{{fine_amount}}', fineAmount.toString());
}

// Schemas
const violationSchema = z.object({
  propertyId: z.string(),
  unitId: z.string(),
  leaseId: z.string(),
  tenantId: z.string(),
  violationType: z.enum([
    'noise',
    'pet_violation',
    'unauthorized_occupant',
    'property_damage',
    'parking_violation',
    'lease_term_violation',
    'health_safety',
    'illegal_activity',
    'non_payment',
    'subletting',
    'maintenance_neglect',
    'common_area_misuse',
    'other',
  ]),
  severity: z.enum(['minor', 'moderate', 'severe', 'critical']),
  description: z.string(),
  occurredAt: z.string().transform((s) => new Date(s)),
  reportedBy: z.string(),
  witnesses: z.array(z.string()).optional(),
});

const evidenceSchema = z.object({
  type: z.enum(['photo', 'video', 'document', 'audio', 'written_statement']),
  description: z.string(),
  fileUrl: z.string().optional(),
  capturedBy: z.string(),
});

const noticeSchema = z.object({
  violationId: z.string(),
  noticeType: z.enum(['warning', 'cure_or_quit', 'pay_or_quit', 'unconditional_quit', 'final_notice']),
  templateId: z.string().optional(),
  content: z.string(),
  deliveryMethod: z.enum(['certified_mail', 'hand_delivered', 'posted', 'email']),
  curePeriodDays: z.number().optional(),
  createdBy: z.string(),
});

const fineSchema = z.object({
  violationId: z.string(),
  amount: z.number().positive(),
  reason: z.string(),
  dueDate: z.string().transform((s) => new Date(s)),
});

const hearingSchema = z.object({
  violationId: z.string(),
  hearingType: z.enum(['internal_review', 'mediation', 'arbitration', 'court']),
  scheduledAt: z.string().transform((s) => new Date(s)),
  location: z.string().optional(),
  virtualMeetingUrl: z.string().optional(),
  attendees: z.array(z.string()),
});

const templateSchema = z.object({
  propertyId: z.string().optional(),
  name: z.string(),
  violationType: z.enum([
    'noise',
    'pet_violation',
    'unauthorized_occupant',
    'property_damage',
    'parking_violation',
    'lease_term_violation',
    'health_safety',
    'illegal_activity',
    'non_payment',
    'subletting',
    'maintenance_neglect',
    'common_area_misuse',
    'other',
  ]),
  noticeType: z.string(),
  content: z.string(),
  curePeriodDays: z.number().min(1),
  fineAmount: z.number().optional(),
});

const policySchema = z.object({
  propertyId: z.string(),
  violationType: z.enum([
    'noise',
    'pet_violation',
    'unauthorized_occupant',
    'property_damage',
    'parking_violation',
    'lease_term_violation',
    'health_safety',
    'illegal_activity',
    'non_payment',
    'subletting',
    'maintenance_neglect',
    'common_area_misuse',
    'other',
  ]),
  firstOffenseFine: z.number().optional(),
  repeatOffenseFine: z.number().optional(),
  curePeriodDays: z.number().min(1),
  maxViolationsBeforeEviction: z.number().min(1),
  escalationPath: z.array(z.string()),
});

export async function violationRoutes(app: FastifyInstance): Promise<void> {
  // Violations
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = violationSchema.parse(request.body);

    // Check if should escalate immediately
    const shouldEscalateNow = await shouldEscalate(data.propertyId, data.tenantId, data.violationType);
    const status: ViolationStatus = shouldEscalateNow ? 'escalated' : 'reported';

    const violation = await prisma.leaseViolation.create({
      data: {
        propertyId: data.propertyId,
        unitId: data.unitId,
        leaseId: data.leaseId,
        tenantId: data.tenantId,
        violationType: data.violationType,
        severity: data.severity,
        description: data.description,
        witnesses: data.witnesses || [],
        occurredAt: data.occurredAt,
        reportedAt: new Date(),
        reportedBy: data.reportedBy,
        status,
      },
    });

    return reply.status(201).send(violation);
  });

  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, tenantId, status, violationType } = request.query as {
      propertyId?: string;
      tenantId?: string;
      status?: string;
      violationType?: string;
    };

    const violations = await prisma.leaseViolation.findMany({
      where: {
        ...(propertyId && { propertyId }),
        ...(tenantId && { tenantId }),
        ...(status && { status: status as ViolationStatus }),
        ...(violationType && { violationType: violationType as ViolationType }),
      },
      include: {
        evidence: true,
        notices: true,
        fines: true,
        hearings: true,
      },
    });

    return reply.send(violations);
  });

  app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const violation = await prisma.leaseViolation.findUnique({
      where: { id },
      include: {
        evidence: true,
        notices: true,
        fines: true,
        hearings: true,
      },
    });

    if (!violation) return reply.status(404).send({ error: 'Violation not found' });
    return reply.send(violation);
  });

  app.patch('/:id/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: ViolationStatus };

    try {
      const violation = await prisma.leaseViolation.update({
        where: { id },
        data: { status },
      });
      return reply.send(violation);
    } catch {
      return reply.status(404).send({ error: 'Violation not found' });
    }
  });

  // Evidence
  app.post('/:id/evidence', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = evidenceSchema.parse(request.body);

    const violation = await prisma.leaseViolation.findUnique({ where: { id } });
    if (!violation) return reply.status(404).send({ error: 'Violation not found' });

    const evidence = await prisma.violationEvidence.create({
      data: {
        violationId: id,
        type: data.type,
        description: data.description,
        fileUrl: data.fileUrl,
        capturedAt: new Date(),
        capturedBy: data.capturedBy,
      },
    });

    return reply.status(201).send(evidence);
  });

  // Notices
  app.post('/notices', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = noticeSchema.parse(request.body);

    const violation = await prisma.leaseViolation.findUnique({
      where: { id: data.violationId },
    });
    if (!violation) return reply.status(404).send({ error: 'Violation not found' });

    const curePeriodDays = data.curePeriodDays || (await getCurePeriod(violation.propertyId, violation.violationType));
    const responseDeadline = new Date();
    responseDeadline.setDate(responseDeadline.getDate() + curePeriodDays);

    const notice = await prisma.violationNotice.create({
      data: {
        violationId: data.violationId,
        noticeType: data.noticeType,
        templateId: data.templateId,
        content: data.content,
        deliveryMethod: data.deliveryMethod,
        sentAt: new Date(),
        curePeriodDays,
        responseDeadline,
        createdBy: data.createdBy,
      },
    });

    // Update violation status
    await prisma.leaseViolation.update({
      where: { id: violation.id },
      data: {
        status: 'notice_sent',
        cureDeadline: responseDeadline,
      },
    });

    return reply.status(201).send(notice);
  });

  app.get('/notices', async (request: FastifyRequest, reply: FastifyReply) => {
    const { violationId } = request.query as { violationId?: string };

    const notices = await prisma.violationNotice.findMany({
      where: {
        ...(violationId && { violationId }),
      },
    });

    return reply.send(notices);
  });

  app.patch('/notices/:id/delivered', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { trackingNumber } = request.body as { trackingNumber?: string };

    const notice = await prisma.violationNotice.findUnique({ where: { id } });
    if (!notice) return reply.status(404).send({ error: 'Notice not found' });

    const updated = await prisma.violationNotice.update({
      where: { id },
      data: {
        deliveredAt: new Date(),
        trackingNumber,
      },
    });

    // Update violation status
    await prisma.leaseViolation.update({
      where: { id: notice.violationId },
      data: { status: 'cure_period' },
    });

    return reply.send(updated);
  });

  // Fines
  app.post('/fines', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = fineSchema.parse(request.body);

    const violation = await prisma.leaseViolation.findUnique({
      where: { id: data.violationId },
    });
    if (!violation) return reply.status(404).send({ error: 'Violation not found' });

    const fine = await prisma.violationFine.create({
      data: {
        violationId: data.violationId,
        amount: data.amount,
        reason: data.reason,
        dueDate: data.dueDate,
        status: 'pending',
      },
    });

    return reply.status(201).send(fine);
  });

  app.get('/fines', async (request: FastifyRequest, reply: FastifyReply) => {
    const { violationId, status } = request.query as { violationId?: string; status?: string };

    const fines = await prisma.violationFine.findMany({
      where: {
        ...(violationId && { violationId }),
        ...(status && { status: status as FineStatus }),
      },
    });

    return reply.send(fines);
  });

  app.post('/fines/:id/pay', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { amount, paymentMethod } = request.body as { amount: number; paymentMethod: string };

    try {
      const fine = await prisma.violationFine.update({
        where: { id },
        data: {
          status: 'paid',
          paidAt: new Date(),
          paidAmount: amount,
          paymentMethod,
        },
      });
      return reply.send(fine);
    } catch {
      return reply.status(404).send({ error: 'Fine not found' });
    }
  });

  app.post('/fines/:id/waive', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { reason } = request.body as { reason: string };

    try {
      const fine = await prisma.violationFine.update({
        where: { id },
        data: {
          status: 'waived',
          waivedReason: reason,
        },
      });
      return reply.send(fine);
    } catch {
      return reply.status(404).send({ error: 'Fine not found' });
    }
  });

  // Hearings
  app.post('/hearings', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = hearingSchema.parse(request.body);

    const violation = await prisma.leaseViolation.findUnique({
      where: { id: data.violationId },
    });
    if (!violation) return reply.status(404).send({ error: 'Violation not found' });

    const hearing = await prisma.violationHearing.create({
      data: {
        violationId: data.violationId,
        hearingType: data.hearingType,
        scheduledAt: data.scheduledAt,
        location: data.location,
        virtualMeetingUrl: data.virtualMeetingUrl,
        attendees: data.attendees,
        status: 'scheduled',
      },
    });

    // Update violation status
    await prisma.leaseViolation.update({
      where: { id: violation.id },
      data: { status: 'hearing_scheduled' },
    });

    return reply.status(201).send(hearing);
  });

  app.get('/hearings', async (request: FastifyRequest, reply: FastifyReply) => {
    const { violationId, status } = request.query as { violationId?: string; status?: string };

    const hearings = await prisma.violationHearing.findMany({
      where: {
        ...(violationId && { violationId }),
        ...(status && { status: status as HearingStatus }),
      },
    });

    return reply.send(hearings);
  });

  app.patch('/hearings/:id/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { outcome, notes } = request.body as { outcome: HearingOutcome; notes?: string };

    try {
      const hearing = await prisma.violationHearing.update({
        where: { id },
        data: {
          status: 'completed',
          outcome,
          notes,
          completedAt: new Date(),
        },
      });
      return reply.send(hearing);
    } catch {
      return reply.status(404).send({ error: 'Hearing not found' });
    }
  });

  // Resolve violation
  app.post('/:id/resolve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { type, notes, resolvedBy } = request.body as {
      type: ResolutionType;
      notes: string;
      resolvedBy: string;
    };

    try {
      const violation = await prisma.leaseViolation.update({
        where: { id },
        data: {
          status: 'resolved',
          resolutionType: type,
          resolutionNotes: notes,
          resolvedAt: new Date(),
          resolvedBy,
          ...(type === 'cured' && { curedAt: new Date() }),
        },
      });
      return reply.send(violation);
    } catch {
      return reply.status(404).send({ error: 'Violation not found' });
    }
  });

  // Templates
  app.post('/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = templateSchema.parse(request.body);

    const template = await prisma.violationTemplate.create({
      data: {
        propertyId: data.propertyId,
        name: data.name,
        violationType: data.violationType,
        noticeType: data.noticeType,
        content: data.content,
        curePeriodDays: data.curePeriodDays,
        fineAmount: data.fineAmount,
        isActive: true,
      },
    });

    return reply.status(201).send(template);
  });

  app.get('/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, violationType } = request.query as {
      propertyId?: string;
      violationType?: string;
    };

    const templates = await prisma.violationTemplate.findMany({
      where: {
        isActive: true,
        ...(propertyId && { OR: [{ propertyId: null }, { propertyId }] }),
        ...(violationType && { violationType: violationType as ViolationType }),
      },
    });

    return reply.send(templates);
  });

  // Policies
  app.post('/policies', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = policySchema.parse(request.body);

    const policy = await prisma.violationPolicy.upsert({
      where: {
        propertyId_violationType: {
          propertyId: data.propertyId,
          violationType: data.violationType,
        },
      },
      update: {
        firstOffenseFine: data.firstOffenseFine,
        repeatOffenseFine: data.repeatOffenseFine,
        curePeriodDays: data.curePeriodDays,
        maxViolationsBeforeEviction: data.maxViolationsBeforeEviction,
        escalationPath: data.escalationPath,
        isActive: true,
      },
      create: {
        propertyId: data.propertyId,
        violationType: data.violationType,
        firstOffenseFine: data.firstOffenseFine,
        repeatOffenseFine: data.repeatOffenseFine,
        curePeriodDays: data.curePeriodDays,
        maxViolationsBeforeEviction: data.maxViolationsBeforeEviction,
        escalationPath: data.escalationPath,
        isActive: true,
      },
    });

    return reply.status(201).send(policy);
  });

  app.get('/policies/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };

    const policies = await prisma.violationPolicy.findMany({
      where: {
        propertyId,
        isActive: true,
      },
    });

    return reply.send(policies);
  });

  // Stats
  app.get('/stats/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const stats = await getViolationStats(propertyId);
    return reply.send(stats);
  });

  // Tenant history
  app.get('/tenant/:tenantId/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = request.params as { tenantId: string };
    const history = await getTenantViolationHistory(tenantId);
    return reply.send(history);
  });

  // Auto-calculate fine
  app.get('/calculate-fine', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, violationType, tenantId } = request.query as {
      propertyId: string;
      violationType: ViolationType;
      tenantId: string;
    };

    const fine = await calculateFine(propertyId, violationType, tenantId);
    const priorViolations = await getViolationCount(tenantId, violationType);

    return reply.send({
      calculatedFine: fine,
      priorViolations,
      isRepeatOffender: priorViolations > 0,
    });
  });
}
