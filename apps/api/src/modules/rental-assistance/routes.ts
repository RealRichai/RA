import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

type ProgramType = 'section_8' | 'erap' | 'local_assistance' | 'hcv' | 'pbv' | 'other';
type ApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'pending_documents'
  | 'under_review'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'withdrawn';
type VoucherStatus = 'pending' | 'active' | 'suspended' | 'terminated' | 'expired' | 'ported_out';
type InspectionType = 'initial' | 'annual' | 'special' | 'reinspection' | 'move_out';
type InspectionResult = 'pass' | 'fail' | 'pending' | 'inconclusive';

interface AssistanceProgram {
  id: string;
  name: string;
  type: ProgramType;
  adminAgency: string;
  contactEmail?: string;
  contactPhone?: string;
  website?: string;
  portalUrl?: string;
  paymentSchedule: 'monthly' | 'bi_weekly' | 'weekly';
  requiresInspection: boolean;
  inspectionFrequency?: 'annual' | 'biennial';
  maxRent?: number;
  utilityAllowance?: number;
  region?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AssistanceApplication {
  id: string;
  programId: string;
  propertyId: string;
  unitId: string;
  tenantId: string;
  landlordId: string;
  status: ApplicationStatus;
  submittedDate?: string;
  approvedDate?: string;
  denialReason?: string;
  voucherNumber?: string;
  requestedAmount: number;
  approvedAmount?: number;
  startDate?: string;
  endDate?: string;
  documents: ApplicationDocument[];
  timeline: ApplicationEvent[];
  createdAt: string;
  updatedAt: string;
}

interface ApplicationDocument {
  id: string;
  name: string;
  type: string;
  fileUrl: string;
  uploadedAt: string;
  verified: boolean;
  verifiedAt?: string;
  verifiedBy?: string;
}

interface ApplicationEvent {
  id: string;
  date: string;
  action: string;
  notes?: string;
  performedBy?: string;
}

interface Voucher {
  id: string;
  programId: string;
  applicationId: string;
  voucherNumber: string;
  tenantId: string;
  propertyId: string;
  unitId: string;
  status: VoucherStatus;
  hapAmount: number; // Housing Assistance Payment
  tenantPortion: number;
  totalRent: number;
  utilityAllowance: number;
  effectiveDate: string;
  expirationDate?: string;
  annualReviewDate?: string;
  portedFrom?: string;
  portedTo?: string;
  createdAt: string;
  updatedAt: string;
}

interface Inspection {
  id: string;
  programId: string;
  propertyId: string;
  unitId: string;
  voucherId?: string;
  type: InspectionType;
  scheduledDate: string;
  completedDate?: string;
  inspectorId?: string;
  inspectorName?: string;
  result?: InspectionResult;
  deficiencies: InspectionDeficiency[];
  reinspectionDeadline?: string;
  notes?: string;
  reportUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface InspectionDeficiency {
  id: string;
  category: string;
  description: string;
  severity: 'minor' | 'major' | 'life_threatening';
  location?: string;
  correctedDate?: string;
  correctionVerified: boolean;
}

interface AssistancePayment {
  id: string;
  voucherId: string;
  programId: string;
  propertyId: string;
  landlordId: string;
  period: string; // YYYY-MM
  hapAmount: number;
  adjustments: number;
  netAmount: number;
  status: 'scheduled' | 'processing' | 'paid' | 'failed' | 'held';
  scheduledDate: string;
  paidDate?: string;
  paymentReference?: string;
  notes?: string;
  createdAt: string;
}

interface LandlordCertification {
  id: string;
  landlordId: string;
  propertyId: string;
  programId: string;
  certificationType: 'initial' | 'annual' | 'recertification';
  certificationDate: string;
  expirationDate: string;
  status: 'active' | 'expired' | 'revoked';
  requirements: CertificationRequirement[];
  createdAt: string;
  updatedAt: string;
}

interface CertificationRequirement {
  id: string;
  name: string;
  description: string;
  completed: boolean;
  completedDate?: string;
  documentUrl?: string;
}

interface ComplianceReport {
  id: string;
  programId: string;
  reportType: 'monthly' | 'quarterly' | 'annual';
  period: string;
  data: {
    activeVouchers: number;
    totalHAPPaid: number;
    inspectionsConducted: number;
    inspectionsPass: number;
    inspectionsFail: number;
    newEnrollments: number;
    terminations: number;
    averageHAP: number;
    averageTenantPortion: number;
  };
  submittedDate?: string;
  createdAt: string;
}

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

const programs = new Map<string, AssistanceProgram>();
const applications = new Map<string, AssistanceApplication>();
const vouchers = new Map<string, Voucher>();
const inspections = new Map<string, Inspection>();
const assistancePayments = new Map<string, AssistancePayment>();
const landlordCertifications = new Map<string, LandlordCertification>();
const complianceReports = new Map<string, ComplianceReport>();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function calculateHAPPayment(
  totalRent: number,
  tenantIncome: number,
  paymentStandard: number,
  utilityAllowance: number = 0
): { hapAmount: number; tenantPortion: number; grossRent: number } {
  // HUD formula: Tenant pays 30% of adjusted income
  const tenantPortion = Math.round(tenantIncome * 0.3 * 100) / 100;
  const grossRent = totalRent + utilityAllowance;

  // HAP is lesser of payment standard or gross rent, minus tenant portion
  const maxHAP = Math.min(paymentStandard, grossRent);
  const hapAmount = Math.max(0, maxHAP - tenantPortion);

  return {
    hapAmount: Math.round(hapAmount * 100) / 100,
    tenantPortion: Math.round(tenantPortion * 100) / 100,
    grossRent,
  };
}

export function isInspectionDue(
  voucher: Voucher,
  lastInspection: Inspection | undefined,
  frequencyMonths: number = 12
): boolean {
  if (!lastInspection) return true;

  const lastDate = new Date(lastInspection.completedDate || lastInspection.scheduledDate);
  const nextDue = new Date(lastDate);
  nextDue.setMonth(nextDue.getMonth() + frequencyMonths);

  return new Date() >= nextDue;
}

export function calculateInspectionPassRate(inspectionList: Inspection[]): {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
} {
  const completed = inspectionList.filter((i) => i.result);
  const passed = completed.filter((i) => i.result === 'pass').length;
  const failed = completed.filter((i) => i.result === 'fail').length;

  return {
    total: completed.length,
    passed,
    failed,
    passRate: completed.length > 0 ? Math.round((passed / completed.length) * 100) : 0,
  };
}

export function getDeficiencySummary(
  deficiencies: InspectionDeficiency[]
): {
  total: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  corrected: number;
  pending: number;
} {
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};

  for (const d of deficiencies) {
    byCategory[d.category] = (byCategory[d.category] || 0) + 1;
    bySeverity[d.severity] = (bySeverity[d.severity] || 0) + 1;
  }

  return {
    total: deficiencies.length,
    byCategory,
    bySeverity,
    corrected: deficiencies.filter((d) => d.correctedDate).length,
    pending: deficiencies.filter((d) => !d.correctedDate).length,
  };
}

export function calculatePaymentSummary(
  payments: AssistancePayment[],
  period?: string
): {
  totalPayments: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  averagePayment: number;
} {
  let filtered = payments;
  if (period) {
    filtered = payments.filter((p) => p.period === period);
  }

  const paidPayments = filtered.filter((p) => p.status === 'paid');
  const totalAmount = filtered.reduce((sum, p) => sum + p.netAmount, 0);
  const paidAmount = paidPayments.reduce((sum, p) => sum + p.netAmount, 0);

  return {
    totalPayments: filtered.length,
    totalAmount,
    paidAmount,
    pendingAmount: totalAmount - paidAmount,
    averagePayment: filtered.length > 0 ? totalAmount / filtered.length : 0,
  };
}

export function getVoucherExpirationDays(voucher: Voucher): number {
  if (!voucher.expirationDate) return -1;
  const expiration = new Date(voucher.expirationDate);
  const now = new Date();
  return Math.ceil((expiration.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

// ============================================================================
// SCHEMAS
// ============================================================================

const ProgramSchema = z.object({
  name: z.string(),
  type: z.enum(['section_8', 'erap', 'local_assistance', 'hcv', 'pbv', 'other']),
  adminAgency: z.string(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  website: z.string().url().optional(),
  portalUrl: z.string().url().optional(),
  paymentSchedule: z.enum(['monthly', 'bi_weekly', 'weekly']).default('monthly'),
  requiresInspection: z.boolean().default(true),
  inspectionFrequency: z.enum(['annual', 'biennial']).optional(),
  maxRent: z.number().optional(),
  utilityAllowance: z.number().optional(),
  region: z.string().optional(),
});

const ApplicationSchema = z.object({
  programId: z.string(),
  propertyId: z.string(),
  unitId: z.string(),
  tenantId: z.string(),
  landlordId: z.string(),
  requestedAmount: z.number(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const ApplicationDocumentSchema = z.object({
  name: z.string(),
  type: z.string(),
  fileUrl: z.string(),
});

const ApplicationStatusSchema = z.object({
  status: z.enum([
    'draft',
    'submitted',
    'pending_documents',
    'under_review',
    'approved',
    'denied',
    'expired',
    'withdrawn',
  ]),
  notes: z.string().optional(),
  denialReason: z.string().optional(),
  approvedAmount: z.number().optional(),
  voucherNumber: z.string().optional(),
});

const VoucherSchema = z.object({
  programId: z.string(),
  applicationId: z.string(),
  voucherNumber: z.string(),
  tenantId: z.string(),
  propertyId: z.string(),
  unitId: z.string(),
  hapAmount: z.number(),
  tenantPortion: z.number(),
  totalRent: z.number(),
  utilityAllowance: z.number().default(0),
  effectiveDate: z.string(),
  expirationDate: z.string().optional(),
  annualReviewDate: z.string().optional(),
});

const InspectionSchema = z.object({
  programId: z.string(),
  propertyId: z.string(),
  unitId: z.string(),
  voucherId: z.string().optional(),
  type: z.enum(['initial', 'annual', 'special', 'reinspection', 'move_out']),
  scheduledDate: z.string(),
  inspectorId: z.string().optional(),
  inspectorName: z.string().optional(),
});

const InspectionResultSchema = z.object({
  result: z.enum(['pass', 'fail', 'pending', 'inconclusive']),
  deficiencies: z
    .array(
      z.object({
        category: z.string(),
        description: z.string(),
        severity: z.enum(['minor', 'major', 'life_threatening']),
        location: z.string().optional(),
      })
    )
    .default([]),
  reinspectionDeadline: z.string().optional(),
  notes: z.string().optional(),
  reportUrl: z.string().optional(),
});

const PaymentSchema = z.object({
  voucherId: z.string(),
  programId: z.string(),
  propertyId: z.string(),
  landlordId: z.string(),
  period: z.string(),
  hapAmount: z.number(),
  adjustments: z.number().default(0),
  scheduledDate: z.string(),
});

const CertificationSchema = z.object({
  landlordId: z.string(),
  propertyId: z.string(),
  programId: z.string(),
  certificationType: z.enum(['initial', 'annual', 'recertification']),
  requirements: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
    })
  ),
});

const HAPCalculationSchema = z.object({
  totalRent: z.number(),
  tenantIncome: z.number(),
  paymentStandard: z.number(),
  utilityAllowance: z.number().default(0),
});

// ============================================================================
// ROUTES
// ============================================================================

export async function rentalAssistanceRoutes(app: FastifyInstance): Promise<void> {
  // ─────────────────────────────────────────────────────────────────────────
  // PROGRAMS
  // ─────────────────────────────────────────────────────────────────────────

  // Create program
  app.post(
    '/programs',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof ProgramSchema> }>,
      reply
    ) => {
      const data = ProgramSchema.parse(request.body);
      const now = new Date().toISOString();

      const program: AssistanceProgram = {
        id: `prog_${Date.now()}`,
        ...data,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };

      programs.set(program.id, program);
      return reply.status(201).send(program);
    }
  );

  // List programs
  app.get(
    '/programs',
    async (
      request: FastifyRequest<{ Querystring: { type?: string; isActive?: string } }>,
      reply
    ) => {
      let results = Array.from(programs.values());

      if (request.query.type) {
        results = results.filter((p) => p.type === request.query.type);
      }
      if (request.query.isActive === 'true') {
        results = results.filter((p) => p.isActive);
      }

      return reply.send({ programs: results });
    }
  );

  // Get program
  app.get(
    '/programs/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const program = programs.get(request.params.id);
      if (!program) {
        return reply.status(404).send({ error: 'Program not found' });
      }

      // Get stats
      const programVouchers = Array.from(vouchers.values()).filter(
        (v) => v.programId === program.id
      );
      const programInspections = Array.from(inspections.values()).filter(
        (i) => i.programId === program.id
      );
      const programPayments = Array.from(assistancePayments.values()).filter(
        (p) => p.programId === program.id
      );

      return reply.send({
        ...program,
        stats: {
          activeVouchers: programVouchers.filter((v) => v.status === 'active').length,
          inspectionPassRate: calculateInspectionPassRate(programInspections),
          paymentSummary: calculatePaymentSummary(programPayments),
        },
      });
    }
  );

  // Calculate HAP
  app.post(
    '/programs/calculate-hap',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof HAPCalculationSchema> }>,
      reply
    ) => {
      const data = HAPCalculationSchema.parse(request.body);
      const result = calculateHAPPayment(
        data.totalRent,
        data.tenantIncome,
        data.paymentStandard,
        data.utilityAllowance
      );

      return reply.send(result);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // APPLICATIONS
  // ─────────────────────────────────────────────────────────────────────────

  // Create application
  app.post(
    '/applications',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof ApplicationSchema> }>,
      reply
    ) => {
      const data = ApplicationSchema.parse(request.body);
      const now = new Date().toISOString();

      const application: AssistanceApplication = {
        id: `app_${Date.now()}`,
        ...data,
        status: 'draft',
        documents: [],
        timeline: [
          {
            id: `ae_${Date.now()}`,
            date: now,
            action: 'created',
            notes: 'Application created',
          },
        ],
        createdAt: now,
        updatedAt: now,
      };

      applications.set(application.id, application);
      return reply.status(201).send(application);
    }
  );

  // List applications
  app.get(
    '/applications',
    async (
      request: FastifyRequest<{
        Querystring: {
          programId?: string;
          tenantId?: string;
          landlordId?: string;
          status?: string;
        };
      }>,
      reply
    ) => {
      let results = Array.from(applications.values());

      if (request.query.programId) {
        results = results.filter((a) => a.programId === request.query.programId);
      }
      if (request.query.tenantId) {
        results = results.filter((a) => a.tenantId === request.query.tenantId);
      }
      if (request.query.landlordId) {
        results = results.filter((a) => a.landlordId === request.query.landlordId);
      }
      if (request.query.status) {
        results = results.filter((a) => a.status === request.query.status);
      }

      return reply.send({ applications: results });
    }
  );

  // Get application
  app.get(
    '/applications/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const application = applications.get(request.params.id);
      if (!application) {
        return reply.status(404).send({ error: 'Application not found' });
      }

      const program = programs.get(application.programId);
      return reply.send({ ...application, program });
    }
  );

  // Add document to application
  app.post(
    '/applications/:id/documents',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof ApplicationDocumentSchema>;
      }>,
      reply
    ) => {
      const application = applications.get(request.params.id);
      if (!application) {
        return reply.status(404).send({ error: 'Application not found' });
      }

      const data = ApplicationDocumentSchema.parse(request.body);
      const doc: ApplicationDocument = {
        id: `doc_${Date.now()}`,
        ...data,
        uploadedAt: new Date().toISOString(),
        verified: false,
      };

      application.documents.push(doc);
      application.updatedAt = new Date().toISOString();
      applications.set(application.id, application);

      return reply.status(201).send(doc);
    }
  );

  // Update application status
  app.patch(
    '/applications/:id/status',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof ApplicationStatusSchema>;
      }>,
      reply
    ) => {
      const application = applications.get(request.params.id);
      if (!application) {
        return reply.status(404).send({ error: 'Application not found' });
      }

      const data = ApplicationStatusSchema.parse(request.body);
      const now = new Date().toISOString();

      application.status = data.status;
      if (data.status === 'submitted') {
        application.submittedDate = now;
      } else if (data.status === 'approved') {
        application.approvedDate = now;
        application.approvedAmount = data.approvedAmount;
        application.voucherNumber = data.voucherNumber;
      } else if (data.status === 'denied') {
        application.denialReason = data.denialReason;
      }

      application.timeline.push({
        id: `ae_${Date.now()}`,
        date: now,
        action: `status_changed_to_${data.status}`,
        notes: data.notes,
      });

      application.updatedAt = now;
      applications.set(application.id, application);

      return reply.send(application);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // VOUCHERS
  // ─────────────────────────────────────────────────────────────────────────

  // Create voucher
  app.post(
    '/vouchers',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof VoucherSchema> }>,
      reply
    ) => {
      const data = VoucherSchema.parse(request.body);
      const now = new Date().toISOString();

      const voucher: Voucher = {
        id: `vou_${Date.now()}`,
        ...data,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };

      vouchers.set(voucher.id, voucher);
      return reply.status(201).send(voucher);
    }
  );

  // List vouchers
  app.get(
    '/vouchers',
    async (
      request: FastifyRequest<{
        Querystring: {
          programId?: string;
          tenantId?: string;
          propertyId?: string;
          status?: string;
        };
      }>,
      reply
    ) => {
      let results = Array.from(vouchers.values());

      if (request.query.programId) {
        results = results.filter((v) => v.programId === request.query.programId);
      }
      if (request.query.tenantId) {
        results = results.filter((v) => v.tenantId === request.query.tenantId);
      }
      if (request.query.propertyId) {
        results = results.filter((v) => v.propertyId === request.query.propertyId);
      }
      if (request.query.status) {
        results = results.filter((v) => v.status === request.query.status);
      }

      // Add expiration info
      const vouchersWithExpiration = results.map((v) => ({
        ...v,
        daysUntilExpiration: getVoucherExpirationDays(v),
      }));

      return reply.send({ vouchers: vouchersWithExpiration });
    }
  );

  // Get voucher
  app.get(
    '/vouchers/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const voucher = vouchers.get(request.params.id);
      if (!voucher) {
        return reply.status(404).send({ error: 'Voucher not found' });
      }

      const program = programs.get(voucher.programId);
      const voucherInspections = Array.from(inspections.values()).filter(
        (i) => i.voucherId === voucher.id
      );
      const lastInspection = voucherInspections.sort((a, b) =>
        b.scheduledDate.localeCompare(a.scheduledDate)
      )[0];

      return reply.send({
        ...voucher,
        program,
        daysUntilExpiration: getVoucherExpirationDays(voucher),
        inspectionDue: program?.requiresInspection
          ? isInspectionDue(voucher, lastInspection)
          : false,
        lastInspection,
      });
    }
  );

  // Activate voucher
  app.post(
    '/vouchers/:id/activate',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const voucher = vouchers.get(request.params.id);
      if (!voucher) {
        return reply.status(404).send({ error: 'Voucher not found' });
      }

      voucher.status = 'active';
      voucher.updatedAt = new Date().toISOString();
      vouchers.set(voucher.id, voucher);

      return reply.send(voucher);
    }
  );

  // Terminate voucher
  app.post(
    '/vouchers/:id/terminate',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>,
      reply
    ) => {
      const voucher = vouchers.get(request.params.id);
      if (!voucher) {
        return reply.status(404).send({ error: 'Voucher not found' });
      }

      voucher.status = 'terminated';
      voucher.updatedAt = new Date().toISOString();
      vouchers.set(voucher.id, voucher);

      return reply.send({ message: 'Voucher terminated', voucher });
    }
  );

  // Port voucher
  app.post(
    '/vouchers/:id/port',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { destinationAgency: string };
      }>,
      reply
    ) => {
      const voucher = vouchers.get(request.params.id);
      if (!voucher) {
        return reply.status(404).send({ error: 'Voucher not found' });
      }

      voucher.status = 'ported_out';
      voucher.portedTo = request.body.destinationAgency;
      voucher.updatedAt = new Date().toISOString();
      vouchers.set(voucher.id, voucher);

      return reply.send({ message: 'Voucher ported', voucher });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // INSPECTIONS
  // ─────────────────────────────────────────────────────────────────────────

  // Schedule inspection
  app.post(
    '/inspections',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof InspectionSchema> }>,
      reply
    ) => {
      const data = InspectionSchema.parse(request.body);
      const now = new Date().toISOString();

      const inspection: Inspection = {
        id: `insp_${Date.now()}`,
        ...data,
        deficiencies: [],
        createdAt: now,
        updatedAt: now,
      };

      inspections.set(inspection.id, inspection);
      return reply.status(201).send(inspection);
    }
  );

  // List inspections
  app.get(
    '/inspections',
    async (
      request: FastifyRequest<{
        Querystring: {
          programId?: string;
          propertyId?: string;
          voucherId?: string;
          result?: string;
        };
      }>,
      reply
    ) => {
      let results = Array.from(inspections.values());

      if (request.query.programId) {
        results = results.filter((i) => i.programId === request.query.programId);
      }
      if (request.query.propertyId) {
        results = results.filter((i) => i.propertyId === request.query.propertyId);
      }
      if (request.query.voucherId) {
        results = results.filter((i) => i.voucherId === request.query.voucherId);
      }
      if (request.query.result) {
        results = results.filter((i) => i.result === request.query.result);
      }

      return reply.send({
        inspections: results,
        stats: calculateInspectionPassRate(results),
      });
    }
  );

  // Record inspection result
  app.post(
    '/inspections/:id/result',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof InspectionResultSchema>;
      }>,
      reply
    ) => {
      const inspection = inspections.get(request.params.id);
      if (!inspection) {
        return reply.status(404).send({ error: 'Inspection not found' });
      }

      const data = InspectionResultSchema.parse(request.body);
      inspection.result = data.result;
      inspection.completedDate = new Date().toISOString();
      inspection.deficiencies = data.deficiencies.map((d, i) => ({
        id: `def_${Date.now()}_${i}`,
        ...d,
        correctionVerified: false,
      }));
      inspection.reinspectionDeadline = data.reinspectionDeadline;
      inspection.notes = data.notes;
      inspection.reportUrl = data.reportUrl;
      inspection.updatedAt = new Date().toISOString();

      inspections.set(inspection.id, inspection);
      return reply.send(inspection);
    }
  );

  // Record deficiency correction
  app.post(
    '/inspections/:id/deficiencies/:defId/correct',
    async (
      request: FastifyRequest<{
        Params: { id: string; defId: string };
      }>,
      reply
    ) => {
      const inspection = inspections.get(request.params.id);
      if (!inspection) {
        return reply.status(404).send({ error: 'Inspection not found' });
      }

      const deficiency = inspection.deficiencies.find((d) => d.id === request.params.defId);
      if (!deficiency) {
        return reply.status(404).send({ error: 'Deficiency not found' });
      }

      deficiency.correctedDate = new Date().toISOString();
      deficiency.correctionVerified = true;
      inspection.updatedAt = new Date().toISOString();

      inspections.set(inspection.id, inspection);
      return reply.send(inspection);
    }
  );

  // Get deficiency summary
  app.get(
    '/inspections/deficiency-summary',
    async (
      request: FastifyRequest<{ Querystring: { programId?: string } }>,
      reply
    ) => {
      let results = Array.from(inspections.values());

      if (request.query.programId) {
        results = results.filter((i) => i.programId === request.query.programId);
      }

      const allDeficiencies = results.flatMap((i) => i.deficiencies);
      const summary = getDeficiencySummary(allDeficiencies);

      return reply.send(summary);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PAYMENTS
  // ─────────────────────────────────────────────────────────────────────────

  // Create payment
  app.post(
    '/payments',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof PaymentSchema> }>,
      reply
    ) => {
      const data = PaymentSchema.parse(request.body);

      const payment: AssistancePayment = {
        id: `pmt_${Date.now()}`,
        ...data,
        netAmount: data.hapAmount + data.adjustments,
        status: 'scheduled',
        createdAt: new Date().toISOString(),
      };

      assistancePayments.set(payment.id, payment);
      return reply.status(201).send(payment);
    }
  );

  // List payments
  app.get(
    '/payments',
    async (
      request: FastifyRequest<{
        Querystring: {
          voucherId?: string;
          landlordId?: string;
          period?: string;
          status?: string;
        };
      }>,
      reply
    ) => {
      let results = Array.from(assistancePayments.values());

      if (request.query.voucherId) {
        results = results.filter((p) => p.voucherId === request.query.voucherId);
      }
      if (request.query.landlordId) {
        results = results.filter((p) => p.landlordId === request.query.landlordId);
      }
      if (request.query.period) {
        results = results.filter((p) => p.period === request.query.period);
      }
      if (request.query.status) {
        results = results.filter((p) => p.status === request.query.status);
      }

      return reply.send({
        payments: results,
        summary: calculatePaymentSummary(results, request.query.period),
      });
    }
  );

  // Process payment
  app.post(
    '/payments/:id/process',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const payment = assistancePayments.get(request.params.id);
      if (!payment) {
        return reply.status(404).send({ error: 'Payment not found' });
      }

      payment.status = 'paid';
      payment.paidDate = new Date().toISOString();
      payment.paymentReference = `HAP_${Date.now()}`;
      assistancePayments.set(payment.id, payment);

      return reply.send(payment);
    }
  );

  // Hold payment
  app.post(
    '/payments/:id/hold',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { notes: string } }>,
      reply
    ) => {
      const payment = assistancePayments.get(request.params.id);
      if (!payment) {
        return reply.status(404).send({ error: 'Payment not found' });
      }

      payment.status = 'held';
      payment.notes = request.body.notes;
      assistancePayments.set(payment.id, payment);

      return reply.send(payment);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // LANDLORD CERTIFICATIONS
  // ─────────────────────────────────────────────────────────────────────────

  // Create certification
  app.post(
    '/certifications',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof CertificationSchema> }>,
      reply
    ) => {
      const data = CertificationSchema.parse(request.body);
      const now = new Date().toISOString();

      // Calculate expiration (1 year from certification date)
      const expirationDate = new Date();
      expirationDate.setFullYear(expirationDate.getFullYear() + 1);

      const certification: LandlordCertification = {
        id: `cert_${Date.now()}`,
        ...data,
        certificationDate: now,
        expirationDate: expirationDate.toISOString(),
        status: 'active',
        requirements: data.requirements.map((r, i) => ({
          id: `req_${Date.now()}_${i}`,
          ...r,
          completed: false,
        })),
        createdAt: now,
        updatedAt: now,
      };

      landlordCertifications.set(certification.id, certification);
      return reply.status(201).send(certification);
    }
  );

  // List certifications
  app.get(
    '/certifications',
    async (
      request: FastifyRequest<{
        Querystring: { landlordId?: string; programId?: string; status?: string };
      }>,
      reply
    ) => {
      let results = Array.from(landlordCertifications.values());

      if (request.query.landlordId) {
        results = results.filter((c) => c.landlordId === request.query.landlordId);
      }
      if (request.query.programId) {
        results = results.filter((c) => c.programId === request.query.programId);
      }
      if (request.query.status) {
        results = results.filter((c) => c.status === request.query.status);
      }

      return reply.send({ certifications: results });
    }
  );

  // Complete requirement
  app.post(
    '/certifications/:id/requirements/:reqId/complete',
    async (
      request: FastifyRequest<{
        Params: { id: string; reqId: string };
        Body: { documentUrl?: string };
      }>,
      reply
    ) => {
      const certification = landlordCertifications.get(request.params.id);
      if (!certification) {
        return reply.status(404).send({ error: 'Certification not found' });
      }

      const requirement = certification.requirements.find((r) => r.id === request.params.reqId);
      if (!requirement) {
        return reply.status(404).send({ error: 'Requirement not found' });
      }

      requirement.completed = true;
      requirement.completedDate = new Date().toISOString();
      requirement.documentUrl = request.body.documentUrl;
      certification.updatedAt = new Date().toISOString();

      landlordCertifications.set(certification.id, certification);
      return reply.send(certification);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // COMPLIANCE REPORTS
  // ─────────────────────────────────────────────────────────────────────────

  // Generate compliance report
  app.post(
    '/compliance-reports',
    async (
      request: FastifyRequest<{
        Body: { programId: string; reportType: string; period: string };
      }>,
      reply
    ) => {
      const { programId, reportType, period } = request.body;

      const programVouchers = Array.from(vouchers.values()).filter(
        (v) => v.programId === programId
      );
      const programInspections = Array.from(inspections.values()).filter(
        (i) => i.programId === programId
      );
      const programPayments = Array.from(assistancePayments.values()).filter(
        (p) => p.programId === programId && p.period === period
      );

      const activeVouchers = programVouchers.filter((v) => v.status === 'active');
      const passRate = calculateInspectionPassRate(programInspections);

      const report: ComplianceReport = {
        id: `cr_${Date.now()}`,
        programId,
        reportType: reportType as ComplianceReport['reportType'],
        period,
        data: {
          activeVouchers: activeVouchers.length,
          totalHAPPaid: programPayments
            .filter((p) => p.status === 'paid')
            .reduce((sum, p) => sum + p.netAmount, 0),
          inspectionsConducted: programInspections.filter((i) => i.completedDate).length,
          inspectionsPass: passRate.passed,
          inspectionsFail: passRate.failed,
          newEnrollments: programVouchers.filter((v) => v.effectiveDate.startsWith(period)).length,
          terminations: programVouchers.filter((v) => v.status === 'terminated').length,
          averageHAP:
            activeVouchers.length > 0
              ? activeVouchers.reduce((sum, v) => sum + v.hapAmount, 0) / activeVouchers.length
              : 0,
          averageTenantPortion:
            activeVouchers.length > 0
              ? activeVouchers.reduce((sum, v) => sum + v.tenantPortion, 0) / activeVouchers.length
              : 0,
        },
        createdAt: new Date().toISOString(),
      };

      complianceReports.set(report.id, report);
      return reply.status(201).send(report);
    }
  );

  // List compliance reports
  app.get(
    '/compliance-reports',
    async (
      request: FastifyRequest<{ Querystring: { programId?: string } }>,
      reply
    ) => {
      let results = Array.from(complianceReports.values());

      if (request.query.programId) {
        results = results.filter((r) => r.programId === request.query.programId);
      }

      return reply.send({ reports: results });
    }
  );
}

// Export for testing
export {
  programs,
  applications,
  vouchers,
  inspections,
  assistancePayments,
  landlordCertifications,
  complianceReports,
};
