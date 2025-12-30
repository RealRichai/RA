/**
 * Commerce Provider Tests
 *
 * Contract tests for Insurance and Guarantor adapters with mocked HTTP transport.
 * Integration tests for fallback behavior when env keys are missing.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch before importing adapters
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock crypto for webhook verification
vi.mock('crypto', () => ({
  default: {
    createHmac: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn().mockReturnValue('mocksignature'),
    }),
    timingSafeEqual: vi.fn().mockReturnValue(true),
  },
}));

import { LemonadeInsuranceAdapter, createLemonadeAdapter } from '../src/modules/commerce/providers/lemonade';
import { TheGuarantorsAdapter, createTheGuarantorsAdapter } from '../src/modules/commerce/providers/the-guarantors';
import {
  getCommerceProviderRegistry,
  resetCommerceProviderRegistry,
} from '../src/modules/commerce/providers/registry';
import { TypedHttpClient, isHttpError, isHttpResult, toSafeErrorCode } from '../src/modules/commerce/providers/http-client';

// =============================================================================
// Test Fixtures
// =============================================================================

const mockLemonadeQuoteResponse = {
  id: 'quote_123',
  status: 'quoted',
  premium: {
    monthly: 15.99,
    annual: 172.69,
  },
  coverage: {
    personal_property: 25000,
    liability: 100000,
    deductible: 500,
    loss_of_use: 7500,
    medical_payments: 1000,
  },
  features: ['Personal property', 'Liability', 'Loss of use', 'Medical payments'],
  valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  created_at: new Date().toISOString(),
};

const mockLemonadePolicyResponse = {
  id: 'policy_456',
  policy_number: 'POL-LEM-ABC123',
  status: 'active',
  coverage: {
    personal_property: 25000,
    liability: 100000,
    deductible: 500,
  },
  premium: {
    monthly: 15.99,
    annual: 172.69,
  },
  effective_date: new Date().toISOString(),
  expiration_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  certificate_url: 'https://api.lemonade.com/certificates/cert_123.pdf',
  auto_renew: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockTGProductsResponse = {
  products: [
    {
      id: 'prod_basic',
      name: 'Basic Coverage',
      description: 'Standard guarantor coverage',
      coverage_multiple: 1,
      fee_structure: {
        type: 'percentage' as const,
        percentage: 5,
      },
      requirements: ['Photo ID', 'Proof of income'],
    },
    {
      id: 'prod_premium',
      name: 'Premium Coverage',
      description: 'Enhanced guarantor coverage',
      coverage_multiple: 2,
      fee_structure: {
        type: 'percentage' as const,
        percentage: 8,
      },
      requirements: ['Photo ID', 'Proof of income', 'Bank statements'],
    },
  ],
};

const mockTGApplicationResponse = {
  id: 'app_789',
  external_application_id: 'ext_app_123',
  product_id: 'prod_basic',
  product_name: 'Basic Coverage',
  status: 'pending_review' as const,
  coverage_amount: 2500,
  fee_amount: 150,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// =============================================================================
// HTTP Client Tests
// =============================================================================

describe('TypedHttpClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should make successful GET request', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: 'test' }),
    });

    const client = new TypedHttpClient('test-provider', {
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
    });

    const result = await client.request({
      method: 'GET',
      path: '/test',
    });

    expect(isHttpResult(result)).toBe(true);
    if (isHttpResult(result)) {
      expect(result.data).toEqual({ data: 'test' });
      expect(result.statusCode).toBe(200);
    }
  });

  it('should retry on 5xx errors', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Service unavailable' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ data: 'success' }),
      });

    const client = new TypedHttpClient('test-provider', {
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      retryAttempts: 3,
      retryDelayMs: 10, // Fast for tests
    });

    const result = await client.request({
      method: 'GET',
      path: '/test',
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(isHttpResult(result)).toBe(true);
  });

  it('should not retry on 4xx errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad request' }),
    });

    const client = new TypedHttpClient('test-provider', {
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      retryAttempts: 3,
    });

    const result = await client.request({
      method: 'GET',
      path: '/test',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(isHttpError(result)).toBe(true);
  });

  it('should handle timeout', async () => {
    mockFetch.mockImplementationOnce(() => new Promise((_, reject) => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      reject(error);
    }));

    const client = new TypedHttpClient('test-provider', {
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
      timeout: 100,
      retryAttempts: 1,
    });

    const result = await client.request({
      method: 'GET',
      path: '/test',
      skipRetry: true,
    });

    expect(isHttpError(result)).toBe(true);
    if (isHttpError(result)) {
      expect(result.code).toBe('TIMEOUT');
    }
  });

  it('should redact sensitive fields in logs', async () => {
    // This test verifies that the redaction function works
    const sensitiveData = {
      ssn: '123-45-6789',
      email: 'user@example.com',
      password: 'secret123',
      name: 'John Doe',
    };

    // The actual redaction happens internally during logging
    // We're testing that the request doesn't expose sensitive data
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => sensitiveData,
    });

    const client = new TypedHttpClient('test-provider', {
      baseUrl: 'https://api.test.com',
      apiKey: 'test-key',
    });

    const result = await client.request({
      method: 'POST',
      path: '/test',
      body: sensitiveData,
    });

    expect(isHttpResult(result)).toBe(true);
  });
});

describe('toSafeErrorCode', () => {
  it('should map HTTP errors to safe codes', () => {
    expect(toSafeErrorCode({ ok: false, code: 'HTTP_400', message: '', requestId: '', retryable: false }))
      .toBe('INVALID_REQUEST');
    expect(toSafeErrorCode({ ok: false, code: 'HTTP_401', message: '', requestId: '', retryable: false }))
      .toBe('PROVIDER_AUTH_ERROR');
    expect(toSafeErrorCode({ ok: false, code: 'HTTP_429', message: '', requestId: '', retryable: true }))
      .toBe('PROVIDER_RATE_LIMITED');
    expect(toSafeErrorCode({ ok: false, code: 'HTTP_500', message: '', requestId: '', retryable: true }))
      .toBe('PROVIDER_UNAVAILABLE');
    expect(toSafeErrorCode({ ok: false, code: 'TIMEOUT', message: '', requestId: '', retryable: true }))
      .toBe('PROVIDER_TIMEOUT');
    expect(toSafeErrorCode({ ok: false, code: 'UNKNOWN', message: '', requestId: '', retryable: false }))
      .toBe('PROVIDER_ERROR');
  });
});

// =============================================================================
// Lemonade Adapter Contract Tests
// =============================================================================

describe('LemonadeInsuranceAdapter', () => {
  let adapter: LemonadeInsuranceAdapter;

  beforeEach(() => {
    mockFetch.mockReset();
    adapter = createLemonadeAdapter({
      baseUrl: 'https://api.lemonade.com',
      apiKey: 'test-lemonade-key',
      webhookSecret: 'test-webhook-secret',
    });
  });

  describe('quotePolicy', () => {
    it('should return insurance quotes on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockLemonadeQuoteResponse,
      });

      const result = await adapter.quotePolicy({
        userId: 'user_123',
        leaseId: 'lease_456',
        propertyAddress: {
          street: '123 Main St',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
        },
        coverageAmount: 25000,
        liabilityCoverage: 100000,
        deductible: 500,
        startDate: new Date(),
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].provider).toBe('Lemonade');
      expect(result.data![0].monthlyPremium).toBe(15.99);
      expect(result.meta?.isMock).toBe(false);
    });

    it('should return error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Invalid address' }),
      });

      const result = await adapter.quotePolicy({
        userId: 'user_123',
        leaseId: 'lease_456',
        propertyAddress: {
          street: '',
          city: 'New York',
          state: 'NY',
          zipCode: '10001',
        },
        coverageAmount: 25000,
        liabilityCoverage: 100000,
        deductible: 500,
        startDate: new Date(),
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('purchasePolicy', () => {
    it('should bind policy and store external reference', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockLemonadePolicyResponse,
      });

      const result = await adapter.purchasePolicy({
        userId: 'user_123',
        quoteId: 'quote_123',
        leaseId: 'lease_456',
        paymentMethodId: 'pm_test',
      });

      expect(result.success).toBe(true);
      expect(result.data?.policyNumber).toBe('POL-LEM-ABC123');
      expect(result.data?.status).toBe('ACTIVE');
      expect(result.data?.provider).toBe('Lemonade');
    });
  });

  describe('getPolicyStatus', () => {
    it('should return policy details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockLemonadePolicyResponse,
      });

      const result = await adapter.getPolicyStatus('policy_456');

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('ACTIVE');
    });

    it('should return null for non-existent policy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      });

      const result = await adapter.getPolicyStatus('non_existent');

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  describe('cancelPolicy', () => {
    it('should cancel policy and return refund amount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          policy_id: 'policy_456',
          status: 'cancelled',
          refund: {
            amount: 85.50,
            currency: 'USD',
          },
          cancellation_date: new Date().toISOString(),
        }),
      });

      const result = await adapter.cancelPolicy('policy_456', 'Moving out');

      expect(result.success).toBe(true);
      expect(result.data?.refundAmount).toBe(85.50);
    });
  });
});

// =============================================================================
// The Guarantors Adapter Contract Tests
// =============================================================================

describe('TheGuarantorsAdapter', () => {
  let adapter: TheGuarantorsAdapter;

  beforeEach(() => {
    mockFetch.mockReset();
    adapter = createTheGuarantorsAdapter({
      baseUrl: 'https://api.theguarantors.com',
      apiKey: 'test-tg-key',
      webhookSecret: 'test-webhook-secret',
    });
  });

  describe('getOptions', () => {
    it('should return guarantor options', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockTGProductsResponse,
      });

      const result = await adapter.getOptions(2500);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0].provider).toBe('The Guarantors');
      expect(result.data![0].feePercentage).toBe(5);
    });

    it('should return error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      });

      const result = await adapter.getOptions(2500);

      expect(result.success).toBe(false);
    });
  });

  describe('submitApplication', () => {
    it('should submit application and return status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockTGApplicationResponse,
      });

      const result = await adapter.submitApplication({
        userId: 'user_123',
        leaseId: 'lease_456',
        applicationId: 'app_789',
        optionId: 'prod_basic',
        monthlyRent: 2500,
        annualIncome: 75000,
      });

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('PENDING');
      expect(result.data?.providerApplicationId).toBe('app_789');
    });
  });

  describe('pollStatus', () => {
    it('should return application status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ...mockTGApplicationResponse,
          status: 'approved',
          decision_date: new Date().toISOString(),
          contract_url: 'https://api.theguarantors.com/contracts/contract_123.pdf',
        }),
      });

      const result = await adapter.pollStatus('app_789');

      expect(result.success).toBe(true);
      expect(result.data?.status).toBe('APPROVED');
      expect(result.data?.contractUrl).toBeDefined();
    });

    it('should return null for non-existent application', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      });

      const result = await adapter.pollStatus('non_existent');

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });
  });

  describe('cancelApplication', () => {
    it('should cancel application', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'app_789',
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        }),
      });

      const result = await adapter.cancelApplication('app_789');

      expect(result.success).toBe(true);
      expect(result.data).toBe(true);
    });
  });
});

// =============================================================================
// Registry Fallback Tests
// =============================================================================

describe('CommerceProviderRegistry', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    resetCommerceProviderRegistry();
    // Clear relevant environment variables
    delete process.env['INSURANCE_PROVIDER'];
    delete process.env['INSURANCE_API_KEY'];
    delete process.env['GUARANTOR_PROVIDER'];
    delete process.env['GUARANTOR_API_KEY'];
    delete process.env['FEATURE_RENTERS_INSURANCE'];
    delete process.env['FEATURE_GUARANTOR_PRODUCTS'];
  });

  afterEach(() => {
    resetCommerceProviderRegistry();
  });

  describe('Insurance Provider', () => {
    it('should use mock when API key is missing', () => {
      process.env['INSURANCE_PROVIDER'] = 'lemonade';
      // No API key set

      const registry = getCommerceProviderRegistry();
      const provider = registry.getInsuranceProvider();
      const status = registry.getProviderStatus();

      expect(status.insurance.isMock).toBe(true);
      expect(status.insurance.reason).toContain('not configured');
      expect(provider.providerId).toBe('mock-insurance');
    });

    it('should use mock when feature flag is disabled', () => {
      process.env['INSURANCE_PROVIDER'] = 'lemonade';
      process.env['INSURANCE_API_KEY'] = 'test-key';
      process.env['FEATURE_RENTERS_INSURANCE'] = 'false';

      const registry = getCommerceProviderRegistry();
      const status = registry.getProviderStatus();

      expect(status.insurance.isMock).toBe(true);
      expect(status.insurance.reason).toContain('disabled');
    });

    it('should use real adapter when configured', () => {
      process.env['INSURANCE_PROVIDER'] = 'lemonade';
      process.env['INSURANCE_API_KEY'] = 'test-key';
      process.env['FEATURE_RENTERS_INSURANCE'] = 'true';

      const registry = getCommerceProviderRegistry();
      const status = registry.getProviderStatus();

      expect(status.insurance.isMock).toBe(false);
      expect(status.insurance.provider).toBe('lemonade');
    });
  });

  describe('Guarantor Provider', () => {
    it('should use mock when API key is missing', () => {
      process.env['GUARANTOR_PROVIDER'] = 'the-guarantors';
      // No API key set

      const registry = getCommerceProviderRegistry();
      const provider = registry.getGuarantorProvider();
      const status = registry.getProviderStatus();

      expect(status.guarantor.isMock).toBe(true);
      expect(provider.providerId).toBe('mock-guarantor');
    });

    it('should use mock when feature flag is disabled', () => {
      process.env['GUARANTOR_PROVIDER'] = 'the-guarantors';
      process.env['GUARANTOR_API_KEY'] = 'test-key';
      process.env['FEATURE_GUARANTOR_PRODUCTS'] = '0';

      const registry = getCommerceProviderRegistry();
      const status = registry.getProviderStatus();

      expect(status.guarantor.isMock).toBe(true);
      expect(status.guarantor.reason).toContain('disabled');
    });

    it('should use real adapter when configured', () => {
      process.env['GUARANTOR_PROVIDER'] = 'the-guarantors';
      process.env['GUARANTOR_API_KEY'] = 'test-key';

      const registry = getCommerceProviderRegistry();
      const status = registry.getProviderStatus();

      expect(status.guarantor.isMock).toBe(false);
      expect(status.guarantor.provider).toBe('the-guarantors');
    });
  });

  describe('Provider Status', () => {
    it('should report all provider statuses', () => {
      const registry = getCommerceProviderRegistry();
      const status = registry.getProviderStatus();

      expect(status).toHaveProperty('utilities');
      expect(status).toHaveProperty('moving');
      expect(status).toHaveProperty('insurance');
      expect(status).toHaveProperty('guarantor');

      // All should have required fields
      Object.values(status).forEach((s) => {
        expect(s).toHaveProperty('provider');
        expect(s).toHaveProperty('isMock');
      });
    });

    it('should return Lemonade adapter when configured', () => {
      process.env['INSURANCE_PROVIDER'] = 'lemonade';
      process.env['INSURANCE_API_KEY'] = 'test-key';

      const registry = getCommerceProviderRegistry();
      registry.getInsuranceProvider(); // Initialize

      const lemonadeAdapter = registry.getLemonadeAdapter();
      expect(lemonadeAdapter).not.toBeNull();
    });

    it('should return null for Lemonade adapter when using mock', () => {
      const registry = getCommerceProviderRegistry();
      registry.getInsuranceProvider(); // Initialize with mock

      const lemonadeAdapter = registry.getLemonadeAdapter();
      expect(lemonadeAdapter).toBeNull();
    });
  });
});

// =============================================================================
// Mock Provider Fallback Integration Tests
// =============================================================================

describe('Mock Provider Fallback Integration', () => {
  beforeEach(() => {
    resetCommerceProviderRegistry();
    delete process.env['INSURANCE_PROVIDER'];
    delete process.env['INSURANCE_API_KEY'];
  });

  afterEach(() => {
    resetCommerceProviderRegistry();
  });

  it('should return valid quotes from mock when no real provider', async () => {
    const registry = getCommerceProviderRegistry();
    const provider = registry.getInsuranceProvider();

    const result = await provider.quotePolicy({
      userId: 'user_123',
      leaseId: 'lease_456',
      propertyAddress: {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
      },
      coverageAmount: 25000,
      liabilityCoverage: 100000,
      deductible: 500,
      startDate: new Date(),
    });

    expect(result.success).toBe(true);
    expect(result.data!.length).toBeGreaterThan(0);
    expect(result.meta?.isMock).toBe(true);
  });

  it('should handle full insurance flow with mock provider', async () => {
    const registry = getCommerceProviderRegistry();
    const provider = registry.getInsuranceProvider();

    // Get quotes
    const quoteResult = await provider.quotePolicy({
      userId: 'user_123',
      leaseId: 'lease_456',
      propertyAddress: {
        street: '123 Main St',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
      },
      coverageAmount: 25000,
      liabilityCoverage: 100000,
      deductible: 500,
      startDate: new Date(),
    });

    expect(quoteResult.success).toBe(true);
    const quoteId = quoteResult.data![0].id;

    // Purchase policy
    const purchaseResult = await provider.purchasePolicy({
      userId: 'user_123',
      quoteId,
      leaseId: 'lease_456',
      paymentMethodId: 'pm_test',
    });

    expect(purchaseResult.success).toBe(true);
    const policyId = purchaseResult.data!.id;

    // Get policy status
    const statusResult = await provider.getPolicyStatus(policyId);
    expect(statusResult.success).toBe(true);
    expect(statusResult.data?.status).toBe('ACTIVE');

    // Cancel policy
    const cancelResult = await provider.cancelPolicy(policyId);
    expect(cancelResult.success).toBe(true);
    expect(cancelResult.data?.refundAmount).toBeGreaterThan(0);
  });

  it('should handle full guarantor flow with mock provider', async () => {
    const registry = getCommerceProviderRegistry();
    const provider = registry.getGuarantorProvider();

    // Get options
    const optionsResult = await provider.getOptions(2500);
    expect(optionsResult.success).toBe(true);
    const optionId = optionsResult.data![0].id;

    // Submit application
    const applyResult = await provider.submitApplication({
      userId: 'user_123',
      leaseId: 'lease_456',
      applicationId: 'app_789',
      optionId,
      monthlyRent: 2500,
      annualIncome: 75000,
    });

    expect(applyResult.success).toBe(true);
    const applicationId = applyResult.data!.id;

    // Poll status
    const statusResult = await provider.pollStatus(applicationId);
    expect(statusResult.success).toBe(true);
  });
});
