import { describe, expect, it } from 'vitest';

import {
  AddressSchema,
  ContactSchema,
  MoneySchema,
  ProviderErrorSchema,
  ResultMetadataSchema,
} from '../types';
import {
  GetProvidersByAddressRequestSchema,
  ConciergeTicketSchema,
  UtilityProviderSchema,
} from '../contracts/utilities';
import {
  GetQuotesRequestSchema,
  MovingQuoteSchema,
} from '../contracts/moving';
import {
  QuotePolicyRequestSchema,
  InsuranceQuoteSchema,
} from '../contracts/insurance';
import {
  SubmitApplicationRequestSchema,
  GuarantorApplicationSchema,
} from '../contracts/guarantor';

describe('Common Schemas', () => {
  describe('AddressSchema', () => {
    it('validates a valid address', () => {
      const address = {
        street1: '123 Main St',
        city: 'Los Angeles',
        state: 'CA',
        postalCode: '90210',
        country: 'US',
      };

      const result = AddressSchema.safeParse(address);
      expect(result.success).toBe(true);
    });

    it('rejects invalid postal code', () => {
      const address = {
        street1: '123 Main St',
        city: 'Los Angeles',
        state: 'CA',
        postalCode: 'invalid',
        country: 'US',
      };

      const result = AddressSchema.safeParse(address);
      expect(result.success).toBe(false);
    });

    it('accepts postal code with extension', () => {
      const address = {
        street1: '123 Main St',
        city: 'Los Angeles',
        state: 'CA',
        postalCode: '90210-1234',
        country: 'US',
      };

      const result = AddressSchema.safeParse(address);
      expect(result.success).toBe(true);
    });
  });

  describe('ContactSchema', () => {
    it('validates a valid contact', () => {
      const contact = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '555-123-4567',
      };

      const result = ContactSchema.safeParse(contact);
      expect(result.success).toBe(true);
    });

    it('rejects invalid email', () => {
      const contact = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'not-an-email',
      };

      const result = ContactSchema.safeParse(contact);
      expect(result.success).toBe(false);
    });
  });

  describe('MoneySchema', () => {
    it('validates money with currency', () => {
      const money = { amount: 100.50, currency: 'USD' };
      const result = MoneySchema.safeParse(money);
      expect(result.success).toBe(true);
    });

    it('uses USD as default currency', () => {
      const money = { amount: 100 };
      const result = MoneySchema.safeParse(money);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe('USD');
      }
    });
  });

  describe('ProviderErrorSchema', () => {
    it('validates a provider error', () => {
      const error = {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        retryable: false,
      };

      const result = ProviderErrorSchema.safeParse(error);
      expect(result.success).toBe(true);
    });

    it('validates error with optional fields', () => {
      const error = {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        providerCode: 'ERR_429',
        providerMessage: 'Rate limit exceeded',
        retryable: true,
        retryAfterMs: 5000,
        context: { remaining: 0 },
      };

      const result = ProviderErrorSchema.safeParse(error);
      expect(result.success).toBe(true);
    });
  });

  describe('ResultMetadataSchema', () => {
    it('validates result metadata', () => {
      const metadata = {
        providerId: 'test_provider',
        providerName: 'Test Provider',
        requestId: 'req_123',
        timestamp: new Date().toISOString(),
        durationMs: 150,
        isMock: true,
        mockSeed: 'test_seed',
      };

      const result = ResultMetadataSchema.safeParse(metadata);
      expect(result.success).toBe(true);
    });
  });
});

describe('Utilities Schemas', () => {
  describe('GetProvidersByAddressRequestSchema', () => {
    it('validates a minimal request', () => {
      const request = {
        address: {
          street1: '123 Main St',
          city: 'Los Angeles',
          state: 'CA',
          postalCode: '90210',
          country: 'US',
        },
      };

      const result = GetProvidersByAddressRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('validates request with utility types', () => {
      const request = {
        address: {
          street1: '123 Main St',
          city: 'Los Angeles',
          state: 'CA',
          postalCode: '90210',
          country: 'US',
        },
        utilityTypes: ['ELECTRIC', 'GAS', 'WATER'],
        moveInDate: new Date().toISOString(),
      };

      const result = GetProvidersByAddressRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });
  });

  describe('UtilityProviderSchema', () => {
    it('validates a utility provider', () => {
      const provider = {
        providerId: 'util_123',
        name: 'City Power',
        type: 'ELECTRIC',
        phone: '1-800-123-4567',
        supportsOnlineSetup: true,
        estimatedSetupDays: 3,
      };

      const result = UtilityProviderSchema.safeParse(provider);
      expect(result.success).toBe(true);
    });
  });

  describe('ConciergeTicketSchema', () => {
    it('validates a concierge ticket', () => {
      const ticket = {
        ticketId: 'tkt_123',
        status: 'PENDING',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        utilitySetups: [
          { utilityType: 'ELECTRIC', status: 'PENDING' },
          { utilityType: 'GAS', status: 'SCHEDULED' },
        ],
      };

      const result = ConciergeTicketSchema.safeParse(ticket);
      expect(result.success).toBe(true);
    });
  });
});

describe('Moving Schemas', () => {
  describe('GetQuotesRequestSchema', () => {
    it('validates a minimal quote request', () => {
      const request = {
        origin: {
          street1: '123 Main St',
          city: 'Los Angeles',
          state: 'CA',
          postalCode: '90210',
          country: 'US',
        },
        destination: {
          street1: '456 Oak Ave',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94102',
          country: 'US',
        },
        moveDate: new Date().toISOString(),
        moveSize: 'TWO_BEDROOM',
      };

      const result = GetQuotesRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('validates request with special items', () => {
      const request = {
        origin: {
          street1: '123 Main St',
          city: 'Los Angeles',
          state: 'CA',
          postalCode: '90210',
          country: 'US',
        },
        destination: {
          street1: '456 Oak Ave',
          city: 'San Francisco',
          state: 'CA',
          postalCode: '94102',
          country: 'US',
        },
        moveDate: new Date().toISOString(),
        moveSize: 'THREE_BEDROOM',
        serviceLevel: 'FULL_SERVICE',
        specialItems: [
          { type: 'PIANO', quantity: 1 },
          { type: 'ARTWORK', description: 'Large paintings', quantity: 3 },
        ],
        requiresPacking: true,
      };

      const result = GetQuotesRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });
  });

  describe('MovingQuoteSchema', () => {
    it('validates a moving quote', () => {
      const quote = {
        quoteId: 'quote_123',
        companyId: 'comp_123',
        companyName: 'Best Movers',
        rating: 4.5,
        reviewCount: 150,
        basePrice: { amount: 800, currency: 'USD' },
        totalPrice: { amount: 1000, currency: 'USD' },
        serviceLevel: 'STANDARD',
        estimatedDuration: {
          loadingHours: 2,
          transitHours: 4,
          unloadingHours: 2,
        },
        crewSize: 3,
        truckSize: '20ft',
        basicLiability: { amount: 10000, currency: 'USD' },
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        availableDates: [new Date().toISOString()],
        cancellationPolicy: 'Free cancellation 48h before',
        depositRequired: { amount: 200, currency: 'USD' },
      };

      const result = MovingQuoteSchema.safeParse(quote);
      expect(result.success).toBe(true);
    });
  });
});

describe('Insurance Schemas', () => {
  describe('QuotePolicyRequestSchema', () => {
    it('validates a renters insurance quote request', () => {
      const request = {
        insured: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        },
        property: {
          address: {
            street1: '123 Main St',
            city: 'Los Angeles',
            state: 'CA',
            postalCode: '90210',
            country: 'US',
          },
          type: 'APARTMENT',
        },
        coverage: {
          type: 'RENTERS',
          personalPropertyLimit: 25000,
          liabilityLimit: 100000,
          deductible: 500,
        },
        effectiveDate: new Date().toISOString(),
        termMonths: 12,
      };

      const result = QuotePolicyRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });
  });

  describe('InsuranceQuoteSchema', () => {
    it('validates an insurance quote', () => {
      const quote = {
        quoteId: 'quote_123',
        carrierId: 'carrier_123',
        carrierName: 'SafeGuard Insurance',
        carrierRating: 'A+',
        premium: {
          annual: { amount: 180, currency: 'USD' },
          monthly: { amount: 15, currency: 'USD' },
          paymentOptions: [
            {
              frequency: 'ANNUAL',
              amount: { amount: 180, currency: 'USD' },
              totalAnnual: { amount: 180, currency: 'USD' },
            },
          ],
        },
        coverage: {
          type: 'RENTERS',
          personalProperty: { amount: 25000, currency: 'USD' },
          liability: { amount: 100000, currency: 'USD' },
          deductible: { amount: 500, currency: 'USD' },
          additionalCoverages: [],
        },
        effectiveDate: new Date().toISOString(),
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        requiresInspection: false,
        requiredDocuments: [],
        disclosures: ['Terms apply'],
      };

      const result = InsuranceQuoteSchema.safeParse(quote);
      expect(result.success).toBe(true);
    });
  });
});

describe('Guarantor Schemas', () => {
  describe('SubmitApplicationRequestSchema', () => {
    it('validates a guarantor application request', () => {
      const request = {
        applicant: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          dateOfBirth: '1990-01-01',
          annualIncome: 75000,
          employmentStatus: 'EMPLOYED_FULL_TIME',
          employer: 'Tech Corp',
        },
        rental: {
          propertyAddress: {
            street1: '123 Main St',
            city: 'Los Angeles',
            state: 'CA',
            postalCode: '90210',
            country: 'US',
          },
          monthlyRent: 2500,
          leaseTermMonths: 12,
          moveInDate: new Date().toISOString(),
        },
        landlord: {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@property.com',
          companyName: 'Property Management Inc',
        },
      };

      const result = SubmitApplicationRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });
  });

  describe('GuarantorApplicationSchema', () => {
    it('validates a pending application', () => {
      const application = {
        applicationId: 'app_123',
        status: 'PENDING_REVIEW',
        applicant: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        },
        rental: {
          propertyAddress: {
            street1: '123 Main St',
            city: 'Los Angeles',
            state: 'CA',
            postalCode: '90210',
            country: 'US',
          },
          monthlyRent: { amount: 2500, currency: 'USD' },
          leaseTermMonths: 12,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = GuarantorApplicationSchema.safeParse(application);
      expect(result.success).toBe(true);
    });

    it('validates an approved application with pricing', () => {
      const application = {
        applicationId: 'app_123',
        status: 'APPROVED',
        applicant: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        },
        rental: {
          propertyAddress: {
            street1: '123 Main St',
            city: 'Los Angeles',
            state: 'CA',
            postalCode: '90210',
            country: 'US',
          },
          monthlyRent: { amount: 2500, currency: 'USD' },
          leaseTermMonths: 12,
        },
        decision: {
          status: 'APPROVED',
          decisionDate: new Date().toISOString(),
        },
        pricing: {
          coverageAmount: { amount: 30000, currency: 'USD' },
          oneTimeFee: { amount: 1500, currency: 'USD' },
          feeType: 'ONE_TIME',
        },
        coverage: {
          maxCoverage: { amount: 30000, currency: 'USD' },
          coverageMonths: 12,
          includedCoverages: ['UNPAID_RENT', 'LEGAL_FEES'],
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = GuarantorApplicationSchema.safeParse(application);
      expect(result.success).toBe(true);
    });
  });
});
