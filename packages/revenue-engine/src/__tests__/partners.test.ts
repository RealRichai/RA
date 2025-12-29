/**
 * Partner Provider Tests
 *
 * Tests for partner integration framework and contract lifecycle.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { LeaseLockProvider } from '../partners/adapters/leaselock';
import { RhinoProvider } from '../partners/adapters/rhino';
import { JettyProvider } from '../partners/adapters/jetty';
import { LemonadeProvider } from '../partners/adapters/lemonade';
import { ProviderRegistry, getProviderRegistry, resetProviderRegistry } from '../partners/registry';
import { ProviderUnavailableError, QuoteDeclinedError } from '../partners/provider-interface';

import type { QuoteRequest, BindRequest } from '../types';

// =============================================================================
// Test Data
// =============================================================================

const mockQuoteRequest: QuoteRequest = {
  productType: 'deposit_alternative',
  provider: 'leaselock',
  applicantId: 'app_123',
  propertyId: 'prop_456',
  unitId: 'unit_789',
  applicantInfo: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '+1-555-123-4567',
    dateOfBirth: new Date('1990-01-15'),
    creditScore: 720,
    annualIncome: 75000,
  },
  propertyInfo: {
    address: '123 Main St, Apt 4B',
    city: 'New York',
    state: 'NY',
    zip: '10001',
    monthlyRent: 2500,
    squareFeet: 800,
    propertyType: 'apartment',
  },
  term: 12,
  startDate: new Date(),
};

const mockBindRequest: BindRequest = {
  quoteId: 'quote_123',
  provider: 'leaselock',
  providerQuoteId: 'll_quote_abc123',
  termsAccepted: true,
  termsAcceptedAt: new Date(),
  idempotencyKey: 'bind_test_123',
};

// =============================================================================
// Provider Interface Tests
// =============================================================================

describe('LeaseLock Provider', () => {
  let provider: LeaseLockProvider;

  beforeEach(() => {
    provider = new LeaseLockProvider({ apiKey: '', apiUrl: '' });
  });

  it('should have correct provider ID', () => {
    expect(provider.providerId).toBe('leaselock');
  });

  it('should support deposit_alternative product', () => {
    expect(provider.supportedProducts).toContain('deposit_alternative');
  });

  it('should return mock quote when not configured', async () => {
    const quote = await provider.getQuote(mockQuoteRequest);

    expect(quote.quoteId).toMatch(/^quote_/);
    expect(quote.provider).toBe('leaselock');
    expect(quote.productType).toBe('deposit_alternative');
    expect(quote.status).toBe('success');
    expect(quote.premium).toBeGreaterThan(0);
    expect(quote.coverageAmount).toBeGreaterThan(0);
    expect(quote.commissionRate).toBeGreaterThan(0);
    expect(quote.validUntil).toBeInstanceOf(Date);
    expect(quote.providerQuoteId).toBeDefined();
  });

  it('should return mock policy on bind', async () => {
    const policy = await provider.bind(mockBindRequest);

    expect(policy.policyId).toMatch(/^pol_/);
    expect(policy.provider).toBe('leaselock');
    expect(policy.status).toBe('active');
    expect(policy.policyNumber).toMatch(/^LL-/);
    expect(policy.effectiveDate).toBeInstanceOf(Date);
    expect(policy.expirationDate).toBeInstanceOf(Date);
    expect(policy.premium).toBeGreaterThan(0);
    expect(policy.commissionAmount).toBeGreaterThan(0);
  });

  it('should cancel policy successfully', async () => {
    const result = await provider.cancel({
      policyId: 'pol_123',
      provider: 'leaselock',
      providerPolicyId: 'll_pol_123',
      reason: 'Tenant moved out',
      idempotencyKey: 'cancel_123',
    });

    expect(result.success).toBe(true);
    expect(result.policyId).toBe('pol_123');
    expect(result.cancelledAt).toBeInstanceOf(Date);
  });

  it('should return renewal quote', async () => {
    const quote = await provider.renew({
      policyId: 'pol_123',
      provider: 'leaselock',
      providerPolicyId: 'll_pol_123',
      newTerm: 12,
      idempotencyKey: 'renew_123',
    });

    expect(quote.status).toBe('success');
    expect(quote.premium).toBeGreaterThan(0);
  });
});

describe('Rhino Provider', () => {
  let provider: RhinoProvider;

  beforeEach(() => {
    provider = new RhinoProvider({ apiKey: '', apiUrl: '' });
  });

  it('should have correct provider ID', () => {
    expect(provider.providerId).toBe('rhino');
  });

  it('should support deposit_alternative and guarantor', () => {
    expect(provider.supportedProducts).toContain('deposit_alternative');
    expect(provider.supportedProducts).toContain('guarantor');
  });

  it('should return mock quote for deposit alternative', async () => {
    const quote = await provider.getQuote(mockQuoteRequest);

    expect(quote.provider).toBe('rhino');
    expect(quote.status).toBe('success');
    expect(quote.premium).toBeGreaterThan(0);
  });

  it('should return mock quote for guarantor product', async () => {
    const guarantorRequest = {
      ...mockQuoteRequest,
      productType: 'guarantor' as const,
      provider: 'rhino' as const,
    };

    const quote = await provider.getQuote(guarantorRequest);

    expect(quote.productType).toBe('guarantor');
    expect(quote.premiumFrequency).toBe('one_time');
    expect(quote.coverageAmount).toBe(mockQuoteRequest.propertyInfo.monthlyRent * 12);
  });
});

describe('Jetty Provider', () => {
  let provider: JettyProvider;

  beforeEach(() => {
    provider = new JettyProvider({ apiKey: '', apiUrl: '' });
  });

  it('should have correct provider ID', () => {
    expect(provider.providerId).toBe('jetty');
  });

  it('should support deposit_alternative and renters_insurance', () => {
    expect(provider.supportedProducts).toContain('deposit_alternative');
    expect(provider.supportedProducts).toContain('renters_insurance');
  });

  it('should return mock quote', async () => {
    const quote = await provider.getQuote(mockQuoteRequest);

    expect(quote.provider).toBe('jetty');
    expect(quote.status).toBe('success');
  });
});

describe('Lemonade Provider', () => {
  let provider: LemonadeProvider;

  beforeEach(() => {
    provider = new LemonadeProvider({ apiKey: '', apiUrl: '' });
  });

  it('should have correct provider ID', () => {
    expect(provider.providerId).toBe('lemonade');
  });

  it('should only support renters_insurance', () => {
    expect(provider.supportedProducts).toEqual(['renters_insurance']);
  });

  it('should return insurance quote with deductible', async () => {
    const insuranceRequest = {
      ...mockQuoteRequest,
      productType: 'renters_insurance' as const,
      provider: 'lemonade' as const,
      coverageAmount: 30000,
    };

    const quote = await provider.getQuote(insuranceRequest);

    expect(quote.provider).toBe('lemonade');
    expect(quote.productType).toBe('renters_insurance');
    expect(quote.deductible).toBeDefined();
    expect(quote.coverageAmount).toBe(30000);
  });
});

// =============================================================================
// Provider Registry Tests
// =============================================================================

describe('Provider Registry', () => {
  beforeEach(() => {
    resetProviderRegistry();
  });

  it('should initialize with default providers', () => {
    const registry = new ProviderRegistry();

    expect(registry.getProvider('leaselock')).toBeDefined();
    expect(registry.getProvider('rhino')).toBeDefined();
    expect(registry.getProvider('jetty')).toBeDefined();
    expect(registry.getProvider('lemonade')).toBeDefined();
  });

  it('should get providers for product type', () => {
    const registry = new ProviderRegistry();

    const depositProviders = registry.getProvidersForProduct('deposit_alternative');
    expect(depositProviders.length).toBeGreaterThan(0);

    const insuranceProviders = registry.getProvidersForProduct('renters_insurance');
    expect(insuranceProviders.length).toBeGreaterThan(0);
  });

  it('should get provider IDs for product type', () => {
    const registry = new ProviderRegistry();

    const depositProviderIds = registry.getProviderIdsForProduct('deposit_alternative');
    expect(depositProviderIds).toContain('leaselock');
    expect(depositProviderIds).toContain('rhino');
    expect(depositProviderIds).toContain('jetty');
  });

  it('should throw for unknown provider', () => {
    const registry = new ProviderRegistry();

    expect(() => registry.getProviderOrThrow('unknown' as any)).toThrow(ProviderUnavailableError);
  });

  it('should get multi-provider quotes', async () => {
    const registry = new ProviderRegistry();

    const quotes = await registry.getMultiProviderQuotes(mockQuoteRequest);

    expect(quotes.length).toBeGreaterThan(0);
    expect(quotes[0].quote).not.toBeNull();
    expect(quotes[0].responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should get best quote (lowest premium)', async () => {
    const registry = new ProviderRegistry();

    const bestQuote = await registry.getBestQuote(mockQuoteRequest);

    expect(bestQuote).not.toBeNull();
    expect(bestQuote?.premium).toBeGreaterThan(0);
  });

  it('should get all available product types', () => {
    const registry = new ProviderRegistry();

    const productTypes = registry.getAvailableProductTypes();

    expect(productTypes).toContain('deposit_alternative');
    expect(productTypes).toContain('renters_insurance');
    expect(productTypes).toContain('guarantor');
  });

  it('should use singleton pattern', () => {
    const registry1 = getProviderRegistry();
    const registry2 = getProviderRegistry();

    expect(registry1).toBe(registry2);
  });
});

// =============================================================================
// Contract Lifecycle Tests
// =============================================================================

describe('Contract Lifecycle', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    resetProviderRegistry();
    registry = new ProviderRegistry();
  });

  it('should complete full contract lifecycle: Quote -> Bind -> Cancel', async () => {
    const provider = registry.getProviderOrThrow('leaselock');

    // 1. Get Quote
    const quote = await provider.getQuote(mockQuoteRequest);
    expect(quote.status).toBe('success');
    expect(quote.quoteId).toBeDefined();
    expect(quote.providerQuoteId).toBeDefined();

    // 2. Bind Quote
    const bindRequest: BindRequest = {
      quoteId: quote.quoteId,
      provider: 'leaselock',
      providerQuoteId: quote.providerQuoteId,
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      idempotencyKey: `bind_${Date.now()}`,
    };

    const policy = await provider.bind(bindRequest);
    expect(policy.status).toBe('active');
    expect(policy.policyNumber).toBeDefined();
    expect(policy.providerPolicyId).toBeDefined();

    // 3. Cancel Policy
    const cancelResult = await provider.cancel({
      policyId: policy.policyId,
      provider: 'leaselock',
      providerPolicyId: policy.providerPolicyId,
      reason: 'Tenant moved out early',
      idempotencyKey: `cancel_${Date.now()}`,
    });

    expect(cancelResult.success).toBe(true);
  });

  it('should complete lifecycle with renewal', async () => {
    const provider = registry.getProviderOrThrow('rhino');

    // 1. Get Quote
    const quote = await provider.getQuote(mockQuoteRequest);

    // 2. Bind
    const policy = await provider.bind({
      quoteId: quote.quoteId,
      provider: 'rhino',
      providerQuoteId: quote.providerQuoteId,
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      idempotencyKey: `bind_${Date.now()}`,
    });

    // 3. Renew
    const renewalQuote = await provider.renew({
      policyId: policy.policyId,
      provider: 'rhino',
      providerPolicyId: policy.providerPolicyId,
      newTerm: 12,
      idempotencyKey: `renew_${Date.now()}`,
    });

    expect(renewalQuote.status).toBe('success');
    expect(renewalQuote.premium).toBeGreaterThan(0);
  });
});

// =============================================================================
// Commission Calculation Tests
// =============================================================================

describe('Commission Calculations', () => {
  it('should calculate commission correctly', async () => {
    const provider = new LeaseLockProvider({ apiKey: '', apiUrl: '' });
    const quote = await provider.getQuote(mockQuoteRequest);

    // Commission should be commission rate * premium
    expect(quote.commissionAmount).toBe(quote.premium! * quote.commissionRate!);
  });

  it('should include commission in policy artifact', async () => {
    const provider = new LeaseLockProvider({ apiKey: '', apiUrl: '' });

    const policy = await provider.bind({
      quoteId: 'quote_test',
      provider: 'leaselock',
      providerQuoteId: 'll_test',
      termsAccepted: true,
      termsAcceptedAt: new Date(),
      idempotencyKey: 'bind_commission_test',
    });

    expect(policy.commissionRate).toBeGreaterThan(0);
    expect(policy.commissionAmount).toBeGreaterThan(0);
    expect(policy.commissionAmount).toBe(policy.premium * policy.commissionRate);
  });
});
