import {
  prisma,
  Prisma,
  type OwnershipType as PrismaOwnershipType,
  type DistributionMethod as PrismaDistributionMethod,
  type StatementPeriod as PrismaStatementPeriod,
  type StatementStatus as PrismaStatementStatus,
  type DistributionStatus as PrismaDistributionStatus,
  type TaxFormType as PrismaTaxFormType,
  type TaxDocumentStatus as PrismaTaxDocumentStatus,
} from '@realriches/database';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Helper for Decimal to number conversion
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

// ============================================================================
// Types
// ============================================================================

export type StatementPeriod = 'monthly' | 'quarterly' | 'annual';
export type StatementStatus = 'draft' | 'generated' | 'sent' | 'viewed';
export type DistributionStatus = 'pending' | 'scheduled' | 'processing' | 'completed' | 'failed';
export type DistributionMethod = 'ach' | 'check' | 'wire' | 'hold';

export interface Owner {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  taxId: string | null; // SSN or EIN (encrypted in real implementation)
  taxIdType: 'ssn' | 'ein' | null;
  ownershipType: 'individual' | 'llc' | 'corporation' | 'partnership' | 'trust';
  distributionMethod: DistributionMethod;
  bankAccountId: string | null;
  holdDistributions: boolean;
  minimumDistributionAmount: number;
  statementDelivery: 'email' | 'mail' | 'both' | 'portal_only';
  portalEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PropertyOwnership {
  id: string;
  ownerId: string;
  propertyId: string;
  ownershipPercentage: number;
  effectiveDate: Date;
  endDate: Date | null;
  isPrimaryContact: boolean;
  managementFeeType: 'percentage' | 'flat';
  managementFeeAmount: number;
  reservePercentage: number;
  createdAt: Date;
}

export interface OwnerStatement {
  id: string;
  ownerId: string;
  propertyId: string;
  period: StatementPeriod;
  periodStart: Date;
  periodEnd: Date;
  status: StatementStatus;
  income: StatementIncome;
  expenses: StatementExpenses;
  summary: StatementSummary;
  lineItems: StatementLineItem[];
  previousBalance: number;
  currentBalance: number;
  generatedAt: Date;
  sentAt: Date | null;
  viewedAt: Date | null;
  documentUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StatementIncome {
  rent: number;
  lateFees: number;
  applicationFees: number;
  petFees: number;
  parkingFees: number;
  utilityReimbursements: number;
  otherIncome: number;
  totalIncome: number;
}

export interface StatementExpenses {
  managementFee: number;
  maintenance: number;
  utilities: number;
  insurance: number;
  propertyTax: number;
  hoa: number;
  mortgage: number;
  reserves: number;
  otherExpenses: number;
  totalExpenses: number;
}

export interface StatementSummary {
  grossIncome: number;
  totalExpenses: number;
  netOperatingIncome: number;
  ownershipPercentage: number;
  ownerShare: number;
  reserveContribution: number;
  distributionAmount: number;
}

export interface StatementLineItem {
  id: string;
  date: Date;
  category: string;
  description: string;
  unit: string | null;
  amount: number;
  type: 'income' | 'expense';
  referenceId: string | null;
  referenceType: string | null;
}

export interface Distribution {
  id: string;
  ownerId: string;
  statementId: string | null;
  propertyId: string;
  amount: number;
  method: DistributionMethod;
  status: DistributionStatus;
  scheduledDate: Date;
  processedDate: Date | null;
  bankAccountId: string | null;
  checkNumber: string | null;
  wireReference: string | null;
  achTransactionId: string | null;
  failureReason: string | null;
  notes: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OwnerDocument {
  id: string;
  ownerId: string;
  propertyId: string | null;
  documentType: 'statement' | 'tax_1099' | 'contract' | 'insurance' | 'report' | 'other';
  name: string;
  description: string | null;
  year: number | null;
  url: string;
  size: number;
  mimeType: string;
  uploadedById: string;
  uploadedAt: Date;
  expiresAt: Date | null;
}

export interface OwnerBankAccount {
  id: string;
  ownerId: string;
  accountName: string;
  bankName: string;
  accountType: 'checking' | 'savings';
  routingNumber: string; // last 4 only in real implementation
  accountNumber: string; // last 4 only in real implementation
  isDefault: boolean;
  isVerified: boolean;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaxDocument1099 {
  id: string;
  ownerId: string;
  taxYear: number;
  formType: '1099-MISC' | '1099-NEC';
  recipientTin: string; // masked
  payerTin: string; // masked
  totalRents: number;
  totalOtherIncome: number;
  grossProceeds: number;
  status: 'draft' | 'generated' | 'sent' | 'corrected';
  generatedAt: Date | null;
  sentAt: Date | null;
  documentUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Prisma Storage (replaced in-memory Maps)
// ============================================================================

// All data now uses Prisma models:
// - prisma.owner
// - prisma.propertyOwnershipRecord
// - prisma.ownerStatement
// - prisma.ownerDistribution
// - prisma.ownerDocument
// - prisma.ownerBankAccount
// - prisma.taxDocument1099

// ============================================================================
// Helper Functions
// ============================================================================

export function calculateIncome(lineItems: StatementLineItem[]): StatementIncome {
  const incomeItems = lineItems.filter((i) => i.type === 'income');

  const income: StatementIncome = {
    rent: 0,
    lateFees: 0,
    applicationFees: 0,
    petFees: 0,
    parkingFees: 0,
    utilityReimbursements: 0,
    otherIncome: 0,
    totalIncome: 0,
  };

  for (const item of incomeItems) {
    switch (item.category) {
      case 'rent':
        income.rent += item.amount;
        break;
      case 'late_fee':
        income.lateFees += item.amount;
        break;
      case 'application_fee':
        income.applicationFees += item.amount;
        break;
      case 'pet_fee':
        income.petFees += item.amount;
        break;
      case 'parking_fee':
        income.parkingFees += item.amount;
        break;
      case 'utility_reimbursement':
        income.utilityReimbursements += item.amount;
        break;
      default:
        income.otherIncome += item.amount;
    }
  }

  income.totalIncome =
    income.rent +
    income.lateFees +
    income.applicationFees +
    income.petFees +
    income.parkingFees +
    income.utilityReimbursements +
    income.otherIncome;

  return income;
}

export function calculateExpenses(lineItems: StatementLineItem[]): StatementExpenses {
  const expenseItems = lineItems.filter((i) => i.type === 'expense');

  const expenses: StatementExpenses = {
    managementFee: 0,
    maintenance: 0,
    utilities: 0,
    insurance: 0,
    propertyTax: 0,
    hoa: 0,
    mortgage: 0,
    reserves: 0,
    otherExpenses: 0,
    totalExpenses: 0,
  };

  for (const item of expenseItems) {
    switch (item.category) {
      case 'management_fee':
        expenses.managementFee += item.amount;
        break;
      case 'maintenance':
      case 'repair':
        expenses.maintenance += item.amount;
        break;
      case 'utilities':
        expenses.utilities += item.amount;
        break;
      case 'insurance':
        expenses.insurance += item.amount;
        break;
      case 'property_tax':
        expenses.propertyTax += item.amount;
        break;
      case 'hoa':
        expenses.hoa += item.amount;
        break;
      case 'mortgage':
        expenses.mortgage += item.amount;
        break;
      case 'reserves':
        expenses.reserves += item.amount;
        break;
      default:
        expenses.otherExpenses += item.amount;
    }
  }

  expenses.totalExpenses =
    expenses.managementFee +
    expenses.maintenance +
    expenses.utilities +
    expenses.insurance +
    expenses.propertyTax +
    expenses.hoa +
    expenses.mortgage +
    expenses.reserves +
    expenses.otherExpenses;

  return expenses;
}

export function calculateStatementSummary(
  income: StatementIncome,
  expenses: StatementExpenses,
  ownershipPercentage: number,
  reservePercentage: number
): StatementSummary {
  const netOperatingIncome = income.totalIncome - expenses.totalExpenses;
  const ownerShare = netOperatingIncome * (ownershipPercentage / 100);
  const reserveContribution = ownerShare * (reservePercentage / 100);
  const distributionAmount = Math.max(0, ownerShare - reserveContribution);

  return {
    grossIncome: income.totalIncome,
    totalExpenses: expenses.totalExpenses,
    netOperatingIncome,
    ownershipPercentage,
    ownerShare: Math.round(ownerShare * 100) / 100,
    reserveContribution: Math.round(reserveContribution * 100) / 100,
    distributionAmount: Math.round(distributionAmount * 100) / 100,
  };
}

export function calculateManagementFee(
  grossIncome: number,
  feeType: 'percentage' | 'flat',
  feeAmount: number
): number {
  if (feeType === 'flat') {
    return feeAmount;
  }
  return Math.round(grossIncome * (feeAmount / 100) * 100) / 100;
}

export function generate1099Data(
  ownerId: string,
  taxYear: number,
  propertyStatements: OwnerStatement[]
): { totalRents: number; totalOtherIncome: number; grossProceeds: number } {
  const yearStatements = propertyStatements.filter(
    (s) => s.ownerId === ownerId && s.periodEnd.getFullYear() === taxYear
  );

  let totalRents = 0;
  let totalOtherIncome = 0;

  for (const statement of yearStatements) {
    totalRents += statement.income.rent;
    totalOtherIncome +=
      statement.income.lateFees +
      statement.income.applicationFees +
      statement.income.petFees +
      statement.income.parkingFees +
      statement.income.utilityReimbursements +
      statement.income.otherIncome;
  }

  return {
    totalRents: Math.round(totalRents * 100) / 100,
    totalOtherIncome: Math.round(totalOtherIncome * 100) / 100,
    grossProceeds: Math.round((totalRents + totalOtherIncome) * 100) / 100,
  };
}

// ============================================================================
// Validation Schemas
// ============================================================================

const createOwnerSchema = z.object({
  userId: z.string().uuid().optional(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().optional(),
  taxId: z.string().optional(),
  taxIdType: z.enum(['ssn', 'ein']).optional(),
  ownershipType: z.enum(['individual', 'llc', 'corporation', 'partnership', 'trust']),
  distributionMethod: z.enum(['ach', 'check', 'wire', 'hold']).default('ach'),
  minimumDistributionAmount: z.number().min(0).default(100),
  statementDelivery: z.enum(['email', 'mail', 'both', 'portal_only']).default('email'),
  portalEnabled: z.boolean().default(true),
});

const createOwnershipSchema = z.object({
  ownerId: z.string().uuid(),
  propertyId: z.string().uuid(),
  ownershipPercentage: z.number().min(0).max(100),
  effectiveDate: z.string().datetime(),
  isPrimaryContact: z.boolean().default(false),
  managementFeeType: z.enum(['percentage', 'flat']),
  managementFeeAmount: z.number().min(0),
  reservePercentage: z.number().min(0).max(100).default(5),
});

const generateStatementSchema = z.object({
  ownerId: z.string().uuid(),
  propertyId: z.string().uuid(),
  period: z.enum(['monthly', 'quarterly', 'annual']),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  lineItems: z.array(z.object({
    date: z.string().datetime(),
    category: z.string(),
    description: z.string(),
    unit: z.string().optional(),
    amount: z.number(),
    type: z.enum(['income', 'expense']),
    referenceId: z.string().optional(),
    referenceType: z.string().optional(),
  })),
  previousBalance: z.number().default(0),
});

const createDistributionSchema = z.object({
  ownerId: z.string().uuid(),
  statementId: z.string().uuid().optional(),
  propertyId: z.string().uuid(),
  amount: z.number().min(0),
  method: z.enum(['ach', 'check', 'wire', 'hold']),
  scheduledDate: z.string().datetime(),
  notes: z.string().optional(),
});

const createBankAccountSchema = z.object({
  ownerId: z.string().uuid(),
  accountName: z.string().min(1),
  bankName: z.string().min(1),
  accountType: z.enum(['checking', 'savings']),
  routingNumber: z.string().length(9),
  accountNumber: z.string().min(4).max(17),
  isDefault: z.boolean().default(false),
});

// ============================================================================
// Routes
// ============================================================================

export async function ownerPortalRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // Owners
  // -------------------------------------------------------------------------

  // List owners
  app.get('/owners', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { propertyId?: string };

    let where: Prisma.OwnerWhereInput = {};

    if (query.propertyId) {
      where = {
        ownerships: {
          some: {
            propertyId: query.propertyId,
            endDate: null,
          },
        },
      };
    }

    const ownerList = await prisma.owner.findMany({ where });

    return reply.send({
      success: true,
      data: ownerList.map(o => ({
        ...o,
        minimumDistributionAmount: toNumber(o.minimumDistributionAmount),
      })),
      total: ownerList.length,
    });
  });

  // Get owner
  app.get('/owners/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const owner = await prisma.owner.findUnique({
      where: { id },
      include: {
        ownerships: {
          where: { endDate: null },
        },
      },
    });

    if (!owner) {
      return reply.status(404).send({ success: false, error: 'Owner not found' });
    }

    return reply.send({
      success: true,
      data: {
        ...owner,
        minimumDistributionAmount: toNumber(owner.minimumDistributionAmount),
        properties: owner.ownerships.map(o => ({
          ...o,
          ownershipPercentage: toNumber(o.ownershipPercentage),
          managementFeeAmount: toNumber(o.managementFeeAmount),
          reservePercentage: toNumber(o.reservePercentage),
        })),
      },
    });
  });

  // Create owner
  app.post('/owners', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createOwnerSchema.parse(request.body);

    const owner = await prisma.owner.create({
      data: {
        userId: body.userId ?? null,
        name: body.name,
        email: body.email,
        phone: body.phone ?? null,
        address: body.address ?? null,
        taxId: body.taxId ?? null,
        taxIdType: body.taxIdType ?? null,
        ownershipType: body.ownershipType as PrismaOwnershipType,
        distributionMethod: body.distributionMethod as PrismaDistributionMethod,
        minimumDistributionAmount: body.minimumDistributionAmount,
        statementDelivery: body.statementDelivery,
        portalEnabled: body.portalEnabled,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...owner,
        minimumDistributionAmount: toNumber(owner.minimumDistributionAmount),
      },
    });
  });

  // -------------------------------------------------------------------------
  // Property Ownership
  // -------------------------------------------------------------------------

  // Add ownership
  app.post('/ownerships', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createOwnershipSchema.parse(request.body);

    const ownership = await prisma.propertyOwnershipRecord.create({
      data: {
        ownerId: body.ownerId,
        propertyId: body.propertyId,
        ownershipPercentage: body.ownershipPercentage,
        effectiveDate: new Date(body.effectiveDate),
        isPrimaryContact: body.isPrimaryContact,
        managementFeeType: body.managementFeeType,
        managementFeeAmount: body.managementFeeAmount,
        reservePercentage: body.reservePercentage,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...ownership,
        ownershipPercentage: toNumber(ownership.ownershipPercentage),
        managementFeeAmount: toNumber(ownership.managementFeeAmount),
        reservePercentage: toNumber(ownership.reservePercentage),
      },
    });
  });

  // Get ownerships for property
  app.get('/properties/:propertyId/ownerships', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };

    const propertyOwnerships = await prisma.propertyOwnershipRecord.findMany({
      where: { propertyId, endDate: null },
      include: { owner: true },
    });

    return reply.send({
      success: true,
      data: propertyOwnerships.map(o => ({
        ...o,
        ownershipPercentage: toNumber(o.ownershipPercentage),
        managementFeeAmount: toNumber(o.managementFeeAmount),
        reservePercentage: toNumber(o.reservePercentage),
        owner: o.owner ? {
          ...o.owner,
          minimumDistributionAmount: toNumber(o.owner.minimumDistributionAmount),
        } : null,
      })),
      total: propertyOwnerships.length,
    });
  });

  // -------------------------------------------------------------------------
  // Statements
  // -------------------------------------------------------------------------

  // List statements
  app.get('/statements', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      ownerId?: string;
      propertyId?: string;
      year?: string;
      status?: string;
    };

    const where: Prisma.OwnerStatementWhereInput = {};
    if (query.ownerId) where.ownerId = query.ownerId;
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.year) {
      const year = parseInt(query.year, 10);
      where.periodEnd = {
        gte: new Date(year, 0, 1),
        lt: new Date(year + 1, 0, 1),
      };
    }
    if (query.status) where.status = query.status as PrismaStatementStatus;

    const statementList = await prisma.ownerStatement.findMany({
      where,
      orderBy: { periodEnd: 'desc' },
    });

    return reply.send({
      success: true,
      data: statementList.map(s => ({
        ...s,
        previousBalance: toNumber(s.previousBalance),
        currentBalance: toNumber(s.currentBalance),
      })),
      total: statementList.length,
    });
  });

  // Get statement
  app.get('/statements/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    let statement = await prisma.ownerStatement.findUnique({ where: { id } });

    if (!statement) {
      return reply.status(404).send({ success: false, error: 'Statement not found' });
    }

    // Mark as viewed
    if (statement.status === 'sent' && !statement.viewedAt) {
      statement = await prisma.ownerStatement.update({
        where: { id },
        data: { viewedAt: new Date(), status: 'viewed' },
      });
    }

    return reply.send({
      success: true,
      data: {
        ...statement,
        previousBalance: toNumber(statement.previousBalance),
        currentBalance: toNumber(statement.currentBalance),
      },
    });
  });

  // Generate statement
  app.post('/statements', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = generateStatementSchema.parse(request.body);

    const ownership = await prisma.propertyOwnershipRecord.findFirst({
      where: { ownerId: body.ownerId, propertyId: body.propertyId, endDate: null },
    });

    if (!ownership) {
      return reply.status(404).send({ success: false, error: 'Ownership not found' });
    }

    // Convert line items
    const lineItems: StatementLineItem[] = body.lineItems.map((item, index) => ({
      id: `li-${index}`,
      date: new Date(item.date),
      category: item.category,
      description: item.description,
      unit: item.unit ?? null,
      amount: item.amount,
      type: item.type,
      referenceId: item.referenceId ?? null,
      referenceType: item.referenceType ?? null,
    }));

    // Calculate income and expenses
    const income = calculateIncome(lineItems);
    const expenses = calculateExpenses(lineItems);

    // Add management fee as expense
    const managementFee = calculateManagementFee(
      income.totalIncome,
      ownership.managementFeeType as 'flat' | 'percentage',
      toNumber(ownership.managementFeeAmount)
    );
    expenses.managementFee = managementFee;
    expenses.totalExpenses += managementFee;

    // Calculate summary
    const summary = calculateStatementSummary(
      income,
      expenses,
      toNumber(ownership.ownershipPercentage),
      toNumber(ownership.reservePercentage)
    );

    const statement = await prisma.ownerStatement.create({
      data: {
        ownerId: body.ownerId,
        propertyId: body.propertyId,
        period: body.period as PrismaStatementPeriod,
        periodStart: new Date(body.periodStart),
        periodEnd: new Date(body.periodEnd),
        status: 'generated',
        income: income as unknown as Prisma.JsonValue,
        expenses: expenses as unknown as Prisma.JsonValue,
        summary: summary as unknown as Prisma.JsonValue,
        lineItems: lineItems as unknown as Prisma.JsonValue,
        previousBalance: body.previousBalance,
        currentBalance: body.previousBalance + summary.distributionAmount,
        generatedAt: new Date(),
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...statement,
        previousBalance: toNumber(statement.previousBalance),
        currentBalance: toNumber(statement.currentBalance),
      },
    });
  });

  // Send statement
  app.post('/statements/:id/send', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.ownerStatement.findUnique({ where: { id } });

    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Statement not found' });
    }

    const statement = await prisma.ownerStatement.update({
      where: { id },
      data: { status: 'sent', sentAt: new Date() },
    });

    return reply.send({
      success: true,
      data: {
        ...statement,
        previousBalance: toNumber(statement.previousBalance),
        currentBalance: toNumber(statement.currentBalance),
      },
    });
  });

  // -------------------------------------------------------------------------
  // Distributions
  // -------------------------------------------------------------------------

  // List distributions
  app.get('/distributions', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      ownerId?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    };

    const where: Prisma.OwnerDistributionWhereInput = {};
    if (query.ownerId) where.ownerId = query.ownerId;
    if (query.status) where.status = query.status as PrismaDistributionStatus;
    if (query.startDate || query.endDate) {
      where.scheduledDate = {};
      if (query.startDate) where.scheduledDate.gte = new Date(query.startDate);
      if (query.endDate) where.scheduledDate.lte = new Date(query.endDate);
    }

    const distributionList = await prisma.ownerDistribution.findMany({
      where,
      orderBy: { scheduledDate: 'desc' },
    });

    return reply.send({
      success: true,
      data: distributionList.map(d => ({
        ...d,
        amount: toNumber(d.amount),
      })),
      total: distributionList.length,
    });
  });

  // Create distribution
  app.post('/distributions', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createDistributionSchema.parse(request.body);

    const owner = await prisma.owner.findUnique({ where: { id: body.ownerId } });
    if (!owner) {
      return reply.status(404).send({ success: false, error: 'Owner not found' });
    }

    const distribution = await prisma.ownerDistribution.create({
      data: {
        ownerId: body.ownerId,
        statementId: body.statementId ?? null,
        propertyId: body.propertyId,
        amount: body.amount,
        method: body.method as PrismaDistributionMethod,
        status: 'pending',
        scheduledDate: new Date(body.scheduledDate),
        bankAccountId: owner.bankAccountId,
        notes: body.notes ?? null,
        createdById: 'system',
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...distribution,
        amount: toNumber(distribution.amount),
      },
    });
  });

  // Process distribution
  app.post('/distributions/:id/process', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    let distribution = await prisma.ownerDistribution.findUnique({ where: { id } });

    if (!distribution) {
      return reply.status(404).send({ success: false, error: 'Distribution not found' });
    }

    distribution = await prisma.ownerDistribution.update({
      where: { id },
      data: { status: 'processing' },
    });

    // Mock processing (would integrate with payment provider)
    setTimeout(async () => {
      const updateData: Prisma.OwnerDistributionUpdateInput = {
        status: 'completed',
        processedDate: new Date(),
      };
      if (distribution!.method === 'ach') {
        updateData.achTransactionId = `ach_${crypto.randomUUID().substring(0, 8)}`;
      } else if (distribution!.method === 'check') {
        updateData.checkNumber = String(Math.floor(Math.random() * 10000) + 1000);
      }
      await prisma.ownerDistribution.update({ where: { id }, data: updateData });
    }, 100);

    return reply.send({
      success: true,
      data: { ...distribution, amount: toNumber(distribution.amount) },
    });
  });

  // -------------------------------------------------------------------------
  // Bank Accounts
  // -------------------------------------------------------------------------

  // List bank accounts for owner
  app.get('/owners/:ownerId/bank-accounts', async (request: FastifyRequest, reply: FastifyReply) => {
    const { ownerId } = request.params as { ownerId: string };

    const accountList = await prisma.ownerBankAccount.findMany({
      where: { ownerId },
    });

    // Mask account numbers
    const masked = accountList.map((a) => ({
      ...a,
      routingNumber: `****${a.routingNumber.slice(-4)}`,
      accountNumber: `****${a.accountNumber.slice(-4)}`,
    }));

    return reply.send({
      success: true,
      data: masked,
      total: masked.length,
    });
  });

  // Add bank account
  app.post('/bank-accounts', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createBankAccountSchema.parse(request.body);

    // If setting as default, unset others
    if (body.isDefault) {
      await prisma.ownerBankAccount.updateMany({
        where: { ownerId: body.ownerId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const account = await prisma.ownerBankAccount.create({
      data: {
        ownerId: body.ownerId,
        accountName: body.accountName,
        bankName: body.bankName,
        accountType: body.accountType,
        routingNumber: body.routingNumber,
        accountNumber: body.accountNumber,
        isDefault: body.isDefault,
        isVerified: false,
      },
    });

    // Update owner if this is default
    if (body.isDefault) {
      await prisma.owner.update({
        where: { id: body.ownerId },
        data: { bankAccountId: account.id },
      });
    }

    return reply.status(201).send({
      success: true,
      data: {
        ...account,
        routingNumber: `****${account.routingNumber.slice(-4)}`,
        accountNumber: `****${account.accountNumber.slice(-4)}`,
      },
    });
  });

  // -------------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------------

  // List documents for owner
  app.get('/owners/:ownerId/documents', async (request: FastifyRequest, reply: FastifyReply) => {
    const { ownerId } = request.params as { ownerId: string };
    const query = request.query as { type?: string; year?: string };

    const where: Prisma.OwnerDocumentWhereInput = { ownerId };
    if (query.type) where.documentType = query.type;
    if (query.year) where.year = parseInt(query.year, 10);

    const documentList = await prisma.ownerDocument.findMany({
      where,
      orderBy: { uploadedAt: 'desc' },
    });

    return reply.send({
      success: true,
      data: documentList,
      total: documentList.length,
    });
  });

  // -------------------------------------------------------------------------
  // Tax Documents (1099)
  // -------------------------------------------------------------------------

  // List 1099s for owner
  app.get('/owners/:ownerId/tax-documents', async (request: FastifyRequest, reply: FastifyReply) => {
    const { ownerId } = request.params as { ownerId: string };
    const query = request.query as { year?: string };

    const where: Prisma.TaxDocument1099WhereInput = { ownerId };
    if (query.year) where.taxYear = parseInt(query.year, 10);

    const taxDocList = await prisma.taxDocument1099.findMany({
      where,
      orderBy: { taxYear: 'desc' },
    });

    return reply.send({
      success: true,
      data: taxDocList.map(d => ({
        ...d,
        totalRents: toNumber(d.totalRents),
        totalOtherIncome: toNumber(d.totalOtherIncome),
        grossProceeds: toNumber(d.grossProceeds),
      })),
      total: taxDocList.length,
    });
  });

  // Generate 1099
  app.post('/tax-documents/1099', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { ownerId: string; taxYear: number };

    const owner = await prisma.owner.findUnique({ where: { id: body.ownerId } });
    if (!owner) {
      return reply.status(404).send({ success: false, error: 'Owner not found' });
    }

    // Get all statements for this owner in the tax year
    const ownerStatements = await prisma.ownerStatement.findMany({
      where: { ownerId: body.ownerId },
    });

    const taxData = generate1099Data(body.ownerId, body.taxYear, ownerStatements as unknown as OwnerStatement[]);

    const taxDoc = await prisma.taxDocument1099.create({
      data: {
        ownerId: body.ownerId,
        taxYear: body.taxYear,
        formType: 'form_1099_misc',
        recipientTin: owner.taxId ? `***-**-${owner.taxId.slice(-4)}` : 'N/A',
        payerTin: '**-***1234',
        totalRents: taxData.totalRents,
        totalOtherIncome: taxData.totalOtherIncome,
        grossProceeds: taxData.grossProceeds,
        status: 'draft',
        generatedAt: new Date(),
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...taxDoc,
        totalRents: toNumber(taxDoc.totalRents),
        totalOtherIncome: toNumber(taxDoc.totalOtherIncome),
        grossProceeds: toNumber(taxDoc.grossProceeds),
      },
    });
  });

  // -------------------------------------------------------------------------
  // Owner Portal Dashboard
  // -------------------------------------------------------------------------

  // Get owner dashboard
  app.get('/portal/dashboard/:ownerId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { ownerId } = request.params as { ownerId: string };

    const owner = await prisma.owner.findUnique({ where: { id: ownerId } });
    if (!owner) {
      return reply.status(404).send({ success: false, error: 'Owner not found' });
    }

    // Get properties
    const ownerProperties = await prisma.propertyOwnershipRecord.findMany({
      where: { ownerId, endDate: null },
    });

    // Get recent statements
    const recentStatements = await prisma.ownerStatement.findMany({
      where: { ownerId },
      orderBy: { periodEnd: 'desc' },
      take: 6,
    });

    // Get pending/recent distributions
    const ownerDistributions = await prisma.ownerDistribution.findMany({
      where: { ownerId },
      orderBy: { scheduledDate: 'desc' },
      take: 5,
    });

    // Calculate YTD
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const ytdStatements = recentStatements.filter((s) => s.periodEnd >= yearStart);
    const ytdIncome = ytdStatements.reduce((sum, s) => {
      const summary = s.summary as { ownerShare?: number } | null;
      return sum + (summary?.ownerShare || 0);
    }, 0);
    const ytdDistributed = ownerDistributions
      .filter((d) => d.status === 'completed' && d.processedDate && d.processedDate >= yearStart)
      .reduce((sum, d) => sum + toNumber(d.amount), 0);

    return reply.send({
      success: true,
      data: {
        owner: {
          id: owner.id,
          name: owner.name,
          email: owner.email,
        },
        summary: {
          propertyCount: ownerProperties.length,
          ytdIncome: Math.round(ytdIncome * 100) / 100,
          ytdDistributed: Math.round(ytdDistributed * 100) / 100,
          pendingDistributions: ownerDistributions.filter((d) => d.status === 'pending').length,
          unreadStatements: recentStatements.filter((s) => s.status === 'sent').length,
        },
        properties: ownerProperties.map(p => ({
          ...p,
          ownershipPercentage: toNumber(p.ownershipPercentage),
          managementFeeAmount: toNumber(p.managementFeeAmount),
          reservePercentage: toNumber(p.reservePercentage),
        })),
        recentStatements: recentStatements.map((s) => {
          const summary = s.summary as { netOperatingIncome?: number; ownerShare?: number } | null;
          return {
            id: s.id,
            propertyId: s.propertyId,
            period: s.period,
            periodEnd: s.periodEnd,
            netOperatingIncome: summary?.netOperatingIncome || 0,
            ownerShare: summary?.ownerShare || 0,
            status: s.status,
          };
        }),
        recentDistributions: ownerDistributions.map((d) => ({
          id: d.id,
          amount: toNumber(d.amount),
          method: d.method,
          status: d.status,
          scheduledDate: d.scheduledDate,
          processedDate: d.processedDate,
        })),
      },
    });
  });
}
