/**
 * @realriches/shared
 * 
 * Shared constants, types, and validation schemas for the RealRiches platform.
 * 
 * @example
 * ```typescript
 * import { FARE_ACT_MAX_APPLICATION_FEE, isNYCMarket } from '@realriches/shared/constants';
 * import type { Listing, Application } from '@realriches/shared/types';
 * import { createListingSchema } from '@realriches/shared/validation';
 * ```
 */

// Re-export everything from submodules
export * from './constants/index.js';
export * from './types/index.js';
export * from './validation/index.js';
