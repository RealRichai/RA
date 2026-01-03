/**
 * Shadow Write Module
 *
 * Implements dual-write pattern with fault injection for chaos engineering.
 * Provides:
 * - ShadowWriteService for dual-write operations
 * - Discrepancy verifier for consistency checking
 * - Metrics for observability
 * - Evidence recording for audit trail
 */

export { getShadowWriteService, resetShadowWriteService } from './service.js';
export type { ShadowWriteContext, ShadowWriteResult } from './service.js';

export {
  DiscrepancyVerifier,
  discrepancyVerifierJobHandler,
} from './discrepancy-verifier.js';
export type { VerifierConfig, VerificationResult, Discrepancy } from './discrepancy-verifier.js';

export {
  emitShadowWriteEvidence,
  emitShadowWriteEvidenceSync,
  emitDiscrepancyBatchEvidence,
} from './evidence.js';

export {
  shadowWriteFailuresTotal,
  shadowWriteSuccessesTotal,
  shadowWriteDuration,
  shadowDiscrepanciesTotal,
  chaosInjectedFaultsTotal,
  recordShadowWriteSuccess,
  recordShadowWriteFailure,
  recordShadowWriteDuration,
  recordDiscrepancy,
  updateLastDiscrepancyCheck,
} from './metrics.js';
