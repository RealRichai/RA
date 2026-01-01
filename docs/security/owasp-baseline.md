# OWASP Top 10:2021 Security Baseline Checklist

This document maps OWASP Top 10:2021 security controls to their implementations in the RealRiches codebase.

---

## A01:2021 - Broken Access Control

**Risk:** Users acting outside their intended permissions.

### Mitigations Implemented

| Control | Implementation | Location |
|---------|----------------|----------|
| Authentication Required | JWT-based authentication with token validation | `apps/api/src/plugins/auth.ts:47-122` |
| Role-Based Access Control | 8 roles with granular permission mappings | `packages/types/src/auth.ts` |
| Permission Enforcement | `fastify.authorize()` decorator enforces role/permission checks | `apps/api/src/plugins/auth.ts:125-184` |
| Token Type Validation | Access vs refresh token differentiation | `apps/api/src/plugins/auth.ts:77-86` |
| Session Management | JWT with configurable expiration | `apps/api/src/plugins/index.ts:103-108` |
| Tenant Isolation | Organization/tenant ID filters on data queries | All service modules |
| API Key Scoping | Scope-based access for service-to-service calls | `apps/api/src/modules/admin/api-keys.ts` |

### Access Control Tests

```typescript
// Test: Unauthenticated access is denied
// Location: apps/api/tests/security/access-control.test.ts

// Test: Cross-tenant data access is blocked
// Test: Users cannot access resources outside their organization
// Test: Role escalation is prevented
// Test: Expired tokens are rejected
```

### Checklist

- [x] All endpoints require authentication (except public routes)
- [x] Authorization checks on every protected route
- [x] Deny by default access policy
- [x] Rate limiting prevents brute force attacks
- [x] JWT tokens validated on every request
- [x] Token expiration enforced
- [x] Cross-tenant queries filtered by organizationId/tenantId

---

## A02:2021 - Cryptographic Failures

**Risk:** Exposure of sensitive data due to weak or missing cryptography.

### Mitigations Implemented

| Control | Implementation | Location |
|---------|----------------|----------|
| Password Hashing | Argon2 with tuned parameters (memory: 64MB, iterations: 3) | `packages/config/src/index.ts:62-74` |
| JWT Secret Validation | Minimum 32-character secret required | `packages/config/src/index.ts:77-87` |
| Encryption Key Validation | Minimum 32-character key for data encryption | `packages/config/src/index.ts:89-92` |
| TLS/HTTPS | Enforced via deployment configuration | Infrastructure layer |
| Sensitive Data Redaction | Passwords, tokens, SSN, credit cards redacted in logs | `apps/api/src/plugins/audit.ts` |
| Secure Random Generation | Crypto.randomBytes for API keys and MFA secrets | `apps/api/src/modules/admin/api-keys.ts` |
| HMAC Verification | Stripe webhook signature validation | `apps/api/src/lib/stripe.ts` |

### Encryption Configuration

```typescript
// Password hashing parameters
argon2: {
  memoryCost: 65536,  // 64 MB
  timeCost: 3,        // 3 iterations
  parallelism: 4,     // 4 threads
}

// JWT configuration
jwt: {
  secret: string,         // min 32 chars
  accessExpiresIn: '15m', // short-lived access
  refreshExpiresIn: '7d', // longer refresh
}
```

### Checklist

- [x] Strong password hashing (Argon2)
- [x] Adequate key length requirements (32+ chars)
- [x] No sensitive data in logs
- [x] HTTPS enforced in production
- [x] Secure random number generation
- [x] Webhook signatures verified
- [ ] Database encryption at rest (infrastructure dependent)
- [x] PII redacted in audit logs

---

## A03:2021 - Injection

**Risk:** User-supplied data interpreted as commands or queries.

### Mitigations Implemented

| Control | Implementation | Location |
|---------|----------------|----------|
| Input Validation | Zod schemas for all API inputs | All route files |
| Parameterized Queries | Prisma ORM prevents SQL injection | All database operations |
| Type Coercion | Strong typing with TypeScript + Zod | Throughout codebase |
| Email Validation | Email format validation | `packages/config/src/index.ts:41` |
| UUID Validation | UUID format enforced for IDs | Route schemas |
| Length Limits | String length constraints | Zod schemas |
| JSON Parsing | Secure JSON parse library | `node_modules/secure-json-parse` |

### Validation Patterns

```typescript
// Password validation example
PasswordSchema = z.string()
  .min(8)
  .max(128)
  .regex(/[A-Z]/, 'uppercase required')
  .regex(/[a-z]/, 'lowercase required')
  .regex(/[0-9]/, 'number required')
  .regex(/[!@#$%^&*]/, 'special char required');

// UUID validation
z.string().uuid()

// Email validation
z.string().email()
```

### Checklist

- [x] All user input validated with Zod schemas
- [x] Prisma ORM for SQL injection prevention
- [x] No raw SQL queries with string concatenation
- [x] Email format validation
- [x] UUID format enforcement
- [x] Password complexity requirements
- [x] File upload restrictions (type, size)
- [x] Content-Type validation

---

## A05:2021 - Security Misconfiguration

**Risk:** Missing security hardening or improper configuration.

### Mitigations Implemented

| Control | Implementation | Location |
|---------|----------------|----------|
| Security Headers | Helmet middleware with CSP | `apps/api/src/plugins/index.ts:40-49` |
| CORS Configuration | Restricted origins with credentials | `apps/api/src/plugins/index.ts:52-76` |
| Rate Limiting | IP-based and tier-based limits | `apps/api/src/plugins/rate-limit.ts` |
| Error Handling | Stack traces hidden in production | `apps/api/src/plugins/error-handler.ts` |
| Environment Validation | All env vars validated at startup | `packages/config/src/index.ts` |
| Secrets Guard | CI blocks committed secrets | `.github/workflows/ci.yml:19-58` |
| Dependency Scanning | pnpm audit + Snyk in CI | `.github/workflows/ci.yml:200-229` |

### Security Headers

```typescript
// Helmet configuration
helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
});
```

### CORS Configuration

```typescript
cors({
  origin: config.api.corsOrigins,    // Restricted origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
});
```

### Checklist

- [x] Security headers via Helmet
- [x] Content Security Policy enabled
- [x] CORS restricted to allowed origins
- [x] Rate limiting enabled
- [x] Error details hidden in production
- [x] Environment variables validated
- [x] No secrets in repository
- [x] Dependency vulnerabilities scanned
- [x] Debug endpoints disabled in production
- [x] Swagger docs restricted in production (recommended)

---

## A09:2021 - Security Logging and Monitoring Failures

**Risk:** Inability to detect, escalate, or respond to active breaches.

### Mitigations Implemented

| Control | Implementation | Location |
|---------|----------------|----------|
| Request Logging | All requests logged with trace context | `apps/api/src/plugins/index.ts:198-220` |
| Audit Logging | All write operations recorded | `apps/api/src/plugins/audit.ts` |
| Security Event Logging | Auth events logged with outcomes | `apps/api/src/modules/auth/service.ts` |
| SOC2 Evidence Records | Compliance evidence with integrity hashes | `apps/api/src/modules/evidence/` |
| Failed Login Tracking | Failed auth attempts logged | `apps/api/src/modules/auth/service.ts` |
| Rate Limit Logging | Exceeded limits logged | `apps/api/src/plugins/rate-limit.ts` |
| Trace Context | Request tracing with IDs | `apps/api/src/plugins/tracing.ts` |
| Metrics Collection | Prometheus metrics for monitoring | `apps/api/src/plugins/metrics.ts` |

### Logged Events

| Event Type | Log Level | Details Captured |
|------------|-----------|------------------|
| `auth.login_success` | info | userId, email, IP, userAgent |
| `auth.login_failed` | warn | email, IP, reason, userAgent |
| `auth.token_revoked` | info | userId, sessionId |
| `auth.password_changed` | info | userId |
| `auth.account_locked` | warn | userId, reason |
| `admin.impersonation_started` | warn | adminId, targetUserId |
| `rate_limit_exceeded` | warn | IP, endpoint, limit |
| `compliance.gate_blocked` | warn | action, entityId, violations |

### Audit Trail Schema

```typescript
AuditLog {
  id: string
  actorId: string
  action: string
  entityType: string
  entityId: string
  changes: JSON           // before/after diff
  metadata: JSON          // request context
  ipAddress: string
  userAgent: string
  requestId: string
  createdAt: DateTime
}
```

### Checklist

- [x] Authentication events logged
- [x] Authorization failures logged
- [x] All write operations audited
- [x] Request tracing enabled
- [x] Rate limit violations logged
- [x] Admin actions logged
- [x] Compliance decisions recorded
- [x] Sensitive data redacted from logs
- [x] Structured logging format (JSON)
- [x] Prometheus metrics for alerting

---

## CI Security Checks

The following security checks run on every push and pull request:

### Secrets Guard (`.github/workflows/ci.yml`)

- Blocks `.env` files (except `.env.example`)
- Blocks `.pem` and `.key` files
- Blocks `.turbo` cache directories
- Blocks `/secrets/` directories

### Dependency Scanning

```yaml
# pnpm audit for known vulnerabilities
- run: pnpm audit --audit-level moderate

# Snyk security scan
- uses: snyk/actions/node@master
```

### Security Headers Check

```bash
# scripts/check-security-headers.sh
# Validates security headers are configured
```

### Authorization Middleware Check

```bash
# scripts/check-auth-middleware.sh
# Ensures new endpoints have authorization
```

---

## Security Testing

### Test Categories

1. **Access Control Tests** (`apps/api/tests/security/access-control.test.ts`)
   - Unauthenticated access denial
   - Cross-tenant isolation
   - Role escalation prevention
   - Token expiration handling

2. **Authentication Tests** (`apps/api/tests/security/auth.test.ts`)
   - Valid credential acceptance
   - Invalid credential rejection
   - MFA enforcement
   - Session management

3. **Input Validation Tests** (`apps/api/tests/security/injection.test.ts`)
   - SQL injection prevention
   - XSS prevention
   - Path traversal prevention

---

## Compliance Mapping

| OWASP Category | SOC2 Control | Evidence Events |
|----------------|--------------|-----------------|
| A01 - Access Control | CC6.1, CC6.2 | auth.*, admin.* |
| A02 - Cryptographic | CC6.7 | - |
| A03 - Injection | CC6.1 | - |
| A05 - Misconfiguration | CC6.6 | admin.api_key_* |
| A09 - Logging | CC7.2 | All evidence records |

---

## References

- [OWASP Top 10:2021](https://owasp.org/Top10/)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)
- [SOC2 Trust Services Criteria](./soc2-controls.md)
