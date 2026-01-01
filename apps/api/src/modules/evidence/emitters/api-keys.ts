/**
 * API Key Evidence Emitter
 *
 * Emits SOC2 evidence records for API key management events.
 */

import { getControlMapping } from '../control-mappings';
import { getEvidenceService } from '../service';
import type { EvidenceEventOutcome } from '../types';

export type ApiKeyEventType =
  | 'api_key_created'
  | 'api_key_updated'
  | 'api_key_disabled'
  | 'api_key_enabled'
  | 'api_key_revoked'
  | 'api_key_rotated';

export interface ApiKeyEventContext {
  apiKeyId: string;
  apiKeyPrefix: string;
  targetUserId: string;
  targetUserEmail?: string;
  adminId: string;
  adminEmail: string;
  organizationId?: string;
  scopes?: string[];
  changes?: Record<string, unknown>;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Emit evidence for API key management events
 */
export function emitApiKeyEvidence(
  eventType: ApiKeyEventType,
  context: ApiKeyEventContext,
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
    summary: getApiKeyEventSummary(eventType, context),
    scope: 'org',
    actorId: context.adminId,
    actorEmail: context.adminEmail,
    actorType: 'user',
    organizationId: context.organizationId,
    entityType: 'api_key',
    entityId: context.apiKeyId,
    details: {
      apiKeyPrefix: context.apiKeyPrefix,
      targetUserId: context.targetUserId,
      targetUserEmail: context.targetUserEmail,
      scopes: context.scopes,
      changes: context.changes,
      reason: context.reason,
    },
    auditLogIds: auditLogId ? [auditLogId] : [],
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
}

function getApiKeyEventSummary(eventType: ApiKeyEventType, context: ApiKeyEventContext): string {
  const keyRef = `${context.apiKeyPrefix}...`;

  switch (eventType) {
    case 'api_key_created':
      return `API key ${keyRef} created for user ${context.targetUserEmail || context.targetUserId} by admin ${context.adminEmail}`;
    case 'api_key_updated':
      return `API key ${keyRef} updated by admin ${context.adminEmail}`;
    case 'api_key_disabled':
      return `API key ${keyRef} disabled by admin ${context.adminEmail}`;
    case 'api_key_enabled':
      return `API key ${keyRef} enabled by admin ${context.adminEmail}`;
    case 'api_key_revoked':
      return `API key ${keyRef} revoked by admin ${context.adminEmail}`;
    case 'api_key_rotated':
      return `API key ${keyRef} rotated by admin ${context.adminEmail}`;
    default:
      return `API key event: ${eventType} for ${keyRef}`;
  }
}
