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
  propertyType: z.enum(['APARTMENT', 'HOUSE', 'CONDO', 'TOWNHOUSE', 'STUDIO', 'LOFT', 'PENTHOUSE']),
  bedrooms: z.number().int().min(0).max(10),
  bathrooms: z.number().min(0.5).max(10),
  squareFeet: z.number().int().positive().optional(),
  monthlyRent: z.number().int().positive(),
  securityDeposit: z.number().int().min(0),
  applicationFee: z.number().int().min(0).max(FARE_ACT_MAX_APPLICATION_FEE),
  brokerFee: z.number().min(0).optional(),
  brokerFeeResponsibility: z.enum(['TENANT', 'LANDLORD', 'SPLIT', 'NO_FEE']).optional(),
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
  propertyType: z.enum(['APARTMENT', 'HOUSE', 'CONDO', 'TOWNHOUSE', 'STUDIO', 'LOFT', 'PENTHOUSE']).optional(),
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

    const where: Record<string, unknown> = { status: 'ACTIVE' };

    if (query.marketId) where['marketId'] = query.marketId;
    if (query.minPrice || query.maxPrice) {
      const rentFilter: Record<string, number> = {};
      if (query.minPrice) rentFilter['gte'] = query.minPrice;
      if (query.maxPrice) rentFilter['lte'] = query.maxPrice;
      where['monthlyRent'] = rentFilter;
    }
    if (query.bedrooms !== undefined) where['bedrooms'] = query.bedrooms;
    if (query.bathrooms !== undefined) where['bathrooms'] = { gte: query.bathrooms };
    if (query.propertyType) where['propertyType'] = query.propertyType;
    if (query.noFee) where['brokerFee'] = 0;
    if (query.availableFrom) where['availableDate'] = { lte: new Date(query.availableFrom) };
    if (query.amenities?.length) where['amenities'] = { hasEvery: query.amenities };

    let orderBy: Record<string, 'asc' | 'desc'> = { createdAt: 'desc' };
    switch (query.sortBy) {
      case 'price_asc': orderBy = { monthlyRent: 'asc' }; break;
      case 'price_desc': orderBy = { monthlyRent: 'desc' }; break;
      case 'date_asc': orderBy = { availableDate: 'asc' }; break;
      case 'date_desc': orderBy = { availableDate: 'desc' }; break;
      case 'sqft_asc': orderBy = { squareFeet: 'asc' }; break;
      case 'sqft_desc': orderBy = { squareFeet: 'desc' }; break;
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
        landlord: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
        agent: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } }
          }
        },
        fareDisclosures: true
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

    // Get agent profile ID if the user is an agent
    let agentProfileId: string | undefined;
    if (request.user.role === 'AGENT') {
      const agentProfile = await prisma.agentProfile.findUnique({
        where: { userId: request.user.userId }
      });
      agentProfileId = agentProfile?.id;
    }

    // Create listing with proper schema fields
    const listing = await prisma.listing.create({
      data: {
        title: body.title,
        description: body.description,
        propertyType: body.propertyType,
        bedrooms: body.bedrooms,
        bathrooms: body.bathrooms,
        squareFeet: body.squareFeet,
        monthlyRent: body.monthlyRent,
        securityDeposit: body.securityDeposit,
        applicationFee: body.applicationFee,
        brokerFee: body.brokerFee,
        brokerFeeResponsibility: body.brokerFeeResponsibility || 'LANDLORD',
        // Address fields - schema uses separate fields, not JSON
        address: body.address.street,
        unit: body.address.unit,
        city: body.address.city,
        state: body.address.state,
        zipCode: body.address.zip,
        latitude: body.coordinates?.lat,
        longitude: body.coordinates?.lng,
        amenities: body.amenities || [],
        availableDate: new Date(body.availableDate),
        leaseTermMonths: body.leaseTermMonths || 12,
        landlordId: request.user.userId,
        agentId: agentProfileId,
        marketId: body.marketId,
        status: 'ACTIVE',
        images: body.images ? {
          create: body.images.map(img => ({
            url: img.url,
            caption: img.caption,
            order: img.order
          }))
        } : undefined
      },
      include: { images: true, market: true }
    });

    // Create FARE Act disclosure
    await prisma.fAREActDisclosure.create({
      data: {
        listingId: listing.id,
        brokerFeeAmount: body.brokerFee || 0,
        brokerFeeResponsibility: body.brokerFeeResponsibility || 'LANDLORD',
        applicationFeeAmount: body.applicationFee,
        firstMonthRent: body.monthlyRent,
        securityDeposit: body.securityDeposit,
        brokerFee: body.brokerFee || 0,
        applicationFee: body.applicationFee,
        totalMoveInCost: body.monthlyRent + body.securityDeposit + (body.brokerFee || 0) + body.applicationFee
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

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (body.title !== undefined) updateData['title'] = body.title;
    if (body.description !== undefined) updateData['description'] = body.description;
    if (body.propertyType !== undefined) updateData['propertyType'] = body.propertyType;
    if (body.bedrooms !== undefined) updateData['bedrooms'] = body.bedrooms;
    if (body.bathrooms !== undefined) updateData['bathrooms'] = body.bathrooms;
    if (body.squareFeet !== undefined) updateData['squareFeet'] = body.squareFeet;
    if (body.monthlyRent !== undefined) updateData['monthlyRent'] = body.monthlyRent;
    if (body.securityDeposit !== undefined) updateData['securityDeposit'] = body.securityDeposit;
    if (body.applicationFee !== undefined) updateData['applicationFee'] = body.applicationFee;
    if (body.brokerFee !== undefined) updateData['brokerFee'] = body.brokerFee;
    if (body.brokerFeeResponsibility !== undefined) updateData['brokerFeeResponsibility'] = body.brokerFeeResponsibility;
    if (body.address !== undefined) {
      updateData['address'] = body.address.street;
      updateData['unit'] = body.address.unit;
      updateData['city'] = body.address.city;
      updateData['state'] = body.address.state;
      updateData['zipCode'] = body.address.zip;
    }
    if (body.coordinates !== undefined) {
      updateData['latitude'] = body.coordinates.lat;
      updateData['longitude'] = body.coordinates.lng;
    }
    if (body.amenities !== undefined) updateData['amenities'] = body.amenities;
    if (body.availableDate !== undefined) updateData['availableDate'] = new Date(body.availableDate);
    if (body.leaseTermMonths !== undefined) updateData['leaseTermMonths'] = body.leaseTermMonths;
    if (body.marketId !== undefined) updateData['market'] = { connect: { id: body.marketId } };

    const updated = await prisma.listing.update({
      where: { id },
      data: updateData,
      include: { images: true, market: true }
    });

    // Invalidate cache
    await redis.del(`listing:${id}`);

    return reply.send({ success: true, data: updated });
  });

  // Delete listing - use ARCHIVED instead of DELETED (not in enum)
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const listing = await prisma.listing.findUnique({ where: { id } });
    if (!listing) throw new AppError(ErrorCode.NOT_FOUND, 'Listing not found', 404);

    if (listing.landlordId !== request.user.userId && listing.agentId !== request.user.userId && request.user.role !== 'ADMIN') {
      throw new AppError(ErrorCode.FORBIDDEN, 'Not authorized to delete this listing', 403);
    }

    await prisma.listing.update({ where: { id }, data: { status: 'ARCHIVED' } });
    await redis.del(`listing:${id}`);

    return reply.send({ success: true, message: 'Listing deleted' });
  });

  // Get my listings (landlord/agent)
  fastify.get('/my/listings', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    let where: Record<string, unknown>;

    if (request.user.role === 'LANDLORD') {
      where = { landlordId: request.user.userId };
    } else {
      // For agents, find listings by agent profile id
      const agentProfile = await prisma.agentProfile.findUnique({
        where: { userId: request.user.userId }
      });
      where = { agentId: agentProfile?.id };
    }

    const listings = await prisma.listing.findMany({
      where: { ...where, status: { not: 'ARCHIVED' } },
      include: { images: { orderBy: { order: 'asc' } }, market: true, _count: { select: { applications: true } } },
      orderBy: { createdAt: 'desc' }
    });

    return reply.send({ success: true, data: listings });
  });
};
