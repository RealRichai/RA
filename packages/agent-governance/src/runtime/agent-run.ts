/**
 * Agent Run Management
 *
 * Tracks and manages AI agent executions with full audit trails.
 */

import { createHash, randomUUID } from 'crypto';

import type {
  AgentRun,
  AgentRunStatus,
  AgentOutcome,
  AgentType,
  PromptMessage,
  ToolCall,
  RedactionReport,
  Result,
} from '../types';
import { Ok, Err } from '../types';

// =============================================================================
// Input Hashing
// =============================================================================

/**
 * Generate deterministic hash of inputs for idempotency.
 */
export function hashInputs(inputs: Record<string, unknown>): string {
  const canonical = JSON.stringify(inputs, Object.keys(inputs).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Generate hash for tool call inputs.
 */
export function hashToolInputs(toolName: string, inputs: Record<string, unknown>): string {
  const canonical = JSON.stringify({ tool: toolName, inputs }, Object.keys(inputs).sort());
  return createHash('sha256').update(canonical).digest('hex');
}

// =============================================================================
// Agent Run Builder
// =============================================================================

export interface CreateAgentRunOptions {
  agentType: AgentType;
  tenantId: string;
  inputs: Record<string, unknown>;
  policyVersion: string;
  modelId: string;
  requestId?: string;
  userId?: string;
  market?: string;
  context?: Record<string, unknown>;
  parentRunId?: string;
  retryOf?: string;
  retryCount?: number;
  marketPackVersion?: string;
}

/**
 * Create a new agent run with proper initialization.
 */
export function createAgentRun(options: CreateAgentRunOptions): AgentRun {
  const now = new Date();
  const id = `run_${randomUUID()}`;
  const requestId = options.requestId || `req_${randomUUID()}`;

  return {
    id,
    requestId,
    agentType: options.agentType,
    status: 'pending',
    tenantId: options.tenantId,
    userId: options.userId,
    market: options.market,
    inputsHash: hashInputs(options.inputs),
    inputs: options.inputs,
    context: options.context,
    prompts: [],
    totalTokensIn: 0,
    totalTokensOut: 0,
    toolCalls: [],
    policyVersion: options.policyVersion,
    policyViolations: [],
    marketPackVersion: options.marketPackVersion,
    totalCostUsd: 0,
    modelId: options.modelId,
    startedAt: now,
    parentRunId: options.parentRunId,
    retryOf: options.retryOf,
    retryCount: options.retryCount || 0,
  };
}

// =============================================================================
// Agent Run State Machine
// =============================================================================

const VALID_TRANSITIONS: Record<AgentRunStatus, AgentRunStatus[]> = {
  pending: ['running', 'cancelled', 'policy_blocked'],
  running: ['completed', 'failed', 'cancelled', 'timeout', 'policy_blocked'],
  completed: [],
  failed: [],
  cancelled: [],
  timeout: [],
  policy_blocked: [],
};

/**
 * Validate and perform status transition.
 */
export function transitionStatus(
  run: AgentRun,
  newStatus: AgentRunStatus
): Result<AgentRun> {
  const validNext = VALID_TRANSITIONS[run.status];

  if (!validNext.includes(newStatus)) {
    return Err(
      'INVALID_TRANSITION',
      `Cannot transition from ${run.status} to ${newStatus}`,
      { details: { currentStatus: run.status, attemptedStatus: newStatus } }
    );
  }

  const now = new Date();
  const completedAt = ['completed', 'failed', 'cancelled', 'timeout', 'policy_blocked'].includes(newStatus)
    ? now
    : undefined;

  return Ok({
    ...run,
    status: newStatus,
    completedAt,
    durationMs: completedAt ? now.getTime() - run.startedAt.getTime() : undefined,
  });
}

/**
 * Start an agent run.
 */
export function startRun(run: AgentRun): Result<AgentRun> {
  return transitionStatus(run, 'running');
}

/**
 * Complete an agent run successfully.
 */
export function completeRun(run: AgentRun, outcome: AgentOutcome): Result<AgentRun> {
  const transitionResult = transitionStatus(run, 'completed');
  if (!transitionResult.ok) return transitionResult;

  return Ok({
    ...transitionResult.data,
    outcome,
  });
}

/**
 * Fail an agent run.
 */
export function failRun(run: AgentRun, errorMessage: string): Result<AgentRun> {
  const transitionResult = transitionStatus(run, 'failed');
  if (!transitionResult.ok) return transitionResult;

  return Ok({
    ...transitionResult.data,
    outcome: {
      success: false,
      actionsTaken: [],
      entitiesAffected: [],
      summaryForHuman: `Agent run failed: ${errorMessage}`,
    },
  });
}

/**
 * Block a run due to policy violation.
 */
export function blockRun(
  run: AgentRun,
  ruleId: string,
  message: string
): Result<AgentRun> {
  const transitionResult = transitionStatus(run, 'policy_blocked');
  if (!transitionResult.ok) return transitionResult;

  return Ok({
    ...transitionResult.data,
    policyViolations: [
      ...run.policyViolations,
      {
        ruleId,
        severity: 'fatal',
        message,
        timestamp: new Date(),
      },
    ],
    outcome: {
      success: false,
      actionsTaken: [],
      entitiesAffected: [],
      summaryForHuman: `Agent run blocked by policy: ${message}`,
    },
  });
}

// =============================================================================
// Prompt Management
// =============================================================================

/**
 * Add a prompt message to the run.
 */
export function addPrompt(
  run: AgentRun,
  message: PromptMessage
): AgentRun {
  return {
    ...run,
    prompts: [...run.prompts, message],
    totalTokensIn: run.totalTokensIn + (message.role !== 'assistant' ? (message.tokenCount || 0) : 0),
    totalTokensOut: run.totalTokensOut + (message.role === 'assistant' ? (message.tokenCount || 0) : 0),
  };
}

// =============================================================================
// Tool Call Management
// =============================================================================

/**
 * Create a tool call record.
 */
export function createToolCall(
  toolName: string,
  inputs: Record<string, unknown>
): ToolCall {
  return {
    id: `tc_${randomUUID()}`,
    toolName,
    inputs,
    inputsHash: hashToolInputs(toolName, inputs),
    status: 'pending',
    costUsd: 0,
  };
}

/**
 * Add a tool call to the run.
 */
export function addToolCall(run: AgentRun, toolCall: ToolCall): AgentRun {
  return {
    ...run,
    toolCalls: [...run.toolCalls, toolCall],
  };
}

/**
 * Update a tool call status.
 */
export function updateToolCall(
  run: AgentRun,
  toolCallId: string,
  updates: Partial<ToolCall>
): Result<AgentRun> {
  const toolCallIndex = run.toolCalls.findIndex((tc) => tc.id === toolCallId);

  if (toolCallIndex === -1) {
    return Err('TOOL_CALL_NOT_FOUND', `Tool call ${toolCallId} not found`);
  }

  const existingToolCall = run.toolCalls[toolCallIndex];
  if (!existingToolCall) {
    return Err('TOOL_CALL_NOT_FOUND', `Tool call ${toolCallId} not found`);
  }

  const updatedToolCalls = [...run.toolCalls];
  updatedToolCalls[toolCallIndex] = {
    ...existingToolCall,
    ...updates,
  };

  // Update total cost
  const additionalCost = (updates.costUsd || 0) - (existingToolCall.costUsd || 0);

  return Ok({
    ...run,
    toolCalls: updatedToolCalls,
    totalCostUsd: run.totalCostUsd + additionalCost,
  });
}

/**
 * Mark a tool call as approved by policy gate.
 */
export function approveToolCall(
  run: AgentRun,
  toolCallId: string,
  appliedRules: string[]
): Result<AgentRun> {
  return updateToolCall(run, toolCallId, {
    status: 'approved',
    policyCheckResult: {
      approved: true,
      violations: [],
      appliedRules,
    },
    startedAt: new Date(),
  });
}

/**
 * Block a tool call due to policy violation.
 */
export function blockToolCall(
  run: AgentRun,
  toolCallId: string,
  violations: string[],
  appliedRules: string[]
): Result<AgentRun> {
  return updateToolCall(run, toolCallId, {
    status: 'blocked',
    policyCheckResult: {
      approved: false,
      violations,
      appliedRules,
    },
  });
}

/**
 * Complete a tool call execution.
 */
export function completeToolCall(
  run: AgentRun,
  toolCallId: string,
  output: unknown,
  costUsd: number = 0
): Result<AgentRun> {
  const toolCall = run.toolCalls.find((tc) => tc.id === toolCallId);
  if (!toolCall) {
    return Err('TOOL_CALL_NOT_FOUND', `Tool call ${toolCallId} not found`);
  }

  const now = new Date();
  const durationMs = toolCall.startedAt ? now.getTime() - toolCall.startedAt.getTime() : undefined;

  return updateToolCall(run, toolCallId, {
    status: 'executed',
    output,
    completedAt: now,
    durationMs,
    costUsd,
  });
}

/**
 * Fail a tool call execution.
 */
export function failToolCall(
  run: AgentRun,
  toolCallId: string,
  error: string
): Result<AgentRun> {
  const toolCall = run.toolCalls.find((tc) => tc.id === toolCallId);
  if (!toolCall) {
    return Err('TOOL_CALL_NOT_FOUND', `Tool call ${toolCallId} not found`);
  }

  const now = new Date();
  const durationMs = toolCall.startedAt ? now.getTime() - toolCall.startedAt.getTime() : undefined;

  return updateToolCall(run, toolCallId, {
    status: 'failed',
    error,
    completedAt: now,
    durationMs,
  });
}

// =============================================================================
// Cost Tracking
// =============================================================================

const TOKEN_COST_PER_1K: Record<string, { input: number; output: number }> = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  'claude-3-opus': { input: 0.015, output: 0.075 },
  'claude-3-sonnet': { input: 0.003, output: 0.015 },
  'claude-3-haiku': { input: 0.00025, output: 0.00125 },
};

/**
 * Calculate cost for token usage.
 */
export function calculateTokenCost(
  modelId: string,
  tokensIn: number,
  tokensOut: number
): number {
  const costs = TOKEN_COST_PER_1K[modelId] || { input: 0.01, output: 0.03 };
  return (tokensIn / 1000) * costs.input + (tokensOut / 1000) * costs.output;
}

/**
 * Update run with token usage and cost.
 */
export function updateTokenUsage(
  run: AgentRun,
  tokensIn: number,
  tokensOut: number
): AgentRun {
  const cost = calculateTokenCost(run.modelId, tokensIn, tokensOut);

  return {
    ...run,
    totalTokensIn: run.totalTokensIn + tokensIn,
    totalTokensOut: run.totalTokensOut + tokensOut,
    totalCostUsd: run.totalCostUsd + cost,
  };
}

// =============================================================================
// Redaction
// =============================================================================

/**
 * Apply redaction to the run and record what was redacted.
 */
export function applyRedaction(
  run: AgentRun,
  redactionReport: RedactionReport
): AgentRun {
  return {
    ...run,
    redactionReport,
  };
}

// =============================================================================
// Run Storage Interface
// =============================================================================

export interface AgentRunStore {
  save(run: AgentRun): Promise<Result<AgentRun>>;
  get(runId: string): Promise<Result<AgentRun | null>>;
  getByRequestId(requestId: string): Promise<Result<AgentRun[]>>;
  getByInputsHash(inputsHash: string, tenantId: string): Promise<Result<AgentRun | null>>;
  list(options: {
    tenantId?: string;
    agentType?: AgentType;
    status?: AgentRunStatus;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<Result<AgentRun[]>>;
  count(options: {
    tenantId?: string;
    agentType?: AgentType;
    status?: AgentRunStatus;
    startDate?: Date;
    endDate?: Date;
  }): Promise<Result<number>>;
}

// =============================================================================
// In-Memory Store (for testing)
// =============================================================================

export class InMemoryAgentRunStore implements AgentRunStore {
  private runs: Map<string, AgentRun> = new Map();

  save(run: AgentRun): Promise<Result<AgentRun>> {
    this.runs.set(run.id, run);
    return Promise.resolve(Ok(run));
  }

  get(runId: string): Promise<Result<AgentRun | null>> {
    return Promise.resolve(Ok(this.runs.get(runId) || null));
  }

  getByRequestId(requestId: string): Promise<Result<AgentRun[]>> {
    const runs = Array.from(this.runs.values()).filter((r) => r.requestId === requestId);
    return Promise.resolve(Ok(runs));
  }

  getByInputsHash(inputsHash: string, tenantId: string): Promise<Result<AgentRun | null>> {
    const run = Array.from(this.runs.values()).find(
      (r) => r.inputsHash === inputsHash && r.tenantId === tenantId
    );
    return Promise.resolve(Ok(run || null));
  }

  list(options: {
    tenantId?: string;
    agentType?: AgentType;
    status?: AgentRunStatus;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<Result<AgentRun[]>> {
    let runs = Array.from(this.runs.values());

    if (options.tenantId) {
      runs = runs.filter((r) => r.tenantId === options.tenantId);
    }
    if (options.agentType) {
      runs = runs.filter((r) => r.agentType === options.agentType);
    }
    if (options.status) {
      runs = runs.filter((r) => r.status === options.status);
    }
    if (options.startDate) {
      runs = runs.filter((r) => r.startedAt >= options.startDate!);
    }
    if (options.endDate) {
      runs = runs.filter((r) => r.startedAt <= options.endDate!);
    }

    runs.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    const offset = options.offset || 0;
    const limit = options.limit || 100;
    return Promise.resolve(Ok(runs.slice(offset, offset + limit)));
  }

  async count(options: {
    tenantId?: string;
    agentType?: AgentType;
    status?: AgentRunStatus;
    startDate?: Date;
    endDate?: Date;
  }): Promise<Result<number>> {
    const listResult = await this.list(options);
    if (!listResult.ok) return listResult;
    return Ok(listResult.data.length);
  }

  clear(): void {
    this.runs.clear();
  }
}

// =============================================================================
// Agent Run Manager
// =============================================================================

export interface AgentRunManagerConfig {
  store: AgentRunStore;
  policyVersion: string;
}

export interface StartRunOptions {
  requestId: string;
  agentType: AgentType;
  modelId: string;
  tenantId: string;
  userId?: string;
  market?: string;
  inputs: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface CompleteRunOutcome {
  success: boolean;
  result?: unknown;
  error?: { message: string; code?: string };
  outputTokens?: number;
}

export interface AddToolCallParams {
  toolName: string;
  inputs: Record<string, unknown>;
}

export interface ApproveToolCallParams {
  policyVersion: string;
}

export interface CompleteToolCallParams {
  output: unknown;
  costUsd?: number;
}

export interface BlockToolCallParams {
  policyVersion: string;
  violations: Array<{
    ruleId: string;
    severity: 'warning' | 'critical' | 'fatal';
    message: string;
    timestamp: Date;
  }>;
}

export interface FailToolCallParams {
  error: Error;
}

export interface AddPromptParams {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tokenCount?: number;
}

/**
 * Manager class for agent run lifecycle.
 */
export class AgentRunManager {
  private config: AgentRunManagerConfig;
  private activeRuns: Map<string, AgentRun> = new Map();

  constructor(config: AgentRunManagerConfig) {
    this.config = config;
  }

  /**
   * Start a new agent run.
   */
  async startRun(options: StartRunOptions): Promise<Result<AgentRun>> {
    const run = createAgentRun({
      requestId: options.requestId,
      agentType: options.agentType,
      modelId: options.modelId,
      tenantId: options.tenantId,
      userId: options.userId,
      market: options.market,
      inputs: options.inputs,
      context: options.context,
      policyVersion: this.config.policyVersion,
    });

    const startResult = startRun(run);
    if (!startResult.ok) {
      return startResult;
    }

    const startedRun = startResult.data;
    this.activeRuns.set(startedRun.id, startedRun);

    const saveResult = await this.config.store.save(startedRun);
    if (!saveResult.ok) {
      return Err('SAVE_ERROR', 'Failed to save agent run');
    }

    return Ok(startedRun);
  }

  /**
   * Complete an agent run successfully.
   */
  async completeRun(runId: string, outcome: CompleteRunOutcome): Promise<Result<AgentRun>> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      const stored = await this.config.store.get(runId);
      if (!stored.ok || !stored.data) {
        return Err('NOT_FOUND', `Run ${runId} not found`);
      }
      this.activeRuns.set(runId, stored.data);
    }

    const activeRun = this.activeRuns.get(runId)!;

    // Update token usage if provided
    if (outcome.outputTokens) {
      activeRun.totalTokensOut += outcome.outputTokens;
      activeRun.totalCostUsd += calculateTokenCost(activeRun.modelId, 0, outcome.outputTokens);
    }

    const completeResult = completeRun(activeRun, {
      success: outcome.success,
      actionsTaken: [],
      entitiesAffected: [],
      summaryForHuman: outcome.success
        ? 'Run completed successfully'
        : `Run completed with errors: ${outcome.error?.message || 'Unknown error'}`,
    });

    if (!completeResult.ok) {
      return completeResult;
    }

    const completedRun = completeResult.data;
    Object.assign(activeRun, completedRun);

    await this.config.store.save(activeRun);
    this.activeRuns.delete(runId);

    return Ok(activeRun);
  }

  /**
   * Fail an agent run.
   */
  async failRun(runId: string, error: Error): Promise<Result<AgentRun>> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return Err('NOT_FOUND', `Run ${runId} not found`);
    }

    const failResult = failRun(run, error.message);
    if (!failResult.ok) {
      return failResult;
    }

    const failedRun = failResult.data;
    failedRun.outcome = {
      success: false,
      actionsTaken: [],
      entitiesAffected: [],
      summaryForHuman: `Agent run failed: ${error.message}`,
    };
    Object.assign(run, failedRun);

    await this.config.store.save(run);
    this.activeRuns.delete(runId);

    return Ok(run);
  }

  /**
   * Block a run due to policy violation.
   */
  async blockRun(runId: string, message: string): Promise<Result<AgentRun>> {
    const run = this.activeRuns.get(runId);
    if (!run) {
      return Err('NOT_FOUND', `Run ${runId} not found`);
    }

    const blockResult = blockRun(run, 'policy_violation', message);
    if (!blockResult.ok) {
      return blockResult;
    }

    Object.assign(run, blockResult.data);

    await this.config.store.save(run);
    this.activeRuns.delete(runId);

    return Ok(run);
  }

  /**
   * Add a tool call to the run.
   */
  addToolCall(run: AgentRun, params: AddToolCallParams): Result<ToolCall> {
    const toolCall = createToolCall(params.toolName, params.inputs);
    run.toolCalls.push(toolCall);
    return Ok(toolCall);
  }

  /**
   * Approve a tool call.
   */
  approveToolCall(run: AgentRun, toolCallId: string, _params: ApproveToolCallParams): Result<void> {
    const toolCall = run.toolCalls.find((tc) => tc.id === toolCallId);
    if (!toolCall) {
      return Err('NOT_FOUND', `Tool call ${toolCallId} not found`);
    }

    toolCall.status = 'approved';
    toolCall.startedAt = new Date();
    return Ok(undefined);
  }

  /**
   * Complete a tool call.
   */
  completeToolCall(run: AgentRun, toolCallId: string, params: CompleteToolCallParams): Result<void> {
    const toolCall = run.toolCalls.find((tc) => tc.id === toolCallId);
    if (!toolCall) {
      return Err('NOT_FOUND', `Tool call ${toolCallId} not found`);
    }

    toolCall.status = 'executed';
    toolCall.output = params.output;
    toolCall.completedAt = new Date();
    if (toolCall.startedAt) {
      toolCall.durationMs = toolCall.completedAt.getTime() - toolCall.startedAt.getTime();
    }
    if (params.costUsd) {
      toolCall.costUsd = params.costUsd;
      run.totalCostUsd += params.costUsd;
    }
    return Ok(undefined);
  }

  /**
   * Block a tool call.
   */
  blockToolCall(run: AgentRun, toolCallId: string, params: BlockToolCallParams): Result<void> {
    const toolCall = run.toolCalls.find((tc) => tc.id === toolCallId);
    if (!toolCall) {
      return Err('NOT_FOUND', `Tool call ${toolCallId} not found`);
    }

    toolCall.status = 'blocked';
    toolCall.policyCheckResult = {
      approved: false,
      violations: params.violations.map((v) => v.message),
      appliedRules: [params.policyVersion],
    };

    run.policyViolations.push(...params.violations);
    return Ok(undefined);
  }

  /**
   * Fail a tool call.
   */
  failToolCall(run: AgentRun, toolCallId: string, params: FailToolCallParams): Result<void> {
    const toolCall = run.toolCalls.find((tc) => tc.id === toolCallId);
    if (!toolCall) {
      return Err('NOT_FOUND', `Tool call ${toolCallId} not found`);
    }

    toolCall.status = 'failed';
    toolCall.error = params.error.message;
    toolCall.completedAt = new Date();
    if (toolCall.startedAt) {
      toolCall.durationMs = toolCall.completedAt.getTime() - toolCall.startedAt.getTime();
    }
    return Ok(undefined);
  }

  /**
   * Add a prompt to the run.
   */
  addPrompt(run: AgentRun, params: AddPromptParams): void {
    run.prompts.push({
      role: params.role,
      content: params.content,
      redacted: false,
      tokenCount: params.tokenCount,
    });

    if (params.role !== 'assistant' && params.tokenCount) {
      run.totalTokensIn += params.tokenCount;
    } else if (params.role === 'assistant' && params.tokenCount) {
      run.totalTokensOut += params.tokenCount;
    }
  }

  /**
   * Get a run by ID.
   */
  async getRun(runId: string): Promise<Result<AgentRun | null>> {
    const active = this.activeRuns.get(runId);
    if (active) {
      return Ok(active);
    }
    return this.config.store.get(runId);
  }
}
