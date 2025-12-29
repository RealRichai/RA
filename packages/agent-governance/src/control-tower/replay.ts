/**
 * Agent Run Replay/Debug View
 *
 * Provides redacted replay of agent runs for debugging and auditing.
 */

import type { AgentRunStore } from '../runtime/agent-run';
import { redactAgentRun } from '../runtime/redaction';
import type { AgentRun, Result } from '../types';
import { Ok, Err } from '../types';

// =============================================================================
// Replay View Types
// =============================================================================

export interface ReplayStep {
  stepNumber: number;
  type: 'prompt' | 'tool_call' | 'tool_result' | 'outcome';
  timestamp: Date;
  duration?: number;
  content: unknown;
  redacted: boolean;
  metadata?: Record<string, unknown>;
}

export interface ReplayView {
  runId: string;
  requestId: string;
  agentType: string;
  status: string;
  tenantId: string;
  market?: string;
  startedAt: Date;
  completedAt?: Date;
  totalDurationMs?: number;
  totalCostUsd: number;
  policyVersion: string;
  steps: ReplayStep[];
  policyViolations: Array<{
    ruleId: string;
    severity: string;
    message: string;
    timestamp: Date;
  }>;
  summary: {
    promptCount: number;
    toolCallCount: number;
    blockedToolCalls: number;
    totalTokensIn: number;
    totalTokensOut: number;
  };
  redactionApplied: boolean;
  redactedBy?: string;
}

// =============================================================================
// Replay Service
// =============================================================================

export interface ReplayServiceConfig {
  runStore: AgentRunStore;
  alwaysRedact?: boolean;
  redactorId?: string;
}

export class ReplayService {
  private config: ReplayServiceConfig;

  constructor(config: ReplayServiceConfig) {
    this.config = {
      alwaysRedact: true,
      redactorId: 'system',
      ...config,
    };
  }

  /**
   * Get a replay view of an agent run.
   */
  async getReplay(
    runId: string,
    options?: {
      redact?: boolean;
      redactedBy?: string;
    }
  ): Promise<Result<ReplayView>> {
    const runResult = await this.config.runStore.get(runId);

    if (!runResult.ok) {
      return Err('FETCH_ERROR', 'Failed to fetch run');
    }

    if (!runResult.data) {
      return Err('NOT_FOUND', `Run ${runId} not found`);
    }

    const shouldRedact = options?.redact ?? this.config.alwaysRedact;
    const redactedBy = options?.redactedBy || this.config.redactorId || 'system';

    let run = runResult.data;
    let redactionApplied = false;

    if (shouldRedact) {
      const { redactedRun } = redactAgentRun(run, redactedBy);
      run = redactedRun;
      redactionApplied = true;
    }

    const steps = this.buildReplaySteps(run);
    const summary = this.buildSummary(run);

    return Ok({
      runId: run.id,
      requestId: run.requestId,
      agentType: run.agentType,
      status: run.status,
      tenantId: run.tenantId,
      market: run.market,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      totalDurationMs: run.durationMs,
      totalCostUsd: run.totalCostUsd,
      policyVersion: run.policyVersion,
      steps,
      policyViolations: run.policyViolations.map((v) => ({
        ruleId: v.ruleId,
        severity: v.severity,
        message: v.message,
        timestamp: v.timestamp,
      })),
      summary,
      redactionApplied,
      redactedBy: redactionApplied ? redactedBy : undefined,
    });
  }

  /**
   * Get replay by request ID (for distributed tracing).
   */
  async getReplaysByRequestId(
    requestId: string,
    options?: {
      redact?: boolean;
      redactedBy?: string;
    }
  ): Promise<Result<ReplayView[]>> {
    const runsResult = await this.config.runStore.getByRequestId(requestId);

    if (!runsResult.ok) {
      return Err('FETCH_ERROR', 'Failed to fetch runs');
    }

    const replays: ReplayView[] = [];

    for (const run of runsResult.data) {
      const replayResult = await this.getReplay(run.id, options);
      if (replayResult.ok) {
        replays.push(replayResult.data);
      }
    }

    return Ok(replays);
  }

  /**
   * Compare two runs side by side.
   */
  async compareRuns(
    runId1: string,
    runId2: string,
    options?: { redact?: boolean }
  ): Promise<Result<{
    run1: ReplayView;
    run2: ReplayView;
    differences: Array<{
      field: string;
      run1Value: unknown;
      run2Value: unknown;
    }>;
  }>> {
    const [replay1, replay2] = await Promise.all([
      this.getReplay(runId1, options),
      this.getReplay(runId2, options),
    ]);

    if (!replay1.ok) {
      return Err('RUN1_ERROR', `Failed to get run 1: ${replay1.error.message}`);
    }

    if (!replay2.ok) {
      return Err('RUN2_ERROR', `Failed to get run 2: ${replay2.error.message}`);
    }

    const differences = this.findDifferences(replay1.data, replay2.data);

    return Ok({
      run1: replay1.data,
      run2: replay2.data,
      differences,
    });
  }

  /**
   * Build replay steps from a run.
   */
  private buildReplaySteps(run: AgentRun): ReplayStep[] {
    const steps: ReplayStep[] = [];
    let stepNumber = 0;

    // Interleave prompts and tool calls by approximate timestamp
    const events: Array<{
      timestamp: Date;
      type: ReplayStep['type'];
      data: unknown;
      redacted?: boolean;
    }> = [];

    // Add prompts
    let promptTime = run.startedAt;
    for (const prompt of run.prompts) {
      events.push({
        timestamp: promptTime,
        type: 'prompt',
        data: {
          role: prompt.role,
          content: prompt.content,
          tokenCount: prompt.tokenCount,
        },
        redacted: prompt.redacted,
      });
      // Increment time slightly for ordering
      promptTime = new Date(promptTime.getTime() + 1);
    }

    // Add tool calls and results
    for (const toolCall of run.toolCalls) {
      // Tool call request
      if (toolCall.startedAt) {
        events.push({
          timestamp: toolCall.startedAt,
          type: 'tool_call',
          data: {
            id: toolCall.id,
            toolName: toolCall.toolName,
            inputs: toolCall.inputs,
            status: toolCall.status,
            policyCheckResult: toolCall.policyCheckResult,
          },
          redacted: false,
        });
      }

      // Tool result
      if (toolCall.completedAt) {
        events.push({
          timestamp: toolCall.completedAt,
          type: 'tool_result',
          data: {
            id: toolCall.id,
            toolName: toolCall.toolName,
            output: toolCall.output,
            error: toolCall.error,
            durationMs: toolCall.durationMs,
            costUsd: toolCall.costUsd,
          },
          redacted: false,
        });
      }
    }

    // Add outcome
    if (run.outcome && run.completedAt) {
      events.push({
        timestamp: run.completedAt,
        type: 'outcome',
        data: run.outcome,
        redacted: false,
      });
    }

    // Sort by timestamp
    events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Build steps
    let prevTimestamp = run.startedAt;
    for (const event of events) {
      stepNumber++;
      steps.push({
        stepNumber,
        type: event.type,
        timestamp: event.timestamp,
        duration: event.timestamp.getTime() - prevTimestamp.getTime(),
        content: event.data,
        redacted: event.redacted || false,
      });
      prevTimestamp = event.timestamp;
    }

    return steps;
  }

  /**
   * Build summary from a run.
   */
  private buildSummary(run: AgentRun): ReplayView['summary'] {
    return {
      promptCount: run.prompts.length,
      toolCallCount: run.toolCalls.length,
      blockedToolCalls: run.toolCalls.filter((tc) => tc.status === 'blocked').length,
      totalTokensIn: run.totalTokensIn,
      totalTokensOut: run.totalTokensOut,
    };
  }

  /**
   * Find differences between two replay views.
   */
  private findDifferences(
    run1: ReplayView,
    run2: ReplayView
  ): Array<{ field: string; run1Value: unknown; run2Value: unknown }> {
    const differences: Array<{ field: string; run1Value: unknown; run2Value: unknown }> = [];

    const fieldsToCompare: Array<keyof ReplayView> = [
      'agentType',
      'status',
      'policyVersion',
      'totalCostUsd',
    ];

    for (const field of fieldsToCompare) {
      if (run1[field] !== run2[field]) {
        differences.push({
          field,
          run1Value: run1[field],
          run2Value: run2[field],
        });
      }
    }

    // Compare step counts
    if (run1.steps.length !== run2.steps.length) {
      differences.push({
        field: 'stepCount',
        run1Value: run1.steps.length,
        run2Value: run2.steps.length,
      });
    }

    // Compare tool call counts
    if (run1.summary.toolCallCount !== run2.summary.toolCallCount) {
      differences.push({
        field: 'toolCallCount',
        run1Value: run1.summary.toolCallCount,
        run2Value: run2.summary.toolCallCount,
      });
    }

    // Compare violation counts
    if (run1.policyViolations.length !== run2.policyViolations.length) {
      differences.push({
        field: 'violationCount',
        run1Value: run1.policyViolations.length,
        run2Value: run2.policyViolations.length,
      });
    }

    return differences;
  }
}

// =============================================================================
// Export Helper
// =============================================================================

/**
 * Export replay as JSON for external analysis.
 */
export function exportReplayAsJson(replay: ReplayView): string {
  return JSON.stringify(replay, null, 2);
}

/**
 * Export replay as markdown for documentation.
 */
export function exportReplayAsMarkdown(replay: ReplayView): string {
  const lines: string[] = [];

  lines.push(`# Agent Run Replay: ${replay.runId}`);
  lines.push('');
  lines.push('## Metadata');
  lines.push(`- **Agent Type:** ${replay.agentType}`);
  lines.push(`- **Status:** ${replay.status}`);
  lines.push(`- **Started:** ${replay.startedAt.toISOString()}`);
  if (replay.completedAt) {
    lines.push(`- **Completed:** ${replay.completedAt.toISOString()}`);
  }
  if (replay.totalDurationMs) {
    lines.push(`- **Duration:** ${replay.totalDurationMs}ms`);
  }
  lines.push(`- **Cost:** $${replay.totalCostUsd.toFixed(4)}`);
  lines.push(`- **Policy Version:** ${replay.policyVersion}`);
  if (replay.redactionApplied) {
    lines.push(`- **Redacted By:** ${replay.redactedBy}`);
  }
  lines.push('');

  lines.push('## Summary');
  lines.push(`- Prompts: ${replay.summary.promptCount}`);
  lines.push(`- Tool Calls: ${replay.summary.toolCallCount} (${replay.summary.blockedToolCalls} blocked)`);
  lines.push(`- Tokens In: ${replay.summary.totalTokensIn}`);
  lines.push(`- Tokens Out: ${replay.summary.totalTokensOut}`);
  lines.push('');

  if (replay.policyViolations.length > 0) {
    lines.push('## Policy Violations');
    for (const v of replay.policyViolations) {
      lines.push(`- **[${v.severity}]** ${v.ruleId}: ${v.message}`);
    }
    lines.push('');
  }

  lines.push('## Steps');
  for (const step of replay.steps) {
    lines.push(`### Step ${step.stepNumber}: ${step.type}`);
    lines.push(`*${step.timestamp.toISOString()}* (${step.duration}ms)`);
    if (step.redacted) {
      lines.push('*[Content Redacted]*');
    } else {
      lines.push('```json');
      lines.push(JSON.stringify(step.content, null, 2));
      lines.push('```');
    }
    lines.push('');
  }

  return lines.join('\n');
}
