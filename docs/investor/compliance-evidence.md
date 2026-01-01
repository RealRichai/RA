# Compliance Evidence

## Overview

RealRiches generates comprehensive, immutable evidence for every compliance-relevant operation. This document describes the evidence types, generation mechanisms, and how to demonstrate compliance during due diligence.

---

## Evidence Categories

### 1. Audit Logs

Every data mutation is captured in an append-only audit log with full context.

**Schema:**

```typescript
interface AuditLogEntry {
  // Identity
  id: string;
  sequence: bigint;              // Monotonically increasing
  timestamp: Date;

  // Tenant Context
  tenantId: string;

  // Actor
  actorId: string;
  actorType: 'USER' | 'SYSTEM' | 'AGENT' | 'WEBHOOK';
  actorEmail?: string;
  actorRole?: string;

  // Action
  action: string;                // 'lease.create', 'payment.process'
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  resourceType: string;          // 'Lease', 'Payment'
  resourceId: string;

  // Changes
  changes: {
    before: Record<string, unknown> | null;
    after: Record<string, unknown>;
    diff: FieldChange[];
  };

  // Request Context
  requestContext: {
    ip: string;
    userAgent: string;
    traceId: string;
    sessionId?: string;
  };

  // Integrity
  previousHash: string;
  contentHash: string;
}
```

**Example Entry:**

```json
{
  "id": "audit_abc123",
  "sequence": 1000001,
  "timestamp": "2025-01-01T12:00:00.000Z",
  "tenantId": "tenant_xyz",
  "actorId": "user_456",
  "actorType": "USER",
  "actorEmail": "manager@property.com",
  "actorRole": "PROPERTY_MANAGER",
  "action": "lease.create",
  "method": "POST",
  "resourceType": "Lease",
  "resourceId": "lease_789",
  "changes": {
    "before": null,
    "after": {
      "id": "lease_789",
      "unitId": "unit_123",
      "tenantId": "tenant_456",
      "monthlyRent": 2500,
      "startDate": "2025-02-01",
      "endDate": "2026-01-31"
    },
    "diff": [
      { "field": "monthlyRent", "from": null, "to": 2500 }
    ]
  },
  "requestContext": {
    "ip": "192.168.1.1",
    "userAgent": "Mozilla/5.0...",
    "traceId": "trace_def456"
  },
  "previousHash": "sha256:abc...",
  "contentHash": "sha256:def..."
}
```

---

### 2. Compliance Decisions

Every compliance rule evaluation is recorded with full decision context.

**Schema:**

```typescript
interface ComplianceEvidence {
  // Identity
  id: string;
  timestamp: Date;
  tenantId: string;

  // Operation
  operationType: string;         // 'SET_SECURITY_DEPOSIT'
  operationId: string;           // Reference to the operation
  resourceType: string;
  resourceId: string;

  // Jurisdiction
  jurisdictions: string[];       // ['US', 'CA', 'LOS_ANGELES']
  effectiveDate: Date;           // Rules in effect on this date

  // Rules Evaluated
  rulesEvaluated: {
    ruleId: string;
    ruleVersion: string;
    ruleName: string;
    jurisdiction: string;
    passed: boolean;
    inputs: Record<string, unknown>;
    outputs: {
      allowed: boolean;
      limit?: number;
      message?: string;
      citation?: string;         // Legal citation
    };
  }[];

  // Outcome
  outcome: 'ALLOWED' | 'BLOCKED' | 'HUMAN_REVIEW';
  overrideApplied: boolean;
  overrideApprovedBy?: string;
  overrideReason?: string;

  // Actor
  actorId: string;
  actorType: string;

  // Integrity
  contentHash: string;
}
```

**Example - Security Deposit Compliance:**

```json
{
  "id": "comp_xyz789",
  "timestamp": "2025-01-01T12:00:00.000Z",
  "tenantId": "tenant_xyz",
  "operationType": "SET_SECURITY_DEPOSIT",
  "operationId": "op_123",
  "resourceType": "Lease",
  "resourceId": "lease_789",
  "jurisdictions": ["US", "CA"],
  "effectiveDate": "2025-01-01",
  "rulesEvaluated": [
    {
      "ruleId": "CA_SECURITY_DEPOSIT_LIMIT",
      "ruleVersion": "2024.1",
      "ruleName": "California Security Deposit Limit",
      "jurisdiction": "CA",
      "passed": true,
      "inputs": {
        "monthlyRent": 2500,
        "requestedDeposit": 5000,
        "isFurnished": false
      },
      "outputs": {
        "allowed": true,
        "limit": 7500,
        "message": "Deposit within 3-month limit for unfurnished unit",
        "citation": "CA Civil Code 1950.5"
      }
    }
  ],
  "outcome": "ALLOWED",
  "overrideApplied": false,
  "actorId": "user_456",
  "actorType": "USER",
  "contentHash": "sha256:ghi..."
}
```

---

### 3. Workflow Histories

Multi-step business processes maintain complete state histories.

**Schema:**

```typescript
interface WorkflowHistory {
  // Identity
  workflowId: string;
  workflowType: string;          // 'LEASE_APPLICATION', 'EVICTION'
  tenantId: string;

  // Current State
  currentState: string;
  currentStateEnteredAt: Date;

  // State Transitions
  transitions: {
    id: string;
    timestamp: Date;
    fromState: string;
    toState: string;
    trigger: string;             // Event that caused transition
    actorId: string;
    actorType: string;
    metadata: Record<string, unknown>;
    complianceEvidenceId?: string;
  }[];

  // Documents Generated
  documents: {
    documentId: string;
    type: string;                // 'LEASE_AGREEMENT', 'NOTICE_TO_QUIT'
    generatedAt: Date;
    signedAt?: Date;
    signedBy?: string[];
    hash: string;
  }[];

  // Timeline
  createdAt: Date;
  completedAt?: Date;
  outcome?: 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
}
```

**Example - Lease Application Workflow:**

```json
{
  "workflowId": "wf_app123",
  "workflowType": "LEASE_APPLICATION",
  "tenantId": "tenant_xyz",
  "currentState": "LEASE_SIGNED",
  "currentStateEnteredAt": "2025-01-01T16:00:00.000Z",
  "transitions": [
    {
      "id": "trans_1",
      "timestamp": "2025-01-01T10:00:00.000Z",
      "fromState": "INITIAL",
      "toState": "APPLICATION_SUBMITTED",
      "trigger": "applicant.submit",
      "actorId": "applicant_456",
      "actorType": "APPLICANT",
      "metadata": {}
    },
    {
      "id": "trans_2",
      "timestamp": "2025-01-01T12:00:00.000Z",
      "fromState": "APPLICATION_SUBMITTED",
      "toState": "SCREENING_COMPLETE",
      "trigger": "screening.complete",
      "actorId": "system",
      "actorType": "SYSTEM",
      "metadata": {
        "screeningResult": "APPROVED",
        "creditScore": 720
      }
    },
    {
      "id": "trans_3",
      "timestamp": "2025-01-01T14:00:00.000Z",
      "fromState": "SCREENING_COMPLETE",
      "toState": "APPROVED",
      "trigger": "manager.approve",
      "actorId": "user_789",
      "actorType": "USER",
      "complianceEvidenceId": "comp_fair_housing_check",
      "metadata": {}
    },
    {
      "id": "trans_4",
      "timestamp": "2025-01-01T16:00:00.000Z",
      "fromState": "APPROVED",
      "toState": "LEASE_SIGNED",
      "trigger": "lease.signed",
      "actorId": "applicant_456",
      "actorType": "APPLICANT",
      "metadata": {
        "signatureMethod": "ELECTRONIC"
      }
    }
  ],
  "documents": [
    {
      "documentId": "doc_lease_001",
      "type": "LEASE_AGREEMENT",
      "generatedAt": "2025-01-01T14:30:00.000Z",
      "signedAt": "2025-01-01T16:00:00.000Z",
      "signedBy": ["applicant_456", "user_789"],
      "hash": "sha256:jkl..."
    }
  ],
  "createdAt": "2025-01-01T10:00:00.000Z",
  "completedAt": "2025-01-01T16:00:00.000Z",
  "outcome": "COMPLETED"
}
```

---

### 4. AI Agent Audit Trail

All AI agent actions are logged with reasoning and policy decisions.

**Schema:**

```typescript
interface AgentAuditRecord {
  // Identity
  id: string;
  timestamp: Date;
  tenantId: string;

  // Agent Context
  agentId: string;
  agentType: string;
  agentVersion: string;
  authorityContractId: string;
  delegatingUserId: string;      // Human who enabled this agent

  // Action
  action: string;
  resourceType: string;
  resourceId?: string;
  parameters: Record<string, unknown>;

  // Policy Evaluation
  policyEvaluations: {
    policyId: string;
    decision: 'ALLOWED' | 'DENIED' | 'ESCALATED';
    reasoning: string;
  }[];

  // AI Reasoning
  aiContext: {
    modelId: string;
    promptHash: string;          // Hash of prompt (not full content)
    inputTokens: number;
    outputTokens: number;
    reasoning: string;           // Agent's stated reasoning
    confidence: number;          // 0-1 confidence score
  };

  // Outcome
  outcome: 'EXECUTED' | 'BLOCKED' | 'ESCALATED';
  resultId?: string;

  // Human Review (if escalated)
  humanReview?: {
    reviewerId: string;
    decision: 'APPROVED' | 'REJECTED' | 'MODIFIED';
    reviewedAt: Date;
    notes?: string;
  };

  // Integrity
  contentHash: string;
}
```

---

## Evidence Integrity

### Hash Chain

All evidence records are linked via cryptographic hash chain:

```
Record N:
  contentHash = SHA256(
    previousHash +
    timestamp +
    JSON(content)
  )

Record N+1:
  previousHash = Record N.contentHash
  contentHash = SHA256(...)
```

**Verification:**

```typescript
async function verifyChain(startSeq: number, endSeq: number): Promise<{
  valid: boolean;
  brokenAt?: number;
}> {
  let previousHash = await getHashAt(startSeq - 1);

  for (let seq = startSeq; seq <= endSeq; seq++) {
    const record = await getRecordAt(seq);
    const expectedHash = computeHash(previousHash, record);

    if (record.contentHash !== expectedHash) {
      return { valid: false, brokenAt: seq };
    }

    previousHash = record.contentHash;
  }

  return { valid: true };
}
```

### Tamper Detection

Any modification to historical records breaks the hash chain:

```
Original:  [R1] → [R2] → [R3] → [R4]
                    ↓
Tampered:  [R1] → [R2'] → [R3] → [R4]
                    ↓
           Hash verification fails at R3
```

---

## Demonstrating Compliance in Diligence

### 1. Audit Log Export

**Request:** Export all audit logs for a date range

**API:**
```http
GET /api/admin/audit-logs/export
  ?startDate=2024-01-01
  &endDate=2024-12-31
  &format=json
  &includeIntegrityProof=true
```

**Response:**
```json
{
  "exportId": "export_123",
  "dateRange": { "start": "2024-01-01", "end": "2024-12-31" },
  "recordCount": 150000,
  "fileUrl": "https://exports.example.com/audit_2024.json.gz",
  "integrityProof": {
    "firstHash": "sha256:abc...",
    "lastHash": "sha256:xyz...",
    "merkleRoot": "sha256:mno...",
    "signedBy": "RealRiches Export Service",
    "signature": "..."
  }
}
```

### 2. Compliance Report

**Request:** Generate compliance summary for a property/tenant

**API:**
```http
GET /api/admin/compliance/report
  ?tenantId=tenant_xyz
  &startDate=2024-01-01
  &endDate=2024-12-31
```

**Response:**
```json
{
  "tenantId": "tenant_xyz",
  "period": { "start": "2024-01-01", "end": "2024-12-31" },
  "summary": {
    "totalOperations": 5000,
    "complianceChecks": 3500,
    "passed": 3498,
    "blocked": 2,
    "humanReviewed": 15
  },
  "byJurisdiction": {
    "CA": { "checks": 2000, "passed": 1999, "blocked": 1 },
    "NY": { "checks": 1500, "passed": 1499, "blocked": 1 }
  },
  "blockedOperations": [
    {
      "id": "comp_001",
      "timestamp": "2024-03-15T10:00:00Z",
      "operation": "SET_SECURITY_DEPOSIT",
      "reason": "Exceeded CA limit",
      "resolution": "Reduced deposit to comply"
    }
  ]
}
```

### 3. Workflow History Query

**Request:** Get complete history for a specific workflow

**API:**
```http
GET /api/admin/workflows/{workflowId}/history
  ?includeDocuments=true
  &includeComplianceEvidence=true
```

### 4. Agent Activity Report

**Request:** AI agent actions and human oversight

**API:**
```http
GET /api/admin/agents/activity
  ?agentType=MAINTENANCE
  &startDate=2024-01-01
  &endDate=2024-12-31
```

**Response:**
```json
{
  "agentType": "MAINTENANCE",
  "period": { "start": "2024-01-01", "end": "2024-12-31" },
  "summary": {
    "totalActions": 5000,
    "executed": 4800,
    "blocked": 50,
    "escalated": 150,
    "humanApproved": 145,
    "humanRejected": 5
  },
  "topActions": [
    { "action": "CREATE_WORK_ORDER", "count": 3000 },
    { "action": "SCHEDULE_VENDOR", "count": 1500 },
    { "action": "SEND_UPDATE", "count": 500 }
  ],
  "averageConfidence": 0.92
}
```

---

## Diligence Checklist

### Data Integrity

| Question | Evidence |
|----------|----------|
| Are all mutations logged? | Audit log with 100% mutation coverage |
| Can logs be tampered with? | Hash chain integrity verification |
| How long are logs retained? | 7-year retention policy |
| Can we trace any action to an actor? | Actor ID + type on every record |

### Compliance Enforcement

| Question | Evidence |
|----------|----------|
| Are regulations enforced proactively? | Compliance gate blocks before execution |
| Which jurisdictions are covered? | Rule database by state/locality |
| What happens when rules change? | Versioned rules with effective dates |
| Are edge cases handled? | Human review workflow with audit trail |

### AI Governance

| Question | Evidence |
|----------|----------|
| What can AI agents do? | Authority contracts with explicit permissions |
| Are there spending limits? | Hard limits in authority contracts |
| When do humans review? | Escalation thresholds with approval logs |
| Can we explain AI decisions? | Reasoning capture in agent audit trail |

### Access Control

| Question | Evidence |
|----------|----------|
| How is tenant data isolated? | PostgreSQL RLS policies |
| Who has access to what? | RBAC with role definitions |
| How are access changes tracked? | Audit log for permission changes |
| Can we revoke access immediately? | Session termination + token revocation |

---

## Sample Diligence Queries

### "Show me all lease modifications in 2024"

```sql
SELECT
  al.timestamp,
  al.actor_email,
  al.resource_id,
  al.changes->>'before' as before,
  al.changes->>'after' as after
FROM audit_logs al
WHERE al.action = 'lease.update'
  AND al.timestamp >= '2024-01-01'
  AND al.timestamp < '2025-01-01'
ORDER BY al.timestamp;
```

### "Show me all blocked compliance operations"

```sql
SELECT
  ce.timestamp,
  ce.operation_type,
  ce.jurisdictions,
  ce.rules_evaluated,
  ce.outcome
FROM compliance_evidence ce
WHERE ce.outcome = 'BLOCKED'
  AND ce.timestamp >= '2024-01-01'
ORDER BY ce.timestamp;
```

### "Show me all AI agent escalations"

```sql
SELECT
  aa.timestamp,
  aa.agent_type,
  aa.action,
  aa.ai_context->>'reasoning' as reasoning,
  aa.human_review
FROM agent_audit aa
WHERE aa.outcome = 'ESCALATED'
  AND aa.timestamp >= '2024-01-01'
ORDER BY aa.timestamp;
```

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [Technical Overview](README.md) | Architecture and compliance overview |
| [Security Posture](security-posture.md) | OWASP controls, SOC 2 mapping |
| [ADR-0002: Compliance-as-Code](../adr/0002-compliance-as-code.md) | Compliance architecture decision |
| [ADR-0004: Ledger Integrity](../adr/0004-ledger-integrity.md) | Append-only ledger design |

---

*Evidence schemas and APIs are subject to enhancement. Core integrity guarantees are stable.*
