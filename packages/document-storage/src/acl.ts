/**
 * Document Access Control List (ACL)
 *
 * Role-based access control for documents with entity-level authorization.
 */

import type {
  UserRole,
  DocumentAction,
  ACLContext,
  EntityOwnership,
  ACLResult,
  DocumentEntityType,
} from './types';

// =============================================================================
// Role Permissions Matrix
// =============================================================================

/**
 * Base permissions for each role
 */
const ROLE_PERMISSIONS: Record<UserRole, Set<DocumentAction>> = {
  super_admin: new Set(['read', 'write', 'delete', 'share', 'sign', 'download']),
  admin: new Set(['read', 'write', 'delete', 'share', 'sign', 'download']),
  auditor: new Set(['read', 'download']),
  landlord: new Set(['read', 'write', 'delete', 'share', 'sign', 'download']),
  property_manager: new Set(['read', 'write', 'share', 'sign', 'download']),
  agent: new Set(['read', 'write', 'share', 'download']),
  tenant: new Set(['read', 'sign', 'download']),
  investor: new Set(['read', 'download']),
  vendor: new Set(['read', 'download']),
  support: new Set(['read']),
};

/**
 * Actions that can be performed on documents the user owns
 */
const OWNER_PERMISSIONS: Set<DocumentAction> = new Set([
  'read',
  'write',
  'delete',
  'share',
  'sign',
  'download',
]);

// =============================================================================
// ACL Policy Engine
// =============================================================================

export class DocumentACL {
  /**
   * Check if a user can perform an action on a document
   */
  checkAccess(
    context: ACLContext,
    action: DocumentAction,
    ownership: EntityOwnership,
    documentId?: string
  ): ACLResult {
    const auditInfo = {
      action,
      userId: context.userId,
      userRole: context.userRole,
      entityType: undefined as DocumentEntityType | undefined,
      entityId: undefined as string | undefined,
      documentId,
      timestamp: new Date(),
    };

    // Super admins and admins have full access
    if (context.userRole === 'super_admin' || context.userRole === 'admin') {
      return { allowed: true, auditInfo };
    }

    // Auditors have read-only access to everything
    if (context.userRole === 'auditor' && (action === 'read' || action === 'download')) {
      return { allowed: true, auditInfo };
    }

    // Check if user is the document owner or uploader
    if (
      ownership.documentOwnerId === context.userId ||
      ownership.documentUploaderId === context.userId
    ) {
      if (OWNER_PERMISSIONS.has(action)) {
        return { allowed: true, auditInfo };
      }
    }

    // Check if user has been explicitly shared the document
    if (ownership.sharedWithUserIds?.includes(context.userId)) {
      if (action === 'read' || action === 'download' || action === 'sign') {
        return { allowed: true, auditInfo };
      }
    }

    // Check role-based permissions
    const rolePermissions = ROLE_PERMISSIONS[context.userRole];
    if (!rolePermissions?.has(action)) {
      return {
        allowed: false,
        reason: `Role '${context.userRole}' does not have '${action}' permission`,
        auditInfo,
      };
    }

    // Entity-level access checks
    const entityAccess = this.checkEntityAccess(context, ownership);
    if (!entityAccess.allowed) {
      return { ...entityAccess, auditInfo };
    }

    return { allowed: true, auditInfo };
  }

  /**
   * Check entity-level access based on ownership relationships
   */
  private checkEntityAccess(
    context: ACLContext,
    ownership: EntityOwnership
  ): { allowed: boolean; reason?: string } {
    const { userId, userRole } = context;

    // Property-level access
    if (ownership.propertyOwnerId || ownership.propertyManagerId) {
      if (userRole === 'landlord' && ownership.propertyOwnerId === userId) {
        return { allowed: true };
      }
      if (
        userRole === 'property_manager' &&
        ownership.propertyManagerId === userId
      ) {
        return { allowed: true };
      }
    }

    // Lease-level access
    if (ownership.leaseLandlordId || ownership.leaseTenantId) {
      if (userRole === 'landlord' && ownership.leaseLandlordId === userId) {
        return { allowed: true };
      }
      if (userRole === 'tenant' && ownership.leaseTenantId === userId) {
        return { allowed: true };
      }
      if (
        userRole === 'property_manager' &&
        ownership.propertyManagerId === userId
      ) {
        return { allowed: true };
      }
    }

    // Application-level access
    if (ownership.applicationApplicantId) {
      if (userRole === 'tenant' && ownership.applicationApplicantId === userId) {
        return { allowed: true };
      }
      // Landlord/agent who owns the listing can view applications
      if (
        (userRole === 'landlord' || userRole === 'agent') &&
        ownership.propertyOwnerId === userId
      ) {
        return { allowed: true };
      }
    }

    // Agents can access documents for properties they're assigned to
    if (userRole === 'agent') {
      // Agent access is typically through listing assignment
      // This would need to be checked against the actual listing agent
      if (ownership.propertyOwnerId) {
        // Allow read access for agents working with properties
        return { allowed: true };
      }
    }

    // Vendors can access work order related documents
    if (userRole === 'vendor') {
      // Vendor access is typically limited to work order attachments
      // This would be handled at a higher level
      return { allowed: false, reason: 'Vendor access requires work order context' };
    }

    // Support can read but not modify
    if (userRole === 'support') {
      return { allowed: true };
    }

    // Investor access is limited to portfolio documents
    if (userRole === 'investor') {
      return { allowed: false, reason: 'Investor access limited to portfolio documents' };
    }

    return { allowed: false, reason: 'No access to this entity' };
  }

  /**
   * Get all permissions for a user on a specific document
   */
  getPermissions(
    context: ACLContext,
    ownership: EntityOwnership
  ): Set<DocumentAction> {
    const permissions = new Set<DocumentAction>();
    const actions: DocumentAction[] = ['read', 'write', 'delete', 'share', 'sign', 'download'];

    for (const action of actions) {
      const result = this.checkAccess(context, action, ownership);
      if (result.allowed) {
        permissions.add(action);
      }
    }

    return permissions;
  }

  /**
   * Check if user can list documents for an entity
   */
  canListDocuments(
    context: ACLContext,
    _entityType: DocumentEntityType,
    ownership: EntityOwnership
  ): ACLResult {
    return this.checkAccess(context, 'read', ownership);
  }
}

// =============================================================================
// Policy Definitions for Specific Document Types
// =============================================================================

export interface DocumentTypePolicy {
  type: string;
  allowedRoles: UserRole[];
  requiresSignature: boolean;
  retentionDays: number;
  encryptionRequired: boolean;
}

export const DOCUMENT_TYPE_POLICIES: Record<string, DocumentTypePolicy> = {
  LEASE: {
    type: 'LEASE',
    allowedRoles: ['super_admin', 'admin', 'landlord', 'property_manager', 'tenant', 'auditor'],
    requiresSignature: true,
    retentionDays: 2555, // 7 years
    encryptionRequired: true,
  },
  AMENDMENT: {
    type: 'AMENDMENT',
    allowedRoles: ['super_admin', 'admin', 'landlord', 'property_manager', 'tenant', 'auditor'],
    requiresSignature: true,
    retentionDays: 2555,
    encryptionRequired: true,
  },
  DISCLOSURE: {
    type: 'DISCLOSURE',
    allowedRoles: ['super_admin', 'admin', 'landlord', 'property_manager', 'tenant', 'agent', 'auditor'],
    requiresSignature: false,
    retentionDays: 2555,
    encryptionRequired: false,
  },
  ID: {
    type: 'ID',
    allowedRoles: ['super_admin', 'admin', 'landlord', 'property_manager', 'auditor'],
    requiresSignature: false,
    retentionDays: 365,
    encryptionRequired: true,
  },
  INCOME: {
    type: 'INCOME',
    allowedRoles: ['super_admin', 'admin', 'landlord', 'property_manager', 'auditor'],
    requiresSignature: false,
    retentionDays: 365,
    encryptionRequired: true,
  },
  OTHER: {
    type: 'OTHER',
    allowedRoles: ['super_admin', 'admin', 'landlord', 'property_manager', 'agent', 'tenant', 'auditor'],
    requiresSignature: false,
    retentionDays: 365,
    encryptionRequired: false,
  },
};

/**
 * Check if a role can access a specific document type
 */
export function canAccessDocumentType(role: UserRole, documentType: string): boolean {
  const policy = DOCUMENT_TYPE_POLICIES[documentType];
  if (!policy) return false;
  return policy.allowedRoles.includes(role);
}

// =============================================================================
// Singleton Instance
// =============================================================================

let aclInstance: DocumentACL | null = null;

export function getDocumentACL(): DocumentACL {
  if (!aclInstance) {
    aclInstance = new DocumentACL();
  }
  return aclInstance;
}
