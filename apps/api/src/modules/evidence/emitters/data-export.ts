/**
 * Data Export Evidence Emitter
 *
 * Emits SOC2 evidence records for data export actions (GDPR/Privacy compliance).
 */

import { getControlMapping } from '../control-mappings';
import { getEvidenceService } from '../service';
import type { EvidenceEventOutcome } from '../types';

export type DataExportEventType =
  | 'export_requested'
  | 'export_completed'
  | 'export_downloaded'
  | 'export_failed';

export interface DataExportContext {
  exportId: string;
  userId: string;
  requestedById: string;
  requestedByEmail: string;
  requestedByType: 'user' | 'admin';
  sections: string[];
  format: string;
  organizationId?: string;
  status?: string;
  error?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Emit evidence for data export events
 */
export function emitDataExportEvidence(
  eventType: DataExportEventType,
  context: DataExportContext,
  auditLogId?: string
): void {
  const fullEventType = `data.${eventType}`;
  const mapping = getControlMapping(fullEventType);

  if (!mapping) {
    return;
  }

  const service = getEvidenceService();
  const outcome: EvidenceEventOutcome = eventType === 'export_failed' ? 'failure' : 'success';

  service.emit({
    controlId: mapping.controlId,
    category: mapping.category,
    eventType: fullEventType,
    eventOutcome: outcome,
    summary: getDataExportSummary(eventType, context),
    scope: context.requestedByType === 'admin' ? 'org' : 'user',
    actorId: context.requestedById,
    actorEmail: context.requestedByEmail,
    actorType: 'user',
    organizationId: context.organizationId,
    entityType: 'user',
    entityId: context.userId,
    details: {
      exportId: context.exportId,
      sections: context.sections,
      format: context.format,
      status: context.status,
      requestedByType: context.requestedByType,
      error: context.error,
    },
    auditLogIds: auditLogId ? [auditLogId] : [],
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
}

function getDataExportSummary(
  eventType: DataExportEventType,
  context: DataExportContext
): string {
  const actor = context.requestedByEmail;
  const target = context.userId;

  switch (eventType) {
    case 'export_requested':
      return `Data export requested by ${actor} for user ${target} (sections: ${context.sections.join(', ')})`;
    case 'export_completed':
      return `Data export completed for user ${target} (export ID: ${context.exportId})`;
    case 'export_downloaded':
      return `Data export downloaded by ${actor} for user ${target}`;
    case 'export_failed':
      return `Data export failed for user ${target}: ${context.error}`;
    default:
      return `Data export event: ${eventType}`;
  }
}
