/**
 * Leads & Tours Service
 * Lead management and tour scheduling with Jeeva.ai integration prep
 */

import { Prisma, Lead, Tour, LeadStatus, TourStatus } from '@prisma/client';
import { db } from '../../lib/database.js';
import { Result, ok, err } from '../../lib/result.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import { logger, createModuleLogger } from '../../lib/logger.js';
import type {
  CreateLeadInput,
  UpdateLeadInput,
  ScheduleTourInput,
  UpdateTourInput,
  TourFeedbackInput,
  LeadFiltersInput,
  TourFiltersInput,
  PaginationInput,
} from './leads.schemas.js';

const log = createModuleLogger('leads-service');

// =============================================================================
// TYPES
// =============================================================================

export interface LeadWithDetails extends Lead {
  listing: {
    id: string;
    title: string;
    address: string;
  };
  tours: Tour[];
  daysSinceCreated: number;
}

export interface TourWithDetails extends Tour {
  lead?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  } | null;
  listing: {
    id: string;
    title: string;
    address: string;
    unit: string | null;
  };
}

// =============================================================================
// LEADS
// =============================================================================

export async function createLead(
  input: CreateLeadInput,
  createdBy?: string
): Promise<Result<LeadWithDetails, AppError>> {
  try {
    // Verify listing exists
    const listing = await db.listing.findUnique({
      where: { id: input.listingId, deletedAt: null },
    });

    if (!listing) {
      return err(new AppError({ code: ErrorCode.LISTING_NOT_FOUND, message: 'Listing not found' }));
    }

    // Check for duplicate lead (same email for same listing)
    const existing = await db.lead.findFirst({
      where: {
        listingId: input.listingId,
        email: input.email.toLowerCase(),
        deletedAt: null,
      },
    });

    if (existing) {
      return err(new AppError({ code: ErrorCode.LEAD_DUPLICATE, message: 'Lead already exists for this listing' }));
    }

    const lead = await db.lead.create({
      data: {
        listingId: input.listingId,
        source: input.source,
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email.toLowerCase(),
        phone: input.phone,
        message: input.message,
        preferredMoveInDate: input.preferredMoveInDate,
        prequalified: input.prequalified,
        status: LeadStatus.NEW,
        assignedAgentId: listing.agentId,
      },
      include: {
        listing: {
          select: { id: true, title: true, address: true },
        },
        tours: true,
      },
    });

    // Increment lead count on listing
    await db.listing.update({
      where: { id: input.listingId },
      data: { leadCount: { increment: 1 } },
    });

    log.info({
      leadId: lead.id,
      listingId: input.listingId,
      source: input.source,
    }, 'Lead created');

    return ok({
      ...lead,
      daysSinceCreated: 0,
    });
  } catch (error) {
    log.error({ error, input }, 'Failed to create lead');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to create lead' }));
  }
}

export async function getLead(
  id: string,
  requesterId: string,
  requesterRole: string
): Promise<Result<LeadWithDetails, AppError>> {
  try {
    const lead = await db.lead.findUnique({
      where: { id, deletedAt: null },
      include: {
        listing: {
          select: { id: true, title: true, address: true, ownerId: true, agentId: true },
        },
        tours: true,
      },
    });

    if (!lead) {
      return err(new AppError({ code: ErrorCode.LEAD_NOT_FOUND, message: 'Lead not found' }));
    }

    // Authorization
    const isOwner = lead.listing.ownerId === requesterId;
    const isAgent = lead.listing.agentId === requesterId || lead.assignedAgentId === requesterId;
    const isAdmin = requesterRole === 'ADMIN' || requesterRole === 'SUPER_ADMIN';

    if (!isOwner && !isAgent && !isAdmin) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    const { ownerId, agentId, ...listingData } = lead.listing;
    const daysSinceCreated = Math.floor(
      (Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    return ok({
      ...lead,
      listing: listingData,
      daysSinceCreated,
    });
  } catch (error) {
    log.error({ error, leadId: id }, 'Failed to get lead');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to get lead' }));
  }
}

export async function updateLead(
  id: string,
  input: UpdateLeadInput,
  updaterId: string
): Promise<Result<LeadWithDetails, AppError>> {
  try {
    const lead = await db.lead.findUnique({
      where: { id, deletedAt: null },
      include: {
        listing: { select: { ownerId: true, agentId: true } },
      },
    });

    if (!lead) {
      return err(new AppError({ code: ErrorCode.LEAD_NOT_FOUND, message: 'Lead not found' }));
    }

    if (lead.listing.ownerId !== updaterId && lead.listing.agentId !== updaterId && lead.assignedAgentId !== updaterId) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    const updated = await db.lead.update({
      where: { id },
      data: {
        ...input,
        ...(input.status === LeadStatus.CONTACTED && !lead.contactedAt && { contactedAt: new Date() }),
        ...(input.status === LeadStatus.QUALIFIED && !lead.qualifiedAt && { qualifiedAt: new Date() }),
        ...(input.status === LeadStatus.CONVERTED && !lead.convertedAt && { convertedAt: new Date() }),
      },
      include: {
        listing: {
          select: { id: true, title: true, address: true },
        },
        tours: true,
      },
    });

    log.info({ leadId: id, status: input.status }, 'Lead updated');

    return ok({
      ...updated,
      daysSinceCreated: Math.floor(
        (Date.now() - new Date(updated.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      ),
    });
  } catch (error) {
    log.error({ error, leadId: id }, 'Failed to update lead');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to update lead' }));
  }
}

export async function listLeads(
  filters: LeadFiltersInput,
  pagination: PaginationInput,
  requesterId: string,
  requesterRole: string
): Promise<Result<{
  leads: LeadWithDetails[];
  total: number;
  page: number;
  totalPages: number;
}, AppError>> {
  try {
    const isAdmin = requesterRole === 'ADMIN' || requesterRole === 'SUPER_ADMIN';

    const where: Prisma.LeadWhereInput = {
      deletedAt: null,
      ...(filters.listingId && { listingId: filters.listingId }),
      ...(filters.status && { status: filters.status }),
      ...(filters.source && { source: filters.source }),
      ...(filters.assignedAgentId && { assignedAgentId: filters.assignedAgentId }),
      ...(filters.prequalified !== undefined && { prequalified: filters.prequalified }),
      ...(filters.createdAfter && { createdAt: { gte: filters.createdAfter } }),
      ...(filters.createdBefore && { createdAt: { lte: filters.createdBefore } }),
    };

    if (!isAdmin) {
      where.OR = [
        { listing: { ownerId: requesterId } },
        { listing: { agentId: requesterId } },
        { assignedAgentId: requesterId },
      ];
    }

    const [leads, total] = await Promise.all([
      db.lead.findMany({
        where,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: { [pagination.sortBy]: pagination.sortOrder },
        include: {
          listing: {
            select: { id: true, title: true, address: true },
          },
          tours: true,
        },
      }),
      db.lead.count({ where }),
    ]);

    return ok({
      leads: leads.map(lead => ({
        ...lead,
        daysSinceCreated: Math.floor(
          (Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        ),
      })),
      total,
      page: pagination.page,
      totalPages: Math.ceil(total / pagination.limit),
    });
  } catch (error) {
    log.error({ error, filters }, 'Failed to list leads');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to list leads' }));
  }
}

// =============================================================================
// TOURS
// =============================================================================

export async function scheduleTour(
  input: ScheduleTourInput,
  schedulerId: string
): Promise<Result<TourWithDetails, AppError>> {
  try {
    // Verify listing exists
    const listing = await db.listing.findUnique({
      where: { id: input.listingId, deletedAt: null },
    });

    if (!listing) {
      return err(new AppError({ code: ErrorCode.LISTING_NOT_FOUND, message: 'Listing not found' }));
    }

    // If lead ID provided, verify it exists
    if (input.leadId) {
      const lead = await db.lead.findUnique({
        where: { id: input.leadId, deletedAt: null },
      });
      if (!lead) {
        return err(new AppError({ code: ErrorCode.LEAD_NOT_FOUND, message: 'Lead not found' }));
      }
    }

    const tour = await db.tour.create({
      data: {
        leadId: input.leadId,
        listingId: input.listingId,
        type: input.type,
        scheduledDate: input.scheduledDate,
        duration: input.duration,
        attendeeName: input.attendeeName,
        attendeeEmail: input.attendeeEmail,
        attendeePhone: input.attendeePhone,
        notes: input.notes,
        virtualTourUrl: input.virtualTourUrl,
        selfGuided: input.selfGuided,
        status: TourStatus.SCHEDULED,
        scheduledBy: schedulerId,
      },
      include: {
        lead: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, unit: true },
        },
      },
    });

    // Update lead status if linked
    if (input.leadId) {
      await db.lead.update({
        where: { id: input.leadId },
        data: { status: LeadStatus.TOUR_SCHEDULED },
      });
    }

    // Increment tour count on listing
    await db.listing.update({
      where: { id: input.listingId },
      data: { tourCount: { increment: 1 } },
    });

    log.info({
      tourId: tour.id,
      listingId: input.listingId,
      type: input.type,
    }, 'Tour scheduled');

    return ok(tour);
  } catch (error) {
    log.error({ error, input }, 'Failed to schedule tour');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to schedule tour' }));
  }
}

export async function getTour(
  id: string,
  requesterId: string,
  requesterRole: string
): Promise<Result<TourWithDetails, AppError>> {
  try {
    const tour = await db.tour.findUnique({
      where: { id, deletedAt: null },
      include: {
        lead: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, unit: true, ownerId: true, agentId: true },
        },
      },
    });

    if (!tour) {
      return err(new AppError({ code: ErrorCode.TOUR_NOT_FOUND, message: 'Tour not found' }));
    }

    const isOwner = tour.listing.ownerId === requesterId;
    const isAgent = tour.listing.agentId === requesterId;
    const isScheduler = tour.scheduledBy === requesterId;
    const isAdmin = requesterRole === 'ADMIN' || requesterRole === 'SUPER_ADMIN';

    if (!isOwner && !isAgent && !isScheduler && !isAdmin) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    const { ownerId, agentId, ...listingData } = tour.listing;

    return ok({
      ...tour,
      listing: listingData,
    });
  } catch (error) {
    log.error({ error, tourId: id }, 'Failed to get tour');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to get tour' }));
  }
}

export async function updateTour(
  id: string,
  input: UpdateTourInput,
  updaterId: string
): Promise<Result<TourWithDetails, AppError>> {
  try {
    const tour = await db.tour.findUnique({
      where: { id, deletedAt: null },
      include: {
        listing: { select: { ownerId: true, agentId: true } },
      },
    });

    if (!tour) {
      return err(new AppError({ code: ErrorCode.TOUR_NOT_FOUND, message: 'Tour not found' }));
    }

    if (tour.listing.ownerId !== updaterId && tour.listing.agentId !== updaterId && tour.scheduledBy !== updaterId) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    const updated = await db.tour.update({
      where: { id },
      data: {
        ...input,
        ...(input.status === TourStatus.COMPLETED && !tour.completedAt && { completedAt: new Date() }),
        ...(input.status === TourStatus.CANCELLED && !tour.cancelledAt && { cancelledAt: new Date() }),
      },
      include: {
        lead: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, unit: true },
        },
      },
    });

    log.info({ tourId: id, status: input.status }, 'Tour updated');

    return ok(updated);
  } catch (error) {
    log.error({ error, tourId: id }, 'Failed to update tour');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to update tour' }));
  }
}

export async function recordTourFeedback(
  id: string,
  feedback: TourFeedbackInput,
  agentId: string
): Promise<Result<TourWithDetails, AppError>> {
  try {
    const tour = await db.tour.findUnique({
      where: { id, deletedAt: null },
      include: {
        listing: { select: { ownerId: true, agentId: true } },
      },
    });

    if (!tour) {
      return err(new AppError({ code: ErrorCode.TOUR_NOT_FOUND, message: 'Tour not found' }));
    }

    if (tour.listing.ownerId !== agentId && tour.listing.agentId !== agentId) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    const updated = await db.tour.update({
      where: { id },
      data: {
        status: feedback.attended ? TourStatus.COMPLETED : TourStatus.NO_SHOW,
        completedAt: feedback.attended ? new Date() : null,
        feedback: feedback.feedback,
        interestLevel: feedback.interestLevel,
        followUpRequired: feedback.followUpRequired,
        tourFeedback: {
          attended: feedback.attended,
          concernsRaised: feedback.concernsRaised,
          recommendedListings: feedback.recommendedListings,
          followUpDate: feedback.followUpDate,
        } as Prisma.JsonValue,
      },
      include: {
        lead: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, unit: true },
        },
      },
    });

    // Update lead status based on tour outcome
    if (tour.leadId) {
      const newStatus = feedback.attended
        ? (feedback.interestLevel && feedback.interestLevel >= 4 ? LeadStatus.QUALIFIED : LeadStatus.TOUR_COMPLETED)
        : LeadStatus.TOUR_COMPLETED;

      await db.lead.update({
        where: { id: tour.leadId },
        data: { status: newStatus },
      });
    }

    log.info({
      tourId: id,
      attended: feedback.attended,
      interestLevel: feedback.interestLevel,
    }, 'Tour feedback recorded');

    return ok(updated);
  } catch (error) {
    log.error({ error, tourId: id }, 'Failed to record tour feedback');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to record feedback' }));
  }
}

export async function listTours(
  filters: TourFiltersInput,
  pagination: PaginationInput,
  requesterId: string,
  requesterRole: string
): Promise<Result<{
  tours: TourWithDetails[];
  total: number;
  page: number;
  totalPages: number;
}, AppError>> {
  try {
    const isAdmin = requesterRole === 'ADMIN' || requesterRole === 'SUPER_ADMIN';

    const where: Prisma.TourWhereInput = {
      deletedAt: null,
      ...(filters.listingId && { listingId: filters.listingId }),
      ...(filters.leadId && { leadId: filters.leadId }),
      ...(filters.status && { status: filters.status }),
      ...(filters.type && { type: filters.type }),
      ...(filters.selfGuided !== undefined && { selfGuided: filters.selfGuided }),
      ...(filters.dateFrom && { scheduledDate: { gte: filters.dateFrom } }),
      ...(filters.dateTo && { scheduledDate: { lte: filters.dateTo } }),
    };

    if (!isAdmin) {
      where.OR = [
        { listing: { ownerId: requesterId } },
        { listing: { agentId: requesterId } },
        { scheduledBy: requesterId },
      ];
    }

    const [tours, total] = await Promise.all([
      db.tour.findMany({
        where,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: { [pagination.sortBy]: pagination.sortOrder },
        include: {
          lead: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          },
          listing: {
            select: { id: true, title: true, address: true, unit: true },
          },
        },
      }),
      db.tour.count({ where }),
    ]);

    return ok({
      tours,
      total,
      page: pagination.page,
      totalPages: Math.ceil(total / pagination.limit),
    });
  } catch (error) {
    log.error({ error, filters }, 'Failed to list tours');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to list tours' }));
  }
}

export async function getUpcomingTours(
  userId: string,
  daysAhead: number = 7
): Promise<Result<TourWithDetails[], AppError>> {
  try {
    const now = new Date();
    const targetDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

    const tours = await db.tour.findMany({
      where: {
        status: TourStatus.SCHEDULED,
        scheduledDate: { gte: now, lte: targetDate },
        deletedAt: null,
        OR: [
          { listing: { ownerId: userId } },
          { listing: { agentId: userId } },
          { scheduledBy: userId },
        ],
      },
      orderBy: { scheduledDate: 'asc' },
      include: {
        lead: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, unit: true },
        },
      },
    });

    return ok(tours);
  } catch (error) {
    log.error({ error }, 'Failed to get upcoming tours');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to get tours' }));
  }
}
