/**
 * Policy Gate Unit Tests
 *
 * Tests for FCHA rules, fee compliance, and market rules.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { KillSwitchManager } from '../src/control-tower';
import {
  PolicyGate,
  createFchaRules,
  createFeeComplianceRules,
  createMarketRules,
} from '../src/policy';
import type { ToolCall, PolicyCheckContext } from '../src/types';

describe('PolicyGate', () => {
  let gate: PolicyGate;
  let killSwitchManager: KillSwitchManager;

  beforeEach(() => {
    killSwitchManager = new KillSwitchManager();

    gate = new PolicyGate({
      rules: [
        ...createFchaRules(),
        ...createFeeComplianceRules(),
        ...createMarketRules(),
      ],
      killSwitchManager,
      policyVersion: '1.0.0',
    });
  });

  describe('FCHA Compliance', () => {
    it('should block tool calls with discriminatory language', async () => {
      const toolCall: ToolCall = {
        id: 'tc_1',
        toolName: 'send_message',
        inputs: {
          message: 'We prefer tenants without children',
        },
        status: 'pending',
        createdAt: new Date(),
      };

      const context: PolicyCheckContext = {
        agentType: 'leasing',
        tenantId: 'tenant_1',
        market: 'CA',
        toolName: 'send_message',
        inputs: toolCall.inputs,
        fchaStage: 'inquiry',
      };

      const result = await gate.checkToolCall(toolCall, context);

      expect(result.allowed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations.some((v) => v.ruleId.includes('fcha'))).toBe(true);
    });

    it('should block steering language', async () => {
      const toolCall: ToolCall = {
        id: 'tc_2',
        toolName: 'send_message',
        inputs: {
          message: 'This neighborhood might not be suitable for your family',
        },
        status: 'pending',
        createdAt: new Date(),
      };

      const context: PolicyCheckContext = {
        agentType: 'leasing',
        tenantId: 'tenant_1',
        market: 'CA',
        toolName: 'send_message',
        inputs: toolCall.inputs,
        fchaStage: 'showing',
      };

      const result = await gate.checkToolCall(toolCall, context);

      expect(result.allowed).toBe(false);
    });

    it('should allow neutral, compliant messages', async () => {
      const toolCall: ToolCall = {
        id: 'tc_3',
        toolName: 'send_message',
        inputs: {
          message: 'The apartment is available for viewing tomorrow at 2pm.',
        },
        status: 'pending',
        createdAt: new Date(),
      };

      const context: PolicyCheckContext = {
        agentType: 'leasing',
        tenantId: 'tenant_1',
        market: 'CA',
        toolName: 'send_message',
        inputs: toolCall.inputs,
        fchaStage: 'inquiry',
      };

      const result = await gate.checkToolCall(toolCall, context);

      expect(result.allowed).toBe(true);
      expect(result.violations.length).toBe(0);
    });

    it('should block inappropriate questions based on FCHA stage', async () => {
      const toolCall: ToolCall = {
        id: 'tc_4',
        toolName: 'ask_question',
        inputs: {
          question: 'What is your income?',
        },
        status: 'pending',
        createdAt: new Date(),
      };

      // Income question at inquiry stage is not allowed
      const context: PolicyCheckContext = {
        agentType: 'leasing',
        tenantId: 'tenant_1',
        market: 'CA',
        toolName: 'ask_question',
        inputs: toolCall.inputs,
        fchaStage: 'inquiry',
      };

      const result = await gate.checkToolCall(toolCall, context);

      expect(result.allowed).toBe(false);
    });

    it('should allow income questions at application stage', async () => {
      const toolCall: ToolCall = {
        id: 'tc_5',
        toolName: 'ask_question',
        inputs: {
          question: 'What is your monthly income?',
        },
        status: 'pending',
        createdAt: new Date(),
      };

      // Income question at application stage is allowed
      const context: PolicyCheckContext = {
        agentType: 'leasing',
        tenantId: 'tenant_1',
        market: 'CA',
        toolName: 'ask_question',
        inputs: toolCall.inputs,
        fchaStage: 'application',
      };

      const result = await gate.checkToolCall(toolCall, context);

      // Should pass FCHA rules at application stage
      const fchaViolations = result.violations.filter((v) => v.ruleId.includes('fcha_stage'));
      expect(fchaViolations.length).toBe(0);
    });

    it('should detect source of income discrimination in CA', async () => {
      const toolCall: ToolCall = {
        id: 'tc_6',
        toolName: 'send_message',
        inputs: {
          message: 'We do not accept housing vouchers or Section 8.',
        },
        status: 'pending',
        createdAt: new Date(),
      };

      const context: PolicyCheckContext = {
        agentType: 'leasing',
        tenantId: 'tenant_1',
        market: 'CA', // California protects source of income
        toolName: 'send_message',
        inputs: toolCall.inputs,
        fchaStage: 'inquiry',
      };

      const result = await gate.checkToolCall(toolCall, context);

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.message.includes('source of income'))).toBe(true);
    });
  });

  describe('Fee Compliance', () => {
    it('should block excessive application fees in CA', async () => {
      const toolCall: ToolCall = {
        id: 'tc_7',
        toolName: 'charge_fee',
        inputs: {
          feeType: 'application',
          amount: 100, // CA limit is ~$60
        },
        status: 'pending',
        createdAt: new Date(),
      };

      const context: PolicyCheckContext = {
        agentType: 'leasing',
        tenantId: 'tenant_1',
        market: 'CA',
        toolName: 'charge_fee',
        inputs: toolCall.inputs,
        feeContext: {
          feeType: 'application',
          amount: 100,
          currency: 'USD',
        },
      };

      const result = await gate.checkToolCall(toolCall, context);

      expect(result.allowed).toBe(false);
      expect(result.violations.some((v) => v.ruleId.includes('fee'))).toBe(true);
    });

    it('should allow compliant application fees', async () => {
      const toolCall: ToolCall = {
        id: 'tc_8',
        toolName: 'charge_fee',
        inputs: {
          feeType: 'application',
          amount: 50,
        },
        status: 'pending',
        createdAt: new Date(),
      };

      const context: PolicyCheckContext = {
        agentType: 'leasing',
        tenantId: 'tenant_1',
        market: 'CA',
        toolName: 'charge_fee',
        inputs: toolCall.inputs,
        feeContext: {
          feeType: 'application',
          amount: 50,
          currency: 'USD',
        },
      };

      const result = await gate.checkToolCall(toolCall, context);

      const feeViolations = result.violations.filter((v) => v.ruleId.includes('fee'));
      expect(feeViolations.length).toBe(0);
    });

    it('should block broker fees in NY', async () => {
      const toolCall: ToolCall = {
        id: 'tc_9',
        toolName: 'charge_fee',
        inputs: {
          feeType: 'broker',
          amount: 2000,
        },
        status: 'pending',
        createdAt: new Date(),
      };

      const context: PolicyCheckContext = {
        agentType: 'leasing',
        tenantId: 'tenant_1',
        market: 'NY',
        toolName: 'charge_fee',
        inputs: toolCall.inputs,
        feeContext: {
          feeType: 'broker',
          amount: 2000,
          currency: 'USD',
        },
      };

      const result = await gate.checkToolCall(toolCall, context);

      expect(result.allowed).toBe(false);
    });

    it('should block illegal fee patterns in messages', async () => {
      const toolCall: ToolCall = {
        id: 'tc_10',
        toolName: 'send_message',
        inputs: {
          message: 'We charge a $200 key deposit and $50 pet interview fee.',
        },
        status: 'pending',
        createdAt: new Date(),
      };

      const context: PolicyCheckContext = {
        agentType: 'leasing',
        tenantId: 'tenant_1',
        market: 'CA',
        toolName: 'send_message',
        inputs: toolCall.inputs,
      };

      const result = await gate.checkToolCall(toolCall, context);

      expect(result.violations.some((v) => v.ruleId.includes('fee_patterns'))).toBe(true);
    });
  });

  describe('Kill Switch Integration', () => {
    it('should block all tool calls when global kill switch is active', async () => {
      killSwitchManager.activate({
        id: 'ks_1',
        scope: 'global',
        activatedBy: 'admin',
        reason: 'Emergency shutdown',
      });

      const toolCall: ToolCall = {
        id: 'tc_11',
        toolName: 'send_message',
        inputs: { message: 'Hello' },
        status: 'pending',
        createdAt: new Date(),
      };

      const context: PolicyCheckContext = {
        agentType: 'leasing',
        tenantId: 'tenant_1',
        toolName: 'send_message',
        inputs: toolCall.inputs,
      };

      const result = await gate.checkToolCall(toolCall, context);

      expect(result.allowed).toBe(false);
      expect(result.blockedByKillSwitch).toBe(true);
    });

    it('should block tool calls for specific agent type', async () => {
      killSwitchManager.activate({
        id: 'ks_2',
        scope: 'agent_type',
        scopeValue: 'leasing',
        activatedBy: 'admin',
        reason: 'Leasing agent issues',
      });

      const toolCall: ToolCall = {
        id: 'tc_12',
        toolName: 'send_message',
        inputs: { message: 'Hello' },
        status: 'pending',
        createdAt: new Date(),
      };

      // Leasing agent should be blocked
      const leasingContext: PolicyCheckContext = {
        agentType: 'leasing',
        tenantId: 'tenant_1',
        toolName: 'send_message',
        inputs: toolCall.inputs,
      };

      const leasingResult = await gate.checkToolCall(toolCall, leasingContext);
      expect(leasingResult.allowed).toBe(false);
      expect(leasingResult.blockedByKillSwitch).toBe(true);

      // Maintenance agent should not be blocked
      const maintenanceContext: PolicyCheckContext = {
        agentType: 'maintenance',
        tenantId: 'tenant_1',
        toolName: 'send_message',
        inputs: toolCall.inputs,
      };

      const maintenanceResult = await gate.checkToolCall(toolCall, maintenanceContext);
      expect(maintenanceResult.blockedByKillSwitch).toBe(false);
    });

    it('should block specific tools when tool kill switch is active', async () => {
      killSwitchManager.activate({
        id: 'ks_3',
        scope: 'tool',
        scopeValue: 'send_payment',
        activatedBy: 'admin',
        reason: 'Payment issues',
      });

      // send_payment should be blocked
      const paymentCall: ToolCall = {
        id: 'tc_13',
        toolName: 'send_payment',
        inputs: { amount: 100 },
        status: 'pending',
        createdAt: new Date(),
      };

      const paymentResult = await gate.checkToolCall(paymentCall, {
        agentType: 'leasing',
        tenantId: 'tenant_1',
        toolName: 'send_payment',
        inputs: paymentCall.inputs,
      });

      expect(paymentResult.allowed).toBe(false);
      expect(paymentResult.blockedByKillSwitch).toBe(true);

      // Other tools should work
      const messageCall: ToolCall = {
        id: 'tc_14',
        toolName: 'send_message',
        inputs: { message: 'Hello' },
        status: 'pending',
        createdAt: new Date(),
      };

      const messageResult = await gate.checkToolCall(messageCall, {
        agentType: 'leasing',
        tenantId: 'tenant_1',
        toolName: 'send_message',
        inputs: messageCall.inputs,
      });

      expect(messageResult.blockedByKillSwitch).toBe(false);
    });
  });

  describe('Rule Management', () => {
    it('should add and remove rules dynamically', () => {
      const initialRuleCount = gate.getRules().length;

      gate.addRule({
        id: 'custom_rule_1',
        name: 'Custom Rule',
        description: 'A custom rule',
        category: 'compliance',
        severity: 'warning',
        enabled: true,
        check: () => Promise.resolve({ passed: true, violations: [] }),
      });

      expect(gate.getRules().length).toBe(initialRuleCount + 1);

      gate.removeRule('custom_rule_1');
      expect(gate.getRules().length).toBe(initialRuleCount);
    });

    it('should enable and disable rules', () => {
      const rules = gate.getRules();
      const firstRule = rules[0];

      if (firstRule) {
        gate.disableRule(firstRule.id);
        expect(gate.getRules().find((r) => r.id === firstRule.id)?.enabled).toBe(false);

        gate.enableRule(firstRule.id);
        expect(gate.getRules().find((r) => r.id === firstRule.id)?.enabled).toBe(true);
      }
    });
  });
});

describe('FCHA Rules', () => {
  const fchaRules = createFchaRules();

  it('should create all required FCHA rules', () => {
    expect(fchaRules.length).toBeGreaterThan(0);

    const ruleIds = fchaRules.map((r) => r.id);
    expect(ruleIds).toContain('fcha_discriminatory_language');
    expect(ruleIds).toContain('fcha_steering');
    expect(ruleIds).toContain('fcha_stage_questions');
    expect(ruleIds).toContain('fcha_source_of_income');
  });

  it('should have correct severity for discriminatory language rule', () => {
    const rule = fchaRules.find((r) => r.id === 'fcha_discriminatory_language');
    expect(rule?.severity).toBe('critical');
  });
});

describe('Fee Compliance Rules', () => {
  const feeRules = createFeeComplianceRules();

  it('should create all required fee rules', () => {
    expect(feeRules.length).toBeGreaterThan(0);

    const ruleIds = feeRules.map((r) => r.id);
    expect(ruleIds).toContain('fee_application_limit');
    expect(ruleIds).toContain('fee_security_deposit_limit');
    expect(ruleIds).toContain('fee_broker_prohibition');
    expect(ruleIds).toContain('fee_patterns');
  });
});

describe('Market Rules', () => {
  const marketRules = createMarketRules();

  it('should create all required market rules', () => {
    expect(marketRules.length).toBeGreaterThan(0);

    const ruleIds = marketRules.map((r) => r.id);
    expect(ruleIds).toContain('market_required_disclosures');
    expect(ruleIds).toContain('market_occupancy_limits');
    expect(ruleIds).toContain('market_rent_control');
  });
});
