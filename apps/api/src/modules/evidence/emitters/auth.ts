/**
 * Auth Evidence Emitter
 *
 * Emits SOC2 evidence records for authentication events.
 */

import { getControlMapping } from '../control-mappings';
import { getEvidenceService } from '../service';
import type { EvidenceEventOutcome } from '../types';

// Security event types from auth service
export type SecurityEventType =
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'logout_all'
  | 'token_refresh'
  | 'token_revoked'
  | 'token_reuse_detected'
  | 'password_changed'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'email_verification_sent'
  | 'email_verified'
  | 'account_locked'
  | 'account_unlocked'
  | 'suspicious_activity';

export interface AuthEventContext {
  userId?: string;
  email?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Emit evidence for authentication events
 */
export function emitAuthEvidence(
  eventType: SecurityEventType,
  context: AuthEventContext,
  auditLogId?: string
): void {
  const fullEventType = `auth.${eventType}`;
  const mapping = getControlMapping(fullEventType);

  if (!mapping) {
    return; // Unknown event type, skip
  }

  const service = getEvidenceService();

  service.emit({
    controlId: mapping.controlId,
    category: mapping.category,
    eventType: fullEventType,
    eventOutcome: mapping.outcomeDefault as EvidenceEventOutcome,
    summary: getAuthEventSummary(eventType, context),
    scope: 'user',
    actorId: context.userId,
    actorEmail: context.email,
    actorType: 'user',
    details: {
      sessionId: context.sessionId,
      ...context.metadata,
    },
    auditLogIds: auditLogId ? [auditLogId] : [],
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
}

function getAuthEventSummary(eventType: SecurityEventType, context: AuthEventContext): string {
  const actor = context.email || context.userId || 'Unknown user';

  switch (eventType) {
    case 'login_success':
      return `User ${actor} logged in successfully`;
    case 'login_failed':
      return `Failed login attempt for ${actor}`;
    case 'logout':
      return `User ${actor} logged out`;
    case 'logout_all':
      return `All sessions terminated for ${actor}`;
    case 'token_refresh':
      return `Token refreshed for ${actor}`;
    case 'token_revoked':
      return `Tokens revoked for ${actor}`;
    case 'token_reuse_detected':
      return `Token reuse detected for ${actor} - security incident`;
    case 'password_changed':
      return `Password changed for ${actor}`;
    case 'password_reset_requested':
      return `Password reset requested for ${actor}`;
    case 'password_reset_completed':
      return `Password reset completed for ${actor}`;
    case 'email_verification_sent':
      return `Email verification sent to ${actor}`;
    case 'email_verified':
      return `Email verified for ${actor}`;
    case 'account_locked':
      return `Account locked for ${actor} due to failed attempts`;
    case 'account_unlocked':
      return `Account unlocked for ${actor}`;
    case 'suspicious_activity':
      return `Suspicious activity detected for ${actor}`;
    default:
      return `Auth event: ${eventType} for ${actor}`;
  }
}
