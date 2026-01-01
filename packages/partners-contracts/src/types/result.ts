import { z } from 'zod';

import type { ProviderError } from './errors';
import { ProviderErrorSchema } from './errors';

/**
 * Standard result type for provider operations
 * Discriminated union for type-safe error handling
 */
export type Result<T, E = ProviderError> =
  | { success: true; data: T; metadata: ResultMetadata }
  | { success: false; error: E; metadata: ResultMetadata };

/**
 * Metadata included with every provider response
 */
export interface ResultMetadata {
  providerId: string;
  providerName: string;
  requestId: string;
  timestamp: Date;
  durationMs: number;
  isMock: boolean;
  mockSeed?: string;
}

export const ResultMetadataSchema = z.object({
  providerId: z.string(),
  providerName: z.string(),
  requestId: z.string(),
  timestamp: z.coerce.date(),
  durationMs: z.number(),
  isMock: z.boolean(),
  mockSeed: z.string().optional(),
});

/**
 * Create a success result with metadata
 */
export function success<T>(
  data: T,
  metadata: ResultMetadata
): Result<T, never> {
  return { success: true, data, metadata };
}

/**
 * Create an error result with metadata
 */
export function failure<E = ProviderError>(
  error: E,
  metadata: ResultMetadata
): Result<never, E> {
  return { success: false, error, metadata };
}

/**
 * Type guard for success result
 */
export function isSuccess<T, E>(
  result: Result<T, E>
): result is { success: true; data: T; metadata: ResultMetadata } {
  return result.success === true;
}

/**
 * Type guard for failure result
 */
export function isFailure<T, E>(
  result: Result<T, E>
): result is { success: false; error: E; metadata: ResultMetadata } {
  return result.success === false;
}

/**
 * Unwrap a result, throwing if it's an error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isSuccess(result)) {
    return result.data;
  }
  throw new Error(
    `Result unwrap failed: ${JSON.stringify(result.error)}`
  );
}

/**
 * Unwrap a result with a default value for errors
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (isSuccess(result)) {
    return result.data;
  }
  return defaultValue;
}

/**
 * Create a Result schema for Zod validation
 */
export function createResultSchema<T extends z.ZodType>(dataSchema: T) {
  return z.discriminatedUnion('success', [
    z.object({
      success: z.literal(true),
      data: dataSchema,
      metadata: ResultMetadataSchema,
    }),
    z.object({
      success: z.literal(false),
      error: ProviderErrorSchema,
      metadata: ResultMetadataSchema,
    }),
  ]);
}
