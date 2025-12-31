import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  prisma,
  type KeyType,
  type KeyStatus,
  type AccessDeviceType,
  type AccessDeviceStatus,
  type AccessLevel,
  type AccessZoneType,
  type AccessPointType,
  type AccessPointStatus,
  type AuditEventType,
  type LockoutStatus,
  type TemporaryAccessStatus,
} from '@realriches/database';

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

export async function getKeyInventory(propertyId: string) {
  const keys = await prisma.propertyKey.findMany({
    where: { propertyId },
  });

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

export async function getDeviceStats(propertyId: string) {
  const devices = await prisma.accessDevice.findMany({
    where: { propertyId },
  });

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  let expiringSoon = 0;

  devices.forEach((device) => {
    byType[device.type] = (byType[device.type] || 0) + 1;
    byStatus[device.status] = (byStatus[device.status] || 0) + 1;

    if (device.expiresAt) {
      if (device.expiresAt <= thirtyDaysFromNow && device.expiresAt > new Date()) {
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

export async function getAccessActivitySummary(
  propertyId: string,
  startDate?: string,
  endDate?: string
) {
  const whereClause: Record<string, unknown> = { propertyId };

  if (startDate || endDate) {
    whereClause.occurredAt = {};
    if (startDate) (whereClause.occurredAt as Record<string, Date>).gte = new Date(startDate);
    if (endDate) (whereClause.occurredAt as Record<string, Date>).lte = new Date(endDate);
  }

  const logs = await prisma.accessAuditLog.findMany({ where: whereClause });

  const byEventType: Record<string, number> = {};
  const byZone: Record<string, number> = {};
  const hourCounts: Record<number, number> = {};

  logs.forEach((log) => {
    byEventType[log.eventType] = (byEventType[log.eventType] || 0) + 1;

    if (log.zoneId) {
      byZone[log.zoneId] = (byZone[log.zoneId] || 0) + 1;
    }

    const hour = log.occurredAt.getHours();
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

export interface PhysicalKey {
  id: string;
  keyNumber: string;
  type: string;
  status: 'in_stock' | 'assigned' | 'lost' | 'damaged' | 'destroyed';
}

export interface AccessDevice {
  id: string;
  deviceId: string;
  status: 'active' | 'inactive' | 'suspended' | 'lost' | 'expired';
  accessZones: string[];
  expiresAt?: Date | null;
}

export interface AccessZone {
  id: string;
  name: string;
  type: string;
}

export interface TemporaryAccess {
  id: string;
  propertyId: string;
  zoneIds: string[];
  grantedTo: string;
  accessCode?: string;
  validFrom: Date;
  validUntil: Date;
  status: 'active' | 'used' | 'expired' | 'revoked';
}

export async function isAccessValid(
  deviceId: string,
  zoneId: string
): Promise<{ valid: boolean; reason?: string }> {
  const device = await prisma.accessDevice.findUnique({
    where: { id: deviceId },
  });

  if (!device) {
    return { valid: false, reason: 'Device not found' };
  }

  if (device.status !== 'active') {
    return { valid: false, reason: `Device is ${device.status}` };
  }

  if (device.expiresAt && new Date(device.expiresAt) < new Date()) {
    return { valid: false, reason: 'Device has expired' };
  }

  const zones = device.accessZones as string[];
  if (!zones.includes(zoneId)) {
    return { valid: false, reason: 'Not authorized for this zone' };
  }

  return { valid: true };
}

export async function checkTemporaryAccess(
  accessCode: string,
  zoneId: string
): Promise<{ valid: boolean; access?: TemporaryAccess; reason?: string }> {
  const access = await prisma.temporaryAccess.findFirst({
    where: {
      accessCode,
      status: 'active',
    },
  });

  if (!access) {
    return { valid: false, reason: 'Access code not found or expired' };
  }

  const now = new Date();
  if (now < access.validFrom || now > access.validUntil) {
    return { valid: false, reason: 'Access code is outside valid time window' };
  }

  const zones = access.zoneIds as string[];
  if (!zones.includes(zoneId)) {
    return { valid: false, reason: 'Access code not valid for this zone' };
  }

  return {
    valid: true,
    access: {
      id: access.id,
      propertyId: access.propertyId,
      zoneIds: zones,
      grantedTo: access.grantedTo,
      accessCode: access.accessCode || undefined,
      validFrom: access.validFrom,
      validUntil: access.validUntil,
      status: access.status as TemporaryAccess['status'],
    },
  };
}

// ============================================================================
// SCHEMAS
// ============================================================================

const KeySchema = z.object({
  propertyId: z.string().uuid(),
  keyNumber: z.string().optional(),
  type: z.enum(['master', 'unit', 'common_area', 'mailbox', 'storage', 'gate', 'amenity', 'emergency']),
  brand: z.string().optional(),
  cutCode: z.string().optional(),
  copies: z.number().int().positive().default(1),
  unitId: z.string().uuid().optional(),
  description: z.string().optional(),
});

const DeviceSchema = z.object({
  propertyId: z.string().uuid(),
  type: z.enum(['fob', 'card', 'remote', 'keypad_code', 'biometric', 'mobile_credential']),
  accessLevel: z.enum(['resident', 'staff', 'maintenance', 'vendor', 'emergency', 'master']),
  accessZones: z.array(z.string().uuid()),
  expiresAt: z.string().optional(),
  pin: z.string().optional(),
});

const ZoneSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  type: z.enum(['building', 'floor', 'unit', 'amenity', 'parking', 'restricted']),
  parentZoneId: z.string().uuid().optional(),
  accessPoints: z.array(z.string().uuid()).default([]),
  requiredLevel: z.enum(['resident', 'staff', 'maintenance', 'vendor', 'emergency', 'master']),
  scheduleRestrictions: z.object({
    dayOfWeek: z.array(z.number().int().min(0).max(6)),
    startTime: z.string(),
    endTime: z.string(),
  }).optional(),
});

const AccessPointSchema = z.object({
  propertyId: z.string().uuid(),
  zoneId: z.string().uuid(),
  name: z.string(),
  type: z.enum(['door', 'gate', 'turnstile', 'elevator', 'intercom']),
  location: z.string(),
  hardwareType: z.string(),
  hardwareId: z.string().optional(),
  ipAddress: z.string().optional(),
});

const AssignmentSchema = z.object({
  keyId: z.string().uuid().optional(),
  deviceId: z.string().uuid().optional(),
  assignedTo: z.string().uuid(),
  assignedToType: z.enum(['tenant', 'staff', 'vendor', 'contractor']),
  assignedBy: z.string().uuid(),
  depositAmount: z.number().nonnegative().optional(),
  depositPaid: z.boolean().default(false),
  notes: z.string().optional(),
  acknowledgementSigned: z.boolean().default(false),
});

const TemporaryAccessSchema = z.object({
  propertyId: z.string().uuid(),
  grantedTo: z.string(),
  grantedToType: z.enum(['guest', 'vendor', 'contractor', 'delivery']),
  grantedBy: z.string().uuid(),
  accessZones: z.array(z.string().uuid()),
  validFrom: z.string(),
  validTo: z.string(),
  maxUses: z.number().int().positive().optional(),
  notes: z.string().optional(),
});

const KeyRequestSchema = z.object({
  propertyId: z.string().uuid(),
  requestedBy: z.string().uuid(),
  requestType: z.enum(['new_key', 'replacement', 'additional_copy', 'access_upgrade', 'temporary_access']),
  keyType: z.enum(['master', 'unit', 'common_area', 'mailbox', 'storage', 'gate', 'amenity', 'emergency']).optional(),
  deviceType: z.enum(['fob', 'card', 'remote', 'keypad_code', 'biometric', 'mobile_credential']).optional(),
  reason: z.string(),
});

const LockoutSchema = z.object({
  propertyId: z.string().uuid(),
  tenantId: z.string().uuid(),
  unitId: z.string().uuid(),
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

      const key = await prisma.propertyKey.create({
        data: {
          propertyId: data.propertyId,
          keyNumber: data.keyNumber || generateKeyNumber(),
          type: data.type as KeyType,
          status: 'available',
          brand: data.brand,
          cutCode: data.cutCode,
          copies: data.copies,
          unitId: data.unitId,
          description: data.description,
        },
      });

      return reply.status(201).send(key);
    }
  );

  // List keys
  app.get(
    '/keys',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; type?: string; status?: string; unitId?: string };
      }>,
      reply
    ) => {
      const { propertyId, type, status, unitId } = request.query;

      const keys = await prisma.propertyKey.findMany({
        where: {
          ...(propertyId ? { propertyId } : {}),
          ...(type ? { type: type as KeyType } : {}),
          ...(status ? { status: status as KeyStatus } : {}),
          ...(unitId ? { unitId } : {}),
        },
      });

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
      const stats = await getKeyInventory(request.query.propertyId);
      return reply.send(stats);
    }
  );

  // Update key
  app.patch(
    '/keys/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: Partial<{ status: string; brand: string; cutCode: string; copies: number; description: string; notes: string }>;
      }>,
      reply
    ) => {
      const key = await prisma.propertyKey.findUnique({
        where: { id: request.params.id },
      });

      if (!key) {
        return reply.status(404).send({ error: 'Key not found' });
      }

      const { status, brand, cutCode, copies, description, notes } = request.body;
      const updated = await prisma.propertyKey.update({
        where: { id: request.params.id },
        data: {
          ...(status !== undefined && { status: status as KeyStatus }),
          ...(brand !== undefined && { brand }),
          ...(cutCode !== undefined && { cutCode }),
          ...(copies !== undefined && { copies }),
          ...(description !== undefined && { description }),
          ...(notes !== undefined && { notes }),
        },
      });

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

      const device = await prisma.accessDevice.create({
        data: {
          propertyId: data.propertyId,
          deviceId: generateDeviceId(),
          type: data.type as AccessDeviceType,
          status: 'active',
          accessLevel: data.accessLevel as AccessLevel,
          accessZones: data.accessZones,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          pin: data.pin,
          usageCount: 0,
        },
      });

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
          type?: string;
          status?: string;
          assignedTo?: string;
        };
      }>,
      reply
    ) => {
      const { propertyId, type, status, assignedTo } = request.query;

      const devices = await prisma.accessDevice.findMany({
        where: {
          ...(propertyId ? { propertyId } : {}),
          ...(type ? { type: type as AccessDeviceType } : {}),
          ...(status ? { status: status as AccessDeviceStatus } : {}),
          ...(assignedTo ? { assignedTo } : {}),
        },
      });

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
      const stats = await getDeviceStats(request.query.propertyId);
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
      const device = await prisma.accessDevice.findUnique({
        where: { id: request.params.id },
      });

      if (!device) {
        return reply.status(404).send({ error: 'Device not found' });
      }

      const updated = await prisma.accessDevice.update({
        where: { id: request.params.id },
        data: {
          assignedTo: request.body.assignedTo,
          assignedToType: request.body.assignedToType,
          assignedAt: new Date(),
        },
      });

      return reply.send(updated);
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
      const device = await prisma.accessDevice.findUnique({
        where: { id: request.params.id },
      });

      if (!device) {
        return reply.status(404).send({ error: 'Device not found' });
      }

      const now = new Date();

      const updated = await prisma.accessDevice.update({
        where: { id: request.params.id },
        data: { status: 'inactive' },
      });

      // Log the deactivation
      await prisma.accessAuditLog.create({
        data: {
          propertyId: device.propertyId,
          eventType: 'deactivated',
          deviceId: device.id,
          userId: 'system',
          userType: 'system',
          success: true,
          metadata: { reason: request.body.reason },
          occurredAt: now,
        },
      });

      return reply.send(updated);
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

      const zone = await prisma.accessZone.create({
        data: {
          propertyId: data.propertyId,
          name: data.name,
          description: data.description,
          type: data.type as AccessZoneType,
          parentZoneId: data.parentZoneId,
          accessPointIds: data.accessPoints,
          requiredLevel: data.requiredLevel as AccessLevel,
          scheduleRestrictions: data.scheduleRestrictions,
        },
      });

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
      const { propertyId, type } = request.query;

      const zones = await prisma.accessZone.findMany({
        where: {
          ...(propertyId ? { propertyId } : {}),
          ...(type ? { type: type as AccessZoneType } : {}),
        },
      });

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
      const now = new Date();

      const point = await prisma.accessPoint.create({
        data: {
          propertyId: data.propertyId,
          zoneId: data.zoneId,
          name: data.name,
          type: data.type as AccessPointType,
          location: data.location,
          hardwareType: data.hardwareType,
          hardwareId: data.hardwareId,
          ipAddress: data.ipAddress,
          isOnline: true,
          lastOnlineAt: now,
          status: 'active',
        },
      });

      // Add to zone's access points
      await prisma.accessZone.update({
        where: { id: data.zoneId },
        data: {
          accessPointIds: {
            push: point.id,
          },
        },
      });

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
      const { propertyId, zoneId, status } = request.query;

      const points = await prisma.accessPoint.findMany({
        where: {
          ...(propertyId ? { propertyId } : {}),
          ...(zoneId ? { zoneId } : {}),
          ...(status ? { status: status as AccessPointStatus } : {}),
        },
      });

      return reply.send(points);
    }
  );

  // Update access point status
  app.patch(
    '/access-points/:id/status',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { status: string; isOnline?: boolean };
      }>,
      reply
    ) => {
      const point = await prisma.accessPoint.findUnique({
        where: { id: request.params.id },
      });

      if (!point) {
        return reply.status(404).send({ error: 'Access point not found' });
      }

      const now = new Date();
      const updateData: Record<string, unknown> = {
        status: request.body.status as AccessPointStatus,
      };

      if (request.body.isOnline !== undefined) {
        updateData.isOnline = request.body.isOnline;
        if (request.body.isOnline) {
          updateData.lastOnlineAt = now;
        }
      }

      const updated = await prisma.accessPoint.update({
        where: { id: request.params.id },
        data: updateData,
      });

      return reply.send(updated);
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
      const now = new Date();

      if (!data.keyId && !data.deviceId) {
        return reply.status(400).send({ error: 'Either keyId or deviceId is required' });
      }

      let propertyId = '';

      // Update key status if key assignment
      if (data.keyId) {
        const key = await prisma.propertyKey.findUnique({
          where: { id: data.keyId },
        });

        if (!key) {
          return reply.status(404).send({ error: 'Key not found' });
        }

        propertyId = key.propertyId;

        await prisma.propertyKey.update({
          where: { id: data.keyId },
          data: {
            status: 'assigned',
            lastAssignedTo: data.assignedTo,
            lastAssignedAt: now,
          },
        });
      }

      // Update device if device assignment
      if (data.deviceId) {
        const device = await prisma.accessDevice.findUnique({
          where: { id: data.deviceId },
        });

        if (!device) {
          return reply.status(404).send({ error: 'Device not found' });
        }

        propertyId = device.propertyId;

        await prisma.accessDevice.update({
          where: { id: data.deviceId },
          data: {
            assignedTo: data.assignedTo,
            assignedToType: data.assignedToType,
            assignedAt: now,
          },
        });
      }

      const assignment = await prisma.keyAssignment.create({
        data: {
          keyId: data.keyId,
          deviceId: data.deviceId,
          assignedTo: data.assignedTo,
          assignedToType: data.assignedToType,
          assignedBy: data.assignedBy,
          assignedAt: now,
          status: 'active',
          depositAmount: data.depositAmount,
          depositPaid: data.depositPaid,
          depositRefunded: false,
          notes: data.notes,
          acknowledgementSigned: data.acknowledgementSigned,
          acknowledgementSignedAt: data.acknowledgementSigned ? now : null,
        },
      });

      // Log the assignment
      await prisma.accessAuditLog.create({
        data: {
          propertyId,
          eventType: 'assigned',
          keyId: data.keyId,
          deviceId: data.deviceId,
          userId: data.assignedBy,
          userType: 'staff',
          success: true,
          metadata: { assignedTo: data.assignedTo, assignedToType: data.assignedToType },
          occurredAt: now,
        },
      });

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
      const assignment = await prisma.keyAssignment.findUnique({
        where: { id: request.params.id },
      });

      if (!assignment) {
        return reply.status(404).send({ error: 'Assignment not found' });
      }

      const now = new Date();
      let propertyId = '';

      // Update key status
      if (assignment.keyId) {
        const key = await prisma.propertyKey.findUnique({
          where: { id: assignment.keyId },
        });

        if (key) {
          propertyId = key.propertyId;
          await prisma.propertyKey.update({
            where: { id: assignment.keyId },
            data: { status: 'available' },
          });
        }
      }

      // Clear device assignment
      if (assignment.deviceId) {
        const device = await prisma.accessDevice.findUnique({
          where: { id: assignment.deviceId },
        });

        if (device) {
          propertyId = device.propertyId;
          await prisma.accessDevice.update({
            where: { id: assignment.deviceId },
            data: {
              assignedTo: null,
              assignedToType: null,
              assignedAt: null,
            },
          });
        }
      }

      const updated = await prisma.keyAssignment.update({
        where: { id: request.params.id },
        data: {
          status: 'returned',
          returnedAt: now,
          returnedTo: request.body.returnedTo,
          depositRefunded: request.body.refundDeposit && assignment.depositPaid,
        },
      });

      // Log the return
      await prisma.accessAuditLog.create({
        data: {
          propertyId,
          eventType: 'returned',
          keyId: assignment.keyId,
          deviceId: assignment.deviceId,
          userId: request.body.returnedTo,
          userType: 'staff',
          success: true,
          occurredAt: now,
        },
      });

      return reply.send(updated);
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
      const assignment = await prisma.keyAssignment.findUnique({
        where: { id: request.params.id },
      });

      if (!assignment) {
        return reply.status(404).send({ error: 'Assignment not found' });
      }

      const now = new Date();
      let propertyId = '';

      // Update key/device status
      if (assignment.keyId) {
        const key = await prisma.propertyKey.findUnique({
          where: { id: assignment.keyId },
        });

        if (key) {
          propertyId = key.propertyId;
          await prisma.propertyKey.update({
            where: { id: assignment.keyId },
            data: { status: 'lost' },
          });
        }
      }

      if (assignment.deviceId) {
        const device = await prisma.accessDevice.findUnique({
          where: { id: assignment.deviceId },
        });

        if (device) {
          propertyId = device.propertyId;
          await prisma.accessDevice.update({
            where: { id: assignment.deviceId },
            data: { status: 'lost' },
          });
        }
      }

      const updated = await prisma.keyAssignment.update({
        where: { id: request.params.id },
        data: {
          status: 'lost',
          notes: request.body.notes,
        },
      });

      // Log the lost report
      await prisma.accessAuditLog.create({
        data: {
          propertyId,
          eventType: 'lost',
          keyId: assignment.keyId,
          deviceId: assignment.deviceId,
          userId: request.body.reportedBy,
          userType: 'staff',
          success: true,
          metadata: { notes: request.body.notes },
          occurredAt: now,
        },
      });

      return reply.send(updated);
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
      const { assignedTo, status, keyId, deviceId } = request.query;

      const assignments = await prisma.keyAssignment.findMany({
        where: {
          ...(assignedTo ? { assignedTo } : {}),
          ...(status ? { status } : {}),
          ...(keyId ? { keyId } : {}),
          ...(deviceId ? { deviceId } : {}),
        },
      });

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

      const access = await prisma.temporaryAccess.create({
        data: {
          propertyId: data.propertyId,
          grantedTo: data.grantedTo,
          grantedToType: data.grantedToType,
          grantedBy: data.grantedBy,
          accessZones: data.accessZones,
          accessCode: generateAccessCode(8),
          validFrom: new Date(data.validFrom),
          validTo: new Date(data.validTo),
          maxUses: data.maxUses,
          currentUses: 0,
          status: 'active',
          notes: data.notes,
        },
      });

      return reply.status(201).send(access);
    }
  );

  // Validate temporary access
  app.post(
    '/temporary-access/:id/validate',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const access = await prisma.temporaryAccess.findUnique({
        where: { id: request.params.id },
      });

      if (!access) {
        return reply.send({ valid: false, reason: 'Access not found' });
      }

      const now = new Date();

      if (access.status !== 'active') {
        return reply.send({ valid: false, reason: `Access is ${access.status}` });
      }

      if (now < access.validFrom) {
        return reply.send({ valid: false, reason: 'Access not yet valid' });
      }

      if (now > access.validTo) {
        return reply.send({ valid: false, reason: 'Access has expired' });
      }

      if (access.maxUses && access.currentUses >= access.maxUses) {
        return reply.send({ valid: false, reason: 'Maximum uses exceeded' });
      }

      // Increment uses
      let newStatus: TemporaryAccessStatus = 'active';
      if (access.maxUses && access.currentUses + 1 >= access.maxUses) {
        newStatus = 'exhausted';
      }

      await prisma.temporaryAccess.update({
        where: { id: request.params.id },
        data: {
          currentUses: access.currentUses + 1,
          status: newStatus,
        },
      });

      return reply.send({ valid: true });
    }
  );

  // Revoke temporary access
  app.post(
    '/temporary-access/:id/revoke',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const access = await prisma.temporaryAccess.findUnique({
        where: { id: request.params.id },
      });

      if (!access) {
        return reply.status(404).send({ error: 'Temporary access not found' });
      }

      const updated = await prisma.temporaryAccess.update({
        where: { id: request.params.id },
        data: { status: 'revoked' },
      });

      return reply.send(updated);
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
      const { propertyId, status, grantedTo } = request.query;

      const accesses = await prisma.temporaryAccess.findMany({
        where: {
          ...(propertyId ? { propertyId } : {}),
          ...(status ? { status: status as TemporaryAccessStatus } : {}),
          ...(grantedTo ? { grantedTo } : {}),
        },
      });

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

      const keyRequest = await prisma.keyRequest.create({
        data: {
          propertyId: data.propertyId,
          tenantId: data.requestedBy,
          requestType: data.requestType,
          keyType: data.keyType as KeyType | undefined,
          reason: data.reason,
          status: 'pending',
        },
      });

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
      const keyRequest = await prisma.keyRequest.findUnique({
        where: { id: request.params.id },
      });

      if (!keyRequest) {
        return reply.status(404).send({ error: 'Request not found' });
      }

      const now = new Date();

      const updated = await prisma.keyRequest.update({
        where: { id: request.params.id },
        data: {
          status: request.body.approved ? 'approved' : 'denied',
          processedAt: now,
          processedBy: request.body.decidedBy,
          notes: request.body.reason,
        },
      });

      return reply.send(updated);
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
      const { propertyId, status, requestedBy } = request.query;

      const requests = await prisma.keyRequest.findMany({
        where: {
          ...(propertyId ? { propertyId } : {}),
          ...(status ? { status } : {}),
          ...(requestedBy ? { tenantId: requestedBy } : {}),
        },
      });

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
      const now = new Date();

      const lockout = await prisma.lockoutEvent.create({
        data: {
          propertyId: data.propertyId,
          tenantId: data.tenantId,
          unitId: data.unitId,
          requestedAt: now,
          status: 'pending',
          feePaid: false,
          notes: data.notes,
        },
      });

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
          method: string;
          fee?: number;
          notes?: string;
        };
      }>,
      reply
    ) => {
      const lockout = await prisma.lockoutEvent.findUnique({
        where: { id: request.params.id },
      });

      if (!lockout) {
        return reply.status(404).send({ error: 'Lockout event not found' });
      }

      const updated = await prisma.lockoutEvent.update({
        where: { id: request.params.id },
        data: {
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedBy: request.body.resolvedBy,
          method: request.body.method,
          fee: request.body.fee,
          notes: request.body.notes,
        },
      });

      return reply.send(updated);
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
      const { propertyId, tenantId, status } = request.query;

      const lockouts = await prisma.lockoutEvent.findMany({
        where: {
          ...(propertyId ? { propertyId } : {}),
          ...(tenantId ? { tenantId } : {}),
          ...(status ? { status: status as LockoutStatus } : {}),
        },
      });

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
      const { propertyId, eventType, userId, startDate, endDate, limit } = request.query;

      const logs = await prisma.accessAuditLog.findMany({
        where: {
          ...(propertyId ? { propertyId } : {}),
          ...(eventType ? { eventType: eventType as AuditEventType } : {}),
          ...(userId ? { userId } : {}),
          ...(startDate || endDate
            ? {
                occurredAt: {
                  ...(startDate ? { gte: new Date(startDate) } : {}),
                  ...(endDate ? { lte: new Date(endDate) } : {}),
                },
              }
            : {}),
        },
        orderBy: { occurredAt: 'desc' },
        take: limit ? parseInt(limit) : undefined,
      });

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
      const summary = await getAccessActivitySummary(
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
          userType: string;
        };
      }>,
      reply
    ) => {
      const now = new Date();
      const { propertyId, deviceId, accessPointId, zoneId, userId, userType } = request.body;

      const device = await prisma.accessDevice.findUnique({
        where: { id: deviceId },
      });

      const zone = await prisma.accessZone.findUnique({
        where: { id: zoneId },
      });

      let success = false;
      let failureReason: string | undefined;

      if (!device) {
        failureReason = 'Device not found';
      } else if (!zone) {
        failureReason = 'Zone not found';
      } else if (device.status !== 'active') {
        failureReason = `Device is ${device.status}`;
      } else if (device.expiresAt && device.expiresAt < now) {
        failureReason = 'Device has expired';
      } else if (!device.accessZones.includes(zoneId)) {
        failureReason = 'Device not authorized for this zone';
      } else {
        // Check access level
        const levelHierarchy: AccessLevel[] = ['resident', 'staff', 'maintenance', 'vendor', 'emergency', 'master'];
        const deviceLevelIndex = levelHierarchy.indexOf(device.accessLevel);
        const requiredLevelIndex = levelHierarchy.indexOf(zone.requiredLevel);

        if (deviceLevelIndex < requiredLevelIndex && device.accessLevel !== 'master') {
          failureReason = 'Insufficient access level';
        } else {
          success = true;

          // Update device usage
          await prisma.accessDevice.update({
            where: { id: deviceId },
            data: {
              lastUsedAt: now,
              usageCount: device.usageCount + 1,
            },
          });
        }
      }

      const log = await prisma.accessAuditLog.create({
        data: {
          propertyId,
          eventType: success ? 'access_granted' : 'access_denied',
          deviceId,
          accessPointId,
          zoneId,
          userId,
          userType,
          success,
          failureReason,
          occurredAt: now,
        },
      });

      return reply.status(201).send(log);
    }
  );
};
