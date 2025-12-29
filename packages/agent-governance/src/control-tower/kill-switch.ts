/**
 * Kill Switch Management
 *
 * Emergency controls to disable AI agents by scope.
 */

import { randomUUID } from 'crypto';

import type {
  KillSwitch,
  KillSwitchScope,
  AgentType,
  Result,
} from '../types';
import { Ok, Err } from '../types';

// =============================================================================
// Kill Switch Manager
// =============================================================================

export interface KillSwitchManagerConfig {
  maxKillSwitchDuration?: number; // Max duration in hours
  requireReason?: boolean;
  notifyOnActivation?: (ks: KillSwitch) => Promise<void>;
  notifyOnDeactivation?: (ks: KillSwitch) => Promise<void>;
}

const DEFAULT_CONFIG: KillSwitchManagerConfig = {
  maxKillSwitchDuration: 72, // 72 hours max
  requireReason: true,
};

export class KillSwitchManager {
  private config: KillSwitchManagerConfig;
  private switches: Map<string, KillSwitch> = new Map();
  private auditLog: Array<{
    action: 'activate' | 'deactivate' | 'extend' | 'update';
    killSwitchId: string;
    performedBy: string;
    timestamp: Date;
    reason?: string;
  }> = [];

  constructor(config: KillSwitchManagerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Activate a new kill switch.
   */
  async activate(params: {
    id?: string;
    scope: KillSwitchScope;
    scopeValue?: string;
    reason: string;
    activatedBy: string;
    durationHours?: number;
    expiresAt?: Date;
    affectedAgentTypes?: AgentType[];
    affectedTools?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<Result<KillSwitch>> {
    // Check for duplicate ID
    const id = params.id || `ks_${randomUUID()}`;
    if (this.switches.has(id)) {
      const existing = this.switches.get(id);
      if (existing?.active) {
        return Err('ALREADY_ACTIVE', `Kill switch ${id} is already active`);
      }
    }

    // Validate required fields
    if (this.config.requireReason && !params.reason) {
      return Err('REASON_REQUIRED', 'Kill switch activation requires a reason');
    }

    // Validate scope value for non-global scopes
    if (params.scope !== 'global' && !params.scopeValue) {
      return Err('SCOPE_VALUE_REQUIRED', `Scope value required for ${params.scope} scope`);
    }

    // Calculate expiration
    let expiresAt: Date | undefined = params.expiresAt;
    if (!expiresAt && params.durationHours) {
      const maxDuration = this.config.maxKillSwitchDuration || 72;
      const duration = Math.min(params.durationHours, maxDuration);
      expiresAt = new Date(Date.now() + duration * 60 * 60 * 1000);
    }

    const killSwitch: KillSwitch = {
      id,
      scope: params.scope,
      scopeValue: params.scopeValue,
      reason: params.reason,
      activatedBy: params.activatedBy,
      activatedAt: new Date(),
      expiresAt,
      active: true,
      affectedAgentTypes: params.affectedAgentTypes,
      affectedTools: params.affectedTools,
      metadata: params.metadata,
    };

    this.switches.set(killSwitch.id, killSwitch);

    // Log the action
    this.auditLog.push({
      action: 'activate',
      killSwitchId: killSwitch.id,
      performedBy: params.activatedBy,
      timestamp: new Date(),
      reason: params.reason,
    });

    // Notify if configured
    if (this.config.notifyOnActivation) {
      await this.config.notifyOnActivation(killSwitch);
    }

    return Ok(killSwitch);
  }

  /**
   * Deactivate a kill switch.
   */
  async deactivate(
    killSwitchId: string,
    deactivatedBy: string,
    reason?: string
  ): Promise<Result<KillSwitch>> {
    const ks = this.switches.get(killSwitchId);
    if (!ks) {
      return Err('NOT_FOUND', `Kill switch ${killSwitchId} not found`);
    }

    if (!ks.active) {
      return Err('ALREADY_INACTIVE', 'Kill switch is already inactive');
    }

    const updated: KillSwitch = {
      ...ks,
      active: false,
    };

    this.switches.set(killSwitchId, updated);

    // Log the action
    this.auditLog.push({
      action: 'deactivate',
      killSwitchId,
      performedBy: deactivatedBy,
      timestamp: new Date(),
      reason,
    });

    // Notify if configured
    if (this.config.notifyOnDeactivation) {
      await this.config.notifyOnDeactivation(updated);
    }

    return Ok(updated);
  }

  /**
   * Extend a kill switch duration.
   * Can accept either a new expiration Date or additional hours.
   */
  extend(
    killSwitchId: string,
    expirationOrHours: Date | number,
    extendedBy: string,
    reason?: string
  ): Result<KillSwitch> {
    const ks = this.switches.get(killSwitchId);
    if (!ks) {
      return Err('NOT_FOUND', `Kill switch ${killSwitchId} not found`);
    }

    if (!ks.active) {
      return Err('INACTIVE', 'Cannot extend inactive kill switch');
    }

    let newExpiry: Date;
    let reasonText: string;

    if (expirationOrHours instanceof Date) {
      newExpiry = expirationOrHours;
      reasonText = reason || 'Extended to new expiration';
    } else {
      const additionalHours = expirationOrHours;
      const maxDuration = this.config.maxKillSwitchDuration || 72;
      const currentExpiry = ks.expiresAt || new Date();
      newExpiry = new Date(
        Math.min(
          currentExpiry.getTime() + additionalHours * 60 * 60 * 1000,
          Date.now() + maxDuration * 60 * 60 * 1000
        )
      );
      reasonText = reason || `Extended by ${additionalHours} hours`;
    }

    const updated: KillSwitch = {
      ...ks,
      expiresAt: newExpiry,
    };

    this.switches.set(killSwitchId, updated);

    this.auditLog.push({
      action: 'extend',
      killSwitchId,
      performedBy: extendedBy,
      timestamp: new Date(),
      reason: reasonText,
    });

    return Ok(updated);
  }

  /**
   * Get a kill switch by ID.
   */
  get(killSwitchId: string): KillSwitch | null {
    return this.switches.get(killSwitchId) || null;
  }

  /**
   * Get all active kill switches.
   */
  getActive(): KillSwitch[] {
    const now = new Date();
    return Array.from(this.switches.values()).filter(
      (ks) => ks.active && (!ks.expiresAt || ks.expiresAt > now)
    );
  }

  /**
   * Get kill switches by scope.
   */
  getByScope(scope: KillSwitchScope, scopeValue?: string): KillSwitch[] {
    return this.getActive().filter(
      (ks) => ks.scope === scope && (!scopeValue || ks.scopeValue === scopeValue)
    );
  }

  /**
   * Check if a specific context is blocked.
   */
  isBlocked(context: {
    agentType?: AgentType;
    toolName?: string;
    tenantId?: string;
    market?: string;
    userId?: string;
  }): { blocked: boolean; reason?: string; killSwitchId?: string } {
    const activeKillSwitches = this.getActive();

    for (const ks of activeKillSwitches) {
      let matches = false;

      switch (ks.scope) {
        case 'global':
          matches = true;
          break;
        case 'agent_type':
          matches = ks.scopeValue === context.agentType;
          break;
        case 'tool':
          matches = ks.scopeValue === context.toolName;
          break;
        case 'tenant':
          matches = ks.scopeValue === context.tenantId;
          break;
        case 'market':
          matches = ks.scopeValue === context.market;
          break;
        case 'user':
          matches = ks.scopeValue === context.userId;
          break;
      }

      if (matches) {
        // Check specific agent/tool filters if present
        if (ks.affectedAgentTypes && ks.affectedAgentTypes.length > 0) {
          if (context.agentType && !ks.affectedAgentTypes.includes(context.agentType)) {
            continue;
          }
        }

        if (ks.affectedTools && ks.affectedTools.length > 0) {
          if (context.toolName && !ks.affectedTools.includes(context.toolName)) {
            continue;
          }
        }

        return {
          blocked: true,
          reason: ks.reason,
          killSwitchId: ks.id,
        };
      }
    }

    return { blocked: false };
  }

  /**
   * Get audit log.
   * Can accept a killSwitchId string or an options object.
   */
  getAuditLog(optionsOrId?: string | {
    killSwitchId?: string;
    performedBy?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): typeof this.auditLog {
    let log = [...this.auditLog];

    // Handle string ID shortcut
    const options = typeof optionsOrId === 'string'
      ? { killSwitchId: optionsOrId }
      : optionsOrId;

    if (options?.killSwitchId) {
      log = log.filter((e) => e.killSwitchId === options.killSwitchId);
    }
    if (options?.performedBy) {
      log = log.filter((e) => e.performedBy === options.performedBy);
    }
    if (options?.startDate) {
      log = log.filter((e) => e.timestamp >= options.startDate!);
    }
    if (options?.endDate) {
      log = log.filter((e) => e.timestamp <= options.endDate!);
    }

    log.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options?.limit) {
      log = log.slice(0, options.limit);
    }

    return log;
  }

  /**
   * Check if a specific scope is active.
   */
  isActive(scope: KillSwitchScope, scopeValue?: string): boolean {
    const switches = this.getByScope(scope, scopeValue);
    return switches.length > 0;
  }

  /**
   * Check context and return detailed result.
   */
  checkContext(context: {
    agentType?: AgentType;
    toolName?: string;
    tenantId?: string;
    market?: string;
    userId?: string;
  }): { isBlocked: boolean; matchingSwitches: KillSwitch[]; reason?: string } {
    const activeKillSwitches = this.getActive();
    const matchingSwitches: KillSwitch[] = [];

    for (const ks of activeKillSwitches) {
      let matches = false;

      switch (ks.scope) {
        case 'global':
          matches = true;
          break;
        case 'agent_type':
          matches = ks.scopeValue === context.agentType;
          break;
        case 'tool':
          matches = ks.scopeValue === context.toolName;
          break;
        case 'tenant':
          matches = ks.scopeValue === context.tenantId;
          break;
        case 'market':
          matches = ks.scopeValue === context.market;
          break;
        case 'user':
          matches = ks.scopeValue === context.userId;
          break;
      }

      if (matches) {
        matchingSwitches.push(ks);
      }
    }

    // Return the most severe reason (global takes precedence)
    const globalSwitch = matchingSwitches.find((ks) => ks.scope === 'global');
    const reason = globalSwitch?.reason || matchingSwitches[0]?.reason;

    return {
      isBlocked: matchingSwitches.length > 0,
      matchingSwitches,
      reason,
    };
  }

  /**
   * Cleanup expired kill switches.
   */
  cleanup(): number {
    const now = new Date();
    let removed = 0;

    for (const [id, ks] of this.switches.entries()) {
      if (ks.expiresAt && ks.expiresAt < now) {
        this.switches.delete(id);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Alias for cleanup.
   */
  cleanupExpired(): number {
    return this.cleanup();
  }

  /**
   * Get all kill switches (for admin view).
   */
  getAll(): KillSwitch[] {
    return Array.from(this.switches.values());
  }

  /**
   * Clear all kill switches (for testing).
   */
  clear(): void {
    this.switches.clear();
    this.auditLog = [];
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let defaultManager: KillSwitchManager | null = null;

export function getKillSwitchManager(
  config?: KillSwitchManagerConfig
): KillSwitchManager {
  if (!defaultManager || config) {
    defaultManager = new KillSwitchManager(config);
  }
  return defaultManager;
}

export function resetKillSwitchManager(): void {
  defaultManager = null;
}

export function setGlobalKillSwitchManager(manager: KillSwitchManager): void {
  defaultManager = manager;
}
