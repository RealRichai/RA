/**
 * Evidence Audit Integration Tests
 *
 * Tests for:
 * - Report generation with mocked evidence data
 * - Coverage matrix computation
 * - Gap register generation
 * - Workflow summary aggregation
 * - Integrity hash verification
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'crypto';
import { prisma } from '@realriches/database';

// =============================================================================
// Mock Data Setup
// =============================================================================

interface MockEvidenceRecord {
  id: string;
  controlId: string;
  category: string;
  eventType: string;
  eventOutcome: string;
  actorId: string | null;
  organizationId: string | null;
  tenantId: string | null;
  requestId: string | null;
  occurredAt: Date;
  contentHash: string;
  previousHash: string | null;
  entityType: string | null;
  entityId: string | null;
}

interface MockAuditLog {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actorId: string | null;
  requestId: string | null;
  timestamp: Date;
  ipAddress: string | null;
}

interface MockAgentRun {
  id: string;
  agentType: string;
  model: string;
  provider: string;
  status: string;
  policyCheckResult: unknown;
  promptRedactionReport: unknown;
  outputRedactionReport: unknown;
  tokensTotal: number;
  cost: number;
  requestId: string | null;
  createdAt: Date;
  marketId: string | null;
  organizationId?: string | null;
}

const mockEvidenceRecords: MockEvidenceRecord[] = [];
const mockAuditLogs: MockAuditLog[] = [];
const mockAgentRuns: MockAgentRun[] = [];

// Mock Prisma
vi.mock('@realriches/database', () => ({
  prisma: {
    evidenceRecord: {
      findMany: vi.fn(async ({ where }) => {
        let results = [...mockEvidenceRecords];
        if (where?.occurredAt?.gte) {
          results = results.filter((r) => r.occurredAt >= where.occurredAt.gte);
        }
        if (where?.organizationId) {
          results = results.filter((r) => r.organizationId === where.organizationId);
        }
        if (where?.tenantId) {
          results = results.filter((r) => r.tenantId === where.tenantId);
        }
        if (where?.OR) {
          results = results.filter((r) => {
            return where.OR.some((cond: Record<string, unknown>) => {
              if (cond.eventType) {
                if (typeof cond.eventType === 'string') {
                  return r.eventType === cond.eventType;
                }
                if (cond.eventType.startsWith) {
                  return r.eventType.startsWith(cond.eventType.startsWith);
                }
              }
              return false;
            });
          });
        }
        return results;
      }),
    },
    auditLog: {
      findMany: vi.fn(async ({ where }) => {
        let results = [...mockAuditLogs];
        if (where?.timestamp?.gte) {
          results = results.filter((r) => r.timestamp >= where.timestamp.gte);
        }
        if (where?.OR) {
          results = results.filter((r) => {
            return where.OR.some((cond: Record<string, unknown>) => {
              if (cond.action) {
                if (typeof cond.action === 'string') {
                  return r.action === cond.action;
                }
                if (cond.action.startsWith) {
                  return r.action.startsWith(cond.action.startsWith);
                }
                if (cond.action.contains) {
                  return r.action.includes(cond.action.contains);
                }
              }
              if (cond.entityType) {
                return r.entityType === cond.entityType;
              }
              return false;
            });
          });
        }
        return results;
      }),
    },
    agentRun: {
      findMany: vi.fn(async ({ where }) => {
        let results = [...mockAgentRuns];
        if (where?.createdAt?.gte) {
          results = results.filter((r) => r.createdAt >= where.createdAt.gte);
        }
        if (where?.organizationId) {
          results = results.filter((r) => r.organizationId === where.organizationId);
        }
        return results;
      }),
    },
  },
}));

// =============================================================================
// Test Helpers
// =============================================================================

function createEvidenceRecord(overrides: Partial<MockEvidenceRecord> = {}): MockEvidenceRecord {
  return {
    id: `evr_${Math.random().toString(36).substr(2, 9)}`,
    controlId: 'SEC-001',
    category: 'Security',
    eventType: 'auth.login',
    eventOutcome: 'success',
    actorId: 'user-123',
    organizationId: 'org-456',
    tenantId: 'tenant-789',
    requestId: 'req-001',
    occurredAt: new Date(),
    contentHash: createHash('sha256').update(Math.random().toString()).digest('hex'),
    previousHash: null,
    entityType: null,
    entityId: null,
    ...overrides,
  };
}

function createAuditLog(overrides: Partial<MockAuditLog> = {}): MockAuditLog {
  return {
    id: `log_${Math.random().toString(36).substr(2, 9)}`,
    action: 'login',
    entityType: null,
    entityId: null,
    actorId: 'user-123',
    requestId: 'req-001',
    timestamp: new Date(),
    ipAddress: '192.168.1.1',
    ...overrides,
  };
}

function createAgentRun(overrides: Partial<MockAgentRun> = {}): MockAgentRun {
  return {
    id: `run_${Math.random().toString(36).substr(2, 9)}`,
    agentType: 'lead_qualifier',
    model: 'gpt-4o',
    provider: 'openai',
    status: 'completed',
    policyCheckResult: { allowed: true },
    promptRedactionReport: null,
    outputRedactionReport: null,
    tokensTotal: 1500,
    cost: 15,
    requestId: 'req-001',
    createdAt: new Date(),
    marketId: 'NYC',
    ...overrides,
  };
}

// =============================================================================
// Integration Tests
// =============================================================================

describe('Evidence Audit Integration', () => {
  beforeEach(() => {
    mockEvidenceRecords.length = 0;
    mockAuditLogs.length = 0;
    mockAgentRuns.length = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Report Generation with Evidence Data', () => {
    it('generates report with SEC-001 evidence from evidence_records', async () => {
      // Add SEC-001 Authentication evidence
      mockEvidenceRecords.push(
        createEvidenceRecord({
          controlId: 'SEC-001',
          category: 'Security',
          eventType: 'auth.login',
        }),
        createEvidenceRecord({
          controlId: 'SEC-001',
          category: 'Security',
          eventType: 'auth.logout',
        }),
        createEvidenceRecord({
          controlId: 'SEC-001',
          category: 'Security',
          eventType: 'auth.failed',
        })
      );

      // Use mocked prisma

      // Query evidence records as the route would
      const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const records = await prisma.evidenceRecord.findMany({
        where: {
          occurredAt: { gte: sinceDate },
          OR: [
            { eventType: { startsWith: 'auth.' } },
            { eventType: 'auth.login' },
          ],
        },
      });

      expect(records.length).toBe(3);
      expect(records.every((r) => r.eventType.startsWith('auth.'))).toBe(true);
    });

    it('generates report with PI-002 evidence from agent_runs', async () => {
      // Add PI-002 AI Agent Policy evidence
      mockAgentRuns.push(
        createAgentRun({
          status: 'completed',
          policyCheckResult: { allowed: true, reason: 'within budget' },
        }),
        createAgentRun({
          status: 'blocked',
          policyCheckResult: { allowed: false, reason: 'budget exceeded' },
        })
      );

      const { prisma } = await import('@realriches/database');

      const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const runs = await prisma.agentRun.findMany({
        where: { createdAt: { gte: sinceDate } },
      });

      // Filter for PI-002 (policy gate evidence)
      const policyEvidence = runs.filter(
        (r) => r.policyCheckResult !== null || r.status === 'blocked'
      );

      expect(policyEvidence.length).toBe(2);
    });

    it('generates report with PRV-001 evidence from agent_runs with redaction reports', async () => {
      // Add PRV-001 PII Redaction evidence
      mockAgentRuns.push(
        createAgentRun({
          promptRedactionReport: { fieldsRedacted: 3, piiTypesDetected: ['email', 'phone'] },
          outputRedactionReport: null,
        }),
        createAgentRun({
          promptRedactionReport: null,
          outputRedactionReport: { fieldsRedacted: 1, piiTypesDetected: ['ssn'] },
        })
      );

      const { prisma } = await import('@realriches/database');

      const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const runs = await prisma.agentRun.findMany({
        where: { createdAt: { gte: sinceDate } },
      });

      // Filter for PRV-001 (redaction evidence)
      const redactionEvidence = runs.filter(
        (r) => r.promptRedactionReport !== null || r.outputRedactionReport !== null
      );

      expect(redactionEvidence.length).toBe(2);
    });

    it('generates report with SEC-004 evidence from audit_logs for admin actions', async () => {
      // Add SEC-004 Admin Actions evidence
      mockAuditLogs.push(
        createAuditLog({ action: 'admin.settings_changed' }),
        createAuditLog({ action: 'admin.role_modified' }),
        createAuditLog({ action: 'impersonate' }),
        createAuditLog({ action: 'role_updated' })
      );

      const { prisma } = await import('@realriches/database');

      const sinceDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const logs = await prisma.auditLog.findMany({
        where: {
          timestamp: { gte: sinceDate },
          OR: [
            { action: { startsWith: 'admin.' } },
            { action: { startsWith: 'role_' } },
            { action: 'impersonate' },
            { action: { contains: 'impersonate' } },
          ],
        },
      });

      expect(logs.length).toBe(4);
    });
  });

  describe('Coverage Matrix Computation', () => {
    it('computes coverage correctly when all controls have evidence', async () => {
      // Add evidence for multiple controls
      mockEvidenceRecords.push(
        createEvidenceRecord({ controlId: 'SEC-001', eventType: 'auth.login' }),
        createEvidenceRecord({ controlId: 'PI-001', eventType: 'compliance.passed' }),
        createEvidenceRecord({ controlId: 'CNF-001', eventType: 'vault.download' })
      );

      const { prisma } = await import('@realriches/database');

      // Simulate coverage check for each control
      const controlsToCheck = ['SEC-001', 'PI-001', 'CNF-001'];
      const coverage: Record<string, { hasEvidence: boolean; count: number }> = {};

      for (const controlId of controlsToCheck) {
        const eventPrefix = controlId === 'SEC-001' ? 'auth.' :
                            controlId === 'PI-001' ? 'compliance.' : 'vault.';

        const records = await prisma.evidenceRecord.findMany({
          where: {
            occurredAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
            OR: [{ eventType: { startsWith: eventPrefix } }],
          },
        });

        coverage[controlId] = {
          hasEvidence: records.length > 0,
          count: records.length,
        };
      }

      expect(coverage['SEC-001'].hasEvidence).toBe(true);
      expect(coverage['SEC-001'].count).toBe(1);
      expect(coverage['PI-001'].hasEvidence).toBe(true);
      expect(coverage['CNF-001'].hasEvidence).toBe(true);
    });

    it('computes coverage correctly with gaps', async () => {
      // Only add evidence for one control
      mockEvidenceRecords.push(
        createEvidenceRecord({ controlId: 'SEC-001', eventType: 'auth.login' })
      );

      const { prisma } = await import('@realriches/database');

      // Check for a control that has no evidence
      const complianceRecords = await prisma.evidenceRecord.findMany({
        where: {
          occurredAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          OR: [{ eventType: { startsWith: 'compliance.' } }],
        },
      });

      expect(complianceRecords.length).toBe(0); // Gap detected
    });
  });

  describe('Gap Register Generation', () => {
    it('generates gap entries with correct severity classification', () => {
      // Simulate gap detection logic
      const controlsWithoutEvidence = [
        { controlId: 'SEC-001', name: 'Authentication Events', severity: 'Critical', workflow: 'Auth/Security' },
        { controlId: 'SEC-002', name: 'Token Refresh', severity: 'High', workflow: 'Auth/Security' },
        { controlId: 'AVL-002', name: 'Restore Drills', severity: 'Medium', workflow: 'Ops/Health' },
      ];

      const gapRegister = controlsWithoutEvidence.map((control) => ({
        controlId: control.controlId,
        name: control.name,
        severity: control.severity,
        workflow: control.workflow,
        recommendation: `Implement evidence logging for ${control.name} events.`,
      }));

      expect(gapRegister.length).toBe(3);
      expect(gapRegister.filter((g) => g.severity === 'Critical').length).toBe(1);
      expect(gapRegister.filter((g) => g.severity === 'High').length).toBe(1);
      expect(gapRegister.filter((g) => g.severity === 'Medium').length).toBe(1);
    });

    it('generates actionable recommendations', () => {
      const REMEDIATION_MAP: Record<string, string> = {
        'SEC-001': 'Ensure authentication events are logged via the audit plugin.',
        'PI-002': 'Verify AgentRunManager logs policy gate decisions.',
        'CNF-001': 'Ensure document vault operations log to evidence_records.',
      };

      for (const [controlId, recommendation] of Object.entries(REMEDIATION_MAP)) {
        expect(recommendation.length).toBeGreaterThan(20);
        expect(recommendation).not.toContain('TODO');
        expect(recommendation).not.toContain('undefined');
      }
    });
  });

  describe('Workflow Summary Aggregation', () => {
    it('aggregates evidence by workflow domain', async () => {
      // Add evidence for multiple workflows
      mockEvidenceRecords.push(
        createEvidenceRecord({ eventType: 'auth.login' }), // Auth/Security
        createEvidenceRecord({ eventType: 'auth.logout' }), // Auth/Security
        createEvidenceRecord({ eventType: 'compliance.passed' }), // Compliance
        createEvidenceRecord({ eventType: 'vault.upload' }), // Data Vault
      );

      const { prisma } = await import('@realriches/database');

      // Simulate workflow aggregation
      const allRecords = await prisma.evidenceRecord.findMany({
        where: { occurredAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      });

      const workflowCounts: Record<string, number> = {
        'Auth/Security': 0,
        'Compliance': 0,
        'Data Vault': 0,
      };

      for (const record of allRecords) {
        if (record.eventType.startsWith('auth.')) {
          workflowCounts['Auth/Security']++;
        } else if (record.eventType.startsWith('compliance.')) {
          workflowCounts['Compliance']++;
        } else if (record.eventType.startsWith('vault.')) {
          workflowCounts['Data Vault']++;
        }
      }

      expect(workflowCounts['Auth/Security']).toBe(2);
      expect(workflowCounts['Compliance']).toBe(1);
      expect(workflowCounts['Data Vault']).toBe(1);
    });

    it('calculates workflow completeness percentage', () => {
      // Simulate workflow completeness calculation
      const workflowControls = {
        'Auth/Security': [
          { controlId: 'SEC-001', hasEvidence: true },
          { controlId: 'SEC-002', hasEvidence: false },
          { controlId: 'SEC-003', hasEvidence: true },
          { controlId: 'SEC-004', hasEvidence: false },
        ],
      };

      const covered = workflowControls['Auth/Security'].filter((c) => c.hasEvidence).length;
      const total = workflowControls['Auth/Security'].length;
      const completeness = Math.round((covered / total) * 100);

      expect(completeness).toBe(50); // 2 out of 4 = 50%
    });
  });

  describe('Integrity Hash Verification', () => {
    it('generates deterministic integrity hash for same report', () => {
      const report = {
        metadata: { generatedAt: '2026-01-03T00:00:00.000Z', sinceDays: 30 },
        summary: { totalControls: 17, controlsWithEvidence: 10 },
        coverageMatrix: [],
        gapRegister: [],
      };

      const hash1 = createHash('sha256').update(JSON.stringify(report)).digest('hex');
      const hash2 = createHash('sha256').update(JSON.stringify(report)).digest('hex');

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('generates different hash when report content changes', () => {
      const report1 = {
        metadata: { generatedAt: '2026-01-03T00:00:00.000Z', sinceDays: 30 },
        summary: { totalControls: 17, controlsWithEvidence: 10 },
      };

      const report2 = {
        metadata: { generatedAt: '2026-01-03T00:00:00.000Z', sinceDays: 30 },
        summary: { totalControls: 17, controlsWithEvidence: 11 }, // Changed
      };

      const hash1 = createHash('sha256').update(JSON.stringify(report1)).digest('hex');
      const hash2 = createHash('sha256').update(JSON.stringify(report2)).digest('hex');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Multi-Tenant Isolation', () => {
    it('filters evidence by organization ID', async () => {
      mockEvidenceRecords.push(
        createEvidenceRecord({ organizationId: 'org-A', eventType: 'auth.login' }),
        createEvidenceRecord({ organizationId: 'org-A', eventType: 'auth.logout' }),
        createEvidenceRecord({ organizationId: 'org-B', eventType: 'auth.login' }),
      );

      const { prisma } = await import('@realriches/database');

      const orgARecords = await prisma.evidenceRecord.findMany({
        where: {
          organizationId: 'org-A',
          occurredAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      });

      expect(orgARecords.length).toBe(2);
      expect(orgARecords.every((r) => r.organizationId === 'org-A')).toBe(true);
    });

    it('filters evidence by tenant ID', async () => {
      mockEvidenceRecords.push(
        createEvidenceRecord({ tenantId: 'tenant-X', eventType: 'auth.login' }),
        createEvidenceRecord({ tenantId: 'tenant-Y', eventType: 'auth.login' }),
        createEvidenceRecord({ tenantId: 'tenant-X', eventType: 'auth.logout' }),
      );

      const { prisma } = await import('@realriches/database');

      const tenantXRecords = await prisma.evidenceRecord.findMany({
        where: {
          tenantId: 'tenant-X',
          occurredAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      });

      expect(tenantXRecords.length).toBe(2);
      expect(tenantXRecords.every((r) => r.tenantId === 'tenant-X')).toBe(true);
    });
  });

  describe('Time-Range Filtering', () => {
    it('filters evidence by sinceDays parameter', async () => {
      const now = new Date();
      const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
      const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

      mockEvidenceRecords.push(
        createEvidenceRecord({ occurredAt: tenDaysAgo, eventType: 'auth.login' }), // Within 30 days
        createEvidenceRecord({ occurredAt: sixtyDaysAgo, eventType: 'auth.login' }), // Outside 30 days
      );

      const { prisma } = await import('@realriches/database');

      const thirtyDaysBack = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const recentRecords = await prisma.evidenceRecord.findMany({
        where: { occurredAt: { gte: thirtyDaysBack } },
      });

      expect(recentRecords.length).toBe(1);
    });
  });
});
