import { z } from 'zod';

import type { Address, BaseProvider, Contact, Money } from '../types/common';
import { AddressSchema, ContactSchema, MoneySchema } from '../types/common';
import type { ProviderError } from '../types/errors';
import type { Result } from '../types/result';

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Request to find utility providers for an address
 */
export interface GetProvidersByAddressRequest {
  address: Address;
  utilityTypes?: UtilityType[];
  moveInDate?: Date;
}

export const GetProvidersByAddressRequestSchema = z.object({
  address: AddressSchema,
  utilityTypes: z
    .array(z.enum(['ELECTRIC', 'GAS', 'WATER', 'SEWER', 'TRASH', 'INTERNET', 'CABLE']))
    .optional(),
  moveInDate: z.coerce.date().optional(),
});

export type UtilityType =
  | 'ELECTRIC'
  | 'GAS'
  | 'WATER'
  | 'SEWER'
  | 'TRASH'
  | 'INTERNET'
  | 'CABLE';

/**
 * Utility provider information
 */
export interface UtilityProvider {
  providerId: string;
  name: string;
  type: UtilityType;
  phone?: string;
  website?: string;
  logoUrl?: string;
  averageMonthlyBill?: Money;
  supportsOnlineSetup: boolean;
  estimatedSetupDays: number;
}

export const UtilityProviderSchema = z.object({
  providerId: z.string(),
  name: z.string(),
  type: z.enum(['ELECTRIC', 'GAS', 'WATER', 'SEWER', 'TRASH', 'INTERNET', 'CABLE']),
  phone: z.string().optional(),
  website: z.string().url().optional(),
  logoUrl: z.string().url().optional(),
  averageMonthlyBill: MoneySchema.optional(),
  supportsOnlineSetup: z.boolean(),
  estimatedSetupDays: z.number().int().nonnegative(),
});

export interface GetProvidersByAddressResponse {
  providers: UtilityProvider[];
  serviceAddress: Address;
}

export const GetProvidersByAddressResponseSchema = z.object({
  providers: z.array(UtilityProviderSchema),
  serviceAddress: AddressSchema,
});

/**
 * Request to start a concierge ticket for utility setup
 */
export interface StartConciergeTicketRequest {
  address: Address;
  contact: Contact;
  moveInDate: Date;
  utilityTypes: UtilityType[];
  notes?: string;
  preferredContactMethod?: 'EMAIL' | 'PHONE' | 'SMS';
}

export const StartConciergeTicketRequestSchema = z.object({
  address: AddressSchema,
  contact: ContactSchema,
  moveInDate: z.coerce.date(),
  utilityTypes: z.array(
    z.enum(['ELECTRIC', 'GAS', 'WATER', 'SEWER', 'TRASH', 'INTERNET', 'CABLE'])
  ),
  notes: z.string().optional(),
  preferredContactMethod: z.enum(['EMAIL', 'PHONE', 'SMS']).optional(),
});

export type ConciergeTicketStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'AWAITING_INFO'
  | 'COMPLETED'
  | 'CANCELLED';

export interface ConciergeTicket {
  ticketId: string;
  status: ConciergeTicketStatus;
  createdAt: Date;
  updatedAt: Date;
  estimatedCompletionDate?: Date;
  assignedAgent?: string;
  utilitySetups: UtilitySetupStatus[];
}

export interface UtilitySetupStatus {
  utilityType: UtilityType;
  provider?: UtilityProvider;
  status: 'PENDING' | 'SCHEDULED' | 'ACTIVE' | 'FAILED';
  scheduledDate?: Date;
  accountNumber?: string;
  notes?: string;
}

export const UtilitySetupStatusSchema = z.object({
  utilityType: z.enum(['ELECTRIC', 'GAS', 'WATER', 'SEWER', 'TRASH', 'INTERNET', 'CABLE']),
  provider: UtilityProviderSchema.optional(),
  status: z.enum(['PENDING', 'SCHEDULED', 'ACTIVE', 'FAILED']),
  scheduledDate: z.coerce.date().optional(),
  accountNumber: z.string().optional(),
  notes: z.string().optional(),
});

export const ConciergeTicketSchema = z.object({
  ticketId: z.string(),
  status: z.enum(['PENDING', 'IN_PROGRESS', 'AWAITING_INFO', 'COMPLETED', 'CANCELLED']),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  estimatedCompletionDate: z.coerce.date().optional(),
  assignedAgent: z.string().optional(),
  utilitySetups: z.array(UtilitySetupStatusSchema),
});

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Utilities provider contract
 */
export interface UtilitiesProvider extends BaseProvider {
  /**
   * Get available utility providers for an address
   */
  getProvidersByAddress(
    request: GetProvidersByAddressRequest
  ): Promise<Result<GetProvidersByAddressResponse, ProviderError>>;

  /**
   * Start a concierge ticket to set up utilities
   */
  startConciergeTicket(
    request: StartConciergeTicketRequest
  ): Promise<Result<ConciergeTicket, ProviderError>>;

  /**
   * Get status of an existing concierge ticket
   */
  getConciergeTicket(
    ticketId: string
  ): Promise<Result<ConciergeTicket, ProviderError>>;

  /**
   * Cancel a concierge ticket
   */
  cancelConciergeTicket(
    ticketId: string,
    reason?: string
  ): Promise<Result<ConciergeTicket, ProviderError>>;
}
