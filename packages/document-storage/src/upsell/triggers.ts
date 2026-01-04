/**
 * Upsell Trigger Service
 *
 * Detects missing documents and creates market-gated upsell triggers.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaClient = any;

// Type alias for upsell trigger records from the database
type UpsellTriggerRecord = {
  id: string;
  triggerType: string;
  propertyId: string;
  vaultId: string;
  missingCategories: unknown;
  eligiblePartners: unknown;
  priority: number;
  market: string;
  dismissed: boolean;
  dismissedAt: Date | null;
  convertedAt: Date | null;
  partnerId: string | null;
  attributionId: string | null;
};

import type { DocumentCategory } from '../vault-onboarding/types';

import type {
  UpsellTrigger,
  UpsellTriggerType,
  PartnerType,
  CreateUpsellTriggerInput,
  MarketUpsellConfig,
} from './types';
import {
  TRIGGER_PARTNER_MAP,
  MARKET_UPSELL_CONFIGS,
  UPSELL_PARTNER_MAP,
} from './types';

export class UpsellTriggerService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Detect upsell triggers based on missing documents
   */
  detectTriggers(
    propertyId: string,
    vaultId: string,
    missingCategories: DocumentCategory[],
    market: string
  ): CreateUpsellTriggerInput[] {
    const triggers: CreateUpsellTriggerInput[] = [];
    const marketConfig = this.getMarketConfig(market);

    // Check for missing insurance
    const insuranceCategories = ['PROPERTY_INSURANCE', 'LIABILITY', 'FLOOD'];
    const missingInsurance = missingCategories.filter((cat) =>
      insuranceCategories.includes(cat)
    );
    if (
      missingInsurance.length > 0 &&
      !marketConfig.disabledTriggers.includes('MISSING_INSURANCE')
    ) {
      triggers.push({
        triggerType: 'MISSING_INSURANCE',
        propertyId,
        vaultId,
        missingCategories: missingInsurance,
        market,
      });
    }

    // Check for missing lease documents (triggers guarantor upsell)
    const leaseCategories = ['ACTIVE_LEASES', 'AMENDMENTS'];
    const missingLease = missingCategories.filter((cat) =>
      leaseCategories.includes(cat)
    );
    if (
      missingLease.length > 0 &&
      !marketConfig.disabledTriggers.includes('MISSING_GUARANTOR')
    ) {
      triggers.push({
        triggerType: 'MISSING_GUARANTOR',
        propertyId,
        vaultId,
        missingCategories: missingLease,
        market,
      });
    }

    // Check for missing deed
    if (
      missingCategories.includes('DEED' as DocumentCategory) &&
      !marketConfig.disabledTriggers.includes('MISSING_DEED')
    ) {
      triggers.push({
        triggerType: 'MISSING_DEED',
        propertyId,
        vaultId,
        missingCategories: ['DEED'] as DocumentCategory[],
        market,
      });
    }

    return triggers;
  }

  /**
   * Create upsell triggers in the database
   */
  async createTriggers(
    inputs: CreateUpsellTriggerInput[]
  ): Promise<UpsellTrigger[]> {
    const triggers: UpsellTrigger[] = [];

    for (const input of inputs) {
      const eligiblePartners = this.getEligiblePartners(
        input.triggerType,
        input.market
      );

      // Skip if no eligible partners
      if (eligiblePartners.length === 0) {
        continue;
      }

      // Check if trigger already exists (not dismissed, not converted)
      const existing = await this.prisma.upsellTrigger.findFirst({
        where: {
          propertyId: input.propertyId,
          triggerType: input.triggerType,
          dismissed: false,
          convertedAt: null,
        },
      });

      if (existing) {
        // Update missing categories if needed
        const existingCategories = existing.missingCategories as string[];
        const newCategories = [
          ...new Set([...existingCategories, ...input.missingCategories]),
        ];

        if (newCategories.length > existingCategories.length) {
          await this.prisma.upsellTrigger.update({
            where: { id: existing.id },
            data: { missingCategories: newCategories },
          });
        }

        triggers.push(this.mapToUpsellTrigger(existing));
        continue;
      }

      // Create new trigger
      const trigger = await this.prisma.upsellTrigger.create({
        data: {
          propertyId: input.propertyId,
          vaultId: input.vaultId,
          triggerType: input.triggerType,
          missingCategories: input.missingCategories,
          eligiblePartners,
          market: input.market,
          priority: this.getPriority(input.triggerType),
        },
      });

      triggers.push(this.mapToUpsellTrigger(trigger));
    }

    return triggers;
  }

  /**
   * Get active triggers for a property
   */
  async getActiveTriggers(propertyId: string): Promise<UpsellTrigger[]> {
    const triggers = await this.prisma.upsellTrigger.findMany({
      where: {
        propertyId,
        dismissed: false,
        convertedAt: null,
      },
      orderBy: { priority: 'asc' },
    });

    return triggers.map((t: UpsellTriggerRecord) => this.mapToUpsellTrigger(t));
  }

  /**
   * Dismiss a trigger
   */
  async dismissTrigger(
    triggerId: string,
    userId: string
  ): Promise<UpsellTrigger> {
    const trigger = await this.prisma.upsellTrigger.update({
      where: { id: triggerId },
      data: {
        dismissed: true,
        dismissedAt: new Date(),
        dismissedById: userId,
      },
    });

    return this.mapToUpsellTrigger(trigger);
  }

  /**
   * Mark a trigger as converted
   */
  async convertTrigger(
    triggerId: string,
    userId: string,
    partnerId: string,
    attributionId?: string
  ): Promise<UpsellTrigger> {
    const trigger = await this.prisma.upsellTrigger.update({
      where: { id: triggerId },
      data: {
        convertedAt: new Date(),
        convertedById: userId,
        partnerId,
        attributionId,
      },
    });

    return this.mapToUpsellTrigger(trigger);
  }

  /**
   * Get eligible partners for a trigger type and market
   */
  getEligiblePartners(
    triggerType: UpsellTriggerType,
    market: string
  ): PartnerType[] {
    const triggerPartners = TRIGGER_PARTNER_MAP[triggerType] || [];
    const marketConfig = this.getMarketConfig(market);

    // Filter to only market-enabled partners
    return triggerPartners.filter((partner) =>
      marketConfig.enabledPartners.includes(partner)
    );
  }

  /**
   * Get partners for a specific document category
   */
  getPartnersForCategory(
    category: DocumentCategory,
    market: string
  ): PartnerType[] {
    const categoryPartners =
      UPSELL_PARTNER_MAP[category] || UPSELL_PARTNER_MAP.DEFAULT || [];
    const marketConfig = this.getMarketConfig(market);

    return categoryPartners.filter((partner) =>
      marketConfig.enabledPartners.includes(partner)
    );
  }

  /**
   * Check if a trigger type is enabled for a market
   */
  isTriggerEnabledForMarket(
    triggerType: UpsellTriggerType,
    market: string
  ): boolean {
    const marketConfig = this.getMarketConfig(market);
    return !marketConfig.disabledTriggers.includes(triggerType);
  }

  /**
   * Get market configuration (with fallback to default)
   */
  getMarketConfig(market: string): MarketUpsellConfig {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return MARKET_UPSELL_CONFIGS[market] ?? MARKET_UPSELL_CONFIGS.DEFAULT!;
  }

  /**
   * Get priority for a trigger type (lower = more important)
   */
  private getPriority(triggerType: UpsellTriggerType): number {
    const priorities: Record<UpsellTriggerType, number> = {
      MISSING_INSURANCE: 1, // Most important
      EXPIRING_INSURANCE: 2,
      MISSING_DEED: 3,
      MISSING_LEASE: 4,
      MISSING_GUARANTOR: 5,
      EXPIRING_LEASE: 6,
    };
    return priorities[triggerType] || 10;
  }

  /**
   * Map database record to UpsellTrigger
   */
  private mapToUpsellTrigger(record: UpsellTriggerRecord): UpsellTrigger {
    return {
      id: record.id,
      triggerType: record.triggerType as UpsellTriggerType,
      propertyId: record.propertyId,
      vaultId: record.vaultId,
      missingCategories: record.missingCategories as DocumentCategory[],
      eligiblePartners: record.eligiblePartners as PartnerType[],
      priority: record.priority,
      market: record.market,
      dismissed: record.dismissed,
      dismissedAt: record.dismissedAt ?? undefined,
      convertedAt: record.convertedAt ?? undefined,
      partnerId: record.partnerId ?? undefined,
      attributionId: record.attributionId ?? undefined,
    };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Detect upsell triggers for a property (convenience function)
 */
export function detectUpsellTriggers(
  propertyId: string,
  vaultId: string,
  missingCategories: DocumentCategory[],
  market: string
): CreateUpsellTriggerInput[] {
  // Use a temporary instance for detection (no DB needed)
  const service = new UpsellTriggerService(null as unknown as PrismaClient);
  return service.detectTriggers(propertyId, vaultId, missingCategories, market);
}

/**
 * Check if upsell is enabled for a market
 */
export function isUpsellEnabledForMarket(
  triggerType: UpsellTriggerType,
  market: string
): boolean {
  const service = new UpsellTriggerService(null as unknown as PrismaClient);
  return service.isTriggerEnabledForMarket(triggerType, market);
}

// =============================================================================
// Singleton Instance
// =============================================================================

let serviceInstance: UpsellTriggerService | null = null;

export function getUpsellTriggerService(
  prisma: PrismaClient
): UpsellTriggerService {
  if (!serviceInstance) {
    serviceInstance = new UpsellTriggerService(prisma);
  }
  return serviceInstance;
}
