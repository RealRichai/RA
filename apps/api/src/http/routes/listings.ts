// @ts-nocheck
/**
 * Listing Routes - FARE Act Compliant
 * Application fee capped at $20, commission disclosure required
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { AppError, ErrorCode } from '../../lib/errors.js';
import { redis } from '../../lib/redis.js';

const FARE_ACT_MAX_APPLICATION_FEE = 2000; // $20.00 in cents

const createListingSchema = z.object({
  title: z.string().min(10).max(200),
  description: z.string().min(50).max(5000),
  propertyType: z.enum(['APARTMENT', 'HOUSE', 'CONDO', 'TOWNHOUSE', 'STUDIO', 'LOFT']),
  bedrooms: z.number().int().min(0).max(10),
  bathrooms: z.number().min(0.5).max(10),
  squareFeet: z.number().int().positive().optional(),
  monthlyRent: z.number().int().positive(),
  securityDeposit: z.number().int().min(0),
  applicationFee: z.number().int().min(0).max(FARE_ACT_MAX_APPLICATION_FEE),
  brokerFee: z.number().min(0).optional(),
  brokerFeeType: z.enum(['NONE', 'FLAT', 'PERCENTAGE']).optional(),
  brokerFeePaidBy: z.enum(['TENANT', 'LANDLORD', 'SPLIT']).optional(),
  address: z.object({
    street: z.string(),
    unit: z.string().optional(),
    city: z.string(),
    state: z.string().length(2),
    zip: z.string().regex(/^\d{5}(-\d{4})?$/)
  }),
  coordinates: z.object({
    lat: z.number(),
    lng: z.number()
  }).optional(),
  amenities: z.array(z.string()).optional(),
  utilities: z.object({
    heat: z.boolean().optional(),
    electricity: z.boolean().optional(),
    water: z.boolean().optional(),
    gas: z.boolean().optional(),
    internet: z.boolean().optional()
  }).optional(),
  policies: z.object({
    pets: z.enum(['NONE', 'CATS', 'DOGS', 'SMALL', 'ALL']).optional(),
    smoking: z.boolean().optional(),
    shortTerm: z.boolean().optional()
  }).optional(),
  availableDate: z.string().datetime(),
  leaseTermMonths: z.number().int().min(1).max(36).optional(),
  marketId: z.string().uuid(),
  images: z.array(z.object({
    url: z.string().url(),
    caption: z.string().optional(),
    order: z.number().int().min(0)
  })).optional()
});

const searchListingsSchema = z.object({
  marketId: z.string().uuid().optional(),
  minPrice: z.number().int().positive().optional(),
  maxPrice: z.number().int().positive().optional(),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().min(0).optional(),
  propertyType: z.enum(['APARTMENT', 'HOUSE', 'CONDO', 'TOWNHOUSE', 'STUDIO', 'LOFT']).optional(),
  amenities: z.array(z.string()).optional(),
  noFee: z.boolean().optional(),
  availableFrom: z.string().datetime().optional(),
  sortBy: z.enum(['price_asc', 'price_desc', 'date_asc', 'date_desc', 'sqft_asc', 'sqft_desc']).optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(50).optional()
});

export const listingRoutes: FastifyPluginAsync = async (fastify) => {
  // Search listings (public)
  fastify.get('/', async (request, reply) => {
    const query = searchListingsSchema.parse(request.query);
    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = { status: 'ACTIVE' };
    
    if (query.marketId) where.marketId = query.marketId;
    if (query.minPrice) where.monthlyRent = { ...where.monthlyRent, gte: query.minPrice };
    if (query.maxPrice) where.monthlyRent = { ...where.monthlyRent, lte: query.maxPrice };
    if (query.bedrooms !== undefined) where.bedrooms = query.bedrooms;
    if (query.bathrooms !== undefined) where.bathrooms = { gte: query.bathrooms };
    if (query.propertyType) where.propertyType = query.propertyType;
    if (query.noFee) where.brokerFee = 0;
    if (query.availableFrom) where.availableDate = { lte: new Date(query.availableFrom) };
    if (query.amenities?.length) where.amenities = { hasEvery: query.amenities };

    const orderBy: any = {};
    switch (query.sortBy) {
      case 'price_asc': orderBy.monthlyRent = 'asc'; break;
      case 'price_desc': orderBy.monthlyRent = 'desc'; break;
      case 'date_asc': orderBy.availableDate = 'asc'; break;
      case 'date_desc': orderBy.availableDate = 'desc'; break;
      case 'sqft_asc': orderBy.squareFeet = 'asc'; break;
      case 'sqft_desc': orderBy.squareFeet = 'desc'; break;
      default: orderBy.createdAt = 'desc';
    }

    const [listings, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        include: { images: { orderBy: { order: 'asc' } }, market: true, landlord: { select: { id: true, firstName: true, lastName: true } } },
        orderBy,
        skip,
        take: limit
      }),
      prisma.listing.count({ where })
    ]);

    return reply.send({
      success: true,
      data: listings,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  });

  // Get single listing (public)
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    // Try cache first
    const cached = await redis.get(`listing:${id}`);
    if (cached) {
      return reply.send({ success: true, data: JSON.parse(cached) });
    }

    const listing = await prisma.listing.findUnique({
      where: { id },
      include: {
        images: { orderBy: { order: 'asc' } },
        market: true,
        landlord: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        agent: { select: { id: true, firstName: true, lastName: true, avatar: true, agentProfile: true } },
        fareActDisclosure: true
      }
    });

    if (!listing) throw new AppError(ErrorCode.NOT_FOUND, 'Listing not found', 404);

    // Cache for 5 minutes
    await redis.setex(`listing:${id}`, 300, JSON.stringify(listing));

    // Increment view count
    await prisma.listing.update({ where: { id }, data: { viewCount: { increment: 1 } } });

    return reply.send({ success: true, data: listing });
  });

  // Create listing (landlords/agents only)
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (!['LANDLORD', 'AGENT', 'ADMIN'].includes(request.user.role)) {
      throw new AppError(ErrorCode.FORBIDDEN, 'Only landlords and agents can create listings', 403);
    }

    const body = createListingSchema.parse(request.body);

    // FARE Act validation
    if (body.applicationFee > FARE_ACT_MAX_APPLICATION_FEE) {
      throw new AppError(ErrorCode.FARE_ACT_VIOLATION, 'Application fee exceeds FARE Act maximum of $20', 400);
    }

    // Security deposit validation (max 1 month rent in NYC)
    if (body.securityDeposit > body.monthlyRent) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'Security deposit cannot exceed one month rent', 400);
    }

    const listing = await prisma.listing.create({
      data: {
        ...body,
        landlordId: request.user.role === 'LANDLORD' ? request.user.userId : undefined,
        agentId: request.user.role === 'AGENT' ? request.user.userId : undefined,
        address: body.address,
        coordinates: body.coordinates,
        amenities: body.amenities || [],
        utilities: body.utilities || {},
        policies: body.policies || {},
        status: 'ACTIVE',
        images: body.images ? { create: body.images } : undefined
      },
      include: { images: true, market: true }
    });

    // Create FARE Act disclosure
    await prisma.fAREActDisclosure.create({
      data: {
        listingId: listing.id,
        applicationFee: body.applicationFee,
        brokerFee: body.brokerFee || 0,
        brokerFeePaidBy: body.brokerFeePaidBy || 'TENANT',
        disclosureText: generateFareActDisclosure(body),
        acceptedAt: null
      }
    });

    return reply.status(201).send({ success: true, data: listing });
  });

  // Update listing
  fastify.patch('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = createListingSchema.partial().parse(request.body);

    const listing = await prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new AppError(ErrorCode.NOT_FOUND, 'Listing not found', 404);

    // Authorization check
    if (listing.landlordId !== request.user.userId && listing.agentId !== request.user.userId && request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized to update this listing', 403);
    }

    // FARE Act validation
    if (body.applicationFee && body.applicationFee > FARE_ACT_MAX_APPLICATION_FEE) {
      throw new AppError(ErrorCode.FARE_ACT_VIOLATION, 'Application fee exceeds FARE Act maximum of $20', 400);
    }

    const updated = await prisma.listing.update({
      where: { id },
      data: body,
      include: { images: true, market: true }
    });

    // Invalidate cache
    await redis.del(`listing:${id}`);

    return reply.send({ success: true, data: updated });
  });

  // Delete listing
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const listing = await prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new AppError(ErrorCode.NOT_FOUND, 'Listing not found', 404);

    if (listing.landlordId !== request.user.userId && listing.agentId !== request.user.userId && request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized to delete this listing', 403);
    }

    await prisma.listing.update({ where: { id }, data: { status: 'DELETED' } });
    await redis.del(`listing:${id}`);

    return reply.send({ success: true, message: 'Listing deleted' });
  });

  // Get my listings (landlord/agent)
  fastify.get('/my/listings', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const where = request.user.role === 'LANDLORD'
      ? { landlordId: request.user.userId }
      : { agentId: request.user.userId };

    const listings = await prisma.listing.findMany({
      where: { ...where, status: { not: 'DELETED' } },
      include: { images: { orderBy: { order: 'asc' } }, market: true, _count: { select: { applications: true } } },
      orderBy: { createdAt: 'desc' }
    });

    return reply.send({ success: true, data: listings });
  });
};

function generateFareActDisclosure(listing: z.infer<typeof createListingSchema>): string {
  const lines = [
    'FARE Act Disclosure (NYC Local Law 18 of 2024)',
    '',
    `Monthly Rent: $${(listing.monthlyRent / 100).toFixed(2)}`,
    `Security Deposit: $${(listing.securityDeposit / 100).toFixed(2)}`,
    `Application Fee: $${(listing.applicationFee / 100).toFixed(2)} (Maximum allowed: $20.00)`,
  ];

  if (listing.brokerFee && listing.brokerFee > 0) {
    const feeText = listing.brokerFeeType === 'PERCENTAGE'
      ? `${listing.brokerFee}% of annual rent`
      : `$${(listing.brokerFee / 100).toFixed(2)}`;
    lines.push(`Broker Fee: ${feeText} (Paid by: ${listing.brokerFeePaidBy})`);
  } else {
    lines.push('Broker Fee: None (No Fee Listing)');
  }

  lines.push('', 'This disclosure is provided in compliance with the NYC FARE Act effective June 14, 2025.');
  
  return lines.join('\n');
}
