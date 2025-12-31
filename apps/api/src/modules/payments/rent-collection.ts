import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Types
export type PaymentMethod = 'ach' | 'credit_card' | 'debit_card' | 'check' | 'cash';
export type ScheduleStatus = 'active' | 'paused' | 'cancelled' | 'completed';
export type ChargeStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'refunded' | 'disputed';
export type LateFeeType = 'flat' | 'percentage' | 'daily' | 'tiered';

export interface PaymentSchedule {
  id: string;
  leaseId: string;
  tenantId: string;
  propertyId: string;
  amount: number;
  currency: string;
  dayOfMonth: number;
  gracePeriodDays: number;
  paymentMethod: PaymentMethod;
  paymentMethodId: string | null;
  autoCharge: boolean;
  status: ScheduleStatus;
  nextChargeDate: Date;
  lastChargeDate: Date | null;
  lateFeeConfig: LateFeeConfig | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LateFeeConfig {
  type: LateFeeType;
  amount: number;
  maxAmount: number | null;
  startAfterDays: number;
  tiers?: Array<{ days: number; amount: number }>;
}

export interface ScheduledCharge {
  id: string;
  scheduleId: string;
  leaseId: string;
  tenantId: string;
  amount: number;
  lateFee: number;
  totalAmount: number;
  dueDate: Date;
  chargeDate: Date | null;
  status: ChargeStatus;
  paymentIntentId: string | null;
  failureReason: string | null;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantPaymentMethod {
  id: string;
  tenantId: string;
  type: PaymentMethod;
  provider: 'stripe' | 'plaid' | 'manual';
  last4: string;
  expiryMonth?: number;
  expiryYear?: number;
  bankName?: string;
  accountType?: 'checking' | 'savings';
  isDefault: boolean;
  isVerified: boolean;
  stripePaymentMethodId: string | null;
  plaidAccountId: string | null;
  createdAt: Date;
}

// In-memory stores (placeholder for Prisma)
const schedules = new Map<string, PaymentSchedule>();
const charges = new Map<string, ScheduledCharge>();
const paymentMethods = new Map<string, TenantPaymentMethod>();

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

function calculateNextChargeDate(dayOfMonth: number): Date {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), dayOfMonth);
  if (next <= now) {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

function calculateLateFee(config: LateFeeConfig, baseAmount: number, daysLate: number): number {
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
  currency: string,
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

async function processAutoCharge(schedule: PaymentSchedule): Promise<ScheduledCharge> {
  const now = new Date();
  const dueDate = new Date(schedule.nextChargeDate);
  const daysLate = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

  const lateFee = schedule.lateFeeConfig
    ? calculateLateFee(schedule.lateFeeConfig, schedule.amount, daysLate)
    : 0;

  const charge: ScheduledCharge = {
    id: generateId(),
    scheduleId: schedule.id,
    leaseId: schedule.leaseId,
    tenantId: schedule.tenantId,
    amount: schedule.amount,
    lateFee,
    totalAmount: schedule.amount + lateFee,
    dueDate,
    chargeDate: null,
    status: 'pending',
    paymentIntentId: null,
    failureReason: null,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  if (schedule.autoCharge && schedule.paymentMethodId) {
    charge.status = 'processing';

    try {
      const paymentIntent = await createStripePaymentIntent(
        charge.totalAmount,
        schedule.currency,
        schedule.paymentMethodId,
        schedule.tenantId
      );

      charge.paymentIntentId = paymentIntent.id;
      charge.chargeDate = new Date();

      if (paymentIntent.status === 'succeeded') {
        charge.status = 'succeeded';
      } else {
        charge.status = 'failed';
        charge.failureReason = 'Payment declined';
        charge.retryCount = 1;
      }
    } catch (error) {
      charge.status = 'failed';
      charge.failureReason = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  charges.set(charge.id, charge);

  // Update schedule
  schedule.lastChargeDate = now;
  schedule.nextChargeDate = calculateNextChargeDate(schedule.dayOfMonth);
  schedule.updatedAt = now;
  schedules.set(schedule.id, schedule);

  return charge;
}

// Route handlers
export async function rentCollectionRoutes(app: FastifyInstance): Promise<void> {
  // Create payment schedule
  app.post('/schedules', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = createScheduleSchema.parse(request.body);
    const now = new Date();

    const schedule: PaymentSchedule = {
      id: generateId(),
      leaseId: body.leaseId,
      tenantId: body.tenantId,
      propertyId: body.propertyId,
      amount: body.amount,
      currency: body.currency,
      dayOfMonth: body.dayOfMonth,
      gracePeriodDays: body.gracePeriodDays,
      paymentMethod: body.paymentMethod,
      paymentMethodId: body.paymentMethodId || null,
      autoCharge: body.autoCharge,
      status: 'active',
      nextChargeDate: calculateNextChargeDate(body.dayOfMonth),
      lastChargeDate: null,
      lateFeeConfig: body.lateFeeConfig ? {
        type: body.lateFeeConfig.type,
        amount: body.lateFeeConfig.amount,
        maxAmount: body.lateFeeConfig.maxAmount ?? null,
        startAfterDays: body.lateFeeConfig.startAfterDays,
        tiers: body.lateFeeConfig.tiers?.map(t => ({ days: t.days!, amount: t.amount! })),
      } : null,
      createdAt: now,
      updatedAt: now,
    };

    schedules.set(schedule.id, schedule);

    return reply.status(201).send({
      success: true,
      data: schedule,
    });
  });

  // Get payment schedule by ID
  app.get('/schedules/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const schedule = schedules.get(id);

    if (!schedule) {
      return reply.status(404).send({
        success: false,
        error: 'Payment schedule not found',
      });
    }

    return reply.send({
      success: true,
      data: schedule,
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

    let results = Array.from(schedules.values());

    if (query.leaseId) {
      results = results.filter((s) => s.leaseId === query.leaseId);
    }
    if (query.tenantId) {
      results = results.filter((s) => s.tenantId === query.tenantId);
    }
    if (query.propertyId) {
      results = results.filter((s) => s.propertyId === query.propertyId);
    }
    if (query.status) {
      results = results.filter((s) => s.status === query.status);
    }

    return reply.send({
      success: true,
      data: results,
      total: results.length,
    });
  });

  // Update payment schedule
  app.patch('/schedules/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = updateScheduleSchema.parse(request.body);
    const schedule = schedules.get(id);

    if (!schedule) {
      return reply.status(404).send({
        success: false,
        error: 'Payment schedule not found',
      });
    }

    const { lateFeeConfig: bodyLateFeeConfig, ...bodyRest } = body;
    const updated: PaymentSchedule = {
      ...schedule,
      ...bodyRest,
      lateFeeConfig: bodyLateFeeConfig ? {
        type: bodyLateFeeConfig.type,
        amount: bodyLateFeeConfig.amount,
        maxAmount: bodyLateFeeConfig.maxAmount ?? null,
        startAfterDays: bodyLateFeeConfig.startAfterDays,
        tiers: bodyLateFeeConfig.tiers?.map(t => ({ days: t.days!, amount: t.amount! })),
      } : schedule.lateFeeConfig,
      updatedAt: new Date(),
    };

    if (body.dayOfMonth && body.dayOfMonth !== schedule.dayOfMonth) {
      updated.nextChargeDate = calculateNextChargeDate(body.dayOfMonth);
    }

    schedules.set(id, updated);

    return reply.send({
      success: true,
      data: updated,
    });
  });

  // Cancel payment schedule
  app.delete('/schedules/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const schedule = schedules.get(id);

    if (!schedule) {
      return reply.status(404).send({
        success: false,
        error: 'Payment schedule not found',
      });
    }

    schedule.status = 'cancelled';
    schedule.updatedAt = new Date();
    schedules.set(id, schedule);

    return reply.send({
      success: true,
      message: 'Payment schedule cancelled',
    });
  });

  // Process scheduled charges (cron job endpoint)
  app.post('/schedules/process', async (request: FastifyRequest, reply: FastifyReply) => {
    const now = new Date();
    const activeSchedules = Array.from(schedules.values()).filter(
      (s) => s.status === 'active' && s.nextChargeDate <= now
    );

    const results: Array<{ scheduleId: string; chargeId: string; status: ChargeStatus }> = [];

    for (const schedule of activeSchedules) {
      const charge = await processAutoCharge(schedule);
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
    const schedule = schedules.get(body.scheduleId);

    if (!schedule) {
      return reply.status(404).send({
        success: false,
        error: 'Payment schedule not found',
      });
    }

    const now = new Date();
    const dueDate = new Date(schedule.nextChargeDate);
    const daysLate = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

    const baseAmount = body.amount || schedule.amount;
    const lateFee = body.includeLateFees && schedule.lateFeeConfig
      ? calculateLateFee(schedule.lateFeeConfig, baseAmount, daysLate)
      : 0;

    const charge: ScheduledCharge = {
      id: generateId(),
      scheduleId: schedule.id,
      leaseId: schedule.leaseId,
      tenantId: schedule.tenantId,
      amount: baseAmount,
      lateFee,
      totalAmount: baseAmount + lateFee,
      dueDate,
      chargeDate: now,
      status: 'pending',
      paymentIntentId: null,
      failureReason: null,
      retryCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    charges.set(charge.id, charge);

    return reply.status(201).send({
      success: true,
      data: charge,
    });
  });

  // Get charge by ID
  app.get('/charges/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const charge = charges.get(id);

    if (!charge) {
      return reply.status(404).send({
        success: false,
        error: 'Charge not found',
      });
    }

    return reply.send({
      success: true,
      data: charge,
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

    let results = Array.from(charges.values());

    if (query.scheduleId) {
      results = results.filter((c) => c.scheduleId === query.scheduleId);
    }
    if (query.tenantId) {
      results = results.filter((c) => c.tenantId === query.tenantId);
    }
    if (query.status) {
      results = results.filter((c) => c.status === query.status);
    }
    if (query.fromDate) {
      const from = new Date(query.fromDate);
      results = results.filter((c) => c.dueDate >= from);
    }
    if (query.toDate) {
      const to = new Date(query.toDate);
      results = results.filter((c) => c.dueDate <= to);
    }

    results.sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime());

    return reply.send({
      success: true,
      data: results,
      total: results.length,
    });
  });

  // Retry failed charge
  app.post('/charges/:id/retry', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const charge = charges.get(id);

    if (!charge) {
      return reply.status(404).send({
        success: false,
        error: 'Charge not found',
      });
    }

    if (charge.status !== 'failed') {
      return reply.status(400).send({
        success: false,
        error: 'Only failed charges can be retried',
      });
    }

    const schedule = schedules.get(charge.scheduleId);
    if (!schedule || !schedule.paymentMethodId) {
      return reply.status(400).send({
        success: false,
        error: 'No payment method configured',
      });
    }

    charge.status = 'processing';
    charge.retryCount += 1;
    charge.updatedAt = new Date();

    try {
      const paymentIntent = await createStripePaymentIntent(
        charge.totalAmount,
        schedule.currency,
        schedule.paymentMethodId,
        schedule.tenantId
      );

      charge.paymentIntentId = paymentIntent.id;
      charge.chargeDate = new Date();

      if (paymentIntent.status === 'succeeded') {
        charge.status = 'succeeded';
        charge.failureReason = null;
      } else {
        charge.status = 'failed';
        charge.failureReason = 'Payment declined on retry';
      }
    } catch (error) {
      charge.status = 'failed';
      charge.failureReason = error instanceof Error ? error.message : 'Unknown error';
    }

    charges.set(id, charge);

    return reply.send({
      success: true,
      data: charge,
    });
  });

  // Refund charge
  app.post('/charges/:id/refund', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const body = (request.body as { amount?: number; reason?: string }) || {};
    const charge = charges.get(id);

    if (!charge) {
      return reply.status(404).send({
        success: false,
        error: 'Charge not found',
      });
    }

    if (charge.status !== 'succeeded') {
      return reply.status(400).send({
        success: false,
        error: 'Only successful charges can be refunded',
      });
    }

    const refundAmount = body.amount || charge.totalAmount;
    if (refundAmount > charge.totalAmount) {
      return reply.status(400).send({
        success: false,
        error: 'Refund amount exceeds charge amount',
      });
    }

    // Mock refund processing
    charge.status = 'refunded';
    charge.updatedAt = new Date();
    charges.set(id, charge);

    return reply.send({
      success: true,
      data: {
        chargeId: id,
        refundAmount,
        reason: body.reason || 'Requested refund',
        status: 'refunded',
      },
    });
  });

  // Add payment method for tenant
  app.post('/payment-methods', async (request: FastifyRequest, reply: FastifyReply) => {
    const body = addPaymentMethodSchema.parse(request.body);
    const now = new Date();

    // If setting as default, unset other defaults
    if (body.setAsDefault) {
      for (const [id, pm] of paymentMethods) {
        if (pm.tenantId === body.tenantId && pm.isDefault) {
          pm.isDefault = false;
          paymentMethods.set(id, pm);
        }
      }
    }

    const paymentMethod: TenantPaymentMethod = {
      id: generateId(),
      tenantId: body.tenantId,
      type: body.type,
      provider: body.stripePaymentMethodId ? 'stripe' : body.plaidAccountId ? 'plaid' : 'manual',
      last4: Math.random().toString().slice(-4),
      isDefault: body.setAsDefault,
      isVerified: body.type !== 'ach', // ACH requires verification
      stripePaymentMethodId: body.stripePaymentMethodId || null,
      plaidAccountId: body.plaidAccountId || null,
      createdAt: now,
    };

    if (body.type === 'credit_card' || body.type === 'debit_card') {
      paymentMethod.expiryMonth = Math.floor(Math.random() * 12) + 1;
      paymentMethod.expiryYear = new Date().getFullYear() + Math.floor(Math.random() * 5) + 1;
    }

    if (body.type === 'ach') {
      paymentMethod.bankName = 'Mock Bank';
      paymentMethod.accountType = 'checking';
    }

    paymentMethods.set(paymentMethod.id, paymentMethod);

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

    const results = Array.from(paymentMethods.values()).filter(
      (pm) => pm.tenantId === query.tenantId
    );

    return reply.send({
      success: true,
      data: results,
    });
  });

  // Delete payment method
  app.delete('/payment-methods/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const paymentMethod = paymentMethods.get(id);

    if (!paymentMethod) {
      return reply.status(404).send({
        success: false,
        error: 'Payment method not found',
      });
    }

    // Check if any active schedules use this payment method
    const activeSchedulesUsingMethod = Array.from(schedules.values()).filter(
      (s) => s.paymentMethodId === id && s.status === 'active'
    );

    if (activeSchedulesUsingMethod.length > 0) {
      return reply.status(400).send({
        success: false,
        error: 'Cannot delete payment method used by active schedules',
      });
    }

    paymentMethods.delete(id);

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

    let chargeResults = Array.from(charges.values());
    let scheduleResults = Array.from(schedules.values());

    if (query.propertyId) {
      const propertySchedules = scheduleResults.filter((s) => s.propertyId === query.propertyId);
      const scheduleIds = new Set(propertySchedules.map((s) => s.id));
      chargeResults = chargeResults.filter((c) => scheduleIds.has(c.scheduleId));
      scheduleResults = propertySchedules;
    }

    if (query.month) {
      const [year, month] = query.month.split('-').map(Number);
      chargeResults = chargeResults.filter((c) => {
        const d = new Date(c.dueDate);
        return d.getFullYear() === year && d.getMonth() + 1 === month;
      });
    }

    const totalExpected = chargeResults.reduce((sum, c) => sum + c.totalAmount, 0);
    const totalCollected = chargeResults
      .filter((c) => c.status === 'succeeded')
      .reduce((sum, c) => sum + c.totalAmount, 0);
    const totalPending = chargeResults
      .filter((c) => c.status === 'pending' || c.status === 'processing')
      .reduce((sum, c) => sum + c.totalAmount, 0);
    const totalFailed = chargeResults
      .filter((c) => c.status === 'failed')
      .reduce((sum, c) => sum + c.totalAmount, 0);
    const totalLateFees = chargeResults.reduce((sum, c) => sum + c.lateFee, 0);

    return reply.send({
      success: true,
      data: {
        activeSchedules: scheduleResults.filter((s) => s.status === 'active').length,
        totalExpected,
        totalCollected,
        totalPending,
        totalFailed,
        totalLateFees,
        collectionRate: totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0,
      },
    });
  });
}

// Export helpers for testing
export {
  schedules,
  charges,
  paymentMethods,
  calculateLateFee,
  calculateNextChargeDate,
};
