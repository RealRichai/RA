# ADR-0004: Ledger Integrity Model

**Status:** Accepted
**Date:** 2025-12-31
**Authors:** RealRiches Architecture Team
**Reviewers:** Engineering Leadership, Finance Team

## Context

RealRiches handles significant financial operations:
- Rent collection ($X million/month across all tenants)
- Security deposit management
- Vendor payments
- Owner distributions
- Tax reporting (1099s)

Financial data integrity is critical:
- Regulators require accurate, auditable records
- Tax filings must match transaction history
- Disputes require proving what happened and when
- Errors must be corrected without destroying history

Traditional CRUD databases allow updates and deletes, which:
- Destroy historical state
- Make auditing difficult
- Enable (accidental or malicious) record tampering
- Create reconciliation challenges

We need a ledger model that guarantees integrity while supporting practical operations like corrections and reconciliation.

## Decision

**Implement an append-only ledger with idempotency controls, automated reconciliation, and optional blockchain anchoring for high-value transactions.**

### Core Principles

1. **Append-Only**: Never UPDATE or DELETE financial records; only INSERT new entries
2. **Corrections as Reversals**: Errors are fixed by adding reversal entries, preserving full history
3. **Idempotency**: Duplicate submissions produce identical results, not duplicate records
4. **Reconciliation**: Automated checks ensure ledger matches external sources
5. **Anchoring**: High-value transactions can be cryptographically anchored for tamper evidence

### Architecture Components

#### 1. Append-Only Ledger Entry

```typescript
interface LedgerEntry {
  id: string;                        // UUID
  sequence: bigint;                  // Monotonically increasing, gap-free
  timestamp: Date;
  tenantId: string;

  // Transaction identity
  transactionId: string;             // Groups related entries
  entryType: 'DEBIT' | 'CREDIT' | 'REVERSAL' | 'ADJUSTMENT';

  // What happened
  accountId: string;                 // Which account affected
  accountType: 'RENT_RECEIVABLE' | 'SECURITY_DEPOSIT' | 'VENDOR_PAYABLE' | etc;
  amount: Decimal;                   // Always positive; sign from entryType
  currency: string;

  // Context
  description: string;
  referenceType: 'LEASE' | 'PAYMENT' | 'INVOICE' | 'DISTRIBUTION';
  referenceId: string;
  metadata: Record<string, unknown>;

  // Idempotency
  idempotencyKey: string;            // Client-provided, unique per tenant
  idempotencyExpiry: Date;

  // Integrity chain
  previousHash: string;              // Hash of previous entry
  contentHash: string;               // Hash of this entry's content

  // Correction tracking
  correctsEntryId?: string;          // If this is a reversal/adjustment
  correctionReason?: string;

  // Actor
  actorId: string;
  actorType: 'USER' | 'SYSTEM' | 'AGENT';
}
```

#### 2. Idempotency Implementation

```typescript
async function createLedgerEntry(
  request: CreateEntryRequest
): Promise<LedgerEntry> {
  // Check for existing entry with same idempotency key
  const existing = await prisma.ledgerEntry.findFirst({
    where: {
      tenantId: request.tenantId,
      idempotencyKey: request.idempotencyKey,
      idempotencyExpiry: { gt: new Date() },
    },
  });

  if (existing) {
    // Return existing entry (idempotent behavior)
    return existing;
  }

  // Create new entry with hash chain
  const previousEntry = await getLastEntry(request.tenantId);
  const previousHash = previousEntry?.contentHash ?? 'GENESIS';

  const entry = {
    ...request,
    sequence: previousEntry ? previousEntry.sequence + 1n : 1n,
    previousHash,
    contentHash: computeHash({ ...request, previousHash }),
    idempotencyExpiry: addDays(new Date(), 7),
  };

  return prisma.ledgerEntry.create({ data: entry });
}
```

#### 3. Correction via Reversal

```typescript
async function correctEntry(
  originalEntryId: string,
  reason: string,
  actor: Actor
): Promise<{ reversal: LedgerEntry; corrected?: LedgerEntry }> {
  const original = await prisma.ledgerEntry.findUnique({
    where: { id: originalEntryId },
  });

  if (!original) throw new NotFoundError('Entry not found');

  // Create reversal entry (opposite sign)
  const reversal = await createLedgerEntry({
    tenantId: original.tenantId,
    transactionId: generateId(),
    entryType: 'REVERSAL',
    accountId: original.accountId,
    accountType: original.accountType,
    amount: original.amount,  // Same amount, REVERSAL type indicates opposite
    currency: original.currency,
    description: `Reversal: ${reason}`,
    referenceType: original.referenceType,
    referenceId: original.referenceId,
    correctsEntryId: originalEntryId,
    correctionReason: reason,
    actorId: actor.id,
    actorType: actor.type,
    idempotencyKey: `reversal-${originalEntryId}`,
  });

  return { reversal };
}
```

#### 4. Automated Reconciliation

```typescript
interface ReconciliationJob {
  id: string;
  runDate: Date;
  scope: 'DAILY' | 'MONTHLY' | 'QUARTERLY';

  checks: ReconciliationCheck[];
  status: 'PENDING' | 'PASSED' | 'FAILED' | 'NEEDS_REVIEW';

  discrepancies: Discrepancy[];
}

interface ReconciliationCheck {
  name: string;
  description: string;

  // Internal check: ledger totals match expected
  internalBalance?: {
    accountType: string;
    expectedBalance: Decimal;
    actualBalance: Decimal;
    matched: boolean;
  };

  // External check: ledger matches external source
  externalMatch?: {
    source: 'STRIPE' | 'BANK' | 'PLAID';
    externalId: string;
    externalAmount: Decimal;
    ledgerAmount: Decimal;
    matched: boolean;
  };

  // Integrity check: hash chain is valid
  integrityCheck?: {
    entriesVerified: number;
    chainValid: boolean;
    brokenAt?: string;
  };
}

// Scheduled reconciliation job
async function runDailyReconciliation(tenantId: string): Promise<ReconciliationJob> {
  const checks: ReconciliationCheck[] = [];

  // 1. Verify hash chain integrity
  checks.push(await verifyHashChain(tenantId));

  // 2. Reconcile with Stripe payments
  checks.push(await reconcileStripePayments(tenantId, 'yesterday'));

  // 3. Verify account balances
  checks.push(await verifyAccountBalances(tenantId));

  // 4. Check for orphaned transactions
  checks.push(await findOrphanedTransactions(tenantId));

  const discrepancies = checks
    .filter(c => !c.matched || !c.chainValid)
    .map(toDiscrepancy);

  return prisma.reconciliationJob.create({
    data: {
      tenantId,
      runDate: new Date(),
      scope: 'DAILY',
      checks,
      status: discrepancies.length > 0 ? 'NEEDS_REVIEW' : 'PASSED',
      discrepancies,
    },
  });
}
```

#### 5. Optional Blockchain Anchoring

For high-value transactions or regulatory requirements, anchor ledger state to a public blockchain:

```typescript
interface LedgerAnchor {
  id: string;
  timestamp: Date;
  tenantId: string;

  // What's being anchored
  anchorType: 'PERIODIC' | 'HIGH_VALUE' | 'REGULATORY';
  fromSequence: bigint;
  toSequence: bigint;
  entryCount: number;

  // Merkle root of entries in range
  merkleRoot: string;

  // Blockchain proof
  blockchain: 'ETHEREUM' | 'POLYGON' | 'BITCOIN_OPRETURN';
  transactionHash: string;
  blockNumber: number;
  blockTimestamp: Date;

  // Verification
  verified: boolean;
  verifiedAt?: Date;
}

// Anchor high-value transactions immediately
async function anchorIfHighValue(entry: LedgerEntry): Promise<void> {
  if (entry.amount.greaterThan(HIGH_VALUE_THRESHOLD)) {
    await queueAnchor({
      tenantId: entry.tenantId,
      anchorType: 'HIGH_VALUE',
      fromSequence: entry.sequence,
      toSequence: entry.sequence,
    });
  }
}

// Periodic anchoring (daily batch)
async function anchorDailyBatch(tenantId: string): Promise<LedgerAnchor> {
  const lastAnchor = await getLastAnchor(tenantId);
  const entries = await getEntriesSince(tenantId, lastAnchor?.toSequence ?? 0n);

  if (entries.length === 0) return null;

  const merkleRoot = computeMerkleRoot(entries.map(e => e.contentHash));

  // Submit to blockchain
  const tx = await blockchain.submit({
    type: 'LEDGER_ANCHOR',
    tenantId,
    merkleRoot,
    fromSequence: entries[0].sequence,
    toSequence: entries[entries.length - 1].sequence,
  });

  return prisma.ledgerAnchor.create({
    data: {
      tenantId,
      anchorType: 'PERIODIC',
      fromSequence: entries[0].sequence,
      toSequence: entries[entries.length - 1].sequence,
      entryCount: entries.length,
      merkleRoot,
      blockchain: 'POLYGON',
      transactionHash: tx.hash,
      blockNumber: tx.blockNumber,
      blockTimestamp: tx.timestamp,
      verified: false,
    },
  });
}
```

## Alternatives Considered

### Alternative 1: Traditional CRUD with Soft Deletes

**Description**: Use standard update/delete with `deleted_at` timestamps and audit triggers.

**Why Rejected**:
- Records can still be mutated (soft delete is still mutation)
- Audit triggers can be bypassed by superusers
- No cryptographic integrity proof
- Harder to reconstruct point-in-time state

### Alternative 2: Event Sourcing Everything

**Description**: Full event sourcing for all data, not just financial ledger.

**Why Rejected**:
- Over-engineering for non-financial data
- Significant complexity increase
- Query performance challenges
- Team unfamiliar with event sourcing patterns

### Alternative 3: Third-Party Ledger Service

**Description**: Use external immutable ledger service (e.g., AWS QLDB, Azure Ledger).

**Why Rejected**:
- Vendor lock-in for core financial data
- Limited query capabilities
- Additional latency for external calls
- Cost scales with transaction volume

## Consequences

### Positive

- **Immutability**: Financial history cannot be altered retroactively
- **Auditability**: Complete, verifiable transaction trail
- **Idempotency**: Safe retries for payment processing
- **Reconciliation**: Automated discrepancy detection
- **Tamper Evidence**: Blockchain anchors prove data hasn't been modified
- **Compliance**: Meets SOC 2, financial audit requirements

### Negative

- **Storage Growth**: Never deleting means continuous growth (mitigate with archival)
- **Query Complexity**: Calculating current balance requires aggregation
- **Correction Overhead**: Errors need reversal entries, not simple updates
- **Anchoring Cost**: Blockchain transactions have fees (~$0.01-0.10 each)

### Neutral

- Need materialized views for efficient balance queries
- Archival strategy needed for entries older than retention period
- Blockchain anchoring is optional per tenant (premium feature)

## Follow-ups

- [ ] Implement LedgerEntry model in Prisma schema with appropriate indexes
- [ ] Create idempotency key table with TTL cleanup job
- [ ] Build hash chain verification utility
- [ ] Implement daily reconciliation job with Stripe, bank integrations
- [ ] Create discrepancy alerting and review workflow
- [ ] Build materialized balance views for common queries
- [ ] Implement blockchain anchoring service (start with Polygon for low fees)
- [ ] Create ledger archival strategy (move to cold storage after 7 years)
- [ ] Build point-in-time balance query capability
- [ ] Add monitoring for hash chain breaks (critical alert)
- [ ] Create ledger export for tax/audit purposes
