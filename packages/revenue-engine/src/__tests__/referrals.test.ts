/**
 * Referral Allocation Tests
 *
 * Tests for referral tracking, rev-share calculation, and ledger integration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  ReferralTracker,
  createReferralLedgerEntries,
  createReferralTransaction,
  resetReferralTracker,
} from '../referrals/tracker';
import type { PartnerAgreement, Referral } from '../types';

// =============================================================================
// Test Setup
// =============================================================================

describe('ReferralTracker', () => {
  let tracker: ReferralTracker;

  beforeEach(() => {
    resetReferralTracker();
    tracker = new ReferralTracker();
  });

  afterEach(() => {
    resetReferralTracker();
  });

  // ===========================================================================
  // Referral Lifecycle Tests
  // ===========================================================================

  describe('Referral Lifecycle', () => {
    it('should create a referral with pending status', () => {
      const referral = tracker.createReferral({
        source: 'partner_link',
        partnerId: 'partner_123',
        partnerName: 'Test Partner',
        referredUserId: 'user_456',
        productType: 'deposit_alternative',
      });

      expect(referral.id).toBeDefined();
      expect(referral.id).toMatch(/^ref_/);
      expect(referral.status).toBe('pending');
      expect(referral.partnerId).toBe('partner_123');
      expect(referral.partnerName).toBe('Test Partner');
      expect(referral.productType).toBe('deposit_alternative');
      expect(referral.createdAt).toBeInstanceOf(Date);
    });

    it('should qualify a pending referral', () => {
      const referral = tracker.createReferral({
        source: 'agent_referral',
        referredUserId: 'user_789',
        productType: 'renters_insurance',
      });

      const qualified = tracker.qualifyReferral(referral.id);

      expect(qualified.status).toBe('qualified');
      expect(qualified.qualifiedAt).toBeInstanceOf(Date);
      expect(qualified.updatedAt.getTime()).toBeGreaterThanOrEqual(qualified.createdAt.getTime());
    });

    it('should throw when qualifying non-pending referral', () => {
      const referral = tracker.createReferral({
        source: 'organic',
        referredUserId: 'user_123',
        productType: 'deposit_alternative',
      });

      // Qualify it first
      tracker.qualifyReferral(referral.id);

      // Try to qualify again
      expect(() => tracker.qualifyReferral(referral.id)).toThrow('Cannot qualify referral');
    });

    it('should convert a pending referral directly', () => {
      const referral = tracker.createReferral({
        source: 'partner_link',
        partnerId: 'partner_abc',
        referredUserId: 'user_def',
        productType: 'guarantor',
      });

      const converted = tracker.convertReferral({
        referralId: referral.id,
        policyId: 'policy_123',
        transactionAmount: 500,
        commissionAmount: 50,
      });

      expect(converted.status).toBe('converted');
      expect(converted.policyId).toBe('policy_123');
      expect(converted.transactionAmount).toBe(500);
      expect(converted.commissionAmount).toBe(50);
      expect(converted.convertedAt).toBeInstanceOf(Date);
    });

    it('should convert a qualified referral', () => {
      const referral = tracker.createReferral({
        source: 'marketing_campaign',
        campaignId: 'camp_xyz',
        referredUserId: 'user_ghi',
        productType: 'renters_insurance',
      });

      tracker.qualifyReferral(referral.id);

      const converted = tracker.convertReferral({
        referralId: referral.id,
        policyId: 'policy_456',
        transactionAmount: 1200,
        commissionAmount: 120,
      });

      expect(converted.status).toBe('converted');
      expect(converted.transactionAmount).toBe(1200);
    });

    it('should mark a converted referral as paid', () => {
      const referral = tracker.createReferral({
        source: 'partner_link',
        partnerId: 'partner_pay',
        referredUserId: 'user_jkl',
        productType: 'deposit_alternative',
      });

      tracker.convertReferral({
        referralId: referral.id,
        policyId: 'policy_789',
        transactionAmount: 800,
        commissionAmount: 80,
      });

      const paid = tracker.markReferralPaid(referral.id, 'ledger_txn_123');

      expect(paid.status).toBe('paid');
      expect(paid.paidAt).toBeInstanceOf(Date);
      expect(paid.ledgerTransactionId).toBe('ledger_txn_123');
    });

    it('should throw when marking non-converted referral as paid', () => {
      const referral = tracker.createReferral({
        source: 'organic',
        referredUserId: 'user_mno',
        productType: 'guarantor',
      });

      expect(() => tracker.markReferralPaid(referral.id, 'txn_123')).toThrow(
        'Cannot mark referral as paid'
      );
    });

    it('should throw for non-existent referral', () => {
      expect(() => tracker.qualifyReferral('ref_nonexistent')).toThrow('Referral not found');
      expect(() => tracker.convertReferral({
        referralId: 'ref_nonexistent',
        policyId: 'pol_123',
        transactionAmount: 100,
        commissionAmount: 10,
      })).toThrow('Referral not found');
      expect(() => tracker.markReferralPaid('ref_nonexistent', 'txn_123')).toThrow(
        'Referral not found'
      );
    });
  });

  // ===========================================================================
  // Rev-Share Calculation Tests
  // ===========================================================================

  describe('Rev-Share Calculation', () => {
    beforeEach(() => {
      // Register a partner agreement with 30% rev-share
      const agreement: PartnerAgreement = {
        id: 'agr_123',
        partnerId: 'partner_revshare',
        partnerName: 'RevShare Partner',
        productTypes: ['deposit_alternative', 'renters_insurance'],
        revSharePercentage: 30,
        minimumPayout: 50,
        payoutFrequency: 'monthly',
        isActive: true,
        effectiveDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      tracker.registerPartnerAgreement(agreement);
    });

    it('should calculate rev-share on conversion with partner agreement', () => {
      const referral = tracker.createReferral({
        source: 'partner_link',
        partnerId: 'partner_revshare',
        partnerName: 'RevShare Partner',
        referredUserId: 'user_rs1',
        productType: 'deposit_alternative',
      });

      const converted = tracker.convertReferral({
        referralId: referral.id,
        policyId: 'policy_rs1',
        transactionAmount: 1000,
        commissionAmount: 100, // $100 commission
      });

      // 30% of $100 = $30 rev-share
      expect(converted.revSharePercentage).toBe(30);
      expect(converted.revShareAmount).toBe(30);
    });

    it('should not calculate rev-share without partner agreement', () => {
      const referral = tracker.createReferral({
        source: 'organic',
        referredUserId: 'user_nors',
        productType: 'deposit_alternative',
      });

      const converted = tracker.convertReferral({
        referralId: referral.id,
        policyId: 'policy_nors',
        transactionAmount: 1000,
        commissionAmount: 100,
      });

      expect(converted.revShareAmount).toBe(0);
      expect(converted.revSharePercentage).toBe(0);
    });

    it('should calculate rev-share correctly for various amounts', () => {
      const testCases = [
        { commission: 50, expectedRevShare: 15 },
        { commission: 100, expectedRevShare: 30 },
        { commission: 250, expectedRevShare: 75 },
        { commission: 333.33, expectedRevShare: 100 }, // 30% of 333.33 = 100
      ];

      for (const { commission, expectedRevShare } of testCases) {
        const referral = tracker.createReferral({
          source: 'partner_link',
          partnerId: 'partner_revshare',
          referredUserId: `user_${commission}`,
          productType: 'deposit_alternative',
        });

        const converted = tracker.convertReferral({
          referralId: referral.id,
          policyId: `policy_${commission}`,
          transactionAmount: commission * 10,
          commissionAmount: commission,
        });

        expect(converted.revShareAmount).toBe(expectedRevShare);
      }
    });

    it('should not apply rev-share for inactive partner agreement', () => {
      // Register an inactive agreement
      const inactiveAgreement: PartnerAgreement = {
        id: 'agr_inactive',
        partnerId: 'partner_inactive',
        partnerName: 'Inactive Partner',
        productTypes: ['deposit_alternative'],
        revSharePercentage: 25,
        minimumPayout: 50,
        payoutFrequency: 'monthly',
        isActive: false,
        effectiveDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      tracker.registerPartnerAgreement(inactiveAgreement);

      const referral = tracker.createReferral({
        source: 'partner_link',
        partnerId: 'partner_inactive',
        referredUserId: 'user_inactive',
        productType: 'deposit_alternative',
      });

      const converted = tracker.convertReferral({
        referralId: referral.id,
        policyId: 'policy_inactive',
        transactionAmount: 1000,
        commissionAmount: 100,
      });

      expect(converted.revShareAmount).toBe(0);
    });
  });

  // ===========================================================================
  // Stats and Aggregation Tests
  // ===========================================================================

  describe('Statistics and Aggregation', () => {
    it('should get global stats', () => {
      // Create referrals in various states
      const ref1 = tracker.createReferral({
        source: 'organic',
        referredUserId: 'user_1',
        productType: 'deposit_alternative',
      });
      tracker.createReferral({
        source: 'organic',
        referredUserId: 'user_2',
        productType: 'renters_insurance',
      });

      // Convert one
      tracker.convertReferral({
        referralId: ref1.id,
        policyId: 'policy_1',
        transactionAmount: 500,
        commissionAmount: 50,
      });

      const stats = tracker.getGlobalStats();

      expect(stats.totalReferrals).toBe(2);
      expect(stats.pendingReferrals).toBe(1);
      expect(stats.convertedReferrals).toBe(1);
      expect(stats.totalRevenue).toBe(50);
      expect(stats.conversionRate).toBe(50); // 1/2 = 50%
    });

    it('should get partner-specific stats', () => {
      const partnerId = 'partner_stats';

      tracker.registerPartnerAgreement({
        id: 'agr_stats',
        partnerId,
        partnerName: 'Stats Partner',
        productTypes: ['deposit_alternative'],
        revSharePercentage: 20,
        minimumPayout: 25,
        payoutFrequency: 'immediate',
        isActive: true,
        effectiveDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create partner referrals
      const ref1 = tracker.createReferral({
        source: 'partner_link',
        partnerId,
        referredUserId: 'user_p1',
        productType: 'deposit_alternative',
      });
      tracker.createReferral({
        source: 'partner_link',
        partnerId,
        referredUserId: 'user_p2',
        productType: 'deposit_alternative',
      });

      // Convert one with rev-share
      tracker.convertReferral({
        referralId: ref1.id,
        policyId: 'pol_p1',
        transactionAmount: 1000,
        commissionAmount: 100,
      });

      const partnerStats = tracker.getPartnerStats(partnerId);

      expect(partnerStats.totalReferrals).toBe(2);
      expect(partnerStats.pendingReferrals).toBe(1);
      expect(partnerStats.convertedReferrals).toBe(1);
      expect(partnerStats.totalRevenue).toBe(100);
      expect(partnerStats.totalRevShare).toBe(20); // 20% of $100
      expect(partnerStats.conversionRate).toBe(50);
    });

    it('should get pending payouts for a partner', () => {
      const partnerId = 'partner_payout';

      tracker.registerPartnerAgreement({
        id: 'agr_payout',
        partnerId,
        partnerName: 'Payout Partner',
        productTypes: ['deposit_alternative'],
        revSharePercentage: 25,
        minimumPayout: 10,
        payoutFrequency: 'monthly',
        isActive: true,
        effectiveDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Create and convert multiple referrals
      for (let i = 0; i < 3; i++) {
        const ref = tracker.createReferral({
          source: 'partner_link',
          partnerId,
          referredUserId: `user_payout_${i}`,
          productType: 'deposit_alternative',
        });

        tracker.convertReferral({
          referralId: ref.id,
          policyId: `pol_payout_${i}`,
          transactionAmount: 400,
          commissionAmount: 40,
        });
      }

      const { referrals, totalAmount } = tracker.getPendingPayouts(partnerId);

      expect(referrals.length).toBe(3);
      expect(totalAmount).toBe(30); // 3 * $10 (25% of $40)
    });
  });

  // ===========================================================================
  // Retrieval Tests
  // ===========================================================================

  describe('Referral Retrieval', () => {
    it('should get referral by ID', () => {
      const created = tracker.createReferral({
        source: 'organic',
        referredUserId: 'user_get',
        productType: 'guarantor',
      });

      const retrieved = tracker.getReferral(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return undefined for non-existent referral', () => {
      const retrieved = tracker.getReferral('ref_nonexistent');
      expect(retrieved).toBeUndefined();
    });

    it('should get referrals by partner', () => {
      const partnerId = 'partner_bypartner';

      tracker.createReferral({
        source: 'partner_link',
        partnerId,
        referredUserId: 'user_bp1',
        productType: 'deposit_alternative',
      });
      tracker.createReferral({
        source: 'partner_link',
        partnerId,
        referredUserId: 'user_bp2',
        productType: 'renters_insurance',
      });
      tracker.createReferral({
        source: 'organic',
        referredUserId: 'user_bp3',
        productType: 'deposit_alternative',
      });

      const partnerReferrals = tracker.getReferralsByPartner(partnerId);

      expect(partnerReferrals.length).toBe(2);
      expect(partnerReferrals.every((r) => r.partnerId === partnerId)).toBe(true);
    });

    it('should get referrals by status', () => {
      const ref1 = tracker.createReferral({
        source: 'organic',
        referredUserId: 'user_bs1',
        productType: 'deposit_alternative',
      });
      tracker.createReferral({
        source: 'organic',
        referredUserId: 'user_bs2',
        productType: 'renters_insurance',
      });

      // Qualify one
      tracker.qualifyReferral(ref1.id);

      const pendingReferrals = tracker.getReferralsByStatus('pending');
      const qualifiedReferrals = tracker.getReferralsByStatus('qualified');

      expect(pendingReferrals.length).toBe(1);
      expect(qualifiedReferrals.length).toBe(1);
    });
  });
});

// =============================================================================
// Ledger Integration Tests
// =============================================================================

describe('Ledger Integration', () => {
  describe('createReferralLedgerEntries', () => {
    it('should create balanced ledger entries for commission', () => {
      const referral: Referral = {
        id: 'ref_ledger_1',
        source: 'partner_link',
        partnerId: 'partner_ledger',
        partnerName: 'Ledger Partner',
        referredUserId: 'user_ledger',
        productType: 'deposit_alternative',
        status: 'converted',
        transactionAmount: 1000,
        commissionAmount: 100,
        revShareAmount: 30,
        revSharePercentage: 30,
        createdAt: new Date(),
        updatedAt: new Date(),
        convertedAt: new Date(),
      };

      const entries = createReferralLedgerEntries(referral, 100, 30);

      // Check entries exist
      expect(entries.length).toBeGreaterThan(0);

      // Check double-entry balance
      const totalDebits = entries
        .filter((e) => e.isDebit)
        .reduce((sum, e) => sum + e.amount, 0);
      const totalCredits = entries
        .filter((e) => !e.isDebit)
        .reduce((sum, e) => sum + e.amount, 0);

      expect(totalDebits).toBe(totalCredits);
    });

    it('should handle commission without rev-share', () => {
      const referral: Referral = {
        id: 'ref_ledger_2',
        source: 'organic',
        referredUserId: 'user_ledger_2',
        productType: 'renters_insurance',
        status: 'converted',
        transactionAmount: 500,
        commissionAmount: 50,
        revShareAmount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        convertedAt: new Date(),
      };

      const entries = createReferralLedgerEntries(referral, 50, 0);

      // Should still be balanced
      const totalDebits = entries
        .filter((e) => e.isDebit)
        .reduce((sum, e) => sum + e.amount, 0);
      const totalCredits = entries
        .filter((e) => !e.isDebit)
        .reduce((sum, e) => sum + e.amount, 0);

      expect(totalDebits).toBe(totalCredits);
    });
  });

  describe('createReferralTransaction', () => {
    it('should create a ledger transaction for converted referral', () => {
      const referral: Referral = {
        id: 'ref_txn_1',
        source: 'partner_link',
        partnerId: 'partner_txn',
        partnerName: 'Transaction Partner',
        referredUserId: 'user_txn',
        productType: 'deposit_alternative',
        provider: 'jetty',
        status: 'converted',
        transactionAmount: 1000,
        commissionAmount: 100,
        revShareAmount: 25,
        revSharePercentage: 25,
        convertedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const transaction = createReferralTransaction(referral, 'idem_key_123');

      expect(transaction).toBeDefined();
      expect(transaction.id).toBeDefined();
      expect(transaction.type).toBe('partner_commission');
      expect(transaction.idempotencyKey).toBe('idem_key_123');
      expect(transaction.referenceType).toBe('referral');
      expect(transaction.referenceId).toBe(referral.id);
      expect(transaction.entries.length).toBeGreaterThan(0);

      // Check metadata
      expect(transaction.metadata?.partnerId).toBe('partner_txn');
      expect(transaction.metadata?.productType).toBe('deposit_alternative');
      expect(transaction.metadata?.provider).toBe('jetty');
    });

    it('should throw for referral without commission', () => {
      const referral: Referral = {
        id: 'ref_no_comm',
        source: 'organic',
        referredUserId: 'user_no_comm',
        productType: 'deposit_alternative',
        status: 'converted',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => createReferralTransaction(referral, 'idem_key_no_comm')).toThrow(
        'Referral has no commission amount'
      );
    });
  });
});
