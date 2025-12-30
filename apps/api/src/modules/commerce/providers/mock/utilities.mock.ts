/**
 * Mock Utilities Provider
 *
 * Provides realistic mock data for utility provider lookups
 * and concierge ticket management.
 */

import { generatePrefixedId } from '@realriches/utils';

import type {
  ConciergeTicket,
  ConciergeTicketRequest,
  IUtilitiesProvider,
  ProviderMeta,
  Result,
  UtilityProvider,
  UtilityProviderQuery,
  UtilityType,
} from '../provider.types';
import { ok } from '../provider.types';

// Mock provider database by region
const MOCK_PROVIDERS: Record<string, UtilityProvider[]> = {
  // NYC area
  '10001': [
    {
      id: 'con-ed',
      name: 'Con Edison',
      types: ['ELECTRIC', 'GAS'],
      website: 'https://coned.com',
      phone: '1-800-752-6633',
      logoUrl: 'https://assets.coned.com/logo.png',
      averageSetupTime: '2-3 business days',
    },
    {
      id: 'national-grid',
      name: 'National Grid',
      types: ['GAS'],
      website: 'https://nationalgrid.com',
      phone: '1-800-930-5003',
      averageSetupTime: '3-5 business days',
    },
    {
      id: 'spectrum',
      name: 'Spectrum',
      types: ['INTERNET', 'CABLE'],
      website: 'https://spectrum.com',
      phone: '1-844-222-0718',
      averageSetupTime: '1-2 business days',
    },
    {
      id: 'verizon-fios',
      name: 'Verizon Fios',
      types: ['INTERNET', 'CABLE'],
      website: 'https://verizon.com/fios',
      phone: '1-800-837-4966',
      averageSetupTime: '1-3 business days',
    },
    {
      id: 'nyc-water',
      name: 'NYC Water Board',
      types: ['WATER'],
      website: 'https://www1.nyc.gov/site/dep',
      phone: '311',
      averageSetupTime: 'Automatic with lease',
    },
  ],
  // LA area
  '90001': [
    {
      id: 'ladwp',
      name: 'LADWP',
      types: ['ELECTRIC', 'WATER'],
      website: 'https://ladwp.com',
      phone: '1-800-342-5397',
      averageSetupTime: '2-3 business days',
    },
    {
      id: 'socal-gas',
      name: 'SoCal Gas',
      types: ['GAS'],
      website: 'https://socalgas.com',
      phone: '1-800-427-2200',
      averageSetupTime: '2-4 business days',
    },
    {
      id: 'spectrum-la',
      name: 'Spectrum',
      types: ['INTERNET', 'CABLE'],
      website: 'https://spectrum.com',
      phone: '1-844-222-0718',
      averageSetupTime: '1-2 business days',
    },
  ],
  // Default/fallback
  default: [
    {
      id: 'generic-electric',
      name: 'Local Electric Utility',
      types: ['ELECTRIC'],
      website: 'https://example.com',
      phone: '1-800-555-0100',
      averageSetupTime: '3-5 business days',
    },
    {
      id: 'generic-gas',
      name: 'Local Gas Company',
      types: ['GAS'],
      website: 'https://example.com',
      phone: '1-800-555-0200',
      averageSetupTime: '3-5 business days',
    },
    {
      id: 'generic-internet',
      name: 'Local Internet Provider',
      types: ['INTERNET', 'CABLE'],
      website: 'https://example.com',
      phone: '1-800-555-0300',
      averageSetupTime: '2-3 business days',
    },
  ],
};

// In-memory ticket store for mock
const ticketStore = new Map<string, ConciergeTicket>();

export class MockUtilitiesProvider implements IUtilitiesProvider {
  readonly providerId = 'mock-utilities';

  private getMeta(requestId?: string): ProviderMeta {
    return {
      provider: this.providerId,
      isMock: true,
      requestId: requestId || generatePrefixedId('req'),
      timestamp: new Date(),
    };
  }

  async getProvidersByAddress(query: UtilityProviderQuery): Promise<Result<UtilityProvider[]>> {
    // Look up providers by zip code prefix or use default
    const zipPrefix = query.zipCode.substring(0, 5);
    let providers = MOCK_PROVIDERS[zipPrefix] || MOCK_PROVIDERS['default'];

    // Filter by utility type if specified
    if (query.utilityType) {
      providers = providers.filter((p) => p.types.includes(query.utilityType as UtilityType));
    }

    return ok(providers, this.getMeta());
  }

  async startConciergeTicket(request: ConciergeTicketRequest): Promise<Result<ConciergeTicket>> {
    const ticket: ConciergeTicket = {
      id: generatePrefixedId('utl'),
      userId: request.userId,
      leaseId: request.leaseId,
      utilityType: request.utilityType,
      provider: request.provider,
      address: request.address,
      transferDate: request.transferDate,
      status: 'PENDING',
      providerReferenceId: `UTL-${Date.now().toString(36).toUpperCase()}`,
      notes: request.notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store in mock database
    ticketStore.set(ticket.id, ticket);

    // Simulate async processing - update to IN_PROGRESS after "processing"
    setTimeout(() => {
      const stored = ticketStore.get(ticket.id);
      if (stored && stored.status === 'PENDING') {
        stored.status = 'IN_PROGRESS';
        stored.updatedAt = new Date();
        ticketStore.set(ticket.id, stored);
      }
    }, 2000);

    return ok(ticket, this.getMeta());
  }

  async getTicketStatus(ticketId: string): Promise<Result<ConciergeTicket | null>> {
    const ticket = ticketStore.get(ticketId) || null;
    return ok(ticket, this.getMeta());
  }
}

// Singleton instance
let instance: MockUtilitiesProvider | null = null;

export function getMockUtilitiesProvider(): MockUtilitiesProvider {
  if (!instance) {
    instance = new MockUtilitiesProvider();
  }
  return instance;
}
