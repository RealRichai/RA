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
| `develop` | Integration branch | On push/PR | - |
| `feature/*` | Feature development | On PR to develop | - |

### CI Pipeline

The CI workflow runs on all pushes and PRs:

1. **Secrets Guard** - Fails if `.env` or sensitive files are committed
2. **Lint & Type Check** - ESLint + TypeScript strict mode
3. **Unit Tests** - Vitest with coverage, requires Postgres + Redis
4. **Security Scan** - Snyk vulnerability scanning
5. **Build Verification** - Full production build with artifacts

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

The codebase enforces policies via CI and local scripts.

### HUMAN_IMPLEMENTATION_REQUIRED Policy

Source files must not contain `HUMAN_IMPLEMENTATION_REQUIRED` markers. This policy ensures all implementation TODOs are resolved before merging.

**CI Enforcement:**
- Workflow: `.github/workflows/no-human-todos.yml`
- Runs on: push to main/canonical-main, all PRs
- Scans: `apps/`, `packages/`, `prisma/`, `docs/`
- Excludes: `coverage/`, `.next/`, `dist/`, `.turbo/`

**Run Locally:**

```bash
# Using the script
./scripts/policy_scan.sh

# Using pnpm
pnpm policy:no-human-todos
```

**Exit Codes:**
- `0` - No violations found
- `1` - Violations found (blocks CI)

## License

UNLICENSED - Private repository
