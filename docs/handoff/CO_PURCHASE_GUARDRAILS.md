# Co-Purchase Group Guardrails

## Overview

The Co-Purchase Group Workspace is a **NON-CUSTODIAL** collaboration platform. This document explains the guardrails that enforce this constraint and what would be required to implement custodial functionality in the future.

## Non-Custodial Design Decision

RealRiches Co-Purchase Groups was intentionally designed as a non-custodial platform to:

1. **Avoid regulatory complexity** - Custodial services (escrow, funds handling, securities) require extensive licensing and compliance
2. **Reduce liability** - No funds = no fiduciary responsibility for group finances
3. **Simplify MVP** - Focus on collaboration value before adding financial complexity
4. **Enable faster deployment** - No need for banking integrations, escrow licenses, or securities registration

## What the Platform Provides

- Group organization and member management
- Identity verification coordination (via adapter interface)
- Document collection and sharing (via vault integration)
- Progress tracking via shared checklists
- Communication and collaboration tools

## What the Platform Does NOT Provide

All of the following are **blocked by guardrails**:

| Blocked Action | Reason |
|---------------|--------|
| Escrow services | Requires escrow license, fiduciary responsibility |
| Funds holding/transfer | Requires money transmitter license |
| Investment offerings | Requires SEC registration or exemption |
| Securities issuance | Requires SEC registration |
| Property purchase execution | Requires real estate broker license |
| Contract execution | Requires legal oversight |
| Loan origination | Requires lending license |
| Payment processing | Requires PCI compliance, banking partnerships |

## Guardrail Implementation

### Code Location

```
packages/co-purchase/src/guardrails/blocked-actions.ts
```

### Key Functions

```typescript
// Throws BlockedActionError for any custodial action
assertNonCustodial(actionType: BlockedActionType, context?: { groupId, userId }): never

// Check if an action would be blocked
isActionBlocked(actionType: BlockedActionType): boolean

// Get list of all blocked action types
getAllBlockedActions(): BlockedActionType[]
```

### BlockedActionType Enum

```typescript
type BlockedActionType =
  | 'ESCROW_CREATION'
  | 'ESCROW_RELEASE'
  | 'ESCROW_MANAGEMENT'
  | 'FUNDS_DEPOSIT'
  | 'FUNDS_WITHDRAWAL'
  | 'FUNDS_TRANSFER'
  | 'FUNDS_HOLDING'
  | 'FUNDS_HANDLING'
  | 'INVESTMENT_OFFERING'
  | 'INVESTMENT_ACCEPTANCE'
  | 'INVESTMENT_MARKETPLACE'
  | 'INVESTMENT_SOLICITATION'
  | 'PROPERTY_PURCHASE'
  | 'PROPERTY_SALE'
  | 'PROPERTY_TRANSFER'
  | 'CONTRACT_EXECUTION'
  | 'CONTRACT_SIGNING'
  | 'PAYMENT_PROCESSING'
  | 'PAYMENT_COLLECTION'
  | 'LOAN_ORIGINATION'
  | 'MORTGAGE_PROCESSING'
  | 'SECURITIES_ISSUANCE'
  | 'SYNDICATION_MANAGEMENT';
```

### API Route Guards

All blocked routes are defined in `apps/api/src/modules/co-purchase/routes.ts`:

```typescript
fastify.all('/groups/:id/escrow/*', () => {
  // BLOCKED_CUSTODIAL_STUB: Escrow requires licensing
  assertNonCustodial('ESCROW_CREATION');
});

fastify.all('/groups/:id/funds/*', () => {
  // BLOCKED_CUSTODIAL_STUB: Funds handling requires MTL
  assertNonCustodial('FUNDS_HANDLING');
});

fastify.all('/groups/:id/investment/*', () => {
  // BLOCKED_CUSTODIAL_STUB: Investment requires SEC registration
  assertNonCustodial('INVESTMENT_MARKETPLACE');
});
```

### UI Disclaimer

All group pages must display the `NonCustodialDisclaimer` component:

```tsx
<Card className="border-amber-200 bg-amber-50">
  <AlertTriangle />
  <p className="font-semibold">Non-Custodial Collaboration Platform</p>
  <p>RealRiches does not hold funds, manage escrow, or execute purchases.</p>
</Card>
```

## BLOCKED_CUSTODIAL_STUB Locations

The following locations contain `BLOCKED_CUSTODIAL_STUB` markers indicating intentionally blocked custodial functionality. These require human review, legal compliance, and appropriate licensing before implementation:

1. `packages/co-purchase/src/guardrails/blocked-actions.ts`
   - `assertNonCustodial()` function - Throws BlockedActionError for all custodial actions

2. `apps/api/src/modules/co-purchase/routes.ts` (when implemented)
   - All blocked route handlers (`/escrow/*`, `/funds/*`, `/investment/*`, etc.)

3. `packages/co-purchase/src/evidence/group-evidence.ts`
   - `emitBlockedActionEvidence()` function - Records blocked action attempts

## Regulatory Considerations for Future Custodial Features

If custodial functionality is desired in the future, the following must be addressed:

### For Escrow Services
- [ ] Obtain escrow license in each operating state
- [ ] Establish fiduciary policies and procedures
- [ ] Implement trust accounting
- [ ] Add escrow disbursement workflows
- [ ] Integrate with escrow insurance

### For Funds Handling
- [ ] Obtain money transmitter license (state-by-state)
- [ ] Implement AML/KYC procedures beyond current verification
- [ ] Integrate with banking partners
- [ ] Add suspicious activity monitoring
- [ ] Implement fund reconciliation

### For Investment Marketplace
- [ ] File SEC registration or qualify for exemption (Reg D, Reg CF, Reg A+)
- [ ] Implement accredited investor verification
- [ ] Add required investor disclosures
- [ ] Implement investment limits and caps
- [ ] Add annual filing and reporting

### For Property Purchase Execution
- [ ] Partner with licensed real estate brokers
- [ ] Integrate with title companies
- [ ] Add closing coordination workflows
- [ ] Implement deed recording

## Evidence and Audit Trail

All blocked action attempts are logged for SOC2 compliance:

```typescript
emitBlockedActionEvidence(
  groupId,
  actorId,
  actionType,
  { reason: 'NON_CUSTODIAL_GUARDRAIL' }
);
```

Control ID: `CC7.4` (Policy Enforcement)

## Testing

Critical guardrail tests are in:
```
packages/co-purchase/src/__tests__/guardrails.test.ts
```

Run with:
```bash
cd packages/co-purchase && pnpm test
```

All 46 guardrail tests must pass before deployment.

## Contact

For questions about implementing custodial functionality, contact:
- Legal: [legal@realriches.com]
- Compliance: [compliance@realriches.com]
- Engineering: [eng-leads@realriches.com]
