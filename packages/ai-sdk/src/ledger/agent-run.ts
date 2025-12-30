/**
 * Agent Run Service
 *
 * Service for logging AI agent runs to the ledger.
 */

import { randomUUID } from 'crypto';

import type { PolicyCheckResult } from '../policy/types';
import type { RedactionReport } from '../redaction/types';

import type { AgentRun, AgentRunInput, BudgetUsage } from './types';

// =============================================================================
// Service Configuration
// =============================================================================

export interface AgentRunServiceConfig {
  /** Function to persist an agent run to database */
  persistAgentRun?: (run: AgentRun) => Promise<void>;
  /** Function to update an existing agent run */
  updateAgentRun?: (id: string, data: Partial<AgentRun>) => Promise<void>;
  /** Function to get budget usage */
  getBudgetUsage?: (params: {
    userId?: string;
    organizationId?: string;
    date: Date;
  }) => Promise<BudgetUsage>;
  /** Logger function */
  logger?: (
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, unknown>
  ) => void;
}

// =============================================================================
// Agent Run Service
// =============================================================================

/**
 * Service for managing AI agent run logs.
 */
export class AgentRunService {
  private config: AgentRunServiceConfig;
  private inMemoryRuns: Map<string, AgentRun> = new Map();

  constructor(config: AgentRunServiceConfig = {}) {
    this.config = config;
  }

  /**
   * Start a new agent run.
   */
  async startRun(input: AgentRunInput): Promise<AgentRun> {
    const now = new Date();

    const run: AgentRun = {
      id: randomUUID(),
      userId: input.userId,
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      entityType: input.entityType,
      entityId: input.entityId,
      marketId: input.marketId,
      model: input.model,
      provider: input.provider,
      agentType: input.agentType,
      promptRedacted: input.promptMessages
        .map((m: { role: string; content: string }) => m.content)
        .join('\n---\n'),
      tokensPrompt: 0,
      tokensCompletion: 0,
      tokensTotal: 0,
      cost: 0,
      status: 'pending',
      startedAt: now,
      requestId: input.requestId,
      createdAt: now,
      updatedAt: now,
    };

    // Store in memory for retrieval
    this.inMemoryRuns.set(run.id, run);

    if (this.config.persistAgentRun) {
      await this.config.persistAgentRun(run);
    }

    this.log('info', 'Agent run started', { runId: run.id, model: run.model });
    return run;
  }

  /**
   * Update run status to processing.
   */
  async markProcessing(runId: string): Promise<void> {
    await this.update(runId, { status: 'processing' });
  }

  /**
   * Record redaction reports for prompt.
   */
  async recordPromptRedaction(
    runId: string,
    redactedPrompt: string,
    report: RedactionReport
  ): Promise<void> {
    await this.update(runId, {
      promptRedacted: redactedPrompt,
      promptRedactionReport: report,
    });
  }

  /**
   * Record completion output.
   */
  async recordCompletion(
    runId: string,
    data: {
      output: string;
      outputRedactionReport?: RedactionReport;
      tokensPrompt: number;
      tokensCompletion: number;
      cost: number;
      processingTimeMs: number;
      providerRequestId?: string;
    }
  ): Promise<void> {
    await this.update(runId, {
      outputRedacted: data.output,
      outputRedactionReport: data.outputRedactionReport,
      tokensPrompt: data.tokensPrompt,
      tokensCompletion: data.tokensCompletion,
      tokensTotal: data.tokensPrompt + data.tokensCompletion,
      cost: data.cost,
      processingTimeMs: data.processingTimeMs,
      providerRequestId: data.providerRequestId,
      status: 'completed',
      completedAt: new Date(),
    });

    this.log('info', 'Agent run completed', {
      runId,
      tokens: data.tokensPrompt + data.tokensCompletion,
      cost: data.cost,
    });
  }

  /**
   * Record policy check result.
   */
  async recordPolicyCheck(
    runId: string,
    result: PolicyCheckResult,
    blocked: boolean
  ): Promise<void> {
    const updates: Partial<AgentRun> = {
      policyCheckResult: result,
    };

    if (blocked) {
      updates.status = 'blocked';
      updates.completedAt = new Date();
    }

    await this.update(runId, updates);

    if (blocked) {
      this.log('warn', 'Agent run blocked by policy', {
        runId,
        violations: result.violations.length,
      });
    }
  }

  /**
   * Record failure.
   */
  async recordFailure(
    runId: string,
    errorCode: string,
    errorMessage: string
  ): Promise<void> {
    await this.update(runId, {
      status: 'failed',
      errorCode,
      errorMessage,
      completedAt: new Date(),
    });

    this.log('error', 'Agent run failed', { runId, errorCode, errorMessage });
  }

  /**
   * Get an agent run by ID.
   */
  getRun(runId: string): AgentRun | undefined {
    return this.inMemoryRuns.get(runId);
  }

  /**
   * Get budget usage for budget cap checks.
   */
  async getBudgetUsage(params: {
    userId?: string;
    organizationId?: string;
  }): Promise<BudgetUsage> {
    if (this.config.getBudgetUsage) {
      return this.config.getBudgetUsage({
        ...params,
        date: new Date(),
      });
    }

    // Default: no usage (for testing/dev)
    return { userDaily: 0, orgDaily: 0, globalDaily: 0 };
  }

  /**
   * Update an agent run.
   */
  private async update(runId: string, data: Partial<AgentRun>): Promise<void> {
    const updateData = { ...data, updatedAt: new Date() };

    // Update in-memory
    const existing = this.inMemoryRuns.get(runId);
    if (existing) {
      this.inMemoryRuns.set(runId, { ...existing, ...updateData } as AgentRun);
    }

    // Persist to database
    if (this.config.updateAgentRun) {
      await this.config.updateAgentRun(runId, updateData);
    }

    this.log('debug', 'Agent run updated', { runId, fields: Object.keys(data) });
  }

  /**
   * Log a message.
   */
  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, unknown>
  ): void {
    if (this.config.logger) {
      this.config.logger(level, message, data);
    }
  }

  /**
   * Clear in-memory runs (for testing).
   */
  clear(): void {
    this.inMemoryRuns.clear();
  }
}

// =============================================================================
// Singleton Management
// =============================================================================

let defaultService: AgentRunService | null = null;

/**
 * Get the default agent run service instance.
 */
export function getAgentRunService(
  config?: AgentRunServiceConfig
): AgentRunService {
  if (!defaultService || config) {
    defaultService = new AgentRunService(config);
  }
  return defaultService;
}

/**
 * Reset the default agent run service instance.
 */
export function resetAgentRunService(): void {
  defaultService = null;
}
