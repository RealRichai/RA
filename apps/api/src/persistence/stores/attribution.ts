/**
 * Prisma-backed Attribution Store
 *
 * Production implementation of AttributionStore using Prisma/PostgreSQL.
 * Supports transaction propagation for atomic ledger operations.
 *
 * @see apps/api/src/persistence/index.ts - Composition root
 * @see docs/architecture/transactions.md - Transaction patterns
 */

import {
  Prisma,
  prisma,
  withLedgerTransaction,
  withSerializableTransactionOrExisting,
  type TransactionClient,
} from '@realriches/database';
import type {
  AttributionStore,
  PartnerAttribution,
  CreateAttributionInput,
  UpdateAttributionInput,
  AttributionQuery,
  RevenueDashboardData,
  RevenueDashboardQuery,
  ProductType,
} from '@realriches/revenue-engine';

/**
 * Convert Prisma decimal to number
 */
function decimalToNumber(val: { toNumber(): number } | null | undefined): number | undefined {
  if (val === null || val === undefined) return undefined;
  return val.toNumber();
}

/**
 * Convert database record to domain type
 */
function toDomain(
  record: Awaited<ReturnType<typeof prisma.partnerAttribution.findUnique>>
): PartnerAttribution | null {
  if (!record) return null;

  return {
    id: record.id,
    partnerId: record.partnerId,
    partnerName: record.partnerName,
    productType: record.productType as ProductType,
    commissionType: record.commissionType as 'percentage' | 'fixed' | 'hybrid',
    commissionRate: decimalToNumber(record.commissionRate),
    fixedAmount: decimalToNumber(record.fixedAmount),
    expectedRevenue: record.expectedRevenue.toNumber(),
    realizedRevenue: record.realizedRevenue.toNumber(),
    status: record.status as PartnerAttribution['status'],
    policyId: record.policyId ?? undefined,
    leaseId: record.leaseId ?? undefined,
    applicationId: record.applicationId ?? undefined,
    organizationId: record.organizationId ?? undefined,
    tenantId: record.tenantId ?? undefined,
    ledgerTransactionId: record.ledgerTransactionId ?? undefined,
    leadSource: record.leadSource ?? undefined,
    campaignId: record.campaignId ?? undefined,
    attributionWindow: record.attributionWindow,
    conversionWindow: record.conversionWindow,
    qualifiedAt: record.qualifiedAt ?? undefined,
    realizedAt: record.realizedAt ?? undefined,
    failedAt: record.failedAt ?? undefined,
    expiresAt: record.expiresAt ?? undefined,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    metadata: record.metadata as Record<string, unknown> | undefined,
    notes: record.notes ?? undefined,
  };
}

/**
 * Prisma-backed implementation of AttributionStore.
 * Used in production environments for durable persistence.
 */
export class PrismaAttributionStore implements AttributionStore {
  async create(input: CreateAttributionInput): Promise<PartnerAttribution> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (input.attributionWindow ?? 30) * 24 * 60 * 60 * 1000);

    const record = await prisma.partnerAttribution.create({
      data: {
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
        expiresAt,
        metadata: input.metadata as Prisma.InputJsonValue,
      },
    });

    return toDomain(record)!;
  }

  async get(id: string): Promise<PartnerAttribution | null> {
    const record = await prisma.partnerAttribution.findUnique({
      where: { id },
    });
    return toDomain(record);
  }

  async update(id: string, input: UpdateAttributionInput): Promise<PartnerAttribution> {
    const now = new Date();

    // Build update data
    const data: Prisma.PartnerAttributionUpdateInput = {
      updatedAt: now,
    };

    if (input.status !== undefined) {
      data.status = input.status;

      // Set status-specific timestamps
      if (input.status === 'qualified') {
        data.qualifiedAt = now;
      } else if (input.status === 'realized') {
        data.realizedAt = now;
      } else if (input.status === 'failed') {
        data.failedAt = now;
      }
    }

    if (input.realizedRevenue !== undefined) {
      data.realizedRevenue = input.realizedRevenue;
    }

    if (input.ledgerTransactionId !== undefined) {
      data.ledgerTransactionId = input.ledgerTransactionId;
    }

    if (input.notes !== undefined) {
      data.notes = input.notes;
    }

    if (input.metadata !== undefined) {
      data.metadata = input.metadata as Prisma.InputJsonValue;
    }

    const record = await prisma.partnerAttribution.update({
      where: { id },
      data,
    });

    return toDomain(record)!;
  }

  async query(query: AttributionQuery): Promise<{ attributions: PartnerAttribution[]; total: number }> {
    const where: Prisma.PartnerAttributionWhereInput = {};

    if (query.partnerId) {
      where.partnerId = query.partnerId;
    }
    if (query.productType) {
      where.productType = query.productType;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.organizationId) {
      where.organizationId = query.organizationId;
    }
    if (query.leaseId) {
      where.leaseId = query.leaseId;
    }
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = query.startDate;
      }
      if (query.endDate) {
        where.createdAt.lte = query.endDate;
      }
    }

    const [records, total] = await Promise.all([
      prisma.partnerAttribution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.offset ?? 0,
        take: query.limit ?? 50,
      }),
      prisma.partnerAttribution.count({ where }),
    ]);

    return {
      attributions: records.map(r => toDomain(r)!),
      total,
    };
  }

  async getByPartner(partnerId: string, query?: Partial<AttributionQuery>): Promise<PartnerAttribution[]> {
    const result = await this.query({ ...query, partnerId });
    return result.attributions;
  }

  async getByLease(leaseId: string): Promise<PartnerAttribution[]> {
    const records = await prisma.partnerAttribution.findMany({
      where: { leaseId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(r => toDomain(r)!);
  }

  async getDashboardData(query: RevenueDashboardQuery): Promise<RevenueDashboardData> {
    const { startDate, endDate, organizationId, partnerId, productType } = query;

    const where: Prisma.PartnerAttributionWhereInput = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (organizationId) {
      where.organizationId = organizationId;
    }
    if (partnerId) {
      where.partnerId = partnerId;
    }
    if (productType) {
      where.productType = productType;
    }

    // Get all attributions in range
    const attributions = await prisma.partnerAttribution.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Calculate totals
    const totals = {
      expectedRevenue: 0,
      realizedRevenue: 0,
      pendingRevenue: 0,
      failedRevenue: 0,
    };

    for (const a of attributions) {
      const expected = a.expectedRevenue.toNumber();
      const realized = a.realizedRevenue.toNumber();
      totals.expectedRevenue += expected;
      totals.realizedRevenue += realized;

      if (a.status === 'pending' || a.status === 'qualified') {
        totals.pendingRevenue += expected - realized;
      }
      if (a.status === 'failed') {
        totals.failedRevenue += expected;
      }
    }

    // Group by partner
    const partnerMap = new Map<string, {
      partnerId: string;
      partnerName: string;
      totalExpectedRevenue: number;
      totalRealizedRevenue: number;
      pendingCount: number;
      qualifiedCount: number;
      realizedCount: number;
      failedCount: number;
      conversionRate: number;
    }>();

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

      existing.totalExpectedRevenue += a.expectedRevenue.toNumber();
      existing.totalRealizedRevenue += a.realizedRevenue.toNumber();

      if (a.status === 'pending') existing.pendingCount++;
      if (a.status === 'qualified') existing.qualifiedCount++;
      if (a.status === 'realized') existing.realizedCount++;
      if (a.status === 'failed') existing.failedCount++;

      partnerMap.set(a.partnerId, existing);
    }

    // Calculate conversion rates
    for (const summary of partnerMap.values()) {
      const denom = summary.qualifiedCount + summary.realizedCount + summary.failedCount;
      summary.conversionRate = denom > 0 ? summary.realizedCount / denom : 0;
    }

    // Group by product
    const productMap = new Map<string, {
      productType: ProductType;
      totalExpectedRevenue: number;
      totalRealizedRevenue: number;
      attributionCount: number;
      averageRevenue: number;
    }>();

    for (const a of attributions) {
      const existing = productMap.get(a.productType) ?? {
        productType: a.productType as ProductType,
        totalExpectedRevenue: 0,
        totalRealizedRevenue: 0,
        attributionCount: 0,
        averageRevenue: 0,
      };

      existing.totalExpectedRevenue += a.expectedRevenue.toNumber();
      existing.totalRealizedRevenue += a.realizedRevenue.toNumber();
      existing.attributionCount++;

      productMap.set(a.productType, existing);
    }

    // Calculate average revenue
    for (const summary of productMap.values()) {
      summary.averageRevenue = summary.attributionCount > 0
        ? summary.totalRealizedRevenue / summary.attributionCount
        : 0;
    }

    // Get recent attributions (top 10)
    const recentAttributions = attributions
      .slice(0, 10)
      .map(r => toDomain(r)!);

    return {
      period: { startDate, endDate },
      totals,
      byPartner: Array.from(partnerMap.values()),
      byProduct: Array.from(productMap.values()),
      recentAttributions,
    };
  }

  // =========================================================================
  // Transaction-aware Methods (for atomic ledger operations)
  // =========================================================================

  /**
   * Update attribution within an existing transaction.
   * Use this when coordinating attribution updates with ledger entries.
   */
  async updateWithTx(
    id: string,
    input: UpdateAttributionInput,
    tx?: TransactionClient
  ): Promise<PartnerAttribution> {
    return withSerializableTransactionOrExisting(tx, async (client) => {
      const now = new Date();

      const data: Prisma.PartnerAttributionUpdateInput = {
        updatedAt: now,
      };

      if (input.status !== undefined) {
        data.status = input.status;

        if (input.status === 'qualified') {
          data.qualifiedAt = now;
        } else if (input.status === 'realized') {
          data.realizedAt = now;
        } else if (input.status === 'failed') {
          data.failedAt = now;
        }
      }

      if (input.realizedRevenue !== undefined) {
        data.realizedRevenue = input.realizedRevenue;
      }

      if (input.ledgerTransactionId !== undefined) {
        data.ledgerTransactionId = input.ledgerTransactionId;
      }

      if (input.notes !== undefined) {
        data.notes = input.notes;
      }

      if (input.metadata !== undefined) {
        data.metadata = input.metadata as Prisma.InputJsonValue;
      }

      const record = await client.partnerAttribution.update({
        where: { id },
        data,
      });

      return toDomain(record)!;
    });
  }

  /**
   * Atomically realize attribution with ledger entry creation.
   *
   * This method uses SERIALIZABLE isolation with retry logic to ensure:
   * - Ledger entries are created
   * - Attribution is updated with ledger transaction ID
   * - Both succeed or both fail (atomicity)
   *
   * @example
   * const result = await store.realizeWithLedger(attributionId, {
   *   realizedRevenue: 150.00,
   *   idempotencyKey: `realize_${attributionId}_${Date.now()}`,
   *   ledgerEntries: [
   *     { accountCode: 'PARTNER_PAYABLE', accountType: 'liability', amount: 150.00, isDebit: true },
   *     { accountCode: 'INSURANCE_COMMISSION', accountType: 'revenue', amount: 150.00, isDebit: false },
   *   ],
   *   description: 'Lemonade commission for policy POL-123',
   * });
   */
  async realizeWithLedger(
    attributionId: string,
    params: {
      realizedRevenue: number;
      idempotencyKey: string;
      ledgerEntries: Array<{
        accountCode: string;
        accountType: 'asset' | 'liability' | 'revenue' | 'expense';
        amount: number;
        isDebit: boolean;
      }>;
      description: string;
      externalId?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<{ attribution: PartnerAttribution; ledgerTransactionId: string }> {
    const result = await withLedgerTransaction(async (tx) => {
      // Create ledger transaction
      const ledgerTxn = await tx.ledgerTransaction.create({
        data: {
          idempotencyKey: params.idempotencyKey,
          type: 'partner_commission',
          status: 'posted',
          description: params.description,
          externalId: params.externalId,
          referenceType: 'attribution',
          referenceId: attributionId,
          postedAt: new Date(),
          metadata: params.metadata as Prisma.InputJsonValue,
        },
      });

      // Create ledger entries
      await tx.ledgerEntry.createMany({
        data: params.ledgerEntries.map((entry) => ({
          transactionId: ledgerTxn.id,
          accountCode: entry.accountCode,
          accountType: entry.accountType,
          amount: entry.amount,
          isDebit: entry.isDebit,
        })),
      });

      // Update attribution with ledger transaction ID
      const attribution = await this.updateWithTx(
        attributionId,
        {
          status: 'realized',
          realizedRevenue: params.realizedRevenue,
          ledgerTransactionId: ledgerTxn.id,
        },
        tx
      );

      // Create audit log entry
      await tx.auditLog.create({
        data: {
          action: 'ATTRIBUTION_REALIZED',
          entityType: 'PartnerAttribution',
          entityId: attributionId,
          changes: {
            ledgerTransactionId: ledgerTxn.id,
            realizedRevenue: params.realizedRevenue,
          },
          metadata: {
            ledgerEntryCount: params.ledgerEntries.length,
          },
        },
      });

      return { attribution, ledgerTransactionId: ledgerTxn.id };
    }, 'attribution-realize');

    return result.result;
  }
}
