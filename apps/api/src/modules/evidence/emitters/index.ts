/**
 * Evidence Emitters Index
 *
 * Re-exports all evidence emitters for convenient importing.
 */

export { emitAuthEvidence, type SecurityEventType, type AuthEventContext } from './auth';

export { emitAdminEvidence, type AdminEventType, type AdminEventContext } from './admin';

export {
  emitComplianceEvidence,
  type ComplianceEventInput,
  type EnforcementContext,
  type GateResult,
  type ComplianceDecision,
} from './compliance';

export {
  emitDataExportEvidence,
  type DataExportEventType,
  type DataExportContext,
} from './data-export';

export { emitApiKeyEvidence, type ApiKeyEventType, type ApiKeyEventContext } from './api-keys';
