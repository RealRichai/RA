# CLAUDE.md - RealRiches AI Development Guide

## Project Overview

RealRiches is an enterprise-grade NYC rental management platform designed to serve landlords, tenants, agents, and investors. The platform ensures full compliance with NYC regulations including the FARE Act, Fair Chance Housing Act, and Fair Housing laws.

**Version**: 2.0.0
**Status**: Core Foundation Complete

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Runtime | Node.js 22+ | ESM-only |
| Language | TypeScript 5.6+ | Strict mode enabled |
| Framework | Fastify v5 | HTTP server |
| Database | PostgreSQL 16 + Prisma | With postgis, pgvector extensions |
| Cache | Redis + ioredis | With circuit breaker pattern |
| Auth | JWT RS256 + Argon2id | Asymmetric token signing |
| Validation | Zod | Schema validation |
| Error Handling | neverthrow | Result type pattern |
| Logging | Pino | Structured logging with PII redaction |
| Build | Turborepo + pnpm | Monorepo management |

## Project Structure

```
realriches/
├── apps/
│   └── api/                      # Fastify backend API
│       ├── prisma/
│       │   └── schema.prisma     # Database schema (25+ models)
│       └── src/
│           ├── config/
│           │   ├── env.ts        # Zod-validated environment
│           │   └── markets/      # Market configuration (NYC, Long Island)
│           ├── lib/
│           │   ├── cache.ts      # Redis with circuit breaker
│           │   ├── database.ts   # Prisma client with soft delete
│           │   ├── errors.ts     # 50+ typed error codes
│           │   ├── logger.ts     # Pino with PII redaction
│           │   └── result.ts     # neverthrow utilities
│           ├── modules/
│           │   ├── auth/         # Authentication (complete)
│           │   ├── users/        # User management (in progress)
│           │   └── listings/     # Listings with compliance (in progress)
│           ├── server.ts         # HTTP server configuration
│           └── index.ts          # Entry point
├── packages/
│   └── shared/                   # Shared types and schemas (planned)
├── docs/
│   ├── PROJECT_STATE.md          # Current project status
│   ├── DECISIONS.md              # Architecture decision log
│   ├── TODO.md                   # Task tracking
│   └── CONTINUITY_PROMPT.md      # Cross-session continuity
├── package.json                  # Root package (pnpm workspaces)
├── turbo.json                    # Turborepo configuration
└── tsconfig.json                 # Base TypeScript config
```

## Quick Commands

```bash
# Development
pnpm install              # Install dependencies
pnpm dev                  # Start development server
pnpm build                # Build all packages
pnpm typecheck            # Run TypeScript checks
pnpm lint                 # Lint codebase
pnpm test                 # Run tests

# Database
pnpm db:generate          # Generate Prisma client
pnpm db:push              # Push schema changes
pnpm db:migrate           # Run migrations
pnpm db:studio            # Open Prisma Studio
```

## Architecture Patterns

### 1. Result Type Pattern (neverthrow)

All service functions return `Result<T, AppError>` or `ResultAsync<T, AppError>` for type-safe error handling:

```typescript
import { type AsyncAppResult, ok, err, okAsync, errAsync, tryCatchAsync } from '../../lib/result.js';

// Service function pattern
export async function someOperation(input: Input): AsyncAppResult<Output> {
  // Validation
  if (!isValid(input)) {
    return errAsync(new AppError({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Validation error description',
    }));
  }

  // Database operation with error wrapping
  return tryCatchAsync(async () => {
    const result = await db.model.create({ data: input });
    return result;
  }, ErrorCode.DB_QUERY_FAILED);
}

// Route handler pattern
async (request, reply) => {
  const result = await someOperation(request.body);
  if (result.isErr()) throw result.error;
  return reply.send(result.value);
}
```

### 2. Module Structure

Each module follows a consistent structure:

```
modules/
└── {module}/
    ├── {module}.schemas.ts     # Zod validation schemas
    ├── {module}.service.ts     # Business logic
    ├── {module}.repository.ts  # Data access (optional)
    ├── {module}.routes.ts      # Fastify routes
    ├── {module}.middleware.ts  # Route middleware (optional)
    └── index.ts                # Public exports
```

### 3. Error Handling

Error codes are namespaced by category:

```typescript
ErrorCode = {
  // Authentication (1000-1099)
  AUTH_INVALID_CREDENTIALS: 'AUTH_1001',
  AUTH_TOKEN_EXPIRED: 'AUTH_1002',

  // Authorization (1100-1199)
  AUTHZ_FORBIDDEN: 'AUTHZ_1101',

  // Validation (2000-2099)
  VALIDATION_FAILED: 'VAL_2001',

  // User (3000-3099)
  USER_NOT_FOUND: 'USER_3001',

  // Listing (4000-4099)
  LISTING_NOT_FOUND: 'LIST_4001',
  LISTING_FARE_ACT_VIOLATION: 'LIST_4010',

  // System (9000-9099)
  SYSTEM_ERROR: 'SYS_9001',
  DB_QUERY_FAILED: 'DB_9102',
}
```

HTTP status codes are derived automatically from error code patterns.

### 4. Logging

Use the module logger pattern with PII redaction:

```typescript
import { createModuleLogger } from '../../lib/logger.js';

const log = createModuleLogger('module-name');

log.info({ userId, action }, 'Action completed');
log.warn({ code, details }, 'Warning message');
log.error({ err: error }, 'Error occurred');
```

Sensitive fields are automatically redacted: `password`, `token`, `apiKey`, `ssn`, `creditCard`, etc.

### 5. Validation

Use Zod schemas for input validation:

```typescript
import { z } from 'zod';

export const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  // ... fields
});

export type CreateInput = z.infer<typeof createSchema>;

// In routes
const validation = createSchema.safeParse(request.body);
if (!validation.success) {
  throw new AppError({
    code: ErrorCode.VALIDATION_FAILED,
    message: 'Invalid input',
    details: { errors: validation.error.flatten().fieldErrors },
  });
}
```

## Code Conventions

### TypeScript

- Strict mode enabled with `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`
- ESM modules only (use `.js` extensions in imports)
- Explicit return types on functions
- Prefer `interface` over `type` for object shapes
- Use `const` assertions for literal types

### File Naming

- Use kebab-case for files: `auth.service.ts`, `jwt.service.ts`
- Suffix by type: `.service.ts`, `.routes.ts`, `.schemas.ts`, `.middleware.ts`

### Import Order

1. External packages
2. Internal lib modules
3. Internal module imports
4. Types (use `type` imports when possible)

```typescript
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';

import { db } from '../../lib/database.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import { type AsyncAppResult, okAsync, errAsync } from '../../lib/result.js';

import { authService } from './auth.service.js';
import type { RegisterInput } from './auth.schemas.js';
```

### Database

- Use soft delete pattern for core entities (middleware handles it)
- Always include `deletedAt: null` in manual queries
- Use Prisma transactions for multi-step operations
- Exclude `passwordHash` from returned user objects

### Authentication

- JWT RS256 for token signing (asymmetric)
- Argon2id for password hashing (memory: 64MB, time: 3, parallelism: 4)
- Access tokens: 15m default, Refresh tokens: 7d default
- Store refresh tokens in database sessions

## Module Status

| Module | Status | Description |
|--------|--------|-------------|
| Auth | Complete | JWT RS256, Argon2id, RBAC middleware, all flows |
| Users | In Progress | Repository complete, service pending |
| Listings | In Progress | FARE Act compliance, market configuration |
| Applications | Pending | Fair Chance Housing Act compliance |
| Leases | Pending | 90/60/30 day renewal notifications |
| Payments | Pending | Stripe integration |
| Feedback | Pending | Agent improvement system |
| Integrations | Pending | SendGrid, Twilio, Seam, TheGuarantors |

## Compliance Requirements

### NYC FARE Act (Local Law 18 of 2024)

- Application fees capped at $20
- Security deposits limited to 1 month rent
- Broker fee disclosure required
- Full move-in cost transparency

```typescript
// Validation in listings.schemas.ts
.refine(data => data.applicationFee <= 20, {
  message: 'Application fee cannot exceed $20 per NY law'
})
.refine(data => data.securityDeposit <= data.rentPrice, {
  message: 'Security deposit cannot exceed one month rent per NY law'
})
```

### Fair Chance Housing Act

- Criminal history inquiry deferred until conditional offer
- Individual assessment required if history disclosed
- Tracked via `criminalHistoryDeferred` and `individualAssessmentCompleted` fields

### Market Configuration

The platform supports multiple markets (NYC, Long Island) with different regulations:

```typescript
import { getMarketByZipCode, requiresFareActCompliance } from '../../config/markets/index.js';

const market = getMarketByZipCode(zipCode);
if (requiresFareActCompliance(market.id)) {
  // Apply NYC-specific requirements
}
```

## Environment Variables

Required variables (see `apps/api/src/config/env.ts`):

```env
# Core
NODE_ENV=development
HOST=0.0.0.0
PORT=3000

# Database
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...  # Optional, for connection pooling

# Cache (optional)
REDIS_URL=redis://...

# Auth (required)
JWT_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...
JWT_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----...
JWT_ISSUER=realriches
JWT_AUDIENCE=realriches-api

# Integrations (optional, feature-flagged)
SENDGRID_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
SEAM_API_KEY=
THEGUARANTORS_API_KEY=
ANTHROPIC_API_KEY=
```

Integration availability is auto-detected via `integrations` and `features` exports from `env.ts`.

## Key Files Reference

| File | Purpose |
|------|---------|
| `apps/api/src/server.ts` | HTTP server with middleware, routes, error handling |
| `apps/api/src/lib/errors.ts` | AppError class and 50+ error codes |
| `apps/api/src/lib/result.ts` | neverthrow utilities for Result types |
| `apps/api/src/lib/database.ts` | Prisma client with soft delete middleware |
| `apps/api/src/lib/cache.ts` | Redis client with circuit breaker |
| `apps/api/src/config/env.ts` | Zod-validated environment configuration |
| `apps/api/src/config/markets/index.ts` | Market regulations and compliance |
| `apps/api/prisma/schema.prisma` | Database schema (25+ models) |

## Common Tasks

### Adding a New Module

1. Create folder: `apps/api/src/modules/{name}/`
2. Create schema file with Zod validation
3. Create service with Result return types
4. Create routes with proper error handling
5. Register routes in `server.ts`

### Adding an API Endpoint

```typescript
// In {module}.routes.ts
app.post<{ Body: CreateInput }>(
  '/endpoint',
  {
    preHandler: [authenticate],  // Optional auth
    schema: { description: 'Endpoint description', tags: ['Module'] }
  },
  async (request, reply) => {
    const validation = createSchema.safeParse(request.body);
    if (!validation.success) {
      throw new AppError({ code: ErrorCode.VALIDATION_FAILED, message: '...' });
    }

    const result = await service.operation(validation.data);
    if (result.isErr()) throw result.error;

    return reply.status(201).send(result.value);
  }
);
```

### Adding an Error Code

Add to `apps/api/src/lib/errors.ts`:

```typescript
export const ErrorCode = {
  // ... existing codes

  // New Category (XXXX-XXXX)
  NEW_CATEGORY_ERROR: 'CAT_XXXX',
} as const;
```

### Database Migrations

```bash
# Development - push schema directly
pnpm db:push

# Production - create migration
pnpm db:migrate --name descriptive_name
```

## Testing Patterns

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('ServiceName', () => {
  it('should handle success case', async () => {
    const result = await service.operation(validInput);
    expect(result.isOk()).toBe(true);
    expect(result.value).toMatchObject({ ... });
  });

  it('should handle error case', async () => {
    const result = await service.operation(invalidInput);
    expect(result.isErr()).toBe(true);
    expect(result.error.code).toBe(ErrorCode.EXPECTED_ERROR);
  });
});
```

## User Roles

| Role | Description | Permissions |
|------|-------------|-------------|
| TENANT | Rental applicants and tenants | View listings, apply, manage lease |
| LANDLORD | Property owners | Manage listings, review applications |
| AGENT | Licensed real estate agents | Manage listings for landlords |
| INVESTOR | Platform investors | View analytics, hidden gem alerts |
| ADMIN | Platform administrators | Full access except system config |
| SUPER_ADMIN | System administrators | Complete system access |

## Notes for AI Assistants

1. **Always use Result types** - Never throw errors directly from services
2. **Validate inputs with Zod** - Create schemas before implementing routes
3. **Check compliance** - NYC listings need FARE Act validation
4. **Soft delete** - Core entities use `deletedAt` pattern
5. **Log appropriately** - Use module loggers, never log PII
6. **ESM imports** - Always use `.js` extensions in import paths
7. **Check market config** - Different rules for NYC vs Long Island
8. **Feature flags** - Check `integrations` before using external services

## Related Documentation

- `docs/PROJECT_STATE.md` - Current project status
- `docs/DECISIONS.md` - Architecture decision log
- `docs/TODO.md` - Pending tasks
- `docs/CONTINUITY_PROMPT.md` - Cross-session continuity protocol
