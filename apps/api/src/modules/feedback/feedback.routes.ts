/**
 * Agent Feedback Routes
 * REST API endpoints for agent feedback
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as feedbackService from './feedback.service.js';
import {
  CreateFeedbackSchema,
  FeedbackFiltersSchema,
} from './feedback.service.js';
import { requireAuth, requireRole } from '../auth/auth.middleware.js';
import { UserRole } from '@prisma/client';
import { AppError, ErrorCode } from '../../lib/errors.js';
import { z } from 'zod';

export async function feedbackRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Submit agent feedback
   */
  app.post(
    '/',
    { preHandler: [requireAuth, requireRole([UserRole.LANDLORD, UserRole.ADMIN])] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const validation = CreateFeedbackSchema.safeParse(request.body);
      if (!validation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid feedback data',
          details: { errors: validation.error.flatten().fieldErrors },
        });
      }

      const result = await feedbackService.createFeedback(
        request.auth!.userId,
        validation.data
      );

      if (result.isErr()) throw result.error;
      return reply.status(201).send({ feedback: result.value });
    }
  );

  /**
   * Get agent rating summary
   */
  app.get<{ Params: { agentId: string } }>(
    '/agent/:agentId/summary',
    async (request, reply) => {
      const result = await feedbackService.getAgentRatingSummary(request.params.agentId);
      if (result.isErr()) throw result.error;
      return reply.send(result.value);
    }
  );

  /**
   * List feedback
   */
  app.get(
    '/',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const filtersValidation = FeedbackFiltersSchema.safeParse(request.query);
      const pageSchema = z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      });
      const pageValidation = pageSchema.safeParse(request.query);

      if (!filtersValidation.success) {
        throw new AppError({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Invalid query parameters',
        });
      }

      const page = pageValidation.success ? pageValidation.data.page : 1;
      const limit = pageValidation.success ? pageValidation.data.limit : 20;

      const result = await feedbackService.listFeedback(
        filtersValidation.data,
        page,
        limit
      );

      if (result.isErr()) throw result.error;
      return reply.send(result.value);
    }
  );

  /**
   * Get agent's public reviews
   */
  app.get<{ Params: { agentId: string } }>(
    '/agent/:agentId',
    async (request, reply) => {
      const result = await feedbackService.listFeedback(
        { agentId: request.params.agentId, isPublic: true },
        1,
        50
      );

      if (result.isErr()) throw result.error;
      return reply.send(result.value);
    }
  );
}
