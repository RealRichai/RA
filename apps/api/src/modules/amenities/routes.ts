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
      const now = new Date().toISOString();

      const amenity: Amenity = {
        id: `amen_${Date.now()}`,
        propertyId: data.propertyId,
        name: data.name,
        type: data.type,
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
        createdAt: now,
        updatedAt: now,
      };

      amenities.set(amenity.id, amenity);
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
      let results = Array.from(amenities.values());

      if (request.query.propertyId) {
        results = results.filter((a) => a.propertyId === request.query.propertyId);
      }
      if (request.query.type) {
        results = results.filter((a) => a.type === request.query.type);
      }
      if (request.query.status) {
        results = results.filter((a) => a.status === request.query.status);
      }

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
      const amenity = amenities.get(request.params.id);
      if (!amenity) {
        return reply.status(404).send({ error: 'Amenity not found' });
      }

      const date = request.query.date || new Date().toISOString().split('T')[0];
      const slots = generateTimeSlots(amenity, date, amenity.minBookingDuration);

      const slotsWithAvailability = slots.map((slot) => ({
        ...slot,
        ...checkSlotAvailability(amenity.id, date, slot.startTime, slot.endTime, 1),
      }));

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
      const amenity = amenities.get(request.params.id);
      if (!amenity) {
        return reply.status(404).send({ error: 'Amenity not found' });
      }

      amenity.status = request.body.status;
      amenity.updatedAt = new Date().toISOString();
      amenities.set(amenity.id, amenity);

      return reply.send(amenity);
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
      const amenity = amenities.get(request.params.id);
      if (!amenity) {
        return reply.status(404).send({ error: 'Amenity not found' });
      }

      const endDate = request.query.endDate || new Date().toISOString().split('T')[0];
      const startDate = request.query.startDate || (() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().split('T')[0];
      })();

      const stats = calculateUsageStats(amenity.id, startDate, endDate);
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
      const availability = checkSlotAvailability(
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
      const amenity = amenities.get(data.amenityId);
      const todayBookings = Array.from(bookings.values()).filter(
        (b) =>
          b.amenityId === data.amenityId &&
          b.tenantId === data.tenantId &&
          b.date === data.date &&
          b.status !== 'cancelled'
      );

      if (amenity && todayBookings.length >= amenity.maxBookingsPerDay) {
        return reply.status(400).send({
          error: `Maximum ${amenity.maxBookingsPerDay} bookings per day exceeded`,
        });
      }

      const now = new Date().toISOString();
      const booking: Booking = {
        id: `book_${Date.now()}`,
        amenityId: data.amenityId,
        tenantId: data.tenantId,
        unitId: data.unitId,
        propertyId: data.propertyId,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        guestCount: data.guestCount ?? 1,
        notes: data.notes,
        status: 'confirmed',
        confirmationCode: generateConfirmationCode(),
        isRecurring: false,
        createdAt: now,
        updatedAt: now,
      };

      bookings.set(booking.id, booking);
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
      let results = Array.from(bookings.values());

      if (request.query.amenityId) {
        results = results.filter((b) => b.amenityId === request.query.amenityId);
      }
      if (request.query.tenantId) {
        results = results.filter((b) => b.tenantId === request.query.tenantId);
      }
      if (request.query.date) {
        results = results.filter((b) => b.date === request.query.date);
      }
      if (request.query.status) {
        results = results.filter((b) => b.status === request.query.status);
      }

      return reply.send({ bookings: results });
    }
  );

  // Get booking
  app.get(
    '/bookings/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const booking = bookings.get(request.params.id);
      if (!booking) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      const amenity = amenities.get(booking.amenityId);
      return reply.send({ ...booking, amenity });
    }
  );

  // Cancel booking
  app.post(
    '/bookings/:id/cancel',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const booking = bookings.get(request.params.id);
      if (!booking) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      booking.status = 'cancelled';
      booking.updatedAt = new Date().toISOString();
      bookings.set(booking.id, booking);

      // Notify waitlist
      const waitlistEntries = Array.from(waitlists.values()).filter(
        (w) =>
          w.amenityId === booking.amenityId &&
          w.date === booking.date &&
          w.status === 'waiting'
      );

      if (waitlistEntries.length > 0) {
        const firstEntry = waitlistEntries[0];
        firstEntry.status = 'notified';
        firstEntry.notifiedAt = new Date().toISOString();
        firstEntry.expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
        waitlists.set(firstEntry.id, firstEntry);
      }

      return reply.send({ message: 'Booking cancelled', booking });
    }
  );

  // Check in
  app.post(
    '/bookings/:id/check-in',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const booking = bookings.get(request.params.id);
      if (!booking) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      const now = new Date().toISOString();
      booking.status = 'checked_in';
      booking.checkInTime = now;
      booking.updatedAt = now;
      bookings.set(booking.id, booking);

      // Log usage
      const usage: AmenityUsage = {
        id: `usage_${Date.now()}`,
        amenityId: booking.amenityId,
        bookingId: booking.id,
        tenantId: booking.tenantId,
        date: booking.date,
        checkInTime: now.split('T')[1].substring(0, 5),
        guestCount: booking.guestCount,
        createdAt: now,
      };
      usageLogs.set(usage.id, usage);

      return reply.send(booking);
    }
  );

  // Check out
  app.post(
    '/bookings/:id/check-out',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const booking = bookings.get(request.params.id);
      if (!booking) {
        return reply.status(404).send({ error: 'Booking not found' });
      }

      const now = new Date().toISOString();
      booking.status = 'completed';
      booking.checkOutTime = now;
      booking.updatedAt = now;
      bookings.set(booking.id, booking);

      // Update usage log
      const usage = Array.from(usageLogs.values()).find(
        (u) => u.bookingId === booking.id
      );
      if (usage) {
        usage.checkOutTime = now.split('T')[1].substring(0, 5);
        const checkIn = new Date(`2000-01-01T${usage.checkInTime}`);
        const checkOut = new Date(`2000-01-01T${usage.checkOutTime}`);
        usage.duration = Math.round((checkOut.getTime() - checkIn.getTime()) / 60000);
        usageLogs.set(usage.id, usage);
      }

      return reply.send(booking);
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

      const recurring: RecurringBooking = {
        id: `rec_${Date.now()}`,
        amenityId: data.amenityId,
        tenantId: data.tenantId,
        unitId: data.unitId,
        propertyId: data.propertyId,
        recurrenceType: data.recurrenceType,
        dayOfWeek: data.dayOfWeek,
        dayOfMonth: data.dayOfMonth,
        startTime: data.startTime,
        endTime: data.endTime,
        guestCount: data.guestCount ?? 1,
        startDate: data.startDate,
        endDate: data.endDate,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      recurringBookings.set(recurring.id, recurring);

      // Generate initial bookings
      const generatedBookings: Booking[] = [];
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
          const availability = checkSlotAvailability(
            data.amenityId,
            dateStr,
            data.startTime,
            data.endTime,
            data.guestCount
          );

          if (availability.available) {
            const booking: Booking = {
              id: `book_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              amenityId: data.amenityId,
              tenantId: data.tenantId,
              unitId: data.unitId,
              propertyId: data.propertyId,
              date: dateStr,
              startTime: data.startTime,
              endTime: data.endTime,
              guestCount: data.guestCount,
              status: 'confirmed',
              confirmationCode: generateConfirmationCode(),
              isRecurring: true,
              recurrenceId: recurring.id,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            bookings.set(booking.id, booking);
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
      const recurring = recurringBookings.get(request.params.id);
      if (!recurring) {
        return reply.status(404).send({ error: 'Recurring booking not found' });
      }

      recurring.isActive = false;
      recurringBookings.set(recurring.id, recurring);

      // Cancel associated bookings
      const today = new Date().toISOString().split('T')[0];
      let cancelledCount = 0;

      for (const [id, booking] of bookings) {
        if (booking.recurrenceId === recurring.id && booking.status === 'confirmed') {
          if (!request.body.cancelFutureOnly || booking.date >= today) {
            booking.status = 'cancelled';
            booking.updatedAt = new Date().toISOString();
            bookings.set(id, booking);
            cancelledCount++;
          }
        }
      }

      return reply.send({
        message: 'Recurring booking cancelled',
        cancelledBookings: cancelledCount,
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

      const entry: WaitlistEntry = {
        id: `wait_${Date.now()}`,
        amenityId: data.amenityId,
        tenantId: data.tenantId,
        date: data.date,
        preferredStartTime: data.preferredStartTime,
        preferredEndTime: data.preferredEndTime,
        guestCount: data.guestCount ?? 1,
        status: 'waiting',
        createdAt: new Date().toISOString(),
      };

      waitlists.set(entry.id, entry);
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
      let results = Array.from(waitlists.values());

      if (request.query.amenityId) {
        results = results.filter((w) => w.amenityId === request.query.amenityId);
      }
      if (request.query.date) {
        results = results.filter((w) => w.date === request.query.date);
      }
      if (request.query.tenantId) {
        results = results.filter((w) => w.tenantId === request.query.tenantId);
      }

      return reply.send({
        waitlist: results.sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
      });
    }
  );

  // Remove from waitlist
  app.delete(
    '/waitlist/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const entry = waitlists.get(request.params.id);
      if (!entry) {
        return reply.status(404).send({ error: 'Waitlist entry not found' });
      }

      waitlists.delete(request.params.id);
      return reply.send({ message: 'Removed from waitlist' });
    }
  );
}

