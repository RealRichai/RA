/**
 * Shadow Write Discrepancy Verifier
 *
 * Scheduled job that compares primary and shadow stores to detect discrepancies.
 * Bounded execution with pagination and time limits for safety.
 */

import crypto from 'crypto';

import type { Listing } from '@prisma/client';
import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';

import { emitDiscrepancyBatchEvidence, type DiscrepancyBatch } from './evidence.js';
import { recordDiscrepancy, updateLastDiscrepancyCheck } from './metrics.js';
import { getShadowWriteService } from './service.js';

// =============================================================================
// Configuration
// =============================================================================

export interface VerifierConfig {
  /** Maximum entities to check per run */
  maxEntities: number;
  /** Maximum time for job execution (ms) */
  maxDurationMs: number;
  /** Page size for batching */
  pageSize: number;
  /** Fields to compare for data mismatch detection */
  comparisonFields: (keyof Listing)[];
}

const DEFAULT_CONFIG: VerifierConfig = {
  maxEntities: 1000,
  maxDurationMs: 60000, // 1 minute max
  pageSize: 100,
  comparisonFields: [
    'title',
    'description',
    'price',
    'status',
    'propertyId',
    'updatedAt',
  ],
};

// =============================================================================
// Discrepancy Types
// =============================================================================

export interface Discrepancy {
  entityId: string;
  type: 'missing_in_shadow' | 'missing_in_primary' | 'data_mismatch';
  details?: {
    primaryExists: boolean;
    shadowExists: boolean;
    fieldsChecked?: string[];
    mismatchedFields?: string[];
  };
}

export interface VerificationResult {
  runId: string;
  startTime: Date;
  endTime: Date;
  entitiesChecked: number;
  discrepanciesFound: number;
  discrepancies: Discrepancy[];
  timedOut: boolean;
  error?: string;
}

// =============================================================================
// Verifier Implementation
// =============================================================================

export class DiscrepancyVerifier {
  private readonly entityType = 'Listing';
  private readonly config: VerifierConfig;

  constructor(config: Partial<VerifierConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run discrepancy verification
   *
   * Compares primary (PostgreSQL) and shadow (in-memory) stores.
   * Bounded by maxEntities and maxDurationMs for safety.
   */
  async verify(): Promise<VerificationResult> {
    const runId = this.generateRunId();
    const startTime = new Date();
    const deadline = startTime.getTime() + this.config.maxDurationMs;

    const discrepancies: Discrepancy[] = [];
    let entitiesChecked = 0;
    let timedOut = false;
    let error: string | undefined;

    logger.info(
      { runId, config: this.config },
      'Starting shadow write discrepancy verification'
    );

    try {
      const shadowStore = getShadowWriteService().getShadowStore();

      // Get all shadow store IDs for comparison
      const shadowIds = new Set(await shadowStore.getAllIds());

      // Paginate through primary store
      let offset = 0;
      const processedPrimaryIds = new Set<string>();

      while (
        entitiesChecked < this.config.maxEntities &&
        !timedOut
      ) {
        // Check time limit
        if (Date.now() > deadline) {
          timedOut = true;
          break;
        }

        // Fetch batch from primary
        const primaryBatch = await prisma.listing.findMany({
          take: this.config.pageSize,
          skip: offset,
          orderBy: { createdAt: 'asc' },
          select: this.buildSelectFields(),
        });

        if (primaryBatch.length === 0) {
          break; // No more entities
        }

        // Check each entity
        for (const primary of primaryBatch) {
          if (entitiesChecked >= this.config.maxEntities) break;
          if (Date.now() > deadline) {
            timedOut = true;
            break;
          }

          processedPrimaryIds.add(primary.id);
          entitiesChecked++;

          const shadow = await shadowStore.findById(primary.id);

          if (!shadow) {
            // Missing in shadow
            discrepancies.push({
              entityId: primary.id,
              type: 'missing_in_shadow',
              details: {
                primaryExists: true,
                shadowExists: false,
              },
            });
            recordDiscrepancy(this.entityType, 'missing_in_shadow');
          } else {
            // Check for data mismatch
            const mismatched = this.findMismatchedFields(
              primary as Listing,
              shadow
            );
            if (mismatched.length > 0) {
              discrepancies.push({
                entityId: primary.id,
                type: 'data_mismatch',
                details: {
                  primaryExists: true,
                  shadowExists: true,
                  fieldsChecked: this.config.comparisonFields as string[],
                  mismatchedFields: mismatched,
                },
              });
              recordDiscrepancy(this.entityType, 'data_mismatch');
            }
          }
        }

        offset += this.config.pageSize;
      }

      // Check for entities in shadow but not in primary
      // (only check what we haven't processed yet)
      for (const shadowId of shadowIds) {
        if (entitiesChecked >= this.config.maxEntities) break;
        if (Date.now() > deadline) {
          timedOut = true;
          break;
        }

        if (!processedPrimaryIds.has(shadowId)) {
          // Need to check if it exists in primary
          const primaryExists = await prisma.listing.findUnique({
            where: { id: shadowId },
            select: { id: true },
          });

          if (!primaryExists) {
            discrepancies.push({
              entityId: shadowId,
              type: 'missing_in_primary',
              details: {
                primaryExists: false,
                shadowExists: true,
              },
            });
            recordDiscrepancy(this.entityType, 'missing_in_primary');
          }

          entitiesChecked++;
        }
      }

      // Emit evidence for all discrepancies
      if (discrepancies.length > 0) {
        await emitDiscrepancyBatchEvidence({
          entityType: this.entityType,
          verificationRunId: runId,
          discrepancies: discrepancies.map((d) => ({
            entityId: d.entityId,
            discrepancyType: d.type,
            details: d.details,
          })),
        });
      }

      // Update last check timestamp
      updateLastDiscrepancyCheck(this.entityType);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      logger.error({ err, runId }, 'Discrepancy verification failed');
    }

    const endTime = new Date();
    const result: VerificationResult = {
      runId,
      startTime,
      endTime,
      entitiesChecked,
      discrepanciesFound: discrepancies.length,
      discrepancies,
      timedOut,
      error,
    };

    logger.info(
      {
        runId,
        entitiesChecked,
        discrepanciesFound: discrepancies.length,
        durationMs: endTime.getTime() - startTime.getTime(),
        timedOut,
      },
      'Discrepancy verification completed'
    );

    return result;
  }

  /**
   * Build select fields for Prisma query
   */
  private buildSelectFields(): Record<string, boolean> {
    const select: Record<string, boolean> = { id: true };
    for (const field of this.config.comparisonFields) {
      select[field as string] = true;
    }
    return select;
  }

  /**
   * Find fields that don't match between primary and shadow
   */
  private findMismatchedFields(primary: Listing, shadow: Listing): string[] {
    const mismatched: string[] = [];

    for (const field of this.config.comparisonFields) {
      const primaryValue = primary[field];
      const shadowValue = shadow[field];

      // Handle Date comparison
      if (primaryValue instanceof Date && shadowValue instanceof Date) {
        if (primaryValue.getTime() !== shadowValue.getTime()) {
          mismatched.push(field as string);
        }
      } else if (primaryValue !== shadowValue) {
        mismatched.push(field as string);
      }
    }

    return mismatched;
  }

  /**
   * Generate unique run ID
   */
  private generateRunId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `verify_${timestamp}_${random}`;
  }
}

// =============================================================================
// Job Handler
// =============================================================================

/**
 * Job handler for scheduled discrepancy verification
 */
export async function discrepancyVerifierJobHandler(): Promise<VerificationResult> {
  const verifier = new DiscrepancyVerifier();
  return verifier.verify();
}
