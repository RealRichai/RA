/**
 * Vault Evidence Tests
 *
 * Tests for SOC2-compliant evidence persistence.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  sanitizeMetadata,
  SOC2_CONTROL_IDS,
  type VaultEvidenceRecord,
} from '../evidence/types';

describe('Vault Evidence', () => {
  describe('sanitizeMetadata', () => {
    it('should redact SSN patterns', () => {
      const metadata = {
        description: 'User SSN is 123-45-6789 in the document',
      };

      const result = sanitizeMetadata(metadata);

      expect(result.description).toBe('User SSN is [REDACTED] in the document');
    });

    it('should redact email patterns', () => {
      const metadata = {
        contact: 'Contact user@example.com for more info',
      };

      const result = sanitizeMetadata(metadata);

      expect(result.contact).toBe('Contact [REDACTED] for more info');
    });

    it('should redact phone number patterns in text', () => {
      const metadata = {
        message: 'Call 555-123-4567 for support',
      };

      const result = sanitizeMetadata(metadata);

      expect(result.message).toBe('Call [REDACTED] for support');
    });

    it('should redact known PII field names', () => {
      const metadata = {
        ssn: '123-45-6789',
        email: 'user@example.com',
        phone: '555-123-4567',
        creditCard: '1234567890123456',
      };

      const result = sanitizeMetadata(metadata);

      expect(result.ssn).toBe('[REDACTED]');
      expect(result.email).toBe('[REDACTED]');
      expect(result.phone).toBe('[REDACTED]');
      expect(result.creditCard).toBe('[REDACTED]');
    });

    it('should handle nested objects', () => {
      const metadata = {
        user: {
          name: 'John',
          ssn: '123-45-6789',
          contact: {
            email: 'john@example.com',
          },
        },
      };

      const result = sanitizeMetadata(metadata);
      const user = result.user as Record<string, unknown>;
      const contact = user.contact as Record<string, unknown>;

      expect(user.name).toBe('John');
      expect(user.ssn).toBe('[REDACTED]');
      expect(contact.email).toBe('[REDACTED]');
    });

    it('should preserve non-PII data', () => {
      const metadata = {
        action: 'upload',
        folder: 'OWNERSHIP',
        category: 'DEED',
        timestamp: '2024-01-01T00:00:00Z',
        count: 5,
        isRequired: true,
      };

      const result = sanitizeMetadata(metadata);

      expect(result).toEqual(metadata);
    });
  });

  describe('SOC2 Control IDs', () => {
    it('should have all required control IDs defined', () => {
      expect(SOC2_CONTROL_IDS['CC6.1']).toBe('Logical Access Security');
      expect(SOC2_CONTROL_IDS['CC6.6']).toBe('Logical Access to Data');
      expect(SOC2_CONTROL_IDS['CC7.2']).toBe('Security Event Monitoring');
      expect(SOC2_CONTROL_IDS['CC7.4']).toBe('Incident Response');
    });

    it('should have at least 10 control IDs', () => {
      expect(Object.keys(SOC2_CONTROL_IDS).length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('VaultEvidenceRecord structure', () => {
    it('should accept valid evidence records', () => {
      const record: VaultEvidenceRecord = {
        eventType: 'UPLOAD',
        eventOutcome: 'SUCCESS',
        controlId: 'CC6.6',
        propertyId: '550e8400-e29b-41d4-a716-446655440000',
        vaultId: '550e8400-e29b-41d4-a716-446655440001',
        documentId: '550e8400-e29b-41d4-a716-446655440002',
        actorUserId: '550e8400-e29b-41d4-a716-446655440003',
        actorRole: 'owner',
        actorEmail: 'owner@example.com',
        resourcePath: '/properties/123/vault/documents',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        requestId: 'req-123',
        metadata: { folder: 'OWNERSHIP', category: 'DEED' },
      };

      expect(record.eventType).toBe('UPLOAD');
      expect(record.eventOutcome).toBe('SUCCESS');
      expect(record.controlId).toBe('CC6.6');
    });

    it('should allow optional fields to be undefined', () => {
      const record: VaultEvidenceRecord = {
        eventType: 'ACL_CHECK',
        eventOutcome: 'DENIED',
        controlId: 'CC6.1',
        propertyId: '550e8400-e29b-41d4-a716-446655440000',
        actorUserId: '550e8400-e29b-41d4-a716-446655440003',
        actorRole: 'unknown',
        actorEmail: 'user@example.com',
        resourcePath: '/properties/123/vault',
      };

      expect(record.vaultId).toBeUndefined();
      expect(record.documentId).toBeUndefined();
      expect(record.ipAddress).toBeUndefined();
      expect(record.metadata).toBeUndefined();
    });
  });

  describe('Event Types', () => {
    it('should support all required event types', () => {
      const eventTypes: VaultEvidenceRecord['eventType'][] = [
        'UPLOAD',
        'DOWNLOAD',
        'VIEW',
        'DELETE',
        'ACL_CHECK',
        'SHARE',
        'UPSELL_VIEW',
        'UPSELL_CONVERT',
        'UPSELL_DISMISS',
      ];

      expect(eventTypes).toHaveLength(9);
    });
  });

  describe('Event Outcomes', () => {
    it('should support all required outcomes', () => {
      const outcomes: VaultEvidenceRecord['eventOutcome'][] = [
        'SUCCESS',
        'DENIED',
        'FAILED',
      ];

      expect(outcomes).toHaveLength(3);
    });
  });
});
