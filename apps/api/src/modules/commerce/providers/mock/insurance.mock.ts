/**
 * Mock Insurance Provider
 *
 * Provides realistic mock quotes and policy management for renters insurance.
 */

import { generatePrefixedId } from '@realriches/utils';

import type {
  IInsuranceProvider,
  InsurancePolicy,
  InsurancePurchaseRequest,
  InsuranceQuote,
  InsuranceQuoteRequest,
  ProviderMeta,
  Result,
} from '../provider.types';
import { ok, err } from '../provider.types';

// Mock insurance providers
const INSURANCE_PROVIDERS = [
  {
    id: 'lemonade',
    name: 'Lemonade',
    rating: 4.9,
    baseRate: 0.5, // per $1000 coverage
    liabilityRate: 0.1, // per $1000 liability
    deductibleDiscount: 0.01, // per $100 deductible
    features: ['Personal property', 'Liability', 'Loss of use', 'Medical payments'],
  },
  {
    id: 'state-farm',
    name: 'State Farm',
    rating: 4.7,
    baseRate: 0.55,
    liabilityRate: 0.12,
    deductibleDiscount: 0.008,
    features: ['Personal property', 'Liability', 'Loss of use', 'Identity theft'],
  },
  {
    id: 'allstate',
    name: 'Allstate',
    rating: 4.6,
    baseRate: 0.52,
    liabilityRate: 0.11,
    deductibleDiscount: 0.009,
    features: ['Personal property', 'Liability', 'Loss of use', 'Water backup'],
  },
  {
    id: 'geico',
    name: 'GEICO',
    rating: 4.5,
    baseRate: 0.48,
    liabilityRate: 0.1,
    deductibleDiscount: 0.01,
    features: ['Personal property', 'Liability', 'Loss of use'],
  },
];

// In-memory stores
const quoteStore = new Map<string, InsuranceQuote & { request: InsuranceQuoteRequest }>();
const policyStore = new Map<string, InsurancePolicy>();

export class MockInsuranceProvider implements IInsuranceProvider {
  readonly providerId = 'mock-insurance';

  private getMeta(requestId?: string): ProviderMeta {
    return {
      provider: this.providerId,
      isMock: true,
      requestId: requestId || generatePrefixedId('req'),
      timestamp: new Date(),
    };
  }

  async quotePolicy(request: InsuranceQuoteRequest): Promise<Result<InsuranceQuote[]>> {
    const quotes: InsuranceQuote[] = INSURANCE_PROVIDERS.map((provider) => {
      // Calculate premium
      const coverageCost = (request.coverageAmount / 1000) * provider.baseRate;
      const liabilityCost = (request.liabilityCoverage / 1000) * provider.liabilityRate;
      const deductibleDiscount = (request.deductible / 100) * provider.deductibleDiscount * 12;

      // Pet surcharge
      const petSurcharge = request.pets?.length
        ? request.pets.length * 2
        : 0;

      // Valuable items surcharge
      const valuablesSurcharge = request.valuableItems?.length
        ? request.valuableItems.reduce((sum, item) => sum + item.value * 0.001, 0)
        : 0;

      const monthlyPremium = Math.max(
        10,
        Math.round((coverageCost + liabilityCost - deductibleDiscount + petSurcharge + valuablesSurcharge) * 100) / 100
      );
      const annualPremium = Math.round(monthlyPremium * 12 * 0.9 * 100) / 100; // 10% annual discount

      const quote: InsuranceQuote = {
        id: generatePrefixedId('ins'),
        provider: provider.name,
        providerId: provider.id,
        monthlyPremium,
        annualPremium,
        coverageAmount: request.coverageAmount,
        liabilityCoverage: request.liabilityCoverage,
        deductible: request.deductible,
        features: provider.features,
        rating: provider.rating,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      };

      // Store for later retrieval
      quoteStore.set(quote.id, { ...quote, request });

      return quote;
    });

    // Sort by monthly premium
    quotes.sort((a, b) => a.monthlyPremium - b.monthlyPremium);

    return ok(quotes, this.getMeta());
  }

  async purchasePolicy(request: InsurancePurchaseRequest): Promise<Result<InsurancePolicy>> {
    const storedQuote = quoteStore.get(request.quoteId);

    if (!storedQuote) {
      return err(new Error('Quote not found or expired'), this.getMeta());
    }

    if (storedQuote.validUntil < new Date()) {
      return err(new Error('Quote has expired'), this.getMeta());
    }

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year

    const policy: InsurancePolicy = {
      id: generatePrefixedId('rip'),
      provider: storedQuote.provider,
      policyNumber: `POL-${storedQuote.providerId.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
      status: 'ACTIVE',
      coverageAmount: storedQuote.coverageAmount,
      liabilityCoverage: storedQuote.liabilityCoverage,
      deductible: storedQuote.deductible,
      monthlyPremium: storedQuote.monthlyPremium,
      annualPremium: storedQuote.annualPremium,
      startDate,
      endDate,
      certificateUrl: `https://mock-insurance.example.com/certificates/${generatePrefixedId('cert')}.pdf`,
      autoRenew: request.autoRenew ?? true,
      createdAt: new Date(),
    };

    policyStore.set(policy.id, policy);

    return ok(policy, this.getMeta());
  }

  async getPolicyStatus(policyId: string): Promise<Result<InsurancePolicy | null>> {
    const policy = policyStore.get(policyId) || null;
    return ok(policy, this.getMeta());
  }

  async cancelPolicy(policyId: string, _reason?: string): Promise<Result<{ refundAmount: number }>> {
    const policy = policyStore.get(policyId);

    if (!policy) {
      return err(new Error('Policy not found'), this.getMeta());
    }

    if (policy.status === 'CANCELLED') {
      return err(new Error('Policy already cancelled'), this.getMeta());
    }

    // Calculate prorated refund
    const totalDays = (policy.endDate.getTime() - policy.startDate.getTime()) / (1000 * 60 * 60 * 24);
    const usedDays = (Date.now() - policy.startDate.getTime()) / (1000 * 60 * 60 * 24);
    const remainingDays = Math.max(0, totalDays - usedDays);
    const refundPercentage = remainingDays / totalDays;
    const refundAmount = Math.round(policy.annualPremium * refundPercentage * 100) / 100;

    policy.status = 'CANCELLED';
    policyStore.set(policyId, policy);

    return ok({ refundAmount }, this.getMeta());
  }
}

// Singleton instance
let instance: MockInsuranceProvider | null = null;

export function getMockInsuranceProvider(): MockInsuranceProvider {
  if (!instance) {
    instance = new MockInsuranceProvider();
  }
  return instance;
}
