import type {
  BookMoveRequest,
  GetQuotesRequest,
  GetQuotesResponse,
  MoveBooking,
  MovingProvider,
  MovingQuote,
  ServiceLevel,
} from '../contracts/moving';
import type { ProviderError } from '../types/errors';
import { createProviderError } from '../types/errors';
import type { Result } from '../types/result';
import { failure, success } from '../types/result';

import { BaseMockProvider, createSeed, SeededRandom } from './base';

const MOCK_MOVING_COMPANIES = [
  { id: 'two_guys', name: 'Two Guys and a Truck', rating: 4.5 },
  { id: 'metro_movers', name: 'Metro Movers', rating: 4.2 },
  { id: 'swift_relocations', name: 'Swift Relocations', rating: 4.7 },
  { id: 'budget_moves', name: 'Budget Moves LLC', rating: 3.9 },
  { id: 'premium_moving', name: 'Premium Moving Co', rating: 4.8 },
];

const BASE_PRICES: Record<string, number> = {
  STUDIO: 400,
  ONE_BEDROOM: 600,
  TWO_BEDROOM: 900,
  THREE_BEDROOM: 1200,
  FOUR_PLUS_BEDROOM: 1800,
  OFFICE: 2000,
};

const SERVICE_MULTIPLIERS: Record<ServiceLevel, number> = {
  BASIC: 1.0,
  STANDARD: 1.3,
  FULL_SERVICE: 1.8,
  WHITE_GLOVE: 2.5,
};

/**
 * Mock implementation of MovingProvider
 */
export class MockMovingProvider
  extends BaseMockProvider
  implements MovingProvider
{
  private quotes: Map<string, MovingQuote> = new Map();
  private bookings: Map<string, MoveBooking> = new Map();

  constructor(options?: { simulateLatency?: boolean }) {
    super('mock_moving', 'Mock Moving Provider', options);
  }

  async getQuotes(
    request: GetQuotesRequest
  ): Promise<Result<GetQuotesResponse, ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed(request);
    const rng = new SeededRandom(seed);

    await this.maybeDelay();

    const basePrice = BASE_PRICES[request.moveSize] ?? 800;
    const serviceLevel = request.serviceLevel ?? 'STANDARD';
    const numQuotes = rng.nextInt(2, 4);

    const quotes: MovingQuote[] = [];

    for (let i = 0; i < numQuotes; i++) {
      const company = rng.pick(MOCK_MOVING_COMPANIES);
      const priceVariation = rng.nextFloat(0.85, 1.15);
      const price = basePrice * SERVICE_MULTIPLIERS[serviceLevel] * priceVariation;

      const quoteId = rng.nextId('quote');
      const quote: MovingQuote = {
        quoteId,
        companyId: company.id,
        companyName: company.name,
        rating: company.rating,
        reviewCount: rng.nextInt(50, 500),

        basePrice: { amount: Math.round(price), currency: 'USD' },
        packingPrice: request.requiresPacking
          ? { amount: Math.round(price * 0.3), currency: 'USD' }
          : undefined,
        storagePrice: request.requiresStorage
          ? { amount: Math.round((request.storageDurationDays ?? 30) * 5), currency: 'USD' }
          : undefined,
        totalPrice: {
          amount: Math.round(
            price +
              (request.requiresPacking ? price * 0.3 : 0) +
              (request.requiresStorage ? (request.storageDurationDays ?? 30) * 5 : 0)
          ),
          currency: 'USD',
        },

        serviceLevel,
        estimatedDuration: {
          loadingHours: rng.nextInt(2, 4),
          transitHours: rng.nextInt(1, 8),
          unloadingHours: rng.nextInt(2, 4),
        },
        crewSize: rng.nextInt(2, 4),
        truckSize: rng.pick(['16ft', '20ft', '26ft']),

        basicLiability: { amount: 10000, currency: 'USD' },
        fullValueProtection: { amount: 50000, currency: 'USD' },

        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        availableDates: [
          request.moveDate,
          new Date(request.moveDate.getTime() + 24 * 60 * 60 * 1000),
          new Date(request.moveDate.getTime() + 48 * 60 * 60 * 1000),
        ],

        cancellationPolicy: 'Free cancellation up to 48 hours before move date',
        depositRequired: { amount: Math.round(price * 0.2), currency: 'USD' },
      };

      this.quotes.set(quoteId, quote);
      quotes.push(quote);
    }

    return success(
      {
        quotes,
        searchId: rng.nextId('search'),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      this.createMetadata(seed, startTime)
    );
  }

  async bookMove(
    request: BookMoveRequest
  ): Promise<Result<MoveBooking, ProviderError>> {
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

    if (new Date() > quote.validUntil) {
      return failure(
        createProviderError('RESOURCE_EXPIRED', 'Quote has expired'),
        this.createMetadata(seed, startTime)
      );
    }

    const bookingId = rng.nextId('book');
    const booking: MoveBooking = {
      bookingId,
      confirmationNumber: rng.nextConfirmation(),
      status: 'CONFIRMED',
      quote,
      moveDate: request.moveDate,
      arrivalWindow: {
        start: '08:00',
        end: '10:00',
      },
      contact: request.contact,
      crewLeader: `Driver ${rng.nextInt(100, 999)}`,
      crewPhone: `1-555-${rng.nextInt(100, 999)}-${rng.nextInt(1000, 9999)}`,
      depositPaid: !!request.paymentMethodToken,
      depositAmount: quote.depositRequired,
      totalDue: quote.totalPrice,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.bookings.set(bookingId, booking);

    return success(booking, this.createMetadata(seed, startTime));
  }

  async getBooking(
    bookingId: string
  ): Promise<Result<MoveBooking, ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed({ bookingId });

    await this.maybeDelay();

    const booking = this.bookings.get(bookingId);

    if (!booking) {
      return failure(
        createProviderError('RESOURCE_NOT_FOUND', `Booking ${bookingId} not found`),
        this.createMetadata(seed, startTime)
      );
    }

    return success(booking, this.createMetadata(seed, startTime));
  }

  async cancelBooking(
    bookingId: string,
    reason?: string
  ): Promise<Result<MoveBooking, ProviderError>> {
    const startTime = Date.now();
    const seed = createSeed({ bookingId, reason });

    await this.maybeDelay();

    const booking = this.bookings.get(bookingId);

    if (!booking) {
      return failure(
        createProviderError('RESOURCE_NOT_FOUND', `Booking ${bookingId} not found`),
        this.createMetadata(seed, startTime)
      );
    }

    const updatedBooking: MoveBooking = {
      ...booking,
      status: 'CANCELLED',
      updatedAt: new Date(),
    };

    this.bookings.set(bookingId, updatedBooking);

    return success(updatedBooking, this.createMetadata(seed, startTime));
  }
}
