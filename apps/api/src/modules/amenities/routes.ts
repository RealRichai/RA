import {
  prisma,
  Prisma,
  type AmenityType as PrismaAmenityType,
  type AmenityStatus as PrismaAmenityStatus,
  type AmenityBookingStatus,
  type RecurrenceType as PrismaRecurrenceType,
  type AmenityWaitlistStatus,
} from '@realriches/database';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

type AmenityType = 'pool' | 'gym' | 'clubhouse' | 'tennis' | 'basketball' | 'bbq' | 'theater' | 'business_center' | 'spa' | 'rooftop' | 'other';
type AmenityStatus = 'available' | 'maintenance' | 'closed' | 'reserved';
type BookingStatus = 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
type RecurrenceType = 'daily' | 'weekly' | 'biweekly' | 'monthly';

interface Amenity {
  id: string;
  propertyId: string;
  name: string;
  type: AmenityType;
  description?: string;
  location?: string;
  capacity: number;
  status: AmenityStatus;
  requiresBooking: boolean;
  advanceBookingDays: number;
  maxBookingDuration: number; // minutes
  minBookingDuration: number; // minutes
  maxBookingsPerDay: number;
  operatingHours: OperatingHours[];
  rules: string[];
  photos: string[];
  amenities: string[]; // sub-amenities like "towels", "wifi"
  createdAt: string;
  updatedAt: string;
}

interface OperatingHours {
  dayOfWeek: number; // 0-6
  openTime: string; // HH:MM
  closeTime: string; // HH:MM
  isClosed: boolean;
}

interface BookingSlot {
  id: string;
  amenityId: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  status: 'available' | 'full' | 'blocked';
}

interface Booking {
  id: string;
  amenityId: string;
  slotId?: string;
  tenantId: string;
  unitId: string;
  propertyId: string;
  date: string;
  startTime: string;
  endTime: string;
  guestCount: number;
  status: BookingStatus;
  confirmationCode: string;
  checkInTime?: string;
  checkOutTime?: string;
  notes?: string;
  isRecurring: boolean;
  recurrenceId?: string;
  createdAt: string;
  updatedAt: string;
}

interface RecurringBooking {
  id: string;
  amenityId: string;
  tenantId: string;
  unitId: string;
  propertyId: string;
  recurrenceType: RecurrenceType;
  dayOfWeek?: number;
  dayOfMonth?: number;
  startTime: string;
  endTime: string;
  guestCount: number;
  startDate: string;
  endDate?: string;
  isActive: boolean;
  createdAt: string;
}

interface WaitlistEntry {
  id: string;
  amenityId: string;
  tenantId: string;
  date: string;
  preferredStartTime?: string;
  preferredEndTime?: string;
  guestCount: number;
  status: 'waiting' | 'notified' | 'booked' | 'expired';
  notifiedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

interface AmenityUsage {
  id: string;
  amenityId: string;
  bookingId?: string;
  tenantId: string;
  date: string;
  checkInTime: string;
  checkOutTime?: string;
  duration?: number; // minutes
  guestCount: number;
  createdAt: string;
}

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

export const amenities = new Map<string, Amenity>();
export const bookingSlots = new Map<string, BookingSlot>();
export const reservations = new Map<string, Booking>(); // alias for tests
export const recurringBookings = new Map<string, RecurringBooking>();
export const waitlists = new Map<string, WaitlistEntry>();
export const usageLogs = new Map<string, AmenityUsage>();
// Internal reference for bookings
const bookings = reservations;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function generateConfirmationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function generateTimeSlots(
  amenity: Amenity,
  date: string,
  slotDurationMinutes: number = 60
): Array<{ startTime: string; endTime: string }> {
  const dayOfWeek = new Date(date).getDay();
  const hours = amenity.operatingHours.find((h) => h.dayOfWeek === dayOfWeek);

  if (!hours || hours.isClosed) return [];

  const slots: Array<{ startTime: string; endTime: string }> = [];
  const [openHour, openMin] = hours.openTime.split(':').map(Number);
  const [closeHour, closeMin] = hours.closeTime.split(':').map(Number);

  let currentMinutes = openHour * 60 + openMin;
  const closeMinutes = closeHour * 60 + closeMin;

  while (currentMinutes + slotDurationMinutes <= closeMinutes) {
    const startHour = Math.floor(currentMinutes / 60);
    const startMin = currentMinutes % 60;
    const endMinutes = currentMinutes + slotDurationMinutes;
    const endHour = Math.floor(endMinutes / 60);
    const endMin = endMinutes % 60;

    slots.push({
      startTime: `${startHour.toString().padStart(2, '0')}:${startMin.toString().padStart(2, '0')}`,
      endTime: `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`,
    });

    currentMinutes += slotDurationMinutes;
  }

  return slots;
}

export function checkSlotAvailability(
  amenityId: string,
  date: string,
  startTime: string,
  endTime: string,
  guestCount: number
): { available: boolean; reason?: string; remainingCapacity?: number } {
  const amenity = amenities.get(amenityId);
  if (!amenity) {
    return { available: false, reason: 'Amenity not found' };
  }

  if (amenity.status !== 'available') {
    return { available: false, reason: `Amenity is ${amenity.status}` };
  }

  // Check operating hours
  const dayOfWeek = new Date(date).getDay();
  const hours = amenity.operatingHours.find((h) => h.dayOfWeek === dayOfWeek);
  if (!hours || hours.isClosed) {
    return { available: false, reason: 'Amenity is closed on this day' };
  }

  // Check if time is within operating hours
  if (startTime < hours.openTime || endTime > hours.closeTime) {
    return { available: false, reason: 'Time is outside operating hours' };
  }

  // Count existing bookings for this slot
  const existingBookings = Array.from(bookings.values()).filter(
    (b) =>
      b.amenityId === amenityId &&
      b.date === date &&
      b.status !== 'cancelled' &&
      b.status !== 'no_show' &&
      ((b.startTime <= startTime && b.endTime > startTime) ||
        (b.startTime < endTime && b.endTime >= endTime) ||
        (b.startTime >= startTime && b.endTime <= endTime))
  );

  const bookedCount = existingBookings.reduce((sum, b) => sum + b.guestCount, 0);
  const remainingCapacity = amenity.capacity - bookedCount;

  if (remainingCapacity < guestCount) {
    return {
      available: false,
      reason: 'Not enough capacity',
      remainingCapacity,
    };
  }

  return { available: true, remainingCapacity };
}

export function calculateUsageStats(
  amenityId: string,
  startDate: string,
  endDate: string
): {
  totalBookings: number;
  totalGuests: number;
  averageDuration: number;
  peakHours: Array<{ hour: number; count: number }>;
  utilizationRate: number;
} {
  const logs = Array.from(usageLogs.values()).filter(
    (u) => u.amenityId === amenityId && u.date >= startDate && u.date <= endDate
  );

  const amenity = amenities.get(amenityId);
  const totalBookings = logs.length;
  const totalGuests = logs.reduce((sum, l) => sum + l.guestCount, 0);
  const durations = logs.filter((l) => l.duration).map((l) => l.duration!);
  const averageDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  // Calculate peak hours
  const hourCounts: Record<number, number> = {};
  logs.forEach((l) => {
    const hour = parseInt(l.checkInTime.split(':')[0], 10);
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });

  const peakHours = Object.entries(hourCounts)
    .map(([hour, count]) => ({ hour: parseInt(hour, 10), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Calculate utilization rate
  const dayCount = Math.ceil(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;
  const maxBookingsPerPeriod = (amenity?.maxBookingsPerDay || 10) * dayCount;
  const utilizationRate = maxBookingsPerPeriod > 0
    ? Math.round((totalBookings / maxBookingsPerPeriod) * 100)
    : 0;

  return {
    totalBookings,
    totalGuests,
    averageDuration: Math.round(averageDuration),
    peakHours,
    utilizationRate,
  };
}

export function getNextAvailableSlot(
  amenityId: string,
  guestCount: number,
  afterDate?: string
): { date: string; startTime: string; endTime: string } | null {
  const amenity = amenities.get(amenityId);
  if (!amenity) return null;

  const startDate = afterDate || new Date().toISOString().split('T')[0];
  const maxDays = amenity.advanceBookingDays || 30;

  for (let i = 0; i < maxDays; i++) {
    const checkDate = new Date(startDate);
    checkDate.setDate(checkDate.getDate() + i);
    const dateStr = checkDate.toISOString().split('T')[0];

    const slots = generateTimeSlots(amenity, dateStr, amenity.minBookingDuration);

    for (const slot of slots) {
      const availability = checkSlotAvailability(
        amenityId,
        dateStr,
        slot.startTime,
        slot.endTime,
        guestCount
      );

      if (availability.available) {
        return { date: dateStr, ...slot };
      }
    }
  }

  return null;
}

// ============================================================================
// ASYNC PRISMA FUNCTIONS
// ============================================================================

async function checkSlotAvailabilityAsync(
  amenityId: string,
  date: string,
  startTime: string,
  endTime: string,
  guestCount: number
): Promise<{ available: boolean; reason?: string; remainingCapacity?: number }> {
  const amenity = await prisma.amenity.findUnique({
    where: { id: amenityId },
  });

  if (!amenity) {
    return { available: false, reason: 'Amenity not found' };
  }

  if (amenity.status !== 'available') {
    return { available: false, reason: `Amenity is ${amenity.status}` };
  }

  // Check operating hours
  const dayOfWeek = new Date(date).getDay();
  const operatingHours = amenity.operatingHours as Array<{ dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }>;
  const hours = operatingHours?.find((h) => h.dayOfWeek === dayOfWeek);
  if (!hours || hours.isClosed) {
    return { available: false, reason: 'Amenity is closed on this day' };
  }

  // Check if time is within operating hours
  if (startTime < hours.openTime || endTime > hours.closeTime) {
    return { available: false, reason: 'Time is outside operating hours' };
  }

  // Count existing bookings for this slot
  const existingBookings = await prisma.amenityBooking.findMany({
    where: {
      amenityId,
      date: new Date(date),
      status: { notIn: ['cancelled', 'no_show'] },
    },
  });

  // Filter for overlapping times
  const overlapping = existingBookings.filter(b =>
    (b.startTime <= startTime && b.endTime > startTime) ||
    (b.startTime < endTime && b.endTime >= endTime) ||
    (b.startTime >= startTime && b.endTime <= endTime)
  );

  const bookedCount = overlapping.reduce((sum, b) => sum + b.guestCount, 0);
  const remainingCapacity = amenity.capacity - bookedCount;

  if (remainingCapacity < guestCount) {
    return {
      available: false,
      reason: 'Not enough capacity',
      remainingCapacity,
    };
  }

  return { available: true, remainingCapacity };
}

async function calculateUsageStatsAsync(
  amenityId: string,
  startDate: string,
  endDate: string
): Promise<{
  totalBookings: number;
  totalGuests: number;
  averageDuration: number;
  peakHours: Array<{ hour: number; count: number }>;
  utilizationRate: number;
}> {
  const logs = await prisma.amenityUsageLog.findMany({
    where: {
      amenityId,
      date: {
        gte: new Date(startDate),
        lte: new Date(endDate),
      },
    },
  });

  const amenity = await prisma.amenity.findUnique({
    where: { id: amenityId },
  });

  const totalBookings = logs.length;
  const totalGuests = logs.reduce((sum, l) => sum + l.guestCount, 0);
  const durations = logs.filter((l) => l.duration).map((l) => l.duration!);
  const averageDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  // Calculate peak hours
  const hourCounts: Record<number, number> = {};
  logs.forEach((l) => {
    const hour = l.checkInTime.getHours();
    hourCounts[hour] = (hourCounts[hour] || 0) + 1;
  });

  const peakHours = Object.entries(hourCounts)
    .map(([hour, count]) => ({ hour: parseInt(hour, 10), count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Calculate utilization rate
  const dayCount = Math.ceil(
    (new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;
  const maxBookingsPerPeriod = (amenity?.maxBookingsPerDay || 10) * dayCount;
  const utilizationRate = maxBookingsPerPeriod > 0
    ? Math.round((totalBookings / maxBookingsPerPeriod) * 100)
    : 0;

  return {
    totalBookings,
    totalGuests,
    averageDuration: Math.round(averageDuration),
    peakHours,
    utilizationRate,
  };
}

// ============================================================================
// SCHEMAS
// ============================================================================

const OperatingHoursSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  openTime: z.string(),
  closeTime: z.string(),
  isClosed: z.boolean().default(false),
});

const AmenitySchema = z.object({
  propertyId: z.string(),
  name: z.string(),
  type: z.enum(['pool', 'gym', 'clubhouse', 'tennis', 'basketball', 'bbq', 'theater', 'business_center', 'spa', 'rooftop', 'other']),
  description: z.string().optional(),
  location: z.string().optional(),
  capacity: z.number().default(10),
  requiresBooking: z.boolean().default(true),
  advanceBookingDays: z.number().default(14),
  maxBookingDuration: z.number().default(120),
  minBookingDuration: z.number().default(30),
  maxBookingsPerDay: z.number().default(2),
  operatingHours: z.array(OperatingHoursSchema).default([]),
  rules: z.array(z.string()).default([]),
  photos: z.array(z.string()).default([]),
  amenities: z.array(z.string()).default([]),
});

const BookingSchema = z.object({
  amenityId: z.string(),
  tenantId: z.string(),
  unitId: z.string(),
  propertyId: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  guestCount: z.number().default(1),
  notes: z.string().optional(),
});

const RecurringBookingSchema = z.object({
  amenityId: z.string(),
  tenantId: z.string(),
  unitId: z.string(),
  propertyId: z.string(),
  recurrenceType: z.enum(['daily', 'weekly', 'biweekly', 'monthly']),
  dayOfWeek: z.number().min(0).max(6).optional(),
  dayOfMonth: z.number().min(1).max(31).optional(),
  startTime: z.string(),
  endTime: z.string(),
  guestCount: z.number().default(1),
  startDate: z.string(),
  endDate: z.string().optional(),
});

const WaitlistSchema = z.object({
  amenityId: z.string(),
  tenantId: z.string(),
  date: z.string(),
  preferredStartTime: z.string().optional(),
  preferredEndTime: z.string().optional(),
  guestCount: z.number().default(1),
});

// ============================================================================
// ROUTES
// ============================================================================

export async function amenityRoutes(app: FastifyInstance): Promise<void> {
  // ─────────────────────────────────────────────────────────────────────────
  // AMENITIES
  // ─────────────────────────────────────────────────────────────────────────

  // Create amenity
  app.post(
    '/',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof AmenitySchema> }>,
      reply
    ) => {
      const data = AmenitySchema.parse(request.body);

      const amenity = await prisma.amenity.create({
        data: {
          propertyId: data.propertyId,
          name: data.name,
          type: data.type as PrismaAmenityType,
          description: data.description,
          location: data.location,
          capacity: data.capacity ?? 10,
          requiresBooking: data.requiresBooking ?? true,
          advanceBookingDays: data.advanceBookingDays ?? 14,
          maxBookingDuration: data.maxBookingDuration ?? 120,
          minBookingDuration: data.minBookingDuration ?? 30,
          maxBookingsPerDay: data.maxBookingsPerDay ?? 2,
          operatingHours: (data.operatingHours ?? []).map(h => ({
            dayOfWeek: h.dayOfWeek,
            openTime: h.openTime,
            closeTime: h.closeTime,
            isClosed: h.isClosed ?? false,
          })),
          rules: data.rules ?? [],
          photos: data.photos ?? [],
          amenities: data.amenities ?? [],
          status: 'available',
        },
      });

      return reply.status(201).send(amenity);
    }
  );

  // List amenities
  app.get(
    '/',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; type?: string; status?: string };
      }>,
      reply
    ) => {
      const where: Prisma.AmenityWhereInput = {};

      if (request.query.propertyId) {
        where.propertyId = request.query.propertyId;
      }
      if (request.query.type) {
        where.type = request.query.type as PrismaAmenityType;
      }
      if (request.query.status) {
        where.status = request.query.status as PrismaAmenityStatus;
      }

      const results = await prisma.amenity.findMany({ where });

      return reply.send({ amenities: results });
    }
  );

  // Get amenity with availability
  app.get(
    '/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { date?: string };
      }>,
      reply
    ) => {
      const amenity = await prisma.amenity.findUnique({
        where: { id: request.params.id },
      });
      if (!amenity) {
        return reply.status(404).send({ error: 'Amenity not found' });
      }

      const date = request.query.date || new Date().toISOString().split('T')[0];
      const operatingHours = amenity.operatingHours as Array<{ dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }>;
      const amenityForSlots = {
        ...amenity,
        operatingHours: operatingHours || [],
      };
      const slots = generateTimeSlots(amenityForSlots as unknown as Amenity, date, amenity.minBookingDuration);

      const slotsWithAvailability = await Promise.all(
        slots.map(async (slot) => ({
          ...slot,
          ...(await checkSlotAvailabilityAsync(amenity.id, date, slot.startTime, slot.endTime, 1)),
        }))
      );

      return reply.send({
        ...amenity,
        slots: slotsWithAvailability,
      });
    }
  );

  // Update amenity status
  app.patch(
    '/:id/status',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { status: AmenityStatus };
      }>,
      reply
    ) => {
      try {
        const amenity = await prisma.amenity.update({
          where: { id: request.params.id },
          data: {
            status: request.body.status as PrismaAmenityStatus,
          },
        });
        return reply.send(amenity);
      } catch {
        return reply.status(404).send({ error: 'Amenity not found' });
      }
    }
  );

  // Get amenity usage stats
  app.get(
    '/:id/stats',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { startDate?: string; endDate?: string };
      }>,
      reply
    ) => {
      const amenity = await prisma.amenity.findUnique({
        where: { id: request.params.id },
      });
      if (!amenity) {
        return reply.status(404).send({ error: 'Amenity not found' });
      }

      const endDate = request.query.endDate || new Date().toISOString().split('T')[0];
      const startDate = request.query.startDate || (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
      })();

      const stats = await calculateUsageStatsAsync(amenity.id, startDate, endDate);
      return reply.send(stats);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // BOOKINGS
  // ─────────────────────────────────────────────────────────────────────────

  // Create booking
  app.post(
    '/bookings',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof BookingSchema> }>,
      reply
    ) => {
      const data = BookingSchema.parse(request.body);

      // Check availability
      const availability = await checkSlotAvailabilityAsync(
        data.amenityId,
        data.date,
        data.startTime,
        data.endTime,
        data.guestCount
      );

      if (!availability.available) {
        return reply.status(400).send({
          error: 'Slot not available',
          reason: availability.reason,
        });
      }

      // Check max bookings per day
      const amenity = await prisma.amenity.findUnique({
        where: { id: data.amenityId },
      });
      const todayBookings = await prisma.amenityBooking.count({
        where: {
          amenityId: data.amenityId,
          tenantId: data.tenantId,
          date: new Date(data.date),
          status: { not: 'cancelled' },
        },
      });

      if (amenity && todayBookings >= amenity.maxBookingsPerDay) {
        return reply.status(400).send({
          error: `Maximum ${amenity.maxBookingsPerDay} bookings per day exceeded`,
        });
      }

      const booking = await prisma.amenityBooking.create({
        data: {
          amenityId: data.amenityId,
          tenantId: data.tenantId,
          unitId: data.unitId,
          propertyId: data.propertyId,
          date: new Date(data.date),
          startTime: data.startTime,
          endTime: data.endTime,
          guestCount: data.guestCount ?? 1,
          notes: data.notes,
          status: 'confirmed',
          confirmationCode: generateConfirmationCode(),
          isRecurring: false,
        },
      });

      return reply.status(201).send(booking);
    }
  );

  // List bookings
  app.get(
    '/bookings',
    async (
      request: FastifyRequest<{
        Querystring: {
          amenityId?: string;
          tenantId?: string;
          date?: string;
          status?: string;
        };
      }>,
      reply
    ) => {
      const where: Prisma.AmenityBookingWhereInput = {};

      if (request.query.amenityId) {
        where.amenityId = request.query.amenityId;
      }
      if (request.query.tenantId) {
        where.tenantId = request.query.tenantId;
      }
      if (request.query.date) {
        where.date = new Date(request.query.date);
      }
      if (request.query.status) {
        where.status = request.query.status as AmenityBookingStatus;
      }

      const results = await prisma.amenityBooking.findMany({ where });

      return reply.send({ bookings: results });
    }
  );

  // Get booking
  app.get(
    '/bookings/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const booking = await prisma.amenityBooking.findUnique({
        where: { id: request.params.id },
        include: { amenity: true },
      });
      if (!booking) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      return reply.send(booking);
    }
  );

  // Cancel booking
  app.post(
    '/bookings/:id/cancel',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const booking = await prisma.amenityBooking.findUnique({
        where: { id: request.params.id },
      });
      if (!booking) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      const updatedBooking = await prisma.amenityBooking.update({
        where: { id: request.params.id },
        data: { status: 'cancelled' },
      });

      // Notify waitlist
      const firstWaitlistEntry = await prisma.amenityWaitlist.findFirst({
        where: {
          amenityId: booking.amenityId,
          date: booking.date,
          status: 'waiting',
        },
        orderBy: { createdAt: 'asc' },
      });

      if (firstWaitlistEntry) {
        await prisma.amenityWaitlist.update({
          where: { id: firstWaitlistEntry.id },
          data: {
            status: 'notified',
            notifiedAt: new Date(),
            expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
          },
        });
      }

      return reply.send({ message: 'Booking cancelled', booking: updatedBooking });
    }
  );

  // Check in
  app.post(
    '/bookings/:id/check-in',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const booking = await prisma.amenityBooking.findUnique({
        where: { id: request.params.id },
      });
      if (!booking) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      const now = new Date();
      const updatedBooking = await prisma.amenityBooking.update({
        where: { id: request.params.id },
        data: {
          status: 'checked_in',
          checkInTime: now,
        },
      });

      // Log usage
      await prisma.amenityUsageLog.create({
        data: {
          amenityId: booking.amenityId,
          bookingId: booking.id,
          tenantId: booking.tenantId,
          date: booking.date,
          checkInTime: now,
          guestCount: booking.guestCount,
        },
      });

      return reply.send(updatedBooking);
    }
  );

  // Check out
  app.post(
    '/bookings/:id/check-out',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const booking = await prisma.amenityBooking.findUnique({
        where: { id: request.params.id },
      });
      if (!booking) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      const now = new Date();
      const updatedBooking = await prisma.amenityBooking.update({
        where: { id: request.params.id },
        data: {
          status: 'completed',
          checkOutTime: now,
        },
      });

      // Update usage log
      const usage = await prisma.amenityUsageLog.findFirst({
        where: { bookingId: booking.id },
      });
      if (usage) {
        const duration = Math.round((now.getTime() - usage.checkInTime.getTime()) / 60000);
        await prisma.amenityUsageLog.update({
          where: { id: usage.id },
          data: {
            checkOutTime: now,
            duration,
          },
        });
      }

      return reply.send(updatedBooking);
    }
  );

  // Find next available slot
  app.get(
    '/bookings/next-available',
    async (
      request: FastifyRequest<{
        Querystring: { amenityId: string; guestCount?: string; afterDate?: string };
      }>,
      reply
    ) => {
      const guestCount = parseInt(request.query.guestCount || '1', 10);
      const slot = getNextAvailableSlot(
        request.query.amenityId,
        guestCount,
        request.query.afterDate
      );

      if (!slot) {
        return reply.status(404).send({ error: 'No available slots found' });
      }

      return reply.send(slot);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RECURRING BOOKINGS
  // ─────────────────────────────────────────────────────────────────────────

  // Create recurring booking
  app.post(
    '/recurring',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof RecurringBookingSchema> }>,
      reply
    ) => {
      const data = RecurringBookingSchema.parse(request.body);

      const recurring = await prisma.amenityRecurringBooking.create({
        data: {
          amenityId: data.amenityId,
          tenantId: data.tenantId,
          unitId: data.unitId,
          propertyId: data.propertyId,
          recurrenceType: data.recurrenceType as PrismaRecurrenceType,
          dayOfWeek: data.dayOfWeek,
          dayOfMonth: data.dayOfMonth,
          startTime: data.startTime,
          endTime: data.endTime,
          guestCount: data.guestCount ?? 1,
          startDate: new Date(data.startDate),
          endDate: data.endDate ? new Date(data.endDate) : null,
          isActive: true,
        },
      });

      // Generate initial bookings
      const generatedBookings: Awaited<ReturnType<typeof prisma.amenityBooking.create>>[] = [];
      const endDate = data.endDate || (() => {
        const d = new Date(data.startDate);
        d.setMonth(d.getMonth() + 3);
        return d.toISOString().split('T')[0];
      })();

      const currentDate = new Date(data.startDate);
      const end = new Date(endDate);

      while (currentDate <= end) {
        const dateStr = currentDate.toISOString().split('T')[0];
        let shouldBook = false;

        if (data.recurrenceType === 'daily') {
          shouldBook = true;
        } else if (data.recurrenceType === 'weekly' && data.dayOfWeek !== undefined) {
          shouldBook = currentDate.getDay() === data.dayOfWeek;
        } else if (data.recurrenceType === 'biweekly' && data.dayOfWeek !== undefined) {
          const weekNum = Math.floor((currentDate.getTime() - new Date(data.startDate).getTime()) / (7 * 24 * 60 * 60 * 1000));
          shouldBook = currentDate.getDay() === data.dayOfWeek && weekNum % 2 === 0;
        } else if (data.recurrenceType === 'monthly' && data.dayOfMonth !== undefined) {
          shouldBook = currentDate.getDate() === data.dayOfMonth;
        }

        if (shouldBook) {
          const availability = await checkSlotAvailabilityAsync(
            data.amenityId,
            dateStr,
            data.startTime,
            data.endTime,
            data.guestCount
          );

          if (availability.available) {
            const booking = await prisma.amenityBooking.create({
              data: {
                amenityId: data.amenityId,
                tenantId: data.tenantId,
                unitId: data.unitId,
                propertyId: data.propertyId,
                date: new Date(dateStr),
                startTime: data.startTime,
                endTime: data.endTime,
                guestCount: data.guestCount,
                status: 'confirmed',
                confirmationCode: generateConfirmationCode(),
                isRecurring: true,
                recurrenceId: recurring.id,
              },
            });
            generatedBookings.push(booking);
          }
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return reply.status(201).send({
        recurring,
        generatedBookings: generatedBookings.length,
        bookings: generatedBookings,
      });
    }
  );

  // Cancel recurring booking
  app.post(
    '/recurring/:id/cancel',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { cancelFutureOnly?: boolean };
      }>,
      reply
    ) => {
      const recurring = await prisma.amenityRecurringBooking.findUnique({
        where: { id: request.params.id },
      });
      if (!recurring) {
        return reply.status(404).send({ error: 'Recurring booking not found' });
      }

      await prisma.amenityRecurringBooking.update({
        where: { id: recurring.id },
        data: { isActive: false },
      });

      // Cancel associated bookings
      const today = new Date();
      const whereClause: Prisma.AmenityBookingWhereInput = {
        recurrenceId: recurring.id,
        status: 'confirmed',
      };
      if (request.body.cancelFutureOnly) {
        whereClause.date = { gte: today };
      }

      const result = await prisma.amenityBooking.updateMany({
        where: whereClause,
        data: { status: 'cancelled' },
      });

      return reply.send({
        message: 'Recurring booking cancelled',
        cancelledBookings: result.count,
      });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // WAITLIST
  // ─────────────────────────────────────────────────────────────────────────

  // Join waitlist
  app.post(
    '/waitlist',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof WaitlistSchema> }>,
      reply
    ) => {
      const data = WaitlistSchema.parse(request.body);

      const entry = await prisma.amenityWaitlist.create({
        data: {
          amenityId: data.amenityId,
          tenantId: data.tenantId,
          date: new Date(data.date),
          preferredStartTime: data.preferredStartTime,
          preferredEndTime: data.preferredEndTime,
          guestCount: data.guestCount ?? 1,
          status: 'waiting',
        },
      });

      return reply.status(201).send(entry);
    }
  );

  // Get waitlist
  app.get(
    '/waitlist',
    async (
      request: FastifyRequest<{
        Querystring: { amenityId?: string; date?: string; tenantId?: string };
      }>,
      reply
    ) => {
      const where: Prisma.AmenityWaitlistWhereInput = {};

      if (request.query.amenityId) {
        where.amenityId = request.query.amenityId;
      }
      if (request.query.date) {
        where.date = new Date(request.query.date);
      }
      if (request.query.tenantId) {
        where.tenantId = request.query.tenantId;
      }

      const results = await prisma.amenityWaitlist.findMany({
        where,
        orderBy: { createdAt: 'asc' },
      });

      return reply.send({ waitlist: results });
    }
  );

  // Remove from waitlist
  app.delete(
    '/waitlist/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      try {
        await prisma.amenityWaitlist.delete({
          where: { id: request.params.id },
        });
        return reply.send({ message: 'Removed from waitlist' });
      } catch {
        return reply.status(404).send({ error: 'Waitlist entry not found' });
      }
    }
  );
}

