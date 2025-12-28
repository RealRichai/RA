/**
 * Admin Routes - Platform Management, Feature Toggles
 */

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import { redis } from '../../lib/redis.js';
import type { UserStatus, Prisma } from '@prisma/client';

export const adminRoutes: FastifyPluginAsync = async (fastify) => {
  // Admin middleware
  fastify.addHook('preHandler', async (request) => {
    await fastify.authenticate(request, {} as never);
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

    const userStats: Record<string, number> = {};
    for (const u of users) {
      userStats[u.role] = u._count;
    }

    const listingStats: Record<string, number> = {};
    for (const l of listings) {
      listingStats[l.status] = l._count;
    }

    const applicationStats: Record<string, number> = {};
    for (const a of applications) {
      applicationStats[a.status] = a._count;
    }

    return reply.send({
      success: true,
      data: {
        users: userStats,
        listings: listingStats,
        applications: applicationStats,
        payments: {
          total: payments._sum.amount ? Number(payments._sum.amount) : 0,
          platformFees: payments._sum.platformFee ? Number(payments._sum.platformFee) : 0,
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

    const where: Prisma.UserWhereInput = {};
    if (role) where.role = role as Prisma.EnumUserRoleFilter;
    if (status) where.status = status as Prisma.EnumUserStatusFilter;
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
    const { status, reason } = request.body as { status: UserStatus; reason?: string };

    const user = await prisma.user.update({
      where: { id },
      data: { status }
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

    const features: Record<string, unknown> = {};
    for (const c of configs) {
      const key = c.key.replace('feature.', '');
      // c.value is already Json type, parse if string
      const value = typeof c.value === 'string' ? JSON.parse(c.value) : c.value;
      features[key] = value;
    }

    return reply.send({ success: true, data: features });
  });

  fastify.patch('/features/:key', async (request, reply) => {
    const { key } = request.params as { key: string };
    const { enabled, config } = request.body as { enabled: boolean; config?: Record<string, unknown> };

    const fullKey = `feature.${key}`;

    await prisma.systemConfig.upsert({
      where: { key: fullKey },
      update: { value: { enabled, ...config } },
      create: { key: fullKey, value: { enabled, ...config } }
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
        licenseVerified: status === 'VERIFIED',
        licenseVerifiedAt: status === 'VERIFIED' ? new Date() : null
      }
    });

    // Notify agent
    await prisma.notification.create({
      data: {
        userId: id,
        type: 'LICENSE_VERIFICATION',
        title: status === 'VERIFIED' ? 'License Verified!' : 'License Verification Failed',
        body: status === 'VERIFIED'
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
    const { value } = request.body as { value: Record<string, unknown> | string | number | boolean };

    const config = await prisma.systemConfig.upsert({
      where: { key },
      update: { value: value as Prisma.InputJsonValue },
      create: { key, value: value as Prisma.InputJsonValue }
    });

    await redis.del(`config:${key}`);

    return reply.send({ success: true, data: config });
  });

  // Reports
  fastify.get('/reports/revenue', async (request, reply) => {
    const { startDate, endDate } = request.query as { startDate: string; endDate: string };

    const payments = await prisma.payment.findMany({
      where: {
        status: 'SUCCEEDED',
        paidAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      },
      select: { amount: true, platformFee: true, paidAt: true, type: true }
    });

    // Group by month
    const byMonth: Record<string, { total: number; fees: number; count: number }> = {};
    for (const p of payments) {
      const month = p.paidAt!.toISOString().slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { total: 0, fees: 0, count: 0 };
      byMonth[month].total += Number(p.amount);
      byMonth[month].fees += Number(p.platformFee);
      byMonth[month].count += 1;
    }

    return reply.send({ success: true, data: byMonth });
  });
};
