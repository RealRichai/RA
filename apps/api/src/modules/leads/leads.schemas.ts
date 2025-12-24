/**
 * Leads & Tours Schemas
 * Validation schemas for lead management and tour scheduling
 */

import { z } from 'zod';
import { LeadStatus, LeadSource, TourStatus, TourType } from '@prisma/client';

export const LeadStatusEnum = z.nativeEnum(LeadStatus);
export const LeadSourceEnum = z.nativeEnum(LeadSource);
export const TourStatusEnum = z.nativeEnum(TourStatus);
export const TourTypeEnum = z.nativeEnum(TourType);

// =============================================================================
// CREATE LEAD
// =============================================================================

export const CreateLeadSchema = z.object({
  listingId: z.string().cuid(),
  source: LeadSourceEnum.default(LeadSource.WEBSITE),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().max(20).optional(),
  message: z.string().max(2000).optional(),
  preferredMoveInDate: z.coerce.date().optional(),
  prequalified: z.boolean().default(false),
});

export type CreateLeadInput = z.infer<typeof CreateLeadSchema>;

// =============================================================================
// UPDATE LEAD
// =============================================================================

export const UpdateLeadSchema = z.object({
  status: LeadStatusEnum.optional(),
  notes: z.string().max(5000).optional(),
  assignedAgentId: z.string().cuid().optional(),
  prequalified: z.boolean().optional(),
  qualificationNotes: z.string().max(1000).optional(),
});

export type UpdateLeadInput = z.infer<typeof UpdateLeadSchema>;

// =============================================================================
// SCHEDULE TOUR
// =============================================================================

export const ScheduleTourSchema = z.object({
  leadId: z.string().cuid().optional(),
  listingId: z.string().cuid(),
  type: TourTypeEnum.default(TourType.IN_PERSON),
  scheduledDate: z.coerce.date(),
  duration: z.number().int().min(15).max(120).default(30), // minutes
  attendeeName: z.string().max(100).optional(),
  attendeeEmail: z.string().email().optional(),
  attendeePhone: z.string().max(20).optional(),
  notes: z.string().max(1000).optional(),
  // For virtual tours
  virtualTourUrl: z.string().url().optional(),
  // For self-guided tours (Seam integration)
  selfGuided: z.boolean().default(false),
});

export type ScheduleTourInput = z.infer<typeof ScheduleTourSchema>;

// =============================================================================
// UPDATE TOUR
// =============================================================================

export const UpdateTourSchema = z.object({
  status: TourStatusEnum.optional(),
  scheduledDate: z.coerce.date().optional(),
  notes: z.string().max(1000).optional(),
  feedback: z.string().max(2000).optional(),
  interestLevel: z.number().int().min(1).max(5).optional(),
  followUpRequired: z.boolean().optional(),
});

export type UpdateTourInput = z.infer<typeof UpdateTourSchema>;

// =============================================================================
// TOUR FEEDBACK (From showing agent)
// =============================================================================

export const TourFeedbackSchema = z.object({
  attended: z.boolean(),
  interestLevel: z.number().int().min(1).max(5).optional(),
  feedback: z.string().max(2000),
  concernsRaised: z.array(z.string()).optional(),
  recommendedListings: z.array(z.string().cuid()).optional(),
  followUpRequired: z.boolean().default(false),
  followUpDate: z.coerce.date().optional(),
});

export type TourFeedbackInput = z.infer<typeof TourFeedbackSchema>;

// =============================================================================
// FILTERS
// =============================================================================

export const LeadFiltersSchema = z.object({
  listingId: z.string().cuid().optional(),
  status: LeadStatusEnum.optional(),
  source: LeadSourceEnum.optional(),
  assignedAgentId: z.string().cuid().optional(),
  prequalified: z.coerce.boolean().optional(),
  createdAfter: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),
});

export type LeadFiltersInput = z.infer<typeof LeadFiltersSchema>;

export const TourFiltersSchema = z.object({
  listingId: z.string().cuid().optional(),
  leadId: z.string().cuid().optional(),
  status: TourStatusEnum.optional(),
  type: TourTypeEnum.optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
  selfGuided: z.coerce.boolean().optional(),
});

export type TourFiltersInput = z.infer<typeof TourFiltersSchema>;

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'scheduledDate', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationInput = z.infer<typeof PaginationSchema>;
