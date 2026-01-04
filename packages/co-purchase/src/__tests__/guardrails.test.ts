/**
 * Guardrails Tests
 *
 * Critical tests to ensure non-custodial constraints are enforced.
 */

import { describe, it, expect } from 'vitest';
import {
  BlockedActionError,
  assertNonCustodial,
  isActionBlocked,
  getAllBlockedActions,
  BLOCKED_ACTION_DISCLAIMER,
  UI_DISCLAIMER_SHORT,
  containsCustodialKeywords,
  getCustodialWarning,
  type BlockedActionType,
} from '../guardrails/blocked-actions';

describe('Guardrails', () => {
  describe('BlockedActionError', () => {
    it('should create error with correct properties', () => {
      const error = new BlockedActionError('ESCROW_CREATION', 'group-123', 'user-456');

      expect(error.name).toBe('BlockedActionError');
      expect(error.actionType).toBe('ESCROW_CREATION');
      expect(error.groupId).toBe('group-123');
      expect(error.userId).toBe('user-456');
      expect(error.httpStatusCode).toBe(403);
      expect(error.message).toContain('escrow');
    });

    it('should serialize to JSON correctly', () => {
      const error = new BlockedActionError('FUNDS_HANDLING');
      const json = error.toJSON();

      expect(json.error).toBe('BLOCKED_ACTION');
      expect(json.code).toBe('FUNDS_HANDLING');
      expect(json.message).toBeDefined();
      expect(json.disclaimer).toBe(UI_DISCLAIMER_SHORT);
    });
  });

  describe('assertNonCustodial', () => {
    it('should throw BlockedActionError for escrow creation', () => {
      expect(() => assertNonCustodial('ESCROW_CREATION')).toThrow(BlockedActionError);
    });

    it('should throw BlockedActionError for funds handling', () => {
      expect(() => assertNonCustodial('FUNDS_HANDLING')).toThrow(BlockedActionError);
    });

    it('should throw BlockedActionError for investment marketplace', () => {
      expect(() => assertNonCustodial('INVESTMENT_MARKETPLACE')).toThrow(BlockedActionError);
    });

    it('should throw BlockedActionError for property purchase', () => {
      expect(() => assertNonCustodial('PROPERTY_PURCHASE')).toThrow(BlockedActionError);
    });

    it('should throw BlockedActionError for payment processing', () => {
      expect(() => assertNonCustodial('PAYMENT_PROCESSING')).toThrow(BlockedActionError);
    });

    it('should include context in thrown error', () => {
      try {
        assertNonCustodial('ESCROW_CREATION', { groupId: 'group-123', userId: 'user-456' });
      } catch (error) {
        expect(error).toBeInstanceOf(BlockedActionError);
        expect((error as BlockedActionError).groupId).toBe('group-123');
        expect((error as BlockedActionError).userId).toBe('user-456');
      }
    });
  });

  describe('isActionBlocked', () => {
    const allBlockedActions: BlockedActionType[] = [
      'ESCROW_CREATION',
      'ESCROW_RELEASE',
      'ESCROW_MANAGEMENT',
      'FUNDS_DEPOSIT',
      'FUNDS_WITHDRAWAL',
      'FUNDS_TRANSFER',
      'FUNDS_HOLDING',
      'FUNDS_HANDLING',
      'INVESTMENT_OFFERING',
      'INVESTMENT_ACCEPTANCE',
      'INVESTMENT_MARKETPLACE',
      'INVESTMENT_SOLICITATION',
      'PROPERTY_PURCHASE',
      'PROPERTY_SALE',
      'PROPERTY_TRANSFER',
      'CONTRACT_EXECUTION',
      'CONTRACT_SIGNING',
      'PAYMENT_PROCESSING',
      'PAYMENT_COLLECTION',
      'LOAN_ORIGINATION',
      'MORTGAGE_PROCESSING',
      'SECURITIES_ISSUANCE',
      'SYNDICATION_MANAGEMENT',
    ];

    it.each(allBlockedActions)('should return true for blocked action: %s', (action) => {
      expect(isActionBlocked(action)).toBe(true);
    });
  });

  describe('getAllBlockedActions', () => {
    it('should return all blocked action types', () => {
      const actions = getAllBlockedActions();

      expect(actions).toContain('ESCROW_CREATION');
      expect(actions).toContain('FUNDS_HANDLING');
      expect(actions).toContain('INVESTMENT_MARKETPLACE');
      expect(actions).toContain('PROPERTY_PURCHASE');
      expect(actions).toContain('PAYMENT_PROCESSING');
      expect(actions.length).toBeGreaterThan(20);
    });
  });

  describe('BLOCKED_ACTION_DISCLAIMER', () => {
    it('should contain non-custodial statement', () => {
      expect(BLOCKED_ACTION_DISCLAIMER).toContain('NON-CUSTODIAL');
    });

    it('should list what platform provides', () => {
      expect(BLOCKED_ACTION_DISCLAIMER).toContain('Group organization');
      expect(BLOCKED_ACTION_DISCLAIMER).toContain('Identity verification');
      expect(BLOCKED_ACTION_DISCLAIMER).toContain('Document collection');
      expect(BLOCKED_ACTION_DISCLAIMER).toContain('Progress tracking');
    });

    it('should list what platform does NOT provide', () => {
      expect(BLOCKED_ACTION_DISCLAIMER).toContain('DO NOT');
      expect(BLOCKED_ACTION_DISCLAIMER).toContain('Escrow');
      expect(BLOCKED_ACTION_DISCLAIMER).toContain('Investment');
      expect(BLOCKED_ACTION_DISCLAIMER).toContain('Property purchase');
    });

    it('should recommend licensed professionals', () => {
      expect(BLOCKED_ACTION_DISCLAIMER).toContain('licensed');
      expect(BLOCKED_ACTION_DISCLAIMER).toContain('attorney');
    });
  });

  describe('containsCustodialKeywords', () => {
    it('should detect escrow keyword', () => {
      const matches = containsCustodialKeywords('We need to set up escrow for this deal');
      expect(matches).toContain('escrow');
    });

    it('should detect investment keywords', () => {
      const matches = containsCustodialKeywords('This is a great investment opportunity');
      expect(matches).toContain('invest');
    });

    it('should detect payment keywords', () => {
      const matches = containsCustodialKeywords('Send money to the group account');
      expect(matches).toContain('send money');
    });

    it('should detect property purchase keywords', () => {
      const matches = containsCustodialKeywords("Let's buy property together");
      expect(matches).toContain('buy property');
    });

    it('should return empty array for safe text', () => {
      const matches = containsCustodialKeywords(
        'Please upload your documents and complete verification'
      );
      expect(matches).toHaveLength(0);
    });

    it('should be case insensitive', () => {
      const matches = containsCustodialKeywords('ESCROW and INVESTMENT');
      expect(matches).toContain('escrow');
      expect(matches).toContain('invest');
    });
  });

  describe('getCustodialWarning', () => {
    it('should return warning for custodial keywords', () => {
      const warning = getCustodialWarning('We need escrow for this investment');

      expect(warning).not.toBeNull();
      expect(warning).toContain('escrow');
      expect(warning).toContain('invest');
      expect(warning).toContain('collaboration platform only');
    });

    it('should return null for safe text', () => {
      const warning = getCustodialWarning('Please complete your verification');
      expect(warning).toBeNull();
    });
  });
});

describe('All Custodial Actions Are Blocked', () => {
  /**
   * CRITICAL: This test ensures ALL custodial actions throw errors.
   * If you add a new BlockedActionType, this test will catch it.
   */
  it('should block every action type defined in BlockedActionType', () => {
    const allActions = getAllBlockedActions();

    for (const action of allActions) {
      expect(() => assertNonCustodial(action)).toThrow(BlockedActionError);
    }
  });

  it('should have at least 20 blocked action types', () => {
    // Sanity check - we should be blocking many action types
    const allActions = getAllBlockedActions();
    expect(allActions.length).toBeGreaterThanOrEqual(20);
  });
});
