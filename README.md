# RealRiches

[![CI](https://github.com/RealRichai/RA/actions/workflows/ci.yml/badge.svg)](https://github.com/RealRichai/RA/actions/workflows/ci.yml)
[![Deploy](https://github.com/RealRichai/RA/actions/workflows/deploy.yml/badge.svg)](https://github.com/RealRichai/RA/actions/workflows/deploy.yml)

AI-Powered Real Estate Investment Platform

## Prerequisites

- **Node.js 22+** (required)
- **pnpm 8+** (package manager)
- **Docker** (for PostgreSQL, Redis, MinIO)

## Quick Start

```bash
# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL, Redis, MinIO)
docker-compose up -d

# Generate Prisma client
pnpm db:generate

# Push schema to database
pnpm db:push

# Seed demo data
pnpm db:seed

# Start development servers
pnpm dev
```

**URLs:**
- Web: http://localhost:3000
- API: http://localhost:4000
- API Docs: http://localhost:4000/docs

**Demo Accounts:**
- `landlord@demo.com` / `demo123` (Landlord)
- `investor@demo.com` / `demo123` (Investor)
- `agent@demo.com` / `demo123` (Agent)

## Project Structure

```
realriches/
├── apps/
│   ├── api/          # Fastify API server (port 4000)
│   └── web/          # Next.js 15 frontend (port 3000)
├── packages/
│   ├── config/       # Shared configuration
│   ├── database/     # Prisma schema & client
│   ├── types/        # Shared TypeScript types
│   ├── utils/        # Shared utilities
│   ├── ai-sdk/       # AI integrations
│   ├── compliance-engine/  # Compliance logic
│   ├── feature-flags/      # Feature flag system
│   └── ui/           # Shared UI components
└── .github/workflows/  # CI/CD pipelines
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all development servers |
| `pnpm dev:api` | Start API only |
| `pnpm dev:web` | Start Web only |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | Type check all packages |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:push` | Push schema to database |
| `pnpm db:seed` | Seed demo data |
| `pnpm db:studio` | Open Prisma Studio |
| `./scripts/export_repo.sh` | Export clean zip (excludes node_modules, .env, coverage) |
| `./scripts/policy_scan.sh` | Check for HUMAN_IMPLEMENTATION_REQUIRED |
| `pnpm traceability:check` | Validate ledger file paths and test coverage for critical features |

## Architecture

### API Response Envelope

All API responses follow a standard format:

```typescript
// Success
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "total": 100 }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": { ... }
  }
}
```

### Audit Logging

All write operations (POST, PUT, PATCH, DELETE) are automatically logged to the `AuditLog` table:
- Non-blocking (doesn't slow down requests)
- Sensitive fields automatically redacted
- Captures actor, action, entity, changes, request context

### Security

- **Authentication**: JWT with refresh tokens, Argon2id password hashing
- **Rate Limiting**: Configurable per-endpoint limits
- **CORS**: Strict origin whitelisting
- **Headers**: Helmet for security headers
- **Audit Trail**: All mutations logged

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=min-32-characters-secret
ENCRYPTION_KEY=exactly-32-characters

# Optional
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_...
```

## CI/CD

### Branch Strategy

| Branch | Purpose | CI | Deploy |
|--------|---------|-----|--------|
| `main` | Production-ready code | On push/PR | Manual trigger |
| `feature/*` | Feature development | On PR to main | - |

### CI Pipeline

The CI workflow (`.github/workflows/ci.yml`) runs on all pushes and PRs to `main`. It enforces investor-grade quality gates across 14 parallel jobs.

#### Quality Gates

| Job | What It Checks | Local Equivalent |
|-----|----------------|------------------|
| **Policy Gates** | No `HUMAN_IMPLEMENTATION_REQUIRED` markers, traceability docs exist | `./scripts/policy_scan.sh` |
| **Secrets Guard** | No `.env`, `.pem`, `.key` files committed | `git ls-files \| grep -E "\.env$\|\.pem$"` |
| **Lint** | ESLint rules, import order, security rules | `pnpm lint` |
| **Type Check** | TypeScript strict mode | `pnpm typecheck` |
| **Unit Tests** | Vitest with coverage (requires Postgres + Redis) | `pnpm test:coverage` |
| **Integration Tests** | Acceptance tests with real services | `pnpm test:acceptance` |
| **Build** | Full production build | `pnpm build` |
| **Security Baseline** | Dependency audit, auth middleware check | `pnpm audit --audit-level high` |
| **Evidence Audit** | SOC2 control catalog, evidence routes, tests | `cd apps/api && npx vitest run --config vitest.evidence-audit.config.ts` |
| **Persistence Guard** | No InMemory stores in production code | `grep -r "new InMemory" apps/api/src/modules/` |
| **Ops Runbooks** | Required runbook docs exist with proper headings | `ls docs/ops/*.md` |
| **Ops Scripts** | Backup/restore scripts executable and valid | `bash -n scripts/ops/*.sh` |
| **Performance Smoke** | k6 test structure valid | `k6 inspect tests/performance/smoke.js` |
| **E2E Market-Ready** | Playwright journey tests structure | `npx playwright test --project=api` |

#### Job Dependencies

```
Policy Gates ─┐
Secrets Guard ┼─→ Lint ─────┐
              │   Type Check ┼─→ Unit Tests ─→ Integration Tests ─→ Build
              └─────────────┘
```

#### Running CI Locally

```bash
# Full CI check (what runs on GitHub)
pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build

# Quick pre-commit check
pnpm lint && pnpm typecheck

# Policy check only
./scripts/policy_scan.sh

# Evidence audit tests only (no database required)
cd apps/api && NODE_ENV=test npx vitest run --config vitest.evidence-audit.config.ts
```

#### Environment Variables

CI jobs use these test credentials (do not use in production):

| Variable | CI Value |
|----------|----------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/realriches_test` |
| `REDIS_URL` | `redis://localhost:6379` |
| `JWT_SECRET` | `test-jwt-secret-for-ci-only-min-32-chars` |
| `ENCRYPTION_KEY` | `test-encryption-key-32-bytes-xx` |

#### Turbo Caching

The CI uses Turbo remote caching for faster builds. To enable locally:

```bash
# Login to Turbo (optional)
npx turbo login

# Link to remote cache (optional)
npx turbo link
```

### Deploy Pipeline

Deployment is **manual-only** until AWS infrastructure is configured:

1. **CI Gate** - Requires CI workflow to pass first
2. **Container Build** - Docker images pushed to ECR
3. **Database Migrations** - Run via ECS task before deploy
4. **Service Deployment** - ECS rolling update (staging) or blue/green (production)
5. **Health Checks** - Verify endpoints respond correctly

See [docs/release-checklist.md](docs/release-checklist.md) for deployment requirements.

## Exporting the Repo Safely

Use the export script to create a clean zip archive without secrets or build artifacts:

```bash
# Export to Desktop (default)
./scripts/export_repo.sh

# Export to custom path
./scripts/export_repo.sh /path/to/output.zip
```

**What's excluded:**
| Category | Patterns |
|----------|----------|
| Secrets | `.env`, `.env.*`, `.env.local`, `.env.*.local` |
| Dependencies | `node_modules/`, `.pnpm-store/` |
| Build artifacts | `.next/`, `dist/`, `.turbo/`, `coverage/`, `*.tsbuildinfo` |
| VCS | `.git/` |
| Other | `logs/`, `tmp/`, `__pycache__/`, `.DS_Store` |

**Validation:**
The script automatically validates the archive after creation:
- Fails with exit code 1 if any `.env` files are detected
- Warns about potential sensitive files (`.pem`, `.key`, credentials)
- Deletes the archive if validation fails

**Cross-platform:**
Works on both macOS and Linux.

## Policy Checks

The codebase enforces policies via the CI pipeline's **Policy Gates** job.

### HUMAN_IMPLEMENTATION_REQUIRED Policy

Source files must not contain `TODO: HUMAN_IMPLEMENTATION_REQUIRED` markers. This policy ensures all implementation TODOs are resolved before merging.

**CI Enforcement:**
- Job: `Policy Gates` in `.github/workflows/ci.yml`
- Script: `scripts/ci/forbid_human_todos.sh`
- Runs on: push/PR to `main`
- Scans: `apps/`, `packages/`, `prisma/`, `docs/`, `.github/`, `scripts/`
- Excludes: `coverage/`, `.next/`, `dist/`, `.turbo/`, `node_modules/`
- Uses `git ls-files` as source-of-truth (only scans tracked files)

**Run Locally:**

```bash
# Using the CI script (recommended)
./scripts/ci/forbid_human_todos.sh

# Self-test the script
./scripts/ci/forbid_human_todos.sh --test

# Using the legacy script
./scripts/policy_scan.sh
```

**Exit Codes:**
- `0` - No violations found
- `1` - Violations found (blocks CI)
- `2` - Script error

### Coverage Exclusion Policy

Test coverage artifacts (`coverage/`, `**/coverage/`) are:
- **Never committed** - Listed in `.gitignore`
- **Never exported** - Excluded from `scripts/export_repo.sh`
- **Never scanned** - Excluded from policy checks

This ensures generated artifacts don't pollute the repository or trigger false positives in policy scans.

### Traceability Policy

The Policy Gates job also enforces traceability documentation:

- `docs/traceability/MASTER_IMPLEMENTATION_LEDGER.md` must exist
- `docs/traceability/GAP_REGISTER.md` must exist
- `STATUS_REPORT.md` must reference both files

## License

UNLICENSED - Private repository
