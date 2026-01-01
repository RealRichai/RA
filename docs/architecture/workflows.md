# Durable Workflow Foundation

This document describes the workflow abstraction package (`@realriches/workflows`) which provides a Temporal-ready foundation for orchestrating long-running processes.

## Overview

The workflow package enables reliable orchestration of multi-step processes with:

- **Automatic retry** with exponential backoff
- **Idempotency** to prevent duplicate side effects
- **State persistence** for crash recovery
- **Audit trail** of all workflow steps

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│  (API Routes, Background Jobs, Event Handlers)              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   LocalWorkflowRuntime                       │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────┐      │
│  │  Workflow  │  │  Activity   │  │     Signal       │      │
│  │  Executor  │  │  Executor   │  │     Handler      │      │
│  └────────────┘  └─────────────┘  └──────────────────┘      │
└─────────────────────────┬───────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│ WorkflowStore │ │ ActivityStore │ │ ActivityCache │
│   (Prisma)    │ │   (Prisma)    │ │   (Redis)     │
└───────────────┘ └───────────────┘ └───────────────┘
```

## Why Workflows?

### Problem: Unreliable Multi-Step Processes

Without workflows, a multi-step process like rental application screening faces several challenges:

1. **Network failures** can leave the process in an unknown state
2. **Server restarts** lose in-memory progress
3. **Retries** may cause duplicate charges or notifications
4. **No audit trail** of what steps completed

### Solution: Durable Workflow Execution

Workflows solve these problems by:

1. **Persisting state** after each step
2. **Retrying failed activities** with backoff
3. **Ensuring idempotency** through cached results
4. **Recording evidence** for compliance audits

## Core Concepts

### Workflow Definition

A workflow is a series of steps that execute in a defined order:

```typescript
import { defineWorkflow } from '@realriches/workflows';

const MyWorkflow = defineWorkflow<MyInput, MyOutput>({
  name: 'my-workflow',
  version: '1.0.0',

  async execute(ctx, input) {
    // Step 1: Do something
    const result1 = await activities.execute(step1Activity, input);

    // Step 2: Do something else
    const result2 = await activities.execute(step2Activity, result1);

    return { result1, result2 };
  },
});
```

### Activity Definition

Activities are individual units of work within a workflow:

```typescript
import { defineActivity, RetryPolicies } from '@realriches/workflows';

const processPaymentActivity = defineActivity<
  { amount: number; userId: string },
  { transactionId: string }
>({
  name: 'process-payment',
  retryPolicy: RetryPolicies.payment,
  timeout: 30000,

  // Key for idempotency - same input = same key
  idempotencyKey: (input) => `payment:${input.userId}:${input.amount}`,

  async execute(input) {
    // Process the payment
    const result = await paymentService.charge(input.amount, input.userId);
    return { transactionId: result.id };
  },
});
```

### Retry Policies

Retry policies define how failed activities are retried:

```typescript
// Built-in policies
RetryPolicies.validation     // No retries (validation is deterministic)
RetryPolicies.database       // 5 retries, 500ms initial delay
RetryPolicies.externalService // 10 retries, 1s initial delay
RetryPolicies.payment        // 3 retries (careful with payments!)
RetryPolicies.background     // 20 retries over long period

// Custom policy
const customPolicy = createRetryPolicy({
  initialInterval: 1000,      // Start with 1 second
  backoffCoefficient: 2,      // Double each retry
  maximumInterval: 60000,     // Cap at 1 minute
  maximumAttempts: 5,         // Try 5 times max
  nonRetryableErrors: ['CardDeclinedError'],
});
```

### How Retries Work

1. Activity execution fails
2. Check if error is in `nonRetryableErrors` - if so, fail immediately
3. Calculate delay: `initialInterval * backoffCoefficient^(attempt-1)`
4. Cap delay at `maximumInterval`
5. Add jitter to prevent thundering herd
6. Wait and retry
7. Repeat until `maximumAttempts` reached

Example progression with default database policy:
- Attempt 1: Immediate
- Attempt 2: Wait 500ms
- Attempt 3: Wait 1000ms
- Attempt 4: Wait 2000ms
- Attempt 5: Wait 4000ms
- Fail after 5 attempts

## Idempotency

### Why Idempotency Matters

Consider this scenario:

1. Activity calls external payment API
2. Network timeout occurs
3. Payment may or may not have succeeded
4. Retry would cause duplicate charge!

### How Idempotency Works

Each activity generates an **idempotency key** from its input:

```typescript
idempotencyKey: (input) => `charge:${input.orderId}:${input.amount}`
```

Before executing, the runtime checks:
1. Is there a cached result for this key?
2. If yes, return the cached result (no execution)
3. If no, execute and cache the result

This ensures:
- Same input → Same output (exactly once semantics)
- Retries don't cause duplicate side effects
- Network failures are safe to retry

### Idempotency Best Practices

1. **Include all relevant input fields** in the key
2. **Use unique identifiers** like orderId, applicationId
3. **Don't include timestamps** or random values
4. **Consider TTL** for cache expiration

## NYC Application Compliance Workflow

The main workflow implementation is the NYC Fair Chance Housing Act (FCHA) compliance workflow:

```typescript
import { NYCApplicationComplianceWorkflow } from '@realriches/workflows';

// Start the workflow
const workflowId = await runtime.startWorkflow(
  NYCApplicationComplianceWorkflow,
  {
    applicationId: 'app_123',
    applicantId: 'user_456',
    propertyId: 'prop_789',
    unitId: 'unit_101',
    organizationId: 'org_111',
    marketId: 'NYC',
  }
);
```

### FCHA State Machine

The workflow enforces the legal FCHA state machine:

```
PREQUALIFICATION
     │
     ├──[prequal failed]──► DENIED
     │
     ▼
CONDITIONAL_OFFER
     │
     ├──[authorization timeout]──► DENIED
     │
     ▼
BACKGROUND_CHECK_ALLOWED
     │
     ├──[no adverse info]──► APPROVED
     │
     ▼
INDIVIDUALIZED_ASSESSMENT
     │
     ├──[approved]──► APPROVED
     │
     └──[denied]──► DENIED
```

### Evidence Emission

At each state transition, the workflow emits SOC2-compliant evidence:

- Initialization evidence
- Prequalification results
- Conditional offer delivery
- Background check authorization
- Background check results
- Individualized assessment factors
- Final decision rationale

## Usage

### Starting a Workflow

```typescript
import {
  LocalWorkflowRuntime,
  PrismaWorkflowStore,
  PrismaActivityStore,
  InMemoryActivityCache,
  NYCApplicationComplianceWorkflow,
} from '@realriches/workflows';

// Create runtime
const runtime = new LocalWorkflowRuntime({
  workflowStore: new PrismaWorkflowStore(prisma),
  activityStore: new PrismaActivityStore(prisma),
  activityCache: new InMemoryActivityCache(),
});

// Start workflow (async)
const workflowId = await runtime.startWorkflow(
  NYCApplicationComplianceWorkflow,
  input
);

// Or execute synchronously
const result = await runtime.executeWorkflowSync(
  NYCApplicationComplianceWorkflow,
  input
);
```

### Sending Signals

Workflows can wait for external events (signals):

```typescript
// In workflow definition
const authorization = await signals.waitFor(
  'background_check_authorization_signed',
  { timeout: 7 * 24 * 60 * 60 * 1000 } // 7 days
);

// From application code
await runtime.sendSignal(workflowId, 'background_check_authorization_signed', {
  signedAt: new Date(),
  signedBy: userId,
});
```

### Querying Workflows

```typescript
// Get workflow status
const execution = await runtime.getWorkflow(workflowId);

// Query by criteria
const workflows = await workflowStore.query({
  workflowName: 'nyc-application-compliance',
  status: 'running',
  organizationId: 'org_123',
});
```

## Temporal Migration Path

The workflow package is designed for easy migration to [Temporal](https://temporal.io/):

| Local Runtime | Temporal Equivalent |
|--------------|---------------------|
| `LocalWorkflowRuntime` | `WorkflowClient` |
| `WorkflowDefinition` | `@workflow.defn` |
| `ActivityDefinition` | `@activity.defn` |
| `RetryPolicy` | `retry_policy` |
| `signals.waitFor()` | `workflow.wait_condition()` |
| `runtime.sendSignal()` | `client.signal()` |

Migration steps:

1. Install Temporal server
2. Create `TemporalWorkflowRuntime` implementing same interface
3. Swap `LocalWorkflowRuntime` for `TemporalWorkflowRuntime`
4. No changes to workflow or activity definitions needed

## Database Schema

The workflow package uses two database tables:

### WorkflowExecution

Stores workflow instance state:

```prisma
model WorkflowExecution {
  id              String         @id @default(uuid())
  workflowId      String         @unique
  runId           String
  workflowName    String
  workflowVersion String
  status          WorkflowStatus
  input           Json
  output          Json?
  error           String?
  currentStep     String?
  stateHistory    Json
  actorId         String?
  organizationId  String?
  startedAt       DateTime
  completedAt     DateTime?
}
```

### ActivityExecution

Stores activity execution records:

```prisma
model ActivityExecution {
  id              String         @id @default(uuid())
  workflowId      String
  activityName    String
  idempotencyKey  String         @unique
  status          ActivityStatus
  input           Json
  output          Json?
  error           String?
  attempt         Int
  startedAt       DateTime
  completedAt     DateTime?
}
```

## Testing

### Unit Tests

Test individual components:

```typescript
import { RetryPolicies, calculateRetryDelay } from '@realriches/workflows';

describe('Retry Policies', () => {
  it('should calculate exponential backoff', () => {
    expect(calculateRetryDelay(RetryPolicies.database, 1)).toBe(500);
    expect(calculateRetryDelay(RetryPolicies.database, 2)).toBe(1000);
    expect(calculateRetryDelay(RetryPolicies.database, 3)).toBe(2000);
  });
});
```

### Integration Tests

Test complete workflow execution:

```typescript
import { NYCApplicationComplianceWorkflow } from '@realriches/workflows';

describe('NYC Compliance Workflow', () => {
  it('should approve valid application', async () => {
    const result = await runtime.executeWorkflowSync(
      NYCApplicationComplianceWorkflow,
      validInput
    );
    expect(result.approved).toBe(true);
    expect(result.evidenceIds.length).toBeGreaterThan(0);
  });
});
```

## Best Practices

1. **Keep activities small** - Each activity should do one thing
2. **Use appropriate retry policies** - Don't retry validation errors
3. **Generate meaningful idempotency keys** - Include unique identifiers
4. **Emit evidence at each step** - For compliance and debugging
5. **Handle timeouts gracefully** - Provide default values
6. **Test failure scenarios** - Ensure retries work correctly

## Files

| File | Description |
|------|-------------|
| `src/types.ts` | Core type definitions |
| `src/retry/policies.ts` | Built-in retry policies |
| `src/activities/idempotency.ts` | Idempotency key generation |
| `src/activities/registry.ts` | Activity registration |
| `src/runtime/local-runtime.ts` | In-process executor |
| `src/persistence/prisma-store.ts` | Prisma-backed persistence |
| `src/workflows/nyc-application-compliance.ts` | FCHA workflow |
