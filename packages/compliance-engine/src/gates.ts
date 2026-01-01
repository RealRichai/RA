/**
 * Compliance Gates
 *
 * Enforcement gates that block operations when compliance requirements aren't met.
 */

import {
  validateTransition,
  validateBackgroundCheck,
  type FCHATransitionRequest,
  type FCHABackgroundCheckRequest,
} from './fcha-state-machine';
import { getMarketPack, getMarketPackVersion, getMarketPackIdFromMarket } from './market-packs';
import {
  checkFAREActRules,
  checkSecurityDepositRules,
  checkBrokerFeeRules,
  checkDisclosureRules,
  checkFCHARules,
  checkGoodCauseRules,
  checkRentStabilizationRules,
} from './rules';
import type {
  ComplianceDecision,
  GateResult,
  Violation,
  RecommendedFix,
  FCHAStage,
  FCHAWorkflowState,
  FCHATransitionEvidence,
} from './types';

const POLICY_VERSION = '1.0.0';

// ============================================================================
// Gate: Listing Publish (DRAFT -> ACTIVE)
// ============================================================================

export interface ListingPublishInput {
  listingId: string;
  marketId: string;
  status: string;
  hasBrokerFee: boolean;
  brokerFeeAmount?: number;
  brokerFeePaidBy?: 'tenant' | 'landlord';
  /** Who the broker/agent represents - critical for FARE Act */
  agentRepresentation?: 'landlord' | 'tenant' | 'dual' | 'none';
  monthlyRent: number;
  securityDepositAmount?: number;
  incomeRequirementMultiplier?: number;
  creditScoreThreshold?: number;
  deliveredDisclosures: string[];
  acknowledgedDisclosures: string[];
  /** Fee disclosure for FARE Act compliance */
  feeDisclosure?: {
    disclosed: boolean;
    disclosedFees: Array<{
      type: string;
      amount: number;
      paidBy: 'tenant' | 'landlord';
    }>;
  };
}

export async function gateListingPublish(input: ListingPublishInput): Promise<GateResult> {
  const marketPackId = getMarketPackIdFromMarket(input.marketId);
  const pack = getMarketPack(marketPackId);
  const violations: Violation[] = [];
  const fixes: RecommendedFix[] = [];
  const checksPerformed: string[] = [];

  // Check FARE Act compliance (NYC-specific)
  if (pack.rules.fareAct?.enabled) {
    checksPerformed.push('fare_act');
    const fareResult = checkFAREActRules(
      {
        hasBrokerFee: input.hasBrokerFee,
        brokerFeeAmount: input.brokerFeeAmount,
        brokerFeePaidBy: input.brokerFeePaidBy,
        agentRepresentation: input.agentRepresentation,
        monthlyRent: input.monthlyRent,
        incomeRequirementMultiplier: input.incomeRequirementMultiplier,
        creditScoreThreshold: input.creditScoreThreshold,
        feeDisclosure: input.feeDisclosure,
        context: 'listing_publish',
      },
      pack
    );
    violations.push(...fareResult.violations);
    fixes.push(...fareResult.fixes);
  }

  // Check broker fee rules
  if (pack.rules.brokerFee.enabled) {
    checksPerformed.push('broker_fee');
    const brokerResult = checkBrokerFeeRules(
      {
        hasBrokerFee: input.hasBrokerFee,
        brokerFeeAmount: input.brokerFeeAmount,
        monthlyRent: input.monthlyRent,
        paidBy: input.brokerFeePaidBy,
      },
      pack
    );
    violations.push(...brokerResult.violations);
    fixes.push(...brokerResult.fixes);
  }

  // Check security deposit rules
  if (pack.rules.securityDeposit.enabled && input.securityDepositAmount) {
    checksPerformed.push('security_deposit');
    const depositResult = checkSecurityDepositRules(
      {
        securityDepositAmount: input.securityDepositAmount,
        monthlyRent: input.monthlyRent,
      },
      pack
    );
    violations.push(...depositResult.violations);
    fixes.push(...depositResult.fixes);
  }

  // Check required disclosures for listing publish
  checksPerformed.push('disclosures');
  const disclosureResult = checkDisclosureRules(
    {
      entityType: 'listing',
      deliveredDisclosures: input.deliveredDisclosures,
      acknowledgedDisclosures: input.acknowledgedDisclosures,
    },
    pack
  );
  violations.push(...disclosureResult.violations);
  fixes.push(...disclosureResult.fixes);

  // Build decision
  const criticalViolations = violations.filter((v) => v.severity === 'critical');
  const passed = criticalViolations.length === 0;

  const decision: ComplianceDecision = {
    passed,
    violations,
    recommendedFixes: fixes,
    policyVersion: POLICY_VERSION,
    marketPack: pack.id,
    marketPackVersion: getMarketPackVersion(pack),
    checkedAt: new Date().toISOString(),
    checksPerformed,
    metadata: {
      listingId: input.listingId,
      transitionAttempted: 'DRAFT_TO_ACTIVE',
    },
  };

  return {
    allowed: passed,
    decision,
    blockedReason: passed
      ? undefined
      : `Listing cannot be published: ${criticalViolations.map((v) => v.message).join('; ')}`,
  };
}

// ============================================================================
// Gate: Broker Fee Change
// ============================================================================

export interface BrokerFeeChangeInput {
  entityId: string;
  entityType: 'listing' | 'lease';
  marketId: string;
  previousBrokerFee?: number;
  newBrokerFee: number;
  paidBy: 'tenant' | 'landlord';
  monthlyRent: number;
}

export async function gateBrokerFeeChange(input: BrokerFeeChangeInput): Promise<GateResult> {
  const marketPackId = getMarketPackIdFromMarket(input.marketId);
  const pack = getMarketPack(marketPackId);
  const checksPerformed: string[] = ['broker_fee'];

  const result = checkBrokerFeeRules(
    {
      hasBrokerFee: input.newBrokerFee > 0,
      brokerFeeAmount: input.newBrokerFee,
      monthlyRent: input.monthlyRent,
      paidBy: input.paidBy,
    },
    pack
  );

  const criticalViolations = result.violations.filter((v) => v.severity === 'critical');
  const passed = criticalViolations.length === 0;

  const decision: ComplianceDecision = {
    passed,
    violations: result.violations,
    recommendedFixes: result.fixes,
    policyVersion: POLICY_VERSION,
    marketPack: pack.id,
    marketPackVersion: getMarketPackVersion(pack),
    checkedAt: new Date().toISOString(),
    checksPerformed,
    metadata: {
      entityId: input.entityId,
      entityType: input.entityType,
      previousBrokerFee: input.previousBrokerFee,
      newBrokerFee: input.newBrokerFee,
    },
  };

  return {
    allowed: passed,
    decision,
    blockedReason: passed
      ? undefined
      : `Broker fee change blocked: ${criticalViolations.map((v) => v.message).join('; ')}`,
  };
}

// ============================================================================
// Gate: Security Deposit Change
// ============================================================================

export interface SecurityDepositChangeInput {
  entityId: string;
  entityType: 'listing' | 'lease';
  marketId: string;
  previousDeposit?: number;
  newDeposit: number;
  monthlyRent: number;
}

export async function gateSecurityDepositChange(
  input: SecurityDepositChangeInput
): Promise<GateResult> {
  const marketPackId = getMarketPackIdFromMarket(input.marketId);
  const pack = getMarketPack(marketPackId);
  const checksPerformed: string[] = ['security_deposit'];

  const result = checkSecurityDepositRules(
    {
      securityDepositAmount: input.newDeposit,
      monthlyRent: input.monthlyRent,
    },
    pack
  );

  const criticalViolations = result.violations.filter((v) => v.severity === 'critical');
  const passed = criticalViolations.length === 0;

  const decision: ComplianceDecision = {
    passed,
    violations: result.violations,
    recommendedFixes: result.fixes,
    policyVersion: POLICY_VERSION,
    marketPack: pack.id,
    marketPackVersion: getMarketPackVersion(pack),
    checkedAt: new Date().toISOString(),
    checksPerformed,
    metadata: {
      entityId: input.entityId,
      entityType: input.entityType,
      previousDeposit: input.previousDeposit,
      newDeposit: input.newDeposit,
    },
  };

  return {
    allowed: passed,
    decision,
    blockedReason: passed
      ? undefined
      : `Security deposit change blocked: ${criticalViolations.map((v) => v.message).join('; ')}`,
  };
}

// ============================================================================
// Gate: Rent Increase (Good Cause)
// ============================================================================

export interface RentIncreaseInput {
  leaseId: string;
  marketId: string;
  currentRent: number;
  proposedRent: number;
  noticeDays: number;
}

export async function gateRentIncrease(input: RentIncreaseInput): Promise<GateResult> {
  const marketPackId = getMarketPackIdFromMarket(input.marketId);
  const pack = getMarketPack(marketPackId);
  const checksPerformed: string[] = ['good_cause', 'rent_increase'];

  const result = await checkGoodCauseRules(
    {
      checkType: 'rent_increase',
      currentRent: input.currentRent,
      proposedRent: input.proposedRent,
      noticeDays: input.noticeDays,
    },
    pack
  );

  const criticalViolations = result.violations.filter((v) => v.severity === 'critical');
  const passed = criticalViolations.length === 0;

  const decision: ComplianceDecision = {
    passed,
    violations: result.violations,
    recommendedFixes: result.fixes,
    policyVersion: POLICY_VERSION,
    marketPack: pack.id,
    marketPackVersion: getMarketPackVersion(pack),
    checkedAt: new Date().toISOString(),
    checksPerformed,
    metadata: {
      leaseId: input.leaseId,
      currentRent: input.currentRent,
      proposedRent: input.proposedRent,
      increasePercent: ((input.proposedRent - input.currentRent) / input.currentRent * 100).toFixed(2),
    },
  };

  return {
    allowed: passed,
    decision,
    blockedReason: passed
      ? undefined
      : `Rent increase blocked: ${criticalViolations.map((v) => v.message).join('; ')}`,
  };
}

// ============================================================================
// Gate: FCHA Stage Transition
// ============================================================================

export interface FCHAStageTransitionInput {
  applicationId: string;
  marketId: string;
  currentStage: FCHAStage;
  targetStage: FCHAStage;
  stageHistory?: FCHAStage[];
}

export async function gateFCHAStageTransition(
  input: FCHAStageTransitionInput
): Promise<GateResult> {
  const marketPackId = getMarketPackIdFromMarket(input.marketId);
  const pack = getMarketPack(marketPackId);
  const checksPerformed: string[] = ['fcha_stage'];

  const result = checkFCHARules(
    {
      currentStage: input.currentStage,
      attemptedAction: 'stage_transition',
      targetStage: input.targetStage,
      stageHistory: input.stageHistory,
    },
    pack
  );

  const criticalViolations = result.violations.filter((v) => v.severity === 'critical');
  const passed = criticalViolations.length === 0;

  const decision: ComplianceDecision = {
    passed,
    violations: result.violations,
    recommendedFixes: result.fixes,
    policyVersion: POLICY_VERSION,
    marketPack: pack.id,
    marketPackVersion: getMarketPackVersion(pack),
    checkedAt: new Date().toISOString(),
    checksPerformed,
    metadata: {
      applicationId: input.applicationId,
      currentStage: input.currentStage,
      targetStage: input.targetStage,
    },
  };

  return {
    allowed: passed,
    decision,
    blockedReason: passed
      ? undefined
      : `Stage transition blocked: ${criticalViolations.map((v) => v.message).join('; ')}`,
  };
}

// ============================================================================
// Gate: FCHA Background Check
// ============================================================================

export interface FCHABackgroundCheckInput {
  applicationId: string;
  marketId: string;
  currentStage: FCHAStage;
  checkType: 'criminal_background_check' | 'credit_check' | 'eviction_history';
}

export async function gateFCHABackgroundCheck(
  input: FCHABackgroundCheckInput
): Promise<GateResult> {
  const marketPackId = getMarketPackIdFromMarket(input.marketId);
  const pack = getMarketPack(marketPackId);
  const checksPerformed: string[] = ['fcha_check'];

  const result = checkFCHARules(
    {
      currentStage: input.currentStage,
      attemptedAction: input.checkType,
    },
    pack
  );

  const criticalViolations = result.violations.filter((v) => v.severity === 'critical');
  const passed = criticalViolations.length === 0;

  const decision: ComplianceDecision = {
    passed,
    violations: result.violations,
    recommendedFixes: result.fixes,
    policyVersion: POLICY_VERSION,
    marketPack: pack.id,
    marketPackVersion: getMarketPackVersion(pack),
    checkedAt: new Date().toISOString(),
    checksPerformed,
    metadata: {
      applicationId: input.applicationId,
      currentStage: input.currentStage,
      attemptedCheck: input.checkType,
    },
  };

  return {
    allowed: passed,
    decision,
    blockedReason: passed
      ? undefined
      : `Background check blocked: ${criticalViolations.map((v) => v.message).join('; ')}`,
  };
}

// ============================================================================
// Gate: FCHA Workflow State Transition (Enhanced)
// ============================================================================

export interface FCHAWorkflowTransitionInput {
  applicationId: string;
  marketId: string;
  currentState: FCHAWorkflowState;
  targetState: FCHAWorkflowState;
  actorId: string;
  actorType: 'system' | 'user' | 'agent';
  conditionalOfferDetails?: {
    unitId: string;
    offerLetterDelivered: boolean;
    deliveryMethod: 'email' | 'mail' | 'in_app' | 'hand_delivered';
  };
  backgroundCheckAuthorization?: {
    authorizationSigned: boolean;
    signedAt: string;
  };
  adverseInfoDetails?: {
    adverseInfoFound: boolean;
    adverseInfoSummary?: string;
    noticeDelivered: boolean;
  };
  finalDecision?: {
    decision: 'approved' | 'denied';
    rationale: string;
    article23AFactorsConsidered?: string[];
  };
  prequalificationResults?: {
    incomeVerified: boolean;
    creditCheckPassed: boolean;
    rentalHistoryVerified: boolean;
    employmentVerified: boolean;
  };
}

export interface FCHAWorkflowGateResult extends GateResult {
  evidence?: FCHATransitionEvidence;
}

export async function gateFCHAWorkflowTransition(
  input: FCHAWorkflowTransitionInput
): Promise<FCHAWorkflowGateResult> {
  const marketPackId = getMarketPackIdFromMarket(input.marketId);
  const pack = getMarketPack(marketPackId);
  const checksPerformed: string[] = ['fcha_workflow'];
  const timestamp = new Date().toISOString();

  const transitionRequest: FCHATransitionRequest = {
    applicationId: input.applicationId,
    currentState: input.currentState,
    targetState: input.targetState,
    actorId: input.actorId,
    actorType: input.actorType,
    conditionalOfferDetails: input.conditionalOfferDetails,
    backgroundCheckAuthorization: input.backgroundCheckAuthorization,
    adverseInfoDetails: input.adverseInfoDetails,
    finalDecision: input.finalDecision,
    prequalificationResults: input.prequalificationResults,
    timestamp,
  };

  const result = validateTransition(transitionRequest, pack);

  const criticalViolations = result.violations.filter((v) => v.severity === 'critical');
  const passed = criticalViolations.length === 0;

  const decision: ComplianceDecision = {
    passed,
    violations: result.violations,
    recommendedFixes: result.fixes,
    policyVersion: POLICY_VERSION,
    marketPack: pack.id,
    marketPackVersion: getMarketPackVersion(pack),
    checkedAt: timestamp,
    checksPerformed,
    metadata: {
      applicationId: input.applicationId,
      fromState: input.currentState,
      toState: input.targetState,
      action: 'fcha_workflow_transition',
      transitionId: result.evidence?.transitionId,
      fchaEnforced: pack.rules.fcha?.enabled ?? false,
    },
  };

  return {
    allowed: passed,
    decision,
    evidence: result.evidence,
    blockedReason: passed
      ? undefined
      : `FCHA workflow transition blocked: ${criticalViolations.map((v) => v.message).join('; ')}`,
  };
}

// ============================================================================
// Gate: FCHA Criminal Background Check Request
// ============================================================================

export interface FCHACriminalCheckGateInput {
  applicationId: string;
  marketId: string;
  currentState: FCHAWorkflowState;
  checkType: string;
  actorId: string;
}

export async function gateFCHACriminalCheck(
  input: FCHACriminalCheckGateInput
): Promise<GateResult> {
  const marketPackId = getMarketPackIdFromMarket(input.marketId);
  const pack = getMarketPack(marketPackId);
  const checksPerformed: string[] = ['fcha_criminal_check'];
  const timestamp = new Date().toISOString();

  const checkRequest: FCHABackgroundCheckRequest = {
    applicationId: input.applicationId,
    currentState: input.currentState,
    checkType: input.checkType,
    actorId: input.actorId,
    timestamp,
  };

  const result = validateBackgroundCheck(checkRequest, pack);

  const criticalViolations = result.violations.filter((v) => v.severity === 'critical');
  const passed = criticalViolations.length === 0;

  const decision: ComplianceDecision = {
    passed,
    violations: result.violations,
    recommendedFixes: result.fixes,
    policyVersion: POLICY_VERSION,
    marketPack: pack.id,
    marketPackVersion: getMarketPackVersion(pack),
    checkedAt: timestamp,
    checksPerformed,
    metadata: {
      applicationId: input.applicationId,
      currentState: input.currentState,
      checkType: input.checkType,
      action: 'fcha_criminal_check_request',
      fchaEnforced: pack.rules.fcha?.enabled ?? false,
    },
  };

  return {
    allowed: passed,
    decision,
    blockedReason: passed
      ? undefined
      : result.blockedReason || `Criminal background check blocked: ${criticalViolations.map((v) => v.message).join('; ')}`,
  };
}

// ============================================================================
// Gate: Disclosure Requirement
// ============================================================================

export interface DisclosureGateInput {
  entityId: string;
  entityType: 'listing' | 'application' | 'lease' | 'move_in';
  marketId: string;
  action: string;
  deliveredDisclosures: string[];
  acknowledgedDisclosures: string[];
}

export async function gateDisclosureRequirement(
  input: DisclosureGateInput
): Promise<GateResult> {
  const marketPackId = getMarketPackIdFromMarket(input.marketId);
  const pack = getMarketPack(marketPackId);
  const checksPerformed: string[] = ['disclosures'];

  const result = checkDisclosureRules(
    {
      entityType: input.entityType,
      deliveredDisclosures: input.deliveredDisclosures,
      acknowledgedDisclosures: input.acknowledgedDisclosures,
    },
    pack
  );

  const criticalViolations = result.violations.filter((v) => v.severity === 'critical');
  const passed = criticalViolations.length === 0;

  const decision: ComplianceDecision = {
    passed,
    violations: result.violations,
    recommendedFixes: result.fixes,
    policyVersion: POLICY_VERSION,
    marketPack: pack.id,
    marketPackVersion: getMarketPackVersion(pack),
    checkedAt: new Date().toISOString(),
    checksPerformed,
    metadata: {
      entityId: input.entityId,
      entityType: input.entityType,
      action: input.action,
      deliveredCount: input.deliveredDisclosures.length,
      acknowledgedCount: input.acknowledgedDisclosures.length,
    },
  };

  return {
    allowed: passed,
    decision,
    blockedReason: passed
      ? undefined
      : `Action blocked - missing disclosures: ${criticalViolations.map((v) => v.message).join('; ')}`,
  };
}

// ============================================================================
// Gate: Lease Creation/Signing
// ============================================================================

export interface LeaseSigningInput {
  leaseId: string;
  marketId: string;
  monthlyRent: number;
  securityDepositAmount?: number;
  isRentStabilized: boolean;
  legalRentAmount?: number;
  preferentialRentAmount?: number;
  deliveredDisclosures: string[];
  acknowledgedDisclosures: string[];
  /** FARE Act compliance fields */
  hasBrokerFee?: boolean;
  brokerFeeAmount?: number;
  brokerFeePaidBy?: 'tenant' | 'landlord';
  agentRepresentation?: 'landlord' | 'tenant' | 'dual' | 'none';
  feeDisclosure?: {
    disclosed: boolean;
    disclosedFees: Array<{
      type: string;
      amount: number;
      paidBy: 'tenant' | 'landlord';
    }>;
  };
}

export async function gateLeaseCreation(input: LeaseSigningInput): Promise<GateResult> {
  const marketPackId = getMarketPackIdFromMarket(input.marketId);
  const pack = getMarketPack(marketPackId);
  const violations: Violation[] = [];
  const fixes: RecommendedFix[] = [];
  const checksPerformed: string[] = [];

  // Check FARE Act compliance for lease generation (NYC)
  if (pack.rules.fareAct?.enabled) {
    checksPerformed.push('fare_act');
    const fareResult = checkFAREActRules(
      {
        hasBrokerFee: input.hasBrokerFee ?? false,
        brokerFeeAmount: input.brokerFeeAmount,
        brokerFeePaidBy: input.brokerFeePaidBy,
        agentRepresentation: input.agentRepresentation,
        monthlyRent: input.monthlyRent,
        feeDisclosure: input.feeDisclosure,
        context: 'lease_generation',
      },
      pack
    );
    violations.push(...fareResult.violations);
    fixes.push(...fareResult.fixes);
  }

  // Check security deposit
  if (pack.rules.securityDeposit.enabled && input.securityDepositAmount) {
    checksPerformed.push('security_deposit');
    const depositResult = checkSecurityDepositRules(
      {
        securityDepositAmount: input.securityDepositAmount,
        monthlyRent: input.monthlyRent,
      },
      pack
    );
    violations.push(...depositResult.violations);
    fixes.push(...depositResult.fixes);
  }

  // Check rent stabilization rules
  if (pack.rules.rentStabilization?.enabled && input.isRentStabilized) {
    checksPerformed.push('rent_stabilization');
    const rentStabResult = checkRentStabilizationRules(
      {
        isRentStabilized: input.isRentStabilized,
        legalRentAmount: input.legalRentAmount,
        preferentialRentAmount: input.preferentialRentAmount,
      },
      pack
    );
    violations.push(...rentStabResult.violations);
    fixes.push(...rentStabResult.fixes);
  }

  // Check disclosures for lease signing
  checksPerformed.push('disclosures');
  const disclosureResult = checkDisclosureRules(
    {
      entityType: 'lease',
      deliveredDisclosures: input.deliveredDisclosures,
      acknowledgedDisclosures: input.acknowledgedDisclosures,
    },
    pack
  );
  violations.push(...disclosureResult.violations);
  fixes.push(...disclosureResult.fixes);

  const criticalViolations = violations.filter((v) => v.severity === 'critical');
  const passed = criticalViolations.length === 0;

  const decision: ComplianceDecision = {
    passed,
    violations,
    recommendedFixes: fixes,
    policyVersion: POLICY_VERSION,
    marketPack: pack.id,
    marketPackVersion: getMarketPackVersion(pack),
    checkedAt: new Date().toISOString(),
    checksPerformed,
    metadata: {
      leaseId: input.leaseId,
      isRentStabilized: input.isRentStabilized,
      fareActEnforced: pack.rules.fareAct?.enabled ?? false,
    },
  };

  return {
    allowed: passed,
    decision,
    blockedReason: passed
      ? undefined
      : `Lease creation blocked: ${criticalViolations.map((v) => v.message).join('; ')}`,
  };
}

// ============================================================================
// Gate: Listing Update
// ============================================================================

export interface ListingUpdateInput extends ListingPublishInput {
  previousState?: {
    hasBrokerFee?: boolean;
    brokerFeeAmount?: number;
    brokerFeePaidBy?: 'tenant' | 'landlord';
    agentRepresentation?: 'landlord' | 'tenant' | 'dual' | 'none';
  };
}

export async function gateListingUpdate(input: ListingUpdateInput): Promise<GateResult> {
  const marketPackId = getMarketPackIdFromMarket(input.marketId);
  const pack = getMarketPack(marketPackId);
  const violations: Violation[] = [];
  const fixes: RecommendedFix[] = [];
  const checksPerformed: string[] = [];

  // Check FARE Act compliance (NYC-specific)
  if (pack.rules.fareAct?.enabled) {
    checksPerformed.push('fare_act');
    const fareResult = checkFAREActRules(
      {
        hasBrokerFee: input.hasBrokerFee,
        brokerFeeAmount: input.brokerFeeAmount,
        brokerFeePaidBy: input.brokerFeePaidBy,
        agentRepresentation: input.agentRepresentation,
        monthlyRent: input.monthlyRent,
        incomeRequirementMultiplier: input.incomeRequirementMultiplier,
        creditScoreThreshold: input.creditScoreThreshold,
        feeDisclosure: input.feeDisclosure,
        context: 'listing_update',
      },
      pack
    );
    violations.push(...fareResult.violations);
    fixes.push(...fareResult.fixes);
  }

  // Check broker fee rules
  if (pack.rules.brokerFee.enabled) {
    checksPerformed.push('broker_fee');
    const brokerResult = checkBrokerFeeRules(
      {
        hasBrokerFee: input.hasBrokerFee,
        brokerFeeAmount: input.brokerFeeAmount,
        monthlyRent: input.monthlyRent,
        paidBy: input.brokerFeePaidBy,
      },
      pack
    );
    violations.push(...brokerResult.violations);
    fixes.push(...brokerResult.fixes);
  }

  // Check security deposit rules
  if (pack.rules.securityDeposit.enabled && input.securityDepositAmount) {
    checksPerformed.push('security_deposit');
    const depositResult = checkSecurityDepositRules(
      {
        securityDepositAmount: input.securityDepositAmount,
        monthlyRent: input.monthlyRent,
      },
      pack
    );
    violations.push(...depositResult.violations);
    fixes.push(...depositResult.fixes);
  }

  const criticalViolations = violations.filter((v) => v.severity === 'critical');
  const passed = criticalViolations.length === 0;

  const decision: ComplianceDecision = {
    passed,
    violations,
    recommendedFixes: fixes,
    policyVersion: POLICY_VERSION,
    marketPack: pack.id,
    marketPackVersion: getMarketPackVersion(pack),
    checkedAt: new Date().toISOString(),
    checksPerformed,
    metadata: {
      listingId: input.listingId,
      action: 'listing_update',
      previousState: input.previousState,
    },
  };

  return {
    allowed: passed,
    decision,
    blockedReason: passed
      ? undefined
      : `Listing update blocked: ${criticalViolations.map((v) => v.message).join('; ')}`,
  };
}
