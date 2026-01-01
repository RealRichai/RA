/**
 * Usage Metering
 *
 * Tracks tour view sessions for analytics and billing.
 */

import type {
  MeteringHooks,
  MeteringEvent,
  TourViewSession,
} from './types';

export interface MeteringService {
  /** Start a new view session */
  startSession(
    tourAssetId: string,
    userId: string,
    market: string,
    plan: string
  ): TourViewSession;

  /** Record progress in a session */
  recordProgress(sessionId: string, viewPercentage: number): TourViewSession | null;

  /** Complete a session */
  completeSession(sessionId: string): TourViewSession | null;

  /** Record an error in a session */
  recordError(sessionId: string, error: Error): TourViewSession | null;

  /** Get a session by ID */
  getSession(sessionId: string): TourViewSession | null;

  /** Get all events for a session */
  getSessionEvents(sessionId: string): MeteringEvent[];
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
