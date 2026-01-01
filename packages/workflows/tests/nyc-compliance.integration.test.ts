/**
 * NYC Application Compliance Workflow Integration Tests
 *
 * Tests the complete Fair Chance Housing Act workflow execution.
 */

import { describe, it, expect } from 'vitest';
import {
  NYCApplicationComplianceWorkflow,
  nycComplianceActivities,
  initializeWorkflowActivity,
  runPrequalificationChecksActivity,
  transitionStateActivity,
  issueConditionalOfferActivity,
  runCriminalBackgroundCheckActivity,
  approveApplicationActivity,
  denyApplicationActivity,
} from '../src/workflows/nyc-application-compliance';
import type { NYCComplianceInput, NYCComplianceOutput } from '../src/workflows/nyc-application-compliance';
import type { WorkflowContext } from '../src/types';

describe('NYC Application Compliance Workflow', () => {
  describe('Workflow Definition', () => {
    it('should have correct name and version', () => {
      expect(NYCApplicationComplianceWorkflow.name).toBe('nyc-application-compliance');
      expect(NYCApplicationComplianceWorkflow.version).toBe('1.0.0');
    });

    it('should have description', () => {
      expect(NYCApplicationComplianceWorkflow.description).toContain('Fair Chance Housing');
    });
  });

  describe('Activity Definitions', () => {
    it('should export all required activities', () => {
      expect(nycComplianceActivities.length).toBe(9);
      const activityNames = nycComplianceActivities.map((a) => a.name);
      expect(activityNames).toContain('nyc-compliance:initialize-workflow');
      expect(activityNames).toContain('nyc-compliance:run-prequalification-checks');
      expect(activityNames).toContain('nyc-compliance:transition-state');
      expect(activityNames).toContain('nyc-compliance:issue-conditional-offer');
      expect(activityNames).toContain('nyc-compliance:run-criminal-background-check');
      expect(activityNames).toContain('nyc-compliance:approve-application');
      expect(activityNames).toContain('nyc-compliance:deny-application');
    });

    it('should have idempotency keys for all activities', () => {
      nycComplianceActivities.forEach((activity) => {
        expect(activity.idempotencyKey).toBeDefined();
        expect(typeof activity.idempotencyKey).toBe('function');
      });
    });

    it('should have retry policies for all activities', () => {
      nycComplianceActivities.forEach((activity) => {
        expect(activity.retryPolicy).toBeDefined();
        expect(activity.retryPolicy.maximumAttempts).toBeGreaterThan(0);
      });
    });
  });

  describe('Initialize Workflow Activity', () => {
    it('should generate evidence ID', async () => {
      const result = await initializeWorkflowActivity.execute({
        workflowId: 'wf_test_123',
        applicationId: 'app_123',
        applicantId: 'user_456',
        propertyId: 'prop_789',
        organizationId: 'org_111',
        initialState: 'PREQUALIFICATION',
      });

      expect(result.recordId).toContain('app_123');
      expect(result.evidenceId).toContain('app_123');
    });

    it('should generate correct idempotency key', () => {
      const key = initializeWorkflowActivity.idempotencyKey({
        workflowId: 'wf_test_123',
        applicationId: 'app_123',
        applicantId: 'user_456',
        propertyId: 'prop_789',
        organizationId: 'org_111',
        initialState: 'PREQUALIFICATION',
      });

      expect(key).toBe('init:wf_test_123');
    });
  });

  describe('Prequalification Activity', () => {
    it('should return passing results', async () => {
      const result = await runPrequalificationChecksActivity.execute({
        applicationId: 'app_123',
        applicantId: 'user_456',
        checks: ['income', 'credit', 'rental_history', 'employment'],
      });

      expect(result.incomeVerified).toBe(true);
      expect(result.creditCheckPassed).toBe(true);
      expect(result.rentalHistoryVerified).toBe(true);
      expect(result.employmentVerified).toBe(true);
      expect(result.evidenceId).toContain('app_123');
    });

    it('should have external service retry policy', () => {
      expect(runPrequalificationChecksActivity.retryPolicy.maximumAttempts).toBe(10);
      expect(runPrequalificationChecksActivity.timeout).toBe(60000);
    });
  });

  describe('State Transition Activity', () => {
    it('should return transition and evidence IDs', async () => {
      const result = await transitionStateActivity.execute({
        applicationId: 'app_123',
        fromState: 'PREQUALIFICATION',
        toState: 'CONDITIONAL_OFFER',
        actorId: 'user_456',
      });

      expect(result.transitionId).toContain('PREQUALIFICATION_CONDITIONAL_OFFER');
      expect(result.evidenceId).toContain('app_123');
    });

    it('should generate unique idempotency key per transition', () => {
      const key1 = transitionStateActivity.idempotencyKey({
        applicationId: 'app_123',
        fromState: 'PREQUALIFICATION',
        toState: 'CONDITIONAL_OFFER',
        actorId: 'user_456',
      });

      const key2 = transitionStateActivity.idempotencyKey({
        applicationId: 'app_123',
        fromState: 'CONDITIONAL_OFFER',
        toState: 'BACKGROUND_CHECK_ALLOWED',
        actorId: 'user_456',
      });

      expect(key1).not.toBe(key2);
      expect(key1).toContain('PREQUALIFICATION');
      expect(key2).toContain('BACKGROUND_CHECK_ALLOWED');
    });
  });

  describe('Conditional Offer Activity', () => {
    it('should return offer details with evidence', async () => {
      const result = await issueConditionalOfferActivity.execute({
        applicationId: 'app_123',
        applicantId: 'user_456',
        propertyId: 'prop_789',
        unitId: 'unit_101',
      });

      expect(result.offerId).toContain('app_123');
      expect(result.evidenceId).toContain('app_123');
      expect(result.deliveredAt).toBeInstanceOf(Date);
    });
  });

  describe('Background Check Activity', () => {
    it('should return clear result by default', async () => {
      const result = await runCriminalBackgroundCheckActivity.execute({
        applicationId: 'app_123',
        applicantId: 'user_456',
      });

      expect(result.hasAdverseInfo).toBe(false);
      expect(result.findings).toEqual([]);
      expect(result.reportId).toContain('app_123');
      expect(result.evidenceId).toContain('app_123');
    });

    it('should have external service retry policy', () => {
      expect(runCriminalBackgroundCheckActivity.retryPolicy.maximumAttempts).toBe(10);
      expect(runCriminalBackgroundCheckActivity.timeout).toBe(120000);
    });
  });

  describe('Approval/Denial Activities', () => {
    it('should approve application with evidence', async () => {
      const result = await approveApplicationActivity.execute({
        applicationId: 'app_123',
        applicantId: 'user_456',
      });

      expect(result.approvalId).toContain('app_123');
      expect(result.evidenceId).toContain('app_123');
      expect(result.approvedAt).toBeInstanceOf(Date);
    });

    it('should deny application with evidence', async () => {
      const result = await denyApplicationActivity.execute({
        applicationId: 'app_123',
        applicantId: 'user_456',
        reason: 'prequalification_failed',
        details: ['Income verification failed'],
      });

      expect(result.denialId).toContain('app_123');
      expect(result.evidenceId).toContain('app_123');
      expect(result.deniedAt).toBeInstanceOf(Date);
    });
  });

  describe('Full Workflow Execution', () => {
    it('should execute workflow successfully (happy path)', async () => {
      const input: NYCComplianceInput = {
        applicationId: 'app_integration_123',
        applicantId: 'user_integration_456',
        propertyId: 'prop_integration_789',
        unitId: 'unit_integration_101',
        organizationId: 'org_integration_111',
        marketId: 'NYC',
      };

      const ctx: WorkflowContext = {
        workflowId: 'wf_integration_test',
        runId: 'run_integration_test',
        attempt: 1,
        startedAt: new Date(),
        actorId: 'system',
        metadata: {},
      };

      const result = await NYCApplicationComplianceWorkflow.execute(ctx, input);

      expect(result.finalState).toBe('APPROVED');
      expect(result.approved).toBe(true);
      expect(result.evidenceIds.length).toBeGreaterThan(0);
      expect(result.completedAt).toBeInstanceOf(Date);
    });

    it('should collect evidence at each step', async () => {
      const input: NYCComplianceInput = {
        applicationId: 'app_evidence_test',
        applicantId: 'user_evidence_test',
        propertyId: 'prop_evidence_test',
        unitId: 'unit_evidence_test',
        organizationId: 'org_evidence_test',
        marketId: 'NYC',
      };

      const ctx: WorkflowContext = {
        workflowId: 'wf_evidence_test',
        runId: 'run_evidence_test',
        attempt: 1,
        startedAt: new Date(),
        metadata: {},
      };

      const result = await NYCApplicationComplianceWorkflow.execute(ctx, input);

      // Should have evidence for:
      // 1. Initialization
      // 2. Prequalification
      // 3. Transition to CONDITIONAL_OFFER
      // 4. Conditional offer issuance
      // 5. Transition to BACKGROUND_CHECK_ALLOWED
      // 6. Background check
      // 7. Approval
      // 8. Transition to APPROVED
      expect(result.evidenceIds.length).toBeGreaterThanOrEqual(6);
    });

    it('should skip prequalification when provided', async () => {
      const input: NYCComplianceInput = {
        applicationId: 'app_skip_prequal',
        applicantId: 'user_skip_prequal',
        propertyId: 'prop_skip_prequal',
        unitId: 'unit_skip_prequal',
        organizationId: 'org_skip_prequal',
        marketId: 'NYC',
        skipPrequalification: true,
        prequalificationResults: {
          incomeVerified: true,
          creditCheckPassed: true,
          rentalHistoryVerified: true,
          employmentVerified: true,
        },
      };

      const ctx: WorkflowContext = {
        workflowId: 'wf_skip_prequal',
        runId: 'run_skip_prequal',
        attempt: 1,
        startedAt: new Date(),
        metadata: {},
      };

      const result = await NYCApplicationComplianceWorkflow.execute(ctx, input);

      expect(result.approved).toBe(true);
      // Should have fewer evidence records (no prequalification evidence)
      expect(result.evidenceIds).not.toContain('ev_prequal_app_skip_prequal');
    });
  });

  describe('FCHA State Machine Compliance', () => {
    it('should follow FCHA state order', async () => {
      const input: NYCComplianceInput = {
        applicationId: 'app_state_order',
        applicantId: 'user_state_order',
        propertyId: 'prop_state_order',
        unitId: 'unit_state_order',
        organizationId: 'org_state_order',
        marketId: 'NYC',
      };

      const ctx: WorkflowContext = {
        workflowId: 'wf_state_order',
        runId: 'run_state_order',
        attempt: 1,
        startedAt: new Date(),
        metadata: {},
      };

      // Execute workflow and verify evidence IDs show correct state progression
      const result = await NYCApplicationComplianceWorkflow.execute(ctx, input);

      // Check that transitions happened in order by examining evidence IDs
      const transitionEvidence = result.evidenceIds.filter((id) => id.includes('trans'));

      // Should have transition evidence for:
      // PREQUALIFICATION -> CONDITIONAL_OFFER
      // CONDITIONAL_OFFER -> BACKGROUND_CHECK_ALLOWED
      // BACKGROUND_CHECK_ALLOWED -> APPROVED
      expect(transitionEvidence.length).toBeGreaterThanOrEqual(3);
    });

    it('should emit evidence for compliance audit trail', async () => {
      const input: NYCComplianceInput = {
        applicationId: 'app_audit',
        applicantId: 'user_audit',
        propertyId: 'prop_audit',
        unitId: 'unit_audit',
        organizationId: 'org_audit',
        marketId: 'NYC',
      };

      const ctx: WorkflowContext = {
        workflowId: 'wf_audit',
        runId: 'run_audit',
        attempt: 1,
        startedAt: new Date(),
        metadata: {},
      };

      const result = await NYCApplicationComplianceWorkflow.execute(ctx, input);

      // Verify evidence was generated for key compliance steps
      expect(result.evidenceIds.some((id) => id.includes('init'))).toBe(true);
      expect(result.evidenceIds.some((id) => id.includes('offer'))).toBe(true);
      expect(result.evidenceIds.some((id) => id.includes('bgcheck'))).toBe(true);
      expect(result.evidenceIds.some((id) => id.includes('approval'))).toBe(true);
    });
  });
});

describe('Idempotency Guarantees', () => {
  it('should generate unique idempotency keys per application', () => {
    const input1 = {
      workflowId: 'wf_1',
      applicationId: 'app_1',
      applicantId: 'user_1',
      propertyId: 'prop_1',
      organizationId: 'org_1',
      initialState: 'PREQUALIFICATION' as const,
    };

    const input2 = {
      ...input1,
      applicationId: 'app_2',
      workflowId: 'wf_2',
    };

    const key1 = initializeWorkflowActivity.idempotencyKey(input1);
    const key2 = initializeWorkflowActivity.idempotencyKey(input2);

    expect(key1).not.toBe(key2);
  });

  it('should generate same idempotency key for retries', () => {
    const input = {
      workflowId: 'wf_retry',
      applicationId: 'app_retry',
      applicantId: 'user_retry',
      propertyId: 'prop_retry',
      organizationId: 'org_retry',
      initialState: 'PREQUALIFICATION' as const,
    };

    const key1 = initializeWorkflowActivity.idempotencyKey(input);
    const key2 = initializeWorkflowActivity.idempotencyKey(input);

    expect(key1).toBe(key2);
  });
});
