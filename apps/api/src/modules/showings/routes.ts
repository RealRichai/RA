import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  prisma,
  Prisma,
  type ProspectStatus as PrismaProspectStatus,
  type ContactMethod as PrismaContactMethod,
  type CalendarProviderEnum as PrismaCalendarProvider,
} from '@realriches/database';

// ============================================================================
// Types
// ============================================================================

export type ShowingStatus = 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export type ShowingType = 'in_person' | 'virtual' | 'self_guided';
export type AvailabilityStatus = 'available' | 'blocked' | 'tentative';
export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface ShowingFeedback {
  rating: number;
  interested: boolean;
  priceOpinion: 'too_high' | 'fair' | 'good_value' | null;
  conditionOpinion: 'excellent' | 'good' | 'fair' | 'poor' | null;
  locationOpinion: 'excellent' | 'good' | 'fair' | 'poor' | null;
  comments: string | null;
  followUpRequested: boolean;
  submittedAt: Date;
}

export interface AgentAvailability {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
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
  date: string;
  startTime: string;
  endTime: string;
  available: boolean;
  agentId: string | null;
  reason: string | null;
}

// Helper for Decimal conversion
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

// ============================================================================
// Helper Functions
// ============================================================================

interface ShowingForSlots {
  status: string;
  scheduledDate: Date;
  startTime: string;
  endTime: string;
}

interface AvailabilityForSlots {
  defaultDuration: number;
  bufferTime: number;
  minNoticeHours: number;
  weeklySchedule: WeeklySlot[];
  blockedDates: BlockedDate[];
}

export function generateTimeSlots(
  availability: AvailabilityForSlots,
  date: Date,
  existingShowings: ShowingForSlots[]
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const dayOfWeek = getDayOfWeek(date);
  const dateStr = formatDate(date);

  const blockedDate = availability.blockedDates.find(
    (bd) => formatDate(bd.date) === dateStr
  );
  if (blockedDate?.allDay) {
    return [];
  }

  const daySchedule = availability.weeklySchedule.find((ws) => ws.dayOfWeek === dayOfWeek);
  if (!daySchedule || daySchedule.status === 'blocked') {
    return [];
  }

  const now = new Date();
  const minNoticeTime = new Date(now.getTime() + availability.minNoticeHours * 60 * 60 * 1000);

  const duration = availability.defaultDuration;
  const buffer = availability.bufferTime;
  const startMinutes = timeToMinutes(daySchedule.startTime);
  const endMinutes = timeToMinutes(daySchedule.endTime);

  for (let minutes = startMinutes; minutes + duration <= endMinutes; minutes += duration + buffer) {
    const startTime = minutesToTime(minutes);
    const endTime = minutesToTime(minutes + duration);

    if (blockedDate && !blockedDate.allDay) {
      const blockStart = timeToMinutes(blockedDate.startTime!);
      const blockEnd = timeToMinutes(blockedDate.endTime!);
      if (minutes >= blockStart && minutes < blockEnd) {
        continue;
      }
    }

    const slotDateTime = new Date(`${dateStr}T${startTime}`);
    if (slotDateTime < minNoticeTime) {
      continue;
    }

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

export async function findAvailableAgent(
  date: Date,
  startTime: string,
  endTime: string,
  propertyId: string
): Promise<{ id: string } | null> {
  const dayOfWeek = getDayOfWeek(date);
  const dateStr = formatDate(date);
  const requestedStart = timeToMinutes(startTime);
  const requestedEnd = timeToMinutes(endTime);

  const activeAgents = await prisma.showingAgent.findMany({
    where: { isActive: true, autoAssign: true },
  });

  for (const agent of activeAgents) {
    const availability = agent.availability as unknown as AgentAvailability[];
    const dayAvail = availability.find((a) => a.dayOfWeek === dayOfWeek);
    if (!dayAvail?.isAvailable) continue;

    const agentStart = timeToMinutes(dayAvail.startTime);
    const agentEnd = timeToMinutes(dayAvail.endTime);
    if (requestedStart < agentStart || requestedEnd > agentEnd) continue;

    const agentShowingsToday = await prisma.showing.findMany({
      where: {
        agentId: agent.id,
        scheduledAt: {
          gte: new Date(`${dateStr}T00:00:00`),
          lt: new Date(`${dateStr}T23:59:59`),
        },
        status: { notIn: ['cancelled', 'no_show'] },
      },
    });

    if (agentShowingsToday.length >= agent.maxShowingsPerDay) continue;

    const conflict = agentShowingsToday.find((s) => {
      const showingStart = new Date(s.scheduledAt).getHours() * 60 + new Date(s.scheduledAt).getMinutes();
      const showingEnd = showingStart + s.duration;
      return requestedStart < showingEnd && requestedEnd > showingStart;
    });
    if (conflict) continue;

    if (agent.preferredPropertyIds.includes(propertyId)) {
      return { id: agent.id };
    }

    return { id: agent.id };
  }

  return null;
}

export interface Showing {
  id: string;
  status: 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  scheduledAt: Date;
  feedback?: {
    rating?: number;
    interested?: boolean;
  } | null;
}

export interface ListingAvailability {
  id: string;
  listingId: string;
  propertyId: string;
  defaultDuration: number;
  bufferTime: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
  allowSelfSchedule: boolean;
  allowSelfGuided: boolean;
  requireApproval: boolean;
  weeklySchedule: Array<{
    dayOfWeek: DayOfWeek;
    startTime: string;
    endTime: string;
    status: 'available' | 'blocked' | 'tentative';
  }>;
}

export function calculateShowingStats(showings: Showing[]): {
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
  feedbackCount: number;
  averageRating: number;
  conversionRate: number;
} {
  if (showings.length === 0) {
    return {
      total: 0,
      completed: 0,
      cancelled: 0,
      noShow: 0,
      feedbackCount: 0,
      averageRating: 0,
      conversionRate: 0,
    };
  }

  const completed = showings.filter(s => s.status === 'completed').length;
  const cancelled = showings.filter(s => s.status === 'cancelled').length;
  const noShow = showings.filter(s => s.status === 'no_show').length;

  const withFeedback = showings.filter(s => s.feedback?.rating !== undefined);
  const feedbackCount = withFeedback.length;
  const averageRating = feedbackCount > 0
    ? Math.round(withFeedback.reduce((sum, s) => sum + (s.feedback?.rating || 0), 0) / feedbackCount)
    : 0;

  const interestedCount = withFeedback.filter(s => s.feedback?.interested === true).length;
  const conversionRate = feedbackCount > 0
    ? Math.round((interestedCount / feedbackCount) * 100)
    : 0;

  return {
    total: showings.length,
    completed,
    cancelled,
    noShow,
    feedbackCount,
    averageRating,
    conversionRate,
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

  app.get('/prospects', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { status?: string; listingId?: string };

    const where: Prisma.ProspectWhereInput = {};
    if (query.status) {
      where.status = query.status as PrismaProspectStatus;
    }
    if (query.listingId) {
      where.listingIds = { has: query.listingId };
    }

    const prospectList = await prisma.prospect.findMany({
      where,
      orderBy: { lastContactAt: 'desc' },
    });

    return reply.send({
      success: true,
      data: prospectList.map(p => ({
        ...p,
        budget: p.budget ? toNumber(p.budget) : null,
      })),
      total: prospectList.length,
    });
  });

  app.post('/prospects', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createProspectSchema.parse(request.body);

    const prospect = await prisma.prospect.create({
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone || null,
        preferredContactMethod: body.preferredContactMethod as PrismaContactMethod,
        source: body.source || null,
        prequalified: body.prequalified,
        budget: body.budget || null,
        desiredMoveIn: body.desiredMoveIn ? new Date(body.desiredMoveIn) : null,
        desiredBedrooms: body.desiredBedrooms || null,
        desiredBathrooms: body.desiredBathrooms || null,
        pets: body.pets,
        notes: body.notes || null,
        listingIds: body.listingIds,
        showingCount: 0,
        status: 'new',
      },
    });

    return reply.status(201).send({
      success: true,
      data: { ...prospect, budget: prospect.budget ? toNumber(prospect.budget) : null },
    });
  });

  app.get('/prospects/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const prospect = await prisma.prospect.findUnique({ where: { id } });
    if (!prospect) {
      return reply.status(404).send({ success: false, error: 'Prospect not found' });
    }

    const prospectShowings = await prisma.showing.findMany({
      where: { prospectEmail: prospect.email },
      orderBy: { scheduledAt: 'desc' },
    });

    return reply.send({
      success: true,
      data: {
        ...prospect,
        budget: prospect.budget ? toNumber(prospect.budget) : null,
        showings: prospectShowings,
      },
    });
  });

  // -------------------------------------------------------------------------
  // Availability
  // -------------------------------------------------------------------------

  app.get('/availability/:listingId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { listingId } = request.params as { listingId: string };
    const query = request.query as { startDate?: string; endDate?: string };

    const availability = await prisma.listingAvailability.findUnique({
      where: { listingId },
    });
    if (!availability) {
      return reply.status(404).send({ success: false, error: 'Availability not configured' });
    }

    const startDate = query.startDate ? new Date(query.startDate) : new Date();
    const endDate = query.endDate
      ? new Date(query.endDate)
      : new Date(startDate.getTime() + availability.maxAdvanceDays * 24 * 60 * 60 * 1000);

    const listingShowings = await prisma.showing.findMany({
      where: { listingId },
      select: { status: true, scheduledAt: true, duration: true },
    });

    const showingsForSlots = listingShowings.map(s => ({
      status: s.status,
      scheduledDate: s.scheduledAt,
      startTime: `${String(s.scheduledAt.getHours()).padStart(2, '0')}:${String(s.scheduledAt.getMinutes()).padStart(2, '0')}`,
      endTime: minutesToTime(s.scheduledAt.getHours() * 60 + s.scheduledAt.getMinutes() + s.duration),
    }));

    const weeklySchedule = availability.weeklySchedule as unknown as WeeklySlot[];
    const blockedDates = availability.blockedDates as unknown as BlockedDate[];

    const allSlots: TimeSlot[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const slots = generateTimeSlots(
        {
          defaultDuration: availability.defaultDuration,
          bufferTime: availability.bufferTime,
          minNoticeHours: availability.minNoticeHours,
          weeklySchedule,
          blockedDates,
        },
        currentDate,
        showingsForSlots
      );
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

  app.post('/availability', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = setAvailabilitySchema.parse(request.body);

    const availability = await prisma.listingAvailability.upsert({
      where: { listingId: body.listingId },
      create: {
        listingId: body.listingId,
        propertyId: body.propertyId,
        defaultDuration: body.defaultDuration,
        bufferTime: body.bufferTime,
        minNoticeHours: body.minNoticeHours,
        maxAdvanceDays: body.maxAdvanceDays,
        allowSelfSchedule: body.allowSelfSchedule,
        allowSelfGuided: body.allowSelfGuided,
        requireApproval: body.requireApproval,
        weeklySchedule: body.weeklySchedule as unknown as Prisma.JsonValue,
        blockedDates: [],
      },
      update: {
        propertyId: body.propertyId,
        defaultDuration: body.defaultDuration,
        bufferTime: body.bufferTime,
        minNoticeHours: body.minNoticeHours,
        maxAdvanceDays: body.maxAdvanceDays,
        allowSelfSchedule: body.allowSelfSchedule,
        allowSelfGuided: body.allowSelfGuided,
        requireApproval: body.requireApproval,
        weeklySchedule: body.weeklySchedule as unknown as Prisma.JsonValue,
      },
    });

    return reply.status(201).send({
      success: true,
      data: availability,
    });
  });

  app.post('/availability/:listingId/block', async (request: FastifyRequest, reply: FastifyReply) => {
    const { listingId } = request.params as { listingId: string };
    const body = blockDateSchema.parse(request.body);

    const availability = await prisma.listingAvailability.findUnique({
      where: { listingId },
    });
    if (!availability) {
      return reply.status(404).send({ success: false, error: 'Availability not configured' });
    }

    const blockedDates = (availability.blockedDates as unknown as BlockedDate[]) || [];
    blockedDates.push({
      date: new Date(body.date),
      reason: body.reason ?? null,
      allDay: body.allDay,
      startTime: body.startTime ?? null,
      endTime: body.endTime ?? null,
    });

    const updated = await prisma.listingAvailability.update({
      where: { listingId },
      data: { blockedDates: blockedDates as unknown as Prisma.JsonValue },
    });

    return reply.send({
      success: true,
      data: updated,
    });
  });

  // -------------------------------------------------------------------------
  // Showings
  // -------------------------------------------------------------------------

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

    const where: Prisma.ShowingWhereInput = {};
    if (query.listingId) where.listingId = query.listingId;
    if (query.agentId) where.agentId = query.agentId;
    if (query.status) where.status = query.status;
    if (query.startDate || query.endDate) {
      where.scheduledAt = {};
      if (query.startDate) where.scheduledAt.gte = new Date(query.startDate);
      if (query.endDate) where.scheduledAt.lte = new Date(query.endDate);
    }

    const showingList = await prisma.showing.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
    });

    return reply.send({
      success: true,
      data: showingList,
      total: showingList.length,
    });
  });

  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = scheduleShowingSchema.parse(request.body);

    const prospect = await prisma.prospect.findUnique({ where: { id: body.prospectId } });
    if (!prospect) {
      return reply.status(404).send({ success: false, error: 'Prospect not found' });
    }

    const availability = await prisma.listingAvailability.findUnique({
      where: { listingId: body.listingId },
    });

    let agentId = body.agentId ?? null;
    if (!agentId && body.type !== 'self_guided') {
      const scheduledDate = new Date(body.scheduledDate);
      const endTime = minutesToTime(timeToMinutes(body.startTime) + body.duration);
      const agent = await findAvailableAgent(scheduledDate, body.startTime, endTime, body.propertyId);
      agentId = agent?.id ?? null;
    }

    const scheduledAt = new Date(body.scheduledDate);
    const [hours, mins] = body.startTime.split(':').map(Number);
    scheduledAt.setHours(hours, mins, 0, 0);

    const showing = await prisma.showing.create({
      data: {
        listingId: body.listingId,
        agentId,
        prospectName: `${prospect.firstName} ${prospect.lastName}`,
        prospectEmail: prospect.email,
        prospectPhone: prospect.phone,
        scheduledAt,
        duration: body.duration,
        type: body.type,
        status: availability?.requireApproval ? 'scheduled' : 'confirmed',
        accessInstructions: body.type === 'self_guided' ? `Lockbox code: ${generateLockboxCode()}` : null,
        feedback: body.type === 'virtual' ? { virtualMeetingUrl: generateVirtualMeetingUrl() } : null,
      },
    });

    await prisma.prospect.update({
      where: { id: prospect.id },
      data: {
        showingCount: { increment: 1 },
        lastContactAt: new Date(),
        status: prospect.status === 'new' ? 'active' : prospect.status,
        listingIds: prospect.listingIds.includes(body.listingId)
          ? prospect.listingIds
          : [...prospect.listingIds, body.listingId],
      },
    });

    return reply.status(201).send({
      success: true,
      data: showing,
    });
  });

  app.get('/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const showing = await prisma.showing.findUnique({ where: { id } });
    if (!showing) {
      return reply.status(404).send({ success: false, error: 'Showing not found' });
    }

    const agent = showing.agentId
      ? await prisma.showingAgent.findUnique({ where: { id: showing.agentId } })
      : null;

    return reply.send({
      success: true,
      data: {
        ...showing,
        prospect: { name: showing.prospectName, email: showing.prospectEmail },
        agent: agent ? { id: agent.id, name: agent.name, email: agent.email } : null,
      },
    });
  });

  app.post('/:id/confirm', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const showing = await prisma.showing.update({
      where: { id },
      data: { status: 'confirmed' },
    });

    return reply.send({ success: true, data: showing });
  });

  app.post('/:id/start', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const showing = await prisma.showing.update({
      where: { id },
      data: { status: 'in_progress' },
    });

    return reply.send({ success: true, data: showing });
  });

  app.post('/:id/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const showing = await prisma.showing.update({
      where: { id },
      data: { status: 'completed' },
    });

    return reply.send({ success: true, data: showing });
  });

  app.post('/:id/cancel', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const showing = await prisma.showing.update({
      where: { id },
      data: { status: 'cancelled' },
    });

    return reply.send({ success: true, data: showing });
  });

  app.post('/:id/no-show', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const showing = await prisma.showing.update({
      where: { id },
      data: { status: 'no_show' },
    });

    return reply.send({ success: true, data: showing });
  });

  app.post('/:id/feedback', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = submitFeedbackSchema.parse(request.body);

    const feedback: ShowingFeedback = {
      rating: body.rating,
      interested: body.interested,
      priceOpinion: body.priceOpinion ?? null,
      conditionOpinion: body.conditionOpinion ?? null,
      locationOpinion: body.locationOpinion ?? null,
      comments: body.comments ?? null,
      followUpRequested: body.followUpRequested,
      submittedAt: new Date(),
    };

    const showing = await prisma.showing.update({
      where: { id },
      data: { feedback: feedback as unknown as Prisma.JsonValue },
    });

    if (body.interested) {
      await prisma.prospect.updateMany({
        where: { email: showing.prospectEmail },
        data: { status: 'qualified' },
      });
    }

    return reply.send({ success: true, data: showing });
  });

  // -------------------------------------------------------------------------
  // Agents
  // -------------------------------------------------------------------------

  app.get('/agents', async (_request: FastifyRequest, reply: FastifyReply) => {
    const agentList = await prisma.showingAgent.findMany();

    return reply.send({
      success: true,
      data: agentList,
      total: agentList.length,
    });
  });

  app.post('/agents', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createAgentSchema.parse(request.body);

    const agent = await prisma.showingAgent.create({
      data: {
        userId: body.userId,
        name: body.name,
        email: body.email,
        phone: body.phone || null,
        isActive: true,
        availability: body.availability as unknown as Prisma.JsonValue,
        maxShowingsPerDay: body.maxShowingsPerDay,
        preferredPropertyIds: body.preferredPropertyIds,
        autoAssign: body.autoAssign,
        calendarSyncEnabled: false,
      },
    });

    return reply.status(201).send({
      success: true,
      data: agent,
    });
  });

  app.get('/agents/:id/schedule', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const query = request.query as { startDate?: string; endDate?: string };

    const agent = await prisma.showingAgent.findUnique({ where: { id } });
    if (!agent) {
      return reply.status(404).send({ success: false, error: 'Agent not found' });
    }

    const startDate = query.startDate ? new Date(query.startDate) : new Date();
    const endDate = query.endDate
      ? new Date(query.endDate)
      : new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    const agentShowings = await prisma.showing.findMany({
      where: {
        agentId: id,
        scheduledAt: { gte: startDate, lte: endDate },
        status: { not: 'cancelled' },
      },
      orderBy: { scheduledAt: 'asc' },
    });

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

  app.get('/stats/:listingId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { listingId } = request.params as { listingId: string };

    const listingShowings = await prisma.showing.findMany({
      where: { listingId },
    });

    const completed = listingShowings.filter((s) => s.status === 'completed');
    const cancelled = listingShowings.filter((s) => s.status === 'cancelled');
    const noShow = listingShowings.filter((s) => s.status === 'no_show');
    const withFeedback = completed.filter((s) => s.feedback);
    const interested = withFeedback.filter((s) => {
      const fb = s.feedback as unknown as ShowingFeedback | null;
      return fb?.interested;
    });

    const ratings = withFeedback
      .map((s) => (s.feedback as unknown as ShowingFeedback | null)?.rating)
      .filter((r): r is number => r !== undefined && r !== null);
    const averageRating = ratings.length > 0
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length
      : 0;

    const byStatus = {
      scheduled: listingShowings.filter((s) => s.status === 'scheduled').length,
      confirmed: listingShowings.filter((s) => s.status === 'confirmed').length,
      inProgress: listingShowings.filter((s) => s.status === 'in_progress').length,
      completed: completed.length,
      cancelled: cancelled.length,
      noShow: noShow.length,
    };

    const byType = {
      inPerson: listingShowings.filter((s) => s.type === 'in_person').length,
      virtual: listingShowings.filter((s) => s.type === 'virtual').length,
      selfGuided: listingShowings.filter((s) => s.type === 'self_guided').length,
    };

    const now = new Date();
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - now.getDay());
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const thisWeek = listingShowings.filter((s) => s.scheduledAt >= thisWeekStart).length;
    const lastWeek = listingShowings.filter(
      (s) => s.scheduledAt >= lastWeekStart && s.scheduledAt < thisWeekStart
    ).length;

    return reply.send({
      success: true,
      data: {
        listingId,
        stats: {
          total: listingShowings.length,
          completed: completed.length,
          cancelled: cancelled.length,
          noShow: noShow.length,
          conversionRate: withFeedback.length > 0
            ? Math.round((interested.length / withFeedback.length) * 100)
            : 0,
          averageRating: Math.round(averageRating * 10) / 10,
          feedbackCount: withFeedback.length,
        },
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

function generateLockboxCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function generateVirtualMeetingUrl(): string {
  return `https://meet.realriches.com/${crypto.randomUUID().substring(0, 8)}`;
}
