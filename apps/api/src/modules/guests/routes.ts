import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Types
interface GuestPass {
  id: string;
  propertyId: string;
  unitId: string;
  residentId: string;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  passType: 'one_time' | 'recurring' | 'extended_stay';
  purpose: 'visitor' | 'service' | 'delivery' | 'contractor' | 'caregiver';
  validFrom: Date;
  validUntil: Date;
  recurringDays?: number[]; // 0-6 for Sunday-Saturday
  accessCode?: string;
  vehicleInfo?: {
    licensePlate: string;
    make?: string;
    model?: string;
    color?: string;
  };
  parkingAssigned?: string;
  notes?: string;
  status: 'active' | 'expired' | 'revoked' | 'used';
  checkIns: GuestCheckIn[];
  createdAt: Date;
  updatedAt: Date;
}

interface GuestCheckIn {
  id: string;
  passId: string;
  checkInTime: Date;
  checkOutTime?: Date;
  verifiedBy?: string;
  verificationMethod: 'access_code' | 'id_scan' | 'manual' | 'intercom';
  notes?: string;
}

interface GuestParking {
  id: string;
  propertyId: string;
  spotNumber: string;
  location: string;
  type: 'visitor' | 'reserved_guest' | 'temporary';
  status: 'available' | 'occupied' | 'reserved' | 'maintenance';
  currentPassId?: string;
  reservedUntil?: Date;
  createdAt: Date;
}

interface GuestPolicy {
  id: string;
  propertyId: string;
  maxGuestsPerUnit: number;
  maxConsecutiveDays: number;
  requiresPreRegistration: boolean;
  requiresIdVerification: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  parkingRequired: boolean;
  allowedPurposes: string[];
  blackoutDates?: string[];
  createdAt: Date;
  updatedAt: Date;
}

interface GuestIncident {
  id: string;
  propertyId: string;
  passId?: string;
  guestName: string;
  incidentType: 'unauthorized_access' | 'noise_complaint' | 'parking_violation' | 'property_damage' | 'policy_violation' | 'other';
  description: string;
  reportedBy: string;
  reportedAt: Date;
  severity: 'low' | 'medium' | 'high';
  status: 'open' | 'investigating' | 'resolved' | 'escalated';
  resolution?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
}

interface GuestNotification {
  id: string;
  passId: string;
  type: 'arrival' | 'departure' | 'expiring_soon' | 'expired' | 'revoked';
  recipientId: string;
  recipientType: 'resident' | 'staff';
  sentAt: Date;
  channel: 'email' | 'sms' | 'push';
  status: 'sent' | 'delivered' | 'failed';
}

// In-memory stores
export const guestPasses = new Map<string, GuestPass>();
export const guestCheckIns = new Map<string, GuestCheckIn>();
export const guestParkingSpots = new Map<string, GuestParking>();
export const guestPolicies = new Map<string, GuestPolicy>();
export const guestIncidents = new Map<string, GuestIncident>();
export const guestNotifications = new Map<string, GuestNotification>();

// Helper functions
export function generateAccessCode(length: number = 6): string {
  const chars = '0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function isPassValid(pass: GuestPass, checkTime: Date = new Date()): boolean {
  if (pass.status !== 'active') return false;
  if (checkTime < pass.validFrom || checkTime > pass.validUntil) return false;

  if (pass.passType === 'recurring' && pass.recurringDays) {
    const dayOfWeek = checkTime.getDay();
    if (!pass.recurringDays.includes(dayOfWeek)) return false;
  }

  if (pass.passType === 'one_time' && pass.checkIns.length > 0) {
    return false;
  }

  return true;
}

export function getAvailableParkingSpots(propertyId: string): GuestParking[] {
  return Array.from(guestParkingSpots.values()).filter(
    spot => spot.propertyId === propertyId && spot.status === 'available'
  );
}

export function getActivePassesForUnit(unitId: string): GuestPass[] {
  const now = new Date();
  return Array.from(guestPasses.values()).filter(
    pass => pass.unitId === unitId && isPassValid(pass, now)
  );
}

export function getGuestStats(propertyId: string): {
  totalActivePasses: number;
  checkInsToday: number;
  currentlyOnSite: number;
  parkingSpotsAvailable: number;
  parkingSpotsTotal: number;
} {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const propertyPasses = Array.from(guestPasses.values()).filter(p => p.propertyId === propertyId);
  const propertyCheckIns = Array.from(guestCheckIns.values()).filter(c => {
    const pass = guestPasses.get(c.passId);
    return pass?.propertyId === propertyId;
  });
  const propertyParking = Array.from(guestParkingSpots.values()).filter(p => p.propertyId === propertyId);

  return {
    totalActivePasses: propertyPasses.filter(p => isPassValid(p, now)).length,
    checkInsToday: propertyCheckIns.filter(c => c.checkInTime >= startOfDay).length,
    currentlyOnSite: propertyCheckIns.filter(c => c.checkInTime >= startOfDay && !c.checkOutTime).length,
    parkingSpotsAvailable: propertyParking.filter(p => p.status === 'available').length,
    parkingSpotsTotal: propertyParking.length
  };
}

export function checkPolicyCompliance(
  propertyId: string,
  unitId: string,
  validFrom: Date,
  validUntil: Date,
  purpose: string
): { compliant: boolean; violations: string[] } {
  const policy = Array.from(guestPolicies.values()).find(p => p.propertyId === propertyId);
  const violations: string[] = [];

  if (!policy) {
    return { compliant: true, violations: [] };
  }

  // Check max guests
  const activePassesCount = getActivePassesForUnit(unitId).length;
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
  if (policy.blackoutDates) {
    const fromStr = validFrom.toISOString().split('T')[0];
    const untilStr = validUntil.toISOString().split('T')[0];
    if (policy.blackoutDates.includes(fromStr) || policy.blackoutDates.includes(untilStr)) {
      violations.push('Requested dates include blackout dates');
    }
  }

  return {
    compliant: violations.length === 0,
    violations
  };
}

export function expireOldPasses(): number {
  const now = new Date();
  let expiredCount = 0;

  for (const [id, pass] of guestPasses) {
    if (pass.status === 'active' && pass.validUntil < now) {
      pass.status = 'expired';
      pass.updatedAt = now;
      guestPasses.set(id, pass);
      expiredCount++;
    }
  }

  return expiredCount;
}

// Schemas
const guestPassSchema = z.object({
  propertyId: z.string(),
  unitId: z.string(),
  residentId: z.string(),
  guestName: z.string(),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().optional(),
  passType: z.enum(['one_time', 'recurring', 'extended_stay']),
  purpose: z.enum(['visitor', 'service', 'delivery', 'contractor', 'caregiver']),
  validFrom: z.string().transform(s => new Date(s)),
  validUntil: z.string().transform(s => new Date(s)),
  recurringDays: z.array(z.number().min(0).max(6)).optional(),
  vehicleInfo: z.object({
    licensePlate: z.string(),
    make: z.string().optional(),
    model: z.string().optional(),
    color: z.string().optional()
  }).optional(),
  notes: z.string().optional()
});

const checkInSchema = z.object({
  passId: z.string(),
  verificationMethod: z.enum(['access_code', 'id_scan', 'manual', 'intercom']),
  verifiedBy: z.string().optional(),
  notes: z.string().optional()
});

const parkingSpotSchema = z.object({
  propertyId: z.string(),
  spotNumber: z.string(),
  location: z.string(),
  type: z.enum(['visitor', 'reserved_guest', 'temporary'])
});

const policySchema = z.object({
  propertyId: z.string(),
  maxGuestsPerUnit: z.number().min(1),
  maxConsecutiveDays: z.number().min(1),
  requiresPreRegistration: z.boolean(),
  requiresIdVerification: z.boolean(),
  quietHoursStart: z.string().optional(),
  quietHoursEnd: z.string().optional(),
  parkingRequired: z.boolean(),
  allowedPurposes: z.array(z.string()),
  blackoutDates: z.array(z.string()).optional()
});

const incidentSchema = z.object({
  propertyId: z.string(),
  passId: z.string().optional(),
  guestName: z.string(),
  incidentType: z.enum(['unauthorized_access', 'noise_complaint', 'parking_violation', 'property_damage', 'policy_violation', 'other']),
  description: z.string(),
  reportedBy: z.string(),
  severity: z.enum(['low', 'medium', 'high'])
});

export async function guestRoutes(app: FastifyInstance): Promise<void> {
  // Guest Passes
  app.post('/passes', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = guestPassSchema.parse(request.body);

    // Check policy compliance
    const compliance = checkPolicyCompliance(
      data.propertyId,
      data.unitId,
      data.validFrom,
      data.validUntil,
      data.purpose
    );

    if (!compliance.compliant) {
      return reply.status(400).send({
        error: 'Policy violation',
        violations: compliance.violations
      });
    }

    const id = `pass_${Date.now()}`;
    const pass: GuestPass = {
      id,
      ...data,
      accessCode: generateAccessCode(),
      status: 'active',
      checkIns: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Assign parking if vehicle info provided
    if (data.vehicleInfo) {
      const availableSpots = getAvailableParkingSpots(data.propertyId);
      if (availableSpots.length > 0) {
        const spot = availableSpots[0];
        spot.status = 'reserved';
        spot.currentPassId = id;
        spot.reservedUntil = data.validUntil;
        guestParkingSpots.set(spot.id, spot);
        pass.parkingAssigned = spot.spotNumber;
      }
    }

    guestPasses.set(id, pass);
    return reply.status(201).send(pass);
  });

  app.get('/passes', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, unitId, status } = request.query as { propertyId?: string; unitId?: string; status?: string };
    let passes = Array.from(guestPasses.values());

    if (propertyId) passes = passes.filter(p => p.propertyId === propertyId);
    if (unitId) passes = passes.filter(p => p.unitId === unitId);
    if (status) passes = passes.filter(p => p.status === status);

    return reply.send(passes);
  });

  app.get('/passes/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const pass = guestPasses.get(id);
    if (!pass) return reply.status(404).send({ error: 'Guest pass not found' });
    return reply.send(pass);
  });

  app.post('/passes/:id/revoke', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const pass = guestPasses.get(id);
    if (!pass) return reply.status(404).send({ error: 'Guest pass not found' });

    pass.status = 'revoked';
    pass.updatedAt = new Date();

    // Release parking spot
    if (pass.parkingAssigned) {
      const spot = Array.from(guestParkingSpots.values()).find(
        s => s.currentPassId === id
      );
      if (spot) {
        spot.status = 'available';
        spot.currentPassId = undefined;
        spot.reservedUntil = undefined;
        guestParkingSpots.set(spot.id, spot);
      }
    }

    guestPasses.set(id, pass);
    return reply.send(pass);
  });

  app.post('/passes/:id/extend', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { newValidUntil } = request.body as { newValidUntil: string };

    const pass = guestPasses.get(id);
    if (!pass) return reply.status(404).send({ error: 'Guest pass not found' });

    const newDate = new Date(newValidUntil);

    // Check policy compliance for extension
    const compliance = checkPolicyCompliance(
      pass.propertyId,
      pass.unitId,
      pass.validFrom,
      newDate,
      pass.purpose
    );

    if (!compliance.compliant) {
      return reply.status(400).send({
        error: 'Policy violation',
        violations: compliance.violations
      });
    }

    pass.validUntil = newDate;
    pass.updatedAt = new Date();
    guestPasses.set(id, pass);

    return reply.send(pass);
  });

  app.post('/passes/verify', async (request: FastifyRequest, reply: FastifyReply) => {
    const { accessCode } = request.body as { accessCode: string };

    const pass = Array.from(guestPasses.values()).find(
      p => p.accessCode === accessCode
    );

    if (!pass) {
      return reply.status(404).send({ valid: false, error: 'Invalid access code' });
    }

    const valid = isPassValid(pass);
    return reply.send({
      valid,
      pass: valid ? pass : undefined,
      error: valid ? undefined : 'Pass is not valid at this time'
    });
  });

  // Check-ins
  app.post('/check-ins', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = checkInSchema.parse(request.body);

    const pass = guestPasses.get(data.passId);
    if (!pass) return reply.status(404).send({ error: 'Guest pass not found' });

    if (!isPassValid(pass)) {
      return reply.status(400).send({ error: 'Guest pass is not valid' });
    }

    const id = `checkin_${Date.now()}`;
    const checkIn: GuestCheckIn = {
      id,
      passId: data.passId,
      checkInTime: new Date(),
      verificationMethod: data.verificationMethod,
      verifiedBy: data.verifiedBy,
      notes: data.notes
    };

    guestCheckIns.set(id, checkIn);
    pass.checkIns.push(checkIn);

    // Mark one-time pass as used
    if (pass.passType === 'one_time') {
      pass.status = 'used';
    }

    pass.updatedAt = new Date();
    guestPasses.set(pass.id, pass);

    return reply.status(201).send(checkIn);
  });

  app.post('/check-ins/:id/checkout', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const checkIn = guestCheckIns.get(id);
    if (!checkIn) return reply.status(404).send({ error: 'Check-in not found' });

    if (checkIn.checkOutTime) {
      return reply.status(400).send({ error: 'Already checked out' });
    }

    checkIn.checkOutTime = new Date();
    guestCheckIns.set(id, checkIn);

    return reply.send(checkIn);
  });

  app.get('/check-ins', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, date } = request.query as { propertyId?: string; date?: string };
    let checkIns = Array.from(guestCheckIns.values());

    if (propertyId) {
      checkIns = checkIns.filter(c => {
        const pass = guestPasses.get(c.passId);
        return pass?.propertyId === propertyId;
      });
    }

    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      checkIns = checkIns.filter(c => c.checkInTime >= startOfDay && c.checkInTime < endOfDay);
    }

    return reply.send(checkIns);
  });

  // Parking
  app.post('/parking', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = parkingSpotSchema.parse(request.body);

    const id = `gparking_${Date.now()}`;
    const spot: GuestParking = {
      id,
      ...data,
      status: 'available',
      createdAt: new Date()
    };

    guestParkingSpots.set(id, spot);
    return reply.status(201).send(spot);
  });

  app.get('/parking', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, status } = request.query as { propertyId?: string; status?: string };
    let spots = Array.from(guestParkingSpots.values());

    if (propertyId) spots = spots.filter(s => s.propertyId === propertyId);
    if (status) spots = spots.filter(s => s.status === status);

    return reply.send(spots);
  });

  app.get('/parking/available/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const spots = getAvailableParkingSpots(propertyId);
    return reply.send(spots);
  });

  app.patch('/parking/:id/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: string };

    const spot = guestParkingSpots.get(id);
    if (!spot) return reply.status(404).send({ error: 'Parking spot not found' });

    spot.status = status as GuestParking['status'];
    if (status === 'available') {
      spot.currentPassId = undefined;
      spot.reservedUntil = undefined;
    }

    guestParkingSpots.set(id, spot);
    return reply.send(spot);
  });

  // Policies
  app.post('/policies', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = policySchema.parse(request.body);

    const id = `gpolicy_${Date.now()}`;
    const policy: GuestPolicy = {
      id,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    guestPolicies.set(id, policy);
    return reply.status(201).send(policy);
  });

  app.get('/policies/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const policy = Array.from(guestPolicies.values()).find(p => p.propertyId === propertyId);
    if (!policy) return reply.status(404).send({ error: 'Policy not found' });
    return reply.send(policy);
  });

  app.put('/policies/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const data = policySchema.parse(request.body);

    const policy = guestPolicies.get(id);
    if (!policy) return reply.status(404).send({ error: 'Policy not found' });

    Object.assign(policy, data, { updatedAt: new Date() });
    guestPolicies.set(id, policy);
    return reply.send(policy);
  });

  // Incidents
  app.post('/incidents', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = incidentSchema.parse(request.body);

    const id = `gincident_${Date.now()}`;
    const incident: GuestIncident = {
      id,
      ...data,
      reportedAt: new Date(),
      status: 'open'
    };

    guestIncidents.set(id, incident);
    return reply.status(201).send(incident);
  });

  app.get('/incidents', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId, status } = request.query as { propertyId?: string; status?: string };
    let incidents = Array.from(guestIncidents.values());

    if (propertyId) incidents = incidents.filter(i => i.propertyId === propertyId);
    if (status) incidents = incidents.filter(i => i.status === status);

    return reply.send(incidents);
  });

  app.patch('/incidents/:id/resolve', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { resolution, resolvedBy } = request.body as { resolution: string; resolvedBy: string };

    const incident = guestIncidents.get(id);
    if (!incident) return reply.status(404).send({ error: 'Incident not found' });

    incident.status = 'resolved';
    incident.resolution = resolution;
    incident.resolvedBy = resolvedBy;
    incident.resolvedAt = new Date();

    guestIncidents.set(id, incident);
    return reply.send(incident);
  });

  // Stats
  app.get('/stats/:propertyId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { propertyId } = request.params as { propertyId: string };
    const stats = getGuestStats(propertyId);
    return reply.send(stats);
  });

  // Expire old passes (maintenance endpoint)
  app.post('/maintenance/expire-passes', async (_request: FastifyRequest, reply: FastifyReply) => {
    const expiredCount = expireOldPasses();
    return reply.send({ expiredCount });
  });
}
