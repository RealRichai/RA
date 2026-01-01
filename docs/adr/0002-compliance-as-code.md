# ADR-0002: Compliance-as-Code Enforcement

**Status:** Accepted
**Date:** 2025-12-31
**Authors:** RealRiches Architecture Team
**Reviewers:** Engineering Leadership, Legal/Compliance

## Context

Real estate operations are heavily regulated. Landlords must comply with:
- Fair Housing Act (federal)
- State landlord-tenant laws (50 variations)
- Local rent control ordinances (100s of jurisdictions)
- Lead paint disclosure requirements
- Security deposit limits and handling rules
- Eviction process requirements
- Accessibility requirements (ADA/FHA)

Currently, compliance is enforced through:
- Manual checklists
- Training materials
- Periodic audits
- Hope that users follow the rules

This approach has critical weaknesses:
- Compliance depends on user knowledge and diligence
- No audit trail proving compliant behavior
- Difficult to update rules when regulations change
- Cannot prove to regulators that controls exist

We need a system that **prevents non-compliant actions** rather than detecting them after the fact, and **generates evidence** of compliant behavior for audits.

## Decision

**Implement Compliance-as-Code with enforcement gates that block non-compliant operations and generate immutable evidence records.**

### Architecture Components

#### 1. Compliance Rule Engine

Rules are defined as executable code, not documentation:

```typescript
// packages/compliance-engine/src/rules/security-deposit.ts
export const securityDepositRule: ComplianceRule = {
  id: 'DEPOSIT_LIMIT_CA',
  jurisdiction: 'CA',
  effectiveDate: '2024-07-01',

  async evaluate(context: DepositContext): Promise<RuleResult> {
    const maxDeposit = context.isFurnished
      ? context.monthlyRent * 2
      : context.monthlyRent * 3;

    return {
      passed: context.requestedDeposit <= maxDeposit,
      maxAllowed: maxDeposit,
      citation: 'CA Civil Code 1950.5',
      explanation: `California limits deposits to ${context.isFurnished ? '2' : '3'} months rent`
    };
  }
};
```

#### 2. Enforcement Gates

Gates are middleware that intercept operations and enforce compliance:

```typescript
// Pre-operation gate (blocks non-compliant actions)
app.addHook('preHandler', async (request) => {
  const rules = await complianceEngine.getRulesFor(request.operation);
  const results = await Promise.all(
    rules.map(rule => rule.evaluate(request.context))
  );

  const failures = results.filter(r => !r.passed);
  if (failures.length > 0) {
    throw new ComplianceViolationError(failures);
  }
});
```

#### 3. Evidence Model

Every compliance check generates an immutable evidence record:

```typescript
interface ComplianceEvidence {
  id: string;
  timestamp: Date;
  tenantId: string;
  operationType: string;          // 'CREATE_LEASE', 'COLLECT_DEPOSIT', etc.
  operationId: string;            // ID of the operation being checked

  rulesEvaluated: {
    ruleId: string;
    ruleVersion: string;
    jurisdiction: string;
    passed: boolean;
    inputs: Record<string, unknown>;   // Snapshot of data evaluated
    outputs: Record<string, unknown>;  // Rule decision details
    citation: string;
  }[];

  outcome: 'ALLOWED' | 'BLOCKED';
  actorId: string;
  actorType: 'USER' | 'SYSTEM' | 'AGENT';

  // Immutability proof
  previousHash: string;
  contentHash: string;
}
```

#### 4. Rule Versioning

Rules are versioned and timestamped. Historical operations are evaluated against rules in effect at that time:

```typescript
const applicableRules = await complianceEngine.getRulesAsOf(
  jurisdiction,
  operationType,
  operationDate  // Uses rules in effect on this date
);
```

#### 5. Jurisdiction Resolution

System automatically determines applicable jurisdictions from property location:

```typescript
const jurisdictions = await resolveJurisdictions(property.address);
// Returns: ['US', 'CA', 'LOS_ANGELES_CITY', 'LA_RSO_ZONE']
```

## Alternatives Considered

### Alternative 1: Documentation-Only Compliance

**Description**: Provide compliance checklists and guides; users self-certify.

**Why Rejected**:
- No enforcement mechanism
- Cannot prove compliance to regulators
- Users skip steps under time pressure
- Knowledge gaps cause violations

### Alternative 2: Post-Hoc Audit System

**Description**: Allow all operations, then run nightly compliance scans to flag violations.

**Why Rejected**:
- Violations already occurred (damage done)
- Remediation is expensive and disruptive
- Creates legal liability between violation and detection
- Users learn to ignore warnings

### Alternative 3: Third-Party Compliance Service

**Description**: Integrate with external compliance SaaS (e.g., Checkr for screening, DocuSign for disclosures).

**Why Rejected**:
- Point solutions don't cover full compliance surface
- No unified evidence model
- Vendor dependency for core business logic
- Expensive per-transaction fees at scale

## Consequences

### Positive

- **Prevention Over Detection**: Non-compliant operations are blocked before they occur
- **Audit-Ready Evidence**: Every decision is recorded with full context
- **Regulatory Updates**: Rule changes deploy like code, with testing and rollback
- **Reduced Liability**: Demonstrable controls satisfy regulators and insurers
- **User Protection**: Users cannot accidentally violate regulations
- **Jurisdiction Awareness**: System handles multi-jurisdiction complexity automatically

### Negative

- **Development Overhead**: Every new feature needs compliance rules
- **False Positives**: Overly strict rules may block legitimate edge cases (need override workflow)
- **Rule Maintenance**: Must track regulatory changes across jurisdictions
- **Performance Impact**: Compliance checks add latency to operations (~50-100ms)

### Neutral

- Requires legal/compliance team to validate rules before deployment
- Evidence storage grows with operation volume (plan for retention policies)

## Follow-ups

- [ ] Define standard rule interface and evaluation contract
- [ ] Build jurisdiction resolution service from property addresses
- [ ] Create evidence storage with append-only guarantees (see ADR-0004)
- [ ] Implement override workflow for legitimate exceptions (requires approval, documented)
- [ ] Build compliance dashboard showing rule coverage and recent blocks
- [ ] Partner with legal to codify initial rule set (CA, NY, TX, FL priority)
- [ ] Create rule testing framework (given context, expect pass/fail)
- [ ] Add CI check that new features have compliance coverage
- [ ] Design evidence retention policy (7 years minimum for tax-related)
- [ ] Build regulator export format for audit requests
