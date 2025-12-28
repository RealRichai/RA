// @ts-nocheck
/**
 * Admin Routes - Platform Management, Feature Toggles
 */

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import { redis } from '../../lib/redis.js';

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Admin middleware
  fastify.addHook('preHandler', async (request) => {
    await fastify.authenticate(request, {} as any);
    if (request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Admin access required', 403);
    }
  });

  // Dashboard stats
  fastify.get('/dashboard', async (request, reply) => {
    const [users, listings, applications, payments] = await Promise.all([
      prisma.user.groupBy({ by: ['role'], _count: true }),
      prisma.listing.groupBy({ by: ['status'], _count: true }),
      prisma.application.groupBy({ by: ['status'], _count: true }),
      prisma.payment.aggregate({ _sum: { amount: true, platformFee: true }, _count: true })
    ]);

    return reply.send({
      success: true,
      data: {
        users: users.reduce((acc, u) => ({ ...acc, [u.role]: u._count }), {}),
        listings: listings.reduce((acc, l) => ({ ...acc, [l.status]: l._count }), {}),
        applications: applications.reduce((acc, a) => ({ ...acc, [a.status]: a._count }), {}),
        payments: {
          total: payments._sum.amount || 0,
          platformFees: payments._sum.platformFee || 0,
          count: payments._count
        }
      }
    });
  });

  // User management
  fastify.get('/users', async (request, reply) => {
    const { role, status, search, page = 1, limit = 20 } = request.query as {
      role?: string; status?: string; search?: string; page?: number; limit?: number;
    };

    const where: any = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, firstName: true, lastName: true,
          role: true, status: true, createdAt: true, lastLoginAt: true
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.user.count({ where })
    ]);

    return reply.send({
      success: true,
      data: users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  });

  // Update user status
  fastify.patch('/users/:id/status', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, reason } = request.body as { status: string; reason?: string };

    const user = await prisma.user.update({
      where: { id },
      data: { status, statusReason: reason }
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: request.user.userId,
        action: 'UPDATE_USER_STATUS',
        entityType: 'USER',
        entityId: id,
        details: { status, reason }
      }
    });

    return reply.send({ success: true, data: { id: user.id, status: user.status } });
  });

  // Feature toggles
  fastify.get('/features', async (request, reply) => {
    const configs = await prisma.systemConfig.findMany({
      where: { key: { startsWith: 'feature.' } }
    });

    const features = configs.reduce((acc, c) => {
      const key = c.key.replace('feature.', '');
      return { ...acc, [key]: JSON.parse(c.value) };
    }, {});

    return reply.send({ success: true, data: features });
  });

  fastify.patch('/features/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    const { enabled, config } = request.body as { enabled: boolean; config?: any };

    const fullKey = `feature.${key}`;
    
    await prisma.systemConfig.upsert({
      where: { key: fullKey },
      update: { value: JSON.stringify({ enabled, ...config }) },
      create: { key: fullKey, value: JSON.stringify({ enabled, ...config }) }
    });

    // Invalidate cache
    await redis.del(`config:${fullKey}`);

    return reply.send({ success: true, message: 'Feature updated' });
  });

  // Agent verification
  fastify.get('/agents/pending', async (request, reply) => {
    const agents = await prisma.user.findMany({
      where: {
        role: 'AGENT',
        agentProfile: { verificationStatus: 'PENDING' }
      },
      include: { agentProfile: true }
    });

    return reply.send({ success: true, data: agents });
  });

  fastify.patch('/agents/:id/verify', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, notes } = request.body as { status: 'VERIFIED' | 'REJECTED'; notes?: string };

    const profile = await prisma.agentProfile.update({
      where: { userId: id },
      data: {
        verificationStatus: status,
        verificationNotes: notes,
        verifiedAt: status === 'VERIFIED' ? new Date() : null,
        verifiedBy: request.user.userId
      }
    });

    // Notify agent
    await prisma.notification.create({
      data: {
        userId: id,
        type: 'LICENSE_VERIFICATION',
        title: status === 'VERIFIED' ? 'License Verified!' : 'License Verification Failed',
        message: status === 'VERIFIED' 
          ? 'Your license has been verified. You can now list properties.'
          : `Your license verification was rejected. ${notes || ''}`
      }
    });

    return reply.send({ success: true, data: profile });
  });

  // System config
  fastify.get('/config', async (request, reply) => {
    const configs = await prisma.systemConfig.findMany();
    return reply.send({ success: true, data: configs });
  });

  fastify.patch('/config/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    const { value } = request.body as { value: string };

    const config = await prisma.systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    });

    await redis.del(`config:${key}`);

    return reply.send({ success: true, data: config });
  });

  // Reports
  fastify.get('/reports/revenue', async (request, reply) => {
    const { startDate, endDate } = request.query as { startDate: string; endDate: string };

    const payments = await prisma.payment.findMany({
      where: {
        status: 'COMPLETED',
        paidAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      },
      select: { amount: true, platformFee: true, paidAt: true, type: true }
    });

    // Group by month
    const byMonth = payments.reduce((acc, p) => {
      const month = p.paidAt!.toISOString().slice(0, 7);
      if (!acc[month]) acc[month] = { total: 0, fees: 0, count: 0 };
      acc[month].total += p.amount;
      acc[month].fees += p.platformFee || 0;
      acc[month].count += 1;
      return acc;
    }, {} as Record<string, { total: number; fees: number; count: number }>);

    return reply.send({ success: true, data: byMonth });
  });
};
