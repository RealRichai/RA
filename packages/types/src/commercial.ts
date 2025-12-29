import { z } from 'zod';
import { AddressSchema, AuditFieldsSchema, MoneySchema, UUIDSchema } from './common';

// ============================================================================
// Commercial Real Estate & Enterprise Types
// ============================================================================

export const CommercialPropertyTypeSchema = z.enum([
  'office',
  'retail',
  'industrial',
  'warehouse',
  'flex',
  'mixed_use',
  'multifamily',
  'hotel',
  'medical',
  'data_center',
  'self_storage',
  'senior_living',
  'student_housing',
  'land',
]);
export type CommercialPropertyType = z.infer<typeof CommercialPropertyTypeSchema>;

export const LeaseTypeCommercialSchema = z.enum([
  'gross',
  'modified_gross',
  'net',
  'double_net',
  'triple_net',
  'absolute_net',
  'percentage',
  'ground',
]);
export type LeaseTypeCommercial = z.infer<typeof LeaseTypeCommercialSchema>;

// Commercial Property
export const CommercialPropertySchema = z.object({
  id: UUIDSchema,
  ownerId: UUIDSchema,
  managerId: UUIDSchema.optional(),

  // Basic info
  name: z.string(),
  address: AddressSchema,
  type: CommercialPropertyTypeSchema,
  class: z.enum(['A', 'B', 'C']).optional(),
  status: z.enum(['active', 'inactive', 'under_development', 'for_sale']),

  // Size
  totalSquareFeet: z.number().int().positive(),
  rentableSquareFeet: z.number().int().positive(),
  usableSquareFeet: z.number().int().positive().optional(),
  commonAreaFactor: z.number().optional(), // Load factor
  lotSize: z.number().optional(), // Acres

  // Building details
  yearBuilt: z.number().int().optional(),
  yearRenovated: z.number().int().optional(),
  stories: z.number().int().optional(),
  parkingRatio: z.number().optional(), // Spaces per 1000 SF
  parkingSpaces: z.number().int().optional(),
  ceilingHeight: z.number().optional(), // Feet
  columnSpacing: z.string().optional(),

  // Financial
  acquisitionPrice: MoneySchema.optional(),
  acquisitionDate: z.coerce.date().optional(),
  currentValue: MoneySchema.optional(),
  lastAppraisalDate: z.coerce.date().optional(),
  mortgageBalance: MoneySchema.optional(),
  annualTaxes: MoneySchema.optional(),
  annualInsurance: MoneySchema.optional(),
  annualCAM: MoneySchema.optional(), // Common Area Maintenance

  // Operating
  operatingExpenses: MoneySchema.optional(),
  noi: MoneySchema.optional(), // Net Operating Income
  capRate: z.number().optional(),
  occupancyRate: z.number().optional(),

  // Zoning & compliance
  zoning: z.string().optional(),
  environmentalIssues: z.array(z.string()).default([]),
  asbestosStatus: z.string().optional(),
  adaCompliant: z.boolean().optional(),

  // Features
  amenities: z.array(z.string()).default([]),
  utilities: z.object({
    electric: z.boolean().default(true),
    gas: z.boolean().default(true),
    water: z.boolean().default(true),
    sewer: z.boolean().default(true),
    fiber: z.boolean().optional(),
    generator: z.boolean().optional(),
  }).optional(),

  // Media
  images: z.array(z.object({
    url: z.string(),
    type: z.string().optional(),
    caption: z.string().optional(),
  })).default([]),
  floorPlans: z.array(z.object({
    floor: z.number().int(),
    url: z.string(),
  })).default([]),
  siteMap: z.string().optional(),

  // Market
  marketId: z.string(),
  submarket: z.string().optional(),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type CommercialProperty = z.infer<typeof CommercialPropertySchema>;

// Stacking Plan (building occupancy visualization)
export const StackingPlanSchema = z.object({
  id: UUIDSchema,
  propertyId: UUIDSchema,
  asOfDate: z.coerce.date(),

  floors: z.array(z.object({
    floorNumber: z.number().int(),
    totalSF: z.number().int(),
    rentableSF: z.number().int(),
    spaces: z.array(z.object({
      id: UUIDSchema,
      spaceNumber: z.string(),
      squareFeet: z.number().int(),
      status: z.enum(['occupied', 'vacant', 'pending', 'not_available']),
      tenantName: z.string().optional(),
      leaseId: UUIDSchema.optional(),
      leaseExpiry: z.coerce.date().optional(),
      rentPerSF: z.number().optional(),
      monthlyRent: MoneySchema.optional(),
      position: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      }),
      color: z.string().optional(),
    })),
  })),

  summary: z.object({
    totalSF: z.number().int(),
    occupiedSF: z.number().int(),
    vacantSF: z.number().int(),
    pendingSF: z.number().int(),
    occupancyRate: z.number(),
    averageRentPerSF: z.number(),
    waultYears: z.number(), // Weighted Average Unexpired Lease Term
  }),

  // Lease expirations by year
  expirationSchedule: z.array(z.object({
    year: z.number().int(),
    expiringSF: z.number().int(),
    expiringRent: MoneySchema,
    leaseCount: z.number().int(),
  })),
}).merge(AuditFieldsSchema);
export type StackingPlan = z.infer<typeof StackingPlanSchema>;

// Commercial Lease (more complex than residential)
export const CommercialLeaseSchema = z.object({
  id: UUIDSchema,
  propertyId: UUIDSchema,
  spaceId: UUIDSchema,
  tenantId: UUIDSchema,
  landlordId: UUIDSchema,

  // Basic terms
  leaseNumber: z.string(),
  leaseType: LeaseTypeCommercialSchema,
  status: z.enum(['draft', 'negotiating', 'pending_signature', 'active', 'expired', 'terminated']),

  // Space
  premisesDescription: z.string(),
  squareFeet: z.number().int(),
  floor: z.number().int().optional(),

  // Term
  commencementDate: z.coerce.date(),
  expirationDate: z.coerce.date(),
  rentCommencementDate: z.coerce.date().optional(),
  termMonths: z.number().int(),

  // Rent
  baseRent: MoneySchema, // Monthly
  rentPerSF: z.number(), // Annual per SF
  rentSchedule: z.array(z.object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    monthlyRent: MoneySchema,
    rentPerSF: z.number(),
    notes: z.string().optional(),
  })),

  // Escalations
  escalationType: z.enum(['fixed', 'cpi', 'market', 'none']),
  annualEscalation: z.number().optional(), // Percentage
  escalationCap: z.number().optional(),
  escalationFloor: z.number().optional(),
  escalationBase: z.number().optional(), // Base year for CPI

  // Operating expenses
  operatingExpenseType: z.enum(['gross', 'net', 'base_year', 'expense_stop']),
  baseYearExpenses: MoneySchema.optional(),
  expenseStop: MoneySchema.optional(),
  camEstimate: MoneySchema.optional(), // Annual
  taxEstimate: MoneySchema.optional(),
  insuranceEstimate: MoneySchema.optional(),
  utilitiesIncluded: z.array(z.string()).default([]),

  // Security
  securityDeposit: MoneySchema,
  letterOfCredit: MoneySchema.optional(),
  guarantorInfo: z.object({
    name: z.string(),
    type: z.enum(['personal', 'corporate']),
    amount: MoneySchema,
  }).optional(),

  // Concessions
  freeRentMonths: z.number().int().default(0),
  tenantImprovementAllowance: MoneySchema.optional(), // Per SF or total
  movingAllowance: MoneySchema.optional(),
  otherConcessions: z.array(z.object({
    type: z.string(),
    value: MoneySchema,
    description: z.string(),
  })).default([]),

  // Options
  renewalOptions: z.array(z.object({
    term: z.number().int(), // Months
    rentType: z.enum(['market', 'fixed', 'cpi', 'percentage_increase']),
    rentTerms: z.string(),
    noticePeriod: z.number().int(), // Days
    exercised: z.boolean().default(false),
  })).default([]),
  expansionOption: z.object({
    squareFeet: z.number().int(),
    space: z.string(),
    exercisePeriod: z.object({
      start: z.coerce.date(),
      end: z.coerce.date(),
    }),
    terms: z.string(),
  }).optional(),
  terminationOption: z.object({
    exerciseDate: z.coerce.date(),
    noticePeriod: z.number().int(),
    fee: MoneySchema,
    terms: z.string(),
  }).optional(),
  rightOfFirstRefusal: z.boolean().default(false),
  rightOfFirstOffer: z.boolean().default(false),

  // Tenant info
  tenantCompanyName: z.string(),
  tenantIndustry: z.string().optional(),
  tenantContactName: z.string(),
  tenantContactEmail: z.string().email(),
  tenantContactPhone: z.string(),

  // Use
  permittedUse: z.string(),
  exclusiveUse: z.string().optional(),
  restrictedUses: z.array(z.string()).default([]),

  // Signage
  signageRights: z.object({
    building: z.boolean().default(false),
    monument: z.boolean().default(false),
    suite: z.boolean().default(true),
    specifications: z.string().optional(),
  }).optional(),

  // Parking
  parkingSpaces: z.number().int().optional(),
  parkingType: z.enum(['included', 'reserved', 'unreserved', 'paid']).optional(),
  parkingRate: MoneySchema.optional(),

  // Insurance requirements
  insuranceRequirements: z.object({
    generalLiability: MoneySchema,
    propertyInsurance: MoneySchema.optional(),
    workersComp: z.boolean().default(true),
    umbrellaPolicy: MoneySchema.optional(),
  }).optional(),

  // Critical dates
  criticalDates: z.array(z.object({
    type: z.string(),
    date: z.coerce.date(),
    description: z.string(),
    reminderDays: z.number().int().default(30),
    notified: z.boolean().default(false),
  })).default([]),

  // Documents
  documents: z.array(UUIDSchema).default([]),
  signedLeaseDocumentId: UUIDSchema.optional(),

  // Financial analysis
  analysis: z.object({
    effectiveRent: z.number(), // Per SF
    netlEffectiveRent: z.number(),
    totalLeaseValue: MoneySchema,
    totalConcessions: MoneySchema,
    npv: MoneySchema.optional(), // Net Present Value
  }).optional(),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type CommercialLease = z.infer<typeof CommercialLeaseSchema>;

// Underwriting Model
export const UnderwritingModelSchema = z.object({
  id: UUIDSchema,
  propertyId: UUIDSchema,
  createdBy: UUIDSchema,
  name: z.string(),
  version: z.number().int().default(1),
  status: z.enum(['draft', 'final', 'archived']),

  // Acquisition
  acquisitionAssumptions: z.object({
    purchasePrice: MoneySchema,
    closingCosts: z.number(), // Percentage
    acquisitionFee: z.number().optional(),
    dueDiligence: MoneySchema.optional(),
    totalAcquisitionCost: MoneySchema,
  }),

  // Financing
  financingAssumptions: z.object({
    loanToValue: z.number(),
    loanAmount: MoneySchema,
    interestRate: z.number(),
    termYears: z.number().int(),
    amortizationYears: z.number().int(),
    loanType: z.enum(['fixed', 'floating', 'interest_only']),
    interestOnlyPeriod: z.number().int().optional(),
    debtServiceCoverage: z.number(),
    annualDebtService: MoneySchema,
    equityRequired: MoneySchema,
  }),

  // Revenue assumptions
  revenueAssumptions: z.object({
    currentNOI: MoneySchema,
    marketRent: z.number(), // Per SF
    occupancyAssumption: z.number(),
    rentGrowth: z.number(), // Annual percentage
    vacancyAllowance: z.number(),
    creditLoss: z.number(),
    otherIncome: MoneySchema.optional(),
  }),

  // Expense assumptions
  expenseAssumptions: z.object({
    operatingExpenses: MoneySchema, // Annual
    operatingExpensePerSF: z.number(),
    expenseGrowth: z.number(),
    propertyTaxes: MoneySchema,
    insurance: MoneySchema,
    managementFee: z.number(), // Percentage
    reserves: MoneySchema,
    tenantImprovements: z.number(), // Per SF per year
    leasingCommissions: z.number(), // Percentage
  }),

  // Pro forma projections (10 years typically)
  proForma: z.array(z.object({
    year: z.number().int(),
    grossPotentialRent: MoneySchema,
    vacancyLoss: MoneySchema,
    effectiveGrossIncome: MoneySchema,
    operatingExpenses: MoneySchema,
    netOperatingIncome: MoneySchema,
    debtService: MoneySchema,
    cashFlowBeforeTax: MoneySchema,
    capitalExpenditures: MoneySchema.optional(),
  })),

  // Returns
  returnMetrics: z.object({
    goingInCapRate: z.number(),
    exitCapRate: z.number(),
    exitYear: z.number().int(),
    terminalValue: MoneySchema,
    unleveredIRR: z.number(),
    leveredIRR: z.number(),
    cashOnCash: z.array(z.number()), // By year
    equityMultiple: z.number(),
    npv: MoneySchema,
    discountRate: z.number(),
  }),

  // Sensitivity analysis
  sensitivityAnalysis: z.object({
    capRateRange: z.array(z.number()),
    rentGrowthRange: z.array(z.number()),
    matrix: z.array(z.array(z.number())), // IRR matrix
  }).optional(),

  notes: z.string().optional(),
}).merge(AuditFieldsSchema);
export type UnderwritingModel = z.infer<typeof UnderwritingModelSchema>;

// Fractional Ownership / Syndication
export const FractionalOfferingSchema = z.object({
  id: UUIDSchema,
  propertyId: UUIDSchema,
  sponsorId: UUIDSchema,

  // Offering details
  name: z.string(),
  description: z.string(),
  status: z.enum(['draft', 'open', 'fully_subscribed', 'closed', 'cancelled']),
  offeringType: z.enum(['506b', '506c', 'reg_a', 'reg_cf', 'reg_d']),

  // Financial structure
  totalRaise: MoneySchema,
  minimumInvestment: MoneySchema,
  maximumInvestment: MoneySchema.optional(),
  totalShares: z.number().int(),
  sharePrice: MoneySchema,
  currentSubscribed: MoneySchema,
  percentSubscribed: z.number(),

  // Target returns
  targetReturns: z.object({
    cashOnCash: z.number(),
    irr: z.number(),
    equityMultiple: z.number(),
    holdPeriod: z.number().int(), // Years
  }),

  // Distributions
  distributionFrequency: z.enum(['monthly', 'quarterly', 'annually']),
  preferredReturn: z.number(),
  waterfall: z.array(z.object({
    tier: z.number().int(),
    threshold: z.number(), // IRR or multiple
    sponsorSplit: z.number(),
    investorSplit: z.number(),
  })),

  // Fees
  fees: z.object({
    acquisitionFee: z.number(),
    assetManagementFee: z.number(),
    propertyManagementFee: z.number(),
    dispositionFee: z.number(),
  }),

  // Timeline
  openDate: z.coerce.date(),
  closeDate: z.coerce.date(),
  targetCloseDate: z.coerce.date().optional(),

  // Investors
  investorCount: z.number().int().default(0),
  accreditedOnly: z.boolean().default(true),

  // Documents
  ppmDocumentId: UUIDSchema.optional(), // Private Placement Memo
  subscriptionDocumentId: UUIDSchema.optional(),
  operatingAgreementId: UUIDSchema.optional(),

  // Compliance
  kycAmlComplete: z.boolean().default(false),
  accreditationVerified: z.boolean().default(false),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type FractionalOffering = z.infer<typeof FractionalOfferingSchema>;

// Investment (individual investor position)
export const InvestmentPositionSchema = z.object({
  id: UUIDSchema,
  offeringId: UUIDSchema,
  investorId: UUIDSchema,

  // Investment details
  subscriptionAmount: MoneySchema,
  shares: z.number().int(),
  ownershipPercentage: z.number(),

  // Status
  status: z.enum(['pending', 'funded', 'active', 'redeemed', 'cancelled']),
  subscriptionDate: z.coerce.date(),
  fundingDate: z.coerce.date().optional(),

  // Documents
  subscriptionAgreementId: UUIDSchema.optional(),
  signedAt: z.coerce.date().optional(),

  // Distributions received
  totalDistributions: MoneySchema,
  distributions: z.array(z.object({
    date: z.coerce.date(),
    amount: MoneySchema,
    type: z.enum(['cash_flow', 'return_of_capital', 'capital_gain']),
  })).default([]),

  // Tax documents
  k1Documents: z.array(z.object({
    year: z.number().int(),
    documentId: UUIDSchema,
  })).default([]),

  // Verification
  accreditationVerified: z.boolean().default(false),
  kycVerified: z.boolean().default(false),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type InvestmentPosition = z.infer<typeof InvestmentPositionSchema>;
