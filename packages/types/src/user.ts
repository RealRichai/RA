import { z } from 'zod';
import { RoleSchema } from './auth';
import {
  AddressSchema,
  AuditFieldsSchema,
  EmailSchema,
  PhoneSchema,
  UUIDSchema
} from './common';

// ============================================================================
// User Types
// ============================================================================

export const UserStatusSchema = z.enum([
  'active',
  'pending_verification',
  'suspended',
  'deactivated',
]);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const UserSchema = z.object({
  id: UUIDSchema,
  email: EmailSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: PhoneSchema.optional(),
  avatarUrl: z.string().url().optional(),
  role: RoleSchema,
  status: UserStatusSchema,
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  mfaEnabled: z.boolean(),
  lastLoginAt: z.coerce.date().optional(),
  passwordChangedAt: z.coerce.date().optional(),
  metadata: z.record(z.unknown()).optional(),
}).merge(AuditFieldsSchema);
export type User = z.infer<typeof UserSchema>;

// Landlord-specific profile
export const LandlordProfileSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  companyName: z.string().optional(),
  companyAddress: AddressSchema.optional(),
  taxId: z.string().optional(), // Encrypted at rest
  businessLicense: z.string().optional(),
  propertyCount: z.number().int().min(0).default(0),
  totalUnits: z.number().int().min(0).default(0),
  preferredPaymentMethod: z.enum(['ach', 'wire', 'check']).default('ach'),
  bankAccountId: UUIDSchema.optional(), // Reference to encrypted bank account
  billingEmail: EmailSchema.optional(),
  notificationPreferences: z.object({
    email: z.boolean().default(true),
    sms: z.boolean().default(false),
    push: z.boolean().default(true),
    maintenanceAlerts: z.boolean().default(true),
    paymentAlerts: z.boolean().default(true),
    leaseAlerts: z.boolean().default(true),
    complianceAlerts: z.boolean().default(true),
  }),
  verificationStatus: z.enum(['pending', 'verified', 'rejected']).default('pending'),
  verificationDocuments: z.array(UUIDSchema).default([]),
}).merge(AuditFieldsSchema);
export type LandlordProfile = z.infer<typeof LandlordProfileSchema>;

// Agent-specific profile
export const AgentProfileSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  licenseNumber: z.string(),
  licenseState: z.string(),
  licenseExpiry: z.coerce.date(),
  brokerageName: z.string(),
  brokerageId: UUIDSchema.optional(),
  bio: z.string().max(2000).optional(),
  specializations: z.array(z.string()).default([]),
  serviceAreas: z.array(z.string()).default([]),
  yearsExperience: z.number().int().min(0).optional(),
  totalDeals: z.number().int().min(0).default(0),
  averageRating: z.number().min(0).max(5).optional(),
  reviewCount: z.number().int().min(0).default(0),
  socialLinks: z.object({
    linkedin: z.string().url().optional(),
    instagram: z.string().url().optional(),
    twitter: z.string().url().optional(),
    website: z.string().url().optional(),
  }).optional(),
  isTopProducer: z.boolean().default(false),
  verificationStatus: z.enum(['pending', 'verified', 'rejected']).default('pending'),
}).merge(AuditFieldsSchema);
export type AgentProfile = z.infer<typeof AgentProfileSchema>;

// Tenant-specific profile
export const TenantProfileSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  currentAddress: AddressSchema.optional(),
  employmentStatus: z.enum([
    'employed_full_time',
    'employed_part_time',
    'self_employed',
    'student',
    'retired',
    'unemployed',
  ]).optional(),
  annualIncome: z.number().int().min(0).optional(), // Encrypted at rest
  creditScore: z.number().int().min(300).max(850).optional(), // Encrypted at rest
  creditScoreLastUpdated: z.coerce.date().optional(),
  hasRentersInsurance: z.boolean().default(false),
  rentersInsurancePolicy: z.string().optional(),
  pets: z.array(z.object({
    type: z.string(),
    breed: z.string().optional(),
    weight: z.number().optional(),
    name: z.string().optional(),
  })).default([]),
  vehicles: z.array(z.object({
    make: z.string(),
    model: z.string(),
    year: z.number().int(),
    licensePlate: z.string().optional(),
  })).default([]),
  emergencyContact: z.object({
    name: z.string(),
    phone: PhoneSchema,
    relationship: z.string(),
  }).optional(),
  applicationStatus: z.enum([
    'not_started',
    'in_progress',
    'submitted',
    'approved',
    'rejected',
  ]).default('not_started'),
  screeningReports: z.array(UUIDSchema).default([]),
}).merge(AuditFieldsSchema);
export type TenantProfile = z.infer<typeof TenantProfileSchema>;

// Investor-specific profile
export const InvestorProfileSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  investorType: z.enum([
    'individual',
    'accredited',
    'qualified_purchaser',
    'institutional',
    'family_office',
  ]),
  accreditationStatus: z.enum(['pending', 'verified', 'expired']).optional(),
  accreditationExpiry: z.coerce.date().optional(),
  investmentPreferences: z.object({
    minInvestment: z.number().int().min(0).optional(),
    maxInvestment: z.number().int().optional(),
    propertyTypes: z.array(z.string()).default([]),
    markets: z.array(z.string()).default([]),
    targetReturns: z.number().optional(),
    holdPeriod: z.enum(['short', 'medium', 'long']).optional(),
  }),
  totalInvested: z.number().int().min(0).default(0),
  portfolioValue: z.number().int().min(0).default(0),
  kycStatus: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  kycDocuments: z.array(UUIDSchema).default([]),
}).merge(AuditFieldsSchema);
export type InvestorProfile = z.infer<typeof InvestorProfileSchema>;

// User update schemas
export const UpdateUserRequestSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: PhoneSchema.optional(),
  avatarUrl: z.string().url().optional(),
});
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export const ChangePasswordRequestSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequestSchema>;

// User search/filter
export const UserFilterSchema = z.object({
  search: z.string().optional(),
  role: RoleSchema.optional(),
  status: UserStatusSchema.optional(),
  emailVerified: z.boolean().optional(),
  createdAfter: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),
});
export type UserFilter = z.infer<typeof UserFilterSchema>;
