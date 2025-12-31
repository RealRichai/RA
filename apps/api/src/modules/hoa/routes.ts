import {
  prisma,
  Prisma,
  type HOAAssociationType as PrismaHOAAssociationType,
  type HOAAssessmentFrequency as PrismaHOAAssessmentFrequency,
  type HOAAssessmentStatus as PrismaHOAAssessmentStatus,
  type HOAAssessmentType as PrismaHOAAssessmentType,
  type HOAViolationType as PrismaHOAViolationType,
  type HOAViolationStatus as PrismaHOAViolationStatus,
  type HOAArchitecturalRequestStatus as PrismaHOAArchitecturalRequestStatus,
  type HOAMeetingStatus as PrismaHOAMeetingStatus,
  type HOADocumentType as PrismaHOADocumentType,
} from '@realriches/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

// Helper to convert Prisma Decimal to number
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

// ============================================================================
// TYPES
// ============================================================================

type AssociationType = 'hoa' | 'coa' | 'poa';
type AssessmentFrequency = 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
type AssessmentStatus = 'pending' | 'paid' | 'overdue' | 'partial';
type ViolationType = 'noise' | 'parking' | 'pet' | 'trash' | 'landscaping' | 'architectural' | 'other';
type ViolationStatus = 'open' | 'warning_sent' | 'fine_issued' | 'resolved' | 'escalated';
type RequestStatus = 'submitted' | 'under_review' | 'approved' | 'denied' | 'withdrawn';

interface Association {
  id: string;
  name: string;
  type: AssociationType;
  propertyId: string;
  managementCompany?: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  portalUrl?: string;
  portalCredentials?: string; // encrypted
  regularAssessment: number;
  assessmentFrequency: AssessmentFrequency;
  specialAssessments: SpecialAssessment[];
  rules: AssociationRule[];
  createdAt: string;
  updatedAt: string;
}

interface SpecialAssessment {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  reason: string;
  isOneTime: boolean;
}

interface AssociationRule {
  id: string;
  category: string;
  description: string;
  fineAmount?: number;
}

interface Assessment {
  id: string;
  associationId: string;
  propertyId: string;
  unitId?: string;
  type: 'regular' | 'special';
  description: string;
  amount: number;
  dueDate: string;
  status: AssessmentStatus;
  paidAmount: number;
  paidDate?: string;
  lateFee?: number;
  paymentReference?: string;
  createdAt: string;
  updatedAt: string;
}

interface Violation {
  id: string;
  associationId: string;
  propertyId: string;
  unitId?: string;
  tenantId?: string;
  type: ViolationType;
  ruleId?: string;
  description: string;
  reportedDate: string;
  reportedBy?: string;
  status: ViolationStatus;
  fineAmount?: number;
  fineDueDate?: string;
  finePaid: boolean;
  photos: string[];
  timeline: ViolationEvent[];
  resolvedDate?: string;
  resolutionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

interface ViolationEvent {
  id: string;
  date: string;
  action: string;
  notes?: string;
  performedBy?: string;
}

interface ArchitecturalRequest {
  id: string;
  associationId: string;
  propertyId: string;
  unitId?: string;
  requestType: string;
  description: string;
  proposedChanges: string;
  estimatedCost?: number;
  contractor?: string;
  startDate?: string;
  endDate?: string;
  status: RequestStatus;
  submittedDate: string;
  reviewDate?: string;
  reviewNotes?: string;
  approvedBy?: string;
  conditions?: string[];
  documents: string[];
  createdAt: string;
  updatedAt: string;
}

interface BoardMeeting {
  id: string;
  associationId: string;
  title: string;
  date: string;
  location?: string;
  virtualLink?: string;
  agenda: string[];
  minutes?: string;
  attendees: string[];
  status: 'scheduled' | 'completed' | 'cancelled';
  createdAt: string;
}

interface AssociationDocument {
  id: string;
  associationId: string;
  name: string;
  type: 'ccr' | 'bylaws' | 'rules' | 'minutes' | 'budget' | 'insurance' | 'other';
  fileUrl: string;
  effectiveDate?: string;
  uploadedBy: string;
  createdAt: string;
}

// ============================================================================
// DATABASE STORAGE (Prisma)
// ============================================================================

// Convert Prisma HOAAssociation to interface type
function toAssociation(record: Awaited<ReturnType<typeof prisma.hOAAssociation.findFirst>>): Association | null {
  if (!record) return null;
  return {
    id: record.id,
    name: record.name,
    type: record.type as AssociationType,
    propertyId: record.propertyId,
    managementCompany: record.managementCompany ?? undefined,
    contactEmail: record.contactEmail ?? undefined,
    contactPhone: record.contactPhone ?? undefined,
    website: record.website ?? undefined,
    portalUrl: record.portalUrl ?? undefined,
    portalCredentials: record.portalCredentials ?? undefined,
    regularAssessment: toNumber(record.regularAssessment),
    assessmentFrequency: record.assessmentFrequency as AssessmentFrequency,
    specialAssessments: record.specialAssessments as unknown as SpecialAssessment[],
    rules: record.rules as unknown as AssociationRule[],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

// Convert Prisma HOAAssessment to interface type
function toAssessment(record: Awaited<ReturnType<typeof prisma.hOAAssessment.findFirst>>): Assessment | null {
  if (!record) return null;
  return {
    id: record.id,
    associationId: record.associationId,
    propertyId: record.propertyId,
    unitId: record.unitId ?? undefined,
    type: record.type as 'regular' | 'special',
    description: record.description,
    amount: toNumber(record.amount),
    dueDate: record.dueDate.toISOString().split('T')[0],
    status: record.status as AssessmentStatus,
    paidAmount: toNumber(record.paidAmount),
    paidDate: record.paidDate?.toISOString(),
    lateFee: record.lateFee ? toNumber(record.lateFee) : undefined,
    paymentReference: record.paymentReference ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

// Convert Prisma HOAViolation to interface type
function toViolation(record: Awaited<ReturnType<typeof prisma.hOAViolation.findFirst>>): Violation | null {
  if (!record) return null;
  return {
    id: record.id,
    associationId: record.associationId,
    propertyId: record.propertyId,
    unitId: record.unitId ?? undefined,
    tenantId: record.tenantId ?? undefined,
    type: record.type as ViolationType,
    ruleId: record.ruleId ?? undefined,
    description: record.description,
    reportedDate: record.reportedDate.toISOString(),
    reportedBy: record.reportedBy ?? undefined,
    status: record.status as ViolationStatus,
    fineAmount: record.fineAmount ? toNumber(record.fineAmount) : undefined,
    fineDueDate: record.fineDueDate?.toISOString().split('T')[0],
    finePaid: record.finePaid,
    photos: record.photos as string[],
    timeline: record.timeline as unknown as ViolationEvent[],
    resolvedDate: record.resolvedDate?.toISOString(),
    resolutionNotes: record.resolutionNotes ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

// Convert Prisma HOAArchitecturalRequest to interface type
function toArchitecturalRequest(record: Awaited<ReturnType<typeof prisma.hOAArchitecturalRequest.findFirst>>): ArchitecturalRequest | null {
  if (!record) return null;
  return {
    id: record.id,
    associationId: record.associationId,
    propertyId: record.propertyId,
    unitId: record.unitId ?? undefined,
    requestType: record.requestType,
    description: record.description,
    proposedChanges: record.proposedChanges,
    estimatedCost: record.estimatedCost ? toNumber(record.estimatedCost) : undefined,
    contractor: record.contractor ?? undefined,
    startDate: record.startDate?.toISOString().split('T')[0],
    endDate: record.endDate?.toISOString().split('T')[0],
    status: record.status as RequestStatus,
    submittedDate: record.submittedDate.toISOString(),
    reviewDate: record.reviewDate?.toISOString(),
    reviewNotes: record.reviewNotes ?? undefined,
    approvedBy: record.approvedBy ?? undefined,
    conditions: record.conditions as string[] | undefined,
    documents: record.documents as string[],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

// Convert Prisma HOABoardMeeting to interface type
function toBoardMeeting(record: Awaited<ReturnType<typeof prisma.hOABoardMeeting.findFirst>>): BoardMeeting | null {
  if (!record) return null;
  return {
    id: record.id,
    associationId: record.associationId,
    title: record.title,
    date: record.date.toISOString(),
    location: record.location ?? undefined,
    virtualLink: record.virtualLink ?? undefined,
    agenda: record.agenda as string[],
    minutes: record.minutes ?? undefined,
    attendees: record.attendees as string[],
    status: record.status as 'scheduled' | 'completed' | 'cancelled',
    createdAt: record.createdAt.toISOString(),
  };
}

// Convert Prisma HOADocument to interface type
function toAssociationDocument(record: Awaited<ReturnType<typeof prisma.hOADocument.findFirst>>): AssociationDocument | null {
  if (!record) return null;
  return {
    id: record.id,
    associationId: record.associationId,
    name: record.name,
    type: record.type as 'ccr' | 'bylaws' | 'rules' | 'minutes' | 'budget' | 'insurance' | 'other',
    fileUrl: record.fileUrl,
    effectiveDate: record.effectiveDate?.toISOString().split('T')[0],
    uploadedBy: record.uploadedBy,
    createdAt: record.createdAt.toISOString(),
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function calculateAssessmentSchedule(
  amount: number,
  frequency: AssessmentFrequency,
  startDate: string,
  periods: number = 12
): Array<{ dueDate: string; amount: number }> {
  const schedule: Array<{ dueDate: string; amount: number }> = [];
  // Parse date parts to avoid timezone issues
  const [year, month, day] = startDate.split('-').map(Number);

  const monthsPerPeriod: Record<AssessmentFrequency, number> = {
    monthly: 1,
    quarterly: 3,
    semi_annual: 6,
    annual: 12,
  };

  const interval = monthsPerPeriod[frequency];

  for (let i = 0; i < periods; i++) {
    const totalMonths = (month - 1) + i * interval;
    const newYear = year + Math.floor(totalMonths / 12);
    const newMonth = (totalMonths % 12) + 1;
    const dueDate = new Date(newYear, newMonth - 1, day);
    schedule.push({
      dueDate: dueDate.toISOString().split('T')[0],
      amount,
    });
  }

  return schedule;
}

export function calculateLateFee(
  assessment: Assessment,
  lateFeePercent: number = 10,
  gracePeriodDays: number = 15
): number {
  if (assessment.status === 'paid') return 0;

  const dueDate = new Date(assessment.dueDate);
  const graceDate = new Date(dueDate);
  graceDate.setDate(graceDate.getDate() + gracePeriodDays);

  const now = new Date();
  if (now <= graceDate) return 0;

  return Math.round(assessment.amount * (lateFeePercent / 100) * 100) / 100;
}

export function getViolationEscalationLevel(violation: Violation): {
  level: number;
  nextAction: string;
  daysOpen: number;
} {
  const reportedDate = new Date(violation.reportedDate);
  const now = new Date();
  const daysOpen = Math.floor((now.getTime() - reportedDate.getTime()) / (1000 * 60 * 60 * 24));

  const warningsSent = violation.timeline.filter((e) => e.action === 'warning_sent').length;
  const finesIssued = violation.timeline.filter((e) => e.action === 'fine_issued').length;

  let level = 1;
  let nextAction = 'Send warning letter';

  if (warningsSent >= 1 && finesIssued === 0) {
    level = 2;
    nextAction = 'Issue fine';
  } else if (finesIssued >= 1 && !violation.finePaid) {
    level = 3;
    nextAction = 'Escalate to legal';
  } else if (finesIssued >= 1 && violation.finePaid) {
    level = 2;
    nextAction = 'Monitor for compliance';
  }

  return { level, nextAction, daysOpen };
}

export function calculateAnnualHOACost(association: Association): {
  regularAssessments: number;
  specialAssessments: number;
  total: number;
} {
  const periodsPerYear: Record<AssessmentFrequency, number> = {
    monthly: 12,
    quarterly: 4,
    semi_annual: 2,
    annual: 1,
  };

  const regularAssessments =
    association.regularAssessment * periodsPerYear[association.assessmentFrequency];

  const specialAssessments = association.specialAssessments
    .filter((sa) => {
      const dueDate = new Date(sa.dueDate);
      const now = new Date();
      return dueDate.getFullYear() === now.getFullYear();
    })
    .reduce((sum, sa) => sum + sa.amount, 0);

  return {
    regularAssessments,
    specialAssessments,
    total: regularAssessments + specialAssessments,
  };
}

export function getAssessmentSummary(
  assessmentList: Assessment[]
): {
  total: number;
  paid: number;
  pending: number;
  overdue: number;
  totalAmount: number;
  paidAmount: number;
  overdueAmount: number;
} {
  const now = new Date();

  const summary = {
    total: assessmentList.length,
    paid: 0,
    pending: 0,
    overdue: 0,
    totalAmount: 0,
    paidAmount: 0,
    overdueAmount: 0,
  };

  for (const assessment of assessmentList) {
    summary.totalAmount += assessment.amount;

    if (assessment.status === 'paid') {
      summary.paid++;
      summary.paidAmount += assessment.paidAmount;
    } else if (new Date(assessment.dueDate) < now) {
      summary.overdue++;
      summary.overdueAmount += assessment.amount - assessment.paidAmount;
    } else {
      summary.pending++;
    }
  }

  return summary;
}

// ============================================================================
// SCHEMAS
// ============================================================================

const AssociationSchema = z.object({
  name: z.string(),
  type: z.enum(['hoa', 'coa', 'poa']),
  propertyId: z.string(),
  managementCompany: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  website: z.string().url().optional(),
  portalUrl: z.string().url().optional(),
  regularAssessment: z.number(),
  assessmentFrequency: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual']),
});

const SpecialAssessmentSchema = z.object({
  description: z.string(),
  amount: z.number(),
  dueDate: z.string(),
  reason: z.string(),
  isOneTime: z.boolean().default(true),
});

const RuleSchema = z.object({
  category: z.string(),
  description: z.string(),
  fineAmount: z.number().optional(),
});

const AssessmentSchema = z.object({
  associationId: z.string(),
  propertyId: z.string(),
  unitId: z.string().optional(),
  type: z.enum(['regular', 'special']),
  description: z.string(),
  amount: z.number(),
  dueDate: z.string(),
});

const PaymentSchema = z.object({
  amount: z.number(),
  paymentReference: z.string().optional(),
});

const ViolationSchema = z.object({
  associationId: z.string(),
  propertyId: z.string(),
  unitId: z.string().optional(),
  tenantId: z.string().optional(),
  type: z.enum(['noise', 'parking', 'pet', 'trash', 'landscaping', 'architectural', 'other']),
  ruleId: z.string().optional(),
  description: z.string(),
  reportedBy: z.string().optional(),
  photos: z.array(z.string()).default([]),
});

const ViolationActionSchema = z.object({
  action: z.string(),
  notes: z.string().optional(),
  fineAmount: z.number().optional(),
  fineDueDate: z.string().optional(),
});

const ArchitecturalRequestSchema = z.object({
  associationId: z.string(),
  propertyId: z.string(),
  unitId: z.string().optional(),
  requestType: z.string(),
  description: z.string(),
  proposedChanges: z.string(),
  estimatedCost: z.number().optional(),
  contractor: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  documents: z.array(z.string()).default([]),
});

const RequestReviewSchema = z.object({
  status: z.enum(['approved', 'denied']),
  reviewNotes: z.string().optional(),
  conditions: z.array(z.string()).optional(),
});

const BoardMeetingSchema = z.object({
  associationId: z.string(),
  title: z.string(),
  date: z.string(),
  location: z.string().optional(),
  virtualLink: z.string().optional(),
  agenda: z.array(z.string()),
});

const DocumentSchema = z.object({
  associationId: z.string(),
  name: z.string(),
  type: z.enum(['ccr', 'bylaws', 'rules', 'minutes', 'budget', 'insurance', 'other']),
  fileUrl: z.string(),
  effectiveDate: z.string().optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

export async function hoaRoutes(app: FastifyInstance): Promise<void> {
  // ─────────────────────────────────────────────────────────────────────────
  // ASSOCIATIONS
  // ─────────────────────────────────────────────────────────────────────────

  // Create association
  app.post(
    '/',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof AssociationSchema> }>,
      reply
    ) => {
      const data = AssociationSchema.parse(request.body);

      const record = await prisma.hOAAssociation.create({
        data: {
          name: data.name,
          type: data.type as PrismaHOAAssociationType,
          propertyId: data.propertyId,
          managementCompany: data.managementCompany,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone,
          website: data.website,
          portalUrl: data.portalUrl,
          regularAssessment: data.regularAssessment,
          assessmentFrequency: data.assessmentFrequency as PrismaHOAAssessmentFrequency,
          specialAssessments: [],
          rules: [],
        },
      });

      const association = toAssociation(record);
      return reply.status(201).send(association);
    }
  );

  // List associations
  app.get(
    '/',
    async (
      request: FastifyRequest<{ Querystring: { propertyId?: string; type?: string } }>,
      reply
    ) => {
      const where: Prisma.HOAAssociationWhereInput = {};
      if (request.query.propertyId) {
        where.propertyId = request.query.propertyId;
      }
      if (request.query.type) {
        where.type = request.query.type as PrismaHOAAssociationType;
      }

      const records = await prisma.hOAAssociation.findMany({ where });
      const results = records.map(r => toAssociation(r)).filter((a): a is Association => a !== null);

      // Add annual cost calculation
      const associationsWithCost = results.map((a) => ({
        ...a,
        annualCost: calculateAnnualHOACost(a),
      }));

      return reply.send({ associations: associationsWithCost });
    }
  );

  // Get association
  app.get(
    '/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const record = await prisma.hOAAssociation.findUnique({
        where: { id: request.params.id },
      });
      const association = toAssociation(record);
      if (!association) {
        return reply.status(404).send({ error: 'Association not found' });
      }

      const assessmentRecords = await prisma.hOAAssessment.findMany({
        where: { associationId: association.id },
      });
      const assocAssessments = assessmentRecords.map(r => toAssessment(r)).filter((a): a is Assessment => a !== null);

      return reply.send({
        ...association,
        annualCost: calculateAnnualHOACost(association),
        assessmentSummary: getAssessmentSummary(assocAssessments),
      });
    }
  );

  // Update association
  app.patch(
    '/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: Partial<z.infer<typeof AssociationSchema>>;
      }>,
      reply
    ) => {
      const existing = await prisma.hOAAssociation.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Association not found' });
      }

      const updateData: Prisma.HOAAssociationUpdateInput = {};
      if (request.body.name !== undefined) updateData.name = request.body.name;
      if (request.body.type !== undefined) updateData.type = request.body.type as PrismaHOAAssociationType;
      if (request.body.managementCompany !== undefined) updateData.managementCompany = request.body.managementCompany;
      if (request.body.contactEmail !== undefined) updateData.contactEmail = request.body.contactEmail;
      if (request.body.contactPhone !== undefined) updateData.contactPhone = request.body.contactPhone;
      if (request.body.website !== undefined) updateData.website = request.body.website;
      if (request.body.portalUrl !== undefined) updateData.portalUrl = request.body.portalUrl;
      if (request.body.regularAssessment !== undefined) updateData.regularAssessment = request.body.regularAssessment;
      if (request.body.assessmentFrequency !== undefined) updateData.assessmentFrequency = request.body.assessmentFrequency as PrismaHOAAssessmentFrequency;

      const updated = await prisma.hOAAssociation.update({
        where: { id: request.params.id },
        data: updateData,
      });

      return reply.send(toAssociation(updated));
    }
  );

  // Add special assessment
  app.post(
    '/:id/special-assessments',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof SpecialAssessmentSchema>;
      }>,
      reply
    ) => {
      const existing = await prisma.hOAAssociation.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Association not found' });
      }

      const data = SpecialAssessmentSchema.parse(request.body);
      const specialAssessment: SpecialAssessment = {
        id: `sa_${Date.now()}`,
        description: data.description || data.reason || '',
        amount: data.amount || 0,
        dueDate: data.dueDate || new Date().toISOString().split('T')[0],
        reason: data.reason,
        isOneTime: data.isOneTime ?? true,
      };

      const currentSpecialAssessments = existing.specialAssessments as unknown as SpecialAssessment[];
      const updated = await prisma.hOAAssociation.update({
        where: { id: request.params.id },
        data: {
          specialAssessments: [...currentSpecialAssessments, specialAssessment] as unknown as Prisma.JsonValue,
        },
      });

      return reply.status(201).send(specialAssessment);
    }
  );

  // Add rule
  app.post(
    '/:id/rules',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof RuleSchema>;
      }>,
      reply
    ) => {
      const existing = await prisma.hOAAssociation.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Association not found' });
      }

      const data = RuleSchema.parse(request.body);
      const rule: AssociationRule = {
        id: `rule_${Date.now()}`,
        category: data.category || 'general',
        description: data.description || '',
        fineAmount: data.fineAmount,
      };

      const currentRules = existing.rules as unknown as AssociationRule[];
      const updated = await prisma.hOAAssociation.update({
        where: { id: request.params.id },
        data: {
          rules: [...currentRules, rule] as unknown as Prisma.JsonValue,
        },
      });

      return reply.status(201).send(rule);
    }
  );

  // Generate assessment schedule
  app.get(
    '/:id/schedule',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { startDate?: string; periods?: string };
      }>,
      reply
    ) => {
      const record = await prisma.hOAAssociation.findUnique({
        where: { id: request.params.id },
      });
      const association = toAssociation(record);
      if (!association) {
        return reply.status(404).send({ error: 'Association not found' });
      }

      const startDate = request.query.startDate || new Date().toISOString().split('T')[0];
      const periods = parseInt(request.query.periods || '12', 10);

      const schedule = calculateAssessmentSchedule(
        association.regularAssessment,
        association.assessmentFrequency,
        startDate,
        periods
      );

      return reply.send({ schedule });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ASSESSMENTS
  // ─────────────────────────────────────────────────────────────────────────

  // Create assessment
  app.post(
    '/assessments',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof AssessmentSchema> }>,
      reply
    ) => {
      const data = AssessmentSchema.parse(request.body);

      const record = await prisma.hOAAssessment.create({
        data: {
          associationId: data.associationId,
          propertyId: data.propertyId,
          unitId: data.unitId,
          type: data.type as PrismaHOAAssessmentType,
          description: data.description,
          amount: data.amount,
          dueDate: new Date(data.dueDate),
          status: 'pending' as PrismaHOAAssessmentStatus,
          paidAmount: 0,
        },
      });

      return reply.status(201).send(toAssessment(record));
    }
  );

  // List assessments
  app.get(
    '/assessments',
    async (
      request: FastifyRequest<{
        Querystring: { associationId?: string; propertyId?: string; status?: string };
      }>,
      reply
    ) => {
      const where: Prisma.HOAAssessmentWhereInput = {};
      if (request.query.associationId) {
        where.associationId = request.query.associationId;
      }
      if (request.query.propertyId) {
        where.propertyId = request.query.propertyId;
      }
      if (request.query.status) {
        where.status = request.query.status as PrismaHOAAssessmentStatus;
      }

      const records = await prisma.hOAAssessment.findMany({ where });
      const results = records.map(r => toAssessment(r)).filter((a): a is Assessment => a !== null);

      // Calculate late fees
      const assessmentsWithFees = results.map((a) => ({
        ...a,
        calculatedLateFee: calculateLateFee(a),
      }));

      return reply.send({
        assessments: assessmentsWithFees,
        summary: getAssessmentSummary(results),
      });
    }
  );

  // Record payment
  app.post(
    '/assessments/:id/payment',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof PaymentSchema>;
      }>,
      reply
    ) => {
      const existing = await prisma.hOAAssessment.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Assessment not found' });
      }

      const data = PaymentSchema.parse(request.body);
      const newPaidAmount = toNumber(existing.paidAmount) + data.amount;
      const newStatus = newPaidAmount >= toNumber(existing.amount) ? 'paid' : 'partial';

      const updated = await prisma.hOAAssessment.update({
        where: { id: request.params.id },
        data: {
          paidAmount: newPaidAmount,
          paidDate: new Date(),
          paymentReference: data.paymentReference,
          status: newStatus as PrismaHOAAssessmentStatus,
        },
      });

      return reply.send(toAssessment(updated));
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // VIOLATIONS
  // ─────────────────────────────────────────────────────────────────────────

  // Create violation
  app.post(
    '/violations',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof ViolationSchema> }>,
      reply
    ) => {
      const data = ViolationSchema.parse(request.body);
      const now = new Date();
      const nowStr = now.toISOString();

      const initialTimeline: ViolationEvent[] = [
        {
          id: `ve_${Date.now()}`,
          date: nowStr,
          action: 'reported',
          notes: 'Violation reported',
        },
      ];

      const record = await prisma.hOAViolation.create({
        data: {
          associationId: data.associationId,
          propertyId: data.propertyId,
          unitId: data.unitId,
          tenantId: data.tenantId,
          type: data.type as PrismaHOAViolationType,
          ruleId: data.ruleId,
          description: data.description,
          reportedDate: now,
          reportedBy: data.reportedBy,
          status: 'open' as PrismaHOAViolationStatus,
          finePaid: false,
          photos: data.photos as unknown as Prisma.JsonValue,
          timeline: initialTimeline as unknown as Prisma.JsonValue,
        },
      });

      return reply.status(201).send(toViolation(record));
    }
  );

  // List violations
  app.get(
    '/violations',
    async (
      request: FastifyRequest<{
        Querystring: {
          associationId?: string;
          propertyId?: string;
          status?: string;
          type?: string;
        };
      }>,
      reply
    ) => {
      const where: Prisma.HOAViolationWhereInput = {};
      if (request.query.associationId) {
        where.associationId = request.query.associationId;
      }
      if (request.query.propertyId) {
        where.propertyId = request.query.propertyId;
      }
      if (request.query.status) {
        where.status = request.query.status as PrismaHOAViolationStatus;
      }
      if (request.query.type) {
        where.type = request.query.type as PrismaHOAViolationType;
      }

      const records = await prisma.hOAViolation.findMany({ where });
      const results = records.map(r => toViolation(r)).filter((v): v is Violation => v !== null);

      // Add escalation info
      const violationsWithEscalation = results.map((v) => ({
        ...v,
        escalation: getViolationEscalationLevel(v),
      }));

      return reply.send({ violations: violationsWithEscalation });
    }
  );

  // Get violation
  app.get(
    '/violations/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const record = await prisma.hOAViolation.findUnique({
        where: { id: request.params.id },
      });
      const violation = toViolation(record);
      if (!violation) {
        return reply.status(404).send({ error: 'Violation not found' });
      }

      return reply.send({
        ...violation,
        escalation: getViolationEscalationLevel(violation),
      });
    }
  );

  // Add violation action
  app.post(
    '/violations/:id/actions',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof ViolationActionSchema>;
      }>,
      reply
    ) => {
      const existing = await prisma.hOAViolation.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Violation not found' });
      }

      const data = ViolationActionSchema.parse(request.body);
      const now = new Date();
      const nowStr = now.toISOString();

      const event: ViolationEvent = {
        id: `ve_${Date.now()}`,
        date: nowStr,
        action: data.action,
        notes: data.notes,
      };

      const currentTimeline = existing.timeline as unknown as ViolationEvent[];
      const updateData: Prisma.HOAViolationUpdateInput = {
        timeline: [...currentTimeline, event] as unknown as Prisma.JsonValue,
      };

      // Update status based on action
      if (data.action === 'warning_sent') {
        updateData.status = 'warning_sent' as PrismaHOAViolationStatus;
      } else if (data.action === 'fine_issued') {
        updateData.status = 'fine_issued' as PrismaHOAViolationStatus;
        updateData.fineAmount = data.fineAmount;
        updateData.fineDueDate = data.fineDueDate ? new Date(data.fineDueDate) : undefined;
      } else if (data.action === 'resolved') {
        updateData.status = 'resolved' as PrismaHOAViolationStatus;
        updateData.resolvedDate = now;
        updateData.resolutionNotes = data.notes;
      } else if (data.action === 'escalated') {
        updateData.status = 'escalated' as PrismaHOAViolationStatus;
      }

      const updated = await prisma.hOAViolation.update({
        where: { id: request.params.id },
        data: updateData,
      });

      return reply.send(toViolation(updated));
    }
  );

  // Record fine payment
  app.post(
    '/violations/:id/pay-fine',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const existing = await prisma.hOAViolation.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Violation not found' });
      }

      const now = new Date();
      const currentTimeline = existing.timeline as unknown as ViolationEvent[];
      const newEvent: ViolationEvent = {
        id: `ve_${Date.now()}`,
        date: now.toISOString(),
        action: 'fine_paid',
        notes: `Fine of $${toNumber(existing.fineAmount)} paid`,
      };

      const updated = await prisma.hOAViolation.update({
        where: { id: request.params.id },
        data: {
          finePaid: true,
          timeline: [...currentTimeline, newEvent] as unknown as Prisma.JsonValue,
        },
      });

      return reply.send(toViolation(updated));
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ARCHITECTURAL REQUESTS
  // ─────────────────────────────────────────────────────────────────────────

  // Create request
  app.post(
    '/architectural-requests',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof ArchitecturalRequestSchema> }>,
      reply
    ) => {
      const data = ArchitecturalRequestSchema.parse(request.body);
      const now = new Date();

      const record = await prisma.hOAArchitecturalRequest.create({
        data: {
          associationId: data.associationId,
          propertyId: data.propertyId,
          unitId: data.unitId,
          requestType: data.requestType,
          description: data.description,
          proposedChanges: data.proposedChanges,
          estimatedCost: data.estimatedCost,
          contractor: data.contractor,
          startDate: data.startDate ? new Date(data.startDate) : undefined,
          endDate: data.endDate ? new Date(data.endDate) : undefined,
          status: 'submitted' as PrismaHOAArchitecturalRequestStatus,
          submittedDate: now,
          documents: data.documents as unknown as Prisma.JsonValue,
        },
      });

      return reply.status(201).send(toArchitecturalRequest(record));
    }
  );

  // List requests
  app.get(
    '/architectural-requests',
    async (
      request: FastifyRequest<{
        Querystring: { associationId?: string; propertyId?: string; status?: string };
      }>,
      reply
    ) => {
      const where: Prisma.HOAArchitecturalRequestWhereInput = {};
      if (request.query.associationId) {
        where.associationId = request.query.associationId;
      }
      if (request.query.propertyId) {
        where.propertyId = request.query.propertyId;
      }
      if (request.query.status) {
        where.status = request.query.status as PrismaHOAArchitecturalRequestStatus;
      }

      const records = await prisma.hOAArchitecturalRequest.findMany({ where });
      const results = records.map(r => toArchitecturalRequest(r)).filter((r): r is ArchitecturalRequest => r !== null);

      return reply.send({ requests: results });
    }
  );

  // Review request
  app.post(
    '/architectural-requests/:id/review',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof RequestReviewSchema>;
      }>,
      reply
    ) => {
      const existing = await prisma.hOAArchitecturalRequest.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Request not found' });
      }

      const data = RequestReviewSchema.parse(request.body);
      const updated = await prisma.hOAArchitecturalRequest.update({
        where: { id: request.params.id },
        data: {
          status: data.status as PrismaHOAArchitecturalRequestStatus,
          reviewDate: new Date(),
          reviewNotes: data.reviewNotes,
          conditions: data.conditions as unknown as Prisma.JsonValue,
        },
      });

      return reply.send(toArchitecturalRequest(updated));
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // BOARD MEETINGS
  // ─────────────────────────────────────────────────────────────────────────

  // Create meeting
  app.post(
    '/meetings',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof BoardMeetingSchema> }>,
      reply
    ) => {
      const data = BoardMeetingSchema.parse(request.body);

      const record = await prisma.hOABoardMeeting.create({
        data: {
          associationId: data.associationId,
          title: data.title,
          date: new Date(data.date),
          location: data.location,
          virtualLink: data.virtualLink,
          agenda: data.agenda as unknown as Prisma.JsonValue,
          attendees: [],
          status: 'scheduled' as PrismaHOAMeetingStatus,
        },
      });

      return reply.status(201).send(toBoardMeeting(record));
    }
  );

  // List meetings
  app.get(
    '/meetings',
    async (
      request: FastifyRequest<{
        Querystring: { associationId?: string; status?: string };
      }>,
      reply
    ) => {
      const where: Prisma.HOABoardMeetingWhereInput = {};
      if (request.query.associationId) {
        where.associationId = request.query.associationId;
      }
      if (request.query.status) {
        where.status = request.query.status as PrismaHOAMeetingStatus;
      }

      const records = await prisma.hOABoardMeeting.findMany({
        where,
        orderBy: { date: 'desc' },
      });
      const results = records.map(r => toBoardMeeting(r)).filter((m): m is BoardMeeting => m !== null);

      return reply.send({ meetings: results });
    }
  );

  // Update meeting (add minutes, attendees, etc.)
  app.patch(
    '/meetings/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { minutes?: string; attendees?: string[]; status?: string };
      }>,
      reply
    ) => {
      const existing = await prisma.hOABoardMeeting.findUnique({
        where: { id: request.params.id },
      });
      if (!existing) {
        return reply.status(404).send({ error: 'Meeting not found' });
      }

      const updateData: Prisma.HOABoardMeetingUpdateInput = {};
      if (request.body.minutes) updateData.minutes = request.body.minutes;
      if (request.body.attendees) updateData.attendees = request.body.attendees as unknown as Prisma.JsonValue;
      if (request.body.status) updateData.status = request.body.status as PrismaHOAMeetingStatus;

      const updated = await prisma.hOABoardMeeting.update({
        where: { id: request.params.id },
        data: updateData,
      });

      return reply.send(toBoardMeeting(updated));
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // DOCUMENTS
  // ─────────────────────────────────────────────────────────────────────────

  // Upload document
  app.post(
    '/documents',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof DocumentSchema> }>,
      reply
    ) => {
      const data = DocumentSchema.parse(request.body);
      const user = (request as unknown as { user?: { id: string } }).user;

      const record = await prisma.hOADocument.create({
        data: {
          associationId: data.associationId,
          name: data.name,
          type: data.type as PrismaHOADocumentType,
          fileUrl: data.fileUrl,
          effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : undefined,
          uploadedBy: user?.id || 'system',
        },
      });

      return reply.status(201).send(toAssociationDocument(record));
    }
  );

  // List documents
  app.get(
    '/documents',
    async (
      request: FastifyRequest<{
        Querystring: { associationId?: string; type?: string };
      }>,
      reply
    ) => {
      const where: Prisma.HOADocumentWhereInput = {};
      if (request.query.associationId) {
        where.associationId = request.query.associationId;
      }
      if (request.query.type) {
        where.type = request.query.type as PrismaHOADocumentType;
      }

      const records = await prisma.hOADocument.findMany({ where });
      const results = records.map(r => toAssociationDocument(r)).filter((d): d is AssociationDocument => d !== null);

      return reply.send({ documents: results });
    }
  );
}
