/**
 * Policy Gate
 *
 * Central enforcement point for all AI tool calls.
 * All agent actions pass through this gate before execution.
 */

import type {
  PolicyCheckRequest,
  PolicyCheckResult,
  PolicyRule,
  PolicyViolationSeverity,
  KillSwitch,
  Result,
} from '../types';
import { Ok, Err } from '../types';

import { checkFCHARules, FCHA_RULES } from './rules/fcha-rules';
import { checkFeeRules, FEE_RULES } from './rules/fee-rules';
import { checkMarketRules, MARKET_RULES } from './rules/market-rules';

// =============================================================================
// Policy Gate Configuration
// =============================================================================

export interface PolicyGateConfig {
  policyVersion: string;
  enabledRules?: PolicyRule[];
  rules?: PolicyRule[]; // Alias for enabledRules
  killSwitches?: KillSwitch[];
  killSwitchManager?: KillSwitchManagerInterface;
  maxViolationsBeforeBlock?: number;
  strictMode?: boolean; // Block on any violation
}

// Interface for KillSwitchManager to avoid circular dependency
interface KillSwitchManagerInterface {
  isBlocked(context: {
    agentType?: string;
    toolName?: string;
    tenantId?: string;
    market?: string;
    userId?: string;
  }): { blocked: boolean; reason?: string; killSwitchId?: string };
}

const DEFAULT_CONFIG: PolicyGateConfig = {
  policyVersion: '1.0.0',
  enabledRules: [...FCHA_RULES, ...FEE_RULES, ...MARKET_RULES],
  killSwitches: [],
  maxViolationsBeforeBlock: 1,
  strictMode: true,
};

// =============================================================================
// Policy Gate Class
// =============================================================================

// Extended rule interface with check method
export interface PolicyRuleWithCheck extends Omit<PolicyRule, 'conditions'> {
  conditions?: Record<string, unknown>;
  check?: (context: PolicyCheckContext) => Promise<{ passed: boolean; violations: Array<{ ruleId: string; severity: PolicyViolationSeverity; message: string; suggestedFix?: string }> }>;
}

// Check context passed to rule check functions
export interface PolicyCheckContext {
  agentType?: string;
  tenantId?: string;
  market?: string;
  toolName?: string;
  inputs?: Record<string, unknown>;
  fchaStage?: string;
  feeContext?: {
    feeType?: string;
    amount?: number;
    currency?: string;
  };
}

// Result from checkToolCall
export interface ToolCallCheckResult {
  allowed: boolean;
  violations: Array<{
    ruleId: string;
    ruleName?: string;
    severity: PolicyViolationSeverity;
    message: string;
    suggestedFix?: string;
  }>;
  appliedRules: string[];
  blockedByKillSwitch: boolean;
  killSwitchReason?: string;
}

export class PolicyGate {
  private config: PolicyGateConfig;
  private killSwitchStore: Map<string, KillSwitch> = new Map();
  private ruleIndex: Map<string, PolicyRuleWithCheck> = new Map();
  private killSwitchManager?: KillSwitchManagerInterface;
  private rules: PolicyRuleWithCheck[] = [];

  constructor(config: Partial<PolicyGateConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // Support both 'rules' and 'enabledRules'
    this.rules = (config.rules || config.enabledRules || DEFAULT_CONFIG.enabledRules || []) as PolicyRuleWithCheck[];
    this.killSwitchManager = config.killSwitchManager;
    this.buildRuleIndex();
    this.loadKillSwitches(this.config.killSwitches || []);
  }

  /**
   * Build index of rules for quick lookup.
   */
  private buildRuleIndex(): void {
    this.ruleIndex.clear();
    for (const rule of this.rules) {
      this.ruleIndex.set(rule.id, rule);
    }
  }

  /**
   * Load kill switches into store.
   */
  private loadKillSwitches(killSwitches: KillSwitch[]): void {
    for (const ks of killSwitches) {
      if (ks.active) {
        this.killSwitchStore.set(ks.id, ks);
      }
    }
  }

  /**
   * Add or update a kill switch.
   */
  addKillSwitch(killSwitch: KillSwitch): void {
    if (killSwitch.active) {
      this.killSwitchStore.set(killSwitch.id, killSwitch);
    } else {
      this.killSwitchStore.delete(killSwitch.id);
    }
  }

  /**
   * Remove a kill switch.
   */
  removeKillSwitch(killSwitchId: string): void {
    this.killSwitchStore.delete(killSwitchId);
  }

  /**
   * Check if request is blocked by any kill switch.
   */
  private checkKillSwitches(request: PolicyCheckRequest): KillSwitch | null {
    for (const ks of this.killSwitchStore.values()) {
      // Check expiration
      if (ks.expiresAt && ks.expiresAt < new Date()) {
        continue;
      }

      // Check scope
      switch (ks.scope) {
        case 'global':
          return ks;

        case 'agent_type':
          if (ks.scopeValue === request.agentType) {
            return ks;
          }
          break;

        case 'tool':
          if (ks.scopeValue === request.toolName) {
            return ks;
          }
          break;

        case 'tenant':
          if (ks.scopeValue === request.tenantId) {
            return ks;
          }
          break;

        case 'market':
          if (ks.scopeValue === request.market) {
            return ks;
          }
          break;

        case 'user':
          if (ks.scopeValue === request.userId) {
            return ks;
          }
          break;
      }
    }

    return null;
  }

  /**
   * Get applicable rules for a request.
   */
  private getApplicableRules(request: PolicyCheckRequest): PolicyRule[] {
    return (this.config.enabledRules || []).filter((rule) => {
      // Check if rule is enabled
      if (!rule.enabled) return false;

      // Check market restrictions
      if (rule.markets && rule.markets.length > 0) {
        if (!request.market || !rule.markets.includes(request.market)) {
          return false;
        }
      }

      // Check agent type restrictions
      if (rule.agentTypes && rule.agentTypes.length > 0) {
        if (!rule.agentTypes.includes(request.agentType)) {
          return false;
        }
      }

      // Check tool restrictions
      if (rule.tools && rule.tools.length > 0) {
        if (!rule.tools.includes(request.toolName)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Main entry point - check a tool call against all policies.
   */
  check(request: PolicyCheckRequest): Result<PolicyCheckResult> {
    const startTime = Date.now();
    const violations: PolicyCheckResult['violations'] = [];
    const appliedRules: string[] = [];

    // First check kill switches
    const activeKillSwitch = this.checkKillSwitches(request);
    if (activeKillSwitch) {
      return Ok({
        approved: false,
        violations: [{
          ruleId: `killswitch_${activeKillSwitch.id}`,
          ruleName: 'Kill Switch Active',
          severity: 'fatal',
          message: `Operation blocked by kill switch: ${activeKillSwitch.reason}`,
        }],
        appliedRules: ['kill_switch_check'],
        blockedBy: `killswitch_${activeKillSwitch.id}`,
        checkDurationMs: Date.now() - startTime,
        policyVersion: this.config.policyVersion,
      });
    }

    // Get applicable rules
    const applicableRules = this.getApplicableRules(request);
    appliedRules.push(...applicableRules.map((r) => r.id));

    // Run FCHA checks
    const fchaResult = checkFCHARules(request);
    for (const violation of fchaResult.violations) {
      violations.push({
        ruleId: violation.ruleId,
        ruleName: this.ruleIndex.get(violation.ruleId)?.name || violation.ruleId,
        severity: violation.severity,
        message: violation.message,
        suggestedFix: violation.suggestedFix,
      });
    }

    // Run fee checks
    const feeResult = checkFeeRules(request);
    for (const violation of feeResult.violations) {
      violations.push({
        ruleId: violation.ruleId,
        ruleName: this.ruleIndex.get(violation.ruleId)?.name || violation.ruleId,
        severity: violation.severity,
        message: violation.message,
        suggestedFix: violation.suggestedFix,
      });
    }

    // Run market checks
    const marketResult = checkMarketRules(request);
    for (const violation of marketResult.violations) {
      violations.push({
        ruleId: violation.ruleId,
        ruleName: this.ruleIndex.get(violation.ruleId)?.name || violation.ruleId,
        severity: violation.severity,
        message: violation.message,
        suggestedFix: violation.suggestedFix,
      });
    }

    // Determine if approved
    const fatalViolations = violations.filter((v) => v.severity === 'fatal');
    const errorViolations = violations.filter((v) => v.severity === 'error');

    let approved = true;
    let blockedBy: string | undefined;

    if (fatalViolations.length > 0) {
      approved = false;
      blockedBy = fatalViolations[0]?.ruleId;
    } else if (this.config.strictMode && errorViolations.length > 0) {
      approved = false;
      blockedBy = errorViolations[0]?.ruleId;
    } else if (
      this.config.maxViolationsBeforeBlock &&
      (fatalViolations.length + errorViolations.length) >= this.config.maxViolationsBeforeBlock
    ) {
      approved = false;
      blockedBy = violations[0]?.ruleId;
    }

    return Ok({
      approved,
      violations,
      appliedRules,
      blockedBy,
      checkDurationMs: Date.now() - startTime,
      policyVersion: this.config.policyVersion,
    });
  }

  /**
   * Quick check - just returns approved/denied.
   */
  isAllowed(request: PolicyCheckRequest): boolean {
    const result = this.check(request);
    return result.ok && result.data.approved;
  }

  /**
   * Get all active kill switches.
   */
  getActiveKillSwitches(): KillSwitch[] {
    const now = new Date();
    return Array.from(this.killSwitchStore.values()).filter(
      (ks) => ks.active && (!ks.expiresAt || ks.expiresAt > now)
    );
  }

  /**
   * Get policy version.
   */
  getPolicyVersion(): string {
    return this.config.policyVersion;
  }

  /**
   * Get all enabled rules.
   */
  getEnabledRules(): PolicyRuleWithCheck[] {
    return this.rules.filter((r) => r.enabled);
  }

  /**
   * Enable/disable a rule.
   */
  setRuleEnabled(ruleId: string, enabled: boolean): Result<void> {
    const rule = this.ruleIndex.get(ruleId);
    if (!rule) {
      return Err('RULE_NOT_FOUND', `Rule ${ruleId} not found`);
    }

    rule.enabled = enabled;
    return Ok(undefined);
  }

  /**
   * Get all rules (enabled and disabled).
   */
  getRules(): PolicyRuleWithCheck[] {
    return [...this.rules];
  }

  /**
   * Add a new rule.
   */
  addRule(rule: PolicyRuleWithCheck): void {
    this.rules.push(rule);
    this.ruleIndex.set(rule.id, rule);
  }

  /**
   * Remove a rule by ID.
   */
  removeRule(ruleId: string): void {
    this.rules = this.rules.filter((r) => r.id !== ruleId);
    this.ruleIndex.delete(ruleId);
  }

  /**
   * Enable a rule by ID.
   */
  enableRule(ruleId: string): void {
    const rule = this.ruleIndex.get(ruleId);
    if (rule) {
      rule.enabled = true;
    }
  }

  /**
   * Disable a rule by ID.
   */
  disableRule(ruleId: string): void {
    const rule = this.ruleIndex.get(ruleId);
    if (rule) {
      rule.enabled = false;
    }
  }

  /**
   * Check a tool call against all policies (test-friendly interface).
   */
  async checkToolCall(
    toolCall: { toolName: string; inputs: Record<string, unknown> },
    context: PolicyCheckContext
  ): Promise<ToolCallCheckResult> {
    const violations: ToolCallCheckResult['violations'] = [];
    const appliedRules: string[] = [];
    let blockedByKillSwitch = false;
    let killSwitchReason: string | undefined;

    // Check kill switch manager first
    if (this.killSwitchManager) {
      const ksResult = this.killSwitchManager.isBlocked({
        agentType: context.agentType,
        toolName: context.toolName || toolCall.toolName,
        tenantId: context.tenantId,
        market: context.market,
      });

      if (ksResult.blocked) {
        blockedByKillSwitch = true;
        killSwitchReason = ksResult.reason;
        return {
          allowed: false,
          violations: [{
            ruleId: ksResult.killSwitchId || 'kill_switch',
            severity: 'fatal',
            message: ksResult.reason || 'Blocked by kill switch',
          }],
          appliedRules: ['kill_switch_check'],
          blockedByKillSwitch: true,
          killSwitchReason: ksResult.reason,
        };
      }
    }

    // Check each enabled rule
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      appliedRules.push(rule.id);

      if (rule.check) {
        // Use rule's check function
        const result = await rule.check({
          ...context,
          toolName: context.toolName || toolCall.toolName,
          inputs: context.inputs || toolCall.inputs,
        });

        if (!result.passed) {
          for (const v of result.violations) {
            violations.push({
              ruleId: v.ruleId,
              ruleName: rule.name,
              severity: v.severity,
              message: v.message,
              suggestedFix: v.suggestedFix,
            });
          }
        }
      }
    }

    // Determine if allowed
    const fatalViolations = violations.filter((v) => v.severity === 'fatal');
    const errorViolations = violations.filter((v) => v.severity === 'error' || v.severity === 'critical');
    const allowed = fatalViolations.length === 0 && errorViolations.length === 0;

    return {
      allowed,
      violations,
      appliedRules,
      blockedByKillSwitch,
      killSwitchReason,
    };
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

let defaultGate: PolicyGate | null = null;

/**
 * Get or create the default policy gate.
 */
export function getPolicyGate(config?: Partial<PolicyGateConfig>): PolicyGate {
  if (!defaultGate || config) {
    defaultGate = new PolicyGate(config);
  }
  return defaultGate;
}

/**
 * Create a new policy gate instance.
 */
export function createPolicyGate(config?: Partial<PolicyGateConfig>): PolicyGate {
  return new PolicyGate(config);
}

/**
 * Reset the default policy gate (for testing).
 */
export function resetPolicyGate(): void {
  defaultGate = null;
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Quick policy check using default gate.
 */
export function checkPolicy(request: PolicyCheckRequest): Result<PolicyCheckResult> {
  return getPolicyGate().check(request);
}

/**
 * Quick check if action is allowed using default gate.
 */
export function isActionAllowed(request: PolicyCheckRequest): boolean {
  return getPolicyGate().isAllowed(request);
}

// =============================================================================
// Severity Helpers
// =============================================================================

/**
 * Get the highest severity from violations.
 */
export function getHighestSeverity(
  violations: Array<{ severity: PolicyViolationSeverity }>
): PolicyViolationSeverity | null {
  const severityOrder: PolicyViolationSeverity[] = ['fatal', 'critical', 'error', 'warning', 'info'];

  for (const severity of severityOrder) {
    if (violations.some((v) => v.severity === severity)) {
      return severity;
    }
  }

  return null;
}

/**
 * Check if severity should block execution.
 */
export function severityBlocksExecution(severity: PolicyViolationSeverity): boolean {
  return severity === 'fatal' || severity === 'critical';
}
