/**
 * Compliance Audit Job
 *
 * Performs periodic compliance checks on active listings, leases, and properties.
 * Detects violations for FARE Act, security deposits, disclosures, rent stabilization,
 * Good Cause Eviction, and GDPR requirements.
 */

import {
  checkFAREActRules,
  checkSecurityDepositRules,
  checkBrokerFeeRules,
  checkDisclosureRules,
  checkRentStabilizationRules,
  checkGoodCauseRules,
  checkGDPRRules,
  getMarketPack,
  getMarketPackIdFromMarket,
  type RuleResult,
  type Violation,
  type MarketPack,
} from '@realriches/compliance-engine';
import { prisma } from '@realriches/database';
import { logger } from '@realriches/utils';
import type { Job } from 'bullmq';
import type { Redis } from 'ioredis';

import type { JobDefinition } from './scheduler';

// =============================================================================
// Types
// =============================================================================

interface AuditResult {
  entityType: 'listing' | 'lease' | 'property';
  entityId: string;
  violations: Violation[];
  checksPerformed: string[];
  marketPack: string;
}

interface AuditSummary {
  date: string;
  duration: number;
  listings: {
    scanned: number;
    violations: number;
    critical: number;
  };
  leases: {
    scanned: number;
    violations: number;
    critical: number;
  };
  properties: {
    scanned: number;
    violations: number;
    critical: number;
  };
  totalViolations: number;
  byCode: Record<string, number>;
  bySeverity: Record<string, number>;
}

// =============================================================================
// Constants
// =============================================================================

const AUDIT_STATS_KEY = 'compliance:audit:stats';
const AUDIT_HISTORY_KEY = 'compliance:audit:history';
const BATCH_SIZE = 100;

// Store Redis connection
let redisClient: Redis | null = null;

// =============================================================================
// Compliance Audit Job
// =============================================================================

export class ComplianceAuditJob {
  /**
   * Get job definition for the scheduler.
   * Runs daily at 4 AM.
   */
  static getDefinition(): JobDefinition {
    return {
      name: 'compliance-audit',
      handler: (job: Job) => ComplianceAuditJob.execute(job),
      cron: '0 4 * * *', // Daily at 4 AM
      options: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 300000 },
        removeOnComplete: 30,
        removeOnFail: 60,
      },
    };
  }

  /**
   * Initialize with Redis connection.
   */
  static initializeRedis(redis: Redis): void {
    redisClient = redis;
  }

  /**
   * Execute the compliance audit.
   */
  static async execute(job: Job): Promise<AuditSummary> {
    const startTime = Date.now();
    const dateStr = new Date().toISOString().split('T')[0];

    logger.info({ jobId: job.id }, 'Starting compliance audit');

    const results: AuditResult[] = [];
    const summary: AuditSummary = {
      date: dateStr,
      duration: 0,
      listings: { scanned: 0, violations: 0, critical: 0 },
      leases: { scanned: 0, violations: 0, critical: 0 },
      properties: { scanned: 0, violations: 0, critical: 0 },
      totalViolations: 0,
      byCode: {},
      bySeverity: {},
    };

    try {
      // Audit active listings
      const listingResults = await ComplianceAuditJob.auditListings();
      results.push(...listingResults);
      summary.listings.scanned = listingResults.length;
      summary.listings.violations = listingResults.filter((r) => r.violations.length > 0).length;
      summary.listings.critical = listingResults.filter((r) =>
        r.violations.some((v) => v.severity === 'critical')
      ).length;

      // Audit active leases
      const leaseResults = await ComplianceAuditJob.auditLeases();
      results.push(...leaseResults);
      summary.leases.scanned = leaseResults.length;
      summary.leases.violations = leaseResults.filter((r) => r.violations.length > 0).length;
      summary.leases.critical = leaseResults.filter((r) =>
        r.violations.some((v) => v.severity === 'critical')
      ).length;

      // Audit properties (for disclosure requirements)
      const propertyResults = await ComplianceAuditJob.auditProperties();
      results.push(...propertyResults);
      summary.properties.scanned = propertyResults.length;
      summary.properties.violations = propertyResults.filter((r) => r.violations.length > 0).length;
      summary.properties.critical = propertyResults.filter((r) =>
        r.violations.some((v) => v.severity === 'critical')
      ).length;

      // Aggregate violations
      for (const result of results) {
        for (const violation of result.violations) {
          summary.totalViolations++;
          summary.byCode[violation.code] = (summary.byCode[violation.code] || 0) + 1;
          summary.bySeverity[violation.severity] = (summary.bySeverity[violation.severity] || 0) + 1;
        }
      }

      // Store results
      await ComplianceAuditJob.storeResults(results, summary);

      // Create notifications for critical violations
      await ComplianceAuditJob.notifyViolations(results);

      summary.duration = Date.now() - startTime;

      logger.info(
        {
          jobId: job.id,
          duration: summary.duration,
          totalViolations: summary.totalViolations,
          listings: summary.listings,
          leases: summary.leases,
          properties: summary.properties,
        },
        'Compliance audit completed'
      );

      return summary;
    } catch (error) {
      logger.error({ jobId: job.id, error }, 'Compliance audit failed');
      throw error;
    }
  }

  // ===========================================================================
  // Audit Functions
  // ===========================================================================

  /**
   * Audit active listings for compliance.
   */
  private static async auditListings(): Promise<AuditResult[]> {
    const results: AuditResult[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const listings = await prisma.listing.findMany({
        where: { status: 'active' },
        include: {
          unit: {
            include: {
              property: true,
            },
          },
        },
        skip: offset,
        take: BATCH_SIZE,
      });

      if (listings.length === 0) {
        hasMore = false;
        continue;
      }

      for (const listing of listings) {
        const market = listing.unit?.property?.market || 'US_STANDARD';
        const packId = getMarketPackIdFromMarket(market);
        const pack = getMarketPack(packId);

        const violations: Violation[] = [];
        const checksPerformed: string[] = [];

        // Check FARE Act rules
        checksPerformed.push('fare_act');
        const fareResult = checkFAREActRules(
          {
            hasBrokerFee: listing.hasBrokerFee || false,
            brokerFeeAmount: listing.brokerFeeAmount ? Number(listing.brokerFeeAmount) : undefined,
            monthlyRent: Number(listing.rent),
            incomeRequirementMultiplier: listing.incomeRequirement
              ? Number(listing.incomeRequirement)
              : undefined,
            creditScoreThreshold: listing.creditScoreRequirement || undefined,
          },
          pack
        );
        violations.push(...fareResult.violations);

        // Check broker fee rules
        checksPerformed.push('broker_fee');
        const brokerResult = checkBrokerFeeRules(
          {
            hasBrokerFee: listing.hasBrokerFee || false,
            brokerFeeAmount: listing.brokerFeeAmount ? Number(listing.brokerFeeAmount) : undefined,
            monthlyRent: Number(listing.rent),
            paidBy: listing.brokerFeePaidBy as 'tenant' | 'landlord' | undefined,
          },
          pack
        );
        violations.push(...brokerResult.violations);

        // Check security deposit
        checksPerformed.push('security_deposit');
        const depositResult = checkSecurityDepositRules(
          {
            securityDepositAmount: Number(listing.securityDeposit || 0),
            monthlyRent: Number(listing.rent),
          },
          pack
        );
        violations.push(...depositResult.violations);

        // Record violations if any
        if (violations.length > 0) {
          await ComplianceAuditJob.recordViolations(
            'listing',
            listing.id,
            market,
            checksPerformed,
            violations,
            pack
          );
        }

        results.push({
          entityType: 'listing',
          entityId: listing.id,
          violations,
          checksPerformed,
          marketPack: packId,
        });
      }

      offset += BATCH_SIZE;
    }

    return results;
  }

  /**
   * Audit active leases for compliance.
   */
  private static async auditLeases(): Promise<AuditResult[]> {
    const results: AuditResult[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const leases = await prisma.lease.findMany({
        where: { status: 'active' },
        include: {
          unit: {
            include: {
              property: true,
            },
          },
          documents: true,
        },
        skip: offset,
        take: BATCH_SIZE,
      });

      if (leases.length === 0) {
        hasMore = false;
        continue;
      }

      for (const lease of leases) {
        const market = lease.unit?.property?.market || 'US_STANDARD';
        const packId = getMarketPackIdFromMarket(market);
        const pack = getMarketPack(packId);

        const violations: Violation[] = [];
        const checksPerformed: string[] = [];

        // Check rent stabilization
        checksPerformed.push('rent_stabilization');
        const rentStabResult = checkRentStabilizationRules(
          {
            isRentStabilized: lease.isRentStabilized || false,
            legalRentAmount: lease.legalRentAmount ? Number(lease.legalRentAmount) : undefined,
            preferentialRentAmount: lease.preferentialRentAmount
              ? Number(lease.preferentialRentAmount)
              : undefined,
            hasRgbRegistration: lease.hasRgbRegistration || false,
          },
          pack
        );
        violations.push(...rentStabResult.violations);

        // Check Good Cause for rent increases
        if (lease.previousRentAmount && lease.monthlyRentAmount) {
          const currentRent = Number(lease.previousRentAmount);
          const proposedRent = Number(lease.monthlyRentAmount);

          if (proposedRent > currentRent) {
            checksPerformed.push('good_cause_rent_increase');
            const goodCauseResult = await checkGoodCauseRules(
              {
                checkType: 'rent_increase',
                currentRent,
                proposedRent,
              },
              pack
            );
            violations.push(...goodCauseResult.violations);
          }
        }

        // Check disclosure requirements
        checksPerformed.push('disclosures');
        const deliveredDisclosures = lease.documents
          ?.filter((d) => d.category === 'disclosure')
          .map((d) => d.documentType) || [];
        const acknowledgedDisclosures = lease.documents
          ?.filter((d) => d.category === 'disclosure' && d.signedAt)
          .map((d) => d.documentType) || [];

        const disclosureResult = checkDisclosureRules(
          {
            entityType: 'lease',
            deliveredDisclosures,
            acknowledgedDisclosures,
          },
          pack
        );
        violations.push(...disclosureResult.violations);

        // Check security deposit amount
        checksPerformed.push('security_deposit');
        const depositResult = checkSecurityDepositRules(
          {
            securityDepositAmount: Number(lease.securityDepositAmount || 0),
            monthlyRent: Number(lease.monthlyRentAmount),
          },
          pack
        );
        violations.push(...depositResult.violations);

        // Record violations if any
        if (violations.length > 0) {
          await ComplianceAuditJob.recordViolations(
            'lease',
            lease.id,
            market,
            checksPerformed,
            violations,
            pack
          );
        }

        results.push({
          entityType: 'lease',
          entityId: lease.id,
          violations,
          checksPerformed,
          marketPack: packId,
        });
      }

      offset += BATCH_SIZE;
    }

    return results;
  }

  /**
   * Audit properties for compliance.
   */
  private static async auditProperties(): Promise<AuditResult[]> {
    const results: AuditResult[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const properties = await prisma.property.findMany({
        where: { status: 'active' },
        include: {
          units: {
            include: {
              leases: {
                where: { status: 'active' },
                take: 1,
              },
            },
          },
        },
        skip: offset,
        take: BATCH_SIZE,
      });

      if (properties.length === 0) {
        hasMore = false;
        continue;
      }

      for (const property of properties) {
        const market = property.market || 'US_STANDARD';
        const packId = getMarketPackIdFromMarket(market);
        const pack = getMarketPack(packId);

        const violations: Violation[] = [];
        const checksPerformed: string[] = [];

        // Check GDPR for UK properties
        if (market.includes('UK') || market.includes('GDPR')) {
          checksPerformed.push('gdpr_privacy_notice');
          const gdprResult = checkGDPRRules(
            {
              checkType: 'privacy_notice',
              hasPrivacyNotice: property.hasPrivacyNotice || false,
            },
            pack
          );
          violations.push(...gdprResult.violations);
        }

        // Record violations if any
        if (violations.length > 0) {
          await ComplianceAuditJob.recordViolations(
            'property',
            property.id,
            market,
            checksPerformed,
            violations,
            pack
          );
        }

        results.push({
          entityType: 'property',
          entityId: property.id,
          violations,
          checksPerformed,
          marketPack: packId,
        });
      }

      offset += BATCH_SIZE;
    }

    return results;
  }

  // ===========================================================================
  // Storage & Notification Functions
  // ===========================================================================

  /**
   * Record violations in the database.
   */
  private static async recordViolations(
    entityType: string,
    entityId: string,
    marketId: string,
    checksPerformed: string[],
    violations: Violation[],
    pack: MarketPack
  ): Promise<void> {
    const worstSeverity = ComplianceAuditJob.getWorstSeverity(violations);

    await prisma.complianceCheck.create({
      data: {
        entityType,
        entityId,
        marketId,
        checkType: checksPerformed.join(','),
        status: 'failed',
        severity: worstSeverity,
        title: `Compliance audit found ${violations.length} violation(s)`,
        description: violations.map((v) => v.message).join('; '),
        details: {
          violations,
          marketPack: pack.id,
          marketPackVersion: `${pack.version.major}.${pack.version.minor}.${pack.version.patch}`,
          checksPerformed,
        },
        recommendation: violations
          .map((v) => v.ruleReference || v.code)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join('; '),
      },
    });
  }

  /**
   * Store audit results in Redis.
   */
  private static async storeResults(
    results: AuditResult[],
    summary: AuditSummary
  ): Promise<void> {
    if (!redisClient) return;

    // Store summary
    await redisClient.set(AUDIT_STATS_KEY, JSON.stringify(summary));

    // Store in history
    await redisClient.zadd(AUDIT_HISTORY_KEY, Date.now(), JSON.stringify(summary));

    // Trim history to last 90 days
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    await redisClient.zremrangebyscore(AUDIT_HISTORY_KEY, '-inf', cutoff);
  }

  /**
   * Notify owners of critical violations.
   */
  private static async notifyViolations(results: AuditResult[]): Promise<void> {
    const criticalResults = results.filter((r) =>
      r.violations.some((v) => v.severity === 'critical')
    );

    for (const result of criticalResults) {
      // Find the owner
      let ownerId: string | null = null;

      if (result.entityType === 'listing') {
        const listing = await prisma.listing.findUnique({
          where: { id: result.entityId },
          include: { unit: { include: { property: true } } },
        });
        ownerId = listing?.unit?.property?.ownerId || null;
      } else if (result.entityType === 'lease') {
        const lease = await prisma.lease.findUnique({
          where: { id: result.entityId },
          include: { unit: { include: { property: true } } },
        });
        ownerId = lease?.unit?.property?.ownerId || null;
      } else if (result.entityType === 'property') {
        const property = await prisma.property.findUnique({
          where: { id: result.entityId },
        });
        ownerId = property?.ownerId || null;
      }

      if (!ownerId) continue;

      const criticalViolations = result.violations.filter((v) => v.severity === 'critical');

      await prisma.notification.create({
        data: {
          userId: ownerId,
          type: 'compliance_violation',
          channel: 'in_app',
          title: `Critical compliance issue: ${result.entityType}`,
          body: `${criticalViolations.length} critical violation(s) found: ${criticalViolations.map((v) => v.message).join('; ')}`,
          data: {
            entityType: result.entityType,
            entityId: result.entityId,
            violations: criticalViolations,
            marketPack: result.marketPack,
            priority: 'critical',
          },
          status: 'sent',
        },
      });
    }

    // Also notify admins of overall audit results if many violations
    if (criticalResults.length > 10) {
      const admins = await prisma.user.findMany({
        where: {
          role: { in: ['admin', 'super_admin'] },
          status: 'active',
        },
        select: { id: true },
        take: 5,
      });

      for (const admin of admins) {
        await prisma.notification.create({
          data: {
            userId: admin.id,
            type: 'compliance_audit_alert',
            channel: 'in_app',
            title: `Compliance audit: ${criticalResults.length} entities with critical violations`,
            body: `Today's compliance audit found ${criticalResults.length} entities with critical compliance violations requiring attention.`,
            data: {
              criticalCount: criticalResults.length,
              totalViolations: results.reduce((sum, r) => sum + r.violations.length, 0),
              priority: 'high',
            },
            status: 'sent',
          },
        });
      }
    }
  }

  /**
   * Get the worst severity from violations.
   */
  private static getWorstSeverity(
    violations: Violation[]
  ): 'info' | 'warning' | 'violation' | 'critical' {
    const severityOrder = ['info', 'warning', 'violation', 'critical'];
    let worstIndex = 0;

    for (const v of violations) {
      const index = severityOrder.indexOf(v.severity);
      if (index > worstIndex) {
        worstIndex = index;
      }
    }

    return severityOrder[worstIndex] as 'info' | 'warning' | 'violation' | 'critical';
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get latest audit summary.
   */
  static async getLatestAuditSummary(): Promise<AuditSummary | null> {
    if (!redisClient) return null;

    const data = await redisClient.get(AUDIT_STATS_KEY);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Get audit history.
   */
  static async getAuditHistory(days: number = 30): Promise<AuditSummary[]> {
    if (!redisClient) return [];

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const results = await redisClient.zrangebyscore(AUDIT_HISTORY_KEY, cutoff, '+inf');

    return results.map((r) => JSON.parse(r));
  }

  /**
   * Get violations for a specific entity.
   */
  static async getEntityViolations(
    entityType: string,
    entityId: string
  ): Promise<Array<{ id: string; severity: string; title: string; details: unknown }>> {
    const checks = await prisma.complianceCheck.findMany({
      where: {
        entityType,
        entityId,
        status: 'failed',
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        severity: true,
        title: true,
        details: true,
        createdAt: true,
      },
    });

    return checks;
  }

  /**
   * Run audit for a specific entity.
   */
  static async auditEntity(
    entityType: 'listing' | 'lease' | 'property',
    entityId: string
  ): Promise<AuditResult> {
    let result: AuditResult;

    if (entityType === 'listing') {
      const listing = await prisma.listing.findUnique({
        where: { id: entityId },
        include: { unit: { include: { property: true } } },
      });

      if (!listing) {
        throw new Error(`Listing not found: ${entityId}`);
      }

      const market = listing.unit?.property?.market || 'US_STANDARD';
      const packId = getMarketPackIdFromMarket(market);
      const pack = getMarketPack(packId);
      const violations: Violation[] = [];
      const checksPerformed: string[] = [];

      // Run all listing checks
      checksPerformed.push('fare_act');
      const fareResult = checkFAREActRules(
        {
          hasBrokerFee: listing.hasBrokerFee || false,
          brokerFeeAmount: listing.brokerFeeAmount ? Number(listing.brokerFeeAmount) : undefined,
          monthlyRent: Number(listing.rent),
          incomeRequirementMultiplier: listing.incomeRequirement
            ? Number(listing.incomeRequirement)
            : undefined,
          creditScoreThreshold: listing.creditScoreRequirement || undefined,
        },
        pack
      );
      violations.push(...fareResult.violations);

      checksPerformed.push('broker_fee');
      const brokerResult = checkBrokerFeeRules(
        {
          hasBrokerFee: listing.hasBrokerFee || false,
          brokerFeeAmount: listing.brokerFeeAmount ? Number(listing.brokerFeeAmount) : undefined,
          monthlyRent: Number(listing.rent),
          paidBy: listing.brokerFeePaidBy as 'tenant' | 'landlord' | undefined,
        },
        pack
      );
      violations.push(...brokerResult.violations);

      checksPerformed.push('security_deposit');
      const depositResult = checkSecurityDepositRules(
        {
          securityDepositAmount: Number(listing.securityDeposit || 0),
          monthlyRent: Number(listing.rent),
        },
        pack
      );
      violations.push(...depositResult.violations);

      result = { entityType, entityId, violations, checksPerformed, marketPack: packId };
    } else if (entityType === 'lease') {
      const lease = await prisma.lease.findUnique({
        where: { id: entityId },
        include: {
          unit: { include: { property: true } },
          documents: true,
        },
      });

      if (!lease) {
        throw new Error(`Lease not found: ${entityId}`);
      }

      const market = lease.unit?.property?.market || 'US_STANDARD';
      const packId = getMarketPackIdFromMarket(market);
      const pack = getMarketPack(packId);
      const violations: Violation[] = [];
      const checksPerformed: string[] = [];

      checksPerformed.push('rent_stabilization');
      const rentStabResult = checkRentStabilizationRules(
        {
          isRentStabilized: lease.isRentStabilized || false,
          legalRentAmount: lease.legalRentAmount ? Number(lease.legalRentAmount) : undefined,
          preferentialRentAmount: lease.preferentialRentAmount
            ? Number(lease.preferentialRentAmount)
            : undefined,
          hasRgbRegistration: lease.hasRgbRegistration || false,
        },
        pack
      );
      violations.push(...rentStabResult.violations);

      checksPerformed.push('security_deposit');
      const depositResult = checkSecurityDepositRules(
        {
          securityDepositAmount: Number(lease.securityDepositAmount || 0),
          monthlyRent: Number(lease.monthlyRentAmount),
        },
        pack
      );
      violations.push(...depositResult.violations);

      result = { entityType, entityId, violations, checksPerformed, marketPack: packId };
    } else {
      const property = await prisma.property.findUnique({
        where: { id: entityId },
      });

      if (!property) {
        throw new Error(`Property not found: ${entityId}`);
      }

      const market = property.market || 'US_STANDARD';
      const packId = getMarketPackIdFromMarket(market);
      const pack = getMarketPack(packId);
      const violations: Violation[] = [];
      const checksPerformed: string[] = [];

      if (market.includes('UK') || market.includes('GDPR')) {
        checksPerformed.push('gdpr_privacy_notice');
        const gdprResult = checkGDPRRules(
          {
            checkType: 'privacy_notice',
            hasPrivacyNotice: property.hasPrivacyNotice || false,
          },
          pack
        );
        violations.push(...gdprResult.violations);
      }

      result = { entityType, entityId, violations, checksPerformed, marketPack: packId };
    }

    return result;
  }
}
