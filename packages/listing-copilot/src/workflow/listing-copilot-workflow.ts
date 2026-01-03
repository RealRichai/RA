/**
 * Listing Copilot Workflow
 *
 * Main orchestrator that coordinates the full copilot workflow:
 * 1. Check kill switch and budget
 * 2. Generate optimized listing copy
 * 3. Run compliance gate
 * 4. Generate artifacts (flyer, brochure, deck)
 * 5. Simulate or publish to channels
 * 6. Emit evidence
 */

import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import type {
  CopilotInput,
  CopilotResult,
  CopilotStatus,
  OptimizedListingCopy,
  GeneratedArtifacts,
  ComplianceGateResult,
  ChannelSimulationResult,
  ChannelPostResult,
  CopilotEvidenceRecord,
} from '../types';
import {
  KillSwitchActiveError,
  BudgetExceededError,
  ComplianceBlockedError,
} from '../types';
import type { CopyGenerator } from '../generators/copy-generator';
import type { ArtifactOrchestrator } from '../generators/artifact-orchestrator';
import type { CopilotComplianceGate } from '../compliance/copilot-compliance-gate';
import type { ChannelSimulator, ListingWithArtifacts } from '../channels/channel-simulator';
import type { TemplateLoader } from '../templates/template-loader';
import type { CopilotEvidenceEmitter } from '../evidence/copilot-evidence';

// ============================================================================
// Types
// ============================================================================

export interface WorkflowDeps {
  copyGenerator: CopyGenerator;
  artifactOrchestrator: ArtifactOrchestrator;
  complianceGate: CopilotComplianceGate;
  channelSimulator: ChannelSimulator;
  templateLoader: TemplateLoader;
  evidenceEmitter: CopilotEvidenceEmitter;
  /**
   * Kill switch manager from @realriches/agent-governance
   */
  killSwitch?: {
    isActive: (scope: {
      global?: boolean;
      tenantId?: string;
      marketId?: string;
      agentType?: string;
    }) => Promise<boolean>;
  };
  /**
   * Budget service from @realriches/agent-plans
   */
  budgetService?: {
    checkBudget: (tenantId: string, tokensRequested: number) => Promise<boolean>;
    consumeBudget: (tenantId: string, tokensUsed: number) => Promise<void>;
  };
  /**
   * Agent run manager from @realriches/agent-governance
   */
  agentRunManager?: {
    createRun: (params: {
      agentType: string;
      tenantId: string;
      requestId: string;
      inputs: Record<string, unknown>;
    }) => Promise<{ id: string }>;
    completeRun: (runId: string, result: Record<string, unknown>) => Promise<void>;
    failRun: (runId: string, error: string) => Promise<void>;
  };
}

export interface WorkflowConfig {
  defaultDryRun: boolean;
  maxTokensPerCall: number;
}

// ============================================================================
// Workflow Class
// ============================================================================

export class ListingCopilotWorkflow {
  private deps: WorkflowDeps;
  private config: WorkflowConfig;

  constructor(deps: WorkflowDeps, config?: Partial<WorkflowConfig>) {
    this.deps = deps;
    this.config = {
      defaultDryRun: config?.defaultDryRun ?? true,
      maxTokensPerCall: config?.maxTokensPerCall ?? 4096,
    };
  }

  /**
   * Execute the full copilot workflow.
   */
  async execute(input: CopilotInput): Promise<CopilotResult> {
    const runId = randomUUID();
    const startTime = Date.now();
    const dryRun = input.options?.dryRun ?? this.config.defaultDryRun;
    const skipCompliance = input.options?.skipCompliance ?? false;

    // Reset evidence emitter for new run
    this.deps.evidenceEmitter.reset();

    // Create agent run record if manager is available
    let agentRunId: string | undefined;
    if (this.deps.agentRunManager) {
      const run = await this.deps.agentRunManager.createRun({
        agentType: 'listing_copilot',
        tenantId: input.tenantId,
        requestId: runId,
        inputs: {
          marketId: input.marketId,
          listingDraftHash: createHash('sha256')
            .update(JSON.stringify(input.listingDraft))
            .digest('hex')
            .substring(0, 16),
        },
      });
      agentRunId = run.id;
    }

    let status: CopilotStatus = 'running';
    let generatedCopy: OptimizedListingCopy | undefined;
    let artifacts: GeneratedArtifacts | undefined;
    let complianceResult: ComplianceGateResult | undefined;
    let channelResults: ChannelSimulationResult[] | ChannelPostResult[] | undefined;
    let error: string | undefined;
    let budgetConsumed = 0;

    try {
      // Step 1: Check kill switch
      await this.checkKillSwitch(input);
      this.deps.evidenceEmitter.recordToolUsage({
        tool: 'kill_switch_check',
        inputHash: createHash('sha256')
          .update(JSON.stringify({ tenantId: input.tenantId, marketId: input.marketId }))
          .digest('hex')
          .substring(0, 16),
        outputHash: 'passed',
        durationMs: Date.now() - startTime,
      });

      // Step 2: Check budget
      await this.checkBudget(input.tenantId, this.config.maxTokensPerCall);
      this.deps.evidenceEmitter.recordToolUsage({
        tool: 'budget_check',
        inputHash: input.tenantId.substring(0, 16),
        outputHash: 'passed',
        durationMs: 0,
      });

      // Step 3: Generate optimized copy
      const copyStartTime = Date.now();
      generatedCopy = await this.deps.copyGenerator.generate({
        listingDraft: input.listingDraft,
        propertyFacts: input.propertyFacts,
        marketId: input.marketId,
        tenantId: input.tenantId,
      });
      budgetConsumed = generatedCopy.tokensUsed;
      this.deps.evidenceEmitter.recordToolUsage({
        tool: 'copy_generator',
        inputHash: generatedCopy.promptHash,
        outputHash: createHash('sha256')
          .update(generatedCopy.title + generatedCopy.description)
          .digest('hex')
          .substring(0, 16),
        durationMs: Date.now() - copyStartTime,
      });

      // Consume budget
      if (this.deps.budgetService) {
        await this.deps.budgetService.consumeBudget(input.tenantId, budgetConsumed);
      }

      // Step 4: Run compliance gate (unless skipped)
      if (!skipCompliance) {
        const gateStartTime = Date.now();
        try {
          complianceResult = await this.deps.complianceGate.validate({
            listingDraft: input.listingDraft,
            optimizedCopy: generatedCopy,
            marketId: input.marketId,
            listingId: input.listingDraft.id,
            securityDeposit: input.propertyFacts.securityDeposit,
          });
          this.deps.evidenceEmitter.recordPolicyGate({
            gate: 'listing_publish',
            passed: true,
            violationCount: 0,
          });
        } catch (complianceError) {
          if (complianceError instanceof ComplianceBlockedError) {
            this.deps.evidenceEmitter.recordPolicyGate({
              gate: 'listing_publish',
              passed: false,
              violationCount: complianceError.violations.length,
            });

            // Build blocked result
            status = 'blocked';
            const evidence = this.deps.evidenceEmitter.buildRecord({
              runId,
              tenantId: input.tenantId,
              listingId: input.listingDraft.id,
              promptHash: generatedCopy.promptHash,
              budgetConsumed,
              status,
            });

            await this.deps.evidenceEmitter.emit(evidence);

            if (agentRunId && this.deps.agentRunManager) {
              await this.deps.agentRunManager.failRun(
                agentRunId,
                `Compliance blocked: ${complianceError.message}`
              );
            }

            return {
              runId,
              status: 'blocked',
              generatedCopy,
              complianceResult: {
                passed: false,
                violations: complianceError.violations,
                marketPack: 'unknown',
                marketPackVersion: 'unknown',
                checksPerformed: [],
                gatedAt: new Date(),
              },
              evidence,
              error: complianceError.message,
              completedAt: new Date(),
            };
          }
          throw complianceError;
        }
        this.deps.evidenceEmitter.recordToolUsage({
          tool: 'compliance_gate',
          inputHash: createHash('sha256')
            .update(JSON.stringify(input.listingDraft))
            .digest('hex')
            .substring(0, 16),
          outputHash: 'passed',
          durationMs: Date.now() - gateStartTime,
        });
      }

      // Step 5: Load templates
      const flyerTemplate = await this.deps.templateLoader.load(
        input.templateOverrides?.flyerTemplateId,
        'flyer',
        input.tenantId
      );
      const brochureTemplate = await this.deps.templateLoader.load(
        input.templateOverrides?.brochureTemplateId,
        'brochure',
        input.tenantId
      );
      const deckTemplate = await this.deps.templateLoader.load(
        input.templateOverrides?.deckTemplateId,
        'broker_deck',
        input.tenantId
      );

      // Step 6: Generate artifacts
      const artifactStartTime = Date.now();
      artifacts = await this.deps.artifactOrchestrator.generateAll({
        listingDraft: input.listingDraft,
        propertyFacts: input.propertyFacts,
        optimizedCopy: generatedCopy,
        marketId: input.marketId,
        tenantId: input.tenantId,
        templates: {
          flyer: flyerTemplate.content,
          brochure: brochureTemplate.content,
          deck: deckTemplate.content,
        },
      });

      // Record artifact evidence IDs
      if (artifacts.flyerPdf?.evidenceId) {
        this.deps.evidenceEmitter.addArtifactEvidenceId(artifacts.flyerPdf.evidenceId);
      }
      if (artifacts.brochurePdf?.evidenceId) {
        this.deps.evidenceEmitter.addArtifactEvidenceId(artifacts.brochurePdf.evidenceId);
      }
      if (artifacts.brokerDeckPptx?.evidenceId) {
        this.deps.evidenceEmitter.addArtifactEvidenceId(artifacts.brokerDeckPptx.evidenceId);
      }

      this.deps.evidenceEmitter.recordToolUsage({
        tool: 'artifact_orchestrator',
        inputHash: createHash('sha256')
          .update(JSON.stringify(input.listingDraft))
          .digest('hex')
          .substring(0, 16),
        outputHash: createHash('sha256')
          .update(
            (artifacts.flyerPdf?.checksum ?? '') +
            (artifacts.brochurePdf?.checksum ?? '') +
            (artifacts.brokerDeckPptx?.checksum ?? '')
          )
          .digest('hex')
          .substring(0, 16),
        durationMs: Date.now() - artifactStartTime,
      });

      // Step 7: Channel simulation/publishing
      const channels = input.options?.channels ?? [];
      channelResults = []; // Initialize to empty array
      if (channels.length > 0) {
        const listingWithArtifacts: ListingWithArtifacts = {
          listingId: input.listingDraft.id ?? runId,
          listingDraft: input.listingDraft,
          optimizedCopy: generatedCopy,
          artifacts,
          marketId: input.marketId,
        };

        const channelStartTime = Date.now();
        if (dryRun) {
          channelResults = await this.deps.channelSimulator.simulate(
            listingWithArtifacts,
            channels
          );
        } else {
          channelResults = await this.deps.channelSimulator.publish(
            listingWithArtifacts,
            channels
          );
        }

        this.deps.evidenceEmitter.recordToolUsage({
          tool: dryRun ? 'channel_simulator' : 'channel_publisher',
          inputHash: createHash('sha256')
            .update(channels.join(','))
            .digest('hex')
            .substring(0, 16),
          outputHash: createHash('sha256')
            .update(JSON.stringify(channelResults.map((r) => r.channel)))
            .digest('hex')
            .substring(0, 16),
          durationMs: Date.now() - channelStartTime,
        });
      }

      status = 'completed';
    } catch (err) {
      status = 'failed';
      error = err instanceof Error ? err.message : 'Unknown error';

      if (agentRunId && this.deps.agentRunManager) {
        await this.deps.agentRunManager.failRun(agentRunId, error);
      }
    }

    // Build and emit evidence
    const evidence = this.deps.evidenceEmitter.buildRecord({
      runId,
      tenantId: input.tenantId,
      listingId: input.listingDraft.id,
      promptHash: generatedCopy?.promptHash ?? 'none',
      budgetConsumed,
      status,
    });

    await this.deps.evidenceEmitter.emit(evidence);

    // Complete agent run
    if (agentRunId && this.deps.agentRunManager && status === 'completed') {
      await this.deps.agentRunManager.completeRun(agentRunId, {
        status,
        artifactCount: Object.keys(artifacts ?? {}).length,
        tokensUsed: budgetConsumed,
      });
    }

    return {
      runId,
      status,
      generatedCopy,
      artifacts,
      complianceResult,
      channelResults,
      evidence,
      error,
      completedAt: new Date(),
    };
  }

  /**
   * Check if kill switch is active for this request.
   */
  private async checkKillSwitch(input: CopilotInput): Promise<void> {
    if (!this.deps.killSwitch) {
      return;
    }

    // Check global kill switch
    if (await this.deps.killSwitch.isActive({ global: true })) {
      throw new KillSwitchActiveError('Global kill switch is active');
    }

    // Check tenant kill switch
    if (await this.deps.killSwitch.isActive({ tenantId: input.tenantId })) {
      throw new KillSwitchActiveError(`Kill switch active for tenant ${input.tenantId}`);
    }

    // Check market kill switch
    if (await this.deps.killSwitch.isActive({ marketId: input.marketId })) {
      throw new KillSwitchActiveError(`Kill switch active for market ${input.marketId}`);
    }

    // Check agent type kill switch
    if (await this.deps.killSwitch.isActive({ agentType: 'listing_copilot' })) {
      throw new KillSwitchActiveError('Kill switch active for listing_copilot agent');
    }
  }

  /**
   * Check if budget allows the request.
   */
  private async checkBudget(tenantId: string, tokensRequested: number): Promise<void> {
    if (!this.deps.budgetService) {
      return;
    }

    const hasbudget = await this.deps.budgetService.checkBudget(tenantId, tokensRequested);
    if (!hasbudget) {
      throw new BudgetExceededError(`Budget exceeded for tenant ${tenantId}`);
    }
  }
}
