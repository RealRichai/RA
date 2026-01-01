# Persistence Architecture

> **Last Updated:** 2026-01-01
> **Owner:** Platform Team
> **Status:** Implemented

This document describes the persistence layer architecture for RealRiches, including the composition root pattern, transaction propagation, and safety guarantees.

---

## Overview

RealRiches uses a **Composition Root** pattern to centralize all persistence wiring. This ensures:

1. **Production Safety**: Production environments NEVER use in-memory stores
2. **Test Isolation**: Unit tests can use fast in-memory implementations
3. **Single Source of Truth**: All store construction happens in one place
4. **Transaction Propagation**: All repositories share the same Prisma client instance

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           apps/api/src/index.ts                         │
│                        (Application Entry Point)                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    apps/api/src/persistence/index.ts                    │
│                        (COMPOSITION ROOT)                               │
│                                                                         │
│  ┌─────────────────────┐     ┌─────────────────────┐                   │
│  │ Production/Dev Mode │     │     Test Mode       │                   │
│  │                     │     │                     │                   │
│  │ PrismaAttributionSt │     │ InMemoryAttribution │                   │
│  │ DatabaseMeteringSvc │     │ InMemoryMeteringSvc │                   │
│  │                     │     │ (dynamic imports)   │                   │
│  └─────────────────────┘     └─────────────────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
            │   Routes     │ │   Services   │ │    Jobs      │
            │  (modules/)  │ │  (services/) │ │   (jobs/)    │
            └──────────────┘ └──────────────┘ └──────────────┘
```

---

## Composition Root

The composition root is located at `apps/api/src/persistence/index.ts`.

### Responsibilities

1. **Environment Detection**: Determines if running in production, development, or test mode
2. **Store Construction**: Creates appropriate implementations based on environment
3. **Runtime Validation**: Throws if in-memory stores are wired in production
4. **Service Factory**: Provides accessor functions for all stores and services

### Usage

```typescript
// In apps/api/src/index.ts
import { initializePersistence } from './persistence';

// Initialize during startup (after database connection)
initializePersistence();

// In route handlers
import { getAttributionService, getMeteringService } from '../../persistence';

// Use the service
const service = getAttributionService();
const attribution = await service.createAttribution(input);
```

### Environment Modes

| Environment | Store Type | Database Required |
|-------------|------------|-------------------|
| `production` | Prisma/PostgreSQL | Yes |
| `development` | Prisma/PostgreSQL | Yes |
| `test` | InMemory | No |

---

## Store Registry

The composition root maintains a registry of all stores:

| Store | Production Implementation | Test Implementation |
|-------|--------------------------|---------------------|
| `attribution` | `PrismaAttributionStore` | `InMemoryAttributionStore` |
| `metering` | `DatabaseMeteringService` | `InMemoryMeteringService` |

### Adding New Stores

1. Define the store interface in the appropriate package
2. Create both Prisma and InMemory implementations
3. Add to the store registry in `apps/api/src/persistence/index.ts`
4. Add accessor function
5. Add to runtime validation

---

## Transaction Propagation

All Prisma-backed stores share the same `PrismaClient` instance, imported from `@realriches/database`. This enables:

### Automatic Transaction Context

```typescript
// Multiple operations share transaction context when using $transaction
await prisma.$transaction(async (tx) => {
  // All operations use the same transaction
  await attributionStore.create(input);
  await ledger.createEntry(entry);
});
```

### Explicit Transaction Passing

For stores that need explicit transaction control:

```typescript
interface StoreWithTransaction {
  create(input: Input, tx?: PrismaClient): Promise<Result>;
}
```

---

## Safety Guarantees

### 1. Runtime Validation

The composition root validates stores at initialization:

```typescript
function validateProductionStores(registry: StoreRegistry): void {
  for (const storeName of STORE_NAMES) {
    const store = registry[storeName];
    if (store.constructor.name.startsWith('InMemory')) {
      throw new Error('Production persistence contains in-memory stores!');
    }
  }
}
```

### 2. ESLint Rules

The `.eslintrc.js` blocks direct imports of InMemory stores:

```javascript
'no-restricted-imports': [
  'error',
  {
    paths: [
      {
        name: '@realriches/revenue-engine',
        importNames: ['InMemoryAttributionStore'],
        message: 'Use getAttributionStore() from persistence instead.',
      },
      // ... more rules
    ],
  },
],
```

### 3. CI Guard

The `persistence-guard` CI job verifies:

- No `new InMemory*` in production routes
- No InMemory imports in modules
- Composition root exists
- Dynamic imports for test stores

### 4. Test Coverage

`apps/api/tests/persistence-guard.test.ts` validates:

- Production mode blocks InMemory stores
- Test mode allows InMemory stores
- Double initialization throws
- Store access before initialization throws

---

## Data Persistence Matrix

| Data Type | Storage | Durability | Recovery |
|-----------|---------|------------|----------|
| User data | PostgreSQL | Durable | WAL + Backups |
| Sessions | PostgreSQL + Redis | Durable | Rehydration |
| Feature flags | PostgreSQL + Redis cache | Durable | DB fallback |
| Job queues | Redis (BullMQ) | Volatile* | Reprocessing |
| Metrics | PostgreSQL | Durable | WAL + Backups |
| Tours | PostgreSQL + S3/R2 | Durable | Cross-region |

*Job queues use Redis persistence (RDB/AOF) for durability.

---

## In-Memory Usage Guidelines

In-memory stores are **ONLY** allowed in:

1. **Unit Tests** (`*.test.ts` files)
2. **Test Helpers** (`tests/helpers/`)
3. **Composition Root Test Mode** (dynamic imports)

### Allowed Cache Usage

In-memory `Map` is allowed for:

- **Short-lived caches** (request-scoped)
- **LRU caches** (with explicit TTL)
- **Development hot-reload state**

Example of allowed cache:

```typescript
// Request-scoped cache - OK
const requestCache = new Map<string, User>();

// LRU cache with TTL - OK
const lruCache = new LRUCache<string, Result>({ maxAge: 60000 });
```

---

## Migration Guide

### Moving from Direct Store Usage

Before (❌ Incorrect):

```typescript
import { InMemoryAttributionStore } from '@realriches/revenue-engine';

const store = new InMemoryAttributionStore();
const service = new AttributionService({ store });
```

After (✅ Correct):

```typescript
import { getAttributionService } from '../../persistence';

// Service is pre-configured with correct store
const service = getAttributionService();
```

---

## Troubleshooting

### "Persistence not initialized"

**Cause**: Accessing stores before `initializePersistence()` is called.

**Solution**: Ensure `initializePersistence()` is called during application startup.

### "Production persistence contains in-memory stores"

**Cause**: InMemory store wired in production mode.

**Solution**:
1. Check environment variables (`NODE_ENV`)
2. Verify database connection is available
3. Check composition root configuration

### ESLint error: "InMemory stores cannot be imported"

**Cause**: Direct import of InMemory implementation in production code.

**Solution**: Use the composition root accessor functions instead.

---

## Related Documents

- [Master Implementation Ledger](../traceability/MASTER_IMPLEMENTATION_LEDGER.md)
- [Gap Register](../traceability/GAP_REGISTER.md)
- [Database Schema](../../packages/database/prisma/schema.prisma)

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-01-01 | Initial implementation | Platform Team |
