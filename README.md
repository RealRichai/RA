# RealRiches Platform

**Version 2.0.0** | **NYC Rental Platform for the FARE Act Era**

## Overview

RealRiches is a comprehensive rental platform serving landlords, tenants, agents, and investors in the New York City and Long Island markets. The platform is designed for full compliance with NYC regulations including the FARE Act (effective June 11, 2025) and Fair Chance Housing Act (effective January 1, 2025).

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 22+ |
| Language | TypeScript 5.7 (Strict ESM) |
| Framework | Fastify v5 |
| Database | PostgreSQL 16 + Prisma |
| Cache | Redis + ioredis |
| Auth | JWT HS256 + Argon2id |
| Validation | Zod |
| Error Handling | neverthrow (Result types) |

## Project Structure

```
realriches/
├── apps/
│   └── api/                    # Fastify backend API
│       ├── prisma/             # Database schema (35 models)
│       └── src/
│           ├── config/         # Environment & market configuration
│           ├── lib/            # Core utilities
│           ├── modules/        # Business modules
│           │   ├── auth/       # JWT authentication
│           │   ├── listings/   # Property listings
│           │   ├── applications/
│           │   ├── leases/
│           │   ├── payments/
│           │   ├── tours/
│           │   ├── investors/
│           │   ├── agents/
│           │   └── ...
│           ├── integrations/   # Third-party services
│           └── http/           # HTTP server
├── packages/
│   └── shared/                 # Shared types
└── docs/                       # Documentation
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Set up environment
cp apps/api/.env.example apps/api/.env
# Edit .env with your values

# Generate Prisma client
pnpm db:generate

# Push database schema
pnpm db:push

# Start development server
pnpm dev
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh tokens
- `POST /api/v1/auth/logout` - Logout
- `GET /api/v1/auth/me` - Get current user

### Listings
- `GET /api/v1/listings` - Search listings
- `GET /api/v1/listings/:id` - Get listing by ID
- `POST /api/v1/listings` - Create listing (landlord)
- `PATCH /api/v1/listings/:id` - Update listing
- `POST /api/v1/listings/:id/publish` - Publish listing
- `DELETE /api/v1/listings/:id` - Delete listing

## Compliance Features

### NYC FARE Act (Local Law 18 of 2024)
The platform automatically enforces FARE Act requirements for NYC listings:
- Application fee capped at $20
- Security deposit limited to 1 month
- Broker fees default to landlord payment
- Automatic fee disclosure generation
- Move-in cost calculation and display

### Fair Chance Housing Act (Local Law 24 of 2024)
The application module (coming soon) enforces:
- Criminal history inquiry deferred until conditional offer
- Individual assessment requirement
- Required notice provisions
- Documentation retention

### Long Island Market Support
Long Island (Nassau/Suffolk) operates under NY State laws without NYC local regulations, enabling traditional broker fee practices and standard screening procedures.

## Markets Supported

| Market | Status | Key Features |
|--------|--------|--------------|
| NYC (5 boroughs) | ✅ Active | FARE Act, Fair Chance Housing |
| Long Island (Nassau/Suffolk) | ✅ Active | Traditional broker fees |
| Miami | 🔜 Planned | - |
| Los Angeles | 🔜 Planned | - |

## Integrations

| Service | Purpose | Status |
|---------|---------|--------|
| Stripe | Payments | Designed |
| Plaid | Income verification | Designed |
| TransUnion | Credit/background | Designed |
| TheGuarantors | Rent guarantee | Designed |
| Seam | Smart locks | Designed |
| SendGrid | Email | Designed |
| Twilio | SMS | Designed |
| Sendblue | iMessage | Designed |
| DocuSign | E-signatures | Designed |
| Anthropic | AI inquiry handling | Designed |

## Environment Variables

See `apps/api/.env.example` for the complete list of required environment variables.

## Development

```bash
# Run development server with hot reload
pnpm dev

# Type check
pnpm typecheck

# Lint
pnpm lint

# Run tests
pnpm test

# Open Prisma Studio
pnpm db:studio
```

## Documentation

- API Documentation: `http://localhost:3000/docs` (Swagger UI)
- Health Check: `GET /health`

## License

Proprietary - All Rights Reserved
