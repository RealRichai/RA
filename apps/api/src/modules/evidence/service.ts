/**
 * Evidence Service
 *
 * Core service for emitting and querying SOC2 evidence records.
 */

import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';

import { computeContentHash, verifyContentHash, verifyChain } from './integrity';
import type {
  EvidenceEmitInput,
  EvidenceRecord,
  EvidenceQueryParams,
  IntegrityVerificationResult,
  ChainVerificationResult,
  EvidenceAuditReport,
  SOC2Category,
  EvidenceScope,
} from './types';

// Track last hash for chain linking (per-process, reset on restart)
let lastContentHash: string | null = null;

/**
 * Evidence Service class for SOC2 compliance evidence management
 */
export class EvidenceService {
  /**
   * Emit an evidence record (non-blocking, fire-and-forget)
   * This is the primary method for production use
   */
  emit(input: EvidenceEmitInput): void {
    // Fire and forget - don't block the request
    setImmediate(async () => {
      try {
        await this.emitSync(input);
      } catch (err) {
        // Never throw - just log
        logger.error({
          msg: 'evidence_emit_failed',
          eventType: input.eventType,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  }

  /**
   * Emit evidence synchronously (for testing or when blocking is acceptable)
   */
  async emitSync(input: EvidenceEmitInput): Promise<EvidenceRecord> {
    const occurredAt = input.occurredAt || new Date();

    // Compute integrity hash
    const contentHash = computeContentHash(input.details || null);
    const previousHash = lastContentHash;

    // Create evidence record
    const record = await prisma.evidenceRecord.create({
      data: {
        controlId: input.controlId,
        category: input.category as SOC2Category,
        actorId: input.actorId || null,
        actorEmail: input.actorEmail || null,
        actorType: input.actorType,
        organizationId: input.organizationId || null,
        tenantId: input.tenantId || null,
        scope: input.scope as EvidenceScope,
        eventType: input.eventType,
        eventOutcome: input.eventOutcome,
        summary: input.summary,
        details: input.details ? JSON.parse(JSON.stringify(input.details)) : null,
        contentHash,
        previousHash,
        auditLogIds: input.auditLogIds || [],
        complianceCheckId: input.complianceCheckId || null,
        entityType: input.entityType || null,
        entityId: input.entityId || null,
        ipAddress: input.ipAddress || null,
        userAgent: input.userAgent || null,
        requestId: input.requestId || null,
        occurredAt,
      },
    });

    // Update chain pointer
    lastContentHash = contentHash;

    return record as EvidenceRecord;
  }

  /**
   * Query evidence records with filters
   */
  async query(params: EvidenceQueryParams): Promise<{
    records: EvidenceRecord[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 50, 100);

    const where: Record<string, unknown> = {};

    if (params.organizationId) where.organizationId = params.organizationId;
    if (params.tenantId) where.tenantId = params.tenantId;
    if (params.controlId) where.controlId = params.controlId;
    if (params.category) where.category = params.category;
    if (params.eventType) where.eventType = { startsWith: params.eventType };
    if (params.eventOutcome) where.eventOutcome = params.eventOutcome;
    if (params.actorId) where.actorId = params.actorId;

    if (params.startDate || params.endDate) {
      where.occurredAt = {};
      if (params.startDate) (where.occurredAt as Record<string, Date>).gte = params.startDate;
      if (params.endDate) (where.occurredAt as Record<string, Date>).lte = params.endDate;
    }

    const [records, total] = await Promise.all([
      prisma.evidenceRecord.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { occurredAt: 'desc' },
      }),
      prisma.evidenceRecord.count({ where }),
    ]);

    return {
      records: records as EvidenceRecord[],
      total,
      page,
      limit,
    };
  }

  /**
   * Query evidence by organization
   */
  async queryByOrganization(
    organizationId: string,
    params?: Omit<EvidenceQueryParams, 'organizationId'>
  ) {
    return this.query({ ...params, organizationId, page: params?.page || 1, limit: params?.limit || 50 });
  }

  /**
   * Query evidence by tenant
   */
  async queryByTenant(tenantId: string, params?: Omit<EvidenceQueryParams, 'tenantId'>) {
    return this.query({ ...params, tenantId, page: params?.page || 1, limit: params?.limit || 50 });
  }

  /**
   * Query evidence for a specific SOC2 control
   */
  async queryByControl(controlId: string, params?: Omit<EvidenceQueryParams, 'controlId'>) {
    return this.query({ ...params, controlId, page: params?.page || 1, limit: params?.limit || 50 });
  }

  /**
   * Verify integrity of a specific record
   */
  async verifyRecord(recordId: string): Promise<IntegrityVerificationResult> {
    const record = await prisma.evidenceRecord.findUnique({
      where: { id: recordId },
    });

    if (!record) {
      return {
        valid: false,
        recordId,
        expectedHash: '',
        actualHash: '',
        errors: ['Record not found'],
      };
    }

    const expectedHash = computeContentHash(record.details as Record<string, unknown>);
    const contentValid = expectedHash === record.contentHash;

    return {
      valid: contentValid,
      recordId,
      expectedHash,
      actualHash: record.contentHash,
      errors: contentValid ? [] : ['Content hash mismatch - possible tampering'],
    };
  }

  /**
   * Verify chain integrity for a time range
   */
  async verifyChain(
    startDate: Date,
    endDate: Date,
    organizationId?: string
  ): Promise<ChainVerificationResult> {
    const where: Record<string, unknown> = {
      occurredAt: { gte: startDate, lte: endDate },
    };
    if (organizationId) where.organizationId = organizationId;

    const records = await prisma.evidenceRecord.findMany({
      where,
      orderBy: { occurredAt: 'asc' },
      select: {
        id: true,
        contentHash: true,
        previousHash: true,
      },
    });

    const result = verifyChain(records);

    return {
      valid: result.valid,
      recordsChecked: records.length,
      brokenAt: result.brokenAt,
      errors: result.errors,
    };
  }

  /**
   * Generate audit report for a time period
   */
  async generateAuditReport(
    startDate: Date,
    endDate: Date,
    organizationId?: string
  ): Promise<EvidenceAuditReport> {
    const where: Record<string, unknown> = {
      occurredAt: { gte: startDate, lte: endDate },
    };
    if (organizationId) where.organizationId = organizationId;

    const [totalCount, byCategory, byControl, byOutcome, integrityCheck] = await Promise.all([
      prisma.evidenceRecord.count({ where }),
      prisma.evidenceRecord.groupBy({
        by: ['category'],
        where,
        _count: true,
      }),
      prisma.evidenceRecord.groupBy({
        by: ['controlId'],
        where,
        _count: true,
      }),
      prisma.evidenceRecord.groupBy({
        by: ['eventOutcome'],
        where,
        _count: true,
      }),
      this.verifyChain(startDate, endDate, organizationId),
    ]);

    return {
      period: { start: startDate, end: endDate },
      summary: { totalRecords: totalCount },
      byCategory: Object.fromEntries(byCategory.map((c) => [c.category, c._count])),
      byControl: Object.fromEntries(byControl.map((c) => [c.controlId, c._count])),
      byOutcome: Object.fromEntries(byOutcome.map((c) => [c.eventOutcome, c._count])),
      integrityStatus: { valid: integrityCheck.valid, errors: integrityCheck.errors },
    };
  }

  /**
   * Get control statistics for dashboard
   */
  async getControlStats(organizationId?: string): Promise<
    Array<{
      controlId: string;
      category: string;
      count: number;
      lastOccurredAt: Date | null;
    }>
  > {
    const where: Record<string, unknown> = {};
    if (organizationId) where.organizationId = organizationId;

    const stats = await prisma.evidenceRecord.groupBy({
      by: ['controlId', 'category'],
      where,
      _count: true,
      _max: { occurredAt: true },
    });

    return stats.map((s) => ({
      controlId: s.controlId,
      category: s.category,
      count: s._count,
      lastOccurredAt: s._max.occurredAt,
    }));
  }
}

// Singleton instance
let evidenceService: EvidenceService | null = null;

export function getEvidenceService(): EvidenceService {
  if (!evidenceService) {
    evidenceService = new EvidenceService();
  }
  return evidenceService;
}

// For testing - reset the service and chain state
export function resetEvidenceService(): void {
  evidenceService = null;
  lastContentHash = null;
}
