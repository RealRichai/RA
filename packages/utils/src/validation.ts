import { z } from 'zod';

import { ValidationError } from './errors';

/**
 * Validate data against a Zod schema
 */
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  errorMessage = 'Validation failed'
): T {
  const result = schema.safeParse(data);

  if (!result.success) {
    const firstError = result.error.errors[0];
    const field = firstError?.path.join('.') || undefined;
    const message = firstError?.message || errorMessage;

    throw new ValidationError(message, field, {
      errors: result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
        code: e.code,
      })),
    });
  }

  return result.data;
}

/**
 * Validate data and return result without throwing
 */
export function validateSafe<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError['errors'] } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, errors: result.error.errors };
}

/**
 * Assert condition and throw ValidationError if false
 */
export function assert(
  condition: boolean,
  message: string,
  field?: string
): asserts condition {
  if (!condition) {
    throw new ValidationError(message, field);
  }
}

/**
 * Assert value is not null/undefined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string,
  field?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new ValidationError(message, field);
  }
}

// Common validation schemas
export const CommonSchemas = {
  uuid: z.string().uuid('Invalid UUID format'),

  email: z.string().email('Invalid email address').toLowerCase().trim(),

  phone: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number'),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),

  url: z.string().url('Invalid URL'),

  postalCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid postal code'),

  ssn: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/, 'Invalid SSN format'),

  ein: z.string().regex(/^\d{2}-?\d{7}$/, 'Invalid EIN format'),

  date: z.coerce.date(),

  money: z.object({
    amount: z.number().int().min(0),
    currency: z.enum(['USD', 'EUR', 'GBP']).default('USD'),
  }),

  address: z.object({
    street1: z.string().min(1).max(200),
    street2: z.string().max(200).optional(),
    city: z.string().min(1).max(100),
    state: z.string().min(2).max(50),
    postalCode: z.string().min(5).max(20),
    country: z.string().default('US'),
  }),

  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),

  dateRange: z.object({
    start: z.coerce.date(),
    end: z.coerce.date(),
  }).refine((data) => data.start <= data.end, {
    message: 'Start date must be before or equal to end date',
    path: ['end'],
  }),
};

/**
 * Create a schema that strips unknown keys
 */
export function strict<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.strict();
}

/**
 * Create a partial schema (all fields optional)
 */
export function partial<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.partial();
}

/**
 * Create a schema that requires at least one field
 */
export function atLeastOne<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.partial().refine(
    (data) => Object.values(data).some((value) => value !== undefined),
    { message: 'At least one field is required' }
  );
}

/**
 * Sanitize a string (trim and remove null bytes)
 */
export function sanitizeString(value: string): string {
  return value.trim().replace(/\0/g, '');
}

/**
 * Create a sanitized string schema
 */
export function sanitizedString() {
  return z.string().transform(sanitizeString);
}

/**
 * Validate and sanitize HTML content (basic XSS prevention)
 */
export function sanitizeHtml(html: string): string {
  // Remove script tags and event handlers
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/on\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}
