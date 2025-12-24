/**
 * Payments Service
 * Payment processing, tracking, and late fee management
 */

import { Prisma, Payment, PaymentStatus, PaymentType, LeaseStatus } from '@prisma/client';
import { db } from '../../lib/database.js';
import { Result, ok, err } from '../../lib/result.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import { logger, createModuleLogger } from '../../lib/logger.js';
import type {
  CreatePaymentInput,
  RecordPaymentInput,
  SchedulePaymentsInput,
  RefundInput,
  PaymentFiltersInput,
  PaymentPaginationInput,
} from './payments.schemas.js';

const log = createModuleLogger('payments-service');

// =============================================================================
// TYPES
// =============================================================================

export interface PaymentWithDetails extends Payment {
  lease: {
    id: string;
    startDate: Date;
    monthlyRent: Prisma.Decimal;
    tenant: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
    listing: {
      id: string;
      address: string;
      unit: string | null;
    };
  };
  isOverdue: boolean;
  daysOverdue: number;
}

export interface PaymentSummary {
  totalDue: number;
  totalPaid: number;
  totalOverdue: number;
  overdueCount: number;
  upcomingCount: number;
  nextDueDate: Date | null;
  nextDueAmount: number | null;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function enrichPayment(payment: Payment & { lease: any }): PaymentWithDetails {
  const now = new Date();
  const dueDate = new Date(payment.dueDate);
  const isOverdue = payment.status === PaymentStatus.PENDING && dueDate < now;
  const daysOverdue = isOverdue
    ? Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  return {
    ...payment,
    isOverdue,
    daysOverdue,
  };
}

// =============================================================================
// CREATE PAYMENT
// =============================================================================

export async function createPayment(
  input: CreatePaymentInput,
  creatorId: string
): Promise<Result<PaymentWithDetails, AppError>> {
  try {
    // Verify lease exists and creator is authorized
    const lease = await db.lease.findUnique({
      where: { id: input.leaseId, deletedAt: null },
      include: {
        listing: { select: { ownerId: true, agentId: true } },
      },
    });

    if (!lease) {
      return err(new AppError({ code: ErrorCode.LEASE_NOT_FOUND, message: 'Lease not found' }));
    }

    if (lease.listing.ownerId !== creatorId && lease.listing.agentId !== creatorId) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    const payment = await db.payment.create({
      data: {
        leaseId: input.leaseId,
        tenantId: lease.tenantId,
        type: input.type,
        amount: input.amount,
        dueDate: input.dueDate,
        description: input.description,
        status: PaymentStatus.PENDING,
      },
      include: {
        lease: {
          select: {
            id: true,
            startDate: true,
            monthlyRent: true,
            tenant: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            listing: {
              select: { id: true, address: true, unit: true },
            },
          },
        },
      },
    });

    log.info({ paymentId: payment.id, leaseId: input.leaseId }, 'Payment created');

    return ok(enrichPayment(payment));
  } catch (error) {
    log.error({ error, input }, 'Failed to create payment');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to create payment' }));
  }
}

// =============================================================================
// RECORD PAYMENT
// =============================================================================

export async function recordPayment(
  id: string,
  input: RecordPaymentInput,
  recorderId: string
): Promise<Result<PaymentWithDetails, AppError>> {
  try {
    const payment = await db.payment.findUnique({
      where: { id, deletedAt: null },
      include: {
        lease: {
          include: {
            listing: { select: { ownerId: true, agentId: true } },
          },
        },
      },
    });

    if (!payment) {
      return err(new AppError({ code: ErrorCode.PAYMENT_NOT_FOUND, message: 'Payment not found' }));
    }

    // Verify authorization (owner, agent, or tenant paying)
    const isOwner = payment.lease.listing.ownerId === recorderId;
    const isAgent = payment.lease.listing.agentId === recorderId;
    const isTenant = payment.tenantId === recorderId;

    if (!isOwner && !isAgent && !isTenant) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    if (payment.status === PaymentStatus.PAID) {
      return err(new AppError({ code: ErrorCode.PAYMENT_ALREADY_PROCESSED, message: 'Payment already recorded' }));
    }

    const isPartial = input.paidAmount < Number(payment.amount);
    const newStatus = isPartial ? PaymentStatus.PARTIAL : PaymentStatus.PAID;

    const updated = await db.payment.update({
      where: { id },
      data: {
        status: newStatus,
        method: input.method,
        transactionId: input.transactionId,
        paidAmount: input.paidAmount,
        paidAt: input.paidDate,
        notes: input.notes,
        lateFeeApplied: input.lateFeeApplied,
        lateFeeAmount: input.lateFeeAmount,
      },
      include: {
        lease: {
          select: {
            id: true,
            startDate: true,
            monthlyRent: true,
            tenant: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            listing: {
              select: { id: true, address: true, unit: true },
            },
          },
        },
      },
    });

    log.info({
      paymentId: id,
      amount: input.paidAmount,
      method: input.method,
      status: newStatus,
    }, 'Payment recorded');

    return ok(enrichPayment(updated));
  } catch (error) {
    log.error({ error, paymentId: id }, 'Failed to record payment');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to record payment' }));
  }
}

// =============================================================================
// SCHEDULE RECURRING PAYMENTS
// =============================================================================

export async function schedulePayments(
  input: SchedulePaymentsInput,
  creatorId: string
): Promise<Result<PaymentWithDetails[], AppError>> {
  try {
    const lease = await db.lease.findUnique({
      where: { id: input.leaseId, deletedAt: null },
      include: {
        listing: { select: { ownerId: true, agentId: true } },
      },
    });

    if (!lease) {
      return err(new AppError({ code: ErrorCode.LEASE_NOT_FOUND, message: 'Lease not found' }));
    }

    if (lease.listing.ownerId !== creatorId && lease.listing.agentId !== creatorId) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    // Generate payment dates
    const payments: Prisma.PaymentCreateManyInput[] = [];
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);

    let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), input.dayOfMonth);
    if (currentDate < startDate) {
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    while (currentDate <= endDate) {
      payments.push({
        leaseId: input.leaseId,
        tenantId: lease.tenantId,
        type: PaymentType.RENT,
        amount: input.monthlyAmount,
        dueDate: new Date(currentDate),
        status: PaymentStatus.PENDING,
        description: `Rent for ${currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
      });

      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    await db.payment.createMany({ data: payments });

    // Fetch created payments
    const createdPayments = await db.payment.findMany({
      where: {
        leaseId: input.leaseId,
        type: PaymentType.RENT,
        dueDate: { gte: input.startDate, lte: input.endDate },
      },
      include: {
        lease: {
          select: {
            id: true,
            startDate: true,
            monthlyRent: true,
            tenant: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            listing: {
              select: { id: true, address: true, unit: true },
            },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    log.info({
      leaseId: input.leaseId,
      paymentCount: payments.length,
    }, 'Payments scheduled');

    return ok(createdPayments.map(enrichPayment));
  } catch (error) {
    log.error({ error, input }, 'Failed to schedule payments');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to schedule payments' }));
  }
}

// =============================================================================
// GET PAYMENT
// =============================================================================

export async function getPayment(
  id: string,
  requesterId: string,
  requesterRole: string
): Promise<Result<PaymentWithDetails, AppError>> {
  try {
    const payment = await db.payment.findUnique({
      where: { id, deletedAt: null },
      include: {
        lease: {
          select: {
            id: true,
            startDate: true,
            monthlyRent: true,
            tenant: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            listing: {
              select: { id: true, address: true, unit: true, ownerId: true, agentId: true },
            },
          },
        },
      },
    });

    if (!payment) {
      return err(new AppError({ code: ErrorCode.PAYMENT_NOT_FOUND, message: 'Payment not found' }));
    }

    const isOwner = payment.lease.listing.ownerId === requesterId;
    const isAgent = payment.lease.listing.agentId === requesterId;
    const isTenant = payment.tenantId === requesterId;
    const isAdmin = requesterRole === 'ADMIN' || requesterRole === 'SUPER_ADMIN';

    if (!isOwner && !isAgent && !isTenant && !isAdmin) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    // Remove sensitive fields
    const { ownerId, agentId, ...listing } = payment.lease.listing;

    return ok(enrichPayment({
      ...payment,
      lease: { ...payment.lease, listing },
    }));
  } catch (error) {
    log.error({ error, paymentId: id }, 'Failed to get payment');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to get payment' }));
  }
}

// =============================================================================
// LIST PAYMENTS
// =============================================================================

export async function listPayments(
  filters: PaymentFiltersInput,
  pagination: PaymentPaginationInput,
  requesterId: string,
  requesterRole: string
): Promise<Result<{
  payments: PaymentWithDetails[];
  total: number;
  page: number;
  totalPages: number;
}, AppError>> {
  try {
    const isAdmin = requesterRole === 'ADMIN' || requesterRole === 'SUPER_ADMIN';
    const now = new Date();

    const where: Prisma.PaymentWhereInput = {
      deletedAt: null,
      ...(filters.leaseId && { leaseId: filters.leaseId }),
      ...(filters.tenantId && { tenantId: filters.tenantId }),
      ...(filters.status && { status: filters.status }),
      ...(filters.type && { type: filters.type }),
      ...(filters.method && { method: filters.method }),
      ...(filters.dueDateFrom && { dueDate: { gte: filters.dueDateFrom } }),
      ...(filters.dueDateTo && { dueDate: { lte: filters.dueDateTo } }),
      ...(filters.overdue && {
        status: PaymentStatus.PENDING,
        dueDate: { lt: now },
      }),
    };

    if (!isAdmin) {
      where.OR = [
        { tenantId: requesterId },
        { lease: { listing: { ownerId: requesterId } } },
        { lease: { listing: { agentId: requesterId } } },
      ];
    }

    const [payments, total] = await Promise.all([
      db.payment.findMany({
        where,
        skip: (pagination.page - 1) * pagination.limit,
        take: pagination.limit,
        orderBy: { [pagination.sortBy]: pagination.sortOrder },
        include: {
          lease: {
            select: {
              id: true,
              startDate: true,
              monthlyRent: true,
              tenant: {
                select: { id: true, firstName: true, lastName: true, email: true },
              },
              listing: {
                select: { id: true, address: true, unit: true },
              },
            },
          },
        },
      }),
      db.payment.count({ where }),
    ]);

    return ok({
      payments: payments.map(enrichPayment),
      total,
      page: pagination.page,
      totalPages: Math.ceil(total / pagination.limit),
    });
  } catch (error) {
    log.error({ error, filters }, 'Failed to list payments');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to list payments' }));
  }
}

// =============================================================================
// PAYMENT SUMMARY
// =============================================================================

export async function getPaymentSummary(
  leaseId: string,
  requesterId: string,
  requesterRole: string
): Promise<Result<PaymentSummary, AppError>> {
  try {
    const lease = await db.lease.findUnique({
      where: { id: leaseId, deletedAt: null },
      include: {
        listing: { select: { ownerId: true, agentId: true } },
      },
    });

    if (!lease) {
      return err(new AppError({ code: ErrorCode.LEASE_NOT_FOUND, message: 'Lease not found' }));
    }

    const isOwner = lease.listing.ownerId === requesterId;
    const isAgent = lease.listing.agentId === requesterId;
    const isTenant = lease.tenantId === requesterId;
    const isAdmin = requesterRole === 'ADMIN' || requesterRole === 'SUPER_ADMIN';

    if (!isOwner && !isAgent && !isTenant && !isAdmin) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    const now = new Date();

    const [payments, overduePayments, upcomingPayments] = await Promise.all([
      db.payment.findMany({
        where: { leaseId, deletedAt: null },
      }),
      db.payment.findMany({
        where: {
          leaseId,
          status: PaymentStatus.PENDING,
          dueDate: { lt: now },
          deletedAt: null,
        },
      }),
      db.payment.findMany({
        where: {
          leaseId,
          status: PaymentStatus.PENDING,
          dueDate: { gte: now },
          deletedAt: null,
        },
        orderBy: { dueDate: 'asc' },
        take: 1,
      }),
    ]);

    const totalDue = payments
      .filter(p => p.status === PaymentStatus.PENDING)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const totalPaid = payments
      .filter(p => p.status === PaymentStatus.PAID)
      .reduce((sum, p) => sum + Number(p.paidAmount || p.amount), 0);

    const totalOverdue = overduePayments.reduce((sum, p) => sum + Number(p.amount), 0);

    return ok({
      totalDue,
      totalPaid,
      totalOverdue,
      overdueCount: overduePayments.length,
      upcomingCount: upcomingPayments.length,
      nextDueDate: upcomingPayments[0]?.dueDate || null,
      nextDueAmount: upcomingPayments[0] ? Number(upcomingPayments[0].amount) : null,
    });
  } catch (error) {
    log.error({ error, leaseId }, 'Failed to get payment summary');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to get summary' }));
  }
}

// =============================================================================
// PROCESS REFUND
// =============================================================================

export async function processRefund(
  id: string,
  refund: RefundInput,
  processerId: string
): Promise<Result<PaymentWithDetails, AppError>> {
  try {
    const payment = await db.payment.findUnique({
      where: { id, deletedAt: null },
      include: {
        lease: {
          include: {
            listing: { select: { ownerId: true, agentId: true } },
          },
        },
      },
    });

    if (!payment) {
      return err(new AppError({ code: ErrorCode.PAYMENT_NOT_FOUND, message: 'Payment not found' }));
    }

    if (payment.lease.listing.ownerId !== processerId && payment.lease.listing.agentId !== processerId) {
      return err(new AppError({ code: ErrorCode.AUTHZ_FORBIDDEN, message: 'Not authorized' }));
    }

    if (payment.status !== PaymentStatus.PAID) {
      return err(new AppError({ code: ErrorCode.PAYMENT_NOT_COMPLETED, message: 'Can only refund paid payments' }));
    }

    const updated = await db.payment.update({
      where: { id },
      data: {
        status: PaymentStatus.REFUNDED,
        refundAmount: refund.amount,
        refundReason: refund.reason,
        refundedAt: new Date(),
        notes: payment.notes
          ? `${payment.notes}\n\nRefund: ${refund.notes || refund.reason}`
          : `Refund: ${refund.notes || refund.reason}`,
      },
      include: {
        lease: {
          select: {
            id: true,
            startDate: true,
            monthlyRent: true,
            tenant: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            listing: {
              select: { id: true, address: true, unit: true },
            },
          },
        },
      },
    });

    log.info({
      paymentId: id,
      refundAmount: refund.amount,
      reason: refund.reason,
    }, 'Refund processed');

    return ok(enrichPayment(updated));
  } catch (error) {
    log.error({ error, paymentId: id }, 'Failed to process refund');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to process refund' }));
  }
}

// =============================================================================
// GET OVERDUE PAYMENTS
// =============================================================================

export async function getOverduePayments(
  landlordId?: string
): Promise<Result<PaymentWithDetails[], AppError>> {
  try {
    const now = new Date();

    const where: Prisma.PaymentWhereInput = {
      status: PaymentStatus.PENDING,
      dueDate: { lt: now },
      deletedAt: null,
    };

    if (landlordId) {
      where.lease = { listing: { ownerId: landlordId } };
    }

    const payments = await db.payment.findMany({
      where,
      orderBy: { dueDate: 'asc' },
      include: {
        lease: {
          select: {
            id: true,
            startDate: true,
            monthlyRent: true,
            tenant: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
            listing: {
              select: { id: true, address: true, unit: true },
            },
          },
        },
      },
    });

    return ok(payments.map(enrichPayment));
  } catch (error) {
    log.error({ error }, 'Failed to get overdue payments');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to get overdue payments' }));
  }
}
