/**
 * Evidence Integration Tests
 *
 * End-to-end tests for the SOC2 evidence system:
 * - Evidence emission through emitters
 * - Service operations (emit, query, verify)
 * - Control mapping integration
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

import {
  EvidenceService,
  resetEvidenceService,
  getEvidenceService,
} from '../src/modules/evidence/service';
import { computeContentHash } from '../src/modules/evidence/integrity';
import { getControlMapping } from '../src/modules/evidence/control-mappings';
import type { EvidenceEmitInput, EvidenceRecord } from '../src/modules/evidence/types';

// Mock prisma for testing
const mockEvidenceRecords: EvidenceRecord[] = [];
let mockIdCounter = 1;

vi.mock('@realriches/database', () => ({
  prisma: {
    evidenceRecord: {
      create: vi.fn(async ({ data }) => {
        const record: EvidenceRecord = {
          id: `evd_${mockIdCounter++}`,
          ...data,
          recordedAt: new Date(),
        };
        mockEvidenceRecords.push(record);
        return record;
      }),
      findMany: vi.fn(async ({ where, skip, take, orderBy }) => {
        let results = [...mockEvidenceRecords];

        // Apply filters
        if (where) {
          if (where.organizationId) {
            results = results.filter(r => r.organizationId === where.organizationId);
          }
          if (where.tenantId) {
            results = results.filter(r => r.tenantId === where.tenantId);
          }
          if (where.controlId) {
            results = results.filter(r => r.controlId === where.controlId);
          }
          if (where.category) {
            results = results.filter(r => r.category === where.category);
          }
          if (where.eventType?.startsWith) {
            results = results.filter(r => r.eventType.startsWith(where.eventType.startsWith));
          }
        }

        // Apply pagination
        if (skip) results = results.slice(skip);
        if (take) results = results.slice(0, take);

        return results;
      }),
      findUnique: vi.fn(async ({ where }) => {
        return mockEvidenceRecords.find(r => r.id === where.id) || null;
      }),
      count: vi.fn(async ({ where }) => {
        let results = [...mockEvidenceRecords];
        if (where?.organizationId) {
          results = results.filter(r => r.organizationId === where.organizationId);
        }
        return results.length;
      }),
      groupBy: vi.fn(async ({ by, where }) => {
        const results: Record<string, unknown>[] = [];
        const groups = new Map<string, number>();

        for (const record of mockEvidenceRecords) {
          const key = by.map((b: string) => (record as Record<string, unknown>)[b]).join('|');
          groups.set(key, (groups.get(key) || 0) + 1);
        }

        groups.forEach((count, key) => {
          const values = key.split('|');
          const entry: Record<string, unknown> = { _count: count };
          by.forEach((b: string, i: number) => {
            entry[b] = values[i];
          });
          results.push(entry);
        });

        return results;
      }),
    },
  },
}));

describe('Evidence Integration', () => {
  beforeEach(() => {
    mockEvidenceRecords.length = 0;
    mockIdCounter = 1;
    resetEvidenceService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Service Emit Tests
  // ===========================================================================

  describe('EvidenceService.emitSync', () => {
    it('creates evidence record with correct fields', async () => {
      const service = getEvidenceService();

      const input: EvidenceEmitInput = {
        controlId: 'CC6.1',
        category: 'Security',
        eventType: 'auth.login_success',
        eventOutcome: 'success',
        summary: 'User test@example.com logged in successfully',
        scope: 'user',
        actorType: 'user',
        actorId: 'user-123',
        actorEmail: 'test@example.com',
        details: { sessionId: 'sess-123' },
        ipAddress: '192.168.1.1',
      };

      const record = await service.emitSync(input);

      expect(record).toBeDefined();
      expect(record.id).toMatch(/^evd_/);
      expect(record.controlId).toBe('CC6.1');
      expect(record.category).toBe('Security');
      expect(record.eventType).toBe('auth.login_success');
      expect(record.eventOutcome).toBe('success');
      expect(record.actorId).toBe('user-123');
      expect(record.actorEmail).toBe('test@example.com');
    });

    it('computes content hash for integrity', async () => {
      const service = getEvidenceService();

      const details = { sessionId: 'sess-123', metadata: 'test' };
      const expectedHash = computeContentHash(details);

      const record = await service.emitSync({
        controlId: 'CC6.1',
        category: 'Security',
        eventType: 'auth.login_success',
        eventOutcome: 'success',
        summary: 'Test event',
        scope: 'user',
        actorType: 'user',
        details,
      });

      expect(record.contentHash).toBe(expectedHash);
    });

    it('chains records with previousHash', async () => {
      const service = getEvidenceService();

      const record1 = await service.emitSync({
        controlId: 'CC6.1',
        category: 'Security',
        eventType: 'auth.login_success',
        eventOutcome: 'success',
        summary: 'First event',
        scope: 'user',
        actorType: 'user',
      });

      const record2 = await service.emitSync({
        controlId: 'CC6.1',
        category: 'Security',
        eventType: 'auth.logout',
        eventOutcome: 'success',
        summary: 'Second event',
        scope: 'user',
        actorType: 'user',
      });

      expect(record1.previousHash).toBeNull();
      expect(record2.previousHash).toBe(record1.contentHash);
    });
  });

  // ===========================================================================
  // Query Tests
  // ===========================================================================

  describe('EvidenceService.query', () => {
    beforeEach(async () => {
      const service = getEvidenceService();

      // Create test records
      await service.emitSync({
        controlId: 'CC6.1',
        category: 'Security',
        eventType: 'auth.login_success',
        eventOutcome: 'success',
        summary: 'Login 1',
        scope: 'user',
        actorType: 'user',
        organizationId: 'org-1',
      });

      await service.emitSync({
        controlId: 'CC6.1',
        category: 'Security',
        eventType: 'auth.login_failed',
        eventOutcome: 'failure',
        summary: 'Login failed',
        scope: 'user',
        actorType: 'user',
        organizationId: 'org-1',
      });

      await service.emitSync({
        controlId: 'P6.1',
        category: 'Privacy',
        eventType: 'data.export_requested',
        eventOutcome: 'success',
        summary: 'Export',
        scope: 'user',
        actorType: 'user',
        organizationId: 'org-2',
      });
    });

    it('queries all records', async () => {
      const service = getEvidenceService();
      const result = await service.query({ page: 1, limit: 50 });

      expect(result.records.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it('filters by organization', async () => {
      const service = getEvidenceService();
      const result = await service.queryByOrganization('org-1');

      expect(result.records.length).toBe(2);
      expect(result.records.every(r => r.organizationId === 'org-1')).toBe(true);
    });

    it('filters by control ID', async () => {
      const service = getEvidenceService();
      const result = await service.queryByControl('CC6.1');

      expect(result.records.length).toBe(2);
      expect(result.records.every(r => r.controlId === 'CC6.1')).toBe(true);
    });

    it('filters by category', async () => {
      const service = getEvidenceService();
      const result = await service.query({ category: 'Privacy', page: 1, limit: 50 });

      expect(result.records.length).toBe(1);
      expect(result.records[0].category).toBe('Privacy');
    });
  });

  // ===========================================================================
  // Verification Tests
  // ===========================================================================

  describe('EvidenceService.verifyRecord', () => {
    it('returns valid for untampered record', async () => {
      const service = getEvidenceService();

      await service.emitSync({
        controlId: 'CC6.1',
        category: 'Security',
        eventType: 'auth.login_success',
        eventOutcome: 'success',
        summary: 'Test',
        scope: 'user',
        actorType: 'user',
        details: { test: 'data' },
      });

      const result = await service.verifyRecord('evd_1');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns invalid for non-existent record', async () => {
      const service = getEvidenceService();
      const result = await service.verifyRecord('evd_nonexistent');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Record not found');
    });
  });

  // ===========================================================================
  // Control Mapping Integration
  // ===========================================================================

  describe('Control Mapping Integration', () => {
    it('maps auth events to correct controls', () => {
      const loginMapping = getControlMapping('auth.login_success');
      expect(loginMapping?.controlId).toBe('CC6.1');
      expect(loginMapping?.category).toBe('Security');

      const logoutMapping = getControlMapping('auth.logout');
      expect(logoutMapping?.controlId).toBe('CC6.1');
    });

    it('maps compliance events to CC7.2', () => {
      const passedMapping = getControlMapping('compliance.gate_passed');
      expect(passedMapping?.controlId).toBe('CC7.2');
      expect(passedMapping?.category).toBe('ProcessingIntegrity');

      const blockedMapping = getControlMapping('compliance.gate_blocked');
      expect(blockedMapping?.controlId).toBe('CC7.2');
    });

    it('maps data export events to P6.1 Privacy', () => {
      const exportMapping = getControlMapping('data.export_requested');
      expect(exportMapping?.controlId).toBe('P6.1');
      expect(exportMapping?.category).toBe('Privacy');
    });

    it('maps API key events to CC6.6', () => {
      const createdMapping = getControlMapping('admin.api_key_created');
      expect(createdMapping?.controlId).toBe('CC6.6');
      expect(createdMapping?.category).toBe('Security');
    });

    it('maps admin impersonation to CC6.7', () => {
      const impersonationMapping = getControlMapping('admin.impersonation_started');
      expect(impersonationMapping?.controlId).toBe('CC6.7');
      expect(impersonationMapping?.category).toBe('Security');
    });
  });

  // ===========================================================================
  // End-to-End Evidence Emission
  // ===========================================================================

  describe('End-to-End Evidence Emission', () => {
    it('complete auth evidence flow', async () => {
      const service = getEvidenceService();

      // Simulate auth login event
      const mapping = getControlMapping('auth.login_success')!;

      const record = await service.emitSync({
        controlId: mapping.controlId,
        category: mapping.category,
        eventType: 'auth.login_success',
        eventOutcome: mapping.outcomeDefault as 'success',
        summary: 'User test@example.com logged in successfully',
        scope: 'user',
        actorType: 'user',
        actorId: 'user-123',
        actorEmail: 'test@example.com',
        details: {
          sessionId: 'sess-abc',
          method: 'password',
        },
        ipAddress: '192.168.1.100',
        userAgent: 'Mozilla/5.0',
      });

      // Verify record exists
      expect(record.id).toBeDefined();
      expect(record.controlId).toBe('CC6.1');
      expect(record.category).toBe('Security');
      expect(record.eventType).toBe('auth.login_success');
      expect(record.eventOutcome).toBe('success');

      // Verify content hash
      const expectedHash = computeContentHash(record.details as Record<string, unknown>);
      expect(record.contentHash).toBe(expectedHash);

      // Verify queryable
      const queryResult = await service.query({
        eventType: 'auth.login_success',
        page: 1,
        limit: 10,
      });
      expect(queryResult.records.length).toBe(1);
      expect(queryResult.records[0].id).toBe(record.id);

      // Verify integrity
      const verifyResult = await service.verifyRecord(record.id);
      expect(verifyResult.valid).toBe(true);
    });

    it('complete compliance gate evidence flow', async () => {
      const service = getEvidenceService();

      // Simulate compliance gate blocked event
      const record = await service.emitSync({
        controlId: 'CC7.2',
        category: 'ProcessingIntegrity',
        eventType: 'compliance.gate_blocked',
        eventOutcome: 'blocked',
        summary: 'Compliance gate BLOCKED background_check on application: FCHA violation',
        scope: 'org',
        actorType: 'system',
        organizationId: 'org-123',
        entityType: 'application',
        entityId: 'app-456',
        details: {
          action: 'background_check',
          marketId: 'NYC',
          marketPack: 'NYC_STRICT',
          policyVersion: '1.0.0',
          checksPerformed: ['fcha_criminal_check'],
          violationCount: 1,
          violations: [
            {
              code: 'FCHA_BACKGROUND_CHECK_NOT_ALLOWED',
              severity: 'critical',
              message: 'Background check blocked before conditional offer',
            },
          ],
          blocked: true,
        },
      });

      expect(record.controlId).toBe('CC7.2');
      expect(record.category).toBe('ProcessingIntegrity');
      expect(record.eventOutcome).toBe('blocked');
      expect(record.organizationId).toBe('org-123');

      // Query by organization
      const orgResult = await service.queryByOrganization('org-123');
      expect(orgResult.records.length).toBe(1);
    });
  });
});
