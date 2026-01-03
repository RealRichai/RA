/**
 * Copilot Evidence Emitter
 *
 * Records evidence for audit trail without PII.
 * Uses SOC2 control IDs for compliance.
 */

import type {
  CopilotEvidenceRecord,
  ToolUsageEntry,
  PolicyGateResult,
} from '../types';

// ============================================================================
// Types
// ============================================================================

export interface EvidenceEmitterDeps {
  /**
   * Evidence service for SOC2 logging
   */
  evidenceService?: {
    emit: (record: {
      controlId: string;
      action: string;
      entityType: string;
      entityId: string;
      details: Record<string, unknown>;
      timestamp: Date;
    }) => Promise<{ evidenceId: string }>;
  };
}

export interface EvidenceEmitterConfig {
  enabled: boolean;
  controlId: string;
}

// ============================================================================
// Evidence Emitter Class
// ============================================================================

export class CopilotEvidenceEmitter {
  private deps: EvidenceEmitterDeps;
  private config: EvidenceEmitterConfig;
  private toolUsage: ToolUsageEntry[] = [];
  private policyGateResults: PolicyGateResult[] = [];
  private artifactEvidenceIds: string[] = [];

  constructor(deps: EvidenceEmitterDeps = {}, config?: Partial<EvidenceEmitterConfig>) {
    this.deps = deps;
    this.config = {
      enabled: config?.enabled ?? true,
      controlId: config?.controlId ?? 'CC7.3',
    };
  }

  /**
   * Record tool usage for the evidence trail.
   */
  recordToolUsage(entry: Omit<ToolUsageEntry, 'timestamp'>): void {
    this.toolUsage.push({
      ...entry,
      timestamp: new Date(),
    });
  }

  /**
   * Record policy gate result.
   */
  recordPolicyGate(result: Omit<PolicyGateResult, 'timestamp'>): void {
    this.policyGateResults.push({
      ...result,
      timestamp: new Date(),
    });
  }

  /**
   * Add artifact evidence ID.
   */
  addArtifactEvidenceId(evidenceId: string): void {
    if (evidenceId) {
      this.artifactEvidenceIds.push(evidenceId);
    }
  }

  /**
   * Build the final evidence record.
   */
  buildRecord(params: {
    runId: string;
    tenantId: string;
    listingId?: string;
    promptHash: string;
    budgetConsumed: number;
    status: 'completed' | 'blocked' | 'failed';
  }): CopilotEvidenceRecord {
    return {
      runId: params.runId,
      tenantId: params.tenantId,
      listingId: params.listingId,
      promptHash: params.promptHash,
      toolUsage: [...this.toolUsage],
      policyGateResults: [...this.policyGateResults],
      artifactEvidenceIds: [...this.artifactEvidenceIds],
      budgetConsumed: params.budgetConsumed,
      status: params.status,
      timestamp: new Date(),
    };
  }

  /**
   * Emit the evidence record to the audit trail.
   * Uses fire-and-forget via setImmediate to avoid blocking.
   */
  async emit(record: CopilotEvidenceRecord): Promise<string | undefined> {
    if (!this.config.enabled || !this.deps.evidenceService) {
      return undefined;
    }

    // Sanitize PII from details
    const sanitizedDetails = this.sanitizeForAudit(record);

    return new Promise((resolve) => {
      setImmediate(() => {
        void (async () => {
          try {
            const result = await this.deps.evidenceService!.emit({
              controlId: this.config.controlId,
              action: 'copilot_workflow_execution',
              entityType: 'copilot_run',
              entityId: record.runId,
              details: sanitizedDetails,
              timestamp: record.timestamp,
            });
            resolve(result.evidenceId);
          } catch (error) {
            // Log but don't fail - evidence is non-blocking
            // eslint-disable-next-line no-console
            console.error('[CopilotEvidence] Failed to emit:', error);
            resolve(undefined);
          }
        })();
      });
    });
  }

  /**
   * Emit and return evidence synchronously (for critical paths).
   */
  async emitSync(record: CopilotEvidenceRecord): Promise<string | undefined> {
    if (!this.config.enabled || !this.deps.evidenceService) {
      return undefined;
    }

    const sanitizedDetails = this.sanitizeForAudit(record);

    try {
      const result = await this.deps.evidenceService.emit({
        controlId: this.config.controlId,
        action: 'copilot_workflow_execution',
        entityType: 'copilot_run',
        entityId: record.runId,
        details: sanitizedDetails,
        timestamp: record.timestamp,
      });
      return result.evidenceId;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[CopilotEvidence] Failed to emit:', error);
      return undefined;
    }
  }

  /**
   * Reset the emitter for a new run.
   */
  reset(): void {
    this.toolUsage = [];
    this.policyGateResults = [];
    this.artifactEvidenceIds = [];
  }

  /**
   * Sanitize record for audit trail (remove PII).
   */
  private sanitizeForAudit(record: CopilotEvidenceRecord): Record<string, unknown> {
    return {
      runId: record.runId,
      // Don't include tenantId in details - it's in the entity context
      promptHash: record.promptHash,
      toolCount: record.toolUsage.length,
      tools: record.toolUsage.map((t) => t.tool),
      policyGatesChecked: record.policyGateResults.length,
      policyGatesPassed: record.policyGateResults.filter((p) => p.passed).length,
      policyGatesFailed: record.policyGateResults.filter((p) => !p.passed).length,
      artifactCount: record.artifactEvidenceIds.length,
      budgetConsumed: record.budgetConsumed,
      status: record.status,
      // Include artifact evidence IDs for cross-reference
      artifactEvidenceIds: record.artifactEvidenceIds,
    };
  }
}
