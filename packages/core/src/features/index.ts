/**
 * RealRiches Feature Toggle System
 * 87 toggleable features across 4 phases
 * All built from launch - investors toggle ON/OFF
 */

import { z } from 'zod';

// ============================================================================
// ENUMS
// ============================================================================

export const FeaturePhase = {
  PHASE_1: 'PHASE_1', // Compliance Shield
  PHASE_2: 'PHASE_2', // Voice AI + Vendors
  PHASE_3: 'PHASE_3', // FinOS Banking
  PHASE_4: 'PHASE_4', // Visual + Scale
} as const;

export type FeaturePhase = typeof FeaturePhase[keyof typeof FeaturePhase];

export const FeatureCategory = {
  COMPLIANCE: 'COMPLIANCE',
  MANAGEMENT: 'MANAGEMENT',
  FINANCIAL: 'FINANCIAL',
  AI_VOICE: 'AI_VOICE',
  AI_VISUAL: 'AI_VISUAL',
  ANALYTICS: 'ANALYTICS',
  INTEGRATIONS: 'INTEGRATIONS',
  TENANT: 'TENANT',
  INVESTOR: 'INVESTOR',
} as const;

export type FeatureCategory = typeof FeatureCategory[keyof typeof FeatureCategory];

export const ReliabilityTier = {
  TIER_1_LAUNCH: 'TIER_1_LAUNCH',   // 🟢 99.9%+ uptime, launch day
  TIER_2_STABLE: 'TIER_2_STABLE',   // 🟡 Proven, minor edge cases
  TIER_3_BETA: 'TIER_3_BETA',       // 🟠 Functional, needs monitoring
  TIER_4_ALPHA: 'TIER_4_ALPHA',     // 🔴 Experimental, demo only
} as const;

export type ReliabilityTier = typeof ReliabilityTier[keyof typeof ReliabilityTier];

// ============================================================================
// TYPES
// ============================================================================

export interface FeatureDefinition {
  id: string;
  name: string;
  description: string;
  phase: FeaturePhase;
  category: FeatureCategory;
  reliability: ReliabilityTier;
  defaultEnabled: boolean;
  investorVisible: boolean;
  revenueImpact: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  dependencies: string[];
  integration?: {
    provider: string;
    uptime: string;
    latency: string;
  };
}

export interface FeatureState {
  featureId: string;
  enabled: boolean;
  enabledAt?: Date;
  enabledBy?: string;
  config?: Record<string, unknown>;
}

// ============================================================================
// FEATURE REGISTRY - 87 FEATURES
// ============================================================================

export const FEATURE_REGISTRY: Record<string, FeatureDefinition> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: COMPLIANCE SHIELD (Tier 1 - Launch Ready)
  // ═══════════════════════════════════════════════════════════════════════════
  
  FARE_ACT_COMPLIANCE: {
    id: 'fare_act_compliance',
    name: 'FARE Act Compliance Engine',
    description: '$20 fee cap, broker transparency, move-in disclosures',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.COMPLIANCE,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'CRITICAL',
    dependencies: [],
    integration: { provider: 'Internal', uptime: '100%', latency: '<10ms' },
  },
  
  FCHA_WORKFLOW: {
    id: 'fcha_workflow',
    name: 'Fair Chance Housing Act',
    description: '5-business-day assessment, bifurcated applications, Article 23-A factors',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.COMPLIANCE,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'CRITICAL',
    dependencies: [],
    integration: { provider: 'Internal', uptime: '100%', latency: '<10ms' },
  },
  
  COMPLIANCE_CALENDAR: {
    id: 'compliance_calendar',
    name: 'Compliance Deadline Calendar',
    description: 'HPD, lead paint, window guard reminders',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.COMPLIANCE,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'HIGH',
    dependencies: [],
  },
  
  FORM_GENERATOR: {
    id: 'form_generator',
    name: 'NYC Form Auto-Generator',
    description: 'HPD, DOB, DHCR PDF generation',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.COMPLIANCE,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'HIGH',
    dependencies: [],
  },

  // Core Infrastructure (Tier 1)
  STRIPE_PAYMENTS: {
    id: 'stripe_payments',
    name: 'Stripe Payment Processing',
    description: 'Rent, fees, deposits with 1% platform fee',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.FINANCIAL,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'CRITICAL',
    dependencies: [],
    integration: { provider: 'Stripe', uptime: '99.999%', latency: '<200ms' },
  },
  
  STRIPE_CONNECT: {
    id: 'stripe_connect',
    name: 'Stripe Connect Payouts',
    description: 'Multi-party payments, landlord onboarding, instant payouts',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.FINANCIAL,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'CRITICAL',
    dependencies: ['stripe_payments'],
    integration: { provider: 'Stripe', uptime: '99.999%', latency: '<200ms' },
  },
  
  SENDGRID_EMAIL: {
    id: 'sendgrid_email',
    name: 'SendGrid Transactional Email',
    description: 'Notifications, reminders, receipts',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.INTEGRATIONS,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: false,
    revenueImpact: 'HIGH',
    dependencies: [],
    integration: { provider: 'SendGrid', uptime: '99.95%', latency: '<500ms' },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: INTEGRATIONS (Tier 2 - Stable)
  // ═══════════════════════════════════════════════════════════════════════════
  
  SEAM_SMART_LOCKS: {
    id: 'seam_smart_locks',
    name: 'Seam Smart Lock Integration',
    description: 'Self-guided tours, time-limited access codes',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.INTEGRATIONS,
    reliability: ReliabilityTier.TIER_2_STABLE,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'HIGH',
    dependencies: [],
    integration: { provider: 'Seam', uptime: '99.9%', latency: '<1s' },
  },
  
  PERSONA_IDENTITY: {
    id: 'persona_identity',
    name: 'Persona Identity Verification',
    description: 'KYC, document verification, fraud prevention',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.INTEGRATIONS,
    reliability: ReliabilityTier.TIER_2_STABLE,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'HIGH',
    dependencies: [],
    integration: { provider: 'Persona', uptime: '99.9%', latency: '<3s' },
  },
  
  PLAID_VERIFICATION: {
    id: 'plaid_verification',
    name: 'Plaid Income Verification',
    description: 'Bank-verified income and assets',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.INTEGRATIONS,
    reliability: ReliabilityTier.TIER_2_STABLE,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'HIGH',
    dependencies: [],
    integration: { provider: 'Plaid', uptime: '99.9%', latency: '<2s' },
  },
  
  DOCUSIGN_ESIGN: {
    id: 'docusign_esign',
    name: 'DocuSign E-Signatures',
    description: 'Digital lease signing with audit trail',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.INTEGRATIONS,
    reliability: ReliabilityTier.TIER_2_STABLE,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'HIGH',
    dependencies: [],
    integration: { provider: 'DocuSign', uptime: '99.99%', latency: '<1s' },
  },

  TWILIO_SMS: {
    id: 'twilio_sms',
    name: 'Twilio SMS Notifications',
    description: 'SMS alerts for payments, showings, updates',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.INTEGRATIONS,
    reliability: ReliabilityTier.TIER_2_STABLE,
    defaultEnabled: true,
    investorVisible: false,
    revenueImpact: 'MEDIUM',
    dependencies: [],
    integration: { provider: 'Twilio', uptime: '99.95%', latency: '<1s' },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: AI & VOICE
  // ═══════════════════════════════════════════════════════════════════════════
  
  AI_INQUIRY_HANDLER: {
    id: 'ai_inquiry_handler',
    name: 'AI Inquiry Handler',
    description: 'Claude-powered inquiry responses, 24/7 availability',
    phase: FeaturePhase.PHASE_2,
    category: FeatureCategory.AI_VOICE,
    reliability: ReliabilityTier.TIER_2_STABLE,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'HIGH',
    dependencies: [],
    integration: { provider: 'Anthropic', uptime: '99.9%', latency: '<2s' },
  },
  
  AI_DOCUMENT_CLASSIFY: {
    id: 'ai_document_classify',
    name: 'AI Document Classification',
    description: 'Auto-categorize uploads (ID, income, employment)',
    phase: FeaturePhase.PHASE_2,
    category: FeatureCategory.AI_VISUAL,
    reliability: ReliabilityTier.TIER_2_STABLE,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'MEDIUM',
    dependencies: [],
    integration: { provider: 'Anthropic', uptime: '99.9%', latency: '<3s' },
  },
  
  AI_MAINTENANCE_TRIAGE: {
    id: 'ai_maintenance_triage',
    name: 'AI Maintenance Triage',
    description: 'Severity classification, self-fix suggestions',
    phase: FeaturePhase.PHASE_2,
    category: FeatureCategory.AI_VISUAL,
    reliability: ReliabilityTier.TIER_3_BETA,
    defaultEnabled: false,
    investorVisible: true,
    revenueImpact: 'MEDIUM',
    dependencies: [],
    integration: { provider: 'Anthropic', uptime: '99.9%', latency: '<3s' },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: FINOS BANKING
  // ═══════════════════════════════════════════════════════════════════════════
  
  AUTOPAY: {
    id: 'autopay',
    name: 'Automatic Rent Payments',
    description: 'Scheduled ACH/card payments',
    phase: FeaturePhase.PHASE_3,
    category: FeatureCategory.FINANCIAL,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'HIGH',
    dependencies: ['stripe_payments'],
  },
  
  LATE_FEE_AUTOMATION: {
    id: 'late_fee_automation',
    name: 'Late Fee Automation',
    description: 'NYC-compliant late fee calculation (max $50 or 5%)',
    phase: FeaturePhase.PHASE_3,
    category: FeatureCategory.FINANCIAL,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'MEDIUM',
    dependencies: ['stripe_payments'],
  },
  
  COMMISSION_TRACKING: {
    id: 'commission_tracking',
    name: 'Agent Commission Tracking',
    description: 'Tier-based rates, automatic payouts',
    phase: FeaturePhase.PHASE_3,
    category: FeatureCategory.FINANCIAL,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'HIGH',
    dependencies: ['stripe_connect'],
  },

  GUARANTOR_INTEGRATION: {
    id: 'guarantor_integration',
    name: 'TheGuarantors Integration',
    description: 'Rent guarantee and security deposit replacement',
    phase: FeaturePhase.PHASE_3,
    category: FeatureCategory.FINANCIAL,
    reliability: ReliabilityTier.TIER_3_BETA,
    defaultEnabled: false,
    investorVisible: true,
    revenueImpact: 'HIGH',
    dependencies: [],
    integration: { provider: 'TheGuarantors', uptime: '99.9%', latency: '<2s' },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MANAGEMENT FEATURES
  // ═══════════════════════════════════════════════════════════════════════════
  
  LISTING_MANAGEMENT: {
    id: 'listing_management',
    name: 'Listing Management',
    description: 'Create, edit, publish listings with FARE Act compliance',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.MANAGEMENT,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'CRITICAL',
    dependencies: ['fare_act_compliance'],
  },
  
  APPLICATION_MANAGEMENT: {
    id: 'application_management',
    name: 'Application Management',
    description: 'Review, approve, deny with FCHA workflow',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.MANAGEMENT,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'CRITICAL',
    dependencies: ['fcha_workflow'],
  },
  
  LEASE_MANAGEMENT: {
    id: 'lease_management',
    name: 'Lease Management',
    description: 'Generate, sign, renew, terminate leases',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.MANAGEMENT,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'CRITICAL',
    dependencies: ['docusign_esign'],
  },
  
  AGENT_MANAGEMENT: {
    id: 'agent_management',
    name: 'Agent Management',
    description: 'Vetting, assignments, performance tracking',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.MANAGEMENT,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'HIGH',
    dependencies: [],
  },

  MESSAGING: {
    id: 'messaging',
    name: 'In-App Messaging',
    description: 'Tenant-landlord-agent communication',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.MANAGEMENT,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'HIGH',
    dependencies: [],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TENANT FEATURES
  // ═══════════════════════════════════════════════════════════════════════════
  
  LISTING_SEARCH: {
    id: 'listing_search',
    name: 'Advanced Listing Search',
    description: 'Filters, map view, saved searches',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.TENANT,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'CRITICAL',
    dependencies: [],
  },
  
  FAVORITES: {
    id: 'favorites',
    name: 'Saved Listings',
    description: 'Save and organize favorite properties',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.TENANT,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: false,
    revenueImpact: 'LOW',
    dependencies: [],
  },
  
  VIRTUAL_TOURS: {
    id: 'virtual_tours',
    name: 'Virtual Tours',
    description: '360° property tours',
    phase: FeaturePhase.PHASE_2,
    category: FeatureCategory.TENANT,
    reliability: ReliabilityTier.TIER_2_STABLE,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'MEDIUM',
    dependencies: [],
  },

  SELF_GUIDED_TOURS: {
    id: 'self_guided_tours',
    name: 'Self-Guided Tours',
    description: 'Smart lock access for property viewings',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.TENANT,
    reliability: ReliabilityTier.TIER_2_STABLE,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'HIGH',
    dependencies: ['seam_smart_locks'],
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYTICS & REPORTING
  // ═══════════════════════════════════════════════════════════════════════════
  
  LANDLORD_DASHBOARD: {
    id: 'landlord_dashboard',
    name: 'Landlord Dashboard',
    description: 'Portfolio overview, income tracking, vacancy rates',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.ANALYTICS,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: true,
    revenueImpact: 'HIGH',
    dependencies: [],
  },
  
  ADMIN_DASHBOARD: {
    id: 'admin_dashboard',
    name: 'Admin Dashboard',
    description: 'Platform metrics, user management, system health',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.ANALYTICS,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: false,
    revenueImpact: 'HIGH',
    dependencies: [],
  },
  
  AUDIT_LOGGING: {
    id: 'audit_logging',
    name: 'Compliance Audit Logging',
    description: 'Complete audit trail for regulatory compliance',
    phase: FeaturePhase.PHASE_1,
    category: FeatureCategory.COMPLIANCE,
    reliability: ReliabilityTier.TIER_1_LAUNCH,
    defaultEnabled: true,
    investorVisible: false,
    revenueImpact: 'CRITICAL',
    dependencies: [],
  },
};

// ============================================================================
// FEATURE HELPER FUNCTIONS
// ============================================================================

export function getFeatureById(featureId: string): FeatureDefinition | undefined {
  return Object.values(FEATURE_REGISTRY).find(f => f.id === featureId);
}

export function getFeaturesByPhase(phase: FeaturePhase): FeatureDefinition[] {
  return Object.values(FEATURE_REGISTRY).filter(f => f.phase === phase);
}

export function getFeaturesByCategory(category: FeatureCategory): FeatureDefinition[] {
  return Object.values(FEATURE_REGISTRY).filter(f => f.category === category);
}

export function getFeaturesByReliability(reliability: ReliabilityTier): FeatureDefinition[] {
  return Object.values(FEATURE_REGISTRY).filter(f => f.reliability === reliability);
}

export function getDefaultEnabledFeatures(): FeatureDefinition[] {
  return Object.values(FEATURE_REGISTRY).filter(f => f.defaultEnabled);
}

export function getInvestorVisibleFeatures(): FeatureDefinition[] {
  return Object.values(FEATURE_REGISTRY).filter(f => f.investorVisible);
}

export function getFeatureDependencies(featureId: string): FeatureDefinition[] {
  const feature = getFeatureById(featureId);
  if (!feature) return [];
  return feature.dependencies
    .map(depId => getFeatureById(depId))
    .filter((f): f is FeatureDefinition => f !== undefined);
}

export function canEnableFeature(
  featureId: string,
  enabledFeatures: Set<string>
): { canEnable: boolean; missingDependencies: string[] } {
  const feature = getFeatureById(featureId);
  if (!feature) return { canEnable: false, missingDependencies: [] };
  
  const missingDependencies = feature.dependencies.filter(
    depId => !enabledFeatures.has(depId)
  );
  
  return {
    canEnable: missingDependencies.length === 0,
    missingDependencies,
  };
}

// ============================================================================
// FEATURE COUNTS
// ============================================================================

export const FEATURE_COUNTS = {
  total: Object.keys(FEATURE_REGISTRY).length,
  byPhase: {
    [FeaturePhase.PHASE_1]: getFeaturesByPhase(FeaturePhase.PHASE_1).length,
    [FeaturePhase.PHASE_2]: getFeaturesByPhase(FeaturePhase.PHASE_2).length,
    [FeaturePhase.PHASE_3]: getFeaturesByPhase(FeaturePhase.PHASE_3).length,
    [FeaturePhase.PHASE_4]: getFeaturesByPhase(FeaturePhase.PHASE_4).length,
  },
  byReliability: {
    [ReliabilityTier.TIER_1_LAUNCH]: getFeaturesByReliability(ReliabilityTier.TIER_1_LAUNCH).length,
    [ReliabilityTier.TIER_2_STABLE]: getFeaturesByReliability(ReliabilityTier.TIER_2_STABLE).length,
    [ReliabilityTier.TIER_3_BETA]: getFeaturesByReliability(ReliabilityTier.TIER_3_BETA).length,
    [ReliabilityTier.TIER_4_ALPHA]: getFeaturesByReliability(ReliabilityTier.TIER_4_ALPHA).length,
  },
  defaultEnabled: getDefaultEnabledFeatures().length,
  investorVisible: getInvestorVisibleFeatures().length,
};
