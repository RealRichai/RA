/**
 * Shadow Write Evidence Emitter
 *
 * Records shadow write failures and discrepancies as EvidenceRecords
 * for SOC2 audit trail and chaos engineering observability.
 */

import crypto from 'crypto';

import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';

// =============================================================================
// Types
// =============================================================================

export interface ShadowWriteEvidenceParams {
  eventType: 'SHADOW_WRITE_FAILURE' | 'SHADOW_WRITE_DISCREPANCY';
  entityType: string;
  entityId: string;
  operation?: 'create' | 'update' | 'delete' | 'verify';
  errorMessage?: string;
  errorName?: string;
  faultId?: string;
  requestId?: string;
  userId?: string;
  organizationId?: string;
  discrepancyType?: 'missing_in_shadow' | 'missing_in_primary' | 'data_mismatch';
  discrepancyDetails?: Record<string, unknown>;
}

// =============================================================================
// Evidence Emission
// =============================================================================

/**
 * Emit shadow write evidence (non-blocking)
 *
 * Records are emitted asynchronously to avoid blocking the request path.
 */
export async function emitShadowWriteEvidence(
  params: ShadowWriteEvidenceParams
): Promise<void> {
  // Use setImmediate for non-blocking emission
  setImmediate(() => {
    void emitShadowWriteEvidenceSync(params);
  });
}

/**
 * Emit shadow write evidence synchronously (for testing)
 */
export async function emitShadowWriteEvidenceSync(
  params: ShadowWriteEvidenceParams
): Promise<void> {
  try {
    const summary = buildSummary(params);
    const details = buildDetails(params);
    const contentHash = computeContentHash(summary, details);

    await prisma.evidenceRecord.create({
      data: {
        controlId: 'CC-7.2', // SOC2: System monitoring and incident response
        category: 'ProcessingIntegrity',
        actorType: params.faultId ? 'chaos_injector' : 'system',
        actorId: params.userId || null,
        scope: params.organizationId ? 'org' : 'tenant',
        organizationId: params.organizationId || null,
        eventType: params.eventType,
        eventOutcome: params.eventType === 'SHADOW_WRITE_FAILURE' ? 'FAILURE' : 'DISCREPANCY',
        summary,
        details,
        contentHash,
        entityType: params.entityType,
        entityId: params.entityId,
        requestId: params.requestId || null,
        occurredAt: new Date(),
      },
    });

    logger.info(
      {
        eventType: params.eventType,
        entityType: params.entityType,
        entityId: params.entityId,
        faultId: params.faultId,
        requestId: params.requestId,
      },
      'Shadow write evidence recorded'
    );
  } catch (error) {
    logger.error(
      { err: error, params },
      'Failed to emit shadow write evidence'
    );
  }
}

/**
 * Build human-readable summary
 */
function buildSummary(params: ShadowWriteEvidenceParams): string {
  if (params.eventType === 'SHADOW_WRITE_FAILURE') {
    const faultInfo = params.faultId ? ` (injected fault: ${params.faultId})` : '';
    return `Shadow write ${params.operation || 'operation'} failed for ${params.entityType}:${params.entityId}${faultInfo}`;
  }

  return `Discrepancy detected: ${params.discrepancyType} for ${params.entityType}:${params.entityId}`;
}

/**
 * Build structured details (no PII)
 */
function buildDetails(params: ShadowWriteEvidenceParams): Record<string, unknown> {
  const details: Record<string, unknown> = {
    entityType: params.entityType,
    entityId: params.entityId,
    timestamp: new Date().toISOString(),
  };

  if (params.eventType === 'SHADOW_WRITE_FAILURE') {
    details.operation = params.operation;
    details.errorName = params.errorName;
    details.errorMessage = params.errorMessage;
    details.isInjectedFault = !!params.faultId;
    if (params.faultId) {
      details.faultId = params.faultId;
    }
  } else {
    details.discrepancyType = params.discrepancyType;
    if (params.discrepancyDetails) {
      // Only include non-PII fields
      details.discrepancyDetails = {
        primaryExists: params.discrepancyDetails.primaryExists,
        shadowExists: params.discrepancyDetails.shadowExists,
        fieldsChecked: params.discrepancyDetails.fieldsChecked,
        mismatchedFields: params.discrepancyDetails.mismatchedFields,
      };
    }
  }

  if (params.requestId) {
    details.requestId = params.requestId;
  }

  return details;
}

/**
 * Compute content hash for integrity verification
 */
function computeContentHash(
  summary: string,
  details: Record<string, unknown>
): string {
  const content = JSON.stringify({ summary, details });
  return crypto.createHash('sha256').update(content).digest('hex');
}

// =============================================================================
// Batch Evidence Emission
// =============================================================================

export interface DiscrepancyBatch {
  entityType: string;
  discrepancies: Array<{
    entityId: string;
    discrepancyType: 'missing_in_shadow' | 'missing_in_primary' | 'data_mismatch';
    details?: Record<string, unknown>;
  }>;
  verificationRunId: string;
}

/**
 * Emit evidence for a batch of discrepancies (used by verifier job)
 */
export async function emitDiscrepancyBatchEvidence(
  batch: DiscrepancyBatch
): Promise<number> {
  let emitted = 0;

  for (const discrepancy of batch.discrepancies) {
    await emitShadowWriteEvidenceSync({
      eventType: 'SHADOW_WRITE_DISCREPANCY',
      entityType: batch.entityType,
      entityId: discrepancy.entityId,
      operation: 'verify',
      discrepancyType: discrepancy.discrepancyType,
      discrepancyDetails: {
        ...discrepancy.details,
        verificationRunId: batch.verificationRunId,
      },
    });
    emitted++;
  }

  return emitted;
}
