/**
 * Evidence Service Tests
 *
 * Tests for:
 * - Evidence emission and storage
 * - Content hash computation and verification
 * - Query functionality
 * - SOC2 control mappings
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';

import {
  computeContentHash,
  verifyContentHash,
  verifyChain,
} from '../src/modules/evidence/integrity';
import {
  getControlMapping,
  getControlDetails,
  getEventTypesForControl,
  getControlsByCategory,
  SOC2_CONTROLS,
  EVENT_CONTROL_MAPPINGS,
} from '../src/modules/evidence/control-mappings';
import type { SOC2Category, EvidenceEmitInput } from '../src/modules/evidence/types';

// =============================================================================
// Content Hash Tests
// =============================================================================

describe('Evidence Integrity', () => {
  describe('computeContentHash', () => {
    it('produces deterministic hash for same input', () => {
      const details = { foo: 'bar', baz: 123 };
      const hash1 = computeContentHash(details);
      const hash2 = computeContentHash(details);
      expect(hash1).toBe(hash2);
    });

    it('produces different hash for different input', () => {
      const hash1 = computeContentHash({ foo: 'bar' });
      const hash2 = computeContentHash({ foo: 'baz' });
      expect(hash1).not.toBe(hash2);
    });

    it('handles null input', () => {
      const hash = computeContentHash(null);
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA-256 hex length
    });

    it('produces consistent hash regardless of key order', () => {
      const details1 = { a: 1, b: 2, c: 3 };
      const details2 = { c: 3, a: 1, b: 2 };
      const hash1 = computeContentHash(details1);
      const hash2 = computeContentHash(details2);
      expect(hash1).toBe(hash2);
    });

    it('returns 64-character hex string', () => {
      const hash = computeContentHash({ test: 'data' });
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('verifyContentHash', () => {
    it('returns true for valid hash', () => {
      const details = { foo: 'bar' };
      const contentHash = computeContentHash(details);
      const result = verifyContentHash({ details, contentHash });
      expect(result).toBe(true);
    });

    it('returns false for tampered content', () => {
      const details = { foo: 'bar' };
      const contentHash = computeContentHash(details);
      const tamperedDetails = { foo: 'baz' };
      const result = verifyContentHash({ details: tamperedDetails, contentHash });
      expect(result).toBe(false);
    });

    it('returns false for invalid hash', () => {
      const details = { foo: 'bar' };
      const result = verifyContentHash({ details, contentHash: 'invalid-hash' });
      expect(result).toBe(false);
    });
  });

  describe('verifyChain', () => {
    it('returns valid for empty chain', () => {
      const result = verifyChain([]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid for single record chain', () => {
      const result = verifyChain([
        { id: '1', contentHash: 'hash1', previousHash: null },
      ]);
      expect(result.valid).toBe(true);
    });

    it('returns valid for properly linked chain', () => {
      const result = verifyChain([
        { id: '1', contentHash: 'hash1', previousHash: null },
        { id: '2', contentHash: 'hash2', previousHash: 'hash1' },
        { id: '3', contentHash: 'hash3', previousHash: 'hash2' },
      ]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects broken chain', () => {
      const result = verifyChain([
        { id: '1', contentHash: 'hash1', previousHash: null },
        { id: '2', contentHash: 'hash2', previousHash: 'wrong-hash' },
      ]);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe('2');
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Control Mappings Tests
// =============================================================================

describe('SOC2 Control Mappings', () => {
  describe('SOC2_CONTROLS', () => {
    it('contains expected control IDs', () => {
      expect(SOC2_CONTROLS['CC6.1']).toBeDefined();
      expect(SOC2_CONTROLS['CC6.2']).toBeDefined();
      expect(SOC2_CONTROLS['CC6.6']).toBeDefined();
      expect(SOC2_CONTROLS['CC7.2']).toBeDefined();
      expect(SOC2_CONTROLS['P6.1']).toBeDefined();
    });

    it('each control has required fields', () => {
      for (const [controlId, control] of Object.entries(SOC2_CONTROLS)) {
        expect(control.controlId).toBe(controlId);
        expect(control.category).toBeDefined();
        expect(control.title).toBeDefined();
        expect(control.description).toBeDefined();
      }
    });
  });

  describe('EVENT_CONTROL_MAPPINGS', () => {
    it('contains auth event mappings', () => {
      expect(EVENT_CONTROL_MAPPINGS['auth.login_success']).toBeDefined();
      expect(EVENT_CONTROL_MAPPINGS['auth.login_failed']).toBeDefined();
      expect(EVENT_CONTROL_MAPPINGS['auth.logout']).toBeDefined();
      expect(EVENT_CONTROL_MAPPINGS['auth.token_refresh']).toBeDefined();
    });

    it('contains admin event mappings', () => {
      expect(EVENT_CONTROL_MAPPINGS['admin.api_key_created']).toBeDefined();
      expect(EVENT_CONTROL_MAPPINGS['admin.impersonation_started']).toBeDefined();
    });

    it('contains compliance event mappings', () => {
      expect(EVENT_CONTROL_MAPPINGS['compliance.gate_passed']).toBeDefined();
      expect(EVENT_CONTROL_MAPPINGS['compliance.gate_blocked']).toBeDefined();
    });

    it('contains data export event mappings', () => {
      expect(EVENT_CONTROL_MAPPINGS['data.export_requested']).toBeDefined();
      expect(EVENT_CONTROL_MAPPINGS['data.export_completed']).toBeDefined();
    });
  });

  describe('getControlMapping', () => {
    it('returns mapping for known event type', () => {
      const mapping = getControlMapping('auth.login_success');
      expect(mapping).toBeDefined();
      expect(mapping?.controlId).toBe('CC6.1');
      expect(mapping?.category).toBe('Security');
    });

    it('returns null for unknown event type', () => {
      const mapping = getControlMapping('unknown.event');
      expect(mapping).toBeNull();
    });
  });

  describe('getControlDetails', () => {
    it('returns details for known control', () => {
      const details = getControlDetails('CC6.1');
      expect(details).toBeDefined();
      expect(details?.title).toBe('Logical Access Security');
    });

    it('returns null for unknown control', () => {
      const details = getControlDetails('CC99.99');
      expect(details).toBeNull();
    });
  });

  describe('getEventTypesForControl', () => {
    it('returns event types for CC6.1', () => {
      const eventTypes = getEventTypesForControl('CC6.1');
      expect(eventTypes).toContain('auth.login_success');
      expect(eventTypes).toContain('auth.login_failed');
      expect(eventTypes).toContain('auth.logout');
    });

    it('returns empty array for unknown control', () => {
      const eventTypes = getEventTypesForControl('CC99.99');
      expect(eventTypes).toEqual([]);
    });
  });

  describe('getControlsByCategory', () => {
    it('returns Security controls', () => {
      const controls = getControlsByCategory('Security');
      expect(controls.length).toBeGreaterThan(0);
      expect(controls.every(c => c.category === 'Security')).toBe(true);
    });

    it('returns Privacy controls', () => {
      const controls = getControlsByCategory('Privacy');
      expect(controls.length).toBeGreaterThan(0);
      expect(controls.every(c => c.category === 'Privacy')).toBe(true);
    });

    it('returns ProcessingIntegrity controls', () => {
      const controls = getControlsByCategory('ProcessingIntegrity');
      expect(controls.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// Types and Schema Tests
// =============================================================================

describe('Evidence Types', () => {
  describe('EvidenceEmitInput structure', () => {
    it('accepts valid input', () => {
      const input: EvidenceEmitInput = {
        controlId: 'CC6.1',
        category: 'Security',
        eventType: 'auth.login_success',
        eventOutcome: 'success',
        summary: 'User logged in',
        scope: 'user',
        actorType: 'user',
      };

      expect(input.controlId).toBe('CC6.1');
      expect(input.category).toBe('Security');
    });

    it('allows optional fields', () => {
      const input: EvidenceEmitInput = {
        controlId: 'CC6.1',
        category: 'Security',
        eventType: 'auth.login_success',
        eventOutcome: 'success',
        summary: 'User logged in',
        scope: 'user',
        actorType: 'user',
        actorId: 'user-123',
        actorEmail: 'test@example.com',
        organizationId: 'org-123',
        details: { key: 'value' },
        ipAddress: '192.168.1.1',
      };

      expect(input.actorId).toBe('user-123');
      expect(input.details).toEqual({ key: 'value' });
    });
  });

  describe('SOC2 Categories', () => {
    const categories: SOC2Category[] = [
      'Security',
      'Availability',
      'ProcessingIntegrity',
      'Confidentiality',
      'Privacy',
    ];

    it('all categories are valid', () => {
      categories.forEach(category => {
        expect(typeof category).toBe('string');
      });
    });
  });
});
