import { z } from 'zod';

// ============================================================================
// Common Schemas & Types
// ============================================================================

export const UUIDSchema = z.string().uuid();
export type UUID = z.infer<typeof UUIDSchema>;

export const EmailSchema = z.string().email().toLowerCase().trim();
export type Email = z.infer<typeof EmailSchema>;

export const PhoneSchema = z.string().regex(/^\+?[1-9]\d{1,14}$/);
export type Phone = z.infer<typeof PhoneSchema>;

export const URLSchema = z.string().url();
export type URL = z.infer<typeof URLSchema>;

export const DateStringSchema = z.string().datetime();
export type DateString = z.infer<typeof DateStringSchema>;

export const MoneySchema = z.object({
  amount: z.number().int().min(0), // Amount in cents
  currency: z.enum(['USD', 'EUR', 'GBP']).default('USD'),
});
export type Money = z.infer<typeof MoneySchema>;

export const AddressSchema = z.object({
  street1: z.string().min(1).max(200),
  street2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(2).max(50),
  postalCode: z.string().min(5).max(20),
  country: z.string().default('US'),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type Address = z.infer<typeof AddressSchema>;

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type Pagination = z.infer<typeof PaginationSchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    limit: z.number().int().min(1),
    totalPages: z.number().int().min(0),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  });

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export const TimeRangeSchema = z.object({
  start: z.coerce.date(),
  end: z.coerce.date(),
});
export type TimeRange = z.infer<typeof TimeRangeSchema>;

export const GeoPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type GeoPoint = z.infer<typeof GeoPointSchema>;

export const GeoBoundsSchema = z.object({
  northeast: GeoPointSchema,
  southwest: GeoPointSchema,
});
export type GeoBounds = z.infer<typeof GeoBoundsSchema>;

// Audit fields for all entities
export const AuditFieldsSchema = z.object({
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  createdBy: UUIDSchema.optional(),
  updatedBy: UUIDSchema.optional(),
});
export type AuditFields = z.infer<typeof AuditFieldsSchema>;

// Soft delete support
export const SoftDeleteSchema = z.object({
  deletedAt: z.coerce.date().nullable().optional(),
  deletedBy: UUIDSchema.nullable().optional(),
});
export type SoftDelete = z.infer<typeof SoftDeleteSchema>;

// Base entity with common fields
export const BaseEntitySchema = z.object({
  id: UUIDSchema,
}).merge(AuditFieldsSchema);
export type BaseEntity = z.infer<typeof BaseEntitySchema>;

// Status types used across the platform
export const GenericStatusSchema = z.enum([
  'active',
  'inactive',
  'pending',
  'suspended',
  'archived',
]);
export type GenericStatus = z.infer<typeof GenericStatusSchema>;

// File upload metadata
export const FileMetadataSchema = z.object({
  id: UUIDSchema,
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  size: z.number().int().positive(),
  url: URLSchema,
  bucket: z.string(),
  key: z.string(),
  uploadedAt: z.coerce.date(),
  uploadedBy: UUIDSchema,
  checksum: z.string().optional(),
  metadata: z.record(z.string()).optional(),
});
export type FileMetadata = z.infer<typeof FileMetadataSchema>;

// Error response type
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
    stack: z.string().optional(),
  }),
  requestId: z.string(),
  timestamp: z.string(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// Success response wrapper
export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: z.record(z.unknown()).optional(),
    requestId: z.string(),
    timestamp: z.string(),
  });

export interface SuccessResponse<T> {
  data: T;
  meta?: Record<string, unknown>;
  requestId: string;
  timestamp: string;
}
