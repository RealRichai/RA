# RealRiches

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

The CI pipeline includes:
- **Secrets Guard**: Fails if `.env` or sensitive files are committed
- **Lint & Type Check**: ESLint + TypeScript strict mode
- **Unit Tests**: Vitest with coverage
- **Security Scan**: Snyk vulnerability scanning
- **Build Verification**: Full production build

## License

UNLICENSED - Private repository
