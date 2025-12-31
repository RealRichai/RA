/**
 * Rate Limiting Types
 *
 * Defines rate limit tiers, configurations, and tracking structures.
 */

// =============================================================================
// Rate Limit Tiers
// =============================================================================

/**
 * User subscription tiers for rate limiting.
 */
export const RATE_LIMIT_TIERS = ['free', 'pro', 'enterprise', 'admin'] as const;
export type RateLimitTier = (typeof RATE_LIMIT_TIERS)[number];

/**
 * Rate limit configuration for each tier.
 * Values are requests per time window.
 */
export interface TierRateLimits {
  /** Requests per minute for general API calls */
  requestsPerMinute: number;
  /** Requests per minute for AI/expensive operations */
  aiRequestsPerMinute: number;
  /** Requests per minute for write operations (POST/PUT/DELETE) */
  writeRequestsPerMinute: number;
  /** Maximum concurrent requests */
  maxConcurrent: number;
  /** Daily request quota (0 = unlimited) */
  dailyQuota: number;
  /** Burst allowance (temporary overage) */
  burstAllowance: number;
}

/**
 * Default rate limits per tier.
 */
export const DEFAULT_TIER_LIMITS: Record<RateLimitTier, TierRateLimits> = {
  free: {
    requestsPerMinute: 60,
    aiRequestsPerMinute: 10,
    writeRequestsPerMinute: 30,
    maxConcurrent: 5,
    dailyQuota: 1000,
    burstAllowance: 10,
  },
  pro: {
    requestsPerMinute: 300,
    aiRequestsPerMinute: 60,
    writeRequestsPerMinute: 150,
    maxConcurrent: 20,
    dailyQuota: 10000,
    burstAllowance: 50,
  },
  enterprise: {
    requestsPerMinute: 1000,
    aiRequestsPerMinute: 200,
    writeRequestsPerMinute: 500,
    maxConcurrent: 50,
    dailyQuota: 0, // Unlimited
    burstAllowance: 200,
  },
  admin: {
    requestsPerMinute: 5000,
    aiRequestsPerMinute: 1000,
    writeRequestsPerMinute: 2500,
    maxConcurrent: 100,
    dailyQuota: 0, // Unlimited
    burstAllowance: 500,
  },
};

// =============================================================================
// Rate Limit Categories
// =============================================================================

/**
 * Categories of endpoints with different rate limit policies.
 */
export const RATE_LIMIT_CATEGORIES = [
  'default',      // Standard API calls
  'ai',           // AI-powered features
  'auth',         // Authentication endpoints
  'write',        // Create/Update/Delete operations
  'upload',       // File uploads
  'webhook',      // Webhook endpoints (stricter)
  'public',       // Public unauthenticated endpoints
] as const;

export type RateLimitCategory = (typeof RATE_LIMIT_CATEGORIES)[number];

/**
 * Rate limit policy for a category.
 */
export interface RateLimitPolicy {
  /** Requests allowed per window */
  limit: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Whether to use user ID or IP for tracking */
  keyType: 'user' | 'ip' | 'user_or_ip';
  /** Skip rate limiting for certain roles */
  skipRoles?: string[];
  /** Custom error message */
  errorMessage?: string;
}

/**
 * Route-specific rate limit override.
 */
export interface RouteRateLimit {
  /** Route pattern (e.g., '/api/v1/ai/*') */
  pattern: string;
  /** Category to use */
  category: RateLimitCategory;
  /** Optional override for this specific route */
  override?: Partial<RateLimitPolicy>;
}

// =============================================================================
// Rate Limit State
// =============================================================================

/**
 * Current rate limit state for a key.
 */
export interface RateLimitState {
  /** Unique identifier for this limit (userId or IP) */
  key: string;
  /** Category being tracked */
  category: RateLimitCategory;
  /** Current request count in window */
  count: number;
  /** Window start timestamp (ms) */
  windowStart: number;
  /** Window end timestamp (ms) */
  windowEnd: number;
  /** Maximum requests allowed */
  limit: number;
  /** Requests remaining in window */
  remaining: number;
  /** When the window resets (Unix timestamp) */
  resetAt: number;
}

/**
 * Rate limit check result.
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Current state after this request */
  state: RateLimitState;
  /** If blocked, retry after this many seconds */
  retryAfter?: number;
  /** Reason for blocking (if blocked) */
  reason?: string;
}

// =============================================================================
// Rate Limit Headers
// =============================================================================

/**
 * Standard rate limit headers to include in responses.
 */
export interface RateLimitHeaders {
  'X-RateLimit-Limit': string;
  'X-RateLimit-Remaining': string;
  'X-RateLimit-Reset': string;
  'X-RateLimit-Category'?: string;
  'Retry-After'?: string;
}

/**
 * Build rate limit headers from state.
 */
export function buildRateLimitHeaders(
  state: RateLimitState,
  retryAfter?: number
): RateLimitHeaders {
  const headers: RateLimitHeaders = {
    'X-RateLimit-Limit': String(state.limit),
    'X-RateLimit-Remaining': String(Math.max(0, state.remaining)),
    'X-RateLimit-Reset': String(state.resetAt),
    'X-RateLimit-Category': state.category,
  };

  if (retryAfter !== undefined && retryAfter > 0) {
    headers['Retry-After'] = String(retryAfter);
  }

  return headers;
}

// =============================================================================
// Rate Limit Events
// =============================================================================

/**
 * Event emitted when rate limit is exceeded.
 */
export interface RateLimitExceededEvent {
  key: string;
  category: RateLimitCategory;
  tier: RateLimitTier;
  limit: number;
  count: number;
  timestamp: Date;
  endpoint: string;
  userId?: string;
  ip: string;
}

/**
 * Daily quota tracking.
 */
export interface DailyQuotaState {
  userId: string;
  tier: RateLimitTier;
  date: string; // YYYY-MM-DD
  used: number;
  limit: number;
  remaining: number;
}

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Full rate limit configuration.
 */
export interface RateLimitConfig {
  /** Enable/disable rate limiting */
  enabled: boolean;
  /** Default tier for unauthenticated users */
  defaultTier: RateLimitTier;
  /** Tier limits configuration */
  tierLimits: Record<RateLimitTier, TierRateLimits>;
  /** Category-specific policies */
  categoryPolicies: Record<RateLimitCategory, RateLimitPolicy>;
  /** Route-specific overrides */
  routeOverrides: RouteRateLimit[];
  /** Whether to include rate limit headers in all responses */
  includeHeaders: boolean;
  /** Redis key prefix for rate limit data */
  redisPrefix: string;
  /** Whether to log rate limit events */
  logEvents: boolean;
}

/**
 * Default category policies.
 */
export const DEFAULT_CATEGORY_POLICIES: Record<RateLimitCategory, RateLimitPolicy> = {
  default: {
    limit: 100,
    windowMs: 60000, // 1 minute
    keyType: 'user_or_ip',
  },
  ai: {
    limit: 20,
    windowMs: 60000,
    keyType: 'user',
    errorMessage: 'AI request limit exceeded. Please wait before trying again.',
  },
  auth: {
    limit: 10,
    windowMs: 60000,
    keyType: 'ip',
    errorMessage: 'Too many authentication attempts. Please wait before trying again.',
  },
  write: {
    limit: 50,
    windowMs: 60000,
    keyType: 'user_or_ip',
  },
  upload: {
    limit: 10,
    windowMs: 60000,
    keyType: 'user',
    errorMessage: 'Upload limit exceeded. Please wait before uploading more files.',
  },
  webhook: {
    limit: 100,
    windowMs: 60000,
    keyType: 'ip',
  },
  public: {
    limit: 30,
    windowMs: 60000,
    keyType: 'ip',
  },
};

/**
 * Get tier from user role.
 */
export function getTierFromRole(role?: string): RateLimitTier {
  if (!role) return 'free';

  switch (role) {
    case 'admin':
      return 'admin';
    case 'landlord':
    case 'agent':
      return 'pro';
    case 'investor':
      return 'enterprise';
    default:
      return 'free';
  }
}
