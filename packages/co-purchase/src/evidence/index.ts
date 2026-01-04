/**
 * Evidence module
 *
 * SOC2-compliant evidence emission for co-purchase group activities.
 */

export {
  type GroupEventType,
  type SOC2Category,
  type EvidenceOutcome,
  type GroupEvidenceInput,
  type GroupEvidenceRecord,
  type EvidenceEmitterDeps,
  configureEvidenceEmitter,
  emitGroupEvidence,
  emitBlockedActionEvidence,
} from './group-evidence';
