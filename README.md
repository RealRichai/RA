# RealRiches Platform

Comprehensive NYC rental platform built for the FARE Act era.

## Overview

RealRiches is an enterprise-grade rental management platform designed to serve NYC landlords, tenants, agents, and investors. The platform ensures full compliance with NYC regulations including the FARE Act, Fair Chance Housing Act, and Fair Housing laws.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 22+ |
| Language | TypeScript 5.7 (Strict ESM) |
| Framework | Fastify v5 |
| Database | PostgreSQL 16 + Prisma |
| Cache | Redis + ioredis |
| Auth | JWT RS256 + Argon2id |

## Project Structure

```
realriches/
├── apps/
│   └── api/                    # Fastify backend API
│       ├── prisma/             # Database schema (25+ models)
│       └── src/
│           ├── config/         # Environment configuration
│           ├── lib/            # Core utilities
│           │   ├── cache.ts    # Redis with circuit breaker
│           │   ├── database.ts # Prisma client
│           │   ├── errors.ts   # 50+ error codes
│           │   ├── logger.ts   # Pino with PII redaction
│           │   └── result.ts   # neverthrow utilities
│           ├── modules/
│           │   ├── auth/       # JWT, password, RBAC (complete)
│           │   └── users/      # User management (in progress)
│           └── server.ts       # HTTP server
├── packages/
│   └── shared/                 # Shared types and schemas
└── docs/                       # Documentation
```

## Current Status

| Module | Status | Description |
|--------|--------|-------------|
| Auth | ✅ Complete | JWT RS256, Argon2id, RBAC middleware |
| Users | 🔄 In Progress | Repository complete, service pending |
| Listings | ⏳ Pending | FARE Act compliance built-in |
| Applications | ⏳ Pending | Fair Chance Housing Act compliance |
| Leases | ⏳ Pending | 90/60/30 day renewal notifications |
| Payments | ⏳ Pending | Stripe integration |
| Feedback | ⏳ Pending | Agent improvement system |
| Integrations | ⏳ Pending | SendGrid, Twilio, Seam, TheGuarantors |

## Setup

```bash
# Install dependencies
pnpm install

# Configure environment
cp apps/api/.env.example apps/api/.env
# Edit .env with your values

# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:push

# Start development server
pnpm dev
```

## Environment Variables

Required environment variables (see `apps/api/src/config/env.ts` for full list):

```
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
```

## Compliance Features

**NYC FARE Act**: Application fees capped at $20, security deposits limited to 1 month, full fee disclosure required.

**Fair Chance Housing Act**: Criminal history inquiry deferred until conditional offer, individual assessment required.

**Agent Feedback System**: Private constructive feedback to help agents improve, 14 performance categories.

## Contributing

### Repository Hygiene

Before committing, ensure you're not including build artifacts:

```bash
# Verify repo state
./scripts/verify-repo.sh

# Check for forbidden artifacts in staged files
./scripts/check-artifacts.sh
```

### Pre-commit Hook

A pre-commit hook automatically blocks commits containing:
- `node_modules/`
- `.next/`
- `dist/`
- `.turbo/`
- `coverage/`
- `.env` files (except `.env.example`)

### If You Accidentally Stage Artifacts

```bash
# Remove from index only (keeps files locally)
git rm --cached -r node_modules/
git rm --cached -r dist/
git rm --cached .env

# Then commit the .gitignore update
git add .gitignore
git commit -m "chore: update gitignore"
```

### Development Workflow

1. Create a feature branch from `main`
2. Make changes
3. Run `./scripts/verify-repo.sh` before committing
4. Push and create PR

## License

Proprietary - All rights reserved.
