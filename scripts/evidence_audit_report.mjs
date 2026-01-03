#!/usr/bin/env node
/**
 * Evidence Audit Report Generator
 *
 * Generates an investor-grade report proving compliance, security, and operational
 * controls are logged as immutable evidence.
 *
 * Usage:
 *   node scripts/evidence_audit_report.mjs --sinceDays 30
 *   node scripts/evidence_audit_report.mjs --sinceDays 7 --output ./reports
 *
 * Output:
 *   - artifacts/evidence_audit_report.json
 *   - artifacts/evidence_audit_report.md
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

// =============================================================================
// Configuration
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const DEFAULT_OUTPUT_DIR = join(ROOT_DIR, 'artifacts');

// Control definitions aligned with EVIDENCE_CONTROL_CATALOG.md
const CONTROL_CATALOG = {
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

// Workflow domains for coverage matrix
const WORKFLOW_DOMAINS = [
  'Compliance',
  'Auth/Security',
  'Data Vault',
  'Revenue Engine',
  'AI Agent Governance',
  'Publishing/Syndication',
  'Ops/Health',
];

// =============================================================================
// Argument Parsing
// =============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    sinceDays: 30,
    outputDir: DEFAULT_OUTPUT_DIR,
    tenantId: null,
    organizationId: null,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--sinceDays' && args[i + 1]) {
      config.sinceDays = parseInt(args[++i], 10);
    } else if (arg === '--output' && args[i + 1]) {
      config.outputDir = args[++i];
    } else if (arg === '--tenantId' && args[i + 1]) {
      config.tenantId = args[++i];
    } else if (arg === '--organizationId' && args[i + 1]) {
      config.organizationId = args[++i];
    } else if (arg === '--verbose' || arg === '-v') {
      config.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Evidence Audit Report Generator

Usage:
  node scripts/evidence_audit_report.mjs [options]

Options:
  --sinceDays <n>       Number of days to look back (default: 30)
  --output <dir>        Output directory (default: ./artifacts)
  --tenantId <id>       Filter by tenant ID (optional)
  --organizationId <id> Filter by organization ID (optional)
  --verbose, -v         Verbose output
  --help, -h            Show this help message

Output:
  artifacts/evidence_audit_report.json
  artifacts/evidence_audit_report.md
`);
      process.exit(0);
    }
  }

  return config;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a deterministic hash for report integrity
 */
function hashContent(content) {
  return createHash('sha256').update(JSON.stringify(content)).digest('hex');
}

/**
 * Redact potential PII from a string
 */
function redactPII(value) {
  if (!value || typeof value !== 'string') return value;

  // Redact email patterns
  value = value.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');

  // Redact phone patterns
  value = value.replace(/(\+?1?[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[PHONE_REDACTED]');

  // Redact SSN patterns
  value = value.replace(/\d{3}-\d{2}-\d{4}/g, '[SSN_REDACTED]');

  return value;
}

/**
 * Safely extract a subset of fields from an object for reporting
 */
function safeExtract(obj, allowedFields) {
  if (!obj) return null;
  const result = {};
  for (const field of allowedFields) {
    if (obj[field] !== undefined) {
      const value = obj[field];
      // Only include IDs, hashes, timestamps, and safe metadata
      if (typeof value === 'string' && value.length > 100) {
        result[field] = `[TRUNCATED:${value.length}]`;
      } else {
        result[field] = value;
      }
    }
  }
  return result;
}

/**
 * Calculate field completeness percentage
 */
function calculateFieldCompleteness(records, requiredFields) {
  if (!records || records.length === 0) return 0;

  let totalFields = 0;
  let presentFields = 0;

  for (const record of records) {
    for (const field of requiredFields) {
      totalFields++;
      // Check nested fields like 'metadata.ruleVersion'
      const parts = field.split('.');
      let value = record;
      for (const part of parts) {
        value = value?.[part];
      }
      if (value !== null && value !== undefined) {
        presentFields++;
      }
    }
  }

  return totalFields > 0 ? Math.round((presentFields / totalFields) * 100) : 0;
}

// =============================================================================
// Database Queries
// =============================================================================

async function queryEvidenceRecords(prisma, config, controlId, control) {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - config.sinceDays);

  const where = {
    occurredAt: { gte: sinceDate },
  };

  // Apply tenant/org filters
  if (config.tenantId) {
    where.tenantId = config.tenantId;
  }
  if (config.organizationId) {
    where.organizationId = config.organizationId;
  }

  // Filter by event patterns
  if (control.eventPatterns && control.eventPatterns.length > 0) {
    where.OR = control.eventPatterns.map((pattern) => ({
      eventType: { startsWith: pattern.split('.')[0] + '.' },
    }));
    // Also try exact matches
    where.OR.push(
      ...control.eventPatterns.map((pattern) => ({
        eventType: pattern,
      }))
    );
  }

  // Filter by control ID if applicable
  if (controlId.startsWith('PI-') || controlId.startsWith('AVL-')) {
    where.controlId = controlId;
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
    return records;
  } catch (error) {
    // Table might not exist in test environments
    if (config.verbose) {
      console.warn(`  Warning: Could not query evidence_records: ${error.message}`);
    }
    return [];
  }
}

async function queryAuditLogs(prisma, config, control) {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - config.sinceDays);

  const where = {
    timestamp: { gte: sinceDate },
  };

  // Build action filters
  const actionFilters = [];

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
    return logs;
  } catch (error) {
    if (config.verbose) {
      console.warn(`  Warning: Could not query audit_logs: ${error.message}`);
    }
    return [];
  }
}

async function queryAgentRuns(prisma, config) {
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - config.sinceDays);

  const where = {
    createdAt: { gte: sinceDate },
  };

  if (config.organizationId) {
    where.organizationId = config.organizationId;
  }

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
    return runs;
  } catch (error) {
    if (config.verbose) {
      console.warn(`  Warning: Could not query agent_runs: ${error.message}`);
    }
    return [];
  }
}

// =============================================================================
// Report Generation
// =============================================================================

async function generateReport(prisma, config) {
  console.log('');
  console.log('='.repeat(70));
  console.log(' EVIDENCE AUDIT REPORT GENERATOR');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Period: Last ${config.sinceDays} days`);
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log('');

  const report = {
    metadata: {
      generatedAt: new Date().toISOString(),
      sinceDays: config.sinceDays,
      sinceDate: new Date(Date.now() - config.sinceDays * 24 * 60 * 60 * 1000).toISOString(),
      tenantId: config.tenantId,
      organizationId: config.organizationId,
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
  let agentRuns = [];
  console.log('Querying agent runs...');
  agentRuns = await queryAgentRuns(prisma, config);
  report.summary.totalAgentRuns = agentRuns.length;
  console.log(`  Found ${agentRuns.length} agent runs`);

  // Process each control
  console.log('');
  console.log('Processing controls...');

  for (const [controlId, control] of Object.entries(CONTROL_CATALOG)) {
    if (config.verbose) {
      console.log(`  ${controlId}: ${control.name}`);
    }

    let records = [];
    let logs = [];
    let agentData = [];

    // Query evidence records
    records = await queryEvidenceRecords(prisma, config, controlId, control);

    // Query audit logs if applicable
    if (control.auditActions || control.entityTypes) {
      logs = await queryAuditLogs(prisma, config, control);
    }

    // Use agent runs for AI-related controls
    if (control.useAgentRuns) {
      if (controlId === 'PI-002') {
        // Filter for policy-gated runs
        agentData = agentRuns.filter((r) => r.policyCheckResult !== null || r.status === 'blocked');
      } else if (controlId === 'PRV-001') {
        // Filter for runs with redaction reports
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

    // Get example event IDs (redacted)
    const exampleIds = [];
    if (records.length > 0) exampleIds.push(records[0].id);
    if (logs.length > 0) exampleIds.push(logs[0].id);
    if (agentData.length > 0) exampleIds.push(agentData[0].id);

    // Store control details
    report.controlDetails[controlId] = {
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

      // Add to gap register
      report.gapRegister.push({
        controlId,
        name: control.name,
        category: control.category,
        severity: control.severity,
        workflow: control.workflow,
        recommendation: getRemediation(controlId, control),
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

  // Generate integrity hash
  const { integrityHash, ...reportForHash } = report;
  report.integrityHash = hashContent(reportForHash);

  return report;
}

function getRemediation(controlId, control) {
  const remediations = {
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

  return remediations[controlId] || `Implement evidence logging for ${control.name} events.`;
}

// =============================================================================
// Output Formatters
// =============================================================================

function formatMarkdown(report) {
  const lines = [];

  lines.push('# Evidence Audit Report');
  lines.push('');
  lines.push(`**Generated:** ${report.metadata.generatedAt}`);
  lines.push(`**Period:** Last ${report.metadata.sinceDays} days (since ${report.metadata.sinceDate.split('T')[0]})`);
  lines.push(`**Report Version:** ${report.metadata.version}`);
  lines.push(`**Integrity Hash:** \`${report.integrityHash.slice(0, 16)}...\``);
  lines.push('');

  // Executive Summary
  lines.push('---');
  lines.push('');
  lines.push('## Executive Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Total Controls | ${report.summary.totalControls} |`);
  lines.push(`| Controls with Evidence | ${report.summary.controlsWithEvidence} |`);
  lines.push(`| Controls with Gaps | ${report.summary.controlsWithGaps} |`);
  lines.push(`| Critical Gaps | ${report.summary.criticalGaps} |`);
  lines.push(`| High Gaps | ${report.summary.highGaps} |`);
  lines.push(`| Medium Gaps | ${report.summary.mediumGaps} |`);
  lines.push(`| Total Evidence Records | ${report.summary.totalEvidenceRecords} |`);
  lines.push(`| Total Audit Logs | ${report.summary.totalAuditLogs} |`);
  lines.push(`| Total Agent Runs | ${report.summary.totalAgentRuns} |`);
  lines.push('');

  // Workflow Summary
  lines.push('---');
  lines.push('');
  lines.push('## Workflow Coverage Summary');
  lines.push('');
  lines.push('| Workflow | Evidence Present | Record Count | Completeness |');
  lines.push('|----------|------------------|--------------|--------------|');
  for (const [workflow, data] of Object.entries(report.workflowSummary)) {
    lines.push(
      `| ${workflow} | ${data.evidencePresent ? 'Yes' : 'No'} | ${data.count} | ${data.completeness}% |`
    );
  }
  lines.push('');

  // Coverage Matrix
  lines.push('---');
  lines.push('');
  lines.push('## Coverage Matrix');
  lines.push('');
  lines.push('| Control ID | Name | Category | Evidence | Count | Completeness | Severity |');
  lines.push('|------------|------|----------|----------|-------|--------------|----------|');
  for (const row of report.coverageMatrix) {
    const evidenceIcon = row.evidencePresent === 'Yes' ? 'Yes' : '**No**';
    lines.push(
      `| ${row.controlId} | ${row.name} | ${row.category} | ${evidenceIcon} | ${row.count} | ${row.completeness} | ${row.severity} |`
    );
  }
  lines.push('');

  // Gap Register
  if (report.gapRegister.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Gap Register');
    lines.push('');
    lines.push('The following controls have no evidence records in the reporting period:');
    lines.push('');

    for (const gap of report.gapRegister) {
      lines.push(`### ${gap.controlId}: ${gap.name}`);
      lines.push('');
      lines.push(`- **Category:** ${gap.category}`);
      lines.push(`- **Severity:** ${gap.severity}`);
      lines.push(`- **Workflow:** ${gap.workflow}`);
      lines.push(`- **Recommendation:** ${gap.recommendation}`);
      lines.push('');
    }
  } else {
    lines.push('---');
    lines.push('');
    lines.push('## Gap Register');
    lines.push('');
    lines.push('No gaps detected. All controls have evidence records.');
    lines.push('');
  }

  // Control Details (abbreviated)
  lines.push('---');
  lines.push('');
  lines.push('## Control Details');
  lines.push('');

  for (const [controlId, details] of Object.entries(report.controlDetails)) {
    if (details.evidencePresent) {
      lines.push(`### ${controlId}: ${details.name}`);
      lines.push('');
      lines.push(`- **Evidence Records:** ${details.evidenceRecordCount}`);
      lines.push(`- **Audit Logs:** ${details.auditLogCount}`);
      lines.push(`- **Agent Runs:** ${details.agentRunCount}`);
      lines.push(`- **Field Completeness:** ${details.fieldCompleteness}%`);
      if (details.exampleEventIds.length > 0) {
        lines.push(`- **Example IDs:** \`${details.exampleEventIds.join('`, `')}\``);
      }
      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push('*Report generated by evidence_audit_report.mjs*');
  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const config = parseArgs();

  // Ensure output directory exists
  if (!existsSync(config.outputDir)) {
    mkdirSync(config.outputDir, { recursive: true });
  }

  // Initialize Prisma
  const prisma = new PrismaClient();

  try {
    // Test connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('Database connection established.');
  } catch (error) {
    console.error('Failed to connect to database:', error.message);
    console.error('Ensure DATABASE_URL is set correctly.');
    process.exit(1);
  }

  try {
    // Generate report
    const report = await generateReport(prisma, config);

    // Write JSON output
    const jsonPath = join(config.outputDir, 'evidence_audit_report.json');
    writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log('');
    console.log(`JSON report written: ${jsonPath}`);

    // Write Markdown output
    const mdPath = join(config.outputDir, 'evidence_audit_report.md');
    writeFileSync(mdPath, formatMarkdown(report));
    console.log(`Markdown report written: ${mdPath}`);

    // Print summary
    console.log('');
    console.log('='.repeat(70));
    console.log(' REPORT SUMMARY');
    console.log('='.repeat(70));
    console.log('');
    console.log(`Controls with Evidence: ${report.summary.controlsWithEvidence}/${report.summary.totalControls}`);
    console.log(`Gaps Detected: ${report.summary.controlsWithGaps}`);
    if (report.summary.criticalGaps > 0) {
      console.log(`  Critical: ${report.summary.criticalGaps}`);
    }
    if (report.summary.highGaps > 0) {
      console.log(`  High: ${report.summary.highGaps}`);
    }
    if (report.summary.mediumGaps > 0) {
      console.log(`  Medium: ${report.summary.mediumGaps}`);
    }
    console.log('');
    console.log(`Integrity Hash: ${report.integrityHash.slice(0, 32)}...`);
    console.log('');

    // Exit with error if critical gaps
    if (report.summary.criticalGaps > 0) {
      console.log('WARNING: Critical gaps detected. Review gap register for remediation steps.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Report generation failed:', error);
  process.exit(1);
});
