# Evidence Control Catalog

This document maps control objectives to evidence sources for SOC2-aligned audit reporting.
Each control includes evidence event types, source tables, required fields, and severity if missing.

---

## Table of Contents

1. [Overview](#overview)
2. [Control Categories](#control-categories)
3. [Evidence Sources](#evidence-sources)
4. [Control Definitions](#control-definitions)
   - [Security Controls](#1-security-controls)
   - [Availability Controls](#2-availability-controls)
   - [Processing Integrity Controls](#3-processing-integrity-controls)
   - [Confidentiality Controls](#4-confidentiality-controls)
   - [Privacy Controls](#5-privacy-controls)
5. [Workflow Coverage Matrix](#workflow-coverage-matrix)
6. [Gap Severity Definitions](#gap-severity-definitions)

---

## Overview

The Evidence Audit system collects and aggregates evidence from multiple sources to demonstrate
compliance with internal controls and regulatory requirements. Evidence is:

- **Immutable**: Records are append-only with hash chains for integrity verification
- **Traceable**: All records include `requestId` and `actorId` for correlation
- **Redacted**: No PII in evidence; only IDs, hashes, timestamps, and event metadata
- **Tenant-Isolated**: Evidence respects multi-tenant boundaries

---

## Control Categories

| Category | SOC2 Principle | Description |
|----------|----------------|-------------|
| Security | CC6.x | Authentication, authorization, access control |
| Availability | A1.x | System uptime, backup/restore, disaster recovery |
| Processing Integrity | PI1.x | Data accuracy, completeness, compliance validation |
| Confidentiality | C1.x | Data encryption, access restrictions, vault controls |
| Privacy | P1.x | PII handling, consent, data minimization |

---

## Evidence Sources

| Source Table | Description | Key Fields |
|--------------|-------------|------------|
| `evidence_records` | Primary SOC2 evidence with hash chain | `controlId`, `category`, `eventType`, `contentHash` |
| `audit_logs` | System-wide action audit trail | `action`, `entityType`, `actorId`, `requestId` |
| `agent_runs` | AI agent execution records | `agentType`, `policyCheckResult`, `cost`, `status` |
| `activities` | User activity feed | `type`, `category`, `userId`, `entityType` |
| `transactions` | Revenue ledger entries | `type`, `status`, `idempotencyKey` |
| `compliance_checks` | Market rule validation results | `market`, `ruleVersion`, `passed` |

---

## Control Definitions

### 1. Security Controls

#### SEC-001: Authentication Events
| Field | Value |
|-------|-------|
| **Control ID** | SEC-001 |
| **Category** | Security |
| **Description** | Track all authentication attempts and outcomes |
| **Evidence Event Types** | `auth.login`, `auth.logout`, `auth.failed`, `auth.mfa_verified` |
| **Source Tables** | `audit_logs`, `evidence_records` |
| **Required Fields** | `actorId`, `actorEmail` (hashed), `ipAddress`, `requestId`, `timestamp`, `eventOutcome` |
| **Query Filter** | `action IN ('login', 'logout', 'login_failed', 'mfa_verify')` |
| **Severity if Missing** | Critical |

#### SEC-002: Token Refresh & Rotation
| Field | Value |
|-------|-------|
| **Control ID** | SEC-002 |
| **Category** | Security |
| **Description** | Track JWT refresh token rotation and revocation |
| **Evidence Event Types** | `auth.token_refresh`, `auth.token_revoked`, `auth.session_ended` |
| **Source Tables** | `audit_logs`, `evidence_records` |
| **Required Fields** | `actorId`, `tokenHash`, `requestId`, `timestamp`, `reason` |
| **Query Filter** | `action IN ('token_refresh', 'token_revoke', 'session_end')` |
| **Severity if Missing** | High |

#### SEC-003: Authorization Checks
| Field | Value |
|-------|-------|
| **Control ID** | SEC-003 |
| **Category** | Security |
| **Description** | Track RBAC authorization decisions |
| **Evidence Event Types** | `authz.granted`, `authz.denied`, `authz.role_changed` |
| **Source Tables** | `audit_logs`, `evidence_records` |
| **Required Fields** | `actorId`, `resource`, `permission`, `decision`, `requestId` |
| **Query Filter** | `action LIKE 'authz.%' OR entityType = 'permission'` |
| **Severity if Missing** | Critical |

#### SEC-004: Admin Actions
| Field | Value |
|-------|-------|
| **Control ID** | SEC-004 |
| **Category** | Security |
| **Description** | Track privileged administrative operations |
| **Evidence Event Types** | `admin.impersonate`, `admin.settings_changed`, `admin.role_modified` |
| **Source Tables** | `audit_logs`, `evidence_records` |
| **Required Fields** | `actorId`, `action`, `entityType`, `entityId`, `changes`, `requestId` |
| **Query Filter** | `action LIKE 'admin.%' OR action LIKE 'role_%' OR action = 'impersonate'` |
| **Severity if Missing** | Critical |

---

### 2. Availability Controls

#### AVL-001: Backup Events
| Field | Value |
|-------|-------|
| **Control ID** | AVL-001 |
| **Category** | Availability |
| **Description** | Track backup execution and verification |
| **Evidence Event Types** | `ops.backup_started`, `ops.backup_completed`, `ops.backup_failed` |
| **Source Tables** | `evidence_records` |
| **Required Fields** | `controlId`, `eventType`, `eventOutcome`, `summary`, `contentHash` |
| **Query Filter** | `eventType LIKE 'ops.backup%'` |
| **Severity if Missing** | High |

#### AVL-002: Restore Drills
| Field | Value |
|-------|-------|
| **Control ID** | AVL-002 |
| **Category** | Availability |
| **Description** | Track periodic restore drill execution |
| **Evidence Event Types** | `ops.restore_drill_started`, `ops.restore_drill_completed` |
| **Source Tables** | `evidence_records` |
| **Required Fields** | `controlId`, `eventType`, `eventOutcome`, `summary`, `durationMs` |
| **Query Filter** | `eventType LIKE 'ops.restore_drill%'` |
| **Severity if Missing** | Medium |

#### AVL-003: Migration Drift Checks
| Field | Value |
|-------|-------|
| **Control ID** | AVL-003 |
| **Category** | Availability |
| **Description** | Track schema migration drift detection |
| **Evidence Event Types** | `ops.migration_check`, `ops.drift_detected` |
| **Source Tables** | `evidence_records` |
| **Required Fields** | `controlId`, `eventType`, `eventOutcome`, `driftDetails` |
| **Query Filter** | `eventType LIKE 'ops.migration%' OR eventType LIKE 'ops.drift%'` |
| **Severity if Missing** | Medium |

---

### 3. Processing Integrity Controls

#### PI-001: Compliance Rule Decisions
| Field | Value |
|-------|-------|
| **Control ID** | PI-001 |
| **Category** | ProcessingIntegrity |
| **Description** | Track market compliance rule evaluations (FARE, FCHA) |
| **Evidence Event Types** | `compliance.rule_evaluated`, `compliance.passed`, `compliance.blocked` |
| **Source Tables** | `evidence_records`, `compliance_checks` |
| **Required Fields** | `controlId`, `market`, `ruleVersion`, `ruleId`, `decision`, `requestId` |
| **Query Filter** | `eventType LIKE 'compliance.%' OR category = 'ProcessingIntegrity'` |
| **Severity if Missing** | Critical |

#### PI-002: AI Agent Policy Gates
| Field | Value |
|-------|-------|
| **Control ID** | PI-002 |
| **Category** | ProcessingIntegrity |
| **Description** | Track AI agent policy enforcement decisions |
| **Evidence Event Types** | `agent.policy_passed`, `agent.policy_blocked`, `agent.tool_invoked` |
| **Source Tables** | `agent_runs`, `evidence_records` |
| **Required Fields** | `agentType`, `policyCheckResult`, `status`, `requestId`, `promptHash` |
| **Query Filter** | `status IN ('blocked', 'completed') AND policyCheckResult IS NOT NULL` |
| **Severity if Missing** | Critical |

#### PI-003: Revenue Ledger Integrity
| Field | Value |
|-------|-------|
| **Control ID** | PI-003 |
| **Category** | ProcessingIntegrity |
| **Description** | Track ledger postings and reconciliation |
| **Evidence Event Types** | `revenue.posted`, `revenue.reconciled`, `revenue.adjusted` |
| **Source Tables** | `evidence_records`, `transactions` |
| **Required Fields** | `transactionId`, `amount`, `idempotencyKey`, `partnerId`, `status` |
| **Query Filter** | `eventType LIKE 'revenue.%'` |
| **Severity if Missing** | Critical |

#### PI-004: Partner Attribution
| Field | Value |
|-------|-------|
| **Control ID** | PI-004 |
| **Category** | ProcessingIntegrity |
| **Description** | Track partner revenue attribution calculations |
| **Evidence Event Types** | `attribution.calculated`, `attribution.verified` |
| **Source Tables** | `evidence_records` |
| **Required Fields** | `partnerId`, `transactionId`, `attributionAmount`, `ruleVersion` |
| **Query Filter** | `eventType LIKE 'attribution.%'` |
| **Severity if Missing** | High |

#### PI-005: Webhook Idempotency
| Field | Value |
|-------|-------|
| **Control ID** | PI-005 |
| **Category** | ProcessingIntegrity |
| **Description** | Track webhook delivery and idempotency enforcement |
| **Evidence Event Types** | `webhook.received`, `webhook.processed`, `webhook.duplicate_rejected` |
| **Source Tables** | `evidence_records`, `audit_logs` |
| **Required Fields** | `webhookId`, `idempotencyKey`, `eventType`, `status`, `requestId` |
| **Query Filter** | `eventType LIKE 'webhook.%'` |
| **Severity if Missing** | High |

---

### 4. Confidentiality Controls

#### CNF-001: Document Vault Access
| Field | Value |
|-------|-------|
| **Control ID** | CNF-001 |
| **Category** | Confidentiality |
| **Description** | Track document vault uploads, downloads, and ACL checks |
| **Evidence Event Types** | `vault.upload`, `vault.download`, `vault.acl_check`, `vault.signed_url_generated` |
| **Source Tables** | `evidence_records`, `audit_logs` |
| **Required Fields** | `documentId`, `actorId`, `aclDecision`, `requestId`, `contentHash` |
| **Query Filter** | `eventType LIKE 'vault.%' OR entityType = 'document'` |
| **Severity if Missing** | Critical |

#### CNF-002: Encryption Events
| Field | Value |
|-------|-------|
| **Control ID** | CNF-002 |
| **Category** | Confidentiality |
| **Description** | Track encryption/decryption operations for sensitive data |
| **Evidence Event Types** | `encryption.applied`, `encryption.verified` |
| **Source Tables** | `evidence_records` |
| **Required Fields** | `entityType`, `entityId`, `algorithm`, `keyVersion`, `contentHash` |
| **Query Filter** | `eventType LIKE 'encryption.%'` |
| **Severity if Missing** | High |

#### CNF-003: Syndication & Publishing
| Field | Value |
|-------|-------|
| **Control ID** | CNF-003 |
| **Category** | Confidentiality |
| **Description** | Track listing syndication attempts and blocks |
| **Evidence Event Types** | `syndication.attempted`, `syndication.blocked`, `syndication.channel_changed` |
| **Source Tables** | `evidence_records`, `audit_logs` |
| **Required Fields** | `listingId`, `channel`, `decision`, `blockReason`, `requestId` |
| **Query Filter** | `eventType LIKE 'syndication.%' OR entityType = 'syndication'` |
| **Severity if Missing** | Medium |

---

### 5. Privacy Controls

#### PRV-001: PII Redaction
| Field | Value |
|-------|-------|
| **Control ID** | PRV-001 |
| **Category** | Privacy |
| **Description** | Track PII detection and redaction in AI prompts/outputs |
| **Evidence Event Types** | `redaction.applied`, `redaction.pii_detected` |
| **Source Tables** | `agent_runs`, `evidence_records` |
| **Required Fields** | `redactionReport`, `piiTypesDetected`, `fieldCount`, `requestId` |
| **Query Filter** | `promptRedactionReport IS NOT NULL OR outputRedactionReport IS NOT NULL` |
| **Severity if Missing** | Critical |

#### PRV-002: Consent Tracking
| Field | Value |
|-------|-------|
| **Control ID** | PRV-002 |
| **Category** | Privacy |
| **Description** | Track user consent for data processing activities |
| **Evidence Event Types** | `consent.granted`, `consent.withdrawn`, `consent.verified` |
| **Source Tables** | `evidence_records` |
| **Required Fields** | `userId`, `consentType`, `consentVersion`, `decision`, `timestamp` |
| **Query Filter** | `eventType LIKE 'consent.%'` |
| **Severity if Missing** | High |

---

## Workflow Coverage Matrix

| Workflow Domain | Controls | Required Evidence Types | Min Records/Period |
|-----------------|----------|------------------------|-------------------|
| **Compliance** | PI-001 | `compliance.*` | 1 per market/day |
| **Auth/Security** | SEC-001, SEC-002, SEC-003, SEC-004 | `auth.*`, `authz.*`, `admin.*` | 10+ per day |
| **Data Vault** | CNF-001, CNF-002 | `vault.*`, `encryption.*` | 1 per day |
| **Revenue Engine** | PI-003, PI-004, PI-005 | `revenue.*`, `attribution.*`, `webhook.*` | 1 per transaction |
| **AI Agent Governance** | PI-002, PRV-001 | `agent.*`, `redaction.*` | 1 per agent run |
| **Publishing/Syndication** | CNF-003 | `syndication.*` | 1 per publish attempt |
| **Ops/Health** | AVL-001, AVL-002, AVL-003 | `ops.*` | 1 backup/day, 1 drill/month |

---

## Gap Severity Definitions

| Severity | Definition | Required Action |
|----------|------------|-----------------|
| **Critical** | Missing evidence for security or compliance-critical controls | Immediate remediation required |
| **High** | Missing evidence for important operational controls | Remediate within 7 days |
| **Medium** | Missing evidence for recommended controls | Remediate within 30 days |
| **Low** | Missing evidence for optional enhancements | Track for future improvement |

---

## Appendix: Control ID Reference

| Control ID | Name | Category | Severity |
|------------|------|----------|----------|
| SEC-001 | Authentication Events | Security | Critical |
| SEC-002 | Token Refresh & Rotation | Security | High |
| SEC-003 | Authorization Checks | Security | Critical |
| SEC-004 | Admin Actions | Security | Critical |
| AVL-001 | Backup Events | Availability | High |
| AVL-002 | Restore Drills | Availability | Medium |
| AVL-003 | Migration Drift Checks | Availability | Medium |
| PI-001 | Compliance Rule Decisions | ProcessingIntegrity | Critical |
| PI-002 | AI Agent Policy Gates | ProcessingIntegrity | Critical |
| PI-003 | Revenue Ledger Integrity | ProcessingIntegrity | Critical |
| PI-004 | Partner Attribution | ProcessingIntegrity | High |
| PI-005 | Webhook Idempotency | ProcessingIntegrity | High |
| CNF-001 | Document Vault Access | Confidentiality | Critical |
| CNF-002 | Encryption Events | Confidentiality | High |
| CNF-003 | Syndication & Publishing | Confidentiality | Medium |
| PRV-001 | PII Redaction | Privacy | Critical |
| PRV-002 | Consent Tracking | Privacy | High |

---

*Last Updated: 2026-01-03*
*Version: 1.0.0*
