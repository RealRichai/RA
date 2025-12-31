import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Types
interface LeaseViolation {
  id: string;
  propertyId: string;
  unitId: string;
  leaseId: string;
  tenantId: string;
  violationType: ViolationType;
  severity: 'minor' | 'moderate' | 'severe' | 'critical';
  description: string;
  evidence?: ViolationEvidence[];
  witnesses?: string[];
  occurredAt: Date;
  reportedAt: Date;
  reportedBy: string;
  status: 'reported' | 'under_review' | 'notice_sent' | 'cure_period' | 'hearing_scheduled' | 'resolved' | 'escalated';
  notices: ViolationNotice[];
  fines: ViolationFine[];
  hearings: ViolationHearing[];
  cureDeadline?: Date;
  curedAt?: Date;
  resolution?: {
    type: 'cured' | 'fine_paid' | 'eviction_filed' | 'dismissed' | 'settled';
    notes: string;
    resolvedAt: Date;
    resolvedBy: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

type ViolationType =
  | 'noise'
  | 'pet_violation'
  | 'unauthorized_occupant'
  | 'property_damage'
  | 'parking_violation'
  | 'lease_term_violation'
  | 'health_safety'
  | 'illegal_activity'
  | 'non_payment'
  | 'subletting'
  | 'maintenance_neglect'
  | 'common_area_misuse'
  | 'other';

interface ViolationEvidence {
  id: string;
  type: 'photo' | 'video' | 'document' | 'audio' | 'written_statement';
  description: string;
  fileUrl?: string;
  capturedAt: Date;
  capturedBy: string;
}

interface ViolationNotice {
  id: string;
  violationId: string;
  noticeType: 'warning' | 'cure_or_quit' | 'pay_or_quit' | 'unconditional_quit' | 'final_notice';
  templateId?: string;
  content: string;
  deliveryMethod: 'certified_mail' | 'hand_delivered' | 'posted' | 'email';
  sentAt: Date;
  deliveredAt?: Date;
  trackingNumber?: string;
  curePeriodDays?: number;
  responseDeadline?: Date;
  createdBy: string;
}

interface ViolationFine {
  id: string;
  violationId: string;
  amount: number;
  reason: string;
  dueDate: Date;
  status: 'pending' | 'paid' | 'waived' | 'sent_to_collections';
  paidAt?: Date;
  paidAmount?: number;
  paymentMethod?: string;
  waivedReason?: string;
  createdAt: Date;
}

interface ViolationHearing {
  id: string;
  violationId: string;
  hearingType: 'internal_review' | 'mediation' | 'arbitration' | 'court';
  scheduledAt: Date;
  location?: string;
  virtualMeetingUrl?: string;
  attendees: string[];
  status: 'scheduled' | 'completed' | 'postponed' | 'cancelled';
  outcome?: 'in_favor_landlord' | 'in_favor_tenant' | 'settled' | 'dismissed';
  notes?: string;
  documents?: string[];
  completedAt?: Date;
}

interface ViolationTemplate {
  id: string;
  propertyId?: string; // null for system templates
  name: string;
  violationType: ViolationType;
  noticeType: string;
  content: string;
  curePeriodDays: number;
  fineAmount?: number;
  isActive: boolean;
  createdAt: Date;
}

interface ViolationPolicy {
  id: string;
  propertyId: string;
  violationType: ViolationType;
  firstOffenseFine?: number;
  repeatOffenseFine?: number;
  curePeriodDays: number;
  maxViolationsBeforeEviction: number;
  escalationPath: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory stores
export const leaseViolations = new Map<string, LeaseViolation>();
export const violationNotices = new Map<string, ViolationNotice>();
export const violationFines = new Map<string, ViolationFine>();
export const violationHearings = new Map<string, ViolationHearing>();
export const violationTemplates = new Map<string, ViolationTemplate>();
export const violationPolicies = new Map<string, ViolationPolicy>();

// Helper functions
export function getViolationCount(tenantId: string, violationType?: ViolationType): number {
  return Array.from(leaseViolations.values()).filter(v =>
    v.tenantId === tenantId &&
    (!violationType || v.violationType === violationType)
  ).length;
}

export function calculateFine(
  propertyId: string,
  violationType: ViolationType,
  tenantId: string
): number {
  const policy = Array.from(violationPolicies.values()).find(
    p => p.propertyId === propertyId && p.violationType === violationType && p.isActive
  );

  if (!policy) return 0;

  const priorViolations = getViolationCount(tenantId, violationType);
  return priorViolations === 0
    ? (policy.firstOffenseFine || 0)
    : (policy.repeatOffenseFine || policy.firstOffenseFine || 0);
}

export function shouldEscalate(violation: LeaseViolation): boolean {
  const priorViolations = getViolationCount(violation.tenantId, violation.violationType);
  const policy = Array.from(violationPolicies.values()).find(
    p => p.propertyId === violation.propertyId && p.violationType === violation.violationType
  );

  if (!policy) return false;
  return priorViolations >= policy.maxViolationsBeforeEviction;
}

export function getCurePeriod(propertyId: string, violationType: ViolationType): number {
  const policy = Array.from(violationPolicies.values()).find(
    p => p.propertyId === propertyId && p.violationType === violationType && p.isActive
  );

  return policy?.curePeriodDays || 14; // Default 14 days
}

export function getViolationStats(propertyId: string): {
  totalActive: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  pendingFines: number;
  totalFinesCollected: number;
  upcomingHearings: number;
} {
  const violations = Array.from(leaseViolations.values()).filter(v => v.propertyId === propertyId);
  const fines = Array.from(violationFines.values());
  const hearings = Array.from(violationHearings.values());
  const now = new Date();

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const v of violations) {
    byType[v.violationType] = (byType[v.violationType] || 0) + 1;
    bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
    byStatus[v.status] = (byStatus[v.status] || 0) + 1;
  }

  const violationIds = new Set(violations.map(v => v.id));
  const relatedFines = fines.filter(f => violationIds.has(f.violationId));
  const relatedHearings = hearings.filter(h => violationIds.has(h.violationId));

  return {
    totalActive: violations.filter(v => !['resolved', 'escalated'].includes(v.status)).length,
    byType,
    bySeverity,
    byStatus,
    pendingFines: relatedFines.filter(f => f.status === 'pending').reduce((sum, f) => sum + f.amount, 0),
    totalFinesCollected: relatedFines.filter(f => f.status === 'paid').reduce((sum, f) => sum + (f.paidAmount || f.amount), 0),
    upcomingHearings: relatedHearings.filter(h => h.status === 'scheduled' && h.scheduledAt > now).length
  };
}

export function getTenantViolationHistory(tenantId: string): {
  violations: LeaseViolation[];
  totalFinesPaid: number;
  totalFinesOwed: number;
  isRepeatOffender: boolean;
} {
  const violations = Array.from(leaseViolations.values()).filter(v => v.tenantId === tenantId);
  const fines = Array.from(violationFines.values()).filter(f =>
    violations.some(v => v.id === f.violationId)
  );

  return {
    violations,
    totalFinesPaid: fines.filter(f => f.status === 'paid').reduce((sum, f) => sum + (f.paidAmount || f.amount), 0),
    totalFinesOwed: fines.filter(f => f.status === 'pending').reduce((sum, f) => sum + f.amount, 0),
    isRepeatOffender: violations.length >= 3
  };
}

export function generateNoticeContent(
  template: ViolationTemplate,
  violation: LeaseViolation,
  cureDeadline: Date
): string {
  return template.content
    .replace('{{violation_type}}', violation.violationType)
    .replace('{{violation_date}}', violation.occurredAt.toISOString().split('T')[0])
    .replace('{{description}}', violation.description)
    .replace('{{cure_deadline}}', cureDeadline.toISOString().split('T')[0])
    .replace('{{fine_amount}}', template.fineAmount?.toString() || '0');
}

// Schemas
const violationSchema = z.object({
  propertyId: z.string(),
  unitId: z.string(),
  leaseId: z.string(),
  tenantId: z.string(),
  violationType: z.enum([
    'noise', 'pet_violation', 'unauthorized_occupant', 'property_damage',
    'parking_violation', 'lease_term_violation', 'health_safety', 'illegal_activity',
    'non_payment', 'subletting', 'maintenance_neglect', 'common_area_misuse', 'other'
  ]),
  severity: z.enum(['minor', 'moderate', 'severe', 'critical']),
  description: z.string(),
  occurredAt: z.string().transform(s => new Date(s)),
  reportedBy: z.string(),
  witnesses: z.array(z.string()).optional()
});

const evidenceSchema = z.object({
  type: z.enum(['photo', 'video', 'document', 'audio', 'written_statement']),
  description: z.string(),
  fileUrl: z.string().optional(),
  capturedBy: z.string()
});

const noticeSchema = z.object({
  violationId: z.string(),
  noticeType: z.enum(['warning', 'cure_or_quit', 'pay_or_quit', 'unconditional_quit', 'final_notice']),
  templateId: z.string().optional(),
  content: z.string(),
  deliveryMethod: z.enum(['certified_mail', 'hand_delivered', 'posted', 'email']),
  curePeriodDays: z.number().optional(),
  createdBy: z.string()
});

const fineSchema = z.object({
  violationId: z.string(),
  amount: z.number().positive(),
  reason: z.string(),
  dueDate: z.string().transform(s => new Date(s))
});

const hearingSchema = z.object({
  violationId: z.string(),
  hearingType: z.enum(['internal_review', 'mediation', 'arbitration', 'court']),
  scheduledAt: z.string().transform(s => new Date(s)),
  location: z.string().optional(),
  virtualMeetingUrl: z.string().optional(),
  attendees: z.array(z.string())
});

const templateSchema = z.object({
  propertyId: z.string().optional(),
  name: z.string(),
  violationType: z.enum([
    'noise', 'pet_violation', 'unauthorized_occupant', 'property_damage',
    'parking_violation', 'lease_term_violation', 'health_safety', 'illegal_activity',
    'non_payment', 'subletting', 'maintenance_neglect', 'common_area_misuse', 'other'
  ]),
  noticeType: z.string(),
  content: z.string(),
  curePeriodDays: z.number().min(1),
  fineAmount: z.number().optional()
});

const policySchema = z.object({
  propertyId: z.string(),
  violationType: z.enum([
    'noise', 'pet_violation', 'unauthorized_occupant', 'property_damage',
    'parking_violation', 'lease_term_violation', 'health_safety', 'illegal_activity',
    'non_payment', 'subletting', 'maintenance_neglect', 'common_area_misuse', 'other'
  ]),
  firstOffenseFine: z.number().optional(),
  repeatOffenseFine: z.number().optional(),
  curePeriodDays: z.number().min(1),
  maxViolationsBeforeEviction: z.number().min(1),
  escalationPath: z.array(z.string())
});

export async function violationRoutes(app: FastifyInstance): Promise<void> {
  // Violations
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = violationSchema.parse(request.body);

    const id = `violation_${Date.now()}`;
    const violation: LeaseViolation = {
      id,
      ...data,
      evidence: [],
      reportedAt: new Date(),
      status: 'reported',
      notices: [],
      fines: [],
      hearings: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Check if should escalate immediately
    if (shouldEscalate(violation)) {
      violation.status = 'escalated';
    }

    leaseViolations.set(id, violation);
    return reply.status(201).send(violation);
  });

  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, tenantId, status, violationType } = request.query as {
      propertyId?: string;
      tenantId?: string;
      status?: string;
      violationType?: string;
    };

    let violations = Array.from(leaseViolations.values());

    if (propertyId) violations = violations.filter(v => v.propertyId === propertyId);
    if (tenantId) violations = violations.filter(v => v.tenantId === tenantId);
    if (status) violations = violations.filter(v => v.status === status);
    if (violationType) violations = violations.filter(v => v.violationType === violationType);

    return reply.send(violations);
  });

  app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const violation = leaseViolations.get(id);
    if (!violation) return reply.status(404).send({ error: 'Violation not found' });
    return reply.send(violation);
  });

  app.patch('/:id/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: string };

    const violation = leaseViolations.get(id);
    if (!violation) return reply.status(404).send({ error: 'Violation not found' });

    violation.status = status as LeaseViolation['status'];
    violation.updatedAt = new Date();
    leaseViolations.set(id, violation);

    return reply.send(violation);
  });

  // Evidence
  app.post('/:id/evidence', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = evidenceSchema.parse(request.body);

    const violation = leaseViolations.get(id);
    if (!violation) return reply.status(404).send({ error: 'Violation not found' });

    const evidence: ViolationEvidence = {
      id: `evidence_${Date.now()}`,
      ...data,
      capturedAt: new Date()
    };

    violation.evidence = violation.evidence || [];
    violation.evidence.push(evidence);
    violation.updatedAt = new Date();
    leaseViolations.set(id, violation);

    return reply.status(201).send(evidence);
  });

  // Notices
  app.post('/notices', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = noticeSchema.parse(request.body);

    const violation = leaseViolations.get(data.violationId);
    if (!violation) return reply.status(404).send({ error: 'Violation not found' });

    const id = `notice_${Date.now()}`;
    const curePeriodDays = data.curePeriodDays || getCurePeriod(violation.propertyId, violation.violationType);
    const responseDeadline = new Date();
    responseDeadline.setDate(responseDeadline.getDate() + curePeriodDays);

    const notice: ViolationNotice = {
      id,
      ...data,
      sentAt: new Date(),
      curePeriodDays,
      responseDeadline
    };

    violationNotices.set(id, notice);
    violation.notices.push(notice);
    violation.status = 'notice_sent';
    violation.cureDeadline = responseDeadline;
    violation.updatedAt = new Date();
    leaseViolations.set(violation.id, violation);

    return reply.status(201).send(notice);
  });

  app.get('/notices', async (request: FastifyRequest, reply: FastifyReply) => {
    const { violationId } = request.query as { violationId?: string };
    let notices = Array.from(violationNotices.values());

    if (violationId) notices = notices.filter(n => n.violationId === violationId);

    return reply.send(notices);
  });

  app.patch('/notices/:id/delivered', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { trackingNumber } = request.body as { trackingNumber?: string };

    const notice = violationNotices.get(id);
    if (!notice) return reply.status(404).send({ error: 'Notice not found' });

    notice.deliveredAt = new Date();
    if (trackingNumber) notice.trackingNumber = trackingNumber;
    violationNotices.set(id, notice);

    // Update violation status
    const violation = leaseViolations.get(notice.violationId);
    if (violation) {
      violation.status = 'cure_period';
      violation.updatedAt = new Date();
      leaseViolations.set(violation.id, violation);
    }

    return reply.send(notice);
  });

  // Fines
  app.post('/fines', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = fineSchema.parse(request.body);

    const violation = leaseViolations.get(data.violationId);
    if (!violation) return reply.status(404).send({ error: 'Violation not found' });

    const id = `fine_${Date.now()}`;
    const fine: ViolationFine = {
      id,
      ...data,
      status: 'pending',
      createdAt: new Date()
    };

    violationFines.set(id, fine);
    violation.fines.push(fine);
    violation.updatedAt = new Date();
    leaseViolations.set(violation.id, violation);

    return reply.status(201).send(fine);
  });

  app.get('/fines', async (request: FastifyRequest, reply: FastifyReply) => {
    const { violationId, status } = request.query as { violationId?: string; status?: string };
    let fines = Array.from(violationFines.values());

    if (violationId) fines = fines.filter(f => f.violationId === violationId);
    if (status) fines = fines.filter(f => f.status === status);

    return reply.send(fines);
  });

  app.post('/fines/:id/pay', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { amount, paymentMethod } = request.body as { amount: number; paymentMethod: string };

    const fine = violationFines.get(id);
    if (!fine) return reply.status(404).send({ error: 'Fine not found' });

    fine.status = 'paid';
    fine.paidAt = new Date();
    fine.paidAmount = amount;
    fine.paymentMethod = paymentMethod;
    violationFines.set(id, fine);

    return reply.send(fine);
  });

  app.post('/fines/:id/waive', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { reason } = request.body as { reason: string };

    const fine = violationFines.get(id);
    if (!fine) return reply.status(404).send({ error: 'Fine not found' });

    fine.status = 'waived';
    fine.waivedReason = reason;
    violationFines.set(id, fine);

    return reply.send(fine);
  });

  // Hearings
  app.post('/hearings', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = hearingSchema.parse(request.body);

    const violation = leaseViolations.get(data.violationId);
    if (!violation) return reply.status(404).send({ error: 'Violation not found' });

    const id = `hearing_${Date.now()}`;
    const hearing: ViolationHearing = {
      id,
      ...data,
      status: 'scheduled'
    };

    violationHearings.set(id, hearing);
    violation.hearings.push(hearing);
    violation.status = 'hearing_scheduled';
    violation.updatedAt = new Date();
    leaseViolations.set(violation.id, violation);

    return reply.status(201).send(hearing);
  });

  app.get('/hearings', async (request: FastifyRequest, reply: FastifyReply) => {
    const { violationId, status } = request.query as { violationId?: string; status?: string };
    let hearings = Array.from(violationHearings.values());

    if (violationId) hearings = hearings.filter(h => h.violationId === violationId);
    if (status) hearings = hearings.filter(h => h.status === status);

    return reply.send(hearings);
  });

  app.patch('/hearings/:id/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { outcome, notes } = request.body as { outcome: string; notes?: string };

    const hearing = violationHearings.get(id);
    if (!hearing) return reply.status(404).send({ error: 'Hearing not found' });

    hearing.status = 'completed';
    hearing.outcome = outcome as ViolationHearing['outcome'];
    hearing.notes = notes;
    hearing.completedAt = new Date();
    violationHearings.set(id, hearing);

    return reply.send(hearing);
  });

  // Resolve violation
  app.post('/:id/resolve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { type, notes, resolvedBy } = request.body as {
      type: 'cured' | 'fine_paid' | 'eviction_filed' | 'dismissed' | 'settled';
      notes: string;
      resolvedBy: string;
    };

    const violation = leaseViolations.get(id);
    if (!violation) return reply.status(404).send({ error: 'Violation not found' });

    violation.status = 'resolved';
    violation.resolution = {
      type,
      notes,
      resolvedAt: new Date(),
      resolvedBy
    };
    if (type === 'cured') {
      violation.curedAt = new Date();
    }
    violation.updatedAt = new Date();
    leaseViolations.set(id, violation);

    return reply.send(violation);
  });

  // Templates
  app.post('/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = templateSchema.parse(request.body);

    const id = `vtemplate_${Date.now()}`;
    const template: ViolationTemplate = {
      id,
      ...data,
      isActive: true,
      createdAt: new Date()
    };

    violationTemplates.set(id, template);
    return reply.status(201).send(template);
  });

  app.get('/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, violationType } = request.query as { propertyId?: string; violationType?: string };
    let templates = Array.from(violationTemplates.values()).filter(t => t.isActive);

    if (propertyId) templates = templates.filter(t => !t.propertyId || t.propertyId === propertyId);
    if (violationType) templates = templates.filter(t => t.violationType === violationType);

    return reply.send(templates);
  });

  // Policies
  app.post('/policies', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = policySchema.parse(request.body);

    const id = `vpolicy_${Date.now()}`;
    const policy: ViolationPolicy = {
      id,
      ...data,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    violationPolicies.set(id, policy);
    return reply.status(201).send(policy);
  });

  app.get('/policies/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const policies = Array.from(violationPolicies.values()).filter(
      p => p.propertyId === propertyId && p.isActive
    );
    return reply.send(policies);
  });

  // Stats
  app.get('/stats/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const stats = getViolationStats(propertyId);
    return reply.send(stats);
  });

  // Tenant history
  app.get('/tenant/:tenantId/history', async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = request.params as { tenantId: string };
    const history = getTenantViolationHistory(tenantId);
    return reply.send(history);
  });

  // Auto-calculate fine
  app.get('/calculate-fine', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, violationType, tenantId } = request.query as {
      propertyId: string;
      violationType: ViolationType;
      tenantId: string;
    };

    const fine = calculateFine(propertyId, violationType, tenantId);
    const priorViolations = getViolationCount(tenantId, violationType);

    return reply.send({
      calculatedFine: fine,
      priorViolations,
      isRepeatOffender: priorViolations > 0
    });
  });
}
