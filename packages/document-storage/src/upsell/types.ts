/**
 * Upsell Trigger Types
 *
 * Market-gated upsell triggers for missing vault documents.
 */

import { z } from 'zod';

import type { DocumentCategory } from '../vault-onboarding/types';

// =============================================================================
// Trigger Types
// =============================================================================

export type UpsellTriggerType =
  | 'MISSING_INSURANCE'
  | 'MISSING_GUARANTOR'
  | 'MISSING_DEED'
  | 'MISSING_LEASE'
  | 'EXPIRING_INSURANCE'
  | 'EXPIRING_LEASE';

export type PartnerType =
  | 'LEMONADE'
  | 'ASSURANT'
  | 'SURE'
  | 'LEASELOCK'
  | 'RHINO'
  | 'JETTY'
  | 'INSURENT'
  | 'LEAP';

// =============================================================================
// Trigger Configuration
// =============================================================================

export interface UpsellTrigger {
  id: string;
  triggerType: UpsellTriggerType;
  propertyId: string;
  vaultId: string;
  missingCategories: DocumentCategory[];
  eligiblePartners: PartnerType[];
  priority: number;
  market: string;
  dismissed: boolean;
  dismissedAt?: Date;
  convertedAt?: Date;
  partnerId?: string;
  attributionId?: string;
}

export interface CreateUpsellTriggerInput {
  triggerType: UpsellTriggerType;
  propertyId: string;
  vaultId: string;
  missingCategories: DocumentCategory[];
  market: string;
}

// =============================================================================
// Partner Mapping
// =============================================================================

/**
 * Maps document categories to partner types that can help
 */
export const UPSELL_PARTNER_MAP: Record<string, PartnerType[]> = {
  // Insurance documents
  PROPERTY_INSURANCE: ['LEMONADE', 'ASSURANT', 'SURE'],
  LIABILITY: ['LEMONADE', 'ASSURANT'],
  FLOOD: ['ASSURANT'],

  // Lease-related (guarantor services)
  ACTIVE_LEASES: ['LEASELOCK', 'RHINO', 'JETTY', 'INSURENT', 'LEAP'],
  AMENDMENTS: ['LEASELOCK', 'RHINO', 'JETTY'],

  // Default for other categories
  DEFAULT: [],
};

/**
 * Maps trigger types to relevant partners
 */
export const TRIGGER_PARTNER_MAP: Record<UpsellTriggerType, PartnerType[]> = {
  MISSING_INSURANCE: ['LEMONADE', 'ASSURANT', 'SURE'],
  MISSING_GUARANTOR: ['LEASELOCK', 'RHINO', 'JETTY', 'INSURENT', 'LEAP'],
  MISSING_DEED: [],
  MISSING_LEASE: ['LEASELOCK', 'RHINO', 'JETTY', 'INSURENT', 'LEAP'],
  EXPIRING_INSURANCE: ['LEMONADE', 'ASSURANT', 'SURE'],
  EXPIRING_LEASE: ['LEASELOCK', 'RHINO', 'JETTY', 'INSURENT', 'LEAP'],
};

// =============================================================================
// Market Configuration
// =============================================================================

export interface MarketUpsellConfig {
  market: string;
  enabledPartners: PartnerType[];
  disabledTriggers: UpsellTriggerType[];
  customMessages?: Record<UpsellTriggerType, string>;
}

/**
 * Market-specific upsell configurations
 */
export const MARKET_UPSELL_CONFIGS: Record<string, MarketUpsellConfig> = {
  NYC: {
    market: 'NYC',
    enabledPartners: ['LEASELOCK', 'RHINO', 'INSURENT', 'LEMONADE', 'ASSURANT'],
    disabledTriggers: [],
  },
  LA: {
    market: 'LA',
    enabledPartners: ['JETTY', 'LEMONADE', 'SURE', 'LEAP'],
    disabledTriggers: ['MISSING_GUARANTOR'], // LA doesn't push guarantors as aggressively
  },
  CHICAGO: {
    market: 'CHICAGO',
    enabledPartners: ['LEASELOCK', 'RHINO', 'LEMONADE', 'ASSURANT'],
    disabledTriggers: [],
  },
  MIAMI: {
    market: 'MIAMI',
    enabledPartners: ['LEASELOCK', 'RHINO', 'LEMONADE', 'ASSURANT', 'SURE'],
    disabledTriggers: [],
  },
  BOSTON: {
    market: 'BOSTON',
    enabledPartners: ['LEASELOCK', 'RHINO', 'INSURENT', 'LEMONADE'],
    disabledTriggers: [],
  },
  // Default for unlisted markets
  DEFAULT: {
    market: 'DEFAULT',
    enabledPartners: ['LEMONADE', 'LEASELOCK'],
    disabledTriggers: [],
  },
};

// =============================================================================
// Zod Schemas
// =============================================================================

export const UpsellTriggerTypeSchema = z.enum([
  'MISSING_INSURANCE',
  'MISSING_GUARANTOR',
  'MISSING_DEED',
  'MISSING_LEASE',
  'EXPIRING_INSURANCE',
  'EXPIRING_LEASE',
]);

export const PartnerTypeSchema = z.enum([
  'LEMONADE',
  'ASSURANT',
  'SURE',
  'LEASELOCK',
  'RHINO',
  'JETTY',
  'INSURENT',
  'LEAP',
]);

export const CreateUpsellTriggerSchema = z.object({
  triggerType: UpsellTriggerTypeSchema,
  propertyId: z.string().uuid(),
  vaultId: z.string().uuid(),
  missingCategories: z.array(z.string()),
  market: z.string(),
});

export const DismissUpsellSchema = z.object({
  triggerId: z.string().uuid(),
  reason: z.string().optional(),
});

export const ConvertUpsellSchema = z.object({
  triggerId: z.string().uuid(),
  partnerId: z.string(),
  attributionId: z.string().uuid().optional(),
});
