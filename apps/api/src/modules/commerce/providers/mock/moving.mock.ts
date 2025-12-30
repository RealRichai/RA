/**
 * Mock Moving Provider
 *
 * Provides realistic mock quotes and booking for moving services.
 */

import { generatePrefixedId } from '@realriches/utils';

import type {
  IMovingProvider,
  MovingBooking,
  MovingBookingRequest,
  MovingQuote,
  MovingQuoteRequest,
  ProviderMeta,
  Result,
} from '../provider.types';
import { ok, err } from '../provider.types';

// Mock moving companies
const MOVING_COMPANIES = [
  {
    id: 'city-movers',
    name: 'City Movers',
    rating: 4.8,
    reviews: 234,
    baseMultiplier: 1.0,
    includes: ['Loading', 'Unloading', 'Basic protection'],
    durationEstimate: '3-4 hours',
    phone: '1-800-555-MOVE',
  },
  {
    id: 'quick-move',
    name: 'Quick Move NYC',
    rating: 4.6,
    reviews: 189,
    baseMultiplier: 1.15,
    includes: ['Loading', 'Unloading', 'Basic protection', 'Furniture disassembly'],
    durationEstimate: '3-5 hours',
    phone: '1-800-555-FAST',
  },
  {
    id: 'premium-relocations',
    name: 'Premium Relocations',
    rating: 4.9,
    reviews: 312,
    baseMultiplier: 1.4,
    includes: [
      'Loading',
      'Unloading',
      'Full protection',
      'Furniture disassembly',
      'Packing materials',
    ],
    durationEstimate: '4-5 hours',
    phone: '1-800-555-PREM',
  },
  {
    id: 'budget-movers',
    name: 'Budget Movers',
    rating: 4.3,
    reviews: 456,
    baseMultiplier: 0.85,
    includes: ['Loading', 'Unloading'],
    durationEstimate: '4-6 hours',
    phone: '1-800-555-SAVE',
  },
];

// Base prices by move size
const BASE_PRICES: Record<string, number> = {
  STUDIO: 300,
  ONE_BEDROOM: 500,
  TWO_BEDROOM: 800,
  THREE_PLUS: 1200,
};

// In-memory booking store
const bookingStore = new Map<string, MovingBooking>();
const quoteStore = new Map<string, MovingQuote>();

export class MockMovingProvider implements IMovingProvider {
  readonly providerId = 'mock-moving';

  private getMeta(requestId?: string): ProviderMeta {
    return {
      provider: this.providerId,
      isMock: true,
      requestId: requestId || generatePrefixedId('req'),
      timestamp: new Date(),
    };
  }

  async getQuotes(request: MovingQuoteRequest): Promise<Result<MovingQuote[]>> {
    const basePrice = BASE_PRICES[request.estimatedItems] || 500;

    // Calculate distance adjustment (mock)
    const distanceMultiplier = 1.0; // Would calculate based on addresses

    // Floor adjustment
    const floorMultiplier = request.floorNumber && request.floorNumber > 3 && !request.hasElevator
      ? 1 + (request.floorNumber - 3) * 0.05
      : 1.0;

    // Packing service adjustment
    const packingMultiplier = request.needsPacking ? 1.3 : 1.0;

    const quotes: MovingQuote[] = MOVING_COMPANIES.map((company) => {
      const price = Math.round(
        basePrice * company.baseMultiplier * distanceMultiplier * floorMultiplier * packingMultiplier
      );

      const includes = [...company.includes];
      if (request.needsPacking) {
        includes.push('Full packing service');
      }

      const quote: MovingQuote = {
        id: generatePrefixedId('mvq'),
        company: company.name,
        companyId: company.id,
        price,
        currency: 'USD',
        duration: company.durationEstimate,
        rating: company.rating,
        reviews: company.reviews,
        includes,
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      };

      // Store quote for later retrieval
      quoteStore.set(quote.id, quote);

      return quote;
    });

    // Sort by price
    quotes.sort((a, b) => a.price - b.price);

    return ok(quotes, this.getMeta());
  }

  async bookMove(request: MovingBookingRequest): Promise<Result<MovingBooking>> {
    const quote = quoteStore.get(request.quoteId);

    if (!quote) {
      return err(new Error('Quote not found or expired'), this.getMeta());
    }

    if (quote.validUntil < new Date()) {
      return err(new Error('Quote has expired'), this.getMeta());
    }

    const booking: MovingBooking = {
      id: generatePrefixedId('mvb'),
      quoteId: request.quoteId,
      companyId: quote.companyId,
      company: quote.company,
      status: 'CONFIRMED',
      confirmationCode: `MV-${Date.now().toString(36).toUpperCase()}`,
      moveDate: quote.validUntil, // Would come from original request
      price: quote.price,
      estimatedArrival: '8:00 AM - 10:00 AM',
      contactPhone: MOVING_COMPANIES.find((c) => c.id === quote.companyId)?.phone,
      createdAt: new Date(),
    };

    bookingStore.set(booking.id, booking);

    return ok(booking, this.getMeta());
  }

  async getBookingStatus(bookingId: string): Promise<Result<MovingBooking | null>> {
    const booking = bookingStore.get(bookingId) || null;
    return ok(booking, this.getMeta());
  }

  async cancelBooking(bookingId: string, _reason?: string): Promise<Result<{ refundAmount: number }>> {
    const booking = bookingStore.get(bookingId);

    if (!booking) {
      return err(new Error('Booking not found'), this.getMeta());
    }

    if (booking.status === 'CANCELLED') {
      return err(new Error('Booking already cancelled'), this.getMeta());
    }

    // Calculate refund based on cancellation timing
    const hoursUntilMove = (booking.moveDate.getTime() - Date.now()) / (1000 * 60 * 60);
    let refundPercentage = 0;

    if (hoursUntilMove > 72) {
      refundPercentage = 100;
    } else if (hoursUntilMove > 48) {
      refundPercentage = 75;
    } else if (hoursUntilMove > 24) {
      refundPercentage = 50;
    } else {
      refundPercentage = 0;
    }

    const refundAmount = Math.round(booking.price * (refundPercentage / 100));

    booking.status = 'CANCELLED';
    bookingStore.set(bookingId, booking);

    return ok({ refundAmount }, this.getMeta());
  }
}

// Singleton instance
let instance: MockMovingProvider | null = null;

export function getMockMovingProvider(): MockMovingProvider {
  if (!instance) {
    instance = new MockMovingProvider();
  }
  return instance;
}
