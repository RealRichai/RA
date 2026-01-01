import { z } from 'zod';

import { EmailSchema, UUIDSchema } from './common';

// ============================================================================
// Authentication & Authorization Types
// ============================================================================

export const RoleSchema = z.enum([
  'super_admin',
  'admin',
  'landlord',
  'property_manager',
  'agent',
  'tenant',
  'investor',
  'vendor',
  'support',
]);
export type Role = z.infer<typeof RoleSchema>;

export const PermissionSchema = z.enum([
  // Property permissions
  'property:read',
  'property:write',
  'property:delete',
  'property:manage',

  // Listing permissions
  'listing:read',
  'listing:write',
  'listing:delete',
  'listing:publish',

  // Lease permissions
  'lease:read',
  'lease:write',
  'lease:delete',
  'lease:sign',
  'lease:approve',

  // User permissions
  'user:read',
  'user:write',
  'user:delete',
  'user:impersonate',

  // Financial permissions
  'payment:read',
  'payment:write',
  'payment:refund',
  'billing:manage',

  // Compliance permissions
  'compliance:read',
  'compliance:write',
  'compliance:override',

  // AI permissions
  'ai:access',
  'ai:configure',

  // Analytics permissions
  'analytics:read',
  'analytics:export',

  // Admin permissions
  'admin:access',
  'admin:settings',
  'admin:audit',

  // Document permissions
  'document:read',
  'document:write',
  'document:delete',
  'document:vault',

  // Maintenance permissions
  'maintenance:read',
  'maintenance:write',
  'maintenance:assign',

  // Marketing permissions
  'marketing:read',
  'marketing:write',
  'marketing:templates',

  // Commercial permissions
  'commercial:read',
  'commercial:write',
  'commercial:underwrite',
]);
export type Permission = z.infer<typeof PermissionSchema>;

export const RolePermissionsMap: Record<Role, Permission[]> = {
  super_admin: Object.values(PermissionSchema.enum),
  admin: [
    'property:read', 'property:write', 'property:manage',
    'listing:read', 'listing:write', 'listing:publish',
    'lease:read', 'lease:write', 'lease:approve',
    'user:read', 'user:write',
    'payment:read', 'payment:write',
    'compliance:read', 'compliance:write',
    'ai:access', 'ai:configure',
    'analytics:read', 'analytics:export',
    'admin:access', 'admin:settings',
    'document:read', 'document:write', 'document:vault',
    'maintenance:read', 'maintenance:write', 'maintenance:assign',
    'marketing:read', 'marketing:write', 'marketing:templates',
    'commercial:read', 'commercial:write',
  ],
  landlord: [
    'property:read', 'property:write', 'property:manage',
    'listing:read', 'listing:write', 'listing:publish',
    'lease:read', 'lease:write', 'lease:sign',
    'payment:read',
    'compliance:read',
    'ai:access',
    'analytics:read',
    'document:read', 'document:write', 'document:vault',
    'maintenance:read', 'maintenance:write',
    'marketing:read', 'marketing:write',
  ],
  property_manager: [
    'property:read', 'property:write',
    'listing:read', 'listing:write', 'listing:publish',
    'lease:read', 'lease:write',
    'payment:read',
    'compliance:read',
    'ai:access',
    'analytics:read',
    'document:read', 'document:write',
    'maintenance:read', 'maintenance:write', 'maintenance:assign',
    'marketing:read', 'marketing:write',
  ],
  agent: [
    'property:read',
    'listing:read', 'listing:write',
    'lease:read',
    'ai:access',
    'document:read',
    'marketing:read', 'marketing:write',
  ],
  tenant: [
    'property:read',
    'listing:read',
    'lease:read', 'lease:sign',
    'payment:read', 'payment:write',
    'document:read',
    'maintenance:read', 'maintenance:write',
  ],
  investor: [
    'property:read',
    'analytics:read',
    'document:read',
    'commercial:read',
  ],
  vendor: [
    'maintenance:read',
    'document:read', 'document:write',
  ],
  support: [
    'property:read',
    'listing:read',
    'lease:read',
    'user:read',
    'payment:read',
    'compliance:read',
    'document:read',
    'maintenance:read',
  ],
};

// Login request/response
export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(8).max(128),
  mfaCode: z.string().length(6).optional(),
  rememberMe: z.boolean().default(false),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number(),
  tokenType: z.literal('Bearer'),
  user: z.object({
    id: UUIDSchema,
    email: EmailSchema,
    firstName: z.string(),
    lastName: z.string(),
    role: RoleSchema,
    permissions: z.array(PermissionSchema),
  }),
  mfaRequired: z.boolean().optional(),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// Registration
export const RegisterRequestSchema = z.object({
  email: EmailSchema,
  password: z.string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[a-z]/, 'Must contain lowercase letter')
    .regex(/[0-9]/, 'Must contain number')
    .regex(/[^A-Za-z0-9]/, 'Must contain special character'),
  confirmPassword: z.string(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().optional(),
  role: z.enum(['landlord', 'agent', 'tenant', 'investor']),
  companyName: z.string().optional(),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the terms and conditions' }),
  }),
  marketingConsent: z.boolean().default(false),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

// Token refresh
export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string(),
});
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

// Password reset
export const ForgotPasswordRequestSchema = z.object({
  email: EmailSchema,
});
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ResetPasswordRequestSchema = z.object({
  token: z.string(),
  password: z.string().min(8).max(128),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

// MFA
export const MFASetupResponseSchema = z.object({
  secret: z.string(),
  qrCodeUrl: z.string(),
  backupCodes: z.array(z.string()),
});
export type MFASetupResponse = z.infer<typeof MFASetupResponseSchema>;

export const MFAVerifyRequestSchema = z.object({
  code: z.string().length(6),
});
export type MFAVerifyRequest = z.infer<typeof MFAVerifyRequestSchema>;

// Session
export const SessionSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  ipAddress: z.string(),
  userAgent: z.string(),
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  lastActiveAt: z.coerce.date(),
  isValid: z.boolean(),
});
export type Session = z.infer<typeof SessionSchema>;

// JWT Payload
export const JWTPayloadSchema = z.object({
  sub: UUIDSchema,
  email: EmailSchema,
  role: RoleSchema,
  permissions: z.array(PermissionSchema),
  sessionId: UUIDSchema,
  iat: z.number(),
  exp: z.number(),
  type: z.enum(['access', 'refresh']),
});
export type JWTPayload = z.infer<typeof JWTPayloadSchema>;

// API Key (for service-to-service communication)
export const APIKeySchema = z.object({
  id: UUIDSchema,
  name: z.string(),
  keyPrefix: z.string(), // First 8 characters for identification
  hashedKey: z.string(),
  scopes: z.array(PermissionSchema),
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date().optional(),
  lastUsedAt: z.coerce.date().optional(),
  createdBy: UUIDSchema,
  isActive: z.boolean(),
});
export type APIKey = z.infer<typeof APIKeySchema>;
