import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

// ============================================================================
// TYPES
// ============================================================================

type AreaType = 'party_room' | 'conference_room' | 'rooftop' | 'courtyard' | 'bbq_area' | 'theater' | 'game_room' | 'business_center' | 'lounge' | 'kitchen' | 'laundry' | 'other';
type AreaStatus = 'available' | 'reserved' | 'occupied' | 'maintenance' | 'closed';
type ReservationStatus = 'pending' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
type EventType = 'private' | 'community' | 'management' | 'maintenance';

export interface CommonArea {
  id: string;
  propertyId: string;
  name: string;
  type: AreaType;
  status: AreaStatus;
  description?: string;
  location: string;
  floor?: number;
  capacity: number;
  squareFeet?: number;
  amenities: string[];
  equipment: string[];
  rules: string[];
  images?: string[];
  requiresApproval: boolean;
  requiresDeposit: boolean;
  depositAmount?: number;
  hourlyRate?: number;
  minimumHours?: number;
  maximumHours?: number;
  advanceBookingDays: number;
  cancellationHours: number;
  cleanupTimeMinutes: number;
  operatingHours: {
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    isClosed: boolean;
  }[];
  blackoutDates?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface AreaReservation {
  id: string;
  areaId: string;
  propertyId: string;
  tenantId: string;
  eventType: EventType;
  eventName?: string;
  eventDescription?: string;
  status: ReservationStatus;
  date: string;
  startTime: string;
  endTime: string;
  setupTime?: string;
  expectedGuests: number;
  actualGuests?: number;
  depositAmount?: number;
  depositPaid: boolean;
  depositRefunded: boolean;
  rentalFee?: number;
  feePaid: boolean;
  confirmationCode: string;
  specialRequests?: string;
  equipmentRequested?: string[];
  cateringApproved?: boolean;
  alcoholApproved?: boolean;
  checkedInAt?: string;
  checkedOutAt?: string;
  cleanupCompleted?: boolean;
  damageReported?: boolean;
  damageNotes?: string;
  damageCharges?: number;
  cancellationReason?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AreaAvailability {
  id: string;
  areaId: string;
  date: string;
  slots: {
    startTime: string;
    endTime: string;
    isAvailable: boolean;
    reservationId?: string;
  }[];
  isBlackout: boolean;
  specialHours?: {
    openTime: string;
    closeTime: string;
  };
  createdAt: string;
}

export interface AreaWaitlist {
  id: string;
  areaId: string;
  propertyId: string;
  tenantId: string;
  preferredDate: string;
  preferredStartTime: string;
  preferredEndTime: string;
  alternativeDates?: string[];
  expectedGuests: number;
  eventType: EventType;
  priority: number;
  status: 'waiting' | 'offered' | 'accepted' | 'declined' | 'expired';
  offerExpiresAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AreaIncident {
  id: string;
  areaId: string;
  reservationId?: string;
  propertyId: string;
  reportedBy: string;
  incidentType: 'damage' | 'noise_complaint' | 'rule_violation' | 'safety_issue' | 'cleanup_issue' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  photos?: string[];
  witnesses?: string[];
  actionTaken?: string;
  charges?: number;
  chargesPaid: boolean;
  status: 'reported' | 'investigating' | 'resolved' | 'closed';
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AreaRating {
  id: string;
  areaId: string;
  reservationId: string;
  tenantId: string;
  overallRating: number;
  cleanlinessRating?: number;
  amenitiesRating?: number;
  equipmentRating?: number;
  comment?: string;
  wouldRecommend: boolean;
  createdAt: string;
}

export interface CommunityEvent {
  id: string;
  areaId?: string;
  propertyId: string;
  name: string;
  description: string;
  eventType: 'social' | 'educational' | 'fitness' | 'meeting' | 'holiday' | 'maintenance_notice';
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  organizer: string;
  maxAttendees?: number;
  currentAttendees: number;
  rsvpRequired: boolean;
  rsvpDeadline?: string;
  cost?: number;
  isRecurring: boolean;
  recurrence?: {
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
    endDate?: string;
  };
  status: 'scheduled' | 'cancelled' | 'completed';
  attendees: string[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// IN-MEMORY STORES
// ============================================================================

export const commonAreas = new Map<string, CommonArea>();
export const areaReservations = new Map<string, AreaReservation>();
export const areaAvailabilities = new Map<string, AreaAvailability>();
export const areaWaitlists = new Map<string, AreaWaitlist>();
export const areaIncidents = new Map<string, AreaIncident>();
export const areaRatings = new Map<string, AreaRating>();
export const communityEvents = new Map<string, CommunityEvent>();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function generateConfirmationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function getOperatingHoursForDay(area: CommonArea, dayOfWeek: number): { openTime: string; closeTime: string; isClosed: boolean } | null {
  const hours = area.operatingHours.find((h) => h.dayOfWeek === dayOfWeek);
  return hours || null;
}

export function isTimeSlotAvailable(
  areaId: string,
  date: string,
  startTime: string,
  endTime: string,
  excludeReservationId?: string
): boolean {
  const area = commonAreas.get(areaId);
  if (!area) return false;

  // Check if date is blackout
  if (area.blackoutDates?.includes(date)) {
    return false;
  }

  // Check operating hours
  const dayOfWeek = new Date(date).getDay();
  const hours = getOperatingHoursForDay(area, dayOfWeek);
  if (!hours || hours.isClosed) {
    return false;
  }

  if (startTime < hours.openTime || endTime > hours.closeTime) {
    return false;
  }

  // Check existing reservations
  const reservations = Array.from(areaReservations.values()).filter(
    (r) =>
      r.areaId === areaId &&
      r.date === date &&
      r.status !== 'cancelled' &&
      r.status !== 'no_show' &&
      r.id !== excludeReservationId
  );

  for (const res of reservations) {
    // Include cleanup time
    const area = commonAreas.get(areaId);
    const cleanupMinutes = area?.cleanupTimeMinutes || 0;
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
  area: CommonArea,
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

  const fee = hours * area.hourlyRate;

  return { fee, hours };
}

export function getAvailableSlots(
  areaId: string,
  date: string,
  slotDurationMinutes: number = 60
): { startTime: string; endTime: string; isAvailable: boolean }[] {
  const area = commonAreas.get(areaId);
  if (!area) return [];

  const dayOfWeek = new Date(date).getDay();
  const hours = getOperatingHoursForDay(area, dayOfWeek);

  if (!hours || hours.isClosed) {
    return [];
  }

  const slots: { startTime: string; endTime: string; isAvailable: boolean }[] = [];
  let currentTime = hours.openTime;

  while (currentTime < hours.closeTime) {
    const endTime = addMinutesToTime(currentTime, slotDurationMinutes);
    if (endTime > hours.closeTime) break;

    const isAvailable = isTimeSlotAvailable(areaId, date, currentTime, endTime);
    slots.push({
      startTime: currentTime,
      endTime,
      isAvailable,
    });

    currentTime = endTime;
  }

  return slots;
}

export function getAreaUtilization(
  areaId: string,
  startDate?: string,
  endDate?: string
): {
  totalReservations: number;
  completedReservations: number;
  cancelledReservations: number;
  noShows: number;
  totalHoursBooked: number;
  averageGuestsPerReservation: number;
  utilizationRate: number;
  totalRevenue: number;
  averageRating: number;
} {
  let reservations = Array.from(areaReservations.values()).filter(
    (r) => r.areaId === areaId
  );

  if (startDate) {
    reservations = reservations.filter((r) => r.date >= startDate);
  }
  if (endDate) {
    reservations = reservations.filter((r) => r.date <= endDate);
  }

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
      totalRevenue += r.rentalFee;
    }
  });

  const activeReservations = reservations.filter(
    (r) => r.status !== 'cancelled' && r.status !== 'no_show'
  ).length;

  const averageGuestsPerReservation = activeReservations > 0
    ? Math.round(totalGuests / activeReservations)
    : 0;

  // Calculate utilization rate (simplified)
  const area = commonAreas.get(areaId);
  const totalAvailableHours = 8 * 30; // Assume 8 hours/day * 30 days
  const utilizationRate = Math.round((totalHoursBooked / totalAvailableHours) * 100);

  // Get average rating
  const ratings = Array.from(areaRatings.values()).filter((r) => r.areaId === areaId);
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

export function checkCancellationEligibility(
  reservation: AreaReservation
): { eligible: boolean; refundEligible: boolean; reason?: string } {
  const area = commonAreas.get(reservation.areaId);
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
  const reservationDateTime = new Date(`${reservation.date}T${reservation.startTime}`);
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
  propertyId: z.string(),
  name: z.string(),
  type: z.enum(['party_room', 'conference_room', 'rooftop', 'courtyard', 'bbq_area', 'theater', 'game_room', 'business_center', 'lounge', 'kitchen', 'laundry', 'other']),
  description: z.string().optional(),
  location: z.string(),
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
  })),
  blackoutDates: z.array(z.string()).optional(),
});

const ReservationSchema = z.object({
  areaId: z.string(),
  propertyId: z.string(),
  tenantId: z.string(),
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
  areaId: z.string(),
  propertyId: z.string(),
  tenantId: z.string(),
  preferredDate: z.string(),
  preferredStartTime: z.string(),
  preferredEndTime: z.string(),
  alternativeDates: z.array(z.string()).optional(),
  expectedGuests: z.number().int().positive(),
  eventType: z.enum(['private', 'community', 'management', 'maintenance']),
  notes: z.string().optional(),
});

const IncidentSchema = z.object({
  areaId: z.string(),
  reservationId: z.string().optional(),
  propertyId: z.string(),
  reportedBy: z.string(),
  incidentType: z.enum(['damage', 'noise_complaint', 'rule_violation', 'safety_issue', 'cleanup_issue', 'other']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string(),
  photos: z.array(z.string()).optional(),
  witnesses: z.array(z.string()).optional(),
});

const RatingSchema = z.object({
  areaId: z.string(),
  reservationId: z.string(),
  tenantId: z.string(),
  overallRating: z.number().min(1).max(5),
  cleanlinessRating: z.number().min(1).max(5).optional(),
  amenitiesRating: z.number().min(1).max(5).optional(),
  equipmentRating: z.number().min(1).max(5).optional(),
  comment: z.string().optional(),
  wouldRecommend: z.boolean(),
});

const CommunityEventSchema = z.object({
  areaId: z.string().optional(),
  propertyId: z.string(),
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
      const now = new Date().toISOString();

      const area: CommonArea = {
        id: `car_${Date.now()}`,
        ...data,
        status: 'available',
        createdAt: now,
        updatedAt: now,
      };

      commonAreas.set(area.id, area);
      return reply.status(201).send(area);
    }
  );

  // List areas
  app.get(
    '/areas',
    async (
      request: FastifyRequest<{
        Querystring: { propertyId?: string; type?: AreaType; status?: AreaStatus };
      }>,
      reply
    ) => {
      let areas = Array.from(commonAreas.values());

      if (request.query.propertyId) {
        areas = areas.filter((a) => a.propertyId === request.query.propertyId);
      }
      if (request.query.type) {
        areas = areas.filter((a) => a.type === request.query.type);
      }
      if (request.query.status) {
        areas = areas.filter((a) => a.status === request.query.status);
      }

      return reply.send(areas);
    }
  );

  // Get area by ID
  app.get(
    '/areas/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const area = commonAreas.get(request.params.id);
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
        Body: Partial<CommonArea>;
      }>,
      reply
    ) => {
      const area = commonAreas.get(request.params.id);
      if (!area) {
        return reply.status(404).send({ error: 'Area not found' });
      }

      const updated: CommonArea = {
        ...area,
        ...request.body,
        updatedAt: new Date().toISOString(),
      };

      commonAreas.set(area.id, updated);
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
      const utilization = getAreaUtilization(
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

      const slots = getAvailableSlots(request.params.id, request.query.date, slotDuration);
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
      const now = new Date().toISOString();

      const area = commonAreas.get(data.areaId);
      if (!area) {
        return reply.status(404).send({ error: 'Area not found' });
      }

      // Check availability
      if (!isTimeSlotAvailable(data.areaId, data.date, data.startTime, data.endTime)) {
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
      const { fee, hours } = calculateReservationFee(area, data.startTime, data.endTime);

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

      const reservation: AreaReservation = {
        id: `res_${Date.now()}`,
        ...data,
        status: area.requiresApproval ? 'pending' : 'confirmed',
        depositAmount: area.requiresDeposit ? area.depositAmount : undefined,
        depositPaid: false,
        depositRefunded: false,
        rentalFee: fee,
        feePaid: false,
        confirmationCode: generateConfirmationCode(),
        createdAt: now,
        updatedAt: now,
      };

      areaReservations.set(reservation.id, reservation);
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
      let reservations = Array.from(areaReservations.values());

      if (request.query.areaId) {
        reservations = reservations.filter((r) => r.areaId === request.query.areaId);
      }
      if (request.query.propertyId) {
        reservations = reservations.filter((r) => r.propertyId === request.query.propertyId);
      }
      if (request.query.tenantId) {
        reservations = reservations.filter((r) => r.tenantId === request.query.tenantId);
      }
      if (request.query.status) {
        reservations = reservations.filter((r) => r.status === request.query.status);
      }
      if (request.query.date) {
        reservations = reservations.filter((r) => r.date === request.query.date);
      }
      if (request.query.startDate) {
        reservations = reservations.filter((r) => r.date >= request.query.startDate!);
      }
      if (request.query.endDate) {
        reservations = reservations.filter((r) => r.date <= request.query.endDate!);
      }

      return reply.send(reservations);
    }
  );

  // Get reservation by ID
  app.get(
    '/reservations/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const reservation = areaReservations.get(request.params.id);
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
      const reservation = areaReservations.get(request.params.id);
      if (!reservation) {
        return reply.status(404).send({ error: 'Reservation not found' });
      }

      if (reservation.status !== 'pending') {
        return reply.status(400).send({ error: 'Reservation is not pending approval' });
      }

      reservation.status = 'confirmed';
      reservation.updatedAt = new Date().toISOString();

      areaReservations.set(reservation.id, reservation);
      return reply.send(reservation);
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
      const reservation = areaReservations.get(request.params.id);
      if (!reservation) {
        return reply.status(404).send({ error: 'Reservation not found' });
      }

      const now = new Date().toISOString();

      reservation.status = 'checked_in';
      reservation.checkedInAt = now;
      if (request.body.actualGuests) {
        reservation.actualGuests = request.body.actualGuests;
      }
      reservation.updatedAt = now;

      // Update area status
      const area = commonAreas.get(reservation.areaId);
      if (area) {
        area.status = 'occupied';
        area.updatedAt = now;
        commonAreas.set(area.id, area);
      }

      areaReservations.set(reservation.id, reservation);
      return reply.send(reservation);
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
      const reservation = areaReservations.get(request.params.id);
      if (!reservation) {
        return reply.status(404).send({ error: 'Reservation not found' });
      }

      const now = new Date().toISOString();

      reservation.status = 'completed';
      reservation.checkedOutAt = now;
      reservation.cleanupCompleted = request.body.cleanupCompleted;
      reservation.damageReported = request.body.damageReported;
      reservation.damageNotes = request.body.damageNotes;
      reservation.damageCharges = request.body.damageCharges;
      reservation.updatedAt = now;

      // Update area status
      const area = commonAreas.get(reservation.areaId);
      if (area) {
        area.status = 'available';
        area.updatedAt = now;
        commonAreas.set(area.id, area);
      }

      areaReservations.set(reservation.id, reservation);
      return reply.send(reservation);
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
      const reservation = areaReservations.get(request.params.id);
      if (!reservation) {
        return reply.status(404).send({ error: 'Reservation not found' });
      }

      const eligibility = checkCancellationEligibility(reservation);
      if (!eligibility.eligible) {
        return reply.status(400).send({ error: eligibility.reason });
      }

      const now = new Date().toISOString();

      reservation.status = 'cancelled';
      reservation.cancellationReason = request.body.reason;
      reservation.cancelledAt = now;
      if (eligibility.refundEligible && reservation.depositPaid) {
        reservation.depositRefunded = true;
      }
      reservation.updatedAt = now;

      areaReservations.set(reservation.id, reservation);

      // Check waitlist
      const waitlistEntries = Array.from(areaWaitlists.values())
        .filter(
          (w) =>
            w.areaId === reservation.areaId &&
            w.preferredDate === reservation.date &&
            w.status === 'waiting'
        )
        .sort((a, b) => a.priority - b.priority);

      if (waitlistEntries.length > 0) {
        const nextInLine = waitlistEntries[0];
        const offerExpires = new Date();
        offerExpires.setHours(offerExpires.getHours() + 24);

        nextInLine.status = 'offered';
        nextInLine.offerExpiresAt = offerExpires.toISOString();
        nextInLine.updatedAt = now;
        areaWaitlists.set(nextInLine.id, nextInLine);
      }

      return reply.send(reservation);
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
      const reservation = areaReservations.get(request.params.id);
      if (!reservation) {
        return reply.status(404).send({ error: 'Reservation not found' });
      }

      const now = new Date().toISOString();

      if (request.body.type === 'deposit') {
        reservation.depositPaid = true;
      } else if (request.body.type === 'fee') {
        reservation.feePaid = true;
      }
      reservation.updatedAt = now;

      areaReservations.set(reservation.id, reservation);
      return reply.send(reservation);
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
      const now = new Date().toISOString();

      // Calculate priority
      const existingEntries = Array.from(areaWaitlists.values()).filter(
        (w) =>
          w.areaId === data.areaId &&
          w.preferredDate === data.preferredDate &&
          w.status === 'waiting'
      );
      const priority = existingEntries.length + 1;

      const entry: AreaWaitlist = {
        id: `awl_${Date.now()}`,
        ...data,
        priority,
        status: 'waiting',
        createdAt: now,
        updatedAt: now,
      };

      areaWaitlists.set(entry.id, entry);
      return reply.status(201).send(entry);
    }
  );

  // List waitlist
  app.get(
    '/waitlist',
    async (
      request: FastifyRequest<{
        Querystring: { areaId?: string; propertyId?: string; tenantId?: string; status?: string };
      }>,
      reply
    ) => {
      let entries = Array.from(areaWaitlists.values());

      if (request.query.areaId) {
        entries = entries.filter((e) => e.areaId === request.query.areaId);
      }
      if (request.query.propertyId) {
        entries = entries.filter((e) => e.propertyId === request.query.propertyId);
      }
      if (request.query.tenantId) {
        entries = entries.filter((e) => e.tenantId === request.query.tenantId);
      }
      if (request.query.status) {
        entries = entries.filter((e) => e.status === request.query.status);
      }

      return reply.send(entries.sort((a, b) => a.priority - b.priority));
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
      const entry = areaWaitlists.get(request.params.id);
      if (!entry) {
        return reply.status(404).send({ error: 'Waitlist entry not found' });
      }

      if (entry.status !== 'offered') {
        return reply.status(400).send({ error: 'No offer pending' });
      }

      const now = new Date().toISOString();

      if (request.body.accept) {
        entry.status = 'accepted';

        // Create reservation
        const area = commonAreas.get(entry.areaId);
        const { fee } = area
          ? calculateReservationFee(area, entry.preferredStartTime, entry.preferredEndTime)
          : { fee: 0 };

        const reservation: AreaReservation = {
          id: `res_${Date.now()}`,
          areaId: entry.areaId,
          propertyId: entry.propertyId,
          tenantId: entry.tenantId,
          eventType: entry.eventType,
          status: 'confirmed',
          date: entry.preferredDate,
          startTime: entry.preferredStartTime,
          endTime: entry.preferredEndTime,
          expectedGuests: entry.expectedGuests,
          depositAmount: area?.requiresDeposit ? area.depositAmount : undefined,
          depositPaid: false,
          depositRefunded: false,
          rentalFee: fee,
          feePaid: false,
          confirmationCode: generateConfirmationCode(),
          createdAt: now,
          updatedAt: now,
        };

        areaReservations.set(reservation.id, reservation);
      } else {
        entry.status = 'declined';
      }

      entry.updatedAt = now;
      areaWaitlists.set(entry.id, entry);

      return reply.send(entry);
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
      const now = new Date().toISOString();

      const incident: AreaIncident = {
        id: `inc_${Date.now()}`,
        ...data,
        chargesPaid: false,
        status: 'reported',
        createdAt: now,
        updatedAt: now,
      };

      areaIncidents.set(incident.id, incident);
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
          status?: string;
          severity?: string;
        };
      }>,
      reply
    ) => {
      let incidents = Array.from(areaIncidents.values());

      if (request.query.areaId) {
        incidents = incidents.filter((i) => i.areaId === request.query.areaId);
      }
      if (request.query.propertyId) {
        incidents = incidents.filter((i) => i.propertyId === request.query.propertyId);
      }
      if (request.query.reservationId) {
        incidents = incidents.filter((i) => i.reservationId === request.query.reservationId);
      }
      if (request.query.status) {
        incidents = incidents.filter((i) => i.status === request.query.status);
      }
      if (request.query.severity) {
        incidents = incidents.filter((i) => i.severity === request.query.severity);
      }

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
      const incident = areaIncidents.get(request.params.id);
      if (!incident) {
        return reply.status(404).send({ error: 'Incident not found' });
      }

      const now = new Date().toISOString();

      incident.status = 'resolved';
      incident.resolvedAt = now;
      incident.resolvedBy = request.body.resolvedBy;
      incident.resolution = request.body.resolution;
      if (request.body.charges) {
        incident.charges = request.body.charges;
      }
      incident.updatedAt = now;

      areaIncidents.set(incident.id, incident);
      return reply.send(incident);
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
      const now = new Date().toISOString();

      // Check if reservation exists and is completed
      const reservation = areaReservations.get(data.reservationId);
      if (!reservation) {
        return reply.status(404).send({ error: 'Reservation not found' });
      }
      if (reservation.status !== 'completed') {
        return reply.status(400).send({ error: 'Can only rate completed reservations' });
      }

      // Check for existing rating
      const existingRating = Array.from(areaRatings.values()).find(
        (r) => r.reservationId === data.reservationId
      );
      if (existingRating) {
        return reply.status(400).send({ error: 'Reservation already rated' });
      }

      const rating: AreaRating = {
        id: `rat_${Date.now()}`,
        ...data,
        createdAt: now,
      };

      areaRatings.set(rating.id, rating);
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
      let ratings = Array.from(areaRatings.values());

      if (request.query.areaId) {
        ratings = ratings.filter((r) => r.areaId === request.query.areaId);
      }
      if (request.query.tenantId) {
        ratings = ratings.filter((r) => r.tenantId === request.query.tenantId);
      }
      if (request.query.minRating) {
        const min = parseFloat(request.query.minRating);
        ratings = ratings.filter((r) => r.overallRating >= min);
      }

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
      const now = new Date().toISOString();

      const event: CommunityEvent = {
        id: `evt_${Date.now()}`,
        ...data,
        currentAttendees: 0,
        status: 'scheduled',
        attendees: [],
        createdAt: now,
        updatedAt: now,
      };

      communityEvents.set(event.id, event);
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
          eventType?: string;
          status?: string;
          startDate?: string;
          endDate?: string;
        };
      }>,
      reply
    ) => {
      let events = Array.from(communityEvents.values());

      if (request.query.propertyId) {
        events = events.filter((e) => e.propertyId === request.query.propertyId);
      }
      if (request.query.eventType) {
        events = events.filter((e) => e.eventType === request.query.eventType);
      }
      if (request.query.status) {
        events = events.filter((e) => e.status === request.query.status);
      }
      if (request.query.startDate) {
        events = events.filter((e) => e.date >= request.query.startDate!);
      }
      if (request.query.endDate) {
        events = events.filter((e) => e.date <= request.query.endDate!);
      }

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
      const event = communityEvents.get(request.params.id);
      if (!event) {
        return reply.status(404).send({ error: 'Event not found' });
      }

      if (event.attendees.includes(request.body.tenantId)) {
        return reply.status(400).send({ error: 'Already RSVP\'d' });
      }

      if (event.maxAttendees && event.currentAttendees >= event.maxAttendees) {
        return reply.status(400).send({ error: 'Event is at capacity' });
      }

      if (event.rsvpDeadline && new Date() > new Date(event.rsvpDeadline)) {
        return reply.status(400).send({ error: 'RSVP deadline has passed' });
      }

      event.attendees.push(request.body.tenantId);
      event.currentAttendees++;
      event.updatedAt = new Date().toISOString();

      communityEvents.set(event.id, event);
      return reply.send(event);
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
      const event = communityEvents.get(request.params.id);
      if (!event) {
        return reply.status(404).send({ error: 'Event not found' });
      }

      const index = event.attendees.indexOf(request.body.tenantId);
      if (index === -1) {
        return reply.status(400).send({ error: 'Not RSVP\'d to this event' });
      }

      event.attendees.splice(index, 1);
      event.currentAttendees--;
      event.updatedAt = new Date().toISOString();

      communityEvents.set(event.id, event);
      return reply.send(event);
    }
  );

  // Cancel event
  app.post(
    '/events/:id/cancel',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      const event = communityEvents.get(request.params.id);
      if (!event) {
        return reply.status(404).send({ error: 'Event not found' });
      }

      event.status = 'cancelled';
      event.updatedAt = new Date().toISOString();

      communityEvents.set(event.id, event);
      return reply.send(event);
    }
  );
};
