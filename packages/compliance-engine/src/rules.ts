/**
 * Compliance Rules
 *
 * Individual rule implementations for each compliance requirement.
 */

import { getCPIProvider } from './providers';
import type {
  Violation,
  RecommendedFix,
  MarketPack,
  FCHAStage,
  ICPIProvider,
} from './types';

// ============================================================================
// Rule Result Type
// ============================================================================

export interface RuleResult {
  violations: Violation[];
  fixes: RecommendedFix[];
}

// ============================================================================
// FARE Act Rules
// ============================================================================

export interface FAREActCheckInput {
  hasBrokerFee: boolean;
  brokerFeeAmount?: number;
  monthlyRent: number;
  incomeRequirementMultiplier?: number;
  creditScoreThreshold?: number;
  listingInitiatedBy?: 'landlord' | 'tenant' | 'agent';
}

export function checkFAREActRules(
  input: FAREActCheckInput,
  pack: MarketPack
): RuleResult {
  const violations: Violation[] = [];
  const fixes: RecommendedFix[] = [];

  const fareRules = pack.rules.fareAct;
  if (!fareRules?.enabled) {
    return { violations, fixes };
  }

  const brokerRules = pack.rules.brokerFee;

  // Check broker fee prohibition
  if (input.hasBrokerFee && brokerRules.paidBy === 'landlord') {
    violations.push({
      code: 'FARE_BROKER_FEE_PROHIBITED',
      message: 'FARE Act prohibits requiring tenant to pay broker fee',
      severity: 'critical',
      evidence: {
        hasBrokerFee: input.hasBrokerFee,
        brokerFeeAmount: input.brokerFeeAmount,
        rule: 'NYC Admin Code § 26-3101',
      },
      ruleReference: 'FARE Act - Broker Fee Prohibition',
      documentationUrl: 'https://legistar.council.nyc.gov/LegislationDetail.aspx?ID=6454633',
    });
    fixes.push({
      action: 'remove_broker_fee',
      description: 'Remove broker fee requirement from listing or assign to landlord',
      autoFixAvailable: true,
      autoFixAction: 'set_broker_fee_to_zero',
      priority: 'critical',
    });
  }

  // Check income requirement
  if (
    fareRules.maxIncomeRequirementMultiplier &&
    input.incomeRequirementMultiplier &&
    input.incomeRequirementMultiplier > fareRules.maxIncomeRequirementMultiplier
  ) {
    violations.push({
      code: 'FARE_INCOME_REQUIREMENT_EXCESSIVE',
      message: `Income requirement (${input.incomeRequirementMultiplier}x) exceeds FARE Act maximum (${fareRules.maxIncomeRequirementMultiplier}x)`,
      severity: 'violation',
      evidence: {
        required: input.incomeRequirementMultiplier,
        maximum: fareRules.maxIncomeRequirementMultiplier,
        monthlyRent: input.monthlyRent,
      },
    });
    fixes.push({
      action: 'reduce_income_requirement',
      description: `Reduce income requirement to ${fareRules.maxIncomeRequirementMultiplier}x rent or less`,
      autoFixAvailable: true,
      autoFixAction: `set_income_requirement_${fareRules.maxIncomeRequirementMultiplier}`,
      priority: 'high',
    });
  }

  // Check credit score threshold
  if (
    fareRules.maxCreditScoreThreshold &&
    input.creditScoreThreshold &&
    input.creditScoreThreshold > fareRules.maxCreditScoreThreshold
  ) {
    violations.push({
      code: 'FARE_CREDIT_SCORE_THRESHOLD_EXCESSIVE',
      message: `Credit score requirement (${input.creditScoreThreshold}) exceeds FARE Act maximum (${fareRules.maxCreditScoreThreshold})`,
      severity: 'violation',
      evidence: {
        required: input.creditScoreThreshold,
        maximum: fareRules.maxCreditScoreThreshold,
      },
    });
    fixes.push({
      action: 'reduce_credit_score_requirement',
      description: `Reduce credit score requirement to ${fareRules.maxCreditScoreThreshold} or less`,
      autoFixAvailable: true,
      autoFixAction: `set_credit_score_${fareRules.maxCreditScoreThreshold}`,
      priority: 'high',
    });
  }

  return { violations, fixes };
}

// ============================================================================
// FCHA (Fair Chance Housing Act) Rules
// ============================================================================

export interface FCHACheckInput {
  currentStage: FCHAStage;
  attemptedAction: 'criminal_background_check' | 'credit_check' | 'eviction_history' | 'stage_transition';
  targetStage?: FCHAStage;
  stageHistory?: FCHAStage[];
}

export function checkFCHARules(
  input: FCHACheckInput,
  pack: MarketPack
): RuleResult {
  const violations: Violation[] = [];
  const fixes: RecommendedFix[] = [];

  const fchaRules = pack.rules.fcha;
  if (!fchaRules?.enabled) {
    return { violations, fixes };
  }

  // Check prohibited actions before conditional offer
  if (
    input.attemptedAction !== 'stage_transition' &&
    fchaRules.prohibitedBeforeConditionalOffer.includes(input.attemptedAction as any)
  ) {
    const conditionalOfferIndex = fchaRules.stageOrder.indexOf('conditional_offer');
    const currentStageIndex = fchaRules.stageOrder.indexOf(input.currentStage);

    if (currentStageIndex < conditionalOfferIndex) {
      const actionLabel = input.attemptedAction.replace(/_/g, ' ');
      violations.push({
        code: 'FCHA_CRIMINAL_CHECK_BEFORE_OFFER',
        message: `${actionLabel} is prohibited before conditional offer under FCHA`,
        severity: 'critical',
        evidence: {
          attemptedAction: input.attemptedAction,
          currentStage: input.currentStage,
          requiredStage: 'conditional_offer',
        },
        ruleReference: 'Fair Chance Housing Act - NYC Admin Code § 8-107',
      });
      fixes.push({
        action: 'defer_check',
        description: `Wait until after conditional offer to perform ${actionLabel}`,
        autoFixAvailable: false,
        priority: 'critical',
      });
    }
  }

  // Check stage order on transition
  if (input.attemptedAction === 'stage_transition' && input.targetStage) {
    const currentIndex = fchaRules.stageOrder.indexOf(input.currentStage);
    const targetIndex = fchaRules.stageOrder.indexOf(input.targetStage);

    // Can only move forward one stage at a time, or back any number
    if (targetIndex > currentIndex + 1) {
      violations.push({
        code: 'FCHA_STAGE_ORDER_VIOLATION',
        message: `Cannot skip from ${input.currentStage} to ${input.targetStage}`,
        severity: 'critical',
        evidence: {
          currentStage: input.currentStage,
          attemptedStage: input.targetStage,
          stageOrder: fchaRules.stageOrder,
        },
      });
      fixes.push({
        action: 'follow_stage_order',
        description: `Progress through stages in order: ${fchaRules.stageOrder.join(' → ')}`,
        autoFixAvailable: false,
        priority: 'high',
      });
    }
  }

  return { violations, fixes };
}

// ============================================================================
// Good Cause Eviction Rules
// ============================================================================

export interface GoodCauseCheckInput {
  checkType: 'rent_increase' | 'eviction';
  currentRent?: number;
  proposedRent?: number;
  evictionReason?: string;
  noticeDays?: number;
  leaseEndDate?: string;
}

export async function checkGoodCauseRules(
  input: GoodCauseCheckInput,
  pack: MarketPack,
  cpiProvider?: ICPIProvider
): Promise<RuleResult> {
  const violations: Violation[] = [];
  const fixes: RecommendedFix[] = [];

  const goodCauseRules = pack.rules.goodCause;
  if (!goodCauseRules?.enabled) {
    return { violations, fixes };
  }

  // Rent increase check
  if (input.checkType === 'rent_increase' && input.currentRent && input.proposedRent) {
    const provider = cpiProvider || getCPIProvider();
    const { percentage: cpiChange, isFallback } = await provider.getAnnualCPIChange('nyc');

    const maxAllowedIncrease = cpiChange + (goodCauseRules.maxRentIncreaseOverCPI || 5);
    const actualIncreasePercent = ((input.proposedRent - input.currentRent) / input.currentRent) * 100;

    // Log if fallback was used
    if (isFallback) {
      violations.push({
        code: 'GOOD_CAUSE_CPI_FALLBACK_USED',
        message: `CPI data unavailable, using fallback value of ${cpiChange}%`,
        severity: 'info',
        evidence: {
          cpiUsed: cpiChange,
          isFallback: true,
          source: 'fallback_deterministic',
        },
      });
    }

    if (actualIncreasePercent > maxAllowedIncrease) {
      violations.push({
        code: 'GOOD_CAUSE_RENT_INCREASE_EXCESSIVE',
        message: `Rent increase of ${actualIncreasePercent.toFixed(1)}% exceeds Good Cause maximum of ${maxAllowedIncrease.toFixed(1)}% (CPI ${cpiChange}% + ${goodCauseRules.maxRentIncreaseOverCPI}%)`,
        severity: 'critical',
        evidence: {
          currentRent: input.currentRent,
          proposedRent: input.proposedRent,
          actualIncreasePercent: actualIncreasePercent.toFixed(2),
          maxAllowedPercent: maxAllowedIncrease.toFixed(2),
          cpiUsed: cpiChange,
          cpiFallback: isFallback,
        },
      });
      fixes.push({
        action: 'reduce_rent_increase',
        description: `Reduce proposed rent to $${Math.floor(input.currentRent * (1 + maxAllowedIncrease / 100))} or less`,
        autoFixAvailable: true,
        autoFixAction: `set_rent_${Math.floor(input.currentRent * (1 + maxAllowedIncrease / 100))}`,
        priority: 'critical',
      });
    }
  }

  // Eviction reason check
  if (input.checkType === 'eviction' && input.evictionReason) {
    const validReasons = goodCauseRules.validEvictionReasons || [];
    const normalizedReason = input.evictionReason.toLowerCase().replace(/[^a-z]/g, '_');

    if (!validReasons.includes(normalizedReason)) {
      violations.push({
        code: 'GOOD_CAUSE_EVICTION_INVALID_REASON',
        message: `"${input.evictionReason}" is not a valid eviction reason under Good Cause`,
        severity: 'critical',
        evidence: {
          providedReason: input.evictionReason,
          validReasons,
        },
      });
      fixes.push({
        action: 'provide_valid_reason',
        description: `Eviction must be for one of: ${validReasons.join(', ')}`,
        autoFixAvailable: false,
        priority: 'critical',
      });
    }
  }

  // Notice period check
  const rentRules = pack.rules.rentIncrease;
  if (rentRules.noticeRequired && input.noticeDays !== undefined) {
    const requiredNoticeDays = rentRules.noticeDays || 30;
    if (input.noticeDays < requiredNoticeDays) {
      violations.push({
        code: 'GOOD_CAUSE_NOTICE_PERIOD_INSUFFICIENT',
        message: `Notice period of ${input.noticeDays} days is less than required ${requiredNoticeDays} days`,
        severity: 'critical',
        evidence: {
          providedDays: input.noticeDays,
          requiredDays: requiredNoticeDays,
        },
      });
      fixes.push({
        action: 'extend_notice_period',
        description: `Provide at least ${requiredNoticeDays} days notice`,
        autoFixAvailable: false,
        priority: 'high',
      });
    }
  }

  return { violations, fixes };
}

// ============================================================================
// Security Deposit Rules
// ============================================================================

export interface SecurityDepositCheckInput {
  securityDepositAmount: number;
  monthlyRent: number;
}

export function checkSecurityDepositRules(
  input: SecurityDepositCheckInput,
  pack: MarketPack
): RuleResult {
  const violations: Violation[] = [];
  const fixes: RecommendedFix[] = [];

  const depositRules = pack.rules.securityDeposit;
  if (!depositRules.enabled) {
    return { violations, fixes };
  }

  const maxDeposit = input.monthlyRent * depositRules.maxMonths;

  if (input.securityDepositAmount > maxDeposit) {
    violations.push({
      code: 'SECURITY_DEPOSIT_EXCESSIVE',
      message: `Security deposit ($${input.securityDepositAmount}) exceeds maximum of ${depositRules.maxMonths} month(s) rent ($${maxDeposit})`,
      severity: 'critical',
      evidence: {
        depositAmount: input.securityDepositAmount,
        monthlyRent: input.monthlyRent,
        maxMonths: depositRules.maxMonths,
        maxAllowed: maxDeposit,
      },
    });
    fixes.push({
      action: 'reduce_security_deposit',
      description: `Reduce security deposit to $${maxDeposit} or less`,
      autoFixAvailable: true,
      autoFixAction: `set_deposit_${maxDeposit}`,
      priority: 'critical',
    });
  }

  return { violations, fixes };
}

// ============================================================================
// Broker Fee Rules
// ============================================================================

export interface BrokerFeeCheckInput {
  hasBrokerFee: boolean;
  brokerFeeAmount?: number;
  monthlyRent: number;
  paidBy?: 'tenant' | 'landlord';
}

export function checkBrokerFeeRules(
  input: BrokerFeeCheckInput,
  pack: MarketPack
): RuleResult {
  const violations: Violation[] = [];
  const fixes: RecommendedFix[] = [];

  const feeRules = pack.rules.brokerFee;
  if (!feeRules.enabled) {
    return { violations, fixes };
  }

  // Check if tenant is paying when prohibited
  if (input.hasBrokerFee && feeRules.paidBy === 'landlord' && input.paidBy === 'tenant') {
    violations.push({
      code: 'FARE_BROKER_FEE_PROHIBITED',
      message: 'Tenant cannot be required to pay broker fee in this market',
      severity: 'critical',
      evidence: {
        brokerFeeAmount: input.brokerFeeAmount,
        paidBy: input.paidBy,
        marketRule: feeRules.paidBy,
      },
    });
    fixes.push({
      action: 'assign_fee_to_landlord',
      description: 'Broker fee must be paid by landlord',
      autoFixAvailable: true,
      autoFixAction: 'set_broker_fee_landlord',
      priority: 'critical',
    });
  }

  // Check excessive fee amount
  if (
    input.hasBrokerFee &&
    input.brokerFeeAmount &&
    feeRules.maxMultiplier
  ) {
    const maxFee = input.monthlyRent * feeRules.maxMultiplier;
    if (input.brokerFeeAmount > maxFee) {
      violations.push({
        code: 'FARE_BROKER_FEE_EXCESSIVE',
        message: `Broker fee ($${input.brokerFeeAmount}) exceeds maximum of ${feeRules.maxMultiplier} month(s) rent ($${maxFee})`,
        severity: 'violation',
        evidence: {
          feeAmount: input.brokerFeeAmount,
          maxAllowed: maxFee,
          multiplier: feeRules.maxMultiplier,
        },
      });
      fixes.push({
        action: 'reduce_broker_fee',
        description: `Reduce broker fee to $${maxFee} or less`,
        autoFixAvailable: true,
        autoFixAction: `set_broker_fee_${maxFee}`,
        priority: 'high',
      });
    }
  }

  return { violations, fixes };
}

// ============================================================================
// Rent Stabilization Rules
// ============================================================================

export interface RentStabilizationCheckInput {
  isRentStabilized: boolean;
  legalRentAmount?: number;
  preferentialRentAmount?: number;
  proposedRentAmount?: number;
  hasRgbRegistration?: boolean;
}

export function checkRentStabilizationRules(
  input: RentStabilizationCheckInput,
  pack: MarketPack
): RuleResult {
  const violations: Violation[] = [];
  const fixes: RecommendedFix[] = [];

  const rentStabRules = pack.rules.rentStabilization;
  if (!rentStabRules?.enabled || !input.isRentStabilized) {
    return { violations, fixes };
  }

  // Check preferential rent doesn't exceed legal rent
  if (
    input.legalRentAmount &&
    input.preferentialRentAmount &&
    input.preferentialRentAmount > input.legalRentAmount
  ) {
    violations.push({
      code: 'RENT_STAB_PREFERENTIAL_EXCEEDS_LEGAL',
      message: `Preferential rent ($${input.preferentialRentAmount}) cannot exceed legal rent ($${input.legalRentAmount})`,
      severity: 'critical',
      evidence: {
        preferentialRent: input.preferentialRentAmount,
        legalRent: input.legalRentAmount,
      },
    });
    fixes.push({
      action: 'correct_preferential_rent',
      description: `Set preferential rent to $${input.legalRentAmount} or less`,
      autoFixAvailable: true,
      autoFixAction: `set_preferential_${input.legalRentAmount}`,
      priority: 'critical',
    });
  }

  // Check RGB registration
  if (!input.hasRgbRegistration) {
    violations.push({
      code: 'RENT_STAB_REGISTRATION_MISSING',
      message: 'Rent stabilized unit must be registered with RGB',
      severity: 'violation',
      evidence: {
        isRentStabilized: true,
        hasRegistration: false,
      },
      documentationUrl: rentStabRules.rgbBoardUrl,
    });
    fixes.push({
      action: 'register_with_rgb',
      description: 'Register unit with NYC Rent Guidelines Board',
      autoFixAvailable: false,
      priority: 'high',
    });
  }

  return { violations, fixes };
}

// ============================================================================
// Disclosure Rules
// ============================================================================

export interface DisclosureCheckInput {
  entityType: 'listing' | 'application' | 'lease' | 'move_in';
  deliveredDisclosures: string[];
  acknowledgedDisclosures: string[];
}

export function checkDisclosureRules(
  input: DisclosureCheckInput,
  pack: MarketPack
): RuleResult {
  const violations: Violation[] = [];
  const fixes: RecommendedFix[] = [];

  // Map entity types to required disclosure phases
  const entityToPhaseMap: Record<string, string[]> = {
    'listing': ['listing_publish'],
    'application': ['application'],
    'lease': ['lease_signing'],
    'move_in': ['move_in'],
  };

  const phases = entityToPhaseMap[input.entityType] || [];

  const requiredDisclosures = pack.rules.disclosures.filter(
    (d) => phases.includes(d.requiredBefore)
  );

  for (const disclosure of requiredDisclosures) {
    if (!input.deliveredDisclosures.includes(disclosure.type)) {
      violations.push({
        code: 'DISCLOSURE_NOT_DELIVERED',
        message: `Required disclosure "${disclosure.type}" has not been delivered`,
        severity: 'critical',
        evidence: {
          disclosureType: disclosure.type,
          requiredBefore: disclosure.requiredBefore,
        },
      });
      fixes.push({
        action: 'deliver_disclosure',
        description: `Deliver ${disclosure.type} disclosure before proceeding`,
        autoFixAvailable: false,
        priority: 'critical',
      });
    } else if (
      disclosure.signatureRequired &&
      !input.acknowledgedDisclosures.includes(disclosure.type)
    ) {
      violations.push({
        code: 'DISCLOSURE_NOT_ACKNOWLEDGED',
        message: `Required disclosure "${disclosure.type}" has not been acknowledged/signed`,
        severity: 'violation',
        evidence: {
          disclosureType: disclosure.type,
          signatureRequired: true,
          delivered: true,
          acknowledged: false,
        },
      });
      fixes.push({
        action: 'obtain_acknowledgment',
        description: `Obtain signature/acknowledgment for ${disclosure.type} disclosure`,
        autoFixAvailable: false,
        priority: 'high',
      });
    }
  }

  return { violations, fixes };
}

// ============================================================================
// GDPR Rules (UK)
// ============================================================================

export interface GDPRCheckInput {
  checkType: 'consent' | 'data_retention' | 'privacy_notice' | 'data_subject_request' | 'redaction';
  hasConsent?: boolean;
  consentDate?: string;
  dataCreatedAt?: string;
  hasPrivacyNotice?: boolean;
  requestReceivedAt?: string;
  requestResolvedAt?: string;
  personalDataFields?: string[];
  lawfulBasis?: string;
}

export function checkGDPRRules(
  input: GDPRCheckInput,
  pack: MarketPack
): RuleResult {
  const violations: Violation[] = [];
  const fixes: RecommendedFix[] = [];

  const gdprRules = pack.rules.gdpr;
  if (!gdprRules?.enabled) {
    return { violations, fixes };
  }

  // Check consent
  if (input.checkType === 'consent' && gdprRules.consentRequired) {
    if (!input.hasConsent) {
      violations.push({
        code: 'GDPR_CONSENT_MISSING',
        message: 'GDPR requires explicit consent for personal data processing',
        severity: 'critical',
        evidence: {
          consentRequired: true,
          hasConsent: false,
        },
        ruleReference: 'UK GDPR Article 6 - Lawfulness of processing',
      });
      fixes.push({
        action: 'obtain_consent',
        description: 'Obtain explicit consent from the data subject before processing',
        autoFixAvailable: false,
        priority: 'critical',
      });
    }

    if (!input.lawfulBasis) {
      violations.push({
        code: 'GDPR_LAWFUL_BASIS_MISSING',
        message: 'No lawful basis specified for data processing',
        severity: 'critical',
        evidence: {
          validBases: gdprRules.lawfulBases,
        },
        ruleReference: 'UK GDPR Article 6 - Lawful basis',
      });
      fixes.push({
        action: 'specify_lawful_basis',
        description: `Specify lawful basis for processing: ${gdprRules.lawfulBases.join(', ')}`,
        autoFixAvailable: false,
        priority: 'critical',
      });
    }
  }

  // Check data retention
  if (input.checkType === 'data_retention' && input.dataCreatedAt) {
    const createdAt = new Date(input.dataCreatedAt);
    const now = new Date();
    const daysSinceCreation = Math.floor(
      (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceCreation > gdprRules.dataRetentionDays) {
      violations.push({
        code: 'GDPR_DATA_RETENTION_EXCEEDED',
        message: `Data retention period of ${gdprRules.dataRetentionDays} days exceeded (${daysSinceCreation} days old)`,
        severity: 'violation',
        evidence: {
          dataCreatedAt: input.dataCreatedAt,
          daysSinceCreation,
          maxRetentionDays: gdprRules.dataRetentionDays,
        },
        ruleReference: 'UK GDPR Article 5(1)(e) - Storage limitation',
      });
      fixes.push({
        action: 'delete_or_anonymize_data',
        description: 'Delete or anonymize personal data that has exceeded retention period',
        autoFixAvailable: true,
        autoFixAction: 'anonymize_data',
        priority: 'high',
      });
    }
  }

  // Check privacy notice
  if (input.checkType === 'privacy_notice' && gdprRules.privacyNoticeRequired) {
    if (!input.hasPrivacyNotice) {
      violations.push({
        code: 'GDPR_PRIVACY_NOTICE_MISSING',
        message: 'Privacy notice must be provided to data subjects',
        severity: 'critical',
        evidence: {
          privacyNoticeRequired: true,
          hasPrivacyNotice: false,
        },
        ruleReference: 'UK GDPR Articles 13 & 14 - Information to be provided',
      });
      fixes.push({
        action: 'provide_privacy_notice',
        description: 'Provide privacy notice explaining data collection and processing',
        autoFixAvailable: false,
        priority: 'critical',
      });
    }
  }

  // Check data subject request response time
  if (input.checkType === 'data_subject_request' && input.requestReceivedAt) {
    const receivedAt = new Date(input.requestReceivedAt);
    const now = input.requestResolvedAt ? new Date(input.requestResolvedAt) : new Date();
    const daysSinceRequest = Math.floor(
      (now.getTime() - receivedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceRequest > gdprRules.dataSubjectRequestDays && !input.requestResolvedAt) {
      violations.push({
        code: 'GDPR_DATA_SUBJECT_REQUEST_OVERDUE',
        message: `Data subject request overdue (${daysSinceRequest} days, limit is ${gdprRules.dataSubjectRequestDays} days)`,
        severity: 'critical',
        evidence: {
          requestReceivedAt: input.requestReceivedAt,
          daysSinceRequest,
          maxResponseDays: gdprRules.dataSubjectRequestDays,
        },
        ruleReference: 'UK GDPR Article 12(3) - Time limit for response',
      });
      fixes.push({
        action: 'respond_to_request',
        description: 'Respond to data subject request immediately',
        autoFixAvailable: false,
        priority: 'critical',
      });
    }
  }

  // Check redaction requirements
  if (input.checkType === 'redaction' && gdprRules.redactionPolicies?.enabled) {
    const fieldsToRedact = gdprRules.redactionPolicies.fieldsToRedact || [];
    const unredactedFields = input.personalDataFields?.filter(
      (field) => fieldsToRedact.includes(field)
    ) || [];

    if (unredactedFields.length > 0) {
      violations.push({
        code: 'GDPR_REDACTION_REQUIRED',
        message: `Sensitive personal data fields require redaction: ${unredactedFields.join(', ')}`,
        severity: 'warning',
        evidence: {
          unredactedFields,
          redactionPolicy: gdprRules.redactionPolicies,
        },
        ruleReference: 'UK GDPR Article 5(1)(c) - Data minimisation',
      });
      fixes.push({
        action: 'redact_sensitive_fields',
        description: `Redact sensitive fields: ${unredactedFields.join(', ')}`,
        autoFixAvailable: true,
        autoFixAction: 'auto_redact_fields',
        priority: 'medium',
      });
    }
  }

  return { violations, fixes };
}
