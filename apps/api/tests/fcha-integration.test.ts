/**
 * NYC Fair Chance Housing Act Integration Tests
 *
 * Tests for the FCHA workflow enforcement ensuring background check
 * endpoints fail before conditional offer in NYC market.
 */

import { describe, it, expect } from 'vitest';

import {
  gateFCHAWorkflowTransition,
  gateFCHACriminalCheck,
  gateFCHAStageTransition,
  gateFCHABackgroundCheck,
  type FCHAWorkflowTransitionInput,
  type FCHACriminalCheckGateInput,
} from '@realriches/compliance-engine';

describe('FCHA Integration - Background Check Blocking', () => {
  describe('NYC Market Enforcement', () => {
    describe('Criminal Background Check Gates', () => {
      it('blocks criminal background check in PREQUALIFICATION state', async () => {
        const input: FCHACriminalCheckGateInput = {
          applicationId: 'app_integration_test',
          marketId: 'NYC',
          currentState: 'PREQUALIFICATION',
          checkType: 'criminal_background_check',
          actorId: 'user_123',
        };

        const result = await gateFCHACriminalCheck(input);

        expect(result.allowed).toBe(false);
        expect(result.decision.passed).toBe(false);
        expect(result.decision.violations.some((v) => v.code === 'FCHA_BACKGROUND_CHECK_NOT_ALLOWED')).toBe(true);
        expect(result.blockedReason).toContain('PREQUALIFICATION');
        expect(result.decision.metadata?.fchaEnforced).toBe(true);
      });

      it('blocks criminal background check in CONDITIONAL_OFFER state', async () => {
        const input: FCHACriminalCheckGateInput = {
          applicationId: 'app_integration_test',
          marketId: 'NYC',
          currentState: 'CONDITIONAL_OFFER',
          checkType: 'criminal_background_check',
          actorId: 'user_123',
        };

        const result = await gateFCHACriminalCheck(input);

        expect(result.allowed).toBe(false);
        expect(result.decision.violations.some((v) => v.code === 'FCHA_BACKGROUND_CHECK_NOT_ALLOWED')).toBe(true);
      });

      it('allows criminal background check in BACKGROUND_CHECK_ALLOWED state', async () => {
        const input: FCHACriminalCheckGateInput = {
          applicationId: 'app_integration_test',
          marketId: 'NYC',
          currentState: 'BACKGROUND_CHECK_ALLOWED',
          checkType: 'criminal_background_check',
          actorId: 'user_123',
        };

        const result = await gateFCHACriminalCheck(input);

        expect(result.allowed).toBe(true);
        expect(result.decision.passed).toBe(true);
        expect(result.decision.checksPerformed).toContain('fcha_criminal_check');
      });

      it('blocks all criminal check types before conditional offer', async () => {
        const criminalCheckTypes = [
          'criminal_background_check',
          'criminal_history',
          'arrest_record',
          'conviction_record',
        ];

        for (const checkType of criminalCheckTypes) {
          const input: FCHACriminalCheckGateInput = {
            applicationId: 'app_integration_test',
            marketId: 'NYC',
            currentState: 'PREQUALIFICATION',
            checkType,
            actorId: 'user_123',
          };

          const result = await gateFCHACriminalCheck(input);

          expect(result.allowed).toBe(false);
          expect(result.decision.violations.some((v) => v.code === 'FCHA_BACKGROUND_CHECK_NOT_ALLOWED')).toBe(true);
        }
      });

      it('allows prequalification checks in PREQUALIFICATION state', async () => {
        const prequalChecks = ['income_verification', 'credit_check', 'rental_history'];

        for (const checkType of prequalChecks) {
          const input: FCHACriminalCheckGateInput = {
            applicationId: 'app_integration_test',
            marketId: 'NYC',
            currentState: 'PREQUALIFICATION',
            checkType,
            actorId: 'user_123',
          };

          const result = await gateFCHACriminalCheck(input);

          expect(result.allowed).toBe(true);
        }
      });
    });

    describe('Workflow State Transitions', () => {
      it('allows valid PREQUALIFICATION -> CONDITIONAL_OFFER transition', async () => {
        const input: FCHAWorkflowTransitionInput = {
          applicationId: 'app_integration_test',
          marketId: 'NYC',
          currentState: 'PREQUALIFICATION',
          targetState: 'CONDITIONAL_OFFER',
          actorId: 'user_123',
          actorType: 'user',
          prequalificationResults: {
            incomeVerified: true,
            creditCheckPassed: true,
            rentalHistoryVerified: true,
            employmentVerified: true,
          },
          conditionalOfferDetails: {
            unitId: 'unit_456',
            offerLetterDelivered: true,
            deliveryMethod: 'email',
          },
        };

        const result = await gateFCHAWorkflowTransition(input);

        expect(result.allowed).toBe(true);
        expect(result.decision.passed).toBe(true);
        expect(result.evidence).toBeDefined();
        expect(result.evidence?.fromState).toBe('PREQUALIFICATION');
        expect(result.evidence?.toState).toBe('CONDITIONAL_OFFER');
        expect(result.decision.checksPerformed).toContain('fcha_workflow');
      });

      it('blocks skipping from PREQUALIFICATION to BACKGROUND_CHECK_ALLOWED', async () => {
        const input: FCHAWorkflowTransitionInput = {
          applicationId: 'app_integration_test',
          marketId: 'NYC',
          currentState: 'PREQUALIFICATION',
          targetState: 'BACKGROUND_CHECK_ALLOWED',
          actorId: 'user_123',
          actorType: 'user',
        };

        const result = await gateFCHAWorkflowTransition(input);

        expect(result.allowed).toBe(false);
        expect(result.decision.violations.some((v) => v.code === 'FCHA_INVALID_STATE_TRANSITION')).toBe(true);
        expect(result.blockedReason).toContain('transition blocked');
      });

      it('blocks CONDITIONAL_OFFER without prequalification completion', async () => {
        const input: FCHAWorkflowTransitionInput = {
          applicationId: 'app_integration_test',
          marketId: 'NYC',
          currentState: 'PREQUALIFICATION',
          targetState: 'CONDITIONAL_OFFER',
          actorId: 'user_123',
          actorType: 'user',
          prequalificationResults: {
            incomeVerified: false, // Failed
            creditCheckPassed: true,
            rentalHistoryVerified: true,
            employmentVerified: true,
          },
          conditionalOfferDetails: {
            unitId: 'unit_456',
            offerLetterDelivered: true,
            deliveryMethod: 'email',
          },
        };

        const result = await gateFCHAWorkflowTransition(input);

        expect(result.allowed).toBe(false);
        expect(result.decision.violations.some((v) => v.code === 'FCHA_PREQUALIFICATION_INCOMPLETE')).toBe(true);
      });

      it('allows CONDITIONAL_OFFER -> BACKGROUND_CHECK_ALLOWED with authorization', async () => {
        const input: FCHAWorkflowTransitionInput = {
          applicationId: 'app_integration_test',
          marketId: 'NYC',
          currentState: 'CONDITIONAL_OFFER',
          targetState: 'BACKGROUND_CHECK_ALLOWED',
          actorId: 'user_123',
          actorType: 'user',
          backgroundCheckAuthorization: {
            authorizationSigned: true,
            signedAt: new Date().toISOString(),
          },
        };

        const result = await gateFCHAWorkflowTransition(input);

        expect(result.allowed).toBe(true);
        expect(result.evidence?.noticesIssued).toBeDefined();
      });

      it('blocks BACKGROUND_CHECK_ALLOWED without signed authorization', async () => {
        const input: FCHAWorkflowTransitionInput = {
          applicationId: 'app_integration_test',
          marketId: 'NYC',
          currentState: 'CONDITIONAL_OFFER',
          targetState: 'BACKGROUND_CHECK_ALLOWED',
          actorId: 'user_123',
          actorType: 'user',
          backgroundCheckAuthorization: {
            authorizationSigned: false,
            signedAt: new Date().toISOString(),
          },
        };

        const result = await gateFCHAWorkflowTransition(input);

        expect(result.allowed).toBe(false);
        expect(result.decision.violations.some((v) => v.code === 'FCHA_NOTICE_NOT_ISSUED')).toBe(true);
      });
    });

    describe('Complete Workflow Scenarios', () => {
      it('completes full approval workflow', async () => {
        // Step 1: PREQUALIFICATION -> CONDITIONAL_OFFER
        const step1 = await gateFCHAWorkflowTransition({
          applicationId: 'app_full_workflow',
          marketId: 'NYC',
          currentState: 'PREQUALIFICATION',
          targetState: 'CONDITIONAL_OFFER',
          actorId: 'user_123',
          actorType: 'user',
          prequalificationResults: {
            incomeVerified: true,
            creditCheckPassed: true,
            rentalHistoryVerified: true,
            employmentVerified: true,
          },
          conditionalOfferDetails: {
            unitId: 'unit_789',
            offerLetterDelivered: true,
            deliveryMethod: 'email',
          },
        });
        expect(step1.allowed).toBe(true);

        // Step 2: CONDITIONAL_OFFER -> BACKGROUND_CHECK_ALLOWED
        const step2 = await gateFCHAWorkflowTransition({
          applicationId: 'app_full_workflow',
          marketId: 'NYC',
          currentState: 'CONDITIONAL_OFFER',
          targetState: 'BACKGROUND_CHECK_ALLOWED',
          actorId: 'user_123',
          actorType: 'user',
          backgroundCheckAuthorization: {
            authorizationSigned: true,
            signedAt: new Date().toISOString(),
          },
        });
        expect(step2.allowed).toBe(true);

        // Step 3: Now criminal check is allowed
        const checkResult = await gateFCHACriminalCheck({
          applicationId: 'app_full_workflow',
          marketId: 'NYC',
          currentState: 'BACKGROUND_CHECK_ALLOWED',
          checkType: 'criminal_background_check',
          actorId: 'user_123',
        });
        expect(checkResult.allowed).toBe(true);

        // Step 4: BACKGROUND_CHECK_ALLOWED -> APPROVED (clear background)
        const step4 = await gateFCHAWorkflowTransition({
          applicationId: 'app_full_workflow',
          marketId: 'NYC',
          currentState: 'BACKGROUND_CHECK_ALLOWED',
          targetState: 'APPROVED',
          actorId: 'user_123',
          actorType: 'user',
          finalDecision: {
            decision: 'approved',
            rationale: 'Background check clear, all criteria met',
          },
        });
        expect(step4.allowed).toBe(true);
      });

      it('handles adverse finding with individualized assessment', async () => {
        // After background check, adverse info found
        const step1 = await gateFCHAWorkflowTransition({
          applicationId: 'app_adverse',
          marketId: 'NYC',
          currentState: 'BACKGROUND_CHECK_ALLOWED',
          targetState: 'INDIVIDUALIZED_ASSESSMENT',
          actorId: 'user_123',
          actorType: 'user',
          adverseInfoDetails: {
            adverseInfoFound: true,
            adverseInfoSummary: 'Prior misdemeanor conviction 8 years ago',
            noticeDelivered: true,
          },
        });
        expect(step1.allowed).toBe(true);
        expect(step1.evidence?.responseWindow).toBeDefined();
        expect(step1.evidence?.responseWindow?.daysAllowed).toBe(10);

        // After individualized assessment, approve with Article 23-A factors
        const step2 = await gateFCHAWorkflowTransition({
          applicationId: 'app_adverse',
          marketId: 'NYC',
          currentState: 'INDIVIDUALIZED_ASSESSMENT',
          targetState: 'APPROVED',
          actorId: 'user_123',
          actorType: 'user',
          finalDecision: {
            decision: 'approved',
            rationale: 'After individualized assessment, offense not directly related to housing',
            article23AFactorsConsidered: [
              'nature_of_offense',
              'time_elapsed_since_offense',
              'relationship_to_housing',
            ],
          },
        });
        expect(step2.allowed).toBe(true);
      });
    });

    describe('Evidence and Audit Trail', () => {
      it('includes complete provenance in gate results', async () => {
        const result = await gateFCHAWorkflowTransition({
          applicationId: 'app_audit_test',
          marketId: 'NYC',
          currentState: 'PREQUALIFICATION',
          targetState: 'CONDITIONAL_OFFER',
          actorId: 'user_123',
          actorType: 'user',
          prequalificationResults: {
            incomeVerified: true,
            creditCheckPassed: true,
            rentalHistoryVerified: true,
            employmentVerified: true,
          },
          conditionalOfferDetails: {
            unitId: 'unit_audit',
            offerLetterDelivered: true,
            deliveryMethod: 'email',
          },
        });

        // Decision metadata
        expect(result.decision.policyVersion).toBeDefined();
        expect(result.decision.marketPack).toBe('NYC_STRICT');
        expect(result.decision.marketPackVersion).toBeDefined();
        expect(result.decision.checkedAt).toBeDefined();
        expect(result.decision.metadata?.applicationId).toBe('app_audit_test');
        expect(result.decision.metadata?.fromState).toBe('PREQUALIFICATION');
        expect(result.decision.metadata?.toState).toBe('CONDITIONAL_OFFER');
        expect(result.decision.metadata?.fchaEnforced).toBe(true);

        // Evidence record
        expect(result.evidence?.transitionId).toBeDefined();
        expect(result.evidence?.timestamp).toBeDefined();
        expect(result.evidence?.actorId).toBe('user_123');
        expect(result.evidence?.actorType).toBe('user');
      });

      it('includes violation evidence for blocked operations', async () => {
        const result = await gateFCHACriminalCheck({
          applicationId: 'app_violation_test',
          marketId: 'NYC',
          currentState: 'PREQUALIFICATION',
          checkType: 'criminal_background_check',
          actorId: 'user_123',
        });

        const violation = result.decision.violations.find(
          (v) => v.code === 'FCHA_BACKGROUND_CHECK_NOT_ALLOWED'
        );

        expect(violation).toBeDefined();
        expect(violation?.evidence?.checkType).toBe('criminal_background_check');
        expect(violation?.evidence?.currentState).toBe('PREQUALIFICATION');
        expect(violation?.evidence?.requiredState).toBe('BACKGROUND_CHECK_ALLOWED');
        expect(violation?.evidence?.rule).toContain('NYC Admin Code');
        expect(violation?.ruleReference).toContain('Fair Chance Housing');
        expect(violation?.documentationUrl).toBeDefined();
      });
    });
  });

  describe('Non-NYC Markets', () => {
    it('allows criminal background check at any state in Texas', async () => {
      const input: FCHACriminalCheckGateInput = {
        applicationId: 'app_texas_test',
        marketId: 'TX',
        currentState: 'PREQUALIFICATION',
        checkType: 'criminal_background_check',
        actorId: 'user_123',
      };

      const result = await gateFCHACriminalCheck(input);

      // Texas doesn't have FCHA
      expect(result.allowed).toBe(true);
      expect(result.decision.marketPack).toBe('TX_STANDARD');
      expect(result.decision.metadata?.fchaEnforced).toBe(false);
    });

    it('allows any state transition in non-FCHA markets', async () => {
      const input: FCHAWorkflowTransitionInput = {
        applicationId: 'app_texas_workflow',
        marketId: 'TX',
        currentState: 'PREQUALIFICATION',
        targetState: 'BACKGROUND_CHECK_ALLOWED', // Would be invalid in NYC
        actorId: 'user_123',
        actorType: 'user',
      };

      const result = await gateFCHAWorkflowTransition(input);

      // Texas doesn't enforce FCHA workflow
      expect(result.allowed).toBe(true);
    });
  });

  describe('Legacy FCHA Gates (Backward Compatibility)', () => {
    it('still blocks background check before conditional offer via legacy gate', async () => {
      const result = await gateFCHABackgroundCheck({
        applicationId: 'app_legacy_test',
        marketId: 'nyc',
        currentStage: 'application_review',
        checkType: 'criminal_background_check',
      });

      expect(result.allowed).toBe(false);
      expect(result.decision.violations.some((v) => v.code === 'FCHA_CRIMINAL_CHECK_BEFORE_OFFER')).toBe(true);
    });

    it('still blocks stage skipping via legacy gate', async () => {
      const result = await gateFCHAStageTransition({
        applicationId: 'app_legacy_stage',
        marketId: 'nyc',
        currentStage: 'application_review',
        targetStage: 'background_check', // Skipping conditional_offer
      });

      expect(result.allowed).toBe(false);
      expect(result.decision.violations.some((v) => v.code === 'FCHA_STAGE_ORDER_VIOLATION')).toBe(true);
    });

    it('allows background check after conditional offer via legacy gate', async () => {
      const result = await gateFCHABackgroundCheck({
        applicationId: 'app_legacy_allowed',
        marketId: 'nyc',
        currentStage: 'background_check',
        checkType: 'criminal_background_check',
      });

      expect(result.allowed).toBe(true);
    });
  });
});
