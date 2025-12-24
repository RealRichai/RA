/**
 * Applications Service
 * Application management with Fair Chance Housing Act compliance
 *
 * NYC Fair Chance Housing Act Requirements:
 * 1. Criminal history inquiry DEFERRED until conditional offer
 * 2. Individual assessment required if criminal history disclosed
 * 3. Must consider: nature of offense, time elapsed, rehabilitation, housing relevance
 */

import { Prisma, Application, ApplicationStatus } from '@prisma/client';
import { db } from '../../lib/database.js';
import { Result, ok, err } from '../../lib/result.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import { logger, createModuleLogger } from '../../lib/logger.js';
import { getMarketByZipCode, requiresFairChanceHousing } from '../../config/markets/index.js';
import type {
  CreateApplicationInput,
  UpdateApplicationInput,
  ApplicationDecisionInput,
  IndividualAssessmentInput,
  GuarantorReferralInput,
  ApplicationFiltersInput,
  ApplicationPaginationInput,
} from './applications.schemas.js';

const log = createModuleLogger('applications-service');

// =============================================================================
// TYPES
// =============================================================================

export interface ApplicationWithDetails extends Application {
  applicant: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
  };
  listing: {
    id: string;
    title: string;
    address: string;
    rentPrice: Prisma.Decimal | null;
    zipCode: string;
  };
  fairChanceStatus: FairChanceStatus;
}

export interface FairChanceStatus {
  applies: boolean;
  marketId: string | null;
  stage: 'pre_conditional_offer' | 'conditional_offer_made' | 'individual_assessment' | 'completed';
  criminalHistoryInquiryAllowed: boolean;
  individualAssessmentRequired: boolean;
  individualAssessmentCompleted: boolean;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getFairChanceStatus(application: Application, zipCode: string): FairChanceStatus {
  const market = getMarketByZipCode(zipCode);
  const marketId = market?.id || null;
  const applies = marketId ? requiresFairChanceHousing(marketId) : false;

  if (!applies) {
    return {
      applies: false,
      marketId,
      stage: 'completed',
      criminalHistoryInquiryAllowed: true,
      individualAssessmentRequired: false,
      individualAssessmentCompleted: true,
    };
  }

  // Determine stage based on application status
  let stage: FairChanceStatus['stage'] = 'pre_conditional_offer';
  let criminalHistoryInquiryAllowed = false;

  if (application.status === ApplicationStatus.CONDITIONAL_OFFER ||
      application.status === ApplicationStatus.APPROVED ||
      application.status === ApplicationStatus.DENIED) {
    stage = 'conditional_offer_made';
    criminalHistoryInquiryAllowed = true;
  }

  if (application.criminalHistoryDisclosed !== null) {
    stage = 'individual_assessment';
  }

  if (application.individualAssessmentCompleted) {
    stage = 'completed';
  }

  return {
    applies,
    marketId,
    stage,
    criminalHistoryInquiryAllowed,
    individualAssessmentRequired: application.criminalHistoryDisclosed === true,
    individualAssessmentCompleted: application.individualAssessmentCompleted || false,
  };
}

// =============================================================================
// CREATE APPLICATION
// =============================================================================

export async function createApplication(
  applicantId: string,
  input: CreateApplicationInput
): Promise<Result<ApplicationWithDetails, AppError>> {
  try {
    // Check if listing exists and is available
    const listing = await db.listing.findUnique({
      where: { id: input.listingId, deletedAt: null },
    });

    if (!listing) {
      return err(new AppError({ code: ErrorCode.LISTING_NOT_FOUND, message: 'Listing not found' }));
    }

    if (listing.status !== 'ACTIVE') {
      return err(new AppError({ code: ErrorCode.LISTING_NOT_AVAILABLE, message: 'Listing is not available for applications' }));
    }

    // Check for duplicate application
    const existing = await db.application.findUnique({
      where: {
        applicantId_listingId: { applicantId, listingId: input.listingId },
      },
    });

    if (existing && !existing.deletedAt) {
      return err(new AppError({ code: ErrorCode.APPLICATION_DUPLICATE, message: 'You have already applied for this listing' }));
    }

    // Get market for Fair Chance Housing Act check
    const market = getMarketByZipCode(listing.zipCode);
    const fairChanceApplies = market ? requiresFairChanceHousing(market.id) : false;

    const application = await db.application.create({
      data: {
        applicantId,
        listingId: input.listingId,
        status: ApplicationStatus.SUBMITTED,

        employmentStatus: input.employmentStatus,
        employerName: input.employerName,
        jobTitle: input.jobTitle,
        monthlyIncome: input.monthlyIncome,
        employmentStartDate: input.employmentStartDate,

        creditScore: input.creditScore,
        hasBankruptcy: input.hasBankruptcy,
        hasEvictions: input.hasEvictions,

        currentAddress: input.currentAddress,
        currentLandlordName: input.currentLandlordName,
        currentLandlordPhone: input.currentLandlordPhone,
        currentRent: input.currentRent,
        moveInDate: input.moveInDate,
        reasonForMoving: input.reasonForMoving,

        numberOfOccupants: input.numberOfOccupants,
        hasPets: input.hasPets,
        petDetails: input.petDetails,

        additionalNotes: input.additionalNotes,

        // Fair Chance Housing Act: defer criminal history inquiry
        criminalHistoryDeferred: fairChanceApplies,

        // Application fee (capped at $20 per NY law)
        applicationFee: Math.min(Number(listing.applicationFee) || 20, 20),
      },
      include: {
        applicant: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, rentPrice: true, zipCode: true },
        },
      },
    });

    // Increment listing application count
    await db.listing.update({
      where: { id: input.listingId },
      data: { applicationCount: { increment: 1 } },
    });

    log.info({
      applicationId: application.id,
      applicantId,
      listingId: input.listingId,
      fairChanceApplies,
    }, 'Application created');

    return ok({
      ...application,
      fairChanceStatus: getFairChanceStatus(application, listing.zipCode),
    });
  } catch (error) {
    log.error({ error, applicantId, input }, 'Failed to create application');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to create application' }));
  }
}

// =============================================================================
// GET APPLICATION
// =============================================================================

export async function getApplication(
  id: string,
  requesterId: string,
  requesterRole: string
): Promise<Result<ApplicationWithDetails, AppError>> {
  try {
    const application = await db.application.findUnique({
      where: { id, deletedAt: null },
      include: {
        applicant: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, rentPrice: true, zipCode: true, ownerId: true, agentId: true },
        },
      },
    });

    if (!application) {
      return err(new AppError({ code: ErrorCode.APPLICATION_NOT_FOUND, message: 'Application not found' }));
    }

    // Authorization: applicant, listing owner, agent, or admin
    const isApplicant = application.applicantId === requesterId;
    const isOwner = application.listing.ownerId === requesterId;
    const isAgent = application.listing.agentId === requesterId;
    const isAdmin = requesterRole === 'ADMIN' || requesterRole === 'SUPER_ADMIN';

    if (!isApplicant && !isOwner && !isAgent && !isAdmin) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized to view this application' }));
    }

    // Remove sensitive listing fields
    const { ownerId, agentId, ...listingData } = application.listing;

    return ok({
      ...application,
      listing: listingData,
      fairChanceStatus: getFairChanceStatus(application, application.listing.zipCode),
    });
  } catch (error) {
    log.error({ error, applicationId: id }, 'Failed to get application');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to get application' }));
  }
}

// =============================================================================
// LIST APPLICATIONS
// =============================================================================

export async function listApplications(
  filters: ApplicationFiltersInput,
  pagination: ApplicationPaginationInput,
  requesterId: string,
  requesterRole: string
): Promise<Result<{
  applications: ApplicationWithDetails[];
  total: number;
  page: number;
  totalPages: number;
}, AppError>> {
  try {
    const isAdmin = requesterRole === 'ADMIN' || requesterRole === 'SUPER_ADMIN';

    const where: Prisma.ApplicationWhereInput = {
      deletedAt: null,
      ...(filters.listingId && { listingId: filters.listingId }),
      ...(filters.applicantId && { applicantId: filters.applicantId }),
      ...(filters.status && { status: filters.status }),
      ...(filters.minIncome && { monthlyIncome: { gte: filters.minIncome } }),
      ...(filters.maxIncome && { monthlyIncome: { lte: filters.maxIncome } }),
      ...(filters.hasGuarantor !== undefined && { guarantorApproved: filters.hasGuarantor }),
    };

    // Non-admins can only see their own applications or applications for their listings
    if (!isAdmin) {
      where.OR = [
        { applicantId: requesterId },
        { listing: { ownerId: requesterId } },
        { listing: { agentId: requesterId } },
      ];
    }

    const [applications, total] = await Promise.all([
      db.application.findMany({
        where,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: { [pagination.sortBy]: pagination.sortOrder },
        include: {
          applicant: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          },
          listing: {
            select: { id: true, title: true, address: true, rentPrice: true, zipCode: true },
          },
        },
      }),
      db.application.count({ where }),
    ]);

    const applicationsWithDetails = applications.map(app => ({
      ...app,
      fairChanceStatus: getFairChanceStatus(app, app.listing.zipCode),
    }));

    return ok({
      applications: applicationsWithDetails,
      total,
      page: pagination.page,
      totalPages: Math.ceil(total / pagination.limit),
    });
  } catch (error) {
    log.error({ error, filters }, 'Failed to list applications');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to list applications' }));
  }
}

// =============================================================================
// MAKE DECISION
// =============================================================================

export async function makeDecision(
  id: string,
  decision: ApplicationDecisionInput,
  deciderId: string
): Promise<Result<ApplicationWithDetails, AppError>> {
  try {
    const application = await db.application.findUnique({
      where: { id, deletedAt: null },
      include: {
        listing: { select: { ownerId: true, agentId: true, zipCode: true } },
      },
    });

    if (!application) {
      return err(new AppError({ code: ErrorCode.APPLICATION_NOT_FOUND, message: 'Application not found' }));
    }

    // Only owner or agent can make decisions
    if (application.listing.ownerId !== deciderId && application.listing.agentId !== deciderId) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized to make decisions on this application' }));
    }

    // Fair Chance Housing Act check
    const market = getMarketByZipCode(application.listing.zipCode);
    const fairChanceApplies = market ? requiresFairChanceHousing(market.id) : false;

    // If denying and Fair Chance applies, ensure individual assessment was completed if criminal history was disclosed
    if (fairChanceApplies && decision.status === ApplicationStatus.DENIED) {
      if (application.criminalHistoryDisclosed && !application.individualAssessmentCompleted) {
        return err(new AppError({
          code: ErrorCode.APPLICATION_FAIR_CHANCE_VIOLATION,
          message: 'Individual assessment required before denial per Fair Chance Housing Act',
        }));
      }
    }

    const updated = await db.application.update({
      where: { id },
      data: {
        status: decision.status,
        decisionNotes: decision.decisionNotes,
        decisionDate: new Date(),
        decisionBy: deciderId,
        guarantorRequired: decision.requiresGuarantor,
      },
      include: {
        applicant: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, rentPrice: true, zipCode: true },
        },
      },
    });

    log.info({
      applicationId: id,
      status: decision.status,
      deciderId,
    }, 'Application decision made');

    return ok({
      ...updated,
      fairChanceStatus: getFairChanceStatus(updated, updated.listing.zipCode),
    });
  } catch (error) {
    log.error({ error, applicationId: id, decision }, 'Failed to make decision');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to make decision' }));
  }
}

// =============================================================================
// FAIR CHANCE HOUSING ACT - INDIVIDUAL ASSESSMENT
// =============================================================================

export async function conductIndividualAssessment(
  id: string,
  assessment: IndividualAssessmentInput,
  assessorId: string
): Promise<Result<ApplicationWithDetails, AppError>> {
  try {
    const application = await db.application.findUnique({
      where: { id, deletedAt: null },
      include: {
        listing: { select: { ownerId: true, agentId: true, zipCode: true } },
      },
    });

    if (!application) {
      return err(new AppError({ code: ErrorCode.APPLICATION_NOT_FOUND, message: 'Application not found' }));
    }

    // Only owner or agent can conduct assessment
    if (application.listing.ownerId !== assessorId && application.listing.agentId !== assessorId) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized to conduct assessment' }));
    }

    // Must be at conditional offer stage
    if (application.status !== ApplicationStatus.CONDITIONAL_OFFER) {
      return err(new AppError({
        code: ErrorCode.APPLICATION_NOT_APPROVED,
        message: 'Individual assessment can only be conducted after conditional offer',
      }));
    }

    // Build assessment notes
    const assessmentNotes = `
FAIR CHANCE HOUSING ACT - INDIVIDUAL ASSESSMENT

Criminal History Disclosed: ${assessment.criminalHistoryDisclosed ? 'Yes' : 'No'}

${assessment.criminalHistoryDisclosed ? `
ASSESSMENT FACTORS:
- Nature of Offense: ${assessment.offenseNature || 'Not provided'}
- Time Elapsed: ${assessment.timeElapsed ? `${assessment.timeElapsed} years` : 'Not provided'}
- Age at Offense: ${assessment.ageAtOffense || 'Not provided'}
- Rehabilitation Evidence: ${assessment.rehabilitationEvidence || 'Not provided'}
- Housing Needs Relevance: ${assessment.housingNeedsRelevance || 'Not provided'}

ASSESSMENT NOTES:
${assessment.assessmentNotes}

RESULT: ${assessment.assessmentResult === 'proceed' ? 'PROCEED WITH APPLICATION' : 'DENY WITH JUSTIFICATION'}
${assessment.assessmentResult === 'deny_with_justification' ? `\nJUSTIFICATION:\n${assessment.justification}` : ''}
` : 'No criminal history disclosed - proceeding with application.'}

Assessed by: ${assessorId}
Date: ${new Date().toISOString()}
    `.trim();

    const newStatus = assessment.assessmentResult === 'proceed'
      ? ApplicationStatus.APPROVED
      : ApplicationStatus.DENIED;

    const updated = await db.application.update({
      where: { id },
      data: {
        criminalHistoryDisclosed: assessment.criminalHistoryDisclosed,
        individualAssessmentCompleted: true,
        individualAssessmentNotes: assessmentNotes,
        status: newStatus,
        decisionDate: new Date(),
        decisionBy: assessorId,
        decisionNotes: assessment.assessmentResult === 'deny_with_justification'
          ? assessment.justification
          : 'Approved after individual assessment',
      },
      include: {
        applicant: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, rentPrice: true, zipCode: true },
        },
      },
    });

    log.info({
      applicationId: id,
      criminalHistoryDisclosed: assessment.criminalHistoryDisclosed,
      result: assessment.assessmentResult,
      assessorId,
    }, 'Individual assessment completed');

    return ok({
      ...updated,
      fairChanceStatus: getFairChanceStatus(updated, updated.listing.zipCode),
    });
  } catch (error) {
    log.error({ error, applicationId: id }, 'Failed to conduct individual assessment');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to conduct assessment' }));
  }
}

// =============================================================================
// GUARANTOR REFERRAL
// =============================================================================

export async function sendGuarantorReferral(
  id: string,
  referral: GuarantorReferralInput,
  requesterId: string
): Promise<Result<ApplicationWithDetails, AppError>> {
  try {
    const application = await db.application.findUnique({
      where: { id, deletedAt: null },
      include: {
        listing: { select: { ownerId: true, agentId: true, zipCode: true } },
      },
    });

    if (!application) {
      return err(new AppError({ code: ErrorCode.APPLICATION_NOT_FOUND, message: 'Application not found' }));
    }

    if (application.listing.ownerId !== requesterId && application.listing.agentId !== requesterId) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    // TODO: Integrate with TheGuarantors API
    const referralId = `TG-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const updated = await db.application.update({
      where: { id },
      data: {
        guarantorRequired: referral.guarantorRequired,
        guarantorReferralSent: true,
        guarantorReferralId: referralId,
      },
      include: {
        applicant: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, rentPrice: true, zipCode: true },
        },
      },
    });

    log.info({ applicationId: id, referralId }, 'Guarantor referral sent');

    return ok({
      ...updated,
      fairChanceStatus: getFairChanceStatus(updated, updated.listing.zipCode),
    });
  } catch (error) {
    log.error({ error, applicationId: id }, 'Failed to send guarantor referral');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to send referral' }));
  }
}

// =============================================================================
// WITHDRAW APPLICATION
// =============================================================================

export async function withdrawApplication(
  id: string,
  applicantId: string
): Promise<Result<void, AppError>> {
  try {
    const application = await db.application.findUnique({
      where: { id, deletedAt: null },
    });

    if (!application) {
      return err(new AppError({ code: ErrorCode.APPLICATION_NOT_FOUND, message: 'Application not found' }));
    }

    if (application.applicantId !== applicantId) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized to withdraw this application' }));
    }

    if (application.status === ApplicationStatus.LEASE_SIGNED) {
      return err(new AppError({ code: ErrorCode.APPLICATION_NOT_APPROVED, message: 'Cannot withdraw after lease is signed' }));
    }

    await db.application.update({
      where: { id },
      data: { status: ApplicationStatus.WITHDRAWN },
    });

    log.info({ applicationId: id, applicantId }, 'Application withdrawn');

    return ok(undefined);
  } catch (error) {
    log.error({ error, applicationId: id }, 'Failed to withdraw application');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to withdraw application' }));
  }
}
