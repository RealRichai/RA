/**
 * Payments Schemas
 * Zod validation schemas for payment processing
 */

import { z } from 'zod';
import { PaymentStatus, PaymentMethod, PaymentType } from '@prisma/client';

export const PaymentStatusEnum = z.nativeEnum(PaymentStatus);
export const PaymentMethodEnum = z.nativeEnum(PaymentMethod);
export const PaymentTypeEnum = z.nativeEnum(PaymentType);

// =============================================================================
// CREATE PAYMENT
// =============================================================================

export const CreatePaymentSchema = z.object({
  leaseId: z.string().cuid(),
  type: PaymentTypeEnum,
  amount: z.number().min(0),
  dueDate: z.coerce.date(),
  description: z.string().max(500).optional(),
});

export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;

// =============================================================================
// RECORD PAYMENT
// =============================================================================

export const RecordPaymentSchema = z.object({
  method: PaymentMethodEnum,
  transactionId: z.string().max(100).optional(),
  paidAmount: z.number().min(0),
  paidDate: z.coerce.date(),
  notes: z.string().max(1000).optional(),
  // Late fee
  lateFeeApplied: z.boolean().default(false),
  lateFeeAmount: z.number().min(0).optional(),
});

export type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>;

// =============================================================================
// SCHEDULE PAYMENTS (Recurring)
// =============================================================================

export const SchedulePaymentsSchema = z.object({
  leaseId: z.string().cuid(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  dayOfMonth: z.number().int().min(1).max(31).default(1),
  monthlyAmount: z.number().min(0),
});

export type SchedulePaymentsInput = z.infer<typeof SchedulePaymentsSchema>;

// =============================================================================
// REFUND
// =============================================================================

export const RefundSchema = z.object({
  reason: z.enum(['overpayment', 'lease_termination', 'error', 'deposit_return', 'other']),
  amount: z.number().min(0),
  notes: z.string().max(1000).optional(),
});

export type RefundInput = z.infer<typeof RefundSchema>;

// =============================================================================
// FILTERS
// =============================================================================

export const PaymentFiltersSchema = z.object({
  leaseId: z.string().cuid().optional(),
  tenantId: z.string().cuid().optional(),
  status: PaymentStatusEnum.optional(),
  type: PaymentTypeEnum.optional(),
  method: PaymentMethodEnum.optional(),
  dueDateFrom: z.coerce.date().optional(),
  dueDateTo: z.coerce.date().optional(),
  overdue: z.coerce.boolean().optional(),
});

export type PaymentFiltersInput = z.infer<typeof PaymentFiltersSchema>;

export const PaymentPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['dueDate', 'amount', 'createdAt', 'paidAt']).default('dueDate'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaymentPaginationInput = z.infer<typeof PaymentPaginationSchema>;
