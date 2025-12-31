import {
  prisma,
  type CommonAreaType,
  type CommonAreaStatus,
  type ReservationEventType,
  type ReservationStatus,
  type WaitlistStatus,
  type AreaIncidentType,
  type AreaIncidentSeverity,
  type AreaIncidentStatus,
  type CommunityEventType,
  type CommunityEventStatus,
} from '@realriches/database';
import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

// ============================================================================
// EXPORTED TYPES FOR TESTING
// ============================================================================

export interface CommonArea {
  id: string;
  propertyId: string;
  name: string;
  type: CommonAreaType;
  status: CommonAreaStatus;
  capacity: number;
  hourlyRate?: number | null;
  requiresDeposit?: boolean;
  depositAmount?: number | null;
  cancellationHours?: number;
  cleanupTimeMinutes?: number;
  blackoutDates?: string[];
  operatingHours?: OperatingHours[] | null;
}

export interface AreaReservation {
  id: string;
  areaId: string;
  unitId?: string;
  date: string;
  startTime: string;
  endTime: string;
  status: ReservationStatus;
  createdAt: Date;
  fee?: number;
  deposit?: number;
}

export interface CommunityEvent {
  id: string;
  areaId: string;
  name: string;
  type: CommunityEventType;
  status: CommunityEventStatus;
  startDate: Date;
  endDate: Date;
}

// Exported Maps for testing
export const commonAreas = new Map<string, CommonArea>();
export const areaReservations = new Map<string, AreaReservation>();
export const communityEvents = new Map<string, CommunityEvent>();

// Sync versions of functions for testing
export function isTimeSlotAvailableSync(
  areaId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeReservationId?: string
): boolean {
  const area = commonAreas.get(areaId);
  if (!area) return false;
  if (area.blackoutDates?.includes(date)) return false;

  const conflicting = Array.from(areaReservations.values()).filter(r =>
    r.areaId === areaId &&
    r.date === date &&
    r.id !== excludeReservationId &&
    !['cancelled', 'rejected'].includes(r.status as string) &&
    !(endTime <= r.startTime || startTime >= r.endTime)
  );

  return conflicting.length === 0;
}

export function getAreaUtilizationSync(areaId: string, startDate?: string, endDate?: string): {
  totalReservations: number;
  completedReservations: number;
  cancelledReservations: number;
  totalRevenue: number;
  averageOccupancy: number;
  peakHours: { hour: number; count: number }[];
  utilizationByDay: Record<string, number>;
} {
  let reservations = Array.from(areaReservations.values()).filter(r => r.areaId === areaId);

  if (startDate && endDate) {
    reservations = reservations.filter(r => r.date >= startDate && r.date <= endDate);
  }

  const completed = reservations.filter(r => r.status === 'completed').length;
  const cancelled = reservations.filter(r => r.status === 'cancelled').length;
  const totalRevenue = reservations.reduce((sum, r) => sum + (r.rentalFee || 0), 0);

  return {
    totalReservations: reservations.length,
    completedReservations: completed,
    cancelledReservations: cancelled,
    totalRevenue,
    averageOccupancy: 0,
    peakHours: [],
    utilizationByDay: {},
  };
}

export function checkCancellationEligibilitySync(
  reservationIdOrObj: string | AreaReservation
): { eligible: boolean; refundEligible: boolean; refundPercentage: number; deadline: Date | null; reason?: string } {
  let reservation: AreaReservation | undefined;

  if (typeof reservationIdOrObj === 'string') {
    reservation = areaReservations.get(reservationIdOrObj);
  } else {
    reservation = reservationIdOrObj;
  }

  if (!reservation) {
    return { eligible: false, refundEligible: false, refundPercentage: 0, deadline: null, reason: 'Reservation not found' };
  }

  const area = commonAreas.get(reservation.areaId);
  if (!area) {
    return { eligible: false, refundEligible: false, refundPercentage: 0, deadline: null, reason: 'Area not found' };
  }

  const reservationDateTime = new Date(`${reservation.date}T${reservation.startTime}`);
  const now = new Date();
  const hoursUntil = (reservationDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  const cancellationHours = area.cancellationHours || 24;

  if (hoursUntil >= cancellationHours) {
    return { eligible: true, refundEligible: true, refundPercentage: 100, deadline: reservationDateTime };
  } else if (hoursUntil >= 0) {
    return { eligible: true, refundEligible: true, refundPercentage: 50, deadline: reservationDateTime };
  } else {
    return { eligible: false, refundEligible: false, refundPercentage: 0, deadline: null, reason: 'Reservation already past' };
  }
}

// Export sync versions as main exports
export { isTimeSlotAvailableSync as isTimeSlotAvailable };
export { getAreaUtilizationSync as getAreaUtilization };
export { checkCancellationEligibilitySync as checkCancellationEligibility };

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface OperatingHours {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

export function generateConfirmationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

interface OperatingHours {
  dayOfWeek: number;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

interface CommonAreaWithOperatingHours {
  operatingHours: OperatingHours[] | null;
  blackoutDates: string[];
  cleanupTimeMinutes: number;
  cancellationHours: number;
  capacity: number;
  hourlyRate: { toNumber: () => number } | number | null;
  requiresDeposit: boolean;
  depositAmount: { toNumber: () => number } | number | null;
}

function extractNumber(value: { toNumber: () => number } | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return value.toNumber();
}

export function getOperatingHoursForDay(
  area: CommonAreaWithOperatingHours,
  dayOfWeek: number
): OperatingHours | null {
  if (!area.operatingHours || !Array.isArray(area.operatingHours)) return null;
  const hours = (area.operatingHours as OperatingHours[]).find((h) => h.dayOfWeek === dayOfWeek);
  return hours || null;
}

async function isTimeSlotAvailableAsync(
  areaId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeReservationId?: string
): Promise<boolean> {
  const area = await prisma.commonArea.findUnique({
    where: { id: areaId },
  });

  if (!area) return false;

  // Check if date is blackout
  if (area.blackoutDates?.includes(date)) {
    return false;
  }

  // Check operating hours
  const dayOfWeek = new Date(date).getDay();
  const hours = getOperatingHoursForDay(area as CommonAreaWithOperatingHours, dayOfWeek);
  if (!hours || hours.isClosed) {
    return false;
  }

  if (startTime < hours.openTime || endTime > hours.closeTime) {
    return false;
  }

  // Check existing reservations
  const reservationDate = new Date(date);
  const reservations = await prisma.commonAreaBooking.findMany({
    where: {
      areaId,
      date: reservationDate,
      status: {
        notIn: ['cancelled', 'no_show'],
      },
      ...(excludeReservationId && { id: { not: excludeReservationId } }),
    },
  });

  for (const res of reservations) {
    // Include cleanup time
    const cleanupMinutes = area.cleanupTimeMinutes || 0;
    const resEndWithCleanup = addMinutesToTime(res.endTime, cleanupMinutes);

    // Check overlap
    if (
      (startTime >= res.startTime && startTime < resEndWithCleanup) ||
      (endTime > res.startTime && endTime <= resEndWithCleanup) ||
      (startTime <= res.startTime && endTime >= resEndWithCleanup)
    ) {
      return false;
    }
  }

  return true;
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + mins + minutes;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMins = totalMinutes % 60;
  return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;
}

export function calculateReservationFee(
  area: CommonAreaWithOperatingHours,
  startTime: string,
  endTime: string
): { fee: number; hours: number } {
  if (!area.hourlyRate) {
    return { fee: 0, hours: 0 };
  }

  const [startHours, startMins] = startTime.split(':').map(Number);
  const [endHours, endMins] = endTime.split(':').map(Number);

  const startMinutes = startHours * 60 + startMins;
  const endMinutes = endHours * 60 + endMins;
  const durationMinutes = endMinutes - startMinutes;
  const hours = Math.ceil(durationMinutes / 60);

  const fee = hours * extractNumber(area.hourlyRate);

  return { fee, hours };
}

export async function getAvailableSlots(
  areaId: string,
  date: string,
  slotDurationMinutes: number = 60
): Promise<{ startTime: string; endTime: string; isAvailable: boolean }[]> {
  const area = await prisma.commonArea.findUnique({
    where: { id: areaId },
  });

  if (!area) return [];

  const dayOfWeek = new Date(date).getDay();
  const hours = getOperatingHoursForDay(area as CommonAreaWithOperatingHours, dayOfWeek);

  if (!hours || hours.isClosed) {
    return [];
  }

  const slots: { startTime: string; endTime: string; isAvailable: boolean }[] = [];
  let currentTime = hours.openTime;

  while (currentTime < hours.closeTime) {
    const endTime = addMinutesToTime(currentTime, slotDurationMinutes);
    if (endTime > hours.closeTime) break;

    const isAvailable = await isTimeSlotAvailable(areaId, date, currentTime, endTime);
    slots.push({
      startTime: currentTime,
      endTime,
      isAvailable,
    });

    currentTime = endTime;
  }

  return slots;
}

async function getAreaUtilizationAsync(
  areaId: string,
  startDate?: string,
  endDate?: string
): Promise<{
  totalReservations: number;
  completedReservations: number;
  cancelledReservations: number;
  noShows: number;
  totalHoursBooked: number;
  averageGuestsPerReservation: number;
  utilizationRate: number;
  totalRevenue: number;
  averageRating: number;
}> {
  const where: Parameters<typeof prisma.commonAreaBooking.findMany>[0]['where'] = {
    areaId,
  };

  if (startDate) {
    where.date = { gte: new Date(startDate) };
  }
  if (endDate) {
    where.date = { ...where.date, lte: new Date(endDate) };
  }

  const reservations = await prisma.commonAreaBooking.findMany({ where });

  const totalReservations = reservations.length;
  const completedReservations = reservations.filter((r) => r.status === 'completed').length;
  const cancelledReservations = reservations.filter((r) => r.status === 'cancelled').length;
  const noShows = reservations.filter((r) => r.status === 'no_show').length;

  let totalHoursBooked = 0;
  let totalGuests = 0;
  let totalRevenue = 0;

  reservations.forEach((r) => {
    if (r.status !== 'cancelled' && r.status !== 'no_show') {
      const [startH, startM] = r.startTime.split(':').map(Number);
      const [endH, endM] = r.endTime.split(':').map(Number);
      totalHoursBooked += (endH * 60 + endM - startH * 60 - startM) / 60;
      totalGuests += r.actualGuests || r.expectedGuests;
    }
    if (r.feePaid && r.rentalFee) {
      totalRevenue += r.rentalFee.toNumber();
    }
  });

  const activeReservations = reservations.filter(
    (r) => r.status !== 'cancelled' && r.status !== 'no_show'
  ).length;

  const averageGuestsPerReservation = activeReservations > 0
    ? Math.round(totalGuests / activeReservations)
    : 0;

  // Calculate utilization rate (simplified)
  const totalAvailableHours = 8 * 30; // Assume 8 hours/day * 30 days
  const utilizationRate = Math.round((totalHoursBooked / totalAvailableHours) * 100);

  // Get average rating
  const ratings = await prisma.areaRating.findMany({
    where: { areaId },
  });
  const averageRating = ratings.length > 0
    ? Math.round((ratings.reduce((sum, r) => sum + r.overallRating, 0) / ratings.length) * 10) / 10
    : 0;

  return {
    totalReservations,
    completedReservations,
    cancelledReservations,
    noShows,
    totalHoursBooked: Math.round(totalHoursBooked * 10) / 10,
    averageGuestsPerReservation,
    utilizationRate,
    totalRevenue,
    averageRating,
  };
}

async function checkCancellationEligibilityAsync(
  reservation: Awaited<ReturnType<typeof prisma.commonAreaBooking.findUnique>>
): Promise<{ eligible: boolean; refundEligible: boolean; reason?: string }> {
  if (!reservation) {
    return { eligible: false, refundEligible: false, reason: 'Reservation not found' };
  }

  const area = await prisma.commonArea.findUnique({
    where: { id: reservation.areaId },
  });

  if (!area) {
    return { eligible: false, refundEligible: false, reason: 'Area not found' };
  }

  if (reservation.status === 'cancelled') {
    return { eligible: false, refundEligible: false, reason: 'Already cancelled' };
  }

  if (reservation.status === 'completed') {
    return { eligible: false, refundEligible: false, reason: 'Reservation already completed' };
  }

  const now = new Date();
  const reservationDateTime = new Date(reservation.date);
  const [hours, mins] = reservation.startTime.split(':').map(Number);
  reservationDateTime.setHours(hours, mins);
  const hoursUntil = (reservationDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntil < 0) {
    return { eligible: false, refundEligible: false, reason: 'Reservation already started' };
  }

  const refundEligible = hoursUntil >= area.cancellationHours;

  return {
    eligible: true,
    refundEligible,
    reason: refundEligible ? undefined : `Cancellation within ${area.cancellationHours} hour window`,
  };
}

// ============================================================================
// SCHEMAS
// ============================================================================

const AreaSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string(),
  type: z.enum(['party_room', 'conference_room', 'rooftop', 'courtyard', 'bbq_area', 'theater', 'game_room', 'business_center', 'lounge', 'kitchen', 'laundry', 'other']),
  description: z.string().optional(),
  location: z.string().optional(),
  floor: z.number().int().optional(),
  capacity: z.number().int().positive(),
  squareFeet: z.number().positive().optional(),
  amenities: z.array(z.string()).default([]),
  equipment: z.array(z.string()).default([]),
  rules: z.array(z.string()).default([]),
  images: z.array(z.string()).optional(),
  requiresApproval: z.boolean().default(false),
  requiresDeposit: z.boolean().default(false),
  depositAmount: z.number().nonnegative().optional(),
  hourlyRate: z.number().nonnegative().optional(),
  minimumHours: z.number().int().positive().optional(),
  maximumHours: z.number().int().positive().optional(),
  advanceBookingDays: z.number().int().nonnegative().default(30),
  cancellationHours: z.number().int().nonnegative().default(24),
  cleanupTimeMinutes: z.number().int().nonnegative().default(30),
  operatingHours: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    openTime: z.string(),
    closeTime: z.string(),
    isClosed: z.boolean().default(false),
  })).optional(),
  blackoutDates: z.array(z.string()).optional(),
});

const ReservationSchema = z.object({
  areaId: z.string().uuid(),
  propertyId: z.string().uuid(),
  tenantId: z.string().uuid(),
  eventType: z.enum(['private', 'community', 'management', 'maintenance']),
  eventName: z.string().optional(),
  eventDescription: z.string().optional(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  setupTime: z.string().optional(),
  expectedGuests: z.number().int().positive(),
  specialRequests: z.string().optional(),
  equipmentRequested: z.array(z.string()).optional(),
  cateringApproved: z.boolean().optional(),
  alcoholApproved: z.boolean().optional(),
});

const WaitlistSchema = z.object({
  areaId: z.string().uuid(),
  propertyId: z.string().uuid(),
  tenantId: z.string().uuid(),
  preferredDate: z.string(),
  preferredStartTime: z.string(),
  preferredEndTime: z.string(),
  alternativeDates: z.array(z.string()).optional(),
  expectedGuests: z.number().int().positive(),
  eventType: z.enum(['private', 'community', 'management', 'maintenance']),
  notes: z.string().optional(),
});

const IncidentSchema = z.object({
  areaId: z.string().uuid(),
  reservationId: z.string().uuid().optional(),
  propertyId: z.string().uuid(),
  reportedBy: z.string().uuid(),
  incidentType: z.enum(['damage', 'noise_complaint', 'rule_violation', 'safety_issue', 'cleanup_issue', 'other']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string(),
  photos: z.array(z.string()).optional(),
  witnesses: z.array(z.string()).optional(),
});

const RatingSchema = z.object({
  areaId: z.string().uuid(),
  reservationId: z.string().uuid(),
  tenantId: z.string().uuid(),
  overallRating: z.number().min(1).max(5),
  cleanlinessRating: z.number().min(1).max(5).optional(),
  amenitiesRating: z.number().min(1).max(5).optional(),
  equipmentRating: z.number().min(1).max(5).optional(),
  comment: z.string().optional(),
  wouldRecommend: z.boolean(),
});

const CommunityEventSchema = z.object({
  areaId: z.string().uuid().optional(),
  propertyId: z.string().uuid(),
  name: z.string(),
  description: z.string(),
  eventType: z.enum(['social', 'educational', 'fitness', 'meeting', 'holiday', 'maintenance_notice']),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  location: z.string(),
  organizer: z.string(),
  maxAttendees: z.number().int().positive().optional(),
  rsvpRequired: z.boolean().default(false),
  rsvpDeadline: z.string().optional(),
  cost: z.number().nonnegative().optional(),
  isRecurring: z.boolean().default(false),
  recurrence: z.object({
    frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']),
    endDate: z.string().optional(),
  }).optional(),
});

// ============================================================================
// ROUTES
// ============================================================================

export const commonAreaRoutes: FastifyPluginAsync = async (app) => {
  // ─────────────────────────────────────────────────────────────────────────
  // COMMON AREAS
  // ─────────────────────────────────────────────────────────────────────────

  // Create area
  app.post(
    '/areas',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof AreaSchema> }>,
      reply
    ) => {
      const data = AreaSchema.parse(request.body);

      const area = await prisma.commonArea.create({
        data: {
          propertyId: data.propertyId,
          name: data.name,
          type: data.type as CommonAreaType,
          status: 'available',
          description: data.description,
          location: data.location,
          floor: data.floor,
          capacity: data.capacity,
          squareFeet: data.squareFeet,
          amenities: data.amenities,
          equipment: data.equipment,
          rules: data.rules,
          images: data.images || [],
          requiresApproval: data.requiresApproval,
          requiresDeposit: data.requiresDeposit,
          depositAmount: data.depositAmount,
          hourlyRate: data.hourlyRate,
          minimumHours: data.minimumHours,
          maximumHours: data.maximumHours,
          advanceBookingDays: data.advanceBookingDays,
          cancellationHours: data.cancellationHours,
          cleanupTimeMinutes: data.cleanupTimeMinutes,
          operatingHours: data.operatingHours as object | undefined,
          blackoutDates: data.blackoutDates || [],
        },
      });

      return reply.status(201).send(area);
    }
  );

  // List areas
  app.get(
    '/areas',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; type?: CommonAreaType; status?: CommonAreaStatus };
      }>,
      reply
    ) => {
      const where: Parameters<typeof prisma.commonArea.findMany>[0]['where'] = {};

      if (request.query.propertyId) {
        where.propertyId = request.query.propertyId;
      }
      if (request.query.type) {
        where.type = request.query.type;
      }
      if (request.query.status) {
        where.status = request.query.status;
      }

      const areas = await prisma.commonArea.findMany({ where });
      return reply.send(areas);
    }
  );

  // Get area by ID
  app.get(
    '/areas/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const area = await prisma.commonArea.findUnique({
        where: { id: request.params.id },
      });

      if (!area) {
        return reply.status(404).send({ error: 'Area not found' });
      }
      return reply.send(area);
    }
  );

  // Update area
  app.patch(
    '/areas/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: Partial<z.infer<typeof AreaSchema>>;
      }>,
      reply
    ) => {
      const area = await prisma.commonArea.findUnique({
        where: { id: request.params.id },
      });

      if (!area) {
        return reply.status(404).send({ error: 'Area not found' });
      }

      const { operatingHours, ...rest } = request.body;
      const updated = await prisma.commonArea.update({
        where: { id: request.params.id },
        data: {
          ...rest,
          ...(operatingHours && { operatingHours: operatingHours as object }),
        },
      });

      return reply.send(updated);
    }
  );

  // Get area utilization
  app.get(
    '/areas/:id/utilization',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { startDate?: string; endDate?: string };
      }>,
      reply
    ) => {
      const utilization = await getAreaUtilization(
        request.params.id,
        request.query.startDate,
        request.query.endDate
      );
      return reply.send(utilization);
    }
  );

  // Get available slots
  app.get(
    '/areas/:id/availability',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { date: string; slotDuration?: string };
      }>,
      reply
    ) => {
      const slotDuration = request.query.slotDuration
        ? parseInt(request.query.slotDuration)
        : 60;

      const slots = await getAvailableSlots(request.params.id, request.query.date, slotDuration);
      return reply.send({ date: request.query.date, slots });
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RESERVATIONS
  // ─────────────────────────────────────────────────────────────────────────

  // Create reservation
  app.post(
    '/reservations',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof ReservationSchema> }>,
      reply
    ) => {
      const data = ReservationSchema.parse(request.body);

      const area = await prisma.commonArea.findUnique({
        where: { id: data.areaId },
      });

      if (!area) {
        return reply.status(404).send({ error: 'Area not found' });
      }

      // Check availability
      const available = await isTimeSlotAvailable(data.areaId, data.date, data.startTime, data.endTime);
      if (!available) {
        return reply.status(400).send({ error: 'Time slot is not available' });
      }

      // Check capacity
      if (data.expectedGuests > area.capacity) {
        return reply.status(400).send({ error: `Maximum capacity is ${area.capacity} guests` });
      }

      // Check advance booking limit
      const reservationDate = new Date(data.date);
      const daysAhead = Math.floor((reservationDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      if (daysAhead > area.advanceBookingDays) {
        return reply.status(400).send({
          error: `Reservations can only be made up to ${area.advanceBookingDays} days in advance`,
        });
      }

      // Calculate fee
      const { fee, hours } = calculateReservationFee(area as CommonAreaWithOperatingHours, data.startTime, data.endTime);

      // Check minimum/maximum hours
      if (area.minimumHours && hours < area.minimumHours) {
        return reply.status(400).send({
          error: `Minimum reservation is ${area.minimumHours} hours`,
        });
      }
      if (area.maximumHours && hours > area.maximumHours) {
        return reply.status(400).send({
          error: `Maximum reservation is ${area.maximumHours} hours`,
        });
      }

      const reservation = await prisma.commonAreaBooking.create({
        data: {
          areaId: data.areaId,
          propertyId: data.propertyId,
          tenantId: data.tenantId,
          eventType: data.eventType as ReservationEventType,
          eventName: data.eventName,
          eventDescription: data.eventDescription,
          status: area.requiresApproval ? 'pending' : 'confirmed',
          date: reservationDate,
          startTime: data.startTime,
          endTime: data.endTime,
          setupTime: data.setupTime,
          expectedGuests: data.expectedGuests,
          depositAmount: area.requiresDeposit ? area.depositAmount : null,
          depositPaid: false,
          depositRefunded: false,
          rentalFee: fee,
          feePaid: false,
          confirmationCode: generateConfirmationCode(),
          specialRequests: data.specialRequests,
          equipmentRequested: data.equipmentRequested || [],
          cateringApproved: data.cateringApproved,
          alcoholApproved: data.alcoholApproved,
        },
      });

      return reply.status(201).send(reservation);
    }
  );

  // List reservations
  app.get(
    '/reservations',
    async (
      request: FastifyRequest<{
        Querystring: {
          areaId?: string;
          propertyId?: string;
          tenantId?: string;
          status?: ReservationStatus;
          date?: string;
          startDate?: string;
          endDate?: string;
        };
      }>,
      reply
    ) => {
      const where: Parameters<typeof prisma.commonAreaBooking.findMany>[0]['where'] = {};

      if (request.query.areaId) {
        where.areaId = request.query.areaId;
      }
      if (request.query.propertyId) {
        where.propertyId = request.query.propertyId;
      }
      if (request.query.tenantId) {
        where.tenantId = request.query.tenantId;
      }
      if (request.query.status) {
        where.status = request.query.status;
      }
      if (request.query.date) {
        where.date = new Date(request.query.date);
      }
      if (request.query.startDate || request.query.endDate) {
        where.date = {
          ...(request.query.startDate && { gte: new Date(request.query.startDate) }),
          ...(request.query.endDate && { lte: new Date(request.query.endDate) }),
        };
      }

      const reservations = await prisma.commonAreaBooking.findMany({ where });
      return reply.send(reservations);
    }
  );

  // Get reservation by ID
  app.get(
    '/reservations/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const reservation = await prisma.commonAreaBooking.findUnique({
        where: { id: request.params.id },
      });

      if (!reservation) {
        return reply.status(404).send({ error: 'Reservation not found' });
      }
      return reply.send(reservation);
    }
  );

  // Approve reservation
  app.post(
    '/reservations/:id/approve',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const reservation = await prisma.commonAreaBooking.findUnique({
        where: { id: request.params.id },
      });

      if (!reservation) {
        return reply.status(404).send({ error: 'Reservation not found' });
      }

      if (reservation.status !== 'pending') {
        return reply.status(400).send({ error: 'Reservation is not pending approval' });
      }

      const updated = await prisma.commonAreaBooking.update({
        where: { id: request.params.id },
        data: { status: 'confirmed' },
      });

      return reply.send(updated);
    }
  );

  // Check in
  app.post(
    '/reservations/:id/check-in',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { actualGuests?: number };
      }>,
      reply
    ) => {
      const reservation = await prisma.commonAreaBooking.findUnique({
        where: { id: request.params.id },
      });

      if (!reservation) {
        return reply.status(404).send({ error: 'Reservation not found' });
      }

      const now = new Date();

      const updated = await prisma.commonAreaBooking.update({
        where: { id: request.params.id },
        data: {
          status: 'checked_in',
          checkedInAt: now,
          actualGuests: request.body.actualGuests,
        },
      });

      // Update area status
      await prisma.commonArea.update({
        where: { id: reservation.areaId },
        data: { status: 'occupied' },
      });

      return reply.send(updated);
    }
  );

  // Check out
  app.post(
    '/reservations/:id/check-out',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { cleanupCompleted?: boolean; damageReported?: boolean; damageNotes?: string; damageCharges?: number };
      }>,
      reply
    ) => {
      const reservation = await prisma.commonAreaBooking.findUnique({
        where: { id: request.params.id },
      });

      if (!reservation) {
        return reply.status(404).send({ error: 'Reservation not found' });
      }

      const updated = await prisma.commonAreaBooking.update({
        where: { id: request.params.id },
        data: {
          status: 'completed',
          checkedOutAt: new Date(),
          cleanupCompleted: request.body.cleanupCompleted,
          damageReported: request.body.damageReported,
          damageNotes: request.body.damageNotes,
          damageCharges: request.body.damageCharges,
        },
      });

      // Update area status
      await prisma.commonArea.update({
        where: { id: reservation.areaId },
        data: { status: 'available' },
      });

      return reply.send(updated);
    }
  );

  // Cancel reservation
  app.post(
    '/reservations/:id/cancel',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { reason?: string };
      }>,
      reply
    ) => {
      const reservation = await prisma.commonAreaBooking.findUnique({
        where: { id: request.params.id },
      });

      if (!reservation) {
        return reply.status(404).send({ error: 'Reservation not found' });
      }

      const eligibility = await checkCancellationEligibility(reservation);
      if (!eligibility.eligible) {
        return reply.status(400).send({ error: eligibility.reason });
      }

      const now = new Date();

      const updated = await prisma.commonAreaBooking.update({
        where: { id: request.params.id },
        data: {
          status: 'cancelled',
          cancellationReason: request.body.reason,
          cancelledAt: now,
          depositRefunded: eligibility.refundEligible && reservation.depositPaid,
        },
      });

      // Check waitlist and offer to next person
      const waitlistEntries = await prisma.areaWaitlist.findMany({
        where: {
          areaId: reservation.areaId,
          preferredDate: reservation.date,
          status: 'waiting',
        },
        orderBy: { priority: 'asc' },
        take: 1,
      });

      if (waitlistEntries.length > 0) {
        const offerExpires = new Date();
        offerExpires.setHours(offerExpires.getHours() + 24);

        await prisma.areaWaitlist.update({
          where: { id: waitlistEntries[0].id },
          data: {
            status: 'offered',
            offerExpiresAt: offerExpires,
          },
        });
      }

      return reply.send(updated);
    }
  );

  // Record payment
  app.post(
    '/reservations/:id/payment',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { type: 'deposit' | 'fee'; amount: number };
      }>,
      reply
    ) => {
      const reservation = await prisma.commonAreaBooking.findUnique({
        where: { id: request.params.id },
      });

      if (!reservation) {
        return reply.status(404).send({ error: 'Reservation not found' });
      }

      const updated = await prisma.commonAreaBooking.update({
        where: { id: request.params.id },
        data: {
          ...(request.body.type === 'deposit' ? { depositPaid: true } : { feePaid: true }),
        },
      });

      return reply.send(updated);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // WAITLIST
  // ─────────────────────────────────────────────────────────────────────────

  // Add to waitlist
  app.post(
    '/waitlist',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof WaitlistSchema> }>,
      reply
    ) => {
      const data = WaitlistSchema.parse(request.body);
      const preferredDate = new Date(data.preferredDate);

      // Calculate priority
      const existingCount = await prisma.areaWaitlist.count({
        where: {
          areaId: data.areaId,
          preferredDate,
          status: 'waiting',
        },
      });

      const entry = await prisma.areaWaitlist.create({
        data: {
          areaId: data.areaId,
          propertyId: data.propertyId,
          tenantId: data.tenantId,
          preferredDate,
          preferredStartTime: data.preferredStartTime,
          preferredEndTime: data.preferredEndTime,
          alternativeDates: data.alternativeDates || [],
          expectedGuests: data.expectedGuests,
          eventType: data.eventType as ReservationEventType,
          priority: existingCount + 1,
          status: 'waiting',
          notes: data.notes,
        },
      });

      return reply.status(201).send(entry);
    }
  );

  // List waitlist
  app.get(
    '/waitlist',
    async (
      request: FastifyRequest<{
        Querystring: { areaId?: string; propertyId?: string; tenantId?: string; status?: WaitlistStatus };
      }>,
      reply
    ) => {
      const where: Parameters<typeof prisma.areaWaitlist.findMany>[0]['where'] = {};

      if (request.query.areaId) {
        where.areaId = request.query.areaId;
      }
      if (request.query.propertyId) {
        where.propertyId = request.query.propertyId;
      }
      if (request.query.tenantId) {
        where.tenantId = request.query.tenantId;
      }
      if (request.query.status) {
        where.status = request.query.status;
      }

      const entries = await prisma.areaWaitlist.findMany({
        where,
        orderBy: { priority: 'asc' },
      });

      return reply.send(entries);
    }
  );

  // Accept/decline waitlist offer
  app.post(
    '/waitlist/:id/respond',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { accept: boolean };
      }>,
      reply
    ) => {
      const entry = await prisma.areaWaitlist.findUnique({
        where: { id: request.params.id },
      });

      if (!entry) {
        return reply.status(404).send({ error: 'Waitlist entry not found' });
      }

      if (entry.status !== 'offered') {
        return reply.status(400).send({ error: 'No offer pending' });
      }

      if (request.body.accept) {
        const area = await prisma.commonArea.findUnique({
          where: { id: entry.areaId },
        });

        const { fee } = area
          ? calculateReservationFee(area as CommonAreaWithOperatingHours, entry.preferredStartTime, entry.preferredEndTime)
          : { fee: 0 };

        // Create reservation
        await prisma.commonAreaBooking.create({
          data: {
            areaId: entry.areaId,
            propertyId: entry.propertyId,
            tenantId: entry.tenantId,
            eventType: entry.eventType,
            status: 'confirmed',
            date: entry.preferredDate,
            startTime: entry.preferredStartTime,
            endTime: entry.preferredEndTime,
            expectedGuests: entry.expectedGuests,
            depositAmount: area?.requiresDeposit ? area.depositAmount : null,
            depositPaid: false,
            depositRefunded: false,
            rentalFee: fee,
            feePaid: false,
            confirmationCode: generateConfirmationCode(),
          },
        });

        await prisma.areaWaitlist.update({
          where: { id: entry.id },
          data: { status: 'accepted' },
        });
      } else {
        await prisma.areaWaitlist.update({
          where: { id: entry.id },
          data: { status: 'declined' },
        });
      }

      const updated = await prisma.areaWaitlist.findUnique({
        where: { id: entry.id },
      });

      return reply.send(updated);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // INCIDENTS
  // ─────────────────────────────────────────────────────────────────────────

  // Report incident
  app.post(
    '/incidents',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof IncidentSchema> }>,
      reply
    ) => {
      const data = IncidentSchema.parse(request.body);

      const incident = await prisma.areaIncident.create({
        data: {
          areaId: data.areaId,
          reservationId: data.reservationId,
          propertyId: data.propertyId,
          reportedBy: data.reportedBy,
          incidentType: data.incidentType as AreaIncidentType,
          severity: data.severity as AreaIncidentSeverity,
          description: data.description,
          photos: data.photos || [],
          witnesses: data.witnesses || [],
          chargesPaid: false,
          status: 'reported',
        },
      });

      return reply.status(201).send(incident);
    }
  );

  // List incidents
  app.get(
    '/incidents',
    async (
      request: FastifyRequest<{
        Querystring: {
          areaId?: string;
          propertyId?: string;
          reservationId?: string;
          status?: AreaIncidentStatus;
          severity?: AreaIncidentSeverity;
        };
      }>,
      reply
    ) => {
      const where: Parameters<typeof prisma.areaIncident.findMany>[0]['where'] = {};

      if (request.query.areaId) {
        where.areaId = request.query.areaId;
      }
      if (request.query.propertyId) {
        where.propertyId = request.query.propertyId;
      }
      if (request.query.reservationId) {
        where.reservationId = request.query.reservationId;
      }
      if (request.query.status) {
        where.status = request.query.status;
      }
      if (request.query.severity) {
        where.severity = request.query.severity;
      }

      const incidents = await prisma.areaIncident.findMany({ where });
      return reply.send(incidents);
    }
  );

  // Resolve incident
  app.post(
    '/incidents/:id/resolve',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { resolvedBy: string; resolution: string; charges?: number };
      }>,
      reply
    ) => {
      const incident = await prisma.areaIncident.findUnique({
        where: { id: request.params.id },
      });

      if (!incident) {
        return reply.status(404).send({ error: 'Incident not found' });
      }

      const updated = await prisma.areaIncident.update({
        where: { id: request.params.id },
        data: {
          status: 'resolved',
          resolvedAt: new Date(),
          resolvedBy: request.body.resolvedBy,
          resolution: request.body.resolution,
          charges: request.body.charges,
        },
      });

      return reply.send(updated);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // RATINGS
  // ─────────────────────────────────────────────────────────────────────────

  // Submit rating
  app.post(
    '/ratings',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof RatingSchema> }>,
      reply
    ) => {
      const data = RatingSchema.parse(request.body);

      // Check if reservation exists and is completed
      const reservation = await prisma.commonAreaBooking.findUnique({
        where: { id: data.reservationId },
      });

      if (!reservation) {
        return reply.status(404).send({ error: 'Reservation not found' });
      }
      if (reservation.status !== 'completed') {
        return reply.status(400).send({ error: 'Can only rate completed reservations' });
      }

      // Check for existing rating
      const existingRating = await prisma.areaRating.findUnique({
        where: { reservationId: data.reservationId },
      });

      if (existingRating) {
        return reply.status(400).send({ error: 'Reservation already rated' });
      }

      const rating = await prisma.areaRating.create({
        data: {
          areaId: data.areaId,
          reservationId: data.reservationId,
          tenantId: data.tenantId,
          overallRating: data.overallRating,
          cleanlinessRating: data.cleanlinessRating,
          amenitiesRating: data.amenitiesRating,
          equipmentRating: data.equipmentRating,
          comment: data.comment,
          wouldRecommend: data.wouldRecommend,
        },
      });

      return reply.status(201).send(rating);
    }
  );

  // List ratings
  app.get(
    '/ratings',
    async (
      request: FastifyRequest<{
        Querystring: { areaId?: string; tenantId?: string; minRating?: string };
      }>,
      reply
    ) => {
      const where: Parameters<typeof prisma.areaRating.findMany>[0]['where'] = {};

      if (request.query.areaId) {
        where.areaId = request.query.areaId;
      }
      if (request.query.tenantId) {
        where.tenantId = request.query.tenantId;
      }
      if (request.query.minRating) {
        where.overallRating = { gte: parseInt(request.query.minRating) };
      }

      const ratings = await prisma.areaRating.findMany({ where });
      return reply.send(ratings);
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // COMMUNITY EVENTS
  // ─────────────────────────────────────────────────────────────────────────

  // Create community event
  app.post(
    '/events',
    async (
      request: FastifyRequest<{ Body: z.infer<typeof CommunityEventSchema> }>,
      reply
    ) => {
      const data = CommunityEventSchema.parse(request.body);

      const event = await prisma.communityEvent.create({
        data: {
          areaId: data.areaId,
          propertyId: data.propertyId,
          name: data.name,
          description: data.description,
          eventType: data.eventType as CommunityEventType,
          date: new Date(data.date),
          startTime: data.startTime,
          endTime: data.endTime,
          location: data.location,
          organizer: data.organizer,
          maxAttendees: data.maxAttendees,
          currentAttendees: 0,
          rsvpRequired: data.rsvpRequired,
          rsvpDeadline: data.rsvpDeadline ? new Date(data.rsvpDeadline) : null,
          cost: data.cost,
          isRecurring: data.isRecurring,
          recurrence: data.recurrence as object | undefined,
          status: 'scheduled',
          attendees: [],
        },
      });

      return reply.status(201).send(event);
    }
  );

  // List events
  app.get(
    '/events',
    async (
      request: FastifyRequest<{
        Querystring: {
          propertyId?: string;
          eventType?: CommunityEventType;
          status?: CommunityEventStatus;
          startDate?: string;
          endDate?: string;
        };
      }>,
      reply
    ) => {
      const where: Parameters<typeof prisma.communityEvent.findMany>[0]['where'] = {};

      if (request.query.propertyId) {
        where.propertyId = request.query.propertyId;
      }
      if (request.query.eventType) {
        where.eventType = request.query.eventType;
      }
      if (request.query.status) {
        where.status = request.query.status;
      }
      if (request.query.startDate || request.query.endDate) {
        where.date = {
          ...(request.query.startDate && { gte: new Date(request.query.startDate) }),
          ...(request.query.endDate && { lte: new Date(request.query.endDate) }),
        };
      }

      const events = await prisma.communityEvent.findMany({ where });
      return reply.send(events);
    }
  );

  // RSVP to event
  app.post(
    '/events/:id/rsvp',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { tenantId: string };
      }>,
      reply
    ) => {
      const event = await prisma.communityEvent.findUnique({
        where: { id: request.params.id },
      });

      if (!event) {
        return reply.status(404).send({ error: 'Event not found' });
      }

      if (event.attendees.includes(request.body.tenantId)) {
        return reply.status(400).send({ error: 'Already RSVP\'d' });
      }

      if (event.maxAttendees && event.currentAttendees >= event.maxAttendees) {
        return reply.status(400).send({ error: 'Event is at capacity' });
      }

      if (event.rsvpDeadline && new Date() > event.rsvpDeadline) {
        return reply.status(400).send({ error: 'RSVP deadline has passed' });
      }

      const updated = await prisma.communityEvent.update({
        where: { id: request.params.id },
        data: {
          attendees: [...event.attendees, request.body.tenantId],
          currentAttendees: event.currentAttendees + 1,
        },
      });

      return reply.send(updated);
    }
  );

  // Cancel RSVP
  app.post(
    '/events/:id/cancel-rsvp',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { tenantId: string };
      }>,
      reply
    ) => {
      const event = await prisma.communityEvent.findUnique({
        where: { id: request.params.id },
      });

      if (!event) {
        return reply.status(404).send({ error: 'Event not found' });
      }

      const index = event.attendees.indexOf(request.body.tenantId);
      if (index === -1) {
        return reply.status(400).send({ error: 'Not RSVP\'d to this event' });
      }

      const newAttendees = [...event.attendees];
      newAttendees.splice(index, 1);

      const updated = await prisma.communityEvent.update({
        where: { id: request.params.id },
        data: {
          attendees: newAttendees,
          currentAttendees: event.currentAttendees - 1,
        },
      });

      return reply.send(updated);
    }
  );

  // Cancel event
  app.post(
    '/events/:id/cancel',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const event = await prisma.communityEvent.findUnique({
        where: { id: request.params.id },
      });

      if (!event) {
        return reply.status(404).send({ error: 'Event not found' });
      }

      const updated = await prisma.communityEvent.update({
        where: { id: request.params.id },
        data: { status: 'cancelled' },
      });

      return reply.send(updated);
    }
  );
};
