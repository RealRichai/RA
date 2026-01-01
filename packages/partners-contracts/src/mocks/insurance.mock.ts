import type {
  InsurancePolicy,
  InsuranceProvider,
  InsuranceQuote,
  PolicyDocument,
  PurchasePolicyRequest,
  QuotePolicyRequest,
} from '../contracts/insurance';
import type { Contact } from '../types/common';
import type { ProviderError } from '../types/errors';
import { createProviderError } from '../types/errors';
import type { Result } from '../types/result';
import { failure, success } from '../types/result';

import { BaseMockProvider, createSeed, SeededRandom } from './base';

const MOCK_CARRIERS = [
  { id: 'lemonade', name: 'Lemonade', rating: 'A-' },
  { id: 'state_mutual', name: 'State Mutual Insurance', rating: 'A+' },
  { id: 'liberty_guard', name: 'Liberty Guard', rating: 'A' },
  { id: 'safe_harbor', name: 'Safe Harbor Insurance', rating: 'A' },
];

/**
 * Mock implementation of InsuranceProvider
 */
export class MockInsuranceProvider
  extends BaseMockProvider
  implements InsuranceProvider
{
  private quotes: Map<string, InsuranceQuote> = new Map();
  private policies: Map<string, InsurancePolicy> = new Map();

  constructor(options?: { simulateLatency?: boolean }) {
    super('mock_insurance', 'Mock Insurance Provider', options);
  }

  async quotePolicy(
    request: QuotePolicyRequest
  ): Promise<Result<InsuranceQuote, ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed(request);
    const rng = new SeededRandom(seed);

    await this.maybeDelay();

    const carrier = rng.pick(MOCK_CARRIERS);
    const basePremium = this.calculateBasePremium(request, rng);

    const quoteId = rng.nextId('quote');
    const effectiveDate = request.effectiveDate;
    const expirationDate = new Date(effectiveDate);
    expirationDate.setMonth(expirationDate.getMonth() + request.termMonths);

    const quote: InsuranceQuote = {
      quoteId,
      carrierId: carrier.id,
      carrierName: carrier.name,
      carrierRating: carrier.rating,

      premium: {
        annual: { amount: basePremium, currency: 'USD' },
        monthly: { amount: Math.round(basePremium / 12 * 100) / 100, currency: 'USD' },
        paymentOptions: [
          {
            frequency: 'ANNUAL',
            amount: { amount: basePremium, currency: 'USD' },
            totalAnnual: { amount: basePremium, currency: 'USD' },
          },
          {
            frequency: 'MONTHLY',
            amount: { amount: Math.round(basePremium / 12 * 1.05 * 100) / 100, currency: 'USD' },
            totalAnnual: { amount: Math.round(basePremium * 1.05 * 100) / 100, currency: 'USD' },
            processingFee: { amount: 2, currency: 'USD' },
          },
        ],
      },

      coverage: {
        type: request.coverage.type,
        personalProperty: request.coverage.personalPropertyLimit
          ? { amount: request.coverage.personalPropertyLimit, currency: 'USD' }
          : undefined,
        liability: { amount: request.coverage.liabilityLimit, currency: 'USD' },
        medicalPayments: { amount: 5000, currency: 'USD' },
        lossOfUse: { amount: request.coverage.personalPropertyLimit ? request.coverage.personalPropertyLimit * 0.3 : 10000, currency: 'USD' },
        deductible: { amount: request.coverage.deductible, currency: 'USD' },
        additionalCoverages: (request.coverage.additionalCoverages ?? []).map((cov) => ({
          type: cov.type,
          limit: { amount: cov.limit ?? 10000, currency: 'USD' },
          premium: { amount: rng.nextInt(50, 200), currency: 'USD' },
        })),
      },

      effectiveDate,
      expirationDate,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),

      requiresInspection: request.coverage.type === 'LANDLORD' && rng.next() > 0.7,
      requiredDocuments: [],
      disclosures: [
        'This quote is based on the information provided and is subject to verification.',
        'Coverage is subject to policy terms and conditions.',
      ],
    };

    this.quotes.set(quoteId, quote);

    return success(quote, this.createMetadata(seed, startTime));
  }

  async getQuotes(
    request: QuotePolicyRequest
  ): Promise<Result<InsuranceQuote[], ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed(request);
    const rng = new SeededRandom(seed);

    await this.maybeDelay();

    const quotes: InsuranceQuote[] = [];
    const numQuotes = rng.nextInt(2, 4);

    for (let i = 0; i < numQuotes; i++) {
      const carrierSeed = `${seed}_carrier_${i}`;
      const carrierRng = new SeededRandom(carrierSeed);
      const carrier = MOCK_CARRIERS[i % MOCK_CARRIERS.length]!;
      const basePremium = this.calculateBasePremium(request, carrierRng);

      const quoteId = carrierRng.nextId('quote');
      const effectiveDate = request.effectiveDate;
      const expirationDate = new Date(effectiveDate);
      expirationDate.setMonth(expirationDate.getMonth() + request.termMonths);

      const quote: InsuranceQuote = {
        quoteId,
        carrierId: carrier.id,
        carrierName: carrier.name,
        carrierRating: carrier.rating,

        premium: {
          annual: { amount: basePremium, currency: 'USD' },
          monthly: { amount: Math.round(basePremium / 12 * 100) / 100, currency: 'USD' },
          paymentOptions: [
            {
              frequency: 'ANNUAL',
              amount: { amount: basePremium, currency: 'USD' },
              totalAnnual: { amount: basePremium, currency: 'USD' },
            },
            {
              frequency: 'MONTHLY',
              amount: { amount: Math.round(basePremium / 12 * 1.05 * 100) / 100, currency: 'USD' },
              totalAnnual: { amount: Math.round(basePremium * 1.05 * 100) / 100, currency: 'USD' },
            },
          ],
        },

        coverage: {
          type: request.coverage.type,
          personalProperty: request.coverage.personalPropertyLimit
            ? { amount: request.coverage.personalPropertyLimit, currency: 'USD' }
            : undefined,
          liability: { amount: request.coverage.liabilityLimit, currency: 'USD' },
          medicalPayments: { amount: 5000, currency: 'USD' },
          lossOfUse: { amount: 10000, currency: 'USD' },
          deductible: { amount: request.coverage.deductible, currency: 'USD' },
          additionalCoverages: [],
        },

        effectiveDate,
        expirationDate,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),

        requiresInspection: false,
        requiredDocuments: [],
        disclosures: ['Coverage subject to policy terms.'],
      };

      this.quotes.set(quoteId, quote);
      quotes.push(quote);
    }

    return success(quotes, this.createMetadata(seed, startTime));
  }

  async purchasePolicy(
    request: PurchasePolicyRequest
  ): Promise<Result<InsurancePolicy, ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed(request);
    const rng = new SeededRandom(seed);

    await this.maybeDelay();

    const quote = this.quotes.get(request.quoteId);

    if (!quote) {
      return failure(
        createProviderError('RESOURCE_NOT_FOUND', `Quote ${request.quoteId} not found`),
        this.createMetadata(seed, startTime)
      );
    }

    if (!request.termsAccepted || !request.disclosuresAccepted) {
      return failure(
        createProviderError('VALIDATION_ERROR', 'Terms and disclosures must be accepted'),
        this.createMetadata(seed, startTime)
      );
    }

    const policyId = rng.nextId('pol');
    const now = new Date();

    const policy: InsurancePolicy = {
      policyId,
      policyNumber: `POL-${rng.nextConfirmation()}`,
      status: 'ACTIVE',
      carrierId: quote.carrierId,
      carrierName: quote.carrierName,
      quote,
      insured: {
        firstName: 'Mock',
        lastName: 'Insured',
        email: 'mock@example.com',
      },
      additionalInsured: request.additionalInsured ?? [],
      effectiveDate: quote.effectiveDate,
      expirationDate: quote.expirationDate,
      issuedDate: now,
      nextPaymentDate:
        request.paymentMethod.frequency === 'MONTHLY'
          ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
          : undefined,
      nextPaymentAmount:
        request.paymentMethod.frequency === 'MONTHLY'
          ? quote.premium.monthly
          : undefined,
      paymentMethod: request.paymentMethod.type,
      documents: [
        {
          documentId: rng.nextId('doc'),
          type: 'DECLARATIONS',
          name: 'Declarations Page',
          url: 'https://mock.example.com/docs/declarations.pdf',
          createdAt: now,
        },
        {
          documentId: rng.nextId('doc'),
          type: 'ID_CARD',
          name: 'Insurance ID Card',
          url: 'https://mock.example.com/docs/id-card.pdf',
          createdAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    this.policies.set(policyId, policy);

    return success(policy, this.createMetadata(seed, startTime));
  }

  async getPolicy(
    policyId: string
  ): Promise<Result<InsurancePolicy, ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed({ policyId });

    await this.maybeDelay();

    const policy = this.policies.get(policyId);

    if (!policy) {
      return failure(
        createProviderError('RESOURCE_NOT_FOUND', `Policy ${policyId} not found`),
        this.createMetadata(seed, startTime)
      );
    }

    return success(policy, this.createMetadata(seed, startTime));
  }

  async cancelPolicy(
    policyId: string,
    effectiveDate: Date,
    reason?: string
  ): Promise<Result<InsurancePolicy, ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed({ policyId, effectiveDate, reason });

    await this.maybeDelay();

    const policy = this.policies.get(policyId);

    if (!policy) {
      return failure(
        createProviderError('RESOURCE_NOT_FOUND', `Policy ${policyId} not found`),
        this.createMetadata(seed, startTime)
      );
    }

    const updatedPolicy: InsurancePolicy = {
      ...policy,
      status: 'CANCELLED',
      updatedAt: new Date(),
    };

    this.policies.set(policyId, updatedPolicy);

    return success(updatedPolicy, this.createMetadata(seed, startTime));
  }

  async getCertificate(
    policyId: string,
    _certificateHolder?: Contact & { address: { street1: string; city: string; state: string; postalCode: string; country: string } }
  ): Promise<Result<PolicyDocument, ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed({ policyId });
    const rng = new SeededRandom(seed);

    await this.maybeDelay();

    const policy = this.policies.get(policyId);

    if (!policy) {
      return failure(
        createProviderError('RESOURCE_NOT_FOUND', `Policy ${policyId} not found`),
        this.createMetadata(seed, startTime)
      );
    }

    const certificate: PolicyDocument = {
      documentId: rng.nextId('cert'),
      type: 'CERTIFICATE',
      name: 'Certificate of Insurance',
      url: 'https://mock.example.com/docs/certificate.pdf',
      createdAt: new Date(),
    };

    return success(certificate, this.createMetadata(seed, startTime));
  }

  private calculateBasePremium(request: QuotePolicyRequest, rng: SeededRandom): number {
    let basePremium = 150; // Base annual premium

    // Adjust for coverage type
    switch (request.coverage.type) {
      case 'RENTERS':
        basePremium = 150 + rng.nextInt(-20, 50);
        break;
      case 'LANDLORD':
        basePremium = 800 + rng.nextInt(-100, 200);
        break;
      case 'LIABILITY':
        basePremium = 300 + rng.nextInt(-50, 100);
        break;
      case 'UMBRELLA':
        basePremium = 400 + rng.nextInt(-50, 150);
        break;
    }

    // Adjust for liability limit
    basePremium += (request.coverage.liabilityLimit / 100000) * 20;

    // Adjust for personal property
    if (request.coverage.personalPropertyLimit) {
      basePremium += (request.coverage.personalPropertyLimit / 10000) * 15;
    }

    // Adjust for deductible (higher deductible = lower premium)
    basePremium -= (request.coverage.deductible / 500) * 10;

    // Add for additional coverages
    basePremium += (request.coverage.additionalCoverages?.length ?? 0) * rng.nextInt(30, 80);

    return Math.round(basePremium * 100) / 100;
  }
}
