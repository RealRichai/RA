import { z } from 'zod';

/**
 * Standard address format for all provider requests
 */
export interface Address {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export const AddressSchema = z.object({
  street1: z.string().min(1),
  street2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(2).max(2),
  postalCode: z.string().regex(/^\d{5}(-\d{4})?$/),
  country: z.string().default('US'),
});

/**
 * Standard contact information
 */
export interface Contact {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
}

export const ContactSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
});

/**
 * Money amount with currency
 */
export interface Money {
  amount: number;
  currency: string;
}

export const MoneySchema = z.object({
  amount: z.number(),
  currency: z.string().length(3).default('USD'),
});

/**
 * Date range for scheduling
 */
export interface DateRange {
  start: Date;
  end: Date;
}

export const DateRangeSchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
});

/**
 * Provider configuration base
 */
export interface ProviderConfig {
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  sandbox?: boolean;
}

export const ProviderConfigSchema = z.object({
  providerId: z.string(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  timeoutMs: z.number().positive().optional(),
  sandbox: z.boolean().optional(),
});

/**
 * Base provider interface that all providers extend
 */
export interface BaseProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly isMock: boolean;

  healthCheck(): Promise<boolean>;
}
