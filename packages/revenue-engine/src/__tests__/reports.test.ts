/**
 * Report Generation Tests
 *
 * Tests for revenue reports, partner payouts, and conversion funnel.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  generateRevenueReport,
  generatePartnerPayoutReport,
  generateConversionFunnelReport,
  buildReportResponse,
} from '../referrals/reports';
import { getReferralTracker, resetReferralTracker, ReferralTracker } from '../referrals/tracker';
import type { PartnerAgreement } from '../types';

// =============================================================================
// Test Setup
// =============================================================================

describe('Report Generation', () => {
  let tracker: ReferralTracker;

  beforeEach(() => {
    resetReferralTracker();
    tracker = getReferralTracker();

    // Register test partner
    const partnerAgreement: PartnerAgreement = {
      id: 'agr_report',
      partnerId: 'partner_report',
      partnerName: 'Report Test Partner',
      productTypes: ['deposit_alternative', 'renters_insurance'],
      revSharePercentage: 25,
      minimumPayout: 50,
      payoutFrequency: 'monthly',
      isActive: true,
      effectiveDate: new Date('2024-01-01'),
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };
    tracker.registerPartnerAgreement(partnerAgreement);
  });

  afterEach(() => {
    resetReferralTracker();
  });

  // ===========================================================================
  // Revenue Report Tests
  // ===========================================================================

  describe('generateRevenueReport', () => {
    it('should generate a revenue report with period', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const report = generateRevenueReport(startDate, endDate);

      expect(report).toBeDefined();
      expect(report.period.start).toEqual(startDate);
      expect(report.period.end).toEqual(endDate);
    });

    it('should include summary statistics', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const report = generateRevenueReport(startDate, endDate);

      expect(report.summary).toBeDefined();
      expect(typeof report.summary.totalRevenue).toBe('number');
      expect(typeof report.summary.totalCommissions).toBe('number');
      expect(typeof report.summary.totalRevShare).toBe('number');
      expect(typeof report.summary.netRevenue).toBe('number');
      expect(typeof report.summary.transactionCount).toBe('number');
    });

    it('should include breakdown by product type', () => {
      const report = generateRevenueReport(new Date('2024-01-01'), new Date('2024-12-31'));

      expect(report.byProduct).toBeDefined();

      // Verify all product types are present in the breakdown
      expect(report.byProduct.deposit_alternative).toBeDefined();
      expect(report.byProduct.renters_insurance).toBeDefined();
      expect(report.byProduct.guarantor).toBeDefined();
      expect(report.byProduct.utility_setup).toBeDefined();
      expect(report.byProduct.moving_service).toBeDefined();
      expect(report.byProduct.vendor_referral).toBeDefined();

      // Each product should have revenue, commissions, and count fields
      for (const product of Object.values(report.byProduct)) {
        expect(typeof product.revenue).toBe('number');
        expect(typeof product.commissions).toBe('number');
        expect(typeof product.count).toBe('number');
      }
    });

    it('should include breakdown by partner', () => {
      // Create partner referrals
      const ref = tracker.createReferral({
        source: 'partner_link',
        partnerId: 'partner_report',
        partnerName: 'Report Test Partner',
        referredUserId: 'user_bp_1',
        productType: 'deposit_alternative',
      });

      tracker.convertReferral({
        referralId: ref.id,
        policyId: 'pol_bp_1',
        transactionAmount: 800,
        commissionAmount: 80,
      });

      const report = generateRevenueReport(new Date('2024-01-01'), new Date('2024-12-31'));

      expect(report.byPartner).toBeDefined();
      expect(Array.isArray(report.byPartner)).toBe(true);
    });

    it('should include top referrals', () => {
      // Create multiple referrals
      for (let i = 0; i < 5; i++) {
        const ref = tracker.createReferral({
          source: 'partner_link',
          partnerId: 'partner_report',
          referredUserId: `user_top_${i}`,
          productType: 'deposit_alternative',
        });

        tracker.convertReferral({
          referralId: ref.id,
          policyId: `pol_top_${i}`,
          transactionAmount: (i + 1) * 200,
          commissionAmount: (i + 1) * 20,
        });
      }

      const report = generateRevenueReport(new Date('2024-01-01'), new Date('2024-12-31'));

      expect(report.topReferrals).toBeDefined();
      expect(Array.isArray(report.topReferrals)).toBe(true);
      expect(report.topReferrals.length).toBeLessThanOrEqual(10);

      // Should be sorted by commission (highest first)
      if (report.topReferrals.length > 1) {
        const first = report.topReferrals[0]?.commissionAmount || 0;
        const second = report.topReferrals[1]?.commissionAmount || 0;
        expect(first).toBeGreaterThanOrEqual(second);
      }
    });

    it('should calculate net revenue correctly', () => {
      // Create and convert a referral
      const ref = tracker.createReferral({
        source: 'partner_link',
        partnerId: 'partner_report',
        referredUserId: 'user_net',
        productType: 'deposit_alternative',
      });

      tracker.convertReferral({
        referralId: ref.id,
        policyId: 'pol_net',
        transactionAmount: 1000,
        commissionAmount: 100,
      });

      const report = generateRevenueReport(new Date('2024-01-01'), new Date('2024-12-31'));

      // Net revenue = total revenue - rev share
      expect(report.summary.netRevenue).toBe(
        report.summary.totalRevenue - report.summary.totalRevShare
      );
    });
  });

  // ===========================================================================
  // Partner Payout Report Tests
  // ===========================================================================

  describe('generatePartnerPayoutReport', () => {
    it('should generate a payout report for a partner', () => {
      const partnerId = 'partner_report';
      const partnerName = 'Report Test Partner';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const report = generatePartnerPayoutReport(partnerId, partnerName, startDate, endDate);

      expect(report).toBeDefined();
      expect(report.partnerId).toBe(partnerId);
      expect(report.partnerName).toBe(partnerName);
      expect(report.period.start).toEqual(startDate);
      expect(report.period.end).toEqual(endDate);
    });

    it('should include pending payouts', () => {
      // Create converted referrals (not yet paid)
      for (let i = 0; i < 3; i++) {
        const ref = tracker.createReferral({
          source: 'partner_link',
          partnerId: 'partner_report',
          referredUserId: `user_pending_${i}`,
          productType: 'deposit_alternative',
        });

        tracker.convertReferral({
          referralId: ref.id,
          policyId: `pol_pending_${i}`,
          transactionAmount: 400,
          commissionAmount: 40,
        });
      }

      const report = generatePartnerPayoutReport(
        'partner_report',
        'Report Test Partner',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      expect(report.pendingPayouts).toBeDefined();
      expect(Array.isArray(report.pendingPayouts)).toBe(true);
      expect(report.totalPending).toBeGreaterThan(0);
    });

    it('should calculate pending payout totals correctly', () => {
      // Create referrals with known values
      for (let i = 0; i < 2; i++) {
        const ref = tracker.createReferral({
          source: 'partner_link',
          partnerId: 'partner_report',
          referredUserId: `user_total_${i}`,
          productType: 'deposit_alternative',
        });

        tracker.convertReferral({
          referralId: ref.id,
          policyId: `pol_total_${i}`,
          transactionAmount: 1000,
          commissionAmount: 100, // 25% rev-share = $25 each
        });
      }

      const report = generatePartnerPayoutReport(
        'partner_report',
        'Report Test Partner',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      // Total pending should be 2 * $25 = $50
      expect(report.totalPending).toBe(50);
    });

    it('should include previous payouts', () => {
      // Create and pay a referral
      const ref = tracker.createReferral({
        source: 'partner_link',
        partnerId: 'partner_report',
        referredUserId: 'user_paid',
        productType: 'deposit_alternative',
      });

      tracker.convertReferral({
        referralId: ref.id,
        policyId: 'pol_paid',
        transactionAmount: 800,
        commissionAmount: 80,
      });

      tracker.markReferralPaid(ref.id, 'ledger_txn_paid');

      const report = generatePartnerPayoutReport(
        'partner_report',
        'Report Test Partner',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      expect(report.previousPayouts).toBeDefined();
      expect(Array.isArray(report.previousPayouts)).toBe(true);
      expect(report.totalPaid).toBeGreaterThanOrEqual(0);
    });

    it('should include payout details with referral info', () => {
      const ref = tracker.createReferral({
        source: 'partner_link',
        partnerId: 'partner_report',
        referredUserId: 'user_detail',
        productType: 'renters_insurance',
      });

      tracker.convertReferral({
        referralId: ref.id,
        policyId: 'pol_detail',
        transactionAmount: 600,
        commissionAmount: 60,
      });

      const report = generatePartnerPayoutReport(
        'partner_report',
        'Report Test Partner',
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      if (report.pendingPayouts.length > 0) {
        const payout = report.pendingPayouts[0]!;
        expect(payout.referralId).toBeDefined();
        expect(payout.productType).toBeDefined();
        expect(payout.transactionAmount).toBeDefined();
        expect(payout.commissionAmount).toBeDefined();
        expect(payout.revShareAmount).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // Conversion Funnel Report Tests
  // ===========================================================================

  describe('generateConversionFunnelReport', () => {
    it('should generate a conversion funnel report', () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      const report = generateConversionFunnelReport(startDate, endDate);

      expect(report).toBeDefined();
      expect(report.period.start).toEqual(startDate);
      expect(report.period.end).toEqual(endDate);
    });

    it('should include funnel stages', () => {
      // Create referrals in various stages
      tracker.createReferral({
        source: 'organic',
        referredUserId: 'user_funnel_1',
        productType: 'deposit_alternative',
      });

      const ref2 = tracker.createReferral({
        source: 'organic',
        referredUserId: 'user_funnel_2',
        productType: 'deposit_alternative',
      });
      tracker.qualifyReferral(ref2.id);

      const ref3 = tracker.createReferral({
        source: 'organic',
        referredUserId: 'user_funnel_3',
        productType: 'deposit_alternative',
      });
      tracker.convertReferral({
        referralId: ref3.id,
        policyId: 'pol_funnel_3',
        transactionAmount: 500,
        commissionAmount: 50,
      });

      const report = generateConversionFunnelReport(
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      expect(report.funnel).toBeDefined();
      expect(Array.isArray(report.funnel)).toBe(true);
      expect(report.funnel.length).toBeGreaterThan(0);

      // Check funnel structure
      for (const stage of report.funnel) {
        expect(stage.stage).toBeDefined();
        expect(typeof stage.count).toBe('number');
        expect(typeof stage.percentage).toBe('number');
        expect(stage.percentage).toBeGreaterThanOrEqual(0);
        expect(stage.percentage).toBeLessThanOrEqual(100);
      }
    });

    it('should calculate percentages correctly', () => {
      // Create 4 referrals, convert 2
      for (let i = 0; i < 4; i++) {
        const ref = tracker.createReferral({
          source: 'organic',
          referredUserId: `user_pct_${i}`,
          productType: 'deposit_alternative',
        });

        if (i < 2) {
          tracker.convertReferral({
            referralId: ref.id,
            policyId: `pol_pct_${i}`,
            transactionAmount: 500,
            commissionAmount: 50,
          });
        }
      }

      const report = generateConversionFunnelReport(
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      // First stage should be 100%
      const firstStage = report.funnel.find((s) => s.stage === 'Referral Created');
      expect(firstStage?.percentage).toBe(100);

      // Converted stage should be 50%
      const convertedStage = report.funnel.find((s) => s.stage === 'Converted');
      expect(convertedStage?.percentage).toBe(50);
    });

    it('should include breakdown by source', () => {
      const report = generateConversionFunnelReport(
        new Date('2024-01-01'),
        new Date('2024-12-31')
      );

      expect(report.bySource).toBeDefined();
      expect(typeof report.bySource).toBe('object');

      // Check expected source categories
      const expectedSources = [
        'partner_link',
        'agent_referral',
        'property_manager',
        'tenant_referral',
        'marketing_campaign',
        'organic',
      ];

      for (const source of expectedSources) {
        const sourceData = report.bySource[source];
        expect(sourceData).toBeDefined();
        expect(typeof sourceData?.conversionRate).toBe('number');
      }
    });
  });

  // ===========================================================================
  // Report Response Builder Tests
  // ===========================================================================

  describe('buildReportResponse', () => {
    it('should wrap data in standard response format', () => {
      const testData = { foo: 'bar', count: 42 };

      const response = buildReportResponse(testData);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(testData);
      expect(response.generatedAt).toBeInstanceOf(Date);
      expect(response.cached).toBe(false);
    });

    it('should indicate cached response when specified', () => {
      const testData = { items: [1, 2, 3] };

      const response = buildReportResponse(testData, true);

      expect(response.cached).toBe(true);
      expect(response.cacheExpiresAt).toBeInstanceOf(Date);

      // Cache should expire in the future
      expect(response.cacheExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should preserve complex data structures', () => {
      const complexData = {
        summary: { total: 100, average: 25 },
        items: [
          { id: 1, name: 'Item 1' },
          { id: 2, name: 'Item 2' },
        ],
        nested: {
          deep: {
            value: 'nested value',
          },
        },
      };

      const response = buildReportResponse(complexData);

      expect(response.data).toEqual(complexData);
      expect(response.data.nested.deep.value).toBe('nested value');
    });
  });
});
