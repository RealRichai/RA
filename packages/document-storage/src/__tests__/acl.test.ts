/**
 * Document ACL Tests
 *
 * Tests for role-based access control and authorization.
 */

import { describe, it, expect } from 'vitest';
import { DocumentACL, getDocumentACL, canAccessDocumentType } from '../acl';
import type { ACLContext, EntityOwnership, DocumentAction, UserRole } from '../types';

describe('Document ACL', () => {
  const acl = getDocumentACL();

  describe('Super Admin Access', () => {
    const context: ACLContext = {
      userId: 'admin_123',
      userRole: 'super_admin',
      userEmail: 'admin@realriches.com',
    };

    it('should allow super_admin full access to all documents', () => {
      const ownership: EntityOwnership = {
        documentOwnerId: 'other_user',
        propertyOwnerId: 'other_user',
      };

      const actions: DocumentAction[] = ['read', 'write', 'delete', 'share', 'sign', 'download'];

      for (const action of actions) {
        const result = acl.checkAccess(context, action, ownership);
        expect(result.allowed).toBe(true);
      }
    });
  });

  describe('Auditor Access', () => {
    const context: ACLContext = {
      userId: 'auditor_123',
      userRole: 'auditor',
      userEmail: 'auditor@realriches.com',
    };

    it('should allow auditor read access to any document', () => {
      const ownership: EntityOwnership = {
        documentOwnerId: 'other_user',
        propertyOwnerId: 'other_user',
      };

      const readResult = acl.checkAccess(context, 'read', ownership);
      expect(readResult.allowed).toBe(true);

      const downloadResult = acl.checkAccess(context, 'download', ownership);
      expect(downloadResult.allowed).toBe(true);
    });

    it('should deny auditor write access', () => {
      const ownership: EntityOwnership = {
        documentOwnerId: 'other_user',
      };

      const result = acl.checkAccess(context, 'write', ownership);
      expect(result.allowed).toBe(false);
    });

    it('should deny auditor delete access', () => {
      const ownership: EntityOwnership = {
        documentOwnerId: 'other_user',
      };

      const result = acl.checkAccess(context, 'delete', ownership);
      expect(result.allowed).toBe(false);
    });
  });

  describe('Landlord Access', () => {
    const context: ACLContext = {
      userId: 'landlord_123',
      userRole: 'landlord',
      userEmail: 'landlord@example.com',
    };

    it('should allow landlord full access to their property documents', () => {
      const ownership: EntityOwnership = {
        propertyOwnerId: 'landlord_123',
      };

      const result = acl.checkAccess(context, 'write', ownership);
      expect(result.allowed).toBe(true);
    });

    it('should allow landlord access to lease documents where they are landlord', () => {
      const ownership: EntityOwnership = {
        leaseLandlordId: 'landlord_123',
      };

      const result = acl.checkAccess(context, 'read', ownership);
      expect(result.allowed).toBe(true);
    });

    it('should deny landlord access to other landlord property documents', () => {
      const ownership: EntityOwnership = {
        propertyOwnerId: 'other_landlord',
      };

      const result = acl.checkAccess(context, 'write', ownership);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No access to this entity');
    });
  });

  describe('Tenant Access', () => {
    const context: ACLContext = {
      userId: 'tenant_123',
      userRole: 'tenant',
      userEmail: 'tenant@example.com',
    };

    it('should allow tenant to read their lease documents', () => {
      const ownership: EntityOwnership = {
        leaseTenantId: 'tenant_123',
      };

      const result = acl.checkAccess(context, 'read', ownership);
      expect(result.allowed).toBe(true);
    });

    it('should allow tenant to sign documents', () => {
      const ownership: EntityOwnership = {
        leaseTenantId: 'tenant_123',
      };

      const result = acl.checkAccess(context, 'sign', ownership);
      expect(result.allowed).toBe(true);
    });

    it('should deny tenant write access', () => {
      const ownership: EntityOwnership = {
        leaseTenantId: 'tenant_123',
      };

      const result = acl.checkAccess(context, 'write', ownership);
      expect(result.allowed).toBe(false);
    });

    it('should deny tenant delete access', () => {
      const ownership: EntityOwnership = {
        leaseTenantId: 'tenant_123',
      };

      const result = acl.checkAccess(context, 'delete', ownership);
      expect(result.allowed).toBe(false);
    });

    it('should allow tenant to read application documents', () => {
      const ownership: EntityOwnership = {
        applicationApplicantId: 'tenant_123',
      };

      const result = acl.checkAccess(context, 'read', ownership);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Property Manager Access', () => {
    const context: ACLContext = {
      userId: 'pm_123',
      userRole: 'property_manager',
      userEmail: 'pm@management.com',
    };

    it('should allow property manager access to managed property documents', () => {
      const ownership: EntityOwnership = {
        propertyManagerId: 'pm_123',
      };

      const result = acl.checkAccess(context, 'write', ownership);
      expect(result.allowed).toBe(true);
    });

    it('should allow property manager access to lease documents for managed properties', () => {
      const ownership: EntityOwnership = {
        propertyManagerId: 'pm_123',
        leaseLandlordId: 'landlord_123',
      };

      const result = acl.checkAccess(context, 'read', ownership);
      expect(result.allowed).toBe(true);
    });

    it('should deny property manager delete access', () => {
      const ownership: EntityOwnership = {
        propertyManagerId: 'pm_123',
      };

      const result = acl.checkAccess(context, 'delete', ownership);
      expect(result.allowed).toBe(false);
    });
  });

  describe('Agent Access', () => {
    const context: ACLContext = {
      userId: 'agent_123',
      userRole: 'agent',
      userEmail: 'agent@brokerage.com',
    };

    it('should allow agent to read property documents', () => {
      const ownership: EntityOwnership = {
        propertyOwnerId: 'landlord_123',
      };

      const result = acl.checkAccess(context, 'read', ownership);
      expect(result.allowed).toBe(true);
    });

    it('should deny agent sign access', () => {
      const ownership: EntityOwnership = {
        propertyOwnerId: 'landlord_123',
      };

      const result = acl.checkAccess(context, 'sign', ownership);
      expect(result.allowed).toBe(false);
    });
  });

  describe('Document Owner Access', () => {
    it('should allow document owner full access', () => {
      const context: ACLContext = {
        userId: 'owner_123',
        userRole: 'tenant',
        userEmail: 'owner@example.com',
      };

      const ownership: EntityOwnership = {
        documentOwnerId: 'owner_123',
      };

      const actions: DocumentAction[] = ['read', 'write', 'delete', 'share', 'download'];

      for (const action of actions) {
        const result = acl.checkAccess(context, action, ownership);
        expect(result.allowed).toBe(true);
      }
    });

    it('should allow document uploader full access', () => {
      const context: ACLContext = {
        userId: 'uploader_123',
        userRole: 'tenant',
        userEmail: 'uploader@example.com',
      };

      const ownership: EntityOwnership = {
        documentUploaderId: 'uploader_123',
      };

      const result = acl.checkAccess(context, 'delete', ownership);
      expect(result.allowed).toBe(true);
    });
  });

  describe('Shared Document Access', () => {
    it('should allow read access for shared users', () => {
      const context: ACLContext = {
        userId: 'shared_user',
        userRole: 'tenant',
        userEmail: 'shared@example.com',
      };

      const ownership: EntityOwnership = {
        documentOwnerId: 'other_user',
        sharedWithUserIds: ['shared_user', 'another_user'],
      };

      const readResult = acl.checkAccess(context, 'read', ownership);
      expect(readResult.allowed).toBe(true);

      const signResult = acl.checkAccess(context, 'sign', ownership);
      expect(signResult.allowed).toBe(true);
    });

    it('should deny write access for shared users', () => {
      const context: ACLContext = {
        userId: 'shared_user',
        userRole: 'tenant',
        userEmail: 'shared@example.com',
      };

      const ownership: EntityOwnership = {
        documentOwnerId: 'other_user',
        sharedWithUserIds: ['shared_user'],
      };

      const result = acl.checkAccess(context, 'write', ownership);
      expect(result.allowed).toBe(false);
    });
  });

  describe('Vendor Access', () => {
    const context: ACLContext = {
      userId: 'vendor_123',
      userRole: 'vendor',
      userEmail: 'vendor@plumbing.com',
    };

    it('should deny vendor access without work order context', () => {
      const ownership: EntityOwnership = {
        propertyOwnerId: 'landlord_123',
      };

      const result = acl.checkAccess(context, 'read', ownership);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Vendor access requires work order context');
    });
  });

  describe('Audit Info', () => {
    it('should include audit info in result', () => {
      const context: ACLContext = {
        userId: 'user_123',
        userRole: 'landlord',
        userEmail: 'user@example.com',
      };

      const ownership: EntityOwnership = {
        propertyOwnerId: 'user_123',
      };

      const result = acl.checkAccess(context, 'read', ownership, 'doc_456');

      expect(result.auditInfo).toBeDefined();
      expect(result.auditInfo.action).toBe('read');
      expect(result.auditInfo.userId).toBe('user_123');
      expect(result.auditInfo.userRole).toBe('landlord');
      expect(result.auditInfo.documentId).toBe('doc_456');
      expect(result.auditInfo.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Get Permissions', () => {
    it('should return all allowed permissions for a user', () => {
      const context: ACLContext = {
        userId: 'landlord_123',
        userRole: 'landlord',
        userEmail: 'landlord@example.com',
      };

      const ownership: EntityOwnership = {
        propertyOwnerId: 'landlord_123',
      };

      const permissions = acl.getPermissions(context, ownership);

      expect(permissions.has('read')).toBe(true);
      expect(permissions.has('write')).toBe(true);
      expect(permissions.has('download')).toBe(true);
      expect(permissions.has('share')).toBe(true);
    });
  });
});

describe('Document Type Policies', () => {
  it('should allow landlord access to LEASE documents', () => {
    expect(canAccessDocumentType('landlord', 'LEASE')).toBe(true);
  });

  it('should allow tenant access to LEASE documents', () => {
    expect(canAccessDocumentType('tenant', 'LEASE')).toBe(true);
  });

  it('should deny tenant access to ID documents', () => {
    expect(canAccessDocumentType('tenant', 'ID')).toBe(false);
  });

  it('should allow auditor access to all document types', () => {
    expect(canAccessDocumentType('auditor', 'LEASE')).toBe(true);
    expect(canAccessDocumentType('auditor', 'ID')).toBe(true);
    expect(canAccessDocumentType('auditor', 'INCOME')).toBe(true);
  });

  it('should deny agent access to ID documents', () => {
    expect(canAccessDocumentType('agent', 'ID')).toBe(false);
  });

  it('should allow agent access to DISCLOSURE documents', () => {
    expect(canAccessDocumentType('agent', 'DISCLOSURE')).toBe(true);
  });

  it('should return false for unknown document type', () => {
    expect(canAccessDocumentType('landlord', 'UNKNOWN_TYPE')).toBe(false);
  });
});
