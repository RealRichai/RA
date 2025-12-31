import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

type UnitSize = 'locker' | '5x5' | '5x10' | '10x10' | '10x15' | '10x20' | '10x30';
type UnitType = 'standard' | 'climate_controlled' | 'drive_up' | 'indoor' | 'outdoor';
type UnitStatus = 'available' | 'rented' | 'reserved' | 'maintenance' | 'cleaning';
type RentalStatus = 'active' | 'past_due' | 'terminated' | 'pending';
type AccessType = 'key' | 'keypad' | 'card' | 'biometric';
type PaymentFrequency = 'monthly' | 'quarterly' | 'annual';

export interface StorageUnit {
  id: string;
  propertyId: string;
  unitNumber: string;
  size: UnitSize;
  type: UnitType;
  status: UnitStatus;
  floor: number;
  building?: string;
  dimensions: {
    width: number;
    depth: number;
    height: number;
  };
  squareFeet: number;
  cubicFeet: number;
  monthlyRate: number;
  features: string[];
  accessType: AccessType;
  hasElectricity: boolean;
  insuranceRequired: boolean;
  minimumInsuranceCoverage?: number;
  createdAt: string;
  updatedAt: string;
}

export interface StorageRental {
  id: string;
  unitId: string;
  propertyId: string;
  tenantId: string;
  status: RentalStatus;
  startDate: string;
  endDate?: string;
  monthlyRate: number;
  paymentFrequency: PaymentFrequency;
  nextPaymentDate: string;
  autopayEnabled: boolean;
  securityDeposit: number;
  insurancePolicy?: string;
  insuranceCoverage?: number;
  accessCode?: string;
  accessCardNumber?: string;
  moveInDate: string;
  moveOutDate?: string;
  terminationReason?: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoragePayment {
  id: string;
  rentalId: string;
  amount: number;
  type: 'rent' | 'deposit' | 'late_fee' | 'insurance' | 'refund';
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  paymentMethod: string;
  transactionId?: string;
  dueDate: string;
  paidDate?: string;
  notes?: string;
  createdAt: string;
}

export interface StorageAccessLog {
  id: string;
  unitId: string;
  rentalId?: string;
  accessType: 'entry' | 'exit' | 'failed_attempt';
  method: AccessType | 'override' | 'staff';
  accessedBy: string;
  accessedAt: string;
  ipAddress?: string;
  deviceId?: string;
  notes?: string;
}

export interface StorageWaitlist {
  id: string;
  propertyId: string;
  tenantId: string;
  preferredSizes: UnitSize[];
  preferredType?: UnitType;
  maxMonthlyRate?: number;
  priority: number;
  status: 'waiting' | 'offered' | 'accepted' | 'declined' | 'expired';
  offeredUnitId?: string;
  offerExpiresAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoragePromotion {
  id: string;
  propertyId: string;
  name: string;
  description: string;
  discountType: 'percentage' | 'fixed' | 'free_months';
  discountValue: number;
  applicableSizes: UnitSize[];
  applicableTypes: UnitType[];
  startDate: string;
  endDate: string;
  maxUses?: number;
  currentUses: number;
  promoCode?: string;
  isActive: boolean;
  createdAt: string;
}

export interface LienAuction {
  id: string;
  rentalId: string;
  unitId: string;
  status: 'pending' | 'scheduled' | 'completed' | 'cancelled';
  totalOwed: number;
  noticeDate: string;
  auctionDate?: string;
  auctionLocation?: string;
  winningBid?: number;
  winnerId?: string;
  proceeds?: number;
  fees?: number;
  surplus?: number;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// IN-MEMORY STORES
// ============================================================================

export const storageUnits = new Map<string, StorageUnit>();
export const storageRentals = new Map<string, StorageRental>();
export const storagePayments = new Map<string, StoragePayment>();
export const storageAccessLogs = new Map<string, StorageAccessLog>();
export const storageWaitlists = new Map<string, StorageWaitlist>();
export const storagePromotions = new Map<string, StoragePromotion>();
export const lienAuctions = new Map<string, LienAuction>();

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

export function getUnitPricing(size: UnitSize, type: UnitType): number {
  const basePrices: Record<UnitSize, number> = {
    locker: 25,
    '5x5': 50,
    '5x10': 75,
    '10x10': 125,
    '10x15': 175,
    '10x20': 225,
    '10x30': 300,
  };

  const typeMultipliers: Record<UnitType, number> = {
    standard: 1.0,
    climate_controlled: 1.4,
    drive_up: 1.2,
    indoor: 1.1,
    outdoor: 0.8,
  };

  return Math.round(basePrices[size] * typeMultipliers[type]);
}

export function getAvailableUnits(
  propertyId: string,
  size?: UnitSize,
  type?: UnitType
): StorageUnit[] {
  return Array.from(storageUnits.values()).filter((unit) => {
    if (unit.propertyId !== propertyId) return false;
    if (unit.status !== 'available') return false;
    if (size && unit.size !== size) return false;
    if (type && unit.type !== type) return false;
    return true;
  });
}

export function calculateRentalBalance(rentalId: string): number {
  const payments = Array.from(storagePayments.values()).filter(
    (p) => p.rentalId === rentalId
  );

  const totalCharges = payments
    .filter((p) => p.type !== 'refund' && p.status !== 'refunded')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalPaid = payments
    .filter((p) => p.status === 'completed' && p.type !== 'refund')
    .reduce((sum, p) => sum + p.amount, 0);

  const totalRefunds = payments
    .filter((p) => p.type === 'refund' && p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);

  return totalCharges - totalPaid + totalRefunds;
}

export function isRentalPastDue(rental: StorageRental): boolean {
  const today = new Date();
  const nextPayment = new Date(rental.nextPaymentDate);
  return nextPayment < today && rental.balance > 0;
}

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
  const units = Array.from(storageUnits.values()).filter(
    (u) => u.propertyId === propertyId
  );

  const total = units.length;
  const available = units.filter((u) => u.status === 'available').length;
  const rented = units.filter((u) => u.status === 'rented').length;
  const reserved = units.filter((u) => u.status === 'reserved').length;
  const maintenance = units.filter((u) => u.status === 'maintenance' || u.status === 'cleaning').length;

  const bySize: Record<string, { total: number; rented: number }> = {};
  const byType: Record<string, { total: number; rented: number }> = {};

  units.forEach((unit) => {
    if (!bySize[unit.size]) {
      bySize[unit.size] = { total: 0, rented: 0 };
    }
    bySize[unit.size].total++;
    if (unit.status === 'rented') bySize[unit.size].rented++;

    if (!byType[unit.type]) {
      byType[unit.type] = { total: 0, rented: 0 };
    }
    byType[unit.type].total++;
    if (unit.status === 'rented') byType[unit.type].rented++;
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

export function calculateRevenue(
  propertyId: string,
  startDate?: string,
  endDate?: string
): {
  totalRevenue: number;
  rentRevenue: number;
  depositRevenue: number;
  lateFeeRevenue: number;
  insuranceRevenue: number;
  refunds: number;
  netRevenue: number;
} {
  const rentals = Array.from(storageRentals.values()).filter(
    (r) => r.propertyId === propertyId
  );
  const rentalIds = new Set(rentals.map((r) => r.id));

  let payments = Array.from(storagePayments.values()).filter(
    (p) => rentalIds.has(p.rentalId) && p.status === 'completed'
  );

  if (startDate) {
    payments = payments.filter((p) => p.paidDate && p.paidDate >= startDate);
  }
  if (endDate) {
    payments = payments.filter((p) => p.paidDate && p.paidDate <= endDate);
  }

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

export function applyPromotion(
  unit: StorageUnit,
  promotion: StoragePromotion
): { discountedRate: number; savingsAmount: number } {
  if (!promotion.applicableSizes.includes(unit.size)) {
    return { discountedRate: unit.monthlyRate, savingsAmount: 0 };
  }
  if (!promotion.applicableTypes.includes(unit.type)) {
    return { discountedRate: unit.monthlyRate, savingsAmount: 0 };
  }

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
      discountedRate = unit.monthlyRate; // Rate stays same, but first X months free
      break;
  }

  return { discountedRate, savingsAmount };
}

// ============================================================================
// SCHEMAS
// ============================================================================

const UnitSchema = z.object({
  propertyId: z.string(),
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
  unitId: z.string(),
  propertyId: z.string(),
  tenantId: z.string(),
  startDate: z.string(),
  monthlyRate: z.number().positive(),
  paymentFrequency: z.enum(['monthly', 'quarterly', 'annual']).default('monthly'),
  autopayEnabled: z.boolean().default(false),
  securityDeposit: z.number().nonnegative().default(0),
  insurancePolicy: z.string().optional(),
  insuranceCoverage: z.number().positive().optional(),
});

const PaymentSchema = z.object({
  rentalId: z.string(),
  amount: z.number().positive(),
  type: z.enum(['rent', 'deposit', 'late_fee', 'insurance', 'refund']),
  paymentMethod: z.string(),
  transactionId: z.string().optional(),
  dueDate: z.string(),
  notes: z.string().optional(),
});

const WaitlistSchema = z.object({
  propertyId: z.string(),
  tenantId: z.string(),
  preferredSizes: z.array(z.enum(['locker', '5x5', '5x10', '10x10', '10x15', '10x20', '10x30'])),
  preferredType: z.enum(['standard', 'climate_controlled', 'drive_up', 'indoor', 'outdoor']).optional(),
  maxMonthlyRate: z.number().positive().optional(),
  notes: z.string().optional(),
});

const PromotionSchema = z.object({
  propertyId: z.string(),
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
  rentalId: z.string(),
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
      const now = new Date().toISOString();

      const unit: StorageUnit = {
        id: `stu_${Date.now()}`,
        ...data,
        status: 'available',
        squareFeet: calculateSquareFeet(data.dimensions.width, data.dimensions.depth),
        cubicFeet: calculateCubicFeet(data.dimensions.width, data.dimensions.depth, data.dimensions.height),
        createdAt: now,
        updatedAt: now,
      };

      storageUnits.set(unit.id, unit);
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
          status?: UnitStatus;
          size?: UnitSize;
          type?: UnitType;
          minRate?: string;
          maxRate?: string;
        };
      }>,
      reply
    ) => {
      let units = Array.from(storageUnits.values());

      if (request.query.propertyId) {
        units = units.filter((u) => u.propertyId === request.query.propertyId);
      }
      if (request.query.status) {
        units = units.filter((u) => u.status === request.query.status);
      }
      if (request.query.size) {
        units = units.filter((u) => u.size === request.query.size);
      }
      if (request.query.type) {
        units = units.filter((u) => u.type === request.query.type);
      }
      if (request.query.minRate) {
        const minRate = parseFloat(request.query.minRate);
        units = units.filter((u) => u.monthlyRate >= minRate);
      }
      if (request.query.maxRate) {
        const maxRate = parseFloat(request.query.maxRate);
        units = units.filter((u) => u.monthlyRate <= maxRate);
      }

      return reply.send(units);
    }
  );

  // Get unit by ID
  app.get(
    '/units/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const unit = storageUnits.get(request.params.id);
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
        Body: Partial<z.infer<typeof UnitSchema>> & { status?: UnitStatus };
      }>,
      reply
    ) => {
      const unit = storageUnits.get(request.params.id);
      if (!unit) {
        return reply.status(404).send({ error: 'Storage unit not found' });
      }

      const updated: StorageUnit = {
        ...unit,
        ...request.body,
        updatedAt: new Date().toISOString(),
      };

      if (request.body.dimensions) {
        updated.squareFeet = calculateSquareFeet(
          request.body.dimensions.width || unit.dimensions.width,
          request.body.dimensions.depth || unit.dimensions.depth
        );
        updated.cubicFeet = calculateCubicFeet(
          request.body.dimensions.width || unit.dimensions.width,
          request.body.dimensions.depth || unit.dimensions.depth,
          request.body.dimensions.height || unit.dimensions.height
        );
      }

      storageUnits.set(unit.id, updated);
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
      const stats = getOccupancyStats(request.query.propertyId);
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
      const now = new Date().toISOString();

      const unit = storageUnits.get(data.unitId);
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

      const rental: StorageRental = {
        id: `str_${Date.now()}`,
        ...data,
        status: 'active',
        nextPaymentDate: data.startDate,
        accessCode: unit.accessType === 'keypad' ? generateAccessCode() : undefined,
        moveInDate: data.startDate,
        balance: 0,
        createdAt: now,
        updatedAt: now,
      };

      // Update unit status
      unit.status = 'rented';
      unit.updatedAt = now;
      storageUnits.set(unit.id, unit);

      storageRentals.set(rental.id, rental);
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
          status?: RentalStatus;
          pastDue?: string;
        };
      }>,
      reply
    ) => {
      let rentals = Array.from(storageRentals.values());

      if (request.query.propertyId) {
        rentals = rentals.filter((r) => r.propertyId === request.query.propertyId);
      }
      if (request.query.tenantId) {
        rentals = rentals.filter((r) => r.tenantId === request.query.tenantId);
      }
      if (request.query.status) {
        rentals = rentals.filter((r) => r.status === request.query.status);
      }
      if (request.query.pastDue === 'true') {
        rentals = rentals.filter((r) => isRentalPastDue(r));
      }

      return reply.send(rentals);
    }
  );

  // Get rental by ID
  app.get(
    '/rentals/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const rental = storageRentals.get(request.params.id);
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
      const rental = storageRentals.get(request.params.id);
      if (!rental) {
        return reply.status(404).send({ error: 'Rental not found' });
      }

      const now = new Date().toISOString();

      rental.status = 'terminated';
      rental.endDate = request.body.moveOutDate;
      rental.moveOutDate = request.body.moveOutDate;
      rental.terminationReason = request.body.reason;
      rental.updatedAt = now;

      // Free up unit
      const unit = storageUnits.get(rental.unitId);
      if (unit) {
        unit.status = 'cleaning';
        unit.updatedAt = now;
        storageUnits.set(unit.id, unit);
      }

      storageRentals.set(rental.id, rental);
      return reply.send(rental);
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
      const now = new Date().toISOString();

      const rental = storageRentals.get(data.rentalId);
      if (!rental) {
        return reply.status(404).send({ error: 'Rental not found' });
      }

      const payment: StoragePayment = {
        id: `stp_${Date.now()}`,
        ...data,
        status: 'completed',
        paidDate: now,
        createdAt: now,
      };

      // Update rental balance
      if (data.type !== 'refund') {
        rental.balance = Math.max(0, rental.balance - data.amount);
      } else {
        rental.balance += data.amount;
      }

      // Update next payment date if rent payment
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
        rental.nextPaymentDate = nextDate.toISOString().split('T')[0];
      }

      rental.updatedAt = now;
      storageRentals.set(rental.id, rental);
      storagePayments.set(payment.id, payment);

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
      let payments = Array.from(storagePayments.values());

      if (request.query.rentalId) {
        payments = payments.filter((p) => p.rentalId === request.query.rentalId);
      }
      if (request.query.type) {
        payments = payments.filter((p) => p.type === request.query.type);
      }
      if (request.query.startDate) {
        payments = payments.filter((p) => p.paidDate && p.paidDate >= request.query.startDate!);
      }
      if (request.query.endDate) {
        payments = payments.filter((p) => p.paidDate && p.paidDate <= request.query.endDate!);
      }

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
      const revenue = calculateRevenue(
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
          method: AccessType | 'override' | 'staff';
          accessedBy: string;
          ipAddress?: string;
          deviceId?: string;
          notes?: string;
        };
      }>,
      reply
    ) => {
      const now = new Date().toISOString();

      const log: StorageAccessLog = {
        id: `sal_${Date.now()}`,
        ...request.body,
        accessedAt: now,
      };

      storageAccessLogs.set(log.id, log);
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
      let logs = Array.from(storageAccessLogs.values());

      if (request.query.unitId) {
        logs = logs.filter((l) => l.unitId === request.query.unitId);
      }
      if (request.query.rentalId) {
        logs = logs.filter((l) => l.rentalId === request.query.rentalId);
      }
      if (request.query.accessType) {
        logs = logs.filter((l) => l.accessType === request.query.accessType);
      }
      if (request.query.startDate) {
        logs = logs.filter((l) => l.accessedAt >= request.query.startDate!);
      }
      if (request.query.endDate) {
        logs = logs.filter((l) => l.accessedAt <= request.query.endDate!);
      }

      return reply.send(logs.sort((a, b) => b.accessedAt.localeCompare(a.accessedAt)));
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
      const now = new Date().toISOString();

      // Calculate priority based on position
      const existingEntries = Array.from(storageWaitlists.values()).filter(
        (w) => w.propertyId === data.propertyId && w.status === 'waiting'
      );
      const priority = existingEntries.length + 1;

      const entry: StorageWaitlist = {
        id: `swl_${Date.now()}`,
        ...data,
        priority,
        status: 'waiting',
        createdAt: now,
        updatedAt: now,
      };

      storageWaitlists.set(entry.id, entry);
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
      let entries = Array.from(storageWaitlists.values());

      if (request.query.propertyId) {
        entries = entries.filter((e) => e.propertyId === request.query.propertyId);
      }
      if (request.query.tenantId) {
        entries = entries.filter((e) => e.tenantId === request.query.tenantId);
      }
      if (request.query.status) {
        entries = entries.filter((e) => e.status === request.query.status);
      }

      return reply.send(entries.sort((a, b) => a.priority - b.priority));
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
      const entry = storageWaitlists.get(request.params.id);
      if (!entry) {
        return reply.status(404).send({ error: 'Waitlist entry not found' });
      }

      const unit = storageUnits.get(request.body.unitId);
      if (!unit) {
        return reply.status(404).send({ error: 'Unit not found' });
      }

      const now = new Date();
      const expiresAt = new Date(now.getTime() + (request.body.expiresInHours || 48) * 60 * 60 * 1000);

      entry.status = 'offered';
      entry.offeredUnitId = request.body.unitId;
      entry.offerExpiresAt = expiresAt.toISOString();
      entry.updatedAt = now.toISOString();

      // Reserve unit
      unit.status = 'reserved';
      unit.updatedAt = now.toISOString();
      storageUnits.set(unit.id, unit);

      storageWaitlists.set(entry.id, entry);
      return reply.send(entry);
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
      const now = new Date().toISOString();

      const promotion: StoragePromotion = {
        id: `spr_${Date.now()}`,
        ...data,
        currentUses: 0,
        isActive: true,
        createdAt: now,
      };

      storagePromotions.set(promotion.id, promotion);
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
      let promotions = Array.from(storagePromotions.values());

      if (request.query.propertyId) {
        promotions = promotions.filter((p) => p.propertyId === request.query.propertyId);
      }
      if (request.query.active === 'true') {
        const now = new Date().toISOString();
        promotions = promotions.filter(
          (p) => p.isActive && p.startDate <= now && p.endDate >= now
        );
      }

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
      const promotion = storagePromotions.get(request.params.id);
      if (!promotion) {
        return reply.status(404).send({ error: 'Promotion not found' });
      }

      const unit = storageUnits.get(request.body.unitId);
      if (!unit) {
        return reply.status(404).send({ error: 'Unit not found' });
      }

      if (!promotion.isActive) {
        return reply.status(400).send({ error: 'Promotion is not active' });
      }

      const now = new Date().toISOString();
      if (promotion.startDate > now || promotion.endDate < now) {
        return reply.status(400).send({ error: 'Promotion is not valid at this time' });
      }

      if (promotion.maxUses && promotion.currentUses >= promotion.maxUses) {
        return reply.status(400).send({ error: 'Promotion has reached maximum uses' });
      }

      const result = applyPromotion(unit, promotion);

      if (result.savingsAmount === 0) {
        return reply.status(400).send({ error: 'Promotion not applicable to this unit' });
      }

      // Increment usage
      promotion.currentUses++;
      storagePromotions.set(promotion.id, promotion);

      return reply.send({
        originalRate: unit.monthlyRate,
        discountedRate: result.discountedRate,
        savingsAmount: result.savingsAmount,
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
      const now = new Date().toISOString();

      const rental = storageRentals.get(data.rentalId);
      if (!rental) {
        return reply.status(404).send({ error: 'Rental not found' });
      }

      const lien: LienAuction = {
        id: `sla_${Date.now()}`,
        rentalId: data.rentalId,
        unitId: rental.unitId,
        status: 'pending',
        totalOwed: data.totalOwed,
        noticeDate: now,
        auctionDate: data.auctionDate,
        auctionLocation: data.auctionLocation,
        createdAt: now,
        updatedAt: now,
      };

      lienAuctions.set(lien.id, lien);
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
      let liens = Array.from(lienAuctions.values());

      if (request.query.status) {
        liens = liens.filter((l) => l.status === request.query.status);
      }
      if (request.query.rentalId) {
        liens = liens.filter((l) => l.rentalId === request.query.rentalId);
      }

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
      const lien = lienAuctions.get(request.params.id);
      if (!lien) {
        return reply.status(404).send({ error: 'Lien not found' });
      }

      const now = new Date().toISOString();
      const fees = request.body.fees || 0;
      const proceeds = request.body.winningBid - fees;
      const surplus = proceeds > lien.totalOwed ? proceeds - lien.totalOwed : 0;

      lien.status = 'completed';
      lien.winningBid = request.body.winningBid;
      lien.winnerId = request.body.winnerId;
      lien.proceeds = proceeds;
      lien.fees = fees;
      lien.surplus = surplus;
      lien.updatedAt = now;

      // Terminate rental
      const rental = storageRentals.get(lien.rentalId);
      if (rental) {
        rental.status = 'terminated';
        rental.terminationReason = 'Lien auction';
        rental.updatedAt = now;
        storageRentals.set(rental.id, rental);
      }

      // Free up unit
      const unit = storageUnits.get(lien.unitId);
      if (unit) {
        unit.status = 'cleaning';
        unit.updatedAt = now;
        storageUnits.set(unit.id, unit);
      }

      lienAuctions.set(lien.id, lien);
      return reply.send(lien);
    }
  );
};
