/**
 * Co-Purchase Group Types
 *
 * Core types and Zod schemas for the Co-Purchase Group Workspace.
 * This is a NON-CUSTODIAL collaboration platform.
 */

import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

export const GroupRoleSchema = z.enum(['organizer', 'member', 'viewer']);
export type GroupRole = z.infer<typeof GroupRoleSchema>;

export const GroupStatusSchema = z.enum([
  'forming',
  'verification',
  'document_collection',
  'ready',
  'archived',
]);
export type GroupStatus = z.infer<typeof GroupStatusSchema>;

export const InvitationStatusSchema = z.enum([
  'pending',
  'accepted',
  'declined',
  'expired',
  'revoked',
]);
export type InvitationStatus = z.infer<typeof InvitationStatusSchema>;

export const VerificationStatusSchema = z.enum([
  'not_started',
  'pending',
  'in_progress',
  'verified',
  'failed',
  'expired',
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const ChecklistItemStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'blocked',
]);
export type ChecklistItemStatus = z.infer<typeof ChecklistItemStatusSchema>;

// ============================================================================
// Group Types
// ============================================================================

export const CreateGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  targetPropertyType: z.string().optional(),
  targetMarket: z.string().optional(),
  estimatedBudgetMin: z.number().int().positive().optional(),
  estimatedBudgetMax: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateGroupInput = z.infer<typeof CreateGroupSchema>;

export interface CoPurchaseGroup {
  id: string;
  name: string;
  description?: string;
  status: GroupStatus;
  organizerId: string;
  targetPropertyType?: string;
  targetMarket?: string;
  estimatedBudgetMin?: number;
  estimatedBudgetMax?: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date;
}

export const UpdateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  status: GroupStatusSchema.optional(),
  targetPropertyType: z.string().optional(),
  targetMarket: z.string().optional(),
  estimatedBudgetMin: z.number().int().positive().optional(),
  estimatedBudgetMax: z.number().int().positive().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateGroupInput = z.infer<typeof UpdateGroupSchema>;

// ============================================================================
// Member Types
// ============================================================================

export interface CoPurchaseGroupMember {
  id: string;
  groupId: string;
  userId: string;
  role: GroupRole;
  verificationStatus: VerificationStatus;
  verificationId?: string;
  verificationHash?: string;
  verifiedAt?: Date;
  verificationExpiry?: Date;
  disclaimerAccepted: boolean;
  disclaimerAcceptedAt?: Date;
  joinedAt: Date;
  leftAt?: Date;
  metadata?: Record<string, unknown>;
}

export const AcceptDisclaimerSchema = z.object({
  accepted: z.literal(true),
});

export type AcceptDisclaimerInput = z.infer<typeof AcceptDisclaimerSchema>;

export const UpdateMemberRoleSchema = z.object({
  role: GroupRoleSchema,
});

export type UpdateMemberRoleInput = z.infer<typeof UpdateMemberRoleSchema>;

// ============================================================================
// Invitation Types
// ============================================================================

export const CreateInvitationSchema = z.object({
  email: z.string().email(),
  role: GroupRoleSchema.optional().default('member'),
  message: z.string().max(500).optional(),
});

export type CreateInvitationInput = z.infer<typeof CreateInvitationSchema>;

export interface CoPurchaseGroupInvitation {
  id: string;
  groupId: string;
  invitedEmail: string;
  invitedByUserId: string;
  role: GroupRole;
  status: InvitationStatus;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  respondedAt?: Date;
}

export const RespondToInvitationSchema = z.object({
  accept: z.boolean(),
});

export type RespondToInvitationInput = z.infer<typeof RespondToInvitationSchema>;

// ============================================================================
// Checklist Types
// ============================================================================

export const CreateChecklistItemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  category: z.string().max(50).optional().default('general'),
  assignedMemberId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
  sortOrder: z.number().int().optional(),
});

export type CreateChecklistItemInput = z.infer<typeof CreateChecklistItemSchema>;

export interface CoPurchaseChecklistItem {
  id: string;
  groupId: string;
  title: string;
  description?: string;
  category: string;
  status: ChecklistItemStatus;
  assignedMemberId?: string;
  sortOrder: number;
  completedAt?: Date;
  completedByUserId?: string;
  dueDate?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export const UpdateChecklistItemSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  category: z.string().max(50).optional(),
  status: ChecklistItemStatusSchema.optional(),
  assignedMemberId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export type UpdateChecklistItemInput = z.infer<typeof UpdateChecklistItemSchema>;

// ============================================================================
// Document Types
// ============================================================================

export const UploadGroupDocumentSchema = z.object({
  category: z.string().max(50).optional().default('general'),
  description: z.string().max(500).optional(),
  visibleToAll: z.boolean().optional().default(true),
});

export type UploadGroupDocumentInput = z.infer<typeof UploadGroupDocumentSchema>;

export interface CoPurchaseGroupDocument {
  id: string;
  groupId: string;
  uploadedByMemberId: string;
  documentId: string;
  documentKey: string;
  category: string;
  description?: string;
  visibleToAll: boolean;
  createdAt: Date;
}

// ============================================================================
// Verification Types
// ============================================================================

export const VerificationLevelSchema = z.enum(['basic', 'standard', 'enhanced']);
export type VerificationLevel = z.infer<typeof VerificationLevelSchema>;

export const InitiateVerificationSchema = z.object({
  level: VerificationLevelSchema.optional().default('standard'),
  callbackUrl: z.string().url().optional(),
});

export type InitiateVerificationInput = z.infer<typeof InitiateVerificationSchema>;

// Note: VerificationResult is defined in ./verification/provider-interface.ts
// Use that one for consistency with the verification adapter pattern.

// ============================================================================
// Error Types
// ============================================================================

export class CoPurchaseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CoPurchaseError';
  }
}

export class GroupNotFoundError extends CoPurchaseError {
  constructor(groupId: string) {
    super(`Group not found: ${groupId}`, 'GROUP_NOT_FOUND', { groupId });
    this.name = 'GroupNotFoundError';
  }
}

export class MemberNotFoundError extends CoPurchaseError {
  constructor(memberId: string) {
    super(`Member not found: ${memberId}`, 'MEMBER_NOT_FOUND', { memberId });
    this.name = 'MemberNotFoundError';
  }
}

export class InvitationNotFoundError extends CoPurchaseError {
  constructor(invitationId: string) {
    super(`Invitation not found: ${invitationId}`, 'INVITATION_NOT_FOUND', { invitationId });
    this.name = 'InvitationNotFoundError';
  }
}

export class InvitationExpiredError extends CoPurchaseError {
  constructor(invitationId: string) {
    super(`Invitation has expired: ${invitationId}`, 'INVITATION_EXPIRED', { invitationId });
    this.name = 'InvitationExpiredError';
  }
}

export class UnauthorizedError extends CoPurchaseError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'UNAUTHORIZED', details);
    this.name = 'UnauthorizedError';
  }
}

export class DisclaimerNotAcceptedError extends CoPurchaseError {
  constructor(userId: string, groupId: string) {
    super(
      'User must accept the non-custodial disclaimer before proceeding',
      'DISCLAIMER_NOT_ACCEPTED',
      { userId, groupId }
    );
    this.name = 'DisclaimerNotAcceptedError';
  }
}
