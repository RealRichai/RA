import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

type FormType = '1099-MISC' | '1099-NEC' | '1099-K' | '1099-INT' | 'W-9';
type RecipientType = 'vendor' | 'contractor' | 'owner' | 'tenant';
type DocumentStatus = 'draft' | 'pending_review' | 'approved' | 'filed' | 'corrected';
type FilingStatus = 'not_filed' | 'pending' | 'accepted' | 'rejected' | 'corrected';

interface TaxYear {
  id: string;
  year: number;
  status: 'open' | 'closed' | 'filed';
  filingDeadline: string;
  correctionDeadline: string;
  openedAt: string;
  closedAt?: string;
  filedAt?: string;
  createdAt: string;
}

interface TaxRecipient {
  id: string;
  type: RecipientType;
  entityId: string; // vendorId, ownerId, etc.
  name: string;
  businessName?: string;
  taxId?: string; // SSN or EIN (encrypted)
  taxIdType: 'ssn' | 'ein';
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  email?: string;
  w9OnFile: boolean;
  w9ReceivedDate?: string;
  w9DocumentUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface TaxDocument {
  id: string;
  taxYearId: string;
  year: number;
  formType: FormType;
  recipientId: string;
  payerId: string; // Property owner or management company
  status: DocumentStatus;
  filingStatus: FilingStatus;
  filingReference?: string;
  totalAmount: number;
  breakdown: TaxAmountBreakdown;
  generatedAt?: string;
  sentAt?: string;
  filedAt?: string;
  correctionOf?: string; // Original document ID if this is a correction
  documentUrl?: string;
  createdAt: string;
  updatedAt: string;
}

interface TaxAmountBreakdown {
  // 1099-MISC boxes
  rents?: number; // Box 1
  royalties?: number; // Box 2
  otherIncome?: number; // Box 3
  federalTaxWithheld?: number; // Box 4
  fishingBoatProceeds?: number; // Box 5
  medicalPayments?: number; // Box 6
  substitutePayments?: number; // Box 8
  cropInsurance?: number; // Box 9
  grossProceeds?: number; // Box 10
  fishPurchased?: number; // Box 11
  section409ADeferrals?: number; // Box 12
  excessGoldenParachute?: number; // Box 13
  nonqualifiedDeferredComp?: number; // Box 14
  stateTaxWithheld?: number; // Box 15

  // 1099-NEC
  nonemployeeCompensation?: number; // Box 1

  // 1099-K
  grossPaymentCard?: number;
  numberOfTransactions?: number;

  // 1099-INT
  interestIncome?: number;
}

interface TaxPayment {
  id: string;
  recipientId: string;
  taxYearId: string;
  paymentDate: string;
  amount: number;
  category: string;
  description: string;
  propertyId?: string;
  invoiceId?: string;
  isReportable: boolean;
  createdAt: string;
}

interface OwnerTaxPacket {
  id: string;
  ownerId: string;
  taxYearId: string;
  year: number;
  properties: PropertyTaxSummary[];
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  depreciationSchedule: DepreciationItem[];
  documents: string[];
  generatedAt: string;
  sentAt?: string;
  documentUrl?: string;
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

interface DepreciationItem {
  id: string;
  propertyId: string;
  assetDescription: string;
  datePlacedInService: string;
  originalCost: number;
  method: 'straight_line' | 'macrs';
  usefulLife: number;
  priorDepreciation: number;
  currentYearDepreciation: number;
  accumulatedDepreciation: number;
  remainingValue: number;
}

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

const taxYears = new Map<string, TaxYear>();
const taxRecipients = new Map<string, TaxRecipient>();
const taxDocuments = new Map<string, TaxDocument>();
const taxPayments = new Map<string, TaxPayment>();
const ownerTaxPackets = new Map<string, OwnerTaxPacket>();
const depreciationItems = new Map<string, DepreciationItem>();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function calculateReportablePayments(
  payments: TaxPayment[],
  threshold: number = 600
): Map<string, { total: number; payments: TaxPayment[] }> {
  const byRecipient = new Map<string, { total: number; payments: TaxPayment[] }>();

  for (const payment of payments) {
    if (!payment.isReportable) continue;

    const existing = byRecipient.get(payment.recipientId) || { total: 0, payments: [] };
    existing.total += payment.amount;
    existing.payments.push(payment);
    byRecipient.set(payment.recipientId, existing);
  }

  // Filter to only those meeting threshold
  const reportable = new Map<string, { total: number; payments: TaxPayment[] }>();
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
  // Simplified MACRS rates
  const residentialRates = [
    0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636,
    0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636,
    0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.03636, 0.01818,
  ]; // 27.5 years

  const commercialRates = [
    0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564,
    0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564,
    0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564,
    0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.02564, 0.01282,
  ]; // 39 years

  const rates = propertyType === 'residential' ? residentialRates : commercialRates;
  const rate = rates[yearNumber - 1] || 0;

  return Math.round(originalCost * rate * 100) / 100;
}

export function generateTaxSummary(
  documents: TaxDocument[],
  year: number
): {
  totalDocuments: number;
  byFormType: Record<string, number>;
  byStatus: Record<string, number>;
  totalAmount: number;
  filedCount: number;
  pendingCount: number;
} {
  const yearDocs = documents.filter((d) => d.year === year);

  const byFormType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let totalAmount = 0;

  for (const doc of yearDocs) {
    byFormType[doc.formType] = (byFormType[doc.formType] || 0) + 1;
    byStatus[doc.status] = (byStatus[doc.status] || 0) + 1;
    totalAmount += doc.totalAmount;
  }

  return {
    totalDocuments: yearDocs.length,
    byFormType,
    byStatus,
    totalAmount,
    filedCount: yearDocs.filter((d) => d.filingStatus === 'accepted').length,
    pendingCount: yearDocs.filter((d) => d.filingStatus === 'pending').length,
  };
}

export function validateTIN(tin: string, type: 'ssn' | 'ein'): boolean {
  const cleaned = tin.replace(/\D/g, '');

  if (type === 'ssn') {
    // SSN: 9 digits, not all zeros, valid area number
    if (cleaned.length !== 9) return false;
    if (cleaned === '000000000') return false;
    const area = parseInt(cleaned.substring(0, 3), 10);
    if (area === 0 || area === 666 || area >= 900) return false;
    return true;
  } else {
    // EIN: 9 digits, valid prefix
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
  entityId: z.string(),
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
  recipientId: z.string(),
  taxYearId: z.string(),
  paymentDate: z.string(),
  amount: z.number(),
  category: z.string(),
  description: z.string(),
  propertyId: z.string().optional(),
  invoiceId: z.string().optional(),
  isReportable: z.boolean().default(true),
});

const GenerateDocumentSchema = z.object({
  recipientId: z.string(),
  taxYearId: z.string(),
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
  propertyId: z.string(),
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

      const taxYear: TaxYear = {
        id: `ty_${data.year}`,
        ...data,
        status: 'open',
        openedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      taxYears.set(taxYear.id, taxYear);
      return reply.status(201).send(taxYear);
    }
  );

  // List tax years
  app.get('/years', async (_request, reply) => {
    const years = Array.from(taxYears.values()).sort((a, b) => b.year - a.year);
    return reply.send({ taxYears: years });
  });

  // Get tax year with summary
  app.get(
    '/years/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const taxYear = taxYears.get(request.params.id);
      if (!taxYear) {
        return reply.status(404).send({ error: 'Tax year not found' });
      }

      const docs = Array.from(taxDocuments.values());
      const summary = generateTaxSummary(docs, taxYear.year);

      return reply.send({ ...taxYear, summary });
    }
  );

  // Close tax year
  app.post(
    '/years/:id/close',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const taxYear = taxYears.get(request.params.id);
      if (!taxYear) {
        return reply.status(404).send({ error: 'Tax year not found' });
      }

      taxYear.status = 'closed';
      taxYear.closedAt = new Date().toISOString();
      taxYears.set(taxYear.id, taxYear);

      return reply.send(taxYear);
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
      const now = new Date().toISOString();

      // Validate TIN if provided
      if (data.taxId && !validateTIN(data.taxId, data.taxIdType)) {
        return reply.status(400).send({ error: 'Invalid tax identification number' });
      }

      const recipient: TaxRecipient = {
        id: `tr_${Date.now()}`,
        ...data,
        w9OnFile: false,
        createdAt: now,
        updatedAt: now,
      };

      taxRecipients.set(recipient.id, recipient);
      return reply.status(201).send(recipient);
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
      let results = Array.from(taxRecipients.values());

      if (request.query.type) {
        results = results.filter((r) => r.type === request.query.type);
      }
      if (request.query.hasW9 === 'true') {
        results = results.filter((r) => r.w9OnFile);
      } else if (request.query.hasW9 === 'false') {
        results = results.filter((r) => !r.w9OnFile);
      }
      if (request.query.search) {
        const search = request.query.search.toLowerCase();
        results = results.filter(
          (r) =>
            r.name.toLowerCase().includes(search) ||
            r.businessName?.toLowerCase().includes(search)
        );
      }

      return reply.send({ recipients: results });
    }
  );

  // Get recipient
  app.get(
    '/recipients/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const recipient = taxRecipients.get(request.params.id);
      if (!recipient) {
        return reply.status(404).send({ error: 'Recipient not found' });
      }

      // Get payment history
      const payments = Array.from(taxPayments.values()).filter(
        (p) => p.recipientId === recipient.id
      );

      // Get documents
      const documents = Array.from(taxDocuments.values()).filter(
        (d) => d.recipientId === recipient.id
      );

      return reply.send({
        ...recipient,
        payments,
        documents,
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
      const recipient = taxRecipients.get(request.params.id);
      if (!recipient) {
        return reply.status(404).send({ error: 'Recipient not found' });
      }

      const data = W9Schema.parse(request.body);
      recipient.w9OnFile = true;
      recipient.w9ReceivedDate = new Date().toISOString();
      recipient.w9DocumentUrl = data.w9DocumentUrl;
      recipient.updatedAt = new Date().toISOString();

      taxRecipients.set(recipient.id, recipient);
      return reply.send(recipient);
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

      const payment: TaxPayment = {
        id: `tp_${Date.now()}`,
        ...data,
        createdAt: new Date().toISOString(),
      };

      taxPayments.set(payment.id, payment);
      return reply.status(201).send(payment);
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
      let results = Array.from(taxPayments.values());

      if (request.query.taxYearId) {
        results = results.filter((p) => p.taxYearId === request.query.taxYearId);
      }
      if (request.query.recipientId) {
        results = results.filter((p) => p.recipientId === request.query.recipientId);
      }
      if (request.query.isReportable === 'true') {
        results = results.filter((p) => p.isReportable);
      }

      return reply.send({ payments: results });
    }
  );

  // Get reportable payments summary
  app.get(
    '/payments/reportable',
    async (
      request: FastifyRequest<{ Querystring: { taxYearId: string; threshold?: string } }>,
      reply
    ) => {
      const payments = Array.from(taxPayments.values()).filter(
        (p) => p.taxYearId === request.query.taxYearId
      );

      const threshold = parseFloat(request.query.threshold || '600');
      const reportable = calculateReportablePayments(payments, threshold);

      const summary = Array.from(reportable.entries()).map(([recipientId, data]) => {
        const recipient = taxRecipients.get(recipientId);
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
      const taxYear = taxYears.get(data.taxYearId);
      const recipient = taxRecipients.get(data.recipientId);

      if (!taxYear) {
        return reply.status(404).send({ error: 'Tax year not found' });
      }
      if (!recipient) {
        return reply.status(404).send({ error: 'Recipient not found' });
      }

      const now = new Date().toISOString();

      // Calculate total amount from breakdown
      const totalAmount = Object.values(data.breakdown).reduce(
        (sum, val) => sum + (val || 0),
        0
      );

      const document: TaxDocument = {
        id: `td_${Date.now()}`,
        taxYearId: data.taxYearId,
        year: taxYear.year,
        formType: data.formType,
        recipientId: data.recipientId,
        payerId: 'payer_default', // Would come from config
        status: 'draft',
        filingStatus: 'not_filed',
        totalAmount,
        breakdown: data.breakdown,
        generatedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      taxDocuments.set(document.id, document);
      return reply.status(201).send(document);
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
      let results = Array.from(taxDocuments.values());

      if (request.query.taxYearId) {
        results = results.filter((d) => d.taxYearId === request.query.taxYearId);
      }
      if (request.query.formType) {
        results = results.filter((d) => d.formType === request.query.formType);
      }
      if (request.query.status) {
        results = results.filter((d) => d.status === request.query.status);
      }
      if (request.query.recipientId) {
        results = results.filter((d) => d.recipientId === request.query.recipientId);
      }

      // Enrich with recipient info
      const enriched = results.map((d) => {
        const recipient = taxRecipients.get(d.recipientId);
        return {
          ...d,
          recipientName: recipient?.name,
          recipientType: recipient?.type,
        };
      });

      return reply.send({ documents: enriched });
    }
  );

  // Get document
  app.get(
    '/documents/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const document = taxDocuments.get(request.params.id);
      if (!document) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const recipient = taxRecipients.get(document.recipientId);
      return reply.send({ ...document, recipient });
    }
  );

  // Approve document
  app.post(
    '/documents/:id/approve',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const document = taxDocuments.get(request.params.id);
      if (!document) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      document.status = 'approved';
      document.updatedAt = new Date().toISOString();
      taxDocuments.set(document.id, document);

      return reply.send(document);
    }
  );

  // File document
  app.post(
    '/documents/:id/file',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const document = taxDocuments.get(request.params.id);
      if (!document) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      if (document.status !== 'approved') {
        return reply.status(400).send({ error: 'Document must be approved before filing' });
      }

      document.status = 'filed';
      document.filingStatus = 'pending';
      document.filedAt = new Date().toISOString();
      document.filingReference = `IRS_${Date.now()}`;
      document.updatedAt = new Date().toISOString();

      taxDocuments.set(document.id, document);
      return reply.send(document);
    }
  );

  // Send to recipient
  app.post(
    '/documents/:id/send',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const document = taxDocuments.get(request.params.id);
      if (!document) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      document.sentAt = new Date().toISOString();
      document.updatedAt = new Date().toISOString();
      taxDocuments.set(document.id, document);

      return reply.send({ message: 'Document sent to recipient', document });
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
      const original = taxDocuments.get(request.params.id);
      if (!original) {
        return reply.status(404).send({ error: 'Document not found' });
      }

      const now = new Date().toISOString();
      const totalAmount = Object.values(request.body.breakdown).reduce(
        (sum, val) => sum + (val || 0),
        0
      );

      const correction: TaxDocument = {
        id: `td_${Date.now()}`,
        taxYearId: original.taxYearId,
        year: original.year,
        formType: original.formType,
        recipientId: original.recipientId,
        payerId: original.payerId,
        status: 'draft',
        filingStatus: 'not_filed',
        totalAmount,
        breakdown: request.body.breakdown,
        correctionOf: original.id,
        generatedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      // Mark original as corrected
      original.status = 'corrected';
      original.updatedAt = now;
      taxDocuments.set(original.id, original);
      taxDocuments.set(correction.id, correction);

      return reply.status(201).send(correction);
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
      const taxYear = taxYears.get(request.body.taxYearId);
      if (!taxYear) {
        return reply.status(404).send({ error: 'Tax year not found' });
      }

      const totalIncome = request.body.properties.reduce((sum, p) => sum + p.totalIncome, 0);
      const totalExpenses = request.body.properties.reduce((sum, p) => sum + p.totalExpenses, 0);

      // Get depreciation for properties
      const depreciation = Array.from(depreciationItems.values()).filter((d) =>
        request.body.properties.some((p) => p.propertyId === d.propertyId)
      );

      const packet: OwnerTaxPacket = {
        id: `otp_${Date.now()}`,
        ownerId: request.body.ownerId,
        taxYearId: request.body.taxYearId,
        year: taxYear.year,
        properties: request.body.properties,
        totalIncome,
        totalExpenses,
        netIncome: totalIncome - totalExpenses,
        depreciationSchedule: depreciation,
        documents: [],
        generatedAt: new Date().toISOString(),
      };

      ownerTaxPackets.set(packet.id, packet);
      return reply.status(201).send(packet);
    }
  );

  // List owner packets
  app.get(
    '/owner-packets',
    async (
      request: FastifyRequest<{ Querystring: { ownerId?: string; taxYearId?: string } }>,
      reply
    ) => {
      let results = Array.from(ownerTaxPackets.values());

      if (request.query.ownerId) {
        results = results.filter((p) => p.ownerId === request.query.ownerId);
      }
      if (request.query.taxYearId) {
        results = results.filter((p) => p.taxYearId === request.query.taxYearId);
      }

      return reply.send({ packets: results });
    }
  );

  // Get owner packet
  app.get(
    '/owner-packets/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const packet = ownerTaxPackets.get(request.params.id);
      if (!packet) {
        return reply.status(404).send({ error: 'Packet not found' });
      }

      return reply.send(packet);
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
        // MACRS - determine property type based on useful life
        const propertyType = data.usefulLife <= 27.5 ? 'residential' : 'commercial';
        currentYearDepreciation = calculateMACRSDepreciation(
          data.originalCost,
          propertyType,
          yearsElapsed + 1
        );
        // Calculate accumulated for MACRS
        accumulatedDepreciation = 0;
        for (let i = 1; i <= yearsElapsed; i++) {
          accumulatedDepreciation += calculateMACRSDepreciation(data.originalCost, propertyType, i);
        }
        remainingValue = data.originalCost - accumulatedDepreciation;
      }

      const item: DepreciationItem = {
        id: `dep_${Date.now()}`,
        ...data,
        priorDepreciation: accumulatedDepreciation - currentYearDepreciation,
        currentYearDepreciation,
        accumulatedDepreciation,
        remainingValue,
      };

      depreciationItems.set(item.id, item);
      return reply.status(201).send(item);
    }
  );

  // List depreciation
  app.get(
    '/depreciation',
    async (
      request: FastifyRequest<{ Querystring: { propertyId?: string } }>,
      reply
    ) => {
      let results = Array.from(depreciationItems.values());

      if (request.query.propertyId) {
        results = results.filter((d) => d.propertyId === request.query.propertyId);
      }

      const totalCurrentYear = results.reduce((sum, d) => sum + d.currentYearDepreciation, 0);
      const totalAccumulated = results.reduce((sum, d) => sum + d.accumulatedDepreciation, 0);

      return reply.send({
        items: results,
        summary: {
          totalItems: results.length,
          totalCurrentYearDepreciation: totalCurrentYear,
          totalAccumulatedDepreciation: totalAccumulated,
        },
      });
    }
  );
}

// Export for testing
export {
  taxYears,
  taxRecipients,
  taxDocuments,
  taxPayments,
  ownerTaxPackets,
  depreciationItems,
};
