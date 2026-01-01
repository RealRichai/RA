import { z } from 'zod';

import type { Address, BaseProvider, Contact, Money } from '../types/common';
import { AddressSchema, ContactSchema, MoneySchema } from '../types/common';
import type { ProviderError } from '../types/errors';
import type { Result } from '../types/result';

// ============================================================================
// Request/Response Types
// ============================================================================

export type InsuranceType = 'RENTERS' | 'LANDLORD' | 'LIABILITY' | 'UMBRELLA';
export type PropertyType = 'APARTMENT' | 'CONDO' | 'SINGLE_FAMILY' | 'TOWNHOUSE' | 'MULTI_FAMILY';
export type PaymentFrequency = 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';

/**
 * Request for insurance quote
 */
export interface QuotePolicyRequest {
  // Insured info
  insured: Contact & {
    dateOfBirth?: Date;
  };

  // Property info
  property: {
    address: Address;
    type: PropertyType;
    yearBuilt?: number;
    squareFeet?: number;
    numberOfUnits?: number;
  };

  // Coverage requirements
  coverage: {
    type: InsuranceType;
    personalPropertyLimit?: number;
    liabilityLimit: number;
    deductible: number;
    additionalCoverages?: AdditionalCoverage[];
  };

  // Policy term
  effectiveDate: Date;
  termMonths: 6 | 12;
}

export interface AdditionalCoverage {
  type: 'FLOOD' | 'EARTHQUAKE' | 'IDENTITY_THEFT' | 'VALUABLE_ITEMS' | 'PET_LIABILITY' | 'WATER_BACKUP';
  limit?: number;
}

export const AdditionalCoverageSchema = z.object({
  type: z.enum(['FLOOD', 'EARTHQUAKE', 'IDENTITY_THEFT', 'VALUABLE_ITEMS', 'PET_LIABILITY', 'WATER_BACKUP']),
  limit: z.number().positive().optional(),
});

export const QuotePolicyRequestSchema = z.object({
  insured: ContactSchema.extend({
    dateOfBirth: z.coerce.date().optional(),
  }),
  property: z.object({
    address: AddressSchema,
    type: z.enum(['APARTMENT', 'CONDO', 'SINGLE_FAMILY', 'TOWNHOUSE', 'MULTI_FAMILY']),
    yearBuilt: z.number().int().min(1800).max(new Date().getFullYear()).optional(),
    squareFeet: z.number().positive().optional(),
    numberOfUnits: z.number().int().positive().optional(),
  }),
  coverage: z.object({
    type: z.enum(['RENTERS', 'LANDLORD', 'LIABILITY', 'UMBRELLA']),
    personalPropertyLimit: z.number().positive().optional(),
    liabilityLimit: z.number().positive(),
    deductible: z.number().nonnegative(),
    additionalCoverages: z.array(AdditionalCoverageSchema).optional(),
  }),
  effectiveDate: z.coerce.date(),
  termMonths: z.union([z.literal(6), z.literal(12)]),
});

/**
 * Insurance quote from provider
 */
export interface InsuranceQuote {
  quoteId: string;
  carrierId: string;
  carrierName: string;
  carrierLogo?: string;
  carrierRating?: string; // "A+" etc.

  // Premium
  premium: {
    annual: Money;
    monthly: Money;
    paymentOptions: PaymentOption[];
  };

  // Coverage details
  coverage: {
    type: InsuranceType;
    personalProperty?: Money;
    liability: Money;
    medicalPayments?: Money;
    lossOfUse?: Money;
    deductible: Money;
    additionalCoverages: {
      type: string;
      limit: Money;
      premium: Money;
    }[];
  };

  // Policy details
  effectiveDate: Date;
  expirationDate: Date;

  // Quote validity
  validUntil: Date;

  // Requirements for purchase
  requiresInspection: boolean;
  requiredDocuments: string[];
  disclosures: string[];
}

export interface PaymentOption {
  frequency: PaymentFrequency;
  amount: Money;
  totalAnnual: Money;
  processingFee?: Money;
}

export const PaymentOptionSchema = z.object({
  frequency: z.enum(['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']),
  amount: MoneySchema,
  totalAnnual: MoneySchema,
  processingFee: MoneySchema.optional(),
});

export const InsuranceQuoteSchema = z.object({
  quoteId: z.string(),
  carrierId: z.string(),
  carrierName: z.string(),
  carrierLogo: z.string().url().optional(),
  carrierRating: z.string().optional(),
  premium: z.object({
    annual: MoneySchema,
    monthly: MoneySchema,
    paymentOptions: z.array(PaymentOptionSchema),
  }),
  coverage: z.object({
    type: z.enum(['RENTERS', 'LANDLORD', 'LIABILITY', 'UMBRELLA']),
    personalProperty: MoneySchema.optional(),
    liability: MoneySchema,
    medicalPayments: MoneySchema.optional(),
    lossOfUse: MoneySchema.optional(),
    deductible: MoneySchema,
    additionalCoverages: z.array(z.object({
      type: z.string(),
      limit: MoneySchema,
      premium: MoneySchema,
    })),
  }),
  effectiveDate: z.coerce.date(),
  expirationDate: z.coerce.date(),
  validUntil: z.coerce.date(),
  requiresInspection: z.boolean(),
  requiredDocuments: z.array(z.string()),
  disclosures: z.array(z.string()),
});

/**
 * Request to purchase a policy
 */
export interface PurchasePolicyRequest {
  quoteId: string;

  // Payment
  paymentMethod: {
    type: 'CARD' | 'ACH' | 'CHECK';
    token?: string;
    frequency: PaymentFrequency;
  };

  // Additional info
  additionalInsured?: Contact[];
  mortgagee?: {
    name: string;
    address: Address;
    loanNumber?: string;
  };

  // Consent
  electronicDeliveryConsent: boolean;
  termsAccepted: boolean;
  disclosuresAccepted: boolean;
}

export const PurchasePolicyRequestSchema = z.object({
  quoteId: z.string(),
  paymentMethod: z.object({
    type: z.enum(['CARD', 'ACH', 'CHECK']),
    token: z.string().optional(),
    frequency: z.enum(['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']),
  }),
  additionalInsured: z.array(ContactSchema).optional(),
  mortgagee: z.object({
    name: z.string(),
    address: AddressSchema,
    loanNumber: z.string().optional(),
  }).optional(),
  electronicDeliveryConsent: z.boolean(),
  termsAccepted: z.boolean(),
  disclosuresAccepted: z.boolean(),
});

export type PolicyStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'LAPSED'
  | 'PENDING_CANCELLATION';

export interface InsurancePolicy {
  policyId: string;
  policyNumber: string;
  status: PolicyStatus;

  // Carrier
  carrierId: string;
  carrierName: string;

  // Coverage (from quote)
  quote: InsuranceQuote;

  // Insured
  insured: Contact;
  additionalInsured: Contact[];

  // Dates
  effectiveDate: Date;
  expirationDate: Date;
  issuedDate: Date;

  // Payment
  nextPaymentDate?: Date;
  nextPaymentAmount?: Money;
  paymentMethod: string;

  // Documents
  documents: PolicyDocument[];

  // Tracking
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyDocument {
  documentId: string;
  type: 'DECLARATIONS' | 'POLICY' | 'ID_CARD' | 'CERTIFICATE' | 'ENDORSEMENT';
  name: string;
  url: string;
  createdAt: Date;
}

export const PolicyDocumentSchema = z.object({
  documentId: z.string(),
  type: z.enum(['DECLARATIONS', 'POLICY', 'ID_CARD', 'CERTIFICATE', 'ENDORSEMENT']),
  name: z.string(),
  url: z.string().url(),
  createdAt: z.coerce.date(),
});

export const InsurancePolicySchema = z.object({
  policyId: z.string(),
  policyNumber: z.string(),
  status: z.enum(['PENDING', 'ACTIVE', 'CANCELLED', 'EXPIRED', 'LAPSED', 'PENDING_CANCELLATION']),
  carrierId: z.string(),
  carrierName: z.string(),
  quote: InsuranceQuoteSchema,
  insured: ContactSchema,
  additionalInsured: z.array(ContactSchema),
  effectiveDate: z.coerce.date(),
  expirationDate: z.coerce.date(),
  issuedDate: z.coerce.date(),
  nextPaymentDate: z.coerce.date().optional(),
  nextPaymentAmount: MoneySchema.optional(),
  paymentMethod: z.string(),
  documents: z.array(PolicyDocumentSchema),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Insurance provider contract
 */
export interface InsuranceProvider extends BaseProvider {
  /**
   * Get an insurance quote
   */
  quotePolicy(
    request: QuotePolicyRequest
  ): Promise<Result<InsuranceQuote, ProviderError>>;

  /**
   * Get multiple quotes from different carriers
   */
  getQuotes(
    request: QuotePolicyRequest
  ): Promise<Result<InsuranceQuote[], ProviderError>>;

  /**
   * Purchase a policy using a quote
   */
  purchasePolicy(
    request: PurchasePolicyRequest
  ): Promise<Result<InsurancePolicy, ProviderError>>;

  /**
   * Get policy details
   */
  getPolicy(
    policyId: string
  ): Promise<Result<InsurancePolicy, ProviderError>>;

  /**
   * Cancel a policy
   */
  cancelPolicy(
    policyId: string,
    effectiveDate: Date,
    reason?: string
  ): Promise<Result<InsurancePolicy, ProviderError>>;

  /**
   * Get certificate of insurance
   */
  getCertificate(
    policyId: string,
    certificateHolder?: Contact & { address: Address }
  ): Promise<Result<PolicyDocument, ProviderError>>;
}
