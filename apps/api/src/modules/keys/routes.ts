import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

type KeyType = 'master' | 'unit' | 'common_area' | 'mailbox' | 'storage' | 'gate' | 'amenity' | 'emergency';
type KeyStatus = 'available' | 'assigned' | 'lost' | 'damaged' | 'retired' | 'pending_return';
type AccessDeviceType = 'fob' | 'card' | 'remote' | 'keypad_code' | 'biometric' | 'mobile_credential';
type AccessLevel = 'resident' | 'staff' | 'maintenance' | 'vendor' | 'emergency' | 'master';
type AuditEventType = 'assigned' | 'returned' | 'lost' | 'replaced' | 'deactivated' | 'access_granted' | 'access_denied' | 'code_changed';

export interface PhysicalKey {
  id: string;
  propertyId: string;
  keyNumber: string;
  type: KeyType;
  status: KeyStatus;
  brand?: string;
  cutCode?: string;
  copies: number;
  unitId?: string;
  description?: string;
  lastAssignedTo?: string;
  lastAssignedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccessDevice {
  id: string;
  propertyId: string;
  deviceId: string;
  type: AccessDeviceType;
  status: 'active' | 'inactive' | 'lost' | 'expired' | 'suspended';
  accessLevel: AccessLevel;
  assignedTo?: string;
  assignedToType?: 'tenant' | 'staff' | 'vendor';
  assignedAt?: string;
  expiresAt?: string;
  accessZones: string[];
  pin?: string;
  mobileCredentialId?: string;
  lastUsedAt?: string;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AccessZone {
  id: string;
  propertyId: string;
  name: string;
  description?: string;
  type: 'building' | 'floor' | 'unit' | 'amenity' | 'parking' | 'restricted';
  parentZoneId?: string;
  accessPoints: string[];
  requiredLevel: AccessLevel;
  scheduleRestrictions?: {
    dayOfWeek: number[];
    startTime: string;
    endTime: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AccessPoint {
  id: string;
  propertyId: string;
  zoneId: string;
  name: string;
  type: 'door' | 'gate' | 'turnstile' | 'elevator' | 'intercom';
  location: string;
  hardwareType: string;
  hardwareId?: string;
  ipAddress?: string;
  isOnline: boolean;
  lastOnlineAt?: string;
  status: 'active' | 'maintenance' | 'offline' | 'disabled';
  createdAt: string;
  updatedAt: string;
}

export interface KeyAssignment {
  id: string;
  keyId?: string;
  deviceId?: string;
  assignedTo: string;
  assignedToType: 'tenant' | 'staff' | 'vendor' | 'contractor';
  assignedBy: string;
  assignedAt: string;
  returnedAt?: string;
  returnedTo?: string;
  status: 'active' | 'returned' | 'lost' | 'pending_return';
  depositAmount?: number;
  depositPaid: boolean;
  depositRefunded: boolean;
  notes?: string;
  acknowledgementSigned: boolean;
  acknowledgementSignedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccessAuditLog {
  id: string;
  propertyId: string;
  eventType: AuditEventType;
  keyId?: string;
  deviceId?: string;
  accessPointId?: string;
  zoneId?: string;
  userId: string;
  userType: 'tenant' | 'staff' | 'vendor' | 'system';
  success: boolean;
  failureReason?: string;
  ipAddress?: string;
  userAgent?: string;
  location?: string;
  metadata?: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export interface LockoutEvent {
  id: string;
  propertyId: string;
  tenantId: string;
  unitId: string;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  method?: 'master_key' | 'locksmith' | 'code_reset' | 'credential_reissue';
  fee?: number;
  feePaid: boolean;
  notes?: string;
  status: 'pending' | 'in_progress' | 'resolved' | 'cancelled';
  createdAt: string;
}

export interface KeyRequest {
  id: string;
  propertyId: string;
  requestedBy: string;
  requestType: 'new_key' | 'replacement' | 'additional_copy' | 'access_upgrade' | 'temporary_access';
  keyType?: KeyType;
  deviceType?: AccessDeviceType;
  reason: string;
  status: 'pending' | 'approved' | 'denied' | 'fulfilled';
  approvedBy?: string;
  approvedAt?: string;
  deniedReason?: string;
  fulfillmentNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemporaryAccess {
  id: string;
  propertyId: string;
  grantedTo: string;
  grantedToType: 'guest' | 'vendor' | 'contractor' | 'delivery';
  grantedBy: string;
  accessZones: string[];
  accessCode?: string;
  validFrom: string;
  validTo: string;
  maxUses?: number;
  currentUses: number;
  status: 'active' | 'expired' | 'revoked' | 'exhausted';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// IN-MEMORY STORES
// ============================================================================

export const physicalKeys = new Map<string, PhysicalKey>();
export const accessDevices = new Map<string, AccessDevice>();
export const accessZones = new Map<string, AccessZone>();
export const accessPoints = new Map<string, AccessPoint>();
export const keyAssignments = new Map<string, KeyAssignment>();
export const accessAuditLogs = new Map<string, AccessAuditLog>();
export const lockoutEvents = new Map<string, LockoutEvent>();
export const keyRequests = new Map<string, KeyRequest>();
export const temporaryAccesses = new Map<string, TemporaryAccess>();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function generateKeyNumber(): string {
  const prefix = 'KEY';
  const number = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
  return `${prefix}-${number}`;
}

export function generateAccessCode(length: number = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += Math.floor(Math.random() * 10).toString();
  }
  return code;
}

export function generateDeviceId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 12; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

export function isAccessValid(
  device: AccessDevice,
  zone: AccessZone,
  timestamp?: Date
): { valid: boolean; reason?: string } {
  const now = timestamp || new Date();

  // Check device status
  if (device.status !== 'active') {
    return { valid: false, reason: `Device is ${device.status}` };
  }

  // Check expiration
  if (device.expiresAt && new Date(device.expiresAt) < now) {
    return { valid: false, reason: 'Device has expired' };
  }

  // Check zone access
  if (!device.accessZones.includes(zone.id)) {
    return { valid: false, reason: 'Device not authorized for this zone' };
  }

  // Check access level
  const levelHierarchy: AccessLevel[] = ['resident', 'staff', 'maintenance', 'vendor', 'emergency', 'master'];
  const deviceLevelIndex = levelHierarchy.indexOf(device.accessLevel);
  const requiredLevelIndex = levelHierarchy.indexOf(zone.requiredLevel);

  if (deviceLevelIndex < requiredLevelIndex && device.accessLevel !== 'master') {
    return { valid: false, reason: 'Insufficient access level' };
  }

  // Check schedule restrictions
  if (zone.scheduleRestrictions) {
    const dayOfWeek = now.getDay();
    if (!zone.scheduleRestrictions.dayOfWeek.includes(dayOfWeek)) {
      return { valid: false, reason: 'Access not allowed on this day' };
    }

    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    if (currentTime < zone.scheduleRestrictions.startTime || currentTime > zone.scheduleRestrictions.endTime) {
      return { valid: false, reason: 'Access not allowed at this time' };
    }
  }

  return { valid: true };
}

export function getKeyInventory(propertyId: string): {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  assignedCount: number;
  availableCount: number;
} {
  const keys = Array.from(physicalKeys.values()).filter((k) => k.propertyId === propertyId);

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  keys.forEach((key) => {
    byType[key.type] = (byType[key.type] || 0) + key.copies;
    byStatus[key.status] = (byStatus[key.status] || 0) + key.copies;
  });

  return {
    total: keys.reduce((sum, k) => sum + k.copies, 0),
    byType,
    byStatus,
    assignedCount: byStatus['assigned'] || 0,
    availableCount: byStatus['available'] || 0,
  };
}

export function getDeviceStats(propertyId: string): {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  activeCount: number;
  expiringSoon: number;
} {
  const devices = Array.from(accessDevices.values()).filter((d) => d.propertyId === propertyId);

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  let expiringSoon = 0;

  devices.forEach((device) => {
    byType[device.type] = (byType[device.type] || 0) + 1;
    byStatus[device.status] = (byStatus[device.status] || 0) + 1;

    if (device.expiresAt) {
      const expiresAt = new Date(device.expiresAt);
      if (expiresAt <= thirtyDaysFromNow && expiresAt > new Date()) {
        expiringSoon++;
      }
    }
  });

  return {
    total: devices.length,
    byType,
    byStatus,
    activeCount: byStatus['active'] || 0,
    expiringSoon,
  };
}

export function getAccessActivitySummary(
  propertyId: string,
  startDate?: string,
  endDate?: string
): {
  totalEvents: number;
  successfulAccess: number;
  deniedAccess: number;
  byEventType: Record<string, number>;
  byZone: Record<string, number>;
  peakHours: { hour: number; count: number }[];
} {
  let logs = Array.from(accessAuditLogs.values()).filter((l) => l.propertyId === propertyId);

  if (startDate) {
    logs = logs.filter((l) => l.occurredAt >= startDate);
  }
  if (endDate) {
    logs = logs.filter((l) => l.occurredAt <= endDate);
  }

  const byEventType: Record<string, number> = {};
  const byZone: Record<string, number> = {};
  const hourCounts: Record<number, number> = {};

  logs.forEach((log) => {
    byEventType[log.eventType] = (byEventType[log.eventType] || 0) + 1;

    if (log.zoneId) {
      byZone[log.zoneId] = (byZone[log.zoneId] || 0) + 1;
    }

    const hour = new Date(log.occurredAt).getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });

  const peakHours = Object.entries(hourCounts)
    .map(([hour, count]) => ({ hour: parseInt(hour), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalEvents: logs.length,
    successfulAccess: logs.filter((l) => l.success).length,
    deniedAccess: logs.filter((l) => !l.success).length,
    byEventType,
    byZone,
    peakHours,
  };
}

export function checkTemporaryAccess(accessId: string): { valid: boolean; reason?: string } {
  const access = temporaryAccesses.get(accessId);
  if (!access) {
    return { valid: false, reason: 'Access not found' };
  }

  const now = new Date();
  const validFrom = new Date(access.validFrom);
  const validTo = new Date(access.validTo);

  if (access.status !== 'active') {
    return { valid: false, reason: `Access is ${access.status}` };
  }

  if (now < validFrom) {
    return { valid: false, reason: 'Access not yet valid' };
  }

  if (now > validTo) {
    return { valid: false, reason: 'Access has expired' };
  }

  if (access.maxUses && access.currentUses >= access.maxUses) {
    return { valid: false, reason: 'Maximum uses exceeded' };
  }

  return { valid: true };
}

// ============================================================================
// SCHEMAS
// ============================================================================

const KeySchema = z.object({
  propertyId: z.string(),
  keyNumber: z.string().optional(),
  type: z.enum(['master', 'unit', 'common_area', 'mailbox', 'storage', 'gate', 'amenity', 'emergency']),
  brand: z.string().optional(),
  cutCode: z.string().optional(),
  copies: z.number().int().positive().default(1),
  unitId: z.string().optional(),
  description: z.string().optional(),
});

const DeviceSchema = z.object({
  propertyId: z.string(),
  type: z.enum(['fob', 'card', 'remote', 'keypad_code', 'biometric', 'mobile_credential']),
  accessLevel: z.enum(['resident', 'staff', 'maintenance', 'vendor', 'emergency', 'master']),
  accessZones: z.array(z.string()),
  expiresAt: z.string().optional(),
  pin: z.string().optional(),
});

const ZoneSchema = z.object({
  propertyId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  type: z.enum(['building', 'floor', 'unit', 'amenity', 'parking', 'restricted']),
  parentZoneId: z.string().optional(),
  accessPoints: z.array(z.string()).default([]),
  requiredLevel: z.enum(['resident', 'staff', 'maintenance', 'vendor', 'emergency', 'master']),
  scheduleRestrictions: z.object({
    dayOfWeek: z.array(z.number().int().min(0).max(6)),
    startTime: z.string(),
    endTime: z.string(),
  }).optional(),
});

const AccessPointSchema = z.object({
  propertyId: z.string(),
  zoneId: z.string(),
  name: z.string(),
  type: z.enum(['door', 'gate', 'turnstile', 'elevator', 'intercom']),
  location: z.string(),
  hardwareType: z.string(),
  hardwareId: z.string().optional(),
  ipAddress: z.string().optional(),
});

const AssignmentSchema = z.object({
  keyId: z.string().optional(),
  deviceId: z.string().optional(),
  assignedTo: z.string(),
  assignedToType: z.enum(['tenant', 'staff', 'vendor', 'contractor']),
  assignedBy: z.string(),
  depositAmount: z.number().nonnegative().optional(),
  depositPaid: z.boolean().default(false),
  notes: z.string().optional(),
  acknowledgementSigned: z.boolean().default(false),
});

const TemporaryAccessSchema = z.object({
  propertyId: z.string(),
  grantedTo: z.string(),
  grantedToType: z.enum(['guest', 'vendor', 'contractor', 'delivery']),
  grantedBy: z.string(),
  accessZones: z.array(z.string()),
  validFrom: z.string(),
  validTo: z.string(),
  maxUses: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

const KeyRequestSchema = z.object({
  propertyId: z.string(),
  requestedBy: z.string(),
  requestType: z.enum(['new_key', 'replacement', 'additional_copy', 'access_upgrade', 'temporary_access']),
  keyType: z.enum(['master', 'unit', 'common_area', 'mailbox', 'storage', 'gate', 'amenity', 'emergency']).optional(),
  deviceType: z.enum(['fob', 'card', 'remote', 'keypad_code', 'biometric', 'mobile_credential']).optional(),
  reason: z.string(),
});

const LockoutSchema = z.object({
  propertyId: z.string(),
  tenantId: z.string(),
  unitId: z.string(),
  notes: z.string().optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

export const keyRoutes: FastifyPluginAsync = async (app) => {
  // ─────────────────────────────────────────────────────────────────────────
  // PHYSICAL KEYS
  // ─────────────────────────────────────────────────────────────────────────

  // Create key
  app.post(
    '/keys',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof KeySchema> }>,
      reply
    ) => {
      const data = KeySchema.parse(request.body);
      const now = new Date().toISOString();

      const key: PhysicalKey = {
        id: `key_${Date.now()}`,
        keyNumber: data.keyNumber || generateKeyNumber(),
        ...data,
        status: 'available',
        createdAt: now,
        updatedAt: now,
      };

      physicalKeys.set(key.id, key);
      return reply.status(201).send(key);
    }
  );

  // List keys
  app.get(
    '/keys',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; type?: KeyType; status?: KeyStatus; unitId?: string };
      }>,
      reply
    ) => {
      let keys = Array.from(physicalKeys.values());

      if (request.query.propertyId) {
        keys = keys.filter((k) => k.propertyId === request.query.propertyId);
      }
      if (request.query.type) {
        keys = keys.filter((k) => k.type === request.query.type);
      }
      if (request.query.status) {
        keys = keys.filter((k) => k.status === request.query.status);
      }
      if (request.query.unitId) {
        keys = keys.filter((k) => k.unitId === request.query.unitId);
      }

      return reply.send(keys);
    }
  );

  // Get key inventory stats
  app.get(
    '/keys/inventory',
    async (
      request: FastifyRequest<{ Querystring: { propertyId: string } }>,
      reply
    ) => {
      const stats = getKeyInventory(request.query.propertyId);
      return reply.send(stats);
    }
  );

  // Update key status
  app.patch(
    '/keys/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: Partial<PhysicalKey>;
      }>,
      reply
    ) => {
      const key = physicalKeys.get(request.params.id);
      if (!key) {
        return reply.status(404).send({ error: 'Key not found' });
      }

      const updated: PhysicalKey = {
        ...key,
        ...request.body,
        updatedAt: new Date().toISOString(),
      };

      physicalKeys.set(key.id, updated);
      return reply.send(updated);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ACCESS DEVICES
  // ─────────────────────────────────────────────────────────────────────────

  // Create device
  app.post(
    '/devices',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof DeviceSchema> }>,
      reply
    ) => {
      const data = DeviceSchema.parse(request.body);
      const now = new Date().toISOString();

      const device: AccessDevice = {
        id: `acd_${Date.now()}`,
        deviceId: generateDeviceId(),
        ...data,
        status: 'active',
        usageCount: 0,
        createdAt: now,
        updatedAt: now,
      };

      accessDevices.set(device.id, device);
      return reply.status(201).send(device);
    }
  );

  // List devices
  app.get(
    '/devices',
    async (
      request: FastifyRequest<{
        Querystring: {
          propertyId?: string;
          type?: AccessDeviceType;
          status?: string;
          assignedTo?: string;
        };
      }>,
      reply
    ) => {
      let devices = Array.from(accessDevices.values());

      if (request.query.propertyId) {
        devices = devices.filter((d) => d.propertyId === request.query.propertyId);
      }
      if (request.query.type) {
        devices = devices.filter((d) => d.type === request.query.type);
      }
      if (request.query.status) {
        devices = devices.filter((d) => d.status === request.query.status);
      }
      if (request.query.assignedTo) {
        devices = devices.filter((d) => d.assignedTo === request.query.assignedTo);
      }

      return reply.send(devices);
    }
  );

  // Get device stats
  app.get(
    '/devices/stats',
    async (
      request: FastifyRequest<{ Querystring: { propertyId: string } }>,
      reply
    ) => {
      const stats = getDeviceStats(request.query.propertyId);
      return reply.send(stats);
    }
  );

  // Assign device
  app.post(
    '/devices/:id/assign',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { assignedTo: string; assignedToType: string };
      }>,
      reply
    ) => {
      const device = accessDevices.get(request.params.id);
      if (!device) {
        return reply.status(404).send({ error: 'Device not found' });
      }

      const now = new Date().toISOString();

      device.assignedTo = request.body.assignedTo;
      device.assignedToType = request.body.assignedToType as 'tenant' | 'staff' | 'vendor';
      device.assignedAt = now;
      device.updatedAt = now;

      accessDevices.set(device.id, device);
      return reply.send(device);
    }
  );

  // Deactivate device
  app.post(
    '/devices/:id/deactivate',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { reason?: string };
      }>,
      reply
    ) => {
      const device = accessDevices.get(request.params.id);
      if (!device) {
        return reply.status(404).send({ error: 'Device not found' });
      }

      const now = new Date().toISOString();

      device.status = 'inactive';
      device.updatedAt = now;

      // Log the deactivation
      const log: AccessAuditLog = {
        id: `aal_${Date.now()}`,
        propertyId: device.propertyId,
        eventType: 'deactivated',
        deviceId: device.id,
        userId: 'system',
        userType: 'system',
        success: true,
        metadata: { reason: request.body.reason },
        occurredAt: now,
        createdAt: now,
      };

      accessAuditLogs.set(log.id, log);
      accessDevices.set(device.id, device);

      return reply.send(device);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ACCESS ZONES
  // ─────────────────────────────────────────────────────────────────────────

  // Create zone
  app.post(
    '/zones',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof ZoneSchema> }>,
      reply
    ) => {
      const data = ZoneSchema.parse(request.body);
      const now = new Date().toISOString();

      const zone: AccessZone = {
        id: `acz_${Date.now()}`,
        ...data,
        createdAt: now,
        updatedAt: now,
      };

      accessZones.set(zone.id, zone);
      return reply.status(201).send(zone);
    }
  );

  // List zones
  app.get(
    '/zones',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; type?: string };
      }>,
      reply
    ) => {
      let zones = Array.from(accessZones.values());

      if (request.query.propertyId) {
        zones = zones.filter((z) => z.propertyId === request.query.propertyId);
      }
      if (request.query.type) {
        zones = zones.filter((z) => z.type === request.query.type);
      }

      return reply.send(zones);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // ACCESS POINTS
  // ─────────────────────────────────────────────────────────────────────────

  // Create access point
  app.post(
    '/access-points',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof AccessPointSchema> }>,
      reply
    ) => {
      const data = AccessPointSchema.parse(request.body);
      const now = new Date().toISOString();

      const point: AccessPoint = {
        id: `acp_${Date.now()}`,
        ...data,
        isOnline: true,
        lastOnlineAt: now,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      accessPoints.set(point.id, point);

      // Add to zone's access points
      const zone = accessZones.get(data.zoneId);
      if (zone) {
        zone.accessPoints.push(point.id);
        zone.updatedAt = now;
        accessZones.set(zone.id, zone);
      }

      return reply.status(201).send(point);
    }
  );

  // List access points
  app.get(
    '/access-points',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; zoneId?: string; status?: string };
      }>,
      reply
    ) => {
      let points = Array.from(accessPoints.values());

      if (request.query.propertyId) {
        points = points.filter((p) => p.propertyId === request.query.propertyId);
      }
      if (request.query.zoneId) {
        points = points.filter((p) => p.zoneId === request.query.zoneId);
      }
      if (request.query.status) {
        points = points.filter((p) => p.status === request.query.status);
      }

      return reply.send(points);
    }
  );

  // Update access point status
  app.patch(
    '/access-points/:id/status',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { status: 'active' | 'maintenance' | 'offline' | 'disabled'; isOnline?: boolean };
      }>,
      reply
    ) => {
      const point = accessPoints.get(request.params.id);
      if (!point) {
        return reply.status(404).send({ error: 'Access point not found' });
      }

      const now = new Date().toISOString();

      point.status = request.body.status;
      if (request.body.isOnline !== undefined) {
        point.isOnline = request.body.isOnline;
        if (request.body.isOnline) {
          point.lastOnlineAt = now;
        }
      }
      point.updatedAt = now;

      accessPoints.set(point.id, point);
      return reply.send(point);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // KEY ASSIGNMENTS
  // ─────────────────────────────────────────────────────────────────────────

  // Create assignment
  app.post(
    '/assignments',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof AssignmentSchema> }>,
      reply
    ) => {
      const data = AssignmentSchema.parse(request.body);
      const now = new Date().toISOString();

      if (!data.keyId && !data.deviceId) {
        return reply.status(400).send({ error: 'Either keyId or deviceId is required' });
      }

      // Update key status if key assignment
      if (data.keyId) {
        const key = physicalKeys.get(data.keyId);
        if (!key) {
          return reply.status(404).send({ error: 'Key not found' });
        }
        key.status = 'assigned';
        key.lastAssignedTo = data.assignedTo;
        key.lastAssignedAt = now;
        key.updatedAt = now;
        physicalKeys.set(key.id, key);
      }

      // Update device if device assignment
      if (data.deviceId) {
        const device = accessDevices.get(data.deviceId);
        if (!device) {
          return reply.status(404).send({ error: 'Device not found' });
        }
        device.assignedTo = data.assignedTo;
        device.assignedToType = data.assignedToType as 'tenant' | 'staff' | 'vendor';
        device.assignedAt = now;
        device.updatedAt = now;
        accessDevices.set(device.id, device);
      }

      const assignment: KeyAssignment = {
        id: `kas_${Date.now()}`,
        ...data,
        assignedAt: now,
        status: 'active',
        depositRefunded: false,
        acknowledgementSignedAt: data.acknowledgementSigned ? now : undefined,
        createdAt: now,
        updatedAt: now,
      };

      keyAssignments.set(assignment.id, assignment);

      // Log the assignment
      const log: AccessAuditLog = {
        id: `aal_${Date.now()}`,
        propertyId: data.keyId
          ? physicalKeys.get(data.keyId)?.propertyId || ''
          : accessDevices.get(data.deviceId!)?.propertyId || '',
        eventType: 'assigned',
        keyId: data.keyId,
        deviceId: data.deviceId,
        userId: data.assignedBy,
        userType: 'staff',
        success: true,
        metadata: { assignedTo: data.assignedTo, assignedToType: data.assignedToType },
        occurredAt: now,
        createdAt: now,
      };

      accessAuditLogs.set(log.id, log);

      return reply.status(201).send(assignment);
    }
  );

  // Return key/device
  app.post(
    '/assignments/:id/return',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { returnedTo: string; refundDeposit?: boolean };
      }>,
      reply
    ) => {
      const assignment = keyAssignments.get(request.params.id);
      if (!assignment) {
        return reply.status(404).send({ error: 'Assignment not found' });
      }

      const now = new Date().toISOString();

      assignment.status = 'returned';
      assignment.returnedAt = now;
      assignment.returnedTo = request.body.returnedTo;
      if (request.body.refundDeposit && assignment.depositPaid) {
        assignment.depositRefunded = true;
      }
      assignment.updatedAt = now;

      // Update key status
      if (assignment.keyId) {
        const key = physicalKeys.get(assignment.keyId);
        if (key) {
          key.status = 'available';
          key.updatedAt = now;
          physicalKeys.set(key.id, key);
        }
      }

      // Clear device assignment
      if (assignment.deviceId) {
        const device = accessDevices.get(assignment.deviceId);
        if (device) {
          device.assignedTo = undefined;
          device.assignedToType = undefined;
          device.assignedAt = undefined;
          device.updatedAt = now;
          accessDevices.set(device.id, device);
        }
      }

      keyAssignments.set(assignment.id, assignment);

      // Log the return
      const log: AccessAuditLog = {
        id: `aal_${Date.now()}`,
        propertyId: assignment.keyId
          ? physicalKeys.get(assignment.keyId)?.propertyId || ''
          : accessDevices.get(assignment.deviceId!)?.propertyId || '',
        eventType: 'returned',
        keyId: assignment.keyId,
        deviceId: assignment.deviceId,
        userId: request.body.returnedTo,
        userType: 'staff',
        success: true,
        occurredAt: now,
        createdAt: now,
      };

      accessAuditLogs.set(log.id, log);

      return reply.send(assignment);
    }
  );

  // Report lost
  app.post(
    '/assignments/:id/report-lost',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { reportedBy: string; notes?: string };
      }>,
      reply
    ) => {
      const assignment = keyAssignments.get(request.params.id);
      if (!assignment) {
        return reply.status(404).send({ error: 'Assignment not found' });
      }

      const now = new Date().toISOString();

      assignment.status = 'lost';
      assignment.notes = request.body.notes;
      assignment.updatedAt = now;

      // Update key/device status
      if (assignment.keyId) {
        const key = physicalKeys.get(assignment.keyId);
        if (key) {
          key.status = 'lost';
          key.updatedAt = now;
          physicalKeys.set(key.id, key);
        }
      }

      if (assignment.deviceId) {
        const device = accessDevices.get(assignment.deviceId);
        if (device) {
          device.status = 'lost';
          device.updatedAt = now;
          accessDevices.set(device.id, device);
        }
      }

      keyAssignments.set(assignment.id, assignment);

      // Log the lost report
      const log: AccessAuditLog = {
        id: `aal_${Date.now()}`,
        propertyId: assignment.keyId
          ? physicalKeys.get(assignment.keyId)?.propertyId || ''
          : accessDevices.get(assignment.deviceId!)?.propertyId || '',
        eventType: 'lost',
        keyId: assignment.keyId,
        deviceId: assignment.deviceId,
        userId: request.body.reportedBy,
        userType: 'staff',
        success: true,
        metadata: { notes: request.body.notes },
        occurredAt: now,
        createdAt: now,
      };

      accessAuditLogs.set(log.id, log);

      return reply.send(assignment);
    }
  );

  // List assignments
  app.get(
    '/assignments',
    async (
      request: FastifyRequest<{
        Querystring: { assignedTo?: string; status?: string; keyId?: string; deviceId?: string };
      }>,
      reply
    ) => {
      let assignments = Array.from(keyAssignments.values());

      if (request.query.assignedTo) {
        assignments = assignments.filter((a) => a.assignedTo === request.query.assignedTo);
      }
      if (request.query.status) {
        assignments = assignments.filter((a) => a.status === request.query.status);
      }
      if (request.query.keyId) {
        assignments = assignments.filter((a) => a.keyId === request.query.keyId);
      }
      if (request.query.deviceId) {
        assignments = assignments.filter((a) => a.deviceId === request.query.deviceId);
      }

      return reply.send(assignments);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // TEMPORARY ACCESS
  // ─────────────────────────────────────────────────────────────────────────

  // Grant temporary access
  app.post(
    '/temporary-access',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof TemporaryAccessSchema> }>,
      reply
    ) => {
      const data = TemporaryAccessSchema.parse(request.body);
      const now = new Date().toISOString();

      const access: TemporaryAccess = {
        id: `tac_${Date.now()}`,
        ...data,
        accessCode: generateAccessCode(8),
        currentUses: 0,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };

      temporaryAccesses.set(access.id, access);
      return reply.status(201).send(access);
    }
  );

  // Validate temporary access
  app.post(
    '/temporary-access/:id/validate',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const result = checkTemporaryAccess(request.params.id);

      if (result.valid) {
        const access = temporaryAccesses.get(request.params.id)!;
        access.currentUses++;
        access.updatedAt = new Date().toISOString();

        if (access.maxUses && access.currentUses >= access.maxUses) {
          access.status = 'exhausted';
        }

        temporaryAccesses.set(access.id, access);
      }

      return reply.send(result);
    }
  );

  // Revoke temporary access
  app.post(
    '/temporary-access/:id/revoke',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const access = temporaryAccesses.get(request.params.id);
      if (!access) {
        return reply.status(404).send({ error: 'Temporary access not found' });
      }

      access.status = 'revoked';
      access.updatedAt = new Date().toISOString();

      temporaryAccesses.set(access.id, access);
      return reply.send(access);
    }
  );

  // List temporary access
  app.get(
    '/temporary-access',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; status?: string; grantedTo?: string };
      }>,
      reply
    ) => {
      let accesses = Array.from(temporaryAccesses.values());

      if (request.query.propertyId) {
        accesses = accesses.filter((a) => a.propertyId === request.query.propertyId);
      }
      if (request.query.status) {
        accesses = accesses.filter((a) => a.status === request.query.status);
      }
      if (request.query.grantedTo) {
        accesses = accesses.filter((a) => a.grantedTo === request.query.grantedTo);
      }

      return reply.send(accesses);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // KEY REQUESTS
  // ─────────────────────────────────────────────────────────────────────────

  // Create request
  app.post(
    '/requests',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof KeyRequestSchema> }>,
      reply
    ) => {
      const data = KeyRequestSchema.parse(request.body);
      const now = new Date().toISOString();

      const keyRequest: KeyRequest = {
        id: `krq_${Date.now()}`,
        ...data,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      };

      keyRequests.set(keyRequest.id, keyRequest);
      return reply.status(201).send(keyRequest);
    }
  );

  // Approve/deny request
  app.post(
    '/requests/:id/decision',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { approved: boolean; decidedBy: string; reason?: string };
      }>,
      reply
    ) => {
      const keyRequest = keyRequests.get(request.params.id);
      if (!keyRequest) {
        return reply.status(404).send({ error: 'Request not found' });
      }

      const now = new Date().toISOString();

      if (request.body.approved) {
        keyRequest.status = 'approved';
        keyRequest.approvedBy = request.body.decidedBy;
        keyRequest.approvedAt = now;
      } else {
        keyRequest.status = 'denied';
        keyRequest.deniedReason = request.body.reason;
      }

      keyRequest.updatedAt = now;
      keyRequests.set(keyRequest.id, keyRequest);

      return reply.send(keyRequest);
    }
  );

  // List requests
  app.get(
    '/requests',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; status?: string; requestedBy?: string };
      }>,
      reply
    ) => {
      let requests = Array.from(keyRequests.values());

      if (request.query.propertyId) {
        requests = requests.filter((r) => r.propertyId === request.query.propertyId);
      }
      if (request.query.status) {
        requests = requests.filter((r) => r.status === request.query.status);
      }
      if (request.query.requestedBy) {
        requests = requests.filter((r) => r.requestedBy === request.query.requestedBy);
      }

      return reply.send(requests);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // LOCKOUTS
  // ─────────────────────────────────────────────────────────────────────────

  // Report lockout
  app.post(
    '/lockouts',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof LockoutSchema> }>,
      reply
    ) => {
      const data = LockoutSchema.parse(request.body);
      const now = new Date().toISOString();

      const lockout: LockoutEvent = {
        id: `lck_${Date.now()}`,
        ...data,
        requestedAt: now,
        status: 'pending',
        feePaid: false,
        createdAt: now,
      };

      lockoutEvents.set(lockout.id, lockout);
      return reply.status(201).send(lockout);
    }
  );

  // Resolve lockout
  app.post(
    '/lockouts/:id/resolve',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          resolvedBy: string;
          method: 'master_key' | 'locksmith' | 'code_reset' | 'credential_reissue';
          fee?: number;
          notes?: string;
        };
      }>,
      reply
    ) => {
      const lockout = lockoutEvents.get(request.params.id);
      if (!lockout) {
        return reply.status(404).send({ error: 'Lockout event not found' });
      }

      const now = new Date().toISOString();

      lockout.status = 'resolved';
      lockout.resolvedAt = now;
      lockout.resolvedBy = request.body.resolvedBy;
      lockout.method = request.body.method;
      lockout.fee = request.body.fee;
      lockout.notes = request.body.notes;

      lockoutEvents.set(lockout.id, lockout);
      return reply.send(lockout);
    }
  );

  // List lockouts
  app.get(
    '/lockouts',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; tenantId?: string; status?: string };
      }>,
      reply
    ) => {
      let lockouts = Array.from(lockoutEvents.values());

      if (request.query.propertyId) {
        lockouts = lockouts.filter((l) => l.propertyId === request.query.propertyId);
      }
      if (request.query.tenantId) {
        lockouts = lockouts.filter((l) => l.tenantId === request.query.tenantId);
      }
      if (request.query.status) {
        lockouts = lockouts.filter((l) => l.status === request.query.status);
      }

      return reply.send(lockouts);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIT LOGS
  // ─────────────────────────────────────────────────────────────────────────

  // List audit logs
  app.get(
    '/audit-logs',
    async (
      request: FastifyRequest<{
        Querystring: {
          propertyId?: string;
          eventType?: string;
          userId?: string;
          startDate?: string;
          endDate?: string;
          limit?: string;
        };
      }>,
      reply
    ) => {
      let logs = Array.from(accessAuditLogs.values());

      if (request.query.propertyId) {
        logs = logs.filter((l) => l.propertyId === request.query.propertyId);
      }
      if (request.query.eventType) {
        logs = logs.filter((l) => l.eventType === request.query.eventType);
      }
      if (request.query.userId) {
        logs = logs.filter((l) => l.userId === request.query.userId);
      }
      if (request.query.startDate) {
        logs = logs.filter((l) => l.occurredAt >= request.query.startDate!);
      }
      if (request.query.endDate) {
        logs = logs.filter((l) => l.occurredAt <= request.query.endDate!);
      }

      logs = logs.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

      if (request.query.limit) {
        logs = logs.slice(0, parseInt(request.query.limit));
      }

      return reply.send(logs);
    }
  );

  // Get activity summary
  app.get(
    '/audit-logs/summary',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId: string; startDate?: string; endDate?: string };
      }>,
      reply
    ) => {
      const summary = getAccessActivitySummary(
        request.query.propertyId,
        request.query.startDate,
        request.query.endDate
      );
      return reply.send(summary);
    }
  );

  // Record access attempt
  app.post(
    '/audit-logs/access',
    async (
      request: FastifyRequest<{
        Body: {
          propertyId: string;
          deviceId: string;
          accessPointId: string;
          zoneId: string;
          userId: string;
          userType: 'tenant' | 'staff' | 'vendor' | 'system';
        };
      }>,
      reply
    ) => {
      const now = new Date().toISOString();

      const device = accessDevices.get(request.body.deviceId);
      const zone = accessZones.get(request.body.zoneId);

      let success = false;
      let failureReason: string | undefined;

      if (device && zone) {
        const validation = isAccessValid(device, zone);
        success = validation.valid;
        failureReason = validation.reason;

        if (success) {
          device.lastUsedAt = now;
          device.usageCount++;
          device.updatedAt = now;
          accessDevices.set(device.id, device);
        }
      } else {
        failureReason = !device ? 'Device not found' : 'Zone not found';
      }

      const log: AccessAuditLog = {
        id: `aal_${Date.now()}`,
        propertyId: request.body.propertyId,
        eventType: success ? 'access_granted' : 'access_denied',
        deviceId: request.body.deviceId,
        accessPointId: request.body.accessPointId,
        zoneId: request.body.zoneId,
        userId: request.body.userId,
        userType: request.body.userType,
        success,
        failureReason,
        occurredAt: now,
        createdAt: now,
      };

      accessAuditLogs.set(log.id, log);
      return reply.status(201).send(log);
    }
  );
};
