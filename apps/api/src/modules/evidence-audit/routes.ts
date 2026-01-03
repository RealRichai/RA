/**
 * Evidence Audit Routes
 *
 * API routes for generating investor-grade evidence audit reports.
 * Provides coverage matrix, gap analysis, and artifact generation.
 *
 * @module evidence-audit
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createHash } from 'crypto';

import { prisma } from '@realriches/database';

// =============================================================================
// Types & Schemas
// =============================================================================

const EvidenceAuditQuerySchema = z.object({
  sinceDays: z.coerce.number().int().min(1).max(365).default(30),
  organizationId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
});

type EvidenceAuditQuery = z.infer<typeof EvidenceAuditQuerySchema>;

interface ControlDefinition {
  name: string;
  category: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  workflow: string;
  eventPatterns: string[];
  auditActions?: string[];
  entityTypes?: string[];
  requiredFields: string[];
  useAgentRuns?: boolean;
}

interface ControlResult {
  controlId: string;
  name: string;
  category: string;
  severity: string;
  workflow: string;
  evidencePresent: boolean;
  evidenceCount: number;
  evidenceRecordCount: number;
  auditLogCount: number;
  agentRunCount: number;
  fieldCompleteness: number;
  exampleEventIds: string[];
  requiredFields: string[];
}

interface GapEntry {
  controlId: string;
  name: string;
  category: string;
  severity: string;
  workflow: string;
  recommendation: string;
}

interface WorkflowSummary {
  evidencePresent: boolean;
  count: number;
  controls: Array<{ controlId: string; hasEvidence: boolean; count: number }>;
  completeness: number;
}

interface EvidenceAuditReport {
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
  controlDetails: Record<string, ControlResult>;
  gapRegister: GapEntry[];
  workflowSummary: Record<string, WorkflowSummary>;
  integrityHash: string;
}

// =============================================================================
// Control Catalog (aligned with EVIDENCE_CONTROL_CATALOG.md)
// =============================================================================

const CONTROL_CATALOG: Record<string, ControlDefinition> = {
  // Security Controls
  'SEC-001': {
    name: 'Authentication Events',
    category: 'Security',
    severity: 'Critical',
    eventPatterns: ['auth.login', 'auth.logout', 'auth.failed', 'auth.mfa_verified'],
    auditActions: ['login', 'logout', 'login_failed', 'mfa_verify'],
    requiredFields: ['actorId', 'ipAddress', 'requestId', 'timestamp'],
    workflow: 'Auth/Security',
  },
  'SEC-002': {
    name: 'Token Refresh & Rotation',
    category: 'Security',
    severity: 'High',
    eventPatterns: ['auth.token_refresh', 'auth.token_revoked', 'auth.session_ended'],
    auditActions: ['token_refresh', 'token_revoke', 'session_end'],
    requiredFields: ['actorId', 'requestId', 'timestamp'],
    workflow: 'Auth/Security',
  },
  'SEC-003': {
    name: 'Authorization Checks',
    category: 'Security',
    severity: 'Critical',
    eventPatterns: ['authz.granted', 'authz.denied', 'authz.role_changed'],
    auditActions: ['authz.'],
    entityTypes: ['permission', 'role'],
    requiredFields: ['actorId', 'requestId'],
    workflow: 'Auth/Security',
  },
  'SEC-004': {
    name: 'Admin Actions',
    category: 'Security',
    severity: 'Critical',
    eventPatterns: ['admin.impersonate', 'admin.settings_changed', 'admin.role_modified'],
    auditActions: ['admin.', 'role_', 'impersonate'],
    requiredFields: ['actorId', 'action', 'entityType', 'entityId', 'requestId'],
    workflow: 'Auth/Security',
  },

  // Availability Controls
  'AVL-001': {
    name: 'Backup Events',
    category: 'Availability',
    severity: 'High',
    eventPatterns: ['ops.backup_started', 'ops.backup_completed', 'ops.backup_failed'],
    requiredFields: ['controlId', 'eventType', 'eventOutcome'],
    workflow: 'Ops/Health',
  },
  'AVL-002': {
    name: 'Restore Drills',
    category: 'Availability',
    severity: 'Medium',
    eventPatterns: ['ops.restore_drill_started', 'ops.restore_drill_completed'],
    requiredFields: ['controlId', 'eventType', 'eventOutcome'],
    workflow: 'Ops/Health',
  },
  'AVL-003': {
    name: 'Migration Drift Checks',
    category: 'Availability',
    severity: 'Medium',
    eventPatterns: ['ops.migration_check', 'ops.drift_detected'],
    requiredFields: ['controlId', 'eventType', 'eventOutcome'],
    workflow: 'Ops/Health',
  },

  // Processing Integrity Controls
  'PI-001': {
    name: 'Compliance Rule Decisions',
    category: 'ProcessingIntegrity',
    severity: 'Critical',
    eventPatterns: ['compliance.rule_evaluated', 'compliance.passed', 'compliance.blocked'],
    requiredFields: ['controlId', 'requestId'],
    workflow: 'Compliance',
  },
  'PI-002': {
    name: 'AI Agent Policy Gates',
    category: 'ProcessingIntegrity',
    severity: 'Critical',
    eventPatterns: ['agent.policy_passed', 'agent.policy_blocked', 'agent.tool_invoked'],
    requiredFields: ['agentType', 'status', 'requestId'],
    workflow: 'AI Agent Governance',
    useAgentRuns: true,
  },
  'PI-003': {
    name: 'Revenue Ledger Integrity',
    category: 'ProcessingIntegrity',
    severity: 'Critical',
    eventPatterns: ['revenue.posted', 'revenue.reconciled', 'revenue.adjusted'],
    requiredFields: ['requestId'],
    workflow: 'Revenue Engine',
  },
  'PI-004': {
    name: 'Partner Attribution',
    category: 'ProcessingIntegrity',
    severity: 'High',
    eventPatterns: ['attribution.calculated', 'attribution.verified'],
    requiredFields: ['requestId'],
    workflow: 'Revenue Engine',
  },
  'PI-005': {
    name: 'Webhook Idempotency',
    category: 'ProcessingIntegrity',
    severity: 'High',
    eventPatterns: ['webhook.received', 'webhook.processed', 'webhook.duplicate_rejected'],
    requiredFields: ['requestId'],
    workflow: 'Revenue Engine',
  },

  // Confidentiality Controls
  'CNF-001': {
    name: 'Document Vault Access',
    category: 'Confidentiality',
    severity: 'Critical',
    eventPatterns: ['vault.upload', 'vault.download', 'vault.acl_check', 'vault.signed_url_generated'],
    auditActions: ['document_'],
    entityTypes: ['document'],
    requiredFields: ['actorId', 'requestId'],
    workflow: 'Data Vault',
  },
  'CNF-002': {
    name: 'Encryption Events',
    category: 'Confidentiality',
    severity: 'High',
    eventPatterns: ['encryption.applied', 'encryption.verified'],
    requiredFields: ['entityType', 'entityId', 'contentHash'],
    workflow: 'Data Vault',
  },
  'CNF-003': {
    name: 'Syndication & Publishing',
    category: 'Confidentiality',
    severity: 'Medium',
    eventPatterns: ['syndication.attempted', 'syndication.blocked', 'syndication.channel_changed'],
    auditActions: ['syndicate', 'publish'],
    entityTypes: ['listing', 'syndication'],
    requiredFields: ['requestId'],
    workflow: 'Publishing/Syndication',
  },

  // Privacy Controls
  'PRV-001': {
    name: 'PII Redaction',
    category: 'Privacy',
    severity: 'Critical',
    eventPatterns: ['redaction.applied', 'redaction.pii_detected'],
    requiredFields: ['requestId'],
    workflow: 'AI Agent Governance',
    useAgentRuns: true,
  },
  'PRV-002': {
    name: 'Consent Tracking',
    category: 'Privacy',
    severity: 'High',
    eventPatterns: ['consent.granted', 'consent.withdrawn', 'consent.verified'],
    requiredFields: ['userId', 'timestamp'],
    workflow: 'Compliance',
  },
};

const WORKFLOW_DOMAINS = [
  'Compliance',
  'Auth/Security',
  'Data Vault',
  'Revenue Engine',
  'AI Agent Governance',
  'Publishing/Syndication',
  'Ops/Health',
];

const REMEDIATION_MAP: Record<string, string> = {
  'SEC-001': 'Ensure authentication events are logged via the audit plugin. Verify login/logout routes emit audit logs.',
  'SEC-002': 'Implement token refresh event logging in the auth service. Track all refresh token rotations.',
  'SEC-003': 'Add authorization decision logging to the authorize() decorator. Log both grants and denials.',
  'SEC-004': 'Verify all admin routes log to audit_logs. Check impersonation and settings change handlers.',
  'AVL-001': 'Schedule backup verification jobs and ensure they emit evidence_records with controlId AVL-001.',
  'AVL-002': 'Conduct monthly restore drills and log results to evidence_records.',
  'AVL-003': 'Add migration drift checks to CI/CD pipeline and log results.',
  'PI-001': 'Ensure compliance engine logs all rule evaluations to evidence_records.',
  'PI-002': 'Verify AgentRunManager logs policy gate decisions. Check policyCheckResult is populated.',
  'PI-003': 'Ensure revenue engine posts ledger entries with evidence logging.',
  'PI-004': 'Add attribution calculation logging to partner revenue service.',
  'PI-005': 'Verify webhook handler logs idempotency decisions.',
  'CNF-001': 'Ensure document vault operations log to evidence_records with vault.* event types.',
  'CNF-002': 'Add encryption event logging to document storage service.',
  'CNF-003': 'Add syndication attempt logging. Track dry-runs, blocks, and channel changes.',
  'PRV-001': 'Verify AgentRun records include redaction reports. Check redactAgentRun() is called.',
  'PRV-002': 'Implement consent tracking and log to evidence_records.',
};

// =============================================================================
// Helper Functions
// =============================================================================

function hashContent(content: unknown): string {
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

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

// =============================================================================
// Query Functions
// =============================================================================

async function queryEvidenceRecords(
  sinceDate: Date,
  control: ControlDefinition,
  organizationId?: string,
  tenantId?: string
): Promise<Array<Record<string, unknown>>> {
  const where: Record<string, unknown> = {
    occurredAt: { gte: sinceDate },
  };

  if (organizationId) where.organizationId = organizationId;
  if (tenantId) where.tenantId = tenantId;

  if (control.eventPatterns && control.eventPatterns.length > 0) {
    where.OR = control.eventPatterns.flatMap((pattern) => [
      { eventType: { startsWith: pattern.split('.')[0] + '.' } },
      { eventType: pattern },
    ]);
  }

  try {
    const records = await prisma.evidenceRecord.findMany({
      where,
      select: {
        id: true,
        controlId: true,
        category: true,
        eventType: true,
        eventOutcome: true,
        actorId: true,
        organizationId: true,
        tenantId: true,
        requestId: true,
        occurredAt: true,
        contentHash: true,
        previousHash: true,
        entityType: true,
        entityId: true,
      },
      orderBy: { occurredAt: 'desc' },
      take: 1000,
    });
    return records as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}

async function queryAuditLogs(
  sinceDate: Date,
  control: ControlDefinition
): Promise<Array<Record<string, unknown>>> {
  const where: Record<string, unknown> = {
    timestamp: { gte: sinceDate },
  };

  const actionFilters: Array<Record<string, unknown>> = [];

  if (control.auditActions) {
    for (const pattern of control.auditActions) {
      if (pattern.endsWith('.') || pattern.endsWith('_')) {
        actionFilters.push({ action: { startsWith: pattern } });
      } else {
        actionFilters.push({ action: pattern });
        actionFilters.push({ action: { contains: pattern } });
      }
    }
  }

  if (control.entityTypes) {
    for (const entityType of control.entityTypes) {
      actionFilters.push({ entityType });
    }
  }

  if (actionFilters.length > 0) {
    where.OR = actionFilters;
  }

  try {
    const logs = await prisma.auditLog.findMany({
      where,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        actorId: true,
        requestId: true,
        timestamp: true,
        ipAddress: true,
      },
      orderBy: { timestamp: 'desc' },
      take: 1000,
    });
    return logs as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}

async function queryAgentRuns(
  sinceDate: Date,
  organizationId?: string
): Promise<Array<Record<string, unknown>>> {
  const where: Record<string, unknown> = {
    createdAt: { gte: sinceDate },
  };

  if (organizationId) where.organizationId = organizationId;

  try {
    const runs = await prisma.agentRun.findMany({
      where,
      select: {
        id: true,
        agentType: true,
        model: true,
        provider: true,
        status: true,
        policyCheckResult: true,
        promptRedactionReport: true,
        outputRedactionReport: true,
        tokensTotal: true,
        cost: true,
        requestId: true,
        createdAt: true,
        marketId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    return runs as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}

// =============================================================================
// Report Generation
// =============================================================================

async function generateEvidenceAuditReport(
  query: EvidenceAuditQuery
): Promise<EvidenceAuditReport> {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - query.sinceDays);

  const report: EvidenceAuditReport = {
    metadata: {
      generatedAt: new Date().toISOString(),
      sinceDays: query.sinceDays,
      sinceDate: sinceDate.toISOString(),
      tenantId: query.tenantId ?? null,
      organizationId: query.organizationId ?? null,
      version: '1.0.0',
    },
    summary: {
      totalControls: Object.keys(CONTROL_CATALOG).length,
      controlsWithEvidence: 0,
      controlsWithGaps: 0,
      criticalGaps: 0,
      highGaps: 0,
      mediumGaps: 0,
      totalEvidenceRecords: 0,
      totalAuditLogs: 0,
      totalAgentRuns: 0,
    },
    coverageMatrix: [],
    controlDetails: {},
    gapRegister: [],
    workflowSummary: {},
    integrityHash: '',
  };

  // Initialize workflow summary
  for (const workflow of WORKFLOW_DOMAINS) {
    report.workflowSummary[workflow] = {
      evidencePresent: false,
      count: 0,
      controls: [],
      completeness: 0,
    };
  }

  // Query agent runs once (shared across AI-related controls)
  const agentRuns = await queryAgentRuns(sinceDate, query.organizationId);
  report.summary.totalAgentRuns = agentRuns.length;

  // Process each control
  for (const [controlId, control] of Object.entries(CONTROL_CATALOG)) {
    let records: Array<Record<string, unknown>> = [];
    let logs: Array<Record<string, unknown>> = [];
    let agentData: Array<Record<string, unknown>> = [];

    // Query evidence records
    records = await queryEvidenceRecords(
      sinceDate,
      control,
      query.organizationId,
      query.tenantId
    );

    // Query audit logs if applicable
    if (control.auditActions || control.entityTypes) {
      logs = await queryAuditLogs(sinceDate, control);
    }

    // Use agent runs for AI-related controls
    if (control.useAgentRuns) {
      if (controlId === 'PI-002') {
        agentData = agentRuns.filter(
          (r) => r.policyCheckResult !== null || r.status === 'blocked'
        );
      } else if (controlId === 'PRV-001') {
        agentData = agentRuns.filter(
          (r) => r.promptRedactionReport !== null || r.outputRedactionReport !== null
        );
      }
    }

    const totalCount = records.length + logs.length + agentData.length;
    const hasEvidence = totalCount > 0;

    // Calculate field completeness
    let completeness = 0;
    if (hasEvidence) {
      const allRecords = [
        ...records,
        ...logs.map((l) => ({ ...l, timestamp: l.timestamp })),
        ...agentData.map((a) => ({ ...a, timestamp: a.createdAt })),
      ];
      completeness = calculateFieldCompleteness(allRecords, control.requiredFields);
    }

    // Get example event IDs
    const exampleIds: string[] = [];
    if (records.length > 0) exampleIds.push(records[0].id as string);
    if (logs.length > 0) exampleIds.push(logs[0].id as string);
    if (agentData.length > 0) exampleIds.push(agentData[0].id as string);

    // Store control details
    report.controlDetails[controlId] = {
      controlId,
      name: control.name,
      category: control.category,
      severity: control.severity,
      workflow: control.workflow,
      evidencePresent: hasEvidence,
      evidenceCount: totalCount,
      evidenceRecordCount: records.length,
      auditLogCount: logs.length,
      agentRunCount: agentData.length,
      fieldCompleteness: completeness,
      exampleEventIds: exampleIds.slice(0, 3),
      requiredFields: control.requiredFields,
    };

    // Update summary
    if (hasEvidence) {
      report.summary.controlsWithEvidence++;
    } else {
      report.summary.controlsWithGaps++;
      if (control.severity === 'Critical') report.summary.criticalGaps++;
      else if (control.severity === 'High') report.summary.highGaps++;
      else if (control.severity === 'Medium') report.summary.mediumGaps++;

      report.gapRegister.push({
        controlId,
        name: control.name,
        category: control.category,
        severity: control.severity,
        workflow: control.workflow,
        recommendation: REMEDIATION_MAP[controlId] || `Implement evidence logging for ${control.name} events.`,
      });
    }

    // Update workflow summary
    if (report.workflowSummary[control.workflow]) {
      if (hasEvidence) {
        report.workflowSummary[control.workflow].evidencePresent = true;
      }
      report.workflowSummary[control.workflow].count += totalCount;
      report.workflowSummary[control.workflow].controls.push({
        controlId,
        hasEvidence,
        count: totalCount,
      });
    }

    report.summary.totalEvidenceRecords += records.length;
    report.summary.totalAuditLogs += logs.length;
  }

  // Build coverage matrix
  for (const [controlId, details] of Object.entries(report.controlDetails)) {
    report.coverageMatrix.push({
      controlId,
      name: details.name,
      category: details.category,
      workflow: details.workflow,
      evidencePresent: details.evidencePresent ? 'Yes' : 'No',
      count: details.evidenceCount,
      completeness: `${details.fieldCompleteness}%`,
      severity: details.severity,
      exampleIds: details.exampleEventIds,
    });
  }

  // Calculate workflow completeness
  for (const workflow of WORKFLOW_DOMAINS) {
    const ws = report.workflowSummary[workflow];
    const totalControls = ws.controls.length;
    const coveredControls = ws.controls.filter((c) => c.hasEvidence).length;
    ws.completeness = totalControls > 0 ? Math.round((coveredControls / totalControls) * 100) : 0;
  }

  // Generate integrity hash (excluding hash field itself)
  const { integrityHash: _, ...reportForHash } = report;
  report.integrityHash = hashContent(reportForHash);

  return report;
}

// =============================================================================
// Routes
// =============================================================================

export async function evidenceAuditRoutes(fastify: FastifyInstance) {
  // Admin + Auditor authentication
  const auditAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    await fastify.authenticate(request, reply);
    if (reply.sent) return;
    // Allow admin, super_admin, or auditor roles
    fastify.authorize(request, reply, { roles: ['admin', 'super_admin'] });
  };

  /**
   * GET /v1/admin/evidence-audit/report
   *
   * Generate a comprehensive evidence audit report.
   * Returns coverage matrix, gap analysis, and integrity hash.
   */
  fastify.get(
    '/admin/evidence-audit/report',
    {
      preHandler: [auditAuth],
      schema: {
        description: 'Generate investor-grade evidence audit report',
        tags: ['Evidence Audit'],
        querystring: EvidenceAuditQuerySchema,
        response: {
          200: z.object({
            metadata: z.object({
              generatedAt: z.string(),
              sinceDays: z.number(),
              sinceDate: z.string(),
              tenantId: z.string().nullable(),
              organizationId: z.string().nullable(),
              version: z.string(),
            }),
            summary: z.object({
              totalControls: z.number(),
              controlsWithEvidence: z.number(),
              controlsWithGaps: z.number(),
              criticalGaps: z.number(),
              highGaps: z.number(),
              mediumGaps: z.number(),
              totalEvidenceRecords: z.number(),
              totalAuditLogs: z.number(),
              totalAgentRuns: z.number(),
            }),
            coverageMatrix: z.array(z.object({
              controlId: z.string(),
              name: z.string(),
              category: z.string(),
              workflow: z.string(),
              evidencePresent: z.string(),
              count: z.number(),
              completeness: z.string(),
              severity: z.string(),
              exampleIds: z.array(z.string()),
            })),
            gapRegister: z.array(z.object({
              controlId: z.string(),
              name: z.string(),
              category: z.string(),
              severity: z.string(),
              workflow: z.string(),
              recommendation: z.string(),
            })),
            workflowSummary: z.record(z.object({
              evidencePresent: z.boolean(),
              count: z.number(),
              controls: z.array(z.object({
                controlId: z.string(),
                hasEvidence: z.boolean(),
                count: z.number(),
              })),
              completeness: z.number(),
            })),
            integrityHash: z.string(),
          }),
        },
      },
    },
    async (request, _reply) => {
      const query = EvidenceAuditQuerySchema.parse(request.query);
      return generateEvidenceAuditReport(query);
    }
  );

  /**
   * GET /v1/admin/evidence-audit/summary
   *
   * Get a quick summary of evidence coverage without full details.
   */
  fastify.get(
    '/admin/evidence-audit/summary',
    {
      preHandler: [auditAuth],
      schema: {
        description: 'Get evidence audit summary',
        tags: ['Evidence Audit'],
        querystring: EvidenceAuditQuerySchema,
        response: {
          200: z.object({
            sinceDays: z.number(),
            totalControls: z.number(),
            controlsWithEvidence: z.number(),
            controlsWithGaps: z.number(),
            criticalGaps: z.number(),
            workflowCoverage: z.record(z.number()),
            generatedAt: z.string(),
          }),
        },
      },
    },
    async (request, _reply) => {
      const query = EvidenceAuditQuerySchema.parse(request.query);
      const report = await generateEvidenceAuditReport(query);

      const workflowCoverage: Record<string, number> = {};
      for (const [workflow, data] of Object.entries(report.workflowSummary)) {
        workflowCoverage[workflow] = data.completeness;
      }

      return {
        sinceDays: query.sinceDays,
        totalControls: report.summary.totalControls,
        controlsWithEvidence: report.summary.controlsWithEvidence,
        controlsWithGaps: report.summary.controlsWithGaps,
        criticalGaps: report.summary.criticalGaps,
        workflowCoverage,
        generatedAt: report.metadata.generatedAt,
      };
    }
  );

  /**
   * GET /v1/admin/evidence-audit/gaps
   *
   * Get only the gap register for quick remediation planning.
   */
  fastify.get(
    '/admin/evidence-audit/gaps',
    {
      preHandler: [auditAuth],
      schema: {
        description: 'Get evidence gaps with remediation recommendations',
        tags: ['Evidence Audit'],
        querystring: EvidenceAuditQuerySchema,
        response: {
          200: z.object({
            totalGaps: z.number(),
            criticalGaps: z.number(),
            highGaps: z.number(),
            mediumGaps: z.number(),
            gaps: z.array(z.object({
              controlId: z.string(),
              name: z.string(),
              category: z.string(),
              severity: z.string(),
              workflow: z.string(),
              recommendation: z.string(),
            })),
          }),
        },
      },
    },
    async (request, _reply) => {
      const query = EvidenceAuditQuerySchema.parse(request.query);
      const report = await generateEvidenceAuditReport(query);

      return {
        totalGaps: report.summary.controlsWithGaps,
        criticalGaps: report.summary.criticalGaps,
        highGaps: report.summary.highGaps,
        mediumGaps: report.summary.mediumGaps,
        gaps: report.gapRegister,
      };
    }
  );
}

export default evidenceAuditRoutes;
