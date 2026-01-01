/**
 * NYC Fair Chance Housing Act State Machine Tests
 *
 * Tests for the FCHA workflow enforcement ensuring criminal background
 * checks cannot occur before conditional offer.
 */

import { describe, it, expect } from 'vitest';

import {
  isValidTransition,
  getValidNextStates,
  isTerminalState,
  isBackgroundCheckAllowed,
  isCriminalCheck,
  isPrequalificationCheck,
  validateTransition,
  validateBackgroundCheck,
} from '../fcha-state-machine';
import { getMarketPack } from '../market-packs';
import type { FCHAWorkflowState } from '../types';

describe('FCHA State Machine', () => {
  const nycPack = getMarketPack('NYC_STRICT');
  const txPack = getMarketPack('TX_STANDARD');

  describe('isValidTransition', () => {
    it('allows PREQUALIFICATION -> CONDITIONAL_OFFER', () => {
      expect(isValidTransition('PREQUALIFICATION', 'CONDITIONAL_OFFER')).toBe(true);
    });

    it('allows PREQUALIFICATION -> DENIED', () => {
      expect(isValidTransition('PREQUALIFICATION', 'DENIED')).toBe(true);
    });

    it('blocks PREQUALIFICATION -> BACKGROUND_CHECK_ALLOWED (skip step)', () => {
      expect(isValidTransition('PREQUALIFICATION', 'BACKGROUND_CHECK_ALLOWED')).toBe(false);
    });

    it('blocks PREQUALIFICATION -> APPROVED (skip steps)', () => {
      expect(isValidTransition('PREQUALIFICATION', 'APPROVED')).toBe(false);
    });

    it('allows CONDITIONAL_OFFER -> BACKGROUND_CHECK_ALLOWED', () => {
      expect(isValidTransition('CONDITIONAL_OFFER', 'BACKGROUND_CHECK_ALLOWED')).toBe(true);
    });

    it('allows BACKGROUND_CHECK_ALLOWED -> APPROVED (clear check)', () => {
      expect(isValidTransition('BACKGROUND_CHECK_ALLOWED', 'APPROVED')).toBe(true);
    });

    it('allows BACKGROUND_CHECK_ALLOWED -> INDIVIDUALIZED_ASSESSMENT (adverse info)', () => {
      expect(isValidTransition('BACKGROUND_CHECK_ALLOWED', 'INDIVIDUALIZED_ASSESSMENT')).toBe(true);
    });

    it('allows INDIVIDUALIZED_ASSESSMENT -> APPROVED', () => {
      expect(isValidTransition('INDIVIDUALIZED_ASSESSMENT', 'APPROVED')).toBe(true);
    });

    it('allows INDIVIDUALIZED_ASSESSMENT -> DENIED', () => {
      expect(isValidTransition('INDIVIDUALIZED_ASSESSMENT', 'DENIED')).toBe(true);
    });

    it('blocks transitions from terminal states', () => {
      expect(isValidTransition('APPROVED', 'DENIED')).toBe(false);
      expect(isValidTransition('DENIED', 'APPROVED')).toBe(false);
      expect(isValidTransition('APPROVED', 'PREQUALIFICATION')).toBe(false);
    });
  });

  describe('getValidNextStates', () => {
    it('returns correct next states from PREQUALIFICATION', () => {
      expect(getValidNextStates('PREQUALIFICATION')).toEqual(['CONDITIONAL_OFFER', 'DENIED']);
    });

    it('returns correct next states from CONDITIONAL_OFFER', () => {
      expect(getValidNextStates('CONDITIONAL_OFFER')).toEqual(['BACKGROUND_CHECK_ALLOWED', 'DENIED']);
    });

    it('returns correct next states from BACKGROUND_CHECK_ALLOWED', () => {
      expect(getValidNextStates('BACKGROUND_CHECK_ALLOWED')).toEqual([
        'INDIVIDUALIZED_ASSESSMENT',
        'APPROVED',
        'DENIED',
      ]);
    });

    it('returns empty array for terminal states', () => {
      expect(getValidNextStates('APPROVED')).toEqual([]);
      expect(getValidNextStates('DENIED')).toEqual([]);
    });
  });

  describe('isTerminalState', () => {
    it('identifies APPROVED as terminal', () => {
      expect(isTerminalState('APPROVED')).toBe(true);
    });

    it('identifies DENIED as terminal', () => {
      expect(isTerminalState('DENIED')).toBe(true);
    });

    it('identifies FINAL_DECISION as terminal', () => {
      expect(isTerminalState('FINAL_DECISION')).toBe(true);
    });

    it('identifies non-terminal states correctly', () => {
      expect(isTerminalState('PREQUALIFICATION')).toBe(false);
      expect(isTerminalState('CONDITIONAL_OFFER')).toBe(false);
      expect(isTerminalState('BACKGROUND_CHECK_ALLOWED')).toBe(false);
      expect(isTerminalState('INDIVIDUALIZED_ASSESSMENT')).toBe(false);
    });
  });

  describe('isBackgroundCheckAllowed', () => {
    it('allows background check in BACKGROUND_CHECK_ALLOWED state', () => {
      expect(isBackgroundCheckAllowed('BACKGROUND_CHECK_ALLOWED')).toBe(true);
    });

    it('allows background check in INDIVIDUALIZED_ASSESSMENT state', () => {
      expect(isBackgroundCheckAllowed('INDIVIDUALIZED_ASSESSMENT')).toBe(true);
    });

    it('blocks background check in PREQUALIFICATION state', () => {
      expect(isBackgroundCheckAllowed('PREQUALIFICATION')).toBe(false);
    });

    it('blocks background check in CONDITIONAL_OFFER state', () => {
      expect(isBackgroundCheckAllowed('CONDITIONAL_OFFER')).toBe(false);
    });

    it('blocks background check in terminal states', () => {
      expect(isBackgroundCheckAllowed('APPROVED')).toBe(false);
      expect(isBackgroundCheckAllowed('DENIED')).toBe(false);
    });
  });

  describe('isCriminalCheck', () => {
    it('identifies criminal_background_check as criminal', () => {
      expect(isCriminalCheck('criminal_background_check')).toBe(true);
    });

    it('identifies criminal_history as criminal', () => {
      expect(isCriminalCheck('criminal_history')).toBe(true);
    });

    it('identifies arrest_record as criminal', () => {
      expect(isCriminalCheck('arrest_record')).toBe(true);
    });

    it('identifies conviction_record as criminal', () => {
      expect(isCriminalCheck('conviction_record')).toBe(true);
    });

    it('does not identify credit_check as criminal', () => {
      expect(isCriminalCheck('credit_check')).toBe(false);
    });

    it('does not identify income_verification as criminal', () => {
      expect(isCriminalCheck('income_verification')).toBe(false);
    });
  });

  describe('isPrequalificationCheck', () => {
    it('identifies income_verification as prequalification', () => {
      expect(isPrequalificationCheck('income_verification')).toBe(true);
    });

    it('identifies credit_check as prequalification', () => {
      expect(isPrequalificationCheck('credit_check')).toBe(true);
    });

    it('identifies rental_history as prequalification', () => {
      expect(isPrequalificationCheck('rental_history')).toBe(true);
    });

    it('identifies eviction_history as prequalification', () => {
      expect(isPrequalificationCheck('eviction_history')).toBe(true);
    });

    it('does not identify criminal_background_check as prequalification', () => {
      expect(isPrequalificationCheck('criminal_background_check')).toBe(false);
    });
  });

  describe('validateTransition', () => {
    describe('NYC Market (FCHA Enabled)', () => {
      it('allows valid PREQUALIFICATION -> CONDITIONAL_OFFER with requirements', () => {
        const result = validateTransition(
          {
            applicationId: 'app_123',
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
              unitId: 'unit_123',
              offerLetterDelivered: true,
              deliveryMethod: 'email',
            },
          },
          nycPack
        );

        expect(result.allowed).toBe(true);
        expect(result.evidence).toBeDefined();
        expect(result.evidence?.fromState).toBe('PREQUALIFICATION');
        expect(result.evidence?.toState).toBe('CONDITIONAL_OFFER');
        expect(result.newRecord).toBeDefined();
        expect(result.newRecord?.currentState).toBe('CONDITIONAL_OFFER');
      });

      it('blocks PREQUALIFICATION -> CONDITIONAL_OFFER without prequalification', () => {
        const result = validateTransition(
          {
            applicationId: 'app_123',
            currentState: 'PREQUALIFICATION',
            targetState: 'CONDITIONAL_OFFER',
            actorId: 'user_123',
            actorType: 'user',
            prequalificationResults: {
              incomeVerified: false,
              creditCheckPassed: true,
              rentalHistoryVerified: true,
              employmentVerified: true,
            },
            conditionalOfferDetails: {
              unitId: 'unit_123',
              offerLetterDelivered: true,
              deliveryMethod: 'email',
            },
          },
          nycPack
        );

        expect(result.allowed).toBe(false);
        expect(result.violations.some((v) => v.code === 'FCHA_PREQUALIFICATION_INCOMPLETE')).toBe(true);
      });

      it('blocks PREQUALIFICATION -> CONDITIONAL_OFFER without offer letter', () => {
        const result = validateTransition(
          {
            applicationId: 'app_123',
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
              unitId: 'unit_123',
              offerLetterDelivered: false,
              deliveryMethod: 'email',
            },
          },
          nycPack
        );

        expect(result.allowed).toBe(false);
        expect(result.violations.some((v) => v.code === 'FCHA_NOTICE_NOT_ISSUED')).toBe(true);
      });

      it('blocks invalid state transitions', () => {
        const result = validateTransition(
          {
            applicationId: 'app_123',
            currentState: 'PREQUALIFICATION',
            targetState: 'BACKGROUND_CHECK_ALLOWED',
            actorId: 'user_123',
            actorType: 'user',
          },
          nycPack
        );

        expect(result.allowed).toBe(false);
        expect(result.violations.some((v) => v.code === 'FCHA_INVALID_STATE_TRANSITION')).toBe(true);
        expect(result.violations[0]?.evidence?.validNextStates).toEqual(['CONDITIONAL_OFFER', 'DENIED']);
      });

      it('allows CONDITIONAL_OFFER -> BACKGROUND_CHECK_ALLOWED with authorization', () => {
        const result = validateTransition(
          {
            applicationId: 'app_123',
            currentState: 'CONDITIONAL_OFFER',
            targetState: 'BACKGROUND_CHECK_ALLOWED',
            actorId: 'user_123',
            actorType: 'user',
            backgroundCheckAuthorization: {
              authorizationSigned: true,
              signedAt: new Date().toISOString(),
            },
          },
          nycPack
        );

        expect(result.allowed).toBe(true);
        expect(result.evidence?.noticesIssued).toBeDefined();
        expect(result.evidence?.noticesIssued?.some((n) => n.type === 'background_check_authorization')).toBe(true);
      });

      it('blocks CONDITIONAL_OFFER -> BACKGROUND_CHECK_ALLOWED without authorization', () => {
        const result = validateTransition(
          {
            applicationId: 'app_123',
            currentState: 'CONDITIONAL_OFFER',
            targetState: 'BACKGROUND_CHECK_ALLOWED',
            actorId: 'user_123',
            actorType: 'user',
            backgroundCheckAuthorization: {
              authorizationSigned: false,
              signedAt: new Date().toISOString(),
            },
          },
          nycPack
        );

        expect(result.allowed).toBe(false);
        expect(result.violations.some((v) => v.code === 'FCHA_NOTICE_NOT_ISSUED')).toBe(true);
      });

      it('allows BACKGROUND_CHECK_ALLOWED -> INDIVIDUALIZED_ASSESSMENT with adverse info notice', () => {
        const result = validateTransition(
          {
            applicationId: 'app_123',
            currentState: 'BACKGROUND_CHECK_ALLOWED',
            targetState: 'INDIVIDUALIZED_ASSESSMENT',
            actorId: 'user_123',
            actorType: 'user',
            adverseInfoDetails: {
              adverseInfoFound: true,
              adverseInfoSummary: 'Prior conviction found',
              noticeDelivered: true,
            },
          },
          nycPack
        );

        expect(result.allowed).toBe(true);
        expect(result.evidence?.noticesIssued).toBeDefined();
        expect(result.evidence?.responseWindow).toBeDefined();
        expect(result.evidence?.responseWindow?.daysAllowed).toBe(10); // mitigatingFactorsResponseDays
      });

      it('blocks INDIVIDUALIZED_ASSESSMENT -> DENIED without Article 23-A factors', () => {
        const result = validateTransition(
          {
            applicationId: 'app_123',
            currentState: 'INDIVIDUALIZED_ASSESSMENT',
            targetState: 'DENIED',
            actorId: 'user_123',
            actorType: 'user',
            finalDecision: {
              decision: 'denied',
              rationale: 'Criminal history concern',
              article23AFactorsConsidered: [], // Empty!
            },
          },
          nycPack
        );

        expect(result.allowed).toBe(false);
        expect(result.violations.some((v) => v.code === 'FCHA_INDIVIDUALIZED_ASSESSMENT_REQUIRED')).toBe(true);
      });

      it('allows INDIVIDUALIZED_ASSESSMENT -> DENIED with Article 23-A factors', () => {
        const result = validateTransition(
          {
            applicationId: 'app_123',
            currentState: 'INDIVIDUALIZED_ASSESSMENT',
            targetState: 'DENIED',
            actorId: 'user_123',
            actorType: 'user',
            finalDecision: {
              decision: 'denied',
              rationale: 'After individualized assessment considering Article 23-A factors, denial is appropriate',
              article23AFactorsConsidered: [
                'nature_of_offense',
                'time_elapsed_since_offense',
                'relationship_to_housing',
              ],
            },
          },
          nycPack
        );

        expect(result.allowed).toBe(true);
        expect(result.evidence?.noticesIssued?.some((n) => n.type === 'denial_notice')).toBe(true);
      });

      it('allows BACKGROUND_CHECK_ALLOWED -> APPROVED (clear background)', () => {
        const result = validateTransition(
          {
            applicationId: 'app_123',
            currentState: 'BACKGROUND_CHECK_ALLOWED',
            targetState: 'APPROVED',
            actorId: 'user_123',
            actorType: 'user',
            finalDecision: {
              decision: 'approved',
              rationale: 'Background check clear, all criteria met',
            },
          },
          nycPack
        );

        expect(result.allowed).toBe(true);
        expect(result.newRecord?.finalDecisionResult).toBe('approved');
      });
    });

    describe('Non-NYC Market (FCHA Disabled)', () => {
      it('allows all transitions when FCHA is disabled', () => {
        const result = validateTransition(
          {
            applicationId: 'app_123',
            currentState: 'PREQUALIFICATION',
            targetState: 'BACKGROUND_CHECK_ALLOWED', // Would be invalid in NYC
            actorId: 'user_123',
            actorType: 'user',
          },
          txPack
        );

        // Texas doesn't have FCHA, so all transitions allowed
        expect(result.allowed).toBe(true);
      });
    });
  });

  describe('validateBackgroundCheck', () => {
    describe('NYC Market (FCHA Enabled)', () => {
      it('blocks criminal background check in PREQUALIFICATION state', () => {
        const result = validateBackgroundCheck(
          {
            applicationId: 'app_123',
            currentState: 'PREQUALIFICATION',
            checkType: 'criminal_background_check',
            actorId: 'user_123',
          },
          nycPack
        );

        expect(result.allowed).toBe(false);
        expect(result.violations.some((v) => v.code === 'FCHA_BACKGROUND_CHECK_NOT_ALLOWED')).toBe(true);
        expect(result.violations.some((v) => v.code === 'FCHA_CONDITIONAL_OFFER_REQUIRED')).toBe(true);
        expect(result.blockedReason).toContain('PREQUALIFICATION');
        expect(result.blockedReason).toContain('BACKGROUND_CHECK_ALLOWED');
      });

      it('blocks criminal background check in CONDITIONAL_OFFER state', () => {
        const result = validateBackgroundCheck(
          {
            applicationId: 'app_123',
            currentState: 'CONDITIONAL_OFFER',
            checkType: 'criminal_background_check',
            actorId: 'user_123',
          },
          nycPack
        );

        expect(result.allowed).toBe(false);
        expect(result.violations.some((v) => v.code === 'FCHA_BACKGROUND_CHECK_NOT_ALLOWED')).toBe(true);
      });

      it('allows criminal background check in BACKGROUND_CHECK_ALLOWED state', () => {
        const result = validateBackgroundCheck(
          {
            applicationId: 'app_123',
            currentState: 'BACKGROUND_CHECK_ALLOWED',
            checkType: 'criminal_background_check',
            actorId: 'user_123',
          },
          nycPack
        );

        expect(result.allowed).toBe(true);
        expect(result.violations.filter((v) => v.severity === 'critical')).toHaveLength(0);
      });

      it('allows criminal background check in INDIVIDUALIZED_ASSESSMENT state', () => {
        const result = validateBackgroundCheck(
          {
            applicationId: 'app_123',
            currentState: 'INDIVIDUALIZED_ASSESSMENT',
            checkType: 'criminal_history',
            actorId: 'user_123',
          },
          nycPack
        );

        expect(result.allowed).toBe(true);
      });

      it('allows prequalification checks in PREQUALIFICATION state', () => {
        const checks = ['income_verification', 'credit_check', 'rental_history', 'eviction_history'];

        for (const checkType of checks) {
          const result = validateBackgroundCheck(
            {
              applicationId: 'app_123',
              currentState: 'PREQUALIFICATION',
              checkType,
              actorId: 'user_123',
            },
            nycPack
          );

          expect(result.allowed).toBe(true);
        }
      });

      it('blocks all criminal check types before BACKGROUND_CHECK_ALLOWED', () => {
        const criminalChecks = ['criminal_background_check', 'criminal_history', 'arrest_record', 'conviction_record'];

        for (const checkType of criminalChecks) {
          const result = validateBackgroundCheck(
            {
              applicationId: 'app_123',
              currentState: 'PREQUALIFICATION',
              checkType,
              actorId: 'user_123',
            },
            nycPack
          );

          expect(result.allowed).toBe(false);
          expect(result.violations.some((v) => v.code === 'FCHA_BACKGROUND_CHECK_NOT_ALLOWED')).toBe(true);
        }
      });

      it('provides detailed remediation guidance', () => {
        const result = validateBackgroundCheck(
          {
            applicationId: 'app_123',
            currentState: 'PREQUALIFICATION',
            checkType: 'criminal_background_check',
            actorId: 'user_123',
          },
          nycPack
        );

        const violation = result.violations.find((v) => v.code === 'FCHA_CONDITIONAL_OFFER_REQUIRED');
        expect(violation).toBeDefined();
        expect(violation?.evidence?.requiredSteps).toBeDefined();
        expect(Array.isArray(violation?.evidence?.requiredSteps)).toBe(true);
      });

      it('includes rule references in violations', () => {
        const result = validateBackgroundCheck(
          {
            applicationId: 'app_123',
            currentState: 'PREQUALIFICATION',
            checkType: 'criminal_background_check',
            actorId: 'user_123',
          },
          nycPack
        );

        const violation = result.violations.find((v) => v.code === 'FCHA_BACKGROUND_CHECK_NOT_ALLOWED');
        expect(violation?.evidence?.rule).toContain('NYC Admin Code');
        expect(violation?.ruleReference).toContain('Fair Chance Housing');
        expect(violation?.documentationUrl).toBeDefined();
      });
    });

    describe('Non-NYC Market (FCHA Disabled)', () => {
      it('allows criminal background check at any state when FCHA disabled', () => {
        const result = validateBackgroundCheck(
          {
            applicationId: 'app_123',
            currentState: 'PREQUALIFICATION',
            checkType: 'criminal_background_check',
            actorId: 'user_123',
          },
          txPack
        );

        // Texas doesn't have FCHA
        expect(result.allowed).toBe(true);
      });
    });
  });

  describe('Evidence and Audit Trail', () => {
    it('generates transition evidence with complete metadata', () => {
      const result = validateTransition(
        {
          applicationId: 'app_123',
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
            unitId: 'unit_123',
            offerLetterDelivered: true,
            deliveryMethod: 'email',
          },
        },
        nycPack
      );

      expect(result.evidence).toBeDefined();
      expect(result.evidence?.applicationId).toBe('app_123');
      expect(result.evidence?.transitionId).toBeDefined();
      expect(result.evidence?.timestamp).toBeDefined();
      expect(result.evidence?.actorId).toBe('user_123');
      expect(result.evidence?.actorType).toBe('user');
      expect(result.evidence?.fromState).toBe('PREQUALIFICATION');
      expect(result.evidence?.toState).toBe('CONDITIONAL_OFFER');
    });

    it('records notices issued in evidence', () => {
      const result = validateTransition(
        {
          applicationId: 'app_123',
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
            unitId: 'unit_123',
            offerLetterDelivered: true,
            deliveryMethod: 'email',
          },
        },
        nycPack
      );

      expect(result.evidence?.noticesIssued).toBeDefined();
      expect(result.evidence?.noticesIssued?.length).toBeGreaterThan(0);
      expect(result.evidence?.noticesIssued?.[0]?.type).toBe('conditional_offer_letter');
      expect(result.evidence?.noticesIssued?.[0]?.deliveryMethod).toBe('email');
    });

    it('records response window for individualized assessment', () => {
      const result = validateTransition(
        {
          applicationId: 'app_123',
          currentState: 'BACKGROUND_CHECK_ALLOWED',
          targetState: 'INDIVIDUALIZED_ASSESSMENT',
          actorId: 'user_123',
          actorType: 'user',
          adverseInfoDetails: {
            adverseInfoFound: true,
            adverseInfoSummary: 'Prior conviction',
            noticeDelivered: true,
          },
        },
        nycPack
      );

      expect(result.evidence?.responseWindow).toBeDefined();
      expect(result.evidence?.responseWindow?.opensAt).toBeDefined();
      expect(result.evidence?.responseWindow?.closesAt).toBeDefined();
      expect(result.evidence?.responseWindow?.daysAllowed).toBe(10);
      expect(result.evidence?.responseWindow?.responded).toBe(false);
    });

    it('records prequalification results in evidence', () => {
      const result = validateTransition(
        {
          applicationId: 'app_123',
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
            unitId: 'unit_123',
            offerLetterDelivered: true,
            deliveryMethod: 'email',
          },
        },
        nycPack
      );

      expect(result.evidence?.prequalificationResults).toBeDefined();
      expect(result.evidence?.prequalificationResults?.allCriteriaMet).toBe(true);
    });

    it('generates workflow record with state history', () => {
      const result = validateTransition(
        {
          applicationId: 'app_123',
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
            unitId: 'unit_123',
            offerLetterDelivered: true,
            deliveryMethod: 'email',
          },
        },
        nycPack
      );

      expect(result.newRecord).toBeDefined();
      expect(result.newRecord?.applicationId).toBe('app_123');
      expect(result.newRecord?.currentState).toBe('CONDITIONAL_OFFER');
      expect(result.newRecord?.conditionalOfferIssuedAt).toBeDefined();
      expect(result.newRecord?.conditionalOfferUnitId).toBe('unit_123');
      expect(result.newRecord?.stateHistory).toBeDefined();
      expect(result.newRecord?.stateHistory?.length).toBeGreaterThan(0);
    });
  });
});
