/**
 * Compliance Routes
 *
 * P0 compliance enforcement with fail-closed gates at all critical transitions.
 * Implements FARE Act, FCHA, Good Cause, and disclosure enforcement.
 */

import {
  gateListingPublish,
  gateFCHAStageTransition,
  gateFCHABackgroundCheck,
  gateLeaseCreation,
  gateRentIncrease,
  gateDisclosureRequirement,
  getMarketPackIdFromMarket,
  getMarketPack,
  getMarketPackVersion,
  checkFAREActRules,
  checkFCHARules,
  checkGoodCauseRules,
  checkSecurityDepositRules,
  checkBrokerFeeRules,
  checkDisclosureRules,
  checkRentStabilizationRules,
  getCPIProvider,
  type GateResult,
  type FCHAStage,
  type ComplianceDecision,
} from '@realriches/compliance-engine';
import { prisma } from '@realriches/database';
import { generatePrefixedId, NotFoundError, ForbiddenError } from '@realriches/utils';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// ============================================================================
// Request Schemas
// ============================================================================

const ComplianceCheckSchema = z.object({
  entityType: z.enum(['listing', 'lease', 'property', 'unit', 'application']),
  entityId: z.string().uuid(),
  checkType: z.enum([
    'fare_act',
    'fcha',
    'good_cause',
    'rent_stabilization',
    'broker_fee',
    'security_deposit',
    'disclosure',
  ]),
});

const ListingPublishGateSchema = z.object({
  listingId: z.string().uuid(),
});

const FCHAStageTransitionSchema = z.object({
  applicationId: z.string().uuid(),
  currentStage: z.enum([
    'initial_inquiry',
    'application_submitted',
    'application_review',
    'conditional_offer',
    'background_check',
    'final_approval',
    'lease_signing',
  ]),
  targetStage: z.enum([
    'initial_inquiry',
    'application_submitted',
    'application_review',
    'conditional_offer',
    'background_check',
    'final_approval',
    'lease_signing',
  ]),
});

const FCHABackgroundCheckSchema = z.object({
  applicationId: z.string().uuid(),
  checkType: z.enum(['criminal_background_check', 'credit_check', 'eviction_history']),
});

const LeaseExecutionGateSchema = z.object({
  leaseId: z.string().uuid(),
});

const DisclosureRecordSchema = z.object({
  disclosureId: z.string(),
  recipientId: z.string(),
  recipientType: z.enum(['tenant', 'applicant', 'buyer']),
  deliveryMethod: z.enum(['email', 'in_app', 'physical', 'esign']),
  metadata: z.record(z.unknown()).optional(),
});

const GoodCauseCheckSchema = z.object({
  leaseId: z.string().uuid(),
  actionType: z.enum(['non_renewal', 'eviction', 'rent_increase']),
  reason: z.string().optional(),
  proposedRent: z.number().optional(),
});

// ============================================================================
// Compliance Routes
// ============================================================================

export async function complianceRoutes(app: FastifyInstance): Promise<void> {
  // =========================================================================
  // POST /check - Run a compliance check on an entity
  // =========================================================================
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
      const requestId = generatePrefixedId('req');

      // Get market configuration for the entity
      const { marketId, marketPackId, pack } = await getMarketConfigForEntity(
        data.entityType,
        data.entityId
      );

      // Run comprehensive compliance check based on type
      const result = await runComplianceCheck({
        entityType: data.entityType,
        entityId: data.entityId,
        checkType: data.checkType,
      }, marketId, pack);

      // Create compliance check record with policyVersion + evidence
      const check = await prisma.complianceCheck.create({
        data: {
          id: generatePrefixedId('cpl'),
          entityType: data.entityType.toUpperCase(),
          entityId: data.entityId,
          marketId,
          checkType: data.checkType.toUpperCase(),
          status: result.passed ? 'passed' : 'failed',
          severity: result.severity,
          title: result.title,
          description: result.description,
          result: JSON.parse(JSON.stringify({
            passed: result.passed,
            violations: result.violations,
            recommendations: result.recommendations,
            policyVersion: result.policyVersion,
            marketPack: marketPackId,
            marketPackVersion: result.marketPackVersion,
            checksPerformed: result.checksPerformed,
            evidence: result.evidence,
          })),
          details: JSON.parse(JSON.stringify(result.evidence)),
          checkedAt: new Date(),
          checkedById: request.user.id,
        },
      });

      // Create audit log entry
      await createAuditLog({
        actorId: request.user.id,
        actorEmail: request.user.email,
        action: `compliance_check_${data.checkType}`,
        entityType: data.entityType,
        entityId: data.entityId,
        metadata: {
          checkId: check.id,
          passed: result.passed,
          policyVersion: result.policyVersion,
          marketPack: marketPackId,
        },
        requestId,
      });

      return reply.send({
        success: true,
        data: {
          checkId: check.id,
          passed: result.passed,
          violations: result.violations,
          recommendations: result.recommendations,
          policyVersion: result.policyVersion,
          marketPack: marketPackId,
          marketPackVersion: result.marketPackVersion,
        },
      });
    }
  );

  // =========================================================================
  // POST /gates/listing-publish - Listing publish gate (DRAFT -> ACTIVE)
  // =========================================================================
  app.post(
    '/gates/listing-publish',
    {
      schema: {
        description: 'Check if a listing can be published (DRAFT -> ACTIVE transition)',
        tags: ['Compliance', 'Gates'],
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

      const { listingId } = ListingPublishGateSchema.parse(request.body);
      const requestId = generatePrefixedId('req');

      // Fetch listing with unit and property
      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        include: {
          unit: {
            include: {
              property: true,
            },
          },
        },
      });

      if (!listing) {
        throw new NotFoundError('Listing not found');
      }

      // Determine market from property address
      const { marketId, marketPackId } = await getMarketConfigForEntity('listing', listingId);

      // Get disclosure records for this listing with disclosure type
      const disclosureRecords = await prisma.disclosureRecord.findMany({
        where: {
          entityType: 'listing',
          entityId: listingId,
        },
        include: {
          disclosure: {
            select: {
              type: true,
            },
          },
        },
      });

      // Extract delivered disclosures (all records with deliveredAt set)
      const deliveredDisclosures = disclosureRecords
        .filter((r) => r.deliveredAt !== null)
        .map((r) => r.disclosure.type);

      // Extract acknowledged disclosures (records with acknowledgedAt set)
      const acknowledgedDisclosures = disclosureRecords
        .filter((r) => r.acknowledgedAt !== null)
        .map((r) => r.disclosure.type);

      // Extract broker fee from metadata if present
      const listingMetadata = (listing.metadata as Record<string, unknown>) || {};
      const brokerFeeAmount = listingMetadata.brokerFeeAmount as number | undefined;
      const securityDepositAmount = listingMetadata.securityDepositAmount as number | undefined;
      const incomeRequirement = listingMetadata.incomeRequirementMultiplier as number | undefined;
      const creditScoreRequirement = listingMetadata.creditScoreThreshold as number | undefined;

      // Run listing publish gate
      const gateResult = await gateListingPublish({
        listingId,
        marketId,
        status: listing.status,
        hasBrokerFee: listing.hasBrokerFee ?? false,
        brokerFeeAmount: brokerFeeAmount,
        brokerFeePaidBy: 'tenant', // Assume tenant-paid until proven otherwise
        monthlyRent: Number(listing.rent ?? listing.priceAmount),
        securityDepositAmount: securityDepositAmount,
        incomeRequirementMultiplier: incomeRequirement,
        creditScoreThreshold: creditScoreRequirement,
        deliveredDisclosures,
        acknowledgedDisclosures,
      });

      // Record compliance check
      const checkId = await recordGateResult(
        {
          entityType: 'listing',
          entityId: listingId,
          marketId,
          action: 'listing_publish',
          previousState: { status: 'draft' },
          newState: { status: 'active' },
        },
        gateResult,
        request.user.id,
        request.user.email,
        requestId
      );

      // FAIL-CLOSED: If not allowed, block and optionally suspend
      if (!gateResult.allowed) {
        // Set listing to SUSPENDED if critical violations
        const criticalViolations = gateResult.decision.violations.filter(
          (v) => v.severity === 'critical'
        );

        if (criticalViolations.length > 0) {
          await prisma.listing.update({
            where: { id: listingId },
            data: { status: 'paused' },
          });

          await createAuditLog({
            actorId: request.user.id,
            actorEmail: request.user.email,
            action: 'listing_suspended_compliance',
            entityType: 'listing',
            entityId: listingId,
            changes: { status: { from: listing.status, to: 'paused' } },
            metadata: {
              reason: gateResult.blockedReason,
              violations: criticalViolations.map((v) => v.code),
            },
            requestId,
          });
        }

        return reply.status(403).send({
          success: false,
          error: {
            code: 'COMPLIANCE_GATE_BLOCKED',
            message: gateResult.blockedReason,
            violations: gateResult.decision.violations,
            recommendedFixes: gateResult.decision.recommendedFixes,
            complianceCheckId: checkId,
            policyVersion: gateResult.decision.policyVersion,
            marketPack: marketPackId,
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          allowed: true,
          complianceCheckId: checkId,
          decision: gateResult.decision,
        },
      });
    }
  );

  // =========================================================================
  // POST /gates/fcha-stage - FCHA stage transition gate
  // =========================================================================
  app.post(
    '/gates/fcha-stage',
    {
      schema: {
        description: 'Check if an FCHA stage transition is allowed',
        tags: ['Compliance', 'Gates'],
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

      const { applicationId, currentStage, targetStage } = FCHAStageTransitionSchema.parse(
        request.body
      );
      const requestId = generatePrefixedId('req');

      const { marketId, marketPackId } = await getMarketConfigForEntity(
        'application',
        applicationId
      );

      const gateResult = await gateFCHAStageTransition({
        applicationId,
        marketId,
        currentStage: currentStage as FCHAStage,
        targetStage: targetStage as FCHAStage,
      });

      const checkId = await recordGateResult(
        {
          entityType: 'application',
          entityId: applicationId,
          marketId,
          action: 'fcha_stage_transition',
          previousState: { stage: currentStage },
          newState: { stage: targetStage },
        },
        gateResult,
        request.user.id,
        request.user.email,
        requestId
      );

      if (!gateResult.allowed) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'FCHA_STAGE_BLOCKED',
            message: gateResult.blockedReason,
            violations: gateResult.decision.violations,
            complianceCheckId: checkId,
            policyVersion: gateResult.decision.policyVersion,
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          allowed: true,
          complianceCheckId: checkId,
          decision: gateResult.decision,
        },
      });
    }
  );

  // =========================================================================
  // POST /gates/fcha-check - FCHA background check gate
  // =========================================================================
  app.post(
    '/gates/fcha-check',
    {
      schema: {
        description: 'Check if a background check is allowed under FCHA',
        tags: ['Compliance', 'Gates'],
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

      const { applicationId, checkType } = FCHABackgroundCheckSchema.parse(request.body);
      const requestId = generatePrefixedId('req');

      // Get application to find current stage
      const application = await prisma.tenantApplication.findUnique({
        where: { id: applicationId },
      });

      if (!application) {
        throw new NotFoundError('Application not found');
      }

      const { marketId } = await getMarketConfigForEntity('application', applicationId);

      const gateResult = await gateFCHABackgroundCheck({
        applicationId,
        marketId,
        currentStage: (application.status?.toLowerCase() || 'application_submitted') as FCHAStage,
        checkType,
      });

      const checkId = await recordGateResult(
        {
          entityType: 'application',
          entityId: applicationId,
          marketId,
          action: `fcha_${checkType}`,
          previousState: { stage: application.status },
          newState: { attemptedCheck: checkType },
        },
        gateResult,
        request.user.id,
        request.user.email,
        requestId
      );

      if (!gateResult.allowed) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'FCHA_CHECK_PROHIBITED',
            message: gateResult.blockedReason,
            violations: gateResult.decision.violations,
            complianceCheckId: checkId,
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          allowed: true,
          complianceCheckId: checkId,
        },
      });
    }
  );

  // =========================================================================
  // POST /gates/lease-execution - Lease execution gate
  // =========================================================================
  app.post(
    '/gates/lease-execution',
    {
      schema: {
        description: 'Check if a lease can be executed/signed',
        tags: ['Compliance', 'Gates'],
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

      const { leaseId } = LeaseExecutionGateSchema.parse(request.body);
      const requestId = generatePrefixedId('req');

      const lease = await prisma.lease.findUnique({
        where: { id: leaseId },
        include: {
          unit: {
            include: { property: true },
          },
        },
      });

      if (!lease) {
        throw new NotFoundError('Lease not found');
      }

      const { marketId, marketPackId } = await getMarketConfigForEntity('lease', leaseId);

      // Get disclosure records for this lease
      const disclosureRecords = await prisma.disclosureRecord.findMany({
        where: {
          entityType: 'lease',
          entityId: leaseId,
        },
        include: {
          disclosure: true,
        },
      });

      const deliveredDisclosures = disclosureRecords.map(
        (r) => r.disclosure?.type as string
      ).filter(Boolean);

      const acknowledgedDisclosures = disclosureRecords
        .filter((r) => r.acknowledgedAt)
        .map((r) => r.disclosure?.type as string)
        .filter(Boolean);

      // Extract rent stabilization info from lease metadata
      const leaseMetadata = (lease.metadata as Record<string, unknown>) || {};
      const legalRentAmount = leaseMetadata.legalRentAmount as number | undefined;
      const preferentialRentAmount = leaseMetadata.preferentialRentAmount as number | undefined;

      const gateResult = await gateLeaseCreation({
        leaseId,
        marketId,
        monthlyRent: Number(lease.monthlyRentAmount),
        securityDepositAmount: lease.securityDepositAmount ? Number(lease.securityDepositAmount) : undefined,
        isRentStabilized: lease.unit?.isRentStabilized ?? false,
        legalRentAmount: legalRentAmount,
        preferentialRentAmount: preferentialRentAmount,
        deliveredDisclosures,
        acknowledgedDisclosures,
      } as Parameters<typeof gateLeaseCreation>[0]);

      const checkId = await recordGateResult(
        {
          entityType: 'lease',
          entityId: leaseId,
          marketId,
          action: 'lease_execution',
          previousState: { status: lease.status },
          newState: { status: 'active' },
        },
        gateResult,
        request.user.id,
        request.user.email,
        requestId
      );

      if (!gateResult.allowed) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'LEASE_EXECUTION_BLOCKED',
            message: gateResult.blockedReason,
            violations: gateResult.decision.violations,
            recommendedFixes: gateResult.decision.recommendedFixes,
            complianceCheckId: checkId,
            policyVersion: gateResult.decision.policyVersion,
            marketPack: marketPackId,
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          allowed: true,
          complianceCheckId: checkId,
          decision: gateResult.decision,
        },
      });
    }
  );

  // =========================================================================
  // POST /fare-act/check - FARE Act compliance check
  // =========================================================================
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
      const requestId = generatePrefixedId('req');

      const listing = await prisma.listing.findUnique({
        where: { id: listingId },
        include: {
          unit: { include: { property: true } },
        },
      });

      if (!listing) {
        throw new NotFoundError('Listing not found');
      }

      const { marketId, marketPackId, pack } = await getMarketConfigForEntity('listing', listingId);

      // Extract FARE Act related fields from listing metadata
      const fareMetadata = (listing.metadata as Record<string, unknown>) || {};
      const incomeReqMultiplier = fareMetadata.incomeRequirementMultiplier as number | undefined;
      const creditThreshold = fareMetadata.creditScoreThreshold as number | undefined;

      const result = checkFAREActRules(
        {
          hasBrokerFee: listing.hasBrokerFee ?? false,
          brokerFeeAmount: listing.brokerFeeAmount ? Number(listing.brokerFeeAmount) : undefined,
          monthlyRent: Number(listing.rent ?? listing.priceAmount),
          incomeRequirementMultiplier: incomeReqMultiplier,
          creditScoreThreshold: creditThreshold,
        },
        pack
      );

      const passed = result.violations.filter((v) => v.severity === 'critical').length === 0;

      // Store compliance check with policyVersion
      const check = await prisma.complianceCheck.create({
        data: {
          id: generatePrefixedId('cpl'),
          entityType: 'listing',
          entityId: listingId,
          marketId,
          checkType: 'fare_act',
          status: passed ? 'passed' : 'failed',
          severity: passed ? 'info' : 'critical',
          title: passed ? 'FARE Act Compliant' : 'FARE Act Violation',
          description: passed
            ? 'Listing complies with FARE Act requirements'
            : result.violations.map((v) => v.message).join('; '),
          result: JSON.parse(JSON.stringify({
            violations: result.violations,
            fixes: result.fixes,
            policyVersion: '1.0.0',
            marketPack: marketPackId,
            marketPackVersion: getMarketPackVersion(pack),
          })),
          details: JSON.parse(JSON.stringify({
            policyVersion: '1.0.0',
            marketPack: marketPackId,
          })),
          checkedAt: new Date(),
          checkedById: request.user?.id || 'system',
        },
      });

      // Create audit log
      await createAuditLog({
        actorId: request.user?.id,
        actorEmail: request.user?.email || 'system',
        action: 'fare_act_check',
        entityType: 'listing',
        entityId: listingId,
        metadata: {
          checkId: check.id,
          passed,
          policyVersion: '1.0.0',
          marketPack: marketPackId,
        },
        requestId,
      });

      return reply.send({
        success: true,
        data: {
          checkId: check.id,
          passed,
          violations: result.violations,
          recommendedFixes: result.fixes,
          policyVersion: '1.0.0',
          marketPack: marketPackId,
          checkedAt: new Date().toISOString(),
        },
      });
    }
  );

  // =========================================================================
  // POST /good-cause/check - Good Cause Eviction check
  // =========================================================================
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
      const { leaseId, actionType, reason, proposedRent } = GoodCauseCheckSchema.parse(
        request.body
      );
      const requestId = generatePrefixedId('req');

      const lease = await prisma.lease.findUnique({
        where: { id: leaseId },
        include: {
          unit: { include: { property: true } },
        },
      });

      if (!lease) {
        throw new NotFoundError('Lease not found');
      }

      const { marketId, marketPackId, pack } = await getMarketConfigForEntity('lease', leaseId);

      // Get CPI provider for Good Cause calculations
      const cpiProvider = getCPIProvider();

      const result = await checkGoodCauseRules(
        {
          checkType: actionType === 'rent_increase' ? 'rent_increase' : 'eviction',
          currentRent: Number(lease.monthlyRent),
          proposedRent: proposedRent,
          evictionReason: reason,
          noticeDays: 30, // Default, should be calculated from actual notice
        },
        pack,
        cpiProvider
      );

      const passed = result.violations.filter((v) => v.severity === 'critical').length === 0;

      // Extract CPI evidence from violations
      const cpiEvidence = result.violations.find((v) => v.code === 'GOOD_CAUSE_CPI_FALLBACK_USED');

      const check = await prisma.complianceCheck.create({
        data: {
          id: generatePrefixedId('cpl'),
          entityType: 'lease',
          entityId: leaseId,
          marketId,
          checkType: 'good_cause',
          status: passed ? 'passed' : 'failed',
          severity: passed ? 'info' : 'critical',
          title: passed ? 'Good Cause Compliant' : 'Good Cause Violation',
          description: passed
            ? 'Action complies with Good Cause Eviction requirements'
            : result.violations.filter((v) => v.severity === 'critical').map((v) => v.message).join('; '),
          result: JSON.parse(JSON.stringify({
            actionType,
            violations: result.violations,
            fixes: result.fixes,
            policyVersion: '1.0.0',
            marketPack: marketPackId,
            marketPackVersion: getMarketPackVersion(pack),
          })),
          details: JSON.parse(JSON.stringify({
            policyVersion: '1.0.0',
            marketPack: marketPackId,
            dataSource: cpiEvidence?.evidence?.source || 'bls_api',
            cpiFallback: !!cpiEvidence,
          })),
          checkedAt: new Date(),
          checkedById: request.user?.id || 'system',
        },
      });

      await createAuditLog({
        actorId: request.user?.id,
        actorEmail: request.user?.email || 'system',
        action: `good_cause_check_${actionType}`,
        entityType: 'lease',
        entityId: leaseId,
        metadata: {
          checkId: check.id,
          passed,
          actionType,
          policyVersion: '1.0.0',
        },
        requestId,
      });

      return reply.send({
        success: true,
        data: {
          checkId: check.id,
          passed,
          violations: result.violations,
          recommendedFixes: result.fixes,
          policyVersion: '1.0.0',
          marketPack: marketPackId,
          checkedAt: new Date().toISOString(),
        },
      });
    }
  );

  // =========================================================================
  // GET /history/:entityType/:entityId - Compliance check history
  // =========================================================================
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
        where: { entityType: entityType.toLowerCase(), entityId },
        orderBy: { checkedAt: 'desc' },
        take: 50,
      });

      return reply.send({ success: true, data: checks });
    }
  );

  // =========================================================================
  // GET /disclosures - Get required disclosures for market
  // =========================================================================
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
      const { marketId = 'nyc', transactionType } = request.query;

      const marketPackId = getMarketPackIdFromMarket(marketId);
      const pack = getMarketPack(marketPackId);

      let disclosures = pack.rules.disclosures;

      if (transactionType) {
        disclosures = disclosures.filter((d) => d.requiredBefore === transactionType);
      }

      return reply.send({
        success: true,
        data: {
          marketId,
          marketPack: marketPackId,
          marketPackVersion: getMarketPackVersion(pack),
          disclosures,
        },
      });
    }
  );

  // =========================================================================
  // POST /disclosures/record - Record disclosure delivery
  // =========================================================================
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
          id: generatePrefixedId('dsr'),
          disclosureId: data.disclosureId,
          recipientId: data.recipientId,
          recipientType: data.recipientType.toUpperCase(),
          recipientEmail: request.user.email,
          entityType: disclosure.type || 'unknown',
          entityId: data.recipientId,
          sentAt: new Date(),
          deliveredAt: new Date(),
        },
      });

      return reply.status(201).send({ success: true, data: record });
    }
  );

  // =========================================================================
  // GET /markets/:marketId - Get market configuration
  // =========================================================================
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
      const { marketId } = request.params;

      const marketPackId = getMarketPackIdFromMarket(marketId);
      const pack = getMarketPack(marketPackId);

      return reply.send({
        success: true,
        data: {
          marketId,
          marketPack: marketPackId,
          marketPackVersion: getMarketPackVersion(pack),
          policyVersion: '1.0.0',
          rules: pack.rules,
          metadata: pack.metadata,
        },
      });
    }
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get market configuration for an entity based on its address.
 * Implements proper market detection from property/unit/listing address.
 */
async function getMarketConfigForEntity(
  entityType: string,
  entityId: string
): Promise<{
  marketId: string;
  marketPackId: string;
  pack: ReturnType<typeof getMarketPack>;
}> {
  let address: { city?: string; state?: string } | null = null;

  // Fetch address based on entity type
  switch (entityType.toLowerCase()) {
    case 'listing': {
      const listing = await prisma.listing.findUnique({
        where: { id: entityId },
        include: { unit: { include: { property: true } } },
      });
      address = listing?.unit?.property?.address as { city?: string; state?: string } | null;
      break;
    }
    case 'lease': {
      const lease = await prisma.lease.findUnique({
        where: { id: entityId },
        include: { unit: { include: { property: true } } },
      });
      address = lease?.unit?.property?.address as { city?: string; state?: string } | null;
      break;
    }
    case 'property': {
      const property = await prisma.property.findUnique({
        where: { id: entityId },
      });
      address = property?.address as { city?: string; state?: string } | null;
      break;
    }
    case 'unit': {
      const unit = await prisma.unit.findUnique({
        where: { id: entityId },
        include: { property: true },
      });
      address = unit?.property?.address as { city?: string; state?: string } | null;
      break;
    }
    case 'application': {
      const application = await prisma.tenantApplication.findUnique({
        where: { id: entityId },
        include: { listing: { include: { unit: { include: { property: true } } } } },
      });
      address = application?.listing?.unit?.property?.address as { city?: string; state?: string } | null;
      break;
    }
  }

  // Determine market ID from address
  let marketId = 'us'; // Default to US standard

  if (address) {
    const city = (address.city || '').toLowerCase();
    const state = (address.state || '').toLowerCase();

    // NYC detection
    if (
      city.includes('new york') ||
      city.includes('manhattan') ||
      city.includes('brooklyn') ||
      city.includes('queens') ||
      city.includes('bronx') ||
      city.includes('staten island') ||
      (state === 'ny' && city.includes('nyc'))
    ) {
      marketId = 'nyc';
    }
    // UK detection
    else if (
      city.includes('london') ||
      city.includes('manchester') ||
      city.includes('birmingham') ||
      state === 'england' ||
      state === 'uk'
    ) {
      marketId = 'uk';
    }
  }

  const marketPackId = getMarketPackIdFromMarket(marketId);
  const pack = getMarketPack(marketPackId);

  return { marketId, marketPackId, pack };
}

/**
 * Run comprehensive compliance check based on check type.
 */
async function runComplianceCheck(
  data: { entityType: string; entityId: string; checkType: string },
  marketId: string,
  pack: ReturnType<typeof getMarketPack>
): Promise<{
  passed: boolean;
  severity: 'info' | 'warning' | 'violation' | 'critical';
  title: string;
  description: string;
  violations: Array<{ code: string; message: string; severity: string }>;
  recommendations: string[];
  policyVersion: string;
  marketPackVersion: string;
  checksPerformed: string[];
  evidence: Record<string, unknown>;
}> {
  const violations: Array<{ code: string; message: string; severity: string; evidence?: Record<string, unknown> }> = [];
  const recommendations: string[] = [];
  const checksPerformed: string[] = [data.checkType];
  const evidence: Record<string, unknown> = { marketId };

  switch (data.checkType) {
    case 'fare_act': {
      const listing = await prisma.listing.findUnique({
        where: { id: data.entityId },
      });
      if (listing) {
        const listingMeta = (listing.metadata as Record<string, unknown>) || {};
        const incomeReqMult = listingMeta.incomeRequirementMultiplier as number | undefined;
        const creditThresh = listingMeta.creditScoreThreshold as number | undefined;

        const result = checkFAREActRules(
          {
            hasBrokerFee: listing.hasBrokerFee ?? false,
            brokerFeeAmount: listing.brokerFeeAmount ? Number(listing.brokerFeeAmount) : undefined,
            monthlyRent: Number(listing.rent ?? listing.priceAmount),
            incomeRequirementMultiplier: incomeReqMult,
            creditScoreThreshold: creditThresh,
          },
          pack
        );
        violations.push(...result.violations);
        recommendations.push(...result.fixes.map((f) => f.description));
      }
      break;
    }

    case 'fcha': {
      const application = await prisma.tenantApplication.findUnique({
        where: { id: data.entityId },
      });
      if (application) {
        const result = checkFCHARules(
          {
            currentStage: (application.status?.toLowerCase() || 'application_submitted') as FCHAStage,
            attemptedAction: 'stage_transition',
          },
          pack
        );
        violations.push(...result.violations);
        recommendations.push(...result.fixes.map((f) => f.description));
      }
      break;
    }

    case 'good_cause': {
      const lease = await prisma.lease.findUnique({
        where: { id: data.entityId },
      });
      if (lease) {
        const cpiProvider = getCPIProvider();
        const result = await checkGoodCauseRules(
          {
            checkType: 'rent_increase',
            currentRent: Number(lease.monthlyRent),
          },
          pack,
          cpiProvider
        );
        violations.push(...result.violations);
        recommendations.push(...result.fixes.map((f) => f.description));

        // Record CPI data source in evidence
        const cpiFallback = result.violations.find(
          (v) => v.code === 'GOOD_CAUSE_CPI_FALLBACK_USED'
        );
        if (cpiFallback) {
          evidence.dataSource = 'fallback';
          evidence.cpiFallbackReason = cpiFallback.evidence?.reason;
        }
      }
      break;
    }

    case 'rent_stabilization': {
      const lease = await prisma.lease.findUnique({
        where: { id: data.entityId },
        include: { unit: true },
      });
      if (lease) {
        const leaseMeta = (lease.metadata as Record<string, unknown>) || {};
        const legalRentAmt = leaseMeta.legalRentAmount as number | undefined;
        const prefRentAmt = leaseMeta.preferentialRentAmount as number | undefined;

        const result = checkRentStabilizationRules(
          {
            isRentStabilized: lease.unit?.isRentStabilized ?? false,
            legalRentAmount: legalRentAmt,
            preferentialRentAmount: prefRentAmt,
          },
          pack
        );
        violations.push(...result.violations);
        recommendations.push(...result.fixes.map((f) => f.description));
      }
      break;
    }

    case 'broker_fee': {
      const listing = await prisma.listing.findUnique({
        where: { id: data.entityId },
      });
      if (listing) {
        const result = checkBrokerFeeRules(
          {
            hasBrokerFee: listing.hasBrokerFee ?? false,
            brokerFeeAmount: listing.brokerFeeAmount ? Number(listing.brokerFeeAmount) : undefined,
            monthlyRent: Number(listing.rent ?? listing.priceAmount),
            paidBy: 'tenant',
          },
          pack
        );
        violations.push(...result.violations);
        recommendations.push(...result.fixes.map((f) => f.description));
      }
      break;
    }

    case 'security_deposit': {
      const listing = await prisma.listing.findUnique({
        where: { id: data.entityId },
      });
      if (listing && listing.securityDepositAmount) {
        const result = checkSecurityDepositRules(
          {
            securityDepositAmount: Number(listing.securityDepositAmount),
            monthlyRent: Number(listing.rent ?? listing.priceAmount),
          },
          pack
        );
        violations.push(...result.violations);
        recommendations.push(...result.fixes.map((f) => f.description));
      }
      break;
    }

    case 'disclosure': {
      const result = checkDisclosureRules(
        {
          entityType: data.entityType as 'listing' | 'application' | 'lease' | 'move_in',
          deliveredDisclosures: [],
          acknowledgedDisclosures: [],
        },
        pack
      );
      violations.push(...result.violations);
      recommendations.push(...result.fixes.map((f) => f.description));
      break;
    }
  }

  const criticalViolations = violations.filter((v) => v.severity === 'critical');
  const passed = criticalViolations.length === 0;

  let severity: 'info' | 'warning' | 'violation' | 'critical' = 'info';
  if (violations.some((v) => v.severity === 'critical')) severity = 'critical';
  else if (violations.some((v) => v.severity === 'violation')) severity = 'violation';
  else if (violations.some((v) => v.severity === 'warning')) severity = 'warning';

  return {
    passed,
    severity,
    title: passed ? 'Compliance Check Passed' : `${violations.length} Compliance Issue(s) Found`,
    description: passed
      ? `All ${data.checkType} requirements met`
      : violations.map((v) => v.message).join('; '),
    violations,
    recommendations,
    policyVersion: '1.0.0',
    marketPackVersion: getMarketPackVersion(pack),
    checksPerformed,
    evidence,
  };
}

/**
 * Record gate result to audit log and compliance check.
 */
async function recordGateResult(
  context: {
    entityType: string;
    entityId: string;
    marketId: string;
    action: string;
    previousState?: Record<string, unknown>;
    newState?: Record<string, unknown>;
  },
  result: GateResult,
  actorId: string,
  actorEmail: string,
  requestId: string
): Promise<string> {
  // Create compliance check record
  const worstSeverity = result.decision.violations.reduce<
    'info' | 'warning' | 'violation' | 'critical'
  >((worst, v) => {
    const severityOrder = ['info', 'warning', 'violation', 'critical'];
    return severityOrder.indexOf(v.severity) > severityOrder.indexOf(worst)
      ? (v.severity as 'info' | 'warning' | 'violation' | 'critical')
      : worst;
  }, 'info');

  const check = await prisma.complianceCheck.create({
    data: {
      id: generatePrefixedId('cpl'),
      entityType: context.entityType,
      entityId: context.entityId,
      marketId: context.marketId,
      checkType: result.decision.checksPerformed.join(','),
      status: result.allowed ? 'passed' : 'failed',
      severity: worstSeverity,
      title: result.allowed
        ? `Gate passed: ${context.action}`
        : `Gate blocked: ${context.action}`,
      description: result.blockedReason || 'All compliance checks passed',
      result: JSON.parse(JSON.stringify(result.decision)),
      details: JSON.parse(JSON.stringify({
        violations: result.decision.violations,
        fixes: result.decision.recommendedFixes,
        policyVersion: result.decision.policyVersion,
        marketPack: result.decision.marketPack,
        marketPackVersion: result.decision.marketPackVersion,
      })),
      checkedAt: new Date(),
      checkedById: actorId,
    },
  });

  // Create audit log entry
  await createAuditLog({
    actorId,
    actorEmail,
    action: `compliance_gate_${result.allowed ? 'passed' : 'blocked'}`,
    entityType: context.entityType,
    entityId: context.entityId,
    changes: {
      action: context.action,
      previousState: context.previousState,
      newState: context.newState,
    },
    metadata: {
      complianceCheckId: check.id,
      decision: result.decision,
      blockedReason: result.blockedReason,
    },
    requestId,
  });

  return check.id;
}

/**
 * Create an audit log entry.
 */
async function createAuditLog(entry: {
  actorId?: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  requestId?: string;
}): Promise<string> {
  const auditLog = await prisma.auditLog.create({
    data: {
      id: generatePrefixedId('aud'),
      actorId: entry.actorId,
      actorEmail: entry.actorEmail,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      changes: JSON.parse(JSON.stringify(entry.changes || {})),
      metadata: JSON.parse(JSON.stringify(entry.metadata || {})),
      requestId: entry.requestId,
      timestamp: new Date(),
    },
  });

  return auditLog.id;
}
