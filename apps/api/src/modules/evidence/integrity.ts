/**
 * Evidence Integrity Utilities
 *
 * Cryptographic utilities for evidence record integrity verification.
 */

import { createHash } from 'crypto';

/**
 * Compute SHA-256 content hash for evidence details
 * Uses canonical JSON serialization for deterministic hashing
 */
export function computeContentHash(details: Record<string, unknown> | null): string {
  const sortedKeys = Object.keys(details || {}).sort();
  const canonicalObj: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    canonicalObj[key] = (details || {})[key];
  }
  const canonicalJson = JSON.stringify(canonicalObj);
  return createHash('sha256').update(canonicalJson).digest('hex');
}

/**
 * Verify a record's content hash matches its details
 */
export function verifyContentHash(record: {
  details: Record<string, unknown> | null;
  contentHash: string;
}): boolean {
  const expectedHash = computeContentHash(record.details);
  return expectedHash === record.contentHash;
}

/**
 * Verify chain integrity for a sequence of evidence records
 * Checks that each record's previousHash matches the prior record's contentHash
 */
export function verifyChain(
  records: Array<{
    id: string;
    contentHash: string;
    previousHash: string | null;
  }>
): { valid: boolean; brokenAt?: string; errors: string[] } {
  const errors: string[] = [];

  for (let i = 0; i < records.length; i++) {
    const record = records[i];

    // First record should have null previousHash (genesis)
    if (i === 0) {
      if (record.previousHash !== null) {
        // Allow non-null for first record if chain started mid-stream
        continue;
      }
    } else {
      // Check chain link
      const expectedPreviousHash = records[i - 1].contentHash;
      if (record.previousHash !== expectedPreviousHash) {
        errors.push(
          `Chain broken at record ${record.id}: previousHash mismatch ` +
            `(expected ${expectedPreviousHash?.slice(0, 8)}..., got ${record.previousHash?.slice(0, 8)}...)`
        );
        return { valid: false, brokenAt: record.id, errors };
      }
    }
  }

  return { valid: true, errors };
}
