import type {
  ConciergeTicket,
  GetProvidersByAddressRequest,
  GetProvidersByAddressResponse,
  StartConciergeTicketRequest,
  UtilitiesProvider,
  UtilityProvider,
  UtilityType,
} from '../contracts/utilities';
import type { ProviderError } from '../types/errors';
import { createProviderError } from '../types/errors';
import type { Result } from '../types/result';
import { failure, success } from '../types/result';

import { BaseMockProvider, createSeed, SeededRandom } from './base';

const MOCK_UTILITY_COMPANIES: Record<UtilityType, string[]> = {
  ELECTRIC: ['City Power & Light', 'Green Energy Co', 'Metro Electric'],
  GAS: ['Natural Gas Corp', 'City Gas Company', 'Clean Energy Gas'],
  WATER: ['Municipal Water District', 'City Water Authority'],
  SEWER: ['City Sewer Services', 'Metro Wastewater'],
  TRASH: ['Waste Management Inc', 'City Sanitation', 'Green Recycling Co'],
  INTERNET: ['Fiber Connect', 'Metro Broadband', 'SpeedNet', 'Cable Internet Plus'],
  CABLE: ['Cable Vision', 'Metro Cable', 'Entertainment Networks'],
};

/**
 * Mock implementation of UtilitiesProvider
 * Generates deterministic responses based on input
 */
export class MockUtilitiesProvider
  extends BaseMockProvider
  implements UtilitiesProvider
{
  private tickets: Map<string, ConciergeTicket> = new Map();

  constructor(options?: { simulateLatency?: boolean }) {
    super('mock_utilities', 'Mock Utilities Provider', options);
  }

  async getProvidersByAddress(
    request: GetProvidersByAddressRequest
  ): Promise<Result<GetProvidersByAddressResponse, ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed(request);
    const rng = new SeededRandom(seed);

    await this.maybeDelay();

    const utilityTypes: UtilityType[] = request.utilityTypes ?? [
      'ELECTRIC',
      'GAS',
      'WATER',
      'SEWER',
      'TRASH',
      'INTERNET',
    ];

    const providers: UtilityProvider[] = utilityTypes.map((type) => {
      const companies = MOCK_UTILITY_COMPANIES[type];
      const company = rng.pick(companies);

      return {
        providerId: rng.nextId('util'),
        name: company,
        type,
        phone: `1-800-${rng.nextInt(100, 999)}-${rng.nextInt(1000, 9999)}`,
        website: `https://www.${company.toLowerCase().replace(/\s+/g, '')}.com`,
        averageMonthlyBill: {
          amount: rng.nextFloat(30, 200),
          currency: 'USD',
        },
        supportsOnlineSetup: rng.next() > 0.3,
        estimatedSetupDays: rng.nextInt(1, 5),
      };
    });

    return success(
      {
        providers,
        serviceAddress: request.address,
      },
      this.createMetadata(seed, startTime)
    );
  }

  async startConciergeTicket(
    request: StartConciergeTicketRequest
  ): Promise<Result<ConciergeTicket, ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed(request);
    const rng = new SeededRandom(seed);

    await this.maybeDelay();

    const ticketId = rng.nextId('tkt');
    const now = new Date();

    const ticket: ConciergeTicket = {
      ticketId,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
      estimatedCompletionDate: new Date(
        now.getTime() + rng.nextInt(3, 7) * 24 * 60 * 60 * 1000
      ),
      assignedAgent: `Agent ${rng.nextInt(100, 999)}`,
      utilitySetups: request.utilityTypes.map((type) => ({
        utilityType: type,
        status: 'PENDING' as const,
      })),
    };

    this.tickets.set(ticketId, ticket);

    return success(ticket, this.createMetadata(seed, startTime));
  }

  async getConciergeTicket(
    ticketId: string
  ): Promise<Result<ConciergeTicket, ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed({ ticketId });

    await this.maybeDelay();

    const ticket = this.tickets.get(ticketId);

    if (!ticket) {
      return failure(
        createProviderError('RESOURCE_NOT_FOUND', `Ticket ${ticketId} not found`),
        this.createMetadata(seed, startTime)
      );
    }

    return success(ticket, this.createMetadata(seed, startTime));
  }

  async cancelConciergeTicket(
    ticketId: string,
    reason?: string
  ): Promise<Result<ConciergeTicket, ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed({ ticketId, reason });

    await this.maybeDelay();

    const ticket = this.tickets.get(ticketId);

    if (!ticket) {
      return failure(
        createProviderError('RESOURCE_NOT_FOUND', `Ticket ${ticketId} not found`),
        this.createMetadata(seed, startTime)
      );
    }

    const updatedTicket: ConciergeTicket = {
      ...ticket,
      status: 'CANCELLED',
      updatedAt: new Date(),
    };

    this.tickets.set(ticketId, updatedTicket);

    return success(updatedTicket, this.createMetadata(seed, startTime));
  }
}
