/**
 * Leases Schemas
 * Zod validation schemas for lease management
 */

import { z } from 'zod';
import { LeaseStatus } from '@prisma/client';

export const LeaseStatusEnum = z.nativeEnum(LeaseStatus);

// =============================================================================
// CREATE LEASE
// =============================================================================

export const CreateLeaseSchema = z.object({
  applicationId: z.string().cuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  monthlyRent: z.number().min(0),
  securityDeposit: z.number().min(0),
  prorationAmount: z.number().min(0).optional(),
  prorationDescription: z.string().max(500).optional(),

  // Lease terms
  lateFeeDays: z.number().int().min(0).max(30).default(5),
  lateFeeAmount: z.number().min(0).optional(),
  lateFeePercent: z.number().min(0).max(100).optional(),
  earlyTerminationNotice: z.number().int().min(30).max(180).default(60),
  earlyTerminationFee: z.number().min(0).optional(),

  // Pet deposit
  petDeposit: z.number().min(0).optional(),
  petRentMonthly: z.number().min(0).optional(),

  // Move-in
  moveInDate: z.coerce.date(),

  // Documents
  leaseDocumentUrl: z.string().url().optional(),
  additionalDocuments: z.array(z.object({
    name: z.string(),
    url: z.string().url(),
    type: z.string(),
  })).optional(),

  // Notes
  specialTerms: z.string().max(5000).optional(),
})
  .refine(data => data.endDate > data.startDate, {
    message: 'End date must be after start date',
    path: ['endDate'],
  });

export type CreateLeaseInput = z.infer<typeof CreateLeaseSchema>;

// =============================================================================
// UPDATE LEASE
// =============================================================================

export const UpdateLeaseSchema = z.object({
  monthlyRent: z.number().min(0).optional(),
  lateFeeDays: z.number().int().min(0).max(30).optional(),
  lateFeeAmount: z.number().min(0).optional(),
  lateFeePercent: z.number().min(0).max(100).optional(),
  specialTerms: z.string().max(5000).optional(),
  leaseDocumentUrl: z.string().url().optional(),
});

export type UpdateLeaseInput = z.infer<typeof UpdateLeaseSchema>;

// =============================================================================
// RENEWAL
// =============================================================================

export const RenewalOfferSchema = z.object({
  newMonthlyRent: z.number().min(0),
  newTermMonths: z.number().int().min(1).max(36).default(12),
  rentIncreasePercent: z.number().min(-100).max(100).optional(),
  specialOfferTerms: z.string().max(2000).optional(),
  offerExpiresAt: z.coerce.date(),
  incentives: z.array(z.object({
    type: z.enum(['free_month', 'reduced_rent', 'upgrade', 'other']),
    description: z.string(),
    value: z.number().min(0).optional(),
  })).optional(),
});

export type RenewalOfferInput = z.infer<typeof RenewalOfferSchema>;

export const RenewalResponseSchema = z.object({
  accepted: z.boolean(),
  counterOfferRent: z.number().min(0).optional(),
  counterOfferTerms: z.string().max(1000).optional(),
  declineReason: z.string().max(500).optional(),
});

export type RenewalResponseInput = z.infer<typeof RenewalResponseSchema>;

// =============================================================================
// TERMINATION
// =============================================================================

export const TerminationRequestSchema = z.object({
  reason: z.enum([
    'tenant_request',
    'landlord_request',
    'mutual_agreement',
    'breach_of_lease',
    'non_payment',
    'property_sold',
    'renovation',
    'other',
  ]),
  requestedEndDate: z.coerce.date(),
  notes: z.string().max(2000).optional(),
  feeWaived: z.boolean().default(false),
});

export type TerminationRequestInput = z.infer<typeof TerminationRequestSchema>;

// =============================================================================
// MOVE OUT
// =============================================================================

export const MoveOutInspectionSchema = z.object({
  inspectionDate: z.coerce.date(),
  inspectorName: z.string().max(100),
  condition: z.enum(['excellent', 'good', 'fair', 'poor', 'damaged']),
  cleaningRequired: z.boolean(),
  repairsRequired: z.array(z.object({
    item: z.string(),
    estimatedCost: z.number().min(0),
    description: z.string().max(500),
    photos: z.array(z.string().url()).optional(),
  })).optional(),
  deductionAmount: z.number().min(0),
  deductionReason: z.string().max(1000).optional(),
  depositRefundAmount: z.number().min(0),
  notes: z.string().max(2000).optional(),
});

export type MoveOutInspectionInput = z.infer<typeof MoveOutInspectionSchema>;

// =============================================================================
// FILTERS
// =============================================================================

export const LeaseFiltersSchema = z.object({
  listingId: z.string().cuid().optional(),
  tenantId: z.string().cuid().optional(),
  landlordId: z.string().cuid().optional(),
  status: LeaseStatusEnum.optional(),
  expiringWithinDays: z.coerce.number().int().min(0).optional(),
  monthToMonth: z.coerce.boolean().optional(),
});

export type LeaseFiltersInput = z.infer<typeof LeaseFiltersSchema>;

export const LeasePaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'startDate', 'endDate', 'monthlyRent']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type LeasePaginationInput = z.infer<typeof LeasePaginationSchema>;
