/**
 * Listing Ops Agent Service
 *
 * AI agent for managing listing drafts with compliance pre-checks.
 * Can create and update drafts but CANNOT publish - requires human approval.
 */

import { createHash, randomUUID } from 'crypto';

import { getKillSwitchManager } from '../../control-tower/kill-switch';
import { getPolicyGate } from '../../policy/gate';
import type { AgentRunStore } from '../../runtime/agent-run';
import type { Result, AgentType, AgentRun, AgentRunStatus } from '../../types';
import { Ok, Err } from '../../types';

// =============================================================================
// Types
// =============================================================================

export interface ListingDraftInput {
  title: string;
  description: string;
  propertyId: string;
  unitId?: string;
  priceAmount: number;
  rent?: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet?: number;
  address: {
    street1: string;
    street2?: string;
    city: string;
    state: string;
    postalCode: string;
  };
  availableDate: Date;
  leaseTerm: string;
  amenities?: string[];
  petPolicy?: { allowed: boolean; deposit?: number; restrictions?: string[] };
  photos?: string[];
  market: string;
}

export interface ListingDraftUpdate {
  title?: string;
  description?: string;
  priceAmount?: number;
  rent?: number;
  bedrooms?: number;
  bathrooms?: number;
  squareFeet?: number;
  availableDate?: Date;
  leaseTerm?: string;
  amenities?: string[];
  petPolicy?: { allowed: boolean; deposit?: number; restrictions?: string[] };
  photos?: string[];
}

export interface CompliancePreCheckResult {
  passed: boolean;
  violations: ComplianceViolation[];
  warnings: ComplianceWarning[];
  blockingIssues: string[];
  requiresHumanReview: boolean;
  marketPackId: string;
  checkedAt: Date;
}

export interface ComplianceViolation {
  ruleId: string;
  severity: 'error' | 'critical';
  message: string;
  field?: string;
  suggestedFix?: string;
}

export interface ComplianceWarning {
  ruleId: string;
  message: string;
  field?: string;
}

export interface ListingOpsResult {
  listingId: string;
  action: 'created' | 'updated';
  status: 'draft';
  complianceCheck: CompliancePreCheckResult;
  agentRunId: string;
  modifications: ModificationRecord[];
}

export interface ModificationRecord {
  field: string;
  previousValue: unknown;
  newValue: unknown;
  reason: string;
}

export interface ListingOpsContext {
  tenantId: string;
  userId?: string;
  agentRunId?: string;
  requestId?: string;
  market: string;
}

// =============================================================================
// Service Configuration
// =============================================================================

export interface ListingOpsServiceConfig {
  runStore: AgentRunStore;
  /** Database adapter for listing operations */
  db: ListingDatabaseAdapter;
  /** Model ID for the AI agent */
  modelId?: string;
  /** Policy version */
  policyVersion?: string;
}

export interface ListingDatabaseAdapter {
  createDraft(input: ListingDraftInput, tenantId: string, agentRunId: string): Promise<{
    id: string;
    status: string;
  }>;

  updateDraft(
    listingId: string,
    updates: ListingDraftUpdate,
    tenantId: string,
    agentRunId: string
  ): Promise<{
    id: string;
    status: string;
  }>;

  getListing(listingId: string, tenantId: string): Promise<{
    id: string;
    status: string;
    market: string;
    [key: string]: unknown;
  } | null>;

  recordModification(
    listingId: string,
    agentRunId: string,
    field: string,
    previousValue: unknown,
    newValue: unknown,
    reason: string
  ): Promise<void>;
}

// =============================================================================
// Listing Ops Agent Service
// =============================================================================

export class ListingOpsAgentService {
  private readonly config: ListingOpsServiceConfig;
  private readonly agentType: AgentType = 'listing_ops';

  constructor(config: ListingOpsServiceConfig) {
    this.config = config;
  }

  /**
   * Create a new listing draft with compliance pre-check.
   * Creates draft even with warnings, but records all issues.
   */
  async createDraft(
    input: ListingDraftInput,
    context: ListingOpsContext
  ): Promise<Result<ListingOpsResult>> {
    const requestId = context.requestId || `req_${randomUUID()}`;

    // 1. Check kill switch
    const killSwitch = getKillSwitchManager();
    if (this.isKillSwitchActive(killSwitch, context)) {
      return Err('AGENT_DISABLED', 'Listing ops agent is currently disabled by kill switch');
    }

    // 2. Start agent run tracking
    const runResult = await this.startAgentRun({
      agentType: this.agentType,
      tenantId: context.tenantId,
      inputs: { action: 'createDraft', input },
      policyVersion: this.config.policyVersion || '1.0.0',
      modelId: this.config.modelId || 'gpt-4',
      requestId,
      userId: context.userId,
      market: context.market,
    });

    if (!runResult.ok) {
      return Err('RUN_START_FAILED', runResult.error.message);
    }

    const agentRunId = runResult.data;

    try {
      // 3. Policy gate check
      const policyGate = getPolicyGate();
      const policyResult = await policyGate.checkToolCall(
        { toolName: 'listing:draft:create', inputs: { ...input } },
        { agentType: this.agentType, tenantId: context.tenantId, market: context.market }
      );

      if (!policyResult.allowed) {
        await this.completeAgentRun(agentRunId, false, 'Policy check failed');
        const violation = policyResult.violations[0];
        return Err('POLICY_BLOCKED', violation?.message || 'Action blocked by policy');
      }

      // 4. Run compliance pre-check
      const complianceCheck = this.runCompliancePreCheck(input, context.market);

      // 5. Create draft (even with warnings)
      const listing = await this.config.db.createDraft(input, context.tenantId, agentRunId);

      // 6. Record all field modifications as evidence
      const modifications: ModificationRecord[] = [];
      for (const [field, value] of Object.entries(input)) {
        if (value !== undefined) {
          modifications.push({
            field,
            previousValue: null,
            newValue: value,
            reason: 'Initial draft creation',
          });

          await this.config.db.recordModification(
            listing.id,
            agentRunId,
            field,
            null,
            value,
            'Initial draft creation'
          );
        }
      }

      // 7. Complete run
      await this.completeAgentRun(agentRunId, true);

      return Ok({
        listingId: listing.id,
        action: 'created',
        status: 'draft',
        complianceCheck,
        agentRunId,
        modifications,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.completeAgentRun(agentRunId, false, message);
      return Err('CREATE_FAILED', message);
    }
  }

  /**
   * Update an existing listing draft.
   * Verifies listing is in draft status before allowing updates.
   */
  async updateDraft(
    listingId: string,
    updates: ListingDraftUpdate,
    context: ListingOpsContext
  ): Promise<Result<ListingOpsResult>> {
    const requestId = context.requestId || `req_${randomUUID()}`;

    // 1. Check kill switch
    const killSwitch = getKillSwitchManager();
    if (this.isKillSwitchActive(killSwitch, context)) {
      return Err('AGENT_DISABLED', 'Listing ops agent is currently disabled');
    }

    // 2. Verify listing exists and is draft
    const existing = await this.config.db.getListing(listingId, context.tenantId);
    if (!existing) {
      return Err('NOT_FOUND', `Listing ${listingId} not found`);
    }

    if (existing.status !== 'draft') {
      return Err(
        'INVALID_STATUS',
        `Cannot modify listing in status "${existing.status}". Only drafts can be modified by agents.`
      );
    }

    // 3. Start agent run
    const runResult = await this.startAgentRun({
      agentType: this.agentType,
      tenantId: context.tenantId,
      inputs: { action: 'updateDraft', listingId, updates },
      policyVersion: this.config.policyVersion || '1.0.0',
      modelId: this.config.modelId || 'gpt-4',
      requestId,
      userId: context.userId,
      market: context.market,
    });

    if (!runResult.ok) {
      return Err('RUN_START_FAILED', runResult.error.message);
    }

    const agentRunId = runResult.data;

    try {
      // 4. Policy gate check
      const policyGate = getPolicyGate();
      const policyResult = await policyGate.checkToolCall(
        { toolName: 'listing:draft:update', inputs: { listingId, ...updates } },
        { agentType: this.agentType, tenantId: context.tenantId, market: context.market }
      );

      if (!policyResult.allowed) {
        await this.completeAgentRun(agentRunId, false, 'Policy denied');
        return Err('POLICY_DENIED', 'Update denied by policy');
      }

      // 5. Update draft
      const listing = await this.config.db.updateDraft(
        listingId,
        updates,
        context.tenantId,
        agentRunId
      );

      // 6. Record modifications
      const modifications: ModificationRecord[] = [];
      for (const [field, newValue] of Object.entries(updates)) {
        if (newValue !== undefined) {
          const previousValue = existing[field];
          modifications.push({
            field,
            previousValue,
            newValue,
            reason: 'Draft update by listing ops agent',
          });

          await this.config.db.recordModification(
            listingId,
            agentRunId,
            field,
            previousValue,
            newValue,
            'Draft update by listing ops agent'
          );
        }
      }

      // 7. Re-run compliance pre-check with updated data
      const mergedInput: ListingDraftInput = {
        ...(existing as unknown as ListingDraftInput),
        ...updates,
      };
      const complianceCheck = this.runCompliancePreCheck(mergedInput, context.market);

      // 8. Complete run
      await this.completeAgentRun(agentRunId, true);

      return Ok({
        listingId: listing.id,
        action: 'updated',
        status: 'draft',
        complianceCheck,
        agentRunId,
        modifications,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.completeAgentRun(agentRunId, false, message);
      return Err('UPDATE_FAILED', message);
    }
  }

  /**
   * Run compliance pre-check for a listing.
   * Does NOT modify the listing, only checks for issues.
   */
  runCompliancePreCheck(
    input: ListingDraftInput,
    market: string
  ): CompliancePreCheckResult {
    const violations: ComplianceViolation[] = [];
    const warnings: ComplianceWarning[] = [];
    const blockingIssues: string[] = [];

    // Check for required fields
    if (!input.title || input.title.length < 10) {
      violations.push({
        ruleId: 'TITLE_TOO_SHORT',
        severity: 'error',
        message: 'Title must be at least 10 characters',
        field: 'title',
        suggestedFix: 'Add more detail to the title',
      });
    }

    if (!input.description || input.description.length < 50) {
      warnings.push({
        ruleId: 'DESCRIPTION_SHORT',
        message: 'Description should be at least 50 characters for better visibility',
        field: 'description',
      });
    }

    // Check for discriminatory language patterns
    const discriminatoryPatterns = [
      /\b(no children|adults only|no families)\b/i,
      /\b(christian only|muslim only|jewish only)\b/i,
      /\b(no wheelchairs|must walk stairs)\b/i,
      /\b(ideal for (single|young|mature))\b/i,
    ];

    for (const pattern of discriminatoryPatterns) {
      if (pattern.test(input.description) || pattern.test(input.title)) {
        violations.push({
          ruleId: 'FAIR_HOUSING_VIOLATION',
          severity: 'critical',
          message: 'Potentially discriminatory language detected',
          field: 'description',
          suggestedFix: 'Remove any language that could be considered discriminatory',
        });
        blockingIssues.push('Fair housing violation detected');
      }
    }

    // Market-specific checks
    if (market.startsWith('NYC') || market === 'NYC_STRICT') {
      // NYC FARE Act compliance
      if (!input.rent && !input.priceAmount) {
        violations.push({
          ruleId: 'NYC_FARE_MISSING_PRICE',
          severity: 'error',
          message: 'NYC FARE Act requires rent/price disclosure',
          field: 'rent',
        });
      }

      // Check for broker fee disclosure
      if (!input.description.toLowerCase().includes('fee') && !input.description.toLowerCase().includes('no fee')) {
        warnings.push({
          ruleId: 'NYC_FEE_DISCLOSURE',
          message: 'Consider adding fee disclosure for NYC FARE Act compliance',
          field: 'description',
        });
      }
    }

    // Photo requirements
    if (!input.photos || input.photos.length === 0) {
      warnings.push({
        ruleId: 'NO_PHOTOS',
        message: 'Listings without photos receive significantly less engagement',
        field: 'photos',
      });
    }

    const passed = violations.filter(v => v.severity === 'critical').length === 0;
    const requiresHumanReview = blockingIssues.length > 0 || violations.some(v => v.severity === 'critical');

    return {
      passed,
      violations,
      warnings,
      blockingIssues,
      requiresHumanReview,
      marketPackId: market,
      checkedAt: new Date(),
    };
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private isKillSwitchActive(
    killSwitch: ReturnType<typeof getKillSwitchManager>,
    context: ListingOpsContext
  ): boolean {
    const checkResult = killSwitch.isBlocked({
      agentType: this.agentType,
      tenantId: context.tenantId,
      market: context.market,
    });

    return checkResult.blocked;
  }

  private async startAgentRun(options: {
    agentType: AgentType;
    tenantId: string;
    inputs: Record<string, unknown>;
    policyVersion: string;
    modelId: string;
    requestId?: string;
    userId?: string;
    market?: string;
  }): Promise<Result<string>> {
    const runId = `run_${randomUUID()}`;
    const inputsHash = this.hashInputs(options.inputs);

    const run: AgentRun = {
      id: runId,
      requestId: options.requestId || runId,
      tenantId: options.tenantId,
      agentType: options.agentType,
      modelId: options.modelId,
      policyVersion: options.policyVersion,
      status: 'running' as AgentRunStatus,
      inputsHash,
      inputs: options.inputs,
      prompts: [],
      totalTokensIn: 0,
      totalTokensOut: 0,
      totalCostUsd: 0,
      startedAt: new Date(),
      userId: options.userId,
      market: options.market,
      toolCalls: [],
      policyViolations: [],
      retryCount: 0,
    };

    const result = await this.config.runStore.save(run);

    if (!result.ok) {
      return Err('RUN_CREATE_FAILED', result.error.message);
    }

    return Ok(result.data.id);
  }

  private async completeAgentRun(
    runId: string,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    const getResult = await this.config.runStore.get(runId);
    if (!getResult.ok || !getResult.data) return;

    const run = getResult.data;
    run.status = success ? 'completed' : 'failed';
    run.completedAt = new Date();
    if (errorMessage) {
      run.outcome = {
        success: false,
        actionsTaken: [],
        entitiesAffected: [],
        summaryForHuman: `Agent run failed: ${errorMessage}`,
      };
    } else if (success) {
      run.outcome = {
        success: true,
        actionsTaken: ['Completed agent task'],
        entitiesAffected: [],
        summaryForHuman: 'Agent run completed successfully',
      };
    }

    await this.config.runStore.save(run);
  }

  private hashInputs(inputs: Record<string, unknown>): string {
    return createHash('sha256').update(JSON.stringify(inputs)).digest('hex').substring(0, 16);
  }
}

// =============================================================================
// Singleton Factory
// =============================================================================

let serviceInstance: ListingOpsAgentService | null = null;

export function getListingOpsService(
  config?: ListingOpsServiceConfig
): ListingOpsAgentService {
  if (!serviceInstance && config) {
    serviceInstance = new ListingOpsAgentService(config);
  }
  if (!serviceInstance) {
    throw new Error('ListingOpsAgentService not initialized');
  }
  return serviceInstance;
}
