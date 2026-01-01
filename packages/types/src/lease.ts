import { z } from 'zod';

import {
  AddressSchema,
  AuditFieldsSchema,
  MoneySchema,
  UUIDSchema
} from './common';

// ============================================================================
// Lease Types
// ============================================================================

export const LeaseStatusSchema = z.enum([
  'draft',
  'pending_signatures',
  'partially_signed',
  'fully_signed',
  'active',
  'expired',
  'terminated',
  'renewed',
  'cancelled',
]);
export type LeaseStatus = z.infer<typeof LeaseStatusSchema>;

export const LeaseTypeSchema = z.enum([
  'standard',
  'rebny', // REBNY standard lease
  'rent_stabilized',
  'rent_controlled',
  'month_to_month',
  'commercial',
  'sublease',
  'custom',
]);
export type LeaseType = z.infer<typeof LeaseTypeSchema>;

export const LeaseSchema = z.object({
  id: UUIDSchema,
  propertyId: UUIDSchema,
  unitId: UUIDSchema,
  landlordId: UUIDSchema,
  primaryTenantId: UUIDSchema,
  coTenantIds: z.array(UUIDSchema).default([]),
  guarantorIds: z.array(UUIDSchema).default([]),
  agentId: UUIDSchema.optional(),

  // Lease info
  leaseNumber: z.string(),
  type: LeaseTypeSchema,
  status: LeaseStatusSchema,
  version: z.number().int().min(1).default(1),
  previousLeaseId: UUIDSchema.optional(), // For renewals

  // Terms
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  monthlyRent: MoneySchema,
  securityDeposit: MoneySchema,
  lastMonthDeposit: MoneySchema.optional(),
  petDeposit: MoneySchema.optional(),

  // Rent stabilization (NYC)
  isRentStabilized: z.boolean().default(false),
  legalRent: MoneySchema.optional(),
  preferentialRent: MoneySchema.optional(),
  rentGuidelinesBoard: z.string().optional(), // e.g., "RGB 2024"

  // Payment terms
  paymentDueDay: z.number().int().min(1).max(31).default(1),
  lateFeeGracePeriod: z.number().int().min(0).default(5), // Days
  lateFeeAmount: MoneySchema.optional(),
  lateFeePercentage: z.number().min(0).max(100).optional(),

  // Pro-rated amounts
  proratedFirstMonth: MoneySchema.optional(),
  proratedLastMonth: MoneySchema.optional(),

  // Concessions
  concessions: z.array(z.object({
    type: z.enum(['free_rent', 'reduced_rent', 'waived_fee', 'other']),
    description: z.string(),
    amount: MoneySchema.optional(),
    months: z.array(z.number().int()).optional(),
    conditions: z.string().optional(),
  })).default([]),

  // Utilities & services
  includedUtilities: z.array(z.enum([
    'electric',
    'gas',
    'water',
    'heat',
    'hot_water',
    'internet',
    'cable',
    'trash',
  ])).default([]),
  tenantUtilities: z.array(z.string()).default([]),

  // Occupants
  maxOccupants: z.number().int().min(1),
  occupants: z.array(z.object({
    name: z.string(),
    relationship: z.string(),
    isMinor: z.boolean().default(false),
  })).default([]),

  // Pets
  petsAllowed: z.boolean().default(false),
  approvedPets: z.array(z.object({
    type: z.string(),
    breed: z.string().optional(),
    name: z.string().optional(),
    weight: z.number().optional(),
    monthlyPetRent: MoneySchema.optional(),
  })).default([]),

  // Vehicles & parking
  parkingSpaces: z.number().int().min(0).default(0),
  parkingFee: MoneySchema.optional(),
  assignedSpaces: z.array(z.string()).default([]),
  vehicles: z.array(z.object({
    make: z.string(),
    model: z.string(),
    year: z.number().int(),
    color: z.string().optional(),
    licensePlate: z.string(),
    state: z.string(),
  })).default([]),

  // Special clauses
  specialClauses: z.array(z.object({
    title: z.string(),
    content: z.string(),
    isRiderAttached: z.boolean().default(false),
  })).default([]),

  // Riders (additional documents)
  riders: z.array(z.object({
    id: UUIDSchema,
    name: z.string(),
    documentId: UUIDSchema,
    required: z.boolean().default(true),
  })).default([]),

  // Signatures
  signatures: z.array(z.object({
    signerId: UUIDSchema,
    signerName: z.string(),
    signerRole: z.enum(['landlord', 'tenant', 'co_tenant', 'guarantor', 'agent', 'witness']),
    signedAt: z.coerce.date().optional(),
    signatureUrl: z.string().optional(),
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
    signatureMethod: z.enum(['drawn', 'typed', 'uploaded']).optional(),
  })).default([]),
  allSignaturesComplete: z.boolean().default(false),

  // Documents
  leaseDocumentId: UUIDSchema.optional(),
  signedDocumentId: UUIDSchema.optional(),
  supportingDocuments: z.array(UUIDSchema).default([]),

  // Renewal
  renewalOffered: z.boolean().default(false),
  renewalOfferDate: z.coerce.date().optional(),
  renewalOfferExpires: z.coerce.date().optional(),
  renewalTerms: z.object({
    proposedRent: MoneySchema,
    proposedTerm: z.number().int(), // Months
    notes: z.string().optional(),
  }).optional(),
  renewalStatus: z.enum([
    'not_offered',
    'pending',
    'accepted',
    'declined',
    'expired',
  ]).default('not_offered'),

  // Termination
  terminationDate: z.coerce.date().optional(),
  terminationReason: z.string().optional(),
  terminationInitiatedBy: z.enum(['landlord', 'tenant', 'mutual']).optional(),
  terminationNoticeDate: z.coerce.date().optional(),

  // Move in/out
  moveInDate: z.coerce.date().optional(),
  moveInInspectionId: UUIDSchema.optional(),
  moveOutDate: z.coerce.date().optional(),
  moveOutInspectionId: UUIDSchema.optional(),
  securityDepositReturned: z.boolean().default(false),
  securityDepositDeductions: z.array(z.object({
    reason: z.string(),
    amount: MoneySchema,
  })).default([]),

  // Compliance
  isCompliant: z.boolean().default(true),
  complianceIssues: z.array(z.string()).default([]),
  fareActDisclosures: z.array(z.object({
    disclosureType: z.string(),
    providedAt: z.coerce.date(),
    acknowledged: z.boolean(),
  })).default([]),

  // Address (denormalized for convenience)
  propertyAddress: AddressSchema,
  unitNumber: z.string(),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type Lease = z.infer<typeof LeaseSchema>;

// Lease amendment
export const LeaseAmendmentSchema = z.object({
  id: UUIDSchema,
  leaseId: UUIDSchema,
  amendmentNumber: z.number().int().min(1),
  effectiveDate: z.coerce.date(),
  description: z.string(),
  changes: z.array(z.object({
    field: z.string(),
    oldValue: z.unknown(),
    newValue: z.unknown(),
    reason: z.string().optional(),
  })),
  signatures: z.array(z.object({
    signerId: UUIDSchema,
    signerRole: z.string(),
    signedAt: z.coerce.date().optional(),
  })).default([]),
  documentId: UUIDSchema.optional(),
  status: z.enum(['draft', 'pending', 'signed', 'cancelled']),
}).merge(AuditFieldsSchema);
export type LeaseAmendment = z.infer<typeof LeaseAmendmentSchema>;

// Tenant application
export const TenantApplicationSchema = z.object({
  id: UUIDSchema,
  listingId: UUIDSchema,
  applicantId: UUIDSchema,
  coApplicantIds: z.array(UUIDSchema).default([]),
  status: z.enum([
    'draft',
    'submitted',
    'under_review',
    'documents_requested',
    'background_check',
    'approved',
    'conditionally_approved',
    'denied',
    'withdrawn',
    'expired',
  ]),

  // Personal info (collected via form)
  personalInfo: z.object({
    ssn: z.string().optional(), // Encrypted at rest
    dateOfBirth: z.coerce.date(),
    citizenship: z.string().default('US'),
    idType: z.enum(['drivers_license', 'passport', 'state_id']),
    idNumber: z.string(),
    idState: z.string().optional(),
    idExpiry: z.coerce.date(),
  }),

  // Current residence
  currentAddress: AddressSchema,
  currentRent: MoneySchema.optional(),
  currentLandlord: z.object({
    name: z.string(),
    phone: z.string(),
    email: z.string().email().optional(),
  }).optional(),
  residenceHistory: z.array(z.object({
    address: AddressSchema,
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    rent: MoneySchema.optional(),
    landlordName: z.string().optional(),
    landlordPhone: z.string().optional(),
    reasonForLeaving: z.string().optional(),
  })).default([]),

  // Employment
  employmentInfo: z.object({
    status: z.enum([
      'employed_full_time',
      'employed_part_time',
      'self_employed',
      'student',
      'retired',
      'unemployed',
    ]),
    employer: z.string().optional(),
    position: z.string().optional(),
    startDate: z.coerce.date().optional(),
    monthlyIncome: MoneySchema,
    annualIncome: MoneySchema,
    supervisorName: z.string().optional(),
    supervisorPhone: z.string().optional(),
  }),
  additionalIncome: z.array(z.object({
    source: z.string(),
    amount: MoneySchema,
    frequency: z.enum(['monthly', 'annual']),
  })).default([]),

  // Financial
  bankAccounts: z.array(z.object({
    bankName: z.string(),
    accountType: z.enum(['checking', 'savings']),
    balance: MoneySchema,
  })).default([]),
  assets: z.array(z.object({
    type: z.string(),
    value: MoneySchema,
  })).default([]),
  liabilities: z.array(z.object({
    type: z.string(),
    amount: MoneySchema,
    monthlyPayment: MoneySchema.optional(),
  })).default([]),

  // References
  references: z.array(z.object({
    name: z.string(),
    relationship: z.string(),
    phone: z.string(),
    email: z.string().email().optional(),
  })).default([]),

  // Emergency contact
  emergencyContact: z.object({
    name: z.string(),
    phone: z.string(),
    relationship: z.string(),
  }),

  // Background & credit
  creditScore: z.number().int().min(300).max(850).optional(),
  creditReportId: UUIDSchema.optional(),
  backgroundCheckId: UUIDSchema.optional(),
  backgroundCheckStatus: z.enum(['not_started', 'pending', 'completed', 'failed']).default('not_started'),
  evictionHistory: z.boolean().optional(),
  criminalHistory: z.boolean().optional(),
  bankruptcyHistory: z.boolean().optional(),

  // Documents
  documents: z.array(z.object({
    type: z.enum([
      'id',
      'proof_of_income',
      'bank_statement',
      'tax_return',
      'employment_letter',
      'reference_letter',
      'other',
    ]),
    documentId: UUIDSchema,
    status: z.enum(['pending', 'approved', 'rejected']),
    notes: z.string().optional(),
  })).default([]),

  // Guarantor
  hasGuarantor: z.boolean().default(false),
  guarantorInfo: z.object({
    name: z.string(),
    email: z.string().email(),
    phone: z.string(),
    relationship: z.string(),
    applicationId: UUIDSchema.optional(), // Guarantor's own application
  }).optional(),

  // Deposit products (LeaseLock, Rhino)
  depositAlternative: z.object({
    provider: z.enum(['leaselock', 'rhino', 'the_guarantors', 'none']).default('none'),
    applicationId: z.string().optional(),
    status: z.enum(['not_started', 'pending', 'approved', 'denied']).optional(),
    monthlyPremium: MoneySchema.optional(),
  }).optional(),

  // Renters insurance
  rentersInsurance: z.object({
    hasExisting: z.boolean().default(false),
    policyNumber: z.string().optional(),
    provider: z.string().optional(),
    expiryDate: z.coerce.date().optional(),
    interestedInQuote: z.boolean().default(false),
  }).optional(),

  // Application fee
  applicationFee: MoneySchema.optional(),
  applicationFeePaid: z.boolean().default(false),
  applicationFeePaymentId: z.string().optional(),

  // Review
  reviewedBy: UUIDSchema.optional(),
  reviewedAt: z.coerce.date().optional(),
  reviewNotes: z.string().optional(),
  denialReason: z.string().optional(),
  conditionalApprovalTerms: z.string().optional(),

  // Offer
  offerSent: z.boolean().default(false),
  offerSentAt: z.coerce.date().optional(),
  offerExpiresAt: z.coerce.date().optional(),
  offerTerms: z.object({
    rent: MoneySchema,
    securityDeposit: MoneySchema,
    leaseStart: z.coerce.date(),
    leaseTerm: z.number().int(),
    concessions: z.string().optional(),
  }).optional(),

  // Compliance
  fareActCompliant: z.boolean().default(true),
  fchaCompliant: z.boolean().default(true),

  submittedAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),

  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type TenantApplication = z.infer<typeof TenantApplicationSchema>;

// Create/update schemas
export const CreateLeaseRequestSchema = z.object({
  propertyId: UUIDSchema,
  unitId: UUIDSchema,
  primaryTenantId: UUIDSchema,
  coTenantIds: z.array(UUIDSchema).default([]),
  type: LeaseTypeSchema,
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  monthlyRent: MoneySchema,
  securityDeposit: MoneySchema,
  useRebnyTemplate: z.boolean().default(false),
  specialClauses: z.array(z.object({
    title: z.string(),
    content: z.string(),
  })).optional(),
});
export type CreateLeaseRequest = z.infer<typeof CreateLeaseRequestSchema>;

export const UpdateLeaseRequestSchema = CreateLeaseRequestSchema.partial();
export type UpdateLeaseRequest = z.infer<typeof UpdateLeaseRequestSchema>;

// Lease search/filter
export const LeaseFilterSchema = z.object({
  propertyId: UUIDSchema.optional(),
  unitId: UUIDSchema.optional(),
  landlordId: UUIDSchema.optional(),
  tenantId: UUIDSchema.optional(),
  status: LeaseStatusSchema.optional(),
  statuses: z.array(LeaseStatusSchema).optional(),
  type: LeaseTypeSchema.optional(),
  isRentStabilized: z.boolean().optional(),
  expiringBefore: z.coerce.date().optional(),
  expiringAfter: z.coerce.date().optional(),
  renewalStatus: z.enum(['not_offered', 'pending', 'accepted', 'declined', 'expired']).optional(),
});
export type LeaseFilter = z.infer<typeof LeaseFilterSchema>;
