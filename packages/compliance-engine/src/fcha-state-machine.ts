/**
 * NYC Fair Chance Housing Act (FCHA) State Machine
 *
 * Implements strict workflow enforcement for NYC Fair Chance Housing compliance.
 * Ensures criminal background checks cannot occur before conditional offer.
 */

import type {
  FCHAWorkflowState,
  FCHAWorkflowRecord,
  FCHATransitionEvidence,
  Violation,
  RecommendedFix,
  MarketPack,
} from './types';
import {
  FCHAValidTransitions,
  FCHACriminalCheckTypes,
  FCHAPrequalificationCheckTypes,
} from './types';

// ============================================================================
// State Machine Types
// ============================================================================

export interface FCHATransitionRequest {
  applicationId: string;
  currentState: FCHAWorkflowState;
  targetState: FCHAWorkflowState;
  actorId: string;
  actorType: 'system' | 'user' | 'agent';
  /** Required for CONDITIONAL_OFFER transition */
  conditionalOfferDetails?: {
    unitId: string;
    offerLetterDelivered: boolean;
    deliveryMethod: 'email' | 'mail' | 'in_app' | 'hand_delivered';
  };
  /** Required for BACKGROUND_CHECK_ALLOWED transition */
  backgroundCheckAuthorization?: {
    authorizationSigned: boolean;
    signedAt: string;
  };
  /** Required for INDIVIDUALIZED_ASSESSMENT transition */
  adverseInfoDetails?: {
    adverseInfoFound: boolean;
    adverseInfoSummary?: string;
    noticeDelivered: boolean;
  };
  /** Required for APPROVED/DENIED terminal states */
  finalDecision?: {
    decision: 'approved' | 'denied';
    rationale: string;
    article23AFactorsConsidered?: string[];
  };
  /** Prequalification results for CONDITIONAL_OFFER transition */
  prequalificationResults?: {
    incomeVerified: boolean;
    creditCheckPassed: boolean;
    rentalHistoryVerified: boolean;
    employmentVerified: boolean;
  };
  timestamp?: string;
}

export interface FCHATransitionResult {
  allowed: boolean;
  violations: Violation[];
  fixes: RecommendedFix[];
  evidence?: FCHATransitionEvidence;
  newRecord?: FCHAWorkflowRecord;
  blockedReason?: string;
}

export interface FCHABackgroundCheckRequest {
  applicationId: string;
  currentState: FCHAWorkflowState;
  checkType: string;
  actorId: string;
  timestamp?: string;
}

export interface FCHABackgroundCheckResult {
  allowed: boolean;
  violations: Violation[];
  fixes: RecommendedFix[];
  blockedReason?: string;
}

// ============================================================================
// State Machine Implementation
// ============================================================================

/**
 * Validates if a state transition is allowed
 */
export function isValidTransition(
  fromState: FCHAWorkflowState,
  toState: FCHAWorkflowState
): boolean {
  const validTargets = FCHAValidTransitions[fromState] || [];
  return validTargets.includes(toState);
}

/**
 * Gets all valid next states from current state
 */
export function getValidNextStates(currentState: FCHAWorkflowState): FCHAWorkflowState[] {
  return FCHAValidTransitions[currentState] || [];
}

/**
 * Checks if a state is terminal (no further transitions allowed)
 */
export function isTerminalState(state: FCHAWorkflowState): boolean {
  const validTargets = FCHAValidTransitions[state] || [];
  return validTargets.length === 0;
}

/**
 * Checks if criminal background check is allowed in current state
 */
export function isBackgroundCheckAllowed(currentState: FCHAWorkflowState): boolean {
  return currentState === 'BACKGROUND_CHECK_ALLOWED' ||
         currentState === 'INDIVIDUALIZED_ASSESSMENT';
}

/**
 * Checks if a check type is a criminal background check
 */
export function isCriminalCheck(checkType: string): boolean {
  return FCHACriminalCheckTypes.includes(checkType as any);
}

/**
 * Checks if a check type is allowed during prequalification
 */
export function isPrequalificationCheck(checkType: string): boolean {
  return FCHAPrequalificationCheckTypes.includes(checkType as any);
}

/**
 * Validates a state transition request
 */
export function validateTransition(
  request: FCHATransitionRequest,
  pack: MarketPack
): FCHATransitionResult {
  const violations: Violation[] = [];
  const fixes: RecommendedFix[] = [];
  const timestamp = request.timestamp || new Date().toISOString();

  const fchaRules = pack.rules.fcha;
  if (!fchaRules?.enabled) {
    // FCHA not enabled for this market - allow all transitions
    return { allowed: true, violations, fixes };
  }

  // Check 1: Is the transition valid according to state machine?
  if (!isValidTransition(request.currentState, request.targetState)) {
    violations.push({
      code: 'FCHA_INVALID_STATE_TRANSITION',
      message: `Cannot transition from ${request.currentState} to ${request.targetState}`,
      severity: 'critical',
      evidence: {
        currentState: request.currentState,
        attemptedState: request.targetState,
        validNextStates: getValidNextStates(request.currentState),
        rule: 'NYC Admin Code § 8-107(11-b)',
        rationale: 'Fair Chance Housing requires applications to follow a specific order of evaluation.',
      },
      ruleReference: 'Fair Chance Housing Act - State Machine',
      documentationUrl: 'https://www.nyc.gov/site/cchr/law/fair-chance-housing.page',
    });
    fixes.push({
      action: 'follow_workflow_order',
      description: `Valid next states from ${request.currentState}: ${getValidNextStates(request.currentState).join(', ')}`,
      autoFixAvailable: false,
      priority: 'critical',
    });

    return {
      allowed: false,
      violations,
      fixes,
      blockedReason: `Invalid state transition: ${request.currentState} → ${request.targetState}`,
    };
  }

  // Check 2: Validate transition-specific requirements
  switch (request.targetState) {
    case 'CONDITIONAL_OFFER':
      // Must have completed prequalification
      if (request.prequalificationResults) {
        const allCriteriaMet =
          request.prequalificationResults.incomeVerified &&
          request.prequalificationResults.creditCheckPassed &&
          request.prequalificationResults.rentalHistoryVerified &&
          request.prequalificationResults.employmentVerified;

        if (!allCriteriaMet) {
          violations.push({
            code: 'FCHA_PREQUALIFICATION_INCOMPLETE',
            message: 'Cannot issue conditional offer without completing prequalification criteria',
            severity: 'critical',
            evidence: {
              prequalificationResults: request.prequalificationResults,
              rule: 'NYC Admin Code § 8-107(11-b)(2)',
              rationale: 'A conditional offer can only be made after evaluating all non-criminal eligibility criteria.',
            },
            ruleReference: 'Fair Chance Housing Act - Prequalification',
          });
          fixes.push({
            action: 'complete_prequalification',
            description: 'Complete all prequalification checks before issuing conditional offer',
            autoFixAvailable: false,
            priority: 'critical',
          });
        }
      }

      // Must have conditional offer details
      if (!request.conditionalOfferDetails?.offerLetterDelivered) {
        violations.push({
          code: 'FCHA_NOTICE_NOT_ISSUED',
          message: 'Conditional offer letter must be delivered to applicant',
          severity: 'critical',
          evidence: {
            requiredNotice: 'conditional_offer_letter',
            delivered: request.conditionalOfferDetails?.offerLetterDelivered || false,
            rule: 'NYC Admin Code § 8-107(11-b)(3)',
            rationale: 'A written conditional offer committing a specific unit must be provided before criminal background check.',
          },
          ruleReference: 'Fair Chance Housing Act - Conditional Offer',
        });
        fixes.push({
          action: 'deliver_conditional_offer',
          description: 'Deliver written conditional offer letter specifying the unit being offered',
          autoFixAvailable: false,
          priority: 'critical',
        });
      }
      break;

    case 'BACKGROUND_CHECK_ALLOWED':
      // Must have background check authorization
      if (!request.backgroundCheckAuthorization?.authorizationSigned) {
        violations.push({
          code: 'FCHA_NOTICE_NOT_ISSUED',
          message: 'Background check authorization must be signed by applicant',
          severity: 'critical',
          evidence: {
            requiredNotice: 'background_check_authorization',
            signed: false,
            rule: 'NYC Admin Code § 8-107(11-b)(4)',
          },
          ruleReference: 'Fair Chance Housing Act - Authorization',
        });
        fixes.push({
          action: 'obtain_authorization',
          description: 'Obtain signed authorization from applicant before running criminal background check',
          autoFixAvailable: false,
          priority: 'critical',
        });
      }
      break;

    case 'INDIVIDUALIZED_ASSESSMENT':
      // Must have adverse info details
      if (!request.adverseInfoDetails?.adverseInfoFound) {
        violations.push({
          code: 'FCHA_INDIVIDUALIZED_ASSESSMENT_REQUIRED',
          message: 'Individualized assessment only required when adverse information is found',
          severity: 'warning',
          evidence: {
            adverseInfoFound: request.adverseInfoDetails?.adverseInfoFound || false,
            rule: 'NYC Admin Code § 8-107(11-b)(5)',
          },
        });
      }

      // Must have delivered adverse action notice
      if (request.adverseInfoDetails?.adverseInfoFound && !request.adverseInfoDetails.noticeDelivered) {
        violations.push({
          code: 'FCHA_NOTICE_NOT_ISSUED',
          message: 'Adverse action notice must be delivered to applicant with Article 23-A factors',
          severity: 'critical',
          evidence: {
            requiredNotice: 'adverse_action_notice',
            delivered: false,
            rule: 'NYC Admin Code § 8-107(11-b)(5)',
            rationale: 'Before denying based on criminal history, applicant must receive notice with Article 23-A factors and opportunity to respond.',
          },
          ruleReference: 'Fair Chance Housing Act - Individualized Assessment',
        });
        fixes.push({
          action: 'deliver_adverse_notice',
          description: 'Deliver adverse action notice with Article 23-A factors and response window',
          autoFixAvailable: false,
          priority: 'critical',
        });
      }
      break;

    case 'APPROVED':
    case 'DENIED':
      // Must have final decision rationale
      if (!request.finalDecision?.rationale) {
        violations.push({
          code: 'FCHA_NOTICE_NOT_ISSUED',
          message: 'Final decision must include written rationale',
          severity: 'critical',
          evidence: {
            requiredNotice: 'final_decision_notice',
            rationaleProvided: false,
            rule: 'NYC Admin Code § 8-107(11-b)(6)',
          },
        });
        fixes.push({
          action: 'provide_rationale',
          description: 'Provide written rationale for final decision',
          autoFixAvailable: false,
          priority: 'critical',
        });
      }

      // If denying after individualized assessment, must have considered Article 23-A factors
      if (
        request.targetState === 'DENIED' &&
        request.currentState === 'INDIVIDUALIZED_ASSESSMENT' &&
        (!request.finalDecision?.article23AFactorsConsidered ||
          request.finalDecision.article23AFactorsConsidered.length === 0)
      ) {
        violations.push({
          code: 'FCHA_INDIVIDUALIZED_ASSESSMENT_REQUIRED',
          message: 'Denial after individualized assessment must consider Article 23-A factors',
          severity: 'critical',
          evidence: {
            factorsConsidered: request.finalDecision?.article23AFactorsConsidered || [],
            requiredFactors: fchaRules.workflow?.article23AFactors || [],
            rule: 'NY Correction Law Article 23-A',
            rationale: 'When denying based on criminal history, landlord must conduct and document individualized assessment considering all Article 23-A factors.',
          },
          ruleReference: 'Article 23-A Individualized Assessment',
        });
        fixes.push({
          action: 'complete_article_23a',
          description: 'Complete Article 23-A individualized assessment before denial',
          autoFixAvailable: false,
          priority: 'critical',
        });
      }
      break;
  }

  const hasCriticalViolations = violations.some((v) => v.severity === 'critical');

  if (hasCriticalViolations) {
    return {
      allowed: false,
      violations,
      fixes,
      blockedReason: violations.find((v) => v.severity === 'critical')?.message,
    };
  }

  // Generate evidence record for successful transition
  const evidence: FCHATransitionEvidence = {
    applicationId: request.applicationId,
    transitionId: `fcha_${request.applicationId}_${timestamp.replace(/[^0-9]/g, '')}`,
    fromState: request.currentState,
    toState: request.targetState,
    timestamp,
    actorId: request.actorId,
    actorType: request.actorType,
    noticesIssued: generateNoticesIssued(request, timestamp),
    responseWindow: generateResponseWindow(request, timestamp, fchaRules),
    prequalificationResults: request.prequalificationResults
      ? { ...request.prequalificationResults, allCriteriaMet: true }
      : undefined,
    backgroundCheck: request.adverseInfoDetails
      ? {
          type: 'criminal_background_check',
          requestedAt: timestamp,
          result: request.adverseInfoDetails.adverseInfoFound ? 'adverse_info_found' : 'clear',
          adverseInfoDetails: request.adverseInfoDetails.adverseInfoSummary,
        }
      : undefined,
    individualizedAssessment: request.targetState === 'INDIVIDUALIZED_ASSESSMENT'
      ? {
          startedAt: timestamp,
          article23AFactorsConsidered: fchaRules.workflow?.article23AFactors,
        }
      : undefined,
  };

  // Generate new workflow record
  const newRecord: FCHAWorkflowRecord = {
    applicationId: request.applicationId,
    currentState: request.targetState,
    stateHistory: [
      {
        state: request.currentState,
        enteredAt: timestamp, // Would be previous entry time in real implementation
        exitedAt: timestamp,
        transitionId: evidence.transitionId,
      },
    ],
    conditionalOfferIssuedAt:
      request.targetState === 'CONDITIONAL_OFFER' ? timestamp : undefined,
    conditionalOfferUnitId: request.conditionalOfferDetails?.unitId,
    backgroundCheckAllowedAt:
      request.targetState === 'BACKGROUND_CHECK_ALLOWED' ? timestamp : undefined,
    individualizedAssessmentStartedAt:
      request.targetState === 'INDIVIDUALIZED_ASSESSMENT' ? timestamp : undefined,
    finalDecisionAt:
      request.targetState === 'APPROVED' || request.targetState === 'DENIED'
        ? timestamp
        : undefined,
    finalDecisionResult:
      request.targetState === 'APPROVED'
        ? 'approved'
        : request.targetState === 'DENIED'
        ? 'denied'
        : undefined,
    activeResponseWindow: evidence.responseWindow
      ? {
          opensAt: evidence.responseWindow.opensAt,
          closesAt: evidence.responseWindow.closesAt,
          daysAllowed: evidence.responseWindow.daysAllowed,
          purpose: getResponseWindowPurpose(request.targetState),
        }
      : undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  return {
    allowed: true,
    violations,
    fixes,
    evidence,
    newRecord,
  };
}

/**
 * Validates a background check request
 */
export function validateBackgroundCheck(
  request: FCHABackgroundCheckRequest,
  pack: MarketPack
): FCHABackgroundCheckResult {
  const violations: Violation[] = [];
  const fixes: RecommendedFix[] = [];

  const fchaRules = pack.rules.fcha;
  if (!fchaRules?.enabled) {
    // FCHA not enabled - allow all checks
    return { allowed: true, violations, fixes };
  }

  const isCriminal = isCriminalCheck(request.checkType);

  if (isCriminal && !isBackgroundCheckAllowed(request.currentState)) {
    violations.push({
      code: 'FCHA_BACKGROUND_CHECK_NOT_ALLOWED',
      message: `Criminal background check (${request.checkType}) is not allowed in state ${request.currentState}`,
      severity: 'critical',
      evidence: {
        checkType: request.checkType,
        currentState: request.currentState,
        requiredState: 'BACKGROUND_CHECK_ALLOWED',
        statesWhereAllowed: ['BACKGROUND_CHECK_ALLOWED', 'INDIVIDUALIZED_ASSESSMENT'],
        rule: 'NYC Admin Code § 8-107(11-b)(4)',
        rationale: 'Criminal background checks may only be conducted after a written conditional offer has been made and accepted by the applicant.',
      },
      ruleReference: 'Fair Chance Housing Act - Background Check Timing',
      documentationUrl: 'https://www.nyc.gov/site/cchr/law/fair-chance-housing.page',
    });
    fixes.push({
      action: 'issue_conditional_offer_first',
      description: 'Issue conditional offer and obtain authorization before running criminal background check',
      autoFixAvailable: false,
      priority: 'critical',
    });

    // Add specific guidance based on current state
    if (request.currentState === 'PREQUALIFICATION') {
      violations.push({
        code: 'FCHA_CONDITIONAL_OFFER_REQUIRED',
        message: 'Must complete prequalification and issue conditional offer before criminal background check',
        severity: 'critical',
        evidence: {
          currentState: request.currentState,
          requiredSteps: [
            '1. Complete income, credit, and rental history verification',
            '2. Issue written conditional offer for specific unit',
            '3. Obtain signed background check authorization',
            '4. Then proceed with criminal background check',
          ],
        },
      });
    } else if (request.currentState === 'CONDITIONAL_OFFER') {
      violations.push({
        code: 'FCHA_CONDITIONAL_OFFER_REQUIRED',
        message: 'Must obtain background check authorization before proceeding',
        severity: 'critical',
        evidence: {
          currentState: request.currentState,
          requiredSteps: [
            '1. Ensure conditional offer letter was delivered',
            '2. Obtain signed background check authorization from applicant',
            '3. Transition to BACKGROUND_CHECK_ALLOWED state',
            '4. Then proceed with criminal background check',
          ],
        },
      });
    }

    return {
      allowed: false,
      violations,
      fixes,
      blockedReason: `Criminal background check blocked: Application is in ${request.currentState} state, but must be in BACKGROUND_CHECK_ALLOWED state`,
    };
  }

  // Non-criminal checks are allowed in prequalification
  if (!isCriminal && isPrequalificationCheck(request.checkType)) {
    return { allowed: true, violations, fixes };
  }

  // Unknown check type - warn but allow
  if (!isCriminal && !isPrequalificationCheck(request.checkType)) {
    violations.push({
      code: 'FCHA_PROHIBITED_INQUIRY',
      message: `Unknown check type: ${request.checkType}. Verify this is not a prohibited inquiry.`,
      severity: 'warning',
      evidence: {
        checkType: request.checkType,
        allowedPrequalificationChecks: [...FCHAPrequalificationCheckTypes],
        allowedCriminalChecks: [...FCHACriminalCheckTypes],
      },
    });
  }

  return { allowed: true, violations, fixes };
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateNoticesIssued(
  request: FCHATransitionRequest,
  timestamp: string
): FCHATransitionEvidence['noticesIssued'] {
  const notices: NonNullable<FCHATransitionEvidence['noticesIssued']> = [];

  if (request.targetState === 'CONDITIONAL_OFFER' && request.conditionalOfferDetails?.offerLetterDelivered) {
    notices.push({
      type: 'conditional_offer_letter',
      issuedAt: timestamp,
      deliveryMethod: request.conditionalOfferDetails.deliveryMethod,
      recipientId: request.applicationId,
    });
  }

  if (request.targetState === 'BACKGROUND_CHECK_ALLOWED' && request.backgroundCheckAuthorization?.authorizationSigned) {
    notices.push({
      type: 'background_check_authorization',
      issuedAt: request.backgroundCheckAuthorization.signedAt,
      deliveryMethod: 'in_app',
      recipientId: request.applicationId,
    });
  }

  if (request.targetState === 'INDIVIDUALIZED_ASSESSMENT' && request.adverseInfoDetails?.noticeDelivered) {
    notices.push({
      type: 'adverse_action_notice',
      issuedAt: timestamp,
      deliveryMethod: 'email',
      recipientId: request.applicationId,
    });
    notices.push({
      type: 'article_23a_factors_notice',
      issuedAt: timestamp,
      deliveryMethod: 'email',
      recipientId: request.applicationId,
    });
  }

  if (request.targetState === 'APPROVED') {
    notices.push({
      type: 'approval_notice',
      issuedAt: timestamp,
      deliveryMethod: 'email',
      recipientId: request.applicationId,
    });
  }

  if (request.targetState === 'DENIED') {
    notices.push({
      type: 'denial_notice',
      issuedAt: timestamp,
      deliveryMethod: 'email',
      recipientId: request.applicationId,
    });
  }

  return notices.length > 0 ? notices : undefined;
}

function generateResponseWindow(
  request: FCHATransitionRequest,
  timestamp: string,
  fchaRules: NonNullable<MarketPack['rules']['fcha']>
): FCHATransitionEvidence['responseWindow'] {
  const workflow = fchaRules.workflow;

  // Response window for individualized assessment
  if (request.targetState === 'INDIVIDUALIZED_ASSESSMENT') {
    const daysAllowed = workflow?.mitigatingFactorsResponseDays || 10;
    const opensAt = new Date(timestamp);
    const closesAt = new Date(opensAt);
    closesAt.setDate(closesAt.getDate() + daysAllowed);

    return {
      opensAt: opensAt.toISOString(),
      closesAt: closesAt.toISOString(),
      daysAllowed,
      responded: false,
    };
  }

  return undefined;
}

function getResponseWindowPurpose(state: FCHAWorkflowState): string {
  switch (state) {
    case 'INDIVIDUALIZED_ASSESSMENT':
      return 'Applicant may provide mitigating factors and evidence of rehabilitation';
    default:
      return 'Response window';
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  FCHAValidTransitions,
  FCHACriminalCheckTypes,
  FCHAPrequalificationCheckTypes,
} from './types';
