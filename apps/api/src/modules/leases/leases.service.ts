/**
 * Leases Service
 * Lease management with renewal workflow and move-out handling
 */

import { Prisma, Lease, LeaseStatus, ApplicationStatus } from '@prisma/client';
import { db } from '../../lib/database.js';
import { Result, ok, err } from '../../lib/result.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import { logger, createModuleLogger } from '../../lib/logger.js';
import type {
  CreateLeaseInput,
  UpdateLeaseInput,
  RenewalOfferInput,
  RenewalResponseInput,
  TerminationRequestInput,
  MoveOutInspectionInput,
  LeaseFiltersInput,
  LeasePaginationInput,
} from './leases.schemas.js';

const log = createModuleLogger('leases-service');

// =============================================================================
// TYPES
// =============================================================================

export interface LeaseWithDetails extends Lease {
  tenant: {
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
    unit: string | null;
  };
  renewalStatus: RenewalStatus;
}

export interface RenewalStatus {
  isExpiring: boolean;
  daysUntilExpiration: number;
  renewalOfferSent: boolean;
  renewalOfferAccepted: boolean | null;
  isMonthToMonth: boolean;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getRenewalStatus(lease: Lease): RenewalStatus {
  const now = new Date();
  const daysUntilExpiration = Math.ceil(
    (new Date(lease.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    isExpiring: daysUntilExpiration <= 90 && daysUntilExpiration > 0,
    daysUntilExpiration: Math.max(0, daysUntilExpiration),
    renewalOfferSent: lease.renewalOfferSent || false,
    renewalOfferAccepted: lease.renewalOfferAccepted,
    isMonthToMonth: lease.isMonthToMonth || false,
  };
}

// =============================================================================
// CREATE LEASE
// =============================================================================

export async function createLease(
  input: CreateLeaseInput,
  creatorId: string
): Promise<Result<LeaseWithDetails, AppError>> {
  try {
    // Get application and verify it's approved
    const application = await db.application.findUnique({
      where: { id: input.applicationId, deletedAt: null },
      include: {
        listing: { select: { ownerId: true, agentId: true } },
      },
    });

    if (!application) {
      return err(new AppError({ code: ErrorCode.APPLICATION_NOT_FOUND, message: 'Application not found' }));
    }

    if (application.status !== ApplicationStatus.APPROVED) {
      return err(new AppError({ code: ErrorCode.APPLICATION_NOT_APPROVED, message: 'Application must be approved before creating lease' }));
    }

    // Verify creator is owner or agent
    if (application.listing.ownerId !== creatorId && application.listing.agentId !== creatorId) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized to create lease' }));
    }

    // Check for existing active lease
    const existingLease = await db.lease.findFirst({
      where: {
        tenantId: application.applicantId,
        listingId: application.listingId,
        status: { in: [LeaseStatus.DRAFT, LeaseStatus.PENDING_SIGNATURE, LeaseStatus.ACTIVE] },
        deletedAt: null,
      },
    });

    if (existingLease) {
      return err(new AppError({ code: ErrorCode.LEASE_ALREADY_EXISTS, message: 'An active lease already exists for this tenant and listing' }));
    }

    const lease = await db.lease.create({
      data: {
        tenantId: application.applicantId,
        listingId: application.listingId,
        applicationId: application.id,
        status: LeaseStatus.DRAFT,

        startDate: input.startDate,
        endDate: input.endDate,
        monthlyRent: input.monthlyRent,
        securityDeposit: input.securityDeposit,
        prorationAmount: input.prorationAmount,
        prorationDescription: input.prorationDescription,

        lateFeeDays: input.lateFeeDays,
        lateFeeAmount: input.lateFeeAmount,
        lateFeePercent: input.lateFeePercent,
        earlyTerminationNotice: input.earlyTerminationNotice,
        earlyTerminationFee: input.earlyTerminationFee,

        petDeposit: input.petDeposit,
        petRentMonthly: input.petRentMonthly,

        moveInDate: input.moveInDate,
        leaseDocumentUrl: input.leaseDocumentUrl,
        additionalDocuments: input.additionalDocuments as Prisma.JsonValue,
        specialTerms: input.specialTerms,
      },
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, unit: true },
        },
      },
    });

    // Update application status
    await db.application.update({
      where: { id: application.id },
      data: { status: ApplicationStatus.LEASE_SIGNED },
    });

    log.info({
      leaseId: lease.id,
      tenantId: lease.tenantId,
      listingId: lease.listingId,
    }, 'Lease created');

    return ok({
      ...lease,
      renewalStatus: getRenewalStatus(lease),
    });
  } catch (error) {
    log.error({ error, input }, 'Failed to create lease');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to create lease' }));
  }
}

// =============================================================================
// GET LEASE
// =============================================================================

export async function getLease(
  id: string,
  requesterId: string,
  requesterRole: string
): Promise<Result<LeaseWithDetails, AppError>> {
  try {
    const lease = await db.lease.findUnique({
      where: { id, deletedAt: null },
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, unit: true, ownerId: true, agentId: true },
        },
      },
    });

    if (!lease) {
      return err(new AppError({ code: ErrorCode.LEASE_NOT_FOUND, message: 'Lease not found' }));
    }

    // Authorization
    const isTenant = lease.tenantId === requesterId;
    const isOwner = lease.listing.ownerId === requesterId;
    const isAgent = lease.listing.agentId === requesterId;
    const isAdmin = requesterRole === 'ADMIN' || requesterRole === 'SUPER_ADMIN';

    if (!isTenant && !isOwner && !isAgent && !isAdmin) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized to view this lease' }));
    }

    // Remove sensitive listing fields
    const { ownerId, agentId, ...listingData } = lease.listing;

    return ok({
      ...lease,
      listing: listingData,
      renewalStatus: getRenewalStatus(lease),
    });
  } catch (error) {
    log.error({ error, leaseId: id }, 'Failed to get lease');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to get lease' }));
  }
}

// =============================================================================
// LIST LEASES
// =============================================================================

export async function listLeases(
  filters: LeaseFiltersInput,
  pagination: LeasePaginationInput,
  requesterId: string,
  requesterRole: string
): Promise<Result<{
  leases: LeaseWithDetails[];
  total: number;
  page: number;
  totalPages: number;
}, AppError>> {
  try {
    const isAdmin = requesterRole === 'ADMIN' || requesterRole === 'SUPER_ADMIN';

    const where: Prisma.LeaseWhereInput = {
      deletedAt: null,
      ...(filters.listingId && { listingId: filters.listingId }),
      ...(filters.tenantId && { tenantId: filters.tenantId }),
      ...(filters.status && { status: filters.status }),
      ...(filters.monthToMonth !== undefined && { isMonthToMonth: filters.monthToMonth }),
      ...(filters.expiringWithinDays && {
        endDate: {
          lte: new Date(Date.now() + filters.expiringWithinDays * 24 * 60 * 60 * 1000),
          gte: new Date(),
        },
        status: LeaseStatus.ACTIVE,
      }),
    };

    // Non-admins can only see their own leases or leases for their properties
    if (!isAdmin) {
      if (filters.landlordId) {
        where.listing = { ownerId: filters.landlordId };
      } else {
        where.OR = [
          { tenantId: requesterId },
          { listing: { ownerId: requesterId } },
          { listing: { agentId: requesterId } },
        ];
      }
    }

    const [leases, total] = await Promise.all([
      db.lease.findMany({
        where,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: { [pagination.sortBy]: pagination.sortOrder },
        include: {
          tenant: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          },
          listing: {
            select: { id: true, title: true, address: true, unit: true },
          },
        },
      }),
      db.lease.count({ where }),
    ]);

    const leasesWithDetails = leases.map(lease => ({
      ...lease,
      renewalStatus: getRenewalStatus(lease),
    }));

    return ok({
      leases: leasesWithDetails,
      total,
      page: pagination.page,
      totalPages: Math.ceil(total / pagination.limit),
    });
  } catch (error) {
    log.error({ error, filters }, 'Failed to list leases');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to list leases' }));
  }
}

// =============================================================================
// ACTIVATE LEASE
// =============================================================================

export async function activateLease(
  id: string,
  requesterId: string
): Promise<Result<LeaseWithDetails, AppError>> {
  try {
    const lease = await db.lease.findUnique({
      where: { id, deletedAt: null },
      include: {
        listing: { select: { ownerId: true, agentId: true } },
      },
    });

    if (!lease) {
      return err(new AppError({ code: ErrorCode.LEASE_NOT_FOUND, message: 'Lease not found' }));
    }

    if (lease.listing.ownerId !== requesterId && lease.listing.agentId !== requesterId) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    if (lease.status !== LeaseStatus.PENDING_SIGNATURE) {
      return err(new AppError({ code: ErrorCode.LEASE_INVALID_STATUS, message: 'Lease must be pending signature to activate' }));
    }

    const updated = await db.lease.update({
      where: { id },
      data: {
        status: LeaseStatus.ACTIVE,
        signedAt: new Date(),
      },
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, unit: true },
        },
      },
    });

    // Update listing status
    await db.listing.update({
      where: { id: lease.listingId },
      data: { status: 'RENTED' },
    });

    log.info({ leaseId: id }, 'Lease activated');

    return ok({
      ...updated,
      renewalStatus: getRenewalStatus(updated),
    });
  } catch (error) {
    log.error({ error, leaseId: id }, 'Failed to activate lease');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to activate lease' }));
  }
}

// =============================================================================
// RENEWAL WORKFLOW
// =============================================================================

export async function sendRenewalOffer(
  id: string,
  offer: RenewalOfferInput,
  senderId: string
): Promise<Result<LeaseWithDetails, AppError>> {
  try {
    const lease = await db.lease.findUnique({
      where: { id, deletedAt: null },
      include: {
        listing: { select: { ownerId: true, agentId: true } },
      },
    });

    if (!lease) {
      return err(new AppError({ code: ErrorCode.LEASE_NOT_FOUND, message: 'Lease not found' }));
    }

    if (lease.listing.ownerId !== senderId && lease.listing.agentId !== senderId) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    if (lease.status !== LeaseStatus.ACTIVE) {
      return err(new AppError({ code: ErrorCode.LEASE_INVALID_STATUS, message: 'Lease must be active to send renewal offer' }));
    }

    const updated = await db.lease.update({
      where: { id },
      data: {
        renewalOfferSent: true,
        renewalOfferSentAt: new Date(),
        renewalOfferDetails: {
          newMonthlyRent: offer.newMonthlyRent,
          newTermMonths: offer.newTermMonths,
          rentIncreasePercent: offer.rentIncreasePercent,
          specialOfferTerms: offer.specialOfferTerms,
          offerExpiresAt: offer.offerExpiresAt,
          incentives: offer.incentives,
        } as Prisma.JsonValue,
      },
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, unit: true },
        },
      },
    });

    log.info({ leaseId: id, offer }, 'Renewal offer sent');

    return ok({
      ...updated,
      renewalStatus: getRenewalStatus(updated),
    });
  } catch (error) {
    log.error({ error, leaseId: id }, 'Failed to send renewal offer');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to send renewal offer' }));
  }
}

export async function respondToRenewalOffer(
  id: string,
  response: RenewalResponseInput,
  tenantId: string
): Promise<Result<LeaseWithDetails, AppError>> {
  try {
    const lease = await db.lease.findUnique({
      where: { id, deletedAt: null },
    });

    if (!lease) {
      return err(new AppError({ code: ErrorCode.LEASE_NOT_FOUND, message: 'Lease not found' }));
    }

    if (lease.tenantId !== tenantId) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    if (!lease.renewalOfferSent) {
      return err(new AppError({ code: ErrorCode.LEASE_RENEWAL_NOT_AVAILABLE, message: 'No renewal offer to respond to' }));
    }

    const updated = await db.lease.update({
      where: { id },
      data: {
        renewalOfferAccepted: response.accepted,
        renewalOfferRespondedAt: new Date(),
        renewalOfferResponse: {
          accepted: response.accepted,
          counterOfferRent: response.counterOfferRent,
          counterOfferTerms: response.counterOfferTerms,
          declineReason: response.declineReason,
        } as Prisma.JsonValue,
      },
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, unit: true },
        },
      },
    });

    log.info({ leaseId: id, accepted: response.accepted }, 'Renewal offer response received');

    return ok({
      ...updated,
      renewalStatus: getRenewalStatus(updated),
    });
  } catch (error) {
    log.error({ error, leaseId: id }, 'Failed to respond to renewal offer');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to respond' }));
  }
}

export async function convertToMonthToMonth(
  id: string,
  requesterId: string
): Promise<Result<LeaseWithDetails, AppError>> {
  try {
    const lease = await db.lease.findUnique({
      where: { id, deletedAt: null },
      include: {
        listing: { select: { ownerId: true, agentId: true } },
      },
    });

    if (!lease) {
      return err(new AppError({ code: ErrorCode.LEASE_NOT_FOUND, message: 'Lease not found' }));
    }

    if (lease.listing.ownerId !== requesterId && lease.listing.agentId !== requesterId) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    const updated = await db.lease.update({
      where: { id },
      data: {
        isMonthToMonth: true,
        endDate: null,
      },
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, unit: true },
        },
      },
    });

    log.info({ leaseId: id }, 'Lease converted to month-to-month');

    return ok({
      ...updated,
      renewalStatus: getRenewalStatus(updated),
    });
  } catch (error) {
    log.error({ error, leaseId: id }, 'Failed to convert to month-to-month');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to convert' }));
  }
}

// =============================================================================
// TERMINATION
// =============================================================================

export async function requestTermination(
  id: string,
  request: TerminationRequestInput,
  requesterId: string,
  requesterRole: string
): Promise<Result<LeaseWithDetails, AppError>> {
  try {
    const lease = await db.lease.findUnique({
      where: { id, deletedAt: null },
      include: {
        listing: { select: { ownerId: true, agentId: true } },
      },
    });

    if (!lease) {
      return err(new AppError({ code: ErrorCode.LEASE_NOT_FOUND, message: 'Lease not found' }));
    }

    // Authorization
    const isTenant = lease.tenantId === requesterId;
    const isOwner = lease.listing.ownerId === requesterId;
    const isAgent = lease.listing.agentId === requesterId;
    const isAdmin = requesterRole === 'ADMIN' || requesterRole === 'SUPER_ADMIN';

    if (!isTenant && !isOwner && !isAgent && !isAdmin) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    const updated = await db.lease.update({
      where: { id },
      data: {
        status: LeaseStatus.TERMINATION_PENDING,
        terminationRequestedAt: new Date(),
        terminationRequestedBy: requesterId,
        terminationReason: request.reason,
        terminationNotes: request.notes,
        terminationDate: request.requestedEndDate,
      },
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, unit: true },
        },
      },
    });

    log.info({ leaseId: id, reason: request.reason }, 'Termination requested');

    return ok({
      ...updated,
      renewalStatus: getRenewalStatus(updated),
    });
  } catch (error) {
    log.error({ error, leaseId: id }, 'Failed to request termination');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to request termination' }));
  }
}

// =============================================================================
// MOVE OUT
// =============================================================================

export async function recordMoveOutInspection(
  id: string,
  inspection: MoveOutInspectionInput,
  inspectorId: string
): Promise<Result<LeaseWithDetails, AppError>> {
  try {
    const lease = await db.lease.findUnique({
      where: { id, deletedAt: null },
      include: {
        listing: { select: { ownerId: true, agentId: true } },
      },
    });

    if (!lease) {
      return err(new AppError({ code: ErrorCode.LEASE_NOT_FOUND, message: 'Lease not found' }));
    }

    if (lease.listing.ownerId !== inspectorId && lease.listing.agentId !== inspectorId) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    const updated = await db.lease.update({
      where: { id },
      data: {
        status: LeaseStatus.EXPIRED,
        moveOutInspection: inspection as unknown as Prisma.JsonValue,
        moveOutDate: inspection.inspectionDate,
        depositRefundAmount: inspection.depositRefundAmount,
        depositDeductions: inspection.deductionAmount,
        depositDeductionReason: inspection.deductionReason,
      },
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, unit: true },
        },
      },
    });

    // Make listing available again
    await db.listing.update({
      where: { id: lease.listingId },
      data: { status: 'ACTIVE' },
    });

    log.info({ leaseId: id, refundAmount: inspection.depositRefundAmount }, 'Move out inspection recorded');

    return ok({
      ...updated,
      renewalStatus: getRenewalStatus(updated),
    });
  } catch (error) {
    log.error({ error, leaseId: id }, 'Failed to record move out inspection');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to record inspection' }));
  }
}

// =============================================================================
// EXPIRING LEASES
// =============================================================================

export async function getExpiringLeases(
  daysAhead: number,
  landlordId?: string
): Promise<Result<LeaseWithDetails[], AppError>> {
  try {
    const targetDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

    const where: Prisma.LeaseWhereInput = {
      status: LeaseStatus.ACTIVE,
      isMonthToMonth: false,
      endDate: {
        lte: targetDate,
        gte: new Date(),
      },
      deletedAt: null,
      renewalOfferSent: false,
    };

    if (landlordId) {
      where.listing = { ownerId: landlordId };
    }

    const leases = await db.lease.findMany({
      where,
      orderBy: { endDate: 'asc' },
      include: {
        tenant: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
        listing: {
          select: { id: true, title: true, address: true, unit: true },
        },
      },
    });

    return ok(leases.map(lease => ({
      ...lease,
      renewalStatus: getRenewalStatus(lease),
    })));
  } catch (error) {
    log.error({ error, daysAhead }, 'Failed to get expiring leases');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to get expiring leases' }));
  }
}
