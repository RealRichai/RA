import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  prisma,
  type Carrier,
  type PackageSize,
  type PackageStatus,
  type LockerSize,
  type LockerStatus,
  type PackageNotificationType,
} from '@realriches/database';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function generateAccessCode(length: number = 6): string {
  const chars = '0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function findAvailableLocker(
  propertyId: string,
  size: PackageSize
): Promise<{ id: string; lockerNumber: string; size: LockerSize; location: string } | null> {
  const sizeMapping: Record<PackageSize, LockerSize[]> = {
    envelope: ['small', 'medium', 'large', 'extra_large'],
    small: ['small', 'medium', 'large', 'extra_large'],
    medium: ['medium', 'large', 'extra_large'],
    large: ['large', 'extra_large'],
    oversized: ['extra_large'],
  };

  const acceptableSizes = sizeMapping[size];

  for (const acceptableSize of acceptableSizes) {
    const available = await prisma.packageLocker.findFirst({
      where: {
        propertyId,
        size: acceptableSize,
        status: 'available',
      },
    });
    if (available) return available;
  }

  return null;
}

export function isPackageOverdue(receivedAt: Date, status: PackageStatus, holdDays: number = 7): boolean {
  const now = new Date();
  const daysSinceReceived = Math.floor(
    (now.getTime() - receivedAt.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSinceReceived > holdDays && status !== 'picked_up' && status !== 'returned';
}

interface PackageData {
  receivedAt: Date;
  pickedUpAt: Date | null;
  status: PackageStatus;
  carrier: Carrier;
  size: PackageSize;
  isOverdue: boolean;
}

export function calculatePackageStats(
  packageList: PackageData[],
  startDate?: string,
  endDate?: string
): {
  totalReceived: number;
  totalPickedUp: number;
  totalOverdue: number;
  averagePickupTime: number;
  byCarrier: Record<string, number>;
  bySize: Record<string, number>;
} {
  let filtered = packageList;
  if (startDate) {
    filtered = filtered.filter((p) => p.receivedAt >= new Date(startDate));
  }
  if (endDate) {
    filtered = filtered.filter((p) => p.receivedAt <= new Date(endDate));
  }

  const pickedUp = filtered.filter((p) => p.status === 'picked_up' && p.pickedUpAt);
  const pickupTimes = pickedUp.map((p) => {
    const received = p.receivedAt;
    const picked = p.pickedUpAt!;
    return (picked.getTime() - received.getTime()) / (1000 * 60 * 60); // hours
  });

  const byCarrier: Record<string, number> = {};
  const bySize: Record<string, number> = {};

  filtered.forEach((p) => {
    byCarrier[p.carrier] = (byCarrier[p.carrier] || 0) + 1;
    bySize[p.size] = (bySize[p.size] || 0) + 1;
  });

  return {
    totalReceived: filtered.length,
    totalPickedUp: pickedUp.length,
    totalOverdue: filtered.filter((p) => p.isOverdue).length,
    averagePickupTime: pickupTimes.length > 0
      ? Math.round(pickupTimes.reduce((a, b) => a + b, 0) / pickupTimes.length)
      : 0,
    byCarrier,
    bySize,
  };
}

export async function getLockerUtilization(propertyId: string): Promise<{
  total: number;
  available: number;
  occupied: number;
  maintenance: number;
  utilizationRate: number;
}> {
  const propertyLockers = await prisma.packageLocker.findMany({
    where: { propertyId },
  });

  const total = propertyLockers.length;
  const available = propertyLockers.filter((l) => l.status === 'available').length;
  const occupied = propertyLockers.filter((l) => l.status === 'occupied').length;
  const maintenance = propertyLockers.filter((l) => l.status === 'maintenance').length;

  return {
    total,
    available,
    occupied,
    maintenance,
    utilizationRate: total > 0 ? Math.round((occupied / total) * 100) : 0,
  };
}

export function validateTrackingNumber(trackingNumber: string, carrier: Carrier): boolean {
  // Simplified validation - real implementation would use carrier APIs
  const patterns: Record<Carrier, RegExp> = {
    usps: /^[0-9]{20,22}$/,
    ups: /^1Z[A-Z0-9]{16}$/,
    fedex: /^[0-9]{12,15}$/,
    amazon: /^TBA[0-9]{12}$/,
    dhl: /^[0-9]{10,11}$/,
    other: /.+/,
  };

  return patterns[carrier].test(trackingNumber.replace(/\s/g, ''));
}

// ============================================================================
// SCHEMAS
// ============================================================================

const LockerSchema = z.object({
  propertyId: z.string(),
  lockerNumber: z.string(),
  size: z.enum(['small', 'medium', 'large', 'extra_large']),
  location: z.string(),
});

const PackageSchema = z.object({
  propertyId: z.string(),
  unitId: z.string(),
  tenantId: z.string(),
  trackingNumber: z.string().optional(),
  carrier: z.enum(['usps', 'ups', 'fedex', 'amazon', 'dhl', 'other']),
  size: z.enum(['envelope', 'small', 'medium', 'large', 'oversized']),
  description: z.string().optional(),
  receivedBy: z.string(),
  photoUrl: z.string().optional(),
  notes: z.string().optional(),
});

const PickupSchema = z.object({
  pickedUpBy: z.string(),
  signatureUrl: z.string().optional(),
  proxyAuthorizationId: z.string().optional(),
});

const SettingsSchema = z.object({
  propertyId: z.string(),
  holdDays: z.number().default(7),
  overdueReminderDays: z.number().default(3),
  requireSignature: z.boolean().default(true),
  allowProxyPickup: z.boolean().default(true),
  notifyOnReceive: z.boolean().default(true),
  notifyOnOverdue: z.boolean().default(true),
  autoAssignLocker: z.boolean().default(true),
});

const ProxyAuthSchema = z.object({
  tenantId: z.string(),
  authorizedPersonName: z.string(),
  relationship: z.string().optional(),
  photoIdUrl: z.string().optional(),
  validFrom: z.string(),
  validUntil: z.string().optional(),
});

const ForwardingSchema = z.object({
  tenantId: z.string(),
  address: z.object({
    street: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
  }),
  startDate: z.string(),
  endDate: z.string().optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

export async function packageRoutes(app: FastifyInstance): Promise<void> {
  // ─────────────────────────────────────────────────────────────────────────
  // LOCKERS
  // ─────────────────────────────────────────────────────────────────────────

  // Create locker
  app.post(
    '/lockers',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof LockerSchema> }>,
      reply
    ) => {
      const data = LockerSchema.parse(request.body);

      const locker = await prisma.packageLocker.create({
        data: {
          propertyId: data.propertyId,
          lockerNumber: data.lockerNumber,
          size: data.size,
          location: data.location,
          status: 'available',
        },
      });

      return reply.status(201).send(locker);
    }
  );

  // List lockers
  app.get(
    '/lockers',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; status?: string; size?: string };
      }>,
      reply
    ) => {
      const results = await prisma.packageLocker.findMany({
        where: {
          ...(request.query.propertyId && { propertyId: request.query.propertyId }),
          ...(request.query.status && { status: request.query.status as LockerStatus }),
          ...(request.query.size && { size: request.query.size as LockerSize }),
        },
      });

      const propertyId = request.query.propertyId;
      const utilization = propertyId ? await getLockerUtilization(propertyId) : null;

      return reply.send({ lockers: results, utilization });
    }
  );

  // Update locker status
  app.patch(
    '/lockers/:id/status',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { status: LockerStatus };
      }>,
      reply
    ) => {
      try {
        const locker = await prisma.packageLocker.update({
          where: { id: request.params.id },
          data: { status: request.body.status },
        });
        return reply.send(locker);
      } catch {
        return reply.status(404).send({ error: 'Locker not found' });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PACKAGES
  // ─────────────────────────────────────────────────────────────────────────

  // Receive package
  app.post(
    '/',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof PackageSchema> }>,
      reply
    ) => {
      const data = PackageSchema.parse(request.body);
      const now = new Date();

      // Get settings
      const settings = await prisma.packageSettings.findUnique({
        where: { propertyId: data.propertyId },
      });

      // Validate tracking number if provided
      if (data.trackingNumber && !validateTrackingNumber(data.trackingNumber, data.carrier)) {
        return reply.status(400).send({ error: 'Invalid tracking number format' });
      }

      let lockerId: string | undefined;
      let accessCode: string | undefined;
      let status: PackageStatus = 'received';

      // Auto-assign locker if enabled
      if (settings?.autoAssignLocker) {
        const locker = await findAvailableLocker(data.propertyId, data.size);
        if (locker) {
          accessCode = generateAccessCode();
          lockerId = locker.id;
          status = 'stored';

          await prisma.packageLocker.update({
            where: { id: locker.id },
            data: {
              status: 'occupied',
              currentPackageId: 'pending', // Will update after package creation
              accessCode,
            },
          });
        }
      }

      const pkg = await prisma.package.create({
        data: {
          propertyId: data.propertyId,
          unitId: data.unitId,
          tenantId: data.tenantId,
          trackingNumber: data.trackingNumber,
          carrier: data.carrier,
          size: data.size,
          description: data.description,
          status,
          lockerId,
          accessCode,
          receivedAt: now,
          receivedBy: data.receivedBy,
          notificationCount: 0,
          isOverdue: false,
          photoUrl: data.photoUrl,
          notes: data.notes,
        },
      });

      // Update locker with actual package ID
      if (lockerId) {
        await prisma.packageLocker.update({
          where: { id: lockerId },
          data: { currentPackageId: pkg.id },
        });
      }

      // Send notification if enabled
      if (settings?.notifyOnReceive) {
        await prisma.packageNotification.create({
          data: {
            packageId: pkg.id,
            tenantId: pkg.tenantId,
            type: 'received',
            channel: 'email',
            sentAt: now,
          },
        });

        await prisma.package.update({
          where: { id: pkg.id },
          data: {
            notifiedAt: now,
            notificationCount: 1,
          },
        });
      }

      const updatedPkg = await prisma.package.findUnique({ where: { id: pkg.id } });
      return reply.status(201).send(updatedPkg);
    }
  );

  // List packages
  app.get(
    '/',
    async (
      request: FastifyRequest<{
        Querystring: {
          propertyId?: string;
          unitId?: string;
          tenantId?: string;
          status?: string;
          isOverdue?: string;
        };
      }>,
      reply
    ) => {
      const results = await prisma.package.findMany({
        where: {
          ...(request.query.propertyId && { propertyId: request.query.propertyId }),
          ...(request.query.unitId && { unitId: request.query.unitId }),
          ...(request.query.tenantId && { tenantId: request.query.tenantId }),
          ...(request.query.status && { status: request.query.status as PackageStatus }),
          ...(request.query.isOverdue === 'true' && { isOverdue: true }),
        },
        orderBy: { receivedAt: 'desc' },
      });

      return reply.send({ packages: results });
    }
  );

  // Get package
  app.get(
    '/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const pkg = await prisma.package.findUnique({
        where: { id: request.params.id },
      });

      if (!pkg) {
        return reply.status(404).send({ error: 'Package not found' });
      }

      const locker = pkg.lockerId
        ? await prisma.packageLocker.findUnique({ where: { id: pkg.lockerId } })
        : null;

      const notifications = await prisma.packageNotification.findMany({
        where: { packageId: pkg.id },
      });

      return reply.send({ ...pkg, locker, notifications });
    }
  );

  // Pickup package
  app.post(
    '/:id/pickup',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: z.infer<typeof PickupSchema>;
      }>,
      reply
    ) => {
      const pkg = await prisma.package.findUnique({
        where: { id: request.params.id },
      });

      if (!pkg) {
        return reply.status(404).send({ error: 'Package not found' });
      }

      if (pkg.status === 'picked_up') {
        return reply.status(400).send({ error: 'Package already picked up' });
      }

      const data = PickupSchema.parse(request.body);
      const now = new Date();

      // Validate proxy authorization if not the tenant
      if (data.proxyAuthorizationId) {
        const auth = await prisma.proxyAuthorization.findUnique({
          where: { id: data.proxyAuthorizationId },
        });

        if (!auth || !auth.isActive || auth.tenantId !== pkg.tenantId) {
          return reply.status(403).send({ error: 'Invalid proxy authorization' });
        }
        if (auth.validUntil && auth.validUntil < now) {
          return reply.status(403).send({ error: 'Proxy authorization expired' });
        }
      }

      const updated = await prisma.package.update({
        where: { id: pkg.id },
        data: {
          status: 'picked_up',
          pickedUpAt: now,
          pickedUpBy: data.pickedUpBy,
          signatureUrl: data.signatureUrl,
        },
      });

      // Free up locker
      if (pkg.lockerId) {
        await prisma.packageLocker.update({
          where: { id: pkg.lockerId },
          data: {
            status: 'available',
            currentPackageId: null,
            accessCode: null,
            lastAccessedAt: now,
          },
        });
      }

      return reply.send(updated);
    }
  );

  // Return package
  app.post(
    '/:id/return',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { reason?: string };
      }>,
      reply
    ) => {
      const pkg = await prisma.package.findUnique({
        where: { id: request.params.id },
      });

      if (!pkg) {
        return reply.status(404).send({ error: 'Package not found' });
      }

      const now = new Date();

      const updated = await prisma.package.update({
        where: { id: pkg.id },
        data: {
          status: 'returned',
          returnedAt: now,
          notes: request.body.reason || 'Returned to sender',
        },
      });

      // Free up locker
      if (pkg.lockerId) {
        await prisma.packageLocker.update({
          where: { id: pkg.lockerId },
          data: {
            status: 'available',
            currentPackageId: null,
            accessCode: null,
          },
        });
      }

      return reply.send(updated);
    }
  );

  // Forward package
  app.post(
    '/:id/forward',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { forwardingAddressId?: string; address?: string };
      }>,
      reply
    ) => {
      const pkg = await prisma.package.findUnique({
        where: { id: request.params.id },
      });

      if (!pkg) {
        return reply.status(404).send({ error: 'Package not found' });
      }

      let forwardAddress = request.body.address;

      if (request.body.forwardingAddressId) {
        const fwd = await prisma.forwardingAddress.findUnique({
          where: { id: request.body.forwardingAddressId },
        });

        if (fwd && fwd.isActive) {
          forwardAddress = `${fwd.street}, ${fwd.city}, ${fwd.state} ${fwd.zip}`;
        }
      }

      if (!forwardAddress) {
        return reply.status(400).send({ error: 'Forwarding address required' });
      }

      const updated = await prisma.package.update({
        where: { id: pkg.id },
        data: {
          status: 'forwarded',
          forwardedTo: forwardAddress,
        },
      });

      // Free up locker
      if (pkg.lockerId) {
        await prisma.packageLocker.update({
          where: { id: pkg.lockerId },
          data: {
            status: 'available',
            currentPackageId: null,
            accessCode: null,
          },
        });
      }

      return reply.send(updated);
    }
  );

  // Assign to locker
  app.post(
    '/:id/assign-locker',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { lockerId: string };
      }>,
      reply
    ) => {
      const pkg = await prisma.package.findUnique({
        where: { id: request.params.id },
      });

      if (!pkg) {
        return reply.status(404).send({ error: 'Package not found' });
      }

      const locker = await prisma.packageLocker.findUnique({
        where: { id: request.body.lockerId },
      });

      if (!locker) {
        return reply.status(404).send({ error: 'Locker not found' });
      }

      if (locker.status !== 'available') {
        return reply.status(400).send({ error: 'Locker not available' });
      }

      const accessCode = generateAccessCode();

      const updatedPkg = await prisma.package.update({
        where: { id: pkg.id },
        data: {
          lockerId: locker.id,
          accessCode,
          status: 'stored',
        },
      });

      const updatedLocker = await prisma.packageLocker.update({
        where: { id: locker.id },
        data: {
          status: 'occupied',
          currentPackageId: pkg.id,
          accessCode,
        },
      });

      return reply.send({ package: updatedPkg, locker: updatedLocker });
    }
  );

  // Send reminder
  app.post(
    '/:id/remind',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const pkg = await prisma.package.findUnique({
        where: { id: request.params.id },
      });

      if (!pkg) {
        return reply.status(404).send({ error: 'Package not found' });
      }

      const now = new Date();

      const notification = await prisma.packageNotification.create({
        data: {
          packageId: pkg.id,
          tenantId: pkg.tenantId,
          type: 'reminder',
          channel: 'email',
          sentAt: now,
        },
      });

      await prisma.package.update({
        where: { id: pkg.id },
        data: {
          notificationCount: { increment: 1 },
        },
      });

      return reply.send({ message: 'Reminder sent', notification });
    }
  );

  // Get package stats
  app.get(
    '/stats',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId: string; startDate?: string; endDate?: string };
      }>,
      reply
    ) => {
      const propertyPackages = await prisma.package.findMany({
        where: { propertyId: request.query.propertyId },
      });

      const stats = calculatePackageStats(
        propertyPackages,
        request.query.startDate,
        request.query.endDate
      );

      const lockerUtil = await getLockerUtilization(request.query.propertyId);

      return reply.send({ ...stats, lockerUtilization: lockerUtil });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SETTINGS
  // ─────────────────────────────────────────────────────────────────────────

  // Get/Create settings
  app.post(
    '/settings',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof SettingsSchema> }>,
      reply
    ) => {
      const data = SettingsSchema.parse(request.body);

      const settings = await prisma.packageSettings.upsert({
        where: { propertyId: data.propertyId },
        update: {
          holdDays: data.holdDays,
          overdueReminderDays: data.overdueReminderDays,
          requireSignature: data.requireSignature,
          allowProxyPickup: data.allowProxyPickup,
          notifyOnReceive: data.notifyOnReceive,
          notifyOnOverdue: data.notifyOnOverdue,
          autoAssignLocker: data.autoAssignLocker,
        },
        create: {
          propertyId: data.propertyId,
          holdDays: data.holdDays,
          overdueReminderDays: data.overdueReminderDays,
          requireSignature: data.requireSignature,
          allowProxyPickup: data.allowProxyPickup,
          notifyOnReceive: data.notifyOnReceive,
          notifyOnOverdue: data.notifyOnOverdue,
          autoAssignLocker: data.autoAssignLocker,
        },
      });

      return reply.status(201).send(settings);
    }
  );

  app.get(
    '/settings/:propertyId',
    async (request: FastifyRequest<{ Params: { propertyId: string } }>, reply) => {
      const settings = await prisma.packageSettings.findUnique({
        where: { propertyId: request.params.propertyId },
      });

      if (!settings) {
        return reply.status(404).send({ error: 'Settings not found' });
      }

      return reply.send(settings);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // PROXY AUTHORIZATIONS
  // ─────────────────────────────────────────────────────────────────────────

  // Create proxy authorization
  app.post(
    '/proxy-auth',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof ProxyAuthSchema> }>,
      reply
    ) => {
      const data = ProxyAuthSchema.parse(request.body);

      const auth = await prisma.proxyAuthorization.create({
        data: {
          tenantId: data.tenantId,
          authorizedPersonName: data.authorizedPersonName,
          relationship: data.relationship,
          photoIdUrl: data.photoIdUrl,
          validFrom: new Date(data.validFrom),
          validUntil: data.validUntil ? new Date(data.validUntil) : null,
          isActive: true,
        },
      });

      return reply.status(201).send(auth);
    }
  );

  // List proxy authorizations
  app.get(
    '/proxy-auth',
    async (
      request: FastifyRequest<{ Querystring: { tenantId?: string } }>,
      reply
    ) => {
      const results = await prisma.proxyAuthorization.findMany({
        where: {
          ...(request.query.tenantId && { tenantId: request.query.tenantId }),
        },
      });

      return reply.send({ authorizations: results });
    }
  );

  // Revoke proxy authorization
  app.delete(
    '/proxy-auth/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      try {
        await prisma.proxyAuthorization.update({
          where: { id: request.params.id },
          data: { isActive: false },
        });
        return reply.send({ message: 'Authorization revoked' });
      } catch {
        return reply.status(404).send({ error: 'Authorization not found' });
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // FORWARDING ADDRESSES
  // ─────────────────────────────────────────────────────────────────────────

  // Create forwarding address
  app.post(
    '/forwarding',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof ForwardingSchema> }>,
      reply
    ) => {
      const data = ForwardingSchema.parse(request.body);

      const forwarding = await prisma.forwardingAddress.create({
        data: {
          tenantId: data.tenantId,
          street: data.address.street,
          city: data.address.city,
          state: data.address.state,
          zip: data.address.zip,
          startDate: new Date(data.startDate),
          endDate: data.endDate ? new Date(data.endDate) : null,
          isActive: true,
        },
      });

      return reply.status(201).send(forwarding);
    }
  );

  // Get tenant's forwarding address
  app.get(
    '/forwarding/:tenantId',
    async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply) => {
      const forwarding = await prisma.forwardingAddress.findFirst({
        where: {
          tenantId: request.params.tenantId,
          isActive: true,
        },
      });

      if (!forwarding) {
        return reply.status(404).send({ error: 'Forwarding address not found' });
      }

      return reply.send(forwarding);
    }
  );

  // Cancel forwarding
  app.delete(
    '/forwarding/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      try {
        await prisma.forwardingAddress.update({
          where: { id: request.params.id },
          data: { isActive: false },
        });
        return reply.send({ message: 'Forwarding cancelled' });
      } catch {
        return reply.status(404).send({ error: 'Forwarding address not found' });
      }
    }
  );
}
