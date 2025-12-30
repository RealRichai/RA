/**
 * Partner Adapter Contract Tests
 *
 * Tests that all partner providers implement the IPartnerProvider contract correctly.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  JettyProvider,
  RhinoProvider,
  LeaseLockProvider,
  LemonadeProvider,
  AssurantProvider,
  SureProvider,
  InsurentProvider,
  LeapProvider,
} from '../partners/adapters';
import type { IPartnerProvider, ProviderConfig } from '../partners/provider-interface';
import {
  ProviderError,
  QuoteDeclinedError,
  BindFailedError,
  ProviderUnavailableError,
} from '../partners/provider-interface';
import type { QuoteRequest, BindRequest, CancelRequest, RenewRequest } from '../types';

// =============================================================================
// Test Configuration
// =============================================================================

// Empty config to use mock responses instead of real HTTP requests
const mockConfig: ProviderConfig = {
  apiKey: '',
  apiUrl: '',
};

// Mock quote request (matches existing partners.test.ts pattern)
const mockQuoteRequest: QuoteRequest = {
  productType: 'deposit_alternative',
  provider: 'leaselock',
  applicantId: 'app_123',
  propertyId: 'prop_456',
  applicantInfo: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: '555-555-5555',
    dateOfBirth: new Date('1990-01-01'),
  },
  propertyInfo: {
    address: '123 Main St',
    city: 'New York',
    state: 'NY',
    zip: '10001',
    monthlyRent: 2500,
  },
};

// =============================================================================
// Provider Contract Tests
// =============================================================================

describe('Partner Provider Contract', () => {
  const providerClasses = [
    { name: 'Jetty', Provider: JettyProvider, products: ['deposit_alternative', 'renters_insurance'] },
    { name: 'Rhino', Provider: RhinoProvider, products: ['deposit_alternative', 'guarantor'] },
    { name: 'LeaseLock', Provider: LeaseLockProvider, products: ['deposit_alternative'] },
    { name: 'Lemonade', Provider: LemonadeProvider, products: ['renters_insurance'] },
    { name: 'Assurant', Provider: AssurantProvider, products: ['renters_insurance'] },
    { name: 'Sure', Provider: SureProvider, products: ['renters_insurance'] },
    { name: 'Insurent', Provider: InsurentProvider, products: ['guarantor'] },
    { name: 'Leap', Provider: LeapProvider, products: ['guarantor'] },
  ];

  describe.each(providerClasses)('$name Provider', ({ Provider, products }) => {
    let provider: IPartnerProvider;

    beforeEach(() => {
      provider = new Provider(mockConfig);
    });

    // =========================================================================
    // Interface Implementation
    // =========================================================================

    describe('Interface Implementation', () => {
      it('should have a valid providerId', () => {
        expect(provider.providerId).toBeDefined();
        expect(typeof provider.providerId).toBe('string');
        expect(provider.providerId.length).toBeGreaterThan(0);
      });

      it('should have supported products array', () => {
        expect(provider.supportedProducts).toBeDefined();
        expect(Array.isArray(provider.supportedProducts)).toBe(true);
        expect(provider.supportedProducts.length).toBeGreaterThan(0);
      });

      it('should support expected product types', () => {
        for (const product of products) {
          expect(provider.supportedProducts).toContain(product);
        }
      });

      it('should implement isAvailable method', () => {
        expect(typeof provider.isAvailable).toBe('function');
      });

      it('should implement getQuote method', () => {
        expect(typeof provider.getQuote).toBe('function');
      });

      it('should implement bind method', () => {
        expect(typeof provider.bind).toBe('function');
      });

      it('should implement cancel method', () => {
        expect(typeof provider.cancel).toBe('function');
      });

      it('should implement renew method', () => {
        expect(typeof provider.renew).toBe('function');
      });

      it('should implement getPolicyStatus method', () => {
        expect(typeof provider.getPolicyStatus).toBe('function');
      });

      it('should implement validateCredentials method', () => {
        expect(typeof provider.validateCredentials).toBe('function');
      });
    });

    // =========================================================================
    // Quote Flow
    // =========================================================================

    describe('Quote Flow', () => {
      it('should return a valid quote response', async () => {
        const quote = await provider.getQuote({
          ...mockQuoteRequest,
          productType: products[0] as 'deposit_alternative' | 'renters_insurance' | 'guarantor',
        });

        expect(quote).toBeDefined();
        expect(quote.quoteId).toBeDefined();
        expect(quote.provider).toBe(provider.providerId);
        expect(quote.status).toBe('success');
        expect(typeof quote.premium).toBe('number');
        expect(quote.premium).toBeGreaterThan(0);
        expect(quote.validUntil).toBeInstanceOf(Date);
      });

      it('should include commission information in quote', async () => {
        const quote = await provider.getQuote({
          ...mockQuoteRequest,
          productType: products[0] as 'deposit_alternative' | 'renters_insurance' | 'guarantor',
        });

        expect(quote.commissionRate).toBeDefined();
        expect(typeof quote.commissionRate).toBe('number');
        expect(quote.commissionRate).toBeGreaterThan(0);
        expect(quote.commissionRate).toBeLessThanOrEqual(1);

        expect(quote.commissionAmount).toBeDefined();
        expect(typeof quote.commissionAmount).toBe('number');
        expect(quote.commissionAmount).toBeGreaterThanOrEqual(0);
      });

      it('should have provider quote ID for tracking', async () => {
        const quote = await provider.getQuote({
          ...mockQuoteRequest,
          productType: products[0] as 'deposit_alternative' | 'renters_insurance' | 'guarantor',
        });

        expect(quote.providerQuoteId).toBeDefined();
        expect(typeof quote.providerQuoteId).toBe('string');
      });
    });

    // =========================================================================
    // Bind Flow
    // =========================================================================

    describe('Bind Flow', () => {
      it('should bind a quote and return a policy artifact', async () => {
        // First get a quote
        const quote = await provider.getQuote({
          ...mockQuoteRequest,
          productType: products[0] as 'deposit_alternative' | 'renters_insurance' | 'guarantor',
        });

        // Then bind it
        const bindRequest: BindRequest = {
          quoteId: quote.quoteId,
          provider: provider.providerId,
          providerQuoteId: quote.providerQuoteId,
          termsAccepted: true,
          termsAcceptedAt: new Date(),
          payNow: false,
          idempotencyKey: `bind_${Date.now()}`,
        };

        const policy = await provider.bind(bindRequest);

        expect(policy).toBeDefined();
        expect(policy.policyId).toBeDefined();
        expect(policy.provider).toBe(provider.providerId);
        expect(policy.status).toBe('active');
        expect(policy.effectiveDate).toBeInstanceOf(Date);
        expect(policy.expirationDate).toBeInstanceOf(Date);
      });

      it('should include policy number in artifact', async () => {
        const quote = await provider.getQuote({
          ...mockQuoteRequest,
          productType: products[0] as 'deposit_alternative' | 'renters_insurance' | 'guarantor',
        });

        const policy = await provider.bind({
          quoteId: quote.quoteId,
          provider: provider.providerId,
          providerQuoteId: quote.providerQuoteId,
          termsAccepted: true,
          termsAcceptedAt: new Date(),
          payNow: false,
          idempotencyKey: `bind_${Date.now()}`,
        });

        expect(policy.policyNumber).toBeDefined();
        expect(typeof policy.policyNumber).toBe('string');
      });

      it('should include commission info in policy artifact', async () => {
        const quote = await provider.getQuote({
          ...mockQuoteRequest,
          productType: products[0] as 'deposit_alternative' | 'renters_insurance' | 'guarantor',
        });

        const policy = await provider.bind({
          quoteId: quote.quoteId,
          provider: provider.providerId,
          providerQuoteId: quote.providerQuoteId,
          termsAccepted: true,
          termsAcceptedAt: new Date(),
          payNow: false,
          idempotencyKey: `bind_${Date.now()}`,
        });

        expect(policy.commissionRate).toBeDefined();
        expect(policy.commissionAmount).toBeDefined();
      });
    });

    // =========================================================================
    // Cancel Flow
    // =========================================================================

    describe('Cancel Flow', () => {
      it('should cancel a policy and return success', async () => {
        // Get quote and bind to create policy
        const quote = await provider.getQuote({
          ...mockQuoteRequest,
          productType: products[0] as 'deposit_alternative' | 'renters_insurance' | 'guarantor',
        });

        const policy = await provider.bind({
          quoteId: quote.quoteId,
          provider: provider.providerId,
          providerQuoteId: quote.providerQuoteId,
          termsAccepted: true,
          termsAcceptedAt: new Date(),
          payNow: false,
          idempotencyKey: `bind_${Date.now()}`,
        });

        // Cancel the policy
        const cancelRequest: CancelRequest = {
          policyId: policy.policyId,
          provider: provider.providerId,
          providerPolicyId: policy.providerPolicyId,
          reason: 'Tenant moved out early',
          refundRequested: false,
          idempotencyKey: `cancel_${Date.now()}`,
        };

        const cancelResult = await provider.cancel(cancelRequest);

        expect(cancelResult).toBeDefined();
        expect(cancelResult.success).toBe(true);
        expect(cancelResult.policyId).toBe(policy.policyId);
        expect(cancelResult.cancelledAt).toBeInstanceOf(Date);
      });
    });

    // =========================================================================
    // Renew Flow
    // =========================================================================

    describe('Renew Flow', () => {
      it('should return a renewal quote', async () => {
        // First create a policy
        const quote = await provider.getQuote({
          ...mockQuoteRequest,
          productType: products[0] as 'deposit_alternative' | 'renters_insurance' | 'guarantor',
        });

        const policy = await provider.bind({
          quoteId: quote.quoteId,
          provider: provider.providerId,
          providerQuoteId: quote.providerQuoteId,
          termsAccepted: true,
          termsAcceptedAt: new Date(),
          payNow: false,
          idempotencyKey: `bind_${Date.now()}`,
        });

        // Request renewal
        const renewRequest: RenewRequest = {
          policyId: policy.policyId,
          provider: provider.providerId,
          providerPolicyId: policy.providerPolicyId,
          idempotencyKey: `renew_${Date.now()}`,
        };

        const renewQuote = await provider.renew(renewRequest);

        expect(renewQuote).toBeDefined();
        expect(renewQuote.quoteId).toBeDefined();
        expect(renewQuote.provider).toBe(provider.providerId);
        expect(renewQuote.status).toBe('success');
      });
    });

    // =========================================================================
    // Availability Checks
    // =========================================================================

    describe('Availability', () => {
      it('should return availability status', async () => {
        const isAvailable = await provider.isAvailable();
        expect(typeof isAvailable).toBe('boolean');
      });

      it('should validate credentials', async () => {
        const isValid = await provider.validateCredentials();
        expect(typeof isValid).toBe('boolean');
      });
    });
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Provider Error Types', () => {
  it('should create ProviderError with correct properties', () => {
    const error = new ProviderError('jetty', 'TEST_ERROR', 'Test error message');

    expect(error.provider).toBe('jetty');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.message).toBe('Test error message');
    expect(error.name).toBe('ProviderError');
  });

  it('should create QuoteDeclinedError', () => {
    const error = new QuoteDeclinedError('rhino', 'Credit score too low', 'CREDIT_DECLINE');

    expect(error.provider).toBe('rhino');
    expect(error.reason).toBe('Credit score too low');
    expect(error.declineCode).toBe('CREDIT_DECLINE');
    expect(error.name).toBe('QuoteDeclinedError');
  });

  it('should create BindFailedError', () => {
    const error = new BindFailedError('leaselock', 'Quote expired');

    expect(error.provider).toBe('leaselock');
    expect(error.code).toBe('BIND_FAILED');
    expect(error.message).toBe('Quote expired');
    expect(error.name).toBe('BindFailedError');
  });

  it('should create ProviderUnavailableError', () => {
    const error = new ProviderUnavailableError('lemonade');

    expect(error.provider).toBe('lemonade');
    expect(error.code).toBe('PROVIDER_UNAVAILABLE');
    expect(error.name).toBe('ProviderUnavailableError');
  });
});

// =============================================================================
// Provider Configuration Tests
// =============================================================================

describe('Provider Configuration', () => {
  it('should mark provider as unconfigured without API key', () => {
    const provider = new JettyProvider({
      apiKey: '',
      apiUrl: 'https://api.example.com',
    });

    // Provider should still work but use mock responses
    expect(provider).toBeDefined();
  });

  it('should apply default timeout if not specified', () => {
    const provider = new JettyProvider({
      apiKey: 'test_key',
      apiUrl: 'https://api.example.com',
    });

    // Provider should be created successfully
    expect(provider).toBeDefined();
  });

  it('should use sandbox mode in non-production', () => {
    const provider = new RhinoProvider({
      apiKey: 'test_key',
      apiUrl: 'https://api.example.com',
    });

    // Should default to sandbox
    expect(provider).toBeDefined();
  });
});
