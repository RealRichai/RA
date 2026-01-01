/**
 * NYC Application Compliance Workflow
 *
 * Orchestrates Fair Chance Housing Act (FCHA) compliance for rental applications.
 * This workflow ensures all state transitions follow legal requirements and
 * emits SOC2-compliant evidence at each step.
 *
 * FCHA States:
 * - PREQUALIFICATION: Initial checks (income, credit, rental history)
 * - CONDITIONAL_OFFER: Written offer for specific unit
 * - BACKGROUND_CHECK_ALLOWED: Criminal check now permitted
 * - INDIVIDUALIZED_ASSESSMENT: Article 23-A review if adverse info found
 * - APPROVED/DENIED: Terminal states
 */

import type {
  WorkflowDefinition,
  WorkflowContext,
  ActivityDefinition,
  WaitForSignalOptions,
} from '../types';
import { RetryPolicies } from '../retry/policies';
import { defineActivity } from '../activities/types';

// ============================================================================
// Workflow Input/Output Types
// ============================================================================

/**
 * FCHA workflow states matching compliance-engine types.
 */
export type FCHAWorkflowState =
  | 'PREQUALIFICATION'
  | 'CONDITIONAL_OFFER'
  | 'BACKGROUND_CHECK_ALLOWED'
  | 'INDIVIDUALIZED_ASSESSMENT'
  | 'APPROVED'
  | 'DENIED';

/**
 * Input to start the NYC Application Compliance workflow.
 */
export interface NYCComplianceInput {
  /** Unique application ID */
  applicationId: string;
  /** Applicant user ID */
  applicantId: string;
  /** Property being applied for */
  propertyId: string;
  /** Unit being applied for */
  unitId: string;
  /** Organization (landlord) ID */
  organizationId: string;
  /** Market ID (should be NYC) */
  marketId: string;
  /** Optional: Skip prequalification if already done */
  skipPrequalification?: boolean;
  /** Optional: Preexisting prequalification results */
  prequalificationResults?: PrequalificationResults;
}

/**
 * Output from the NYC Application Compliance workflow.
 */
export interface NYCComplianceOutput {
  /** Final workflow state */
  finalState: FCHAWorkflowState;
  /** Whether application was approved */
  approved: boolean;
  /** Evidence record IDs generated during workflow */
  evidenceIds: string[];
  /** Denial reason if denied */
  denialReason?: string;
  /** Article 23-A factors if individualized assessment was required */
  article23AFactors?: string[];
  /** When workflow completed */
  completedAt: Date;
}

/**
 * Prequalification check results.
 */
export interface PrequalificationResults {
  incomeVerified: boolean;
  creditCheckPassed: boolean;
  rentalHistoryVerified: boolean;
  employmentVerified: boolean;
  failures?: string[];
}

/**
 * Background check result.
 */
export interface BackgroundCheckResult {
  hasAdverseInfo: boolean;
  findings: string[];
  reportId: string;
}

/**
 * Article 23-A assessment result.
 */
export interface Article23AAssessmentResult {
  approved: boolean;
  factors: string[];
  rationale: string;
}

// ============================================================================
// Activity Definitions
// ============================================================================

/**
 * Initialize workflow record in database.
 */
export const initializeWorkflowActivity = defineActivity<
  {
    workflowId: string;
    applicationId: string;
    applicantId: string;
    propertyId: string;
    organizationId: string;
    initialState: FCHAWorkflowState;
  },
  { recordId: string; evidenceId: string }
>({
  name: 'nyc-compliance:initialize-workflow',
  retryPolicy: RetryPolicies.database,
  timeout: 5000,
  idempotencyKey: (input) => `init:${input.workflowId}`,
  async execute(input) {
    // In real implementation, this would:
    // 1. Create FCHAWorkflow record in database
    // 2. Emit evidence for workflow initialization
    // For now, return mock data
    return {
      recordId: `fcha_${input.applicationId}`,
      evidenceId: `ev_init_${input.applicationId}`,
    };
  },
});

/**
 * Run prequalification checks (income, credit, rental history).
 */
export const runPrequalificationChecksActivity = defineActivity<
  {
    applicationId: string;
    applicantId: string;
    checks: ('income' | 'credit' | 'rental_history' | 'employment')[];
  },
  PrequalificationResults & { evidenceId: string }
>({
  name: 'nyc-compliance:run-prequalification-checks',
  retryPolicy: RetryPolicies.externalService,
  timeout: 60000, // 1 minute for external service calls
  idempotencyKey: (input) => `prequal:${input.applicationId}`,
  async execute(input) {
    // In real implementation, this would call screening service
    // For now, return mock passing results
    return {
      incomeVerified: true,
      creditCheckPassed: true,
      rentalHistoryVerified: true,
      employmentVerified: true,
      evidenceId: `ev_prequal_${input.applicationId}`,
    };
  },
});

/**
 * Transition FCHA workflow state.
 */
export const transitionStateActivity = defineActivity<
  {
    applicationId: string;
    fromState: FCHAWorkflowState;
    toState: FCHAWorkflowState;
    evidence?: Record<string, unknown>;
    actorId: string;
  },
  { transitionId: string; evidenceId: string }
>({
  name: 'nyc-compliance:transition-state',
  retryPolicy: RetryPolicies.stateTransition,
  timeout: 10000,
  idempotencyKey: (input) =>
    `transition:${input.applicationId}:${input.fromState}:${input.toState}`,
  async execute(input) {
    // In real implementation:
    // 1. Validate transition using FCHA state machine
    // 2. Update FCHAWorkflow record
    // 3. Emit compliance evidence
    return {
      transitionId: `trans_${input.fromState}_${input.toState}_${Date.now()}`,
      evidenceId: `ev_trans_${input.applicationId}_${input.toState}`,
    };
  },
});

/**
 * Issue conditional offer letter.
 */
export const issueConditionalOfferActivity = defineActivity<
  {
    applicationId: string;
    applicantId: string;
    propertyId: string;
    unitId: string;
  },
  { offerId: string; evidenceId: string; deliveredAt: Date }
>({
  name: 'nyc-compliance:issue-conditional-offer',
  retryPolicy: RetryPolicies.notification,
  timeout: 30000,
  idempotencyKey: (input) => `offer:${input.applicationId}`,
  async execute(input) {
    // In real implementation:
    // 1. Generate conditional offer document
    // 2. Deliver via email/in-app
    // 3. Track delivery
    return {
      offerId: `offer_${input.applicationId}`,
      evidenceId: `ev_offer_${input.applicationId}`,
      deliveredAt: new Date(),
    };
  },
});

/**
 * Run criminal background check.
 */
export const runCriminalBackgroundCheckActivity = defineActivity<
  {
    applicationId: string;
    applicantId: string;
  },
  BackgroundCheckResult & { evidenceId: string }
>({
  name: 'nyc-compliance:run-criminal-background-check',
  retryPolicy: RetryPolicies.externalService,
  timeout: 120000, // 2 minutes for external check
  idempotencyKey: (input) => `bgcheck:${input.applicationId}`,
  async execute(input) {
    // In real implementation, call external screening provider
    // For now, return mock clear result
    return {
      hasAdverseInfo: false,
      findings: [],
      reportId: `report_${input.applicationId}`,
      evidenceId: `ev_bgcheck_${input.applicationId}`,
    };
  },
});

/**
 * Issue adverse action notice.
 */
export const issueAdverseActionNoticeActivity = defineActivity<
  {
    applicationId: string;
    applicantId: string;
    adverseInfo: string[];
    responseDeadlineDays: number;
  },
  { noticeId: string; evidenceId: string; responseDeadline: Date }
>({
  name: 'nyc-compliance:issue-adverse-action-notice',
  retryPolicy: RetryPolicies.notification,
  timeout: 30000,
  idempotencyKey: (input) => `adverse-notice:${input.applicationId}`,
  async execute(input) {
    const responseDeadline = new Date();
    responseDeadline.setDate(responseDeadline.getDate() + input.responseDeadlineDays);

    return {
      noticeId: `notice_adverse_${input.applicationId}`,
      evidenceId: `ev_adverse_${input.applicationId}`,
      responseDeadline,
    };
  },
});

/**
 * Perform Article 23-A individualized assessment.
 */
export const performArticle23AAssessmentActivity = defineActivity<
  {
    applicationId: string;
    adverseInfo: string[];
    mitigatingFactors: unknown;
  },
  Article23AAssessmentResult & { evidenceId: string }
>({
  name: 'nyc-compliance:perform-article-23a-assessment',
  retryPolicy: RetryPolicies.database,
  timeout: 30000,
  idempotencyKey: (input) => `article23a:${input.applicationId}`,
  async execute(input) {
    // Standard Article 23-A factors
    const factors = [
      'nature_of_offense',
      'time_elapsed_since_offense',
      'age_at_time_of_offense',
      'evidence_of_rehabilitation',
      'relationship_to_housing',
      'legitimate_business_interest',
    ];

    // In real implementation, evaluate factors
    return {
      approved: true, // Mock approval
      factors,
      rationale: 'Assessment completed considering all Article 23-A factors',
      evidenceId: `ev_article23a_${input.applicationId}`,
    };
  },
});

/**
 * Approve application.
 */
export const approveApplicationActivity = defineActivity<
  {
    applicationId: string;
    applicantId: string;
  },
  { approvalId: string; evidenceId: string; approvedAt: Date }
>({
  name: 'nyc-compliance:approve-application',
  retryPolicy: RetryPolicies.database,
  timeout: 10000,
  idempotencyKey: (input) => `approve:${input.applicationId}`,
  async execute(input) {
    return {
      approvalId: `approval_${input.applicationId}`,
      evidenceId: `ev_approval_${input.applicationId}`,
      approvedAt: new Date(),
    };
  },
});

/**
 * Deny application.
 */
export const denyApplicationActivity = defineActivity<
  {
    applicationId: string;
    applicantId: string;
    reason: string;
    details?: string[];
    article23AFactors?: string[];
  },
  { denialId: string; evidenceId: string; deniedAt: Date }
>({
  name: 'nyc-compliance:deny-application',
  retryPolicy: RetryPolicies.database,
  timeout: 10000,
  idempotencyKey: (input) => `deny:${input.applicationId}`,
  async execute(input) {
    return {
      denialId: `denial_${input.applicationId}`,
      evidenceId: `ev_denial_${input.applicationId}`,
      deniedAt: new Date(),
    };
  },
});

// ============================================================================
// Workflow Definition
// ============================================================================

/**
 * Workflow execution context with activity and signal helpers.
 */
export interface WorkflowExecutionContext {
  ctx: WorkflowContext;
  activities: {
    execute: <TInput, TOutput>(
      activity: ActivityDefinition<TInput, TOutput>,
      input: TInput
    ) => Promise<TOutput>;
  };
  signals: {
    waitFor: (name: string, options?: WaitForSignalOptions) => Promise<unknown>;
  };
}

/**
 * NYC Application Compliance Workflow Definition.
 *
 * This workflow orchestrates the Fair Chance Housing Act compliance process
 * for rental applications in NYC.
 */
export const NYCApplicationComplianceWorkflow: WorkflowDefinition<
  NYCComplianceInput,
  NYCComplianceOutput
> = {
  name: 'nyc-application-compliance',
  version: '1.0.0',
  description:
    'Orchestrates NYC Fair Chance Housing Act compliance for rental applications',

  async execute(ctx, input): Promise<NYCComplianceOutput> {
    const evidenceIds: string[] = [];

    // This is a simplified version - in production, you would inject
    // the runtime's activity executor and signal handler
    const mockActivities = {
      execute: async <TInput, TOutput>(
        activity: ActivityDefinition<TInput, TOutput>,
        activityInput: TInput
      ): Promise<TOutput> => {
        return activity.execute(activityInput);
      },
    };

    const mockSignals = {
      waitFor: async (_name: string, _options?: WaitForSignalOptions): Promise<unknown> => {
        // In production, this would use the runtime's signal handler
        // For now, simulate immediate response
        return { received: true, timestamp: new Date() };
      },
    };

    try {
      // Step 1: Initialize workflow record
      const initResult = await mockActivities.execute(initializeWorkflowActivity, {
        workflowId: ctx.workflowId,
        applicationId: input.applicationId,
        applicantId: input.applicantId,
        propertyId: input.propertyId,
        organizationId: input.organizationId,
        initialState: 'PREQUALIFICATION',
      });
      evidenceIds.push(initResult.evidenceId);

      // Step 2: Run prequalification checks (if not skipped)
      let prequalResults: PrequalificationResults;
      if (input.skipPrequalification && input.prequalificationResults) {
        prequalResults = input.prequalificationResults;
      } else {
        const prequal = await mockActivities.execute(runPrequalificationChecksActivity, {
          applicationId: input.applicationId,
          applicantId: input.applicantId,
          checks: ['income', 'credit', 'rental_history', 'employment'],
        });
        evidenceIds.push(prequal.evidenceId);
        prequalResults = prequal;
      }

      // Check if prequalification passed
      const prequalPassed =
        prequalResults.incomeVerified &&
        prequalResults.creditCheckPassed &&
        prequalResults.rentalHistoryVerified &&
        prequalResults.employmentVerified;

      if (!prequalPassed) {
        // Deny based on prequalification failure
        const denial = await mockActivities.execute(denyApplicationActivity, {
          applicationId: input.applicationId,
          applicantId: input.applicantId,
          reason: 'prequalification_failed',
          details: prequalResults.failures,
        });
        evidenceIds.push(denial.evidenceId);

        // Transition to DENIED
        const trans = await mockActivities.execute(transitionStateActivity, {
          applicationId: input.applicationId,
          fromState: 'PREQUALIFICATION',
          toState: 'DENIED',
          actorId: ctx.actorId ?? 'system',
        });
        evidenceIds.push(trans.evidenceId);

        return {
          finalState: 'DENIED',
          approved: false,
          evidenceIds,
          denialReason: 'prequalification_failed',
          completedAt: new Date(),
        };
      }

      // Step 3: Transition to CONDITIONAL_OFFER
      const toOfferTrans = await mockActivities.execute(transitionStateActivity, {
        applicationId: input.applicationId,
        fromState: 'PREQUALIFICATION',
        toState: 'CONDITIONAL_OFFER',
        evidence: { prequalificationResults: prequalResults },
        actorId: ctx.actorId ?? 'system',
      });
      evidenceIds.push(toOfferTrans.evidenceId);

      // Step 4: Issue conditional offer
      const offer = await mockActivities.execute(issueConditionalOfferActivity, {
        applicationId: input.applicationId,
        applicantId: input.applicantId,
        propertyId: input.propertyId,
        unitId: input.unitId,
      });
      evidenceIds.push(offer.evidenceId);

      // Step 5: Wait for background check authorization
      const authSignal = await mockSignals.waitFor('background_check_authorization_signed', {
        timeout: 7 * 24 * 60 * 60 * 1000, // 7 days
        defaultValue: null,
      });

      if (!authSignal) {
        // Authorization timeout - deny
        const denial = await mockActivities.execute(denyApplicationActivity, {
          applicationId: input.applicationId,
          applicantId: input.applicantId,
          reason: 'authorization_timeout',
        });
        evidenceIds.push(denial.evidenceId);

        const trans = await mockActivities.execute(transitionStateActivity, {
          applicationId: input.applicationId,
          fromState: 'CONDITIONAL_OFFER',
          toState: 'DENIED',
          actorId: ctx.actorId ?? 'system',
        });
        evidenceIds.push(trans.evidenceId);

        return {
          finalState: 'DENIED',
          approved: false,
          evidenceIds,
          denialReason: 'authorization_timeout',
          completedAt: new Date(),
        };
      }

      // Step 6: Transition to BACKGROUND_CHECK_ALLOWED
      const toBgCheckTrans = await mockActivities.execute(transitionStateActivity, {
        applicationId: input.applicationId,
        fromState: 'CONDITIONAL_OFFER',
        toState: 'BACKGROUND_CHECK_ALLOWED',
        actorId: ctx.actorId ?? 'system',
      });
      evidenceIds.push(toBgCheckTrans.evidenceId);

      // Step 7: Run criminal background check
      const bgCheck = await mockActivities.execute(runCriminalBackgroundCheckActivity, {
        applicationId: input.applicationId,
        applicantId: input.applicantId,
      });
      evidenceIds.push(bgCheck.evidenceId);

      // Step 8: Handle background check result
      if (bgCheck.hasAdverseInfo) {
        // Transition to individualized assessment
        const toAssessmentTrans = await mockActivities.execute(transitionStateActivity, {
          applicationId: input.applicationId,
          fromState: 'BACKGROUND_CHECK_ALLOWED',
          toState: 'INDIVIDUALIZED_ASSESSMENT',
          evidence: { adverseInfo: bgCheck.findings },
          actorId: ctx.actorId ?? 'system',
        });
        evidenceIds.push(toAssessmentTrans.evidenceId);

        // Issue adverse action notice
        const adverseNotice = await mockActivities.execute(issueAdverseActionNoticeActivity, {
          applicationId: input.applicationId,
          applicantId: input.applicantId,
          adverseInfo: bgCheck.findings,
          responseDeadlineDays: 5,
        });
        evidenceIds.push(adverseNotice.evidenceId);

        // Wait for mitigating factors
        const mitigatingSignal = await mockSignals.waitFor('mitigating_factors_submitted', {
          timeout: 5 * 24 * 60 * 60 * 1000, // 5 days
          defaultValue: null,
        });

        // Perform Article 23-A assessment
        const assessment = await mockActivities.execute(performArticle23AAssessmentActivity, {
          applicationId: input.applicationId,
          adverseInfo: bgCheck.findings,
          mitigatingFactors: mitigatingSignal,
        });
        evidenceIds.push(assessment.evidenceId);

        if (!assessment.approved) {
          // Deny after assessment
          const denial = await mockActivities.execute(denyApplicationActivity, {
            applicationId: input.applicationId,
            applicantId: input.applicantId,
            reason: 'individualized_assessment_denial',
            article23AFactors: assessment.factors,
          });
          evidenceIds.push(denial.evidenceId);

          const trans = await mockActivities.execute(transitionStateActivity, {
            applicationId: input.applicationId,
            fromState: 'INDIVIDUALIZED_ASSESSMENT',
            toState: 'DENIED',
            evidence: { assessment },
            actorId: ctx.actorId ?? 'system',
          });
          evidenceIds.push(trans.evidenceId);

          return {
            finalState: 'DENIED',
            approved: false,
            evidenceIds,
            denialReason: 'individualized_assessment_denial',
            article23AFactors: assessment.factors,
            completedAt: new Date(),
          };
        }

        // Approve after assessment
        const approval = await mockActivities.execute(approveApplicationActivity, {
          applicationId: input.applicationId,
          applicantId: input.applicantId,
        });
        evidenceIds.push(approval.evidenceId);

        const toApprovedTrans = await mockActivities.execute(transitionStateActivity, {
          applicationId: input.applicationId,
          fromState: 'INDIVIDUALIZED_ASSESSMENT',
          toState: 'APPROVED',
          actorId: ctx.actorId ?? 'system',
        });
        evidenceIds.push(toApprovedTrans.evidenceId);

        return {
          finalState: 'APPROVED',
          approved: true,
          evidenceIds,
          article23AFactors: assessment.factors,
          completedAt: new Date(),
        };
      }

      // Step 9: No adverse info - approve directly
      const approval = await mockActivities.execute(approveApplicationActivity, {
        applicationId: input.applicationId,
        applicantId: input.applicantId,
      });
      evidenceIds.push(approval.evidenceId);

      const toApprovedTrans = await mockActivities.execute(transitionStateActivity, {
        applicationId: input.applicationId,
        fromState: 'BACKGROUND_CHECK_ALLOWED',
        toState: 'APPROVED',
        actorId: ctx.actorId ?? 'system',
      });
      evidenceIds.push(toApprovedTrans.evidenceId);

      return {
        finalState: 'APPROVED',
        approved: true,
        evidenceIds,
        completedAt: new Date(),
      };
    } catch (error) {
      // On error, attempt to record denial with error reason
      try {
        const denial = await mockActivities.execute(denyApplicationActivity, {
          applicationId: input.applicationId,
          applicantId: input.applicantId,
          reason: 'workflow_error',
          details: [(error as Error).message],
        });
        evidenceIds.push(denial.evidenceId);
      } catch {
        // Ignore secondary errors
      }

      throw error;
    }
  },
};

// ============================================================================
// Exported Activities for Registration
// ============================================================================

/**
 * All activities for the NYC Compliance workflow.
 * Register these with the activity registry before executing workflows.
 */
export const nycComplianceActivities = [
  initializeWorkflowActivity,
  runPrequalificationChecksActivity,
  transitionStateActivity,
  issueConditionalOfferActivity,
  runCriminalBackgroundCheckActivity,
  issueAdverseActionNoticeActivity,
  performArticle23AAssessmentActivity,
  approveApplicationActivity,
  denyApplicationActivity,
] as const;
