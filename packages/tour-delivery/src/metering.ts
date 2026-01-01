/**
 * Usage Metering
 *
 * Tracks tour view sessions for analytics, billing, and unit economics.
 * Supports both in-memory (testing) and database-backed (production) implementations.
 *
 * @see RR-ENG-UPDATE-2026-002 - 3DGS Pipeline Economics
 */

import type { PrismaClient } from '@realriches/database';

import type {
  MeteringHooks,
  MeteringEvent,
  TourViewSession,
  ConversionEvent,
} from './types';

export interface MeteringService {
  /** Start a new view session */
  startSession(
    tourAssetId: string,
    userId: string,
    market: string,
    plan: string
  ): TourViewSession | Promise<TourViewSession>;

  /** Record progress in a session */
  recordProgress(sessionId: string, viewPercentage: number): TourViewSession | null | Promise<TourViewSession | null>;

  /** Complete a session */
  completeSession(sessionId: string): TourViewSession | null | Promise<TourViewSession | null>;

  /** Record an error in a session */
  recordError(sessionId: string, error: Error): TourViewSession | null | Promise<TourViewSession | null>;

  /** Get a session by ID */
  getSession(sessionId: string): TourViewSession | null | Promise<TourViewSession | null>;

  /** Get all events for a session */
  getSessionEvents(sessionId: string): MeteringEvent[] | Promise<MeteringEvent[]>;

  /** Record a conversion event (for unit economics) */
  recordConversion?(event: ConversionEvent): Promise<void>;
}

/**
 * In-memory metering service implementation
 */
export class InMemoryMeteringService implements MeteringService {
  private sessions = new Map<string, TourViewSession>();
  private events = new Map<string, MeteringEvent[]>();
  private hooks?: MeteringHooks;

  constructor(hooks?: MeteringHooks) {
    this.hooks = hooks;
  }

  startSession(
    tourAssetId: string,
    userId: string,
    market: string,
    plan: string
  ): TourViewSession {
    const session: TourViewSession = {
      id: `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      tourAssetId,
      userId,
      market,
      plan,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      durationMs: 0,
      viewPercentage: 0,
    };

    this.sessions.set(session.id, session);
    this.events.set(session.id, []);

    // Record event
    this.recordEvent({
      type: 'view_start',
      sessionId: session.id,
      tourAssetId,
      userId,
      market,
      timestamp: new Date(),
    });

    // Call hook
    if (this.hooks?.onViewStart) {
      void this.hooks.onViewStart(session);
    }

    return session;
  }

  recordProgress(sessionId: string, viewPercentage: number): TourViewSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const now = new Date();
    session.lastActivityAt = now;
    session.durationMs = now.getTime() - session.startedAt.getTime();
    session.viewPercentage = Math.min(100, Math.max(0, viewPercentage));

    // Record event
    this.recordEvent({
      type: 'view_progress',
      sessionId,
      tourAssetId: session.tourAssetId,
      userId: session.userId,
      market: session.market,
      timestamp: now,
      metadata: {
        durationMs: session.durationMs,
        viewPercentage: session.viewPercentage,
      },
    });

    // Call hook
    if (this.hooks?.onViewProgress) {
      void this.hooks.onViewProgress(session);
    }

    return session;
  }

  completeSession(sessionId: string): TourViewSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const now = new Date();
    session.lastActivityAt = now;
    session.completedAt = now;
    session.durationMs = now.getTime() - session.startedAt.getTime();
    session.viewPercentage = 100;

    // Record event
    this.recordEvent({
      type: 'view_complete',
      sessionId,
      tourAssetId: session.tourAssetId,
      userId: session.userId,
      market: session.market,
      timestamp: now,
      metadata: {
        durationMs: session.durationMs,
        viewPercentage: session.viewPercentage,
      },
    });

    // Call hook
    if (this.hooks?.onViewComplete) {
      void this.hooks.onViewComplete(session);
    }

    return session;
  }

  recordError(sessionId: string, error: Error): TourViewSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const now = new Date();
    session.lastActivityAt = now;
    session.durationMs = now.getTime() - session.startedAt.getTime();

    // Record event
    this.recordEvent({
      type: 'view_error',
      sessionId,
      tourAssetId: session.tourAssetId,
      userId: session.userId,
      market: session.market,
      timestamp: now,
      metadata: {
        durationMs: session.durationMs,
        viewPercentage: session.viewPercentage,
        errorCode: error.name,
        errorMessage: error.message,
      },
    });

    // Call hook
    if (this.hooks?.onViewError) {
      void this.hooks.onViewError(session, error);
    }

    return session;
  }

  getSession(sessionId: string): TourViewSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  getSessionEvents(sessionId: string): MeteringEvent[] {
    return this.events.get(sessionId) ?? [];
  }

  private recordEvent(event: MeteringEvent): void {
    const events = this.events.get(event.sessionId);
    if (events) {
      events.push(event);
    }
  }

  /**
   * Clear all sessions and events (for testing)
   */
  clear(): void {
    this.sessions.clear();
    this.events.clear();
  }
}

/**
 * Create a metering service
 */
export function createMeteringService(hooks?: MeteringHooks): MeteringService {
  return new InMemoryMeteringService(hooks);
}

/**
 * No-op metering hooks for testing
 */
export const noopMeteringHooks: MeteringHooks = {
  onViewStart: async () => {},
  onViewProgress: async () => {},
  onViewComplete: async () => {},
  onViewError: async () => {},
};

// =============================================================================
// Database-Backed Metering Service (RR-ENG-UPDATE-2026-002)
// =============================================================================

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */

/**
 * Database-backed metering service for production use.
 * Persists sessions and events to Prisma models for unit economics tracking.
 */
export class DatabaseMeteringService implements MeteringService {
  private hooks?: MeteringHooks;

  constructor(
    private readonly prisma: PrismaClient,
    hooks?: MeteringHooks
  ) {
    this.hooks = hooks;
  }

  async startSession(
    tourAssetId: string,
    userId: string,
    market: string,
    plan: string
  ): Promise<TourViewSession> {
    // Create session in database
    const dbSession = await this.prisma.tourViewSession.create({
      data: {
        tourAssetId,
        userId,
        market,
        plan,
        status: 'active',
      },
    });

    // Record view_start event
    await this.prisma.tourMeteringEvent.create({
      data: {
        sessionId: dbSession.id,
        tourAssetId,
        userId,
        market,
        eventType: 'view_start',
      },
    });

    const session: TourViewSession = {
      id: dbSession.id,
      tourAssetId: dbSession.tourAssetId,
      userId: dbSession.userId,
      market: dbSession.market,
      plan: dbSession.plan,
      startedAt: dbSession.startedAt,
      lastActivityAt: dbSession.lastActivityAt,
      durationMs: dbSession.durationMs,
      viewPercentage: dbSession.viewPercentage,
    };

    // Call hook
    if (this.hooks?.onViewStart) {
      void this.hooks.onViewStart(session);
    }

    return session;
  }

  async recordProgress(sessionId: string, viewPercentage: number): Promise<TourViewSession | null> {
    const dbSession = await this.prisma.tourViewSession.findUnique({
      where: { id: sessionId },
    });

    if (!dbSession) return null;

    const now = new Date();
    const durationMs = now.getTime() - dbSession.startedAt.getTime();
    const clampedPercentage = Math.min(100, Math.max(0, viewPercentage));

    // Update session
    const updated = await this.prisma.tourViewSession.update({
      where: { id: sessionId },
      data: {
        lastActivityAt: now,
        durationMs,
        viewPercentage: clampedPercentage,
      },
    });

    // Record progress event (we don't record every heartbeat to avoid event explosion)
    // Only record at 25%, 50%, 75% milestones
    const milestones = [25, 50, 75];
    const previousMilestone = milestones.filter(m => m <= dbSession.viewPercentage).pop() ?? 0;
    const newMilestone = milestones.filter(m => m <= clampedPercentage).pop() ?? 0;

    if (newMilestone > previousMilestone) {
      await this.prisma.tourMeteringEvent.create({
        data: {
          sessionId,
          tourAssetId: dbSession.tourAssetId,
          userId: dbSession.userId,
          market: dbSession.market,
          eventType: 'view_progress',
          metadata: {
            durationMs,
            viewPercentage: clampedPercentage,
            milestone: newMilestone,
          },
        },
      });
    }

    const session: TourViewSession = {
      id: updated.id,
      tourAssetId: updated.tourAssetId,
      userId: updated.userId,
      market: updated.market,
      plan: updated.plan,
      startedAt: updated.startedAt,
      lastActivityAt: updated.lastActivityAt,
      durationMs: updated.durationMs,
      viewPercentage: updated.viewPercentage,
    };

    // Call hook
    if (this.hooks?.onViewProgress) {
      void this.hooks.onViewProgress(session);
    }

    return session;
  }

  async completeSession(sessionId: string): Promise<TourViewSession | null> {
    const dbSession = await this.prisma.tourViewSession.findUnique({
      where: { id: sessionId },
    });

    if (!dbSession) return null;

    const now = new Date();
    const durationMs = now.getTime() - dbSession.startedAt.getTime();

    // Update session as completed
    const updated = await this.prisma.tourViewSession.update({
      where: { id: sessionId },
      data: {
        lastActivityAt: now,
        completedAt: now,
        durationMs,
        viewPercentage: 100,
        status: 'completed',
      },
    });

    // Record complete event
    await this.prisma.tourMeteringEvent.create({
      data: {
        sessionId,
        tourAssetId: dbSession.tourAssetId,
        userId: dbSession.userId,
        market: dbSession.market,
        eventType: 'view_complete',
        metadata: {
          durationMs,
          viewPercentage: 100,
        },
      },
    });

    // Update daily aggregates (fire and forget)
    void this.updateDailyAggregates(dbSession.market, dbSession.plan, durationMs, true);

    const session: TourViewSession = {
      id: updated.id,
      tourAssetId: updated.tourAssetId,
      userId: updated.userId,
      market: updated.market,
      plan: updated.plan,
      startedAt: updated.startedAt,
      lastActivityAt: updated.lastActivityAt,
      completedAt: updated.completedAt ?? undefined,
      durationMs: updated.durationMs,
      viewPercentage: updated.viewPercentage,
    };

    // Call hook
    if (this.hooks?.onViewComplete) {
      void this.hooks.onViewComplete(session);
    }

    return session;
  }

  async recordError(sessionId: string, error: Error): Promise<TourViewSession | null> {
    const dbSession = await this.prisma.tourViewSession.findUnique({
      where: { id: sessionId },
    });

    if (!dbSession) return null;

    const now = new Date();
    const durationMs = now.getTime() - dbSession.startedAt.getTime();

    // Update session with error
    const updated = await this.prisma.tourViewSession.update({
      where: { id: sessionId },
      data: {
        lastActivityAt: now,
        durationMs,
        status: 'error',
        errorCode: error.name,
        errorMessage: error.message.slice(0, 500), // Limit message length
      },
    });

    // Record error event
    await this.prisma.tourMeteringEvent.create({
      data: {
        sessionId,
        tourAssetId: dbSession.tourAssetId,
        userId: dbSession.userId,
        market: dbSession.market,
        eventType: 'view_error',
        metadata: {
          durationMs,
          viewPercentage: dbSession.viewPercentage,
          errorCode: error.name,
          errorMessage: error.message,
        },
      },
    });

    const session: TourViewSession = {
      id: updated.id,
      tourAssetId: updated.tourAssetId,
      userId: updated.userId,
      market: updated.market,
      plan: updated.plan,
      startedAt: updated.startedAt,
      lastActivityAt: updated.lastActivityAt,
      durationMs: updated.durationMs,
      viewPercentage: updated.viewPercentage,
    };

    // Call hook
    if (this.hooks?.onViewError) {
      void this.hooks.onViewError(session, error);
    }

    return session;
  }

  async getSession(sessionId: string): Promise<TourViewSession | null> {
    const dbSession = await this.prisma.tourViewSession.findUnique({
      where: { id: sessionId },
    });

    if (!dbSession) return null;

    return {
      id: dbSession.id,
      tourAssetId: dbSession.tourAssetId,
      userId: dbSession.userId,
      market: dbSession.market,
      plan: dbSession.plan,
      startedAt: dbSession.startedAt,
      lastActivityAt: dbSession.lastActivityAt,
      completedAt: dbSession.completedAt ?? undefined,
      durationMs: dbSession.durationMs,
      viewPercentage: dbSession.viewPercentage,
    };
  }

  async getSessionEvents(sessionId: string): Promise<MeteringEvent[]> {
    const events = await this.prisma.tourMeteringEvent.findMany({
      where: { sessionId },
      orderBy: { timestamp: 'asc' },
    });

    return events.map((e) => ({
      type: e.eventType as MeteringEvent['type'],
      sessionId: e.sessionId,
      tourAssetId: e.tourAssetId,
      userId: e.userId,
      market: e.market,
      timestamp: e.timestamp,
      metadata: e.metadata as MeteringEvent['metadata'],
    }));
  }

  /**
   * Record a conversion event for unit economics tracking
   */
  async recordConversion(event: ConversionEvent): Promise<void> {
    // Record conversion event
    await this.prisma.tourMeteringEvent.create({
      data: {
        sessionId: event.sessionId,
        tourAssetId: event.tourAssetId,
        userId: event.userId,
        market: event.market,
        eventType: 'conversion_triggered',
        metadata: {
          conversionType: event.conversionType,
          ...event.metadata,
        },
      },
    });

    // Get session to determine plan
    const session = await this.prisma.tourViewSession.findUnique({
      where: { id: event.sessionId },
    });

    if (session) {
      // Update daily conversion count
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await this.prisma.tourMeteringDaily.upsert({
        where: {
          date_market_plan: {
            date: today,
            market: event.market,
            plan: session.plan,
          },
        },
        update: {
          conversionsTriggered: { increment: 1 },
        },
        create: {
          date: today,
          market: event.market,
          plan: session.plan,
          conversionsTriggered: 1,
        },
      });
    }
  }

  /**
   * Update daily aggregates for unit economics reporting
   */
  private async updateDailyAggregates(
    market: string,
    plan: string,
    durationMs: number,
    isCompleted: boolean
  ): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const minutesStreamed = durationMs / 60000;

    await this.prisma.tourMeteringDaily.upsert({
      where: {
        date_market_plan: {
          date: today,
          market,
          plan,
        },
      },
      update: {
        totalViews: { increment: 1 },
        completedViews: isCompleted ? { increment: 1 } : undefined,
        totalMinutesStreamed: { increment: minutesStreamed },
      },
      create: {
        date: today,
        market,
        plan,
        totalViews: 1,
        completedViews: isCompleted ? 1 : 0,
        totalMinutesStreamed: minutesStreamed,
      },
    });
  }
}

/**
 * Create a database-backed metering service
 */
export function createDatabaseMeteringService(
  prisma: PrismaClient,
  hooks?: MeteringHooks
): DatabaseMeteringService {
  return new DatabaseMeteringService(prisma, hooks);
}
