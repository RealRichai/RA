/**
 * Agent Feedback Service
 * Landlord feedback on agent performance
 */

import { Prisma, AgentFeedback } from '@prisma/client';
import { db } from '../../lib/database.js';
import { Result, ok, err } from '../../lib/result.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import { logger, createModuleLogger } from '../../lib/logger.js';
import { z } from 'zod';

const log = createModuleLogger('feedback-service');

// =============================================================================
// SCHEMAS
// =============================================================================

export const CreateFeedbackSchema = z.object({
  agentId: z.string().cuid(),
  leaseId: z.string().cuid().optional(),
  rating: z.number().int().min(1).max(5),
  categories: z.object({
    communication: z.number().int().min(1).max(5).optional(),
    responsiveness: z.number().int().min(1).max(5).optional(),
    professionalism: z.number().int().min(1).max(5).optional(),
    marketKnowledge: z.number().int().min(1).max(5).optional(),
    negotiation: z.number().int().min(1).max(5).optional(),
  }).optional(),
  review: z.string().max(2000).optional(),
  wouldRecommend: z.boolean(),
  isPublic: z.boolean().default(true),
});

export type CreateFeedbackInput = z.infer<typeof CreateFeedbackSchema>;

export const FeedbackFiltersSchema = z.object({
  agentId: z.string().cuid().optional(),
  landlordId: z.string().cuid().optional(),
  minRating: z.coerce.number().min(1).max(5).optional(),
  isPublic: z.coerce.boolean().optional(),
});

export type FeedbackFiltersInput = z.infer<typeof FeedbackFiltersSchema>;

// =============================================================================
// TYPES
// =============================================================================

export interface FeedbackWithDetails extends AgentFeedback {
  agent: {
    id: string;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  };
  landlord: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface AgentRatingSummary {
  agentId: string;
  totalReviews: number;
  averageRating: number;
  recommendationRate: number;
  categoryAverages: {
    communication: number | null;
    responsiveness: number | null;
    professionalism: number | null;
    marketKnowledge: number | null;
    negotiation: number | null;
  };
  recentReviews: FeedbackWithDetails[];
}

// =============================================================================
// CREATE FEEDBACK
// =============================================================================

export async function createFeedback(
  landlordId: string,
  input: CreateFeedbackInput
): Promise<Result<FeedbackWithDetails, AppError>> {
  try {
    // Verify agent exists
    const agent = await db.user.findUnique({
      where: { id: input.agentId, role: 'AGENT', deletedAt: null },
    });

    if (!agent) {
      return err(new AppError({ code: ErrorCode.USER_NOT_FOUND, message: 'Agent not found' }));
    }

    // Verify landlord worked with agent (optional - can be enforced if leaseId provided)
    if (input.leaseId) {
      const lease = await db.lease.findFirst({
        where: {
          id: input.leaseId,
          listing: {
            OR: [
              { ownerId: landlordId },
              { agentId: input.agentId },
            ],
          },
        },
      });

      if (!lease) {
        return err(new AppError({ code: ErrorCode.LEASE_NOT_FOUND, message: 'No lease found with this agent' }));
      }
    }

    // Check for duplicate feedback
    const existing = await db.agentFeedback.findFirst({
      where: {
        agentId: input.agentId,
        landlordId,
        leaseId: input.leaseId,
        deletedAt: null,
      },
    });

    if (existing) {
      return err(new AppError({ code: ErrorCode.FEEDBACK_DUPLICATE, message: 'Feedback already submitted' }));
    }

    const feedback = await db.agentFeedback.create({
      data: {
        agentId: input.agentId,
        landlordId,
        leaseId: input.leaseId,
        rating: input.rating,
        categories: input.categories as Prisma.JsonValue,
        review: input.review,
        wouldRecommend: input.wouldRecommend,
        isPublic: input.isPublic,
      },
      include: {
        agent: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true },
        },
        landlord: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Update agent's average rating
    await updateAgentRating(input.agentId);

    log.info({
      feedbackId: feedback.id,
      agentId: input.agentId,
      rating: input.rating,
    }, 'Agent feedback created');

    return ok(feedback);
  } catch (error) {
    log.error({ error, input }, 'Failed to create feedback');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to create feedback' }));
  }
}

// =============================================================================
// GET AGENT RATING SUMMARY
// =============================================================================

export async function getAgentRatingSummary(
  agentId: string
): Promise<Result<AgentRatingSummary, AppError>> {
  try {
    const [feedbackList, stats] = await Promise.all([
      db.agentFeedback.findMany({
        where: { agentId, isPublic: true, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          agent: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
          landlord: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      db.agentFeedback.aggregate({
        where: { agentId, deletedAt: null },
        _count: { id: true },
        _avg: { rating: true },
      }),
    ]);

    const recommendCount = await db.agentFeedback.count({
      where: { agentId, wouldRecommend: true, deletedAt: null },
    });

    // Calculate category averages
    const allFeedback = await db.agentFeedback.findMany({
      where: { agentId, deletedAt: null },
      select: { categories: true },
    });

    const categoryTotals = {
      communication: { sum: 0, count: 0 },
      responsiveness: { sum: 0, count: 0 },
      professionalism: { sum: 0, count: 0 },
      marketKnowledge: { sum: 0, count: 0 },
      negotiation: { sum: 0, count: 0 },
    };

    allFeedback.forEach(fb => {
      const cats = fb.categories as Record<string, number> | null;
      if (cats) {
        Object.entries(cats).forEach(([key, value]) => {
          if (key in categoryTotals && typeof value === 'number') {
            categoryTotals[key as keyof typeof categoryTotals].sum += value;
            categoryTotals[key as keyof typeof categoryTotals].count += 1;
          }
        });
      }
    });

    const categoryAverages = {
      communication: categoryTotals.communication.count > 0
        ? categoryTotals.communication.sum / categoryTotals.communication.count
        : null,
      responsiveness: categoryTotals.responsiveness.count > 0
        ? categoryTotals.responsiveness.sum / categoryTotals.responsiveness.count
        : null,
      professionalism: categoryTotals.professionalism.count > 0
        ? categoryTotals.professionalism.sum / categoryTotals.professionalism.count
        : null,
      marketKnowledge: categoryTotals.marketKnowledge.count > 0
        ? categoryTotals.marketKnowledge.sum / categoryTotals.marketKnowledge.count
        : null,
      negotiation: categoryTotals.negotiation.count > 0
        ? categoryTotals.negotiation.sum / categoryTotals.negotiation.count
        : null,
    };

    return ok({
      agentId,
      totalReviews: stats._count.id,
      averageRating: stats._avg.rating || 0,
      recommendationRate: stats._count.id > 0 ? (recommendCount / stats._count.id) * 100 : 0,
      categoryAverages,
      recentReviews: feedbackList,
    });
  } catch (error) {
    log.error({ error, agentId }, 'Failed to get agent rating summary');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to get rating summary' }));
  }
}

// =============================================================================
// LIST FEEDBACK
// =============================================================================

export async function listFeedback(
  filters: FeedbackFiltersInput,
  page: number = 1,
  limit: number = 20
): Promise<Result<{
  feedback: FeedbackWithDetails[];
  total: number;
  page: number;
  totalPages: number;
}, AppError>> {
  try {
    const where: Prisma.AgentFeedbackWhereInput = {
      deletedAt: null,
      ...(filters.agentId && { agentId: filters.agentId }),
      ...(filters.landlordId && { landlordId: filters.landlordId }),
      ...(filters.minRating && { rating: { gte: filters.minRating } }),
      ...(filters.isPublic !== undefined && { isPublic: filters.isPublic }),
    };

    const [feedback, total] = await Promise.all([
      db.agentFeedback.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          agent: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
          landlord: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      db.agentFeedback.count({ where }),
    ]);

    return ok({
      feedback,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    log.error({ error, filters }, 'Failed to list feedback');
    return err(new AppError({ code: ErrorCode.DB_QUERY_FAILED, message: 'Failed to list feedback' }));
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function updateAgentRating(agentId: string): Promise<void> {
  const stats = await db.agentFeedback.aggregate({
    where: { agentId, deletedAt: null },
    _avg: { rating: true },
    _count: { id: true },
  });

  await db.user.update({
    where: { id: agentId },
    data: {
      agentRating: stats._avg.rating || 0,
      agentReviewCount: stats._count.id,
    },
  });
}
