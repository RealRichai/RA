import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

type Carrier = 'usps' | 'ups' | 'fedex' | 'amazon' | 'dhl' | 'other';
type PackageSize = 'envelope' | 'small' | 'medium' | 'large' | 'oversized';
type PackageStatus = 'received' | 'stored' | 'notified' | 'picked_up' | 'returned' | 'forwarded';
type LockerSize = 'small' | 'medium' | 'large' | 'extra_large';
type LockerStatus = 'available' | 'occupied' | 'maintenance' | 'reserved';

interface PackageLocker {
  id: string;
  propertyId: string;
  lockerNumber: string;
  size: LockerSize;
  status: LockerStatus;
  location: string;
  currentPackageId?: string;
  accessCode?: string;
  lastAccessedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface Package {
  id: string;
  propertyId: string;
  unitId: string;
  tenantId: string;
  trackingNumber?: string;
  carrier: Carrier;
  size: PackageSize;
  description?: string;
  status: PackageStatus;
  lockerId?: string;
  accessCode?: string;
  receivedAt: string;
  receivedBy: string;
  notifiedAt?: string;
  notificationCount: number;
  pickedUpAt?: string;
  pickedUpBy?: string;
  signatureUrl?: string;
  photoUrl?: string;
  returnedAt?: string;
  forwardedTo?: string;
  notes?: string;
  isOverdue: boolean;
  overdueNotifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface PackageSettings {
  id: string;
  propertyId: string;
  holdDays: number;
  overdueReminderDays: number;
  requireSignature: boolean;
  allowProxyPickup: boolean;
  notifyOnReceive: boolean;
  notifyOnOverdue: boolean;
  autoAssignLocker: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PackageNotification {
  id: string;
  packageId: string;
  tenantId: string;
  type: 'received' | 'reminder' | 'overdue' | 'returned';
  channel: 'email' | 'sms' | 'push';
  sentAt: string;
  deliveredAt?: string;
  readAt?: string;
}

interface ProxyAuthorization {
  id: string;
  tenantId: string;
  authorizedPersonName: string;
  relationship?: string;
  photoIdUrl?: string;
  validFrom: string;
  validUntil?: string;
  isActive: boolean;
  createdAt: string;
}

interface ForwardingAddress {
  id: string;
  tenantId: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  startDate: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
}

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

export const lockers = new Map<string, PackageLocker>();
export const packages = new Map<string, Package>();
export const packageSettings = new Map<string, PackageSettings>();
export const pickupLogs = new Map<string, PackageNotification>(); // alias for tests
export const proxyAuthorizations = new Map<string, ProxyAuthorization>();
export const forwardingAddresses = new Map<string, ForwardingAddress>();
// Internal reference
const notifications = pickupLogs;

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

export function findAvailableLocker(
  propertyId: string,
  size: PackageSize
): PackageLocker | null {
  const sizeMapping: Record<PackageSize, LockerSize[]> = {
    envelope: ['small', 'medium', 'large', 'extra_large'],
    small: ['small', 'medium', 'large', 'extra_large'],
    medium: ['medium', 'large', 'extra_large'],
    large: ['large', 'extra_large'],
    oversized: ['extra_large'],
  };

  const acceptableSizes = sizeMapping[size];

  for (const acceptableSize of acceptableSizes) {
    const available = Array.from(lockers.values()).find(
      (l) =>
        l.propertyId === propertyId &&
        l.size === acceptableSize &&
        l.status === 'available'
    );
    if (available) return available;
  }

  return null;
}

export function isPackageOverdue(pkg: Package, holdDays: number = 7): boolean {
  const receivedDate = new Date(pkg.receivedAt);
  const now = new Date();
  const daysSinceReceived = Math.floor(
    (now.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  return daysSinceReceived > holdDays && pkg.status !== 'picked_up' && pkg.status !== 'returned';
}

export function calculatePackageStats(
  packageList: Package[],
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
    filtered = filtered.filter((p) => p.receivedAt >= startDate);
  }
  if (endDate) {
    filtered = filtered.filter((p) => p.receivedAt <= endDate);
  }

  const pickedUp = filtered.filter((p) => p.status === 'picked_up' && p.pickedUpAt);
  const pickupTimes = pickedUp.map((p) => {
    const received = new Date(p.receivedAt);
    const picked = new Date(p.pickedUpAt!);
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

export function getLockerUtilization(propertyId: string): {
  total: number;
  available: number;
  occupied: number;
  maintenance: number;
  utilizationRate: number;
} {
  const propertyLockers = Array.from(lockers.values()).filter(
    (l) => l.propertyId === propertyId
  );

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
      const now = new Date().toISOString();

      const locker: PackageLocker = {
        id: `lock_${Date.now()}`,
        ...data,
        status: 'available',
        createdAt: now,
        updatedAt: now,
      };

      lockers.set(locker.id, locker);
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
      let results = Array.from(lockers.values());

      if (request.query.propertyId) {
        results = results.filter((l) => l.propertyId === request.query.propertyId);
      }
      if (request.query.status) {
        results = results.filter((l) => l.status === request.query.status);
      }
      if (request.query.size) {
        results = results.filter((l) => l.size === request.query.size);
      }

      const propertyId = request.query.propertyId;
      const utilization = propertyId ? getLockerUtilization(propertyId) : null;

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
      const locker = lockers.get(request.params.id);
      if (!locker) {
        return reply.status(404).send({ error: 'Locker not found' });
      }

      locker.status = request.body.status;
      locker.updatedAt = new Date().toISOString();
      lockers.set(locker.id, locker);

      return reply.send(locker);
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
      const now = new Date().toISOString();

      // Get settings
      const settings = Array.from(packageSettings.values()).find(
        (s) => s.propertyId === data.propertyId
      );

      // Validate tracking number if provided
      if (data.trackingNumber && !validateTrackingNumber(data.trackingNumber, data.carrier)) {
        return reply.status(400).send({ error: 'Invalid tracking number format' });
      }

      const pkg: Package = {
        id: `pkg_${Date.now()}`,
        ...data,
        status: 'received',
        receivedAt: now,
        notificationCount: 0,
        isOverdue: false,
        createdAt: now,
        updatedAt: now,
      };

      // Auto-assign locker if enabled
      if (settings?.autoAssignLocker) {
        const locker = findAvailableLocker(data.propertyId, data.size);
        if (locker) {
          const accessCode = generateAccessCode();
          pkg.lockerId = locker.id;
          pkg.accessCode = accessCode;
          pkg.status = 'stored';

          locker.status = 'occupied';
          locker.currentPackageId = pkg.id;
          locker.accessCode = accessCode;
          locker.updatedAt = now;
          lockers.set(locker.id, locker);
        }
      }

      packages.set(pkg.id, pkg);

      // Send notification if enabled
      if (settings?.notifyOnReceive) {
        const notification: PackageNotification = {
          id: `notif_${Date.now()}`,
          packageId: pkg.id,
          tenantId: pkg.tenantId,
          type: 'received',
          channel: 'email',
          sentAt: now,
        };
        notifications.set(notification.id, notification);
        pkg.notifiedAt = now;
        pkg.notificationCount = 1;
      }

      packages.set(pkg.id, pkg);
      return reply.status(201).send(pkg);
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
      let results = Array.from(packages.values());

      if (request.query.propertyId) {
        results = results.filter((p) => p.propertyId === request.query.propertyId);
      }
      if (request.query.unitId) {
        results = results.filter((p) => p.unitId === request.query.unitId);
      }
      if (request.query.tenantId) {
        results = results.filter((p) => p.tenantId === request.query.tenantId);
      }
      if (request.query.status) {
        results = results.filter((p) => p.status === request.query.status);
      }
      if (request.query.isOverdue === 'true') {
        results = results.filter((p) => p.isOverdue);
      }

      return reply.send({
        packages: results.sort(
          (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
        ),
      });
    }
  );

  // Get package
  app.get(
    '/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const pkg = packages.get(request.params.id);
      if (!pkg) {
        return reply.status(404).send({ error: 'Package not found' });
      }

      const locker = pkg.lockerId ? lockers.get(pkg.lockerId) : null;
      const pkgNotifications = Array.from(notifications.values()).filter(
        (n) => n.packageId === pkg.id
      );

      return reply.send({ ...pkg, locker, notifications: pkgNotifications });
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
      const pkg = packages.get(request.params.id);
      if (!pkg) {
        return reply.status(404).send({ error: 'Package not found' });
      }

      if (pkg.status === 'picked_up') {
        return reply.status(400).send({ error: 'Package already picked up' });
      }

      const data = PickupSchema.parse(request.body);
      const now = new Date().toISOString();

      // Validate proxy authorization if not the tenant
      if (data.proxyAuthorizationId) {
        const auth = proxyAuthorizations.get(data.proxyAuthorizationId);
        if (!auth || !auth.isActive || auth.tenantId !== pkg.tenantId) {
          return reply.status(403).send({ error: 'Invalid proxy authorization' });
        }
        if (auth.validUntil && auth.validUntil < now) {
          return reply.status(403).send({ error: 'Proxy authorization expired' });
        }
      }

      pkg.status = 'picked_up';
      pkg.pickedUpAt = now;
      pkg.pickedUpBy = data.pickedUpBy;
      pkg.signatureUrl = data.signatureUrl;
      pkg.updatedAt = now;

      // Free up locker
      if (pkg.lockerId) {
        const locker = lockers.get(pkg.lockerId);
        if (locker) {
          locker.status = 'available';
          locker.currentPackageId = undefined;
          locker.accessCode = undefined;
          locker.lastAccessedAt = now;
          locker.updatedAt = now;
          lockers.set(locker.id, locker);
        }
      }

      packages.set(pkg.id, pkg);
      return reply.send(pkg);
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
      const pkg = packages.get(request.params.id);
      if (!pkg) {
        return reply.status(404).send({ error: 'Package not found' });
      }

      const now = new Date().toISOString();
      pkg.status = 'returned';
      pkg.returnedAt = now;
      pkg.notes = request.body.reason || 'Returned to sender';
      pkg.updatedAt = now;

      // Free up locker
      if (pkg.lockerId) {
        const locker = lockers.get(pkg.lockerId);
        if (locker) {
          locker.status = 'available';
          locker.currentPackageId = undefined;
          locker.accessCode = undefined;
          locker.updatedAt = now;
          lockers.set(locker.id, locker);
        }
      }

      packages.set(pkg.id, pkg);
      return reply.send(pkg);
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
      const pkg = packages.get(request.params.id);
      if (!pkg) {
        return reply.status(404).send({ error: 'Package not found' });
      }

      let forwardAddress = request.body.address;

      if (request.body.forwardingAddressId) {
        const fwd = forwardingAddresses.get(request.body.forwardingAddressId);
        if (fwd && fwd.isActive) {
          forwardAddress = `${fwd.address.street}, ${fwd.address.city}, ${fwd.address.state} ${fwd.address.zip}`;
        }
      }

      if (!forwardAddress) {
        return reply.status(400).send({ error: 'Forwarding address required' });
      }

      const now = new Date().toISOString();
      pkg.status = 'forwarded';
      pkg.forwardedTo = forwardAddress;
      pkg.updatedAt = now;

      // Free up locker
      if (pkg.lockerId) {
        const locker = lockers.get(pkg.lockerId);
        if (locker) {
          locker.status = 'available';
          locker.currentPackageId = undefined;
          locker.accessCode = undefined;
          locker.updatedAt = now;
          lockers.set(locker.id, locker);
        }
      }

      packages.set(pkg.id, pkg);
      return reply.send(pkg);
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
      const pkg = packages.get(request.params.id);
      if (!pkg) {
        return reply.status(404).send({ error: 'Package not found' });
      }

      const locker = lockers.get(request.body.lockerId);
      if (!locker) {
        return reply.status(404).send({ error: 'Locker not found' });
      }

      if (locker.status !== 'available') {
        return reply.status(400).send({ error: 'Locker not available' });
      }

      const now = new Date().toISOString();
      const accessCode = generateAccessCode();

      pkg.lockerId = locker.id;
      pkg.accessCode = accessCode;
      pkg.status = 'stored';
      pkg.updatedAt = now;

      locker.status = 'occupied';
      locker.currentPackageId = pkg.id;
      locker.accessCode = accessCode;
      locker.updatedAt = now;

      packages.set(pkg.id, pkg);
      lockers.set(locker.id, locker);

      return reply.send({ package: pkg, locker });
    }
  );

  // Send reminder
  app.post(
    '/:id/remind',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const pkg = packages.get(request.params.id);
      if (!pkg) {
        return reply.status(404).send({ error: 'Package not found' });
      }

      const now = new Date().toISOString();
      const notification: PackageNotification = {
        id: `notif_${Date.now()}`,
        packageId: pkg.id,
        tenantId: pkg.tenantId,
        type: 'reminder',
        channel: 'email',
        sentAt: now,
      };

      notifications.set(notification.id, notification);
      pkg.notificationCount++;
      pkg.updatedAt = now;
      packages.set(pkg.id, pkg);

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
      const propertyPackages = Array.from(packages.values()).filter(
        (p) => p.propertyId === request.query.propertyId
      );

      const stats = calculatePackageStats(
        propertyPackages,
        request.query.startDate,
        request.query.endDate
      );

      const lockerUtil = getLockerUtilization(request.query.propertyId);

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
      const now = new Date().toISOString();

      const existing = Array.from(packageSettings.values()).find(
        (s) => s.propertyId === data.propertyId
      );

      if (existing) {
        Object.assign(existing, data, { updatedAt: now });
        packageSettings.set(existing.id, existing);
        return reply.send(existing);
      }

      const settings: PackageSettings = {
        id: `settings_${Date.now()}`,
        ...data,
        createdAt: now,
        updatedAt: now,
      };

      packageSettings.set(settings.id, settings);
      return reply.status(201).send(settings);
    }
  );

  app.get(
    '/settings/:propertyId',
    async (request: FastifyRequest<{ Params: { propertyId: string } }>, reply) => {
      const settings = Array.from(packageSettings.values()).find(
        (s) => s.propertyId === request.params.propertyId
      );

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

      const auth: ProxyAuthorization = {
        id: `proxy_${Date.now()}`,
        ...data,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      proxyAuthorizations.set(auth.id, auth);
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
      let results = Array.from(proxyAuthorizations.values());

      if (request.query.tenantId) {
        results = results.filter((a) => a.tenantId === request.query.tenantId);
      }

      return reply.send({ authorizations: results });
    }
  );

  // Revoke proxy authorization
  app.delete(
    '/proxy-auth/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const auth = proxyAuthorizations.get(request.params.id);
      if (!auth) {
        return reply.status(404).send({ error: 'Authorization not found' });
      }

      auth.isActive = false;
      proxyAuthorizations.set(auth.id, auth);
      return reply.send({ message: 'Authorization revoked' });
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

      const forwarding: ForwardingAddress = {
        id: `fwd_${Date.now()}`,
        ...data,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      forwardingAddresses.set(forwarding.id, forwarding);
      return reply.status(201).send(forwarding);
    }
  );

  // Get tenant's forwarding address
  app.get(
    '/forwarding/:tenantId',
    async (request: FastifyRequest<{ Params: { tenantId: string } }>, reply) => {
      const forwarding = Array.from(forwardingAddresses.values()).find(
        (f) => f.tenantId === request.params.tenantId && f.isActive
      );

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
      const forwarding = forwardingAddresses.get(request.params.id);
      if (!forwarding) {
        return reply.status(404).send({ error: 'Forwarding address not found' });
      }

      forwarding.isActive = false;
      forwardingAddresses.set(forwarding.id, forwarding);
      return reply.send({ message: 'Forwarding cancelled' });
    }
  );
}

