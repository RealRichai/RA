import { z } from 'zod';

import { MoneySchema, UUIDSchema } from './common';

// ============================================================================
// Analytics Types
// ============================================================================

export const TimeGranularitySchema = z.enum([
  'hour',
  'day',
  'week',
  'month',
  'quarter',
  'year',
]);
export type TimeGranularity = z.infer<typeof TimeGranularitySchema>;

export const MetricTypeSchema = z.enum([
  // Property metrics
  'occupancy_rate',
  'vacancy_rate',
  'turnover_rate',
  'avg_days_vacant',
  'avg_lease_term',

  // Financial metrics
  'gross_revenue',
  'net_operating_income',
  'operating_expenses',
  'collection_rate',
  'delinquency_rate',
  'avg_rent',
  'rent_growth',
  'cap_rate',
  'cash_on_cash_return',

  // Listing metrics
  'listing_views',
  'listing_inquiries',
  'listing_applications',
  'conversion_rate',
  'avg_time_to_lease',
  'avg_days_on_market',

  // Maintenance metrics
  'work_order_count',
  'avg_resolution_time',
  'maintenance_cost',
  'preventive_vs_reactive',
  'vendor_performance',

  // Tenant metrics
  'tenant_satisfaction',
  'renewal_rate',
  'eviction_rate',
  'avg_tenant_tenure',

  // Marketing metrics
  'lead_volume',
  'lead_quality',
  'marketing_roi',
  'cost_per_lead',
  'cost_per_lease',
]);
export type MetricType = z.infer<typeof MetricTypeSchema>;

// Analytics query
export const AnalyticsQuerySchema = z.object({
  metrics: z.array(MetricTypeSchema),
  groupBy: z.array(z.enum(['property', 'unit', 'market', 'time'])).optional(),
  timeRange: z.object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  }),
  granularity: TimeGranularitySchema.default('day'),
  filters: z.object({
    propertyIds: z.array(UUIDSchema).optional(),
    unitIds: z.array(UUIDSchema).optional(),
    marketIds: z.array(z.string()).optional(),
  }).optional(),
  comparison: z.object({
    enabled: z.boolean().default(false),
    type: z.enum(['previous_period', 'year_over_year', 'custom']).optional(),
    customRange: z.object({
      start: z.coerce.date(),
      end: z.coerce.date(),
    }).optional(),
  }).optional(),
});
export type AnalyticsQuery = z.infer<typeof AnalyticsQuerySchema>;

// Analytics data point
export const AnalyticsDataPointSchema = z.object({
  timestamp: z.coerce.date(),
  value: z.number(),
  comparisonValue: z.number().optional(),
  change: z.number().optional(), // Percentage change
  metadata: z.record(z.unknown()).optional(),
});
export type AnalyticsDataPoint = z.infer<typeof AnalyticsDataPointSchema>;

// Analytics result
export const AnalyticsResultSchema = z.object({
  metric: MetricTypeSchema,
  label: z.string(),
  unit: z.string().optional(), // '%', '$', 'days', etc.
  currentValue: z.number(),
  previousValue: z.number().optional(),
  change: z.number().optional(),
  changeDirection: z.enum(['up', 'down', 'unchanged']).optional(),
  trend: z.enum(['improving', 'declining', 'stable']).optional(),
  data: z.array(AnalyticsDataPointSchema),
  breakdown: z.array(z.object({
    label: z.string(),
    value: z.number(),
    percentage: z.number().optional(),
  })).optional(),
});
export type AnalyticsResult = z.infer<typeof AnalyticsResultSchema>;

// Portfolio summary
export const PortfolioSummarySchema = z.object({
  asOf: z.coerce.date(),

  // Overview
  totalProperties: z.number().int(),
  totalUnits: z.number().int(),
  totalSquareFeet: z.number().int().optional(),
  portfolioValue: MoneySchema,

  // Occupancy
  occupiedUnits: z.number().int(),
  vacantUnits: z.number().int(),
  occupancyRate: z.number(),

  // Financial
  monthlyRevenue: MoneySchema,
  yearToDateRevenue: MoneySchema,
  netOperatingIncome: MoneySchema,
  operatingExpenses: MoneySchema,
  expenseRatio: z.number(),
  averageRent: MoneySchema,
  collectionRate: z.number(),
  delinquentAmount: MoneySchema,

  // Leases
  activeLeases: z.number().int(),
  expiringNext30Days: z.number().int(),
  expiringNext90Days: z.number().int(),
  renewalRate: z.number(),
  averageLeaseTerm: z.number(), // Months

  // Applications
  pendingApplications: z.number().int(),
  applicationsThisMonth: z.number().int(),
  approvalRate: z.number(),
  averageTimeToLease: z.number(), // Days

  // Maintenance
  openWorkOrders: z.number().int(),
  avgResolutionTime: z.number(), // Hours
  maintenanceCostMTD: MoneySchema,
  emergencyRatio: z.number(),

  // Compliance
  complianceScore: z.number(), // 0-100
  pendingViolations: z.number().int(),

  // Performance by market
  marketPerformance: z.array(z.object({
    marketId: z.string(),
    marketName: z.string(),
    properties: z.number().int(),
    units: z.number().int(),
    occupancy: z.number(),
    revenue: MoneySchema,
  })),

  // Performance by property type
  typePerformance: z.array(z.object({
    type: z.string(),
    properties: z.number().int(),
    units: z.number().int(),
    occupancy: z.number(),
    avgRent: MoneySchema,
  })),
});
export type PortfolioSummary = z.infer<typeof PortfolioSummarySchema>;

// Market analytics
export const MarketAnalyticsSchema = z.object({
  marketId: z.string(),
  marketName: z.string(),
  asOf: z.coerce.date(),

  // Rent trends
  medianRent: MoneySchema,
  rentGrowthYoY: z.number(), // Percentage
  rentPerSqFt: z.number(),

  // Vacancy
  marketVacancyRate: z.number(),
  yourVacancyRate: z.number().optional(),

  // Comparable properties
  comparables: z.array(z.object({
    name: z.string(),
    address: z.string(),
    units: z.number().int(),
    avgRent: MoneySchema,
    occupancy: z.number(),
    distance: z.number(), // Miles
  })).optional(),

  // Demand indicators
  searchVolume: z.number().optional(),
  daysOnMarket: z.number(),
  absorptionRate: z.number().optional(),

  // Demographics
  population: z.number().int().optional(),
  populationGrowth: z.number().optional(),
  medianHouseholdIncome: MoneySchema.optional(),
  rentToIncomeRatio: z.number().optional(),

  // Forecast
  rentForecast: z.object({
    threeMonth: z.number(),
    sixMonth: z.number(),
    twelveMonth: z.number(),
  }).optional(),
});
export type MarketAnalytics = z.infer<typeof MarketAnalyticsSchema>;

// Property performance report
export const PropertyPerformanceSchema = z.object({
  propertyId: UUIDSchema,
  propertyName: z.string(),
  reportPeriod: z.object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  }),

  // Financial
  grossPotentialRent: MoneySchema,
  actualRent: MoneySchema,
  vacancyLoss: MoneySchema,
  concessions: MoneySchema,
  effectiveGrossIncome: MoneySchema,
  operatingExpenses: MoneySchema,
  netOperatingIncome: MoneySchema,
  expenseRatio: z.number(),
  capRate: z.number().optional(),

  // Occupancy
  avgOccupancy: z.number(),
  unitTurnover: z.number(),
  avgDaysVacant: z.number(),

  // Collections
  rentCollected: MoneySchema,
  outstandingBalance: MoneySchema,
  badDebt: MoneySchema,
  collectionRate: z.number(),

  // Expenses breakdown
  expenseBreakdown: z.array(z.object({
    category: z.string(),
    amount: MoneySchema,
    percentage: z.number(),
    budgeted: MoneySchema.optional(),
    variance: z.number().optional(),
  })),

  // Maintenance
  maintenanceRequests: z.number().int(),
  maintenanceCost: MoneySchema,
  avgResolutionTime: z.number(),

  // Leasing
  newLeases: z.number().int(),
  renewals: z.number().int(),
  moveOuts: z.number().int(),
  renewalRate: z.number(),
  avgNewLeaseRent: MoneySchema,
  avgRenewalRent: MoneySchema,

  // Unit-level detail
  unitPerformance: z.array(z.object({
    unitId: UUIDSchema,
    unitNumber: z.string(),
    status: z.string(),
    currentRent: MoneySchema,
    marketRent: MoneySchema,
    leaseExpiry: z.coerce.date().optional(),
    balanceDue: MoneySchema,
    maintenanceCount: z.number().int(),
  })),
});
export type PropertyPerformance = z.infer<typeof PropertyPerformanceSchema>;

// Event tracking
export const AnalyticsEventSchema = z.object({
  id: UUIDSchema,
  eventType: z.string(),
  userId: UUIDSchema.optional(),
  sessionId: z.string().optional(),

  // Event data
  entityType: z.string().optional(),
  entityId: UUIDSchema.optional(),
  properties: z.record(z.unknown()),

  // Context
  source: z.string().optional(),
  referrer: z.string().optional(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
  geolocation: z.object({
    country: z.string(),
    region: z.string(),
    city: z.string(),
  }).optional(),

  timestamp: z.coerce.date(),
});
export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>;

// Dashboard configuration
export const DashboardConfigSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  name: z.string(),
  isDefault: z.boolean().default(false),

  widgets: z.array(z.object({
    id: z.string(),
    type: z.enum([
      'metric_card',
      'chart',
      'table',
      'map',
      'list',
      'calendar',
      'pie_chart',
      'bar_chart',
      'line_chart',
    ]),
    title: z.string(),
    metric: MetricTypeSchema.optional(),
    config: z.record(z.unknown()),
    position: z.object({
      x: z.number().int(),
      y: z.number().int(),
      w: z.number().int(),
      h: z.number().int(),
    }),
  })),

  filters: z.object({
    properties: z.array(UUIDSchema).optional(),
    markets: z.array(z.string()).optional(),
    dateRange: z.object({
      start: z.coerce.date(),
      end: z.coerce.date(),
    }).optional(),
  }).optional(),

  refreshInterval: z.number().int().optional(), // Seconds
});
export type DashboardConfig = z.infer<typeof DashboardConfigSchema>;
