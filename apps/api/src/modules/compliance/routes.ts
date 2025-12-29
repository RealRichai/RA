import { prisma } from '@realriches/database';
import { generateId, NotFoundError, ForbiddenError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

const ComplianceCheckSchema = z.object({
  entityType: z.enum(['LISTING', 'LEASE', 'PROPERTY', 'UNIT']),
  entityId: z.string(),
  checkType: z.enum([
    'FARE_ACT',
    'FCHA',
    'GOOD_CAUSE',
    'RENT_STABILIZATION',
    'BROKER_FEE',
    'SECURITY_DEPOSIT',
    'DISCLOSURE',
  ]),
});

const DisclosureRecordSchema = z.object({
  disclosureId: z.string(),
  recipientId: z.string(),
  recipientType: z.enum(['TENANT', 'APPLICANT', 'BUYER']),
  deliveryMethod: z.enum(['EMAIL', 'IN_APP', 'PHYSICAL', 'ESIGN']),
  metadata: z.record(z.unknown()).optional(),
});

export async function complianceRoutes(app: FastifyInstance): Promise<void> {
  // Run compliance check
  app.post(
    '/check',
    {
      schema: {
        description: 'Run a compliance check on an entity',
        tags: ['Compliance'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = ComplianceCheckSchema.parse(request.body);

      // Get market configuration for the entity
      const marketConfig = await getMarketConfigForEntity(data.entityType, data.entityId);

      // Run compliance check based on type
      const result = await runComplianceCheck(data, marketConfig);

      // Store the compliance check result
      const check = await prisma.complianceCheck.create({
        data: {
          id: generateId('cpl'),
          entityType: data.entityType,
          entityId: data.entityId,
          checkType: data.checkType,
          status: result.passed ? 'PASSED' : 'FAILED',
          result: result,
          checkedAt: new Date(),
          checkedById: request.user.id,
        },
      });

      return reply.send({
        success: true,
        data: {
          check,
          passed: result.passed,
          violations: result.violations,
          recommendations: result.recommendations,
        },
      });
    }
  );

  // Get compliance history for entity
  app.get(
    '/history/:entityType/:entityId',
    {
      schema: {
        description: 'Get compliance check history for an entity',
        tags: ['Compliance'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            entityType: { type: 'string' },
            entityId: { type: 'string' },
          },
          required: ['entityType', 'entityId'],
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{ Params: { entityType: string; entityId: string } }>,
      reply: FastifyReply
    ) => {
      const { entityType, entityId } = request.params;

      const checks = await prisma.complianceCheck.findMany({
        where: { entityType, entityId },
        orderBy: { checkedAt: 'desc' },
        take: 50,
      });

      return reply.send({ success: true, data: checks });
    }
  );

  // Get required disclosures for market
  app.get(
    '/disclosures',
    {
      schema: {
        description: 'Get required disclosures for a market',
        tags: ['Compliance'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            marketId: { type: 'string' },
            transactionType: { type: 'string' },
          },
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: { marketId?: string; transactionType?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { marketId, transactionType } = request.query;

      const where: Record<string, unknown> = { isActive: true };
      if (marketId) where.marketId = marketId;
      if (transactionType) where.transactionType = transactionType;

      const disclosures = await prisma.disclosure.findMany({
        where,
        orderBy: { name: 'asc' },
      });

      return reply.send({ success: true, data: disclosures });
    }
  );

  // Record disclosure delivery
  app.post(
    '/disclosures/record',
    {
      schema: {
        description: 'Record that a disclosure was delivered',
        tags: ['Compliance'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
        });
      }

      const data = DisclosureRecordSchema.parse(request.body);

      const disclosure = await prisma.disclosure.findUnique({
        where: { id: data.disclosureId },
      });

      if (!disclosure) {
        throw new NotFoundError('Disclosure not found');
      }

      const record = await prisma.disclosureRecord.create({
        data: {
          id: generateId('dsr'),
          disclosureId: data.disclosureId,
          recipientId: data.recipientId,
          recipientType: data.recipientType,
          deliveredAt: new Date(),
          deliveryMethod: data.deliveryMethod,
          deliveredById: request.user.id,
          metadata: data.metadata,
        },
      });

      return reply.status(201).send({ success: true, data: record });
    }
  );

  // Get market configuration
  app.get(
    '/markets/:marketId',
    {
      schema: {
        description: 'Get compliance configuration for a market',
        tags: ['Compliance'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { marketId: { type: 'string' } },
          required: ['marketId'],
        },
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest<{ Params: { marketId: string } }>, reply: FastifyReply) => {
      const config = await prisma.marketConfig.findFirst({
        where: { marketId: request.params.marketId, isActive: true },
      });

      if (!config) {
        throw new NotFoundError('Market configuration not found');
      }

      return reply.send({ success: true, data: config });
    }
  );

  // FARE Act compliance check endpoint
  app.post(
    '/fare-act/check',
    {
      schema: {
        description: 'Check FARE Act compliance for a listing',
        tags: ['Compliance'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { listingId } = (request.body as { listingId: string }) || {};

      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        include: {
          unit: { include: { property: true } },
        },
      });

      if (!listing) {
        throw new NotFoundError('Listing not found');
      }

      // FARE Act checks
      const violations: string[] = [];
      const recommendations: string[] = [];

      // Check 1: No broker fee to tenant
      if (listing.hasBrokerFee && listing.brokerFee && Number(listing.brokerFee) > 0) {
        violations.push(
          'FARE Act violation: Broker fees cannot be charged to tenants in NYC'
        );
        recommendations.push('Remove broker fee or transfer to landlord');
      }

      // Check 2: Security deposit limits (NYC max 1 month rent)
      const maxSecurityDeposit = Number(listing.rent);
      if (listing.securityDeposit && Number(listing.securityDeposit) > maxSecurityDeposit) {
        violations.push(
          `Security deposit exceeds NYC limit of one month's rent ($${maxSecurityDeposit})`
        );
        recommendations.push(`Reduce security deposit to $${maxSecurityDeposit} or less`);
      }

      const passed = violations.length === 0;

      // Store compliance check
      await prisma.complianceCheck.create({
        data: {
          id: generateId('cpl'),
          entityType: 'LISTING',
          entityId: listingId,
          checkType: 'FARE_ACT',
          status: passed ? 'PASSED' : 'FAILED',
          result: { violations, recommendations },
          checkedAt: new Date(),
          checkedById: request.user?.id || 'system',
        },
      });

      return reply.send({
        success: true,
        data: {
          passed,
          violations,
          recommendations,
          checkedAt: new Date().toISOString(),
        },
      });
    }
  );

  // Good Cause Eviction check
  app.post(
    '/good-cause/check',
    {
      schema: {
        description: 'Check Good Cause Eviction compliance for a lease action',
        tags: ['Compliance'],
        security: [{ bearerAuth: [] }],
      },
      preHandler: async (request, reply) => {
        await app.authenticate(request, reply);
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { leaseId, actionType, reason } = (request.body as {
        leaseId: string;
        actionType: 'NON_RENEWAL' | 'EVICTION' | 'RENT_INCREASE';
        reason?: string;
      }) || {};

      const lease = await prisma.lease.findUnique({
        where: { id: leaseId },
        include: {
          unit: { include: { property: true } },
          tenant: true,
        },
      });

      if (!lease) {
        throw new NotFoundError('Lease not found');
      }

      const violations: string[] = [];
      const recommendations: string[] = [];

      // Good Cause Eviction protections
      const validEvictionReasons = [
        'NONPAYMENT',
        'LEASE_VIOLATION',
        'NUISANCE',
        'ILLEGAL_USE',
        'OWNER_OCCUPANCY',
        'SUBSTANTIAL_RENOVATION',
      ];

      if (actionType === 'EVICTION' || actionType === 'NON_RENEWAL') {
        if (!reason || !validEvictionReasons.includes(reason)) {
          violations.push(
            'Good Cause Eviction: A valid reason is required for eviction or non-renewal'
          );
          recommendations.push(
            'Provide documentation for one of the valid eviction reasons: ' +
            validEvictionReasons.join(', ')
          );
        }
      }

      if (actionType === 'RENT_INCREASE') {
        // Check if rent-stabilized
        if (lease.unit.isRentStabilized) {
          violations.push(
            'This unit is rent-stabilized. Rent increases must follow RGB guidelines'
          );
          recommendations.push('Consult RGB published rent increase percentages for this year');
        } else {
          // Non-stabilized - check reasonable increase (5% + CPI under Good Cause)
          // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Fetch current CPI data
          const maxIncrease = 0.05; // Placeholder - should be 5% + CPI
          recommendations.push(
            `Under Good Cause, rent increases are capped at 5% + CPI (approximately ${(maxIncrease * 100).toFixed(1)}%)`
          );
        }
      }

      const passed = violations.length === 0;

      await prisma.complianceCheck.create({
        data: {
          id: generateId('cpl'),
          entityType: 'LEASE',
          entityId: leaseId,
          checkType: 'GOOD_CAUSE',
          status: passed ? 'PASSED' : 'FAILED',
          result: { actionType, reason, violations, recommendations },
          checkedAt: new Date(),
          checkedById: request.user?.id || 'system',
        },
      });

      return reply.send({
        success: true,
        data: {
          passed,
          violations,
          recommendations,
          checkedAt: new Date().toISOString(),
        },
      });
    }
  );
}

// Helper functions

async function getMarketConfigForEntity(
  entityType: string,
  entityId: string
): Promise<Record<string, unknown> | null> {
  // Determine market based on entity location
  const marketId = 'NYC'; // Default to NYC

  // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Implement proper market detection based on entity address

  const config = await prisma.marketConfig.findFirst({
    where: { marketId, isActive: true },
  });

  return config?.rules as Record<string, unknown> | null;
}

async function runComplianceCheck(
  data: { entityType: string; entityId: string; checkType: string },
  marketConfig: Record<string, unknown> | null
): Promise<{
  passed: boolean;
  violations: string[];
  recommendations: string[];
}> {
  const violations: string[] = [];
  const recommendations: string[] = [];

  // TODO: HUMAN_IMPLEMENTATION_REQUIRED - Implement comprehensive compliance checks
  // This is a placeholder implementation

  switch (data.checkType) {
    case 'FARE_ACT':
      // Check for broker fee compliance
      break;
    case 'FCHA':
      // Fair Credit Housing Act checks
      break;
    case 'GOOD_CAUSE':
      // Good Cause Eviction compliance
      break;
    case 'RENT_STABILIZATION':
      // Rent stabilization rules
      break;
    case 'BROKER_FEE':
      // Broker fee regulations
      break;
    case 'SECURITY_DEPOSIT':
      // Security deposit limits
      break;
    case 'DISCLOSURE':
      // Required disclosures
      break;
  }

  return {
    passed: violations.length === 0,
    violations,
    recommendations,
  };
}
