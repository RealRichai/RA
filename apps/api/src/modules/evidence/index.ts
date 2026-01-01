/**
 * Evidence Module
 *
 * SOC2-ready evidence system for audit and compliance tracking.
 */

// Core service
export { EvidenceService, getEvidenceService, resetEvidenceService } from './service';

// Types
export type {
  SOC2Category,
  EvidenceScope,
  EvidenceEventOutcome,
  ActorType,
  EvidenceEmitInput,
  EvidenceRecord,
  EvidenceQueryParams,
  IntegrityVerificationResult,
  ChainVerificationResult,
  EvidenceAuditReport,
  SOC2ControlMapping,
} from './types';

export {
  SOC2CategorySchema,
  EvidenceScopeSchema,
  EvidenceEventOutcomeSchema,
  ActorTypeSchema,
  EvidenceEmitInputSchema,
  EvidenceQueryParamsSchema,
} from './types';

// Integrity utilities
export { computeContentHash, verifyContentHash, verifyChain } from './integrity';

// Control mappings
export {
  SOC2_CONTROLS,
  EVENT_CONTROL_MAPPINGS,
  getControlMapping,
  getControlDetails,
  getControlsByCategory,
  getEventTypesForControl,
} from './control-mappings';

// Emitters
export {
  emitAuthEvidence,
  emitAdminEvidence,
  emitComplianceEvidence,
  emitDataExportEvidence,
  emitApiKeyEvidence,
} from './emitters';

export type {
  SecurityEventType,
  AuthEventContext,
  AdminEventType,
  AdminEventContext,
  ComplianceEventInput,
  EnforcementContext,
  GateResult,
  ComplianceDecision,
  DataExportEventType,
  DataExportContext,
  ApiKeyEventType,
  ApiKeyEventContext,
} from './emitters';

// Routes
export { evidenceRoutes } from './routes';
