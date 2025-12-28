/**
 * Smart Lock Routes - Seam API Integration
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, ErrorCode } from '../../lib/errors.js';

const createAccessCodeSchema = z.object({
  lockId: z.string().uuid(),
  name: z.string(),
  code: z.string().regex(/^\d{4,8}$/),
  type: z.enum(['PERMANENT', 'TEMPORARY', 'SCHEDULED']),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional()
});

export const smartLockRoutes: FastifyPluginAsync = async (fastify) => {
  // Get locks for listing
  fastify.get('/listing/:listingId', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { listingId } = request.params as { listingId: string };

    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new AppError(ErrorCode.NOT_FOUND, 'Listing not found', 404);

    if (listing.landlordId !== request.user.userId && 
        listing.agentId !== request.user.userId && 
        request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized', 403);
    }

    const locks = await prisma.smartLock.findMany({
      where: { listingId },
      include: { accessCodes: { where: { status: 'ACTIVE' } } }
    });

    return reply.send({ success: true, data: locks });
  });

  // Register lock
  fastify.post('/register', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { listingId, seamDeviceId, name, location } = request.body as {
      listingId: string; seamDeviceId: string; name: string; location?: string;
    };

    const listing = await prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) throw new AppError(ErrorCode.NOT_FOUND, 'Listing not found', 404);

    if (listing.landlordId !== request.user.userId && request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only listing owner can register locks', 403);
    }

    // TODO: Verify with Seam API
    const lock = await prisma.smartLock.create({
      data: {
        listingId,
        seamDeviceId,
        name,
        location,
        status: 'ONLINE',
        batteryLevel: 100
      }
    });

    return reply.status(201).send({ success: true, data: lock });
  });

  // Create access code
  fastify.post('/access-codes', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = createAccessCodeSchema.parse(request.body);

    const lock = await prisma.smartLock.findUnique({
      where: { id: body.lockId },
      include: { listing: true }
    });

    if (!lock) throw new AppError(ErrorCode.NOT_FOUND, 'Lock not found', 404);

    if (lock.listing.landlordId !== request.user.userId && 
        lock.listing.agentId !== request.user.userId && 
        request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized', 403);
    }

    // TODO: Create code via Seam API
    const accessCode = await prisma.smartLockAccessCode.create({
      data: {
        lockId: body.lockId,
        name: body.name,
        code: body.code,
        type: body.type,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        status: 'ACTIVE',
        createdBy: request.user.userId
      }
    });

    return reply.status(201).send({ success: true, data: accessCode });
  });

  // Generate showing code
  fastify.post('/:lockId/showing-code', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { lockId } = request.params as { lockId: string };
    const { duration = 60, applicantName } = request.body as { duration?: number; applicantName?: string };

    const lock = await prisma.smartLock.findUnique({
      where: { id: lockId },
      include: { listing: true }
    });

    if (!lock) throw new AppError(ErrorCode.NOT_FOUND, 'Lock not found', 404);

    // Generate random 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + duration * 60 * 1000);

    const accessCode = await prisma.smartLockAccessCode.create({
      data: {
        lockId,
        name: `Showing - ${applicantName || 'Guest'}`,
        code,
        type: 'TEMPORARY',
        startsAt,
        endsAt,
        status: 'ACTIVE',
        createdBy: request.user.userId
      }
    });

    return reply.status(201).send({ 
      success: true, 
      data: {
        code,
        expiresAt: endsAt,
        lockName: lock.name,
        address: lock.listing.address
      }
    });
  });

  // Revoke access code
  fastify.delete('/access-codes/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const code = await prisma.smartLockAccessCode.findUnique({
      where: { id },
      include: { lock: { include: { listing: true } } }
    });

    if (!code) throw new AppError(ErrorCode.NOT_FOUND, 'Access code not found', 404);

    if (code.lock.listing.landlordId !== request.user.userId && 
        code.lock.listing.agentId !== request.user.userId && 
        request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized', 403);
    }

    await prisma.smartLockAccessCode.update({
      where: { id },
      data: { status: 'REVOKED' }
    });

    return reply.send({ success: true, message: 'Access code revoked' });
  });

  // Get lock events
  fastify.get('/:lockId/events', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { lockId } = request.params as { lockId: string };
    const { page = 1, limit = 50 } = request.query as { page?: number; limit?: number };

    const lock = await prisma.smartLock.findUnique({
      where: { id: lockId },
      include: { listing: true }
    });

    if (!lock) throw new AppError(ErrorCode.NOT_FOUND, 'Lock not found', 404);

    const events = await prisma.smartLockEvent.findMany({
      where: { lockId },
      orderBy: { occurredAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    });

    return reply.send({ success: true, data: events });
  });

  // Lock/unlock
  fastify.post('/:lockId/lock', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { lockId } = request.params as { lockId: string };

    // TODO: Call Seam API to lock
    await prisma.smartLockEvent.create({
      data: {
        lockId,
        eventType: 'LOCKED',
        method: 'REMOTE',
        userId: request.user.userId,
        occurredAt: new Date()
      }
    });

    return reply.send({ success: true, message: 'Lock command sent' });
  });

  fastify.post('/:lockId/unlock', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { lockId } = request.params as { lockId: string };

    // TODO: Call Seam API to unlock
    await prisma.smartLockEvent.create({
      data: {
        lockId,
        eventType: 'UNLOCKED',
        method: 'REMOTE',
        userId: request.user.userId,
        occurredAt: new Date()
      }
    });

    return reply.send({ success: true, message: 'Unlock command sent' });
  });
};
