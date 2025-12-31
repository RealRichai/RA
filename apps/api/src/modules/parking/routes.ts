import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export type SpaceType = 'standard' | 'compact' | 'handicap' | 'ev_charging' | 'motorcycle' | 'oversized';
export type SpaceStatus = 'available' | 'assigned' | 'reserved' | 'maintenance' | 'visitor';
export type PermitStatus = 'active' | 'expired' | 'suspended' | 'cancelled';
export type ViolationType =
  | 'no_permit'
  | 'wrong_space'
  | 'expired_permit'
  | 'blocking'
  | 'fire_lane'
  | 'handicap'
  | 'overnight'
  | 'abandoned'
  | 'other';
export type ViolationStatus = 'issued' | 'warning' | 'fine_due' | 'paid' | 'appealed' | 'dismissed' | 'towed';
export type VehicleType = 'car' | 'truck' | 'suv' | 'motorcycle' | 'van' | 'rv' | 'other';

export interface ParkingLot {
  id: string;
  propertyId: string;
  name: string;
  totalSpaces: number;
  address: string;
  operatingHours: {
    start: string;
    end: string;
  };
  isGated: boolean;
  gateCode?: string;
  monthlyRate: number;
  visitorRate: number; // per hour
  evChargingRate?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ParkingSpace {
  id: string;
  lotId: string;
  propertyId: string;
  spaceNumber: string;
  type: SpaceType;
  status: SpaceStatus;
  level?: string;
  section?: string;
  assignedTo?: {
    tenantId: string;
    leaseId: string;
    vehicleId: string;
  };
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Vehicle {
  id: string;
  tenantId: string;
  type: VehicleType;
  make: string;
  model: string;
  year: number;
  color: string;
  licensePlate: string;
  state: string;
  isPrimary: boolean;
  registrationExpiry?: string;
  insuranceExpiry?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ParkingPermit {
  id: string;
  propertyId: string;
  tenantId: string;
  leaseId: string;
  vehicleId: string;
  spaceId?: string;
  permitNumber: string;
  type: 'assigned' | 'general' | 'visitor' | 'temporary';
  status: PermitStatus;
  startDate: string;
  endDate: string;
  monthlyFee: number;
  issuedAt: string;
  suspendedAt?: string;
  suspendedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GuestPass {
  id: string;
  propertyId: string;
  tenantId: string;
  guestName: string;
  vehicleLicensePlate: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  passCode: string;
  validFrom: string;
  validTo: string;
  isUsed: boolean;
  usedAt?: string;
  spaceId?: string;
  notes?: string;
  createdAt: string;
}

export interface ParkingViolation {
  id: string;
  propertyId: string;
  lotId?: string;
  spaceId?: string;
  licensePlate: string;
  vehicleDescription?: string;
  violationType: ViolationType;
  status: ViolationStatus;
  description: string;
  issuedAt: string;
  issuedBy: string;
  fineAmount: number;
  dueDate: string;
  paidAt?: string;
  appealedAt?: string;
  appealReason?: string;
  appealStatus?: 'pending' | 'approved' | 'denied';
  appealDecision?: string;
  towedAt?: string;
  towCompany?: string;
  towReferenceNumber?: string;
  photoUrls?: string[];
  notes?: string;
  createdAt: string;
}

export interface TowRecord {
  id: string;
  violationId: string;
  propertyId: string;
  licensePlate: string;
  vehicleDescription: string;
  towCompany: string;
  towCompanyPhone: string;
  towDriver: string;
  referenceNumber: string;
  towedAt: string;
  towLocation: string;
  storageRate: number;
  retrievedAt?: string;
  retrievedBy?: string;
  totalCharges?: number;
  createdAt: string;
}

// ============================================================================
// In-Memory Storage (placeholder for Prisma)
// ============================================================================

export const parkingLots = new Map<string, ParkingLot>();
export const parkingSpaces = new Map<string, ParkingSpace>();
export const vehicles = new Map<string, Vehicle>();
export const parkingPermits = new Map<string, ParkingPermit>();
export const guestPasses = new Map<string, GuestPass>();
export const parkingViolations = new Map<string, ParkingViolation>();
export const towRecords = new Map<string, TowRecord>();

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

export function getLotOccupancy(lotId: string): {
  total: number;
  available: number;
  assigned: number;
  reserved: number;
  visitor: number;
  maintenance: number;
  occupancyRate: number;
} {
  const spaces = Array.from(parkingSpaces.values()).filter((s) => s.lotId === lotId);

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

export function getSpacesByType(lotId: string): Record<SpaceType, { total: number; available: number }> {
  const spaces = Array.from(parkingSpaces.values()).filter((s) => s.lotId === lotId);

  const result: Record<SpaceType, { total: number; available: number }> = {
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

export function findAvailableSpace(lotId: string, type?: SpaceType): ParkingSpace | null {
  const spaces = Array.from(parkingSpaces.values()).filter(
    (s) => s.lotId === lotId && s.status === 'available' && (!type || s.type === type)
  );

  return spaces[0] || null;
}

export function isPermitValid(permit: ParkingPermit): boolean {
  if (permit.status !== 'active') return false;

  const now = new Date();
  const startDate = new Date(permit.startDate);
  const endDate = new Date(permit.endDate);

  return now >= startDate && now <= endDate;
}

export function getActivePermitsForTenant(tenantId: string): ParkingPermit[] {
  return Array.from(parkingPermits.values()).filter((p) => p.tenantId === tenantId && isPermitValid(p));
}

export function isGuestPassValid(pass: GuestPass): boolean {
  const now = new Date();
  const validFrom = new Date(pass.validFrom);
  const validTo = new Date(pass.validTo);

  return now >= validFrom && now <= validTo;
}

export function getActiveGuestPasses(propertyId: string): GuestPass[] {
  return Array.from(guestPasses.values()).filter((p) => p.propertyId === propertyId && isGuestPassValid(p));
}

export function calculateViolationStats(
  propertyId: string,
  startDate?: string,
  endDate?: string
): {
  total: number;
  byType: Record<ViolationType, number>;
  byStatus: Record<ViolationStatus, number>;
  totalFines: number;
  collectedFines: number;
  outstandingFines: number;
  towedVehicles: number;
} {
  let violations = Array.from(parkingViolations.values()).filter((v) => v.propertyId === propertyId);

  if (startDate) {
    violations = violations.filter((v) => new Date(v.issuedAt) >= new Date(startDate));
  }
  if (endDate) {
    violations = violations.filter((v) => new Date(v.issuedAt) <= new Date(endDate));
  }

  const byType: Record<ViolationType, number> = {
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

  const byStatus: Record<ViolationStatus, number> = {
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

export function getViolationFineAmount(violationType: ViolationType): number {
  const fineSchedule: Record<ViolationType, number> = {
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

  return fineSchedule[violationType];
}

export function calculateParkingRevenue(
  propertyId: string,
  startDate: string,
  endDate: string
): {
  permitRevenue: number;
  violationRevenue: number;
  totalRevenue: number;
  permitCount: number;
} {
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Calculate permit revenue
  const permits = Array.from(parkingPermits.values()).filter((p) => {
    const permitStart = new Date(p.startDate);
    const permitEnd = new Date(p.endDate);
    return (
      p.propertyId === propertyId &&
      permitStart <= end &&
      permitEnd >= start &&
      (p.status === 'active' || p.status === 'expired')
    );
  });

  let permitRevenue = 0;
  for (const permit of permits) {
    // Calculate months active in the period
    const permitStart = new Date(Math.max(new Date(permit.startDate).getTime(), start.getTime()));
    const permitEnd = new Date(Math.min(new Date(permit.endDate).getTime(), end.getTime()));
    const months = Math.ceil(
      (permitEnd.getTime() - permitStart.getTime()) / (30 * 24 * 60 * 60 * 1000)
    );
    permitRevenue += permit.monthlyFee * months;
  }

  // Calculate violation revenue
  const violations = Array.from(parkingViolations.values()).filter(
    (v) =>
      v.propertyId === propertyId &&
      v.status === 'paid' &&
      v.paidAt &&
      new Date(v.paidAt) >= start &&
      new Date(v.paidAt) <= end
  );

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
      propertyId: z.string(),
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
    const now = new Date().toISOString();

    const lot: ParkingLot = {
      id: `lot_${Date.now()}`,
      ...body,
      createdAt: now,
      updatedAt: now,
    };

    parkingLots.set(lot.id, lot);
    return reply.status(201).send(lot);
  });

  // Get parking lot
  app.get('/lots/:lotId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { lotId } = request.params as { lotId: string };
    const lot = parkingLots.get(lotId);

    if (!lot) {
      return reply.status(404).send({ error: 'Parking lot not found' });
    }

    const occupancy = getLotOccupancy(lotId);
    const spacesByType = getSpacesByType(lotId);

    return reply.send({ ...lot, occupancy, spacesByType });
  });

  // List parking lots for property
  app.get('/lots', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.query as { propertyId?: string };
    let lots = Array.from(parkingLots.values());

    if (propertyId) {
      lots = lots.filter((l) => l.propertyId === propertyId);
    }

    const lotsWithOccupancy = lots.map((lot) => ({
      ...lot,
      occupancy: getLotOccupancy(lot.id),
    }));

    return reply.send({ lots: lotsWithOccupancy });
  });

  // -------------------------------------------------------------------------
  // Parking Space Management
  // -------------------------------------------------------------------------

  // Create parking spaces (bulk)
  app.post('/spaces/bulk', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      lotId: z.string(),
      propertyId: z.string(),
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
    const now = new Date().toISOString();

    const created: ParkingSpace[] = [];
    for (const spaceData of body.spaces) {
      const space: ParkingSpace = {
        id: `space_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        lotId: body.lotId,
        propertyId: body.propertyId,
        ...spaceData,
        status: 'available',
        createdAt: now,
        updatedAt: now,
      };
      parkingSpaces.set(space.id, space);
      created.push(space);
    }

    return reply.status(201).send({ spaces: created, count: created.length });
  });

  // Get space
  app.get('/spaces/:spaceId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { spaceId } = request.params as { spaceId: string };
    const space = parkingSpaces.get(spaceId);

    if (!space) {
      return reply.status(404).send({ error: 'Parking space not found' });
    }

    return reply.send(space);
  });

  // List spaces for lot
  app.get('/lots/:lotId/spaces', async (request: FastifyRequest, reply: FastifyReply) => {
    const { lotId } = request.params as { lotId: string };
    const schema = z.object({
      status: z.enum(['available', 'assigned', 'reserved', 'maintenance', 'visitor']).optional(),
      type: z.enum(['standard', 'compact', 'handicap', 'ev_charging', 'motorcycle', 'oversized']).optional(),
    });

    const query = schema.parse(request.query);
    let spaces = Array.from(parkingSpaces.values()).filter((s) => s.lotId === lotId);

    if (query.status) {
      spaces = spaces.filter((s) => s.status === query.status);
    }
    if (query.type) {
      spaces = spaces.filter((s) => s.type === query.type);
    }

    return reply.send({ spaces, total: spaces.length });
  });

  // Assign space to tenant
  app.post('/spaces/:spaceId/assign', async (request: FastifyRequest, reply: FastifyReply) => {
    const { spaceId } = request.params as { spaceId: string };
    const schema = z.object({
      tenantId: z.string(),
      leaseId: z.string(),
      vehicleId: z.string(),
    });

    const body = schema.parse(request.body);
    const space = parkingSpaces.get(spaceId);

    if (!space) {
      return reply.status(404).send({ error: 'Parking space not found' });
    }

    if (space.status !== 'available') {
      return reply.status(400).send({ error: 'Space is not available', currentStatus: space.status });
    }

    const updated: ParkingSpace = {
      ...space,
      status: 'assigned',
      assignedTo: body,
      updatedAt: new Date().toISOString(),
    };

    parkingSpaces.set(spaceId, updated);
    return reply.send(updated);
  });

  // Release space
  app.post('/spaces/:spaceId/release', async (request: FastifyRequest, reply: FastifyReply) => {
    const { spaceId } = request.params as { spaceId: string };
    const space = parkingSpaces.get(spaceId);

    if (!space) {
      return reply.status(404).send({ error: 'Parking space not found' });
    }

    const updated: ParkingSpace = {
      ...space,
      status: 'available',
      assignedTo: undefined,
      updatedAt: new Date().toISOString(),
    };

    parkingSpaces.set(spaceId, updated);
    return reply.send(updated);
  });

  // Set space to maintenance
  app.post('/spaces/:spaceId/maintenance', async (request: FastifyRequest, reply: FastifyReply) => {
    const { spaceId } = request.params as { spaceId: string };
    const schema = z.object({
      notes: z.string().optional(),
    });

    const body = schema.parse(request.body);
    const space = parkingSpaces.get(spaceId);

    if (!space) {
      return reply.status(404).send({ error: 'Parking space not found' });
    }

    const updated: ParkingSpace = {
      ...space,
      status: 'maintenance',
      notes: body.notes,
      updatedAt: new Date().toISOString(),
    };

    parkingSpaces.set(spaceId, updated);
    return reply.send(updated);
  });

  // -------------------------------------------------------------------------
  // Vehicle Registration
  // -------------------------------------------------------------------------

  // Register vehicle
  app.post('/vehicles', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      tenantId: z.string(),
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
    const now = new Date().toISOString();

    // If this is primary, unset other primary vehicles for tenant
    if (body.isPrimary) {
      const tenantVehicles = Array.from(vehicles.values()).filter((v) => v.tenantId === body.tenantId);
      for (const v of tenantVehicles) {
        if (v.isPrimary) {
          vehicles.set(v.id, { ...v, isPrimary: false, updatedAt: now });
        }
      }
    }

    const vehicle: Vehicle = {
      id: `vehicle_${Date.now()}`,
      ...body,
      createdAt: now,
      updatedAt: now,
    };

    vehicles.set(vehicle.id, vehicle);
    return reply.status(201).send(vehicle);
  });

  // Get vehicle
  app.get('/vehicles/:vehicleId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { vehicleId } = request.params as { vehicleId: string };
    const vehicle = vehicles.get(vehicleId);

    if (!vehicle) {
      return reply.status(404).send({ error: 'Vehicle not found' });
    }

    return reply.send(vehicle);
  });

  // List tenant vehicles
  app.get('/vehicles/tenant/:tenantId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { tenantId } = request.params as { tenantId: string };
    const tenantVehicles = Array.from(vehicles.values()).filter((v) => v.tenantId === tenantId);
    return reply.send({ vehicles: tenantVehicles });
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
    const vehicle = vehicles.get(vehicleId);

    if (!vehicle) {
      return reply.status(404).send({ error: 'Vehicle not found' });
    }

    const updated: Vehicle = {
      ...vehicle,
      ...body,
      updatedAt: new Date().toISOString(),
    };

    vehicles.set(vehicleId, updated);
    return reply.send(updated);
  });

  // Delete vehicle
  app.delete('/vehicles/:vehicleId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { vehicleId } = request.params as { vehicleId: string };

    if (!vehicles.has(vehicleId)) {
      return reply.status(404).send({ error: 'Vehicle not found' });
    }

    // Check for active permits
    const activePermits = Array.from(parkingPermits.values()).filter(
      (p) => p.vehicleId === vehicleId && isPermitValid(p)
    );

    if (activePermits.length > 0) {
      return reply.status(400).send({
        error: 'Vehicle has active permits',
        permits: activePermits.map((p) => p.permitNumber),
      });
    }

    vehicles.delete(vehicleId);
    return reply.status(204).send();
  });

  // -------------------------------------------------------------------------
  // Parking Permits
  // -------------------------------------------------------------------------

  // Issue permit
  app.post('/permits', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      propertyId: z.string(),
      tenantId: z.string(),
      leaseId: z.string(),
      vehicleId: z.string(),
      spaceId: z.string().optional(),
      type: z.enum(['assigned', 'general', 'visitor', 'temporary']),
      startDate: z.string(),
      endDate: z.string(),
      monthlyFee: z.number().min(0),
    });

    const body = schema.parse(request.body);
    const now = new Date().toISOString();

    // Verify vehicle exists
    if (!vehicles.has(body.vehicleId)) {
      return reply.status(404).send({ error: 'Vehicle not found' });
    }

    // If assigned type, verify and assign space
    if (body.type === 'assigned' && body.spaceId) {
      const space = parkingSpaces.get(body.spaceId);
      if (!space) {
        return reply.status(404).send({ error: 'Parking space not found' });
      }
      if (space.status !== 'available') {
        return reply.status(400).send({ error: 'Space is not available' });
      }

      // Assign the space
      const updatedSpace: ParkingSpace = {
        ...space,
        status: 'assigned',
        assignedTo: {
          tenantId: body.tenantId,
          leaseId: body.leaseId,
          vehicleId: body.vehicleId,
        },
        updatedAt: now,
      };
      parkingSpaces.set(body.spaceId, updatedSpace);
    }

    const permit: ParkingPermit = {
      id: `permit_${Date.now()}`,
      ...body,
      permitNumber: generatePermitNumber(),
      status: 'active',
      issuedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    parkingPermits.set(permit.id, permit);
    return reply.status(201).send(permit);
  });

  // Get permit
  app.get('/permits/:permitId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { permitId } = request.params as { permitId: string };
    const permit = parkingPermits.get(permitId);

    if (!permit) {
      return reply.status(404).send({ error: 'Permit not found' });
    }

    const vehicle = vehicles.get(permit.vehicleId);
    const space = permit.spaceId ? parkingSpaces.get(permit.spaceId) : null;

    return reply.send({
      ...permit,
      isValid: isPermitValid(permit),
      vehicle,
      space,
    });
  });

  // List permits
  app.get('/permits', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      propertyId: z.string().optional(),
      tenantId: z.string().optional(),
      status: z.enum(['active', 'expired', 'suspended', 'cancelled']).optional(),
    });

    const query = schema.parse(request.query);
    let permits = Array.from(parkingPermits.values());

    if (query.propertyId) {
      permits = permits.filter((p) => p.propertyId === query.propertyId);
    }
    if (query.tenantId) {
      permits = permits.filter((p) => p.tenantId === query.tenantId);
    }
    if (query.status) {
      permits = permits.filter((p) => p.status === query.status);
    }

    return reply.send({ permits, total: permits.length });
  });

  // Suspend permit
  app.post('/permits/:permitId/suspend', async (request: FastifyRequest, reply: FastifyReply) => {
    const { permitId } = request.params as { permitId: string };
    const schema = z.object({
      reason: z.string(),
    });

    const body = schema.parse(request.body);
    const permit = parkingPermits.get(permitId);

    if (!permit) {
      return reply.status(404).send({ error: 'Permit not found' });
    }

    const now = new Date().toISOString();
    const updated: ParkingPermit = {
      ...permit,
      status: 'suspended',
      suspendedAt: now,
      suspendedReason: body.reason,
      updatedAt: now,
    };

    parkingPermits.set(permitId, updated);
    return reply.send(updated);
  });

  // Reactivate permit
  app.post('/permits/:permitId/reactivate', async (request: FastifyRequest, reply: FastifyReply) => {
    const { permitId } = request.params as { permitId: string };
    const permit = parkingPermits.get(permitId);

    if (!permit) {
      return reply.status(404).send({ error: 'Permit not found' });
    }

    if (permit.status !== 'suspended') {
      return reply.status(400).send({ error: 'Permit is not suspended' });
    }

    const updated: ParkingPermit = {
      ...permit,
      status: 'active',
      suspendedAt: undefined,
      suspendedReason: undefined,
      updatedAt: new Date().toISOString(),
    };

    parkingPermits.set(permitId, updated);
    return reply.send(updated);
  });

  // Cancel permit
  app.post('/permits/:permitId/cancel', async (request: FastifyRequest, reply: FastifyReply) => {
    const { permitId } = request.params as { permitId: string };
    const permit = parkingPermits.get(permitId);

    if (!permit) {
      return reply.status(404).send({ error: 'Permit not found' });
    }

    // Release assigned space if applicable
    if (permit.spaceId) {
      const space = parkingSpaces.get(permit.spaceId);
      if (space && space.status === 'assigned') {
        parkingSpaces.set(permit.spaceId, {
          ...space,
          status: 'available',
          assignedTo: undefined,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    const updated: ParkingPermit = {
      ...permit,
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    };

    parkingPermits.set(permitId, updated);
    return reply.send(updated);
  });

  // -------------------------------------------------------------------------
  // Guest Passes
  // -------------------------------------------------------------------------

  // Create guest pass
  app.post('/guest-passes', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      propertyId: z.string(),
      tenantId: z.string(),
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

    const pass: GuestPass = {
      id: `guestpass_${Date.now()}`,
      ...body,
      passCode: generatePassCode(),
      isUsed: false,
      createdAt: new Date().toISOString(),
    };

    guestPasses.set(pass.id, pass);
    return reply.status(201).send(pass);
  });

  // Get guest pass
  app.get('/guest-passes/:passId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { passId } = request.params as { passId: string };
    const pass = guestPasses.get(passId);

    if (!pass) {
      return reply.status(404).send({ error: 'Guest pass not found' });
    }

    return reply.send({
      ...pass,
      isValid: isGuestPassValid(pass),
    });
  });

  // Validate guest pass by code
  app.get('/guest-passes/validate/:passCode', async (request: FastifyRequest, reply: FastifyReply) => {
    const { passCode } = request.params as { passCode: string };
    const pass = Array.from(guestPasses.values()).find(
      (p) => p.passCode.toUpperCase() === passCode.toUpperCase()
    );

    if (!pass) {
      return reply.status(404).send({ error: 'Guest pass not found' });
    }

    const isValid = isGuestPassValid(pass);

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
      spaceId: z.string().optional(),
    });

    const body = schema.parse(request.body);
    const pass = guestPasses.get(passId);

    if (!pass) {
      return reply.status(404).send({ error: 'Guest pass not found' });
    }

    if (!isGuestPassValid(pass)) {
      return reply.status(400).send({ error: 'Guest pass is not valid' });
    }

    const updated: GuestPass = {
      ...pass,
      isUsed: true,
      usedAt: new Date().toISOString(),
      spaceId: body.spaceId,
    };

    guestPasses.set(passId, updated);
    return reply.send(updated);
  });

  // List guest passes
  app.get('/guest-passes', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      propertyId: z.string().optional(),
      tenantId: z.string().optional(),
      active: z
        .string()
        .transform((v) => v === 'true')
        .optional(),
    });

    const query = schema.parse(request.query);
    let passes = Array.from(guestPasses.values());

    if (query.propertyId) {
      passes = passes.filter((p) => p.propertyId === query.propertyId);
    }
    if (query.tenantId) {
      passes = passes.filter((p) => p.tenantId === query.tenantId);
    }
    if (query.active) {
      passes = passes.filter((p) => isGuestPassValid(p));
    }

    return reply.send({ passes, total: passes.length });
  });

  // -------------------------------------------------------------------------
  // Parking Violations
  // -------------------------------------------------------------------------

  // Issue violation
  app.post('/violations', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      propertyId: z.string(),
      lotId: z.string().optional(),
      spaceId: z.string().optional(),
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
      issuedBy: z.string(),
      fineAmount: z.number().optional(),
      isWarning: z.boolean().default(false),
      photoUrls: z.array(z.string()).optional(),
      notes: z.string().optional(),
    });

    const body = schema.parse(request.body);
    const now = new Date().toISOString();

    // Calculate fine amount if not provided
    const fineAmount = body.fineAmount ?? getViolationFineAmount(body.violationType);

    // Set due date to 30 days from now
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    const violation: ParkingViolation = {
      id: `violation_${Date.now()}`,
      propertyId: body.propertyId,
      lotId: body.lotId,
      spaceId: body.spaceId,
      licensePlate: body.licensePlate,
      vehicleDescription: body.vehicleDescription,
      violationType: body.violationType,
      status: body.isWarning ? 'warning' : 'issued',
      description: body.description,
      issuedAt: now,
      issuedBy: body.issuedBy,
      fineAmount: body.isWarning ? 0 : fineAmount,
      dueDate: dueDate.toISOString(),
      photoUrls: body.photoUrls,
      notes: body.notes,
      createdAt: now,
    };

    parkingViolations.set(violation.id, violation);
    return reply.status(201).send(violation);
  });

  // Get violation
  app.get('/violations/:violationId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { violationId } = request.params as { violationId: string };
    const violation = parkingViolations.get(violationId);

    if (!violation) {
      return reply.status(404).send({ error: 'Violation not found' });
    }

    return reply.send(violation);
  });

  // List violations
  app.get('/violations', async (request: FastifyRequest, reply: FastifyReply) => {
    const schema = z.object({
      propertyId: z.string().optional(),
      licensePlate: z.string().optional(),
      status: z
        .enum(['issued', 'warning', 'fine_due', 'paid', 'appealed', 'dismissed', 'towed'])
        .optional(),
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

    const query = schema.parse(request.query);
    let violations = Array.from(parkingViolations.values());

    if (query.propertyId) {
      violations = violations.filter((v) => v.propertyId === query.propertyId);
    }
    if (query.licensePlate) {
      violations = violations.filter(
        (v) => v.licensePlate.toLowerCase() === query.licensePlate!.toLowerCase()
      );
    }
    if (query.status) {
      violations = violations.filter((v) => v.status === query.status);
    }
    if (query.violationType) {
      violations = violations.filter((v) => v.violationType === query.violationType);
    }

    return reply.send({ violations, total: violations.length });
  });

  // Pay violation fine
  app.post('/violations/:violationId/pay', async (request: FastifyRequest, reply: FastifyReply) => {
    const { violationId } = request.params as { violationId: string };
    const violation = parkingViolations.get(violationId);

    if (!violation) {
      return reply.status(404).send({ error: 'Violation not found' });
    }

    if (violation.status === 'paid') {
      return reply.status(400).send({ error: 'Violation already paid' });
    }

    if (violation.status === 'warning' || violation.status === 'dismissed') {
      return reply.status(400).send({ error: 'No fine due for this violation' });
    }

    const updated: ParkingViolation = {
      ...violation,
      status: 'paid',
      paidAt: new Date().toISOString(),
    };

    parkingViolations.set(violationId, updated);
    return reply.send(updated);
  });

  // Appeal violation
  app.post('/violations/:violationId/appeal', async (request: FastifyRequest, reply: FastifyReply) => {
    const { violationId } = request.params as { violationId: string };
    const schema = z.object({
      reason: z.string(),
    });

    const body = schema.parse(request.body);
    const violation = parkingViolations.get(violationId);

    if (!violation) {
      return reply.status(404).send({ error: 'Violation not found' });
    }

    if (violation.status === 'paid' || violation.status === 'dismissed') {
      return reply.status(400).send({ error: 'Cannot appeal this violation' });
    }

    const updated: ParkingViolation = {
      ...violation,
      status: 'appealed',
      appealedAt: new Date().toISOString(),
      appealReason: body.reason,
      appealStatus: 'pending',
    };

    parkingViolations.set(violationId, updated);
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
    const violation = parkingViolations.get(violationId);

    if (!violation) {
      return reply.status(404).send({ error: 'Violation not found' });
    }

    if (violation.status !== 'appealed') {
      return reply.status(400).send({ error: 'Violation is not under appeal' });
    }

    const updated: ParkingViolation = {
      ...violation,
      status: body.approved ? 'dismissed' : 'fine_due',
      appealStatus: body.approved ? 'approved' : 'denied',
      appealDecision: body.decision,
    };

    parkingViolations.set(violationId, updated);
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
    const violation = parkingViolations.get(violationId);

    if (!violation) {
      return reply.status(404).send({ error: 'Violation not found' });
    }

    const now = new Date().toISOString();

    // Update violation status
    const updatedViolation: ParkingViolation = {
      ...violation,
      status: 'towed',
      towedAt: now,
      towCompany: body.towCompany,
    };
    parkingViolations.set(violationId, updatedViolation);

    // Create tow record
    const towRecord: TowRecord = {
      id: `tow_${Date.now()}`,
      violationId,
      propertyId: violation.propertyId,
      licensePlate: violation.licensePlate,
      vehicleDescription: violation.vehicleDescription || 'Unknown',
      towCompany: body.towCompany,
      towCompanyPhone: body.towCompanyPhone,
      towDriver: body.towDriver,
      referenceNumber: `TOW-${Date.now().toString(36).toUpperCase()}`,
      towedAt: now,
      towLocation: body.towLocation,
      storageRate: body.storageRate,
      createdAt: now,
    };

    // Update violation with reference
    parkingViolations.set(violationId, {
      ...updatedViolation,
      towReferenceNumber: towRecord.referenceNumber,
    });

    towRecords.set(towRecord.id, towRecord);
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
    const record = towRecords.get(towId);

    if (!record) {
      return reply.status(404).send({ error: 'Tow record not found' });
    }

    const updated: TowRecord = {
      ...record,
      retrievedAt: new Date().toISOString(),
      retrievedBy: body.retrievedBy,
      totalCharges: body.totalCharges,
    };

    towRecords.set(towId, updated);
    return reply.send(updated);
  });

  // List tow records
  app.get('/tow', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.query as { propertyId?: string };
    let records = Array.from(towRecords.values());

    if (propertyId) {
      records = records.filter((r) => r.propertyId === propertyId);
    }

    return reply.send({ records, total: records.length });
  });

  // -------------------------------------------------------------------------
  // Reports
  // -------------------------------------------------------------------------

  // Violation stats
  app.get('/reports/violations/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const schema = z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    });

    const query = schema.parse(request.query);
    const stats = calculateViolationStats(propertyId, query.startDate, query.endDate);

    return reply.send(stats);
  });

  // Revenue report
  app.get('/reports/revenue/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const schema = z.object({
      startDate: z.string(),
      endDate: z.string(),
    });

    const query = schema.parse(request.query);
    const revenue = calculateParkingRevenue(propertyId, query.startDate, query.endDate);

    return reply.send(revenue);
  });

  // Occupancy report
  app.get('/reports/occupancy/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const lots = Array.from(parkingLots.values()).filter((l) => l.propertyId === propertyId);

    const report = lots.map((lot) => ({
      lotId: lot.id,
      lotName: lot.name,
      ...getLotOccupancy(lot.id),
      spacesByType: getSpacesByType(lot.id),
    }));

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
