import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

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
// In-memory stores (placeholder for Prisma)
// ============================================================================

export const owners = new Map<string, Owner>();
export const ownerships = new Map<string, PropertyOwnership>();
export const statements = new Map<string, OwnerStatement>();
export const distributions = new Map<string, Distribution>();
export const documents = new Map<string, OwnerDocument>();
export const bankAccounts = new Map<string, OwnerBankAccount>();
export const taxDocuments = new Map<string, TaxDocument1099>();

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

    let ownerList = Array.from(owners.values());

    if (query.propertyId) {
      const propertyOwnerIds = Array.from(ownerships.values())
        .filter((o) => o.propertyId === query.propertyId && !o.endDate)
        .map((o) => o.ownerId);
      ownerList = ownerList.filter((o) => propertyOwnerIds.includes(o.id));
    }

    return reply.send({
      success: true,
      data: ownerList,
      total: ownerList.length,
    });
  });

  // Get owner
  app.get('/owners/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const owner = owners.get(id);

    if (!owner) {
      return reply.status(404).send({ success: false, error: 'Owner not found' });
    }

    // Get their properties
    const ownerProperties = Array.from(ownerships.values())
      .filter((o) => o.ownerId === id && !o.endDate);

    return reply.send({
      success: true,
      data: {
        ...owner,
        properties: ownerProperties,
      },
    });
  });

  // Create owner
  app.post('/owners', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createOwnerSchema.parse(request.body);
    const now = new Date();

    const owner: Owner = {
      id: crypto.randomUUID(),
      userId: body.userId ?? null,
      name: body.name,
      email: body.email,
      phone: body.phone ?? null,
      address: body.address ?? null,
      taxId: body.taxId ?? null,
      taxIdType: body.taxIdType ?? null,
      ownershipType: body.ownershipType,
      distributionMethod: body.distributionMethod,
      bankAccountId: null,
      holdDistributions: false,
      minimumDistributionAmount: body.minimumDistributionAmount,
      statementDelivery: body.statementDelivery,
      portalEnabled: body.portalEnabled,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };

    owners.set(owner.id, owner);

    return reply.status(201).send({
      success: true,
      data: owner,
    });
  });

  // -------------------------------------------------------------------------
  // Property Ownership
  // -------------------------------------------------------------------------

  // Add ownership
  app.post('/ownerships', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createOwnershipSchema.parse(request.body);
    const now = new Date();

    const ownership: PropertyOwnership = {
      id: crypto.randomUUID(),
      ownerId: body.ownerId,
      propertyId: body.propertyId,
      ownershipPercentage: body.ownershipPercentage,
      effectiveDate: new Date(body.effectiveDate),
      endDate: null,
      isPrimaryContact: body.isPrimaryContact,
      managementFeeType: body.managementFeeType,
      managementFeeAmount: body.managementFeeAmount,
      reservePercentage: body.reservePercentage,
      createdAt: now,
    };

    ownerships.set(ownership.id, ownership);

    return reply.status(201).send({
      success: true,
      data: ownership,
    });
  });

  // Get ownerships for property
  app.get('/properties/:propertyId/ownerships', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };

    const propertyOwnerships = Array.from(ownerships.values())
      .filter((o) => o.propertyId === propertyId && !o.endDate);

    // Enrich with owner data
    const enriched = propertyOwnerships.map((o) => ({
      ...o,
      owner: owners.get(o.ownerId),
    }));

    return reply.send({
      success: true,
      data: enriched,
      total: enriched.length,
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

    let statementList = Array.from(statements.values());

    if (query.ownerId) {
      statementList = statementList.filter((s) => s.ownerId === query.ownerId);
    }
    if (query.propertyId) {
      statementList = statementList.filter((s) => s.propertyId === query.propertyId);
    }
    if (query.year) {
      const year = parseInt(query.year, 10);
      statementList = statementList.filter((s) => s.periodEnd.getFullYear() === year);
    }
    if (query.status) {
      statementList = statementList.filter((s) => s.status === query.status);
    }

    // Sort by period end descending
    statementList.sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime());

    return reply.send({
      success: true,
      data: statementList,
      total: statementList.length,
    });
  });

  // Get statement
  app.get('/statements/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const statement = statements.get(id);

    if (!statement) {
      return reply.status(404).send({ success: false, error: 'Statement not found' });
    }

    // Mark as viewed
    if (statement.status === 'sent' && !statement.viewedAt) {
      statement.viewedAt = new Date();
      statement.status = 'viewed';
      statements.set(id, statement);
    }

    return reply.send({ success: true, data: statement });
  });

  // Generate statement
  app.post('/statements', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = generateStatementSchema.parse(request.body);

    const ownership = Array.from(ownerships.values()).find(
      (o) => o.ownerId === body.ownerId && o.propertyId === body.propertyId && !o.endDate
    );

    if (!ownership) {
      return reply.status(404).send({ success: false, error: 'Ownership not found' });
    }

    const now = new Date();

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
      ownership.managementFeeType,
      ownership.managementFeeAmount
    );
    expenses.managementFee = managementFee;
    expenses.totalExpenses += managementFee;

    // Calculate summary
    const summary = calculateStatementSummary(
      income,
      expenses,
      ownership.ownershipPercentage,
      ownership.reservePercentage
    );

    const statement: OwnerStatement = {
      id: crypto.randomUUID(),
      ownerId: body.ownerId,
      propertyId: body.propertyId,
      period: body.period,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      status: 'generated',
      income,
      expenses,
      summary,
      lineItems,
      previousBalance: body.previousBalance,
      currentBalance: body.previousBalance + summary.distributionAmount,
      generatedAt: now,
      sentAt: null,
      viewedAt: null,
      documentUrl: null,
      createdAt: now,
      updatedAt: now,
    };

    statements.set(statement.id, statement);

    return reply.status(201).send({
      success: true,
      data: statement,
    });
  });

  // Send statement
  app.post('/statements/:id/send', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const statement = statements.get(id);

    if (!statement) {
      return reply.status(404).send({ success: false, error: 'Statement not found' });
    }

    statement.status = 'sent';
    statement.sentAt = new Date();
    statement.updatedAt = new Date();
    statements.set(id, statement);

    return reply.send({ success: true, data: statement });
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

    let distributionList = Array.from(distributions.values());

    if (query.ownerId) {
      distributionList = distributionList.filter((d) => d.ownerId === query.ownerId);
    }
    if (query.status) {
      distributionList = distributionList.filter((d) => d.status === query.status);
    }
    if (query.startDate) {
      const start = new Date(query.startDate);
      distributionList = distributionList.filter((d) => d.scheduledDate >= start);
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      distributionList = distributionList.filter((d) => d.scheduledDate <= end);
    }

    // Sort by scheduled date descending
    distributionList.sort((a, b) => b.scheduledDate.getTime() - a.scheduledDate.getTime());

    return reply.send({
      success: true,
      data: distributionList,
      total: distributionList.length,
    });
  });

  // Create distribution
  app.post('/distributions', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createDistributionSchema.parse(request.body);
    const now = new Date();

    const owner = owners.get(body.ownerId);
    if (!owner) {
      return reply.status(404).send({ success: false, error: 'Owner not found' });
    }

    const distribution: Distribution = {
      id: crypto.randomUUID(),
      ownerId: body.ownerId,
      statementId: body.statementId ?? null,
      propertyId: body.propertyId,
      amount: body.amount,
      method: body.method,
      status: 'pending',
      scheduledDate: new Date(body.scheduledDate),
      processedDate: null,
      bankAccountId: owner.bankAccountId,
      checkNumber: null,
      wireReference: null,
      achTransactionId: null,
      failureReason: null,
      notes: body.notes ?? null,
      createdById: 'system',
      createdAt: now,
      updatedAt: now,
    };

    distributions.set(distribution.id, distribution);

    return reply.status(201).send({
      success: true,
      data: distribution,
    });
  });

  // Process distribution
  app.post('/distributions/:id/process', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const distribution = distributions.get(id);

    if (!distribution) {
      return reply.status(404).send({ success: false, error: 'Distribution not found' });
    }

    distribution.status = 'processing';
    distribution.updatedAt = new Date();
    distributions.set(id, distribution);

    // Mock processing (would integrate with payment provider)
    setTimeout(() => {
      distribution.status = 'completed';
      distribution.processedDate = new Date();
      if (distribution.method === 'ach') {
        distribution.achTransactionId = `ach_${crypto.randomUUID().substring(0, 8)}`;
      } else if (distribution.method === 'check') {
        distribution.checkNumber = String(Math.floor(Math.random() * 10000) + 1000);
      }
      distribution.updatedAt = new Date();
      distributions.set(id, distribution);
    }, 100);

    return reply.send({ success: true, data: distribution });
  });

  // -------------------------------------------------------------------------
  // Bank Accounts
  // -------------------------------------------------------------------------

  // List bank accounts for owner
  app.get('/owners/:ownerId/bank-accounts', async (request: FastifyRequest, reply: FastifyReply) => {
    const { ownerId } = request.params as { ownerId: string };

    const accountList = Array.from(bankAccounts.values())
      .filter((a) => a.ownerId === ownerId);

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
    const now = new Date();

    // If setting as default, unset others
    if (body.isDefault) {
      for (const [id, account] of bankAccounts) {
        if (account.ownerId === body.ownerId && account.isDefault) {
          account.isDefault = false;
          bankAccounts.set(id, account);
        }
      }
    }

    const account: OwnerBankAccount = {
      id: crypto.randomUUID(),
      ownerId: body.ownerId,
      accountName: body.accountName,
      bankName: body.bankName,
      accountType: body.accountType,
      routingNumber: body.routingNumber,
      accountNumber: body.accountNumber,
      isDefault: body.isDefault,
      isVerified: false,
      verifiedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    bankAccounts.set(account.id, account);

    // Update owner if this is default
    if (body.isDefault) {
      const owner = owners.get(body.ownerId);
      if (owner) {
        owner.bankAccountId = account.id;
        owner.updatedAt = now;
        owners.set(owner.id, owner);
      }
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

    let documentList = Array.from(documents.values())
      .filter((d) => d.ownerId === ownerId);

    if (query.type) {
      documentList = documentList.filter((d) => d.documentType === query.type);
    }
    if (query.year) {
      const year = parseInt(query.year, 10);
      documentList = documentList.filter((d) => d.year === year);
    }

    // Sort by upload date descending
    documentList.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

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

    let taxDocList = Array.from(taxDocuments.values())
      .filter((d) => d.ownerId === ownerId);

    if (query.year) {
      const year = parseInt(query.year, 10);
      taxDocList = taxDocList.filter((d) => d.taxYear === year);
    }

    // Sort by year descending
    taxDocList.sort((a, b) => b.taxYear - a.taxYear);

    return reply.send({
      success: true,
      data: taxDocList,
      total: taxDocList.length,
    });
  });

  // Generate 1099
  app.post('/tax-documents/1099', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as { ownerId: string; taxYear: number };
    const now = new Date();

    const owner = owners.get(body.ownerId);
    if (!owner) {
      return reply.status(404).send({ success: false, error: 'Owner not found' });
    }

    // Get all statements for this owner in the tax year
    const ownerStatements = Array.from(statements.values())
      .filter((s) => s.ownerId === body.ownerId);

    const taxData = generate1099Data(body.ownerId, body.taxYear, ownerStatements);

    const taxDoc: TaxDocument1099 = {
      id: crypto.randomUUID(),
      ownerId: body.ownerId,
      taxYear: body.taxYear,
      formType: '1099-MISC',
      recipientTin: owner.taxId ? `***-**-${owner.taxId.slice(-4)}` : 'N/A',
      payerTin: '**-***1234',
      totalRents: taxData.totalRents,
      totalOtherIncome: taxData.totalOtherIncome,
      grossProceeds: taxData.grossProceeds,
      status: 'generated',
      generatedAt: now,
      sentAt: null,
      documentUrl: null,
      createdAt: now,
      updatedAt: now,
    };

    taxDocuments.set(taxDoc.id, taxDoc);

    return reply.status(201).send({
      success: true,
      data: taxDoc,
    });
  });

  // -------------------------------------------------------------------------
  // Owner Portal Dashboard
  // -------------------------------------------------------------------------

  // Get owner dashboard
  app.get('/portal/dashboard/:ownerId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { ownerId } = request.params as { ownerId: string };

    const owner = owners.get(ownerId);
    if (!owner) {
      return reply.status(404).send({ success: false, error: 'Owner not found' });
    }

    // Get properties
    const ownerProperties = Array.from(ownerships.values())
      .filter((o) => o.ownerId === ownerId && !o.endDate);

    // Get recent statements
    const recentStatements = Array.from(statements.values())
      .filter((s) => s.ownerId === ownerId)
      .sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime())
      .slice(0, 6);

    // Get pending/recent distributions
    const ownerDistributions = Array.from(distributions.values())
      .filter((d) => d.ownerId === ownerId)
      .sort((a, b) => b.scheduledDate.getTime() - a.scheduledDate.getTime())
      .slice(0, 5);

    // Calculate YTD
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const ytdStatements = recentStatements.filter((s) => s.periodEnd >= yearStart);
    const ytdIncome = ytdStatements.reduce((sum, s) => sum + s.summary.ownerShare, 0);
    const ytdDistributed = ownerDistributions
      .filter((d) => d.status === 'completed' && d.processedDate && d.processedDate >= yearStart)
      .reduce((sum, d) => sum + d.amount, 0);

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
        properties: ownerProperties,
        recentStatements: recentStatements.map((s) => ({
          id: s.id,
          propertyId: s.propertyId,
          period: s.period,
          periodEnd: s.periodEnd,
          netOperatingIncome: s.summary.netOperatingIncome,
          ownerShare: s.summary.ownerShare,
          status: s.status,
        })),
        recentDistributions: ownerDistributions.map((d) => ({
          id: d.id,
          amount: d.amount,
          method: d.method,
          status: d.status,
          scheduledDate: d.scheduledDate,
          processedDate: d.processedDate,
        })),
      },
    });
  });
}
