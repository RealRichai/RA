import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export type UtilityType = 'electric' | 'gas' | 'water' | 'sewer' | 'trash' | 'internet' | 'cable' | 'other';
export type AccountStatus = 'active' | 'inactive' | 'pending_setup' | 'pending_transfer' | 'closed';
export type BillStatus = 'pending' | 'paid' | 'overdue' | 'disputed' | 'credited';
export type AllocationMethod = 'equal' | 'square_footage' | 'occupancy' | 'bedroom_count' | 'submeter' | 'custom';

export interface UtilityProvider {
  id: string;
  name: string;
  type: UtilityType;
  accountNumber: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  billingAddress: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UtilityAccount {
  id: string;
  propertyId: string;
  unitId: string | null; // null = property-level account
  providerId: string;
  accountNumber: string;
  meterNumber: string | null;
  utilityType: UtilityType;
  status: AccountStatus;
  responsibleParty: 'landlord' | 'tenant';
  tenantId: string | null;
  serviceAddress: string;
  billingAddress: string | null;
  averageMonthlyBill: number | null;
  lastReadingDate: Date | null;
  lastReadingValue: number | null;
  nextReadingDate: Date | null;
  autoPayEnabled: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UtilityBill {
  id: string;
  accountId: string;
  propertyId: string;
  unitId: string | null;
  providerId: string;
  utilityType: UtilityType;
  billNumber: string | null;
  statementDate: Date;
  dueDate: Date;
  periodStart: Date;
  periodEnd: Date;
  previousReading: number | null;
  currentReading: number | null;
  usage: number | null;
  usageUnit: string | null;
  amount: number;
  taxes: number;
  fees: number;
  totalAmount: number;
  status: BillStatus;
  paidDate: Date | null;
  paidAmount: number | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  documentUrl: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RUBSConfig {
  id: string;
  propertyId: string;
  utilityType: UtilityType;
  allocationMethod: AllocationMethod;
  adminFeeType: 'flat' | 'percentage' | 'none';
  adminFeeAmount: number;
  includeVacantUnits: boolean;
  minimumCharge: number | null;
  maximumCharge: number | null;
  customWeights: Record<string, number> | null; // unitId -> weight
  effectiveDate: Date;
  endDate: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RUBSAllocation {
  id: string;
  configId: string;
  billId: string;
  propertyId: string;
  periodStart: Date;
  periodEnd: Date;
  totalBillAmount: number;
  adminFee: number;
  totalAllocated: number;
  allocations: UnitAllocation[];
  status: 'draft' | 'approved' | 'billed' | 'voided';
  approvedById: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UnitAllocation {
  unitId: string;
  unitName: string;
  tenantId: string | null;
  tenantName: string | null;
  allocationFactor: number;
  allocationPercentage: number;
  baseAmount: number;
  adminFee: number;
  totalAmount: number;
  isVacant: boolean;
  notes: string | null;
}

export interface UsageReading {
  id: string;
  accountId: string;
  propertyId: string;
  unitId: string | null;
  readingDate: Date;
  readingValue: number;
  previousValue: number | null;
  usage: number | null;
  usageUnit: string;
  readingType: 'actual' | 'estimated' | 'submeter';
  readBy: string | null;
  photoUrl: string | null;
  notes: string | null;
  createdAt: Date;
}

// ============================================================================
// In-memory stores (placeholder for Prisma)
// ============================================================================

export const providers = new Map<string, UtilityProvider>();
export const accounts = new Map<string, UtilityAccount>();
export const bills = new Map<string, UtilityBill>();
export const rubsConfigs = new Map<string, RUBSConfig>();
export const rubsAllocations = new Map<string, RUBSAllocation>();
export const usageReadings = new Map<string, UsageReading>();

// ============================================================================
// Helper Functions
// ============================================================================

export function calculateRUBSAllocation(
  config: RUBSConfig,
  billAmount: number,
  units: Array<{
    id: string;
    name: string;
    squareFootage: number;
    bedrooms: number;
    occupants: number;
    tenantId: string | null;
    tenantName: string | null;
    isVacant: boolean;
    customWeight?: number;
  }>
): UnitAllocation[] {
  // Filter out vacant units if not included
  const eligibleUnits = config.includeVacantUnits
    ? units
    : units.filter((u) => !u.isVacant);

  if (eligibleUnits.length === 0) {
    return [];
  }

  // Calculate allocation factors based on method
  let totalFactor = 0;
  const unitFactors: Array<{ unit: typeof units[0]; factor: number }> = [];

  for (const unit of eligibleUnits) {
    let factor = 1;

    switch (config.allocationMethod) {
      case 'equal':
        factor = 1;
        break;
      case 'square_footage':
        factor = unit.squareFootage;
        break;
      case 'bedroom_count':
        factor = Math.max(unit.bedrooms, 1); // Minimum 1 for studios
        break;
      case 'occupancy':
        factor = Math.max(unit.occupants, 1); // Minimum 1
        break;
      case 'custom':
        factor = config.customWeights?.[unit.id] ?? unit.customWeight ?? 1;
        break;
      case 'submeter':
        // Submeter uses actual readings, factor = 1 as placeholder
        factor = unit.customWeight ?? 1;
        break;
    }

    totalFactor += factor;
    unitFactors.push({ unit, factor });
  }

  // Calculate admin fee
  let adminFee = 0;
  if (config.adminFeeType === 'flat') {
    adminFee = config.adminFeeAmount;
  } else if (config.adminFeeType === 'percentage') {
    adminFee = billAmount * (config.adminFeeAmount / 100);
  }

  const totalToAllocate = billAmount + adminFee;

  // Allocate to each unit
  const allocations: UnitAllocation[] = unitFactors.map(({ unit, factor }) => {
    const percentage = (factor / totalFactor) * 100;
    let baseAmount = (factor / totalFactor) * billAmount;
    const unitAdminFee = (factor / totalFactor) * adminFee;
    let totalAmount = baseAmount + unitAdminFee;

    // Apply min/max constraints
    if (config.minimumCharge !== null && totalAmount < config.minimumCharge) {
      totalAmount = config.minimumCharge;
      baseAmount = totalAmount - unitAdminFee;
    }
    if (config.maximumCharge !== null && totalAmount > config.maximumCharge) {
      totalAmount = config.maximumCharge;
      baseAmount = totalAmount - unitAdminFee;
    }

    return {
      unitId: unit.id,
      unitName: unit.name,
      tenantId: unit.tenantId,
      tenantName: unit.tenantName,
      allocationFactor: factor,
      allocationPercentage: Math.round(percentage * 100) / 100,
      baseAmount: Math.round(baseAmount * 100) / 100,
      adminFee: Math.round(unitAdminFee * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
      isVacant: unit.isVacant,
      notes: null,
    };
  });

  return allocations;
}

export function calculateUsage(current: number, previous: number): number {
  return Math.max(0, current - previous);
}

export function estimateMonthlyAverage(bills: UtilityBill[]): number {
  if (bills.length === 0) return 0;
  const total = bills.reduce((sum, b) => sum + b.totalAmount, 0);
  return Math.round((total / bills.length) * 100) / 100;
}

export function getBillsDueSoon(bills: UtilityBill[], daysAhead: number = 7): UtilityBill[] {
  const now = new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  return bills.filter(
    (b) => b.status === 'pending' && b.dueDate <= cutoff && b.dueDate >= now
  );
}

export function getOverdueBills(bills: UtilityBill[]): UtilityBill[] {
  const now = new Date();
  return bills.filter((b) => b.status === 'pending' && b.dueDate < now);
}

// ============================================================================
// Validation Schemas
// ============================================================================

const createProviderSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['electric', 'gas', 'water', 'sewer', 'trash', 'internet', 'cable', 'other']),
  accountNumber: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  website: z.string().url().optional(),
  billingAddress: z.string().optional(),
  notes: z.string().optional(),
});

const createAccountSchema = z.object({
  propertyId: z.string().uuid(),
  unitId: z.string().uuid().optional(),
  providerId: z.string().uuid(),
  accountNumber: z.string().min(1),
  meterNumber: z.string().optional(),
  utilityType: z.enum(['electric', 'gas', 'water', 'sewer', 'trash', 'internet', 'cable', 'other']),
  responsibleParty: z.enum(['landlord', 'tenant']),
  tenantId: z.string().uuid().optional(),
  serviceAddress: z.string().min(1),
  billingAddress: z.string().optional(),
  autoPayEnabled: z.boolean().default(false),
  notes: z.string().optional(),
});

const createBillSchema = z.object({
  accountId: z.string().uuid(),
  billNumber: z.string().optional(),
  statementDate: z.string().datetime(),
  dueDate: z.string().datetime(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  previousReading: z.number().optional(),
  currentReading: z.number().optional(),
  usage: z.number().optional(),
  usageUnit: z.string().optional(),
  amount: z.number().min(0),
  taxes: z.number().min(0).default(0),
  fees: z.number().min(0).default(0),
  documentUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

const createRUBSConfigSchema = z.object({
  propertyId: z.string().uuid(),
  utilityType: z.enum(['electric', 'gas', 'water', 'sewer', 'trash', 'internet', 'cable', 'other']),
  allocationMethod: z.enum(['equal', 'square_footage', 'occupancy', 'bedroom_count', 'submeter', 'custom']),
  adminFeeType: z.enum(['flat', 'percentage', 'none']),
  adminFeeAmount: z.number().min(0).default(0),
  includeVacantUnits: z.boolean().default(false),
  minimumCharge: z.number().min(0).optional(),
  maximumCharge: z.number().min(0).optional(),
  customWeights: z.record(z.number()).optional(),
  effectiveDate: z.string().datetime(),
});

const calculateAllocationSchema = z.object({
  configId: z.string().uuid(),
  billId: z.string().uuid(),
  units: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    squareFootage: z.number().min(0),
    bedrooms: z.number().min(0),
    occupants: z.number().min(0),
    tenantId: z.string().uuid().nullable(),
    tenantName: z.string().nullable(),
    isVacant: z.boolean(),
    customWeight: z.number().optional(),
  })),
});

const createReadingSchema = z.object({
  accountId: z.string().uuid(),
  readingDate: z.string().datetime(),
  readingValue: z.number().min(0),
  usageUnit: z.string(),
  readingType: z.enum(['actual', 'estimated', 'submeter']),
  readBy: z.string().optional(),
  photoUrl: z.string().url().optional(),
  notes: z.string().optional(),
});

// ============================================================================
// Routes
// ============================================================================

export async function utilityRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // Providers
  // -------------------------------------------------------------------------

  // List providers
  app.get('/providers', async (_request: FastifyRequest, reply: FastifyReply) => {
    const providerList = Array.from(providers.values());
    return reply.send({
      success: true,
      data: providerList,
      total: providerList.length,
    });
  });

  // Create provider
  app.post('/providers', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createProviderSchema.parse(request.body);
    const now = new Date();

    const provider: UtilityProvider = {
      id: crypto.randomUUID(),
      name: body.name,
      type: body.type,
      accountNumber: body.accountNumber ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      website: body.website ?? null,
      billingAddress: body.billingAddress ?? null,
      notes: body.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };

    providers.set(provider.id, provider);

    return reply.status(201).send({
      success: true,
      data: provider,
    });
  });

  // -------------------------------------------------------------------------
  // Accounts
  // -------------------------------------------------------------------------

  // List accounts
  app.get('/accounts', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { propertyId?: string; unitId?: string; status?: string };

    let accountList = Array.from(accounts.values());

    if (query.propertyId) {
      accountList = accountList.filter((a) => a.propertyId === query.propertyId);
    }
    if (query.unitId) {
      accountList = accountList.filter((a) => a.unitId === query.unitId);
    }
    if (query.status) {
      accountList = accountList.filter((a) => a.status === query.status);
    }

    return reply.send({
      success: true,
      data: accountList,
      total: accountList.length,
    });
  });

  // Get account
  app.get('/accounts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const account = accounts.get(id);

    if (!account) {
      return reply.status(404).send({ success: false, error: 'Account not found' });
    }

    return reply.send({ success: true, data: account });
  });

  // Create account
  app.post('/accounts', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createAccountSchema.parse(request.body);
    const now = new Date();

    const account: UtilityAccount = {
      id: crypto.randomUUID(),
      propertyId: body.propertyId,
      unitId: body.unitId ?? null,
      providerId: body.providerId,
      accountNumber: body.accountNumber,
      meterNumber: body.meterNumber ?? null,
      utilityType: body.utilityType,
      status: 'pending_setup',
      responsibleParty: body.responsibleParty,
      tenantId: body.tenantId ?? null,
      serviceAddress: body.serviceAddress,
      billingAddress: body.billingAddress ?? null,
      averageMonthlyBill: null,
      lastReadingDate: null,
      lastReadingValue: null,
      nextReadingDate: null,
      autoPayEnabled: body.autoPayEnabled,
      notes: body.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };

    accounts.set(account.id, account);

    return reply.status(201).send({
      success: true,
      data: account,
    });
  });

  // Update account status
  app.patch('/accounts/:id/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: AccountStatus };
    const account = accounts.get(id);

    if (!account) {
      return reply.status(404).send({ success: false, error: 'Account not found' });
    }

    account.status = status;
    account.updatedAt = new Date();
    accounts.set(id, account);

    return reply.send({ success: true, data: account });
  });

  // -------------------------------------------------------------------------
  // Bills
  // -------------------------------------------------------------------------

  // List bills
  app.get('/bills', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      propertyId?: string;
      accountId?: string;
      status?: string;
      dueSoon?: string;
      overdue?: string;
    };

    let billList = Array.from(bills.values());

    if (query.propertyId) {
      billList = billList.filter((b) => b.propertyId === query.propertyId);
    }
    if (query.accountId) {
      billList = billList.filter((b) => b.accountId === query.accountId);
    }
    if (query.status) {
      billList = billList.filter((b) => b.status === query.status);
    }
    if (query.dueSoon === 'true') {
      billList = getBillsDueSoon(billList);
    }
    if (query.overdue === 'true') {
      billList = getOverdueBills(billList);
    }

    // Sort by due date
    billList.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    return reply.send({
      success: true,
      data: billList,
      total: billList.length,
    });
  });

  // Create bill
  app.post('/bills', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createBillSchema.parse(request.body);
    const account = accounts.get(body.accountId);

    if (!account) {
      return reply.status(404).send({ success: false, error: 'Account not found' });
    }

    const now = new Date();
    const totalAmount = body.amount + body.taxes + body.fees;

    const bill: UtilityBill = {
      id: crypto.randomUUID(),
      accountId: body.accountId,
      propertyId: account.propertyId,
      unitId: account.unitId,
      providerId: account.providerId,
      utilityType: account.utilityType,
      billNumber: body.billNumber ?? null,
      statementDate: new Date(body.statementDate),
      dueDate: new Date(body.dueDate),
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      previousReading: body.previousReading ?? null,
      currentReading: body.currentReading ?? null,
      usage: body.usage ?? null,
      usageUnit: body.usageUnit ?? null,
      amount: body.amount,
      taxes: body.taxes,
      fees: body.fees,
      totalAmount,
      status: 'pending',
      paidDate: null,
      paidAmount: null,
      paymentMethod: null,
      paymentReference: null,
      documentUrl: body.documentUrl ?? null,
      notes: body.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };

    bills.set(bill.id, bill);

    // Update account average
    const accountBills = Array.from(bills.values()).filter((b) => b.accountId === body.accountId);
    account.averageMonthlyBill = estimateMonthlyAverage(accountBills);
    account.updatedAt = now;
    accounts.set(account.id, account);

    return reply.status(201).send({
      success: true,
      data: bill,
    });
  });

  // Mark bill as paid
  app.post('/bills/:id/pay', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      paidAmount: number;
      paymentMethod: string;
      paymentReference?: string;
    };

    const bill = bills.get(id);
    if (!bill) {
      return reply.status(404).send({ success: false, error: 'Bill not found' });
    }

    bill.status = 'paid';
    bill.paidDate = new Date();
    bill.paidAmount = body.paidAmount;
    bill.paymentMethod = body.paymentMethod;
    bill.paymentReference = body.paymentReference ?? null;
    bill.updatedAt = new Date();
    bills.set(id, bill);

    return reply.send({ success: true, data: bill });
  });

  // -------------------------------------------------------------------------
  // RUBS Configuration
  // -------------------------------------------------------------------------

  // List RUBS configs
  app.get('/rubs/configs', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { propertyId?: string; utilityType?: string };

    let configList = Array.from(rubsConfigs.values()).filter((c) => c.isActive);

    if (query.propertyId) {
      configList = configList.filter((c) => c.propertyId === query.propertyId);
    }
    if (query.utilityType) {
      configList = configList.filter((c) => c.utilityType === query.utilityType);
    }

    return reply.send({
      success: true,
      data: configList,
      total: configList.length,
    });
  });

  // Create RUBS config
  app.post('/rubs/configs', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createRUBSConfigSchema.parse(request.body);
    const now = new Date();

    // Deactivate existing config for same property/utility
    for (const [id, config] of rubsConfigs) {
      if (config.propertyId === body.propertyId && config.utilityType === body.utilityType && config.isActive) {
        config.isActive = false;
        config.endDate = now;
        rubsConfigs.set(id, config);
      }
    }

    const config: RUBSConfig = {
      id: crypto.randomUUID(),
      propertyId: body.propertyId,
      utilityType: body.utilityType,
      allocationMethod: body.allocationMethod,
      adminFeeType: body.adminFeeType,
      adminFeeAmount: body.adminFeeAmount,
      includeVacantUnits: body.includeVacantUnits,
      minimumCharge: body.minimumCharge ?? null,
      maximumCharge: body.maximumCharge ?? null,
      customWeights: body.customWeights ?? null,
      effectiveDate: new Date(body.effectiveDate),
      endDate: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    rubsConfigs.set(config.id, config);

    return reply.status(201).send({
      success: true,
      data: config,
    });
  });

  // Calculate RUBS allocation (preview)
  app.post('/rubs/calculate', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = calculateAllocationSchema.parse(request.body);

    const config = rubsConfigs.get(body.configId);
    if (!config) {
      return reply.status(404).send({ success: false, error: 'RUBS config not found' });
    }

    const bill = bills.get(body.billId);
    if (!bill) {
      return reply.status(404).send({ success: false, error: 'Bill not found' });
    }

    const allocations = calculateRUBSAllocation(config, bill.totalAmount, body.units);

    // Calculate admin fee
    let adminFee = 0;
    if (config.adminFeeType === 'flat') {
      adminFee = config.adminFeeAmount;
    } else if (config.adminFeeType === 'percentage') {
      adminFee = bill.totalAmount * (config.adminFeeAmount / 100);
    }

    const totalAllocated = allocations.reduce((sum, a) => sum + a.totalAmount, 0);

    return reply.send({
      success: true,
      data: {
        configId: config.id,
        billId: bill.id,
        propertyId: config.propertyId,
        utilityType: config.utilityType,
        allocationMethod: config.allocationMethod,
        periodStart: bill.periodStart,
        periodEnd: bill.periodEnd,
        totalBillAmount: bill.totalAmount,
        adminFee: Math.round(adminFee * 100) / 100,
        totalAllocated: Math.round(totalAllocated * 100) / 100,
        unitCount: allocations.length,
        allocations,
      },
    });
  });

  // Create RUBS allocation
  app.post('/rubs/allocations', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = calculateAllocationSchema.parse(request.body);

    const config = rubsConfigs.get(body.configId);
    if (!config) {
      return reply.status(404).send({ success: false, error: 'RUBS config not found' });
    }

    const bill = bills.get(body.billId);
    if (!bill) {
      return reply.status(404).send({ success: false, error: 'Bill not found' });
    }

    const allocations = calculateRUBSAllocation(config, bill.totalAmount, body.units);

    let adminFee = 0;
    if (config.adminFeeType === 'flat') {
      adminFee = config.adminFeeAmount;
    } else if (config.adminFeeType === 'percentage') {
      adminFee = bill.totalAmount * (config.adminFeeAmount / 100);
    }

    const totalAllocated = allocations.reduce((sum, a) => sum + a.totalAmount, 0);
    const now = new Date();

    const allocation: RUBSAllocation = {
      id: crypto.randomUUID(),
      configId: config.id,
      billId: bill.id,
      propertyId: config.propertyId,
      periodStart: bill.periodStart,
      periodEnd: bill.periodEnd,
      totalBillAmount: bill.totalAmount,
      adminFee: Math.round(adminFee * 100) / 100,
      totalAllocated: Math.round(totalAllocated * 100) / 100,
      allocations,
      status: 'draft',
      approvedById: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    rubsAllocations.set(allocation.id, allocation);

    return reply.status(201).send({
      success: true,
      data: allocation,
    });
  });

  // Approve RUBS allocation
  app.post('/rubs/allocations/:id/approve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.body as { userId: string };

    const allocation = rubsAllocations.get(id);
    if (!allocation) {
      return reply.status(404).send({ success: false, error: 'Allocation not found' });
    }

    allocation.status = 'approved';
    allocation.approvedById = userId;
    allocation.approvedAt = new Date();
    allocation.updatedAt = new Date();
    rubsAllocations.set(id, allocation);

    return reply.send({ success: true, data: allocation });
  });

  // -------------------------------------------------------------------------
  // Usage Readings
  // -------------------------------------------------------------------------

  // List readings
  app.get('/readings', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { accountId?: string; propertyId?: string };

    let readingList = Array.from(usageReadings.values());

    if (query.accountId) {
      readingList = readingList.filter((r) => r.accountId === query.accountId);
    }
    if (query.propertyId) {
      readingList = readingList.filter((r) => r.propertyId === query.propertyId);
    }

    // Sort by date descending
    readingList.sort((a, b) => b.readingDate.getTime() - a.readingDate.getTime());

    return reply.send({
      success: true,
      data: readingList,
      total: readingList.length,
    });
  });

  // Create reading
  app.post('/readings', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createReadingSchema.parse(request.body);
    const account = accounts.get(body.accountId);

    if (!account) {
      return reply.status(404).send({ success: false, error: 'Account not found' });
    }

    const previousValue = account.lastReadingValue;
    const usage = previousValue !== null ? calculateUsage(body.readingValue, previousValue) : null;
    const now = new Date();

    const reading: UsageReading = {
      id: crypto.randomUUID(),
      accountId: body.accountId,
      propertyId: account.propertyId,
      unitId: account.unitId,
      readingDate: new Date(body.readingDate),
      readingValue: body.readingValue,
      previousValue,
      usage,
      usageUnit: body.usageUnit,
      readingType: body.readingType,
      readBy: body.readBy ?? null,
      photoUrl: body.photoUrl ?? null,
      notes: body.notes ?? null,
      createdAt: now,
    };

    usageReadings.set(reading.id, reading);

    // Update account
    account.lastReadingDate = reading.readingDate;
    account.lastReadingValue = body.readingValue;
    account.updatedAt = now;
    accounts.set(account.id, account);

    return reply.status(201).send({
      success: true,
      data: reading,
    });
  });

  // -------------------------------------------------------------------------
  // Dashboard / Summary
  // -------------------------------------------------------------------------

  // Get utility summary for property
  app.get('/summary/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };

    const propertyAccounts = Array.from(accounts.values()).filter(
      (a) => a.propertyId === propertyId
    );
    const propertyBills = Array.from(bills.values()).filter(
      (b) => b.propertyId === propertyId
    );

    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const thisMonthBills = propertyBills.filter(
      (b) => b.statementDate >= thisMonth
    );
    const lastMonthBills = propertyBills.filter(
      (b) => b.statementDate >= lastMonth && b.statementDate < thisMonth
    );

    const pendingBills = propertyBills.filter((b) => b.status === 'pending');
    const overdueBills = getOverdueBills(propertyBills);
    const dueSoonBills = getBillsDueSoon(propertyBills);

    // Group by utility type
    const byType: Record<string, { count: number; total: number; avgMonthly: number }> = {};
    for (const bill of propertyBills) {
      if (!byType[bill.utilityType]) {
        byType[bill.utilityType] = { count: 0, total: 0, avgMonthly: 0 };
      }
      byType[bill.utilityType].count++;
      byType[bill.utilityType].total += bill.totalAmount;
    }

    for (const type of Object.keys(byType)) {
      const typeBills = propertyBills.filter((b) => b.utilityType === type);
      byType[type].avgMonthly = estimateMonthlyAverage(typeBills);
    }

    return reply.send({
      success: true,
      data: {
        propertyId,
        accounts: {
          total: propertyAccounts.length,
          active: propertyAccounts.filter((a) => a.status === 'active').length,
          landlordResponsible: propertyAccounts.filter((a) => a.responsibleParty === 'landlord').length,
          tenantResponsible: propertyAccounts.filter((a) => a.responsibleParty === 'tenant').length,
        },
        bills: {
          pending: pendingBills.length,
          pendingAmount: pendingBills.reduce((sum, b) => sum + b.totalAmount, 0),
          overdue: overdueBills.length,
          overdueAmount: overdueBills.reduce((sum, b) => sum + b.totalAmount, 0),
          dueSoon: dueSoonBills.length,
          dueSoonAmount: dueSoonBills.reduce((sum, b) => sum + b.totalAmount, 0),
        },
        spending: {
          thisMonth: thisMonthBills.reduce((sum, b) => sum + b.totalAmount, 0),
          lastMonth: lastMonthBills.reduce((sum, b) => sum + b.totalAmount, 0),
          yearToDate: propertyBills
            .filter((b) => b.statementDate.getFullYear() === now.getFullYear())
            .reduce((sum, b) => sum + b.totalAmount, 0),
        },
        byUtilityType: byType,
      },
    });
  });
}
