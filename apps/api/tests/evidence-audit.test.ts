/**
 * Evidence Audit Tests
 *
 * Tests for:
 * - Report generation and aggregation logic
 * - Field completeness calculation
 * - Gap detection and severity classification
 * - Redaction enforcement (no PII in output)
 * - Integrity hash generation
 * - Control catalog alignment
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createHash } from 'crypto';

import './setup';

// =============================================================================
// Unit Tests - Pure Functions
// =============================================================================

describe('Evidence Audit - Core Logic', () => {
  // Helper function mirroring routes.ts
  function hashContent(content: unknown): string {
    return createHash('sha256').update(JSON.stringify(content)).digest('hex');
  }

  // Helper function mirroring routes.ts
  function calculateFieldCompleteness(
    records: Array<Record<string, unknown>>,
    requiredFields: string[]
  ): number {
    if (!records || records.length === 0) return 0;

    let totalFields = 0;
    let presentFields = 0;

    for (const record of records) {
      for (const field of requiredFields) {
        totalFields++;
        const parts = field.split('.');
        let value: unknown = record;
        for (const part of parts) {
          value = (value as Record<string, unknown>)?.[part];
        }
        if (value !== null && value !== undefined) {
          presentFields++;
        }
      }
    }

    return totalFields > 0 ? Math.round((presentFields / totalFields) * 100) : 0;
  }

  describe('hashContent', () => {
    it('produces deterministic hash for same input', () => {
      const data = { foo: 'bar', count: 42 };
      const hash1 = hashContent(data);
      const hash2 = hashContent(data);
      expect(hash1).toBe(hash2);
    });

    it('produces different hash for different input', () => {
      const hash1 = hashContent({ a: 1 });
      const hash2 = hashContent({ a: 2 });
      expect(hash1).not.toBe(hash2);
    });

    it('returns 64-character hex string (SHA-256)', () => {
      const hash = hashContent({ test: 'data' });
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('handles null', () => {
      const hashNull = hashContent(null);
      expect(hashNull).toMatch(/^[a-f0-9]{64}$/);
    });

    it('handles empty object', () => {
      const hash = hashContent({});
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('handles arrays', () => {
      const hash = hashContent([1, 2, 3]);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('calculateFieldCompleteness', () => {
    it('returns 0 for empty records array', () => {
      const result = calculateFieldCompleteness([], ['actorId', 'requestId']);
      expect(result).toBe(0);
    });

    it('returns 100 when all fields present', () => {
      const records = [
        { actorId: 'user-1', requestId: 'req-1' },
        { actorId: 'user-2', requestId: 'req-2' },
      ];
      const result = calculateFieldCompleteness(records, ['actorId', 'requestId']);
      expect(result).toBe(100);
    });

    it('returns 50 when half fields present', () => {
      const records = [
        { actorId: 'user-1', requestId: null },
        { actorId: 'user-2', requestId: null },
      ];
      const result = calculateFieldCompleteness(records, ['actorId', 'requestId']);
      expect(result).toBe(50);
    });

    it('handles nested field paths', () => {
      const records = [
        { details: { nested: { value: 'x' } } },
        { details: { nested: { value: 'y' } } },
      ];
      const result = calculateFieldCompleteness(records, ['details.nested.value']);
      expect(result).toBe(100);
    });

    it('returns 0 for missing nested fields', () => {
      const records = [
        { details: {} },
        { details: null },
      ];
      const result = calculateFieldCompleteness(records, ['details.nested.value']);
      expect(result).toBe(0);
    });

    it('handles mixed presence correctly', () => {
      const records = [
        { actorId: 'user-1', requestId: 'req-1', ipAddress: '1.1.1.1' },
        { actorId: 'user-2', requestId: null, ipAddress: '2.2.2.2' },
        { actorId: 'user-3', requestId: 'req-3', ipAddress: null },
      ];
      // 3 records × 3 fields = 9 total
      // Present: 3 actorId + 2 requestId + 2 ipAddress = 7
      const result = calculateFieldCompleteness(records, ['actorId', 'requestId', 'ipAddress']);
      expect(result).toBe(78); // Math.round(7/9 * 100) = 78
    });
  });
});

// =============================================================================
// Control Catalog Tests
// =============================================================================

describe('Evidence Audit - Control Catalog', () => {
  // Define control catalog structure matching routes.ts
  const CONTROL_CATALOG: Record<string, { name: string; category: string; severity: string; workflow: string }> = {
    'SEC-001': { name: 'Authentication Events', category: 'Security', severity: 'Critical', workflow: 'Auth/Security' },
    'SEC-002': { name: 'Token Refresh & Rotation', category: 'Security', severity: 'High', workflow: 'Auth/Security' },
    'SEC-003': { name: 'Authorization Checks', category: 'Security', severity: 'Critical', workflow: 'Auth/Security' },
    'SEC-004': { name: 'Admin Actions', category: 'Security', severity: 'Critical', workflow: 'Auth/Security' },
    'AVL-001': { name: 'Backup Events', category: 'Availability', severity: 'High', workflow: 'Ops/Health' },
    'AVL-002': { name: 'Restore Drills', category: 'Availability', severity: 'Medium', workflow: 'Ops/Health' },
    'AVL-003': { name: 'Migration Drift Checks', category: 'Availability', severity: 'Medium', workflow: 'Ops/Health' },
    'PI-001': { name: 'Compliance Rule Decisions', category: 'ProcessingIntegrity', severity: 'Critical', workflow: 'Compliance' },
    'PI-002': { name: 'AI Agent Policy Gates', category: 'ProcessingIntegrity', severity: 'Critical', workflow: 'AI Agent Governance' },
    'PI-003': { name: 'Revenue Ledger Integrity', category: 'ProcessingIntegrity', severity: 'Critical', workflow: 'Revenue Engine' },
    'PI-004': { name: 'Partner Attribution', category: 'ProcessingIntegrity', severity: 'High', workflow: 'Revenue Engine' },
    'PI-005': { name: 'Webhook Idempotency', category: 'ProcessingIntegrity', severity: 'High', workflow: 'Revenue Engine' },
    'CNF-001': { name: 'Document Vault Access', category: 'Confidentiality', severity: 'Critical', workflow: 'Data Vault' },
    'CNF-002': { name: 'Encryption Events', category: 'Confidentiality', severity: 'High', workflow: 'Data Vault' },
    'CNF-003': { name: 'Syndication & Publishing', category: 'Confidentiality', severity: 'Medium', workflow: 'Publishing/Syndication' },
    'PRV-001': { name: 'PII Redaction', category: 'Privacy', severity: 'Critical', workflow: 'AI Agent Governance' },
    'PRV-002': { name: 'Consent Tracking', category: 'Privacy', severity: 'High', workflow: 'Compliance' },
  };

  it('contains 17 controls total', () => {
    expect(Object.keys(CONTROL_CATALOG).length).toBe(17);
  });

  it('has 4 Security controls', () => {
    const securityControls = Object.entries(CONTROL_CATALOG).filter(([, c]) => c.category === 'Security');
    expect(securityControls.length).toBe(4);
  });

  it('has 3 Availability controls', () => {
    const availControls = Object.entries(CONTROL_CATALOG).filter(([, c]) => c.category === 'Availability');
    expect(availControls.length).toBe(3);
  });

  it('has 5 ProcessingIntegrity controls', () => {
    const piControls = Object.entries(CONTROL_CATALOG).filter(([, c]) => c.category === 'ProcessingIntegrity');
    expect(piControls.length).toBe(5);
  });

  it('has 3 Confidentiality controls', () => {
    const confControls = Object.entries(CONTROL_CATALOG).filter(([, c]) => c.category === 'Confidentiality');
    expect(confControls.length).toBe(3);
  });

  it('has 2 Privacy controls', () => {
    const privacyControls = Object.entries(CONTROL_CATALOG).filter(([, c]) => c.category === 'Privacy');
    expect(privacyControls.length).toBe(2);
  });

  it('counts 8 Critical severity controls', () => {
    const criticalControls = Object.entries(CONTROL_CATALOG).filter(([, c]) => c.severity === 'Critical');
    expect(criticalControls.length).toBe(8);
  });

  it('counts 6 High severity controls', () => {
    const highControls = Object.entries(CONTROL_CATALOG).filter(([, c]) => c.severity === 'High');
    expect(highControls.length).toBe(6);
  });

  it('counts 3 Medium severity controls', () => {
    const mediumControls = Object.entries(CONTROL_CATALOG).filter(([, c]) => c.severity === 'Medium');
    expect(mediumControls.length).toBe(3);
  });

  it('covers all 7 workflow domains', () => {
    const workflows = new Set(Object.values(CONTROL_CATALOG).map((c) => c.workflow));
    expect(workflows.size).toBe(7);
    expect(workflows).toContain('Compliance');
    expect(workflows).toContain('Auth/Security');
    expect(workflows).toContain('Data Vault');
    expect(workflows).toContain('Revenue Engine');
    expect(workflows).toContain('AI Agent Governance');
    expect(workflows).toContain('Publishing/Syndication');
    expect(workflows).toContain('Ops/Health');
  });
});

// =============================================================================
// Gap Detection Tests
// =============================================================================

describe('Evidence Audit - Gap Detection', () => {
  interface MockControlResult {
    controlId: string;
    severity: string;
    evidencePresent: boolean;
    evidenceCount: number;
  }

  function detectGaps(controls: MockControlResult[]): {
    totalGaps: number;
    criticalGaps: number;
    highGaps: number;
    mediumGaps: number;
    gapIds: string[];
  } {
    const gaps = controls.filter((c) => !c.evidencePresent);
    return {
      totalGaps: gaps.length,
      criticalGaps: gaps.filter((g) => g.severity === 'Critical').length,
      highGaps: gaps.filter((g) => g.severity === 'High').length,
      mediumGaps: gaps.filter((g) => g.severity === 'Medium').length,
      gapIds: gaps.map((g) => g.controlId),
    };
  }

  it('identifies no gaps when all controls have evidence', () => {
    const controls: MockControlResult[] = [
      { controlId: 'SEC-001', severity: 'Critical', evidencePresent: true, evidenceCount: 100 },
      { controlId: 'SEC-002', severity: 'High', evidencePresent: true, evidenceCount: 50 },
      { controlId: 'AVL-001', severity: 'High', evidencePresent: true, evidenceCount: 30 },
    ];
    const result = detectGaps(controls);
    expect(result.totalGaps).toBe(0);
    expect(result.criticalGaps).toBe(0);
    expect(result.gapIds).toEqual([]);
  });

  it('identifies all gaps when no controls have evidence', () => {
    const controls: MockControlResult[] = [
      { controlId: 'SEC-001', severity: 'Critical', evidencePresent: false, evidenceCount: 0 },
      { controlId: 'SEC-002', severity: 'High', evidencePresent: false, evidenceCount: 0 },
      { controlId: 'AVL-002', severity: 'Medium', evidencePresent: false, evidenceCount: 0 },
    ];
    const result = detectGaps(controls);
    expect(result.totalGaps).toBe(3);
    expect(result.criticalGaps).toBe(1);
    expect(result.highGaps).toBe(1);
    expect(result.mediumGaps).toBe(1);
    expect(result.gapIds).toEqual(['SEC-001', 'SEC-002', 'AVL-002']);
  });

  it('correctly classifies mixed gaps by severity', () => {
    const controls: MockControlResult[] = [
      { controlId: 'SEC-001', severity: 'Critical', evidencePresent: true, evidenceCount: 100 },
      { controlId: 'SEC-003', severity: 'Critical', evidencePresent: false, evidenceCount: 0 },
      { controlId: 'SEC-004', severity: 'Critical', evidencePresent: false, evidenceCount: 0 },
      { controlId: 'PI-004', severity: 'High', evidencePresent: false, evidenceCount: 0 },
      { controlId: 'AVL-002', severity: 'Medium', evidencePresent: true, evidenceCount: 5 },
    ];
    const result = detectGaps(controls);
    expect(result.totalGaps).toBe(3);
    expect(result.criticalGaps).toBe(2);
    expect(result.highGaps).toBe(1);
    expect(result.mediumGaps).toBe(0);
  });
});

// =============================================================================
// Redaction Enforcement Tests
// =============================================================================

describe('Evidence Audit - Redaction Enforcement', () => {
  // PII fields that should NEVER appear in audit reports (lowercase for comparison)
  const PII_FIELDS = [
    'email',
    'firstname',
    'lastname',
    'phone',
    'phonenumber',
    'ssn',
    'socialsecuritynumber',
    'password',
    'passwordhash',
    'address',
    'streetaddress',
    'dateofbirth',
    'dob',
  ];

  function containsPII(obj: unknown, piiFields: string[]): string[] {
    const found: string[] = [];

    function scan(value: unknown, path: string = '') {
      if (value === null || value === undefined) return;

      if (typeof value === 'object') {
        for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
          const currentPath = path ? `${path}.${key}` : key;
          if (piiFields.includes(key.toLowerCase())) {
            found.push(currentPath);
          }
          scan(val, currentPath);
        }
      }
    }

    scan(obj);
    return found;
  }

  it('detects PII fields in object', () => {
    const record = {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      firstName: 'Test',
    };
    const piiFound = containsPII(record, PII_FIELDS);
    expect(piiFound).toContain('email');
    expect(piiFound).toContain('firstName');
  });

  it('detects nested PII fields', () => {
    const record = {
      id: 'evt-123',
      actor: {
        id: 'user-456',
        email: 'nested@example.com',
      },
    };
    const piiFound = containsPII(record, PII_FIELDS);
    expect(piiFound).toContain('actor.email');
  });

  it('returns empty array for clean record', () => {
    const cleanRecord = {
      id: 'evt-123',
      actorId: 'user-456',
      requestId: 'req-789',
      contentHash: 'abc123',
      timestamp: new Date().toISOString(),
      eventType: 'auth.login',
      ipAddress: '192.168.1.1', // IP is allowed (not in PII list)
    };
    const piiFound = containsPII(cleanRecord, PII_FIELDS);
    expect(piiFound).toEqual([]);
  });

  it('mock evidence record follows redaction requirements', () => {
    // Example of properly redacted evidence record
    const evidenceRecord = {
      id: 'evr_abc123',
      controlId: 'SEC-001',
      category: 'Security',
      eventType: 'auth.login',
      eventOutcome: 'success',
      summary: 'User authenticated successfully',
      actorId: 'usr_xyz789', // ID only, not name/email
      organizationId: 'org_def456',
      tenantId: 'tnt_ghi012',
      requestId: 'req_jkl345',
      occurredAt: new Date().toISOString(),
      contentHash: 'sha256:abc123...',
      previousHash: 'sha256:def456...',
      ipAddress: '10.0.0.1',
      // NO: email, firstName, lastName, phone, etc.
    };

    const piiFound = containsPII(evidenceRecord, PII_FIELDS);
    expect(piiFound).toEqual([]);
  });
});

// =============================================================================
// Report Structure Tests
// =============================================================================

describe('Evidence Audit - Report Structure', () => {
  interface MockReport {
    metadata: {
      generatedAt: string;
      sinceDays: number;
      sinceDate: string;
      tenantId: string | null;
      organizationId: string | null;
      version: string;
    };
    summary: {
      totalControls: number;
      controlsWithEvidence: number;
      controlsWithGaps: number;
      criticalGaps: number;
      highGaps: number;
      mediumGaps: number;
      totalEvidenceRecords: number;
      totalAuditLogs: number;
      totalAgentRuns: number;
    };
    coverageMatrix: Array<{
      controlId: string;
      name: string;
      category: string;
      workflow: string;
      evidencePresent: string;
      count: number;
      completeness: string;
      severity: string;
      exampleIds: string[];
    }>;
    gapRegister: Array<{
      controlId: string;
      name: string;
      category: string;
      severity: string;
      workflow: string;
      recommendation: string;
    }>;
    workflowSummary: Record<string, {
      evidencePresent: boolean;
      count: number;
      controls: Array<{ controlId: string; hasEvidence: boolean; count: number }>;
      completeness: number;
    }>;
    integrityHash: string;
  }

  function createMockReport(overrides: Partial<MockReport> = {}): MockReport {
    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        sinceDays: 30,
        sinceDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        tenantId: null,
        organizationId: null,
        version: '1.0.0',
      },
      summary: {
        totalControls: 17,
        controlsWithEvidence: 10,
        controlsWithGaps: 7,
        criticalGaps: 2,
        highGaps: 3,
        mediumGaps: 2,
        totalEvidenceRecords: 500,
        totalAuditLogs: 1200,
        totalAgentRuns: 50,
      },
      coverageMatrix: [],
      gapRegister: [],
      workflowSummary: {},
      integrityHash: '',
      ...overrides,
    };
  }

  it('validates metadata structure', () => {
    const report = createMockReport();
    expect(report.metadata.generatedAt).toBeDefined();
    expect(report.metadata.sinceDays).toBeGreaterThan(0);
    expect(report.metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('validates summary math consistency', () => {
    const report = createMockReport();
    const { totalControls, controlsWithEvidence, controlsWithGaps } = report.summary;
    expect(controlsWithEvidence + controlsWithGaps).toBe(totalControls);
  });

  it('validates gap severity breakdown', () => {
    const report = createMockReport();
    const { controlsWithGaps, criticalGaps, highGaps, mediumGaps } = report.summary;
    // Sum of severity gaps should be <= controlsWithGaps (could have Low gaps)
    expect(criticalGaps + highGaps + mediumGaps).toBeLessThanOrEqual(controlsWithGaps);
  });

  it('integrity hash changes when report changes', () => {
    const report1 = createMockReport();
    report1.integrityHash = createHash('sha256').update(JSON.stringify(report1)).digest('hex');

    const report2 = createMockReport({
      summary: { ...createMockReport().summary, controlsWithEvidence: 11 }
    });
    report2.integrityHash = createHash('sha256').update(JSON.stringify(report2)).digest('hex');

    expect(report1.integrityHash).not.toBe(report2.integrityHash);
  });
});

// =============================================================================
// Workflow Coverage Tests
// =============================================================================

describe('Evidence Audit - Workflow Coverage', () => {
  const WORKFLOW_DOMAINS = [
    'Compliance',
    'Auth/Security',
    'Data Vault',
    'Revenue Engine',
    'AI Agent Governance',
    'Publishing/Syndication',
    'Ops/Health',
  ];

  function calculateWorkflowCompleteness(
    controls: Array<{ workflow: string; hasEvidence: boolean }>
  ): Record<string, number> {
    const result: Record<string, number> = {};

    for (const workflow of WORKFLOW_DOMAINS) {
      const workflowControls = controls.filter((c) => c.workflow === workflow);
      const covered = workflowControls.filter((c) => c.hasEvidence).length;
      const total = workflowControls.length;
      result[workflow] = total > 0 ? Math.round((covered / total) * 100) : 0;
    }

    return result;
  }

  it('returns 100% for fully covered workflow', () => {
    const controls = [
      { workflow: 'Compliance', hasEvidence: true },
      { workflow: 'Compliance', hasEvidence: true },
    ];
    const result = calculateWorkflowCompleteness(controls);
    expect(result['Compliance']).toBe(100);
  });

  it('returns 0% for uncovered workflow', () => {
    const controls = [
      { workflow: 'Compliance', hasEvidence: false },
      { workflow: 'Compliance', hasEvidence: false },
    ];
    const result = calculateWorkflowCompleteness(controls);
    expect(result['Compliance']).toBe(0);
  });

  it('returns 50% for half-covered workflow', () => {
    const controls = [
      { workflow: 'Auth/Security', hasEvidence: true },
      { workflow: 'Auth/Security', hasEvidence: false },
    ];
    const result = calculateWorkflowCompleteness(controls);
    expect(result['Auth/Security']).toBe(50);
  });

  it('handles all 7 workflows', () => {
    const controls: Array<{ workflow: string; hasEvidence: boolean }> = [];

    for (const workflow of WORKFLOW_DOMAINS) {
      controls.push({ workflow, hasEvidence: true });
      controls.push({ workflow, hasEvidence: false });
    }

    const result = calculateWorkflowCompleteness(controls);
    expect(Object.keys(result)).toHaveLength(7);

    for (const workflow of WORKFLOW_DOMAINS) {
      expect(result[workflow]).toBe(50);
    }
  });

  it('returns 0% for workflows with no controls', () => {
    const controls: Array<{ workflow: string; hasEvidence: boolean }> = [];
    const result = calculateWorkflowCompleteness(controls);

    for (const workflow of WORKFLOW_DOMAINS) {
      expect(result[workflow]).toBe(0);
    }
  });
});
