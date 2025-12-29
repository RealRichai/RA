import { z } from 'zod';

// ============================================================================
// API Request/Response Types
// ============================================================================

// Standard API error codes
export const APIErrorCodeSchema = z.enum([
  // Authentication
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_TOKEN_EXPIRED',
  'AUTH_TOKEN_INVALID',
  'AUTH_UNAUTHORIZED',
  'AUTH_FORBIDDEN',
  'AUTH_MFA_REQUIRED',
  'AUTH_ACCOUNT_LOCKED',
  'AUTH_ACCOUNT_DISABLED',

  // Validation
  'VALIDATION_ERROR',
  'INVALID_INPUT',
  'MISSING_REQUIRED_FIELD',
  'INVALID_FORMAT',
  'VALUE_OUT_OF_RANGE',

  // Resources
  'RESOURCE_NOT_FOUND',
  'RESOURCE_ALREADY_EXISTS',
  'RESOURCE_CONFLICT',
  'RESOURCE_LOCKED',
  'RESOURCE_DELETED',

  // Rate limiting
  'RATE_LIMIT_EXCEEDED',
  'QUOTA_EXCEEDED',

  // Payment
  'PAYMENT_FAILED',
  'PAYMENT_DECLINED',
  'PAYMENT_METHOD_INVALID',
  'INSUFFICIENT_FUNDS',

  // Compliance
  'COMPLIANCE_VIOLATION',
  'FARE_ACT_VIOLATION',
  'FAIR_HOUSING_VIOLATION',

  // External services
  'EXTERNAL_SERVICE_ERROR',
  'STRIPE_ERROR',
  'PLAID_ERROR',
  'AI_SERVICE_ERROR',

  // Server
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
  'TIMEOUT',

  // Feature flags
  'FEATURE_DISABLED',
  'MARKET_NOT_ENABLED',
]);
export type APIErrorCode = z.infer<typeof APIErrorCodeSchema>;

// Standard API error response
export const APIErrorSchema = z.object({
  code: APIErrorCodeSchema,
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  field: z.string().optional(), // For validation errors
  stack: z.string().optional(), // Only in development
});
export type APIError = z.infer<typeof APIErrorSchema>;

export const APIErrorResponseSchema = z.object({
  success: z.literal(false),
  error: APIErrorSchema,
  requestId: z.string(),
  timestamp: z.string(),
});
export type APIErrorResponse = z.infer<typeof APIErrorResponseSchema>;

// Standard API success response wrapper
export const APISuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: z.object({
      requestId: z.string(),
      timestamp: z.string(),
      processingTime: z.number().optional(), // ms
    }),
  });

// Paginated response wrapper
export const APIPaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    success: z.literal(true),
    data: z.object({
      items: z.array(itemSchema),
      pagination: z.object({
        total: z.number().int(),
        page: z.number().int(),
        limit: z.number().int(),
        totalPages: z.number().int(),
        hasNext: z.boolean(),
        hasPrev: z.boolean(),
      }),
    }),
    meta: z.object({
      requestId: z.string(),
      timestamp: z.string(),
      processingTime: z.number().optional(),
    }),
  });

// Bulk operation response
export const APIBulkResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    total: z.number().int(),
    succeeded: z.number().int(),
    failed: z.number().int(),
    results: z.array(z.object({
      id: z.string(),
      success: z.boolean(),
      error: APIErrorSchema.optional(),
    })),
  }),
  meta: z.object({
    requestId: z.string(),
    timestamp: z.string(),
    processingTime: z.number().optional(),
  }),
});
export type APIBulkResponse = z.infer<typeof APIBulkResponseSchema>;

// Health check response
export const HealthCheckResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  version: z.string(),
  environment: z.string(),
  timestamp: z.string(),
  uptime: z.number(), // seconds
  services: z.record(z.object({
    status: z.enum(['up', 'down', 'degraded']),
    latency: z.number().optional(), // ms
    message: z.string().optional(),
  })),
});
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;

// Rate limit headers
export const RateLimitInfoSchema = z.object({
  limit: z.number().int(),
  remaining: z.number().int(),
  reset: z.number().int(), // Unix timestamp
  retryAfter: z.number().int().optional(), // Seconds
});
export type RateLimitInfo = z.infer<typeof RateLimitInfoSchema>;

// Webhook payload
export const WebhookPayloadSchema = z.object({
  id: z.string(),
  type: z.string(),
  apiVersion: z.string(),
  created: z.number(), // Unix timestamp
  data: z.object({
    object: z.record(z.unknown()),
    previousAttributes: z.record(z.unknown()).optional(),
  }),
  livemode: z.boolean(),
});
export type WebhookPayload = z.infer<typeof WebhookPayloadSchema>;

// Webhook event types
export const WebhookEventTypeSchema = z.enum([
  // Property events
  'property.created',
  'property.updated',
  'property.deleted',

  // Listing events
  'listing.created',
  'listing.published',
  'listing.updated',
  'listing.expired',

  // Lease events
  'lease.created',
  'lease.signed',
  'lease.activated',
  'lease.expiring',
  'lease.expired',
  'lease.terminated',
  'lease.renewed',

  // Application events
  'application.submitted',
  'application.approved',
  'application.denied',
  'application.withdrawn',

  // Payment events
  'payment.pending',
  'payment.completed',
  'payment.failed',
  'payment.refunded',
  'invoice.created',
  'invoice.paid',
  'invoice.overdue',

  // Maintenance events
  'workorder.created',
  'workorder.assigned',
  'workorder.completed',
  'workorder.escalated',

  // Compliance events
  'compliance.violation',
  'compliance.resolved',
  'disclosure.required',

  // User events
  'user.created',
  'user.verified',
  'user.suspended',

  // AI events
  'ai.conversation.started',
  'ai.conversation.ended',
  'ai.escalation',
]);
export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;

// Search request
export const SearchRequestSchema = z.object({
  query: z.string().min(1).max(500),
  filters: z.record(z.unknown()).optional(),
  facets: z.array(z.string()).optional(),
  sort: z.object({
    field: z.string(),
    order: z.enum(['asc', 'desc']),
  }).optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  highlight: z.boolean().default(false),
});
export type SearchRequest = z.infer<typeof SearchRequestSchema>;

// Search response
export const SearchResultSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    query: z.string(),
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    took: z.number(), // ms
    items: z.array(z.object({
      item: itemSchema,
      score: z.number(),
      highlights: z.record(z.array(z.string())).optional(),
    })),
    facets: z.record(z.array(z.object({
      value: z.string(),
      count: z.number().int(),
    }))).optional(),
    suggestions: z.array(z.string()).optional(),
  });

// File upload response
export const FileUploadResponseSchema = z.object({
  id: z.string(),
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  url: z.string(),
  thumbnailUrl: z.string().optional(),
  uploadedAt: z.string(),
});
export type FileUploadResponse = z.infer<typeof FileUploadResponseSchema>;

// Presigned URL request/response
export const PresignedURLRequestSchema = z.object({
  filename: z.string(),
  contentType: z.string(),
  size: z.number().int().optional(),
  expiresIn: z.number().int().default(3600), // seconds
  purpose: z.string().optional(),
});
export type PresignedURLRequest = z.infer<typeof PresignedURLRequestSchema>;

export const PresignedURLResponseSchema = z.object({
  uploadUrl: z.string(),
  fileId: z.string(),
  expiresAt: z.string(),
  fields: z.record(z.string()).optional(), // For multipart uploads
});
export type PresignedURLResponse = z.infer<typeof PresignedURLResponseSchema>;
