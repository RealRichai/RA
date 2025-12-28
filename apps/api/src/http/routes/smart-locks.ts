/**
 * Smart Lock Routes - Seam API Integration
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, ErrorCode } from '../../lib/errors.js';

const createAccessCodeSchema = z.object({
  smartLockId: z.string().uuid(),
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
      include: { accessCodes: { where: { isActive: true } } }
    });

    return reply.send({ success: true, data: locks });
  });

  // Register lock
  fastify.post('/register', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { listingId, seamDeviceId, deviceName, deviceType, location } = request.body as {
      listingId: string; seamDeviceId: string; deviceName: string; deviceType?: string; location?: string;
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
        deviceName,
        deviceType: deviceType || 'smart_lock',
        isOnline: true,
        batteryLevel: 100
      }
    });

    return reply.status(201).send({ success: true, data: lock });
  });

  // Create access code
  fastify.post('/access-codes', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const body = createAccessCodeSchema.parse(request.body);

    const lock = await prisma.smartLock.findUnique({
      where: { id: body.smartLockId },
      include: { lease: { include: { listing: true } } }
    });

    if (!lock) throw new AppError(ErrorCode.NOT_FOUND, 'Lock not found', 404);

    // Get listing info - could be from lease or direct listingId
    const listing = lock.lease?.listing;
    const listingId = lock.listingId;

    // Check authorization - need to find the listing
    let isAuthorized = false;
    if (listing) {
      isAuthorized = listing.landlordId === request.user.userId ||
                     listing.agentId === request.user.userId ||
                     request.user.role === 'ADMIN';
    } else if (listingId) {
      const directListing = await prisma.listing.findUnique({ where: { id: listingId } });
      if (directListing) {
        isAuthorized = directListing.landlordId === request.user.userId ||
                       directListing.agentId === request.user.userId ||
                       request.user.role === 'ADMIN';
      }
    }

    if (!isAuthorized) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized', 403);
    }

    // Generate a unique seam code ID
    const seamCodeId = `code_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // TODO: Create code via Seam API
    const accessCode = await prisma.smartLockAccessCode.create({
      data: {
        smartLockId: body.smartLockId,
        seamCodeId,
        name: body.name,
        code: body.code,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        isActive: true
      }
    });

    return reply.status(201).send({ success: true, data: accessCode });
  });

  // Generate showing code
  fastify.post('/:smartLockId/showing-code', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { smartLockId } = request.params as { smartLockId: string };
    const { duration = 60, applicantName } = request.body as { duration?: number; applicantName?: string };

    const lock = await prisma.smartLock.findUnique({
      where: { id: smartLockId },
      include: { lease: { include: { listing: true } } }
    });

    if (!lock) throw new AppError(ErrorCode.NOT_FOUND, 'Lock not found', 404);

    // Generate random 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + duration * 60 * 1000);

    // Generate a unique seam code ID for the showing code
    const seamCodeId = `showing_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const accessCode = await prisma.smartLockAccessCode.create({
      data: {
        smartLockId,
        seamCodeId,
        name: `Showing - ${applicantName || 'Guest'}`,
        code,
        startsAt,
        endsAt,
        isActive: true
      }
    });

    // Get address from listing (through lease or direct)
    let address = 'Address not available';
    if (lock.lease?.listing) {
      address = lock.lease.listing.address;
    } else if (lock.listingId) {
      const listing = await prisma.listing.findUnique({ where: { id: lock.listingId } });
      if (listing) address = listing.address;
    }

    return reply.status(201).send({
      success: true,
      data: {
        code,
        expiresAt: endsAt,
        lockName: lock.deviceName,
        address
      }
    });
  });

  // Revoke access code
  fastify.delete('/access-codes/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const code = await prisma.smartLockAccessCode.findUnique({
      where: { id },
      include: { smartLock: { include: { lease: { include: { listing: true } } } } }
    });

    if (!code) throw new AppError(ErrorCode.NOT_FOUND, 'Access code not found', 404);

    // Check authorization
    let isAuthorized = false;
    const listing = code.smartLock.lease?.listing;
    if (listing) {
      isAuthorized = listing.landlordId === request.user.userId ||
                     listing.agentId === request.user.userId ||
                     request.user.role === 'ADMIN';
    } else if (code.smartLock.listingId) {
      const directListing = await prisma.listing.findUnique({ where: { id: code.smartLock.listingId } });
      if (directListing) {
        isAuthorized = directListing.landlordId === request.user.userId ||
                       directListing.agentId === request.user.userId ||
                       request.user.role === 'ADMIN';
      }
    }

    if (!isAuthorized) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized', 403);
    }

    await prisma.smartLockAccessCode.update({
      where: { id },
      data: { isActive: false }
    });

    return reply.send({ success: true, message: 'Access code revoked' });
  });

  // Get lock events
  fastify.get('/:smartLockId/events', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { smartLockId } = request.params as { smartLockId: string };
    const { page = 1, limit = 50 } = request.query as { page?: number; limit?: number };

    const lock = await prisma.smartLock.findUnique({
      where: { id: smartLockId },
      include: { lease: { include: { listing: true } } }
    });

    if (!lock) throw new AppError(ErrorCode.NOT_FOUND, 'Lock not found', 404);

    const events = await prisma.smartLockEvent.findMany({
      where: { smartLockId },
      orderBy: { occurredAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit
    });

    return reply.send({ success: true, data: events });
  });

  // Lock/unlock
  fastify.post('/:smartLockId/lock', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { smartLockId } = request.params as { smartLockId: string };

    // TODO: Call Seam API to lock
    await prisma.smartLockEvent.create({
      data: {
        smartLockId,
        eventType: 'LOCKED',
        method: 'REMOTE',
        occurredAt: new Date()
      }
    });

    return reply.send({ success: true, message: 'Lock command sent' });
  });

  fastify.post('/:smartLockId/unlock', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { smartLockId } = request.params as { smartLockId: string };

    // TODO: Call Seam API to unlock
    await prisma.smartLockEvent.create({
      data: {
        smartLockId,
        eventType: 'UNLOCKED',
        method: 'REMOTE',
        occurredAt: new Date()
      }
    });

    return reply.send({ success: true, message: 'Unlock command sent' });
  });
};
