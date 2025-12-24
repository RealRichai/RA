/**
 * Users Schemas
 * Zod validation schemas for user endpoints
 */

import { z } from 'zod';
import { UserRole, UserStatus, SubscriptionTier } from '@prisma/client';

export const UserRoleEnum = z.nativeEnum(UserRole);
export const UserStatusEnum = z.nativeEnum(UserStatus);
export const SubscriptionTierEnum = z.nativeEnum(SubscriptionTier);

export const UpdateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number (E.164 format)').optional(),
  dateOfBirth: z.coerce.date().optional(),
  avatarUrl: z.string().url().optional().nullable(),
  timezone: z.string().max(50).optional(),
  // Agent fields
  licenseNumber: z.string().max(50).optional(),
  licenseState: z.string().length(2).optional(),
  licenseExpiry: z.coerce.date().optional(),
  brokerageName: z.string().max(200).optional(),
  brokerageAddress: z.string().max(500).optional(),
  // Investor fields
  investmentPreferences: z.record(z.unknown()).optional(),
  accreditedInvestor: z.boolean().optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export const UserFiltersSchema = z.object({
  role: UserRoleEnum.optional(),
  status: UserStatusEnum.optional(),
  subscriptionTier: SubscriptionTierEnum.optional(),
  emailVerified: z.coerce.boolean().optional(),
  search: z.string().max(100).optional(),
  licenseState: z.string().length(2).optional(),
  accreditedInvestor: z.coerce.boolean().optional(),
});

export type UserFiltersInput = z.infer<typeof UserFiltersSchema>;

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'firstName', 'lastName', 'email', 'lastLoginAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationInput = z.infer<typeof PaginationSchema>;

export const UpdateStatusSchema = z.object({
  status: UserStatusEnum,
});

export type UpdateStatusInput = z.infer<typeof UpdateStatusSchema>;

export const UpdateSubscriptionSchema = z.object({
  tier: SubscriptionTierEnum,
  expiresAt: z.coerce.date().nullable().optional(),
});

export type UpdateSubscriptionInput = z.infer<typeof UpdateSubscriptionSchema>;
