import {
  prisma,
  type AssistanceProgramType,
  type AssistanceApplicationStatus,
  type VoucherStatus,
  type AssistanceInspectionType,
  type AssistanceInspectionResult,
  type AssistancePaymentStatus,
  type CertificationType,
  type CertificationStatus,
} from '@realriches/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';


// ============================================================================
// TYPES
// ============================================================================

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

interface InspectionDeficiency {
  id: string;
  category: string;
  description: string;
  severity: 'minor' | 'major' | 'life_threatening';
  location?: string;
  correctedDate?: string;
  correctionVerified: boolean;
}

interface CertificationRequirement {
  id: string;
  name: string;
  description: string;
  completed: boolean;
  completedDate?: string;
  documentUrl?: string;
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

export function calculateHAPPayment(
  totalRent: number,
  tenantIncome: number,
  paymentStandard: number,
  utilityAllowance: number = 0
): { hapAmount: number; tenantPortion: number; grossRent: number } {
  const tenantPortion = Math.round(tenantIncome * 0.3 * 100) / 100;
  const grossRent = totalRent + utilityAllowance;
  const maxHAP = Math.min(paymentStandard, grossRent);
  const hapAmount = Math.max(0, maxHAP - tenantPortion);

  return {
    hapAmount: Math.round(hapAmount * 100) / 100,
    tenantPortion: Math.round(tenantPortion * 100) / 100,
    grossRent,
  };
}

interface VoucherData {
  expirationDate: Date | null;
}

interface InspectionData {
  completedDate: Date | null;
  scheduledDate: Date;
}

export function isInspectionDue(
  voucher: VoucherData,
  lastInspection: InspectionData | undefined,
  frequencyMonths: number = 12
): boolean {
  if (!lastInspection) return true;

  const lastDate = new Date(lastInspection.completedDate || lastInspection.scheduledDate);
  const nextDue = new Date(lastDate);
  nextDue.setMonth(nextDue.getMonth() + frequencyMonths);

  return new Date() >= nextDue;
}

interface InspectionResultData {
  result: string | null;
}

export function calculateInspectionPassRate(inspectionList: InspectionResultData[]): {
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

interface PaymentData {
  period: string;
  status: string;
  netAmount: unknown;
}

export function calculatePaymentSummary(
  payments: PaymentData[],
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
  const totalAmount = filtered.reduce((sum, p) => sum + toNumber(p.netAmount), 0);
  const paidAmount = paidPayments.reduce((sum, p) => sum + toNumber(p.netAmount), 0);

  return {
    totalPayments: filtered.length,
    totalAmount,
    paidAmount,
    pendingAmount: totalAmount - paidAmount,
    averagePayment: filtered.length > 0 ? totalAmount / filtered.length : 0,
  };
}

export function getVoucherExpirationDays(voucher: VoucherData): number {
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
  programId: z.string().uuid(),
  propertyId: z.string().uuid(),
  unitId: z.string().uuid(),
  tenantId: z.string().uuid(),
  landlordId: z.string().uuid(),
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
    'draft', 'submitted', 'pending_documents', 'under_review',
    'approved', 'denied', 'expired', 'withdrawn',
  ]),
  notes: z.string().optional(),
  denialReason: z.string().optional(),
  approvedAmount: z.number().optional(),
  voucherNumber: z.string().optional(),
});

const VoucherSchema = z.object({
  programId: z.string().uuid(),
  applicationId: z.string().uuid(),
  voucherNumber: z.string(),
  tenantId: z.string().uuid(),
  propertyId: z.string().uuid(),
  unitId: z.string().uuid(),
  hapAmount: z.number(),
  tenantPortion: z.number(),
  totalRent: z.number(),
  utilityAllowance: z.number().default(0),
  effectiveDate: z.string(),
  expirationDate: z.string().optional(),
  annualReviewDate: z.string().optional(),
});

const InspectionSchema = z.object({
  programId: z.string().uuid(),
  propertyId: z.string().uuid(),
  unitId: z.string().uuid(),
  voucherId: z.string().uuid().optional(),
  type: z.enum(['initial', 'annual', 'special', 'reinspection', 'move_out']),
  scheduledDate: z.string(),
  inspectorId: z.string().uuid().optional(),
  inspectorName: z.string().optional(),
});

const InspectionResultSchema = z.object({
  result: z.enum(['pass', 'fail', 'pending', 'inconclusive']),
  deficiencies: z.array(z.object({
    category: z.string(),
    description: z.string(),
    severity: z.enum(['minor', 'major', 'life_threatening']),
    location: z.string().optional(),
  })).default([]),
  reinspectionDeadline: z.string().optional(),
  notes: z.string().optional(),
  reportUrl: z.string().optional(),
});

const PaymentSchema = z.object({
  voucherId: z.string().uuid(),
  programId: z.string().uuid(),
  propertyId: z.string().uuid(),
  landlordId: z.string().uuid(),
  period: z.string(),
  hapAmount: z.number(),
  adjustments: z.number().default(0),
  scheduledDate: z.string(),
});

const CertificationSchema = z.object({
  landlordId: z.string().uuid(),
  propertyId: z.string().uuid(),
  programId: z.string().uuid(),
  certificationType: z.enum(['initial', 'annual', 'recertification']),
  requirements: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })),
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

      const program = await prisma.assistanceProgram.create({
        data: {
          name: data.name,
          type: data.type as AssistanceProgramType,
          adminAgency: data.adminAgency,
          contactEmail: data.contactEmail,
          contactPhone: data.contactPhone,
          website: data.website,
          portalUrl: data.portalUrl,
          paymentSchedule: data.paymentSchedule,
          requiresInspection: data.requiresInspection,
          inspectionFrequency: data.inspectionFrequency,
          maxRent: data.maxRent,
          utilityAllowance: data.utilityAllowance,
          region: data.region,
          isActive: true,
        },
      });

      return reply.status(201).send({
        ...program,
        maxRent: program.maxRent ? toNumber(program.maxRent) : null,
        utilityAllowance: program.utilityAllowance ? toNumber(program.utilityAllowance) : null,
      });
    }
  );

  // List programs
  app.get(
    '/programs',
    async (
      request: FastifyRequest<{ Querystring: { type?: string; isActive?: string } }>,
      reply
    ) => {
      const results = await prisma.assistanceProgram.findMany({
        where: {
          ...(request.query.type && { type: request.query.type as AssistanceProgramType }),
          ...(request.query.isActive === 'true' && { isActive: true }),
        },
      });

      return reply.send({
        programs: results.map((p) => ({
          ...p,
          maxRent: p.maxRent ? toNumber(p.maxRent) : null,
          utilityAllowance: p.utilityAllowance ? toNumber(p.utilityAllowance) : null,
        })),
      });
    }
  );

  // Get program
  app.get(
    '/programs/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const program = await prisma.assistanceProgram.findUnique({
        where: { id: request.params.id },
      });
      if (!program) {
        return reply.status(404).send({ error: 'Program not found' });
      }

      const [vouchersList, inspectionsList, paymentsList] = await Promise.all([
        prisma.voucher.findMany({ where: { programId: program.id } }),
        prisma.assistanceInspection.findMany({ where: { programId: program.id } }),
        prisma.assistancePaymentRecord.findMany({ where: { programId: program.id } }),
      ]);

      return reply.send({
        ...program,
        maxRent: program.maxRent ? toNumber(program.maxRent) : null,
        utilityAllowance: program.utilityAllowance ? toNumber(program.utilityAllowance) : null,
        stats: {
          activeVouchers: vouchersList.filter((v) => v.status === 'active').length,
          inspectionPassRate: calculateInspectionPassRate(inspectionsList),
          paymentSummary: calculatePaymentSummary(paymentsList),
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

      const initialTimeline: ApplicationEvent[] = [{
        id: `ae_${Date.now()}`,
        date: now,
        action: 'created',
        notes: 'Application created',
      }];

      const application = await prisma.assistanceApplication.create({
        data: {
          programId: data.programId,
          propertyId: data.propertyId,
          unitId: data.unitId,
          tenantId: data.tenantId,
          landlordId: data.landlordId,
          status: 'draft',
          requestedAmount: data.requestedAmount,
          startDate: data.startDate ? new Date(data.startDate) : null,
          endDate: data.endDate ? new Date(data.endDate) : null,
          documents: [],
          timeline: JSON.parse(JSON.stringify(initialTimeline)),
        },
      });

      return reply.status(201).send({
        ...application,
        requestedAmount: toNumber(application.requestedAmount),
        approvedAmount: application.approvedAmount ? toNumber(application.approvedAmount) : null,
      });
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
      const results = await prisma.assistanceApplication.findMany({
        where: {
          ...(request.query.programId && { programId: request.query.programId }),
          ...(request.query.tenantId && { tenantId: request.query.tenantId }),
          ...(request.query.landlordId && { landlordId: request.query.landlordId }),
          ...(request.query.status && { status: request.query.status as AssistanceApplicationStatus }),
        },
      });

      return reply.send({
        applications: results.map((a) => ({
          ...a,
          requestedAmount: toNumber(a.requestedAmount),
          approvedAmount: a.approvedAmount ? toNumber(a.approvedAmount) : null,
        })),
      });
    }
  );

  // Get application
  app.get(
    '/applications/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const application = await prisma.assistanceApplication.findUnique({
        where: { id: request.params.id },
        include: { program: true },
      });
      if (!application) {
        return reply.status(404).send({ error: 'Application not found' });
      }

      return reply.send({
        ...application,
        requestedAmount: toNumber(application.requestedAmount),
        approvedAmount: application.approvedAmount ? toNumber(application.approvedAmount) : null,
        program: application.program ? {
          ...application.program,
          maxRent: application.program.maxRent ? toNumber(application.program.maxRent) : null,
          utilityAllowance: application.program.utilityAllowance ? toNumber(application.program.utilityAllowance) : null,
        } : null,
      });
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
      const application = await prisma.assistanceApplication.findUnique({
        where: { id: request.params.id },
      });
      if (!application) {
        return reply.status(404).send({ error: 'Application not found' });
      }

      const data = ApplicationDocumentSchema.parse(request.body);
      const doc: ApplicationDocument = {
        id: `doc_${Date.now()}`,
        name: data.name,
        type: data.type,
        fileUrl: data.fileUrl,
        uploadedAt: new Date().toISOString(),
        verified: false,
      };

      const documents = (application.documents as unknown as ApplicationDocument[]) || [];
      documents.push(doc);

      await prisma.assistanceApplication.update({
        where: { id: request.params.id },
        data: { documents: JSON.parse(JSON.stringify(documents)) },
      });

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
      const application = await prisma.assistanceApplication.findUnique({
        where: { id: request.params.id },
      });
      if (!application) {
        return reply.status(404).send({ error: 'Application not found' });
      }

      const data = ApplicationStatusSchema.parse(request.body);
      const now = new Date();

      const timeline = (application.timeline as unknown as ApplicationEvent[]) || [];
      timeline.push({
        id: `ae_${Date.now()}`,
        date: now.toISOString(),
        action: `status_changed_to_${data.status}`,
        notes: data.notes,
      });

      const updated = await prisma.assistanceApplication.update({
        where: { id: request.params.id },
        data: {
          status: data.status as AssistanceApplicationStatus,
          ...(data.status === 'submitted' && { submittedDate: now }),
          ...(data.status === 'approved' && {
            approvedDate: now,
            approvedAmount: data.approvedAmount,
            voucherNumber: data.voucherNumber,
          }),
          ...(data.status === 'denied' && { denialReason: data.denialReason }),
          timeline: JSON.parse(JSON.stringify(timeline)),
        },
      });

      return reply.send({
        ...updated,
        requestedAmount: toNumber(updated.requestedAmount),
        approvedAmount: updated.approvedAmount ? toNumber(updated.approvedAmount) : null,
      });
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

      const voucher = await prisma.voucher.create({
        data: {
          programId: data.programId,
          applicationId: data.applicationId,
          voucherNumber: data.voucherNumber,
          tenantId: data.tenantId,
          propertyId: data.propertyId,
          unitId: data.unitId,
          status: 'pending',
          hapAmount: data.hapAmount,
          tenantPortion: data.tenantPortion,
          totalRent: data.totalRent,
          utilityAllowance: data.utilityAllowance,
          effectiveDate: new Date(data.effectiveDate),
          expirationDate: data.expirationDate ? new Date(data.expirationDate) : null,
          annualReviewDate: data.annualReviewDate ? new Date(data.annualReviewDate) : null,
        },
      });

      return reply.status(201).send({
        ...voucher,
        hapAmount: toNumber(voucher.hapAmount),
        tenantPortion: toNumber(voucher.tenantPortion),
        totalRent: toNumber(voucher.totalRent),
        utilityAllowance: toNumber(voucher.utilityAllowance),
      });
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
      const results = await prisma.voucher.findMany({
        where: {
          ...(request.query.programId && { programId: request.query.programId }),
          ...(request.query.tenantId && { tenantId: request.query.tenantId }),
          ...(request.query.propertyId && { propertyId: request.query.propertyId }),
          ...(request.query.status && { status: request.query.status as VoucherStatus }),
        },
      });

      const vouchersWithExpiration = results.map((v) => ({
        ...v,
        hapAmount: toNumber(v.hapAmount),
        tenantPortion: toNumber(v.tenantPortion),
        totalRent: toNumber(v.totalRent),
        utilityAllowance: toNumber(v.utilityAllowance),
        daysUntilExpiration: getVoucherExpirationDays(v),
      }));

      return reply.send({ vouchers: vouchersWithExpiration });
    }
  );

  // Get voucher
  app.get(
    '/vouchers/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const voucher = await prisma.voucher.findUnique({
        where: { id: request.params.id },
        include: { program: true },
      });
      if (!voucher) {
        return reply.status(404).send({ error: 'Voucher not found' });
      }

      const voucherInspections = await prisma.assistanceInspection.findMany({
        where: { voucherId: voucher.id },
        orderBy: { scheduledDate: 'desc' },
      });
      const lastInspection = voucherInspections[0];

      return reply.send({
        ...voucher,
        hapAmount: toNumber(voucher.hapAmount),
        tenantPortion: toNumber(voucher.tenantPortion),
        totalRent: toNumber(voucher.totalRent),
        utilityAllowance: toNumber(voucher.utilityAllowance),
        program: voucher.program ? {
          ...voucher.program,
          maxRent: voucher.program.maxRent ? toNumber(voucher.program.maxRent) : null,
          utilityAllowance: voucher.program.utilityAllowance ? toNumber(voucher.program.utilityAllowance) : null,
        } : null,
        daysUntilExpiration: getVoucherExpirationDays(voucher),
        inspectionDue: voucher.program?.requiresInspection
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
      const voucher = await prisma.voucher.findUnique({
        where: { id: request.params.id },
      });
      if (!voucher) {
        return reply.status(404).send({ error: 'Voucher not found' });
      }

      const updated = await prisma.voucher.update({
        where: { id: request.params.id },
        data: { status: 'active' },
      });

      return reply.send({
        ...updated,
        hapAmount: toNumber(updated.hapAmount),
        tenantPortion: toNumber(updated.tenantPortion),
        totalRent: toNumber(updated.totalRent),
        utilityAllowance: toNumber(updated.utilityAllowance),
      });
    }
  );

  // Terminate voucher
  app.post(
    '/vouchers/:id/terminate',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>,
      reply
    ) => {
      const voucher = await prisma.voucher.findUnique({
        where: { id: request.params.id },
      });
      if (!voucher) {
        return reply.status(404).send({ error: 'Voucher not found' });
      }

      const updated = await prisma.voucher.update({
        where: { id: request.params.id },
        data: { status: 'terminated' },
      });

      return reply.send({
        message: 'Voucher terminated',
        voucher: {
          ...updated,
          hapAmount: toNumber(updated.hapAmount),
          tenantPortion: toNumber(updated.tenantPortion),
          totalRent: toNumber(updated.totalRent),
          utilityAllowance: toNumber(updated.utilityAllowance),
        },
      });
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
      const voucher = await prisma.voucher.findUnique({
        where: { id: request.params.id },
      });
      if (!voucher) {
        return reply.status(404).send({ error: 'Voucher not found' });
      }

      const updated = await prisma.voucher.update({
        where: { id: request.params.id },
        data: {
          status: 'ported_out',
          portedTo: request.body.destinationAgency,
        },
      });

      return reply.send({
        message: 'Voucher ported',
        voucher: {
          ...updated,
          hapAmount: toNumber(updated.hapAmount),
          tenantPortion: toNumber(updated.tenantPortion),
          totalRent: toNumber(updated.totalRent),
          utilityAllowance: toNumber(updated.utilityAllowance),
        },
      });
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

      const inspection = await prisma.assistanceInspection.create({
        data: {
          programId: data.programId,
          propertyId: data.propertyId,
          unitId: data.unitId,
          voucherId: data.voucherId,
          type: data.type as AssistanceInspectionType,
          scheduledDate: new Date(data.scheduledDate),
          inspectorId: data.inspectorId,
          inspectorName: data.inspectorName,
          deficiencies: [],
        },
      });

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
      const results = await prisma.assistanceInspection.findMany({
        where: {
          ...(request.query.programId && { programId: request.query.programId }),
          ...(request.query.propertyId && { propertyId: request.query.propertyId }),
          ...(request.query.voucherId && { voucherId: request.query.voucherId }),
          ...(request.query.result && { result: request.query.result as AssistanceInspectionResult }),
        },
      });

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
      const inspection = await prisma.assistanceInspection.findUnique({
        where: { id: request.params.id },
      });
      if (!inspection) {
        return reply.status(404).send({ error: 'Inspection not found' });
      }

      const data = InspectionResultSchema.parse(request.body);
      const deficiencies = data.deficiencies.map((d, i) => ({
        id: `def_${Date.now()}_${i}`,
        ...d,
        correctionVerified: false,
      }));

      const updated = await prisma.assistanceInspection.update({
        where: { id: request.params.id },
        data: {
          result: data.result as AssistanceInspectionResult,
          completedDate: new Date(),
          deficiencies,
          reinspectionDeadline: data.reinspectionDeadline ? new Date(data.reinspectionDeadline) : null,
          notes: data.notes,
          reportUrl: data.reportUrl,
        },
      });

      return reply.send(updated);
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
      const inspection = await prisma.assistanceInspection.findUnique({
        where: { id: request.params.id },
      });
      if (!inspection) {
        return reply.status(404).send({ error: 'Inspection not found' });
      }

      const deficiencies = (inspection.deficiencies as unknown as InspectionDeficiency[]) || [];
      const deficiency = deficiencies.find((d) => d.id === request.params.defId);
      if (!deficiency) {
        return reply.status(404).send({ error: 'Deficiency not found' });
      }

      deficiency.correctedDate = new Date().toISOString();
      deficiency.correctionVerified = true;

      const updated = await prisma.assistanceInspection.update({
        where: { id: request.params.id },
        data: { deficiencies: JSON.parse(JSON.stringify(deficiencies)) },
      });

      return reply.send(updated);
    }
  );

  // Get deficiency summary
  app.get(
    '/inspections/deficiency-summary',
    async (
      request: FastifyRequest<{ Querystring: { programId?: string } }>,
      reply
    ) => {
      const results = await prisma.assistanceInspection.findMany({
        where: request.query.programId ? { programId: request.query.programId } : undefined,
      });

      const allDeficiencies = results.flatMap((i) => (i.deficiencies as unknown as InspectionDeficiency[]) || []);
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

      const payment = await prisma.assistancePaymentRecord.create({
        data: {
          voucherId: data.voucherId,
          programId: data.programId,
          propertyId: data.propertyId,
          landlordId: data.landlordId,
          period: data.period,
          hapAmount: data.hapAmount,
          adjustments: data.adjustments,
          netAmount: data.hapAmount + data.adjustments,
          status: 'scheduled',
          scheduledDate: new Date(data.scheduledDate),
        },
      });

      return reply.status(201).send({
        ...payment,
        hapAmount: toNumber(payment.hapAmount),
        adjustments: toNumber(payment.adjustments),
        netAmount: toNumber(payment.netAmount),
      });
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
      const results = await prisma.assistancePaymentRecord.findMany({
        where: {
          ...(request.query.voucherId && { voucherId: request.query.voucherId }),
          ...(request.query.landlordId && { landlordId: request.query.landlordId }),
          ...(request.query.period && { period: request.query.period }),
          ...(request.query.status && { status: request.query.status as AssistancePaymentStatus }),
        },
      });

      return reply.send({
        payments: results.map((p) => ({
          ...p,
          hapAmount: toNumber(p.hapAmount),
          adjustments: toNumber(p.adjustments),
          netAmount: toNumber(p.netAmount),
        })),
        summary: calculatePaymentSummary(results, request.query.period),
      });
    }
  );

  // Process payment
  app.post(
    '/payments/:id/process',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const payment = await prisma.assistancePaymentRecord.findUnique({
        where: { id: request.params.id },
      });
      if (!payment) {
        return reply.status(404).send({ error: 'Payment not found' });
      }

      const updated = await prisma.assistancePaymentRecord.update({
        where: { id: request.params.id },
        data: {
          status: 'paid',
          paidDate: new Date(),
          paymentReference: `HAP_${Date.now()}`,
        },
      });

      return reply.send({
        ...updated,
        hapAmount: toNumber(updated.hapAmount),
        adjustments: toNumber(updated.adjustments),
        netAmount: toNumber(updated.netAmount),
      });
    }
  );

  // Hold payment
  app.post(
    '/payments/:id/hold',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { notes: string } }>,
      reply
    ) => {
      const payment = await prisma.assistancePaymentRecord.findUnique({
        where: { id: request.params.id },
      });
      if (!payment) {
        return reply.status(404).send({ error: 'Payment not found' });
      }

      const updated = await prisma.assistancePaymentRecord.update({
        where: { id: request.params.id },
        data: {
          status: 'held',
          notes: request.body.notes,
        },
      });

      return reply.send({
        ...updated,
        hapAmount: toNumber(updated.hapAmount),
        adjustments: toNumber(updated.adjustments),
        netAmount: toNumber(updated.netAmount),
      });
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
      const now = new Date();

      const expirationDate = new Date();
      expirationDate.setFullYear(expirationDate.getFullYear() + 1);

      const requirements: CertificationRequirement[] = data.requirements.map((r, i) => ({
        id: `req_${Date.now()}_${i}`,
        name: r.name,
        description: r.description,
        completed: false,
      }));

      const certification = await prisma.landlordCertification.create({
        data: {
          landlordId: data.landlordId,
          propertyId: data.propertyId,
          programId: data.programId,
          certificationType: data.certificationType as CertificationType,
          certificationDate: now,
          expirationDate,
          status: 'active',
          requirements: JSON.parse(JSON.stringify(requirements)),
        },
      });

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
      const results = await prisma.landlordCertification.findMany({
        where: {
          ...(request.query.landlordId && { landlordId: request.query.landlordId }),
          ...(request.query.programId && { programId: request.query.programId }),
          ...(request.query.status && { status: request.query.status as CertificationStatus }),
        },
      });

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
      const certification = await prisma.landlordCertification.findUnique({
        where: { id: request.params.id },
      });
      if (!certification) {
        return reply.status(404).send({ error: 'Certification not found' });
      }

      const requirements = (certification.requirements as unknown as CertificationRequirement[]) || [];
      const requirement = requirements.find((r) => r.id === request.params.reqId);
      if (!requirement) {
        return reply.status(404).send({ error: 'Requirement not found' });
      }

      requirement.completed = true;
      requirement.completedDate = new Date().toISOString();
      requirement.documentUrl = request.body.documentUrl;

      const updated = await prisma.landlordCertification.update({
        where: { id: request.params.id },
        data: { requirements: JSON.parse(JSON.stringify(requirements)) },
      });

      return reply.send(updated);
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

      const [programVouchers, programInspections, programPayments] = await Promise.all([
        prisma.voucher.findMany({ where: { programId } }),
        prisma.assistanceInspection.findMany({ where: { programId } }),
        prisma.assistancePaymentRecord.findMany({ where: { programId, period } }),
      ]);

      const activeVouchers = programVouchers.filter((v) => v.status === 'active');
      const passRate = calculateInspectionPassRate(programInspections);

      const report = await prisma.complianceReport.create({
        data: {
          programId,
          reportType,
          period,
          data: {
            activeVouchers: activeVouchers.length,
            totalHAPPaid: programPayments
              .filter((p) => p.status === 'paid')
              .reduce((sum, p) => sum + toNumber(p.netAmount), 0),
            inspectionsConducted: programInspections.filter((i) => i.completedDate).length,
            inspectionsPass: passRate.passed,
            inspectionsFail: passRate.failed,
            newEnrollments: programVouchers.filter((v) =>
              v.effectiveDate.toISOString().startsWith(period)
            ).length,
            terminations: programVouchers.filter((v) => v.status === 'terminated').length,
            averageHAP: activeVouchers.length > 0
              ? activeVouchers.reduce((sum, v) => sum + toNumber(v.hapAmount), 0) / activeVouchers.length
              : 0,
            averageTenantPortion: activeVouchers.length > 0
              ? activeVouchers.reduce((sum, v) => sum + toNumber(v.tenantPortion), 0) / activeVouchers.length
              : 0,
          },
        },
      });

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
      const results = await prisma.complianceReport.findMany({
        where: request.query.programId ? { programId: request.query.programId } : undefined,
      });

      return reply.send({ reports: results });
    }
  );
}
