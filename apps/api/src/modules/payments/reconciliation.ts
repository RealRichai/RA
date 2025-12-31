/**
 * Payment Reconciliation Module
 *
 * Match bank transactions to expected payments, flag discrepancies,
 * and generate reconciliation reports.
 */

import { prisma } from '@realriches/database';
import { generatePrefixedId, logger, AppError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// =============================================================================
// Types
// =============================================================================

export type TransactionStatus = 'pending' | 'matched' | 'partial_match' | 'unmatched' | 'disputed' | 'written_off';
export type DiscrepancyType = 'amount_mismatch' | 'date_mismatch' | 'duplicate' | 'missing_payment' | 'unexpected' | 'partial';

interface BankTransaction {
  id: string;
  userId: string;
  bankAccountId: string;
  externalId: string; // Bank's transaction ID
  date: Date;
  amount: number;
  description: string;
  category?: string;
  payerName?: string;
  payerReference?: string;
  status: TransactionStatus;
  matchedPaymentId?: string;
  matchConfidence?: number; // 0-100
  discrepancy?: {
    type: DiscrepancyType;
    expectedAmount?: number;
    actualAmount?: number;
    notes?: string;
  };
  importedAt: Date;
  reconciledAt?: Date;
  reconciledBy?: string;
}

interface ReconciliationBatch {
  id: string;
  userId: string;
  bankAccountId: string;
  period: { start: Date; end: Date };
  status: 'processing' | 'completed' | 'failed';
  summary: {
    totalTransactions: number;
    matched: number;
    partialMatch: number;
    unmatched: number;
    totalAmount: number;
    matchedAmount: number;
    unmatchedAmount: number;
  };
  createdAt: Date;
  completedAt?: Date;
}

interface ReconciliationRule {
  id: string;
  userId: string;
  name: string;
  isActive: boolean;
  priority: number;
  conditions: {
    descriptionPattern?: string;
    amountRange?: { min: number; max: number };
    payerNamePattern?: string;
  };
  actions: {
    matchToPropertyId?: string;
    matchToTenantId?: string;
    category?: string;
    autoMatch: boolean;
    tolerance: number; // Amount tolerance for matching (e.g., $0.50)
  };
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// In-Memory Storage (would be Prisma in production)
// =============================================================================

const bankTransactions = new Map<string, BankTransaction>();
const reconciliationBatches = new Map<string, ReconciliationBatch>();
const reconciliationRules = new Map<string, ReconciliationRule>();

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
  transactionId: z.string(),
  paymentId: z.string(),
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
    matchToPropertyId: z.string().optional(),
    matchToTenantId: z.string().optional(),
    category: z.string().optional(),
    autoMatch: z.boolean().default(false),
    tolerance: z.number().min(0).max(100).default(0.5),
  }),
});

const WriteOffSchema = z.object({
  transactionId: z.string(),
  reason: z.string().min(1),
});

// =============================================================================
// Helper Functions
// =============================================================================

async function findMatchingPayment(
  transaction: BankTransaction,
  rules: ReconciliationRule[],
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
      dueDate: {
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
      // Find payment matching rule criteria
      const payment = await prisma.payment.findFirst({
        where: {
          lease: {
            unit: {
              property: {
                ownerId: userId,
                ...(rule.actions.matchToPropertyId && { id: rule.actions.matchToPropertyId }),
              },
            },
            ...(rule.actions.matchToTenantId && { tenantId: rule.actions.matchToTenantId }),
          },
          status: 'pending',
          amount: {
            gte: transaction.amount - rule.actions.tolerance,
            lte: transaction.amount + rule.actions.tolerance,
          },
        },
      });

      if (payment) {
        const amountDiff = Math.abs(payment.amount - transaction.amount);
        const confidence = Math.max(50, 100 - (amountDiff / payment.amount) * 100);
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
      dueDate: {
        gte: new Date(transaction.date.getTime() - 14 * 24 * 60 * 60 * 1000),
        lte: new Date(transaction.date.getTime() + 14 * 24 * 60 * 60 * 1000),
      },
    },
  });

  if (fuzzyMatch) {
    const amountDiff = Math.abs(fuzzyMatch.amount - transaction.amount);
    const confidence = Math.max(30, 80 - (amountDiff / fuzzyMatch.amount) * 100);
    return { paymentId: fuzzyMatch.id, confidence, matchType: 'fuzzy' };
  }

  return { paymentId: null, confidence: 0, matchType: 'none' };
}

function detectDiscrepancy(
  transaction: BankTransaction,
  payment: { amount: number; dueDate: Date } | null
): { type: DiscrepancyType; expectedAmount?: number; actualAmount?: number } | null {
  if (!payment) {
    return { type: 'unexpected', actualAmount: transaction.amount };
  }

  const amountDiff = Math.abs(payment.amount - transaction.amount);
  if (amountDiff > 0.01) {
    if (transaction.amount < payment.amount) {
      return {
        type: 'partial',
        expectedAmount: payment.amount,
        actualAmount: transaction.amount,
      };
    }
    return {
      type: 'amount_mismatch',
      expectedAmount: payment.amount,
      actualAmount: transaction.amount,
    };
  }

  const daysDiff = Math.abs(
    (transaction.date.getTime() - payment.dueDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysDiff > 14) {
    return { type: 'date_mismatch' };
  }

  return null;
}

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
      const imported: BankTransaction[] = [];
      const duplicates: string[] = [];

      // Get user's reconciliation rules
      const userRules = Array.from(reconciliationRules.values())
        .filter(r => r.userId === request.user!.id);

      for (const tx of data.transactions) {
        // Check for duplicates
        const existing = Array.from(bankTransactions.values())
          .find(t => t.externalId === tx.externalId && t.bankAccountId === data.bankAccountId);

        if (existing) {
          duplicates.push(tx.externalId);
          continue;
        }

        const transaction: BankTransaction = {
          id: generatePrefixedId('btx'),
          userId: request.user.id,
          bankAccountId: data.bankAccountId,
          externalId: tx.externalId,
          date: new Date(tx.date),
          amount: tx.amount,
          description: tx.description,
          category: tx.category,
          payerName: tx.payerName,
          payerReference: tx.payerReference,
          status: 'pending',
          importedAt: now,
        };

        // Try to auto-match
        const match = await findMatchingPayment(transaction, userRules, request.user.id);
        if (match.paymentId && match.confidence >= 80) {
          transaction.matchedPaymentId = match.paymentId;
          transaction.matchConfidence = match.confidence;
          transaction.status = match.confidence === 100 ? 'matched' : 'partial_match';

          // Check for discrepancies
          const payment = await prisma.payment.findUnique({
            where: { id: match.paymentId },
            select: { amount: true, dueDate: true },
          });
          const discrepancy = detectDiscrepancy(transaction, payment);
          if (discrepancy) {
            transaction.discrepancy = discrepancy;
          }
        } else {
          transaction.status = 'unmatched';
        }

        bankTransactions.set(transaction.id, transaction);
        imported.push(transaction);
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
        querystring: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            bankAccountId: { type: 'string' },
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 50 },
          },
        },
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

      let transactions = Array.from(bankTransactions.values())
        .filter(t => t.userId === request.user!.id);

      if (status) {
        transactions = transactions.filter(t => t.status === status);
      }
      if (bankAccountId) {
        transactions = transactions.filter(t => t.bankAccountId === bankAccountId);
      }
      if (startDate) {
        const start = new Date(startDate);
        transactions = transactions.filter(t => t.date >= start);
      }
      if (endDate) {
        const end = new Date(endDate);
        transactions = transactions.filter(t => t.date <= end);
      }

      // Sort by date descending
      transactions.sort((a, b) => b.date.getTime() - a.date.getTime());

      const total = transactions.length;
      const offset = (page - 1) * limit;
      transactions = transactions.slice(offset, offset + limit);

      return reply.send({
        success: true,
        data: {
          transactions,
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
      const transaction = bankTransactions.get(transactionId);

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
            gte: transaction.amount * 0.8,
            lte: transaction.amount * 1.2,
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
              tenant: true,
            },
          },
        },
        take: 5,
      });

      const suggestions = potentialMatches.map(p => {
        const amountDiff = Math.abs(p.amount - transaction.amount);
        const dateDiff = Math.abs(p.dueDate.getTime() - transaction.date.getTime()) / (1000 * 60 * 60 * 24);
        const confidence = Math.max(0, 100 - (amountDiff / p.amount) * 50 - dateDiff * 2);

        return {
          paymentId: p.id,
          amount: p.amount,
          dueDate: p.dueDate,
          tenantName: p.lease.tenant ? `${p.lease.tenant.firstName} ${p.lease.tenant.lastName}` : 'Unknown',
          propertyName: p.lease.unit.property.name,
          unitNumber: p.lease.unit.unitNumber,
          confidence: Math.round(confidence),
        };
      }).sort((a, b) => b.confidence - a.confidence);

      return reply.send({
        success: true,
        data: {
          transaction,
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
      const transaction = bankTransactions.get(data.transactionId);

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

      // Update transaction
      transaction.matchedPaymentId = data.paymentId;
      transaction.matchConfidence = 100;
      transaction.status = 'matched';
      transaction.reconciledAt = new Date();
      transaction.reconciledBy = request.user.id;

      // Check for discrepancies
      const discrepancy = detectDiscrepancy(transaction, { amount: payment.amount, dueDate: payment.dueDate });
      if (discrepancy) {
        transaction.discrepancy = { ...discrepancy, notes: data.notes };
      }

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
        data: { transaction },
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
      const transaction = bankTransactions.get(transactionId);

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

      transaction.matchedPaymentId = undefined;
      transaction.matchConfidence = undefined;
      transaction.status = 'unmatched';
      transaction.reconciledAt = undefined;
      transaction.reconciledBy = undefined;
      transaction.discrepancy = undefined;

      return reply.send({
        success: true,
        data: { transaction },
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
      const transaction = bankTransactions.get(data.transactionId);

      if (!transaction || transaction.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Transaction not found', 404);
      }

      transaction.status = 'written_off';
      transaction.discrepancy = {
        type: 'unexpected',
        actualAmount: transaction.amount,
        notes: data.reason,
      };
      transaction.reconciledAt = new Date();
      transaction.reconciledBy = request.user.id;

      logger.info({
        transactionId: transaction.id,
        reason: data.reason,
        userId: request.user.id,
      }, 'Transaction written off');

      return reply.send({
        success: true,
        data: { transaction },
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

      const rules = Array.from(reconciliationRules.values())
        .filter(r => r.userId === request.user!.id)
        .sort((a, b) => a.priority - b.priority);

      return reply.send({
        success: true,
        data: { rules },
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
      const now = new Date();

      const rule: ReconciliationRule = {
        id: generatePrefixedId('rcr'),
        userId: request.user.id,
        name: data.name,
        isActive: true,
        priority: data.priority,
        conditions: data.conditions,
        actions: data.actions,
        createdAt: now,
        updatedAt: now,
      };

      reconciliationRules.set(rule.id, rule);

      logger.info({ ruleId: rule.id, name: rule.name }, 'Reconciliation rule created');

      return reply.status(201).send({
        success: true,
        data: { rule },
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
      const rule = reconciliationRules.get(ruleId);

      if (!rule || rule.userId !== request.user.id) {
        throw new AppError('NOT_FOUND', 'Rule not found', 404);
      }

      reconciliationRules.delete(ruleId);

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
        querystring: {
          type: 'object',
          properties: {
            periodDays: { type: 'integer', default: 30 },
          },
        },
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

      const transactions = Array.from(bankTransactions.values())
        .filter(t => t.userId === request.user!.id && t.date >= startDate);

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
          total: transactions.reduce((sum, t) => sum + t.amount, 0),
          matched: transactions.filter(t => t.status === 'matched').reduce((sum, t) => sum + t.amount, 0),
          unmatched: transactions.filter(t => t.status === 'unmatched').reduce((sum, t) => sum + t.amount, 0),
        },
        discrepancies: {
          total: transactions.filter(t => t.discrepancy).length,
          byType: {
            amount_mismatch: transactions.filter(t => t.discrepancy?.type === 'amount_mismatch').length,
            date_mismatch: transactions.filter(t => t.discrepancy?.type === 'date_mismatch').length,
            partial: transactions.filter(t => t.discrepancy?.type === 'partial').length,
            unexpected: transactions.filter(t => t.discrepancy?.type === 'unexpected').length,
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
        querystring: {
          type: 'object',
          properties: {
            daysOverdue: { type: 'integer', default: 7 },
          },
        },
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
          dueDate: { lt: cutoffDate },
        },
        include: {
          lease: {
            include: {
              unit: {
                include: {
                  property: true,
                },
              },
              tenant: true,
            },
          },
        },
        orderBy: { dueDate: 'asc' },
      });

      const missing = missingPayments.map(p => ({
        paymentId: p.id,
        amount: p.amount,
        dueDate: p.dueDate,
        daysOverdue: Math.floor((Date.now() - p.dueDate.getTime()) / (1000 * 60 * 60 * 24)),
        tenantName: p.lease.tenant ? `${p.lease.tenant.firstName} ${p.lease.tenant.lastName}` : 'Unknown',
        tenantEmail: p.lease.tenant?.email,
        propertyName: p.lease.unit.property.name,
        unitNumber: p.lease.unit.unitNumber,
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
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string' },
            endDate: { type: 'string' },
            bankAccountId: { type: 'string' },
          },
        },
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

      let transactions = Array.from(bankTransactions.values())
        .filter(t => t.userId === request.user!.id)
        .filter(t => t.date >= start && t.date <= end);

      if (bankAccountId) {
        transactions = transactions.filter(t => t.bankAccountId === bankAccountId);
      }

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
          dueDate: { gte: start, lte: end },
        },
      });

      const report = {
        period: { start: start.toISOString(), end: end.toISOString() },
        bankTransactions: {
          total: transactions.length,
          totalAmount: transactions.reduce((sum, t) => sum + t.amount, 0),
          byStatus: {
            matched: transactions.filter(t => t.status === 'matched').length,
            unmatched: transactions.filter(t => t.status === 'unmatched').length,
            partialMatch: transactions.filter(t => t.status === 'partial_match').length,
            writtenOff: transactions.filter(t => t.status === 'written_off').length,
          },
        },
        expectedPayments: {
          total: expectedPayments.length,
          totalAmount: expectedPayments.reduce((sum, p) => sum + p.amount, 0),
          received: expectedPayments.filter(p => p.status === 'completed').length,
          pending: expectedPayments.filter(p => p.status === 'pending').length,
        },
        variance: {
          amount: transactions.reduce((sum, t) => sum + t.amount, 0) -
                  expectedPayments.filter(p => p.status === 'completed').reduce((sum, p) => sum + p.amount, 0),
          matchRate: transactions.length > 0
            ? (transactions.filter(t => t.status === 'matched').length / transactions.length) * 100
            : 0,
        },
        discrepancies: transactions
          .filter(t => t.discrepancy)
          .map(t => ({
            transactionId: t.id,
            date: t.date,
            amount: t.amount,
            discrepancy: t.discrepancy,
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
  bankTransactions,
  reconciliationBatches,
  reconciliationRules,
  findMatchingPayment,
  detectDiscrepancy,
};
