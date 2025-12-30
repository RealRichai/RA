/**
 * AI SDK Types
 *
 * Zod schemas and TypeScript types for the LLM adapter system.
 */

import { z } from 'zod';

// Re-export commonly used types from @realriches/types
// These are imported by consumers, we re-export for convenience

// =============================================================================
// LLM Provider Types
// =============================================================================

export const LLMProviderSchema = z.enum(['anthropic', 'openai', 'console']);
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

export const LLMModelSchema = z.enum([
  // Anthropic models
  'claude-3-opus',
  'claude-3-sonnet',
  'claude-3-haiku',
  'claude-3-5-sonnet',
  // OpenAI models (for future)
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
]);
export type LLMModel = z.infer<typeof LLMModelSchema>;

// =============================================================================
// Request Configuration
// =============================================================================

export const LLMRequestConfigSchema = z.object({
  /** Request timeout in milliseconds */
  timeout: z.number().int().positive().default(30000),
  /** Maximum retry attempts */
  maxRetries: z.number().int().min(0).max(10).default(3),
  /** Base delay for retry backoff in milliseconds */
  retryBaseDelay: z.number().int().positive().default(1000),
  /** Temperature for response generation (0-2) */
  temperature: z.number().min(0).max(2).default(0.7),
  /** Maximum tokens in response */
  maxTokens: z.number().int().positive().default(4096),
});
export type LLMRequestConfig = z.infer<typeof LLMRequestConfigSchema>;

// =============================================================================
// Budget Configuration
// =============================================================================

export const BudgetConfigSchema = z.object({
  /** Maximum cost per request in cents */
  perRequestMaxCost: z.number().int().positive().optional(),
  /** Maximum daily cost per user in cents */
  perUserDailyLimit: z.number().int().positive().optional(),
  /** Maximum daily cost per organization in cents */
  perOrgDailyLimit: z.number().int().positive().optional(),
  /** Maximum global daily cost in cents */
  globalDailyLimit: z.number().int().positive().optional(),
});
export type BudgetConfig = z.infer<typeof BudgetConfigSchema>;

// =============================================================================
// Message Types
// =============================================================================

export const MessageRoleSchema = z.enum(['system', 'user', 'assistant']);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageSchema = z.object({
  role: MessageRoleSchema,
  content: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

// =============================================================================
// Completion Request
// =============================================================================

export const CompletionContextSchema = z.object({
  userId: z.string().uuid().optional(),
  organizationId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  marketId: z.string().optional(),
  /** Application stage for FCHA compliance checks */
  applicationStage: z.string().optional(),
});
export type CompletionContext = z.infer<typeof CompletionContextSchema>;

export const CompletionRequestSchema = z.object({
  /** Conversation messages */
  messages: z.array(MessageSchema).min(1),
  /** Model to use */
  model: LLMModelSchema,
  /** Optional request configuration overrides */
  config: LLMRequestConfigSchema.partial().optional(),
  /** Optional context for audit and policy checks */
  context: CompletionContextSchema.optional(),
  /** Optional request ID for tracing */
  requestId: z.string().optional(),
});
export type CompletionRequest = z.infer<typeof CompletionRequestSchema>;

// =============================================================================
// Completion Response
// =============================================================================

export const TokenUsageSchema = z.object({
  prompt: z.number().int().min(0),
  completion: z.number().int().min(0),
  total: z.number().int().min(0),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const FinishReasonSchema = z.enum(['stop', 'length', 'content_filter', 'error']);
export type FinishReason = z.infer<typeof FinishReasonSchema>;

export const CompletionResponseSchema = z.object({
  /** Generated content */
  content: z.string(),
  /** Model that was used */
  model: LLMModelSchema,
  /** Token usage statistics */
  tokensUsed: TokenUsageSchema,
  /** Cost in cents */
  cost: z.number().min(0),
  /** Processing time in milliseconds */
  processingTimeMs: z.number().int().min(0),
  /** Provider's request ID */
  providerRequestId: z.string().optional(),
  /** Reason generation stopped */
  finishReason: FinishReasonSchema,
});
export type CompletionResponse = z.infer<typeof CompletionResponseSchema>;

// =============================================================================
// Provider Configuration
// =============================================================================

export interface LLMProviderConfig {
  /** API key for the provider */
  apiKey: string;
  /** Optional custom API URL */
  apiUrl?: string;
  /** Default timeout in milliseconds */
  timeout?: number;
  /** Default max retries */
  maxRetries?: number;
  /** Base delay for retry backoff */
  retryBaseDelay?: number;
  /** Default model to use */
  defaultModel?: LLMModel;
}

// =============================================================================
// Model Pricing (per 1M tokens, in cents)
// =============================================================================

export interface ModelPricing {
  input: number;
  output: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-3-opus': { input: 1500, output: 7500 },
  'claude-3-sonnet': { input: 300, output: 1500 },
  'claude-3-haiku': { input: 25, output: 125 },
  'claude-3-5-sonnet': { input: 300, output: 1500 },
  'gpt-4-turbo': { input: 1000, output: 3000 },
  'gpt-4': { input: 3000, output: 6000 },
  'gpt-3.5-turbo': { input: 50, output: 150 },
};

/**
 * Calculate cost in cents for a completion.
 */
export function calculateCost(
  model: string,
  tokens: { prompt: number; completion: number }
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-3-haiku']!;
  const inputCost = (tokens.prompt / 1_000_000) * pricing.input;
  const outputCost = (tokens.completion / 1_000_000) * pricing.output;
  return Math.ceil(inputCost + outputCost);
}
