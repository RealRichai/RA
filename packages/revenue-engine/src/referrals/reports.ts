/**
 * Referral Reports
 *
 * Admin reporting endpoints for referral and revenue tracking.
 */

import type { PartnerProductType, Referral } from '../types';
import { getReferralTracker } from './tracker';

// =============================================================================
// Report Types
// =============================================================================

export interface RevenueReport {
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    totalRevenue: number;
    totalCommissions: number;
    totalRevShare: number;
    netRevenue: number;
    transactionCount: number;
  };
  byProduct: Record<PartnerProductType, {
    revenue: number;
    commissions: number;
    count: number;
  }>;
  byPartner: {
    partnerId: string;
    partnerName: string;
    referrals: number;
    conversions: number;
    commissions: number;
    revShare: number;
  }[];
  topReferrals: Referral[];
}

export interface PartnerPayoutReport {
  partnerId: string;
  partnerName: string;
  period: {
    start: Date;
    end: Date;
  };
  pendingPayouts: {
    referralId: string;
    convertedAt: Date;
    productType: PartnerProductType;
    transactionAmount: number;
    commissionAmount: number;
    revShareAmount: number;
  }[];
  totalPending: number;
  previousPayouts: {
    paidAt: Date;
    amount: number;
    referralCount: number;
    ledgerTransactionId: string;
  }[];
  totalPaid: number;
}

export interface ConversionFunnelReport {
  period: {
    start: Date;
    end: Date;
  };
  funnel: {
    stage: string;
    count: number;
    percentage: number;
  }[];
  bySource: Record<string, {
    pending: number;
    qualified: number;
    converted: number;
    conversionRate: number;
  }>;
}

// =============================================================================
// Report Generators
// =============================================================================

/**
 * Generate a revenue report for a given period.
 */
export function generateRevenueReport(
  startDate: Date,
  endDate: Date
): RevenueReport {
  const tracker = getReferralTracker();
  const stats = tracker.getGlobalStats();

  // Get all referrals (in real implementation, filter by date)
  const allReferrals = Array.from({ length: 10 }, (_, i) => {
    // Mock data - in real implementation, query from database
    return tracker.getReferral(`ref_${i}`) || null;
  }).filter((r): r is Referral => r !== null);

  const convertedReferrals = allReferrals.filter(
    (r) => r.status === 'converted' || r.status === 'paid'
  );

  // Calculate by product
  const byProduct: RevenueReport['byProduct'] = {
    deposit_alternative: { revenue: 0, commissions: 0, count: 0 },
    renters_insurance: { revenue: 0, commissions: 0, count: 0 },
    guarantor: { revenue: 0, commissions: 0, count: 0 },
    utility_setup: { revenue: 0, commissions: 0, count: 0 },
    moving_service: { revenue: 0, commissions: 0, count: 0 },
    vendor_referral: { revenue: 0, commissions: 0, count: 0 },
  };

  for (const referral of convertedReferrals) {
    const product = byProduct[referral.productType];
    if (product) {
      product.revenue += referral.transactionAmount || 0;
      product.commissions += referral.commissionAmount || 0;
      product.count += 1;
    }
  }

  // Calculate by partner
  const partnerMap = new Map<string, {
    partnerId: string;
    partnerName: string;
    referrals: number;
    conversions: number;
    commissions: number;
    revShare: number;
  }>();

  for (const referral of allReferrals) {
    if (!referral.partnerId) continue;

    if (!partnerMap.has(referral.partnerId)) {
      partnerMap.set(referral.partnerId, {
        partnerId: referral.partnerId,
        partnerName: referral.partnerName || 'Unknown',
        referrals: 0,
        conversions: 0,
        commissions: 0,
        revShare: 0,
      });
    }

    const partner = partnerMap.get(referral.partnerId)!;
    partner.referrals += 1;

    if (referral.status === 'converted' || referral.status === 'paid') {
      partner.conversions += 1;
      partner.commissions += referral.commissionAmount || 0;
      partner.revShare += referral.revShareAmount || 0;
    }
  }

  const totalRevenue = stats.totalRevenue;
  const totalRevShare = stats.totalRevShare;

  return {
    period: { start: startDate, end: endDate },
    summary: {
      totalRevenue,
      totalCommissions: totalRevenue,
      totalRevShare,
      netRevenue: totalRevenue - totalRevShare,
      transactionCount: stats.convertedReferrals,
    },
    byProduct,
    byPartner: Array.from(partnerMap.values()),
    topReferrals: convertedReferrals
      .sort((a, b) => (b.commissionAmount || 0) - (a.commissionAmount || 0))
      .slice(0, 10),
  };
}

/**
 * Generate a payout report for a partner.
 */
export function generatePartnerPayoutReport(
  partnerId: string,
  partnerName: string,
  startDate: Date,
  endDate: Date
): PartnerPayoutReport {
  const tracker = getReferralTracker();
  const { referrals: pendingReferrals, totalAmount } = tracker.getPendingPayouts(partnerId);

  const pendingPayouts = pendingReferrals.map((r) => ({
    referralId: r.id,
    convertedAt: r.convertedAt || new Date(),
    productType: r.productType,
    transactionAmount: r.transactionAmount || 0,
    commissionAmount: r.commissionAmount || 0,
    revShareAmount: r.revShareAmount || 0,
  }));

  // Get paid referrals
  const paidReferrals = tracker.getReferralsByPartner(partnerId)
    .filter((r) => r.status === 'paid');

  const totalPaid = paidReferrals.reduce((sum, r) => sum + (r.revShareAmount || 0), 0);

  return {
    partnerId,
    partnerName,
    period: { start: startDate, end: endDate },
    pendingPayouts,
    totalPending: Math.round(totalAmount * 100) / 100,
    previousPayouts: [], // Would be populated from ledger transactions
    totalPaid: Math.round(totalPaid * 100) / 100,
  };
}

/**
 * Generate a conversion funnel report.
 */
export function generateConversionFunnelReport(
  startDate: Date,
  endDate: Date
): ConversionFunnelReport {
  const tracker = getReferralTracker();
  const stats = tracker.getGlobalStats();

  const total = stats.totalReferrals || 1; // Avoid division by zero

  return {
    period: { start: startDate, end: endDate },
    funnel: [
      {
        stage: 'Referral Created',
        count: stats.totalReferrals,
        percentage: 100,
      },
      {
        stage: 'Qualified',
        count: stats.pendingReferrals,
        percentage: Math.round((stats.pendingReferrals / total) * 10000) / 100,
      },
      {
        stage: 'Converted',
        count: stats.convertedReferrals,
        percentage: Math.round((stats.convertedReferrals / total) * 10000) / 100,
      },
    ],
    bySource: {
      partner_link: { pending: 0, qualified: 0, converted: 0, conversionRate: 0 },
      agent_referral: { pending: 0, qualified: 0, converted: 0, conversionRate: 0 },
      property_manager: { pending: 0, qualified: 0, converted: 0, conversionRate: 0 },
      tenant_referral: { pending: 0, qualified: 0, converted: 0, conversionRate: 0 },
      marketing_campaign: { pending: 0, qualified: 0, converted: 0, conversionRate: 0 },
      organic: { pending: 0, qualified: 0, converted: 0, conversionRate: 0 },
    },
  };
}

// =============================================================================
// Admin API Response Builders
// =============================================================================

export interface AdminReportResponse<T> {
  success: boolean;
  data: T;
  generatedAt: Date;
  cached: boolean;
  cacheExpiresAt?: Date;
}

export function buildReportResponse<T>(data: T, cached: boolean = false): AdminReportResponse<T> {
  return {
    success: true,
    data,
    generatedAt: new Date(),
    cached,
    cacheExpiresAt: cached ? new Date(Date.now() + 5 * 60 * 1000) : undefined,
  };
}
