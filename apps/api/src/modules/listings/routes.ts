import {
  gateListingPublish,
  gateListingUpdate,
  gateBrokerFeeChange,
  gateSecurityDepositChange,
  getMarketPackIdFromMarket,
  type ComplianceDecision,
} from '@realriches/compliance-engine';
import { prisma } from '@realriches/database';
import { generatePrefixedId, NotFoundError, ForbiddenError, ValidationError, logger } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const CreateListingSchema = z.object({
  unitId: z.string(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  rent: z.number().min(0),
  securityDeposit: z.number().min(0).optional(),
  brokerFee: z.number().min(0).optional(),
  hasBrokerFee: z.boolean().default(false),
  brokerFeePaidBy: z.enum(['tenant', 'landlord']).optional(),
  /** Who the broker/agent represents - critical for FARE Act */
  agentRepresentation: z.enum(['landlord', 'tenant', 'dual', 'none']).optional(),
  availableDate: z.string().datetime(),
  leaseTermMonths: z.number().int().min(1).default(12),
  petPolicy: z.enum(['allowed', 'case_by_case', 'not_allowed']).default('not_allowed'),
  utilitiesIncluded: z.array(z.string()).optional(),
  incomeRequirementMultiplier: z.number().optional(),
  creditScoreThreshold: z.number().optional(),
  /** Fee disclosure for FARE Act compliance */
  feeDisclosure: z.object({
    disclosed: z.boolean(),
    disclosedFees: z.array(z.object({
      type: z.string(),
      amount: z.number(),
      paidBy: z.enum(['tenant', 'landlord']),
    })),
  }).optional(),
});

const PublishListingSchema = z.object({
  deliveredDisclosures: z.array(z.string()).default([]),
  acknowledgedDisclosures: z.array(z.string()).default([]),
  /** Fee disclosure for FARE Act compliance */
  feeDisclosure: z.object({
    disclosed: z.boolean(),
    disclosedFees: z.array(z.object({
      type: z.string(),
      amount: z.number(),
      paidBy: z.enum(['tenant', 'landlord']),
    })),
  }).optional(),
});

/**
 * Store compliance check in database
 */
async function storeComplianceCheck(
  entityType: string,
  entityId: string,
  marketId: string,
  decision: ComplianceDecision
): Promise<string> {
  const check = await prisma.complianceCheck.create({
    data: {
      id: generatePrefixedId('cck'),
      entityType,
      entityId,
      marketId,
      checkType: decision.checksPerformed.join(','),
      status: decision.passed ? 'passed' : 'failed',
      severity: decision.violations.length > 0
        ? decision.violations.reduce((worst, v) => {
            const order = ['info', 'warning', 'violation', 'critical'];
            return order.indexOf(v.severity) > order.indexOf(worst) ? v.severity : worst;
          }, 'info')
        : 'info',
      title: decision.passed
        ? 'Compliance check passed'
        : `${decision.violations.length} compliance violation(s) found`,
      description: decision.violations.map((v) => v.message).join('; ') || 'All checks passed',
      details: JSON.parse(JSON.stringify({
        policyVersion: decision.policyVersion,
        marketPack: decision.marketPack,
        marketPackVersion: decision.marketPackVersion,
        violations: decision.violations,
        recommendedFixes: decision.recommendedFixes,
      })),
      recommendation: decision.recommendedFixes.map((f) => f.description).join('; ') || null,
    },
  });
  return check.id;
}

/**
 * Store audit log for compliance-related actions
 */
async function storeComplianceAuditLog(
  userId: string | undefined,
  action: string,
  entityType: string,
  entityId: string,
  decision: ComplianceDecision,
  requestId: string
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      id: generatePrefixedId('aud'),
      actorId: userId || null,
      actorEmail: userId || 'system',
      action,
      entityType,
      entityId,
      changes: {
        checksPerformed: decision.checksPerformed,
        passed: decision.passed,
        violationCount: decision.violations.length,
      },
      metadata: JSON.parse(JSON.stringify({
        policyVersion: decision.policyVersion,
        marketPack: decision.marketPack,
        marketPackVersion: decision.marketPackVersion,
        violations: decision.violations,
      })),
      requestId,
    },
  });
}

const SearchListingsSchema = z.object({
  minRent: z.number().optional(),
  maxRent: z.number().optional(),
  bedrooms: z.number().int().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  noBrokerFee: z.boolean().optional(),
  petFriendly: z.boolean().optional(),
  page: z.number().int().default(1),
  limit: z.number().int().default(20),
});

export async function listingRoutes(app: FastifyInstance): Promise<void> {
  // Search listings (public)
  app.get(
    '/search',
    {
      schema: {
        description: 'Search available listings',
        tags: ['Listings'],
        querystring: {
          type: 'object',
          properties: {
            minRent: { type: 'number' },
            maxRent: { type: 'number' },
            bedrooms: { type: 'integer' },
            city: { type: 'string' },
            state: { type: 'string' },
            zipCode: { type: 'string' },
            noBrokerFee: { type: 'boolean' },
            petFriendly: { type: 'boolean' },
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 20 },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: Record<string, unknown> }>, reply: FastifyReply) => {
      const params = SearchListingsSchema.parse(request.query);
      const { page, limit, ...filters } = params;

      const where: Record<string, unknown> = { status: 'active' };

      if (filters.minRent || filters.maxRent) {
        where.rent = {};
        if (filters.minRent) (where.rent as Record<string, number>).gte = filters.minRent;
        if (filters.maxRent) (where.rent as Record<string, number>).lte = filters.maxRent;
      }

      if (filters.noBrokerFee) {
        where.hasBrokerFee = false;
      }

      if (filters.petFriendly) {
        where.petPolicy = { in: ['allowed', 'case_by_case'] };
      }

      if (filters.bedrooms !== undefined) {
        where.unit = { bedrooms: filters.bedrooms };
      }

      const [listings, total] = await Promise.all([
        prisma.listing.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          include: {
            unit: {
              include: {
                property: {
                  select: { id: true, name: true, address: true, amenities: true },
                },
              },
            },
            media: { where: { isPrimary: true }, take: 1 },
          },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.listing.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: listings,
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      });
    }
  );

  // Get listing by ID (public)
  app.get(
    '/:id',
    {
      schema: {
        description: 'Get listing details',
        tags: ['Listings'],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const listing = await prisma.listing.findUnique({
        where: { id: request.params.id },
        include: {
          unit: {
            include: {
              property: {
                select: { id: true, name: true, address: true, amenities: true, type: true },
              },
            },
          },
          media: { orderBy: { order: 'asc' } },
          agent: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        },
      });

      if (!listing) {
        throw new NotFoundError('Listing not found');
      }

      // Increment view count
      await prisma.listing.update({
        where: { id: listing.id },
        data: { viewCount: { increment: 1 } },
      });

      return reply.send({ success: true, data: listing });
    }
  );

  // Create listing
  app.post(
    '/',
    {
      schema: {
        description: 'Create a new listing',
        tags: ['Listings'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['landlord', 'agent', 'admin'] });
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = CreateListingSchema.parse(request.body);

      // Verify unit ownership
      const unit = await prisma.unit.findUnique({
        where: { id: data.unitId },
        include: { property: true },
      });

      if (!unit) {
        throw new NotFoundError('Unit not found');
      }

      if (unit.property.ownerId !== request.user.id && request.user.role !== 'admin') {
        throw new ForbiddenError('Access denied');
      }

      // Check for FARE Act compliance (no broker fee to tenants in NYC)
      // This would be enforced based on market configuration
      const marketConfig = await prisma.marketConfig.findFirst({
        where: {
          marketId: 'NYC',
          isActive: true,
        },
      });

      if (marketConfig && data.hasBrokerFee) {
        const rules = marketConfig.rules as Record<string, unknown>;
        if (rules?.fareActEnabled) {
          throw new ValidationError(
            'Broker fees to tenants are not allowed under the FARE Act in this market'
          );
        }
      }

      const listing = await prisma.listing.create({
        data: {
          id: generatePrefixedId('lst'),
          propertyId: unit.property.id,
          unitId: data.unitId,
          landlordId: unit.property.ownerId,
          title: data.title,
          description: data.description || '',
          type: 'rental',
          priceAmount: data.rent,
          rent: data.rent,
          securityDepositAmount: data.securityDeposit,
          brokerFeeAmount: data.hasBrokerFee ? data.brokerFee : null,
          hasBrokerFee: data.hasBrokerFee,
          availableDate: new Date(data.availableDate),
          leaseTerm: `${data.leaseTermMonths || 12} months`,
          status: 'draft', // Start as draft, require publish gate to activate
          agentId: request.user.role === 'agent' ? request.user.id : null,
          marketId: unit.property.marketId || 'US_STANDARD',
          street1: unit.property.street1 || '',
          city: unit.property.city || '',
          state: unit.property.state || '',
          postalCode: unit.property.postalCode || '',
          propertyType: unit.property.type,
          bedrooms: unit.bedrooms || 0,
          bathrooms: unit.bathrooms || 1,
        },
        include: { unit: { include: { property: true } } },
      });

      return reply.status(201).send({ success: true, data: listing });
    }
  );

  // Publish listing (DRAFT -> ACTIVE) with compliance gate
  app.post(
    '/:id/publish',
    {
      schema: {
        description: 'Publish a listing (DRAFT -> ACTIVE) with compliance enforcement',
        tags: ['Listings'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
        app.authorize(request, reply, { roles: ['landlord', 'agent', 'admin'] });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const listing = await prisma.listing.findUnique({
        where: { id: request.params.id },
        include: { unit: { include: { property: true } } },
      });

      if (!listing) {
        throw new NotFoundError('Listing not found');
      }

      if (
        listing.unit.property.ownerId !== request.user.id &&
        listing.agentId !== request.user.id &&
        request.user.role !== 'admin'
      ) {
        throw new ForbiddenError('Access denied');
      }

      if (listing.status !== 'draft') {
        throw new ValidationError(`Cannot publish listing with status: ${listing.status}`);
      }

      // Parse disclosure data from request body
      const publishData = PublishListingSchema.parse(request.body || {});

      // Get market ID from property
      const marketId = listing.unit.property.marketId || listing.marketId || 'US_STANDARD';

      // Run compliance gate with FARE Act fields
      const listingWithExtendedFields = listing as typeof listing & {
        brokerFeePaidBy?: string;
        agentRepresentation?: string;
        incomeRequirementMultiplier?: number;
        creditScoreThreshold?: number;
      };

      const gateResult = await gateListingPublish({
        listingId: listing.id,
        marketId,
        status: listing.status,
        hasBrokerFee: listing.hasBrokerFee || false,
        brokerFeeAmount: listing.brokerFeeAmount || undefined,
        brokerFeePaidBy: (listingWithExtendedFields.brokerFeePaidBy || 'tenant') as 'tenant' | 'landlord',
        agentRepresentation: (listingWithExtendedFields.agentRepresentation || 'landlord') as 'landlord' | 'tenant' | 'dual' | 'none',
        monthlyRent: listing.rent || 0,
        securityDepositAmount: listing.securityDepositAmount || undefined,
        incomeRequirementMultiplier: listingWithExtendedFields.incomeRequirementMultiplier,
        creditScoreThreshold: listingWithExtendedFields.creditScoreThreshold,
        deliveredDisclosures: publishData.deliveredDisclosures,
        acknowledgedDisclosures: publishData.acknowledgedDisclosures,
        feeDisclosure: publishData.feeDisclosure ? {
          disclosed: publishData.feeDisclosure.disclosed,
          disclosedFees: publishData.feeDisclosure.disclosedFees.map(fee => ({
            type: fee.type,
            amount: fee.amount,
            paidBy: fee.paidBy,
          })),
        } : undefined,
      });

      // Store compliance check
      const complianceCheckId = await storeComplianceCheck(
        'listing',
        listing.id,
        marketId,
        gateResult.decision
      );

      // Store audit log
      await storeComplianceAuditLog(
        request.user.id,
        gateResult.allowed ? 'listing_publish_approved' : 'listing_publish_blocked',
        'listing',
        listing.id,
        gateResult.decision,
        request.id
      );

      // If blocked, return error with violations
      if (!gateResult.allowed) {
        logger.warn({
          msg: 'listing_publish_blocked',
          listingId: listing.id,
          violations: gateResult.decision.violations,
          complianceCheckId,
        });

        return reply.status(422).send({
          success: false,
          error: {
            code: 'COMPLIANCE_VIOLATION',
            message: gateResult.blockedReason || 'Listing cannot be published due to compliance violations',
            details: {
              violations: gateResult.decision.violations,
              recommendedFixes: gateResult.decision.recommendedFixes,
              complianceCheckId,
              policyVersion: gateResult.decision.policyVersion,
              marketPack: gateResult.decision.marketPack,
            },
          },
        });
      }

      // Publish the listing
      const published = await prisma.listing.update({
        where: { id: listing.id },
        data: {
          status: 'active',
          isCompliant: true,
          complianceIssues: [],
          fareActCompliant: true,
          publishedAt: new Date(),
        },
        include: { unit: { include: { property: true } } },
      });

      logger.info({
        msg: 'listing_published',
        listingId: listing.id,
        marketPack: gateResult.decision.marketPack,
        complianceCheckId,
      });

      return reply.send({
        success: true,
        data: published,
        meta: {
          complianceCheckId,
          checksPerformed: gateResult.decision.checksPerformed,
        },
      });
    }
  );

  // Update listing
  app.patch(
    '/:id',
    {
      schema: {
        description: 'Update a listing',
        tags: ['Listings'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const listing = await prisma.listing.findUnique({
        where: { id: request.params.id },
        include: { unit: { include: { property: true } } },
      });

      if (!listing) {
        throw new NotFoundError('Listing not found');
      }

      if (
        listing.unit.property.ownerId !== request.user.id &&
        listing.agentId !== request.user.id &&
        request.user.role !== 'admin'
      ) {
        throw new ForbiddenError('Access denied');
      }

      const data = CreateListingSchema.partial().parse(request.body);

      // Get market ID from property
      const marketId = listing.unit.property.marketId || listing.marketId || 'US_STANDARD';

      // If listing is active, run compliance validation for updates
      if (listing.status === 'active') {
        const listingWithExtendedFields = listing as typeof listing & {
          brokerFeePaidBy?: string;
          agentRepresentation?: string;
          incomeRequirementMultiplier?: number;
          creditScoreThreshold?: number;
        };

        const gateResult = await gateListingUpdate({
          listingId: listing.id,
          marketId,
          status: listing.status,
          hasBrokerFee: data.hasBrokerFee ?? listing.hasBrokerFee ?? false,
          brokerFeeAmount: data.brokerFee ?? listing.brokerFeeAmount ?? undefined,
          brokerFeePaidBy: (data.brokerFeePaidBy ?? listingWithExtendedFields.brokerFeePaidBy ?? 'tenant') as 'tenant' | 'landlord',
          agentRepresentation: (data.agentRepresentation ?? listingWithExtendedFields.agentRepresentation ?? 'landlord') as 'landlord' | 'tenant' | 'dual' | 'none',
          monthlyRent: data.rent ?? listing.rent ?? 0,
          securityDepositAmount: data.securityDeposit ?? listing.securityDepositAmount ?? undefined,
          incomeRequirementMultiplier: data.incomeRequirementMultiplier ?? listingWithExtendedFields.incomeRequirementMultiplier,
          creditScoreThreshold: data.creditScoreThreshold ?? listingWithExtendedFields.creditScoreThreshold,
          deliveredDisclosures: [],
          acknowledgedDisclosures: [],
          feeDisclosure: data.feeDisclosure ? {
            disclosed: data.feeDisclosure.disclosed,
            disclosedFees: data.feeDisclosure.disclosedFees.map(fee => ({
              type: fee.type,
              amount: fee.amount,
              paidBy: fee.paidBy,
            })),
          } : undefined,
          previousState: {
            hasBrokerFee: listing.hasBrokerFee ?? undefined,
            brokerFeeAmount: listing.brokerFeeAmount ?? undefined,
            brokerFeePaidBy: listingWithExtendedFields.brokerFeePaidBy as 'tenant' | 'landlord' | undefined,
            agentRepresentation: listingWithExtendedFields.agentRepresentation as 'landlord' | 'tenant' | 'dual' | 'none' | undefined,
          },
        });

        // Store compliance check
        const complianceCheckId = await storeComplianceCheck(
          'listing',
          listing.id,
          marketId,
          gateResult.decision
        );

        // Store audit log
        await storeComplianceAuditLog(
          request.user.id,
          gateResult.allowed ? 'listing_update_approved' : 'listing_update_blocked',
          'listing',
          listing.id,
          gateResult.decision,
          request.id
        );

        // If blocked, return error with violations
        if (!gateResult.allowed) {
          logger.warn({
            msg: 'listing_update_blocked',
            listingId: listing.id,
            violations: gateResult.decision.violations,
            complianceCheckId,
          });

          return reply.status(422).send({
            success: false,
            error: {
              code: 'COMPLIANCE_VIOLATION',
              message: gateResult.blockedReason || 'Listing update blocked due to compliance violations',
              details: {
                violations: gateResult.decision.violations,
                recommendedFixes: gateResult.decision.recommendedFixes,
                complianceCheckId,
                policyVersion: gateResult.decision.policyVersion,
                marketPack: gateResult.decision.marketPack,
              },
            },
          });
        }
      }

      const updated = await prisma.listing.update({
        where: { id: request.params.id },
        data: {
          ...data,
          rent: data.rent,
          securityDepositAmount: data.securityDeposit,
          brokerFeeAmount: data.brokerFee,
          availableDate: data.availableDate ? new Date(data.availableDate) : undefined,
        },
        include: { unit: { include: { property: true } } },
      });

      return reply.send({ success: true, data: updated });
    }
  );

  // Submit inquiry
  app.post(
    '/:id/inquiries',
    {
      schema: {
        description: 'Submit an inquiry for a listing',
        tags: ['Listings'],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply, { optional: true });
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { name, email, phone, message } = (request.body as Record<string, string>) || {};

      const listing = await prisma.listing.findUnique({
        where: { id: request.params.id },
      });

      if (!listing) {
        throw new NotFoundError('Listing not found');
      }

      const inquiry = await prisma.listingInquiry.create({
        data: {
          id: generatePrefixedId('inq'),
          listingId: listing.id,
          userId: request.user?.id,
          name: name || request.user?.email?.split('@')[0],
          email: email || request.user?.email || '',
          phone,
          message,
          status: 'new',
        },
      });

      // Update inquiry count
      await prisma.listing.update({
        where: { id: listing.id },
        data: { inquiryCount: { increment: 1 } },
      });

      return reply.status(201).send({ success: true, data: inquiry });
    }
  );

  // Schedule showing
  app.post(
    '/:id/showings',
    {
      schema: {
        description: 'Schedule a showing for a listing',
        tags: ['Listings'],
        security: [{ bearerAuth: [] }],
        params: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const { scheduledAt, notes } = (request.body as { scheduledAt: string; notes?: string }) || {};

      const listing = await prisma.listing.findUnique({
        where: { id: request.params.id },
      });

      if (!listing) {
        throw new NotFoundError('Listing not found');
      }

      const showing = await prisma.showing.create({
        data: {
          id: generatePrefixedId('shw'),
          listingId: listing.id,
          prospectName: (request.user as unknown as { firstName?: string; lastName?: string }).firstName && (request.user as unknown as { firstName?: string; lastName?: string }).lastName
            ? `${(request.user as unknown as { firstName?: string }).firstName} ${(request.user as unknown as { lastName?: string }).lastName}`
            : 'Unknown',
          prospectEmail: request.user.email || 'unknown@example.com',
          scheduledAt: new Date(scheduledAt),
          status: 'scheduled',
        },
      });

      return reply.status(201).send({ success: true, data: showing });
    }
  );
}
