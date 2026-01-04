/**
 * Co-Purchase Group Workspace
 *
 * NON-CUSTODIAL collaboration platform for co-purchase groups.
 *
 * This package provides:
 * - Group organization and member management
 * - Identity verification coordination
 * - Document collection and sharing
 * - Progress tracking via checklists
 *
 * This package does NOT provide:
 * - Escrow services or funds holding
 * - Payment processing or collection
 * - Investment offerings or securities
 * - Property purchase or sale execution
 *
 * All custodial actions are blocked by guardrails.
 */

// Types (core domain types)
export {
  // Enums
  GroupRoleSchema,
  type GroupRole,
  GroupStatusSchema,
  type GroupStatus,
  InvitationStatusSchema,
  type InvitationStatus,
  VerificationStatusSchema,
  type VerificationStatus,
  ChecklistItemStatusSchema,
  type ChecklistItemStatus,
  VerificationLevelSchema,
  type VerificationLevel,
  // Group types
  CreateGroupSchema,
  type CreateGroupInput,
  type CoPurchaseGroup,
  UpdateGroupSchema,
  type UpdateGroupInput,
  // Member types
  type CoPurchaseGroupMember,
  AcceptDisclaimerSchema,
  type AcceptDisclaimerInput,
  UpdateMemberRoleSchema,
  type UpdateMemberRoleInput,
  // Invitation types
  CreateInvitationSchema,
  type CreateInvitationInput,
  type CoPurchaseGroupInvitation,
  RespondToInvitationSchema,
  type RespondToInvitationInput,
  // Checklist types
  CreateChecklistItemSchema,
  type CreateChecklistItemInput,
  type CoPurchaseChecklistItem,
  UpdateChecklistItemSchema,
  type UpdateChecklistItemInput,
  // Document types
  UploadGroupDocumentSchema,
  type UploadGroupDocumentInput,
  type CoPurchaseGroupDocument,
  // Verification input types
  InitiateVerificationSchema,
  type InitiateVerificationInput,
  // Error types
  CoPurchaseError,
  GroupNotFoundError,
  MemberNotFoundError,
  InvitationNotFoundError,
  InvitationExpiredError,
  UnauthorizedError,
  DisclaimerNotAcceptedError,
} from './types';

// Guardrails (Critical - enforces non-custodial constraints)
export * from './guardrails';

// Verification (provider interface and implementations)
export {
  type VerificationProviderType,
  type VerificationRequest,
  type VerificationResult,
  type VerificationResponse,
  type IVerificationProvider,
  type BaseVerificationProviderConfig,
  type Result,
  success,
  failure,
  BaseVerificationProvider,
  VerificationProviderError,
  VerificationTimeoutError,
  VerificationRateLimitError,
  MockVerificationProvider,
  type MockVerificationProviderConfig,
} from './verification';

// Evidence
export * from './evidence';

// Services (to be implemented)
// export * from './services';
