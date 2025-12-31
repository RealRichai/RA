import {
  prisma,
  Prisma,
  type UtilityAccountType as PrismaUtilityAccountType,
  type UtilityAccountStatus as PrismaUtilityAccountStatus,
  type UtilityBillStatus as PrismaUtilityBillStatus,
  type ResponsibleParty as PrismaResponsibleParty,
  type AllocationMethod as PrismaAllocationMethod,
  type AdminFeeType as PrismaAdminFeeType,
  type RUBSAllocationStatus as PrismaRUBSAllocationStatus,
  type ReadingType as PrismaReadingType,
} from '@realriches/database';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Types
export type UtilityType = 'electric' | 'gas' | 'water' | 'sewer' | 'trash' | 'internet' | 'cable' | 'other';
export type AccountStatus = 'active' | 'inactive' | 'pending_setup' | 'pending_transfer' | 'closed';
export type BillStatus = 'pending' | 'paid' | 'overdue' | 'disputed' | 'credited';
export type AllocationMethod = 'equal' | 'square_footage' | 'occupancy' | 'bedroom_count' | 'submeter' | 'custom';

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

// Helper: convert Decimal to number
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

// Helper functions
export function calculateRUBSAllocation(
  config: {
    allocationMethod: AllocationMethod;
    adminFeeType: 'flat' | 'percentage' | 'none';
    adminFeeAmount: number;
    includeVacantUnits: boolean;
    minimumCharge: number | null;
    maximumCharge: number | null;
    customWeights: Record<string, number> | null;
  },
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
  const eligibleUnits = config.includeVacantUnits
    ? units
    : units.filter((u) => !u.isVacant);

  if (eligibleUnits.length === 0) {
    return [];
  }

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
        factor = Math.max(unit.bedrooms, 1);
        break;
      case 'occupancy':
        factor = Math.max(unit.occupants, 1);
        break;
      case 'custom':
        factor = config.customWeights?.[unit.id] ?? unit.customWeight ?? 1;
        break;
      case 'submeter':
        factor = unit.customWeight ?? 1;
        break;
    }

    totalFactor += factor;
    unitFactors.push({ unit, factor });
  }

  let adminFee = 0;
  if (config.adminFeeType === 'flat') {
    adminFee = config.adminFeeAmount;
  } else if (config.adminFeeType === 'percentage') {
    adminFee = billAmount * (config.adminFeeAmount / 100);
  }

  const allocations: UnitAllocation[] = unitFactors.map(({ unit, factor }) => {
    const percentage = (factor / totalFactor) * 100;
    let baseAmount = (factor / totalFactor) * billAmount;
    const unitAdminFee = (factor / totalFactor) * adminFee;
    let totalAmount = baseAmount + unitAdminFee;

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

export interface UtilityBill {
  id: string;
  amount: number;
  usage?: number;
  statementDate: Date;
}

export function estimateMonthlyAverage(bills: UtilityBill[]): number {
  if (bills.length === 0) return 0;
  // Support both amount and totalAmount fields
  const total = bills.reduce((sum, b) => sum + (b.amount || (b as unknown as { totalAmount?: number }).totalAmount || 0), 0);
  return total / bills.length;
}

// Schemas
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

// Routes
export async function utilityRoutes(app: FastifyInstance): Promise<void> {
  // Providers
  app.get('/providers', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { type?: UtilityType };

    const where: Record<string, unknown> = {};
    if (query.type) where.type = query.type;

    const results = await prisma.utilityProvider.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return reply.send({
      success: true,
      data: results,
      total: results.length,
    });
  });

  app.post('/providers', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createProviderSchema.parse(request.body);

    const provider = await prisma.utilityProvider.create({
      data: {
        name: body.name,
        type: body.type as PrismaUtilityAccountType,
        accountNumber: body.accountNumber || null,
        phone: body.phone || null,
        email: body.email || null,
        website: body.website || null,
        billingAddress: body.billingAddress || null,
        notes: body.notes || null,
      },
    });

    return reply.status(201).send({
      success: true,
      data: provider,
    });
  });

  // Accounts
  app.get('/accounts', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { propertyId?: string; unitId?: string; status?: AccountStatus };

    const where: Record<string, unknown> = {};
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.unitId) where.unitId = query.unitId;
    if (query.status) where.status = query.status;

    const results = await prisma.utilityAccount.findMany({
      where,
      include: { provider: true },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      success: true,
      data: results.map((a) => ({
        ...a,
        averageMonthlyBill: a.averageMonthlyBill ? toNumber(a.averageMonthlyBill) : null,
        lastReadingValue: a.lastReadingValue ? toNumber(a.lastReadingValue) : null,
      })),
      total: results.length,
    });
  });

  app.get('/accounts/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const account = await prisma.utilityAccount.findUnique({
      where: { id },
      include: { provider: true, bills: true, readings: true },
    });

    if (!account) {
      return reply.status(404).send({ success: false, error: 'Account not found' });
    }

    return reply.send({
      success: true,
      data: {
        ...account,
        averageMonthlyBill: account.averageMonthlyBill ? toNumber(account.averageMonthlyBill) : null,
        lastReadingValue: account.lastReadingValue ? toNumber(account.lastReadingValue) : null,
        bills: account.bills.map((b) => ({
          ...b,
          previousReading: b.previousReading ? toNumber(b.previousReading) : null,
          currentReading: b.currentReading ? toNumber(b.currentReading) : null,
          usage: b.usage ? toNumber(b.usage) : null,
          amount: toNumber(b.amount),
          taxes: toNumber(b.taxes),
          fees: toNumber(b.fees),
          totalAmount: toNumber(b.totalAmount),
          paidAmount: b.paidAmount ? toNumber(b.paidAmount) : null,
        })),
        readings: account.readings.map((r) => ({
          ...r,
          readingValue: toNumber(r.readingValue),
          previousValue: r.previousValue ? toNumber(r.previousValue) : null,
          usage: r.usage ? toNumber(r.usage) : null,
        })),
      },
    });
  });

  app.post('/accounts', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createAccountSchema.parse(request.body);

    const account = await prisma.utilityAccount.create({
      data: {
        propertyId: body.propertyId,
        unitId: body.unitId || null,
        providerId: body.providerId,
        accountNumber: body.accountNumber,
        meterNumber: body.meterNumber || null,
        utilityType: body.utilityType as PrismaUtilityAccountType,
        status: 'pending_setup' as PrismaUtilityAccountStatus,
        responsibleParty: body.responsibleParty as PrismaResponsibleParty,
        tenantId: body.tenantId || null,
        serviceAddress: body.serviceAddress,
        billingAddress: body.billingAddress || null,
        autoPayEnabled: body.autoPayEnabled,
        notes: body.notes || null,
      },
    });

    return reply.status(201).send({
      success: true,
      data: account,
    });
  });

  app.patch('/accounts/:id/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: AccountStatus };

    const account = await prisma.utilityAccount.findUnique({ where: { id } });

    if (!account) {
      return reply.status(404).send({ success: false, error: 'Account not found' });
    }

    const updated = await prisma.utilityAccount.update({
      where: { id },
      data: { status: status as PrismaUtilityAccountStatus },
    });

    return reply.send({ success: true, data: updated });
  });

  // Bills
  app.get('/bills', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      propertyId?: string;
      accountId?: string;
      status?: BillStatus;
      dueSoon?: string;
      overdue?: string;
    };

    const where: Record<string, unknown> = {};
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.accountId) where.accountId = query.accountId;
    if (query.status) where.status = query.status;

    if (query.dueSoon === 'true') {
      const now = new Date();
      const cutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      where.status = 'pending';
      where.dueDate = { lte: cutoff, gte: now };
    }

    if (query.overdue === 'true') {
      where.status = 'pending';
      where.dueDate = { lt: new Date() };
    }

    const results = await prisma.utilityBill.findMany({
      where,
      orderBy: { dueDate: 'asc' },
    });

    return reply.send({
      success: true,
      data: results.map((b) => ({
        ...b,
        previousReading: b.previousReading ? toNumber(b.previousReading) : null,
        currentReading: b.currentReading ? toNumber(b.currentReading) : null,
        usage: b.usage ? toNumber(b.usage) : null,
        amount: toNumber(b.amount),
        taxes: toNumber(b.taxes),
        fees: toNumber(b.fees),
        totalAmount: toNumber(b.totalAmount),
        paidAmount: b.paidAmount ? toNumber(b.paidAmount) : null,
      })),
      total: results.length,
    });
  });

  app.post('/bills', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createBillSchema.parse(request.body);

    const account = await prisma.utilityAccount.findUnique({
      where: { id: body.accountId },
    });

    if (!account) {
      return reply.status(404).send({ success: false, error: 'Account not found' });
    }

    const totalAmount = body.amount + body.taxes + body.fees;

    const bill = await prisma.utilityBill.create({
      data: {
        accountId: body.accountId,
        propertyId: account.propertyId,
        unitId: account.unitId,
        providerId: account.providerId,
        utilityType: account.utilityType,
        billNumber: body.billNumber || null,
        statementDate: new Date(body.statementDate),
        dueDate: new Date(body.dueDate),
        periodStart: new Date(body.periodStart),
        periodEnd: new Date(body.periodEnd),
        previousReading: body.previousReading || null,
        currentReading: body.currentReading || null,
        usage: body.usage || null,
        usageUnit: body.usageUnit || null,
        amount: body.amount,
        taxes: body.taxes,
        fees: body.fees,
        totalAmount,
        status: 'pending' as PrismaUtilityBillStatus,
        documentUrl: body.documentUrl || null,
        notes: body.notes || null,
      },
    });

    // Update account average
    const accountBills = await prisma.utilityBill.findMany({
      where: { accountId: body.accountId },
    });

    const avgTotal = accountBills.length > 0
      ? accountBills.reduce((sum, b) => sum + toNumber(b.totalAmount), 0) / accountBills.length
      : 0;

    await prisma.utilityAccount.update({
      where: { id: body.accountId },
      data: { averageMonthlyBill: avgTotal },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...bill,
        amount: toNumber(bill.amount),
        taxes: toNumber(bill.taxes),
        fees: toNumber(bill.fees),
        totalAmount: toNumber(bill.totalAmount),
      },
    });
  });

  app.post('/bills/:id/pay', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      paidAmount: number;
      paymentMethod: string;
      paymentReference?: string;
    };

    const bill = await prisma.utilityBill.findUnique({ where: { id } });
    if (!bill) {
      return reply.status(404).send({ success: false, error: 'Bill not found' });
    }

    const updated = await prisma.utilityBill.update({
      where: { id },
      data: {
        status: 'paid',
        paidDate: new Date(),
        paidAmount: body.paidAmount,
        paymentMethod: body.paymentMethod,
        paymentReference: body.paymentReference || null,
      },
    });

    return reply.send({
      success: true,
      data: {
        ...updated,
        amount: toNumber(updated.amount),
        taxes: toNumber(updated.taxes),
        fees: toNumber(updated.fees),
        totalAmount: toNumber(updated.totalAmount),
        paidAmount: updated.paidAmount ? toNumber(updated.paidAmount) : null,
      },
    });
  });

  // RUBS Configuration
  app.get('/rubs/configs', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { propertyId?: string; utilityType?: UtilityType };

    const where: Record<string, unknown> = { isActive: true };
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.utilityType) where.utilityType = query.utilityType;

    const results = await prisma.rUBSConfig.findMany({
      where,
      orderBy: { effectiveDate: 'desc' },
    });

    return reply.send({
      success: true,
      data: results.map((c) => ({
        ...c,
        adminFeeAmount: toNumber(c.adminFeeAmount),
        minimumCharge: c.minimumCharge ? toNumber(c.minimumCharge) : null,
        maximumCharge: c.maximumCharge ? toNumber(c.maximumCharge) : null,
      })),
      total: results.length,
    });
  });

  app.post('/rubs/configs', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createRUBSConfigSchema.parse(request.body);

    // Deactivate existing config for same property/utility
    await prisma.rUBSConfig.updateMany({
      where: {
        propertyId: body.propertyId,
        utilityType: body.utilityType as PrismaUtilityAccountType,
        isActive: true,
      },
      data: {
        isActive: false,
        endDate: new Date(),
      },
    });

    const config = await prisma.rUBSConfig.create({
      data: {
        propertyId: body.propertyId,
        utilityType: body.utilityType as PrismaUtilityAccountType,
        allocationMethod: body.allocationMethod as PrismaAllocationMethod,
        adminFeeType: body.adminFeeType as PrismaAdminFeeType,
        adminFeeAmount: body.adminFeeAmount,
        includeVacantUnits: body.includeVacantUnits,
        minimumCharge: body.minimumCharge || null,
        maximumCharge: body.maximumCharge || null,
        customWeights: body.customWeights || null,
        effectiveDate: new Date(body.effectiveDate),
        isActive: true,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...config,
        adminFeeAmount: toNumber(config.adminFeeAmount),
        minimumCharge: config.minimumCharge ? toNumber(config.minimumCharge) : null,
        maximumCharge: config.maximumCharge ? toNumber(config.maximumCharge) : null,
      },
    });
  });

  app.post('/rubs/calculate', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = calculateAllocationSchema.parse(request.body);

    const config = await prisma.rUBSConfig.findUnique({ where: { id: body.configId } });
    if (!config) {
      return reply.status(404).send({ success: false, error: 'RUBS config not found' });
    }

    const bill = await prisma.utilityBill.findUnique({ where: { id: body.billId } });
    if (!bill) {
      return reply.status(404).send({ success: false, error: 'Bill not found' });
    }

    const unitsForCalc = body.units.map(u => ({
      id: u.id,
      name: u.name,
      squareFootage: u.squareFootage,
      bedrooms: u.bedrooms,
      occupants: u.occupants,
      tenantId: u.tenantId,
      tenantName: u.tenantName,
      isVacant: u.isVacant,
      customWeight: u.customWeight,
    }));

    const allocations = calculateRUBSAllocation(
      {
        allocationMethod: config.allocationMethod as AllocationMethod,
        adminFeeType: config.adminFeeType as 'flat' | 'percentage' | 'none',
        adminFeeAmount: toNumber(config.adminFeeAmount),
        includeVacantUnits: config.includeVacantUnits,
        minimumCharge: config.minimumCharge ? toNumber(config.minimumCharge) : null,
        maximumCharge: config.maximumCharge ? toNumber(config.maximumCharge) : null,
        customWeights: config.customWeights as Record<string, number> | null,
      },
      toNumber(bill.totalAmount),
      unitsForCalc
    );

    let adminFee = 0;
    if (config.adminFeeType === 'flat') {
      adminFee = toNumber(config.adminFeeAmount);
    } else if (config.adminFeeType === 'percentage') {
      adminFee = toNumber(bill.totalAmount) * (toNumber(config.adminFeeAmount) / 100);
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
        totalBillAmount: toNumber(bill.totalAmount),
        adminFee: Math.round(adminFee * 100) / 100,
        totalAllocated: Math.round(totalAllocated * 100) / 100,
        unitCount: allocations.length,
        allocations,
      },
    });
  });

  app.post('/rubs/allocations', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = calculateAllocationSchema.parse(request.body);

    const config = await prisma.rUBSConfig.findUnique({ where: { id: body.configId } });
    if (!config) {
      return reply.status(404).send({ success: false, error: 'RUBS config not found' });
    }

    const bill = await prisma.utilityBill.findUnique({ where: { id: body.billId } });
    if (!bill) {
      return reply.status(404).send({ success: false, error: 'Bill not found' });
    }

    const unitsForAlloc = body.units.map(u => ({
      id: u.id,
      name: u.name,
      squareFootage: u.squareFootage,
      bedrooms: u.bedrooms,
      occupants: u.occupants,
      tenantId: u.tenantId,
      tenantName: u.tenantName,
      isVacant: u.isVacant,
      customWeight: u.customWeight,
    }));

    const allocations = calculateRUBSAllocation(
      {
        allocationMethod: config.allocationMethod as AllocationMethod,
        adminFeeType: config.adminFeeType as 'flat' | 'percentage' | 'none',
        adminFeeAmount: toNumber(config.adminFeeAmount),
        includeVacantUnits: config.includeVacantUnits,
        minimumCharge: config.minimumCharge ? toNumber(config.minimumCharge) : null,
        maximumCharge: config.maximumCharge ? toNumber(config.maximumCharge) : null,
        customWeights: config.customWeights as Record<string, number> | null,
      },
      toNumber(bill.totalAmount),
      unitsForAlloc
    );

    let adminFee = 0;
    if (config.adminFeeType === 'flat') {
      adminFee = toNumber(config.adminFeeAmount);
    } else if (config.adminFeeType === 'percentage') {
      adminFee = toNumber(bill.totalAmount) * (toNumber(config.adminFeeAmount) / 100);
    }

    const totalAllocated = allocations.reduce((sum, a) => sum + a.totalAmount, 0);

    const allocation = await prisma.rUBSAllocation.create({
      data: {
        configId: config.id,
        billId: bill.id,
        propertyId: config.propertyId,
        periodStart: bill.periodStart,
        periodEnd: bill.periodEnd,
        totalBillAmount: toNumber(bill.totalAmount),
        adminFee: Math.round(adminFee * 100) / 100,
        totalAllocated: Math.round(totalAllocated * 100) / 100,
        allocations: allocations as unknown as Prisma.JsonValue,
        status: 'draft' as PrismaRUBSAllocationStatus,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...allocation,
        totalBillAmount: toNumber(allocation.totalBillAmount),
        adminFee: toNumber(allocation.adminFee),
        totalAllocated: toNumber(allocation.totalAllocated),
      },
    });
  });

  app.post('/rubs/allocations/:id/approve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { userId } = request.body as { userId: string };

    const allocation = await prisma.rUBSAllocation.findUnique({ where: { id } });
    if (!allocation) {
      return reply.status(404).send({ success: false, error: 'Allocation not found' });
    }

    const updated = await prisma.rUBSAllocation.update({
      where: { id },
      data: {
        status: 'approved',
        approvedById: userId,
        approvedAt: new Date(),
      },
    });

    return reply.send({
      success: true,
      data: {
        ...updated,
        totalBillAmount: toNumber(updated.totalBillAmount),
        adminFee: toNumber(updated.adminFee),
        totalAllocated: toNumber(updated.totalAllocated),
      },
    });
  });

  // Usage Readings
  app.get('/readings', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { accountId?: string; propertyId?: string };

    const where: Record<string, unknown> = {};
    if (query.accountId) where.accountId = query.accountId;
    if (query.propertyId) where.propertyId = query.propertyId;

    const results = await prisma.usageReading.findMany({
      where,
      orderBy: { readingDate: 'desc' },
    });

    return reply.send({
      success: true,
      data: results.map((r) => ({
        ...r,
        readingValue: toNumber(r.readingValue),
        previousValue: r.previousValue ? toNumber(r.previousValue) : null,
        usage: r.usage ? toNumber(r.usage) : null,
      })),
      total: results.length,
    });
  });

  app.post('/readings', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createReadingSchema.parse(request.body);

    const account = await prisma.utilityAccount.findUnique({ where: { id: body.accountId } });
    if (!account) {
      return reply.status(404).send({ success: false, error: 'Account not found' });
    }

    const previousValue = account.lastReadingValue ? toNumber(account.lastReadingValue) : null;
    const usage = previousValue !== null ? calculateUsage(body.readingValue, previousValue) : null;

    const reading = await prisma.usageReading.create({
      data: {
        accountId: body.accountId,
        propertyId: account.propertyId,
        unitId: account.unitId,
        readingDate: new Date(body.readingDate),
        readingValue: body.readingValue,
        previousValue,
        usage,
        usageUnit: body.usageUnit,
        readingType: body.readingType as PrismaReadingType,
        readBy: body.readBy || null,
        photoUrl: body.photoUrl || null,
        notes: body.notes || null,
      },
    });

    // Update account
    await prisma.utilityAccount.update({
      where: { id: body.accountId },
      data: {
        lastReadingDate: reading.readingDate,
        lastReadingValue: body.readingValue,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...reading,
        readingValue: toNumber(reading.readingValue),
        previousValue: reading.previousValue ? toNumber(reading.previousValue) : null,
        usage: reading.usage ? toNumber(reading.usage) : null,
      },
    });
  });

  // Summary
  app.get('/summary/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };

    const propertyAccounts = await prisma.utilityAccount.findMany({
      where: { propertyId },
    });

    const propertyBills = await prisma.utilityBill.findMany({
      where: { propertyId },
    });

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
    const overdueBills = pendingBills.filter((b) => b.dueDate < now);
    const dueSoonBills = pendingBills.filter((b) => {
      const cutoff = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return b.dueDate >= now && b.dueDate <= cutoff;
    });

    // Group by utility type
    const byType: Record<string, { count: number; total: number; avgMonthly: number }> = {};
    for (const bill of propertyBills) {
      if (!byType[bill.utilityType]) {
        byType[bill.utilityType] = { count: 0, total: 0, avgMonthly: 0 };
      }
      byType[bill.utilityType].count++;
      byType[bill.utilityType].total += toNumber(bill.totalAmount);
    }

    for (const type of Object.keys(byType)) {
      const typeBills = propertyBills.filter((b) => b.utilityType === type);
      byType[type].avgMonthly = typeBills.length > 0
        ? Math.round((byType[type].total / typeBills.length) * 100) / 100
        : 0;
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
          pendingAmount: pendingBills.reduce((sum, b) => sum + toNumber(b.totalAmount), 0),
          overdue: overdueBills.length,
          overdueAmount: overdueBills.reduce((sum, b) => sum + toNumber(b.totalAmount), 0),
          dueSoon: dueSoonBills.length,
          dueSoonAmount: dueSoonBills.reduce((sum, b) => sum + toNumber(b.totalAmount), 0),
        },
        spending: {
          thisMonth: thisMonthBills.reduce((sum, b) => sum + toNumber(b.totalAmount), 0),
          lastMonth: lastMonthBills.reduce((sum, b) => sum + toNumber(b.totalAmount), 0),
          yearToDate: propertyBills
            .filter((b) => b.statementDate.getFullYear() === now.getFullYear())
            .reduce((sum, b) => sum + toNumber(b.totalAmount), 0),
        },
        byUtilityType: byType,
      },
    });
  });
}
