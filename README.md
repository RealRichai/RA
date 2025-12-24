# RealRiches Platform

Comprehensive NYC rental platform built for the FARE Act era.

## Overview

RealRiches is an enterprise-grade rental management platform designed to serve NYC landlords, tenants, agents, and investors. The platform ensures full compliance with NYC regulations including the FARE Act, Fair Chance Housing Act, and Fair Housing laws.

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 22+ |
| **Language** | TypeScript 5.7 (Strict ESM) |
| **API Framework** | Fastify v5 |
| **Web Framework** | Next.js 14 (App Router) |
| **Database** | PostgreSQL 16 + Prisma |
| **Cache** | Redis + ioredis |
| **Auth** | JWT RS256 + Argon2id |
| **Styling** | Tailwind CSS |
| **Monorepo** | Turborepo + pnpm |

## Project Structure

```
realriches/
├── apps/
│   ├── api/                    # Fastify backend API
│   │   ├── prisma/
│   │   │   ├── schema.prisma   # Database schema (25+ models)
│   │   │   └── seed.ts         # Database seeding
│   │   └── src/
│   │       ├── config/         # Environment configuration
│   │       ├── lib/            # Core utilities
│   │       │   ├── cache.ts    # Redis with circuit breaker
│   │       │   ├── database.ts # Prisma client
│   │       │   ├── errors.ts   # 50+ error codes
│   │       │   ├── logger.ts   # Pino with PII redaction
│   │       │   └── result.ts   # neverthrow utilities
│   │       └── modules/
│   │           ├── auth/       # JWT, password, RBAC
│   │           ├── users/      # User management
│   │           ├── listings/   # Property listings
│   │           ├── applications/# Rental applications
│   │           ├── leases/     # Lease management
│   │           ├── payments/   # Payment tracking
│   │           ├── leads/      # Lead management
│   │           ├── tours/      # Tour scheduling
│   │           ├── notifications/# Multi-channel notifications
│   │           ├── feedback/   # Agent feedback system
│   │           └── integrations/# Third-party integrations
│   └── web/                    # Next.js frontend
│       └── src/
│           ├── app/            # App Router pages
│           │   ├── (auth)/     # Login, register, forgot-password
│           │   ├── (dashboard)/# Authenticated pages
│           │   │   ├── admin/  # Admin panel
│           │   │   └── dashboard/
│           │   └── (public)/   # Public listings
│           ├── components/     # UI components
│           └── lib/            # API client, stores, theme
├── packages/
│   └── config/                 # Shared configuration
│       └── src/
│           ├── features.ts     # Feature flags registry
│           ├── markets.ts      # Markets configuration
│           └── integrations.ts # Integrations registry
└── infrastructure/
    └── docker/
        └── docker-compose.yml  # PostgreSQL + Redis
```

## Quick Start

### 1. Infrastructure (Local Development)

```bash
# Start PostgreSQL and Redis containers
docker compose -f infrastructure/docker/docker-compose.yml up -d
```

### 2. Application Setup

```bash
# Copy environment template
cp .env.example .env

# Configure required environment variables:
# - DATABASE_URL=postgresql://realriches:realriches@localhost:5432/realriches
# - REDIS_URL=redis://localhost:6379
# - NEXT_PUBLIC_API_URL=http://localhost:3001

# Install dependencies
pnpm install

# Push database schema
pnpm db:push

# Seed database with initial data
pnpm db:seed

# Start development servers (Web :3000, API :3001)
pnpm dev
```

### 3. Verify Installation

```bash
# Run linting, tests, and build
pnpm lint && pnpm test && pnpm build
```

## Default Credentials

After running `pnpm db:seed`, you can login with:

| Role | Email | Password |
|------|-------|----------|
| **Super Admin** | admin@realriches.com | RealRichesAdmin2024! |
| **Agent** | agent@realriches.com | DemoPassword123! |
| **Landlord** | landlord@realriches.com | DemoPassword123! |
| **Tenant** | tenant@realriches.com | DemoPassword123! |
| **Investor** | investor@realriches.com | DemoPassword123! |

## Environment Variables

### Required

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/realriches
DIRECT_URL=postgresql://user:password@localhost:5432/realriches

# Redis
REDIS_URL=redis://localhost:6379

# JWT Authentication (generate with: openssl rand -base64 32)
JWT_ACCESS_SECRET=your-access-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here

# URLs
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Optional Integrations

```env
# Email - SendGrid
SENDGRID_API_KEY=SG.xxx
SENDGRID_FROM_EMAIL=noreply@realriches.com
SENDGRID_FROM_NAME=RealRiches

# SMS - Twilio
TWILIO_ACCOUNT_SID=ACxxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_VERIFY_SID=VAxxx

# Smart Locks - Seam
SEAM_API_KEY=seam_xxx

# Lease Guarantees - TheGuarantors
THE_GUARANTORS_API_KEY=xxx
THE_GUARANTORS_PARTNER_ID=xxx

# AI - Anthropic
ANTHROPIC_API_KEY=sk-ant-xxx

# iMessage - Sendblue
SENDBLUE_API_KEY=xxx
SENDBLUE_API_SECRET=xxx

# AI Lead Follow-up - Jeeva
JEEVA_API_KEY=xxx
```

## Feature Flags

Features are controlled via database-driven feature flags. Default flags are seeded automatically:

| Feature | Category | Default |
|---------|----------|---------|
| core.listings | Core | Enabled |
| core.applications | Core | Enabled |
| core.leases | Core | Enabled |
| core.payments | Core | Enabled |
| core.leads | Core | Enabled |
| compliance.fare-act | Compliance | Enabled (NYC only) |
| compliance.fair-chance | Compliance | Enabled (NYC only) |
| integrations.email | Integrations | Enabled |
| integrations.sms | Integrations | Enabled |
| integrations.smart-locks | Integrations | Disabled |
| ai.listing-descriptions | AI | Disabled |
| ai.chat-assistant | AI | Disabled |
| marketing.virtual-tours | Marketing | Enabled |
| marketing.3d-splats | Experimental | Disabled |

## Markets

Pre-configured markets with compliance settings:

| Market | Region | FARE Act | Fair Chance | App Fee Cap |
|--------|--------|----------|-------------|-------------|
| Manhattan | NYC | Yes | Yes | $20 |
| Brooklyn | NYC | Yes | Yes | $20 |
| Queens | NYC | Yes | Yes | $20 |
| Bronx | NYC | Yes | Yes | $20 |
| Staten Island | NYC | Yes | Yes | $20 |
| Nassau County | Long Island | No | No | $50 |
| Suffolk County | Long Island | No | No | $50 |
| Westchester | Westchester | No | No | $50 |
| Jersey City | NJ (disabled) | No | No | $50 |
| Hoboken | NJ (disabled) | No | No | $50 |
| Newark | NJ (disabled) | No | No | $50 |

## Integrations Status

After adding API keys to `.env`, run `pnpm db:seed` to update integration status:

```bash
# Check integration status
pnpm db:seed

# Output shows:
# ✅ sendgrid: configured
# ⚠️ twilio: partial (missing TWILIO_PHONE_NUMBER)
# ❌ seam: not-configured
```

## Admin Panel

Access the admin panel at `/admin` (requires ADMIN or SUPER_ADMIN role):

- **Overview**: Platform stats and system health
- **Users**: User management and role assignment
- **Feature Flags**: Enable/disable features per market
- **Markets**: Configure market-specific compliance
- **Integrations**: Third-party service status
- **Audit Log**: Track administrative actions
- **Settings**: System-wide configuration

## API Documentation

API documentation is available at `http://localhost:3001/documentation` when running in development mode.

## Compliance Features

### NYC FARE Act

- Application fees capped at $20
- Security deposits limited to 1 month
- Full fee disclosure required before viewing
- Broker fee rules enforced (tenant-optional)

### Fair Chance Housing Act

- Criminal history inquiry deferred until conditional offer
- Individual assessment workflow required
- Documented review process
- Compliant rejection reasons

### Agent Feedback System

- Private constructive feedback from tenants and landlords
- 14 performance categories
- Improvement plan tracking
- Anonymous feedback option

## Theme System

The platform uses the RA brand theme:

- **Ivory Light**: #F6F1E8 (primary background)
- **Noir Dark**: #0B0B0C (dark mode background)
- **Deep Teal**: #0F3B3A (accent color)
- **Champagne**: #C6A76A (highlight color)

Theme preference is automatically detected and can be toggled in settings.

## Scripts

```bash
# Development
pnpm dev          # Start all apps in development mode
pnpm build        # Build all apps
pnpm lint         # Run ESLint
pnpm test         # Run tests

# Database
pnpm db:generate  # Generate Prisma client
pnpm db:push      # Push schema changes
pnpm db:migrate   # Run migrations
pnpm db:seed      # Seed database
pnpm db:studio    # Open Prisma Studio
```

## Deployment Checklist

Before deploying to production:

1. [ ] Generate secure JWT secrets
2. [ ] Configure all required environment variables
3. [ ] Add API keys for enabled integrations
4. [ ] Run database migrations
5. [ ] Run seed to configure feature flags and markets
6. [ ] Change default admin password
7. [ ] Enable HTTPS
8. [ ] Configure rate limiting
9. [ ] Set up monitoring and alerting
10. [ ] Configure backup strategy

## License

Proprietary - All rights reserved.
