/**
 * Kill Switch Integration Tests
 *
 * Tests for kill switch activation, scoping, and expiration.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
  KillSwitchManager,
  setGlobalKillSwitchManager,
  getKillSwitchManager,
} from '../src/control-tower/kill-switch';
import type { KillSwitch } from '../src/types';

describe('KillSwitchManager', () => {
  let manager: KillSwitchManager;

  beforeEach(() => {
    manager = new KillSwitchManager();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Activation', () => {
    it('should activate a global kill switch', async () => {
      const result = await manager.activate({
        id: 'ks_global_1',
        scope: 'global',
        activatedBy: 'admin@example.com',
        reason: 'Critical system issue',
      });

      expect(result.ok).toBe(true);
      expect(manager.isActive('global')).toBe(true);
    });

    it('should activate an agent type kill switch', async () => {
      const result = await manager.activate({
        id: 'ks_agent_1',
        scope: 'agent_type',
        scopeValue: 'leasing',
        activatedBy: 'admin@example.com',
        reason: 'Leasing agent bug',
      });

      expect(result.ok).toBe(true);
      expect(manager.isActive('agent_type', 'leasing')).toBe(true);
      expect(manager.isActive('agent_type', 'maintenance')).toBe(false);
    });

    it('should activate a tool kill switch', async () => {
      const result = await manager.activate({
        id: 'ks_tool_1',
        scope: 'tool',
        scopeValue: 'send_payment',
        activatedBy: 'admin@example.com',
        reason: 'Payment processing issue',
      });

      expect(result.ok).toBe(true);
      expect(manager.isActive('tool', 'send_payment')).toBe(true);
      expect(manager.isActive('tool', 'send_message')).toBe(false);
    });

    it('should activate a tenant kill switch', async () => {
      const result = await manager.activate({
        id: 'ks_tenant_1',
        scope: 'tenant',
        scopeValue: 'tenant_123',
        activatedBy: 'admin@example.com',
        reason: 'Tenant-specific issue',
      });

      expect(result.ok).toBe(true);
      expect(manager.isActive('tenant', 'tenant_123')).toBe(true);
      expect(manager.isActive('tenant', 'tenant_456')).toBe(false);
    });

    it('should activate a market kill switch', async () => {
      const result = await manager.activate({
        id: 'ks_market_1',
        scope: 'market',
        scopeValue: 'CA',
        activatedBy: 'admin@example.com',
        reason: 'California compliance issue',
      });

      expect(result.ok).toBe(true);
      expect(manager.isActive('market', 'CA')).toBe(true);
      expect(manager.isActive('market', 'NY')).toBe(false);
    });

    it('should activate a user kill switch', async () => {
      const result = await manager.activate({
        id: 'ks_user_1',
        scope: 'user',
        scopeValue: 'user_bad_actor',
        activatedBy: 'admin@example.com',
        reason: 'Abusive user',
      });

      expect(result.ok).toBe(true);
      expect(manager.isActive('user', 'user_bad_actor')).toBe(true);
      expect(manager.isActive('user', 'user_good')).toBe(false);
    });

    it('should not allow duplicate kill switch IDs', async () => {
      await manager.activate({
        id: 'ks_dup',
        scope: 'global',
        activatedBy: 'admin',
        reason: 'First',
      });

      const result = await manager.activate({
        id: 'ks_dup',
        scope: 'global',
        activatedBy: 'admin',
        reason: 'Second',
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('ALREADY_ACTIVE');
      }
    });
  });

  describe('Deactivation', () => {
    it('should deactivate a kill switch', async () => {
      await manager.activate({
        id: 'ks_deactivate',
        scope: 'global',
        activatedBy: 'admin',
        reason: 'Test',
      });

      expect(manager.isActive('global')).toBe(true);

      const result = await manager.deactivate('ks_deactivate', 'admin', 'Issue resolved');

      expect(result.ok).toBe(true);
      expect(manager.isActive('global')).toBe(false);
    });

    it('should return error when deactivating non-existent switch', async () => {
      const result = await manager.deactivate('ks_nonexistent', 'admin', 'Test');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_FOUND');
      }
    });

    it('should log deactivation in audit trail', async () => {
      await manager.activate({
        id: 'ks_audit',
        scope: 'global',
        activatedBy: 'admin1',
        reason: 'Test',
      });

      // Advance time to ensure different timestamps
      vi.advanceTimersByTime(1000);

      await manager.deactivate('ks_audit', 'admin2', 'Resolved');

      const audit = manager.getAuditLog();
      expect(audit.length).toBe(2);
      expect(audit[0]!.action).toBe('deactivate');
      expect(audit[0]!.performedBy).toBe('admin2');
    });
  });

  describe('Extension', () => {
    it('should extend kill switch expiration', async () => {
      const originalExpiry = new Date(Date.now() + 3600000); // 1 hour
      await manager.activate({
        id: 'ks_extend',
        scope: 'global',
        activatedBy: 'admin',
        reason: 'Test',
        expiresAt: originalExpiry,
      });

      const newExpiry = new Date(Date.now() + 7200000); // 2 hours
      const result = manager.extend('ks_extend', newExpiry, 'admin', 'Need more time');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.expiresAt?.getTime()).toBe(newExpiry.getTime());
      }
    });

    it('should log extension in audit trail', async () => {
      await manager.activate({
        id: 'ks_extend_audit',
        scope: 'global',
        activatedBy: 'admin',
        reason: 'Test',
        expiresAt: new Date(Date.now() + 3600000),
      });

      manager.extend('ks_extend_audit', new Date(Date.now() + 7200000), 'admin2', 'Extend');

      const audit = manager.getAuditLog();
      expect(audit.some((a) => a.action === 'extend')).toBe(true);
    });
  });

  describe('Expiration', () => {
    it('should auto-expire kill switches', async () => {
      const expiresAt = new Date(Date.now() + 1000); // 1 second

      await manager.activate({
        id: 'ks_expire',
        scope: 'global',
        activatedBy: 'admin',
        reason: 'Test',
        expiresAt,
      });

      expect(manager.isActive('global')).toBe(true);

      // Fast-forward time
      vi.advanceTimersByTime(2000);

      // Should now be expired
      expect(manager.isActive('global')).toBe(false);
    });

    it('should clean up expired switches', async () => {
      await manager.activate({
        id: 'ks_cleanup',
        scope: 'global',
        activatedBy: 'admin',
        reason: 'Test',
        expiresAt: new Date(Date.now() + 1000),
      });

      vi.advanceTimersByTime(2000);

      const cleaned = manager.cleanupExpired();
      expect(cleaned).toBe(1);
    });
  });

  describe('Check Context', () => {
    it('should check all matching scopes', async () => {
      // Activate multiple scopes
      await manager.activate({
        id: 'ks_ctx_agent',
        scope: 'agent_type',
        scopeValue: 'leasing',
        activatedBy: 'admin',
        reason: 'Agent issue',
      });

      // Check context with matching agent type
      const result1 = manager.checkContext({
        agentType: 'leasing',
      });

      expect(result1.isBlocked).toBe(true);
      expect(result1.matchingSwitches.length).toBe(1);

      // Check context with non-matching agent type
      const result2 = manager.checkContext({
        agentType: 'maintenance',
      });

      expect(result2.isBlocked).toBe(false);
    });

    it('should check multiple matching scopes', async () => {
      await manager.activate({
        id: 'ks_multi_1',
        scope: 'tenant',
        scopeValue: 'tenant_123',
        activatedBy: 'admin',
        reason: 'Tenant issue',
      });

      await manager.activate({
        id: 'ks_multi_2',
        scope: 'market',
        scopeValue: 'CA',
        activatedBy: 'admin',
        reason: 'Market issue',
      });

      const result = manager.checkContext({
        tenantId: 'tenant_123',
        market: 'CA',
      });

      expect(result.isBlocked).toBe(true);
      expect(result.matchingSwitches.length).toBe(2);
    });

    it('should return most severe reason', async () => {
      await manager.activate({
        id: 'ks_severe_1',
        scope: 'agent_type',
        scopeValue: 'leasing',
        activatedBy: 'admin',
        reason: 'Agent bug',
      });

      await manager.activate({
        id: 'ks_severe_2',
        scope: 'global',
        activatedBy: 'admin',
        reason: 'System emergency',
      });

      const result = manager.checkContext({ agentType: 'leasing' });

      // Global is most severe
      expect(result.reason).toBe('System emergency');
    });
  });

  describe('Active Kill Switches', () => {
    it('should return all active kill switches', async () => {
      await manager.activate({
        id: 'ks_list_1',
        scope: 'global',
        activatedBy: 'admin',
        reason: 'Test 1',
      });

      await manager.activate({
        id: 'ks_list_2',
        scope: 'agent_type',
        scopeValue: 'leasing',
        activatedBy: 'admin',
        reason: 'Test 2',
      });

      const active = manager.getActive();
      expect(active.length).toBe(2);
    });

    it('should filter active by scope', async () => {
      await manager.activate({
        id: 'ks_filter_1',
        scope: 'global',
        activatedBy: 'admin',
        reason: 'Global',
      });

      await manager.activate({
        id: 'ks_filter_2',
        scope: 'agent_type',
        scopeValue: 'leasing',
        activatedBy: 'admin',
        reason: 'Agent',
      });

      const agentOnly = manager.getByScope('agent_type');
      expect(agentOnly.length).toBe(1);
      expect(agentOnly[0]!.scope).toBe('agent_type');
    });
  });

  describe('Audit Log', () => {
    it('should record all actions', async () => {
      await manager.activate({
        id: 'ks_audit_full',
        scope: 'global',
        activatedBy: 'admin1',
        reason: 'Activate',
      });

      // Advance time between actions to ensure proper sorting
      vi.advanceTimersByTime(1000);

      manager.extend(
        'ks_audit_full',
        new Date(Date.now() + 3600000),
        'admin2',
        'Extend'
      );

      vi.advanceTimersByTime(1000);

      await manager.deactivate('ks_audit_full', 'admin3', 'Deactivate');

      const audit = manager.getAuditLog();
      expect(audit.length).toBe(3);
      // Audit log is sorted newest first
      expect(audit[0]!.action).toBe('deactivate');
      expect(audit[1]!.action).toBe('extend');
      expect(audit[2]!.action).toBe('activate');
    });

    it('should filter audit log by kill switch ID', async () => {
      await manager.activate({
        id: 'ks_audit_a',
        scope: 'global',
        activatedBy: 'admin',
        reason: 'A',
      });

      await manager.activate({
        id: 'ks_audit_b',
        scope: 'agent_type',
        scopeValue: 'leasing',
        activatedBy: 'admin',
        reason: 'B',
      });

      const auditA = manager.getAuditLog('ks_audit_a');
      expect(auditA.length).toBe(1);
      expect(auditA[0]!.killSwitchId).toBe('ks_audit_a');
    });
  });

  describe('Global Singleton', () => {
    it('should work with global singleton', async () => {
      const customManager = new KillSwitchManager();
      setGlobalKillSwitchManager(customManager);

      const retrieved = getKillSwitchManager();
      expect(retrieved).toBe(customManager);

      await retrieved.activate({
        id: 'ks_singleton',
        scope: 'global',
        activatedBy: 'admin',
        reason: 'Test',
      });

      expect(customManager.isActive('global')).toBe(true);
    });
  });

  describe('Clear', () => {
    it('should clear all kill switches', async () => {
      await manager.activate({
        id: 'ks_clear_1',
        scope: 'global',
        activatedBy: 'admin',
        reason: 'Test',
      });

      await manager.activate({
        id: 'ks_clear_2',
        scope: 'agent_type',
        scopeValue: 'leasing',
        activatedBy: 'admin',
        reason: 'Test',
      });

      manager.clear();

      expect(manager.getActive().length).toBe(0);
      expect(manager.isActive('global')).toBe(false);
    });
  });
});

describe('Kill Switch Scenarios', () => {
  let manager: KillSwitchManager;

  beforeEach(() => {
    manager = new KillSwitchManager();
  });

  it('should handle emergency shutdown scenario', async () => {
    // Admin triggers emergency shutdown
    const result = await manager.activate({
      scope: 'global',
      activatedBy: 'cto@example.com',
      reason: 'Critical security vulnerability detected',
    });

    expect(result.ok).toBe(true);

    // All contexts should be blocked
    expect(manager.isBlocked({}).blocked).toBe(true);
    expect(manager.isBlocked({ agentType: 'leasing_assistant' }).blocked).toBe(true);
    expect(manager.isBlocked({ tenantId: 'any' }).blocked).toBe(true);
  });

  it('should handle agent-specific issues', async () => {
    // Leasing agent has a bug
    await manager.activate({
      scope: 'agent_type',
      scopeValue: 'leasing_assistant',
      activatedBy: 'eng@example.com',
      reason: 'Leasing agent suggesting illegal fees',
      durationHours: 4,
    });

    // Leasing blocked
    expect(manager.isBlocked({ agentType: 'leasing_assistant' }).blocked).toBe(true);

    // Maintenance continues working
    expect(manager.isBlocked({ agentType: 'maintenance_coordinator' }).blocked).toBe(false);
  });

  it('should handle market-specific compliance issues', async () => {
    // New regulation in California requires immediate review
    await manager.activate({
      scope: 'market',
      scopeValue: 'CA',
      activatedBy: 'legal@example.com',
      reason: 'New AB-123 regulation requires AI review',
    });

    // California blocked
    expect(manager.isBlocked({ market: 'CA' }).blocked).toBe(true);

    // Other markets continue
    expect(manager.isBlocked({ market: 'TX' }).blocked).toBe(false);
    expect(manager.isBlocked({ market: 'NY' }).blocked).toBe(false);
  });

  it('should handle bad actor user isolation', async () => {
    // User found to be exploiting system
    await manager.activate({
      scope: 'user',
      scopeValue: 'user_exploit_123',
      activatedBy: 'security@example.com',
      reason: 'User attempting prompt injection attacks',
    });

    // Bad user blocked
    expect(manager.isBlocked({ userId: 'user_exploit_123' }).blocked).toBe(true);

    // Other users continue
    expect(manager.isBlocked({ userId: 'user_normal' }).blocked).toBe(false);
  });

  it('should handle tool-specific vulnerabilities', async () => {
    // Payment tool has a vulnerability
    await manager.activate({
      scope: 'tool',
      scopeValue: 'process_payment',
      activatedBy: 'security@example.com',
      reason: 'Payment tool CVE-2024-XXXX',
    });

    // Payment tool blocked
    expect(manager.isBlocked({ toolName: 'process_payment' }).blocked).toBe(true);

    // Other tools continue
    expect(manager.isBlocked({ toolName: 'send_message' }).blocked).toBe(false);
  });

  it('should handle tenant isolation', async () => {
    // Enterprise tenant requested AI pause during audit
    await manager.activate({
      scope: 'tenant',
      scopeValue: 'enterprise_acme',
      activatedBy: 'cso@acme.com',
      reason: 'Internal AI audit in progress',
      durationHours: 24,
    });

    // That tenant blocked
    expect(manager.isBlocked({ tenantId: 'enterprise_acme' }).blocked).toBe(true);

    // Other tenants continue
    expect(manager.isBlocked({ tenantId: 'small_biz' }).blocked).toBe(false);
  });
});
