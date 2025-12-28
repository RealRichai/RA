// @ts-nocheck
/**
 * Market Routes - 11 NYC/Long Island Markets
 */

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import { redis } from '../../lib/redis.js';

export const marketRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all markets
  fastify.get('/', async (request, reply) => {
    const cached = await redis.get('markets:all');
    if (cached) {
      return reply.send({ success: true, data: JSON.parse(cached) });
    }

    const markets = await prisma.market.findMany({
      where: { active: true },
      include: { _count: { select: { listings: { where: { status: 'ACTIVE' } } } } },
      orderBy: { displayOrder: 'asc' }
    });

    await redis.setex('markets:all', 3600, JSON.stringify(markets));

    return reply.send({ success: true, data: markets });
  });

  // Get market by ID
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const market = await prisma.market.findUnique({
      where: { id },
      include: {
        _count: { select: { listings: { where: { status: 'ACTIVE' } }, users: true } }
      }
    });

    if (!market) throw new AppError(ErrorCode.NOT_FOUND, 'Market not found', 404);

    return reply.send({ success: true, data: market });
  });

  // Get market stats
  fastify.get('/:id/stats', async (request, reply) => {
    const { id } = request.params as { id: string };

    const [listings, avgRent, applications] = await Promise.all([
      prisma.listing.count({ where: { marketId: id, status: 'ACTIVE' } }),
      prisma.listing.aggregate({
        where: { marketId: id, status: 'ACTIVE' },
        _avg: { monthlyRent: true }
      }),
      prisma.application.count({
        where: { listing: { marketId: id } }
      })
    ]);

    return reply.send({
      success: true,
      data: {
        activeListings: listings,
        averageRent: avgRent._avg.monthlyRent || 0,
        totalApplications: applications
      }
    });
  });

  // Get listings in market
  fastify.get('/:id/listings', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number };

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where: { marketId: id, status: 'ACTIVE' },
        include: { images: { take: 1, orderBy: { order: 'asc' } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.listing.count({ where: { marketId: id, status: 'ACTIVE' } })
    ]);

    return reply.send({
      success: true,
      data: listings,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  });

  // Get neighborhoods in market
  fastify.get('/:id/neighborhoods', async (request, reply) => {
    const { id } = request.params as { id: string };

    const market = await prisma.market.findUnique({ where: { id } });
    if (!market) throw new AppError(ErrorCode.NOT_FOUND, 'Market not found', 404);

    return reply.send({ success: true, data: market.neighborhoods || [] });
  });

  // Admin: Create market
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Admin access required', 403);
    }

    const { name, slug, region, state, active, boundaries, neighborhoods, displayOrder } = request.body as {
      name: string; slug: string; region: string; state: string;
      active: boolean; boundaries?: any; neighborhoods?: string[]; displayOrder?: number;
    };

    const market = await prisma.market.create({
      data: { name, slug, region, state, active, boundaries, neighborhoods, displayOrder }
    });

    await redis.del('markets:all');

    return reply.status(201).send({ success: true, data: market });
  });

  // Admin: Update market
  fastify.patch('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Admin access required', 403);
    }

    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      name: string; active: boolean; boundaries: any; neighborhoods: string[]; displayOrder: number;
    }>;

    const market = await prisma.market.update({
      where: { id },
      data: body
    });

    await redis.del('markets:all');

    return reply.send({ success: true, data: market });
  });
};
