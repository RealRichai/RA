/**
 * Copilot Compliance Gate
 *
 * Validates generated listing copy against market-specific compliance rules
 * before allowing publish operations.
 */

import type {
  ListingDraft,
  OptimizedListingCopy,
  ComplianceGateResult,
  ComplianceViolation,
} from '../types';
import { ComplianceBlockedError } from '../types';

// ============================================================================
// Types
// ============================================================================

export interface ComplianceGateDeps {
  /**
   * Gate function from @realriches/compliance-engine
   */
  gateListingPublish: (input: {
    listingId: string;
    marketId: string;
    status: string;
    hasBrokerFee: boolean;
    brokerFeeAmount?: number;
    brokerFeePaidBy?: 'tenant' | 'landlord';
    agentRepresentation?: 'landlord' | 'tenant' | 'dual' | 'none';
    monthlyRent: number;
    securityDepositAmount?: number;
    incomeRequirementMultiplier?: number;
    creditScoreThreshold?: number;
    deliveredDisclosures: string[];
    acknowledgedDisclosures: string[];
    feeDisclosure?: {
      disclosed: boolean;
      disclosedFees: Array<{
        type: string;
        amount: number;
        paidBy: 'tenant' | 'landlord';
      }>;
    };
  }) => Promise<{
    allowed: boolean;
    decision: {
      passed: boolean;
      violations: Array<{
        code: string;
        message: string;
        severity: 'critical' | 'warning' | 'info';
        evidence?: Record<string, unknown>;
      }>;
      marketPack: string;
      marketPackVersion: string;
      checksPerformed: string[];
    };
    blockedReason?: string;
  }>;
}

export interface ComplianceGateInput {
  listingDraft: ListingDraft;
  optimizedCopy: OptimizedListingCopy;
  marketId: string;
  listingId?: string;
  securityDeposit?: number;
}

// ============================================================================
// Compliance Gate Class
// ============================================================================

export class CopilotComplianceGate {
  private deps: ComplianceGateDeps;

  constructor(deps: ComplianceGateDeps) {
    this.deps = deps;
  }

  /**
   * Validate listing with generated copy against compliance rules.
   * Throws ComplianceBlockedError if validation fails.
   */
  async validate(input: ComplianceGateInput): Promise<ComplianceGateResult> {
    const { listingDraft, optimizedCopy, marketId, listingId, securityDeposit } = input;

    // Build disclosures from the generated copy
    const deliveredDisclosures: string[] = [];
    const acknowledgedDisclosures: string[] = [];

    // If disclosure text was generated, mark it as delivered
    if (optimizedCopy.disclosureText) {
      deliveredDisclosures.push('copilot_disclosure');
      acknowledgedDisclosures.push('copilot_disclosure');
    }

    // Build fee disclosure
    const feeDisclosure = listingDraft.hasBrokerFee
      ? {
          disclosed: true,
          disclosedFees: [
            {
              type: 'broker_fee',
              amount: listingDraft.brokerFeeAmount ?? 0,
              paidBy: listingDraft.brokerFeePaidBy ?? 'tenant',
            },
          ],
        }
      : undefined;

    // Call the compliance engine gate
    const result = await this.deps.gateListingPublish({
      listingId: listingId ?? 'copilot-preview',
      marketId,
      status: 'DRAFT',
      hasBrokerFee: listingDraft.hasBrokerFee,
      brokerFeeAmount: listingDraft.brokerFeeAmount,
      brokerFeePaidBy: listingDraft.brokerFeePaidBy,
      agentRepresentation: listingDraft.agentRepresentation,
      monthlyRent: listingDraft.monthlyRent,
      securityDepositAmount: securityDeposit,
      deliveredDisclosures,
      acknowledgedDisclosures,
      feeDisclosure,
    });

    // Map violations to our format
    const violations: ComplianceViolation[] = result.decision.violations.map((v) => ({
      code: v.code,
      message: v.message,
      severity: v.severity,
      evidence: v.evidence,
    }));

    const gateResult: ComplianceGateResult = {
      passed: result.allowed,
      violations,
      marketPack: result.decision.marketPack,
      marketPackVersion: result.decision.marketPackVersion,
      checksPerformed: result.decision.checksPerformed,
      gatedAt: new Date(),
    };

    // If blocked, throw error with details
    if (!result.allowed) {
      throw new ComplianceBlockedError(
        result.blockedReason ?? 'Compliance check failed',
        violations
      );
    }

    return gateResult;
  }

  /**
   * Validate without throwing - returns result with violations.
   */
  async validateSafe(input: ComplianceGateInput): Promise<ComplianceGateResult> {
    try {
      return await this.validate(input);
    } catch (error) {
      if (error instanceof ComplianceBlockedError) {
        return {
          passed: false,
          violations: error.violations,
          marketPack: 'unknown',
          marketPackVersion: 'unknown',
          checksPerformed: [],
          gatedAt: new Date(),
        };
      }
      throw error;
    }
  }

  /**
   * Check if the generated copy contains required disclosures.
   */
  validateDisclosures(
    copy: OptimizedListingCopy,
    marketId: string,
    hasBrokerFee: boolean
  ): ComplianceViolation[] {
    const violations: ComplianceViolation[] = [];

    // NYC-specific checks
    if (marketId.toLowerCase().includes('nyc') || marketId.toLowerCase().includes('new_york')) {
      if (hasBrokerFee && !copy.disclosureText?.toLowerCase().includes('broker fee')) {
        violations.push({
          code: 'DISCLOSURE_MISSING_BROKER_FEE',
          message: 'NYC listings with broker fees must include broker fee disclosure',
          severity: 'critical',
          field: 'disclosureText',
        });
      }
    }

    return violations;
  }
}
