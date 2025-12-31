import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export type ShowingStatus = 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export type ShowingType = 'in_person' | 'virtual' | 'self_guided';
export type AvailabilityStatus = 'available' | 'blocked' | 'tentative';
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface Showing {
  id: string;
  listingId: string;
  propertyId: string;
  unitId: string | null;
  prospectId: string;
  agentId: string | null;
  type: ShowingType;
  status: ShowingStatus;
  scheduledDate: Date;
  startTime: string; // HH:MM format
  endTime: string;
  duration: number; // minutes
  timezone: string;
  notes: string | null;
  prospectNotes: string | null;
  accessInstructions: string | null;
  lockboxCode: string | null;
  virtualMeetingUrl: string | null;
  confirmationSentAt: Date | null;
  reminderSentAt: Date | null;
  feedback: ShowingFeedback | null;
  cancelledReason: string | null;
  cancelledBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShowingFeedback {
  rating: number; // 1-5
  interested: boolean;
  priceOpinion: 'too_high' | 'fair' | 'good_value' | null;
  conditionOpinion: 'excellent' | 'good' | 'fair' | 'poor' | null;
  locationOpinion: 'excellent' | 'good' | 'fair' | 'poor' | null;
  comments: string | null;
  followUpRequested: boolean;
  submittedAt: Date;
}

export interface Prospect {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  preferredContactMethod: 'email' | 'phone' | 'text';
  source: string | null;
  prequalified: boolean;
  budget: number | null;
  desiredMoveIn: Date | null;
  desiredBedrooms: number | null;
  desiredBathrooms: number | null;
  pets: boolean;
  notes: string | null;
  listingIds: string[]; // Listings they're interested in
  showingCount: number;
  lastContactAt: Date | null;
  status: 'new' | 'active' | 'qualified' | 'applied' | 'leased' | 'lost';
  lostReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ShowingAgent {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  availability: AgentAvailability[];
  maxShowingsPerDay: number;
  preferredPropertyIds: string[];
  autoAssign: boolean;
  calendarSyncEnabled: boolean;
  calendarProvider: 'google' | 'outlook' | 'apple' | null;
  calendarId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentAvailability {
  dayOfWeek: DayOfWeek;
  startTime: string; // HH:MM
  endTime: string;
  isAvailable: boolean;
}

export interface ListingAvailability {
  id: string;
  listingId: string;
  propertyId: string;
  defaultDuration: number; // minutes
  bufferTime: number; // minutes between showings
  minNoticeHours: number;
  maxAdvanceDays: number;
  allowSelfSchedule: boolean;
  allowSelfGuided: boolean;
  requireApproval: boolean;
  weeklySchedule: WeeklySlot[];
  blockedDates: BlockedDate[];
  createdAt: Date;
  updatedAt: Date;
}

export interface WeeklySlot {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  status: AvailabilityStatus;
}

export interface BlockedDate {
  date: Date;
  reason: string | null;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
}

export interface TimeSlot {
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  available: boolean;
  agentId: string | null;
  reason: string | null;
}

export interface CalendarEvent {
  id: string;
  showingId: string;
  calendarProvider: string;
  externalEventId: string;
  agentId: string;
  syncedAt: Date;
  lastUpdatedAt: Date;
}

// ============================================================================
// In-memory stores (placeholder for Prisma)
// ============================================================================

export const showings = new Map<string, Showing>();
export const prospects = new Map<string, Prospect>();
export const agents = new Map<string, ShowingAgent>();
export const listingAvailability = new Map<string, ListingAvailability>();
export const calendarEvents = new Map<string, CalendarEvent>();

// Initialize default availability
const defaultWeeklySchedule: WeeklySlot[] = [
  { dayOfWeek: 'monday', startTime: '09:00', endTime: '18:00', status: 'available' },
  { dayOfWeek: 'tuesday', startTime: '09:00', endTime: '18:00', status: 'available' },
  { dayOfWeek: 'wednesday', startTime: '09:00', endTime: '18:00', status: 'available' },
  { dayOfWeek: 'thursday', startTime: '09:00', endTime: '18:00', status: 'available' },
  { dayOfWeek: 'friday', startTime: '09:00', endTime: '18:00', status: 'available' },
  { dayOfWeek: 'saturday', startTime: '10:00', endTime: '16:00', status: 'available' },
  { dayOfWeek: 'sunday', startTime: '12:00', endTime: '16:00', status: 'tentative' },
];

// ============================================================================
// Helper Functions
// ============================================================================

export function generateTimeSlots(
  availability: ListingAvailability,
  date: Date,
  existingShowings: Showing[]
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const dayOfWeek = getDayOfWeek(date);
  const dateStr = formatDate(date);

  // Check if date is blocked
  const blockedDate = availability.blockedDates.find(
    (bd) => formatDate(bd.date) === dateStr
  );
  if (blockedDate?.allDay) {
    return [];
  }

  // Get weekly schedule for this day
  const daySchedule = availability.weeklySchedule.find((ws) => ws.dayOfWeek === dayOfWeek);
  if (!daySchedule || daySchedule.status === 'blocked') {
    return [];
  }

  // Check minimum notice
  const now = new Date();
  const minNoticeTime = new Date(now.getTime() + availability.minNoticeHours * 60 * 60 * 1000);

  // Generate slots
  const duration = availability.defaultDuration;
  const buffer = availability.bufferTime;
  const startMinutes = timeToMinutes(daySchedule.startTime);
  const endMinutes = timeToMinutes(daySchedule.endTime);

  for (let minutes = startMinutes; minutes + duration <= endMinutes; minutes += duration + buffer) {
    const startTime = minutesToTime(minutes);
    const endTime = minutesToTime(minutes + duration);

    // Check if blocked by partial block
    if (blockedDate && !blockedDate.allDay) {
      const blockStart = timeToMinutes(blockedDate.startTime!);
      const blockEnd = timeToMinutes(blockedDate.endTime!);
      if (minutes >= blockStart && minutes < blockEnd) {
        continue;
      }
    }

    // Check if slot is in the past or within min notice
    const slotDateTime = new Date(`${dateStr}T${startTime}`);
    if (slotDateTime < minNoticeTime) {
      continue;
    }

    // Check for conflicts with existing showings
    const conflict = existingShowings.find((s) => {
      if (s.status === 'cancelled' || s.status === 'no_show') return false;
      const showingDate = formatDate(s.scheduledDate);
      if (showingDate !== dateStr) return false;

      const showingStart = timeToMinutes(s.startTime);
      const showingEnd = timeToMinutes(s.endTime);
      return minutes < showingEnd && minutes + duration > showingStart;
    });

    slots.push({
      date: dateStr,
      startTime,
      endTime,
      available: !conflict,
      agentId: null,
      reason: conflict ? 'Slot already booked' : null,
    });
  }

  return slots;
}

export function getDayOfWeek(date: Date): DayOfWeek {
  const days: DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[date.getDay()];
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function findAvailableAgent(
  date: Date,
  startTime: string,
  endTime: string,
  propertyId: string
): ShowingAgent | null {
  const dayOfWeek = getDayOfWeek(date);
  const dateStr = formatDate(date);
  const requestedStart = timeToMinutes(startTime);
  const requestedEnd = timeToMinutes(endTime);

  // Get all active agents
  const activeAgents = Array.from(agents.values()).filter((a) => a.isActive && a.autoAssign);

  for (const agent of activeAgents) {
    // Check agent availability for this day
    const dayAvail = agent.availability.find((a) => a.dayOfWeek === dayOfWeek);
    if (!dayAvail?.isAvailable) continue;

    const agentStart = timeToMinutes(dayAvail.startTime);
    const agentEnd = timeToMinutes(dayAvail.endTime);
    if (requestedStart < agentStart || requestedEnd > agentEnd) continue;

    // Check max showings per day
    const agentShowingsToday = Array.from(showings.values()).filter(
      (s) =>
        s.agentId === agent.id &&
        formatDate(s.scheduledDate) === dateStr &&
        s.status !== 'cancelled' &&
        s.status !== 'no_show'
    );
    if (agentShowingsToday.length >= agent.maxShowingsPerDay) continue;

    // Check for conflicts
    const conflict = agentShowingsToday.find((s) => {
      const showingStart = timeToMinutes(s.startTime);
      const showingEnd = timeToMinutes(s.endTime);
      return requestedStart < showingEnd && requestedEnd > showingStart;
    });
    if (conflict) continue;

    // Prefer agents with this property in their preferences
    if (agent.preferredPropertyIds.includes(propertyId)) {
      return agent;
    }

    return agent;
  }

  return null;
}

export function calculateShowingStats(propertyShowings: Showing[]): {
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
  conversionRate: number;
  averageRating: number;
  feedbackCount: number;
} {
  const completed = propertyShowings.filter((s) => s.status === 'completed');
  const cancelled = propertyShowings.filter((s) => s.status === 'cancelled');
  const noShow = propertyShowings.filter((s) => s.status === 'no_show');
  const withFeedback = completed.filter((s) => s.feedback);
  const interested = withFeedback.filter((s) => s.feedback?.interested);

  const ratings = withFeedback
    .filter((s) => s.feedback?.rating)
    .map((s) => s.feedback!.rating);
  const averageRating = ratings.length > 0
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : 0;

  return {
    total: propertyShowings.length,
    completed: completed.length,
    cancelled: cancelled.length,
    noShow: noShow.length,
    conversionRate: withFeedback.length > 0
      ? Math.round((interested.length / withFeedback.length) * 100)
      : 0,
    averageRating: Math.round(averageRating * 10) / 10,
    feedbackCount: withFeedback.length,
  };
}

// ============================================================================
// Validation Schemas
// ============================================================================

const createProspectSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  preferredContactMethod: z.enum(['email', 'phone', 'text']).default('email'),
  source: z.string().optional(),
  prequalified: z.boolean().default(false),
  budget: z.number().optional(),
  desiredMoveIn: z.string().datetime().optional(),
  desiredBedrooms: z.number().optional(),
  desiredBathrooms: z.number().optional(),
  pets: z.boolean().default(false),
  notes: z.string().optional(),
  listingIds: z.array(z.string().uuid()).default([]),
});

const scheduleShowingSchema = z.object({
  listingId: z.string().uuid(),
  propertyId: z.string().uuid(),
  unitId: z.string().uuid().optional(),
  prospectId: z.string().uuid(),
  type: z.enum(['in_person', 'virtual', 'self_guided']),
  scheduledDate: z.string().datetime(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  duration: z.number().min(15).max(120).default(30),
  timezone: z.string().default('America/New_York'),
  notes: z.string().optional(),
  agentId: z.string().uuid().optional(),
});

const submitFeedbackSchema = z.object({
  rating: z.number().min(1).max(5),
  interested: z.boolean(),
  priceOpinion: z.enum(['too_high', 'fair', 'good_value']).optional(),
  conditionOpinion: z.enum(['excellent', 'good', 'fair', 'poor']).optional(),
  locationOpinion: z.enum(['excellent', 'good', 'fair', 'poor']).optional(),
  comments: z.string().optional(),
  followUpRequested: z.boolean().default(false),
});

const setAvailabilitySchema = z.object({
  listingId: z.string().uuid(),
  propertyId: z.string().uuid(),
  defaultDuration: z.number().min(15).max(120).default(30),
  bufferTime: z.number().min(0).max(60).default(15),
  minNoticeHours: z.number().min(1).max(72).default(2),
  maxAdvanceDays: z.number().min(1).max(90).default(14),
  allowSelfSchedule: z.boolean().default(true),
  allowSelfGuided: z.boolean().default(false),
  requireApproval: z.boolean().default(false),
  weeklySchedule: z.array(z.object({
    dayOfWeek: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    status: z.enum(['available', 'blocked', 'tentative']),
  })),
});

const createAgentSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  maxShowingsPerDay: z.number().min(1).max(20).default(8),
  preferredPropertyIds: z.array(z.string().uuid()).default([]),
  autoAssign: z.boolean().default(true),
  availability: z.array(z.object({
    dayOfWeek: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    isAvailable: z.boolean(),
  })),
});

const blockDateSchema = z.object({
  date: z.string().datetime(),
  reason: z.string().optional(),
  allDay: z.boolean().default(true),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

// ============================================================================
// Routes
// ============================================================================

export async function showingRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // Prospects
  // -------------------------------------------------------------------------

  // List prospects
  app.get('/prospects', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { status?: string; listingId?: string };

    let prospectList = Array.from(prospects.values());

    if (query.status) {
      prospectList = prospectList.filter((p) => p.status === query.status);
    }
    if (query.listingId) {
      prospectList = prospectList.filter((p) => p.listingIds.includes(query.listingId!));
    }

    // Sort by last contact
    prospectList.sort((a, b) => {
      const aDate = a.lastContactAt?.getTime() ?? 0;
      const bDate = b.lastContactAt?.getTime() ?? 0;
      return bDate - aDate;
    });

    return reply.send({
      success: true,
      data: prospectList,
      total: prospectList.length,
    });
  });

  // Create prospect
  app.post('/prospects', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createProspectSchema.parse(request.body);
    const now = new Date();

    const prospect: Prospect = {
      id: crypto.randomUUID(),
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone ?? null,
      preferredContactMethod: body.preferredContactMethod,
      source: body.source ?? null,
      prequalified: body.prequalified,
      budget: body.budget ?? null,
      desiredMoveIn: body.desiredMoveIn ? new Date(body.desiredMoveIn) : null,
      desiredBedrooms: body.desiredBedrooms ?? null,
      desiredBathrooms: body.desiredBathrooms ?? null,
      pets: body.pets,
      notes: body.notes ?? null,
      listingIds: body.listingIds,
      showingCount: 0,
      lastContactAt: null,
      status: 'new',
      lostReason: null,
      createdAt: now,
      updatedAt: now,
    };

    prospects.set(prospect.id, prospect);

    return reply.status(201).send({
      success: true,
      data: prospect,
    });
  });

  // Get prospect
  app.get('/prospects/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const prospect = prospects.get(id);

    if (!prospect) {
      return reply.status(404).send({ success: false, error: 'Prospect not found' });
    }

    // Get their showings
    const prospectShowings = Array.from(showings.values())
      .filter((s) => s.prospectId === id)
      .sort((a, b) => b.scheduledDate.getTime() - a.scheduledDate.getTime());

    return reply.send({
      success: true,
      data: {
        ...prospect,
        showings: prospectShowings,
      },
    });
  });

  // -------------------------------------------------------------------------
  // Availability
  // -------------------------------------------------------------------------

  // Get available slots
  app.get('/availability/:listingId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { listingId } = request.params as { listingId: string };
    const query = request.query as { startDate?: string; endDate?: string };

    const availability = listingAvailability.get(listingId);
    if (!availability) {
      return reply.status(404).send({ success: false, error: 'Availability not configured' });
    }

    const startDate = query.startDate ? new Date(query.startDate) : new Date();
    const endDate = query.endDate
      ? new Date(query.endDate)
      : new Date(startDate.getTime() + availability.maxAdvanceDays * 24 * 60 * 60 * 1000);

    const listingShowings = Array.from(showings.values())
      .filter((s) => s.listingId === listingId);

    const allSlots: TimeSlot[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const slots = generateTimeSlots(availability, currentDate, listingShowings);
      allSlots.push(...slots);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return reply.send({
      success: true,
      data: {
        listingId,
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        slots: allSlots,
        settings: {
          defaultDuration: availability.defaultDuration,
          allowSelfSchedule: availability.allowSelfSchedule,
          allowSelfGuided: availability.allowSelfGuided,
          requireApproval: availability.requireApproval,
        },
      },
    });
  });

  // Set availability
  app.post('/availability', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = setAvailabilitySchema.parse(request.body);
    const now = new Date();

    const availability: ListingAvailability = {
      id: crypto.randomUUID(),
      listingId: body.listingId,
      propertyId: body.propertyId,
      defaultDuration: body.defaultDuration,
      bufferTime: body.bufferTime,
      minNoticeHours: body.minNoticeHours,
      maxAdvanceDays: body.maxAdvanceDays,
      allowSelfSchedule: body.allowSelfSchedule,
      allowSelfGuided: body.allowSelfGuided,
      requireApproval: body.requireApproval,
      weeklySchedule: body.weeklySchedule,
      blockedDates: [],
      createdAt: now,
      updatedAt: now,
    };

    listingAvailability.set(body.listingId, availability);

    return reply.status(201).send({
      success: true,
      data: availability,
    });
  });

  // Block date
  app.post('/availability/:listingId/block', async (request: FastifyRequest, reply: FastifyReply) => {
    const { listingId } = request.params as { listingId: string };
    const body = blockDateSchema.parse(request.body);

    const availability = listingAvailability.get(listingId);
    if (!availability) {
      return reply.status(404).send({ success: false, error: 'Availability not configured' });
    }

    const blockedDate: BlockedDate = {
      date: new Date(body.date),
      reason: body.reason ?? null,
      allDay: body.allDay,
      startTime: body.startTime ?? null,
      endTime: body.endTime ?? null,
    };

    availability.blockedDates.push(blockedDate);
    availability.updatedAt = new Date();
    listingAvailability.set(listingId, availability);

    return reply.send({
      success: true,
      data: availability,
    });
  });

  // -------------------------------------------------------------------------
  // Showings
  // -------------------------------------------------------------------------

  // List showings
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      listingId?: string;
      propertyId?: string;
      agentId?: string;
      prospectId?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    };

    let showingList = Array.from(showings.values());

    if (query.listingId) {
      showingList = showingList.filter((s) => s.listingId === query.listingId);
    }
    if (query.propertyId) {
      showingList = showingList.filter((s) => s.propertyId === query.propertyId);
    }
    if (query.agentId) {
      showingList = showingList.filter((s) => s.agentId === query.agentId);
    }
    if (query.prospectId) {
      showingList = showingList.filter((s) => s.prospectId === query.prospectId);
    }
    if (query.status) {
      showingList = showingList.filter((s) => s.status === query.status);
    }
    if (query.startDate) {
      const start = new Date(query.startDate);
      showingList = showingList.filter((s) => s.scheduledDate >= start);
    }
    if (query.endDate) {
      const end = new Date(query.endDate);
      showingList = showingList.filter((s) => s.scheduledDate <= end);
    }

    // Sort by scheduled date
    showingList.sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());

    return reply.send({
      success: true,
      data: showingList,
      total: showingList.length,
    });
  });

  // Schedule showing
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = scheduleShowingSchema.parse(request.body);
    const now = new Date();

    const prospect = prospects.get(body.prospectId);
    if (!prospect) {
      return reply.status(404).send({ success: false, error: 'Prospect not found' });
    }

    // Check availability
    const availability = listingAvailability.get(body.listingId);
    if (availability) {
      const scheduledDate = new Date(body.scheduledDate);
      const existingShowings = Array.from(showings.values())
        .filter((s) => s.listingId === body.listingId);
      const slots = generateTimeSlots(availability, scheduledDate, existingShowings);
      const requestedSlot = slots.find(
        (s) => s.date === formatDate(scheduledDate) && s.startTime === body.startTime
      );

      if (requestedSlot && !requestedSlot.available) {
        return reply.status(400).send({ success: false, error: 'Time slot not available' });
      }
    }

    // Find or assign agent
    let agentId = body.agentId ?? null;
    if (!agentId && body.type !== 'self_guided') {
      const scheduledDate = new Date(body.scheduledDate);
      const endTime = minutesToTime(timeToMinutes(body.startTime) + body.duration);
      const agent = findAvailableAgent(scheduledDate, body.startTime, endTime, body.propertyId);
      agentId = agent?.id ?? null;
    }

    const endTime = minutesToTime(timeToMinutes(body.startTime) + body.duration);

    const showing: Showing = {
      id: crypto.randomUUID(),
      listingId: body.listingId,
      propertyId: body.propertyId,
      unitId: body.unitId ?? null,
      prospectId: body.prospectId,
      agentId,
      type: body.type,
      status: availability?.requireApproval ? 'scheduled' : 'confirmed',
      scheduledDate: new Date(body.scheduledDate),
      startTime: body.startTime,
      endTime,
      duration: body.duration,
      timezone: body.timezone,
      notes: body.notes ?? null,
      prospectNotes: null,
      accessInstructions: null,
      lockboxCode: body.type === 'self_guided' ? generateLockboxCode() : null,
      virtualMeetingUrl: body.type === 'virtual' ? generateVirtualMeetingUrl() : null,
      confirmationSentAt: null,
      reminderSentAt: null,
      feedback: null,
      cancelledReason: null,
      cancelledBy: null,
      createdAt: now,
      updatedAt: now,
    };

    showings.set(showing.id, showing);

    // Update prospect
    prospect.showingCount++;
    prospect.lastContactAt = now;
    if (prospect.status === 'new') {
      prospect.status = 'active';
    }
    if (!prospect.listingIds.includes(body.listingId)) {
      prospect.listingIds.push(body.listingId);
    }
    prospect.updatedAt = now;
    prospects.set(prospect.id, prospect);

    return reply.status(201).send({
      success: true,
      data: showing,
    });
  });

  // Get showing
  app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const showing = showings.get(id);

    if (!showing) {
      return reply.status(404).send({ success: false, error: 'Showing not found' });
    }

    const prospect = prospects.get(showing.prospectId);
    const agent = showing.agentId ? agents.get(showing.agentId) : null;

    return reply.send({
      success: true,
      data: {
        ...showing,
        prospect: prospect ? { id: prospect.id, name: `${prospect.firstName} ${prospect.lastName}`, email: prospect.email } : null,
        agent: agent ? { id: agent.id, name: agent.name, email: agent.email } : null,
      },
    });
  });

  // Confirm showing
  app.post('/:id/confirm', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const showing = showings.get(id);

    if (!showing) {
      return reply.status(404).send({ success: false, error: 'Showing not found' });
    }

    showing.status = 'confirmed';
    showing.confirmationSentAt = new Date();
    showing.updatedAt = new Date();
    showings.set(id, showing);

    return reply.send({ success: true, data: showing });
  });

  // Start showing
  app.post('/:id/start', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const showing = showings.get(id);

    if (!showing) {
      return reply.status(404).send({ success: false, error: 'Showing not found' });
    }

    showing.status = 'in_progress';
    showing.updatedAt = new Date();
    showings.set(id, showing);

    return reply.send({ success: true, data: showing });
  });

  // Complete showing
  app.post('/:id/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const showing = showings.get(id);

    if (!showing) {
      return reply.status(404).send({ success: false, error: 'Showing not found' });
    }

    showing.status = 'completed';
    showing.updatedAt = new Date();
    showings.set(id, showing);

    return reply.send({ success: true, data: showing });
  });

  // Cancel showing
  app.post('/:id/cancel', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const { reason, cancelledBy } = request.body as { reason?: string; cancelledBy: string };

    const showing = showings.get(id);
    if (!showing) {
      return reply.status(404).send({ success: false, error: 'Showing not found' });
    }

    showing.status = 'cancelled';
    showing.cancelledReason = reason ?? null;
    showing.cancelledBy = cancelledBy;
    showing.updatedAt = new Date();
    showings.set(id, showing);

    return reply.send({ success: true, data: showing });
  });

  // Mark as no-show
  app.post('/:id/no-show', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const showing = showings.get(id);

    if (!showing) {
      return reply.status(404).send({ success: false, error: 'Showing not found' });
    }

    showing.status = 'no_show';
    showing.updatedAt = new Date();
    showings.set(id, showing);

    return reply.send({ success: true, data: showing });
  });

  // Submit feedback
  app.post('/:id/feedback', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = submitFeedbackSchema.parse(request.body);

    const showing = showings.get(id);
    if (!showing) {
      return reply.status(404).send({ success: false, error: 'Showing not found' });
    }

    showing.feedback = {
      rating: body.rating,
      interested: body.interested,
      priceOpinion: body.priceOpinion ?? null,
      conditionOpinion: body.conditionOpinion ?? null,
      locationOpinion: body.locationOpinion ?? null,
      comments: body.comments ?? null,
      followUpRequested: body.followUpRequested,
      submittedAt: new Date(),
    };
    showing.updatedAt = new Date();
    showings.set(id, showing);

    // Update prospect if interested
    if (body.interested) {
      const prospect = prospects.get(showing.prospectId);
      if (prospect) {
        prospect.status = 'qualified';
        prospect.updatedAt = new Date();
        prospects.set(prospect.id, prospect);
      }
    }

    return reply.send({ success: true, data: showing });
  });

  // -------------------------------------------------------------------------
  // Agents
  // -------------------------------------------------------------------------

  // List agents
  app.get('/agents', async (_request: FastifyRequest, reply: FastifyReply) => {
    const agentList = Array.from(agents.values());

    return reply.send({
      success: true,
      data: agentList,
      total: agentList.length,
    });
  });

  // Create agent
  app.post('/agents', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createAgentSchema.parse(request.body);
    const now = new Date();

    const agent: ShowingAgent = {
      id: crypto.randomUUID(),
      userId: body.userId,
      name: body.name,
      email: body.email,
      phone: body.phone ?? null,
      isActive: true,
      availability: body.availability,
      maxShowingsPerDay: body.maxShowingsPerDay,
      preferredPropertyIds: body.preferredPropertyIds,
      autoAssign: body.autoAssign,
      calendarSyncEnabled: false,
      calendarProvider: null,
      calendarId: null,
      createdAt: now,
      updatedAt: now,
    };

    agents.set(agent.id, agent);

    return reply.status(201).send({
      success: true,
      data: agent,
    });
  });

  // Get agent schedule
  app.get('/agents/:id/schedule', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { startDate?: string; endDate?: string };

    const agent = agents.get(id);
    if (!agent) {
      return reply.status(404).send({ success: false, error: 'Agent not found' });
    }

    const startDate = query.startDate ? new Date(query.startDate) : new Date();
    const endDate = query.endDate
      ? new Date(query.endDate)
      : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    const agentShowings = Array.from(showings.values())
      .filter(
        (s) =>
          s.agentId === id &&
          s.scheduledDate >= startDate &&
          s.scheduledDate <= endDate &&
          s.status !== 'cancelled'
      )
      .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());

    return reply.send({
      success: true,
      data: {
        agent: { id: agent.id, name: agent.name },
        startDate: formatDate(startDate),
        endDate: formatDate(endDate),
        showings: agentShowings,
        totalShowings: agentShowings.length,
      },
    });
  });

  // -------------------------------------------------------------------------
  // Stats & Reports
  // -------------------------------------------------------------------------

  // Get showing stats for listing
  app.get('/stats/:listingId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { listingId } = request.params as { listingId: string };

    const listingShowings = Array.from(showings.values())
      .filter((s) => s.listingId === listingId);

    const stats = calculateShowingStats(listingShowings);

    // Group by status
    const byStatus = {
      scheduled: listingShowings.filter((s) => s.status === 'scheduled').length,
      confirmed: listingShowings.filter((s) => s.status === 'confirmed').length,
      inProgress: listingShowings.filter((s) => s.status === 'in_progress').length,
      completed: listingShowings.filter((s) => s.status === 'completed').length,
      cancelled: listingShowings.filter((s) => s.status === 'cancelled').length,
      noShow: listingShowings.filter((s) => s.status === 'no_show').length,
    };

    // Group by type
    const byType = {
      inPerson: listingShowings.filter((s) => s.type === 'in_person').length,
      virtual: listingShowings.filter((s) => s.type === 'virtual').length,
      selfGuided: listingShowings.filter((s) => s.type === 'self_guided').length,
    };

    // This week vs last week
    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - now.getDay());
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const thisWeek = listingShowings.filter((s) => s.scheduledDate >= thisWeekStart).length;
    const lastWeek = listingShowings.filter(
      (s) => s.scheduledDate >= lastWeekStart && s.scheduledDate < thisWeekStart
    ).length;

    return reply.send({
      success: true,
      data: {
        listingId,
        stats,
        byStatus,
        byType,
        trends: {
          thisWeek,
          lastWeek,
          change: lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : thisWeek > 0 ? 100 : 0,
        },
      },
    });
  });
}

// Helper functions for mock data
function generateLockboxCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function generateVirtualMeetingUrl(): string {
  return `https://meet.realriches.com/${crypto.randomUUID().substring(0, 8)}`;
}
