import {
  prisma,
  RentScheduleStatus,
  ScheduledChargeStatus,
  RentPaymentMethodType,
} from '@realriches/database';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Types
export type PaymentMethod = 'ach' | 'credit_card' | 'debit_card' | 'check' | 'cash';
export type ScheduleStatus = 'active' | 'paused' | 'cancelled' | 'completed';
export type ChargeStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'disputed';
export type LateFeeType = 'flat' | 'percentage' | 'daily' | 'tiered';

export interface LateFeeConfig {
  type: LateFeeType;
  amount: number;
  maxAmount: number | null;
  startAfterDays: number;
  tiers?: Array<{ days: number; amount: number }>;
}

// Schemas
const createScheduleSchema = z.object({
  leaseId: z.string().uuid(),
  tenantId: z.string().uuid(),
  propertyId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  dayOfMonth: z.number().int().min(1).max(28),
  gracePeriodDays: z.number().int().min(0).max(30).default(5),
  paymentMethod: z.enum(['ach', 'credit_card', 'debit_card', 'check', 'cash']),
  paymentMethodId: z.string().uuid().optional(),
  autoCharge: z.boolean().default(true),
  lateFeeConfig: z.object({
    type: z.enum(['flat', 'percentage', 'daily', 'tiered']),
    amount: z.number().nonnegative(),
    maxAmount: z.number().positive().optional(),
    startAfterDays: z.number().int().min(1).default(5),
    tiers: z.array(z.object({
      days: z.number().int().positive(),
      amount: z.number().positive(),
    })).optional(),
  }).optional(),
});

const updateScheduleSchema = z.object({
  amount: z.number().positive().optional(),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  gracePeriodDays: z.number().int().min(0).max(30).optional(),
  paymentMethod: z.enum(['ach', 'credit_card', 'debit_card', 'check', 'cash']).optional(),
  paymentMethodId: z.string().uuid().optional(),
  autoCharge: z.boolean().optional(),
  status: z.enum(['active', 'paused']).optional(),
  lateFeeConfig: z.object({
    type: z.enum(['flat', 'percentage', 'daily', 'tiered']),
    amount: z.number().nonnegative(),
    maxAmount: z.number().positive().optional(),
    startAfterDays: z.number().int().min(1),
    tiers: z.array(z.object({
      days: z.number().int().positive(),
      amount: z.number().positive(),
    })).optional(),
  }).optional(),
});

const addPaymentMethodSchema = z.object({
  tenantId: z.string().uuid(),
  type: z.enum(['ach', 'credit_card', 'debit_card']),
  stripePaymentMethodId: z.string().optional(),
  plaidPublicToken: z.string().optional(),
  plaidAccountId: z.string().optional(),
  setAsDefault: z.boolean().default(false),
});

const manualChargeSchema = z.object({
  scheduleId: z.string().uuid(),
  amount: z.number().positive().optional(),
  includeLateFees: z.boolean().default(true),
});

// Helper functions
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function calculateNextChargeDate(dayOfMonth: number): Date {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
  if (next <= now) {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

export function calculateLateFee(config: LateFeeConfig, baseAmount: number, daysLate: number): number {
  if (daysLate < config.startAfterDays) {
    return 0;
  }

  let fee = 0;
  const effectiveDaysLate = daysLate - config.startAfterDays + 1;

  switch (config.type) {
    case 'flat':
      fee = config.amount;
      break;
    case 'percentage':
      fee = baseAmount * (config.amount / 100);
      break;
    case 'daily':
      fee = config.amount * effectiveDaysLate;
      break;
    case 'tiered':
      if (config.tiers && config.tiers.length > 0) {
        const sortedTiers = [...config.tiers].sort((a, b) => b.days - a.days);
        for (const tier of sortedTiers) {
          if (effectiveDaysLate >= tier.days) {
            fee = tier.amount;
            break;
          }
        }
      }
      break;
  }

  if (config.maxAmount && fee > config.maxAmount) {
    fee = config.maxAmount;
  }

  return Math.round(fee * 100) / 100;
}

// Stripe mock integration
interface StripePaymentIntent {
  id: string;
  amount: number;
  status: 'requires_payment_method' | 'requires_confirmation' | 'processing' | 'succeeded' | 'failed';
  paymentMethodId: string;
}

async function createStripePaymentIntent(
  amount: number,
  _currency: string,
  paymentMethodId: string,
  _customerId: string
): Promise<StripePaymentIntent> {
  // Mock Stripe API call
  await new Promise((resolve) => setTimeout(resolve, 100));

  const success = Math.random() > 0.1; // 90% success rate

  return {
    id: `pi_${generateId()}`,
    amount: Math.round(amount * 100),
    status: success ? 'succeeded' : 'failed',
    paymentMethodId,
  };
}

function mapPaymentMethod(method: PaymentMethod): RentPaymentMethodType {
  return method as RentPaymentMethodType;
}

// Route handlers
export async function rentCollectionRoutes(app: FastifyInstance): Promise<void> {
  // Create payment schedule
  app.post('/schedules', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createScheduleSchema.parse(request.body);

    const schedule = await prisma.rentPaymentSchedule.create({
      data: {
        leaseId: body.leaseId,
        tenantId: body.tenantId,
        propertyId: body.propertyId,
        amount: Math.round(body.amount * 100), // Store in cents
        currency: body.currency,
        dayOfMonth: body.dayOfMonth,
        gracePeriodDays: body.gracePeriodDays,
        paymentMethod: mapPaymentMethod(body.paymentMethod),
        paymentMethodId: body.paymentMethodId,
        autoCharge: body.autoCharge,
        status: RentScheduleStatus.active,
        nextChargeDate: calculateNextChargeDate(body.dayOfMonth),
        lateFeeConfig: body.lateFeeConfig ?? undefined,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...schedule,
        amount: schedule.amount / 100,
      },
    });
  });

  // Get payment schedule by ID
  app.get('/schedules/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const schedule = await prisma.rentPaymentSchedule.findUnique({
      where: { id },
      include: { charges: true },
    });

    if (!schedule) {
      return reply.status(404).send({
        success: false,
        error: 'Payment schedule not found',
      });
    }

    return reply.send({
      success: true,
      data: {
        ...schedule,
        amount: schedule.amount / 100,
      },
    });
  });

  // List payment schedules
  app.get('/schedules', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      leaseId?: string;
      tenantId?: string;
      propertyId?: string;
      status?: ScheduleStatus;
    };

    const where: Record<string, unknown> = {};
    if (query.leaseId) where.leaseId = query.leaseId;
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.propertyId) where.propertyId = query.propertyId;
    if (query.status) where.status = query.status;

    const schedules = await prisma.rentPaymentSchedule.findMany({ where });

    return reply.send({
      success: true,
      data: schedules.map(s => ({ ...s, amount: s.amount / 100 })),
      total: schedules.length,
    });
  });

  // Update payment schedule
  app.patch('/schedules/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateScheduleSchema.parse(request.body);

    const existing = await prisma.rentPaymentSchedule.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: 'Payment schedule not found',
      });
    }

    const updateData: Record<string, unknown> = {};
    if (body.amount !== undefined) updateData.amount = Math.round(body.amount * 100);
    if (body.dayOfMonth !== undefined) {
      updateData.dayOfMonth = body.dayOfMonth;
      updateData.nextChargeDate = calculateNextChargeDate(body.dayOfMonth);
    }
    if (body.gracePeriodDays !== undefined) updateData.gracePeriodDays = body.gracePeriodDays;
    if (body.paymentMethod !== undefined) updateData.paymentMethod = mapPaymentMethod(body.paymentMethod);
    if (body.paymentMethodId !== undefined) updateData.paymentMethodId = body.paymentMethodId;
    if (body.autoCharge !== undefined) updateData.autoCharge = body.autoCharge;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.lateFeeConfig !== undefined) updateData.lateFeeConfig = body.lateFeeConfig;

    const updated = await prisma.rentPaymentSchedule.update({
      where: { id },
      data: updateData,
    });

    return reply.send({
      success: true,
      data: { ...updated, amount: updated.amount / 100 },
    });
  });

  // Cancel payment schedule
  app.delete('/schedules/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.rentPaymentSchedule.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: 'Payment schedule not found',
      });
    }

    await prisma.rentPaymentSchedule.update({
      where: { id },
      data: { status: RentScheduleStatus.cancelled },
    });

    return reply.send({
      success: true,
      message: 'Payment schedule cancelled',
    });
  });

  // Process scheduled charges (cron job endpoint)
  app.post('/schedules/process', async (request: FastifyRequest, reply: FastifyReply) => {
    const now = new Date();

    const activeSchedules = await prisma.rentPaymentSchedule.findMany({
      where: {
        status: RentScheduleStatus.active,
        nextChargeDate: { lte: now },
      },
    });

    const results: Array<{ scheduleId: string; chargeId: string; status: string }> = [];

    for (const schedule of activeSchedules) {
      const dueDate = new Date(schedule.nextChargeDate);
      const daysLate = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

      const lateFeeConfig = schedule.lateFeeConfig as unknown as LateFeeConfig | null;
      const lateFee = lateFeeConfig
        ? Math.round(calculateLateFee(lateFeeConfig, schedule.amount / 100, daysLate) * 100)
        : 0;

      let chargeStatus: ScheduledChargeStatus = ScheduledChargeStatus.pending;
      let paymentIntentId: string | null = null;
      let failureReason: string | null = null;

      if (schedule.autoCharge && schedule.paymentMethodId) {
        chargeStatus = ScheduledChargeStatus.processing;

        try {
          const paymentIntent = await createStripePaymentIntent(
            (schedule.amount + lateFee) / 100,
            schedule.currency,
            schedule.paymentMethodId,
            schedule.tenantId
          );

          paymentIntentId = paymentIntent.id;

          if (paymentIntent.status === 'succeeded') {
            chargeStatus = ScheduledChargeStatus.succeeded;
          } else {
            chargeStatus = ScheduledChargeStatus.failed;
            failureReason = 'Payment declined';
          }
        } catch (error) {
          chargeStatus = ScheduledChargeStatus.failed;
          failureReason = error instanceof Error ? error.message : 'Unknown error';
        }
      }

      const charge = await prisma.scheduledRentCharge.create({
        data: {
          scheduleId: schedule.id,
          leaseId: schedule.leaseId,
          tenantId: schedule.tenantId,
          amount: schedule.amount,
          lateFee,
          totalAmount: schedule.amount + lateFee,
          dueDate,
          chargeDate: chargeStatus !== ScheduledChargeStatus.pending ? now : null,
          status: chargeStatus,
          paymentIntentId,
          failureReason,
          retryCount: chargeStatus === ScheduledChargeStatus.failed ? 1 : 0,
        },
      });

      await prisma.rentPaymentSchedule.update({
        where: { id: schedule.id },
        data: {
          lastChargeDate: now,
          nextChargeDate: calculateNextChargeDate(schedule.dayOfMonth),
        },
      });

      results.push({
        scheduleId: schedule.id,
        chargeId: charge.id,
        status: charge.status,
      });
    }

    return reply.send({
      success: true,
      data: {
        processed: results.length,
        results,
      },
    });
  });

  // Manual charge
  app.post('/charges/manual', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = manualChargeSchema.parse(request.body);

    const schedule = await prisma.rentPaymentSchedule.findUnique({
      where: { id: body.scheduleId },
    });

    if (!schedule) {
      return reply.status(404).send({
        success: false,
        error: 'Payment schedule not found',
      });
    }

    const now = new Date();
    const dueDate = new Date(schedule.nextChargeDate);
    const daysLate = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

    const baseAmount = body.amount ? Math.round(body.amount * 100) : schedule.amount;
    const lateFeeConfig = schedule.lateFeeConfig as unknown as LateFeeConfig | null;
    const lateFee = body.includeLateFees && lateFeeConfig
      ? Math.round(calculateLateFee(lateFeeConfig, baseAmount / 100, daysLate) * 100)
      : 0;

    const charge = await prisma.scheduledRentCharge.create({
      data: {
        scheduleId: schedule.id,
        leaseId: schedule.leaseId,
        tenantId: schedule.tenantId,
        amount: baseAmount,
        lateFee,
        totalAmount: baseAmount + lateFee,
        dueDate,
        chargeDate: now,
        status: ScheduledChargeStatus.pending,
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        ...charge,
        amount: charge.amount / 100,
        lateFee: charge.lateFee / 100,
        totalAmount: charge.totalAmount / 100,
      },
    });
  });

  // Get charge by ID
  app.get('/charges/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const charge = await prisma.scheduledRentCharge.findUnique({ where: { id } });

    if (!charge) {
      return reply.status(404).send({
        success: false,
        error: 'Charge not found',
      });
    }

    return reply.send({
      success: true,
      data: {
        ...charge,
        amount: charge.amount / 100,
        lateFee: charge.lateFee / 100,
        totalAmount: charge.totalAmount / 100,
      },
    });
  });

  // List charges
  app.get('/charges', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      scheduleId?: string;
      tenantId?: string;
      status?: ChargeStatus;
      fromDate?: string;
      toDate?: string;
    };

    const where: Record<string, unknown> = {};
    if (query.scheduleId) where.scheduleId = query.scheduleId;
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.status) where.status = query.status;
    if (query.fromDate || query.toDate) {
      where.dueDate = {};
      if (query.fromDate) (where.dueDate as Record<string, Date>).gte = new Date(query.fromDate);
      if (query.toDate) (where.dueDate as Record<string, Date>).lte = new Date(query.toDate);
    }

    const charges = await prisma.scheduledRentCharge.findMany({
      where,
      orderBy: { dueDate: 'desc' },
    });

    return reply.send({
      success: true,
      data: charges.map(c => ({
        ...c,
        amount: c.amount / 100,
        lateFee: c.lateFee / 100,
        totalAmount: c.totalAmount / 100,
      })),
      total: charges.length,
    });
  });

  // Retry failed charge
  app.post('/charges/:id/retry', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const charge = await prisma.scheduledRentCharge.findUnique({
      where: { id },
      include: { schedule: true },
    });

    if (!charge) {
      return reply.status(404).send({
        success: false,
        error: 'Charge not found',
      });
    }

    if (charge.status !== ScheduledChargeStatus.failed) {
      return reply.status(400).send({
        success: false,
        error: 'Only failed charges can be retried',
      });
    }

    if (!charge.schedule.paymentMethodId) {
      return reply.status(400).send({
        success: false,
        error: 'No payment method configured',
      });
    }

    let newStatus: ScheduledChargeStatus = ScheduledChargeStatus.processing;
    let paymentIntentId: string | null = null;
    let failureReason: string | null = null;

    try {
      const paymentIntent = await createStripePaymentIntent(
        charge.totalAmount / 100,
        charge.schedule.currency,
        charge.schedule.paymentMethodId,
        charge.schedule.tenantId
      );

      paymentIntentId = paymentIntent.id;

      if (paymentIntent.status === 'succeeded') {
        newStatus = ScheduledChargeStatus.succeeded;
      } else {
        newStatus = ScheduledChargeStatus.failed;
        failureReason = 'Payment declined on retry';
      }
    } catch (error) {
      newStatus = ScheduledChargeStatus.failed;
      failureReason = error instanceof Error ? error.message : 'Unknown error';
    }

    const updated = await prisma.scheduledRentCharge.update({
      where: { id },
      data: {
        status: newStatus,
        paymentIntentId,
        failureReason,
        chargeDate: new Date(),
        retryCount: charge.retryCount + 1,
      },
    });

    return reply.send({
      success: true,
      data: {
        ...updated,
        amount: updated.amount / 100,
        lateFee: updated.lateFee / 100,
        totalAmount: updated.totalAmount / 100,
      },
    });
  });

  // Refund charge
  app.post('/charges/:id/refund', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as { amount?: number; reason?: string }) || {};

    const charge = await prisma.scheduledRentCharge.findUnique({ where: { id } });

    if (!charge) {
      return reply.status(404).send({
        success: false,
        error: 'Charge not found',
      });
    }

    if (charge.status !== ScheduledChargeStatus.succeeded) {
      return reply.status(400).send({
        success: false,
        error: 'Only successful charges can be refunded',
      });
    }

    const refundAmount = body.amount ? Math.round(body.amount * 100) : charge.totalAmount;
    if (refundAmount > charge.totalAmount) {
      return reply.status(400).send({
        success: false,
        error: 'Refund amount exceeds charge amount',
      });
    }

    await prisma.scheduledRentCharge.update({
      where: { id },
      data: { status: ScheduledChargeStatus.refunded },
    });

    return reply.send({
      success: true,
      data: {
        chargeId: id,
        refundAmount: refundAmount / 100,
        reason: body.reason || 'Requested refund',
        status: 'refunded',
      },
    });
  });

  // Add payment method for tenant (uses existing PaymentMethod model)
  app.post('/payment-methods', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = addPaymentMethodSchema.parse(request.body);

    // If setting as default, unset other defaults
    if (body.setAsDefault) {
      await prisma.paymentMethod.updateMany({
        where: { userId: body.tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const last4 = Math.random().toString().slice(-4);
    const paymentMethod = await prisma.paymentMethod.create({
      data: {
        userId: body.tenantId,
        type: body.type,
        isDefault: body.setAsDefault,
        isVerified: body.type !== 'ach',
        stripePaymentMethodId: body.stripePaymentMethodId,
        plaidAccountId: body.plaidAccountId,
        // Store last4 in appropriate field based on payment type
        cardLast4: body.type !== 'ach' ? last4 : null,
        bankLast4: body.type === 'ach' ? last4 : null,
      },
    });

    return reply.status(201).send({
      success: true,
      data: paymentMethod,
    });
  });

  // List payment methods for tenant
  app.get('/payment-methods', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { tenantId: string };

    if (!query.tenantId) {
      return reply.status(400).send({
        success: false,
        error: 'tenantId is required',
      });
    }

    const paymentMethods = await prisma.paymentMethod.findMany({
      where: { userId: query.tenantId },
    });

    return reply.send({
      success: true,
      data: paymentMethods,
    });
  });

  // Delete payment method
  app.delete('/payment-methods/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    const paymentMethod = await prisma.paymentMethod.findUnique({ where: { id } });

    if (!paymentMethod) {
      return reply.status(404).send({
        success: false,
        error: 'Payment method not found',
      });
    }

    // Check if any active schedules use this payment method
    const activeSchedulesUsingMethod = await prisma.rentPaymentSchedule.count({
      where: {
        paymentMethodId: id,
        status: RentScheduleStatus.active,
      },
    });

    if (activeSchedulesUsingMethod > 0) {
      return reply.status(400).send({
        success: false,
        error: 'Cannot delete payment method used by active schedules',
      });
    }

    await prisma.paymentMethod.delete({ where: { id } });

    return reply.send({
      success: true,
      message: 'Payment method deleted',
    });
  });

  // Calculate late fee preview
  app.post('/late-fee/calculate', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as {
      baseAmount: number;
      daysLate: number;
      config: LateFeeConfig;
    };

    const lateFee = calculateLateFee(body.config, body.baseAmount, body.daysLate);

    return reply.send({
      success: true,
      data: {
        baseAmount: body.baseAmount,
        daysLate: body.daysLate,
        lateFee,
        totalAmount: body.baseAmount + lateFee,
      },
    });
  });

  // Get collection summary
  app.get('/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as { propertyId?: string; month?: string };

    const scheduleWhere: Record<string, unknown> = {};
    const chargeWhere: Record<string, unknown> = {};

    if (query.propertyId) {
      scheduleWhere.propertyId = query.propertyId;
      // Get schedule IDs for this property
      const propertySchedules = await prisma.rentPaymentSchedule.findMany({
        where: { propertyId: query.propertyId },
        select: { id: true },
      });
      chargeWhere.scheduleId = { in: propertySchedules.map(s => s.id) };
    }

    if (query.month) {
      const [year, month] = query.month.split('-').map(Number);
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0);
      chargeWhere.dueDate = { gte: startOfMonth, lte: endOfMonth };
    }

    const [activeScheduleCount, charges] = await Promise.all([
      prisma.rentPaymentSchedule.count({
        where: { ...scheduleWhere, status: RentScheduleStatus.active },
      }),
      prisma.scheduledRentCharge.findMany({ where: chargeWhere }),
    ]);

    const totalExpected = charges.reduce((sum, c) => sum + c.totalAmount, 0);
    const totalCollected = charges
      .filter(c => c.status === ScheduledChargeStatus.succeeded)
      .reduce((sum, c) => sum + c.totalAmount, 0);
    const totalPending = charges
      .filter(c => c.status === ScheduledChargeStatus.pending || c.status === ScheduledChargeStatus.processing)
      .reduce((sum, c) => sum + c.totalAmount, 0);
    const totalFailed = charges
      .filter(c => c.status === ScheduledChargeStatus.failed)
      .reduce((sum, c) => sum + c.totalAmount, 0);
    const totalLateFees = charges.reduce((sum, c) => sum + c.lateFee, 0);

    return reply.send({
      success: true,
      data: {
        activeSchedules: activeScheduleCount,
        totalExpected: totalExpected / 100,
        totalCollected: totalCollected / 100,
        totalPending: totalPending / 100,
        totalFailed: totalFailed / 100,
        totalLateFees: totalLateFees / 100,
        collectionRate: totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0,
      },
    });
  });
}
