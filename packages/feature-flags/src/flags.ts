import { z } from 'zod';

/**
 * Feature Flag Keys
 *
 * Naming convention: DOMAIN_FEATURE_COMPONENT
 *
 * RR-ENG-UPDATE-2026-001: 3D Gaussian Splatting Tour Feature Flags
 */
export const FeatureFlag = {
  // ============================================================================
  // 3D Tour Features (RR-ENG-UPDATE-2026-001)
  // ============================================================================

  /**
   * TOUR_3DGS_CAPTURE
   * Enables 3D Gaussian Splatting capture workflow for properties.
   * Allows property managers to initiate 3DGS capture sessions.
   */
  TOUR_3DGS_CAPTURE: 'TOUR_3DGS_CAPTURE',

  /**
   * TOUR_SOG_CONVERSION
   * Enables Scene Optimized Gaussian (SOG) conversion pipeline.
   * Converts raw 3DGS captures to optimized streaming format.
   */
  TOUR_SOG_CONVERSION: 'TOUR_SOG_CONVERSION',

  /**
   * TOUR_WEBGPU_VIEWER
   * Enables WebGPU-accelerated 3D tour viewer.
   * Falls back to WebGL2 if WebGPU unavailable.
   */
  TOUR_WEBGPU_VIEWER: 'TOUR_WEBGPU_VIEWER',

  /**
   * TOUR_LOD_STREAMING
   * Enables Level-of-Detail streaming for 3D tours.
   * Progressive loading based on viewport and bandwidth.
   */
  TOUR_LOD_STREAMING: 'TOUR_LOD_STREAMING',

  // ============================================================================
  // AI Features
  // ============================================================================

  /** AI-powered property valuation */
  AI_VALUATION: 'AI_VALUATION',

  /** AI lease document analysis */
  AI_LEASE_ANALYSIS: 'AI_LEASE_ANALYSIS',

  /** AI maintenance triage */
  AI_MAINTENANCE_TRIAGE: 'AI_MAINTENANCE_TRIAGE',

  /** AI tenant communication assistant */
  AI_TENANT_ASSISTANT: 'AI_TENANT_ASSISTANT',

  // ============================================================================
  // Compliance Features
  // ============================================================================

  /** Enhanced compliance reporting */
  COMPLIANCE_ENHANCED_REPORTING: 'COMPLIANCE_ENHANCED_REPORTING',

  /** Real-time compliance monitoring */
  COMPLIANCE_REALTIME_MONITORING: 'COMPLIANCE_REALTIME_MONITORING',

  // ============================================================================
  // Payment Features
  // ============================================================================

  /** Cryptocurrency rent payments */
  PAYMENTS_CRYPTO: 'PAYMENTS_CRYPTO',

  /** Instant payout to landlords */
  PAYMENTS_INSTANT_PAYOUT: 'PAYMENTS_INSTANT_PAYOUT',

  // ============================================================================
  // Partner Integrations
  // ============================================================================

  /** Lemonade insurance integration */
  PARTNER_LEMONADE: 'PARTNER_LEMONADE',

  /** Rhino deposit alternative */
  PARTNER_RHINO: 'PARTNER_RHINO',

  /** Utility concierge service */
  PARTNER_UTILITY_CONCIERGE: 'PARTNER_UTILITY_CONCIERGE',

  /** Guarantor services (TheGuarantors, Insurent, etc.) */
  PARTNER_GUARANTOR_SERVICES: 'PARTNER_GUARANTOR_SERVICES',

  /** Moving services integration */
  PARTNER_MOVING_SERVICES: 'PARTNER_MOVING_SERVICES',

  /** Vendor marketplace (furniture, appliances, cleaning) */
  PARTNER_VENDOR_MARKETPLACE: 'PARTNER_VENDOR_MARKETPLACE',

  /** Partner sandbox mode for testing without real API calls */
  PARTNER_SANDBOX_MODE: 'PARTNER_SANDBOX_MODE',

  /** Partner revenue dashboard for admin */
  PARTNER_REVENUE_DASHBOARD: 'PARTNER_REVENUE_DASHBOARD',

  /** Partner attribution tracking */
  PARTNER_ATTRIBUTION_TRACKING: 'PARTNER_ATTRIBUTION_TRACKING',

  /** Partner commission payments */
  PARTNER_COMMISSION_PAYMENTS: 'PARTNER_COMMISSION_PAYMENTS',
} as const;

export type FeatureFlag = (typeof FeatureFlag)[keyof typeof FeatureFlag];

export const FeatureFlagSchema = z.enum([
  'TOUR_3DGS_CAPTURE',
  'TOUR_SOG_CONVERSION',
  'TOUR_WEBGPU_VIEWER',
  'TOUR_LOD_STREAMING',
  'AI_VALUATION',
  'AI_LEASE_ANALYSIS',
  'AI_MAINTENANCE_TRIAGE',
  'AI_TENANT_ASSISTANT',
  'COMPLIANCE_ENHANCED_REPORTING',
  'COMPLIANCE_REALTIME_MONITORING',
  'PAYMENTS_CRYPTO',
  'PAYMENTS_INSTANT_PAYOUT',
  'PARTNER_LEMONADE',
  'PARTNER_RHINO',
  'PARTNER_UTILITY_CONCIERGE',
  'PARTNER_GUARANTOR_SERVICES',
  'PARTNER_MOVING_SERVICES',
  'PARTNER_VENDOR_MARKETPLACE',
  'PARTNER_SANDBOX_MODE',
  'PARTNER_REVENUE_DASHBOARD',
  'PARTNER_ATTRIBUTION_TRACKING',
  'PARTNER_COMMISSION_PAYMENTS',
]);

/**
 * Feature flag metadata for documentation and UI
 */
export interface FeatureFlagMetadata {
  key: FeatureFlag;
  name: string;
  description: string;
  category: FeatureCategory;
  rolloutPhase: RolloutPhase;
  defaultEnabled: boolean;
  marketGated: boolean;
}

export type FeatureCategory =
  | 'TOUR'
  | 'AI'
  | 'COMPLIANCE'
  | 'PAYMENTS'
  | 'PARTNER';

export type RolloutPhase =
  | 'ALPHA'      // Internal testing only
  | 'BETA'       // Limited market rollout
  | 'GA'         // Generally available
  | 'DEPRECATED'; // Being phased out

/**
 * Feature flag registry with metadata
 */
export const FEATURE_FLAG_REGISTRY: Record<FeatureFlag, FeatureFlagMetadata> = {
  // 3D Tour Features
  TOUR_3DGS_CAPTURE: {
    key: 'TOUR_3DGS_CAPTURE',
    name: '3DGS Capture',
    description: 'Enable 3D Gaussian Splatting capture workflow for properties',
    category: 'TOUR',
    rolloutPhase: 'BETA',
    defaultEnabled: false,
    marketGated: true,
  },
  TOUR_SOG_CONVERSION: {
    key: 'TOUR_SOG_CONVERSION',
    name: 'SOG Conversion',
    description: 'Enable Scene Optimized Gaussian conversion pipeline',
    category: 'TOUR',
    rolloutPhase: 'BETA',
    defaultEnabled: false,
    marketGated: true,
  },
  TOUR_WEBGPU_VIEWER: {
    key: 'TOUR_WEBGPU_VIEWER',
    name: 'WebGPU Viewer',
    description: 'Enable WebGPU-accelerated 3D tour viewer',
    category: 'TOUR',
    rolloutPhase: 'BETA',
    defaultEnabled: false,
    marketGated: true,
  },
  TOUR_LOD_STREAMING: {
    key: 'TOUR_LOD_STREAMING',
    name: 'LOD Streaming',
    description: 'Enable Level-of-Detail streaming for 3D tours',
    category: 'TOUR',
    rolloutPhase: 'BETA',
    defaultEnabled: false,
    marketGated: true,
  },

  // AI Features
  AI_VALUATION: {
    key: 'AI_VALUATION',
    name: 'AI Valuation',
    description: 'AI-powered property valuation',
    category: 'AI',
    rolloutPhase: 'GA',
    defaultEnabled: true,
    marketGated: false,
  },
  AI_LEASE_ANALYSIS: {
    key: 'AI_LEASE_ANALYSIS',
    name: 'AI Lease Analysis',
    description: 'AI lease document analysis',
    category: 'AI',
    rolloutPhase: 'GA',
    defaultEnabled: true,
    marketGated: false,
  },
  AI_MAINTENANCE_TRIAGE: {
    key: 'AI_MAINTENANCE_TRIAGE',
    name: 'AI Maintenance Triage',
    description: 'AI maintenance request triage',
    category: 'AI',
    rolloutPhase: 'GA',
    defaultEnabled: true,
    marketGated: false,
  },
  AI_TENANT_ASSISTANT: {
    key: 'AI_TENANT_ASSISTANT',
    name: 'AI Tenant Assistant',
    description: 'AI tenant communication assistant',
    category: 'AI',
    rolloutPhase: 'BETA',
    defaultEnabled: false,
    marketGated: false,
  },

  // Compliance Features
  COMPLIANCE_ENHANCED_REPORTING: {
    key: 'COMPLIANCE_ENHANCED_REPORTING',
    name: 'Enhanced Compliance Reporting',
    description: 'Enhanced compliance reporting dashboard',
    category: 'COMPLIANCE',
    rolloutPhase: 'GA',
    defaultEnabled: true,
    marketGated: false,
  },
  COMPLIANCE_REALTIME_MONITORING: {
    key: 'COMPLIANCE_REALTIME_MONITORING',
    name: 'Realtime Compliance Monitoring',
    description: 'Real-time compliance monitoring and alerts',
    category: 'COMPLIANCE',
    rolloutPhase: 'BETA',
    defaultEnabled: false,
    marketGated: false,
  },

  // Payment Features
  PAYMENTS_CRYPTO: {
    key: 'PAYMENTS_CRYPTO',
    name: 'Crypto Payments',
    description: 'Cryptocurrency rent payments',
    category: 'PAYMENTS',
    rolloutPhase: 'ALPHA',
    defaultEnabled: false,
    marketGated: true,
  },
  PAYMENTS_INSTANT_PAYOUT: {
    key: 'PAYMENTS_INSTANT_PAYOUT',
    name: 'Instant Payout',
    description: 'Instant payout to landlords',
    category: 'PAYMENTS',
    rolloutPhase: 'GA',
    defaultEnabled: true,
    marketGated: false,
  },

  // Partner Features
  PARTNER_LEMONADE: {
    key: 'PARTNER_LEMONADE',
    name: 'Lemonade Insurance',
    description: 'Lemonade insurance integration',
    category: 'PARTNER',
    rolloutPhase: 'GA',
    defaultEnabled: true,
    marketGated: false,
  },
  PARTNER_RHINO: {
    key: 'PARTNER_RHINO',
    name: 'Rhino Deposit',
    description: 'Rhino deposit alternative',
    category: 'PARTNER',
    rolloutPhase: 'GA',
    defaultEnabled: true,
    marketGated: false,
  },
  PARTNER_UTILITY_CONCIERGE: {
    key: 'PARTNER_UTILITY_CONCIERGE',
    name: 'Utility Concierge',
    description: 'Utility concierge service',
    category: 'PARTNER',
    rolloutPhase: 'BETA',
    defaultEnabled: false,
    marketGated: true,
  },
  PARTNER_GUARANTOR_SERVICES: {
    key: 'PARTNER_GUARANTOR_SERVICES',
    name: 'Guarantor Services',
    description: 'Guarantor services integration (TheGuarantors, Insurent)',
    category: 'PARTNER',
    rolloutPhase: 'GA',
    defaultEnabled: true,
    marketGated: false,
  },
  PARTNER_MOVING_SERVICES: {
    key: 'PARTNER_MOVING_SERVICES',
    name: 'Moving Services',
    description: 'Moving services integration for tenant relocations',
    category: 'PARTNER',
    rolloutPhase: 'BETA',
    defaultEnabled: false,
    marketGated: true,
  },
  PARTNER_VENDOR_MARKETPLACE: {
    key: 'PARTNER_VENDOR_MARKETPLACE',
    name: 'Vendor Marketplace',
    description: 'Vendor marketplace for furniture, appliances, cleaning services',
    category: 'PARTNER',
    rolloutPhase: 'BETA',
    defaultEnabled: false,
    marketGated: true,
  },
  PARTNER_SANDBOX_MODE: {
    key: 'PARTNER_SANDBOX_MODE',
    name: 'Partner Sandbox Mode',
    description: 'Enable sandbox mode for partner integrations (no real API calls)',
    category: 'PARTNER',
    rolloutPhase: 'GA',
    defaultEnabled: true,
    marketGated: false,
  },
  PARTNER_REVENUE_DASHBOARD: {
    key: 'PARTNER_REVENUE_DASHBOARD',
    name: 'Partner Revenue Dashboard',
    description: 'Admin dashboard for viewing partner attribution and revenue',
    category: 'PARTNER',
    rolloutPhase: 'GA',
    defaultEnabled: true,
    marketGated: false,
  },
  PARTNER_ATTRIBUTION_TRACKING: {
    key: 'PARTNER_ATTRIBUTION_TRACKING',
    name: 'Partner Attribution Tracking',
    description: 'Track revenue attribution for partner referrals',
    category: 'PARTNER',
    rolloutPhase: 'GA',
    defaultEnabled: true,
    marketGated: false,
  },
  PARTNER_COMMISSION_PAYMENTS: {
    key: 'PARTNER_COMMISSION_PAYMENTS',
    name: 'Partner Commission Payments',
    description: 'Automated commission payments to partners',
    category: 'PARTNER',
    rolloutPhase: 'BETA',
    defaultEnabled: false,
    marketGated: false,
  },
};

/**
 * Get all feature flags by category
 */
export function getFlagsByCategory(category: FeatureCategory): FeatureFlagMetadata[] {
  return Object.values(FEATURE_FLAG_REGISTRY).filter(
    (meta) => meta.category === category
  );
}

/**
 * Get all market-gated feature flags
 */
export function getMarketGatedFlags(): FeatureFlagMetadata[] {
  return Object.values(FEATURE_FLAG_REGISTRY).filter(
    (meta) => meta.marketGated
  );
}

/**
 * Get all 3D Tour feature flags
 */
export function getTour3DGSFlags(): FeatureFlagMetadata[] {
  return [
    FEATURE_FLAG_REGISTRY.TOUR_3DGS_CAPTURE,
    FEATURE_FLAG_REGISTRY.TOUR_SOG_CONVERSION,
    FEATURE_FLAG_REGISTRY.TOUR_WEBGPU_VIEWER,
    FEATURE_FLAG_REGISTRY.TOUR_LOD_STREAMING,
  ];
}
