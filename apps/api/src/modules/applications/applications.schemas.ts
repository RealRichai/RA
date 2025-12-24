/**
 * Applications Schemas
 * Zod validation schemas with Fair Chance Housing Act compliance
 */

import { z } from 'zod';
import { ApplicationStatus } from '@prisma/client';

export const ApplicationStatusEnum = z.nativeEnum(ApplicationStatus);

// =============================================================================
// CREATE APPLICATION
// =============================================================================

export const CreateApplicationSchema = z.object({
  listingId: z.string().cuid(),

  // Employment
  employmentStatus: z.enum(['employed', 'self-employed', 'unemployed', 'retired', 'student']),
  employerName: z.string().max(200).optional(),
  jobTitle: z.string().max(100).optional(),
  monthlyIncome: z.number().min(0),
  employmentStartDate: z.coerce.date().optional(),

  // Financial
  creditScore: z.number().int().min(300).max(850).optional(),
  hasBankruptcy: z.boolean().default(false),
  hasEvictions: z.boolean().default(false),

  // Current residence
  currentAddress: z.string().max(500).optional(),
  currentLandlordName: z.string().max(200).optional(),
  currentLandlordPhone: z.string().max(20).optional(),
  currentRent: z.number().min(0).optional(),
  moveInDate: z.coerce.date().optional(),
  reasonForMoving: z.string().max(500).optional(),

  // Occupants
  numberOfOccupants: z.number().int().min(1).max(20).default(1),
  hasPets: z.boolean().default(false),
  petDetails: z.string().max(500).optional(),

  // Additional info
  additionalNotes: z.string().max(2000).optional(),
});

export type CreateApplicationInput = z.infer<typeof CreateApplicationSchema>;

// =============================================================================
// UPDATE APPLICATION
// =============================================================================

export const UpdateApplicationSchema = z.object({
  employmentStatus: z.enum(['employed', 'self-employed', 'unemployed', 'retired', 'student']).optional(),
  employerName: z.string().max(200).optional(),
  jobTitle: z.string().max(100).optional(),
  monthlyIncome: z.number().min(0).optional(),
  employmentStartDate: z.coerce.date().optional(),
  creditScore: z.number().int().min(300).max(850).optional(),
  hasBankruptcy: z.boolean().optional(),
  hasEvictions: z.boolean().optional(),
  currentAddress: z.string().max(500).optional(),
  currentLandlordName: z.string().max(200).optional(),
  currentLandlordPhone: z.string().max(20).optional(),
  currentRent: z.number().min(0).optional(),
  moveInDate: z.coerce.date().optional(),
  reasonForMoving: z.string().max(500).optional(),
  numberOfOccupants: z.number().int().min(1).max(20).optional(),
  hasPets: z.boolean().optional(),
  petDetails: z.string().max(500).optional(),
  additionalNotes: z.string().max(2000).optional(),
});

export type UpdateApplicationInput = z.infer<typeof UpdateApplicationSchema>;

// =============================================================================
// APPLICATION DECISION
// =============================================================================

export const ApplicationDecisionSchema = z.object({
  status: z.enum([
    ApplicationStatus.APPROVED,
    ApplicationStatus.DENIED,
    ApplicationStatus.CONDITIONAL_OFFER,
  ]),
  decisionNotes: z.string().max(2000).optional(),
  // For conditional offer (before criminal history check per Fair Chance Act)
  requiresGuarantor: z.boolean().optional(),
});

export type ApplicationDecisionInput = z.infer<typeof ApplicationDecisionSchema>;

// =============================================================================
// FAIR CHANCE HOUSING ACT - INDIVIDUAL ASSESSMENT
// NYC requires individual assessment if criminal history is disclosed
// =============================================================================

export const IndividualAssessmentSchema = z.object({
  // Criminal history details (only after conditional offer per Fair Chance Act)
  criminalHistoryDisclosed: z.boolean(),

  // Individual assessment factors (per NYC Fair Chance Housing Act)
  offenseNature: z.string().max(1000).optional(),
  timeElapsed: z.number().int().min(0).optional(), // Years since offense
  ageAtOffense: z.number().int().min(0).optional(),
  rehabilitationEvidence: z.string().max(2000).optional(),
  housingNeedsRelevance: z.string().max(1000).optional(),

  // Assessment result
  assessmentNotes: z.string().max(2000),
  assessmentResult: z.enum(['proceed', 'deny_with_justification']),
  justification: z.string().max(2000).optional(), // Required if denying
});

export type IndividualAssessmentInput = z.infer<typeof IndividualAssessmentSchema>;

// =============================================================================
// GUARANTOR REFERRAL (TheGuarantors Integration)
// =============================================================================

export const GuarantorReferralSchema = z.object({
  guarantorRequired: z.boolean(),
  notes: z.string().max(1000).optional(),
});

export type GuarantorReferralInput = z.infer<typeof GuarantorReferralSchema>;

// =============================================================================
// APPLICATION FILTERS
// =============================================================================

export const ApplicationFiltersSchema = z.object({
  listingId: z.string().cuid().optional(),
  applicantId: z.string().cuid().optional(),
  status: ApplicationStatusEnum.optional(),
  minIncome: z.coerce.number().min(0).optional(),
  maxIncome: z.coerce.number().min(0).optional(),
  hasGuarantor: z.coerce.boolean().optional(),
});

export type ApplicationFiltersInput = z.infer<typeof ApplicationFiltersSchema>;

export const ApplicationPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'monthlyIncome', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type ApplicationPaginationInput = z.infer<typeof ApplicationPaginationSchema>;
