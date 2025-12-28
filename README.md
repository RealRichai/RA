# RealRiches v3.1.0

> Luxury NYC Rental Platform with Full Regulatory Compliance

[![FARE Act](https://img.shields.io/badge/FARE%20Act-Compliant-teal)](https://www1.nyc.gov/site/hpd/services-and-information/fare-act.page)
[![FCHA](https://img.shields.io/badge/Fair%20Chance%20Housing-Compliant-blue)](https://www1.nyc.gov/site/cchr/law/fair-chance-housing.page)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Proprietary-red)]()

## Overview

RealRiches is a comprehensive PropTech platform serving the NYC luxury rental market across **11 markets** (5 boroughs + 6 Long Island counties). Built with **87 features**, full compliance with NYC's FARE Act (effective June 2025) and Fair Chance Housing Act (effective January 2025).

### Key Highlights

- **🏠 11 Markets**: Manhattan, Brooklyn, Queens, Bronx, Staten Island, Nassau, Suffolk, Westchester, Rockland, Orange, Putnam
- **📋 87 Features**: Comprehensive feature set across listings, applications, leases, payments, and more
- **⚖️ Full Compliance**: FARE Act ($20 app fee cap), FCHA (Article 23-A), Local Law 18
- **💰 Revenue Model**: $5.85M - $8.75M projected Year 1 revenue
- **🔒 Enterprise Security**: SOC 2 ready architecture, PII protection

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js 20+, Fastify 5, Prisma 6, PostgreSQL 16 |
| **Frontend** | Next.js 15, React 19, TailwindCSS, Framer Motion |
| **Mobile** | Expo SDK 52, React Native, Expo Router |
| **Payments** | Stripe Connect (1% platform fee) |
| **Cache** | Redis 7, BullMQ |
| **Infra** | Docker, Kubernetes-ready |

## Project Structure

```
realriches/
├── apps/
│   ├── api/              # Fastify backend API
│   │   ├── prisma/       # Database schema
│   │   └── src/
│   │       ├── http/     # Routes & plugins
│   │       └── lib/      # Utilities
│   ├── web/              # Next.js frontend
│   │   └── src/
│   │       ├── app/      # App router pages
│   │       ├── components/
│   │       ├── hooks/
│   │       └── lib/
│   └── mobile/           # Expo mobile app
│       └── app/          # Expo router screens
├── packages/
│   ├── shared/           # Shared types & schemas
│   ├── core/             # Features, markets, theme
│   └── sdk/              # API client SDK
├── docker-compose.yml
└── turbo.json
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- Docker & Docker Compose
- PostgreSQL 16 (or use Docker)
- Redis 7 (or use Docker)

### Installation

```bash
# Clone repository
git clone https://github.com/RealRichai/RA.git
cd RA

# Install dependencies
pnpm install

# Start infrastructure
docker-compose up -d postgres redis

# Setup database
cd apps/api
pnpm prisma migrate dev
pnpm prisma generate

# Start development servers
pnpm dev
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Database
DATABASE_URL=postgresql://realriches:password@localhost:5432/realriches

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# DocuSign
DOCUSIGN_INTEGRATION_KEY=...
DOCUSIGN_USER_ID=...
DOCUSIGN_ACCOUNT_ID=...

# Seam (Smart Locks)
SEAM_API_KEY=seam_...

# Other integrations...
```

## API Documentation

API runs on `http://localhost:3001` with Swagger docs at `/docs`.

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | User registration |
| POST | `/api/auth/login` | User login |
| GET | `/api/listings` | Search listings |
| POST | `/api/applications` | Create application |
| POST | `/api/applications/:id/fcha-assessment` | FCHA assessment |
| POST | `/api/payments/intent` | Create payment |
| POST | `/api/smart-locks/:id/showing-code` | Generate showing code |

## Compliance Features

### FARE Act (Effective June 2025)

- Application fee capped at **$20**
- Security deposit capped at **1 month rent**
- Transparent broker fee disclosure
- Fee responsibility clearly stated

### Fair Chance Housing Act (Effective January 2025)

- Criminal history reviewed **only after conditional offer**
- Article 23-A weighted scoring (5 factors)
- Individualized assessment required
- Written explanation for adverse decisions

### Local Law 18 of 2024

- Short-term rental registration
- Host verification
- Compliance monitoring

## Development

```bash
# Run all apps in dev mode
pnpm dev

# Run specific app
pnpm --filter @realriches/api dev
pnpm --filter @realriches/web dev

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Testing
pnpm test

# Build
pnpm build
```

## Deployment

### Docker

```bash
# Build and run all services
docker-compose up --build

# With admin tools (pgAdmin, Redis Commander)
docker-compose --profile tools up
```

### Production

1. Set production environment variables
2. Run database migrations: `pnpm prisma migrate deploy`
3. Build: `pnpm build`
4. Start: `pnpm start`

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Mobile    │     │     Web     │     │   Admin     │
│  (Expo 52)  │     │ (Next.js 15)│     │  Dashboard  │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┴───────────────────┘
                           │
                    ┌──────┴──────┐
                    │  API Layer  │
                    │ (Fastify 5) │
                    └──────┬──────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
┌──────┴──────┐     ┌──────┴──────┐     ┌──────┴──────┐
│ PostgreSQL  │     │    Redis    │     │  BullMQ     │
│   (Data)    │     │   (Cache)   │     │  (Queues)   │
└─────────────┘     └─────────────┘     └─────────────┘
```

## Integrations

| Service | Purpose | Status |
|---------|---------|--------|
| Stripe Connect | Payments (1% fee) | ✅ Ready |
| DocuSign | E-signatures | ✅ Ready |
| Seam | Smart locks | ✅ Ready |
| Plaid | Income verification | 🔧 Configured |
| Persona | Identity verification | 🔧 Configured |
| TheGuarantors | Rent guarantee | 🔧 Configured |
| SendGrid | Transactional email | 🔧 Configured |
| Twilio | SMS notifications | 🔧 Configured |
| Anthropic Claude | AI inquiry handling | 🔧 Configured |

## Revenue Model

| Source | Fee | Projected Y1 |
|--------|-----|--------------|
| Platform Fee | 1% of rent | $3.5M - $5.2M |
| Application Fees | $20/app | $500K - $750K |
| Premium Listings | $99-299/listing | $600K - $900K |
| Agent Subscriptions | $199-499/mo | $1.2M - $1.8M |

## Security

- JWT authentication with refresh tokens
- Argon2id password hashing
- Rate limiting per route
- PII redaction in logs
- HTTPS enforced
- CORS configured
- SQL injection protection (Prisma)
- XSS protection

## License

Proprietary - All rights reserved.

## Support

- Documentation: [docs.realriches.com](https://docs.realriches.com)
- Email: support@realriches.com
- Issues: GitHub Issues

---

Built with ❤️ for NYC renters
