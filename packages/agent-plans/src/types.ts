/**
 * Agent Plans Types
 *
 * Type definitions for subscription tiers and usage tracking.
 */

// =============================================================================
// Plan Tiers & Limits
// =============================================================================

export type AgentPlanTier = 'free' | 'starter' | 'professional' | 'enterprise';
export type PlanStatus = 'active' | 'trial' | 'past_due' | 'cancelled' | 'suspended';

export interface PlanLimits {
  monthlyCallLimit: number; // -1 = unlimited
  monthlyGenerationLimit: number; // -1 = unlimited
  monthlyTaskLimit: number; // -1 = unlimited
  callsPerMinute: number;
}

export interface AgentPlan {
  id: string;
  name: string;
  tier: AgentPlanTier;
  limits: PlanLimits;
  features: Record<string, boolean>;
  monthlyPriceCents: number;
}

export interface OrganizationPlan {
  id: string;
  organizationId: string;
  planId: string;
  plan: AgentPlan;
  status: PlanStatus;
  billingCycleStart: Date;
  billingCycleEnd: Date;
  customCallLimit?: number;
  customGenerationLimit?: number;
  customTaskLimit?: number;
}

// =============================================================================
// Usage Tracking
// =============================================================================

export interface PlanUsage {
  id: string;
  organizationPlanId: string;
  organizationId: string;
  periodStart: Date;
  callsUsed: number;
  generationsUsed: number;
  tasksUsed: number;
  callsLimit: number;
  generationsLimit: number;
  tasksLimit: number;
  callsOverageUsed: number;
  generationsOverageUsed: number;
  tasksOverageUsed: number;
}

export type UsageType = 'calls' | 'generations' | 'tasks';

export interface UsageCheckResult {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  remaining: number;
  isOverage: boolean;
  overageAmount?: number;
}

export interface UsageIncrementResult {
  success: boolean;
  newUsage: number;
  wasAtLimit: boolean;
  isNowOverage: boolean;
}

// =============================================================================
// Default Plan Definitions
// =============================================================================

export const DEFAULT_PLANS: Omit<AgentPlan, 'id'>[] = [
  {
    name: 'Free',
    tier: 'free',
    limits: {
      monthlyCallLimit: 10,
      monthlyGenerationLimit: 100,
      monthlyTaskLimit: 50,
      callsPerMinute: 2,
    },
    features: {
      voiceAgent: false,
      aiListingOps: false,
      advancedAnalytics: false,
      prioritySupport: false,
    },
    monthlyPriceCents: 0,
  },
  {
    name: 'Starter',
    tier: 'starter',
    limits: {
      monthlyCallLimit: 100,
      monthlyGenerationLimit: 1000,
      monthlyTaskLimit: 500,
      callsPerMinute: 5,
    },
    features: {
      voiceAgent: true,
      aiListingOps: false,
      advancedAnalytics: false,
      prioritySupport: false,
    },
    monthlyPriceCents: 4900,
  },
  {
    name: 'Professional',
    tier: 'professional',
    limits: {
      monthlyCallLimit: 500,
      monthlyGenerationLimit: 5000,
      monthlyTaskLimit: 2500,
      callsPerMinute: 10,
    },
    features: {
      voiceAgent: true,
      aiListingOps: true,
      advancedAnalytics: true,
      prioritySupport: false,
    },
    monthlyPriceCents: 14900,
  },
  {
    name: 'Enterprise',
    tier: 'enterprise',
    limits: {
      monthlyCallLimit: -1, // Unlimited
      monthlyGenerationLimit: -1,
      monthlyTaskLimit: -1,
      callsPerMinute: 50,
    },
    features: {
      voiceAgent: true,
      aiListingOps: true,
      advancedAnalytics: true,
      prioritySupport: true,
      dedicatedSupport: true,
      customIntegrations: true,
    },
    monthlyPriceCents: 49900,
  },
];
