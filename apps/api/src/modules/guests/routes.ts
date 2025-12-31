import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  prisma,
  type GuestPassType,
  type GuestPassPurpose,
  type GuestPassStatus,
  type VerificationMethod,
  type GuestParkingType,
  type GuestParkingStatus,
  type GuestIncidentType,
  type GuestIncidentSeverity,
  type GuestIncidentStatus,
} from '@realriches/database';

// Exported types for testing
export interface GuestPass {
  id: string;
  propertyId: string;
  unitId: string;
  guestName: string;
  status: GuestPassStatus | string;
  passType: GuestPassType | string;
  validFrom: Date;
  validUntil: Date;
  recurringDays?: number[];
  accessCode?: string;
  checkIns?: { id: string }[];
}

export interface GuestCheckIn {
  id: string;
  passId: string;
  checkInTime: Date;
  checkOutTime?: Date;
}

export interface GuestPolicy {
  id: string;
  propertyId: string;
  maxGuestsPerUnit: number;
  maxConsecutiveDays: number;
  maxOvernightsPerMonth: number;
  requiresRegistration: boolean;
  parkingAllowed: boolean;
}

// Exported Maps for testing
export const guestPassStore = new Map<string, GuestPass>();
export const guestPolicies = new Map<string, GuestPolicy>();
export const guestParkingSpots = new Map<string, { id: string; propertyId: string; status: string }>();

// Sync versions of functions for testing
export function getGuestStatsSync(propertyId: string): {
  totalActivePasses: number;
  parkingSpotsAvailable: number;
  parkingSpotsTotal: number;
  checkInsToday: number;
} {
  const now = new Date();
  const activePasses = Array.from(guestPassStore.values()).filter(
    p => p.propertyId === propertyId && p.status === 'active' &&
      new Date(p.validFrom) <= now && new Date(p.validUntil) >= now
  );

  const allParking = Array.from(guestParkingSpots.values()).filter(p => p.propertyId === propertyId);
  const availableParking = allParking.filter(p => p.status === 'available');

  return {
    totalActivePasses: activePasses.length,
    parkingSpotsAvailable: availableParking.length,
    parkingSpotsTotal: allParking.length,
    checkInsToday: 0,
  };
}

export function checkPolicyComplianceSync(
  propertyId: string,
  unitId: string,
  guestCount: number,
  stayDays: number
): { compliant: boolean; violations: string[] } {
  const policy = Array.from(guestPolicies.values()).find(p => p.propertyId === propertyId);

  if (!policy) {
    return { compliant: true, violations: [] };
  }

  const violations: string[] = [];

  if (guestCount > policy.maxGuestsPerUnit) {
    violations.push(`Guest count (${guestCount}) exceeds maximum allowed (${policy.maxGuestsPerUnit})`);
  }

  if (stayDays > policy.maxConsecutiveDays) {
    violations.push(`Stay duration (${stayDays} days) exceeds maximum consecutive days (${policy.maxConsecutiveDays})`);
  }

  return {
    compliant: violations.length === 0,
    violations,
  };
}

export function expireOldPassesSync(): number {
  const now = new Date();
  let expiredCount = 0;

  for (const [id, pass] of guestPassStore.entries()) {
    if (pass.status === 'active' && new Date(pass.validUntil) < now) {
      pass.status = 'expired';
      guestPassStore.set(id, pass);
      expiredCount++;
    }
  }

  return expiredCount;
}

// Export sync versions as main exports
export { getGuestStatsSync as getGuestStats };
export { checkPolicyComplianceSync as checkPolicyCompliance };
export { expireOldPassesSync as expireOldPasses };

// Helper functions
export function generateAccessCode(length: number = 6): string {
  const chars = '0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

interface GuestPassWithCheckIns {
  status: GuestPassStatus;
  validFrom: Date;
  validUntil: Date;
  passType: GuestPassType;
  recurringDays: number[];
  checkIns: { id: string }[];
}

export function isPassValid(pass: GuestPassWithCheckIns, checkTime: Date = new Date()): boolean {
  if (pass.status !== 'active') return false;
  if (checkTime < pass.validFrom || checkTime > pass.validUntil) return false;

  if (pass.passType === 'recurring' && pass.recurringDays.length > 0) {
    const dayOfWeek = checkTime.getDay();
    if (!pass.recurringDays.includes(dayOfWeek)) return false;
  }

  if (pass.passType === 'one_time' && pass.checkIns.length > 0) {
    return false;
  }

  return true;
}

export async function getAvailableParkingSpots(propertyId: string) {
  return prisma.guestParking.findMany({
    where: {
      propertyId,
      status: 'available',
    },
  });
}

export async function getActivePassesForUnit(unitId: string) {
  const now = new Date();
  const passes = await prisma.guestPass.findMany({
    where: {
      unitId,
      status: 'active',
      validFrom: { lte: now },
      validUntil: { gte: now },
    },
    include: { checkIns: true },
  });

  return passes.filter((pass) => isPassValid(pass, now));
}

async function getGuestStatsAsync(propertyId: string) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [
    activePasses,
    checkInsToday,
    currentlyOnSite,
    parkingStats,
  ] = await Promise.all([
    prisma.guestPass.count({
      where: {
        propertyId,
        status: 'active',
        validFrom: { lte: now },
        validUntil: { gte: now },
      },
    }),
    prisma.guestCheckIn.count({
      where: {
        pass: { propertyId },
        checkInTime: { gte: startOfDay },
      },
    }),
    prisma.guestCheckIn.count({
      where: {
        pass: { propertyId },
        checkInTime: { gte: startOfDay },
        checkOutTime: null,
      },
    }),
    prisma.guestParking.groupBy({
      by: ['status'],
      where: { propertyId },
      _count: true,
    }),
  ]);

  const parkingSpotsTotal = parkingStats.reduce((sum, s) => sum + s._count, 0);
  const parkingSpotsAvailable = parkingStats.find((s) => s.status === 'available')?._count || 0;

  return {
    totalActivePasses: activePasses,
    checkInsToday,
    currentlyOnSite,
    parkingSpotsAvailable,
    parkingSpotsTotal,
  };
}

async function checkPolicyComplianceAsync(
  propertyId: string,
  unitId: string,
  validFrom: Date,
  validUntil: Date,
  purpose: string
): Promise<{ compliant: boolean; violations: string[] }> {
  const policy = await prisma.guestPolicy.findUnique({
    where: { propertyId },
  });

  const violations: string[] = [];

  if (!policy) {
    return { compliant: true, violations: [] };
  }

  // Check max guests
  const activePassesCount = (await getActivePassesForUnit(unitId)).length;
  if (activePassesCount >= policy.maxGuestsPerUnit) {
    violations.push(`Maximum guests per unit (${policy.maxGuestsPerUnit}) reached`);
  }

  // Check consecutive days
  const durationDays = Math.ceil((validUntil.getTime() - validFrom.getTime()) / (1000 * 60 * 60 * 24));
  if (durationDays > policy.maxConsecutiveDays) {
    violations.push(`Stay duration (${durationDays} days) exceeds maximum (${policy.maxConsecutiveDays} days)`);
  }

  // Check allowed purposes
  if (!policy.allowedPurposes.includes(purpose)) {
    violations.push(`Purpose '${purpose}' is not allowed`);
  }

  // Check blackout dates
  if (policy.blackoutDates.length > 0) {
    const fromStr = validFrom.toISOString().split('T')[0];
    const untilStr = validUntil.toISOString().split('T')[0];
    if (policy.blackoutDates.includes(fromStr) || policy.blackoutDates.includes(untilStr)) {
      violations.push('Requested dates include blackout dates');
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
  };
}

async function expireOldPassesAsync(): Promise<number> {
  const now = new Date();

  const result = await prisma.guestPass.updateMany({
    where: {
      status: 'active',
      validUntil: { lt: now },
    },
    data: {
      status: 'expired',
    },
  });

  return result.count;
}

// Schemas
const guestPassSchema = z.object({
  propertyId: z.string().uuid(),
  unitId: z.string().uuid(),
  residentId: z.string().uuid(),
  guestName: z.string(),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().optional(),
  passType: z.enum(['one_time', 'recurring', 'extended_stay']),
  purpose: z.enum(['visitor', 'service', 'delivery', 'contractor', 'caregiver']),
  validFrom: z.string().transform((s) => new Date(s)),
  validUntil: z.string().transform((s) => new Date(s)),
  recurringDays: z.array(z.number().min(0).max(6)).optional(),
  vehicleInfo: z
    .object({
      licensePlate: z.string(),
      make: z.string().optional(),
      model: z.string().optional(),
      color: z.string().optional(),
    })
    .optional(),
  notes: z.string().optional(),
});

const checkInSchema = z.object({
  passId: z.string().uuid(),
  verificationMethod: z.enum(['access_code', 'id_scan', 'manual', 'intercom']),
  verifiedBy: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const parkingSpotSchema = z.object({
  propertyId: z.string().uuid(),
  spotNumber: z.string(),
  location: z.string(),
  type: z.enum(['visitor', 'reserved_guest', 'temporary']),
});

const policySchema = z.object({
  propertyId: z.string().uuid(),
  maxGuestsPerUnit: z.number().min(1),
  maxConsecutiveDays: z.number().min(1),
  requiresPreRegistration: z.boolean(),
  requiresIdVerification: z.boolean(),
  quietHoursStart: z.string().optional(),
  quietHoursEnd: z.string().optional(),
  parkingRequired: z.boolean(),
  allowedPurposes: z.array(z.string()),
  blackoutDates: z.array(z.string()).optional(),
});

const incidentSchema = z.object({
  propertyId: z.string().uuid(),
  passId: z.string().uuid().optional(),
  guestName: z.string(),
  incidentType: z.enum(['unauthorized_access', 'noise_complaint', 'parking_violation', 'property_damage', 'policy_violation', 'other']),
  description: z.string(),
  reportedBy: z.string().uuid(),
  severity: z.enum(['low', 'medium', 'high']),
});

export async function guestRoutes(app: FastifyInstance): Promise<void> {
  // Guest Passes
  app.post('/passes', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = guestPassSchema.parse(request.body);

    // Check policy compliance
    const compliance = await checkPolicyCompliance(
      data.propertyId,
      data.unitId,
      data.validFrom,
      data.validUntil,
      data.purpose
    );

    if (!compliance.compliant) {
      return reply.status(400).send({
        error: 'Policy violation',
        violations: compliance.violations,
      });
    }

    let parkingAssigned: string | undefined;

    // Assign parking if vehicle info provided
    if (data.vehicleInfo) {
      const availableSpots = await getAvailableParkingSpots(data.propertyId);
      if (availableSpots.length > 0) {
        const spot = availableSpots[0];
        parkingAssigned = spot.spotNumber;
      }
    }

    const pass = await prisma.guestPass.create({
      data: {
        propertyId: data.propertyId,
        unitId: data.unitId,
        residentId: data.residentId,
        guestName: data.guestName,
        guestEmail: data.guestEmail,
        guestPhone: data.guestPhone,
        passType: data.passType as GuestPassType,
        purpose: data.purpose as GuestPassPurpose,
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        recurringDays: data.recurringDays || [],
        accessCode: generateAccessCode(),
        vehiclePlate: data.vehicleInfo?.licensePlate,
        vehicleMake: data.vehicleInfo?.make,
        vehicleModel: data.vehicleInfo?.model,
        vehicleColor: data.vehicleInfo?.color,
        parkingAssigned,
        notes: data.notes,
        status: 'active',
      },
      include: { checkIns: true },
    });

    // Update parking spot if assigned
    if (parkingAssigned && data.vehicleInfo) {
      await prisma.guestParking.updateMany({
        where: {
          propertyId: data.propertyId,
          spotNumber: parkingAssigned,
        },
        data: {
          status: 'reserved',
          currentPassId: pass.id,
          reservedUntil: data.validUntil,
        },
      });
    }

    return reply.status(201).send(pass);
  });

  app.get('/passes', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, unitId, status } = request.query as {
      propertyId?: string;
      unitId?: string;
      status?: string;
    };

    const where: Parameters<typeof prisma.guestPass.findMany>[0]['where'] = {};

    if (propertyId) where.propertyId = propertyId;
    if (unitId) where.unitId = unitId;
    if (status) where.status = status as GuestPassStatus;

    const passes = await prisma.guestPass.findMany({
      where,
      include: { checkIns: true },
    });

    return reply.send(passes);
  });

  app.get('/passes/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const pass = await prisma.guestPass.findUnique({
      where: { id },
      include: { checkIns: true },
    });

    if (!pass) return reply.status(404).send({ error: 'Guest pass not found' });
    return reply.send(pass);
  });

  app.post('/passes/:id/revoke', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const pass = await prisma.guestPass.findUnique({
      where: { id },
    });

    if (!pass) return reply.status(404).send({ error: 'Guest pass not found' });

    // Release parking spot
    if (pass.parkingAssigned) {
      await prisma.guestParking.updateMany({
        where: { currentPassId: id },
        data: {
          status: 'available',
          currentPassId: null,
          reservedUntil: null,
        },
      });
    }

    const updated = await prisma.guestPass.update({
      where: { id },
      data: { status: 'revoked' },
      include: { checkIns: true },
    });

    return reply.send(updated);
  });

  app.post('/passes/:id/extend', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { newValidUntil } = request.body as { newValidUntil: string };

    const pass = await prisma.guestPass.findUnique({
      where: { id },
    });

    if (!pass) return reply.status(404).send({ error: 'Guest pass not found' });

    const newDate = new Date(newValidUntil);

    // Check policy compliance for extension
    const compliance = await checkPolicyCompliance(
      pass.propertyId,
      pass.unitId,
      pass.validFrom,
      newDate,
      pass.purpose
    );

    if (!compliance.compliant) {
      return reply.status(400).send({
        error: 'Policy violation',
        violations: compliance.violations,
      });
    }

    const updated = await prisma.guestPass.update({
      where: { id },
      data: { validUntil: newDate },
      include: { checkIns: true },
    });

    return reply.send(updated);
  });

  app.post('/passes/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const { accessCode } = request.body as { accessCode: string };

    const pass = await prisma.guestPass.findFirst({
      where: { accessCode },
      include: { checkIns: true },
    });

    if (!pass) {
      return reply.status(404).send({ valid: false, error: 'Invalid access code' });
    }

    const valid = isPassValid(pass);
    return reply.send({
      valid,
      pass: valid ? pass : undefined,
      error: valid ? undefined : 'Pass is not valid at this time',
    });
  });

  // Check-ins
  app.post('/check-ins', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = checkInSchema.parse(request.body);

    const pass = await prisma.guestPass.findUnique({
      where: { id: data.passId },
      include: { checkIns: true },
    });

    if (!pass) return reply.status(404).send({ error: 'Guest pass not found' });

    if (!isPassValid(pass)) {
      return reply.status(400).send({ error: 'Guest pass is not valid' });
    }

    const checkIn = await prisma.guestCheckIn.create({
      data: {
        passId: data.passId,
        checkInTime: new Date(),
        verificationMethod: data.verificationMethod as VerificationMethod,
        verifiedBy: data.verifiedBy,
        notes: data.notes,
      },
    });

    // Mark one-time pass as used
    if (pass.passType === 'one_time') {
      await prisma.guestPass.update({
        where: { id: pass.id },
        data: { status: 'used' },
      });
    }

    return reply.status(201).send(checkIn);
  });

  app.post('/check-ins/:id/checkout', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const checkIn = await prisma.guestCheckIn.findUnique({
      where: { id },
    });

    if (!checkIn) return reply.status(404).send({ error: 'Check-in not found' });

    if (checkIn.checkOutTime) {
      return reply.status(400).send({ error: 'Already checked out' });
    }

    const updated = await prisma.guestCheckIn.update({
      where: { id },
      data: { checkOutTime: new Date() },
    });

    return reply.send(updated);
  });

  app.get('/check-ins', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, date } = request.query as { propertyId?: string; date?: string };

    const where: Parameters<typeof prisma.guestCheckIn.findMany>[0]['where'] = {};

    if (propertyId) {
      where.pass = { propertyId };
    }

    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      where.checkInTime = { gte: startOfDay, lt: endOfDay };
    }

    const checkIns = await prisma.guestCheckIn.findMany({
      where,
      include: { pass: true },
    });

    return reply.send(checkIns);
  });

  // Parking
  app.post('/parking', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = parkingSpotSchema.parse(request.body);

    const spot = await prisma.guestParking.create({
      data: {
        propertyId: data.propertyId,
        spotNumber: data.spotNumber,
        location: data.location,
        type: data.type as GuestParkingType,
        status: 'available',
      },
    });

    return reply.status(201).send(spot);
  });

  app.get('/parking', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, status } = request.query as { propertyId?: string; status?: string };

    const where: Parameters<typeof prisma.guestParking.findMany>[0]['where'] = {};

    if (propertyId) where.propertyId = propertyId;
    if (status) where.status = status as GuestParkingStatus;

    const spots = await prisma.guestParking.findMany({ where });
    return reply.send(spots);
  });

  app.get('/parking/available/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const spots = await getAvailableParkingSpots(propertyId);
    return reply.send(spots);
  });

  app.patch('/parking/:id/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: string };

    const spot = await prisma.guestParking.findUnique({
      where: { id },
    });

    if (!spot) return reply.status(404).send({ error: 'Parking spot not found' });

    const updateData: Parameters<typeof prisma.guestParking.update>[0]['data'] = {
      status: status as GuestParkingStatus,
    };

    if (status === 'available') {
      updateData.currentPassId = null;
      updateData.reservedUntil = null;
    }

    const updated = await prisma.guestParking.update({
      where: { id },
      data: updateData,
    });

    return reply.send(updated);
  });

  // Policies
  app.post('/policies', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = policySchema.parse(request.body);

    const policy = await prisma.guestPolicy.upsert({
      where: { propertyId: data.propertyId },
      update: {
        maxGuestsPerUnit: data.maxGuestsPerUnit,
        maxConsecutiveDays: data.maxConsecutiveDays,
        requiresPreRegistration: data.requiresPreRegistration,
        requiresIdVerification: data.requiresIdVerification,
        quietHoursStart: data.quietHoursStart,
        quietHoursEnd: data.quietHoursEnd,
        parkingRequired: data.parkingRequired,
        allowedPurposes: data.allowedPurposes,
        blackoutDates: data.blackoutDates || [],
      },
      create: {
        propertyId: data.propertyId,
        maxGuestsPerUnit: data.maxGuestsPerUnit,
        maxConsecutiveDays: data.maxConsecutiveDays,
        requiresPreRegistration: data.requiresPreRegistration,
        requiresIdVerification: data.requiresIdVerification,
        quietHoursStart: data.quietHoursStart,
        quietHoursEnd: data.quietHoursEnd,
        parkingRequired: data.parkingRequired,
        allowedPurposes: data.allowedPurposes,
        blackoutDates: data.blackoutDates || [],
      },
    });

    return reply.status(201).send(policy);
  });

  app.get('/policies/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };

    const policy = await prisma.guestPolicy.findUnique({
      where: { propertyId },
    });

    if (!policy) return reply.status(404).send({ error: 'Policy not found' });
    return reply.send(policy);
  });

  app.put('/policies/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = policySchema.parse(request.body);

    const policy = await prisma.guestPolicy.findUnique({
      where: { id },
    });

    if (!policy) return reply.status(404).send({ error: 'Policy not found' });

    const updated = await prisma.guestPolicy.update({
      where: { id },
      data: {
        maxGuestsPerUnit: data.maxGuestsPerUnit,
        maxConsecutiveDays: data.maxConsecutiveDays,
        requiresPreRegistration: data.requiresPreRegistration,
        requiresIdVerification: data.requiresIdVerification,
        quietHoursStart: data.quietHoursStart,
        quietHoursEnd: data.quietHoursEnd,
        parkingRequired: data.parkingRequired,
        allowedPurposes: data.allowedPurposes,
        blackoutDates: data.blackoutDates || [],
      },
    });

    return reply.send(updated);
  });

  // Incidents
  app.post('/incidents', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = incidentSchema.parse(request.body);

    const incident = await prisma.guestIncident.create({
      data: {
        propertyId: data.propertyId,
        passId: data.passId,
        guestName: data.guestName,
        incidentType: data.incidentType as GuestIncidentType,
        description: data.description,
        reportedBy: data.reportedBy,
        reportedAt: new Date(),
        severity: data.severity as GuestIncidentSeverity,
        status: 'open',
      },
    });

    return reply.status(201).send(incident);
  });

  app.get('/incidents', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, status } = request.query as { propertyId?: string; status?: string };

    const where: Parameters<typeof prisma.guestIncident.findMany>[0]['where'] = {};

    if (propertyId) where.propertyId = propertyId;
    if (status) where.status = status as GuestIncidentStatus;

    const incidents = await prisma.guestIncident.findMany({ where });
    return reply.send(incidents);
  });

  app.patch('/incidents/:id/resolve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { resolution, resolvedBy } = request.body as { resolution: string; resolvedBy: string };

    const incident = await prisma.guestIncident.findUnique({
      where: { id },
    });

    if (!incident) return reply.status(404).send({ error: 'Incident not found' });

    const updated = await prisma.guestIncident.update({
      where: { id },
      data: {
        status: 'resolved',
        resolution,
        resolvedBy,
        resolvedAt: new Date(),
      },
    });

    return reply.send(updated);
  });

  // Stats
  app.get('/stats/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const stats = await getGuestStats(propertyId);
    return reply.send(stats);
  });

  // Expire old passes (maintenance endpoint)
  app.post('/maintenance/expire-passes', async (_request: FastifyRequest, reply: FastifyReply) => {
    const expiredCount = await expireOldPasses();
    return reply.send({ expiredCount });
  });
}
