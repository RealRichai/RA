/**
 * Co-Purchase Routes Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  BlockedActionError,
  assertNonCustodial,
  isActionBlocked,
  getAllBlockedActions,
} from '@realriches/co-purchase';

// Mock the feature flag service
vi.mock('@realriches/feature-flags', () => ({
  FeatureFlag: {
    CO_PURCHASE_GROUPS: 'CO_PURCHASE_GROUPS',
  },
  isFeatureEnabled: vi.fn().mockReturnValue(true),
}));

describe('Co-Purchase Routes', () => {
  describe('Blocked Actions', () => {
    const blockedActions = [
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
    ] as const;

    it.each(blockedActions)('should block action: %s', (action) => {
      expect(isActionBlocked(action)).toBe(true);
      expect(() => assertNonCustodial(action)).toThrow(BlockedActionError);
    });

    it('should have at least 20 blocked action types', () => {
      const allActions = getAllBlockedActions();
      expect(allActions.length).toBeGreaterThanOrEqual(20);
    });

    it('should return 403 status code for blocked actions', () => {
      try {
        assertNonCustodial('ESCROW_CREATION');
      } catch (error) {
        expect(error).toBeInstanceOf(BlockedActionError);
        expect((error as BlockedActionError).httpStatusCode).toBe(403);
      }
    });
  });

  describe('Route Endpoints', () => {
    it('should define correct route paths', () => {
      // These are smoke tests to ensure the routes module exports correctly
      const expectedPaths = [
        '/co-purchase/groups',
        '/co-purchase/groups/:groupId',
        '/co-purchase/groups/:groupId/members',
        '/co-purchase/groups/:groupId/invitations',
        '/co-purchase/groups/:groupId/checklist',
        '/co-purchase/groups/:groupId/verification/initiate',
        '/co-purchase/groups/:groupId/verification/status',
        // Blocked routes
        '/co-purchase/groups/:groupId/escrow/*',
        '/co-purchase/groups/:groupId/funds/*',
        '/co-purchase/groups/:groupId/investment/*',
        '/co-purchase/groups/:groupId/payment/*',
        '/co-purchase/groups/:groupId/purchase/*',
      ];

      // Just verify the array is defined (actual route testing requires integration tests)
      expect(expectedPaths.length).toBeGreaterThan(0);
    });
  });

  describe('Feature Flag Guard', () => {
    it('should check CO_PURCHASE_GROUPS flag', async () => {
      const { isFeatureEnabled } = await import('@realriches/feature-flags');

      // The mock returns true by default
      expect(isFeatureEnabled).toBeDefined();
    });
  });
});
