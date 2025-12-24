/**
 * Feature Flags Registry
 * All features with dependencies and configuration
 * Engineers: No code changes needed - flags are database-driven
 */

export interface FeatureFlag {
  id: string;
  name: string;
  description: string;
  category: FeatureCategory;
  defaultEnabled: boolean;
  dependencies?: string[];
  requiresIntegration?: string;
  rolloutPercentage?: number;
  markets?: string[]; // If empty, available in all markets
}

export type FeatureCategory =
  | 'core'
  | 'compliance'
  | 'integrations'
  | 'ai'
  | 'marketing'
  | 'experimental';

/**
 * Master Feature Registry
 * All features defined here with their dependencies
 */
export const FEATURE_REGISTRY: Record<string, FeatureFlag> = {
  // Core Features
  'core.listings': {
    id: 'core.listings',
    name: 'Listings',
    description: 'Property listing management',
    category: 'core',
    defaultEnabled: true,
  },
  'core.applications': {
    id: 'core.applications',
    name: 'Applications',
    description: 'Rental application processing',
    category: 'core',
    defaultEnabled: true,
    dependencies: ['core.listings'],
  },
  'core.leases': {
    id: 'core.leases',
    name: 'Leases',
    description: 'Lease management and renewals',
    category: 'core',
    defaultEnabled: true,
    dependencies: ['core.applications'],
  },
  'core.payments': {
    id: 'core.payments',
    name: 'Payments',
    description: 'Payment tracking and processing',
    category: 'core',
    defaultEnabled: true,
    dependencies: ['core.leases'],
  },
  'core.leads': {
    id: 'core.leads',
    name: 'Leads & Tours',
    description: 'Lead management and tour scheduling',
    category: 'core',
    defaultEnabled: true,
    dependencies: ['core.listings'],
  },

  // Compliance Features
  'compliance.fare-act': {
    id: 'compliance.fare-act',
    name: 'FARE Act Compliance',
    description: 'NYC FARE Act fee disclosure and limits',
    category: 'compliance',
    defaultEnabled: true,
    markets: ['nyc-manhattan', 'nyc-brooklyn', 'nyc-queens', 'nyc-bronx', 'nyc-staten-island'],
  },
  'compliance.fair-chance': {
    id: 'compliance.fair-chance',
    name: 'Fair Chance Housing',
    description: 'NYC Fair Chance Housing Act workflow',
    category: 'compliance',
    defaultEnabled: true,
    markets: ['nyc-manhattan', 'nyc-brooklyn', 'nyc-queens', 'nyc-bronx', 'nyc-staten-island'],
    dependencies: ['core.applications'],
  },
  'compliance.source-of-income': {
    id: 'compliance.source-of-income',
    name: 'Source of Income Protection',
    description: 'Prohibit discrimination based on lawful income source',
    category: 'compliance',
    defaultEnabled: true,
  },

  // Integration Features
  'integrations.email': {
    id: 'integrations.email',
    name: 'Email Notifications',
    description: 'SendGrid email integration',
    category: 'integrations',
    defaultEnabled: true,
    requiresIntegration: 'sendgrid',
  },
  'integrations.sms': {
    id: 'integrations.sms',
    name: 'SMS Notifications',
    description: 'Twilio SMS integration',
    category: 'integrations',
    defaultEnabled: true,
    requiresIntegration: 'twilio',
  },
  'integrations.smart-locks': {
    id: 'integrations.smart-locks',
    name: 'Smart Lock Access',
    description: 'Seam smart lock integration for tours',
    category: 'integrations',
    defaultEnabled: false,
    requiresIntegration: 'seam',
    dependencies: ['core.leads'],
  },
  'integrations.guarantors': {
    id: 'integrations.guarantors',
    name: 'Lease Guarantees',
    description: 'TheGuarantors rent guarantee integration',
    category: 'integrations',
    defaultEnabled: false,
    requiresIntegration: 'the-guarantors',
    dependencies: ['core.applications'],
  },
  'integrations.phone-verify': {
    id: 'integrations.phone-verify',
    name: 'Phone Verification',
    description: 'Twilio Verify phone verification',
    category: 'integrations',
    defaultEnabled: true,
    requiresIntegration: 'twilio-verify',
  },

  // AI Features
  'ai.listing-descriptions': {
    id: 'ai.listing-descriptions',
    name: 'AI Listing Descriptions',
    description: 'Generate listing descriptions with AI',
    category: 'ai',
    defaultEnabled: false,
    requiresIntegration: 'anthropic',
    dependencies: ['core.listings'],
  },
  'ai.lead-followup': {
    id: 'ai.lead-followup',
    name: 'AI Lead Follow-up',
    description: 'Automated lead nurturing with AI',
    category: 'ai',
    defaultEnabled: false,
    requiresIntegration: 'anthropic',
    dependencies: ['core.leads'],
  },
  'ai.chat-assistant': {
    id: 'ai.chat-assistant',
    name: 'Agent AI Assistant',
    description: 'AI chat assistant for agents',
    category: 'ai',
    defaultEnabled: false,
    requiresIntegration: 'anthropic',
  },

  // Marketing Features
  'marketing.virtual-tours': {
    id: 'marketing.virtual-tours',
    name: 'Virtual Tours',
    description: '360° virtual tour support',
    category: 'marketing',
    defaultEnabled: true,
    dependencies: ['core.listings'],
  },
  'marketing.3d-splats': {
    id: 'marketing.3d-splats',
    name: '3D Gaussian Splats',
    description: '3D Gaussian Splatting digital twins',
    category: 'experimental',
    defaultEnabled: false,
    dependencies: ['core.listings'],
  },

  // Experimental
  'experimental.imessage': {
    id: 'experimental.imessage',
    name: 'iMessage Integration',
    description: 'Sendblue iMessage for lead communication',
    category: 'experimental',
    defaultEnabled: false,
    requiresIntegration: 'sendblue',
    dependencies: ['core.leads'],
  },
};

/**
 * Get all feature IDs
 */
export function getAllFeatureIds(): string[] {
  return Object.keys(FEATURE_REGISTRY);
}

/**
 * Get features by category
 */
export function getFeaturesByCategory(category: FeatureCategory): FeatureFlag[] {
  return Object.values(FEATURE_REGISTRY).filter((f) => f.category === category);
}

/**
 * Check if a feature has all dependencies enabled
 */
export function checkDependencies(
  featureId: string,
  enabledFeatures: Set<string>
): { valid: boolean; missing: string[] } {
  const feature = FEATURE_REGISTRY[featureId];
  if (!feature?.dependencies) {
    return { valid: true, missing: [] };
  }

  const missing = feature.dependencies.filter((dep) => !enabledFeatures.has(dep));
  return { valid: missing.length === 0, missing };
}

/**
 * Get default enabled features for seeding
 */
export function getDefaultEnabledFeatures(): string[] {
  return Object.values(FEATURE_REGISTRY)
    .filter((f) => f.defaultEnabled)
    .map((f) => f.id);
}
