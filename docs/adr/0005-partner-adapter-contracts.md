# ADR-0005: Partner Adapter Contracts

**Status:** Accepted
**Date:** 2025-12-31
**Authors:** RealRiches Architecture Team
**Reviewers:** Engineering Leadership, Partnerships Team

## Context

RealRiches integrates with numerous external partners:
- **Insurance**: Renters insurance, landlord policies, liability coverage
- **Screening**: Credit checks, background checks, eviction history
- **Payments**: Rent collection, ACH, card processing
- **Utilities**: Utility connection/disconnection, usage data
- **Maintenance**: Vendor networks, parts ordering
- **Moving**: Moving services, storage providers

Each partner integration has historically been implemented ad-hoc:
- Inconsistent error handling
- No standard testing approach
- Tightly coupled to specific vendor APIs
- Difficult to swap providers
- No sandbox/testing mode for development
- Schema drift when partners update their APIs

We need a standardized adapter architecture that enables reliable integrations while supporting partner portability and safe development.

## Decision

**Implement a Partner Adapter Contract pattern with standardized operations (quote/bind/cancel), mandatory sandbox mode, and schema-validated request/response handling.**

### Architecture Components

#### 1. Adapter Contract Interface

All partner adapters implement a common contract:

```typescript
interface PartnerAdapter<TConfig, TContext> {
  // Identity
  partnerId: string;
  partnerType: PartnerType;
  version: string;

  // Configuration
  configure(config: TConfig): Promise<void>;
  validateConfig(): Promise<ValidationResult>;

  // Health
  healthCheck(): Promise<HealthStatus>;
  getCapabilities(): AdapterCapabilities;

  // Sandbox
  isSandbox(): boolean;
  setSandboxMode(enabled: boolean): void;
}

type PartnerType =
  | 'INSURANCE'
  | 'SCREENING'
  | 'PAYMENT'
  | 'UTILITY'
  | 'MAINTENANCE'
  | 'MOVING';
```

#### 2. Insurance Adapter Contract (Example)

```typescript
interface InsuranceAdapter extends PartnerAdapter<InsuranceConfig, InsuranceContext> {
  // Quote phase - get pricing without commitment
  getQuote(request: QuoteRequest): Promise<QuoteResponse>;
  getQuotes(request: QuoteRequest): Promise<QuoteResponse[]>; // Multiple options

  // Bind phase - purchase the policy
  bindPolicy(quoteId: string, bindRequest: BindRequest): Promise<BindResponse>;

  // Policy management
  getPolicy(policyId: string): Promise<PolicyDetails>;
  getPolicies(filter: PolicyFilter): Promise<PolicyDetails[]>;

  // Modification
  updatePolicy(policyId: string, update: PolicyUpdate): Promise<PolicyDetails>;
  endorsePolicy(policyId: string, endorsement: Endorsement): Promise<PolicyDetails>;

  // Cancellation
  cancelPolicy(policyId: string, reason: CancellationReason): Promise<CancellationResult>;
  getCancellationQuote(policyId: string): Promise<CancellationQuote>;

  // Claims (read-only, claims filed through partner portal)
  getClaims(policyId: string): Promise<Claim[]>;

  // Documents
  getPolicyDocuments(policyId: string): Promise<PolicyDocument[]>;
  getCertificateOfInsurance(policyId: string): Promise<COIDocument>;
}

// Standardized request/response schemas
interface QuoteRequest {
  // Property details
  property: {
    address: Address;
    type: 'SINGLE_FAMILY' | 'MULTI_FAMILY' | 'CONDO' | 'APARTMENT';
    yearBuilt: number;
    squareFeet: number;
    stories: number;
    constructionType: 'FRAME' | 'MASONRY' | 'STEEL';
  };

  // Coverage requirements
  coverage: {
    type: 'RENTERS' | 'LANDLORD' | 'LIABILITY';
    personalProperty?: number;
    liability: number;
    deductible: number;
    additionalCoverages?: string[];
  };

  // Insured details
  insured: {
    name: string;
    email: string;
    phone?: string;
    dateOfBirth?: Date;
  };

  // Effective dates
  effectiveDate: Date;
  termMonths: 6 | 12;
}

interface QuoteResponse {
  quoteId: string;
  partnerId: string;
  partnerQuoteRef: string;

  // Pricing
  premium: {
    annual: Decimal;
    monthly: Decimal;
    paymentOptions: PaymentOption[];
  };

  // Coverage details
  coverage: {
    type: string;
    limits: Record<string, Decimal>;
    deductibles: Record<string, Decimal>;
    exclusions: string[];
  };

  // Quote validity
  validUntil: Date;

  // Required for bind
  requiredDocuments: string[];
  requiredAnswers: Question[];

  // Partner-specific metadata
  metadata: Record<string, unknown>;
}

interface BindRequest {
  quoteId: string;

  // Payment
  paymentMethod: {
    type: 'CARD' | 'ACH' | 'INVOICE';
    token?: string;
    frequency: 'ANNUAL' | 'MONTHLY';
  };

  // Additional info if required by quote
  answers?: Record<string, unknown>;
  documents?: UploadedDocument[];

  // Consent
  termsAccepted: boolean;
  termsAcceptedAt: Date;
  electronicSignature: string;
}

interface BindResponse {
  policyId: string;
  partnerPolicyRef: string;

  policy: PolicyDetails;

  // Payment result
  payment: {
    status: 'PAID' | 'PENDING' | 'FAILED';
    amount: Decimal;
    transactionId?: string;
    nextPaymentDate?: Date;
  };

  // Documents
  documents: PolicyDocument[];
}
```

#### 3. Sandbox Mode Implementation

Every adapter must support sandbox mode for development and testing:

```typescript
abstract class BasePartnerAdapter<TConfig> implements PartnerAdapter<TConfig> {
  protected sandboxMode: boolean = false;
  protected config: TConfig;

  setSandboxMode(enabled: boolean): void {
    this.sandboxMode = enabled;
    this.reconfigure();
  }

  isSandbox(): boolean {
    return this.sandboxMode;
  }

  protected getBaseUrl(): string {
    return this.sandboxMode
      ? this.config.sandboxUrl
      : this.config.productionUrl;
  }

  protected getCredentials(): Credentials {
    return this.sandboxMode
      ? this.config.sandboxCredentials
      : this.config.productionCredentials;
  }

  // Sandbox responses for partners without true sandbox
  protected async sandboxFallback<T>(
    operation: string,
    request: unknown
  ): Promise<T> {
    const fixture = await this.loadSandboxFixture(operation, request);
    return this.applyRequestVariations(fixture, request);
  }
}

// Sandbox fixture management
interface SandboxFixture {
  operation: string;
  requestPattern: Record<string, unknown>;  // Pattern to match
  response: unknown;
  latencyMs: number;                         // Simulate real latency
  errorScenario?: {
    probability: number;
    error: PartnerError;
  };
}
```

#### 4. Schema Validation

All requests and responses are validated against schemas:

```typescript
import { z } from 'zod';

// Request schema
const QuoteRequestSchema = z.object({
  property: z.object({
    address: AddressSchema,
    type: z.enum(['SINGLE_FAMILY', 'MULTI_FAMILY', 'CONDO', 'APARTMENT']),
    yearBuilt: z.number().min(1800).max(new Date().getFullYear()),
    squareFeet: z.number().positive(),
    stories: z.number().int().positive(),
    constructionType: z.enum(['FRAME', 'MASONRY', 'STEEL']),
  }),
  coverage: z.object({
    type: z.enum(['RENTERS', 'LANDLORD', 'LIABILITY']),
    personalProperty: z.number().optional(),
    liability: z.number().positive(),
    deductible: z.number().nonnegative(),
    additionalCoverages: z.array(z.string()).optional(),
  }),
  insured: InsuredSchema,
  effectiveDate: z.date(),
  termMonths: z.union([z.literal(6), z.literal(12)]),
});

// Response schema with partner tolerance
const QuoteResponseSchema = z.object({
  quoteId: z.string(),
  partnerId: z.string(),
  partnerQuoteRef: z.string(),
  premium: PremiumSchema,
  coverage: CoverageSchema,
  validUntil: z.date(),
  requiredDocuments: z.array(z.string()),
  requiredAnswers: z.array(QuestionSchema),
  metadata: z.record(z.unknown()),  // Allow partner-specific fields
}).passthrough();  // Don't fail on extra fields

// Validation wrapper
async function validateAndCall<TReq, TRes>(
  requestSchema: z.ZodType<TReq>,
  responseSchema: z.ZodType<TRes>,
  request: unknown,
  call: (validated: TReq) => Promise<unknown>
): Promise<TRes> {
  // Validate request
  const validatedRequest = requestSchema.parse(request);

  // Make call
  const rawResponse = await call(validatedRequest);

  // Validate response (log but don't fail on extra fields)
  const validatedResponse = responseSchema.parse(rawResponse);

  return validatedResponse;
}
```

#### 5. Partner Adapter Registry

Centralized registration and discovery of adapters:

```typescript
class PartnerAdapterRegistry {
  private adapters: Map<string, PartnerAdapter> = new Map();

  register(adapter: PartnerAdapter): void {
    const key = `${adapter.partnerType}:${adapter.partnerId}`;
    this.adapters.set(key, adapter);
  }

  get<T extends PartnerAdapter>(
    partnerType: PartnerType,
    partnerId: string
  ): T {
    const key = `${partnerType}:${partnerId}`;
    const adapter = this.adapters.get(key);
    if (!adapter) {
      throw new AdapterNotFoundError(partnerType, partnerId);
    }
    return adapter as T;
  }

  getByType(partnerType: PartnerType): PartnerAdapter[] {
    return [...this.adapters.values()]
      .filter(a => a.partnerType === partnerType);
  }

  // Get healthy adapters for failover
  async getHealthy(partnerType: PartnerType): Promise<PartnerAdapter[]> {
    const adapters = this.getByType(partnerType);
    const health = await Promise.all(
      adapters.map(async a => ({ adapter: a, health: await a.healthCheck() }))
    );
    return health
      .filter(h => h.health.status === 'HEALTHY')
      .map(h => h.adapter);
  }
}
```

#### 6. Error Handling and Retry

Standardized error handling across all adapters:

```typescript
interface PartnerError {
  code: PartnerErrorCode;
  message: string;
  partnerCode?: string;     // Original partner error code
  partnerMessage?: string;  // Original partner message
  retryable: boolean;
  retryAfter?: Date;
  context?: Record<string, unknown>;
}

type PartnerErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'VALIDATION_ERROR'
  | 'RESOURCE_NOT_FOUND'
  | 'PARTNER_UNAVAILABLE'
  | 'OPERATION_NOT_SUPPORTED'
  | 'INSUFFICIENT_DATA'
  | 'PARTNER_REJECTED'
  | 'TIMEOUT'
  | 'UNKNOWN';

// Retry configuration per operation type
const retryConfig: Record<string, RetryConfig> = {
  'getQuote': { maxAttempts: 3, backoffMs: 1000, maxBackoffMs: 10000 },
  'bindPolicy': { maxAttempts: 1, backoffMs: 0 },  // No retry for bind
  'cancelPolicy': { maxAttempts: 2, backoffMs: 2000 },
  'healthCheck': { maxAttempts: 2, backoffMs: 500 },
};
```

## Alternatives Considered

### Alternative 1: Direct API Integration per Partner

**Description**: Each partner integration is bespoke code with no common abstraction.

**Why Rejected**:
- Inconsistent error handling
- Cannot swap partners easily
- No standard testing approach
- Duplicated boilerplate across integrations
- Difficult to maintain as partner count grows

### Alternative 2: BFF (Backend for Frontend) Aggregation

**Description**: Create aggregation layer that calls multiple partners and combines results.

**Why Rejected**:
- Aggregation is orthogonal to adapter contracts
- Still need standardized adapters underneath
- Can add aggregation layer on top of adapters later

### Alternative 3: iPaaS Platform (Zapier, Workato, etc.)

**Description**: Use integration platform for partner connections.

**Why Rejected**:
- Critical path for revenue (payments, insurance) shouldn't depend on third-party iPaaS
- Limited customization for complex flows (bind, cancel, claims)
- Cost scales with transaction volume
- Latency overhead for critical operations

## Consequences

### Positive

- **Partner Portability**: Can swap providers without application code changes
- **Consistent Testing**: Sandbox mode enables reliable development and CI
- **Schema Safety**: Type-safe requests/responses catch integration issues early
- **Failover Ready**: Registry pattern enables automatic failover to backup providers
- **Observability**: Standardized interfaces enable consistent logging and metrics
- **Faster Integration**: New partners follow established patterns

### Negative

- **Abstraction Cost**: Some partner-specific features may not fit standard contract
- **Schema Maintenance**: Must keep schemas in sync with partner API changes
- **Initial Overhead**: More upfront work than direct integration

### Neutral

- Partners without true sandbox require fixture-based simulation
- Some partners may require contract extensions for unique features

## Follow-ups

- [ ] Define adapter contracts for all partner types (Insurance, Screening, Payment, Utility, Maintenance, Moving)
- [ ] Implement BasePartnerAdapter with sandbox, retry, and validation
- [ ] Create PartnerAdapterRegistry with health checking
- [ ] Build sandbox fixture management system
- [ ] Implement first adapters: Lemonade (Insurance), Stripe (Payment), Plaid (Utility)
- [ ] Create partner integration test harness
- [ ] Add monitoring dashboard for partner health and latency
- [ ] Document adapter development guide for new integrations
- [ ] Implement circuit breaker for partner failover
- [ ] Create partner API version tracking and deprecation alerts
