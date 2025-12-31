import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

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
// IN-MEMORY STORAGE
// ============================================================================

const associations = new Map<string, Association>();
const assessments = new Map<string, Assessment>();
const violations = new Map<string, Violation>();
const architecturalRequests = new Map<string, ArchitecturalRequest>();
const boardMeetings = new Map<string, BoardMeeting>();
const associationDocuments = new Map<string, AssociationDocument>();

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
      const now = new Date().toISOString();

      const association: Association = {
        id: `hoa_${Date.now()}`,
        ...data,
        specialAssessments: [],
        rules: [],
        createdAt: now,
        updatedAt: now,
      };

      associations.set(association.id, association);
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
      let results = Array.from(associations.values());

      if (request.query.propertyId) {
        results = results.filter((a) => a.propertyId === request.query.propertyId);
      }
      if (request.query.type) {
        results = results.filter((a) => a.type === request.query.type);
      }

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
      const association = associations.get(request.params.id);
      if (!association) {
        return reply.status(404).send({ error: 'Association not found' });
      }

      const assocAssessments = Array.from(assessments.values()).filter(
        (a) => a.associationId === association.id
      );

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
      const association = associations.get(request.params.id);
      if (!association) {
        return reply.status(404).send({ error: 'Association not found' });
      }

      Object.assign(association, request.body, { updatedAt: new Date().toISOString() });
      associations.set(association.id, association);
      return reply.send(association);
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
      const association = associations.get(request.params.id);
      if (!association) {
        return reply.status(404).send({ error: 'Association not found' });
      }

      const data = SpecialAssessmentSchema.parse(request.body);
      const specialAssessment: SpecialAssessment = {
        id: `sa_${Date.now()}`,
        ...data,
      };

      association.specialAssessments.push(specialAssessment);
      association.updatedAt = new Date().toISOString();
      associations.set(association.id, association);

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
      const association = associations.get(request.params.id);
      if (!association) {
        return reply.status(404).send({ error: 'Association not found' });
      }

      const data = RuleSchema.parse(request.body);
      const rule: AssociationRule = {
        id: `rule_${Date.now()}`,
        ...data,
      };

      association.rules.push(rule);
      association.updatedAt = new Date().toISOString();
      associations.set(association.id, association);

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
      const association = associations.get(request.params.id);
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
      const now = new Date().toISOString();

      const assessment: Assessment = {
        id: `assess_${Date.now()}`,
        ...data,
        status: 'pending',
        paidAmount: 0,
        createdAt: now,
        updatedAt: now,
      };

      assessments.set(assessment.id, assessment);
      return reply.status(201).send(assessment);
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
      let results = Array.from(assessments.values());

      if (request.query.associationId) {
        results = results.filter((a) => a.associationId === request.query.associationId);
      }
      if (request.query.propertyId) {
        results = results.filter((a) => a.propertyId === request.query.propertyId);
      }
      if (request.query.status) {
        results = results.filter((a) => a.status === request.query.status);
      }

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
      const assessment = assessments.get(request.params.id);
      if (!assessment) {
        return reply.status(404).send({ error: 'Assessment not found' });
      }

      const data = PaymentSchema.parse(request.body);
      assessment.paidAmount += data.amount;
      assessment.paidDate = new Date().toISOString();
      assessment.paymentReference = data.paymentReference;
      assessment.status = assessment.paidAmount >= assessment.amount ? 'paid' : 'partial';
      assessment.updatedAt = new Date().toISOString();

      assessments.set(assessment.id, assessment);
      return reply.send(assessment);
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
      const now = new Date().toISOString();

      const violation: Violation = {
        id: `vio_${Date.now()}`,
        ...data,
        reportedDate: now,
        status: 'open',
        finePaid: false,
        timeline: [
          {
            id: `ve_${Date.now()}`,
            date: now,
            action: 'reported',
            notes: 'Violation reported',
          },
        ],
        createdAt: now,
        updatedAt: now,
      };

      violations.set(violation.id, violation);
      return reply.status(201).send(violation);
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
      let results = Array.from(violations.values());

      if (request.query.associationId) {
        results = results.filter((v) => v.associationId === request.query.associationId);
      }
      if (request.query.propertyId) {
        results = results.filter((v) => v.propertyId === request.query.propertyId);
      }
      if (request.query.status) {
        results = results.filter((v) => v.status === request.query.status);
      }
      if (request.query.type) {
        results = results.filter((v) => v.type === request.query.type);
      }

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
      const violation = violations.get(request.params.id);
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
      const violation = violations.get(request.params.id);
      if (!violation) {
        return reply.status(404).send({ error: 'Violation not found' });
      }

      const data = ViolationActionSchema.parse(request.body);
      const now = new Date().toISOString();

      const event: ViolationEvent = {
        id: `ve_${Date.now()}`,
        date: now,
        action: data.action,
        notes: data.notes,
      };

      violation.timeline.push(event);

      // Update status based on action
      if (data.action === 'warning_sent') {
        violation.status = 'warning_sent';
      } else if (data.action === 'fine_issued') {
        violation.status = 'fine_issued';
        violation.fineAmount = data.fineAmount;
        violation.fineDueDate = data.fineDueDate;
      } else if (data.action === 'resolved') {
        violation.status = 'resolved';
        violation.resolvedDate = now;
        violation.resolutionNotes = data.notes;
      } else if (data.action === 'escalated') {
        violation.status = 'escalated';
      }

      violation.updatedAt = now;
      violations.set(violation.id, violation);
      return reply.send(violation);
    }
  );

  // Record fine payment
  app.post(
    '/violations/:id/pay-fine',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const violation = violations.get(request.params.id);
      if (!violation) {
        return reply.status(404).send({ error: 'Violation not found' });
      }

      violation.finePaid = true;
      violation.timeline.push({
        id: `ve_${Date.now()}`,
        date: new Date().toISOString(),
        action: 'fine_paid',
        notes: `Fine of $${violation.fineAmount} paid`,
      });
      violation.updatedAt = new Date().toISOString();

      violations.set(violation.id, violation);
      return reply.send(violation);
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
      const now = new Date().toISOString();

      const archRequest: ArchitecturalRequest = {
        id: `ar_${Date.now()}`,
        ...data,
        status: 'submitted',
        submittedDate: now,
        createdAt: now,
        updatedAt: now,
      };

      architecturalRequests.set(archRequest.id, archRequest);
      return reply.status(201).send(archRequest);
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
      let results = Array.from(architecturalRequests.values());

      if (request.query.associationId) {
        results = results.filter((r) => r.associationId === request.query.associationId);
      }
      if (request.query.propertyId) {
        results = results.filter((r) => r.propertyId === request.query.propertyId);
      }
      if (request.query.status) {
        results = results.filter((r) => r.status === request.query.status);
      }

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
      const archRequest = architecturalRequests.get(request.params.id);
      if (!archRequest) {
        return reply.status(404).send({ error: 'Request not found' });
      }

      const data = RequestReviewSchema.parse(request.body);
      archRequest.status = data.status;
      archRequest.reviewDate = new Date().toISOString();
      archRequest.reviewNotes = data.reviewNotes;
      archRequest.conditions = data.conditions;
      archRequest.updatedAt = new Date().toISOString();

      architecturalRequests.set(archRequest.id, archRequest);
      return reply.send(archRequest);
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

      const meeting: BoardMeeting = {
        id: `mtg_${Date.now()}`,
        ...data,
        attendees: [],
        status: 'scheduled',
        createdAt: new Date().toISOString(),
      };

      boardMeetings.set(meeting.id, meeting);
      return reply.status(201).send(meeting);
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
      let results = Array.from(boardMeetings.values());

      if (request.query.associationId) {
        results = results.filter((m) => m.associationId === request.query.associationId);
      }
      if (request.query.status) {
        results = results.filter((m) => m.status === request.query.status);
      }

      return reply.send({ meetings: results.sort((a, b) => b.date.localeCompare(a.date)) });
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
      const meeting = boardMeetings.get(request.params.id);
      if (!meeting) {
        return reply.status(404).send({ error: 'Meeting not found' });
      }

      if (request.body.minutes) meeting.minutes = request.body.minutes;
      if (request.body.attendees) meeting.attendees = request.body.attendees;
      if (request.body.status) meeting.status = request.body.status as BoardMeeting['status'];

      boardMeetings.set(meeting.id, meeting);
      return reply.send(meeting);
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

      const doc: AssociationDocument = {
        id: `doc_${Date.now()}`,
        ...data,
        uploadedBy: user?.id || 'system',
        createdAt: new Date().toISOString(),
      };

      associationDocuments.set(doc.id, doc);
      return reply.status(201).send(doc);
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
      let results = Array.from(associationDocuments.values());

      if (request.query.associationId) {
        results = results.filter((d) => d.associationId === request.query.associationId);
      }
      if (request.query.type) {
        results = results.filter((d) => d.type === request.query.type);
      }

      return reply.send({ documents: results });
    }
  );
}

// Export for testing
export {
  associations,
  assessments,
  violations,
  architecturalRequests,
  boardMeetings,
  associationDocuments,
};
