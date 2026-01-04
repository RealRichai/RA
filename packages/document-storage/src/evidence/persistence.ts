/**
 * Vault Evidence Persistence
 *
 * Persists SOC2-compliant evidence logs to the database.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VaultEvidence = any;

import type {
  VaultEvidenceRecord,
  StoredVaultEvidence,
  EvidenceQueryOptions,
} from './types';
import { sanitizeMetadata } from './types';

export class VaultEvidencePersistence {
  constructor(private prisma: PrismaClient) {}

  /**
   * Persist a vault evidence record
   */
  async persist(record: VaultEvidenceRecord): Promise<StoredVaultEvidence> {
    // Sanitize metadata to remove PII
    const sanitizedMetadata = record.metadata
      ? sanitizeMetadata(record.metadata)
      : {};

    const evidence = await this.prisma.vaultEvidence.create({
      data: {
        eventType: record.eventType,
        eventOutcome: record.eventOutcome,
        controlId: record.controlId,
        propertyId: record.propertyId,
        vaultId: record.vaultId,
        documentId: record.documentId,
        actorUserId: record.actorUserId,
        actorRole: record.actorRole,
        actorEmail: record.actorEmail,
        resourcePath: record.resourcePath,
        ipAddress: record.ipAddress,
        userAgent: record.userAgent,
        requestId: record.requestId,
        metadata: sanitizedMetadata,
      },
    });

    return this.mapToStoredEvidence(evidence);
  }

  /**
   * Query evidence records with filters
   */
  async query(options: EvidenceQueryOptions): Promise<StoredVaultEvidence[]> {
    const {
      propertyId,
      vaultId,
      actorUserId,
      eventType,
      controlId,
      startDate,
      endDate,
      limit = 100,
      offset = 0,
    } = options;

    const where: Record<string, unknown> = {};

    if (propertyId) where.propertyId = propertyId;
    if (vaultId) where.vaultId = vaultId;
    if (actorUserId) where.actorUserId = actorUserId;
    if (eventType) where.eventType = eventType;
    if (controlId) where.controlId = controlId;

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) (where.timestamp as Record<string, Date>).gte = startDate;
      if (endDate) (where.timestamp as Record<string, Date>).lte = endDate;
    }

    const records = await this.prisma.vaultEvidence.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    });

    return records.map((r: VaultEvidence) => this.mapToStoredEvidence(r));
  }

  /**
   * Get evidence by property ID
   */
  async queryByProperty(
    propertyId: string,
    options?: Omit<EvidenceQueryOptions, 'propertyId'>
  ): Promise<StoredVaultEvidence[]> {
    return this.query({ ...options, propertyId });
  }

  /**
   * Get evidence by user ID
   */
  async queryByUser(
    actorUserId: string,
    options?: Omit<EvidenceQueryOptions, 'actorUserId'>
  ): Promise<StoredVaultEvidence[]> {
    return this.query({ ...options, actorUserId });
  }

  /**
   * Get evidence by control ID (for SOC2 audits)
   */
  async queryByControlId(
    controlId: string,
    options?: Omit<EvidenceQueryOptions, 'controlId'>
  ): Promise<StoredVaultEvidence[]> {
    return this.query({
      ...options,
      controlId: controlId as EvidenceQueryOptions['controlId'],
    });
  }

  /**
   * Count evidence records matching filters
   */
  async count(options: EvidenceQueryOptions): Promise<number> {
    const {
      propertyId,
      vaultId,
      actorUserId,
      eventType,
      controlId,
      startDate,
      endDate,
    } = options;

    const where: Record<string, unknown> = {};

    if (propertyId) where.propertyId = propertyId;
    if (vaultId) where.vaultId = vaultId;
    if (actorUserId) where.actorUserId = actorUserId;
    if (eventType) where.eventType = eventType;
    if (controlId) where.controlId = controlId;

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) (where.timestamp as Record<string, Date>).gte = startDate;
      if (endDate) (where.timestamp as Record<string, Date>).lte = endDate;
    }

    return this.prisma.vaultEvidence.count({ where });
  }

  /**
   * Map database record to StoredVaultEvidence
   */
  private mapToStoredEvidence(record: VaultEvidence): StoredVaultEvidence {
    return {
      id: record.id,
      eventType: record.eventType as StoredVaultEvidence['eventType'],
      eventOutcome: record.eventOutcome as StoredVaultEvidence['eventOutcome'],
      controlId: record.controlId as StoredVaultEvidence['controlId'],
      propertyId: record.propertyId,
      vaultId: record.vaultId ?? undefined,
      documentId: record.documentId ?? undefined,
      actorUserId: record.actorUserId,
      actorRole: record.actorRole,
      actorEmail: record.actorEmail,
      resourcePath: record.resourcePath,
      ipAddress: record.ipAddress ?? undefined,
      userAgent: record.userAgent ?? undefined,
      requestId: record.requestId ?? undefined,
      metadata: record.metadata as Record<string, unknown> | undefined,
      timestamp: record.timestamp,
    };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Persist a vault evidence record (convenience function)
 */
export async function persistVaultEvidence(
  prisma: PrismaClient,
  record: VaultEvidenceRecord
): Promise<StoredVaultEvidence> {
  const persistence = new VaultEvidencePersistence(prisma);
  return persistence.persist(record);
}

/**
 * Query vault evidence (convenience function)
 */
export async function queryVaultEvidence(
  prisma: PrismaClient,
  options: EvidenceQueryOptions
): Promise<StoredVaultEvidence[]> {
  const persistence = new VaultEvidencePersistence(prisma);
  return persistence.query(options);
}

// =============================================================================
// Singleton Instance
// =============================================================================

let persistenceInstance: VaultEvidencePersistence | null = null;

export function getVaultEvidencePersistence(
  prisma: PrismaClient
): VaultEvidencePersistence {
  if (!persistenceInstance) {
    persistenceInstance = new VaultEvidencePersistence(prisma);
  }
  return persistenceInstance;
}
