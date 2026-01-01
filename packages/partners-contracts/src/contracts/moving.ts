import { z } from 'zod';

import type { Address, BaseProvider, Contact, DateRange, Money } from '../types/common';
import { AddressSchema, ContactSchema, DateRangeSchema, MoneySchema } from '../types/common';
import type { ProviderError } from '../types/errors';
import type { Result } from '../types/result';

// ============================================================================
// Request/Response Types
// ============================================================================

export type MoveSize = 'STUDIO' | 'ONE_BEDROOM' | 'TWO_BEDROOM' | 'THREE_BEDROOM' | 'FOUR_PLUS_BEDROOM' | 'OFFICE';
export type MoveType = 'LOCAL' | 'LONG_DISTANCE' | 'INTERNATIONAL';
export type ServiceLevel = 'BASIC' | 'STANDARD' | 'FULL_SERVICE' | 'WHITE_GLOVE';

/**
 * Request for moving quotes
 */
export interface GetQuotesRequest {
  origin: Address;
  destination: Address;
  moveDate: Date;
  flexibleDates?: DateRange;
  moveSize: MoveSize;
  moveType?: MoveType;
  serviceLevel?: ServiceLevel;
  specialItems?: SpecialItem[];
  requiresPacking?: boolean;
  requiresStorage?: boolean;
  storageDurationDays?: number;
}

export const GetQuotesRequestSchema = z.object({
  origin: AddressSchema,
  destination: AddressSchema,
  moveDate: z.coerce.date(),
  flexibleDates: DateRangeSchema.optional(),
  moveSize: z.enum(['STUDIO', 'ONE_BEDROOM', 'TWO_BEDROOM', 'THREE_BEDROOM', 'FOUR_PLUS_BEDROOM', 'OFFICE']),
  moveType: z.enum(['LOCAL', 'LONG_DISTANCE', 'INTERNATIONAL']).optional(),
  serviceLevel: z.enum(['BASIC', 'STANDARD', 'FULL_SERVICE', 'WHITE_GLOVE']).optional(),
  specialItems: z.array(z.object({
    type: z.enum(['PIANO', 'POOL_TABLE', 'HOT_TUB', 'SAFE', 'ANTIQUE', 'ARTWORK', 'VEHICLE', 'OTHER']),
    description: z.string().optional(),
    quantity: z.number().int().positive().default(1),
  })).optional(),
  requiresPacking: z.boolean().optional(),
  requiresStorage: z.boolean().optional(),
  storageDurationDays: z.number().int().positive().optional(),
});

export interface SpecialItem {
  type: 'PIANO' | 'POOL_TABLE' | 'HOT_TUB' | 'SAFE' | 'ANTIQUE' | 'ARTWORK' | 'VEHICLE' | 'OTHER';
  description?: string;
  quantity: number;
}

/**
 * Moving quote from a provider
 */
export interface MovingQuote {
  quoteId: string;
  companyId: string;
  companyName: string;
  companyLogo?: string;
  rating?: number;
  reviewCount?: number;

  // Pricing
  basePrice: Money;
  packingPrice?: Money;
  storagePrice?: Money;
  specialItemsPrice?: Money;
  insurancePrice?: Money;
  totalPrice: Money;

  // Details
  serviceLevel: ServiceLevel;
  estimatedDuration: {
    loadingHours: number;
    transitHours: number;
    unloadingHours: number;
  };
  crewSize: number;
  truckSize: string;

  // Coverage
  basicLiability: Money;
  fullValueProtection?: Money;

  // Validity
  validUntil: Date;
  availableDates: Date[];

  // Terms
  cancellationPolicy: string;
  depositRequired: Money;
}

export const MovingQuoteSchema = z.object({
  quoteId: z.string(),
  companyId: z.string(),
  companyName: z.string(),
  companyLogo: z.string().url().optional(),
  rating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().nonnegative().optional(),
  basePrice: MoneySchema,
  packingPrice: MoneySchema.optional(),
  storagePrice: MoneySchema.optional(),
  specialItemsPrice: MoneySchema.optional(),
  insurancePrice: MoneySchema.optional(),
  totalPrice: MoneySchema,
  serviceLevel: z.enum(['BASIC', 'STANDARD', 'FULL_SERVICE', 'WHITE_GLOVE']),
  estimatedDuration: z.object({
    loadingHours: z.number().positive(),
    transitHours: z.number().nonnegative(),
    unloadingHours: z.number().positive(),
  }),
  crewSize: z.number().int().positive(),
  truckSize: z.string(),
  basicLiability: MoneySchema,
  fullValueProtection: MoneySchema.optional(),
  validUntil: z.coerce.date(),
  availableDates: z.array(z.coerce.date()),
  cancellationPolicy: z.string(),
  depositRequired: MoneySchema,
});

export interface GetQuotesResponse {
  quotes: MovingQuote[];
  searchId: string;
  expiresAt: Date;
}

export const GetQuotesResponseSchema = z.object({
  quotes: z.array(MovingQuoteSchema),
  searchId: z.string(),
  expiresAt: z.coerce.date(),
});

/**
 * Request to book a move
 */
export interface BookMoveRequest {
  quoteId: string;
  moveDate: Date;
  contact: Contact;

  // Additional options
  addPacking?: boolean;
  addStorage?: boolean;
  addFullValueProtection?: boolean;

  // Payment
  paymentMethodToken?: string;

  // Notes
  originNotes?: string;
  destinationNotes?: string;
  specialInstructions?: string;
}

export const BookMoveRequestSchema = z.object({
  quoteId: z.string(),
  moveDate: z.coerce.date(),
  contact: ContactSchema,
  addPacking: z.boolean().optional(),
  addStorage: z.boolean().optional(),
  addFullValueProtection: z.boolean().optional(),
  paymentMethodToken: z.string().optional(),
  originNotes: z.string().optional(),
  destinationNotes: z.string().optional(),
  specialInstructions: z.string().optional(),
});

export type BookingStatus =
  | 'PENDING_CONFIRMATION'
  | 'CONFIRMED'
  | 'DEPOSIT_REQUIRED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export interface MoveBooking {
  bookingId: string;
  confirmationNumber: string;
  status: BookingStatus;
  quote: MovingQuote;

  // Schedule
  moveDate: Date;
  arrivalWindow: {
    start: string; // "08:00"
    end: string;   // "10:00"
  };

  // Contact
  contact: Contact;

  // Crew
  crewLeader?: string;
  crewPhone?: string;

  // Payment
  depositPaid: boolean;
  depositAmount?: Money;
  totalDue: Money;

  // Tracking
  createdAt: Date;
  updatedAt: Date;
}

export const MoveBookingSchema = z.object({
  bookingId: z.string(),
  confirmationNumber: z.string(),
  status: z.enum([
    'PENDING_CONFIRMATION',
    'CONFIRMED',
    'DEPOSIT_REQUIRED',
    'SCHEDULED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED',
  ]),
  quote: MovingQuoteSchema,
  moveDate: z.coerce.date(),
  arrivalWindow: z.object({
    start: z.string(),
    end: z.string(),
  }),
  contact: ContactSchema,
  crewLeader: z.string().optional(),
  crewPhone: z.string().optional(),
  depositPaid: z.boolean(),
  depositAmount: MoneySchema.optional(),
  totalDue: MoneySchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Moving provider contract
 */
export interface MovingProvider extends BaseProvider {
  /**
   * Get moving quotes for a move
   */
  getQuotes(
    request: GetQuotesRequest
  ): Promise<Result<GetQuotesResponse, ProviderError>>;

  /**
   * Book a move using a quote
   */
  bookMove(
    request: BookMoveRequest
  ): Promise<Result<MoveBooking, ProviderError>>;

  /**
   * Get status of a booking
   */
  getBooking(
    bookingId: string
  ): Promise<Result<MoveBooking, ProviderError>>;

  /**
   * Cancel a booking
   */
  cancelBooking(
    bookingId: string,
    reason?: string
  ): Promise<Result<MoveBooking, ProviderError>>;
}
