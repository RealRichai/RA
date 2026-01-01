/**
 * Admin Evidence Emitter
 *
 * Emits SOC2 evidence records for admin access actions.
 */

import { getControlMapping } from '../control-mappings';
import { getEvidenceService } from '../service';
import type { EvidenceEventOutcome } from '../types';

export type AdminEventType =
  | 'impersonation_started'
  | 'impersonation_ended'
  | 'impersonation_force_ended'
  | 'bulk_operation_initiated'
  | 'system_setting_changed'
  | 'role_assigned'
  | 'role_revoked';

export interface AdminEventContext {
  adminId: string;
  adminEmail: string;
  organizationId?: string;
  targetUserId?: string;
  targetUserEmail?: string;
  action?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Emit evidence for admin access events
 */
export function emitAdminEvidence(
  eventType: AdminEventType,
  context: AdminEventContext,
  auditLogId?: string
): void {
  const fullEventType = `admin.${eventType}`;
  const mapping = getControlMapping(fullEventType);

  if (!mapping) {
    return;
  }

  const service = getEvidenceService();

  service.emit({
    controlId: mapping.controlId,
    category: mapping.category,
    eventType: fullEventType,
    eventOutcome: mapping.outcomeDefault as EvidenceEventOutcome,
    summary: getAdminEventSummary(eventType, context),
    scope: 'org',
    actorId: context.adminId,
    actorEmail: context.adminEmail,
    actorType: 'user',
    organizationId: context.organizationId,
    entityType: context.targetUserId ? 'user' : undefined,
    entityId: context.targetUserId,
    details: {
      targetUserEmail: context.targetUserEmail,
      action: context.action,
      reason: context.reason,
      ...context.metadata,
    },
    auditLogIds: auditLogId ? [auditLogId] : [],
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
}

function getAdminEventSummary(eventType: AdminEventType, context: AdminEventContext): string {
  switch (eventType) {
    case 'impersonation_started':
      return `Admin ${context.adminEmail} started impersonating ${context.targetUserEmail}`;
    case 'impersonation_ended':
      return `Admin ${context.adminEmail} ended impersonation of ${context.targetUserEmail}`;
    case 'impersonation_force_ended':
      return `Admin ${context.adminEmail} force-ended another admin's impersonation session`;
    case 'bulk_operation_initiated':
      return `Admin ${context.adminEmail} initiated bulk operation: ${context.action}`;
    case 'system_setting_changed':
      return `Admin ${context.adminEmail} changed system setting: ${context.action}`;
    case 'role_assigned':
      return `Admin ${context.adminEmail} assigned role to ${context.targetUserEmail}`;
    case 'role_revoked':
      return `Admin ${context.adminEmail} revoked role from ${context.targetUserEmail}`;
    default:
      return `Admin action: ${eventType} by ${context.adminEmail}`;
  }
}
