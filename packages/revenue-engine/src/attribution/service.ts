/**
 * Partner Attribution Service
 *
 * Manages partner revenue attribution with ledger integration.
 * Tracks expected vs realized revenue through the sales funnel.
 */

import { randomUUID } from 'crypto';

import type {
  PartnerAttribution,
  CreateAttributionInput,
  UpdateAttributionInput,
  AttributionQuery,
  RevenueDashboardData,
  RevenueDashboardQuery,
  PartnerRevenueSummary,
  ProductRevenueSummary,
  ProductType,
} from './types';

// ============================================================================
// Attribution Store Interface
// ============================================================================

export interface AttributionStore {
  create(input: CreateAttributionInput): Promise<PartnerAttribution>;
  get(id: string): Promise<PartnerAttribution | null>;
  update(id: string, input: UpdateAttributionInput): Promise<PartnerAttribution>;
  query(query: AttributionQuery): Promise<{ attributions: PartnerAttribution[]; total: number }>;
  getByPartner(partnerId: string, query?: Partial<AttributionQuery>): Promise<PartnerAttribution[]>;
  getByLease(leaseId: string): Promise<PartnerAttribution[]>;
  getDashboardData(query: RevenueDashboardQuery): Promise<RevenueDashboardData>;
}

// ============================================================================
// In-Memory Attribution Store (for testing/development)
// ============================================================================

export class InMemoryAttributionStore implements AttributionStore {
  private attributions = new Map<string, PartnerAttribution>();

  create(input: CreateAttributionInput): Promise<PartnerAttribution> {
    const now = new Date();
    const attribution: PartnerAttribution = {
      id: randomUUID(),
      partnerId: input.partnerId,
      partnerName: input.partnerName,
      productType: input.productType,
      commissionType: input.commissionType,
      commissionRate: input.commissionRate,
      fixedAmount: input.fixedAmount,
      expectedRevenue: input.expectedRevenue,
      realizedRevenue: 0,
      status: 'pending',
      policyId: input.policyId,
      leaseId: input.leaseId,
      applicationId: input.applicationId,
      organizationId: input.organizationId,
      tenantId: input.tenantId,
      leadSource: input.leadSource,
      campaignId: input.campaignId,
      attributionWindow: input.attributionWindow ?? 30,
      conversionWindow: input.conversionWindow ?? 7,
      metadata: input.metadata,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + (input.attributionWindow ?? 30) * 24 * 60 * 60 * 1000),
    };

    this.attributions.set(attribution.id, attribution);
    return Promise.resolve(attribution);
  }

  get(id: string): Promise<PartnerAttribution | null> {
    return Promise.resolve(this.attributions.get(id) ?? null);
  }

  update(id: string, input: UpdateAttributionInput): Promise<PartnerAttribution> {
    const existing = this.attributions.get(id);
    if (!existing) {
      return Promise.reject(new Error(`Attribution ${id} not found`));
    }

    const now = new Date();
    const updated: PartnerAttribution = {
      ...existing,
      ...input,
      updatedAt: now,
    };

    // Set status-specific timestamps
    if (input.status === 'qualified' && !existing.qualifiedAt) {
      updated.qualifiedAt = now;
    }
    if (input.status === 'realized' && !existing.realizedAt) {
      updated.realizedAt = now;
    }
    if (input.status === 'failed' && !existing.failedAt) {
      updated.failedAt = now;
    }

    this.attributions.set(id, updated);
    return Promise.resolve(updated);
  }

  query(query: AttributionQuery): Promise<{ attributions: PartnerAttribution[]; total: number }> {
    let results = Array.from(this.attributions.values());

    if (query.partnerId) {
      results = results.filter(a => a.partnerId === query.partnerId);
    }
    if (query.productType) {
      results = results.filter(a => a.productType === query.productType);
    }
    if (query.status) {
      results = results.filter(a => a.status === query.status);
    }
    if (query.organizationId) {
      results = results.filter(a => a.organizationId === query.organizationId);
    }
    if (query.leaseId) {
      results = results.filter(a => a.leaseId === query.leaseId);
    }
    if (query.startDate) {
      results = results.filter(a => a.createdAt >= query.startDate!);
    }
    if (query.endDate) {
      results = results.filter(a => a.createdAt <= query.endDate!);
    }

    const total = results.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;

    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    results = results.slice(offset, offset + limit);

    return Promise.resolve({ attributions: results, total });
  }

  async getByPartner(partnerId: string, query?: Partial<AttributionQuery>): Promise<PartnerAttribution[]> {
    const result = await this.query({ ...query, partnerId });
    return result.attributions;
  }

  getByLease(leaseId: string): Promise<PartnerAttribution[]> {
    return Promise.resolve(Array.from(this.attributions.values()).filter(a => a.leaseId === leaseId));
  }

  getDashboardData(query: RevenueDashboardQuery): Promise<RevenueDashboardData> {
    const { startDate, endDate, organizationId, partnerId, productType } = query;

    let attributions = Array.from(this.attributions.values()).filter(
      a => a.createdAt >= startDate && a.createdAt <= endDate
    );

    if (organizationId) {
      attributions = attributions.filter(a => a.organizationId === organizationId);
    }
    if (partnerId) {
      attributions = attributions.filter(a => a.partnerId === partnerId);
    }
    if (productType) {
      attributions = attributions.filter(a => a.productType === productType);
    }

    // Calculate totals
    const totals = {
      expectedRevenue: 0,
      realizedRevenue: 0,
      pendingRevenue: 0,
      failedRevenue: 0,
    };

    for (const a of attributions) {
      totals.expectedRevenue += a.expectedRevenue;
      totals.realizedRevenue += a.realizedRevenue;
      if (a.status === 'pending' || a.status === 'qualified') {
        totals.pendingRevenue += a.expectedRevenue - a.realizedRevenue;
      }
      if (a.status === 'failed') {
        totals.failedRevenue += a.expectedRevenue;
      }
    }

    // Group by partner
    const partnerMap = new Map<string, PartnerRevenueSummary>();
    for (const a of attributions) {
      const existing = partnerMap.get(a.partnerId) ?? {
        partnerId: a.partnerId,
        partnerName: a.partnerName,
        totalExpectedRevenue: 0,
        totalRealizedRevenue: 0,
        pendingCount: 0,
        qualifiedCount: 0,
        realizedCount: 0,
        failedCount: 0,
        conversionRate: 0,
      };

      existing.totalExpectedRevenue += a.expectedRevenue;
      existing.totalRealizedRevenue += a.realizedRevenue;

      if (a.status === 'pending') existing.pendingCount++;
      if (a.status === 'qualified') existing.qualifiedCount++;
      if (a.status === 'realized') existing.realizedCount++;
      if (a.status === 'failed') existing.failedCount++;

      partnerMap.set(a.partnerId, existing);
    }

    // Calculate conversion rates
    for (const summary of partnerMap.values()) {
      const denominator = summary.qualifiedCount + summary.realizedCount + summary.failedCount;
      summary.conversionRate = denominator > 0 ? summary.realizedCount / denominator : 0;
    }

    // Group by product
    const productMap = new Map<ProductType, ProductRevenueSummary>();
    for (const a of attributions) {
      const existing = productMap.get(a.productType) ?? {
        productType: a.productType,
        totalExpectedRevenue: 0,
        totalRealizedRevenue: 0,
        attributionCount: 0,
        averageRevenue: 0,
      };

      existing.totalExpectedRevenue += a.expectedRevenue;
      existing.totalRealizedRevenue += a.realizedRevenue;
      existing.attributionCount++;

      productMap.set(a.productType, existing);
    }

    // Calculate average revenue
    for (const summary of productMap.values()) {
      summary.averageRevenue = summary.attributionCount > 0
        ? summary.totalRealizedRevenue / summary.attributionCount
        : 0;
    }

    // Get recent attributions
    const recentAttributions = attributions
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10);

    return Promise.resolve({
      period: { startDate, endDate },
      totals,
      byPartner: Array.from(partnerMap.values()),
      byProduct: Array.from(productMap.values()),
      recentAttributions,
    });
  }

  // Helper for testing
  clear(): void {
    this.attributions.clear();
  }
}

// ============================================================================
// Attribution Service
// ============================================================================

export interface AttributionServiceOptions {
  store: AttributionStore;
  onAttributionCreated?: (attribution: PartnerAttribution) => Promise<void>;
  onAttributionQualified?: (attribution: PartnerAttribution) => Promise<void>;
  onAttributionRealized?: (attribution: PartnerAttribution) => Promise<void>;
  onAttributionFailed?: (attribution: PartnerAttribution) => Promise<void>;
}

export class AttributionService {
  private store: AttributionStore;
  private hooks: {
    onCreated?: (attribution: PartnerAttribution) => Promise<void>;
    onQualified?: (attribution: PartnerAttribution) => Promise<void>;
    onRealized?: (attribution: PartnerAttribution) => Promise<void>;
    onFailed?: (attribution: PartnerAttribution) => Promise<void>;
  };

  constructor(options: AttributionServiceOptions) {
    this.store = options.store;
    this.hooks = {
      onCreated: options.onAttributionCreated,
      onQualified: options.onAttributionQualified,
      onRealized: options.onAttributionRealized,
      onFailed: options.onAttributionFailed,
    };
  }

  /**
   * Create a new attribution record
   */
  async createAttribution(input: CreateAttributionInput): Promise<PartnerAttribution> {
    const attribution = await this.store.create(input);

    if (this.hooks.onCreated) {
      await this.hooks.onCreated(attribution);
    }

    return attribution;
  }

  /**
   * Get attribution by ID
   */
  async getAttribution(id: string): Promise<PartnerAttribution | null> {
    return this.store.get(id);
  }

  /**
   * Qualify an attribution (lead has been validated)
   */
  async qualifyAttribution(id: string, notes?: string): Promise<PartnerAttribution> {
    const attribution = await this.store.update(id, {
      status: 'qualified',
      notes,
    });

    if (this.hooks.onQualified) {
      await this.hooks.onQualified(attribution);
    }

    return attribution;
  }

  /**
   * Realize revenue from an attribution
   */
  async realizeAttribution(
    id: string,
    realizedRevenue: number,
    ledgerTransactionId?: string
  ): Promise<PartnerAttribution> {
    const attribution = await this.store.update(id, {
      status: 'realized',
      realizedRevenue,
      ledgerTransactionId,
    });

    if (this.hooks.onRealized) {
      await this.hooks.onRealized(attribution);
    }

    return attribution;
  }

  /**
   * Mark attribution as failed
   */
  async failAttribution(id: string, reason?: string): Promise<PartnerAttribution> {
    const attribution = await this.store.update(id, {
      status: 'failed',
      notes: reason,
    });

    if (this.hooks.onFailed) {
      await this.hooks.onFailed(attribution);
    }

    return attribution;
  }

  /**
   * Query attributions
   */
  async queryAttributions(query: AttributionQuery): Promise<{ attributions: PartnerAttribution[]; total: number }> {
    return this.store.query(query);
  }

  /**
   * Get attributions for a specific partner
   */
  async getPartnerAttributions(partnerId: string, query?: Partial<AttributionQuery>): Promise<PartnerAttribution[]> {
    return this.store.getByPartner(partnerId, query);
  }

  /**
   * Get attributions for a lease
   */
  async getLeaseAttributions(leaseId: string): Promise<PartnerAttribution[]> {
    return this.store.getByLease(leaseId);
  }

  /**
   * Get revenue dashboard data
   */
  async getDashboard(query: RevenueDashboardQuery): Promise<RevenueDashboardData> {
    return this.store.getDashboardData(query);
  }

  /**
   * Calculate expected commission for a transaction
   */
  calculateExpectedCommission(
    commissionType: 'percentage' | 'fixed' | 'hybrid',
    transactionAmount: number,
    commissionRate?: number,
    fixedAmount?: number
  ): number {
    switch (commissionType) {
      case 'percentage':
        return transactionAmount * (commissionRate ?? 0);
      case 'fixed':
        return fixedAmount ?? 0;
      case 'hybrid':
        return transactionAmount * (commissionRate ?? 0) + (fixedAmount ?? 0);
      default:
        return 0;
    }
  }
}

// ============================================================================
// Ledger Hook Helpers
// ============================================================================

/**
 * Create ledger entries for partner commission
 */
export function createCommissionLedgerEntries(attribution: PartnerAttribution): {
  debit: { accountCode: string; amount: number };
  credit: { accountCode: string; amount: number };
} {
  const accountCode = getCommissionAccountCode(attribution.productType);

  return {
    debit: {
      accountCode: 'PARTNER_PAYABLE',
      amount: attribution.realizedRevenue,
    },
    credit: {
      accountCode,
      amount: attribution.realizedRevenue,
    },
  };
}

function getCommissionAccountCode(productType: ProductType): string {
  const accountMap: Record<ProductType, string> = {
    deposit_alternative: 'DEPOSIT_ALT_COMMISSION',
    renters_insurance: 'INSURANCE_COMMISSION',
    guarantor: 'GUARANTOR_COMMISSION',
    utilities_concierge: 'UTILITIES_REFERRAL_FEE',
    moving_services: 'MOVING_REFERRAL_FEE',
    vendor_marketplace: 'MARKETPLACE_REFERRAL_FEE',
  };

  return accountMap[productType] ?? 'PARTNER_COMMISSION';
}

// ============================================================================
// Factory
// ============================================================================

let defaultService: AttributionService | null = null;

export function getAttributionService(): AttributionService {
  if (!defaultService) {
    defaultService = new AttributionService({
      store: new InMemoryAttributionStore(),
    });
  }
  return defaultService;
}

export function setAttributionService(service: AttributionService): void {
  defaultService = service;
}
