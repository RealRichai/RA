/**
 * PLY Retention Guard
 *
 * Enforces retention policy for PLY source files (canonical source of truth).
 * PLY files can only be deleted by SUPERADMIN with explicit override.
 *
 * SOC2 Control: CC6.1 - Logical and physical access controls
 */

import { logger } from '@realriches/utils';

import type { RetentionContext } from './types';

// Re-export for convenience
export type { RetentionContext } from './types';

// =============================================================================
// Types
// =============================================================================

export interface RetentionCheckResult {
  allowed: boolean;
  reason: string;
  code:
    | 'ALLOWED_SUPERADMIN_OVERRIDE'
    | 'BLOCKED_NO_OVERRIDE_ENV'
    | 'BLOCKED_INSUFFICIENT_ROLE'
    | 'BLOCKED_RETENTION_POLICY';
}

export interface RetentionGuardConfig {
  /** Environment variable name for override (default: PLY_DELETE_OVERRIDE) */
  overrideEnvVar?: string;
  /** Whether to emit evidence events (default: true) */
  emitEvidence?: boolean;
  /** Evidence emitter function (for DI) */
  evidenceEmitter?: (event: RetentionEvidenceEvent) => void;
}

export interface RetentionEvidenceEvent {
  controlId: string;
  category: 'Security';
  eventType: 'ply_delete_attempt';
  eventOutcome: 'blocked' | 'allowed';
  summary: string;
  scope: 'org';
  actorType: 'user' | 'system' | 'service';
  actorId?: string;
  actorEmail?: string;
  organizationId?: string;
  details: {
    key: string;
    role?: string;
    overrideEnabled: boolean;
    reason: string;
  };
  requestId?: string;
  ipAddress?: string;
}

// =============================================================================
// PLY Retention Guard
// =============================================================================

export class PlyRetentionGuard {
  private config: Required<RetentionGuardConfig>;

  constructor(config: RetentionGuardConfig = {}) {
    this.config = {
      overrideEnvVar: config.overrideEnvVar ?? 'PLY_DELETE_OVERRIDE',
      emitEvidence: config.emitEvidence ?? true,
      evidenceEmitter: config.evidenceEmitter ?? this.defaultEvidenceEmitter,
    };
  }

  /**
   * Check if a PLY delete operation is allowed.
   * Returns immediately without blocking.
   */
  checkDelete(key: string, context: RetentionContext = {}): RetentionCheckResult {
    const overrideEnabled = process.env[this.config.overrideEnvVar] === 'true';
    const isSuperAdmin = context.role === 'SUPERADMIN';

    // Case 1: SUPERADMIN + Override enabled = ALLOWED
    if (isSuperAdmin && overrideEnabled) {
      const result: RetentionCheckResult = {
        allowed: true,
        reason: `SUPERADMIN delete with ${this.config.overrideEnvVar}=true override`,
        code: 'ALLOWED_SUPERADMIN_OVERRIDE',
      };
      this.recordEvidence(key, context, result);
      return result;
    }

    // Case 2: SUPERADMIN but no override
    if (isSuperAdmin && !overrideEnabled) {
      const result: RetentionCheckResult = {
        allowed: false,
        reason: `PLY retention policy: delete blocked. Set ${this.config.overrideEnvVar}=true to override.`,
        code: 'BLOCKED_NO_OVERRIDE_ENV',
      };
      this.recordEvidence(key, context, result);
      return result;
    }

    // Case 3: Non-SUPERADMIN with override (still blocked)
    if (!isSuperAdmin && overrideEnabled) {
      const result: RetentionCheckResult = {
        allowed: false,
        reason: 'PLY retention policy: only SUPERADMIN can delete PLY files',
        code: 'BLOCKED_INSUFFICIENT_ROLE',
      };
      this.recordEvidence(key, context, result);
      return result;
    }

    // Case 4: No SUPERADMIN, no override (default blocked)
    const result: RetentionCheckResult = {
      allowed: false,
      reason: 'PLY retention policy: PLY source files are retained permanently',
      code: 'BLOCKED_RETENTION_POLICY',
    };
    this.recordEvidence(key, context, result);
    return result;
  }

  /**
   * Guard wrapper for delete operations.
   * Throws PlyRetentionError if delete is blocked.
   */
  guardDelete(key: string, context: RetentionContext = {}): void {
    const result = this.checkDelete(key, context);
    if (!result.allowed) {
      throw new PlyRetentionError(result.reason, result.code, key);
    }
  }

  /**
   * Record evidence event for delete attempts
   */
  private recordEvidence(key: string, context: RetentionContext, result: RetentionCheckResult): void {
    if (!this.config.emitEvidence) return;

    const event: RetentionEvidenceEvent = {
      controlId: 'CC6.1',
      category: 'Security',
      eventType: 'ply_delete_attempt',
      eventOutcome: result.allowed ? 'allowed' : 'blocked',
      summary: result.reason,
      scope: 'org',
      actorType: context.actorId ? 'user' : 'system',
      actorId: context.actorId,
      actorEmail: context.actorEmail,
      organizationId: context.organizationId,
      details: {
        key,
        role: context.role,
        overrideEnabled: process.env[this.config.overrideEnvVar] === 'true',
        reason: result.reason,
      },
      requestId: context.requestId,
      ipAddress: context.ipAddress,
    };

    try {
      this.config.evidenceEmitter(event);
    } catch (err) {
      logger.error({
        msg: 'retention_evidence_emit_failed',
        key,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  /**
   * Default evidence emitter (logs to structured log)
   * In production, this should be replaced with the actual EvidenceService
   */
  private defaultEvidenceEmitter(event: RetentionEvidenceEvent): void {
    logger.info({
      msg: 'ply_retention_evidence',
      ...event,
    });
  }
}

// =============================================================================
// Error Types
// =============================================================================

export class PlyRetentionError extends Error {
  readonly code: RetentionCheckResult['code'];
  readonly key: string;

  constructor(message: string, code: RetentionCheckResult['code'], key: string) {
    super(message);
    this.name = 'PlyRetentionError';
    this.code = code;
    this.key = key;
    Object.setPrototypeOf(this, PlyRetentionError.prototype);
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

let defaultGuard: PlyRetentionGuard | null = null;

/**
 * Get the default PLY retention guard singleton
 */
export function getPlyRetentionGuard(): PlyRetentionGuard {
  if (!defaultGuard) {
    defaultGuard = new PlyRetentionGuard();
  }
  return defaultGuard;
}

/**
 * Create a PLY retention guard with custom config
 */
export function createPlyRetentionGuard(config: RetentionGuardConfig): PlyRetentionGuard {
  return new PlyRetentionGuard(config);
}

/**
 * Reset the default guard (for testing)
 */
export function resetPlyRetentionGuard(): void {
  defaultGuard = null;
}

// =============================================================================
// Utility: Check if key is a PLY file
// =============================================================================

/**
 * Check if a storage key represents a PLY file
 */
export function isPlyKey(key: string): boolean {
  return key.toLowerCase().endsWith('.ply');
}
