import { z } from 'zod';

import { AuditFieldsSchema, MoneySchema, UUIDSchema } from './common';

// ============================================================================
// Property Management & Maintenance Types
// ============================================================================

export const MaintenancePrioritySchema = z.enum([
  'emergency', // Immediate action required
  'urgent', // 24 hours
  'high', // 2-3 days
  'normal', // 1 week
  'low', // 2+ weeks
  'scheduled', // Planned maintenance
]);
export type MaintenancePriority = z.infer<typeof MaintenancePrioritySchema>;

export const MaintenanceCategorySchema = z.enum([
  'plumbing',
  'electrical',
  'hvac',
  'appliance',
  'structural',
  'pest',
  'safety',
  'cosmetic',
  'common_area',
  'exterior',
  'flooring',
  'windows_doors',
  'locks_security',
  'fire_safety',
  'elevator',
  'parking',
  'landscaping',
  'cleaning',
  'other',
]);
export type MaintenanceCategory = z.infer<typeof MaintenanceCategorySchema>;

export const WorkOrderStatusSchema = z.enum([
  'submitted',
  'acknowledged',
  'in_progress',
  'pending_parts',
  'pending_vendor',
  'pending_approval',
  'scheduled',
  'completed',
  'cancelled',
  'on_hold',
]);
export type WorkOrderStatus = z.infer<typeof WorkOrderStatusSchema>;

// Work Order (Maintenance Request)
export const WorkOrderSchema = z.object({
  id: UUIDSchema,
  orderNumber: z.string(),
  propertyId: UUIDSchema,
  unitId: UUIDSchema.optional(),
  reportedBy: UUIDSchema,
  assignedTo: UUIDSchema.optional(),
  vendorId: UUIDSchema.optional(),

  // Issue details
  title: z.string().max(200),
  description: z.string().max(5000),
  category: MaintenanceCategorySchema,
  subcategory: z.string().optional(),
  priority: MaintenancePrioritySchema,

  // Status tracking
  status: WorkOrderStatusSchema,
  statusHistory: z.array(z.object({
    status: WorkOrderStatusSchema,
    changedAt: z.coerce.date(),
    changedBy: UUIDSchema,
    notes: z.string().optional(),
  })).default([]),

  // AI triage
  aiTriaged: z.boolean().default(false),
  aiTriageId: UUIDSchema.optional(),
  aiDiagnosis: z.string().optional(),
  aiSuggestedPriority: MaintenancePrioritySchema.optional(),
  aiEstimatedCost: MoneySchema.optional(),

  // Media
  photos: z.array(z.object({
    id: UUIDSchema,
    url: z.string(),
    caption: z.string().optional(),
    uploadedAt: z.coerce.date(),
  })).default([]),
  videos: z.array(z.object({
    id: UUIDSchema,
    url: z.string(),
    caption: z.string().optional(),
    uploadedAt: z.coerce.date(),
  })).default([]),

  // Access
  permissionToEnter: z.boolean().default(false),
  preferredSchedule: z.array(z.object({
    date: z.coerce.date(),
    startTime: z.string(),
    endTime: z.string(),
  })).default([]),
  accessInstructions: z.string().optional(),
  hasPets: z.boolean().default(false),
  petInstructions: z.string().optional(),

  // Scheduling
  scheduledDate: z.coerce.date().optional(),
  scheduledTimeSlot: z.string().optional(),
  estimatedDuration: z.number().int().optional(), // Minutes
  actualStartTime: z.coerce.date().optional(),
  actualEndTime: z.coerce.date().optional(),

  // Work performed
  workPerformed: z.string().optional(),
  partsUsed: z.array(z.object({
    name: z.string(),
    quantity: z.number().int(),
    cost: MoneySchema.optional(),
  })).default([]),
  laborHours: z.number().optional(),

  // Cost
  estimatedCost: MoneySchema.optional(),
  actualCost: MoneySchema.optional(),
  costBreakdown: z.object({
    labor: MoneySchema.optional(),
    parts: MoneySchema.optional(),
    other: MoneySchema.optional(),
  }).optional(),
  billToTenant: z.boolean().default(false),
  invoiceId: UUIDSchema.optional(),

  // Resolution
  resolvedAt: z.coerce.date().optional(),
  resolutionNotes: z.string().optional(),
  warrantyApplied: z.boolean().default(false),

  // Follow-up
  requiresFollowUp: z.boolean().default(false),
  followUpDate: z.coerce.date().optional(),
  followUpNotes: z.string().optional(),
  parentWorkOrderId: UUIDSchema.optional(),
  childWorkOrderIds: z.array(UUIDSchema).default([]),

  // Ratings
  tenantRating: z.number().int().min(1).max(5).optional(),
  tenantFeedback: z.string().optional(),
  landlordRating: z.number().int().min(1).max(5).optional(),
  landlordFeedback: z.string().optional(),

  // Compliance
  isEmergency: z.boolean().default(false),
  emergencyResponseTime: z.number().int().optional(), // Minutes
  habitabilityIssue: z.boolean().default(false),

  // Documents
  documents: z.array(UUIDSchema).default([]),

  // Escalation
  escalated: z.boolean().default(false),
  escalatedAt: z.coerce.date().optional(),
  escalatedTo: UUIDSchema.optional(),
  escalationReason: z.string().optional(),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type WorkOrder = z.infer<typeof WorkOrderSchema>;

// Vendor
export const VendorSchema = z.object({
  id: UUIDSchema,
  organizationId: UUIDSchema.optional(),

  // Business info
  companyName: z.string(),
  contactName: z.string(),
  email: z.string().email(),
  phone: z.string(),
  website: z.string().url().optional(),

  // Address
  address: z.object({
    street1: z.string(),
    street2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    postalCode: z.string(),
    country: z.string().default('US'),
  }).optional(),

  // Services
  categories: z.array(MaintenanceCategorySchema),
  services: z.array(z.string()),
  serviceAreas: z.array(z.string()), // ZIP codes or neighborhoods

  // Rates
  hourlyRate: MoneySchema.optional(),
  minimumCharge: MoneySchema.optional(),
  emergencyRate: MoneySchema.optional(),

  // Availability
  availability: z.object({
    monday: z.object({ start: z.string(), end: z.string() }).optional(),
    tuesday: z.object({ start: z.string(), end: z.string() }).optional(),
    wednesday: z.object({ start: z.string(), end: z.string() }).optional(),
    thursday: z.object({ start: z.string(), end: z.string() }).optional(),
    friday: z.object({ start: z.string(), end: z.string() }).optional(),
    saturday: z.object({ start: z.string(), end: z.string() }).optional(),
    sunday: z.object({ start: z.string(), end: z.string() }).optional(),
    emergency24x7: z.boolean().default(false),
  }).optional(),

  // Compliance
  isLicensed: z.boolean().default(false),
  licenseNumber: z.string().optional(),
  licenseExpiry: z.coerce.date().optional(),
  isInsured: z.boolean().default(false),
  insuranceExpiry: z.coerce.date().optional(),
  isBonded: z.boolean().default(false),

  // Performance
  totalJobs: z.number().int().default(0),
  completedJobs: z.number().int().default(0),
  averageRating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().default(0),
  averageResponseTime: z.number().optional(), // Hours
  onTimeRate: z.number().optional(), // Percentage

  // Payment
  paymentTerms: z.enum(['net_15', 'net_30', 'net_60', 'on_completion']).default('net_30'),
  preferredPaymentMethod: z.enum(['check', 'ach', 'card']).default('ach'),
  taxId: z.string().optional(), // W-9
  w9OnFile: z.boolean().default(false),

  // Status
  status: z.enum(['active', 'inactive', 'pending_verification', 'suspended']),
  verifiedAt: z.coerce.date().optional(),

  // Preferences
  preferredVendor: z.boolean().default(false),
  notes: z.string().optional(),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type Vendor = z.infer<typeof VendorSchema>;

// Inspection
export const InspectionSchema = z.object({
  id: UUIDSchema,
  propertyId: UUIDSchema,
  unitId: UUIDSchema.optional(),
  inspectorId: UUIDSchema,

  type: z.enum([
    'move_in',
    'move_out',
    'annual',
    'maintenance',
    'safety',
    'pre_lease',
    'post_renovation',
    'complaint',
  ]),

  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']),

  scheduledDate: z.coerce.date(),
  completedDate: z.coerce.date().optional(),

  // Checklist
  checklist: z.array(z.object({
    id: UUIDSchema,
    area: z.string(),
    item: z.string(),
    condition: z.enum(['excellent', 'good', 'fair', 'poor', 'not_applicable']).optional(),
    notes: z.string().optional(),
    photos: z.array(z.string()).default([]),
    requiresAttention: z.boolean().default(false),
  })).default([]),

  // Findings
  overallCondition: z.enum(['excellent', 'good', 'fair', 'poor']).optional(),
  findings: z.string().optional(),
  workOrdersGenerated: z.array(UUIDSchema).default([]),

  // For move-in/out
  tenantId: UUIDSchema.optional(),
  leaseId: UUIDSchema.optional(),
  tenantSignature: z.string().optional(),
  tenantSignedAt: z.coerce.date().optional(),
  landlordSignature: z.string().optional(),
  landlordSignedAt: z.coerce.date().optional(),

  // Documents
  reportDocumentId: UUIDSchema.optional(),
  photos: z.array(z.object({
    url: z.string(),
    caption: z.string().optional(),
    area: z.string().optional(),
  })).default([]),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type Inspection = z.infer<typeof InspectionSchema>;

// God View Dashboard Types
export const GodViewPropertySummarySchema = z.object({
  propertyId: UUIDSchema,
  propertyName: z.string(),
  address: z.string(),

  // Units
  totalUnits: z.number().int(),
  occupiedUnits: z.number().int(),
  vacantUnits: z.number().int(),
  occupancyRate: z.number(),

  // Financial
  monthlyRevenue: MoneySchema,
  collectedRevenue: MoneySchema,
  outstandingBalance: MoneySchema,
  collectionRate: z.number(),

  // Leases
  activeLeases: z.number().int(),
  expiringLeases: z.number().int(), // Next 60 days
  renewalPending: z.number().int(),

  // Maintenance
  openWorkOrders: z.number().int(),
  emergencyWorkOrders: z.number().int(),
  avgResolutionTime: z.number(), // Hours

  // Compliance
  complianceStatus: z.enum(['compliant', 'issues', 'critical']),
  complianceIssues: z.number().int(),

  // Recent activity
  recentAlerts: z.array(z.object({
    type: z.string(),
    message: z.string(),
    severity: z.enum(['info', 'warning', 'critical']),
    timestamp: z.coerce.date(),
  })),
});
export type GodViewPropertySummary = z.infer<typeof GodViewPropertySummarySchema>;

export const GodViewDashboardSchema = z.object({
  // Portfolio overview
  totalProperties: z.number().int(),
  totalUnits: z.number().int(),
  portfolioValue: MoneySchema,

  // Occupancy
  overallOccupancy: z.number(),
  occupiedUnits: z.number().int(),
  vacantUnits: z.number().int(),

  // Revenue
  monthlyRevenue: MoneySchema,
  yearToDateRevenue: MoneySchema,
  projectedAnnualRevenue: MoneySchema,
  collectionRate: z.number(),

  // Leases
  activeLeases: z.number().int(),
  pendingApplications: z.number().int(),
  expiringThisMonth: z.number().int(),
  expiringNext90Days: z.number().int(),

  // Maintenance
  openWorkOrders: z.number().int(),
  emergencyOrders: z.number().int(),
  avgResolutionTime: z.number(),

  // Compliance
  complianceScore: z.number(),
  criticalIssues: z.number().int(),
  pendingDisclosures: z.number().int(),

  // Financial health
  operatingExpenses: MoneySchema,
  netOperatingIncome: MoneySchema,
  capRate: z.number().optional(),

  // Properties summary
  properties: z.array(GodViewPropertySummarySchema),

  // Alerts
  alerts: z.array(z.object({
    id: UUIDSchema,
    type: z.string(),
    severity: z.enum(['info', 'warning', 'critical']),
    title: z.string(),
    message: z.string(),
    entityType: z.string().optional(),
    entityId: UUIDSchema.optional(),
    actionUrl: z.string().optional(),
    timestamp: z.coerce.date(),
  })),

  generatedAt: z.coerce.date(),
});
export type GodViewDashboard = z.infer<typeof GodViewDashboardSchema>;

// Work order filter
export const WorkOrderFilterSchema = z.object({
  propertyId: UUIDSchema.optional(),
  unitId: UUIDSchema.optional(),
  reportedBy: UUIDSchema.optional(),
  assignedTo: UUIDSchema.optional(),
  vendorId: UUIDSchema.optional(),
  status: WorkOrderStatusSchema.optional(),
  statuses: z.array(WorkOrderStatusSchema).optional(),
  priority: MaintenancePrioritySchema.optional(),
  priorities: z.array(MaintenancePrioritySchema).optional(),
  category: MaintenanceCategorySchema.optional(),
  categories: z.array(MaintenanceCategorySchema).optional(),
  isEmergency: z.boolean().optional(),
  escalated: z.boolean().optional(),
  createdAfter: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),
  scheduledAfter: z.coerce.date().optional(),
  scheduledBefore: z.coerce.date().optional(),
});
export type WorkOrderFilter = z.infer<typeof WorkOrderFilterSchema>;
