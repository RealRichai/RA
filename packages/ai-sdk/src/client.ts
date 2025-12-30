/**
 * AI Client
 *
 * Main orchestrator that brings together providers, redaction,
 * policy gate, and audit logging.
 */

import { createAnthropicProvider } from './adapters/anthropic';
import { createConsoleProvider } from './adapters/console';
import { createOpenAIProvider } from './adapters/openai';
import type { ILLMProvider } from './adapters/provider-interface';
import { LLMBudgetExceededError, LLMProviderError } from './adapters/provider-interface';
import { getAgentRunService } from './ledger/agent-run';
import type { AgentRunServiceConfig } from './ledger/agent-run';
import { gateAIOutput } from './policy/gate';
import { getRedactor } from './redaction/redactor';
import type { RedactionConfig } from './redaction/types';
import type {
  LLMProvider,
  LLMProviderConfig,
  BudgetConfig,
  CompletionRequest,
  CompletionResponse,
} from './types';

// =============================================================================
// Client Configuration
// =============================================================================

export interface AIClientConfig {
  /** Default provider to use */
  defaultProvider: LLMProvider;
  /** Fallback provider to use if default fails (optional) */
  fallbackProvider?: LLMProvider;
  /** Provider-specific configurations */
  providers?: {
    anthropic?: LLMProviderConfig;
    openai?: LLMProviderConfig;
    console?: Partial<LLMProviderConfig>;
  };
  /** Budget limits */
  budget?: BudgetConfig;
  /** Redaction configuration */
  redaction?: Partial<RedactionConfig>;
  /** Whether to enable policy gate (default: true) */
  enablePolicyGate?: boolean;
  /** Whether to block on policy violations or just sanitize (default: false = sanitize) */
  blockOnPolicyViolation?: boolean;
  /** Ledger service configuration */
  ledger?: AgentRunServiceConfig;
}

// =============================================================================
// AI Client
// =============================================================================

/**
 * Main AI client that orchestrates the full pipeline.
 */
export class AIClient {
  private providers: Map<LLMProvider, ILLMProvider> = new Map();
  private defaultProvider: LLMProvider;
  private fallbackProvider?: LLMProvider;
  private budgetConfig: BudgetConfig;
  private enablePolicyGate: boolean;
  private blockOnPolicyViolation: boolean;

  constructor(config: AIClientConfig) {
    this.defaultProvider = config.defaultProvider;
    this.fallbackProvider = config.fallbackProvider;
    this.budgetConfig = config.budget || {};
    this.enablePolicyGate = config.enablePolicyGate ?? true;
    this.blockOnPolicyViolation = config.blockOnPolicyViolation ?? false;

    // Initialize providers
    if (config.providers?.anthropic || config.defaultProvider === 'anthropic' || config.fallbackProvider === 'anthropic') {
      this.providers.set(
        'anthropic',
        createAnthropicProvider(config.providers?.anthropic)
      );
    }
    if (config.providers?.openai || config.defaultProvider === 'openai' || config.fallbackProvider === 'openai') {
      this.providers.set(
        'openai',
        createOpenAIProvider(config.providers?.openai)
      );
    }
    if (config.providers?.console || config.defaultProvider === 'console' || config.fallbackProvider === 'console') {
      this.providers.set(
        'console',
        createConsoleProvider(config.providers?.console)
      );
    }

    // Initialize redactor with config
    if (config.redaction) {
      getRedactor(config.redaction);
    }

    // Initialize ledger
    if (config.ledger) {
      getAgentRunService(config.ledger);
    }
  }

  /**
   * Execute a completion request with full pipeline:
   * 1. Budget check
   * 2. Redact prompt
   * 3. Start agent run log
   * 4. Execute completion (with fallback on provider failure)
   * 5. Redact output
   * 6. Policy gate check
   * 7. Record completion
   */
  async complete(
    request: CompletionRequest
  ): Promise<CompletionResponse & { agentRunId: string }> {
    const provider = this.providers.get(this.defaultProvider);
    if (!provider) {
      throw new Error(`Provider ${this.defaultProvider} not configured`);
    }

    const ledger = getAgentRunService();

    // 1. Budget check
    await this.checkBudget(
      request.context?.userId,
      request.context?.organizationId
    );

    // 2. Redact prompt messages
    const redactor = getRedactor();
    const { messages: redactedMessages, reports: promptReports } =
      redactor.redactMessages(request.messages);

    // 3. Start agent run log
    const run = await ledger.startRun({
      userId: request.context?.userId,
      organizationId: request.context?.organizationId,
      conversationId: request.context?.conversationId,
      entityType: request.context?.entityType,
      entityId: request.context?.entityId,
      marketId: request.context?.marketId,
      model: request.model,
      provider: this.defaultProvider,
      promptMessages: redactedMessages,
      requestConfig: request.config,
      requestId: request.requestId,
    });

    // Record prompt redaction if any
    if (promptReports.length > 0 && promptReports[0]) {
      await ledger.recordPromptRedaction(
        run.id,
        redactedMessages.map((m) => m.content).join('\n---\n'),
        promptReports[0]
      );
    }

    try {
      // Mark as processing
      await ledger.markProcessing(run.id);

      // 4. Execute completion with redacted messages (with fallback)
      const response = await this.executeWithFallback(provider, {
        ...request,
        messages: redactedMessages,
      });

      // 5. Redact output
      const outputRedaction = redactor.redact(response.content);
      let finalContent = outputRedaction.content;

      // 6. Policy gate check (if enabled and marketId provided)
      if (this.enablePolicyGate && request.context?.marketId) {
        const gateResult = gateAIOutput({
          content: outputRedaction.content,
          marketId: request.context.marketId,
          context: {
            conversationId: request.context.conversationId,
            applicationStage: request.context.applicationStage,
          },
        });

        await ledger.recordPolicyCheck(
          run.id,
          gateResult.checkResult,
          !gateResult.allowed
        );

        if (!gateResult.allowed) {
          if (this.blockOnPolicyViolation) {
            // Block completely
            await ledger.recordFailure(
              run.id,
              'POLICY_BLOCKED',
              gateResult.blockedReason || 'Policy violation'
            );
            throw new Error(`AI output blocked: ${gateResult.blockedReason}`);
          } else if (gateResult.sanitizedOutput) {
            // Use sanitized output
            finalContent = gateResult.sanitizedOutput;
          }
        }
      }

      // 7. Record completion
      await ledger.recordCompletion(run.id, {
        output: finalContent,
        outputRedactionReport:
          outputRedaction.report.totalRedactions > 0
            ? outputRedaction.report
            : undefined,
        tokensPrompt: response.tokensUsed.prompt,
        tokensCompletion: response.tokensUsed.completion,
        cost: response.cost,
        processingTimeMs: response.processingTimeMs,
        providerRequestId: response.providerRequestId,
      });

      return {
        ...response,
        content: finalContent,
        agentRunId: run.id,
      };
    } catch (error) {
      // Record failure if not already recorded
      if (
        error instanceof Error &&
        !error.message.startsWith('AI output blocked')
      ) {
        await ledger.recordFailure(
          run.id,
          (error as { code?: string }).code || 'UNKNOWN_ERROR',
          error.message
        );
      }
      throw error;
    }
  }

  /**
   * Execute completion with fallback provider on failure.
   */
  private async executeWithFallback(
    provider: ILLMProvider,
    request: CompletionRequest
  ): Promise<CompletionResponse> {
    try {
      return await provider.complete(request);
    } catch (error) {
      // Only fallback on provider errors (rate limits, timeouts, etc.)
      if (this.fallbackProvider && error instanceof LLMProviderError && error.retryable) {
        const fallbackProvider = this.providers.get(this.fallbackProvider);
        if (fallbackProvider) {
          // eslint-disable-next-line no-console
          console.warn(
            `Primary provider ${provider.providerId} failed, falling back to ${this.fallbackProvider}:`,
            error.message
          );
          return await fallbackProvider.complete(request);
        }
      }
      throw error;
    }
  }

  /**
   * Check budget limits before execution.
   */
  private async checkBudget(
    userId?: string,
    organizationId?: string
  ): Promise<void> {
    const ledger = getAgentRunService();
    const usage = await ledger.getBudgetUsage({ userId, organizationId });

    if (this.budgetConfig.perUserDailyLimit && userId) {
      if (usage.userDaily >= this.budgetConfig.perUserDailyLimit) {
        throw new LLMBudgetExceededError(
          this.defaultProvider,
          'user',
          this.budgetConfig.perUserDailyLimit,
          usage.userDaily
        );
      }
    }

    if (this.budgetConfig.perOrgDailyLimit && organizationId) {
      if (usage.orgDaily >= this.budgetConfig.perOrgDailyLimit) {
        throw new LLMBudgetExceededError(
          this.defaultProvider,
          'org',
          this.budgetConfig.perOrgDailyLimit,
          usage.orgDaily
        );
      }
    }

    if (this.budgetConfig.globalDailyLimit) {
      if (usage.globalDaily >= this.budgetConfig.globalDailyLimit) {
        throw new LLMBudgetExceededError(
          this.defaultProvider,
          'global',
          this.budgetConfig.globalDailyLimit,
          usage.globalDaily
        );
      }
    }
  }

  /**
   * Get a specific provider.
   */
  getProvider(providerId: LLMProvider): ILLMProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Check if a provider is available.
   */
  async isProviderAvailable(providerId: LLMProvider): Promise<boolean> {
    const provider = this.providers.get(providerId);
    return provider ? provider.isAvailable() : false;
  }

  /**
   * Add a provider to the client.
   */
  addProvider(providerId: LLMProvider, provider: ILLMProvider): void {
    this.providers.set(providerId, provider);
  }

  /**
   * Set the default provider.
   */
  setDefaultProvider(providerId: LLMProvider): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`Provider ${providerId} not configured`);
    }
    this.defaultProvider = providerId;
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create an AI client with configuration.
 * Default: Claude/Anthropic as primary with OpenAI fallback in production.
 */
export function createAIClient(config?: Partial<AIClientConfig>): AIClient {
  const isProduction = process.env['NODE_ENV'] === 'production';

  return new AIClient({
    defaultProvider:
      config?.defaultProvider || (isProduction ? 'anthropic' : 'console'),
    fallbackProvider:
      config?.fallbackProvider || (isProduction ? 'openai' : undefined),
    providers: {
      anthropic: config?.providers?.anthropic || {
        apiKey: process.env['ANTHROPIC_API_KEY'] || '',
      },
      openai: config?.providers?.openai || {
        apiKey: process.env['OPENAI_API_KEY'] || '',
      },
      console: config?.providers?.console || {},
    },
    budget: config?.budget,
    redaction: config?.redaction,
    enablePolicyGate: config?.enablePolicyGate ?? true,
    blockOnPolicyViolation: config?.blockOnPolicyViolation ?? false,
    ledger: config?.ledger,
    ...config,
  });
}
