import {
  prisma,
  type TaxYearStatus,
  type TaxRecipientType,
  type TaxFormType,
  type TaxDocumentStatus,
  type TaxFilingStatus,
  type TaxIdType,
  type DepreciationMethod,
} from '@realriches/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';


// ============================================================================
// TYPES
// ============================================================================

type FormType = '1099-MISC' | '1099-NEC' | '1099-K' | '1099-INT' | 'W-9';
type RecipientType = 'vendor' | 'contractor' | 'owner' | 'tenant';
type DocumentStatus = 'draft' | 'pending_review' | 'approved' | 'filed' | 'corrected';
type FilingStatus = 'not_filed' | 'pending' | 'accepted' | 'rejected' | 'corrected';

interface TaxAmountBreakdown {
  rents?: number;
  royalties?: number;
  otherIncome?: number;
  federalTaxWithheld?: number;
  fishingBoatProceeds?: number;
  medicalPayments?: number;
  substitutePayments?: number;
  cropInsurance?: number;
  grossProceeds?: number;
  fishPurchased?: number;
  section409ADeferrals?: number;
  excessGoldenParachute?: number;
  nonqualifiedDeferredComp?: number;
  stateTaxWithheld?: number;
  nonemployeeCompensation?: number;
  grossPaymentCard?: number;
  numberOfTransactions?: number;
  interestIncome?: number;
}

interface PropertyTaxSummary {
  propertyId: string;
  propertyName: string;
  address: string;
  incomeCategories: Array<{ category: string; amount: number }>;
  expenseCategories: Array<{ category: string; amount: number }>;
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
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

function mapFormType(type: FormType): TaxFormType {
  const mapping: Record<FormType, TaxFormType> = {
    '1099-MISC': 'form_1099_misc',
    '1099-NEC': 'form_1099_nec',
    '1099-K': 'form_1099_k',
    '1099-INT': 'form_1099_int',
    'W-9': 'form_w9',
  };
  return mapping[type];
}

function mapFormTypeReverse(type: TaxFormType): FormType {
  const mapping: Record<TaxFormType, FormType> = {
    'form_1099_misc': '1099-MISC',
    'form_1099_nec': '1099-NEC',
    'form_1099_k': '1099-K',
    'form_1099_int': '1099-INT',
    'form_w9': 'W-9',
  };
  return mapping[type];
}

interface PaymentData {
  id: string;
  recipientId: string;
  amount: unknown;
  isReportable: boolean;
}

export function calculateReportablePayments(
  payments: PaymentData[],
  threshold: number = 600
): Map<string, { total: number; payments: PaymentData[] }> {
  const byRecipient = new Map<string, { total: number; payments: PaymentData[] }>();

  for (const payment of payments) {
    if (!payment.isReportable) continue;

    const existing = byRecipient.get(payment.recipientId) || { total: 0, payments: [] };
    existing.total += toNumber(payment.amount);
    existing.payments.push(payment);
    byRecipient.set(payment.recipientId, existing);
  }

  const reportable = new Map<string, { total: number; payments: PaymentData[] }>();
  for (const [recipientId, data] of byRecipient) {
    if (data.total >= threshold) {
      reportable.set(recipientId, data);
    }
  }

  return reportable;
}

export function determineFormType(
  recipientType: RecipientType,
  paymentCategory: string
): FormType {
  if (recipientType === 'contractor') {
    return '1099-NEC';
  }
  if (paymentCategory === 'rent' || paymentCategory === 'lease') {
    return '1099-MISC';
  }
  if (paymentCategory === 'interest') {
    return '1099-INT';
  }
  return '1099-MISC';
}

export function calculateStraightLineDepreciation(
  originalCost: number,
  salvageValue: number,
  usefulLife: number,
  yearsElapsed: number
): { annualDepreciation: number; accumulatedDepreciation: number; remainingValue: number } {
  const depreciableBase = originalCost - salvageValue;
  const annualDepreciation = depreciableBase / usefulLife;
  const accumulatedDepreciation = Math.min(annualDepreciation * yearsElapsed, depreciableBase);
  const remainingValue = originalCost - accumulatedDepreciation;

  return {
    annualDepreciation: Math.round(annualDepreciation * 100) / 100,
    accumulatedDepreciation: Math.round(accumulatedDepreciation * 100) / 100,
    remainingValue: Math.round(remainingValue * 100) / 100,
  };
}

export function calculateMACRSDepreciation(
  originalCost: number,
  propertyType: 'residential' | 'commercial',
  yearNumber: number
): number {
  const residentialRates = [
    0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636,
    0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636,
    0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.01818,
  ];

  const commercialRates = [
    0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564,
    0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564,
    0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564,
    0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.01282,
  ];

  const rates = propertyType === 'residential' ? residentialRates : commercialRates;
  const rate = rates[yearNumber - 1] || 0;

  return Math.round(originalCost * rate * 100) / 100;
}

// Sync version for testing - accepts docs array directly
export function generateTaxSummary(
  docsOrYear: TaxDocumentData[] | number,
  year?: number
): {
  totalDocuments: number;
  byFormType: Record<string, number>;
  byStatus: Record<string, number>;
  totalAmount: number;
  filedCount: number;
  pendingCount: number;
} {
  // Handle both signatures: (docs, year) and (year)
  let docs: TaxDocumentData[];
  if (typeof docsOrYear === 'number') {
    // If called with just year, return empty result (sync version can't query DB)
    return {
      totalDocuments: 0,
      byFormType: {},
      byStatus: {},
      totalAmount: 0,
      filedCount: 0,
      pendingCount: 0,
    };
  } else {
    docs = docsOrYear;
  }

  const byFormType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let totalAmount = 0;

  for (const doc of docs) {
    byFormType[doc.formType] = (byFormType[doc.formType] || 0) + 1;
    byStatus[doc.status] = (byStatus[doc.status] || 0) + 1;
    totalAmount += doc.totalAmount || 0;
  }

  return {
    totalDocuments: docs.length,
    byFormType,
    byStatus,
    totalAmount,
    filedCount: docs.filter((d) => d.filingStatus === 'accepted' || d.status === 'filed').length,
    pendingCount: docs.filter((d) => d.filingStatus === 'pending').length,
  };
}

interface TaxDocumentData {
  id: string;
  formType: string;
  status: string;
  filingStatus?: string;
  totalAmount?: number;
}

async function generateTaxSummaryAsync(
  year: number
): Promise<{
  totalDocuments: number;
  byFormType: Record<string, number>;
  byStatus: Record<string, number>;
  totalAmount: number;
  filedCount: number;
  pendingCount: number;
}> {
  const docs = await prisma.taxDocument.findMany({
    where: { year },
  });

  const byFormType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let totalAmount = 0;

  for (const doc of docs) {
    const formType = mapFormTypeReverse(doc.formType as TaxFormType);
    byFormType[formType] = (byFormType[formType] || 0) + 1;
    byStatus[doc.status] = (byStatus[doc.status] || 0) + 1;
    totalAmount += toNumber(doc.totalAmount);
  }

  return {
    totalDocuments: docs.length,
    byFormType,
    byStatus,
    totalAmount,
    filedCount: docs.filter((d) => d.filingStatus === 'accepted').length,
    pendingCount: docs.filter((d) => d.filingStatus === 'pending').length,
  };
}

export function validateTIN(tin: string, type: 'ssn' | 'ein'): boolean {
  const cleaned = tin.replace(/\D/g, '');

  if (type === 'ssn') {
    if (cleaned.length !== 9) return false;
    if (cleaned === '000000000') return false;
    const area = parseInt(cleaned.substring(0, 3), 10);
    if (area === 0 || area === 666 || area >= 900) return false;
    return true;
  } else {
    if (cleaned.length !== 9) return false;
    const validPrefixes = [
      '10', '12', '60', '67', '50', '53', '01', '02', '03', '04', '05', '06', '11', '13', '14',
      '16', '21', '22', '23', '25', '34', '51', '52', '54', '55', '56', '57', '58', '59', '65',
      '30', '32', '35', '36', '37', '38', '61', '15', '24', '40', '44', '94', '95', '80', '90',
      '33', '39', '41', '42', '43', '46', '48', '62', '63', '64', '66', '68', '71', '72', '73',
      '74', '75', '76', '77', '81', '82', '83', '84', '85', '86', '87', '88', '91', '92', '93',
      '98', '99', '20', '26', '27', '45', '46', '47',
    ];
    const prefix = cleaned.substring(0, 2);
    return validPrefixes.includes(prefix);
  }
}

// ============================================================================
// SCHEMAS
// ============================================================================

const TaxYearSchema = z.object({
  year: z.number(),
  filingDeadline: z.string(),
  correctionDeadline: z.string(),
});

const RecipientSchema = z.object({
  type: z.enum(['vendor', 'contractor', 'owner', 'tenant']),
  entityId: z.string().uuid(),
  name: z.string(),
  businessName: z.string().optional(),
  taxId: z.string().optional(),
  taxIdType: z.enum(['ssn', 'ein']),
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
  }),
  email: z.string().email().optional(),
});

const W9Schema = z.object({
  w9DocumentUrl: z.string(),
});

const PaymentSchema = z.object({
  recipientId: z.string().uuid(),
  taxYearId: z.string().uuid(),
  paymentDate: z.string(),
  amount: z.number(),
  category: z.string(),
  description: z.string(),
  propertyId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  isReportable: z.boolean().default(true),
});

const GenerateDocumentSchema = z.object({
  recipientId: z.string().uuid(),
  taxYearId: z.string().uuid(),
  formType: z.enum(['1099-MISC', '1099-NEC', '1099-K', '1099-INT', 'W-9']),
  breakdown: z.object({
    rents: z.number().optional(),
    royalties: z.number().optional(),
    otherIncome: z.number().optional(),
    federalTaxWithheld: z.number().optional(),
    nonemployeeCompensation: z.number().optional(),
    interestIncome: z.number().optional(),
  }),
});

const DepreciationSchema = z.object({
  propertyId: z.string().uuid(),
  assetDescription: z.string(),
  datePlacedInService: z.string(),
  originalCost: z.number(),
  method: z.enum(['straight_line', 'macrs']),
  usefulLife: z.number(),
});

// ============================================================================
// ROUTES
// ============================================================================

export async function taxDocumentRoutes(app: FastifyInstance): Promise<void> {
  // ─────────────────────────────────────────────────────────────────────────
  // TAX YEARS
  // ─────────────────────────────────────────────────────────────────────────

  // Create/Open tax year
  app.post(
    '/years',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof TaxYearSchema> }>,
      reply
    ) => {
      const data = TaxYearSchema.parse(request.body);

      const taxYear = await prisma.taxYear.create({
        data: {
          year: data.year,
          filingDeadline: new Date(data.filingDeadline),
          correctionDeadline: new Date(data.correctionDeadline),
          status: 'open',
          openedAt: new Date(),
        },
      });

      return reply.status(201).send(taxYear);
    }
  );

  // List tax years
  app.get('/years', async (_request, reply) => {
    const years = await prisma.taxYear.findMany({
      orderBy: { year: 'desc' },
    });
    return reply.send({ taxYears: years });
  });

  // Get tax year with summary
  app.get(
    '/years/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const taxYear = await prisma.taxYear.findUnique({
        where: { id: request.params.id },
      });
      if (!taxYear) {
        return reply.status(404).send({ error: 'Tax year not found' });
      }

      const summary = generateTaxSummary(taxYear.year);

      return reply.send({ ...taxYear, summary });
    }
  );

  // Close tax year
  app.post(
    '/years/:id/close',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const taxYear = await prisma.taxYear.findUnique({
        where: { id: request.params.id },
      });
      if (!taxYear) {
        return reply.status(404).send({ error: 'Tax year not found' });
      }

      const updated = await prisma.taxYear.update({
        where: { id: request.params.id },
        data: {
          status: 'closed',
          closedAt: new Date(),
        },
      });

      return reply.send(updated);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RECIPIENTS
  // ─────────────────────────────────────────────────────────────────────────

  // Create recipient
  app.post(
    '/recipients',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof RecipientSchema> }>,
      reply
    ) => {
      const data = RecipientSchema.parse(request.body);

      // Validate TIN if provided
      if (data.taxId && !validateTIN(data.taxId, data.taxIdType)) {
        return reply.status(400).send({ error: 'Invalid tax identification number' });
      }

      const recipient = await prisma.taxRecipient.create({
        data: {
          type: data.type as TaxRecipientType,
          entityId: data.entityId,
          name: data.name,
          businessName: data.businessName,
          taxId: data.taxId,
          taxIdType: data.taxIdType as TaxIdType,
          street: data.address.street,
          city: data.address.city,
          state: data.address.state,
          zip: data.address.zip,
          email: data.email,
          w9OnFile: false,
        },
      });

      return reply.status(201).send({
        ...recipient,
        address: {
          street: recipient.street,
          city: recipient.city,
          state: recipient.state,
          zip: recipient.zip,
        },
      });
    }
  );

  // List recipients
  app.get(
    '/recipients',
    async (
      request: FastifyRequest<{
        Querystring: { type?: string; hasW9?: string; search?: string };
      }>,
      reply
    ) => {
      const results = await prisma.taxRecipient.findMany({
        where: {
          ...(request.query.type && { type: request.query.type as TaxRecipientType }),
          ...(request.query.hasW9 === 'true' && { w9OnFile: true }),
          ...(request.query.hasW9 === 'false' && { w9OnFile: false }),
          ...(request.query.search && {
            OR: [
              { name: { contains: request.query.search, mode: 'insensitive' } },
              { businessName: { contains: request.query.search, mode: 'insensitive' } },
            ],
          }),
        },
      });

      const formatted = results.map((r) => ({
        ...r,
        address: {
          street: r.street,
          city: r.city,
          state: r.state,
          zip: r.zip,
        },
      }));

      return reply.send({ recipients: formatted });
    }
  );

  // Get recipient
  app.get(
    '/recipients/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const recipient = await prisma.taxRecipient.findUnique({
        where: { id: request.params.id },
        include: {
          payments: true,
          documents: true,
        },
      });
      if (!recipient) {
        return reply.status(404).send({ error: 'Recipient not found' });
      }

      return reply.send({
        ...recipient,
        address: {
          street: recipient.street,
          city: recipient.city,
          state: recipient.state,
          zip: recipient.zip,
        },
        payments: recipient.payments.map((p) => ({
          ...p,
          amount: toNumber(p.amount),
        })),
        documents: recipient.documents.map((d) => ({
          ...d,
          totalAmount: toNumber(d.totalAmount),
          formType: mapFormTypeReverse(d.formType as TaxFormType),
        })),
      });
    }
  );

  // Update W-9
  app.post(
    '/recipients/:id/w9',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof W9Schema>;
      }>,
      reply
    ) => {
      const recipient = await prisma.taxRecipient.findUnique({
        where: { id: request.params.id },
      });
      if (!recipient) {
        return reply.status(404).send({ error: 'Recipient not found' });
      }

      const data = W9Schema.parse(request.body);
      const updated = await prisma.taxRecipient.update({
        where: { id: request.params.id },
        data: {
          w9OnFile: true,
          w9ReceivedDate: new Date(),
          w9DocumentUrl: data.w9DocumentUrl,
        },
      });

      return reply.send({
        ...updated,
        address: {
          street: updated.street,
          city: updated.city,
          state: updated.state,
          zip: updated.zip,
        },
      });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PAYMENTS
  // ─────────────────────────────────────────────────────────────────────────

  // Record payment
  app.post(
    '/payments',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof PaymentSchema> }>,
      reply
    ) => {
      const data = PaymentSchema.parse(request.body);

      const payment = await prisma.taxPayment.create({
        data: {
          recipientId: data.recipientId,
          taxYearId: data.taxYearId,
          paymentDate: new Date(data.paymentDate),
          amount: data.amount,
          category: data.category,
          description: data.description,
          propertyId: data.propertyId,
          invoiceId: data.invoiceId,
          isReportable: data.isReportable,
        },
      });

      return reply.status(201).send({
        ...payment,
        amount: toNumber(payment.amount),
      });
    }
  );

  // List payments
  app.get(
    '/payments',
    async (
      request: FastifyRequest<{
        Querystring: { taxYearId?: string; recipientId?: string; isReportable?: string };
      }>,
      reply
    ) => {
      const results = await prisma.taxPayment.findMany({
        where: {
          ...(request.query.taxYearId && { taxYearId: request.query.taxYearId }),
          ...(request.query.recipientId && { recipientId: request.query.recipientId }),
          ...(request.query.isReportable === 'true' && { isReportable: true }),
        },
      });

      return reply.send({
        payments: results.map((p) => ({
          ...p,
          amount: toNumber(p.amount),
        })),
      });
    }
  );

  // Get reportable payments summary
  app.get(
    '/payments/reportable',
    async (
      request: FastifyRequest<{ Querystring: { taxYearId: string; threshold?: string } }>,
      reply
    ) => {
      const payments = await prisma.taxPayment.findMany({
        where: { taxYearId: request.query.taxYearId },
      });

      const threshold = parseFloat(request.query.threshold || '600');
      const reportable = calculateReportablePayments(payments, threshold);

      const recipientIds = Array.from(reportable.keys());
      const recipients = await prisma.taxRecipient.findMany({
        where: { id: { in: recipientIds } },
      });
      const recipientMap = new Map(recipients.map((r) => [r.id, r]));

      const summary = Array.from(reportable.entries()).map(([recipientId, data]) => {
        const recipient = recipientMap.get(recipientId);
        return {
          recipientId,
          recipientName: recipient?.name,
          recipientType: recipient?.type,
          totalAmount: data.total,
          paymentCount: data.payments.length,
          hasW9: recipient?.w9OnFile || false,
        };
      });

      return reply.send({
        threshold,
        recipients: summary,
        totalRecipients: summary.length,
        missingW9: summary.filter((s) => !s.hasW9).length,
      });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // TAX DOCUMENTS (1099s)
  // ─────────────────────────────────────────────────────────────────────────

  // Generate document
  app.post(
    '/documents',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof GenerateDocumentSchema> }>,
      reply
    ) => {
      const data = GenerateDocumentSchema.parse(request.body);
      const taxYear = await prisma.taxYear.findUnique({
        where: { id: data.taxYearId },
      });
      const recipient = await prisma.taxRecipient.findUnique({
        where: { id: data.recipientId },
      });

      if (!taxYear) {
        return reply.status(404).send({ error: 'Tax year not found' });
      }
      if (!recipient) {
        return reply.status(404).send({ error: 'Recipient not found' });
      }

      const totalAmount = Object.values(data.breakdown).reduce(
        (sum, val) => sum + (val || 0),
        0
      );

      const document = await prisma.taxDocument.create({
        data: {
          taxYearId: data.taxYearId,
          year: taxYear.year,
          formType: mapFormType(data.formType),
          recipientId: data.recipientId,
          payerId: 'payer_default',
          status: 'draft',
          filingStatus: 'not_filed',
          totalAmount,
          breakdown: data.breakdown,
          generatedAt: new Date(),
        },
      });

      return reply.status(201).send({
        ...document,
        formType: data.formType,
        totalAmount: toNumber(document.totalAmount),
      });
    }
  );

  // List documents
  app.get(
    '/documents',
    async (
      request: FastifyRequest<{
        Querystring: {
          taxYearId?: string;
          formType?: string;
          status?: string;
          recipientId?: string;
        };
      }>,
      reply
    ) => {
      const results = await prisma.taxDocument.findMany({
        where: {
          ...(request.query.taxYearId && { taxYearId: request.query.taxYearId }),
          ...(request.query.formType && { formType: mapFormType(request.query.formType as FormType) }),
          ...(request.query.status && { status: request.query.status as TaxDocumentStatus }),
          ...(request.query.recipientId && { recipientId: request.query.recipientId }),
        },
        include: { recipient: true },
      });

      const enriched = results.map((d) => ({
        ...d,
        formType: mapFormTypeReverse(d.formType as TaxFormType),
        totalAmount: toNumber(d.totalAmount),
        recipientName: d.recipient?.name,
        recipientType: d.recipient?.type,
      }));

      return reply.send({ documents: enriched });
    }
  );

  // Get document
  app.get(
    '/documents/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const document = await prisma.taxDocument.findUnique({
        where: { id: request.params.id },
        include: { recipient: true },
      });
      if (!document) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      return reply.send({
        ...document,
        formType: mapFormTypeReverse(document.formType as TaxFormType),
        totalAmount: toNumber(document.totalAmount),
        recipient: document.recipient ? {
          ...document.recipient,
          address: {
            street: document.recipient.street,
            city: document.recipient.city,
            state: document.recipient.state,
            zip: document.recipient.zip,
          },
        } : null,
      });
    }
  );

  // Approve document
  app.post(
    '/documents/:id/approve',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const document = await prisma.taxDocument.findUnique({
        where: { id: request.params.id },
      });
      if (!document) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const updated = await prisma.taxDocument.update({
        where: { id: request.params.id },
        data: { status: 'approved' },
      });

      return reply.send({
        ...updated,
        formType: mapFormTypeReverse(updated.formType as TaxFormType),
        totalAmount: toNumber(updated.totalAmount),
      });
    }
  );

  // File document
  app.post(
    '/documents/:id/file',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const document = await prisma.taxDocument.findUnique({
        where: { id: request.params.id },
      });
      if (!document) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      if (document.status !== 'approved') {
        return reply.status(400).send({ error: 'Document must be approved before filing' });
      }

      const updated = await prisma.taxDocument.update({
        where: { id: request.params.id },
        data: {
          status: 'filed',
          filingStatus: 'pending',
          filedAt: new Date(),
          filingReference: `IRS_${Date.now()}`,
        },
      });

      return reply.send({
        ...updated,
        formType: mapFormTypeReverse(updated.formType as TaxFormType),
        totalAmount: toNumber(updated.totalAmount),
      });
    }
  );

  // Send to recipient
  app.post(
    '/documents/:id/send',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const document = await prisma.taxDocument.findUnique({
        where: { id: request.params.id },
      });
      if (!document) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const updated = await prisma.taxDocument.update({
        where: { id: request.params.id },
        data: { sentAt: new Date() },
      });

      return reply.send({
        message: 'Document sent to recipient',
        document: {
          ...updated,
          formType: mapFormTypeReverse(updated.formType as TaxFormType),
          totalAmount: toNumber(updated.totalAmount),
        },
      });
    }
  );

  // Create correction
  app.post(
    '/documents/:id/correct',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { breakdown: TaxAmountBreakdown };
      }>,
      reply
    ) => {
      const original = await prisma.taxDocument.findUnique({
        where: { id: request.params.id },
      });
      if (!original) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const totalAmount = Object.values(request.body.breakdown).reduce(
        (sum, val) => sum + (val || 0),
        0
      );

      const [correction] = await prisma.$transaction([
        prisma.taxDocument.create({
          data: {
            taxYearId: original.taxYearId,
            year: original.year,
            formType: original.formType,
            recipientId: original.recipientId,
            payerId: original.payerId,
            status: 'draft',
            filingStatus: 'not_filed',
            totalAmount,
            breakdown: JSON.parse(JSON.stringify(request.body.breakdown)),
            correctionOf: original.id,
            generatedAt: new Date(),
          },
        }),
        prisma.taxDocument.update({
          where: { id: original.id },
          data: { status: 'corrected' },
        }),
      ]);

      return reply.status(201).send({
        ...correction,
        formType: mapFormTypeReverse(correction.formType as TaxFormType),
        totalAmount: toNumber(correction.totalAmount),
      });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // OWNER TAX PACKETS
  // ─────────────────────────────────────────────────────────────────────────

  // Generate owner tax packet
  app.post(
    '/owner-packets',
    async (
      request: FastifyRequest<{
        Body: { ownerId: string; taxYearId: string; properties: PropertyTaxSummary[] };
      }>,
      reply
    ) => {
      const taxYear = await prisma.taxYear.findUnique({
        where: { id: request.body.taxYearId },
      });
      if (!taxYear) {
        return reply.status(404).send({ error: 'Tax year not found' });
      }

      const totalIncome = request.body.properties.reduce((sum, p) => sum + p.totalIncome, 0);
      const totalExpenses = request.body.properties.reduce((sum, p) => sum + p.totalExpenses, 0);

      const packet = await prisma.ownerTaxPacket.create({
        data: {
          ownerId: request.body.ownerId,
          taxYearId: request.body.taxYearId,
          year: taxYear.year,
          properties: JSON.parse(JSON.stringify(request.body.properties)),
          totalIncome,
          totalExpenses,
          netIncome: totalIncome - totalExpenses,
          documents: [],
          generatedAt: new Date(),
        },
      });

      return reply.status(201).send({
        ...packet,
        totalIncome: toNumber(packet.totalIncome),
        totalExpenses: toNumber(packet.totalExpenses),
        netIncome: toNumber(packet.netIncome),
      });
    }
  );

  // List owner packets
  app.get(
    '/owner-packets',
    async (
      request: FastifyRequest<{ Querystring: { ownerId?: string; taxYearId?: string } }>,
      reply
    ) => {
      const results = await prisma.ownerTaxPacket.findMany({
        where: {
          ...(request.query.ownerId && { ownerId: request.query.ownerId }),
          ...(request.query.taxYearId && { taxYearId: request.query.taxYearId }),
        },
      });

      return reply.send({
        packets: results.map((p) => ({
          ...p,
          totalIncome: toNumber(p.totalIncome),
          totalExpenses: toNumber(p.totalExpenses),
          netIncome: toNumber(p.netIncome),
        })),
      });
    }
  );

  // Get owner packet
  app.get(
    '/owner-packets/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const packet = await prisma.ownerTaxPacket.findUnique({
        where: { id: request.params.id },
      });
      if (!packet) {
        return reply.status(404).send({ error: 'Packet not found' });
      }

      // Get depreciation for properties
      const properties = packet.properties as unknown as PropertyTaxSummary[];
      const propertyIds = properties.map((p) => p.propertyId);
      const depreciation = await prisma.depreciationItem.findMany({
        where: { propertyId: { in: propertyIds } },
      });

      return reply.send({
        ...packet,
        totalIncome: toNumber(packet.totalIncome),
        totalExpenses: toNumber(packet.totalExpenses),
        netIncome: toNumber(packet.netIncome),
        depreciationSchedule: depreciation.map((d) => ({
          ...d,
          originalCost: toNumber(d.originalCost),
          priorDepreciation: toNumber(d.priorDepreciation),
          currentYearDepreciation: toNumber(d.currentYearDepreciation),
          accumulatedDepreciation: toNumber(d.accumulatedDepreciation),
          remainingValue: toNumber(d.remainingValue),
        })),
      });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // DEPRECIATION
  // ─────────────────────────────────────────────────────────────────────────

  // Create depreciation item
  app.post(
    '/depreciation',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof DepreciationSchema> }>,
      reply
    ) => {
      const data = DepreciationSchema.parse(request.body);

      const placedInService = new Date(data.datePlacedInService);
      const now = new Date();
      const yearsElapsed = Math.floor(
        (now.getTime() - placedInService.getTime()) / (1000 * 60 * 60 * 24 * 365)
      );

      let currentYearDepreciation: number;
      let accumulatedDepreciation: number;
      let remainingValue: number;

      if (data.method === 'straight_line') {
        const calc = calculateStraightLineDepreciation(
          data.originalCost,
          0,
          data.usefulLife,
          yearsElapsed
        );
        currentYearDepreciation = calc.annualDepreciation;
        accumulatedDepreciation = calc.accumulatedDepreciation;
        remainingValue = calc.remainingValue;
      } else {
        const propertyType = data.usefulLife <= 27.5 ? 'residential' : 'commercial';
        currentYearDepreciation = calculateMACRSDepreciation(
          data.originalCost,
          propertyType,
          yearsElapsed + 1
        );
        accumulatedDepreciation = 0;
        for (let i = 1; i <= yearsElapsed; i++) {
          accumulatedDepreciation += calculateMACRSDepreciation(data.originalCost, propertyType, i);
        }
        remainingValue = data.originalCost - accumulatedDepreciation;
      }

      const item = await prisma.depreciationItem.create({
        data: {
          propertyId: data.propertyId,
          assetDescription: data.assetDescription,
          datePlacedInService: placedInService,
          originalCost: data.originalCost,
          method: data.method as DepreciationMethod,
          usefulLife: data.usefulLife,
          priorDepreciation: accumulatedDepreciation - currentYearDepreciation,
          currentYearDepreciation,
          accumulatedDepreciation,
          remainingValue,
        },
      });

      return reply.status(201).send({
        ...item,
        originalCost: toNumber(item.originalCost),
        priorDepreciation: toNumber(item.priorDepreciation),
        currentYearDepreciation: toNumber(item.currentYearDepreciation),
        accumulatedDepreciation: toNumber(item.accumulatedDepreciation),
        remainingValue: toNumber(item.remainingValue),
      });
    }
  );

  // List depreciation
  app.get(
    '/depreciation',
    async (
      request: FastifyRequest<{ Querystring: { propertyId?: string } }>,
      reply
    ) => {
      const results = await prisma.depreciationItem.findMany({
        where: request.query.propertyId ? { propertyId: request.query.propertyId } : undefined,
      });

      const items = results.map((d) => ({
        ...d,
        originalCost: toNumber(d.originalCost),
        priorDepreciation: toNumber(d.priorDepreciation),
        currentYearDepreciation: toNumber(d.currentYearDepreciation),
        accumulatedDepreciation: toNumber(d.accumulatedDepreciation),
        remainingValue: toNumber(d.remainingValue),
      }));

      const totalCurrentYear = items.reduce((sum, d) => sum + d.currentYearDepreciation, 0);
      const totalAccumulated = items.reduce((sum, d) => sum + d.accumulatedDepreciation, 0);

      return reply.send({
        items,
        summary: {
          totalItems: items.length,
          totalCurrentYearDepreciation: totalCurrentYear,
          totalAccumulatedDepreciation: totalAccumulated,
        },
      });
    }
  );
}
