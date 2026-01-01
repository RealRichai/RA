# RealRiches Technical Dossier

## Executive Summary

RealRiches is an AI-powered real estate investment platform built with enterprise-grade architecture. The platform combines modern cloud-native design with comprehensive compliance automation, audit logging, and AI governance to minimize operational and regulatory risk.

**Key Technical Differentiators:**
- **Compliance Autopilot**: Automated enforcement of 50-state landlord-tenant regulations
- **AI Governance**: Policy-gated agents with authority contracts and full audit trails
- **Immutable Audit Logging**: Every mutation logged with actor, context, and changes
- **Multi-Tenant Isolation**: Database-level row security (RLS) for data segregation

---

## Architecture Overview

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 15, React 18, TailwindCSS | Modern web application |
| API | Fastify, TypeScript | High-performance REST API |
| Database | PostgreSQL | Primary data store with RLS |
| Cache | Redis | Session management, rate limiting |
| ORM | Prisma | Type-safe database access |
| Authentication | JWT + Refresh Tokens | Stateless auth with rotation |
| AI | OpenAI API, Claude API | Intelligent automation |
| Payments | Stripe | PCI-compliant payment processing |

### High-Level Architecture

```mermaid
flowchart TB
    subgraph Clients
        WEB[Web Application<br/>Next.js 15]
        MOBILE[Mobile Apps<br/>React Native]
        API_CLIENTS[API Clients<br/>Partner Integrations]
    end

    subgraph Edge["Edge Layer"]
        CDN[CDN / Static Assets]
        LB[Load Balancer]
        WAF[Web Application Firewall]
    end

    subgraph Application["Application Layer"]
        API[API Server<br/>Fastify + TypeScript]
        WORKER[Background Workers<br/>Job Processing]
        SCHEDULER[Task Scheduler<br/>Cron Jobs]
    end

    subgraph Services["Service Layer"]
        AUTH[Auth Service<br/>JWT + RBAC]
        COMPLIANCE[Compliance Engine<br/>Rule Evaluation]
        AI_AGENT[AI Agents<br/>Policy-Gated]
        AUDIT[Audit Logger<br/>Immutable Trail]
        NOTIFY[Notification Service<br/>Email, SMS, Push]
    end

    subgraph Data["Data Layer"]
        PG[(PostgreSQL<br/>Primary + RLS)]
        REDIS[(Redis<br/>Cache + Sessions)]
        S3[Object Storage<br/>Documents]
    end

    subgraph External["External Services"]
        STRIPE[Stripe<br/>Payments]
        PLAID[Plaid<br/>Banking]
        OPENAI[OpenAI / Claude<br/>AI Models]
        EMAIL[Email Provider<br/>Transactional]
    end

    WEB --> CDN
    MOBILE --> LB
    API_CLIENTS --> LB
    CDN --> LB
    LB --> WAF
    WAF --> API

    API --> AUTH
    API --> COMPLIANCE
    API --> AI_AGENT
    API --> AUDIT
    API --> NOTIFY

    AUTH --> PG
    AUTH --> REDIS
    COMPLIANCE --> PG
    AI_AGENT --> PG
    AUDIT --> PG
    NOTIFY --> EMAIL

    API --> PG
    API --> REDIS
    API --> S3

    WORKER --> PG
    WORKER --> REDIS
    SCHEDULER --> WORKER

    API --> STRIPE
    API --> PLAID
    AI_AGENT --> OPENAI
```

### Monorepo Structure

```
realriches/
├── apps/
│   ├── api/                    # Fastify API (40+ modules)
│   └── web/                    # Next.js frontend
├── packages/
│   ├── database/               # Prisma schema (222 models)
│   ├── compliance-engine/      # Jurisdiction-aware rules
│   ├── ai-sdk/                 # AI integration layer
│   ├── partners-contracts/     # Partner provider interfaces
│   └── [8 more packages]
└── docs/
    ├── adr/                    # Architecture Decision Records
    └── investor/               # This dossier
```

---

## Compliance Autopilot

### How It Works

The Compliance Engine enforces real estate regulations **before** operations execute, preventing violations rather than detecting them after the fact.

```mermaid
flowchart LR
    subgraph Request["Incoming Request"]
        REQ[API Request<br/>e.g., Set Security Deposit]
    end

    subgraph Resolution["Jurisdiction Resolution"]
        ADDR[Property Address]
        GEO[Geocoding]
        JURIS[Jurisdiction Stack<br/>Federal → State → Local]
    end

    subgraph Evaluation["Rule Evaluation"]
        RULES[(Rule Database<br/>Versioned, Dated)]
        ENGINE[Compliance Engine]
        RESULT{Pass?}
    end

    subgraph Outcomes["Outcomes"]
        ALLOW[Allow Operation<br/>+ Evidence Record]
        BLOCK[Block Operation<br/>+ Violation Details]
        REVIEW[Human Review<br/>Edge Cases]
    end

    REQ --> ADDR
    ADDR --> GEO
    GEO --> JURIS
    JURIS --> ENGINE
    RULES --> ENGINE
    ENGINE --> RESULT

    RESULT -->|Yes| ALLOW
    RESULT -->|No| BLOCK
    RESULT -->|Maybe| REVIEW

    ALLOW --> EVIDENCE[(Evidence Log)]
    BLOCK --> EVIDENCE
    REVIEW --> EVIDENCE
```

### Compliance Coverage

| Domain | Examples | Enforcement |
|--------|----------|-------------|
| Security Deposits | State-specific limits (e.g., CA = 2-3 months) | Pre-operation gate |
| Fair Housing | Protected class screening prevention | Application workflow |
| Disclosures | Lead paint, mold, flood zone | Document generation |
| Eviction Process | Notice periods, cure rights | Workflow enforcement |
| Rent Control | Local ordinance limits | Rate change validation |

### Evidence Generation

Every compliance decision generates an immutable evidence record:

```typescript
interface ComplianceEvidence {
  id: string;
  timestamp: Date;
  operationType: string;           // 'SET_SECURITY_DEPOSIT'
  jurisdiction: string[];          // ['US', 'CA', 'LOS_ANGELES']
  rulesEvaluated: RuleResult[];    // Each rule with pass/fail
  outcome: 'ALLOWED' | 'BLOCKED';
  actor: { id: string; type: string };
  contentHash: string;             // Tamper detection
}
```

---

## Audit Logging & Governance

### Risk Reduction Through Transparency

The platform implements defense-in-depth through multiple governance layers:

```mermaid
flowchart TB
    subgraph Input["All Mutations"]
        CREATE[Create Operations]
        UPDATE[Update Operations]
        DELETE[Delete Operations]
    end

    subgraph Gates["Enforcement Gates"]
        AUTH_GATE[Authentication<br/>JWT Verification]
        AUTHZ_GATE[Authorization<br/>RBAC + Tenant Isolation]
        COMPLIANCE_GATE[Compliance<br/>Rule Evaluation]
        RATE_GATE[Rate Limiting<br/>Abuse Prevention]
    end

    subgraph Logging["Audit Trail"]
        AUDIT_LOG[(Audit Log<br/>Append-Only)]
        HASH[Hash Chain<br/>Tamper Detection]
    end

    subgraph Monitoring["Monitoring"]
        ALERTS[Anomaly Alerts]
        DASHBOARD[Admin Dashboard]
        REPORTS[Compliance Reports]
    end

    CREATE --> AUTH_GATE
    UPDATE --> AUTH_GATE
    DELETE --> AUTH_GATE

    AUTH_GATE --> AUTHZ_GATE
    AUTHZ_GATE --> COMPLIANCE_GATE
    COMPLIANCE_GATE --> RATE_GATE

    RATE_GATE --> AUDIT_LOG
    AUDIT_LOG --> HASH

    AUDIT_LOG --> ALERTS
    AUDIT_LOG --> DASHBOARD
    AUDIT_LOG --> REPORTS
```

### What Gets Logged

| Event Type | Data Captured | Retention |
|------------|---------------|-----------|
| Authentication | Login attempts, token refresh, logout | 2 years |
| Data Mutations | Before/after state, actor, timestamp | 7 years |
| Compliance Decisions | Rules evaluated, outcome, evidence | 7 years |
| AI Agent Actions | Reasoning, policy decisions, results | 7 years |
| Access Patterns | Resource access, query patterns | 1 year |

### Sensitive Data Handling

Audit logs automatically redact sensitive fields:

```typescript
const REDACTED_FIELDS = [
  'password', 'ssn', 'bankAccountNumber',
  'creditCardNumber', 'apiKey', 'secret'
];

// Logged as: { ssn: '[REDACTED]', ... }
```

---

## AI Agent Governance

### Policy-Gated Automation

AI agents operate under strict governance with three enforcement layers:

```mermaid
flowchart TB
    subgraph Agent["AI Agent Request"]
        ACTION[Requested Action<br/>e.g., Create Work Order]
        CONTEXT[Context<br/>User, Property, Amount]
    end

    subgraph Layer1["Layer 1: Policy Gate"]
        POLICY_DB[(Policy Rules)]
        POLICY_EVAL[Policy Evaluation]
        POLICY_RESULT{Allowed?}
    end

    subgraph Layer2["Layer 2: Authority Contract"]
        CONTRACT[(Authority Contract)]
        LIMITS[Hard Limits Check<br/>$ Amount, Rate, Scope]
        LIMIT_RESULT{Within Limits?}
    end

    subgraph Layer3["Layer 3: Audit Trail"]
        AUDIT[(Agent Audit Log)]
        REASONING[AI Reasoning Capture]
        HASH_CHAIN[Hash Chain]
    end

    subgraph Outcomes["Outcomes"]
        EXECUTE[Execute Action]
        ESCALATE[Escalate to Human]
        DENY[Deny + Log]
    end

    ACTION --> POLICY_EVAL
    CONTEXT --> POLICY_EVAL
    POLICY_DB --> POLICY_EVAL
    POLICY_EVAL --> POLICY_RESULT

    POLICY_RESULT -->|No| DENY
    POLICY_RESULT -->|Yes| LIMITS
    CONTRACT --> LIMITS
    LIMITS --> LIMIT_RESULT

    LIMIT_RESULT -->|No| ESCALATE
    LIMIT_RESULT -->|Yes| EXECUTE

    EXECUTE --> AUDIT
    ESCALATE --> AUDIT
    DENY --> AUDIT

    AUDIT --> REASONING
    REASONING --> HASH_CHAIN
```

### Authority Contracts

Each agent type operates under an explicit authority contract:

| Agent Type | Permissions | Hard Limits | Requires Human |
|------------|-------------|-------------|----------------|
| Maintenance | Create work orders, schedule vendors | $5,000/order, 200/day | Emergency repairs, >$1,000 |
| Leasing | Answer inquiries, schedule showings | No lease modifications | Application decisions |
| Communications | Send templated messages | No legal topics | Eviction-related |
| Analysis | Read-only data access | No write operations | Never |

### AI Disclosure

All tenant/vendor communications from AI agents include mandatory disclosure:

```
This message was composed with AI assistance.
For human support, reply with "HUMAN" or call [phone].
```

---

## Multi-Tenant Architecture

### Data Isolation

RealRiches uses PostgreSQL Row-Level Security (RLS) for tenant isolation:

```sql
-- Every tenant-scoped table
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON properties
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**Benefits:**
- Database-enforced isolation (not application-dependent)
- Single bug cannot leak cross-tenant data
- Satisfies SOC 2 data segregation requirements

### Tenant Hierarchy

```
Platform (RealRiches)
└── Tenant (Property Management Company)
    └── Properties
        └── Units
            └── Leases
                └── Tenants
```

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [Security Posture](security-posture.md) | OWASP controls, SOC 2 mapping |
| [Compliance Evidence](compliance-evidence.md) | Evidence generation, diligence support |
| [Architecture Decision Records](../adr/) | Key technical decisions with rationale |

---

*This document is intended for technical due diligence. For questions, contact the engineering team.*
