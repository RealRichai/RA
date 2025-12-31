/**
 * Payment Reconciliation Module
 *
 * Match bank transactions to expected payments, flag discrepancies,
 * and generate reconciliation reports.
 */

import {
  prisma,
  type BankTransactionStatus,
  type DiscrepancyType,
} from '@realriches/database';
import { logger, AppError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Types
// =============================================================================

export type TransactionStatus = 'pending' | 'matched' | 'partial_match' | 'unmatched' | 'disputed' | 'written_off';

interface RuleConditions {
  descriptionPattern?: string;
  amountRange?: { min: number; max: number };
  payerNamePattern?: string;
}

interface RuleActions {
  matchToPropertyId?: string;
  matchToTenantId?: string;
  category?: string;
  autoMatch: boolean;
  tolerance: number;
}

interface ReconciliationRuleData {
  id: string;
  userId: string;
  name: string;
  isActive: boolean;
  priority: number;
  conditions: RuleConditions;
  actions: RuleActions;
}

// =============================================================================
// Helper Functions
// =============================================================================

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toNumber' in value) {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

function mapRuleToConditions(rule: {
  descriptionPattern: string | null;
  amountMin: unknown;
  amountMax: unknown;
  payerNamePattern: string | null;
  matchToPropertyId: string | null;
  matchToTenantId: string | null;
  category: string | null;
  autoMatch: boolean;
  tolerance: unknown;
}): { conditions: RuleConditions; actions: RuleActions } {
  return {
    conditions: {
      descriptionPattern: rule.descriptionPattern || undefined,
      amountRange: rule.amountMin !== null && rule.amountMax !== null
        ? { min: toNumber(rule.amountMin), max: toNumber(rule.amountMax) }
        : undefined,
      payerNamePattern: rule.payerNamePattern || undefined,
    },
    actions: {
      matchToPropertyId: rule.matchToPropertyId || undefined,
      matchToTenantId: rule.matchToTenantId || undefined,
      category: rule.category || undefined,
      autoMatch: rule.autoMatch,
      tolerance: toNumber(rule.tolerance),
    },
  };
}

async function findMatchingPayment(
  transaction: { date: Date; amount: number; description: string; payerName?: string | null },
  rules: ReconciliationRuleData[],
  userId: string
): Promise<{
  paymentId: string | null;
  confidence: number;
  matchType: 'exact' | 'fuzzy' | 'rule' | 'none';
}> {
  // Try exact match first
  const exactMatch = await prisma.payment.findFirst({
    where: {
      lease: {
        unit: {
          property: {
            ownerId: userId,
          },
        },
      },
      amount: transaction.amount,
      status: 'pending',
      scheduledDate: {
        gte: new Date(transaction.date.getTime() - 7 * 24 * 60 * 60 * 1000),
        lte: new Date(transaction.date.getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    },
  });

  if (exactMatch) {
    return { paymentId: exactMatch.id, confidence: 100, matchType: 'exact' };
  }

  // Try rule-based matching
  const applicableRules = rules
    .filter(r => r.isActive)
    .sort((a, b) => a.priority - b.priority);

  for (const rule of applicableRules) {
    let matches = true;

    if (rule.conditions.descriptionPattern) {
      const regex = new RegExp(rule.conditions.descriptionPattern, 'i');
      if (!regex.test(transaction.description)) {
        matches = false;
      }
    }

    if (rule.conditions.amountRange) {
      if (transaction.amount < rule.conditions.amountRange.min ||
          transaction.amount > rule.conditions.amountRange.max) {
        matches = false;
      }
    }

    if (rule.conditions.payerNamePattern && transaction.payerName) {
      const regex = new RegExp(rule.conditions.payerNamePattern, 'i');
      if (!regex.test(transaction.payerName)) {
        matches = false;
      }
    }

    if (matches && rule.actions.autoMatch) {
      const payment = await prisma.payment.findFirst({
        where: {
          lease: {
            unit: {
              property: {
                ownerId: userId,
                ...(rule.actions.matchToPropertyId && { id: rule.actions.matchToPropertyId }),
              },
            },
            ...(rule.actions.matchToTenantId && { primaryTenantId: rule.actions.matchToTenantId }),
          },
          status: 'pending',
          amount: {
            gte: transaction.amount - rule.actions.tolerance,
            lte: transaction.amount + rule.actions.tolerance,
          },
        },
      });

      if (payment) {
        const amountDiff = Math.abs(toNumber(payment.amount) - transaction.amount);
        const confidence = Math.max(50, 100 - (amountDiff / toNumber(payment.amount)) * 100);
        return { paymentId: payment.id, confidence, matchType: 'rule' };
      }
    }
  }

  // Try fuzzy matching
  const fuzzyMatch = await prisma.payment.findFirst({
    where: {
      lease: {
        unit: {
          property: {
            ownerId: userId,
          },
        },
      },
      status: 'pending',
      amount: {
        gte: transaction.amount * 0.95,
        lte: transaction.amount * 1.05,
      },
      scheduledDate: {
        gte: new Date(transaction.date.getTime() - 14 * 24 * 60 * 60 * 1000),
        lte: new Date(transaction.date.getTime() + 14 * 24 * 60 * 60 * 1000),
      },
    },
  });

  if (fuzzyMatch) {
    const amountDiff = Math.abs(toNumber(fuzzyMatch.amount) - transaction.amount);
    const confidence = Math.max(30, 80 - (amountDiff / toNumber(fuzzyMatch.amount)) * 100);
    return { paymentId: fuzzyMatch.id, confidence, matchType: 'fuzzy' };
  }

  return { paymentId: null, confidence: 0, matchType: 'none' };
}

function detectDiscrepancy(
  transactionAmount: number,
  transactionDate: Date,
  payment: { amount: number; dueDate: Date } | null
): { type: DiscrepancyType; expectedAmount?: number; actualAmount?: number } | null {
  if (!payment) {
    return { type: 'unexpected', actualAmount: transactionAmount };
  }

  const amountDiff = Math.abs(payment.amount - transactionAmount);
  if (amountDiff > 0.01) {
    if (transactionAmount < payment.amount) {
      return {
        type: 'partial',
        expectedAmount: payment.amount,
        actualAmount: transactionAmount,
      };
    }
    return {
      type: 'amount_mismatch',
      expectedAmount: payment.amount,
      actualAmount: transactionAmount,
    };
  }

  const daysDiff = Math.abs(
    (transactionDate.getTime() - payment.dueDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysDiff > 14) {
    return { type: 'date_mismatch' };
  }

  return null;
}

// =============================================================================
// Schemas
// =============================================================================

const ImportTransactionsSchema = z.object({
  bankAccountId: z.string(),
  transactions: z.array(z.object({
    externalId: z.string(),
    date: z.string().datetime(),
    amount: z.number(),
    description: z.string(),
    category: z.string().optional(),
    payerName: z.string().optional(),
    payerReference: z.string().optional(),
  })),
});

const ManualMatchSchema = z.object({
  transactionId: z.string().uuid(),
  paymentId: z.string().uuid(),
  notes: z.string().optional(),
});

const CreateRuleSchema = z.object({
  name: z.string().min(1).max(100),
  priority: z.number().min(1).max(100).default(50),
  conditions: z.object({
    descriptionPattern: z.string().optional(),
    amountRange: z.object({
      min: z.number(),
      max: z.number(),
    }).optional(),
    payerNamePattern: z.string().optional(),
  }),
  actions: z.object({
    matchToPropertyId: z.string().uuid().optional(),
    matchToTenantId: z.string().uuid().optional(),
    category: z.string().optional(),
    autoMatch: z.boolean().default(false),
    tolerance: z.number().min(0).max(100).default(0.5),
  }),
});

const WriteOffSchema = z.object({
  transactionId: z.string().uuid(),
  reason: z.string().min(1),
});

// =============================================================================
// Routes
// =============================================================================

export async function reconciliationRoutes(app: FastifyInstance): Promise<void> {
  // ==========================================================================
  // Transaction Import & Management
  // ==========================================================================

  // Import bank transactions
  app.post(
    '/import',
    {
      schema: {
        description: 'Import bank transactions for reconciliation',
        tags: ['Reconciliation'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof ImportTransactionsSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = ImportTransactionsSchema.parse(request.body);
      const now = new Date();
      const imported: Array<{
        id: string;
        status: BankTransactionStatus;
        matchedPaymentId: string | null;
        matchConfidence: number | null;
      }> = [];
      const duplicates: string[] = [];

      // Get user's reconciliation rules
      const userRulesRaw = await prisma.reconciliationRule.findMany({
        where: { userId: request.user.id },
      });
      const userRules: ReconciliationRuleData[] = userRulesRaw.map(r => ({
        id: r.id,
        userId: r.userId,
        name: r.name,
        isActive: r.isActive,
        priority: r.priority,
        ...mapRuleToConditions(r),
      }));

      for (const tx of data.transactions) {
        // Check for duplicates
        const existing = await prisma.bankTransaction.findUnique({
          where: {
            bankAccountId_externalId: {
              bankAccountId: data.bankAccountId,
              externalId: tx.externalId,
            },
          },
        });

        if (existing) {
          duplicates.push(tx.externalId);
          continue;
        }

        const transactionData = {
          date: new Date(tx.date),
          amount: tx.amount,
          description: tx.description,
          payerName: tx.payerName,
        };

        // Try to auto-match
        const match = await findMatchingPayment(transactionData, userRules, request.user.id);
        let status: BankTransactionStatus = 'pending';
        let discrepancyType: DiscrepancyType | null = null;
        const discrepancyNotes: string | null = null;
        let expectedAmount: number | null = null;

        if (match.paymentId && match.confidence >= 80) {
          status = match.confidence === 100 ? 'matched' : 'partial_match';

          // Check for discrepancies
          const payment = await prisma.payment.findUnique({
            where: { id: match.paymentId },
            select: { amount: true, scheduledDate: true },
          });
          const discrepancy = detectDiscrepancy(
            tx.amount,
            transactionData.date,
            payment ? { amount: toNumber(payment.amount), dueDate: payment.scheduledDate } : null
          );
          if (discrepancy) {
            discrepancyType = discrepancy.type;
            expectedAmount = discrepancy.expectedAmount ?? null;
          }
        } else {
          status = 'unmatched';
        }

        const transaction = await prisma.bankTransaction.create({
          data: {
            userId: request.user.id,
            bankAccountId: data.bankAccountId,
            externalId: tx.externalId,
            date: transactionData.date,
            amount: tx.amount,
            description: tx.description,
            category: tx.category,
            payerName: tx.payerName,
            payerReference: tx.payerReference,
            status,
            matchedPaymentId: match.paymentId,
            matchConfidence: match.confidence > 0 ? Math.round(match.confidence) : null,
            discrepancyType,
            discrepancyNotes,
            expectedAmount,
            importedAt: now,
          },
        });

        imported.push({
          id: transaction.id,
          status: transaction.status,
          matchedPaymentId: transaction.matchedPaymentId,
          matchConfidence: transaction.matchConfidence,
        });
      }

      logger.info({
        userId: request.user.id,
        imported: imported.length,
        duplicates: duplicates.length,
      }, 'Bank transactions imported');

      return reply.status(201).send({
        success: true,
        data: {
          imported: imported.length,
          duplicates: duplicates.length,
          transactions: imported,
        },
      });
    }
  );

  // List transactions
  app.get(
    '/transactions',
    {
      schema: {
        description: 'List bank transactions',
        tags: ['Reconciliation'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: {
          status?: TransactionStatus;
          bankAccountId?: string;
          startDate?: string;
          endDate?: string;
          page?: number;
          limit?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { status, bankAccountId, startDate, endDate, page = 1, limit = 50 } = request.query;

      const where = {
        userId: request.user.id,
        ...(status && { status: status as BankTransactionStatus }),
        ...(bankAccountId && { bankAccountId }),
        ...(startDate && { date: { gte: new Date(startDate) } }),
        ...(endDate && { date: { ...((startDate ? { gte: new Date(startDate) } : {})), lte: new Date(endDate) } }),
      };

      const [transactions, total] = await Promise.all([
        prisma.bankTransaction.findMany({
          where,
          orderBy: { date: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.bankTransaction.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: {
          transactions: transactions.map(t => ({
            ...t,
            amount: toNumber(t.amount),
            expectedAmount: t.expectedAmount ? toNumber(t.expectedAmount) : null,
            discrepancy: t.discrepancyType ? {
              type: t.discrepancyType,
              expectedAmount: t.expectedAmount ? toNumber(t.expectedAmount) : undefined,
              actualAmount: toNumber(t.amount),
              notes: t.discrepancyNotes,
            } : undefined,
          })),
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    }
  );

  // Get transaction details
  app.get(
    '/transactions/:transactionId',
    {
      schema: {
        description: 'Get transaction details with match suggestions',
        tags: ['Reconciliation'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { transactionId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { transactionId } = request.params;
      const transaction = await prisma.bankTransaction.findUnique({
        where: { id: transactionId },
      });

      if (!transaction || transaction.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Transaction not found', 404);
      }

      // Get potential matches
      const potentialMatches = await prisma.payment.findMany({
        where: {
          lease: {
            unit: {
              property: {
                ownerId: request.user.id,
              },
            },
          },
          status: 'pending',
          amount: {
            gte: toNumber(transaction.amount) * 0.8,
            lte: toNumber(transaction.amount) * 1.2,
          },
        },
        include: {
          lease: {
            include: {
              unit: {
                include: {
                  property: true,
                },
              },
              primaryTenant: true,
            },
          },
        },
        take: 5,
      });

      const suggestions = potentialMatches.map(p => {
        const amountDiff = Math.abs(toNumber(p.amount) - toNumber(transaction.amount));
        const dateDiff = p.scheduledDate ? Math.abs(p.scheduledDate.getTime() - transaction.date.getTime()) / (1000 * 60 * 60 * 24) : 30;
        const confidence = Math.max(0, 100 - (amountDiff / toNumber(p.amount)) * 50 - dateDiff * 2);

        return {
          paymentId: p.id,
          amount: toNumber(p.amount),
          scheduledDate: p.scheduledDate,
          tenantName: p.lease?.primaryTenant ? `${p.lease.primaryTenant.firstName} ${p.lease.primaryTenant.lastName}` : 'Unknown',
          propertyName: p.lease.unit.property.name,
          unitNumber: p.lease.unit.unitNumber,
          confidence: Math.round(confidence),
        };
      }).sort((a, b) => b.confidence - a.confidence);

      return reply.send({
        success: true,
        data: {
          transaction: {
            ...transaction,
            amount: toNumber(transaction.amount),
            expectedAmount: transaction.expectedAmount ? toNumber(transaction.expectedAmount) : null,
            discrepancy: transaction.discrepancyType ? {
              type: transaction.discrepancyType,
              expectedAmount: transaction.expectedAmount ? toNumber(transaction.expectedAmount) : undefined,
              actualAmount: toNumber(transaction.amount),
              notes: transaction.discrepancyNotes,
            } : undefined,
          },
          suggestions,
        },
      });
    }
  );

  // ==========================================================================
  // Matching Operations
  // ==========================================================================

  // Manual match
  app.post(
    '/match',
    {
      schema: {
        description: 'Manually match a transaction to a payment',
        tags: ['Reconciliation'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof ManualMatchSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = ManualMatchSchema.parse(request.body);
      const transaction = await prisma.bankTransaction.findUnique({
        where: { id: data.transactionId },
      });

      if (!transaction || transaction.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Transaction not found', 404);
      }

      const payment = await prisma.payment.findUnique({
        where: { id: data.paymentId },
        include: {
          lease: {
            include: {
              unit: {
                include: {
                  property: true,
                },
              },
            },
          },
        },
      });

      if (!payment || payment.lease.unit.property.ownerId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Payment not found', 404);
      }

      // Check for discrepancies
      const discrepancy = detectDiscrepancy(
        toNumber(transaction.amount),
        transaction.date,
        { amount: toNumber(payment.amount), dueDate: payment.scheduledDate }
      );

      // Update transaction
      const updated = await prisma.bankTransaction.update({
        where: { id: data.transactionId },
        data: {
          matchedPaymentId: data.paymentId,
          matchConfidence: 100,
          status: 'matched',
          reconciledAt: new Date(),
          reconciledBy: request.user.id,
          ...(discrepancy && {
            discrepancyType: discrepancy.type,
            expectedAmount: discrepancy.expectedAmount,
            discrepancyNotes: data.notes,
          }),
        },
      });

      // Update payment status
      await prisma.payment.update({
        where: { id: data.paymentId },
        data: {
          status: 'completed',
          paidAt: transaction.date,
        },
      });

      logger.info({
        transactionId: transaction.id,
        paymentId: data.paymentId,
        userId: request.user.id,
      }, 'Transaction manually matched');

      return reply.send({
        success: true,
        data: {
          transaction: {
            ...updated,
            amount: toNumber(updated.amount),
            expectedAmount: updated.expectedAmount ? toNumber(updated.expectedAmount) : null,
          },
        },
      });
    }
  );

  // Unmatch transaction
  app.post(
    '/transactions/:transactionId/unmatch',
    {
      schema: {
        description: 'Unmatch a previously matched transaction',
        tags: ['Reconciliation'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { transactionId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { transactionId } = request.params;
      const transaction = await prisma.bankTransaction.findUnique({
        where: { id: transactionId },
      });

      if (!transaction || transaction.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Transaction not found', 404);
      }

      if (!transaction.matchedPaymentId) {
        throw new AppError('INVALID_STATE', 'Transaction is not matched', 400);
      }

      // Revert payment status
      await prisma.payment.update({
        where: { id: transaction.matchedPaymentId },
        data: {
          status: 'pending',
          paidAt: null,
        },
      });

      const updated = await prisma.bankTransaction.update({
        where: { id: transactionId },
        data: {
          matchedPaymentId: null,
          matchConfidence: null,
          status: 'unmatched',
          reconciledAt: null,
          reconciledBy: null,
          discrepancyType: null,
          discrepancyNotes: null,
          expectedAmount: null,
        },
      });

      return reply.send({
        success: true,
        data: {
          transaction: {
            ...updated,
            amount: toNumber(updated.amount),
          },
        },
      });
    }
  );

  // Write off transaction
  app.post(
    '/write-off',
    {
      schema: {
        description: 'Write off an unmatched transaction',
        tags: ['Reconciliation'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof WriteOffSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = WriteOffSchema.parse(request.body);
      const transaction = await prisma.bankTransaction.findUnique({
        where: { id: data.transactionId },
      });

      if (!transaction || transaction.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Transaction not found', 404);
      }

      const updated = await prisma.bankTransaction.update({
        where: { id: data.transactionId },
        data: {
          status: 'written_off',
          discrepancyType: 'unexpected',
          discrepancyNotes: data.reason,
          reconciledAt: new Date(),
          reconciledBy: request.user.id,
        },
      });

      logger.info({
        transactionId: transaction.id,
        reason: data.reason,
        userId: request.user.id,
      }, 'Transaction written off');

      return reply.send({
        success: true,
        data: {
          transaction: {
            ...updated,
            amount: toNumber(updated.amount),
          },
        },
      });
    }
  );

  // ==========================================================================
  // Reconciliation Rules
  // ==========================================================================

  // List reconciliation rules
  app.get(
    '/rules',
    {
      schema: {
        description: 'List reconciliation rules',
        tags: ['Reconciliation'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const rules = await prisma.reconciliationRule.findMany({
        where: { userId: request.user.id },
        orderBy: { priority: 'asc' },
      });

      const formattedRules = rules.map(r => ({
        id: r.id,
        userId: r.userId,
        name: r.name,
        isActive: r.isActive,
        priority: r.priority,
        ...mapRuleToConditions(r),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));

      return reply.send({
        success: true,
        data: { rules: formattedRules },
      });
    }
  );

  // Create reconciliation rule
  app.post(
    '/rules',
    {
      schema: {
        description: 'Create reconciliation rule',
        tags: ['Reconciliation'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof CreateRuleSchema> }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = CreateRuleSchema.parse(request.body);

      const rule = await prisma.reconciliationRule.create({
        data: {
          userId: request.user.id,
          name: data.name,
          isActive: true,
          priority: data.priority,
          descriptionPattern: data.conditions.descriptionPattern,
          amountMin: data.conditions.amountRange?.min,
          amountMax: data.conditions.amountRange?.max,
          payerNamePattern: data.conditions.payerNamePattern,
          matchToPropertyId: data.actions.matchToPropertyId,
          matchToTenantId: data.actions.matchToTenantId,
          category: data.actions.category,
          autoMatch: data.actions.autoMatch,
          tolerance: data.actions.tolerance,
        },
      });

      logger.info({ ruleId: rule.id, name: rule.name }, 'Reconciliation rule created');

      return reply.status(201).send({
        success: true,
        data: {
          rule: {
            id: rule.id,
            userId: rule.userId,
            name: rule.name,
            isActive: rule.isActive,
            priority: rule.priority,
            ...mapRuleToConditions(rule),
            createdAt: rule.createdAt,
            updatedAt: rule.updatedAt,
          },
        },
      });
    }
  );

  // Delete rule
  app.delete(
    '/rules/:ruleId',
    {
      schema: {
        description: 'Delete reconciliation rule',
        tags: ['Reconciliation'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { ruleId: string } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { ruleId } = request.params;
      const rule = await prisma.reconciliationRule.findUnique({
        where: { id: ruleId },
      });

      if (!rule || rule.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Rule not found', 404);
      }

      await prisma.reconciliationRule.delete({
        where: { id: ruleId },
      });

      return reply.send({
        success: true,
        message: 'Rule deleted',
      });
    }
  );

  // ==========================================================================
  // Reports & Dashboard
  // ==========================================================================

  // Get reconciliation summary
  app.get(
    '/summary',
    {
      schema: {
        description: 'Get reconciliation summary',
        tags: ['Reconciliation'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { periodDays?: number } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { periodDays = 30 } = request.query;
      const startDate = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

      const transactions = await prisma.bankTransaction.findMany({
        where: {
          userId: request.user.id,
          date: { gte: startDate },
        },
      });

      const summary = {
        period: { days: periodDays, start: startDate.toISOString(), end: new Date().toISOString() },
        transactions: {
          total: transactions.length,
          matched: transactions.filter(t => t.status === 'matched').length,
          partialMatch: transactions.filter(t => t.status === 'partial_match').length,
          unmatched: transactions.filter(t => t.status === 'unmatched').length,
          disputed: transactions.filter(t => t.status === 'disputed').length,
          writtenOff: transactions.filter(t => t.status === 'written_off').length,
        },
        amounts: {
          total: transactions.reduce((sum, t) => sum + toNumber(t.amount), 0),
          matched: transactions.filter(t => t.status === 'matched').reduce((sum, t) => sum + toNumber(t.amount), 0),
          unmatched: transactions.filter(t => t.status === 'unmatched').reduce((sum, t) => sum + toNumber(t.amount), 0),
        },
        discrepancies: {
          total: transactions.filter(t => t.discrepancyType).length,
          byType: {
            amount_mismatch: transactions.filter(t => t.discrepancyType === 'amount_mismatch').length,
            date_mismatch: transactions.filter(t => t.discrepancyType === 'date_mismatch').length,
            partial: transactions.filter(t => t.discrepancyType === 'partial').length,
            unexpected: transactions.filter(t => t.discrepancyType === 'unexpected').length,
          },
        },
        matchRate: transactions.length > 0
          ? (transactions.filter(t => ['matched', 'partial_match'].includes(t.status)).length / transactions.length) * 100
          : 0,
      };

      return reply.send({
        success: true,
        data: { summary },
      });
    }
  );

  // Get missing payments (expected but not received)
  app.get(
    '/missing-payments',
    {
      schema: {
        description: 'Get expected payments without matching transactions',
        tags: ['Reconciliation'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { daysOverdue?: number } }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { daysOverdue = 7 } = request.query;
      const cutoffDate = new Date(Date.now() - daysOverdue * 24 * 60 * 60 * 1000);

      const missingPayments = await prisma.payment.findMany({
        where: {
          lease: {
            unit: {
              property: {
                ownerId: request.user.id,
              },
            },
          },
          status: 'pending',
          scheduledDate: { lt: cutoffDate },
        },
        include: {
          lease: {
            include: {
              unit: {
                include: {
                  property: true,
                },
              },
              primaryTenant: true,
            },
          },
        },
        orderBy: { scheduledDate: 'asc' },
      });

      const missing = missingPayments.map(p => ({
        paymentId: p.id,
        amount: toNumber(p.amount),
        scheduledDate: p.scheduledDate,
        daysOverdue: p.scheduledDate ? Math.floor((Date.now() - p.scheduledDate.getTime()) / (1000 * 60 * 60 * 24)) : 0,
        tenantName: p.lease?.primaryTenant ? `${p.lease.primaryTenant.firstName} ${p.lease.primaryTenant.lastName}` : 'Unknown',
        tenantEmail: p.lease?.primaryTenant?.email,
        propertyName: p.lease?.unit?.property?.name || 'Unknown',
        unitNumber: p.lease?.unit?.unitNumber || 'Unknown',
        type: p.type,
      }));

      return reply.send({
        success: true,
        data: {
          missing,
          totalAmount: missing.reduce((sum, m) => sum + m.amount, 0),
          count: missing.length,
        },
      });
    }
  );

  // Generate reconciliation report
  app.get(
    '/report',
    {
      schema: {
        description: 'Generate reconciliation report',
        tags: ['Reconciliation'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { startDate?: string; endDate?: string; bankAccountId?: string };
      }>,
      reply: FastifyReply
    ) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const {
        startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
        endDate = new Date().toISOString(),
        bankAccountId,
      } = request.query;

      const start = new Date(startDate);
      const end = new Date(endDate);

      const transactions = await prisma.bankTransaction.findMany({
        where: {
          userId: request.user.id,
          date: { gte: start, lte: end },
          ...(bankAccountId && { bankAccountId }),
        },
      });

      // Get expected payments for the period
      const expectedPayments = await prisma.payment.findMany({
        where: {
          lease: {
            unit: {
              property: {
                ownerId: request.user.id,
              },
            },
          },
          scheduledDate: { gte: start, lte: end },
        },
      });

      const report = {
        period: { start: start.toISOString(), end: end.toISOString() },
        bankTransactions: {
          total: transactions.length,
          totalAmount: transactions.reduce((sum, t) => sum + toNumber(t.amount), 0),
          byStatus: {
            matched: transactions.filter(t => t.status === 'matched').length,
            unmatched: transactions.filter(t => t.status === 'unmatched').length,
            partialMatch: transactions.filter(t => t.status === 'partial_match').length,
            writtenOff: transactions.filter(t => t.status === 'written_off').length,
          },
        },
        expectedPayments: {
          total: expectedPayments.length,
          totalAmount: expectedPayments.reduce((sum, p) => sum + toNumber(p.amount), 0),
          received: expectedPayments.filter(p => p.status === 'completed').length,
          pending: expectedPayments.filter(p => p.status === 'pending').length,
        },
        variance: {
          amount: transactions.reduce((sum, t) => sum + toNumber(t.amount), 0) -
                  expectedPayments.filter(p => p.status === 'completed').reduce((sum, p) => sum + toNumber(p.amount), 0),
          matchRate: transactions.length > 0
            ? (transactions.filter(t => t.status === 'matched').length / transactions.length) * 100
            : 0,
        },
        discrepancies: transactions
          .filter(t => t.discrepancyType)
          .map(t => ({
            transactionId: t.id,
            date: t.date,
            amount: toNumber(t.amount),
            discrepancy: {
              type: t.discrepancyType,
              expectedAmount: t.expectedAmount ? toNumber(t.expectedAmount) : undefined,
              actualAmount: toNumber(t.amount),
              notes: t.discrepancyNotes,
            },
          })),
      };

      return reply.send({
        success: true,
        data: { report },
      });
    }
  );
}

// =============================================================================
// Exports
// =============================================================================

export {
  findMatchingPayment,
  detectDiscrepancy,
};
