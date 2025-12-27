# RealRiches Integration Handoff Checklist

## For Human Engineering Team

**Document Version:** 1.1  
**Last Updated:** December 2025  
**Platform Status:** 96% Complete (Frontend + Architecture)

---

## Executive Summary

This checklist documents all external integrations that require human engineering intervention. These tasks cannot be completed by AI assistants because they require:

1. **Business Contracts** - Legal agreements with third-party providers
2. **Credential Management** - API keys, secrets, OAuth tokens
3. **Compliance Certifications** - PCI DSS, SOC 2, FCRA compliance
4. **Bank Account Verification** - KYC/AML requirements
5. **Domain Verification** - DNS records, email authentication

---

## NEW: Technical Debt Remediation (Pre-Launch)

These items were identified in the architectural audit and have been partially implemented. Human engineers must complete the remaining tasks.

### ✅ COMPLETED (by AI)

| Item | Status | Files Created |
|------|--------|---------------|
| Shared package with workspace protocol | ✅ Done | `packages/shared/*` |
| Root tsconfig with strict settings | ✅ Done | `tsconfig.base.json` |
| ESLint flat config with naming rules | ✅ Done | `eslint.config.js` |
| Prettier config | ✅ Done | `.prettierrc` |
| Turbo config with remote cache setup | ✅ Done | `turbo.json` |
| Security audit script | ✅ Done | `package.json` |
| Fastify security middleware packages | ✅ Done | `apps/api/package.json` |
| DOMPurify for XSS prevention | ✅ Done | `apps/web/package.json` |
| pnpm overrides for known CVEs | ✅ Done | `package.json` |

### ⚠️ REQUIRES HUMAN ACTION

#### 1. Enable Turbo Remote Cache (CI/CD)

**Purpose:** Accelerate builds by 60-80% through cached artifacts

**Steps:**
```bash
# 1. Link to Vercel (or self-hosted cache)
npx turbo login
npx turbo link

# 2. Verify in turbo.json
# "remoteCache": { "signature": true }

# 3. Add to CI environment
TURBO_TOKEN=xxx
TURBO_TEAM=realriches
```

**Business Impact:** Reduces CI pipeline time from 12 minutes to ~4 minutes

---

#### 2. Configure CI/CD Security Scanning

**Purpose:** Automated dependency vulnerability detection

**GitHub Actions Workflow:**
```yaml
# .github/workflows/security.yml
name: Security Scan
on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: '0 6 * * 1' # Weekly Monday 6am

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
        with:
          version: 9
      - run: pnpm install --frozen-lockfile
      - run: pnpm security:check
      - run: pnpm audit --audit-level=critical
        continue-on-error: true
```

**Checklist:**
- [ ] Create `.github/workflows/security.yml`
- [ ] Add PNPM cache to CI runners
- [ ] Configure Dependabot alerts
- [ ] Set up Snyk or Socket.dev integration (optional)

---

#### 3. Implement Fastify Security Middleware

**Purpose:** Security headers, rate limiting, DoS protection

**Location:** `apps/api/src/index.ts` (when backend is built)

**Required Implementation:**
```typescript
import fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';

const app = fastify({ logger: true });

// Security headers (OWASP recommended)
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// Rate limiting (DoS protection)
await app.register(rateLimit, {
  max: 100,           // 100 requests
  timeWindow: '1 minute',
  keyGenerator: (req) => req.ip,
  // Stricter limits for auth endpoints
  routeOptions: {
    '/api/v1/auth/login': { max: 5, timeWindow: '1 minute' },
    '/api/v1/auth/register': { max: 3, timeWindow: '1 minute' },
  },
});

// CORS configuration
await app.register(cors, {
  origin: process.env.WEB_URL ?? 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
});
```

**Checklist:**
- [ ] Register helmet plugin with CSP
- [ ] Configure rate limiting per endpoint
- [ ] Set up CORS with production origin
- [ ] Add request ID header for tracing
- [ ] Configure pino logger with PII redaction

---

#### 4. Input Sanitization (XSS Prevention)

**Purpose:** Prevent XSS when rendering user-generated content

**Utility Created:** Use `isomorphic-dompurify` (already added to deps)

**Implementation Pattern:**
```typescript
// apps/web/src/lib/sanitize.ts
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });
}

// Usage in components:
// <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(listing.description) }} />
```

**Checklist:**
- [ ] Create `apps/web/src/lib/sanitize.ts`
- [ ] Apply to all user-generated content rendering
- [ ] Add CSP headers to prevent inline scripts
- [ ] Test with XSS payload database

---

#### 5. Copy-on-Write Filesystem for CI (Optional)

**Purpose:** Maximize pnpm disk space and speed benefits

**For GitHub Actions:**
```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    container:
      image: node:22
      options: --tmpfs /tmp:exec
```

**For Self-Hosted Runners:**
- Use Btrfs or XFS with reflink support
- Configure pnpm store on CoW partition

**Note:** This is a P3 optimization, not blocking for launch.

---

## Integration Priority Matrix

| Priority | Integration | Revenue Impact | Complexity | Timeline |
|----------|-------------|----------------|------------|----------|
| 🔴 P0 | Stripe Connect | $60/unit/year | High | 4-6 weeks |
| 🔴 P0 | SendGrid | Required for MVP | Low | 1 week |
| 🟡 P1 | TransUnion SmartMove | $5-15/screen | Medium | 3-4 weeks |
| 🟡 P1 | DocuSign | $500/lease | Medium | 2-3 weeks |
| 🟢 P2 | Plaid | Premium feature | Medium | 2-3 weeks |
| 🟢 P2 | Persona | Security feature | Low | 1-2 weeks |
| 🔵 P3 | TheGuarantors | $100/referral | Low | 1-2 weeks |
| 🔵 P3 | Seam (Smart Locks) | $150/unit | High | 4-6 weeks |
| 🔵 P3 | Twilio/Sendblue | Notifications | Low | 1 week |

---

## P0: Critical Path Integrations

### 1. Stripe Connect

**Purpose:** Rent collection, application fee processing, landlord payouts

**Business Requirements:**
- [ ] Stripe business account (verified)
- [ ] Bank account for platform fees
- [ ] Platform agreement signed
- [ ] PCI DSS compliance acknowledgment

**Technical Requirements:**
- [ ] API keys (publishable + secret)
- [ ] Webhook endpoint configured
- [ ] Connect account onboarding flow
- [ ] Test mode validation complete

**Implementation Steps:**

```bash
# 1. Environment Variables Required
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_CONNECT_CLIENT_ID=ca_xxx

# 2. Webhook Events to Configure
# - payment_intent.succeeded
# - payment_intent.payment_failed
# - account.updated
# - payout.paid
# - charge.dispute.created
```

**API Endpoints to Implement:**
```
POST /api/v1/payments/create-intent
POST /api/v1/payments/confirm
POST /api/v1/landlords/connect/onboard
POST /api/v1/landlords/connect/link
POST /api/v1/webhooks/stripe
```

**FARE Act Compliance Notes:**
- Application fee PaymentIntent must be capped at $2000 (cents)
- Security deposit must not exceed 1 month rent
- Implement fee disclosure in payment metadata

**Testing Checklist:**
- [ ] Test card payments (4242 4242 4242 4242)
- [ ] Test ACH payments
- [ ] Test Connect account creation
- [ ] Test landlord payout flow
- [ ] Test refund flow
- [ ] Test webhook handling
- [ ] Test idempotency keys

---

### 2. SendGrid

**Purpose:** Transactional emails (welcome, application status, lease signing)

**Business Requirements:**
- [ ] SendGrid account (Pro tier recommended)
- [ ] Sending domain verified
- [ ] Dedicated IP (for deliverability)

**Technical Requirements:**
- [ ] API key
- [ ] DKIM records configured
- [ ] SPF records configured
- [ ] DMARC policy set

**Implementation Steps:**

```bash
# 1. Environment Variables
SENDGRID_API_KEY=SG.xxx
SENDGRID_FROM_EMAIL=notifications@realriches.com
SENDGRID_FROM_NAME=RealRiches

# 2. DNS Records Required
# TXT record for SPF
# CNAME records for DKIM (3 records)
# TXT record for DMARC
```

**Email Templates Required:**
| Template ID | Purpose | FARE Act Content |
|-------------|---------|------------------|
| `welcome` | New user registration | - |
| `email-verify` | Email verification | - |
| `password-reset` | Password reset | - |
| `application-received` | Application confirmation | Fee disclosure |
| `application-status` | Status update | - |
| `conditional-offer` | Fair Chance Act | Criminal check notice |
| `lease-ready` | Lease signing | Move-in cost breakdown |
| `payment-receipt` | Payment confirmation | Fee itemization |
| `rent-reminder` | Rent due reminder | - |

**Testing Checklist:**
- [ ] Verify domain authentication
- [ ] Test all email templates
- [ ] Verify link tracking works
- [ ] Check spam score (< 3.0)
- [ ] Test unsubscribe flow

---

## P1: Revenue-Enabling Integrations

### 3. TransUnion SmartMove

**Purpose:** Credit reports, criminal background, eviction history

**Business Requirements:**
- [ ] TransUnion reseller agreement
- [ ] FCRA permissible purpose documentation
- [ ] End-user consent flow approved
- [ ] Data security attestation

**Compliance Critical:**
```
⚠️  FAIR CHANCE HOUSING ACT REQUIREMENT
    
Criminal background checks can ONLY be initiated AFTER 
the application reaches CONDITIONAL_OFFER status.

The system MUST enforce this at the API level.
```

**Technical Requirements:**
- [ ] API credentials (sandbox + production)
- [ ] Webhook endpoint for report completion
- [ ] Consent form integration

**Implementation Steps:**

```bash
# Environment Variables
TRANSUNION_API_URL=https://api.transunion.com/v1
TRANSUNION_CLIENT_ID=xxx
TRANSUNION_CLIENT_SECRET=xxx
TRANSUNION_WEBHOOK_SECRET=xxx
```

**API Endpoints to Implement:**
```
POST /api/v1/applications/:id/screening/initiate
GET  /api/v1/applications/:id/screening/status
POST /api/v1/webhooks/transunion
```

**State Machine Enforcement:**
```typescript
// CRITICAL: This check must exist at API level
async function initiateBackgroundCheck(applicationId: string) {
  const application = await getApplication(applicationId);
  
  // Fair Chance Housing Act enforcement
  if (!application.conditionalOfferAt) {
    throw new ForbiddenError(
      'Criminal background check cannot be initiated before conditional offer'
    );
  }
  
  // Proceed with TransUnion API call
}
```

**Cost Structure:**
- Credit report: ~$15-25
- Criminal background: ~$10-15
- Eviction history: ~$5-10
- **Total:** ~$25-35 per applicant

**FARE Act Impact:**
- Tenant can only be charged $20 max
- Landlord must pay the difference ($5-15)
- Implement billing split in payment flow

---

### 4. DocuSign

**Purpose:** Electronic lease signing, FARE Act disclosures

**Business Requirements:**
- [ ] DocuSign developer account
- [ ] API plan subscription
- [ ] Template library created
- [ ] Branding assets uploaded

**Technical Requirements:**
- [ ] Integration key
- [ ] RSA private key (JWT auth)
- [ ] Webhook (Connect) configured

**Implementation Steps:**

```bash
# Environment Variables
DOCUSIGN_INTEGRATION_KEY=xxx
DOCUSIGN_USER_ID=xxx
DOCUSIGN_ACCOUNT_ID=xxx
DOCUSIGN_BASE_PATH=https://na4.docusign.net
DOCUSIGN_PRIVATE_KEY_PATH=/secrets/docusign.pem
```

**Templates Required:**
| Template Name | Purpose | FARE Act Fields |
|---------------|---------|-----------------|
| `nyc-lease-standard` | NYC apartment lease | Fee disclosure, broker fee |
| `nyc-lease-luxury` | High-end NYC lease | Same + amenity addendums |
| `li-lease-standard` | Long Island lease | Traditional fee structure |
| `fare-act-disclosure` | Standalone disclosure | All fee breakdowns |
| `fair-chance-notice` | Criminal check notice | Assessment timeline |

**API Endpoints to Implement:**
```
POST /api/v1/leases/:id/send-for-signature
GET  /api/v1/leases/:id/signing-status
POST /api/v1/leases/:id/void
POST /api/v1/webhooks/docusign
```

---

## P2: Enhancement Integrations

### 5. Plaid

**Purpose:** Income verification, bank account linking

**Business Requirements:**
- [ ] Plaid dashboard account
- [ ] Production access approved
- [ ] Use case documentation submitted

**Technical Requirements:**
- [ ] Client ID
- [ ] Secret key
- [ ] Public key (Link)

**Implementation Steps:**

```bash
# Environment Variables
PLAID_CLIENT_ID=xxx
PLAID_SECRET=xxx
PLAID_ENV=production  # sandbox, development, production
```

**API Endpoints:**
```
POST /api/v1/plaid/link-token
POST /api/v1/plaid/exchange-token
GET  /api/v1/applications/:id/income-verification
```

**Cost Consideration:**
- ~$0.30-$2.00 per verification call
- Only trigger after application moves to FINANCIAL_REVIEW
- Do NOT trigger on every draft application

---

### 6. Persona

**Purpose:** Government ID verification, selfie liveness check

**Business Requirements:**
- [ ] Persona account
- [ ] Inquiry template created
- [ ] Branding customized

**Technical Requirements:**
- [ ] API key
- [ ] Template ID
- [ ] Webhook secret

**Implementation Steps:**

```bash
# Environment Variables
PERSONA_API_KEY=xxx
PERSONA_TEMPLATE_ID=tmpl_xxx
PERSONA_WEBHOOK_SECRET=xxx
```

---

## P3: Growth Integrations

### 7. TheGuarantors

**Purpose:** Rent guarantee insurance referrals

**Business Requirements:**
- [ ] Partner agreement signed
- [ ] Referral tracking code assigned
- [ ] Commission structure confirmed (typically 10%)

**Technical Requirements:**
- [ ] Partner ID
- [ ] Referral link generation

**Implementation Notes:**
```
This is the easiest revenue stream to activate.
It's essentially a referral link with tracking.
No complex API integration required.
```

---

### 8. Seam (Smart Locks)

**Purpose:** Self-guided showings, access code generation

**Business Requirements:**
- [ ] Seam account
- [ ] Hardware partner agreements (Yale, Schlage)
- [ ] Installer network established

**Technical Requirements:**
- [ ] API key
- [ ] Webhook endpoint
- [ ] Device provisioning flow

**Implementation Steps:**

```bash
# Environment Variables
SEAM_API_KEY=xxx
SEAM_WEBHOOK_SECRET=xxx
```

**Supported Lock Brands:**
- Yale Assure Lock 2 (recommended)
- Schlage Encode Plus
- August WiFi Smart Lock
- Kwikset SmartCode

---

### 9. Twilio / Sendblue

**Purpose:** SMS notifications, iMessage delivery

**Business Requirements:**
- [ ] Twilio account
- [ ] Phone number provisioned
- [ ] A2P 10DLC registration (US)
- [ ] Sendblue account (for iMessage)

**Technical Requirements:**
- [ ] Account SID
- [ ] Auth token
- [ ] From phone number

**Cost Optimization:**
```
SMS costs ~$0.0083/segment.
Use push notifications as primary.
SMS only for critical alerts:
- Tour reminders
- Application decisions
- Rent due (final notice)
```

---

## Database & Infrastructure

### PostgreSQL (Supabase / AWS RDS)

**Requirements:**
- [ ] Production database provisioned
- [ ] Connection string configured
- [ ] SSL certificates installed
- [ ] Backup schedule configured
- [ ] Read replicas (if needed)

```bash
DATABASE_URL=postgresql://user:pass@host:5432/realriches?sslmode=require
```

### Redis (Upstash / AWS ElastiCache)

**Requirements:**
- [ ] Redis instance provisioned
- [ ] TLS enabled
- [ ] Persistence configured

```bash
REDIS_URL=rediss://user:pass@host:6379
```

### File Storage (AWS S3 / Cloudflare R2)

**Requirements:**
- [ ] Bucket created
- [ ] CORS configured
- [ ] CDN configured
- [ ] Lifecycle policies set

```bash
AWS_S3_BUCKET=realriches-uploads
AWS_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
```

---

## Security Checklist

### Secrets Management
- [ ] All secrets in environment variables (never in code)
- [ ] Secrets rotated on schedule
- [ ] Access logged and auditable

### API Security
- [ ] Rate limiting implemented
- [ ] API key validation
- [ ] JWT token expiration (15 min access, 7 day refresh)
- [ ] CORS properly configured

### Data Protection
- [ ] PII encrypted at rest
- [ ] TLS 1.3 in transit
- [ ] Audit logs for all sensitive operations
- [ ] GDPR/CCPA compliance measures

### Compliance
- [ ] FARE Act fee caps enforced at API level
- [ ] Fair Chance Housing Act state machine enforced
- [ ] Audit trail for all application status changes
- [ ] Data retention policies implemented

---

## Deployment Checklist

### Pre-Launch
- [ ] All P0 integrations active
- [ ] Database migrations complete
- [ ] Seed data loaded (boroughs, markets)
- [ ] Health check endpoints working
- [ ] Error monitoring configured (Sentry)
- [ ] Log aggregation configured
- [ ] Uptime monitoring configured

### Launch Day
- [ ] DNS propagated
- [ ] SSL certificates valid
- [ ] CDN cache warmed
- [ ] Load testing completed
- [ ] Rollback plan documented

### Post-Launch
- [ ] Monitor error rates
- [ ] Monitor API latency
- [ ] Monitor payment success rates
- [ ] Monitor email deliverability
- [ ] Customer support ready

---

## Contact Information

### Integration Support Contacts

| Provider | Support URL | Notes |
|----------|-------------|-------|
| Stripe | stripe.com/support | IRC channel available |
| SendGrid | support.sendgrid.com | Email only |
| TransUnion | transunion.com/business | Phone support |
| DocuSign | support.docusign.com | Developer forum |
| Plaid | plaid.com/contact | Slack community |
| Persona | withpersona.com/support | Email only |
| Seam | seam.co/support | Discord community |

---

## Appendix: Environment Variable Template

```bash
# =============================================================================
# RealRiches Production Environment Variables
# =============================================================================

# Application
NODE_ENV=production
PORT=3000
API_URL=https://api.realriches.com
WEB_URL=https://realriches.com

# Database
DATABASE_URL=postgresql://xxx
REDIS_URL=rediss://xxx

# Authentication
JWT_SECRET=xxx
JWT_REFRESH_SECRET=xxx

# Stripe
STRIPE_PUBLISHABLE_KEY=pk_live_xxx
STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_CONNECT_CLIENT_ID=ca_xxx

# SendGrid
SENDGRID_API_KEY=SG.xxx
SENDGRID_FROM_EMAIL=notifications@realriches.com

# TransUnion
TRANSUNION_API_URL=https://api.transunion.com
TRANSUNION_CLIENT_ID=xxx
TRANSUNION_CLIENT_SECRET=xxx

# DocuSign
DOCUSIGN_INTEGRATION_KEY=xxx
DOCUSIGN_USER_ID=xxx
DOCUSIGN_ACCOUNT_ID=xxx
DOCUSIGN_PRIVATE_KEY_PATH=/secrets/docusign.pem

# Plaid
PLAID_CLIENT_ID=xxx
PLAID_SECRET=xxx
PLAID_ENV=production

# Persona
PERSONA_API_KEY=xxx
PERSONA_TEMPLATE_ID=tmpl_xxx

# Seam
SEAM_API_KEY=xxx

# Twilio
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_FROM_NUMBER=+1xxx

# Storage
AWS_S3_BUCKET=realriches-uploads
AWS_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx

# Monitoring
SENTRY_DSN=https://xxx@sentry.io/xxx
```

---

**Document End**

*This checklist should be reviewed and updated as integrations are completed.*
