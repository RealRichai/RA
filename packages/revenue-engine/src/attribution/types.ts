/**
 * Partner Attribution Types
 *
 * Types for tracking partner revenue attribution through the sales funnel.
 */

import { z } from 'zod';

// ============================================================================
// Enums
// ============================================================================

export type CommissionType = 'percentage' | 'fixed' | 'hybrid';
export type AttributionStatus = 'pending' | 'qualified' | 'realized' | 'failed' | 'disputed';
export type ProductType =
  | 'deposit_alternative'
  | 'renters_insurance'
  | 'guarantor'
  | 'utilities_concierge'
  | 'moving_services'
  | 'vendor_marketplace';

// ============================================================================
// Attribution Record
// ============================================================================

export interface PartnerAttribution {
  id: string;
  partnerId: string;
  partnerName: string;
  productType: ProductType;
  commissionType: CommissionType;
  commissionRate?: number; // 0.0 to 1.0 for percentage
  fixedAmount?: number;

  // Revenue tracking
  expectedRevenue: number;
  realizedRevenue: number;
  status: AttributionStatus;

  // References
  policyId?: string;
  leaseId?: string;
  applicationId?: string;
  organizationId?: string;
  tenantId?: string;

  // Ledger integration
  ledgerTransactionId?: string;

  // Attribution details
  leadSource?: string;
  campaignId?: string;
  attributionWindow: number; // days
  conversionWindow: number; // days

  // Timestamps
  qualifiedAt?: Date;
  realizedAt?: Date;
  failedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  // Metadata
  metadata?: Record<string, unknown>;
  notes?: string;
}

// ============================================================================
// Zod Schemas
// ============================================================================

export const CommissionTypeSchema = z.enum(['percentage', 'fixed', 'hybrid']);
export const AttributionStatusSchema = z.enum(['pending', 'qualified', 'realized', 'failed', 'disputed']);
export const ProductTypeSchema = z.enum([
  'deposit_alternative',
  'renters_insurance',
  'guarantor',
  'utilities_concierge',
  'moving_services',
  'vendor_marketplace',
]);

export const CreateAttributionSchema = z.object({
  partnerId: z.string(),
  partnerName: z.string(),
  productType: ProductTypeSchema,
  commissionType: CommissionTypeSchema,
  commissionRate: z.number().min(0).max(1).optional(),
  fixedAmount: z.number().nonnegative().optional(),
  expectedRevenue: z.number().nonnegative(),
  policyId: z.string().uuid().optional(),
  leaseId: z.string().uuid().optional(),
  applicationId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  tenantId: z.string().uuid().optional(),
  leadSource: z.string().optional(),
  campaignId: z.string().optional(),
  attributionWindow: z.number().int().positive().default(30),
  conversionWindow: z.number().int().positive().default(7),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateAttributionInput = z.infer<typeof CreateAttributionSchema>;

export const UpdateAttributionSchema = z.object({
  status: AttributionStatusSchema.optional(),
  realizedRevenue: z.number().nonnegative().optional(),
  ledgerTransactionId: z.string().uuid().optional(),
  notes: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateAttributionInput = z.infer<typeof UpdateAttributionSchema>;

// ============================================================================
// Query Types
// ============================================================================

export interface AttributionQuery {
  partnerId?: string;
  productType?: ProductType;
  status?: AttributionStatus;
  organizationId?: string;
  leaseId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export const AttributionQuerySchema = z.object({
  partnerId: z.string().optional(),
  productType: ProductTypeSchema.optional(),
  status: AttributionStatusSchema.optional(),
  organizationId: z.string().uuid().optional(),
  leaseId: z.string().uuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.number().int().positive().max(100).default(50),
  offset: z.number().int().nonnegative().default(0),
});

// ============================================================================
// Dashboard Types
// ============================================================================

export interface PartnerRevenueSummary {
  partnerId: string;
  partnerName: string;
  totalExpectedRevenue: number;
  totalRealizedRevenue: number;
  pendingCount: number;
  qualifiedCount: number;
  realizedCount: number;
  failedCount: number;
  conversionRate: number; // realized / qualified
}

export interface ProductRevenueSummary {
  productType: ProductType;
  totalExpectedRevenue: number;
  totalRealizedRevenue: number;
  attributionCount: number;
  averageRevenue: number;
}

export interface RevenueDashboardData {
  period: {
    startDate: Date;
    endDate: Date;
  };
  totals: {
    expectedRevenue: number;
    realizedRevenue: number;
    pendingRevenue: number;
    failedRevenue: number;
  };
  byPartner: PartnerRevenueSummary[];
  byProduct: ProductRevenueSummary[];
  recentAttributions: PartnerAttribution[];
}

export const RevenueDashboardQuerySchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  organizationId: z.string().uuid().optional(),
  partnerId: z.string().optional(),
  productType: ProductTypeSchema.optional(),
});

export type RevenueDashboardQuery = z.infer<typeof RevenueDashboardQuerySchema>;
