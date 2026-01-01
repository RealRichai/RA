import { z } from 'zod';

import type { Address, BaseProvider, Contact, Money } from '../types/common';
import { AddressSchema, ContactSchema, MoneySchema } from '../types/common';
import type { ProviderError } from '../types/errors';
import type { Result } from '../types/result';

// ============================================================================
// Request/Response Types
// ============================================================================

/**
 * Request to submit a guarantor application
 */
export interface SubmitApplicationRequest {
  // Applicant info
  applicant: Contact & {
    dateOfBirth: Date;
    ssn?: string; // Last 4 or full depending on provider
    annualIncome: number;
    employmentStatus: EmploymentStatus;
    employer?: string;
  };

  // Rental details
  rental: {
    propertyAddress: Address;
    unitNumber?: string;
    monthlyRent: number;
    leaseTermMonths: number;
    moveInDate: Date;
    securityDeposit?: number;
  };

  // Landlord/Property Manager
  landlord: Contact & {
    companyName?: string;
    address?: Address;
  };

  // Additional info
  hasExistingGuarantor?: boolean;
  previousEvictions?: number;
  bankruptcyHistory?: boolean;
  notes?: string;
}

export type EmploymentStatus =
  | 'EMPLOYED_FULL_TIME'
  | 'EMPLOYED_PART_TIME'
  | 'SELF_EMPLOYED'
  | 'STUDENT'
  | 'RETIRED'
  | 'UNEMPLOYED'
  | 'OTHER';

export const SubmitApplicationRequestSchema = z.object({
  applicant: ContactSchema.extend({
    dateOfBirth: z.coerce.date(),
    ssn: z.string().optional(),
    annualIncome: z.number().nonnegative(),
    employmentStatus: z.enum([
      'EMPLOYED_FULL_TIME',
      'EMPLOYED_PART_TIME',
      'SELF_EMPLOYED',
      'STUDENT',
      'RETIRED',
      'UNEMPLOYED',
      'OTHER',
    ]),
    employer: z.string().optional(),
  }),
  rental: z.object({
    propertyAddress: AddressSchema,
    unitNumber: z.string().optional(),
    monthlyRent: z.number().positive(),
    leaseTermMonths: z.number().int().positive(),
    moveInDate: z.coerce.date(),
    securityDeposit: z.number().nonnegative().optional(),
  }),
  landlord: ContactSchema.extend({
    companyName: z.string().optional(),
    address: AddressSchema.optional(),
  }),
  hasExistingGuarantor: z.boolean().optional(),
  previousEvictions: z.number().int().nonnegative().optional(),
  bankruptcyHistory: z.boolean().optional(),
  notes: z.string().optional(),
});

export type ApplicationStatus =
  | 'SUBMITTED'
  | 'PENDING_REVIEW'
  | 'PENDING_INFO'
  | 'APPROVED'
  | 'CONDITIONALLY_APPROVED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED';

export type DeclineReason =
  | 'INSUFFICIENT_INCOME'
  | 'CREDIT_HISTORY'
  | 'EVICTION_HISTORY'
  | 'BANKRUPTCY'
  | 'RENT_TO_INCOME_RATIO'
  | 'INCOMPLETE_APPLICATION'
  | 'FRAUD_SUSPECTED'
  | 'SERVICE_AREA'
  | 'OTHER';

/**
 * Guarantor application response
 */
export interface GuarantorApplication {
  applicationId: string;
  status: ApplicationStatus;

  // Applicant
  applicant: Contact;

  // Rental
  rental: {
    propertyAddress: Address;
    monthlyRent: Money;
    leaseTermMonths: number;
  };

  // Decision
  decision?: {
    status: 'APPROVED' | 'CONDITIONALLY_APPROVED' | 'DECLINED';
    decisionDate: Date;
    declineReasons?: DeclineReason[];
    conditions?: string[];
  };

  // Pricing (if approved)
  pricing?: {
    coverageAmount: Money; // Total lease value covered
    oneTimeFee: Money;
    monthlyFee?: Money;
    feeType: 'ONE_TIME' | 'MONTHLY' | 'HYBRID';
  };

  // Coverage details
  coverage?: {
    maxCoverage: Money;
    coverageMonths: number;
    includedCoverages: CoverageType[];
  };

  // Required actions
  requiredDocuments?: RequiredDocument[];
  requiredActions?: RequiredAction[];

  // Tracking
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export type CoverageType =
  | 'UNPAID_RENT'
  | 'LEASE_BREAK'
  | 'PROPERTY_DAMAGE'
  | 'LEGAL_FEES'
  | 'EVICTION_COSTS';

export interface RequiredDocument {
  type: 'PAYSTUB' | 'TAX_RETURN' | 'BANK_STATEMENT' | 'EMPLOYMENT_LETTER' | 'ID' | 'OTHER';
  description: string;
  required: boolean;
  uploaded: boolean;
  documentId?: string;
}

export interface RequiredAction {
  type: 'UPLOAD_DOCUMENT' | 'VERIFY_INCOME' | 'SIGN_AGREEMENT' | 'COMPLETE_INTERVIEW' | 'PAY_FEE';
  description: string;
  completed: boolean;
  completedAt?: Date;
  url?: string;
}

export const RequiredDocumentSchema = z.object({
  type: z.enum(['PAYSTUB', 'TAX_RETURN', 'BANK_STATEMENT', 'EMPLOYMENT_LETTER', 'ID', 'OTHER']),
  description: z.string(),
  required: z.boolean(),
  uploaded: z.boolean(),
  documentId: z.string().optional(),
});

export const RequiredActionSchema = z.object({
  type: z.enum(['UPLOAD_DOCUMENT', 'VERIFY_INCOME', 'SIGN_AGREEMENT', 'COMPLETE_INTERVIEW', 'PAY_FEE']),
  description: z.string(),
  completed: z.boolean(),
  completedAt: z.coerce.date().optional(),
  url: z.string().url().optional(),
});

export const GuarantorApplicationSchema = z.object({
  applicationId: z.string(),
  status: z.enum([
    'SUBMITTED',
    'PENDING_REVIEW',
    'PENDING_INFO',
    'APPROVED',
    'CONDITIONALLY_APPROVED',
    'DECLINED',
    'EXPIRED',
    'CANCELLED',
  ]),
  applicant: ContactSchema,
  rental: z.object({
    propertyAddress: AddressSchema,
    monthlyRent: MoneySchema,
    leaseTermMonths: z.number().int().positive(),
  }),
  decision: z.object({
    status: z.enum(['APPROVED', 'CONDITIONALLY_APPROVED', 'DECLINED']),
    decisionDate: z.coerce.date(),
    declineReasons: z.array(z.enum([
      'INSUFFICIENT_INCOME',
      'CREDIT_HISTORY',
      'EVICTION_HISTORY',
      'BANKRUPTCY',
      'RENT_TO_INCOME_RATIO',
      'INCOMPLETE_APPLICATION',
      'FRAUD_SUSPECTED',
      'SERVICE_AREA',
      'OTHER',
    ])).optional(),
    conditions: z.array(z.string()).optional(),
  }).optional(),
  pricing: z.object({
    coverageAmount: MoneySchema,
    oneTimeFee: MoneySchema,
    monthlyFee: MoneySchema.optional(),
    feeType: z.enum(['ONE_TIME', 'MONTHLY', 'HYBRID']),
  }).optional(),
  coverage: z.object({
    maxCoverage: MoneySchema,
    coverageMonths: z.number().int().positive(),
    includedCoverages: z.array(z.enum([
      'UNPAID_RENT',
      'LEASE_BREAK',
      'PROPERTY_DAMAGE',
      'LEGAL_FEES',
      'EVICTION_COSTS',
    ])),
  }).optional(),
  requiredDocuments: z.array(RequiredDocumentSchema).optional(),
  requiredActions: z.array(RequiredActionSchema).optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  expiresAt: z.coerce.date().optional(),
});

/**
 * Poll status request (for async processing)
 */
export interface PollStatusRequest {
  applicationId: string;
  includeDetails?: boolean;
}

export const PollStatusRequestSchema = z.object({
  applicationId: z.string(),
  includeDetails: z.boolean().optional(),
});

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Guarantor provider contract
 */
export interface GuarantorProvider extends BaseProvider {
  /**
   * Submit a guarantor application
   */
  submitApplication(
    request: SubmitApplicationRequest
  ): Promise<Result<GuarantorApplication, ProviderError>>;

  /**
   * Poll application status
   */
  pollStatus(
    request: PollStatusRequest
  ): Promise<Result<GuarantorApplication, ProviderError>>;

  /**
   * Get full application details
   */
  getApplication(
    applicationId: string
  ): Promise<Result<GuarantorApplication, ProviderError>>;

  /**
   * Upload a required document
   */
  uploadDocument(
    applicationId: string,
    documentType: RequiredDocument['type'],
    file: { name: string; content: Buffer; mimeType: string }
  ): Promise<Result<RequiredDocument, ProviderError>>;

  /**
   * Accept terms and activate coverage
   */
  acceptTerms(
    applicationId: string,
    paymentMethodToken?: string
  ): Promise<Result<GuarantorApplication, ProviderError>>;

  /**
   * Cancel an application
   */
  cancelApplication(
    applicationId: string,
    reason?: string
  ): Promise<Result<GuarantorApplication, ProviderError>>;
}
