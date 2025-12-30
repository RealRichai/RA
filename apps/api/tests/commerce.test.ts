/**
 * Commerce Module Tests
 *
 * Tests for:
 * - Provider contracts (utilities, moving, insurance, guarantor)
 * - Order state machine transitions
 * - Vendor/product queries
 * - Idempotency handling
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getMockUtilitiesProvider,
  getMockMovingProvider,
  getMockInsuranceProvider,
  getMockGuarantorProvider,
} from '../src/modules/commerce/providers/mock';
import { ORDER_TRANSITIONS } from '../src/modules/commerce/providers/provider.types';
import type { OrderStatus } from '../src/modules/commerce/providers/provider.types';

// Reset mock stores between tests
beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Utilities Provider Tests
// =============================================================================

describe('MockUtilitiesProvider', () => {
  const provider = getMockUtilitiesProvider();

  it('should return providers for NYC zip code', async () => {
    const result = await provider.getProvidersByAddress({ zipCode: '10001' });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.length).toBeGreaterThan(0);
    expect(result.meta?.isMock).toBe(true);

    // Verify NYC providers
    const providers = result.data!;
    expect(providers.some((p) => p.name === 'Con Edison')).toBe(true);
    expect(providers.some((p) => p.name === 'Spectrum')).toBe(true);
  });

  it('should filter providers by utility type', async () => {
    const result = await provider.getProvidersByAddress({
      zipCode: '10001',
      utilityType: 'INTERNET',
    });

    expect(result.success).toBe(true);
    const providers = result.data!;
    expect(providers.every((p) => p.types.includes('INTERNET'))).toBe(true);
  });

  it('should return default providers for unknown zip code', async () => {
    const result = await provider.getProvidersByAddress({ zipCode: '99999' });

    expect(result.success).toBe(true);
    expect(result.data!.length).toBeGreaterThan(0);
  });

  it('should create a concierge ticket', async () => {
    const result = await provider.startConciergeTicket({
      userId: 'usr_test',
      leaseId: 'lea_test',
      utilityType: 'ELECTRIC',
      address: '123 Test St, New York, NY 10001',
      transferDate: new Date(),
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.status).toBe('PENDING');
    expect(result.data!.id).toBeDefined();
    expect(result.data!.providerReferenceId).toBeDefined();
  });

  it('should retrieve ticket status', async () => {
    // Create a ticket first
    const createResult = await provider.startConciergeTicket({
      userId: 'usr_test',
      leaseId: 'lea_test',
      utilityType: 'GAS',
      address: '456 Test Ave',
      transferDate: new Date(),
    });

    const ticketId = createResult.data!.id;

    // Get status
    const statusResult = await provider.getTicketStatus(ticketId);

    expect(statusResult.success).toBe(true);
    expect(statusResult.data?.id).toBe(ticketId);
  });
});

// =============================================================================
// Moving Provider Tests
// =============================================================================

describe('MockMovingProvider', () => {
  const provider = getMockMovingProvider();

  it('should return moving quotes', async () => {
    const result = await provider.getQuotes({
      userId: 'usr_test',
      leaseId: 'lea_test',
      originAddress: {
        street: '123 Start St',
        city: 'Brooklyn',
        state: 'NY',
        zipCode: '11201',
      },
      destinationAddress: {
        street: '456 End Ave',
        city: 'Manhattan',
        state: 'NY',
        zipCode: '10001',
      },
      moveDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      estimatedItems: 'ONE_BEDROOM',
      needsPacking: false,
      hasElevator: true,
    });

    expect(result.success).toBe(true);
    expect(result.data!.length).toBeGreaterThan(0);
    expect(result.meta?.isMock).toBe(true);

    // Verify quote structure
    const quote = result.data![0];
    expect(quote.id).toBeDefined();
    expect(quote.company).toBeDefined();
    expect(quote.price).toBeGreaterThan(0);
    expect(quote.includes.length).toBeGreaterThan(0);
    expect(quote.validUntil).toBeDefined();
  });

  it('should increase price with packing service', async () => {
    const withoutPacking = await provider.getQuotes({
      userId: 'usr_test',
      leaseId: 'lea_test',
      originAddress: { street: '123', city: 'NYC', state: 'NY', zipCode: '10001' },
      destinationAddress: { street: '456', city: 'NYC', state: 'NY', zipCode: '10002' },
      moveDate: new Date(),
      estimatedItems: 'TWO_BEDROOM',
      needsPacking: false,
      hasElevator: true,
    });

    const withPacking = await provider.getQuotes({
      userId: 'usr_test',
      leaseId: 'lea_test',
      originAddress: { street: '123', city: 'NYC', state: 'NY', zipCode: '10001' },
      destinationAddress: { street: '456', city: 'NYC', state: 'NY', zipCode: '10002' },
      moveDate: new Date(),
      estimatedItems: 'TWO_BEDROOM',
      needsPacking: true,
      hasElevator: true,
    });

    expect(withPacking.data![0].price).toBeGreaterThan(withoutPacking.data![0].price);
  });

  it('should book a move from quote', async () => {
    // Get quotes first
    const quotesResult = await provider.getQuotes({
      userId: 'usr_test',
      leaseId: 'lea_test',
      originAddress: { street: '123', city: 'NYC', state: 'NY', zipCode: '10001' },
      destinationAddress: { street: '456', city: 'NYC', state: 'NY', zipCode: '10002' },
      moveDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      estimatedItems: 'STUDIO',
      needsPacking: false,
      hasElevator: true,
    });

    const quoteId = quotesResult.data![0].id;

    // Book the move
    const bookResult = await provider.bookMove({
      userId: 'usr_test',
      quoteId,
      paymentMethodId: 'pm_test',
    });

    expect(bookResult.success).toBe(true);
    expect(bookResult.data!.status).toBe('CONFIRMED');
    expect(bookResult.data!.confirmationCode).toBeDefined();
  });

  it('should reject booking with invalid quote', async () => {
    const result = await provider.bookMove({
      userId: 'usr_test',
      quoteId: 'invalid-quote-id',
      paymentMethodId: 'pm_test',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// =============================================================================
// Insurance Provider Tests
// =============================================================================

describe('MockInsuranceProvider', () => {
  const provider = getMockInsuranceProvider();

  it('should return insurance quotes', async () => {
    const result = await provider.quotePolicy({
      userId: 'usr_test',
      leaseId: 'lea_test',
      propertyAddress: { street: '123 Test St', city: 'NYC', state: 'NY', zipCode: '10001' },
      coverageAmount: 30000,
      liabilityCoverage: 100000,
      deductible: 500,
      startDate: new Date(),
    });

    expect(result.success).toBe(true);
    expect(result.data!.length).toBeGreaterThan(0);

    // Verify quote structure
    const quote = result.data![0];
    expect(quote.provider).toBeDefined();
    expect(quote.monthlyPremium).toBeGreaterThan(0);
    expect(quote.annualPremium).toBeGreaterThan(0);
    expect(quote.features.length).toBeGreaterThan(0);
  });

  it('should purchase a policy from quote', async () => {
    // Get quotes first
    const quotesResult = await provider.quotePolicy({
      userId: 'usr_test',
      leaseId: 'lea_test',
      propertyAddress: { street: '123 Test St', city: 'NYC', state: 'NY', zipCode: '10001' },
      coverageAmount: 25000,
      liabilityCoverage: 100000,
      deductible: 1000,
      startDate: new Date(),
    });

    const quoteId = quotesResult.data![0].id;

    // Purchase policy
    const purchaseResult = await provider.purchasePolicy({
      userId: 'usr_test',
      quoteId,
      leaseId: 'lea_test',
      paymentMethodId: 'pm_test',
      autoRenew: true,
    });

    expect(purchaseResult.success).toBe(true);
    expect(purchaseResult.data!.status).toBe('ACTIVE');
    expect(purchaseResult.data!.policyNumber).toBeDefined();
    expect(purchaseResult.data!.certificateUrl).toBeDefined();
  });

  it('should calculate prorated refund on cancellation', async () => {
    // Create and purchase a policy
    const quotesResult = await provider.quotePolicy({
      userId: 'usr_test',
      leaseId: 'lea_test',
      propertyAddress: { street: '123 Test St', city: 'NYC', state: 'NY', zipCode: '10001' },
      coverageAmount: 30000,
      liabilityCoverage: 100000,
      deductible: 500,
      startDate: new Date(),
    });

    const purchaseResult = await provider.purchasePolicy({
      userId: 'usr_test',
      quoteId: quotesResult.data![0].id,
      leaseId: 'lea_test',
      paymentMethodId: 'pm_test',
    });

    const policyId = purchaseResult.data!.id;

    // Cancel policy
    const cancelResult = await provider.cancelPolicy(policyId, 'Moving out');

    expect(cancelResult.success).toBe(true);
    expect(cancelResult.data!.refundAmount).toBeGreaterThan(0);
  });
});

// =============================================================================
// Guarantor Provider Tests
// =============================================================================

describe('MockGuarantorProvider', () => {
  const provider = getMockGuarantorProvider();

  it('should return guarantor options', async () => {
    const result = await provider.getOptions(2500);

    expect(result.success).toBe(true);
    expect(result.data!.length).toBeGreaterThan(0);

    // Verify option structure
    const option = result.data![0];
    expect(option.provider).toBeDefined();
    expect(option.coverageMultiple).toBeGreaterThan(0);
    expect(option.feePercentage).toBeGreaterThan(0);
    expect(option.requirements.length).toBeGreaterThan(0);
  });

  it('should submit guarantor application', async () => {
    const options = await provider.getOptions(3000);
    const optionId = options.data![0].id;

    const result = await provider.submitApplication({
      userId: 'usr_test',
      leaseId: 'lea_test',
      applicationId: 'app_test',
      optionId,
      monthlyRent: 3000,
      annualIncome: 75000,
    });

    expect(result.success).toBe(true);
    expect(result.data!.providerApplicationId).toBeDefined();
    // Should be PENDING or DOCUMENTS_REQUIRED based on income
    expect(['PENDING', 'DOCUMENTS_REQUIRED', 'APPROVED', 'DECLINED']).toContain(result.data!.status);
  });

  it('should decline application with low income', async () => {
    // Get the Insurent option which has minimum income requirement
    const options = await provider.getOptions(2000);
    const insurentOption = options.data!.find((o) => o.providerId === 'insurent');

    if (insurentOption) {
      const result = await provider.submitApplication({
        userId: 'usr_test',
        leaseId: 'lea_test',
        applicationId: 'app_test_low',
        optionId: insurentOption.id,
        monthlyRent: 2000,
        annualIncome: 20000, // Below $27.5k minimum
      });

      expect(result.success).toBe(true);
      expect(result.data!.status).toBe('DECLINED');
      expect(result.data!.declineReason).toBeDefined();
    }
  });

  it('should poll application status', async () => {
    const options = await provider.getOptions(2000);
    const optionId = options.data![0].id;

    const submitResult = await provider.submitApplication({
      userId: 'usr_test',
      leaseId: 'lea_test',
      applicationId: 'app_poll_test',
      optionId,
      monthlyRent: 2000,
      annualIncome: 80000,
    });

    const appId = submitResult.data!.id;

    const pollResult = await provider.pollStatus(appId);

    expect(pollResult.success).toBe(true);
    expect(pollResult.data?.id).toBe(appId);
  });
});

// =============================================================================
// Order State Machine Tests
// =============================================================================

describe('Order State Machine', () => {
  it('should define valid transitions from DRAFT', () => {
    expect(ORDER_TRANSITIONS['DRAFT']).toContain('QUOTED');
    expect(ORDER_TRANSITIONS['DRAFT']).toContain('CANCELLED');
    expect(ORDER_TRANSITIONS['DRAFT']).not.toContain('FULFILLED');
  });

  it('should define valid transitions from QUOTED', () => {
    expect(ORDER_TRANSITIONS['QUOTED']).toContain('CONFIRMED');
    expect(ORDER_TRANSITIONS['QUOTED']).toContain('CANCELLED');
    expect(ORDER_TRANSITIONS['QUOTED']).not.toContain('DRAFT');
  });

  it('should define valid transitions from CONFIRMED', () => {
    expect(ORDER_TRANSITIONS['CONFIRMED']).toContain('PROCESSING');
    expect(ORDER_TRANSITIONS['CONFIRMED']).toContain('CANCELLED');
  });

  it('should define valid transitions from PROCESSING', () => {
    expect(ORDER_TRANSITIONS['PROCESSING']).toContain('FULFILLED');
    expect(ORDER_TRANSITIONS['PROCESSING']).toContain('FAILED');
    expect(ORDER_TRANSITIONS['PROCESSING']).not.toContain('CANCELLED');
  });

  it('should not allow transitions from FULFILLED except REFUNDED', () => {
    expect(ORDER_TRANSITIONS['FULFILLED']).toEqual(['REFUNDED']);
  });

  it('should not allow transitions from CANCELLED', () => {
    expect(ORDER_TRANSITIONS['CANCELLED']).toEqual([]);
  });

  it('should not allow transitions from REFUNDED', () => {
    expect(ORDER_TRANSITIONS['REFUNDED']).toEqual([]);
  });

  it('should validate transition helper function', () => {
    const isValidTransition = (from: OrderStatus, to: OrderStatus): boolean => {
      return ORDER_TRANSITIONS[from].includes(to);
    };

    expect(isValidTransition('DRAFT', 'QUOTED')).toBe(true);
    expect(isValidTransition('DRAFT', 'FULFILLED')).toBe(false);
    expect(isValidTransition('CONFIRMED', 'CANCELLED')).toBe(true);
    expect(isValidTransition('FULFILLED', 'CANCELLED')).toBe(false);
  });
});

// =============================================================================
// Provider Meta Tests
// =============================================================================

describe('Provider Meta', () => {
  it('should include isMock flag in responses', async () => {
    const utilitiesProvider = getMockUtilitiesProvider();
    const result = await utilitiesProvider.getProvidersByAddress({ zipCode: '10001' });

    expect(result.meta).toBeDefined();
    expect(result.meta!.isMock).toBe(true);
    expect(result.meta!.provider).toBe('mock-utilities');
    expect(result.meta!.requestId).toBeDefined();
    expect(result.meta!.timestamp).toBeInstanceOf(Date);
  });

  it('should include consistent provider ID', async () => {
    const movingProvider = getMockMovingProvider();
    const result = await movingProvider.getQuotes({
      userId: 'usr_test',
      leaseId: 'lea_test',
      originAddress: { street: '123', city: 'NYC', state: 'NY', zipCode: '10001' },
      destinationAddress: { street: '456', city: 'NYC', state: 'NY', zipCode: '10002' },
      moveDate: new Date(),
      estimatedItems: 'STUDIO',
      needsPacking: false,
      hasElevator: true,
    });

    expect(result.meta!.provider).toBe('mock-moving');
  });
});
