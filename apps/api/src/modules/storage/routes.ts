import {
  prisma,
  type StorageUnitStatus,
  type StorageRentalStatus,
  type StoragePaymentType,
  type StoragePaymentStatus,
  type LienAuctionStatus,
} from '@realriches/database';
import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function generateAccessCode(length: number = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

export function calculateSquareFeet(width: number, depth: number): number {
  return width * depth;
}

export function calculateCubicFeet(width: number, depth: number, height: number): number {
  return width * depth * height;
}

export function getUnitPricing(size: string, type: string): number {
  const basePrices: Record<string, number> = {
    locker: 25,
    '5x5': 50,
    '5x10': 75,
    '10x10': 125,
    '10x15': 175,
    '10x20': 225,
    '10x30': 300,
  };

  const typeMultipliers: Record<string, number> = {
    standard: 1.0,
    climate_controlled: 1.4,
    drive_up: 1.2,
    indoor: 1.1,
    outdoor: 0.8,
  };

  return Math.round((basePrices[size] || 100) * (typeMultipliers[type] || 1.0));
}

// ============================================================================
// Exported Maps and Sync Functions for Testing
// ============================================================================

export interface StorageUnit {
  id: string;
  propertyId: string;
  unitNumber: string;
  size: string;
  type: string;
  status: StorageUnitStatus;
  monthlyRate?: number;
  createdAt: string;
  updatedAt: string;
}

export const storageUnits = new Map<string, StorageUnit>();
export const storageRentals = new Map<string, StorageRental>();
export const storagePayments = new Map<string, unknown>();
export const storageAccessLogs = new Map<string, unknown>();
export const storageWaitlists = new Map<string, unknown>();
export const storagePromotions = new Map<string, unknown>();
export const lienAuctions = new Map<string, unknown>();

// Synchronous getAvailableUnits for testing
export function getAvailableUnits(
  propertyId: string,
  size?: string,
  type?: string
): StorageUnit[] {
  return Array.from(storageUnits.values()).filter(
    u => u.propertyId === propertyId &&
      u.status === 'available' &&
      (!size || u.size === size) &&
      (!type || u.type === type)
  );
}

// Synchronous getOccupancyStats for testing
export function getOccupancyStats(propertyId: string): {
  total: number;
  available: number;
  rented: number;
  reserved: number;
  maintenance: number;
  occupancyRate: number;
  bySize: Record<string, { total: number; rented: number }>;
  byType: Record<string, { total: number; rented: number }>;
} {
  const units = Array.from(storageUnits.values()).filter(u => u.propertyId === propertyId);

  const total = units.length;
  const available = units.filter((u) => u.status === 'available').length;
  const rented = units.filter((u) => u.status === 'assigned' || u.status === 'rented').length;
  const reserved = units.filter((u) => u.status === 'reserved').length;
  const maintenance = units.filter((u) => u.status === 'maintenance').length;

  const bySize: Record<string, { total: number; rented: number }> = {};
  const byType: Record<string, { total: number; rented: number }> = {};

  units.forEach((unit) => {
    if (!bySize[unit.size]) {
      bySize[unit.size] = { total: 0, rented: 0 };
    }
    bySize[unit.size].total++;
    if (unit.status === 'assigned' || unit.status === 'rented') bySize[unit.size].rented++;

    if (!byType[unit.type]) {
      byType[unit.type] = { total: 0, rented: 0 };
    }
    byType[unit.type].total++;
    if (unit.status === 'assigned' || unit.status === 'rented') byType[unit.type].rented++;
  });

  return {
    total,
    available,
    rented,
    reserved,
    maintenance,
    occupancyRate: total > 0 ? Math.round((rented / total) * 100) : 0,
    bySize,
    byType,
  };
}

// Async versions for production
async function getAvailableUnitsAsync(
  propertyId: string,
  size?: string,
  type?: string
) {
  return prisma.storageUnit.findMany({
    where: {
      propertyId,
      status: 'available',
      ...(size ? { size } : {}),
      ...(type ? { type } : {}),
    },
  });
}

export async function getOccupancyStatsAsync(propertyId: string) {
  const units = await prisma.storageUnit.findMany({
    where: { propertyId },
  });

  const total = units.length;
  const available = units.filter((u) => u.status === 'available').length;
  const rented = units.filter((u) => u.status === 'assigned').length;
  const reserved = units.filter((u) => u.status === 'reserved').length;
  const maintenance = units.filter((u) => u.status === 'maintenance').length;

  const bySize: Record<string, { total: number; rented: number }> = {};
  const byType: Record<string, { total: number; rented: number }> = {};

  units.forEach((unit) => {
    if (!bySize[unit.size]) {
      bySize[unit.size] = { total: 0, rented: 0 };
    }
    bySize[unit.size].total++;
    if (unit.status === 'assigned') bySize[unit.size].rented++;

    if (!byType[unit.type]) {
      byType[unit.type] = { total: 0, rented: 0 };
    }
    byType[unit.type].total++;
    if (unit.status === 'assigned') byType[unit.type].rented++;
  });

  return {
    total,
    available,
    rented,
    reserved,
    maintenance,
    occupancyRate: total > 0 ? Math.round((rented / total) * 100) : 0,
    bySize,
    byType,
  };
}

export async function calculateRevenue(
  propertyId: string,
  startDate?: string,
  endDate?: string
) {
  const rentals = await prisma.storageRental.findMany({
    where: { propertyId },
    select: { id: true },
  });
  const rentalIds = rentals.map((r) => r.id);

  const whereClause: Record<string, unknown> = {
    rentalId: { in: rentalIds },
    status: 'completed' as StoragePaymentStatus,
  };

  if (startDate || endDate) {
    whereClause.paidDate = {};
    if (startDate) (whereClause.paidDate as Record<string, Date>).gte = new Date(startDate);
    if (endDate) (whereClause.paidDate as Record<string, Date>).lte = new Date(endDate);
  }

  const payments = await prisma.storagePayment.findMany({
    where: whereClause,
  });

  const rentRevenue = payments
    .filter((p) => p.type === 'rent')
    .reduce((sum, p) => sum + p.amount, 0);
  const depositRevenue = payments
    .filter((p) => p.type === 'deposit')
    .reduce((sum, p) => sum + p.amount, 0);
  const lateFeeRevenue = payments
    .filter((p) => p.type === 'late_fee')
    .reduce((sum, p) => sum + p.amount, 0);
  const insuranceRevenue = payments
    .filter((p) => p.type === 'insurance')
    .reduce((sum, p) => sum + p.amount, 0);
  const refunds = payments
    .filter((p) => p.type === 'refund')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalRevenue = rentRevenue + depositRevenue + lateFeeRevenue + insuranceRevenue;
  const netRevenue = totalRevenue - refunds;

  return {
    totalRevenue,
    rentRevenue,
    depositRevenue,
    lateFeeRevenue,
    insuranceRevenue,
    refunds,
    netRevenue,
  };
}

export interface StorageRental {
  id: string;
  nextPaymentDue: Date | null;
  status: 'active' | 'past_due' | 'lien' | 'auction' | 'terminated';
}

export interface StoragePromotion {
  id: string;
  discountType: 'percentage' | 'flat' | 'free_months';
  discountValue: number;
  freeMonths?: number;
  isActive: boolean;
}

export function isRentalPastDue(rental: StorageRental): boolean {
  // Support both nextPaymentDue and nextPaymentDate
  const dueDateValue = rental.nextPaymentDue || (rental as unknown as { nextPaymentDate?: string | Date }).nextPaymentDate;
  if (!dueDateValue) return false;
  const now = new Date();
  const dueDate = typeof dueDateValue === 'string'
    ? new Date(dueDateValue)
    : dueDateValue;
  return dueDate < now && rental.status !== 'terminated';
}

export function applyPromotion(
  unitOrRate: StorageUnit | number,
  promotion: StoragePromotion
): { discountedRate: number; savingsAmount: number } | number {
  // Get the monthly rate from unit or use the number directly
  const monthlyRate = typeof unitOrRate === 'number'
    ? unitOrRate
    : unitOrRate.monthlyRate || 0;

  if (!promotion.isActive) {
    if (typeof unitOrRate === 'number') {
      return monthlyRate;
    }
    return { discountedRate: monthlyRate, savingsAmount: 0 };
  }

  let discountedRate: number;
  switch (promotion.discountType) {
    case 'percentage':
      discountedRate = monthlyRate * (1 - promotion.discountValue / 100);
      break;
    case 'flat':
      discountedRate = Math.max(0, monthlyRate - promotion.discountValue);
      break;
    case 'free_months':
      discountedRate = 0; // First month(s) free
      break;
    default:
      discountedRate = monthlyRate;
  }

  const savingsAmount = monthlyRate - discountedRate;

  // Return object if called with unit, number if called with rate
  if (typeof unitOrRate === 'number') {
    return discountedRate;
  }
  return { discountedRate, savingsAmount };
}

// ============================================================================
// SCHEMAS
// ============================================================================

const UnitSchema = z.object({
  propertyId: z.string().uuid(),
  unitNumber: z.string(),
  size: z.enum(['locker', '5x5', '5x10', '10x10', '10x15', '10x20', '10x30']),
  type: z.enum(['standard', 'climate_controlled', 'drive_up', 'indoor', 'outdoor']),
  floor: z.number().int().min(0).default(1),
  building: z.string().optional(),
  dimensions: z.object({
    width: z.number().positive(),
    depth: z.number().positive(),
    height: z.number().positive(),
  }),
  monthlyRate: z.number().positive(),
  features: z.array(z.string()).default([]),
  accessType: z.enum(['key', 'keypad', 'card', 'biometric']).default('keypad'),
  hasElectricity: z.boolean().default(false),
  insuranceRequired: z.boolean().default(true),
  minimumInsuranceCoverage: z.number().positive().optional(),
});

const RentalSchema = z.object({
  unitId: z.string().uuid(),
  propertyId: z.string().uuid(),
  tenantId: z.string().uuid(),
  startDate: z.string(),
  monthlyRate: z.number().positive(),
  paymentFrequency: z.enum(['monthly', 'quarterly', 'annual']).default('monthly'),
  autopayEnabled: z.boolean().default(false),
  securityDeposit: z.number().nonnegative().default(0),
  insurancePolicy: z.string().optional(),
  insuranceCoverage: z.number().positive().optional(),
});

const PaymentSchema = z.object({
  rentalId: z.string().uuid(),
  amount: z.number().positive(),
  type: z.enum(['rent', 'deposit', 'late_fee', 'insurance', 'refund']),
  paymentMethod: z.string(),
  transactionId: z.string().optional(),
  dueDate: z.string(),
  notes: z.string().optional(),
});

const WaitlistSchema = z.object({
  propertyId: z.string().uuid(),
  tenantId: z.string().uuid(),
  preferredSizes: z.array(z.enum(['locker', '5x5', '5x10', '10x10', '10x15', '10x20', '10x30'])),
  preferredType: z.enum(['standard', 'climate_controlled', 'drive_up', 'indoor', 'outdoor']).optional(),
  maxMonthlyRate: z.number().positive().optional(),
  notes: z.string().optional(),
});

const PromotionSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  discountType: z.enum(['percentage', 'fixed', 'free_months']),
  discountValue: z.number().positive(),
  applicableSizes: z.array(z.enum(['locker', '5x5', '5x10', '10x10', '10x15', '10x20', '10x30'])),
  applicableTypes: z.array(z.enum(['standard', 'climate_controlled', 'drive_up', 'indoor', 'outdoor'])),
  startDate: z.string(),
  endDate: z.string(),
  maxUses: z.number().int().positive().optional(),
  promoCode: z.string().optional(),
});

const LienSchema = z.object({
  rentalId: z.string().uuid(),
  totalOwed: z.number().positive(),
  auctionDate: z.string().optional(),
  auctionLocation: z.string().optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

export const storageRoutes: FastifyPluginAsync = async (app) => {
  // ─────────────────────────────────────────────────────────────────────────
  // UNITS
  // ─────────────────────────────────────────────────────────────────────────

  // Create unit
  app.post(
    '/units',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof UnitSchema> }>,
      reply
    ) => {
      const data = UnitSchema.parse(request.body);

      const unit = await prisma.storageUnit.create({
        data: {
          propertyId: data.propertyId,
          unitNumber: data.unitNumber,
          size: data.size,
          type: data.type,
          floor: data.floor,
          building: data.building,
          dimensions: data.dimensions,
          squareFeet: calculateSquareFeet(data.dimensions.width, data.dimensions.depth),
          cubicFeet: calculateCubicFeet(data.dimensions.width, data.dimensions.depth, data.dimensions.height),
          monthlyRate: data.monthlyRate,
          status: 'available',
          features: data.features,
          accessType: data.accessType,
          hasElectricity: data.hasElectricity,
          insuranceRequired: data.insuranceRequired,
          minimumInsuranceCoverage: data.minimumInsuranceCoverage,
        },
      });

      return reply.status(201).send(unit);
    }
  );

  // List units
  app.get(
    '/units',
    async (
      request: FastifyRequest<{
        Querystring: {
          propertyId?: string;
          status?: string;
          size?: string;
          type?: string;
          minRate?: string;
          maxRate?: string;
        };
      }>,
      reply
    ) => {
      const { propertyId, status, size, type, minRate, maxRate } = request.query;

      const units = await prisma.storageUnit.findMany({
        where: {
          ...(propertyId ? { propertyId } : {}),
          ...(status ? { status: status as StorageUnitStatus } : {}),
          ...(size ? { size } : {}),
          ...(type ? { type } : {}),
          ...(minRate || maxRate
            ? {
                monthlyRate: {
                  ...(minRate ? { gte: parseFloat(minRate) } : {}),
                  ...(maxRate ? { lte: parseFloat(maxRate) } : {}),
                },
              }
            : {}),
        },
      });

      return reply.send(units);
    }
  );

  // Get unit by ID
  app.get(
    '/units/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const unit = await prisma.storageUnit.findUnique({
        where: { id: request.params.id },
      });

      if (!unit) {
        return reply.status(404).send({ error: 'Storage unit not found' });
      }
      return reply.send(unit);
    }
  );

  // Update unit
  app.patch(
    '/units/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: Partial<z.infer<typeof UnitSchema>> & { status?: string };
      }>,
      reply
    ) => {
      const unit = await prisma.storageUnit.findUnique({
        where: { id: request.params.id },
      });

      if (!unit) {
        return reply.status(404).send({ error: 'Storage unit not found' });
      }

      const updateData: Record<string, unknown> = { ...request.body };

      if (request.body.dimensions) {
        const dims = unit.dimensions as { width: number; depth: number; height: number } | null;
        const width = request.body.dimensions.width || dims?.width || 0;
        const depth = request.body.dimensions.depth || dims?.depth || 0;
        const height = request.body.dimensions.height || dims?.height || 0;
        updateData.squareFeet = calculateSquareFeet(width, depth);
        updateData.cubicFeet = calculateCubicFeet(width, depth, height);
      }

      const updated = await prisma.storageUnit.update({
        where: { id: request.params.id },
        data: updateData,
      });

      return reply.send(updated);
    }
  );

  // Get occupancy stats
  app.get(
    '/units/stats/occupancy',
    async (
      request: FastifyRequest<{ Querystring: { propertyId: string } }>,
      reply
    ) => {
      const stats = await getOccupancyStatsAsync(request.query.propertyId);
      return reply.send(stats);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RENTALS
  // ─────────────────────────────────────────────────────────────────────────

  // Create rental
  app.post(
    '/rentals',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof RentalSchema> }>,
      reply
    ) => {
      const data = RentalSchema.parse(request.body);

      const unit = await prisma.storageUnit.findUnique({
        where: { id: data.unitId },
      });

      if (!unit) {
        return reply.status(404).send({ error: 'Storage unit not found' });
      }
      if (unit.status !== 'available' && unit.status !== 'reserved') {
        return reply.status(400).send({ error: 'Unit is not available' });
      }

      // Check insurance requirement
      if (unit.insuranceRequired && !data.insuranceCoverage) {
        return reply.status(400).send({ error: 'Insurance coverage is required for this unit' });
      }
      if (unit.minimumInsuranceCoverage && data.insuranceCoverage) {
        if (data.insuranceCoverage < unit.minimumInsuranceCoverage) {
          return reply.status(400).send({
            error: `Minimum insurance coverage of $${unit.minimumInsuranceCoverage} required`,
          });
        }
      }

      const startDate = new Date(data.startDate);

      const rental = await prisma.storageRental.create({
        data: {
          unitId: data.unitId,
          propertyId: data.propertyId,
          tenantId: data.tenantId,
          status: 'active',
          startDate,
          monthlyRate: data.monthlyRate,
          paymentFrequency: data.paymentFrequency,
          nextPaymentDate: startDate,
          autopayEnabled: data.autopayEnabled,
          securityDeposit: data.securityDeposit,
          insurancePolicy: data.insurancePolicy,
          insuranceCoverage: data.insuranceCoverage,
          accessCode: unit.accessType === 'keypad' ? generateAccessCode() : null,
          moveInDate: startDate,
          balance: 0,
        },
      });

      // Update unit status
      await prisma.storageUnit.update({
        where: { id: data.unitId },
        data: { status: 'assigned' },
      });

      return reply.status(201).send(rental);
    }
  );

  // List rentals
  app.get(
    '/rentals',
    async (
      request: FastifyRequest<{
        Querystring: {
          propertyId?: string;
          tenantId?: string;
          status?: string;
          pastDue?: string;
        };
      }>,
      reply
    ) => {
      const { propertyId, tenantId, status, pastDue } = request.query;

      let rentals = await prisma.storageRental.findMany({
        where: {
          ...(propertyId ? { propertyId } : {}),
          ...(tenantId ? { tenantId } : {}),
          ...(status ? { status: status as StorageRentalStatus } : {}),
        },
      });

      if (pastDue === 'true') {
        const today = new Date();
        rentals = rentals.filter(
          (r) => r.nextPaymentDate < today && r.balance > 0
        );
      }

      return reply.send(rentals);
    }
  );

  // Get rental by ID
  app.get(
    '/rentals/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const rental = await prisma.storageRental.findUnique({
        where: { id: request.params.id },
      });

      if (!rental) {
        return reply.status(404).send({ error: 'Rental not found' });
      }
      return reply.send(rental);
    }
  );

  // Terminate rental
  app.post(
    '/rentals/:id/terminate',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { moveOutDate: string; reason?: string };
      }>,
      reply
    ) => {
      const rental = await prisma.storageRental.findUnique({
        where: { id: request.params.id },
      });

      if (!rental) {
        return reply.status(404).send({ error: 'Rental not found' });
      }

      const moveOutDate = new Date(request.body.moveOutDate);

      const updated = await prisma.storageRental.update({
        where: { id: request.params.id },
        data: {
          status: 'terminated',
          endDate: moveOutDate,
          moveOutDate,
          terminationReason: request.body.reason,
        },
      });

      // Free up unit (set to maintenance for cleaning)
      await prisma.storageUnit.update({
        where: { id: rental.unitId },
        data: { status: 'maintenance' },
      });

      return reply.send(updated);
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

      const rental = await prisma.storageRental.findUnique({
        where: { id: data.rentalId },
      });

      if (!rental) {
        return reply.status(404).send({ error: 'Rental not found' });
      }

      const now = new Date();

      const payment = await prisma.storagePayment.create({
        data: {
          rentalId: data.rentalId,
          amount: data.amount,
          type: data.type as StoragePaymentType,
          status: 'completed',
          paymentMethod: data.paymentMethod,
          transactionId: data.transactionId,
          dueDate: new Date(data.dueDate),
          paidDate: now,
          notes: data.notes,
        },
      });

      // Update rental balance and next payment date
      let newBalance = rental.balance;
      if (data.type !== 'refund') {
        newBalance = Math.max(0, rental.balance - data.amount);
      } else {
        newBalance = rental.balance + data.amount;
      }

      let nextPaymentDate = rental.nextPaymentDate;
      if (data.type === 'rent') {
        const nextDate = new Date(rental.nextPaymentDate);
        switch (rental.paymentFrequency) {
          case 'monthly':
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
          case 'quarterly':
            nextDate.setMonth(nextDate.getMonth() + 3);
            break;
          case 'annual':
            nextDate.setFullYear(nextDate.getFullYear() + 1);
            break;
        }
        nextPaymentDate = nextDate;
      }

      await prisma.storageRental.update({
        where: { id: data.rentalId },
        data: { balance: newBalance, nextPaymentDate },
      });

      return reply.status(201).send(payment);
    }
  );

  // List payments
  app.get(
    '/payments',
    async (
      request: FastifyRequest<{
        Querystring: { rentalId?: string; type?: string; startDate?: string; endDate?: string };
      }>,
      reply
    ) => {
      const { rentalId, type, startDate, endDate } = request.query;

      const payments = await prisma.storagePayment.findMany({
        where: {
          ...(rentalId ? { rentalId } : {}),
          ...(type ? { type: type as StoragePaymentType } : {}),
          ...(startDate || endDate
            ? {
                paidDate: {
                  ...(startDate ? { gte: new Date(startDate) } : {}),
                  ...(endDate ? { lte: new Date(endDate) } : {}),
                },
              }
            : {}),
        },
      });

      return reply.send(payments);
    }
  );

  // Revenue report
  app.get(
    '/payments/revenue',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId: string; startDate?: string; endDate?: string };
      }>,
      reply
    ) => {
      const revenue = await calculateRevenue(
        request.query.propertyId,
        request.query.startDate,
        request.query.endDate
      );
      return reply.send(revenue);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ACCESS LOGS
  // ─────────────────────────────────────────────────────────────────────────

  // Log access
  app.post(
    '/access',
    async (
      request: FastifyRequest<{
        Body: {
          unitId: string;
          rentalId?: string;
          accessType: 'entry' | 'exit' | 'failed_attempt';
          method: string;
          accessedBy: string;
          ipAddress?: string;
          deviceId?: string;
          notes?: string;
        };
      }>,
      reply
    ) => {
      const log = await prisma.storageAccessLog.create({
        data: {
          unitId: request.body.unitId,
          rentalId: request.body.rentalId,
          accessType: request.body.accessType,
          method: request.body.method,
          accessedBy: request.body.accessedBy,
          accessedAt: new Date(),
          ipAddress: request.body.ipAddress,
          deviceId: request.body.deviceId,
          notes: request.body.notes,
        },
      });

      return reply.status(201).send(log);
    }
  );

  // List access logs
  app.get(
    '/access',
    async (
      request: FastifyRequest<{
        Querystring: {
          unitId?: string;
          rentalId?: string;
          accessType?: string;
          startDate?: string;
          endDate?: string;
        };
      }>,
      reply
    ) => {
      const { unitId, rentalId, accessType, startDate, endDate } = request.query;

      const logs = await prisma.storageAccessLog.findMany({
        where: {
          ...(unitId ? { unitId } : {}),
          ...(rentalId ? { rentalId } : {}),
          ...(accessType ? { accessType } : {}),
          ...(startDate || endDate
            ? {
                accessedAt: {
                  ...(startDate ? { gte: new Date(startDate) } : {}),
                  ...(endDate ? { lte: new Date(endDate) } : {}),
                },
              }
            : {}),
        },
        orderBy: { accessedAt: 'desc' },
      });

      return reply.send(logs);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // WAITLIST
  // ─────────────────────────────────────────────────────────────────────────

  // Add to waitlist
  app.post(
    '/waitlist',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof WaitlistSchema> }>,
      reply
    ) => {
      const data = WaitlistSchema.parse(request.body);

      // Calculate priority based on position
      const existingCount = await prisma.storageWaitlist.count({
        where: { propertyId: data.propertyId, status: 'waiting' },
      });

      const entry = await prisma.storageWaitlist.create({
        data: {
          propertyId: data.propertyId,
          tenantId: data.tenantId,
          preferredSizes: data.preferredSizes,
          preferredType: data.preferredType,
          maxMonthlyRate: data.maxMonthlyRate,
          notes: data.notes,
          priority: existingCount + 1,
          status: 'waiting',
        },
      });

      return reply.status(201).send(entry);
    }
  );

  // List waitlist
  app.get(
    '/waitlist',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; tenantId?: string; status?: string };
      }>,
      reply
    ) => {
      const { propertyId, tenantId, status } = request.query;

      const entries = await prisma.storageWaitlist.findMany({
        where: {
          ...(propertyId ? { propertyId } : {}),
          ...(tenantId ? { tenantId } : {}),
          ...(status ? { status } : {}),
        },
        orderBy: { priority: 'asc' },
      });

      return reply.send(entries);
    }
  );

  // Offer unit to waitlist entry
  app.post(
    '/waitlist/:id/offer',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { unitId: string; expiresInHours?: number };
      }>,
      reply
    ) => {
      const entry = await prisma.storageWaitlist.findUnique({
        where: { id: request.params.id },
      });

      if (!entry) {
        return reply.status(404).send({ error: 'Waitlist entry not found' });
      }

      const unit = await prisma.storageUnit.findUnique({
        where: { id: request.body.unitId },
      });

      if (!unit) {
        return reply.status(404).send({ error: 'Unit not found' });
      }

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + (request.body.expiresInHours || 48));

      const updated = await prisma.storageWaitlist.update({
        where: { id: request.params.id },
        data: {
          status: 'offered',
          offeredUnitId: request.body.unitId,
          offerExpiresAt: expiresAt,
        },
      });

      // Reserve unit
      await prisma.storageUnit.update({
        where: { id: request.body.unitId },
        data: { status: 'reserved' },
      });

      return reply.send(updated);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PROMOTIONS
  // ─────────────────────────────────────────────────────────────────────────

  // Create promotion
  app.post(
    '/promotions',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof PromotionSchema> }>,
      reply
    ) => {
      const data = PromotionSchema.parse(request.body);

      const promotion = await prisma.storagePromotion.create({
        data: {
          propertyId: data.propertyId,
          name: data.name,
          description: data.description,
          discountType: data.discountType,
          discountValue: data.discountValue,
          applicableSizes: data.applicableSizes,
          applicableTypes: data.applicableTypes,
          startDate: new Date(data.startDate),
          endDate: new Date(data.endDate),
          maxUses: data.maxUses,
          promoCode: data.promoCode,
          currentUses: 0,
          isActive: true,
        },
      });

      return reply.status(201).send(promotion);
    }
  );

  // List promotions
  app.get(
    '/promotions',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; active?: string };
      }>,
      reply
    ) => {
      const { propertyId, active } = request.query;
      const now = new Date();

      const promotions = await prisma.storagePromotion.findMany({
        where: {
          ...(propertyId ? { propertyId } : {}),
          ...(active === 'true'
            ? {
                isActive: true,
                startDate: { lte: now },
                endDate: { gte: now },
              }
            : {}),
        },
      });

      return reply.send(promotions);
    }
  );

  // Apply promotion to unit
  app.post(
    '/promotions/:id/apply',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { unitId: string };
      }>,
      reply
    ) => {
      const promotion = await prisma.storagePromotion.findUnique({
        where: { id: request.params.id },
      });

      if (!promotion) {
        return reply.status(404).send({ error: 'Promotion not found' });
      }

      const unit = await prisma.storageUnit.findUnique({
        where: { id: request.body.unitId },
      });

      if (!unit) {
        return reply.status(404).send({ error: 'Unit not found' });
      }

      if (!promotion.isActive) {
        return reply.status(400).send({ error: 'Promotion is not active' });
      }

      const now = new Date();
      if (promotion.startDate > now || promotion.endDate < now) {
        return reply.status(400).send({ error: 'Promotion is not valid at this time' });
      }

      if (promotion.maxUses && promotion.currentUses >= promotion.maxUses) {
        return reply.status(400).send({ error: 'Promotion has reached maximum uses' });
      }

      // Check applicability
      if (!promotion.applicableSizes.includes(unit.size)) {
        return reply.status(400).send({ error: 'Promotion not applicable to this unit size' });
      }
      if (!promotion.applicableTypes.includes(unit.type)) {
        return reply.status(400).send({ error: 'Promotion not applicable to this unit type' });
      }

      // Calculate discount
      let discountedRate = unit.monthlyRate;
      let savingsAmount = 0;

      switch (promotion.discountType) {
        case 'percentage':
          savingsAmount = Math.round(unit.monthlyRate * (promotion.discountValue / 100));
          discountedRate = unit.monthlyRate - savingsAmount;
          break;
        case 'fixed':
          savingsAmount = Math.min(promotion.discountValue, unit.monthlyRate);
          discountedRate = unit.monthlyRate - savingsAmount;
          break;
        case 'free_months':
          savingsAmount = unit.monthlyRate * promotion.discountValue;
          break;
      }

      // Increment usage
      await prisma.storagePromotion.update({
        where: { id: request.params.id },
        data: { currentUses: promotion.currentUses + 1 },
      });

      return reply.send({
        originalRate: unit.monthlyRate,
        discountedRate,
        savingsAmount,
        promotionApplied: promotion.name,
      });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // LIEN AUCTIONS
  // ─────────────────────────────────────────────────────────────────────────

  // Create lien
  app.post(
    '/liens',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof LienSchema> }>,
      reply
    ) => {
      const data = LienSchema.parse(request.body);

      const rental = await prisma.storageRental.findUnique({
        where: { id: data.rentalId },
      });

      if (!rental) {
        return reply.status(404).send({ error: 'Rental not found' });
      }

      const lien = await prisma.lienAuction.create({
        data: {
          rentalId: data.rentalId,
          unitId: rental.unitId,
          status: 'pending',
          totalOwed: data.totalOwed,
          noticeDate: new Date(),
          auctionDate: data.auctionDate ? new Date(data.auctionDate) : null,
          auctionLocation: data.auctionLocation,
        },
      });

      return reply.status(201).send(lien);
    }
  );

  // List liens
  app.get(
    '/liens',
    async (
      request: FastifyRequest<{
        Querystring: { status?: string; rentalId?: string };
      }>,
      reply
    ) => {
      const { status, rentalId } = request.query;

      const liens = await prisma.lienAuction.findMany({
        where: {
          ...(status ? { status: status as LienAuctionStatus } : {}),
          ...(rentalId ? { rentalId } : {}),
        },
      });

      return reply.send(liens);
    }
  );

  // Record auction result
  app.post(
    '/liens/:id/auction-result',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { winningBid: number; winnerId: string; fees?: number };
      }>,
      reply
    ) => {
      const lien = await prisma.lienAuction.findUnique({
        where: { id: request.params.id },
      });

      if (!lien) {
        return reply.status(404).send({ error: 'Lien not found' });
      }

      const fees = request.body.fees || 0;
      const proceeds = request.body.winningBid - fees;
      const surplus = proceeds > lien.totalOwed ? proceeds - lien.totalOwed : 0;

      const updated = await prisma.lienAuction.update({
        where: { id: request.params.id },
        data: {
          status: 'completed',
          winningBid: request.body.winningBid,
          winnerId: request.body.winnerId,
          proceeds,
          fees,
          surplus,
        },
      });

      // Terminate rental
      await prisma.storageRental.update({
        where: { id: lien.rentalId },
        data: {
          status: 'terminated',
          terminationReason: 'Lien auction',
        },
      });

      // Free up unit
      await prisma.storageUnit.update({
        where: { id: lien.unitId },
        data: { status: 'maintenance' },
      });

      return reply.send(updated);
    }
  );
};
