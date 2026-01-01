import { describe, expect, it, beforeEach } from 'vitest';

import { isSuccess, isFailure } from '../types/result';
import { MockUtilitiesProvider } from '../mocks/utilities.mock';
import { MockMovingProvider } from '../mocks/moving.mock';
import { MockInsuranceProvider } from '../mocks/insurance.mock';
import { MockGuarantorProvider } from '../mocks/guarantor.mock';
import { MockVendorProvider } from '../mocks/vendor';
import type { VendorCategory } from '../contracts/vendor';

describe('MockUtilitiesProvider', () => {
  let provider: MockUtilitiesProvider;

  beforeEach(() => {
    provider = new MockUtilitiesProvider();
  });

  describe('interface compliance', () => {
    it('has required properties', () => {
      expect(provider.providerId).toBe('mock_utilities');
      expect(provider.providerName).toBe('Mock Utilities Provider');
      expect(provider.isMock).toBe(true);
    });

    it('passes health check', async () => {
      const result = await provider.healthCheck();
      expect(result).toBe(true);
    });
  });

  describe('getProvidersByAddress', () => {
    it('returns utility providers for an address', async () => {
      const result = await provider.getProvidersByAddress({
        address: {
          street1: '123 Main St',
          city: 'Los Angeles',
          state: 'CA',
          postalCode: '90210',
          country: 'US',
        },
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.providers.length).toBeGreaterThan(0);
        expect(result.metadata.isMock).toBe(true);
        expect(result.metadata.providerId).toBe('mock_utilities');
      }
    });

    it('returns deterministic results for same input', async () => {
      const request = {
        address: {
          street1: '123 Main St',
          city: 'Los Angeles',
          state: 'CA',
          postalCode: '90210',
          country: 'US',
        },
      };

      const result1 = await provider.getProvidersByAddress(request);
      const result2 = await provider.getProvidersByAddress(request);

      expect(isSuccess(result1)).toBe(true);
      expect(isSuccess(result2)).toBe(true);

      if (isSuccess(result1) && isSuccess(result2)) {
        expect(result1.data.providers.length).toBe(result2.data.providers.length);
        expect(result1.data.providers[0]?.name).toBe(result2.data.providers[0]?.name);
      }
    });

    it('filters by utility types when specified', async () => {
      const result = await provider.getProvidersByAddress({
        address: {
          street1: '123 Main St',
          city: 'Los Angeles',
          state: 'CA',
          postalCode: '90210',
          country: 'US',
        },
        utilityTypes: ['ELECTRIC', 'GAS'],
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.providers.length).toBe(2);
        const types = result.data.providers.map((p) => p.type);
        expect(types).toContain('ELECTRIC');
        expect(types).toContain('GAS');
      }
    });
  });

  describe('startConciergeTicket', () => {
    it('creates a concierge ticket', async () => {
      const result = await provider.startConciergeTicket({
        address: {
          street1: '123 Main St',
          city: 'Los Angeles',
          state: 'CA',
          postalCode: '90210',
          country: 'US',
        },
        contact: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        },
        moveInDate: new Date(),
        utilityTypes: ['ELECTRIC', 'GAS', 'WATER'],
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.ticketId).toBeDefined();
        expect(result.data.status).toBe('PENDING');
        expect(result.data.utilitySetups.length).toBe(3);
      }
    });
  });

  describe('getConciergeTicket', () => {
    it('returns error for non-existent ticket', async () => {
      const result = await provider.getConciergeTicket('nonexistent');

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
        expect(result.metadata.isMock).toBe(true);
      }
    });

    it('retrieves an existing ticket', async () => {
      const createResult = await provider.startConciergeTicket({
        address: {
          street1: '123 Main St',
          city: 'Los Angeles',
          state: 'CA',
          postalCode: '90210',
          country: 'US',
        },
        contact: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        },
        moveInDate: new Date(),
        utilityTypes: ['ELECTRIC'],
      });

      expect(isSuccess(createResult)).toBe(true);
      if (isSuccess(createResult)) {
        const getResult = await provider.getConciergeTicket(createResult.data.ticketId);

        expect(isSuccess(getResult)).toBe(true);
        if (isSuccess(getResult)) {
          expect(getResult.data.ticketId).toBe(createResult.data.ticketId);
        }
      }
    });
  });
});

describe('MockMovingProvider', () => {
  let provider: MockMovingProvider;

  beforeEach(() => {
    provider = new MockMovingProvider();
  });

  describe('interface compliance', () => {
    it('has required properties', () => {
      expect(provider.providerId).toBe('mock_moving');
      expect(provider.providerName).toBe('Mock Moving Provider');
      expect(provider.isMock).toBe(true);
    });
  });

  describe('getQuotes', () => {
    it('returns multiple quotes', async () => {
      const result = await provider.getQuotes({
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
        moveDate: new Date(),
        moveSize: 'TWO_BEDROOM',
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.quotes.length).toBeGreaterThan(1);
        expect(result.data.searchId).toBeDefined();

        const quote = result.data.quotes[0]!;
        expect(quote.quoteId).toBeDefined();
        expect(quote.companyName).toBeDefined();
        expect(quote.totalPrice.amount).toBeGreaterThan(0);
      }
    });

    it('includes packing price when requested', async () => {
      const result = await provider.getQuotes({
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
        moveDate: new Date(),
        moveSize: 'TWO_BEDROOM',
        requiresPacking: true,
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        const quote = result.data.quotes[0]!;
        expect(quote.packingPrice).toBeDefined();
        expect(quote.packingPrice!.amount).toBeGreaterThan(0);
      }
    });
  });

  describe('bookMove', () => {
    it('books a move from a valid quote', async () => {
      const quotesResult = await provider.getQuotes({
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
        moveDate: new Date(),
        moveSize: 'TWO_BEDROOM',
      });

      expect(isSuccess(quotesResult)).toBe(true);
      if (isSuccess(quotesResult)) {
        const quote = quotesResult.data.quotes[0]!;

        const bookResult = await provider.bookMove({
          quoteId: quote.quoteId,
          moveDate: new Date(),
          contact: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
          },
        });

        expect(isSuccess(bookResult)).toBe(true);
        if (isSuccess(bookResult)) {
          expect(bookResult.data.bookingId).toBeDefined();
          expect(bookResult.data.confirmationNumber).toBeDefined();
          expect(bookResult.data.status).toBe('CONFIRMED');
        }
      }
    });

    it('returns error for non-existent quote', async () => {
      const result = await provider.bookMove({
        quoteId: 'nonexistent',
        moveDate: new Date(),
        contact: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        },
      });

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
      }
    });
  });
});

describe('MockInsuranceProvider', () => {
  let provider: MockInsuranceProvider;

  beforeEach(() => {
    provider = new MockInsuranceProvider();
  });

  describe('interface compliance', () => {
    it('has required properties', () => {
      expect(provider.providerId).toBe('mock_insurance');
      expect(provider.providerName).toBe('Mock Insurance Provider');
      expect(provider.isMock).toBe(true);
    });
  });

  describe('quotePolicy', () => {
    it('returns an insurance quote', async () => {
      const result = await provider.quotePolicy({
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
        effectiveDate: new Date(),
        termMonths: 12,
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.quoteId).toBeDefined();
        expect(result.data.carrierName).toBeDefined();
        expect(result.data.premium.annual.amount).toBeGreaterThan(0);
        expect(result.data.premium.paymentOptions.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getQuotes', () => {
    it('returns multiple quotes from different carriers', async () => {
      const result = await provider.getQuotes({
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
          liabilityLimit: 100000,
          deductible: 500,
        },
        effectiveDate: new Date(),
        termMonths: 12,
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.length).toBeGreaterThan(1);

        const carrierIds = result.data.map((q) => q.carrierId);
        const uniqueCarriers = new Set(carrierIds);
        expect(uniqueCarriers.size).toBe(carrierIds.length);
      }
    });
  });

  describe('purchasePolicy', () => {
    it('purchases a policy from a valid quote', async () => {
      const quoteResult = await provider.quotePolicy({
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
          liabilityLimit: 100000,
          deductible: 500,
        },
        effectiveDate: new Date(),
        termMonths: 12,
      });

      expect(isSuccess(quoteResult)).toBe(true);
      if (isSuccess(quoteResult)) {
        const purchaseResult = await provider.purchasePolicy({
          quoteId: quoteResult.data.quoteId,
          paymentMethod: {
            type: 'CARD',
            token: 'tok_test',
            frequency: 'ANNUAL',
          },
          electronicDeliveryConsent: true,
          termsAccepted: true,
          disclosuresAccepted: true,
        });

        expect(isSuccess(purchaseResult)).toBe(true);
        if (isSuccess(purchaseResult)) {
          expect(purchaseResult.data.policyId).toBeDefined();
          expect(purchaseResult.data.policyNumber).toBeDefined();
          expect(purchaseResult.data.status).toBe('ACTIVE');
          expect(purchaseResult.data.documents.length).toBeGreaterThan(0);
        }
      }
    });

    it('returns error when terms not accepted', async () => {
      const quoteResult = await provider.quotePolicy({
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
          liabilityLimit: 100000,
          deductible: 500,
        },
        effectiveDate: new Date(),
        termMonths: 12,
      });

      expect(isSuccess(quoteResult)).toBe(true);
      if (isSuccess(quoteResult)) {
        const purchaseResult = await provider.purchasePolicy({
          quoteId: quoteResult.data.quoteId,
          paymentMethod: {
            type: 'CARD',
            frequency: 'ANNUAL',
          },
          electronicDeliveryConsent: true,
          termsAccepted: false,
          disclosuresAccepted: true,
        });

        expect(isFailure(purchaseResult)).toBe(true);
        if (isFailure(purchaseResult)) {
          expect(purchaseResult.error.code).toBe('VALIDATION_ERROR');
        }
      }
    });
  });
});

describe('MockGuarantorProvider', () => {
  let provider: MockGuarantorProvider;

  beforeEach(() => {
    provider = new MockGuarantorProvider();
  });

  describe('interface compliance', () => {
    it('has required properties', () => {
      expect(provider.providerId).toBe('mock_guarantor');
      expect(provider.providerName).toBe('Mock Guarantor Provider');
      expect(provider.isMock).toBe(true);
    });
  });

  describe('submitApplication', () => {
    it('submits a guarantor application', async () => {
      const result = await provider.submitApplication({
        applicant: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          dateOfBirth: new Date('1990-01-01'),
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
          monthlyRent: 2000,
          leaseTermMonths: 12,
          moveInDate: new Date(),
        },
        landlord: {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@property.com',
        },
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.applicationId).toBeDefined();
        expect(result.data.status).toBe('SUBMITTED');
        expect(result.data.requiredDocuments).toBeDefined();
        expect(result.data.requiredDocuments!.length).toBeGreaterThan(0);
      }
    });

    it('includes pricing for qualified applicants', async () => {
      // Low rent-to-income ratio should pre-qualify
      const result = await provider.submitApplication({
        applicant: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          dateOfBirth: new Date('1990-01-01'),
          annualIncome: 120000, // High income
          employmentStatus: 'EMPLOYED_FULL_TIME',
        },
        rental: {
          propertyAddress: {
            street1: '123 Main St',
            city: 'Los Angeles',
            state: 'CA',
            postalCode: '90210',
            country: 'US',
          },
          monthlyRent: 2000, // Low rent relative to income
          leaseTermMonths: 12,
          moveInDate: new Date(),
        },
        landlord: {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@property.com',
        },
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.pricing).toBeDefined();
        expect(result.data.pricing!.coverageAmount.amount).toBeGreaterThan(0);
        expect(result.data.pricing!.oneTimeFee.amount).toBeGreaterThan(0);
      }
    });
  });

  describe('pollStatus', () => {
    it('returns error for non-existent application', async () => {
      const result = await provider.pollStatus({
        applicationId: 'nonexistent',
      });

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
      }
    });

    it('retrieves status of existing application', async () => {
      const submitResult = await provider.submitApplication({
        applicant: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          dateOfBirth: new Date('1990-01-01'),
          annualIncome: 75000,
          employmentStatus: 'EMPLOYED_FULL_TIME',
        },
        rental: {
          propertyAddress: {
            street1: '123 Main St',
            city: 'Los Angeles',
            state: 'CA',
            postalCode: '90210',
            country: 'US',
          },
          monthlyRent: 2000,
          leaseTermMonths: 12,
          moveInDate: new Date(),
        },
        landlord: {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@property.com',
        },
      });

      expect(isSuccess(submitResult)).toBe(true);
      if (isSuccess(submitResult)) {
        const pollResult = await provider.pollStatus({
          applicationId: submitResult.data.applicationId,
        });

        expect(isSuccess(pollResult)).toBe(true);
        if (isSuccess(pollResult)) {
          expect(pollResult.data.applicationId).toBe(submitResult.data.applicationId);
        }
      }
    });
  });

  describe('cancelApplication', () => {
    it('cancels an existing application', async () => {
      const submitResult = await provider.submitApplication({
        applicant: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          dateOfBirth: new Date('1990-01-01'),
          annualIncome: 75000,
          employmentStatus: 'EMPLOYED_FULL_TIME',
        },
        rental: {
          propertyAddress: {
            street1: '123 Main St',
            city: 'Los Angeles',
            state: 'CA',
            postalCode: '90210',
            country: 'US',
          },
          monthlyRent: 2000,
          leaseTermMonths: 12,
          moveInDate: new Date(),
        },
        landlord: {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane@property.com',
        },
      });

      expect(isSuccess(submitResult)).toBe(true);
      if (isSuccess(submitResult)) {
        const cancelResult = await provider.cancelApplication(
          submitResult.data.applicationId,
          'Changed my mind'
        );

        expect(isSuccess(cancelResult)).toBe(true);
        if (isSuccess(cancelResult)) {
          expect(cancelResult.data.status).toBe('CANCELLED');
        }
      }
    });
  });
});

describe('MockVendorProvider', () => {
  let provider: MockVendorProvider;

  beforeEach(() => {
    provider = new MockVendorProvider();
  });

  describe('interface compliance', () => {
    it('has required properties', () => {
      expect(provider.providerId).toBe('mock_vendor');
      expect(provider.providerName).toBe('Mock Vendor Provider');
      expect(provider.isMock).toBe(true);
    });

    it('passes health check', async () => {
      const result = await provider.healthCheck();
      expect(result).toBe(true);
    });

    it('initializes with mock data', () => {
      expect(provider.getVendorCount()).toBeGreaterThan(0);
      expect(provider.getProductCount()).toBeGreaterThan(0);
    });
  });

  describe('searchVendors', () => {
    it('returns vendors for a valid address', async () => {
      const result = await provider.searchVendors({
        address: {
          street1: '123 Main St',
          city: 'New York',
          state: 'NY',
          postalCode: '10001',
          country: 'US',
        },
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.vendors.length).toBeGreaterThan(0);
        expect(result.data.total).toBeGreaterThan(0);
        expect(result.metadata.isMock).toBe(true);
      }
    });

    it('filters by categories', async () => {
      const result = await provider.searchVendors({
        address: {
          street1: '123 Main St',
          city: 'New York',
          state: 'NY',
          postalCode: '10001',
          country: 'US',
        },
        categories: ['FURNITURE', 'CLEANING'],
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.vendors.length).toBeGreaterThan(0);
        for (const vendor of result.data.vendors) {
          expect(
            vendor.categories.some((c) => ['FURNITURE', 'CLEANING'].includes(c))
          ).toBe(true);
        }
      }
    });

    it('supports pagination', async () => {
      const result = await provider.searchVendors({
        address: {
          street1: '123 Main St',
          city: 'New York',
          state: 'NY',
          postalCode: '10001',
          country: 'US',
        },
        limit: 2,
        offset: 0,
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.vendors.length).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('searchProducts', () => {
    it('returns products', async () => {
      const result = await provider.searchProducts({});

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        expect(result.data.products.length).toBeGreaterThan(0);
        expect(result.data.total).toBeGreaterThan(0);
      }
    });

    it('filters by category', async () => {
      const result = await provider.searchProducts({
        category: 'FURNITURE',
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        for (const product of result.data.products) {
          expect(product.category).toBe('FURNITURE');
        }
      }
    });

    it('filters by service type', async () => {
      const result = await provider.searchProducts({
        serviceType: 'ONE_TIME_SERVICE',
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        for (const product of result.data.products) {
          expect(product.serviceType).toBe('ONE_TIME_SERVICE');
        }
      }
    });

    it('filters by in-stock only', async () => {
      const result = await provider.searchProducts({
        inStockOnly: true,
      });

      expect(isSuccess(result)).toBe(true);
      if (isSuccess(result)) {
        for (const product of result.data.products) {
          expect(product.inStock).toBe(true);
        }
      }
    });
  });

  describe('getProduct', () => {
    it('returns a product by ID', async () => {
      // First get a product ID from search
      const searchResult = await provider.searchProducts({});
      expect(isSuccess(searchResult)).toBe(true);

      if (isSuccess(searchResult)) {
        const productId = searchResult.data.products[0]!.productId;
        const result = await provider.getProduct(productId);

        expect(isSuccess(result)).toBe(true);
        if (isSuccess(result)) {
          expect(result.data.productId).toBe(productId);
        }
      }
    });

    it('returns error for non-existent product', async () => {
      const result = await provider.getProduct('nonexistent');

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
      }
    });
  });

  describe('createOrder', () => {
    it('creates an order successfully', async () => {
      // Get vendor and product
      const vendorResult = await provider.searchVendors({
        address: {
          street1: '123 Main St',
          city: 'New York',
          state: 'NY',
          postalCode: '10001',
          country: 'US',
        },
      });
      expect(isSuccess(vendorResult)).toBe(true);

      const productResult = await provider.searchProducts({});
      expect(isSuccess(productResult)).toBe(true);

      if (isSuccess(vendorResult) && isSuccess(productResult)) {
        const vendor = vendorResult.data.vendors[0]!;
        const product = productResult.data.products[0]!;

        const result = await provider.createOrder({
          vendorId: vendor.vendorId,
          items: [{ productId: product.productId, quantity: 1 }],
          deliveryAddress: {
            street1: '123 Main St',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            country: 'US',
          },
          contact: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
          },
        });

        expect(isSuccess(result)).toBe(true);
        if (isSuccess(result)) {
          expect(result.data.orderId).toBeDefined();
          expect(result.data.confirmationNumber).toBeDefined();
          expect(result.data.status).toBe('CONFIRMED');
          expect(result.data.lines.length).toBe(1);
          expect(result.data.totalAmount.amount).toBeGreaterThan(0);
        }
      }
    });

    it('returns error for non-existent vendor', async () => {
      const result = await provider.createOrder({
        vendorId: 'nonexistent',
        items: [{ productId: 'product_0001', quantity: 1 }],
        deliveryAddress: {
          street1: '123 Main St',
          city: 'New York',
          state: 'NY',
          postalCode: '10001',
          country: 'US',
        },
        contact: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        },
      });

      expect(isFailure(result)).toBe(true);
      if (isFailure(result)) {
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
      }
    });
  });

  describe('getOrder', () => {
    it('retrieves an existing order', async () => {
      const vendorResult = await provider.searchVendors({
        address: {
          street1: '123 Main St',
          city: 'New York',
          state: 'NY',
          postalCode: '10001',
          country: 'US',
        },
      });
      const productResult = await provider.searchProducts({});

      expect(isSuccess(vendorResult)).toBe(true);
      expect(isSuccess(productResult)).toBe(true);

      if (isSuccess(vendorResult) && isSuccess(productResult)) {
        const createResult = await provider.createOrder({
          vendorId: vendorResult.data.vendors[0]!.vendorId,
          items: [{ productId: productResult.data.products[0]!.productId, quantity: 1 }],
          deliveryAddress: {
            street1: '123 Main St',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            country: 'US',
          },
          contact: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
          },
        });

        expect(isSuccess(createResult)).toBe(true);
        if (isSuccess(createResult)) {
          const getResult = await provider.getOrder(createResult.data.orderId);

          expect(isSuccess(getResult)).toBe(true);
          if (isSuccess(getResult)) {
            expect(getResult.data.orderId).toBe(createResult.data.orderId);
          }
        }
      }
    });
  });

  describe('cancelOrder', () => {
    it('cancels an existing order', async () => {
      const vendorResult = await provider.searchVendors({
        address: {
          street1: '123 Main St',
          city: 'New York',
          state: 'NY',
          postalCode: '10001',
          country: 'US',
        },
      });
      const productResult = await provider.searchProducts({});

      expect(isSuccess(vendorResult)).toBe(true);
      expect(isSuccess(productResult)).toBe(true);

      if (isSuccess(vendorResult) && isSuccess(productResult)) {
        const createResult = await provider.createOrder({
          vendorId: vendorResult.data.vendors[0]!.vendorId,
          items: [{ productId: productResult.data.products[0]!.productId, quantity: 1 }],
          deliveryAddress: {
            street1: '123 Main St',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            country: 'US',
          },
          contact: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
          },
        });

        expect(isSuccess(createResult)).toBe(true);
        if (isSuccess(createResult)) {
          const cancelResult = await provider.cancelOrder(createResult.data.orderId, 'Changed my mind');

          expect(isSuccess(cancelResult)).toBe(true);
          if (isSuccess(cancelResult)) {
            expect(cancelResult.data.status).toBe('CANCELLED');
          }
        }
      }
    });
  });

  describe('getAvailableSlots', () => {
    it('returns available time slots', async () => {
      const productResult = await provider.searchProducts({
        serviceType: 'ONE_TIME_SERVICE',
      });

      expect(isSuccess(productResult)).toBe(true);
      if (isSuccess(productResult) && productResult.data.products.length > 0) {
        const product = productResult.data.products[0]!;
        const result = await provider.getAvailableSlots(
          product.vendorId,
          product.productId,
          new Date()
        );

        expect(isSuccess(result)).toBe(true);
        if (isSuccess(result)) {
          expect(Array.isArray(result.data)).toBe(true);
          // Slots should be in format "HH:MM-HH:MM"
          for (const slot of result.data) {
            expect(slot).toMatch(/^\d{2}:\d{2}-\d{2}:\d{2}$/);
          }
        }
      }
    });
  });
});

describe('Deterministic Behavior', () => {
  it('produces same results for same inputs across providers', async () => {
    const address = {
      street1: '123 Main St',
      city: 'Los Angeles',
      state: 'CA',
      postalCode: '90210',
      country: 'US',
    };

    // Utilities provider
    const utilities1 = new MockUtilitiesProvider();
    const utilities2 = new MockUtilitiesProvider();

    const utilResult1 = await utilities1.getProvidersByAddress({ address });
    const utilResult2 = await utilities2.getProvidersByAddress({ address });

    expect(isSuccess(utilResult1)).toBe(true);
    expect(isSuccess(utilResult2)).toBe(true);

    if (isSuccess(utilResult1) && isSuccess(utilResult2)) {
      expect(utilResult1.data.providers.length).toBe(utilResult2.data.providers.length);
      expect(utilResult1.data.providers[0]?.name).toBe(utilResult2.data.providers[0]?.name);
    }

    // Moving provider
    const moving1 = new MockMovingProvider();
    const moving2 = new MockMovingProvider();

    const moveRequest = {
      origin: address,
      destination: { ...address, street1: '456 Oak Ave' },
      moveDate: new Date('2025-06-01'),
      moveSize: 'TWO_BEDROOM' as const,
    };

    const moveResult1 = await moving1.getQuotes(moveRequest);
    const moveResult2 = await moving2.getQuotes(moveRequest);

    expect(isSuccess(moveResult1)).toBe(true);
    expect(isSuccess(moveResult2)).toBe(true);

    if (isSuccess(moveResult1) && isSuccess(moveResult2)) {
      expect(moveResult1.data.quotes.length).toBe(moveResult2.data.quotes.length);
      expect(moveResult1.data.quotes[0]?.companyName).toBe(moveResult2.data.quotes[0]?.companyName);
      expect(moveResult1.data.quotes[0]?.totalPrice.amount).toBe(
        moveResult2.data.quotes[0]?.totalPrice.amount
      );
    }

    // Vendor provider
    const vendor1 = new MockVendorProvider();
    const vendor2 = new MockVendorProvider();

    const vendorRequest = {
      address: {
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      },
      categories: ['FURNITURE'] as VendorCategory[],
    };

    const vendorResult1 = await vendor1.searchVendors(vendorRequest);
    const vendorResult2 = await vendor2.searchVendors(vendorRequest);

    expect(isSuccess(vendorResult1)).toBe(true);
    expect(isSuccess(vendorResult2)).toBe(true);

    if (isSuccess(vendorResult1) && isSuccess(vendorResult2)) {
      expect(vendorResult1.data.vendors.length).toBe(vendorResult2.data.vendors.length);
      expect(vendorResult1.data.vendors[0]?.name).toBe(vendorResult2.data.vendors[0]?.name);
    }
  });
});
