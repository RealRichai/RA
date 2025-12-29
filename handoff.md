# RealRiches - AI-Powered Real Estate Platform

## Project Handoff Document

### Overview

RealRiches is a comprehensive, AI-powered real estate platform built with modern technologies. This document provides everything needed to continue development, deploy, and maintain the platform.

---

## Technology Stack

### Core Technologies
- **Runtime**: Node.js 20+
- **Language**: TypeScript 5.3+
- **Package Manager**: pnpm 8+
- **Monorepo**: TurboRepo

### Backend (apps/api)
- **Framework**: Fastify 4.x
- **Database**: PostgreSQL 15+ with Prisma ORM
- **Cache/Queue**: Redis 7+ with BullMQ
- **Authentication**: JWT with Argon2id password hashing
- **Validation**: Zod
- **Logging**: Pino

### Frontend (apps/web)
- **Framework**: Next.js 15 with App Router
- **UI Library**: React 19
- **Styling**: Tailwind CSS
- **Components**: Radix UI primitives
- **State**: Zustand
- **Data Fetching**: TanStack Query

### Shared Packages
- `@realriches/types` - Domain types and Zod schemas
- `@realriches/config` - Configuration management
- `@realriches/utils` - Utility functions
- `@realriches/database` - Prisma client and helpers

---

## Architecture

```
realriches/
├── apps/
│   ├── api/                 # Fastify API server
│   │   ├── src/
│   │   │   ├── index.ts     # Entry point
│   │   │   ├── plugins/     # Fastify plugins
│   │   │   ├── modules/     # Feature modules
│   │   │   └── lib/         # Shared utilities
│   │   └── Dockerfile
│   └── web/                 # Next.js frontend
│       ├── src/
│       │   ├── app/         # App Router pages
│       │   ├── components/  # React components
│       │   ├── lib/         # Utilities
│       │   └── store/       # State management
│       └── next.config.js
├── packages/
│   ├── types/               # Shared TypeScript types
│   ├── config/              # Configuration
│   ├── utils/               # Utility functions
│   └── database/            # Prisma schema & client
├── turbo.json               # TurboRepo config
├── pnpm-workspace.yaml      # Workspace config
└── docker-compose.yml       # Local development
```

---

## Getting Started

### Prerequisites
- Node.js 20+
- pnpm 8+
- Docker & Docker Compose
- PostgreSQL 15+
- Redis 7+

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd realriches

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your values

# Start infrastructure
docker-compose up -d

# Generate Prisma client
pnpm db:generate

# Run database migrations
pnpm db:push

# Seed the database
pnpm db:seed

# Start development servers
pnpm dev
```

### Development URLs
- **API**: http://localhost:4000
- **API Docs**: http://localhost:4000/docs
- **Web**: http://localhost:3000

---

## Key Features Implemented

### 1. Authentication System
- JWT-based authentication with access/refresh tokens
- Argon2id password hashing
- Role-based access control (RBAC)
- Session management with logout all devices

### 2. Compliance Autopilot
- FARE Act compliance checking (NYC broker fee regulations)
- Good Cause Eviction compliance
- Rent stabilization tracking
- Disclosure management and delivery tracking
- Market-specific rules configuration

### 3. AI Framework (HF-CTS)
- High-Fidelity Context Transfer System
- AI-powered leasing assistant
- Maintenance issue triage with AI
- Human handoff capability
- Voice session placeholder (Twilio integration required)

### 4. Property Management
- Property and unit management
- Listing creation with compliance validation
- Showing scheduling
- Inquiry management
- God View dashboard for maintenance

### 5. Lease Management
- REBNY lease support
- Digital signatures (placeholder)
- Lease amendments
- Tenant applications

### 6. Financial Features
- Payment processing (Stripe integration required)
- Deposit alternatives (LeaseLock, Rhino placeholders)
- Renters insurance (Lemonade placeholder)
- Guarantor products (The Guarantors placeholder)
- Rent rewards program
- Recurring payments/autopay

### 7. Maintenance System
- Work order management
- Vendor management
- AI-powered triage
- Emergency escalation
- Inspection scheduling

### 8. Marketing & Media
- Marketing asset generation
- Template marketplace
- Video tour generation (placeholder)
- 3D/VR tour support (placeholder)
- Property media management

### 9. Commerce Features
- Utilities concierge
- Moving services marketplace
- Vendor marketplace
- Move-in essentials

### 10. Analytics
- Portfolio summary
- Revenue analytics
- Listing performance
- Maintenance metrics
- Market analytics

### 11. Commercial Module (Feature Flag)
- Commercial properties
- Stacking plans
- Underwriting analysis
- Fractional ownership (placeholder)

---

## API Modules

| Module | Prefix | Description |
|--------|--------|-------------|
| Auth | `/auth` | Authentication & authorization |
| Users | `/users` | User management |
| Properties | `/properties` | Property & unit management |
| Listings | `/listings` | Listing management |
| Leases | `/leases` | Lease & application management |
| Compliance | `/compliance` | Compliance checking |
| AI | `/ai` | AI assistant & triage |
| Payments | `/payments` | Payment processing |
| Documents | `/documents` | Document management |
| Maintenance | `/maintenance` | Work orders & vendors |
| Marketing | `/marketing` | Marketing assets |
| Commerce | `/commerce` | Utilities & marketplace |
| Analytics | `/analytics` | Reporting & insights |
| Commercial | `/commercial` | Commercial features |
| Health | `/health` | Health checks |

---

## Environment Variables

See `.env.example` for all required environment variables. Key ones include:

```bash
# Database
DATABASE_URL="postgresql://..."

# Redis
REDIS_URL="redis://..."

# JWT
JWT_SECRET="..."
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# API
API_PORT=4000
API_HOST="0.0.0.0"
API_PREFIX="/api/v1"

# External Services (placeholders - need real keys)
STRIPE_SECRET_KEY="sk_..."
OPENAI_API_KEY="sk-..."
```

---

## Database Schema

The Prisma schema (`packages/database/prisma/schema.prisma`) includes 40+ models covering:

- **User System**: User, Session, RefreshToken, ApiKey
- **Profiles**: LandlordProfile, AgentProfile, TenantProfile, InvestorProfile
- **Properties**: Property, Unit
- **Listings**: Listing, ListingInquiry, Showing, ListingMedia
- **Leases**: Lease, LeaseAmendment, TenantApplication
- **Payments**: Payment, PaymentMethod, RecurringPayment, Invoice
- **Fintech**: DepositAlternative, RentersInsurance, GuarantorProduct
- **Maintenance**: WorkOrder, Vendor, Inspection, MaintenanceTriage
- **Documents**: Document, DocumentSignature, DocumentTemplate
- **AI**: AIConversation, AIMessage, AIContext
- **Compliance**: ComplianceCheck, Disclosure, DisclosureRecord
- **Marketing**: PropertyMedia, MarketingAsset, MarketingTemplate
- **Commerce**: UtilitySetup
- **System**: FeatureFlag, MarketConfig, Notification, AuditLog, JobRecord

---

## Deployment

### Docker Deployment

```bash
# Build images
docker build -t realriches-api ./apps/api
docker build -t realriches-web ./apps/web

# Run with docker-compose
docker-compose -f docker-compose.prod.yml up -d
```

### Environment-specific Builds

```bash
# Production build
pnpm build

# Run production
pnpm start
```

### CI/CD

GitHub Actions workflows are configured in `.github/workflows/`:
- `ci.yml` - Lint, test, build, security scan
- `deploy.yml` - Deploy to staging/production

---

## Security Considerations

### Implemented
- Argon2id password hashing
- JWT with short-lived access tokens
- Rate limiting
- CORS configuration
- Helmet security headers
- Request validation with Zod
- SQL injection prevention (Prisma)

### Required Before Production
- [ ] Enable HTTPS/TLS
- [ ] Configure proper CORS origins
- [ ] Set up WAF rules
- [ ] Enable audit logging to external service
- [ ] Set up security monitoring
- [ ] Complete SOC2 compliance checklist
- [ ] Penetration testing

---

## Known Limitations & TODOs

Items marked with `// TODO: HUMAN_IMPLEMENTATION_REQUIRED` need implementation:

1. **Email Service** - Password reset, notifications
2. **Stripe Integration** - Payment processing
3. **OpenAI/Anthropic Integration** - AI responses
4. **S3/MinIO** - File storage
5. **Twilio** - Voice AI sessions
6. **LeaseLock/Rhino** - Deposit alternatives
7. **Lemonade** - Insurance quotes
8. **The Guarantors** - Guarantor products
9. **Video/3D Generation** - Marketing media

---

## Testing

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run specific package tests
pnpm --filter @realriches/api test
```

---

## Contributing

1. Create a feature branch from `main`
2. Make changes with proper types and tests
3. Run `pnpm lint && pnpm type-check && pnpm test`
4. Create a pull request

---

## Support

For questions or issues:
- Create a GitHub issue
- Contact the development team

---

## License

Proprietary - All rights reserved.
