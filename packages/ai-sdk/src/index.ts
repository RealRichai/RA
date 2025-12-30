/**
 * @realriches/ai-sdk
 *
 * LLM adapter with Claude as primary provider, mandatory redaction layer,
 * policy gate for compliance, and full audit logging to AgentRun ledger.
 */

// =============================================================================
// Types
// =============================================================================

export * from './types';

// =============================================================================
// Adapters
// =============================================================================

export {
  createProvider,
  createAnthropicProvider,
  createOpenAIProvider,
  createConsoleProvider,
  type ILLMProvider,
  BaseLLMProvider,
  LLMProviderError,
  LLMRateLimitError,
  LLMTimeoutError,
  LLMBudgetExceededError,
  LLMContentFilteredError,
  LLMAuthenticationError,
} from './adapters';

// =============================================================================
// Redaction
// =============================================================================

export {
  Redactor,
  getRedactor,
  resetRedactor,
  PIIDetector,
  type RedactionConfig,
  type RedactionType,
  type RedactionEntry,
  type RedactionReport,
  type RedactedContent,
} from './redaction';

// =============================================================================
// Policy Gate
// =============================================================================

export {
  gateAIOutput,
  getMarketRules,
  checkAIFeeStructures,
  checkAIFCHACompliance,
  checkAllPolicyRules,
  NYC_STRICT_RULES,
  US_STANDARD_RULES,
  CA_STANDARD_RULES,
  type AIViolationCode,
  type AIViolation,
  type AIOutputCheckInput,
  type AIGateResult,
  type PolicyCheckResult,
  type MarketRules,
  type FCHARules,
} from './policy';

// =============================================================================
// Ledger
// =============================================================================

export {
  AgentRunService,
  getAgentRunService,
  resetAgentRunService,
  type AgentRunServiceConfig,
  type AgentRun,
  type AgentRunInput,
  type AgentRunStatus,
  type BudgetUsage,
} from './ledger';

// =============================================================================
// Client
// =============================================================================

export { AIClient, createAIClient, type AIClientConfig } from './client';
