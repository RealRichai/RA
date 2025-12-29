/**
 * Referral Tracker
 *
 * Attribution and revenue share tracking for partner referrals.
 */

import { randomUUID } from 'crypto';

import { getCommissionAccountForProduct } from '../ledger/accounts';
import { createTransaction, buildCommissionEntries } from '../ledger/transactions';
import type {
  LedgerEntry,
  LedgerTransaction,
  PartnerAgreement,
  PartnerProductType,
  PartnerProvider,
  Referral,
  ReferralSource,
} from '../types';

// =============================================================================
// Referral Tracker
// =============================================================================

export interface CreateReferralInput {
  source: ReferralSource;
  partnerId?: string;
  partnerName?: string;
  campaignId?: string;
  referrerId?: string;
  referredUserId: string;
  productType: PartnerProductType;
  provider?: PartnerProvider;
  metadata?: Record<string, unknown>;
}

export interface ConvertReferralInput {
  referralId: string;
  policyId: string;
  transactionAmount: number;
  commissionAmount: number;
}

export interface ReferralStats {
  totalReferrals: number;
  pendingReferrals: number;
  convertedReferrals: number;
  totalRevenue: number;
  totalRevShare: number;
  conversionRate: number;
}

export class ReferralTracker {
  private referrals: Map<string, Referral> = new Map();
  private partnerAgreements: Map<string, PartnerAgreement> = new Map();

  /**
   * Create a new referral.
   */
  createReferral(input: CreateReferralInput): Referral {
    const now = new Date();
    const referral: Referral = {
      id: `ref_${randomUUID()}`,
      source: input.source,
      partnerId: input.partnerId,
      partnerName: input.partnerName,
      campaignId: input.campaignId,
      referrerId: input.referrerId,
      referredUserId: input.referredUserId,
      productType: input.productType,
      provider: input.provider,
      status: 'pending',
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
    };

    this.referrals.set(referral.id, referral);
    return referral;
  }

  /**
   * Mark a referral as qualified (user signed up, started application, etc.)
   */
  qualifyReferral(referralId: string): Referral {
    const referral = this.referrals.get(referralId);
    if (!referral) {
      throw new Error(`Referral not found: ${referralId}`);
    }

    if (referral.status !== 'pending') {
      throw new Error(`Cannot qualify referral in status: ${referral.status}`);
    }

    referral.status = 'qualified';
    referral.qualifiedAt = new Date();
    referral.updatedAt = new Date();

    return referral;
  }

  /**
   * Convert a referral (policy purchased, transaction completed).
   */
  convertReferral(input: ConvertReferralInput): Referral {
    const referral = this.referrals.get(input.referralId);
    if (!referral) {
      throw new Error(`Referral not found: ${input.referralId}`);
    }

    if (referral.status !== 'pending' && referral.status !== 'qualified') {
      throw new Error(`Cannot convert referral in status: ${referral.status}`);
    }

    // Calculate rev-share if partner agreement exists
    let revShareAmount = 0;
    let revSharePercentage = 0;

    if (referral.partnerId) {
      const agreement = this.partnerAgreements.get(referral.partnerId);
      if (agreement && agreement.isActive) {
        revSharePercentage = agreement.revSharePercentage;
        revShareAmount = (input.commissionAmount * revSharePercentage) / 100;
      }
    }

    referral.status = 'converted';
    referral.convertedAt = new Date();
    referral.policyId = input.policyId;
    referral.transactionAmount = input.transactionAmount;
    referral.commissionAmount = input.commissionAmount;
    referral.revShareAmount = Math.round(revShareAmount * 100) / 100;
    referral.revSharePercentage = revSharePercentage;
    referral.updatedAt = new Date();

    return referral;
  }

  /**
   * Mark a referral as paid (rev-share disbursed).
   */
  markReferralPaid(referralId: string, ledgerTransactionId: string): Referral {
    const referral = this.referrals.get(referralId);
    if (!referral) {
      throw new Error(`Referral not found: ${referralId}`);
    }

    if (referral.status !== 'converted') {
      throw new Error(`Cannot mark referral as paid in status: ${referral.status}`);
    }

    referral.status = 'paid';
    referral.paidAt = new Date();
    referral.ledgerTransactionId = ledgerTransactionId;
    referral.updatedAt = new Date();

    return referral;
  }

  /**
   * Register a partner agreement.
   */
  registerPartnerAgreement(agreement: PartnerAgreement): void {
    this.partnerAgreements.set(agreement.partnerId, agreement);
  }

  /**
   * Get a referral by ID.
   */
  getReferral(referralId: string): Referral | undefined {
    return this.referrals.get(referralId);
  }

  /**
   * Get referrals by partner.
   */
  getReferralsByPartner(partnerId: string): Referral[] {
    return Array.from(this.referrals.values())
      .filter((r) => r.partnerId === partnerId);
  }

  /**
   * Get referrals by status.
   */
  getReferralsByStatus(status: Referral['status']): Referral[] {
    return Array.from(this.referrals.values())
      .filter((r) => r.status === status);
  }

  /**
   * Get pending payouts for a partner.
   */
  getPendingPayouts(partnerId: string): { referrals: Referral[]; totalAmount: number } {
    const referrals = this.getReferralsByPartner(partnerId)
      .filter((r) => r.status === 'converted' && r.revShareAmount && r.revShareAmount > 0);

    const totalAmount = referrals.reduce((sum, r) => sum + (r.revShareAmount || 0), 0);

    return { referrals, totalAmount };
  }

  /**
   * Get partner stats.
   */
  getPartnerStats(partnerId: string): ReferralStats {
    const referrals = this.getReferralsByPartner(partnerId);
    const pending = referrals.filter((r) => r.status === 'pending' || r.status === 'qualified');
    const converted = referrals.filter((r) => r.status === 'converted' || r.status === 'paid');

    const totalRevenue = converted.reduce((sum, r) => sum + (r.commissionAmount || 0), 0);
    const totalRevShare = converted.reduce((sum, r) => sum + (r.revShareAmount || 0), 0);

    return {
      totalReferrals: referrals.length,
      pendingReferrals: pending.length,
      convertedReferrals: converted.length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalRevShare: Math.round(totalRevShare * 100) / 100,
      conversionRate: referrals.length > 0
        ? Math.round((converted.length / referrals.length) * 10000) / 100
        : 0,
    };
  }

  /**
   * Get global stats.
   */
  getGlobalStats(): ReferralStats {
    const referrals = Array.from(this.referrals.values());
    const pending = referrals.filter((r) => r.status === 'pending' || r.status === 'qualified');
    const converted = referrals.filter((r) => r.status === 'converted' || r.status === 'paid');

    const totalRevenue = converted.reduce((sum, r) => sum + (r.commissionAmount || 0), 0);
    const totalRevShare = converted.reduce((sum, r) => sum + (r.revShareAmount || 0), 0);

    return {
      totalReferrals: referrals.length,
      pendingReferrals: pending.length,
      convertedReferrals: converted.length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalRevShare: Math.round(totalRevShare * 100) / 100,
      conversionRate: referrals.length > 0
        ? Math.round((converted.length / referrals.length) * 10000) / 100
        : 0,
    };
  }
}

// =============================================================================
// Referral-to-Ledger Integration
// =============================================================================

/**
 * Create ledger entries for a referral conversion with rev-share.
 */
export function createReferralLedgerEntries(
  referral: Referral,
  commissionAmount: number,
  revShareAmount: number
): LedgerEntry[] {
  const commissionAccount = getCommissionAccountForProduct(referral.productType);

  return buildCommissionEntries(
    commissionAccount,
    commissionAmount,
    revShareAmount > 0,
    revShareAmount
  );
}

/**
 * Create a ledger transaction for a referral conversion.
 */
export function createReferralTransaction(
  referral: Referral,
  idempotencyKey: string
): LedgerTransaction {
  if (!referral.commissionAmount) {
    throw new Error('Referral has no commission amount');
  }

  const entries = createReferralLedgerEntries(
    referral,
    referral.commissionAmount,
    referral.revShareAmount || 0
  );

  return createTransaction({
    type: 'partner_commission',
    entries,
    description: `Commission for referral ${referral.id} - ${referral.productType}`,
    idempotencyKey,
    referenceType: 'referral',
    referenceId: referral.id,
    metadata: {
      partnerId: referral.partnerId,
      partnerName: referral.partnerName,
      productType: referral.productType,
      provider: referral.provider,
      revSharePercentage: referral.revSharePercentage,
    },
  });
}

// =============================================================================
// Singleton
// =============================================================================

let trackerInstance: ReferralTracker | null = null;

export function getReferralTracker(): ReferralTracker {
  if (!trackerInstance) {
    trackerInstance = new ReferralTracker();
  }
  return trackerInstance;
}

export function resetReferralTracker(): void {
  trackerInstance = null;
}
