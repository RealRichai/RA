import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  prisma,
  type ParkingSpaceType,
  type ParkingSpaceStatus,
  type ParkingPermitStatus,
  type ParkingViolationType,
  type ParkingViolationStatus,
} from '@realriches/database';

// ============================================================================
// Types and Maps for Testing
// ============================================================================

export interface ParkingLot {
  id: string;
  propertyId: string;
  name: string;
  capacity: number;
  createdAt: string;
  updatedAt: string;
}

export interface ParkingSpace {
  id: string;
  lotId: string;
  propertyId?: string;
  spaceNumber: string;
  type: ParkingSpaceType | string;
  status: ParkingSpaceStatus | string;
  createdAt: string;
  updatedAt: string;
}

export interface ParkingPermit {
  id: string;
  tenantId: string;
  spaceId?: string;
  vehiclePlate: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  status: ParkingPermitStatus | string;
  startDate: Date | string;
  endDate: Date | string;
  monthlyRate?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ParkingGuestPass {
  id: string;
  propertyId: string;
  tenantId: string;
  guestName?: string;
  vehiclePlate?: string;
  passCode: string;
  validFrom: Date | string;
  validTo: Date | string;
  createdAt: string;
  updatedAt: string;
}

export interface ParkingViolation {
  id: string;
  propertyId: string;
  vehiclePlate: string;
  type: ParkingViolationType | string;
  status: ParkingViolationStatus | string;
  fineAmount: number;
  paidAmount?: number;
  vehicleTowed?: boolean;
  issuedAt: Date | string;
  createdAt: string;
  updatedAt: string;
}

// Exported Maps for test compatibility
export const parkingLotStore = new Map<string, ParkingLot>();
export const parkingSpaceStore = new Map<string, ParkingSpace>();
export const parkingPermitStore = new Map<string, ParkingPermit>();
export const guestPassStore = new Map<string, ParkingGuestPass>();
export const violationStore = new Map<string, ParkingViolation>();

// ============================================================================
// Helper Functions
// ============================================================================

export function generatePermitNumber(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'PMT-';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generatePassCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ============================================================================
// Synchronous functions for testing (use Maps)
// ============================================================================

export function getLotOccupancy(lotId: string): {
  total: number;
  available: number;
  assigned: number;
  reserved: number;
  visitor: number;
  maintenance: number;
  occupancyRate: number;
} {
  const spaces = Array.from(parkingSpaceStore.values()).filter(s => s.lotId === lotId);

  const total = spaces.length;
  const available = spaces.filter((s) => s.status === 'available').length;
  const assigned = spaces.filter((s) => s.status === 'assigned').length;
  const reserved = spaces.filter((s) => s.status === 'reserved').length;
  const visitor = spaces.filter((s) => s.status === 'visitor').length;
  const maintenance = spaces.filter((s) => s.status === 'maintenance').length;

  const occupancyRate = total > 0 ? ((total - available) / total) * 100 : 0;

  return {
    total,
    available,
    assigned,
    reserved,
    visitor,
    maintenance,
    occupancyRate: Math.round(occupancyRate * 100) / 100,
  };
}

export function getSpacesByType(lotId: string): Record<string, { total: number; available: number }> {
  const spaces = Array.from(parkingSpaceStore.values()).filter(s => s.lotId === lotId);

  const result: Record<string, { total: number; available: number }> = {
    standard: { total: 0, available: 0 },
    compact: { total: 0, available: 0 },
    handicap: { total: 0, available: 0 },
    ev_charging: { total: 0, available: 0 },
    motorcycle: { total: 0, available: 0 },
    oversized: { total: 0, available: 0 },
  };

  for (const space of spaces) {
    const spaceType = space.type as string;
    if (!result[spaceType]) {
      result[spaceType] = { total: 0, available: 0 };
    }
    result[spaceType].total++;
    if (space.status === 'available') {
      result[spaceType].available++;
    }
  }

  return result;
}

export function findAvailableSpace(
  lotId: string,
  type?: string
): ParkingSpace | null {
  const spaces = Array.from(parkingSpaceStore.values()).filter(
    s => s.lotId === lotId && s.status === 'available' && (!type || s.type === type)
  );

  return spaces.length > 0 ? spaces[0] : null;
}

function toDate(val: Date | string): Date {
  return typeof val === 'string' ? new Date(val) : val;
}

export function isPermitValid(permitOrId: ParkingPermit | string): boolean {
  const permit = typeof permitOrId === 'string'
    ? parkingPermitStore.get(permitOrId)
    : permitOrId;

  if (!permit || permit.status !== 'active') return false;

  const now = new Date();
  return now >= toDate(permit.startDate) && now <= toDate(permit.endDate);
}

export function isGuestPassValid(passOrId: ParkingGuestPass | string): boolean {
  const pass = typeof passOrId === 'string'
    ? guestPassStore.get(passOrId)
    : passOrId;

  if (!pass) return false;

  const now = new Date();
  return now >= toDate(pass.validFrom) && now <= toDate(pass.validTo);
}

export function calculateViolationStats(
  propertyId: string,
  startDate?: string,
  endDate?: string
): {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  totalFines: number;
  collectedFines: number;
  outstandingFines: number;
  towedVehicles: number;
} {
  let violations = Array.from(violationStore.values()).filter(v => v.propertyId === propertyId);

  if (startDate) {
    violations = violations.filter(v => toDate(v.issuedAt) >= new Date(startDate));
  }
  if (endDate) {
    violations = violations.filter(v => toDate(v.issuedAt) <= new Date(endDate));
  }

  const byType: Record<string, number> = {
    no_permit: 0,
    wrong_space: 0,
    expired_permit: 0,
    blocking: 0,
    fire_lane: 0,
    handicap: 0,
    overnight: 0,
    abandoned: 0,
    other: 0,
  };

  const byStatus: Record<string, number> = {
    pending: 0,
    paid: 0,
    appealed: 0,
    dismissed: 0,
    collections: 0,
  };

  let totalFines = 0;
  let collectedFines = 0;
  let towedVehicles = 0;

  for (const v of violations) {
    byType[v.type as string] = (byType[v.type as string] || 0) + 1;
    byStatus[v.status as string] = (byStatus[v.status as string] || 0) + 1;
    totalFines += v.fineAmount || 0;
    if (v.status === 'paid') {
      collectedFines += v.paidAmount ?? v.fineAmount ?? 0;
    }
    if (v.vehicleTowed) {
      towedVehicles++;
    }
  }

  return {
    total: violations.length,
    byType,
    byStatus,
    totalFines,
    collectedFines,
    outstandingFines: totalFines - collectedFines,
    towedVehicles,
  };
}

export function calculateParkingRevenue(
  propertyId: string,
  startDate?: string,
  endDate?: string
): {
  permitRevenue: number;
  guestPassRevenue: number;
  fineRevenue: number;
  totalRevenue: number;
} {
  // Get permits for the property
  const permits = Array.from(parkingPermitStore.values()).filter(p => {
    const space = Array.from(parkingSpaceStore.values()).find(s => s.id === p.spaceId);
    if (!space) return false;
    const lot = parkingLotStore.get(space.lotId);
    return lot?.propertyId === propertyId;
  });

  let permitRevenue = 0;
  for (const permit of permits) {
    if (permit.monthlyRate) {
      permitRevenue += permit.monthlyRate;
    }
  }

  // Get paid fines
  const violations = Array.from(violationStore.values()).filter(
    v => v.propertyId === propertyId && v.status === 'paid'
  );

  const fineRevenue = violations.reduce((sum, v) => sum + (v.paidAmount ?? v.fineAmount ?? 0), 0);

  // Guest pass revenue (simplified)
  const guestPassRevenue = 0; // Would need guest pass pricing

  return {
    permitRevenue,
    guestPassRevenue,
    fineRevenue,
    totalRevenue: permitRevenue + guestPassRevenue + fineRevenue,
  };
}

export function getViolationFineAmount(type: string): number {
  const fines: Record<string, number> = {
    no_permit: 50,
    wrong_space: 35,
    expired_permit: 25,
    blocking: 75,
    fire_lane: 150,
    handicap: 250,
    overnight: 50,
    abandoned: 100,
    other: 50,
  };
  return fines[type] ?? 50;
}

// ============================================================================
// Async functions for production (use Prisma)
// ============================================================================

async function getLotOccupancyAsync(lotId: string): Promise<{
  total: number;
  available: number;
  assigned: number;
  reserved: number;
  visitor: number;
  maintenance: number;
  occupancyRate: number;
}> {
  const spaces = await prisma.parkingSpace.findMany({
    where: { lotId },
  });

  const total = spaces.length;
  const available = spaces.filter((s) => s.status === 'available').length;
  const assigned = spaces.filter((s) => s.status === 'assigned').length;
  const reserved = spaces.filter((s) => s.status === 'reserved').length;
  const visitor = spaces.filter((s) => s.status === 'visitor').length;
  const maintenance = spaces.filter((s) => s.status === 'maintenance').length;

  const occupancyRate = total > 0 ? ((total - available) / total) * 100 : 0;

  return {
    total,
    available,
    assigned,
    reserved,
    visitor,
    maintenance,
    occupancyRate: Math.round(occupancyRate * 100) / 100,
  };
}

async function getSpacesByTypeAsync(
  lotId: string
): Promise<Record<ParkingSpaceType, { total: number; available: number }>> {
  const spaces = await prisma.parkingSpace.findMany({
    where: { lotId },
  });

  const result: Record<ParkingSpaceType, { total: number; available: number }> = {
    standard: { total: 0, available: 0 },
    compact: { total: 0, available: 0 },
    handicap: { total: 0, available: 0 },
    ev_charging: { total: 0, available: 0 },
    motorcycle: { total: 0, available: 0 },
    oversized: { total: 0, available: 0 },
  };

  for (const space of spaces) {
    result[space.type].total++;
    if (space.status === 'available') {
      result[space.type].available++;
    }
  }

  return result;
}

async function findAvailableSpaceAsync(
  lotId: string,
  type?: ParkingSpaceType
): Promise<{ id: string; spaceNumber: string } | null> {
  const space = await prisma.parkingSpace.findFirst({
    where: {
      lotId,
      status: 'available',
      ...(type ? { type } : {}),
    },
    select: { id: true, spaceNumber: true },
  });

  return space;
}

async function isPermitValidAsync(permitId: string): Promise<boolean> {
  const permit = await prisma.parkingPermit.findUnique({
    where: { id: permitId },
  });

  if (!permit || permit.status !== 'active') return false;

  const now = new Date();
  return now >= permit.startDate && now <= permit.endDate;
}

export async function getActivePermitsForTenant(tenantId: string) {
  const now = new Date();
  return prisma.parkingPermit.findMany({
    where: {
      tenantId,
      status: 'active',
      startDate: { lte: now },
      endDate: { gte: now },
    },
  });
}

async function isGuestPassValidAsync(passId: string): Promise<boolean> {
  const pass = await prisma.parkingGuestPass.findUnique({
    where: { id: passId },
  });

  if (!pass) return false;

  const now = new Date();
  return now >= pass.validFrom && now <= pass.validTo;
}

export async function getActiveGuestPasses(propertyId: string) {
  const now = new Date();
  return prisma.parkingGuestPass.findMany({
    where: {
      propertyId,
      validFrom: { lte: now },
      validTo: { gte: now },
    },
  });
}

async function calculateViolationStatsAsync(
  propertyId: string,
  startDate?: string,
  endDate?: string
): Promise<{
  total: number;
  byType: Record<ParkingViolationType, number>;
  byStatus: Record<ParkingViolationStatus, number>;
  totalFines: number;
  collectedFines: number;
  outstandingFines: number;
  towedVehicles: number;
}> {
  const where: Record<string, unknown> = { propertyId };

  if (startDate || endDate) {
    where.issuedAt = {};
    if (startDate) (where.issuedAt as Record<string, Date>).gte = new Date(startDate);
    if (endDate) (where.issuedAt as Record<string, Date>).lte = new Date(endDate);
  }

  const violations = await prisma.parkingViolation.findMany({ where });

  const byType: Record<ParkingViolationType, number> = {
    no_permit: 0,
    wrong_space: 0,
    expired_permit: 0,
    blocking: 0,
    fire_lane: 0,
    handicap: 0,
    overnight: 0,
    abandoned: 0,
    other: 0,
  };

  const byStatus: Record<ParkingViolationStatus, number> = {
    issued: 0,
    warning: 0,
    fine_due: 0,
    paid: 0,
    appealed: 0,
    dismissed: 0,
    towed: 0,
  };

  let totalFines = 0;
  let collectedFines = 0;
  let towedVehicles = 0;

  for (const violation of violations) {
    byType[violation.violationType]++;
    byStatus[violation.status]++;
    totalFines += violation.fineAmount;

    if (violation.status === 'paid') {
      collectedFines += violation.fineAmount;
    }
    if (violation.status === 'towed') {
      towedVehicles++;
    }
  }

  return {
    total: violations.length,
    byType,
    byStatus,
    totalFines,
    collectedFines,
    outstandingFines: totalFines - collectedFines,
    towedVehicles,
  };
}

// getViolationFineAmount is defined earlier in the synchronous section

async function calculateParkingRevenueAsync(
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<{
  permitRevenue: number;
  violationRevenue: number;
  totalRevenue: number;
  permitCount: number;
}> {
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Calculate permit revenue
  const permits = await prisma.parkingPermit.findMany({
    where: {
      propertyId,
      startDate: { lte: end },
      endDate: { gte: start },
      status: { in: ['active', 'expired'] },
    },
  });

  let permitRevenue = 0;
  for (const permit of permits) {
    const permitStart = new Date(Math.max(permit.startDate.getTime(), start.getTime()));
    const permitEnd = new Date(Math.min(permit.endDate.getTime(), end.getTime()));
    const months = Math.ceil((permitEnd.getTime() - permitStart.getTime()) / (30 * 24 * 60 * 60 * 1000));
    permitRevenue += permit.monthlyFee * months;
  }

  // Calculate violation revenue
  const violations = await prisma.parkingViolation.findMany({
    where: {
      propertyId,
      status: 'paid',
      paidAt: {
        gte: start,
        lte: end,
      },
    },
  });

  const violationRevenue = violations.reduce((sum, v) => sum + v.fineAmount, 0);

  return {
    permitRevenue,
    violationRevenue,
    totalRevenue: permitRevenue + violationRevenue,
    permitCount: permits.length,
  };
}

// ============================================================================
// Routes
// ============================================================================

export async function parkingRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // Parking Lot Management
  // -------------------------------------------------------------------------

  // Create parking lot
  app.post('/lots', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      propertyId: z.string().uuid(),
      name: z.string(),
      totalSpaces: z.number().min(1),
      address: z.string(),
      operatingHours: z.object({
        start: z.string(),
        end: z.string(),
      }),
      isGated: z.boolean().default(false),
      gateCode: z.string().optional(),
      monthlyRate: z.number().min(0),
      visitorRate: z.number().min(0),
      evChargingRate: z.number().optional(),
    });

    const body = schema.parse(request.body);

    const lot = await prisma.parkingLot.create({
      data: {
        propertyId: body.propertyId,
        name: body.name,
        totalSpaces: body.totalSpaces,
        address: body.address,
        operatingHours: body.operatingHours,
        isGated: body.isGated,
        gateCode: body.gateCode,
        monthlyRate: body.monthlyRate,
        visitorRate: body.visitorRate,
        evChargingRate: body.evChargingRate,
      },
    });

    return reply.status(201).send(lot);
  });

  // Get parking lot
  app.get('/lots/:lotId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { lotId } = request.params as { lotId: string };
    const lot = await prisma.parkingLot.findUnique({
      where: { id: lotId },
    });

    if (!lot) {
      return reply.status(404).send({ error: 'Parking lot not found' });
    }

    const occupancy = await getLotOccupancy(lotId);
    const spacesByType = await getSpacesByType(lotId);

    return reply.send({ ...lot, occupancy, spacesByType });
  });

  // List parking lots for property
  app.get('/lots', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.query as { propertyId?: string };

    const lots = await prisma.parkingLot.findMany({
      where: propertyId ? { propertyId } : {},
    });

    const lotsWithOccupancy = await Promise.all(
      lots.map(async (lot) => ({
        ...lot,
        occupancy: await getLotOccupancy(lot.id),
      }))
    );

    return reply.send({ lots: lotsWithOccupancy });
  });

  // -------------------------------------------------------------------------
  // Parking Space Management
  // -------------------------------------------------------------------------

  // Create parking spaces (bulk)
  app.post('/spaces/bulk', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      lotId: z.string().uuid(),
      propertyId: z.string().uuid(),
      spaces: z.array(
        z.object({
          spaceNumber: z.string(),
          type: z.enum(['standard', 'compact', 'handicap', 'ev_charging', 'motorcycle', 'oversized']),
          level: z.string().optional(),
          section: z.string().optional(),
        })
      ),
    });

    const body = schema.parse(request.body);

    const created = await prisma.parkingSpace.createMany({
      data: body.spaces.map((spaceData) => ({
        lotId: body.lotId,
        propertyId: body.propertyId,
        spaceNumber: spaceData.spaceNumber,
        type: spaceData.type as ParkingSpaceType,
        status: 'available' as ParkingSpaceStatus,
        level: spaceData.level,
        section: spaceData.section,
      })),
    });

    const spaces = await prisma.parkingSpace.findMany({
      where: { lotId: body.lotId },
      orderBy: { createdAt: 'desc' },
      take: body.spaces.length,
    });

    return reply.status(201).send({ spaces, count: created.count });
  });

  // Get space
  app.get('/spaces/:spaceId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { spaceId } = request.params as { spaceId: string };
    const space = await prisma.parkingSpace.findUnique({
      where: { id: spaceId },
    });

    if (!space) {
      return reply.status(404).send({ error: 'Parking space not found' });
    }

    return reply.send(space);
  });

  // List spaces for lot
  app.get('/lots/:lotId/spaces', async (request: FastifyRequest, reply: FastifyReply) => {
    const { lotId } = request.params as { lotId: string };
    const querySchema = z.object({
      status: z.enum(['available', 'assigned', 'reserved', 'maintenance', 'visitor']).optional(),
      type: z.enum(['standard', 'compact', 'handicap', 'ev_charging', 'motorcycle', 'oversized']).optional(),
    });

    const query = querySchema.parse(request.query);

    const spaces = await prisma.parkingSpace.findMany({
      where: {
        lotId,
        ...(query.status ? { status: query.status as ParkingSpaceStatus } : {}),
        ...(query.type ? { type: query.type as ParkingSpaceType } : {}),
      },
    });

    return reply.send({ spaces, total: spaces.length });
  });

  // Assign space to tenant
  app.post('/spaces/:spaceId/assign', async (request: FastifyRequest, reply: FastifyReply) => {
    const { spaceId } = request.params as { spaceId: string };
    const schema = z.object({
      tenantId: z.string().uuid(),
      leaseId: z.string().uuid(),
      vehicleId: z.string().uuid(),
    });

    const body = schema.parse(request.body);
    const space = await prisma.parkingSpace.findUnique({
      where: { id: spaceId },
    });

    if (!space) {
      return reply.status(404).send({ error: 'Parking space not found' });
    }

    if (space.status !== 'available') {
      return reply.status(400).send({ error: 'Space is not available', currentStatus: space.status });
    }

    const updated = await prisma.parkingSpace.update({
      where: { id: spaceId },
      data: {
        status: 'assigned',
        assignedTo: body,
      },
    });

    return reply.send(updated);
  });

  // Release space
  app.post('/spaces/:spaceId/release', async (request: FastifyRequest, reply: FastifyReply) => {
    const { spaceId } = request.params as { spaceId: string };
    const space = await prisma.parkingSpace.findUnique({
      where: { id: spaceId },
    });

    if (!space) {
      return reply.status(404).send({ error: 'Parking space not found' });
    }

    const updated = await prisma.parkingSpace.update({
      where: { id: spaceId },
      data: {
        status: 'available',
        assignedTo: null,
      },
    });

    return reply.send(updated);
  });

  // Set space to maintenance
  app.post('/spaces/:spaceId/maintenance', async (request: FastifyRequest, reply: FastifyReply) => {
    const { spaceId } = request.params as { spaceId: string };
    const schema = z.object({
      notes: z.string().optional(),
    });

    const body = schema.parse(request.body);
    const space = await prisma.parkingSpace.findUnique({
      where: { id: spaceId },
    });

    if (!space) {
      return reply.status(404).send({ error: 'Parking space not found' });
    }

    const updated = await prisma.parkingSpace.update({
      where: { id: spaceId },
      data: {
        status: 'maintenance',
        notes: body.notes,
      },
    });

    return reply.send(updated);
  });

  // -------------------------------------------------------------------------
  // Vehicle Registration
  // -------------------------------------------------------------------------

  // Register vehicle
  app.post('/vehicles', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      tenantId: z.string().uuid(),
      type: z.enum(['car', 'truck', 'suv', 'motorcycle', 'van', 'rv', 'other']),
      make: z.string(),
      model: z.string(),
      year: z.number().min(1900).max(new Date().getFullYear() + 1),
      color: z.string(),
      licensePlate: z.string(),
      state: z.string().length(2),
      isPrimary: z.boolean().default(false),
      registrationExpiry: z.string().optional(),
      insuranceExpiry: z.string().optional(),
    });

    const body = schema.parse(request.body);

    // If this is primary, unset other primary vehicles for tenant
    if (body.isPrimary) {
      await prisma.parkingVehicle.updateMany({
        where: { tenantId: body.tenantId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const vehicle = await prisma.parkingVehicle.create({
      data: {
        tenantId: body.tenantId,
        type: body.type,
        make: body.make,
        model: body.model,
        year: body.year,
        color: body.color,
        licensePlate: body.licensePlate,
        state: body.state,
        isPrimary: body.isPrimary,
        registrationExpiry: body.registrationExpiry ? new Date(body.registrationExpiry) : null,
        insuranceExpiry: body.insuranceExpiry ? new Date(body.insuranceExpiry) : null,
      },
    });

    return reply.status(201).send(vehicle);
  });

  // Get vehicle
  app.get('/vehicles/:vehicleId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { vehicleId } = request.params as { vehicleId: string };
    const vehicle = await prisma.parkingVehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      return reply.status(404).send({ error: 'Vehicle not found' });
    }

    return reply.send(vehicle);
  });

  // List tenant vehicles
  app.get('/vehicles/tenant/:tenantId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = request.params as { tenantId: string };
    const vehicles = await prisma.parkingVehicle.findMany({
      where: { tenantId },
    });
    return reply.send({ vehicles });
  });

  // Update vehicle
  app.put('/vehicles/:vehicleId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { vehicleId } = request.params as { vehicleId: string };
    const schema = z.object({
      licensePlate: z.string().optional(),
      registrationExpiry: z.string().optional(),
      insuranceExpiry: z.string().optional(),
      color: z.string().optional(),
    });

    const body = schema.parse(request.body);
    const vehicle = await prisma.parkingVehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      return reply.status(404).send({ error: 'Vehicle not found' });
    }

    const updated = await prisma.parkingVehicle.update({
      where: { id: vehicleId },
      data: {
        licensePlate: body.licensePlate,
        registrationExpiry: body.registrationExpiry ? new Date(body.registrationExpiry) : undefined,
        insuranceExpiry: body.insuranceExpiry ? new Date(body.insuranceExpiry) : undefined,
        color: body.color,
      },
    });

    return reply.send(updated);
  });

  // Delete vehicle
  app.delete('/vehicles/:vehicleId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { vehicleId } = request.params as { vehicleId: string };

    const vehicle = await prisma.parkingVehicle.findUnique({
      where: { id: vehicleId },
    });

    if (!vehicle) {
      return reply.status(404).send({ error: 'Vehicle not found' });
    }

    // Check for active permits
    const now = new Date();
    const activePermits = await prisma.parkingPermit.findMany({
      where: {
        vehicleId,
        status: 'active',
        startDate: { lte: now },
        endDate: { gte: now },
      },
    });

    if (activePermits.length > 0) {
      return reply.status(400).send({
        error: 'Vehicle has active permits',
        permits: activePermits.map((p) => p.permitNumber),
      });
    }

    await prisma.parkingVehicle.delete({
      where: { id: vehicleId },
    });

    return reply.status(204).send();
  });

  // -------------------------------------------------------------------------
  // Parking Permits
  // -------------------------------------------------------------------------

  // Issue permit
  app.post('/permits', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      propertyId: z.string().uuid(),
      tenantId: z.string().uuid(),
      leaseId: z.string().uuid(),
      vehicleId: z.string().uuid(),
      spaceId: z.string().uuid().optional(),
      type: z.enum(['assigned', 'general', 'visitor', 'temporary']),
      startDate: z.string(),
      endDate: z.string(),
      monthlyFee: z.number().min(0),
    });

    const body = schema.parse(request.body);

    // Verify vehicle exists
    const vehicle = await prisma.parkingVehicle.findUnique({
      where: { id: body.vehicleId },
    });

    if (!vehicle) {
      return reply.status(404).send({ error: 'Vehicle not found' });
    }

    // If assigned type, verify and assign space
    if (body.type === 'assigned' && body.spaceId) {
      const space = await prisma.parkingSpace.findUnique({
        where: { id: body.spaceId },
      });

      if (!space) {
        return reply.status(404).send({ error: 'Parking space not found' });
      }
      if (space.status !== 'available') {
        return reply.status(400).send({ error: 'Space is not available' });
      }

      // Assign the space
      await prisma.parkingSpace.update({
        where: { id: body.spaceId },
        data: {
          status: 'assigned',
          assignedTo: {
            tenantId: body.tenantId,
            leaseId: body.leaseId,
            vehicleId: body.vehicleId,
          },
        },
      });
    }

    const permit = await prisma.parkingPermit.create({
      data: {
        propertyId: body.propertyId,
        tenantId: body.tenantId,
        leaseId: body.leaseId,
        vehicleId: body.vehicleId,
        spaceId: body.spaceId,
        permitNumber: generatePermitNumber(),
        type: body.type,
        status: 'active',
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        monthlyFee: body.monthlyFee,
        issuedAt: new Date(),
      },
    });

    return reply.status(201).send(permit);
  });

  // Get permit
  app.get('/permits/:permitId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { permitId } = request.params as { permitId: string };
    const permit = await prisma.parkingPermit.findUnique({
      where: { id: permitId },
      include: { vehicle: true },
    });

    if (!permit) {
      return reply.status(404).send({ error: 'Permit not found' });
    }

    const space = permit.spaceId
      ? await prisma.parkingSpace.findUnique({ where: { id: permit.spaceId } })
      : null;

    const now = new Date();
    const isValid = permit.status === 'active' && now >= permit.startDate && now <= permit.endDate;

    return reply.send({
      ...permit,
      isValid,
      space,
    });
  });

  // List permits
  app.get('/permits', async (request: FastifyRequest, reply: FastifyReply) => {
    const querySchema = z.object({
      propertyId: z.string().uuid().optional(),
      tenantId: z.string().uuid().optional(),
      status: z.enum(['active', 'expired', 'suspended', 'cancelled']).optional(),
    });

    const query = querySchema.parse(request.query);

    const permits = await prisma.parkingPermit.findMany({
      where: {
        ...(query.propertyId ? { propertyId: query.propertyId } : {}),
        ...(query.tenantId ? { tenantId: query.tenantId } : {}),
        ...(query.status ? { status: query.status as ParkingPermitStatus } : {}),
      },
    });

    return reply.send({ permits, total: permits.length });
  });

  // Suspend permit
  app.post('/permits/:permitId/suspend', async (request: FastifyRequest, reply: FastifyReply) => {
    const { permitId } = request.params as { permitId: string };
    const schema = z.object({
      reason: z.string(),
    });

    const body = schema.parse(request.body);
    const permit = await prisma.parkingPermit.findUnique({
      where: { id: permitId },
    });

    if (!permit) {
      return reply.status(404).send({ error: 'Permit not found' });
    }

    const updated = await prisma.parkingPermit.update({
      where: { id: permitId },
      data: {
        status: 'suspended',
        suspendedAt: new Date(),
        suspendedReason: body.reason,
      },
    });

    return reply.send(updated);
  });

  // Reactivate permit
  app.post('/permits/:permitId/reactivate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { permitId } = request.params as { permitId: string };
    const permit = await prisma.parkingPermit.findUnique({
      where: { id: permitId },
    });

    if (!permit) {
      return reply.status(404).send({ error: 'Permit not found' });
    }

    if (permit.status !== 'suspended') {
      return reply.status(400).send({ error: 'Permit is not suspended' });
    }

    const updated = await prisma.parkingPermit.update({
      where: { id: permitId },
      data: {
        status: 'active',
        suspendedAt: null,
        suspendedReason: null,
      },
    });

    return reply.send(updated);
  });

  // Cancel permit
  app.post('/permits/:permitId/cancel', async (request: FastifyRequest, reply: FastifyReply) => {
    const { permitId } = request.params as { permitId: string };
    const permit = await prisma.parkingPermit.findUnique({
      where: { id: permitId },
    });

    if (!permit) {
      return reply.status(404).send({ error: 'Permit not found' });
    }

    // Release assigned space if applicable
    if (permit.spaceId) {
      const space = await prisma.parkingSpace.findUnique({
        where: { id: permit.spaceId },
      });

      if (space && space.status === 'assigned') {
        await prisma.parkingSpace.update({
          where: { id: permit.spaceId },
          data: {
            status: 'available',
            assignedTo: null,
          },
        });
      }
    }

    const updated = await prisma.parkingPermit.update({
      where: { id: permitId },
      data: { status: 'cancelled' },
    });

    return reply.send(updated);
  });

  // -------------------------------------------------------------------------
  // Guest Passes
  // -------------------------------------------------------------------------

  // Create guest pass
  app.post('/guest-passes', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      propertyId: z.string().uuid(),
      tenantId: z.string().uuid(),
      guestName: z.string(),
      vehicleLicensePlate: z.string(),
      vehicleMake: z.string().optional(),
      vehicleModel: z.string().optional(),
      vehicleColor: z.string().optional(),
      validFrom: z.string(),
      validTo: z.string(),
      notes: z.string().optional(),
    });

    const body = schema.parse(request.body);

    const pass = await prisma.parkingGuestPass.create({
      data: {
        propertyId: body.propertyId,
        tenantId: body.tenantId,
        guestName: body.guestName,
        vehicleLicensePlate: body.vehicleLicensePlate,
        vehicleMake: body.vehicleMake,
        vehicleModel: body.vehicleModel,
        vehicleColor: body.vehicleColor,
        passCode: generatePassCode(),
        validFrom: new Date(body.validFrom),
        validTo: new Date(body.validTo),
        isUsed: false,
        notes: body.notes,
      },
    });

    return reply.status(201).send(pass);
  });

  // Get guest pass
  app.get('/guest-passes/:passId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { passId } = request.params as { passId: string };
    const pass = await prisma.parkingGuestPass.findUnique({
      where: { id: passId },
    });

    if (!pass) {
      return reply.status(404).send({ error: 'Guest pass not found' });
    }

    const now = new Date();
    const isValid = now >= pass.validFrom && now <= pass.validTo;

    return reply.send({ ...pass, isValid });
  });

  // Validate guest pass by code
  app.get('/guest-passes/validate/:passCode', async (request: FastifyRequest, reply: FastifyReply) => {
    const { passCode } = request.params as { passCode: string };
    const pass = await prisma.parkingGuestPass.findFirst({
      where: {
        passCode: { equals: passCode, mode: 'insensitive' },
      },
    });

    if (!pass) {
      return reply.status(404).send({ error: 'Guest pass not found' });
    }

    const now = new Date();
    const isValid = now >= pass.validFrom && now <= pass.validTo;

    return reply.send({
      ...pass,
      isValid,
      reason: !isValid ? 'Pass has expired' : undefined,
    });
  });

  // Mark guest pass as used
  app.post('/guest-passes/:passId/use', async (request: FastifyRequest, reply: FastifyReply) => {
    const { passId } = request.params as { passId: string };
    const schema = z.object({
      spaceId: z.string().uuid().optional(),
    });

    const body = schema.parse(request.body);
    const pass = await prisma.parkingGuestPass.findUnique({
      where: { id: passId },
    });

    if (!pass) {
      return reply.status(404).send({ error: 'Guest pass not found' });
    }

    const now = new Date();
    if (now < pass.validFrom || now > pass.validTo) {
      return reply.status(400).send({ error: 'Guest pass is not valid' });
    }

    const updated = await prisma.parkingGuestPass.update({
      where: { id: passId },
      data: {
        isUsed: true,
        usedAt: new Date(),
        spaceId: body.spaceId,
      },
    });

    return reply.send(updated);
  });

  // List guest passes
  app.get('/guest-passes', async (request: FastifyRequest, reply: FastifyReply) => {
    const querySchema = z.object({
      propertyId: z.string().uuid().optional(),
      tenantId: z.string().uuid().optional(),
      active: z
        .string()
        .transform((v) => v === 'true')
        .optional(),
    });

    const query = querySchema.parse(request.query);
    const now = new Date();

    const passes = await prisma.parkingGuestPass.findMany({
      where: {
        ...(query.propertyId ? { propertyId: query.propertyId } : {}),
        ...(query.tenantId ? { tenantId: query.tenantId } : {}),
        ...(query.active
          ? {
              validFrom: { lte: now },
              validTo: { gte: now },
            }
          : {}),
      },
    });

    return reply.send({ passes, total: passes.length });
  });

  // -------------------------------------------------------------------------
  // Parking Violations
  // -------------------------------------------------------------------------

  // Issue violation
  app.post('/violations', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      propertyId: z.string().uuid(),
      lotId: z.string().uuid().optional(),
      spaceId: z.string().uuid().optional(),
      licensePlate: z.string(),
      vehicleDescription: z.string().optional(),
      violationType: z.enum([
        'no_permit',
        'wrong_space',
        'expired_permit',
        'blocking',
        'fire_lane',
        'handicap',
        'overnight',
        'abandoned',
        'other',
      ]),
      description: z.string(),
      issuedBy: z.string().uuid(),
      fineAmount: z.number().optional(),
      isWarning: z.boolean().default(false),
      photoUrls: z.array(z.string()).optional(),
      notes: z.string().optional(),
    });

    const body = schema.parse(request.body);
    const now = new Date();

    // Calculate fine amount if not provided
    const fineAmount = body.fineAmount ?? getViolationFineAmount(body.violationType as ParkingViolationType);

    // Set due date to 30 days from now
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const violation = await prisma.parkingViolation.create({
      data: {
        propertyId: body.propertyId,
        lotId: body.lotId,
        spaceId: body.spaceId,
        licensePlate: body.licensePlate,
        vehicleDescription: body.vehicleDescription,
        violationType: body.violationType as ParkingViolationType,
        status: body.isWarning ? 'warning' : 'issued',
        description: body.description,
        issuedAt: now,
        issuedBy: body.issuedBy,
        fineAmount: body.isWarning ? 0 : fineAmount,
        dueDate,
        photoUrls: body.photoUrls || [],
        notes: body.notes,
      },
    });

    return reply.status(201).send(violation);
  });

  // Get violation
  app.get('/violations/:violationId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { violationId } = request.params as { violationId: string };
    const violation = await prisma.parkingViolation.findUnique({
      where: { id: violationId },
    });

    if (!violation) {
      return reply.status(404).send({ error: 'Violation not found' });
    }

    return reply.send(violation);
  });

  // List violations
  app.get('/violations', async (request: FastifyRequest, reply: FastifyReply) => {
    const querySchema = z.object({
      propertyId: z.string().uuid().optional(),
      licensePlate: z.string().optional(),
      status: z.enum(['issued', 'warning', 'fine_due', 'paid', 'appealed', 'dismissed', 'towed']).optional(),
      violationType: z
        .enum([
          'no_permit',
          'wrong_space',
          'expired_permit',
          'blocking',
          'fire_lane',
          'handicap',
          'overnight',
          'abandoned',
          'other',
        ])
        .optional(),
    });

    const query = querySchema.parse(request.query);

    const violations = await prisma.parkingViolation.findMany({
      where: {
        ...(query.propertyId ? { propertyId: query.propertyId } : {}),
        ...(query.licensePlate ? { licensePlate: { equals: query.licensePlate, mode: 'insensitive' } } : {}),
        ...(query.status ? { status: query.status as ParkingViolationStatus } : {}),
        ...(query.violationType ? { violationType: query.violationType as ParkingViolationType } : {}),
      },
    });

    return reply.send({ violations, total: violations.length });
  });

  // Pay violation fine
  app.post('/violations/:violationId/pay', async (request: FastifyRequest, reply: FastifyReply) => {
    const { violationId } = request.params as { violationId: string };
    const violation = await prisma.parkingViolation.findUnique({
      where: { id: violationId },
    });

    if (!violation) {
      return reply.status(404).send({ error: 'Violation not found' });
    }

    if (violation.status === 'paid') {
      return reply.status(400).send({ error: 'Violation already paid' });
    }

    if (violation.status === 'warning' || violation.status === 'dismissed') {
      return reply.status(400).send({ error: 'No fine due for this violation' });
    }

    const updated = await prisma.parkingViolation.update({
      where: { id: violationId },
      data: {
        status: 'paid',
        paidAt: new Date(),
      },
    });

    return reply.send(updated);
  });

  // Appeal violation
  app.post('/violations/:violationId/appeal', async (request: FastifyRequest, reply: FastifyReply) => {
    const { violationId } = request.params as { violationId: string };
    const schema = z.object({
      reason: z.string(),
    });

    const body = schema.parse(request.body);
    const violation = await prisma.parkingViolation.findUnique({
      where: { id: violationId },
    });

    if (!violation) {
      return reply.status(404).send({ error: 'Violation not found' });
    }

    if (violation.status === 'paid' || violation.status === 'dismissed') {
      return reply.status(400).send({ error: 'Cannot appeal this violation' });
    }

    const updated = await prisma.parkingViolation.update({
      where: { id: violationId },
      data: {
        status: 'appealed',
        appealedAt: new Date(),
        appealReason: body.reason,
        appealStatus: 'pending',
      },
    });

    return reply.send(updated);
  });

  // Process appeal
  app.post('/violations/:violationId/appeal/process', async (request: FastifyRequest, reply: FastifyReply) => {
    const { violationId } = request.params as { violationId: string };
    const schema = z.object({
      approved: z.boolean(),
      decision: z.string(),
    });

    const body = schema.parse(request.body);
    const violation = await prisma.parkingViolation.findUnique({
      where: { id: violationId },
    });

    if (!violation) {
      return reply.status(404).send({ error: 'Violation not found' });
    }

    if (violation.status !== 'appealed') {
      return reply.status(400).send({ error: 'Violation is not under appeal' });
    }

    const updated = await prisma.parkingViolation.update({
      where: { id: violationId },
      data: {
        status: body.approved ? 'dismissed' : 'fine_due',
        appealStatus: body.approved ? 'approved' : 'denied',
        appealDecision: body.decision,
      },
    });

    return reply.send(updated);
  });

  // -------------------------------------------------------------------------
  // Towing
  // -------------------------------------------------------------------------

  // Initiate tow
  app.post('/violations/:violationId/tow', async (request: FastifyRequest, reply: FastifyReply) => {
    const { violationId } = request.params as { violationId: string };
    const schema = z.object({
      towCompany: z.string(),
      towCompanyPhone: z.string(),
      towDriver: z.string(),
      towLocation: z.string(),
      storageRate: z.number().min(0),
    });

    const body = schema.parse(request.body);
    const violation = await prisma.parkingViolation.findUnique({
      where: { id: violationId },
    });

    if (!violation) {
      return reply.status(404).send({ error: 'Violation not found' });
    }

    const now = new Date();
    const referenceNumber = `TOW-${Date.now().toString(36).toUpperCase()}`;

    // Update violation status
    const updatedViolation = await prisma.parkingViolation.update({
      where: { id: violationId },
      data: {
        status: 'towed',
        towedAt: now,
        towCompany: body.towCompany,
        towReferenceNumber: referenceNumber,
      },
    });

    // Create tow record
    const towRecord = await prisma.towRecord.create({
      data: {
        violationId,
        propertyId: violation.propertyId,
        licensePlate: violation.licensePlate,
        vehicleDescription: violation.vehicleDescription || 'Unknown',
        towCompany: body.towCompany,
        towCompanyPhone: body.towCompanyPhone,
        towDriver: body.towDriver,
        referenceNumber,
        towedAt: now,
        towLocation: body.towLocation,
        storageRate: body.storageRate,
      },
    });

    return reply.status(201).send({ violation: updatedViolation, towRecord });
  });

  // Record vehicle retrieval
  app.post('/tow/:towId/retrieve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { towId } = request.params as { towId: string };
    const schema = z.object({
      retrievedBy: z.string(),
      totalCharges: z.number().min(0),
    });

    const body = schema.parse(request.body);
    const record = await prisma.towRecord.findUnique({
      where: { id: towId },
    });

    if (!record) {
      return reply.status(404).send({ error: 'Tow record not found' });
    }

    const updated = await prisma.towRecord.update({
      where: { id: towId },
      data: {
        retrievedAt: new Date(),
        retrievedBy: body.retrievedBy,
        totalCharges: body.totalCharges,
      },
    });

    return reply.send(updated);
  });

  // List tow records
  app.get('/tow', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.query as { propertyId?: string };

    const records = await prisma.towRecord.findMany({
      where: propertyId ? { propertyId } : {},
    });

    return reply.send({ records, total: records.length });
  });

  // -------------------------------------------------------------------------
  // Reports
  // -------------------------------------------------------------------------

  // Violation stats
  app.get('/reports/violations/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const querySchema = z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    });

    const query = querySchema.parse(request.query);
    const stats = await calculateViolationStats(propertyId, query.startDate, query.endDate);

    return reply.send(stats);
  });

  // Revenue report
  app.get('/reports/revenue/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const querySchema = z.object({
      startDate: z.string(),
      endDate: z.string(),
    });

    const query = querySchema.parse(request.query);
    const revenue = await calculateParkingRevenue(propertyId, query.startDate, query.endDate);

    return reply.send(revenue);
  });

  // Occupancy report
  app.get('/reports/occupancy/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const lots = await prisma.parkingLot.findMany({
      where: { propertyId },
    });

    const report = await Promise.all(
      lots.map(async (lot) => ({
        lotId: lot.id,
        lotName: lot.name,
        ...(await getLotOccupancy(lot.id)),
        spacesByType: await getSpacesByType(lot.id),
      }))
    );

    const totals = report.reduce(
      (acc, lot) => ({
        totalSpaces: acc.totalSpaces + lot.total,
        availableSpaces: acc.availableSpaces + lot.available,
        assignedSpaces: acc.assignedSpaces + lot.assigned,
      }),
      { totalSpaces: 0, availableSpaces: 0, assignedSpaces: 0 }
    );

    return reply.send({
      lots: report,
      totals,
      overallOccupancyRate:
        totals.totalSpaces > 0
          ? Math.round(((totals.totalSpaces - totals.availableSpaces) / totals.totalSpaces) * 10000) / 100
          : 0,
    });
  });
}
