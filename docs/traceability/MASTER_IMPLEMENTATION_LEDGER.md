# Master Implementation Ledger

> **Version:** 1.0.0
> **Last Updated:** 2026-01-03
> **Audit Commit:** 0e8e8637b2138317c4793fb8a7b641d202f8847b
> **Branch:** main

This document serves as the single source of truth for feature implementation status across the RealRiches platform. Each feature is tracked with evidence paths, test coverage, and clear status indicators.

## Status Legend

| Status | Description |
|--------|-------------|
| **Implemented** | Feature is complete with tests and production-ready |
| **Partial** | Core functionality exists but missing components identified |
| **Missing** | Feature is documented/planned but not yet implemented |

---

## 1. Compliance (NYC FARE Act / FCHA)

### 1.1 FARE Act Compliance

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Broker Fee Prohibition | Prohibits tenant broker fees when agent represents landlord | `NYC_STRICT` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/rules.ts:73-120` | `packages/compliance-engine/src/__tests__/fare-act.test.ts` |
| Income Requirement Cap | Caps income requirements at 40x monthly rent | `NYC_STRICT` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/rules.ts:122-175` | `packages/compliance-engine/src/__tests__/fare-act.test.ts` |
| Credit Score Cap | Caps credit score requirement at 650 | `NYC_STRICT` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/rules.ts:177-227` | `packages/compliance-engine/src/__tests__/fare-act.test.ts` |
| Fee Disclosure Requirement | Requires disclosure of all tenant-paid fees | `NYC_STRICT` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/rules.ts:122-175` | `packages/compliance-engine/src/__tests__/fare-act.test.ts` |
| Listing Publish Gate | Validates FARE compliance at listing publish | `NYC_STRICT` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/gates.ts:39-162` | `packages/compliance-engine/src/__tests__/gates.test.ts` |

### 1.2 FCHA (Fair Chance Housing Act)

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| FCHA State Machine | 7-state workflow enforcement (PREQUALIFICATION→APPROVED/DENIED) | `NYC_STRICT` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/fcha-state-machine.ts` (656 lines) | `packages/compliance-engine/src/__tests__/fcha-state-machine.test.ts` (740 lines) |
| Criminal Check Timing | Blocks criminal checks before conditional offer | `NYC_STRICT` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/rules.ts:240-309` | `packages/compliance-engine/src/__tests__/fcha-state-machine.test.ts` |
| Stage Transition Gate | Enforces valid FCHA stage progression | `NYC_STRICT` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/gates.ts:335-390` | `packages/compliance-engine/src/__tests__/gates.test.ts` |
| Background Check Gate | Validates check type allowed at current stage | `NYC_STRICT` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/gates.ts:392-444` | `packages/compliance-engine/src/__tests__/gates.test.ts` |
| Article 23-A Factors | Individualized assessment factor tracking | `NYC_STRICT` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/fcha-state-machine.ts:96-117` | `packages/compliance-engine/src/__tests__/fcha-state-machine.test.ts` |

### 1.3 Good Cause Eviction

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Rent Increase Cap | Caps increases at CPI + 5% | `NYC_STRICT` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/rules.ts:312-431` | `packages/compliance-engine/src/__tests__/rules.test.ts` |
| CPI Provider (BLS API) | Fetches CPI data from Bureau of Labor Statistics | `NYC_STRICT` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/providers.ts` (431 lines) | `packages/compliance-engine/src/__tests__/rules.test.ts` |
| CPI Fallback Provider | Deterministic fallback with 2024-2025 data | `NYC_STRICT` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/providers.ts` | `packages/compliance-engine/src/__tests__/rules.test.ts` |
| Eviction Reason Validation | Validates against whitelist of legal reasons | `NYC_STRICT` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/rules.ts:350-390` | `packages/compliance-engine/src/__tests__/rules.test.ts` |
| Notice Period Enforcement | Requires 30-day notice | `NYC_STRICT` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/rules.ts:392-431` | `packages/compliance-engine/src/__tests__/rules.test.ts` |

### 1.4 Multi-Market Support

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| NYC_STRICT Market Pack | Full NYC compliance (FARE, FCHA, Good Cause, Rent Stab) | `NYC_STRICT` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/market-packs.ts:14-175` | `packages/compliance-engine/src/__tests__/` |
| CA_STANDARD Market Pack | AB 1482, just cause eviction, rent caps | `CA_STANDARD` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/market-packs.ts:323-445` | `packages/compliance-engine/src/__tests__/rules.test.ts` |
| UK_GDPR Market Pack | GDPR consent, data retention, privacy notices | `UK_GDPR` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/market-packs.ts:230-317` | `packages/compliance-engine/src/__tests__/rules.test.ts` |
| 12 Additional US Markets | TX, FL, IL, WA, CO, MA, NJ, PA, GA, AZ, NV | Various | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/market-packs.ts` (1,762 lines) | `packages/compliance-engine/src/__tests__/rules.test.ts` |

---

## 2. Revenue Partners

### 2.1 Deposit Alternative Providers

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Rhino Adapter | Deposit alternative + guarantor (12% commission) | `PARTNER_RHINO` | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/partners/adapters/rhino.ts` | `packages/revenue-engine/src/__tests__/adapters.test.ts` |
| LeaseLock Adapter | Deposit alternative (15% commission) | Global | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/partners/adapters/leaselock.ts` | `packages/revenue-engine/src/__tests__/adapters.test.ts` |
| Jetty Adapter | Deposit alternative + insurance (10% commission) | Global | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/partners/adapters/jetty.ts` | `packages/revenue-engine/src/__tests__/adapters.test.ts` |

### 2.2 Renters Insurance Providers

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Lemonade Adapter | Renters insurance (20% commission) | `PARTNER_LEMONADE` | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/partners/adapters/lemonade.ts` | `packages/revenue-engine/src/__tests__/adapters.test.ts` |
| Assurant Adapter | Renters insurance (15% commission) | Global | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/partners/adapters/assurant.ts` | `packages/revenue-engine/src/__tests__/adapters.test.ts` |
| Sure Adapter | Renters insurance (18% commission) | Global | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/partners/adapters/sure.ts` | `packages/revenue-engine/src/__tests__/adapters.test.ts` |

### 2.3 Guarantor Providers

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Insurent Adapter | Guarantor services (10% commission) | `PARTNER_GUARANTOR_SERVICES` | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/partners/adapters/insurent.ts` | `packages/revenue-engine/src/__tests__/adapters.test.ts` |
| Leap Adapter | Guarantor services (12% commission) | `PARTNER_GUARANTOR_SERVICES` | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/partners/adapters/leap.ts` | `packages/revenue-engine/src/__tests__/adapters.test.ts` |

### 2.4 Ledger & Accounting

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Chart of Accounts | Full double-entry chart (Assets, Liabilities, Revenue, Expenses) | Global | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/ledger/accounts.ts` | `packages/revenue-engine/src/__tests__/ledger.test.ts` |
| Transaction Engine | Double-entry bookkeeping with validation | Global | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/ledger/transactions.ts` | `packages/revenue-engine/src/__tests__/ledger.test.ts` |
| Allocation Waterfall | Revenue splitting with configurable rules | Global | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/ledger/allocations.ts` | `packages/revenue-engine/src/ledger/allocations.test.ts` |
| Idempotency Layer | Redis-backed transaction deduplication | Global | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/ledger/idempotency.ts` | `packages/revenue-engine/src/__tests__/ledger.test.ts` |

### 2.5 Referral Tracking

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Referral Lifecycle | pending→qualified→converted→paid tracking | `PARTNER_ATTRIBUTION_TRACKING` | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/referrals/tracker.ts` | `packages/revenue-engine/src/__tests__/referrals.test.ts` |
| Partner Agreements | Rev-share terms management | `PARTNER_REVENUE_DASHBOARD` | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/referrals/tracker.ts` | `packages/revenue-engine/src/__tests__/referrals.test.ts` |
| Revenue Reports | Product/partner breakdown reports | `PARTNER_REVENUE_DASHBOARD` | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/referrals/reports.ts` | `packages/revenue-engine/src/__tests__/reports.test.ts` |

### 2.6 Stripe Integration

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Webhook Verification | HMAC-SHA256 signature verification | Global | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/stripe/webhook-handler.ts` | `packages/revenue-engine/src/__tests__/webhook.test.ts` |
| Payment Intent Handler | payment_intent.succeeded ledger entries | Global | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/stripe/webhook-handler.ts` | `packages/revenue-engine/src/__tests__/webhook.test.ts` |
| Refund Handler | charge.refunded processing | Global | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/stripe/webhook-handler.ts` | `packages/revenue-engine/src/__tests__/webhook.test.ts` |
| Dispute Handler | charge.dispute.created tracking | Global | `@realriches/revenue-engine` | **Implemented** | `packages/revenue-engine/src/stripe/webhook-handler.ts` | `packages/revenue-engine/src/__tests__/webhook.test.ts` |

---

## 3. Document Vault

### 3.1 Storage Infrastructure

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| S3/MinIO Client | Full S3-compatible storage with presigned URLs | Global | `@realriches/document-storage` | **Implemented** | `packages/document-storage/src/s3-client.ts` | `packages/document-storage/src/__tests__/upload.test.ts` |
| Document Upload Service | Content detection, size validation, checksum | Global | `@realriches/document-storage` | **Implemented** | `packages/document-storage/src/upload-service.ts` | `packages/document-storage/src/__tests__/upload.test.ts` |
| Quarantine System | Move infected files to quarantine folder | Global | `@realriches/document-storage` | **Implemented** | `packages/document-storage/src/s3-client.ts` | `packages/document-storage/src/__tests__/virus-scanner.test.ts` |

### 3.2 Virus Scanning

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| ClamAV Integration | INSTREAM protocol scanning | Global | `@realriches/document-storage` | **Implemented** | `packages/document-storage/src/virus-scanner.ts` | `packages/document-storage/src/__tests__/virus-scanner.test.ts` |
| Scan Queue | Concurrent scanning with retry logic | Global | `@realriches/document-storage` | **Implemented** | `packages/document-storage/src/virus-scanner.ts:267-387` | `packages/document-storage/src/__tests__/virus-scanner.test.ts` |

### 3.3 Access Control

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Role-Based ACL | 10 roles with permission matrix | Global | `@realriches/document-storage` | **Implemented** | `packages/document-storage/src/acl.ts:23-34` | `packages/document-storage/src/__tests__/acl.test.ts` |
| Entity-Level Access | Property/lease/application context checks | Global | `@realriches/document-storage` | **Implemented** | `packages/document-storage/src/acl.ts:121-198` | `packages/document-storage/src/__tests__/acl.test.ts` |
| Document Type Policies | Retention periods, encryption requirements | Global | `@realriches/document-storage` | **Implemented** | `packages/document-storage/src/acl.ts:244-287` | `packages/document-storage/src/__tests__/acl.test.ts` |

### 3.4 Signature Service

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Signature Requests | Multi-signer workflow with access tokens | `E_SIGNATURES` | `@realriches/document-storage` | **Implemented** | `packages/document-storage/src/signature-service.ts` | `packages/document-storage/src/__tests__/template.test.ts` |
| Email Queue | Signature request email delivery | `E_SIGNATURES` | `@realriches/document-storage` | **Implemented** | `packages/document-storage/src/signature-service.ts:101-189` | N/A |
| Notification Queue | In-app signature notifications | `E_SIGNATURES` | `@realriches/document-storage` | **Implemented** | `packages/document-storage/src/signature-service.ts:197-239` | N/A |

### 3.5 Template Engine

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Variable Interpolation | Type-aware variable substitution | Global | `@realriches/document-storage` | **Implemented** | `packages/document-storage/src/template-engine.ts` | `packages/document-storage/src/__tests__/template.test.ts` |
| HTML to PDF Rendering | Puppeteer-based PDF generation | Global | `@realriches/document-storage` | **Implemented** | `packages/document-storage/src/template-engine.ts` | `packages/document-storage/src/__tests__/template.test.ts` |
| Built-in Templates | REBNY lease, FARE Act disclosure | `REBNY_LEASE_TEMPLATES` | `@realriches/document-storage` | **Implemented** | `packages/document-storage/src/template-engine.ts` | `packages/document-storage/src/__tests__/template.test.ts` |

---

## 4. AI Agents

### 4.1 LLM Adapters

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Anthropic Adapter | Claude 3 models (Opus, Sonnet, Haiku) | Global | `@realriches/ai-sdk` | **Implemented** | `packages/ai-sdk/src/adapters/anthropic.ts` | `packages/ai-sdk/src/__tests__/adapters.test.ts` |
| OpenAI Adapter | GPT-4 Turbo, GPT-4, GPT-3.5 Turbo | Global | `@realriches/ai-sdk` | **Implemented** | `packages/ai-sdk/src/adapters/openai.ts` | `packages/ai-sdk/src/__tests__/adapters.test.ts` |
| Console Adapter | Development/testing provider | Global | `@realriches/ai-sdk` | **Implemented** | `packages/ai-sdk/src/adapters/console.ts` | `packages/ai-sdk/src/__tests__/adapters.test.ts` |
| Provider Fallback | Automatic failover between providers | Global | `@realriches/ai-sdk` | **Implemented** | `packages/ai-sdk/src/client.ts` | `packages/ai-sdk/src/__tests__/adapters.test.ts` |

### 4.2 Policy Gates

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| AI Output Gate | Compliance validation of AI responses | Global | `@realriches/ai-sdk` | **Implemented** | `packages/ai-sdk/src/policy/gate.ts` | `packages/ai-sdk/src/__tests__/policy.test.ts` |
| Fee Structure Rules | Broker fee prohibition detection | `NYC_STRICT` | `@realriches/ai-sdk` | **Implemented** | `packages/ai-sdk/src/policy/rules.ts` | `packages/ai-sdk/src/__tests__/policy.test.ts` |
| FCHA Compliance Rules | Premature screening detection | `NYC_STRICT` | `@realriches/ai-sdk` | **Implemented** | `packages/ai-sdk/src/policy/rules.ts` | `packages/ai-sdk/src/__tests__/policy.test.ts` |
| Market-Specific Rules | Geographic compliance enforcement | Various | `@realriches/ai-sdk` | **Implemented** | `packages/ai-sdk/src/policy/gate.ts:21-88` | `packages/ai-sdk/src/__tests__/policy.test.ts` |

### 4.3 PII Redaction

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Email Detection | Regex-based email redaction | Global | `@realriches/ai-sdk` | **Implemented** | `packages/ai-sdk/src/redaction/detector.ts` | `packages/ai-sdk/src/__tests__/redaction.test.ts` |
| SSN Detection | Pattern + area number validation | Global | `@realriches/ai-sdk` | **Implemented** | `packages/ai-sdk/src/redaction/detector.ts` | `packages/ai-sdk/src/__tests__/redaction.test.ts` |
| Credit Card Detection | Luhn algorithm validation | Global | `@realriches/ai-sdk` | **Implemented** | `packages/ai-sdk/src/redaction/detector.ts` | `packages/ai-sdk/src/__tests__/redaction.test.ts` |
| Phone/Address/DOB | Multi-pattern detection | Global | `@realriches/ai-sdk` | **Implemented** | `packages/ai-sdk/src/redaction/detector.ts` | `packages/ai-sdk/src/__tests__/redaction.test.ts` |
| Redaction Reports | SHA-256 hash audit trail | Global | `@realriches/ai-sdk` | **Implemented** | `packages/ai-sdk/src/redaction/redactor.ts` | `packages/ai-sdk/src/__tests__/redaction.test.ts` |

### 4.4 Agent Run Tracking

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Run Ledger | Token/cost tracking per execution | Global | `@realriches/ai-sdk` | **Implemented** | `packages/ai-sdk/src/ledger/agent-run.ts` | N/A |
| Budget Controls | Per-user/org/global daily limits | Global | `@realriches/ai-sdk` | **Implemented** | `packages/ai-sdk/src/client.ts` | N/A |
| Enhanced Agent Runs | Tool calls, policy violations tracking | Global | `@realriches/agent-governance` | **Implemented** | `packages/agent-governance/src/runtime/agent-run.ts` | `packages/agent-governance/tests/agent-run.test.ts` |

---

## 5. Agent Governance

### 5.1 Control Tower

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Kill Switch Manager | Emergency control system (6 scopes) | Global | `@realriches/agent-governance` | **Implemented** | `packages/agent-governance/src/control-tower/kill-switch.ts` | `packages/agent-governance/tests/kill-switch.test.ts` |
| Dashboard Service | Agent metrics, cost breakdown, alerts | Global | `@realriches/agent-governance` | **Implemented** | `packages/agent-governance/src/control-tower/dashboard.ts` | `packages/agent-governance/tests/agent-run.test.ts` (integration) |
| Replay System | Agent run replay capability | Global | `@realriches/agent-governance` | **Implemented** | `packages/agent-governance/src/control-tower/replay.ts` | `packages/agent-governance/tests/agent-run.test.ts` (integration) |

### 5.2 Voice & Consent

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Consent Manager | Recording/transcription/AI consent tracking | Global | `@realriches/agent-governance` | **Implemented** | `packages/agent-governance/src/voice/consent.ts` | `packages/agent-governance/tests/policy-gate.test.ts` (integration) |
| Two-Party Consent | State-based consent enforcement | Various | `@realriches/agent-governance` | **Implemented** | `packages/agent-governance/src/voice/consent.ts` | `packages/agent-governance/tests/policy-gate.test.ts` (integration) |
| Recording Pipeline | Storage providers (S3, GCS, Azure) | Global | `@realriches/agent-governance` | **Implemented** | `packages/agent-governance/src/voice/recording.ts` | N/A (E2E) |
| Call Grading | Rubric-based evaluation + FCHA compliance | Global | `@realriches/agent-governance` | **Implemented** | `packages/agent-governance/src/voice/grading.ts` | N/A (E2E) |

### 5.3 Policy Rules

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| FCHA Rules | Fair housing compliance for agents | `NYC_STRICT` | `@realriches/agent-governance` | **Implemented** | `packages/agent-governance/src/policy/rules/fcha-rules.ts` | `packages/agent-governance/tests/policy-gate.test.ts` |
| Fee Rules | Fee structure enforcement | Various | `@realriches/agent-governance` | **Implemented** | `packages/agent-governance/src/policy/rules/fee-rules.ts` | `packages/agent-governance/tests/policy-gate.test.ts` |
| Market Rules | Market-specific policy enforcement | Various | `@realriches/agent-governance` | **Implemented** | `packages/agent-governance/src/policy/rules/market-rules.ts` | `packages/agent-governance/tests/policy-gate.test.ts` |

### 5.4 Agent Usage & Cost Tracking

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| PrismaAgentRunStore | Database-backed agent run persistence | Global | `@realriches/agent-governance` | **Implemented** | `packages/agent-governance/src/persistence/prisma-run-store.ts` | `apps/api/tests/agent-usage.test.ts` |
| AgentUsageService | Real-time cost tracking with Redis + DB | Global | `@realriches/agent-governance` | **Implemented** | `packages/agent-governance/src/usage/agent-usage.service.ts` | `apps/api/tests/agent-usage.test.ts` |
| Budget Enforcement Plugin | Daily/monthly budget limits with headers | Global | `@realriches/api` | **Implemented** | `apps/api/src/plugins/agent-budget.ts` | `apps/api/tests/agent-usage.test.ts` |
| Agent Usage API Routes | Summary, breakdown, runs, budget status | Global | `@realriches/api` | **Implemented** | `apps/api/src/modules/agent-usage/routes.ts` | `apps/api/tests/agent-usage.test.ts` |
| Usage Aggregation Job | Hourly Redis→DB aggregation + alerts | Global | `@realriches/api` | **Implemented** | `apps/api/src/jobs/agent-usage-aggregation.ts` | `apps/api/tests/agent-usage.test.ts` |
| Budget Alerts | 80%/90%/100% threshold notifications | Global | `@realriches/agent-governance` | **Implemented** | `packages/agent-governance/src/usage/agent-usage.service.ts` | `apps/api/tests/agent-usage.test.ts` |

---

## 6. Media Generation

### 6.1 Document Generators

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| PDF Generator | Puppeteer-based PDF from HTML | `FLYER_GENERATOR` | `@realriches/media-generator` | **Implemented** | `packages/media-generator/src/generators/pdf-generator.ts` | N/A |
| PPTX Generator | pptxgenjs slide deck generation | `FLYER_GENERATOR` | `@realriches/media-generator` | **Implemented** | `packages/media-generator/src/generators/pptx-generator.ts` | N/A |
| HTML Renderer | Template rendering with blocks | `FLYER_GENERATOR` | `@realriches/media-generator` | **Implemented** | `packages/media-generator/src/renderers/html-renderer.ts` | N/A |

### 6.2 Compliance Blocks

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| NYC FARE Act Disclosure | Non-removable footer block | `NYC_STRICT` | `@realriches/media-generator` | **Implemented** | `packages/media-generator/src/compliance-blocks.ts` | `packages/media-generator/src/compliance-blocks.test.ts` |
| NYC Lead Paint Disclosure | Dedicated page block | `NYC_STRICT` | `@realriches/media-generator` | **Implemented** | `packages/media-generator/src/compliance-blocks.ts` | `packages/media-generator/src/compliance-blocks.test.ts` |
| NYC Bedbug Disclosure | Inline block (brochures) | `NYC_STRICT` | `@realriches/media-generator` | **Implemented** | `packages/media-generator/src/compliance-blocks.ts` | `packages/media-generator/src/compliance-blocks.test.ts` |
| Fair Housing Notice | Footer block (all markets) | Global | `@realriches/media-generator` | **Implemented** | `packages/media-generator/src/compliance-blocks.ts` | `packages/media-generator/src/compliance-blocks.test.ts` |
| Block Injector | Position-aware block insertion | Global | `@realriches/media-generator` | **Implemented** | `packages/media-generator/src/renderers/block-injector.ts` | `packages/media-generator/src/__tests__/compliance-enforcer.test.ts` |

### 6.3 Template Validation

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Template Validator | Schema validation for templates | Global | `@realriches/media-generator` | **Implemented** | `packages/media-generator/src/template-validator.ts` | `packages/media-generator/src/template-validator.test.ts` |
| Block Registry | Market-specific block management | Global | `@realriches/media-generator` | **Implemented** | `packages/media-generator/src/block-registry.ts` | `packages/media-generator/src/compliance-blocks.test.ts` |

### 6.4 Evidence Tracking

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Generation Evidence | SOC2 CC-6.1 audit trail | Global | `@realriches/media-generator` | **Implemented** | `packages/media-generator/src/evidence/generation-evidence.ts` | `packages/media-generator/src/__tests__/deterministic.test.ts` (integration) |

---

## 7. 3D Tours (SOG/WebGPU)

### 7.1 Tour Conversion

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| PLY to SOG Transform | @playcanvas/splat-transform CLI integration | `TOUR_SOG_CONVERSION` | `@realriches/tour-conversion` | **Implemented** | `packages/tour-conversion/src/splat-transform.ts` | `packages/tour-conversion/src/__tests__/splat-transform.test.ts` |
| QA System (SSIM/pHash) | Quality assurance with metrics | `TOUR_SOG_CONVERSION` | `@realriches/tour-conversion` | **Implemented** | `packages/tour-conversion/src/qa.ts` | `packages/tour-conversion/src/__tests__/qa.test.ts` |
| WebP Validation | Lossless WebP enforcement | `TOUR_SOG_CONVERSION` | `@realriches/tour-conversion` | **Implemented** | `packages/tour-conversion/src/webp-validation.ts` | `packages/tour-conversion/src/__tests__/webp-validation.test.ts` |
| Checksum/Provenance | SHA256 checksums + full provenance | `TOUR_SOG_CONVERSION` | `@realriches/tour-conversion` | **Implemented** | `packages/tour-conversion/src/checksum.ts` | `packages/tour-conversion/src/__tests__/checksum.test.ts` |
| Job Queue (BullMQ) | Conversion worker with backpressure | `TOUR_SOG_CONVERSION` | `@realriches/tour-conversion` | **Implemented** | `packages/tour-conversion/src/worker.ts` | `packages/tour-conversion/src/__tests__/service.test.ts` |

### 7.2 Tour Delivery

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| S3 Storage Provider | PLY file retention | `TOUR_3DGS_CAPTURE` | `@realriches/tour-delivery` | **Implemented** | `packages/tour-delivery/src/providers/s3.ts` | `packages/tour-delivery/src/__tests__/service.test.ts` |
| R2 Storage Provider | SOG distribution via CDN | `TOUR_3DGS_CAPTURE` | `@realriches/tour-delivery` | **Implemented** | `packages/tour-delivery/src/providers/r2.ts` | `packages/tour-delivery/src/__tests__/service.test.ts` |
| Access Gating | Market + plan + kill switch checks | `3dgs_tours_enabled` | `@realriches/tour-delivery` | **Implemented** | `packages/tour-delivery/src/gating.ts` | `packages/tour-delivery/src/__tests__/gating.test.ts` |
| Plan-Based TTL | Signed URL expiration by plan tier | Global | `@realriches/tour-delivery` | **Implemented** | `packages/tour-delivery/src/types.ts` | `packages/tour-delivery/src/__tests__/signed-urls.test.ts` |
| Usage Metering | Session tracking + unit economics | Global | `@realriches/tour-delivery` | **Implemented** | `packages/tour-delivery/src/metering.ts` | `packages/tour-delivery/src/__tests__/service.test.ts` |

### 7.3 WebGPU Viewer

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| SplatViewer Component | PlayCanvas 3DGS viewer | `TOUR_WEBGPU_VIEWER` | `@realriches/web` | **Implemented** | `apps/web/src/components/tour/SplatViewer.tsx` | N/A |
| Feature Detection | WebGPU/WebGL2 capability check | `TOUR_WEBGPU_VIEWER` | `@realriches/web` | **Implemented** | `apps/web/src/components/tour/SplatViewer.tsx` | N/A |
| FPS Tracking | Performance monitoring | `TOUR_WEBGPU_VIEWER` | `@realriches/web` | **Implemented** | `apps/web/src/components/tour/SplatViewer.tsx` | N/A |
| Mobile Touch Controls | Touch gesture support | `TOUR_WEBGPU_VIEWER` | `@realriches/web` | **Implemented** | `apps/web/src/components/tour/SplatViewer.tsx` | N/A |

---

## 8. Mobile

### 8.1 Device Registration

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Device Registration Model | Push notification device tracking | Global | `@realriches/database` | **Implemented** | `packages/database/prisma/schema.prisma` (DeviceRegistration) | N/A |
| Push Notification Queue | Notification delivery | Global | `@realriches/document-storage` | **Implemented** | `packages/document-storage/src/signature-service.ts:197-239` | N/A |

### 8.2 Mobile-Specific Features

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| React Native App | Native mobile application | Global | N/A | **Missing** | N/A | N/A |
| Offline Mode | Offline data sync | Global | N/A | **Missing** | N/A | N/A |
| Biometric Auth | Face ID / Touch ID | Global | N/A | **Missing** | N/A | N/A |

---

## 9. Security / SOC2

### 9.1 Infrastructure Security

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Helmet Middleware | Security headers | Global | `@realriches/api` | **Implemented** | `apps/api/src/plugins/index.ts` | `scripts/check-security-headers.sh` |
| CORS Configuration | Origin restriction | Global | `@realriches/api` | **Implemented** | `apps/api/src/plugins/index.ts` | `scripts/check-security-headers.sh` |
| Rate Limiting | Request throttling | Global | `@realriches/api` | **Implemented** | `apps/api/src/plugins/index.ts` | `scripts/check-security-headers.sh` |
| JWT Authentication | Token-based auth | Global | `@realriches/api` | **Implemented** | `apps/api/src/plugins/auth.ts` | `scripts/check-auth-middleware.sh` |

### 9.2 Authorization

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Route Authorization | preHandler auth checks | Global | `@realriches/api` | **Implemented** | `apps/api/src/plugins/auth.ts` | `scripts/check-auth-middleware.sh` |
| Role-Based Access | 10-role permission matrix | Global | `@realriches/document-storage` | **Implemented** | `packages/document-storage/src/acl.ts` | `packages/document-storage/src/__tests__/acl.test.ts` |
| Admin Impersonation | Secure user impersonation | Global | `@realriches/api` | **Implemented** | `apps/api/src/modules/admin/impersonation.ts` | `apps/api/tests/admin-features.test.ts` (integration) |

### 9.3 Audit & Evidence

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Audit Logging | System audit trail | Global | `@realriches/api` | **Implemented** | `apps/api/src/modules/admin/audit-logs.ts` | `apps/api/tests/audit-logs.test.ts` |
| Evidence Records | SOC2 control evidence | Global | `@realriches/database` | **Implemented** | `packages/database/prisma/schema.prisma` (EvidenceRecord) | N/A (schema) |
| Activity Tracking | User activity logging | Global | `@realriches/database` | **Implemented** | `packages/database/prisma/schema.prisma` (Activity) | N/A (schema) |

### 9.4 Data Protection

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| PII Redaction | AI input/output redaction | Global | `@realriches/ai-sdk` | **Implemented** | `packages/ai-sdk/src/redaction/` | `packages/ai-sdk/src/__tests__/redaction.test.ts` |
| Document Encryption | At-rest encryption for sensitive docs | Global | `@realriches/document-storage` | **Implemented** | `packages/document-storage/src/acl.ts:244-287` | `apps/api/tests/security/encryption.test.ts` |
| Secrets Guard | CI secrets detection | Global | `.github/workflows/ci.yml` | **Implemented** | `.github/workflows/ci.yml` (secrets-guard job) | N/A (CI) |
| Forbid Human TODOs | CI policy gate for `HUMAN_IMPLEMENTATION_REQUIRED` markers | Global | `scripts/ci/forbid_human_todos.sh` | **Implemented** | `scripts/ci/forbid_human_todos.sh`, `.github/workflows/ci.yml` (policy-gates job) | `--test` self-test flag |

---

## 10. Multi-Market / i18n

### 10.1 Market Configuration

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| 13 Market Definitions | NYC, LA, SF, CHI, MIA, ATL, BOS, SEA, DEN, AUS, DAL, PHX, DC | Various | `@realriches/feature-flags` | **Implemented** | `packages/feature-flags/src/markets.ts` | `packages/feature-flags/src/__tests__/service.test.ts` |
| Rollout Phases | Phase 1-4 market rollout | Various | `@realriches/feature-flags` | **Implemented** | `packages/feature-flags/src/markets.ts:47-164` | N/A |
| Market-Gated Features | Feature flags per market | Various | `@realriches/feature-flags` | **Implemented** | `packages/feature-flags/src/flags.ts` | `packages/feature-flags/src/__tests__/service.test.ts` |

### 10.2 Internationalization

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Currency Formatting | Intl.NumberFormat | Global | `@realriches/utils` | **Implemented** | `packages/utils/src/money.ts` | N/A |
| Date Formatting | Locale-aware dates | Global | `@realriches/utils` | **Implemented** | `packages/utils/src/date.ts` | N/A |
| UK Market (GDPR) | UK-specific compliance | `UK_GDPR` | `@realriches/compliance-engine` | **Implemented** | `packages/compliance-engine/src/market-packs.ts:230-317` | `packages/compliance-engine/src/__tests__/rules.test.ts` |
| Full i18n System | Translation files, locale switching | Global | N/A | **Missing** | N/A | N/A |

---

## 11. Observability

### 11.1 Logging

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Structured Logger | JSON logging with context | Global | `@realriches/utils` | **Implemented** | `packages/utils/src/logger.ts` | N/A |
| Request Logging | HTTP request/response logging | Global | `@realriches/api` | **Implemented** | `apps/api/src/plugins/index.ts` | N/A |

### 11.2 Metrics & Monitoring

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Health Endpoint | /health status check | Global | `@realriches/api` | **Implemented** | `apps/api/src/modules/health/` | `.github/workflows/ci.yml` |
| Agent Dashboard | AI agent metrics | Global | `@realriches/agent-governance` | **Implemented** | `packages/agent-governance/src/control-tower/dashboard.ts` | N/A |
| Tour Metering | 3D tour usage analytics | Global | `@realriches/tour-delivery` | **Implemented** | `packages/tour-delivery/src/metering.ts` | `packages/tour-delivery/src/__tests__/service.test.ts` |
| Prometheus Metrics | /metrics endpoint with auth (ADMIN/token), HTTP+process metrics | Global | `apps/api/src/plugins/metrics.ts` | **Implemented** | `apps/api/src/plugins/metrics.ts`, `docs/ops/observability.md` | `apps/api/tests/metrics.test.ts` |
| Distributed Tracing | OpenTelemetry with OTLP export | Global | `@realriches/api` | **Implemented** | `apps/api/src/instrumentation.ts`, `apps/api/src/plugins/otel.ts` | `apps/api/tests/otel.test.ts` |

### 11.3 Alerting

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Agent Alerts | Kill switch and violation alerts | Global | `@realriches/agent-governance` | **Implemented** | `packages/agent-governance/src/queues/alerts.ts` | N/A |
| DLQ Alerts | Email delivery failure alerts | Global | `@realriches/email-service` | **Implemented** | `packages/email-service/src/queue/dlq-handler.ts` | `packages/email-service/src/__tests__/queue.test.ts` |
| External Alerting | PagerDuty/Slack integration | Global | N/A | **Partial** | Slack in deploy workflow | N/A |

### 11.4 OpenTelemetry Distributed Tracing

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| OTEL SDK Initialization | Pre-module SDK setup with auto-initialize | Global | `@realriches/api` | **Implemented** | `apps/api/src/instrumentation.ts` | `apps/api/tests/otel.test.ts` |
| OTLP Trace Exporter | HTTP export to OTLP collector (Jaeger, Tempo, etc.) | Global | `@realriches/api` | **Implemented** | `apps/api/src/instrumentation.ts:112-123` | `apps/api/tests/otel.test.ts` |
| Resource Attributes | service.name, service.version, deployment.environment | Global | `@realriches/api` | **Implemented** | `apps/api/src/instrumentation.ts:106-110` | `apps/api/tests/otel.test.ts` |
| HTTP Span Plugin | Automatic span creation for HTTP requests | Global | `@realriches/api` | **Implemented** | `apps/api/src/plugins/otel.ts` | `apps/api/tests/otel.test.ts` |
| Request-ID Correlation | Trace/span IDs linked to Pino request logs | Global | `@realriches/api` | **Implemented** | `apps/api/src/plugins/otel.ts:73-78` | `apps/api/tests/otel.test.ts` |
| Graceful Shutdown | Span flushing on application shutdown | Global | `@realriches/api` | **Implemented** | `apps/api/src/lib/shutdown.ts`, `apps/api/src/instrumentation.ts:146-155` | `apps/api/tests/otel.test.ts` |
| Environment Config | OTEL_ENABLED, OTEL_SERVICE_NAME, OTEL_EXPORTER_OTLP_ENDPOINT | Global | `@realriches/api` | **Implemented** | `apps/api/src/instrumentation.ts:39-73` | `apps/api/tests/otel.test.ts` |
| Tree-Shakable | Zero overhead when OTEL disabled | Global | `@realriches/api` | **Implemented** | `apps/api/src/instrumentation.ts:93-100` | `apps/api/tests/otel.test.ts` |
| Ignored Paths | /health, /metrics, /favicon.ico excluded from tracing | Global | `@realriches/api` | **Implemented** | `apps/api/src/plugins/index.ts:38-41` | N/A |

---

## 12. Workflows

### 12.1 Workflow Engine

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Local Runtime | In-process workflow execution | Global | `@realriches/workflows` | **Implemented** | `packages/workflows/src/runtime/local-runtime.ts` | `packages/workflows/tests/workflow.test.ts` |
| Signal Handling | External signal wait/send | Global | `@realriches/workflows` | **Implemented** | `packages/workflows/src/runtime/local-runtime.ts` | `packages/workflows/tests/workflow.test.ts` |
| Activity Execution | Step execution with retry | Global | `@realriches/workflows` | **Implemented** | `packages/workflows/src/activities/` | `packages/workflows/tests/workflow.test.ts` |
| Retry Policies | Exponential backoff, max retries | Global | `@realriches/workflows` | **Implemented** | `packages/workflows/src/retry/policies.ts` | `packages/workflows/tests/workflow.test.ts` |

### 12.2 Persistence

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Workflow Store Interface | Workflow execution persistence | Global | `@realriches/workflows` | **Implemented** | `packages/workflows/src/persistence/types.ts` | N/A |
| Prisma Workflow Store | Database-backed persistence | Global | `@realriches/workflows` | **Implemented** | `packages/workflows/src/persistence/prisma-store.ts` | N/A |
| Activity Store Interface | Activity execution persistence | Global | `@realriches/workflows` | **Implemented** | `packages/workflows/src/persistence/types.ts` | N/A |

### 12.3 Pre-Built Workflows

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| NYC Compliance Workflow | FCHA application workflow | `NYC_STRICT` | `@realriches/workflows` | **Implemented** | `packages/workflows/src/workflows/nyc-application-compliance.ts` | `packages/workflows/tests/nyc-compliance.integration.test.ts` |

---

## 13. Email Service

### 13.1 Email Templates

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Template Engine | Variable interpolation, rendering | Global | `@realriches/email-service` | **Implemented** | `packages/email-service/src/templates/engine.ts` | `packages/email-service/src/__tests__/templates.test.ts` |
| Auth Templates (3) | Password reset, verification, welcome | Global | `@realriches/email-service` | **Implemented** | `packages/email-service/src/templates/definitions/auth/` | `packages/email-service/src/__tests__/templates.test.ts` |
| Lease Templates (2) | Lease created, expiring | Global | `@realriches/email-service` | **Implemented** | `packages/email-service/src/templates/definitions/lease/` | `packages/email-service/src/__tests__/templates.test.ts` |
| Payment Templates (2) | Reminder, late notice | Global | `@realriches/email-service` | **Implemented** | `packages/email-service/src/templates/definitions/payments/` | `packages/email-service/src/__tests__/templates.test.ts` |
| Policy Templates (2) | Expiring, renewed | Global | `@realriches/email-service` | **Implemented** | `packages/email-service/src/templates/definitions/policies/` | N/A |
| Document Templates (1) | Signature request | Global | `@realriches/email-service` | **Implemented** | `packages/email-service/src/templates/definitions/documents/` | N/A |
| Alert Templates (1) | Compliance warning | Global | `@realriches/email-service` | **Implemented** | `packages/email-service/src/templates/definitions/alerts/` | N/A |
| System Templates (1) | Support handoff | Global | `@realriches/email-service` | **Implemented** | `packages/email-service/src/templates/definitions/system/` | N/A |

### 13.2 Email Queue

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| BullMQ Queue | Job queue for email delivery | Global | `@realriches/email-service` | **Implemented** | `packages/email-service/src/queue/email-queue.ts` | `packages/email-service/src/__tests__/queue.test.ts` |
| Email Worker | Concurrent email processing | Global | `@realriches/email-service` | **Implemented** | `packages/email-service/src/queue/email-worker.ts` | `packages/email-service/src/__tests__/queue.test.ts` |
| Dead Letter Queue | Failed email handling | Global | `@realriches/email-service` | **Implemented** | `packages/email-service/src/queue/dlq-handler.ts` | `packages/email-service/src/__tests__/queue.test.ts` |

### 13.3 Email Providers

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| SES Provider | Amazon SES integration | Global | `@realriches/email-service` | **Implemented** | `packages/email-service/src/providers/ses.ts` | `packages/email-service/src/__tests__/providers.test.ts` |
| Console Provider | Development logging | Global | `@realriches/email-service` | **Implemented** | `packages/email-service/src/providers/console.ts` | `packages/email-service/src/__tests__/providers.test.ts` |

---

## 14. Partner Contracts

### 14.1 Contract Interfaces

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Utilities Contract | Utility provider integration | `PARTNER_UTILITY_CONCIERGE` | `@realriches/partners-contracts` | **Implemented** | `packages/partners-contracts/src/contracts/utilities.ts` | `packages/partners-contracts/src/__tests__/schemas.test.ts` |
| Guarantor Contract | Guarantor service integration | `PARTNER_GUARANTOR_SERVICES` | `@realriches/partners-contracts` | **Implemented** | `packages/partners-contracts/src/contracts/guarantor.ts` | `packages/partners-contracts/src/__tests__/schemas.test.ts` |
| Insurance Contract | Insurance provider integration | `PARTNER_LEMONADE` | `@realriches/partners-contracts` | **Implemented** | `packages/partners-contracts/src/contracts/insurance.ts` | `packages/partners-contracts/src/__tests__/schemas.test.ts` |
| Moving Contract | Moving service integration | `PARTNER_MOVING_SERVICES` | `@realriches/partners-contracts` | **Implemented** | `packages/partners-contracts/src/contracts/moving.ts` | `packages/partners-contracts/src/__tests__/schemas.test.ts` |
| Vendor Contract | Vendor marketplace integration | `PARTNER_VENDOR_MARKETPLACE` | `@realriches/partners-contracts` | **Implemented** | `packages/partners-contracts/src/contracts/vendor.ts` | `packages/partners-contracts/src/__tests__/schemas.test.ts` |

### 14.2 Mock Providers

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Mock Utilities | Deterministic utility mocks | `PARTNER_SANDBOX_MODE` | `@realriches/partners-contracts` | **Implemented** | `packages/partners-contracts/src/mocks/utilities.mock.ts` | N/A |
| Mock Guarantor | Deterministic guarantor mocks | `PARTNER_SANDBOX_MODE` | `@realriches/partners-contracts` | **Implemented** | `packages/partners-contracts/src/mocks/guarantor.mock.ts` | N/A |
| Mock Insurance | Deterministic insurance mocks | `PARTNER_SANDBOX_MODE` | `@realriches/partners-contracts` | **Implemented** | `packages/partners-contracts/src/mocks/insurance.mock.ts` | N/A |
| Mock Moving | Deterministic moving mocks | `PARTNER_SANDBOX_MODE` | `@realriches/partners-contracts` | **Implemented** | `packages/partners-contracts/src/mocks/moving.mock.ts` | N/A |

---

## 15. Feature Flags

### 15.1 Flag Service

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Feature Flag Service | Evaluation with overrides | Global | `@realriches/feature-flags` | **Implemented** | `packages/feature-flags/src/service.ts` | `packages/feature-flags/src/__tests__/service.test.ts` |
| 22 Defined Flags | Tour, AI, Compliance, Partner flags | Various | `@realriches/feature-flags` | **Implemented** | `packages/feature-flags/src/flags.ts` | N/A |
| Override System | User/tenant/global overrides | Global | `@realriches/feature-flags` | **Implemented** | `packages/feature-flags/src/service.ts` | `packages/feature-flags/src/__tests__/service.test.ts` |

### 15.2 Admin API

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Flag Admin Endpoints | CRUD + toggle + evaluate | Global | `@realriches/api` | **Implemented** | `apps/api/src/modules/admin/feature-flags.ts` | `apps/api/tests/feature-flags-admin.test.ts` |
| Redis Storage | Fast flag access | Global | `@realriches/api` | **Implemented** | `apps/api/src/modules/admin/feature-flags.ts` | N/A |

---

## 16. Testing Infrastructure

### 16.1 E2E API Journey Tests

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Auth Journey | Register, login, token refresh, revocation | Global | E2E | **Implemented** | `tests/e2e/journeys/auth.api.spec.ts` | Playwright |
| Listing Journey | Draft → NYC compliance gate → publish | `NYC_STRICT` | E2E | **Implemented** | `tests/e2e/journeys/listing.api.spec.ts` | Playwright |
| Application Journey | Prequal → conditional offer → background check (FCHA) | `NYC_STRICT` | E2E | **Implemented** | `tests/e2e/journeys/application.api.spec.ts` | Playwright |
| Vault Journey | Document upload → ACL enforcement → signed URL | Global | E2E | **Implemented** | `tests/e2e/journeys/vault.api.spec.ts` | Playwright |
| Revenue Journey | Partner-attributed transaction → ledger entry | Global | E2E | **Implemented** | `tests/e2e/journeys/revenue.api.spec.ts` | Playwright |
| Tour Journey | 3D tour listing → signed URL → viewer access | Global | E2E | **Implemented** | `tests/e2e/journeys/tour.api.spec.ts` | Playwright |

### 16.2 E2E Browser Tests

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Admin Login Flow | Login page, credentials, dashboard redirect | Global | E2E | **Implemented** | `tests/e2e/journeys/admin-login.browser.spec.ts` | Playwright |
| Dashboard Verification | Welcome message, navigation elements, quick actions | Global | E2E | **Implemented** | `tests/e2e/journeys/admin-login.browser.spec.ts` | Playwright |
| Auth Persistence | Session survives page refresh | Global | E2E | **Implemented** | `tests/e2e/journeys/admin-login.browser.spec.ts` | Playwright |
| Listing Compliance Flow | Create Listing button, NYC disclosure gate (via API) | `NYC_STRICT` | E2E | **Implemented** | `tests/e2e/journeys/listing-flow.browser.spec.ts` | Playwright |
| Tour Demo Page | 3DGS viewer, canvas rendering, tour selector | Global | E2E | **Implemented** | `tests/e2e/journeys/tour-demo.browser.spec.ts` | Playwright |
| SplatViewer Controls | FPS toggle, auto-rotate, custom SOG URL | Global | E2E | **Implemented** | `tests/e2e/journeys/tour-demo.browser.spec.ts` | Playwright |

### 16.3 Test Infrastructure

| Feature | Description | Market/Flag | Package | Status | Evidence | Tests |
|---------|-------------|-------------|---------|--------|----------|-------|
| Playwright Config | Multi-project (chromium, browser, api) | Global | E2E | **Implemented** | `playwright.config.ts` | N/A |
| Browser Fixtures | Login helpers, admin credentials, locale handling | Global | E2E | **Implemented** | `tests/e2e/fixtures/browser-fixtures.ts` | N/A |
| API Fixtures | Hermetic test isolation, unique IDs | Global | E2E | **Implemented** | `tests/e2e/fixtures/test-fixtures.ts` | N/A |
| Market-Ready Reporter | Custom compliance report generator | Global | E2E | **Implemented** | `tests/e2e/reporters/market-ready-reporter.ts` | N/A |
| Docker Test Environment | Isolated postgres, redis, minio, api, web | Global | E2E | **Implemented** | `docker-compose.test.yml` | N/A |
| CI Integration | Browser tests in GitHub Actions with artifacts | Global | CI | **Implemented** | `.github/workflows/ci.yml` (e2e-market-ready job) | N/A |

---

## Summary Statistics

| Category | Implemented | Partial | Missing | Total |
|----------|-------------|---------|---------|-------|
| Compliance | 23 | 0 | 0 | 23 |
| Revenue Partners | 18 | 0 | 0 | 18 |
| Document Vault | 14 | 0 | 0 | 14 |
| AI Agents | 16 | 0 | 0 | 16 |
| Agent Governance | 11 | 0 | 0 | 11 |
| Media Generation | 9 | 0 | 0 | 9 |
| 3D Tours | 14 | 0 | 0 | 14 |
| Mobile | 2 | 0 | 3 | 5 |
| Security/SOC2 | 12 | 0 | 0 | 12 |
| Multi-Market/i18n | 6 | 0 | 1 | 7 |
| Observability | 15 | 1 | 0 | 16 |
| Workflows | 7 | 0 | 0 | 7 |
| Email Service | 11 | 0 | 0 | 11 |
| Partner Contracts | 9 | 0 | 0 | 9 |
| Feature Flags | 4 | 0 | 0 | 4 |
| Testing Infrastructure | 18 | 0 | 0 | 18 |
| **TOTAL** | **189** | **1** | **4** | **194** |

---

## Clarifications on Data Persistence

### Production Data Stores (Database-Backed)
All production data is persisted to PostgreSQL via Prisma ORM:
- User data, properties, leases, payments, documents
- Workflow executions and activity results
- Agent run logs and audit trails
- Feature flag configurations

### In-Memory Components (Test/Cache Only)
The following use in-memory storage **only for testing or caching**:
- `InMemorySignalStore` - Test doubles for workflow signals
- `InMemoryActivityResultCache` - Test doubles for activity results
- `MockRedis` - Test doubles for idempotency checks
- Feature flag overrides - Runtime cache, backed by Redis in production
- Tour metering `InMemoryMeteringService` - Test doubles only; `DatabaseMeteringService` for production

### Redis-Backed Components (Production Cache/Queue)
- Email queue (BullMQ)
- Tour conversion queue (BullMQ)
- Idempotency keys (24hr TTL)
- Feature flag fast-access cache
- Rate limiting counters

---

*This document is auto-validated by the `traceability-check` CI workflow.*
