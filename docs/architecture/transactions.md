# Transaction Architecture

> **Last Updated:** 2026-01-02
> **Owner:** Platform Team
> **Status:** Implemented

This document describes the transaction management architecture for RealRiches, including serializable transactions, retry logic, and patterns for atomic operations.

---

## Overview

RealRiches uses **SERIALIZABLE** transactions for critical operations that require guaranteed consistency:

1. **Ledger Operations**: Double-entry bookkeeping for revenue and payouts
2. **Compliance Evidence**: Decision + audit log atomicity for SOC2
3. **Payment Webhooks**: Idempotent processing to prevent duplicates

The transaction wrapper in `@realriches/database` provides:

- SERIALIZABLE isolation level for strictest consistency
- Automatic retry with exponential backoff for transient failures
- Transaction client propagation for nested operations
- Metrics and observability for transaction health

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Application Layer                              │
│                                                                         │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────────────────────┐   │
│   │   Ledger    │   │ Compliance  │   │    Payment Webhooks         │   │
│   │   Service   │   │   Service   │   │    (Stripe, etc.)           │   │
│   └──────┬──────┘   └──────┬──────┘   └──────────────┬──────────────┘   │
│          │                 │                         │                  │
│          ▼                 ▼                         ▼                  │
│   ┌──────────────────────────────────────────────────────────────────┐  │
│   │            withSerializableTransaction()                          │  │
│   │                                                                   │  │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │  │
│   │  │   Ledger    │  │ Compliance  │  │    Idempotent           │   │  │
│   │  │ Transaction │  │ Transaction │  │    Transaction          │   │  │
│   │  │ (5 retries) │  │ (3 retries) │  │    (with key)           │   │  │
│   │  └─────────────┘  └─────────────┘  └─────────────────────────┘   │  │
│   └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    packages/database/src/transactions.ts                │
│                                                                         │
│   Retry Loop                                                            │
│   ┌─────────────────────────────────────────────────────────────────┐   │
│   │  for attempt in 0..maxRetries:                                  │   │
│   │    try:                                                         │   │
│   │      result = prisma.$transaction(fn, {                         │   │
│   │        isolationLevel: SERIALIZABLE                             │   │
│   │      })                                                         │   │
│   │      return { result, attempts, durationMs }                    │   │
│   │    catch (SerializationError | TimeoutError):                   │   │
│   │      delay = exponentialBackoff(attempt) + jitter               │   │
│   │      await sleep(delay)                                         │   │
│   └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL Database                             │
│                                                                         │
│   SERIALIZABLE Isolation Level                                          │
│   - Prevents: Dirty reads, Non-repeatable reads, Phantom reads          │
│   - Guarantees: Equivalent to serial execution                          │
│   - Trade-off: May cause serialization failures under contention        │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Transaction Types

### 1. Serializable Transaction

The base transaction wrapper with SERIALIZABLE isolation and retry logic.

```typescript
import { withSerializableTransaction } from '@realriches/database';

const result = await withSerializableTransaction(async (tx) => {
  const record = await tx.ledgerEntry.create({ data: ... });
  await tx.auditLog.create({ data: ... });
  return record;
}, {
  context: 'ledger-post',
  maxRetries: 3,
});

console.log(`Completed in ${result.attempts} attempts`);
```

### 2. Ledger Transaction

Specialized for double-entry bookkeeping with extended retries.

```typescript
import { withLedgerTransaction } from '@realriches/database';

const result = await withLedgerTransaction(async (tx) => {
  // Debit entry
  await tx.ledgerEntry.create({
    data: { accountId: 'revenue', amount: 100, type: 'DEBIT' },
  });
  // Credit entry
  await tx.ledgerEntry.create({
    data: { accountId: 'partner', amount: 100, type: 'CREDIT' },
  });
  return { posted: true };
}, 'partner-payout');
```

Configuration:
- `maxRetries: 5` (more retries for critical ledger ops)
- `timeout: 60000` (longer timeout for complex operations)

### 3. Compliance Transaction

For compliance decisions with audit trail atomicity.

```typescript
import { withComplianceTransaction } from '@realriches/database';

const result = await withComplianceTransaction(async (tx) => {
  const decision = await tx.complianceDecision.create({
    data: { outcome: 'APPROVED', ... },
  });
  await tx.auditLog.create({
    data: { action: 'COMPLIANCE_DECISION', entityId: decision.id, ... },
  });
  return decision;
}, 'fcha-screening');
```

### 4. Idempotent Transaction

For webhook processing with duplicate prevention.

```typescript
import { withIdempotentTransaction } from '@realriches/database';

const result = await withIdempotentTransaction(
  paymentIntentId, // Idempotency key
  async (tx) => {
    // Check if already processed
    const existing = await tx.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntentId },
    });
    if (existing) return { existing, wasIdempotent: true };

    // Process new payment
    return tx.payment.create({ data: ... });
  },
  'stripe-webhook'
);
```

---

## Retry Logic

### Retryable Errors

The transaction wrapper automatically retries these PostgreSQL errors:

| Code | Name | Description |
|------|------|-------------|
| 40001 | serialization_failure | Concurrent transaction conflict |
| 40P01 | deadlock_detected | Circular lock dependency |
| 55P03 | lock_not_available | Lock acquisition timeout |
| 57014 | query_canceled | Query timeout (may succeed on retry) |

Prisma error code `P2034` (transaction conflict) is also retried.

### Exponential Backoff

Delays follow exponential backoff with jitter to prevent thundering herd:

```
delay = min(baseDelay * 2^attempt + random(0, 25% of delay), maxDelay)
```

Default configuration:
- `baseDelay: 100ms`
- `maxDelay: 2000ms`
- `maxRetries: 3`

Example delay sequence:
- Attempt 0: 100-125ms
- Attempt 1: 200-250ms
- Attempt 2: 400-500ms
- Attempt 3: 800-1000ms

---

## Transaction Client Propagation

Use `withSerializableTransactionOrExisting` for functions that may be called standalone or within an existing transaction:

```typescript
import {
  withSerializableTransactionOrExisting,
  type TransactionClient,
} from '@realriches/database';

async function createLedgerEntry(
  data: LedgerEntryInput,
  tx?: TransactionClient
): Promise<LedgerEntry> {
  return withSerializableTransactionOrExisting(tx, async (client) => {
    return client.ledgerEntry.create({ data });
  });
}

// Standalone usage - creates new transaction
await createLedgerEntry(entryData);

// Nested usage - uses existing transaction
await withSerializableTransaction(async (tx) => {
  await createLedgerEntry(entry1, tx);
  await createLedgerEntry(entry2, tx); // Same transaction
});
```

---

## Error Handling

### TransactionError

All transaction failures throw `TransactionError` with structured information:

```typescript
import { TransactionError, TransactionErrorCode } from '@realriches/database';

try {
  await withSerializableTransaction(async (tx) => { ... });
} catch (error) {
  if (error instanceof TransactionError) {
    console.error(`Failed after ${error.attempts} attempts`);
    console.error(`Error code: ${error.code}`);
    console.error(`Original cause: ${error.originalCause?.message}`);

    switch (error.code) {
      case TransactionErrorCode.MAX_RETRIES_EXCEEDED:
        // All retries exhausted
        break;
      case TransactionErrorCode.SERIALIZATION_FAILURE:
        // Final attempt failed with serialization error
        break;
      case TransactionErrorCode.TIMEOUT:
        // Transaction timed out
        break;
    }
  }
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `SERIALIZATION_FAILURE` | PostgreSQL serialization conflict |
| `DEADLOCK` | Deadlock detected |
| `TIMEOUT` | Transaction timeout exceeded |
| `MAX_RETRIES_EXCEEDED` | All retry attempts exhausted |
| `IDEMPOTENCY_CONFLICT` | Idempotency key conflict |
| `UNKNOWN` | Unrecognized error |

---

## Metrics

Transaction metrics are tracked for observability:

```typescript
import {
  getTransactionMetrics,
  resetTransactionMetrics,
  recordTransactionMetrics,
} from '@realriches/database';

// Get current metrics
const metrics = getTransactionMetrics();
console.log({
  total: metrics.total,
  successful: metrics.successful,
  failed: metrics.failed,
  retried: metrics.retried,
  avgDurationMs: metrics.avgDurationMs,
  avgRetries: metrics.avgRetries,
});

// Reset metrics (e.g., after export to Prometheus)
resetTransactionMetrics();
```

---

## Best Practices

### 1. Keep Transactions Short

SERIALIZABLE transactions hold locks. Minimize time spent:

```typescript
// Good: Only database operations in transaction
const data = await prepareData(); // Outside transaction
await withSerializableTransaction(async (tx) => {
  await tx.record.create({ data });
});

// Bad: External calls inside transaction
await withSerializableTransaction(async (tx) => {
  const data = await fetchExternalApi(); // Holds locks!
  await tx.record.create({ data });
});
```

### 2. Order Operations Consistently

Prevent deadlocks by accessing tables/rows in consistent order:

```typescript
// Good: Always process in same order
const sortedItems = items.sort((a, b) => a.id.localeCompare(b.id));
await withSerializableTransaction(async (tx) => {
  for (const item of sortedItems) {
    await tx.item.update({ where: { id: item.id }, data: ... });
  }
});
```

### 3. Use Appropriate Transaction Type

Choose the right wrapper for your use case:

| Use Case | Transaction Type | Why |
|----------|------------------|-----|
| Revenue posting | `withLedgerTransaction` | Extra retries, longer timeout |
| Audit logging | `withComplianceTransaction` | Balanced settings |
| Webhook handling | `withIdempotentTransaction` | Duplicate prevention |
| General atomic ops | `withSerializableTransaction` | Full control |

### 4. Test with Concurrency

Integration tests should verify behavior under contention:

```typescript
describe('Concurrent transactions', () => {
  it('should handle serialization conflicts', async () => {
    // Simulate concurrent updates to same row
    const results = await Promise.all([
      updateBalance(accountId, 100),
      updateBalance(accountId, 200),
    ]);

    // Both should complete (possibly with retries)
    expect(results.every(r => r.success)).toBe(true);
  });
});
```

---

## Testing

### Unit Tests

Test error detection and metrics without database:

```bash
cd apps/api
npx vitest run -c vitest.transactions.config.ts
```

### Integration Tests

Test actual serialization conflicts (requires PostgreSQL):

```bash
cd apps/api
DATABASE_URL=... npx vitest run tests/transactions-integration.test.ts
```

---

## References

- [PostgreSQL Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html)
- [Prisma Interactive Transactions](https://www.prisma.io/docs/concepts/components/prisma-client/transactions)
- [Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
