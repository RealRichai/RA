/**
 * Compliance Engine
 *
 * Main orchestrator for compliance checks and enforcement.
 * Integrates with database for persistence and feature flags for toggles.
 */

import type {
  ComplianceDecision,
  GateResult,
  EnforcementContext,
  MarketPackId,
  MarketPack,
} from './types';
import { getMarketPack, getMarketPackIdFromMarket, mergeMarketPackWithConfig } from './market-packs';

// ============================================================================
// Engine Configuration
// ============================================================================

export interface ComplianceEngineConfig {
  /**
   * Function to fetch MarketConfig from database
   */
  getMarketConfig?: (marketId: string) => Promise<Record<string, unknown> | null>;

  /**
   * Function to check if a feature flag is enabled
   */
  isFeatureEnabled?: (flag: string, context?: Record<string, unknown>) => Promise<boolean>;

  /**
   * Function to create audit log entry
   */
  createAuditLog?: (entry: AuditLogEntry) => Promise<string>;

  /**
   * Function to create compliance check record
   */
  createComplianceCheck?: (check: ComplianceCheckEntry) => Promise<string>;

  /**
   * Logger function
   */
  logger?: (level: string, message: string, data?: Record<string, unknown>) => void;
}

export interface AuditLogEntry {
  actorId?: string;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

export interface ComplianceCheckEntry {
  entityType: string;
  entityId: string;
  marketId: string;
  checkType: string;
  status: 'passed' | 'failed' | 'pending_review';
  severity: 'info' | 'warning' | 'violation' | 'critical';
  title: string;
  description: string;
  details: Record<string, unknown>;
  recommendation?: string;
}

// ============================================================================
// Compliance Engine Class
// ============================================================================

export class ComplianceEngine {
  private config: ComplianceEngineConfig;
  private marketPackCache: Map<string, MarketPack> = new Map();

  constructor(config: ComplianceEngineConfig = {}) {
    this.config = config;
  }

  /**
   * Get market pack with DB overrides applied
   */
  async getEffectiveMarketPack(marketId: string): Promise<MarketPack> {
    const cacheKey = marketId;

    if (this.marketPackCache.has(cacheKey)) {
      return this.marketPackCache.get(cacheKey)!;
    }

    const packId = getMarketPackIdFromMarket(marketId);
    let pack = getMarketPack(packId);

    // Apply DB overrides if available
    if (this.config.getMarketConfig) {
      const dbConfig = await this.config.getMarketConfig(marketId);
      if (dbConfig) {
        pack = mergeMarketPackWithConfig(pack, dbConfig);
      }
    }

    this.marketPackCache.set(cacheKey, pack);
    return pack;
  }

  /**
   * Check if a compliance feature is enabled
   */
  async isComplianceFeatureEnabled(
    feature: string,
    marketId: string
  ): Promise<boolean> {
    // Check feature flag system first
    if (this.config.isFeatureEnabled) {
      const flagEnabled = await this.config.isFeatureEnabled(feature, { marketId });
      if (!flagEnabled) {
        return false;
      }
    }

    // Check market pack rules
    const pack = await this.getEffectiveMarketPack(marketId);

    const featureToRuleMap: Record<string, () => boolean> = {
      'fare_act_enforcement': () => pack.rules.fareAct?.enabled ?? false,
      'fcha_enforcement': () => pack.rules.fcha?.enabled ?? false,
      'good_cause_enforcement': () => pack.rules.goodCause?.enabled ?? false,
      'rent_stabilization_enforcement': () => pack.rules.rentStabilization?.enabled ?? false,
      'broker_fee_enforcement': () => pack.rules.brokerFee.enabled,
      'security_deposit_enforcement': () => pack.rules.securityDeposit.enabled,
      'disclosure_enforcement': () => pack.rules.disclosures.length > 0,
    };

    const checkRule = featureToRuleMap[feature];
    return checkRule ? checkRule() : false;
  }

  /**
   * Record a gate result to audit log and compliance check
   */
  async recordGateResult(
    context: EnforcementContext,
    result: GateResult
  ): Promise<{ auditLogId?: string; complianceCheckId?: string }> {
    const ids: { auditLogId?: string; complianceCheckId?: string } = {};

    // Create audit log
    if (this.config.createAuditLog) {
      try {
        ids.auditLogId = await this.config.createAuditLog({
          actorId: context.userId,
          actorEmail: context.userId || 'system',
          action: `compliance_gate_${result.allowed ? 'passed' : 'blocked'}`,
          entityType: context.entityType,
          entityId: context.entityId,
          changes: {
            action: context.action,
            previousState: context.previousState,
            newState: context.newState,
          },
          metadata: {
            decision: result.decision,
            blockedReason: result.blockedReason,
          },
        });
      } catch (err) {
        this.log('error', 'Failed to create audit log', {
          error: err instanceof Error ? err.message : 'Unknown',
          context,
        });
      }
    }

    // Create compliance check record
    if (this.config.createComplianceCheck && result.decision.violations.length > 0) {
      try {
        const worstSeverity = this.getWorstSeverity(result.decision.violations);
        ids.complianceCheckId = await this.config.createComplianceCheck({
          entityType: context.entityType,
          entityId: context.entityId,
          marketId: context.marketId,
          checkType: result.decision.checksPerformed.join(','),
          status: result.allowed ? 'passed' : 'failed',
          severity: worstSeverity,
          title: result.allowed
            ? 'Compliance check passed'
            : `Compliance check failed: ${result.decision.violations.length} violation(s)`,
          description: result.blockedReason || 'All compliance checks passed',
          details: {
            violations: result.decision.violations,
            fixes: result.decision.recommendedFixes,
            policyVersion: result.decision.policyVersion,
            marketPack: result.decision.marketPack,
            marketPackVersion: result.decision.marketPackVersion,
          },
          recommendation: result.decision.recommendedFixes
            .map((f) => f.description)
            .join('; '),
        });
      } catch (err) {
        this.log('error', 'Failed to create compliance check', {
          error: err instanceof Error ? err.message : 'Unknown',
          context,
        });
      }
    }

    return ids;
  }

  /**
   * Clear market pack cache
   */
  clearCache(): void {
    this.marketPackCache.clear();
  }

  /**
   * Get the worst severity from a list of violations
   */
  private getWorstSeverity(
    violations: Array<{ severity: string }>
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

  /**
   * Internal logging
   */
  private log(level: string, message: string, data?: Record<string, unknown>): void {
    if (this.config.logger) {
      this.config.logger(level, message, data);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultEngine: ComplianceEngine | null = null;

/**
 * Get the default compliance engine instance
 */
export function getComplianceEngine(): ComplianceEngine {
  if (!defaultEngine) {
    defaultEngine = new ComplianceEngine();
  }
  return defaultEngine;
}

/**
 * Configure the default compliance engine
 */
export function configureComplianceEngine(config: ComplianceEngineConfig): void {
  defaultEngine = new ComplianceEngine(config);
}

/**
 * Reset the compliance engine (for testing)
 */
export function resetComplianceEngine(): void {
  defaultEngine = null;
}
