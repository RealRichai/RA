/**
 * Agent Run Integration Tests
 *
 * Tests for agent run lifecycle, tool call tracking, and cost accounting.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  AgentRunManager,
  InMemoryAgentRunStore,
  hashInputs,
} from '../src/runtime/agent-run';
import { redactAgentRun, detectPII } from '../src/runtime/redaction';
import type { AgentRun } from '../src/types';

describe('AgentRunManager', () => {
  let manager: AgentRunManager;
  let store: InMemoryAgentRunStore;

  beforeEach(() => {
    store = new InMemoryAgentRunStore();
    manager = new AgentRunManager({
      store,
      policyVersion: '1.0.0',
    });
  });

  describe('Run Lifecycle', () => {
    it('should start a new agent run', async () => {
      const result = await manager.startRun({
        requestId: 'req_1',
        agentType: 'leasing',
        modelId: 'gpt-4',
        tenantId: 'tenant_1',
        inputs: { query: 'Find apartments' },
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data.status).toBe('running');
        expect(result.data.agentType).toBe('leasing');
        expect(result.data.policyVersion).toBe('1.0.0');
      }
    });

    it('should complete a run successfully', async () => {
      const startResult = await manager.startRun({
        requestId: 'req_2',
        agentType: 'leasing',
        modelId: 'gpt-4',
        tenantId: 'tenant_1',
        inputs: { query: 'Find apartments' },
      });

      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const run = startResult.data;

      const completeResult = await manager.completeRun(run.id, {
        success: true,
        result: { apartments: ['apt_1', 'apt_2'] },
      });

      expect(completeResult.ok).toBe(true);
      if (completeResult.ok) {
        expect(completeResult.data.status).toBe('completed');
        expect(completeResult.data.outcome?.success).toBe(true);
        expect(completeResult.data.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should fail a run with error', async () => {
      const startResult = await manager.startRun({
        requestId: 'req_3',
        agentType: 'leasing',
        modelId: 'gpt-4',
        tenantId: 'tenant_1',
        inputs: {},
      });

      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const failResult = await manager.failRun(
        startResult.data.id,
        new Error('API timeout')
      );

      expect(failResult.ok).toBe(true);
      if (failResult.ok) {
        expect(failResult.data.status).toBe('failed');
        expect(failResult.data.outcome?.success).toBe(false);
        expect(failResult.data.outcome?.summaryForHuman).toContain('API timeout');
      }
    });

    it('should mark a run as policy blocked', async () => {
      const startResult = await manager.startRun({
        requestId: 'req_4',
        agentType: 'leasing',
        modelId: 'gpt-4',
        tenantId: 'tenant_1',
        inputs: {},
      });

      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const blockResult = await manager.blockRun(
        startResult.data.id,
        'Discriminatory content detected'
      );

      expect(blockResult.ok).toBe(true);
      if (blockResult.ok) {
        expect(blockResult.data.status).toBe('policy_blocked');
      }
    });
  });

  describe('Tool Call Tracking', () => {
    it('should track tool calls', async () => {
      const startResult = await manager.startRun({
        requestId: 'req_5',
        agentType: 'leasing',
        modelId: 'gpt-4',
        tenantId: 'tenant_1',
        inputs: {},
      });

      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const run = startResult.data;

      // Add a tool call
      const toolCallResult = manager.addToolCall(run, {
        toolName: 'search_properties',
        inputs: { location: 'San Francisco' },
      });

      expect(toolCallResult.ok).toBe(true);
      expect(run.toolCalls.length).toBe(1);
      expect(run.toolCalls[0]!.toolName).toBe('search_properties');
      expect(run.toolCalls[0]!.status).toBe('pending');
    });

    it('should approve and complete tool calls', async () => {
      const startResult = await manager.startRun({
        requestId: 'req_6',
        agentType: 'leasing',
        modelId: 'gpt-4',
        tenantId: 'tenant_1',
        inputs: {},
      });

      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const run = startResult.data;

      const toolCallResult = manager.addToolCall(run, {
        toolName: 'search_properties',
        inputs: { location: 'SF' },
      });

      expect(toolCallResult.ok).toBe(true);
      if (!toolCallResult.ok) return;

      const toolCallId = toolCallResult.data.id;

      // Approve
      const approveResult = manager.approveToolCall(run, toolCallId, {
        policyVersion: '1.0.0',
      });
      expect(approveResult.ok).toBe(true);
      expect(run.toolCalls[0]!.status).toBe('approved');

      // Complete
      const completeResult = manager.completeToolCall(run, toolCallId, {
        output: { properties: ['prop_1', 'prop_2'] },
        costUsd: 0.01,
      });
      expect(completeResult.ok).toBe(true);
      expect(run.toolCalls[0]!.status).toBe('executed');
      expect(run.toolCalls[0]!.output).toEqual({ properties: ['prop_1', 'prop_2'] });
    });

    it('should block tool calls', async () => {
      const startResult = await manager.startRun({
        requestId: 'req_7',
        agentType: 'leasing',
        modelId: 'gpt-4',
        tenantId: 'tenant_1',
        inputs: {},
      });

      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const run = startResult.data;

      const toolCallResult = manager.addToolCall(run, {
        toolName: 'send_message',
        inputs: { message: 'Discriminatory content' },
      });

      expect(toolCallResult.ok).toBe(true);
      if (!toolCallResult.ok) return;

      const blockResult = manager.blockToolCall(run, toolCallResult.data.id, {
        policyVersion: '1.0.0',
        violations: [
          {
            ruleId: 'fcha_discriminatory',
            severity: 'critical',
            message: 'Discriminatory content detected',
            timestamp: new Date(),
          },
        ],
      });

      expect(blockResult.ok).toBe(true);
      expect(run.toolCalls[0]!.status).toBe('blocked');
      expect(run.policyViolations.length).toBe(1);
    });

    it('should fail tool calls', async () => {
      const startResult = await manager.startRun({
        requestId: 'req_8',
        agentType: 'leasing',
        modelId: 'gpt-4',
        tenantId: 'tenant_1',
        inputs: {},
      });

      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const run = startResult.data;

      const toolCallResult = manager.addToolCall(run, {
        toolName: 'external_api',
        inputs: {},
      });

      expect(toolCallResult.ok).toBe(true);
      if (!toolCallResult.ok) return;

      // First approve it
      manager.approveToolCall(run, toolCallResult.data.id, { policyVersion: '1.0.0' });

      // Then fail it
      const failResult = manager.failToolCall(run, toolCallResult.data.id, {
        error: new Error('API unavailable'),
      });

      expect(failResult.ok).toBe(true);
      expect(run.toolCalls[0]!.status).toBe('failed');
      expect(run.toolCalls[0]!.error).toBe('API unavailable');
    });
  });

  describe('Prompt Tracking', () => {
    it('should add prompts to the run', async () => {
      const startResult = await manager.startRun({
        requestId: 'req_9',
        agentType: 'leasing',
        modelId: 'gpt-4',
        tenantId: 'tenant_1',
        inputs: {},
      });

      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const run = startResult.data;

      manager.addPrompt(run, {
        role: 'system',
        content: 'You are a helpful leasing agent.',
        tokenCount: 10,
      });

      manager.addPrompt(run, {
        role: 'user',
        content: 'Find me an apartment',
        tokenCount: 5,
      });

      expect(run.prompts.length).toBe(2);
      expect(run.totalTokensIn).toBe(15);
    });
  });

  describe('Cost Tracking', () => {
    it('should calculate total cost correctly', async () => {
      const startResult = await manager.startRun({
        requestId: 'req_10',
        agentType: 'leasing',
        modelId: 'gpt-4',
        tenantId: 'tenant_1',
        inputs: {},
      });

      expect(startResult.ok).toBe(true);
      if (!startResult.ok) return;

      const run = startResult.data;

      // Add prompts
      manager.addPrompt(run, { role: 'system', content: 'System prompt', tokenCount: 100 });
      manager.addPrompt(run, { role: 'user', content: 'User message', tokenCount: 50 });

      // Add tool call with cost
      const toolResult = manager.addToolCall(run, { toolName: 'search', inputs: {} });
      if (toolResult.ok) {
        manager.approveToolCall(run, toolResult.data.id, { policyVersion: '1.0.0' });
        manager.completeToolCall(run, toolResult.data.id, {
          output: {},
          costUsd: 0.05,
        });
      }

      // Complete with output tokens
      await manager.completeRun(run.id, {
        success: true,
        result: {},
        outputTokens: 200,
      });

      // Check total cost includes token costs and tool costs
      expect(run.totalCostUsd).toBeGreaterThan(0);
    });
  });

  describe('Input Hashing', () => {
    it('should generate consistent hashes for same inputs', () => {
      const inputs1 = { query: 'test', filters: { type: 'apartment' } };
      const inputs2 = { query: 'test', filters: { type: 'apartment' } };

      const hash1 = hashInputs(inputs1);
      const hash2 = hashInputs(inputs2);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different inputs', () => {
      const inputs1 = { query: 'test1' };
      const inputs2 = { query: 'test2' };

      const hash1 = hashInputs(inputs1);
      const hash2 = hashInputs(inputs2);

      expect(hash1).not.toBe(hash2);
    });
  });
});

describe('AgentRunStore', () => {
  let store: InMemoryAgentRunStore;

  beforeEach(() => {
    store = new InMemoryAgentRunStore();
  });

  it('should save and retrieve runs', async () => {
    const run: AgentRun = {
      id: 'run_1',
      requestId: 'req_1',
      agentType: 'leasing',
      modelId: 'gpt-4',
      status: 'running',
      tenantId: 'tenant_1',
      inputsHash: 'hash_1',
      prompts: [],
      toolCalls: [],
      policyViolations: [],
      totalTokensIn: 0,
      totalTokensOut: 0,
      totalCostUsd: 0,
      policyVersion: '1.0.0',
      startedAt: new Date(),
    };

    const saveResult = await store.save(run);
    expect(saveResult.ok).toBe(true);

    const getResult = await store.get('run_1');
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.data?.id).toBe('run_1');
    }
  });

  it('should list runs by tenant', async () => {
    const run1: AgentRun = {
      id: 'run_1',
      requestId: 'req_1',
      agentType: 'leasing',
      modelId: 'gpt-4',
      status: 'completed',
      tenantId: 'tenant_1',
      inputsHash: 'hash_1',
      prompts: [],
      toolCalls: [],
      policyViolations: [],
      totalTokensIn: 0,
      totalTokensOut: 0,
      totalCostUsd: 0,
      policyVersion: '1.0.0',
      startedAt: new Date(),
    };

    const run2: AgentRun = {
      id: 'run_2',
      requestId: 'req_2',
      agentType: 'maintenance',
      modelId: 'gpt-4',
      status: 'completed',
      tenantId: 'tenant_2',
      inputsHash: 'hash_2',
      prompts: [],
      toolCalls: [],
      policyViolations: [],
      totalTokensIn: 0,
      totalTokensOut: 0,
      totalCostUsd: 0,
      policyVersion: '1.0.0',
      startedAt: new Date(),
    };

    await store.save(run1);
    await store.save(run2);

    const listResult = await store.list({ tenantId: 'tenant_1' });
    expect(listResult.ok).toBe(true);
    if (listResult.ok) {
      expect(listResult.data.length).toBe(1);
      expect(listResult.data[0]!.tenantId).toBe('tenant_1');
    }
  });

  it('should get runs by request ID', async () => {
    const run: AgentRun = {
      id: 'run_1',
      requestId: 'req_unique',
      agentType: 'leasing',
      modelId: 'gpt-4',
      status: 'completed',
      tenantId: 'tenant_1',
      inputsHash: 'hash_1',
      prompts: [],
      toolCalls: [],
      policyViolations: [],
      totalTokensIn: 0,
      totalTokensOut: 0,
      totalCostUsd: 0,
      policyVersion: '1.0.0',
      startedAt: new Date(),
    };

    await store.save(run);

    const result = await store.getByRequestId('req_unique');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.length).toBe(1);
      expect(result.data[0]!.requestId).toBe('req_unique');
    }
  });

  it('should count runs', async () => {
    const run1: AgentRun = {
      id: 'run_1',
      requestId: 'req_1',
      agentType: 'leasing',
      modelId: 'gpt-4',
      status: 'completed',
      tenantId: 'tenant_1',
      inputsHash: 'hash_1',
      prompts: [],
      toolCalls: [],
      policyViolations: [],
      totalTokensIn: 0,
      totalTokensOut: 0,
      totalCostUsd: 0,
      policyVersion: '1.0.0',
      startedAt: new Date(),
    };

    const run2: AgentRun = {
      id: 'run_2',
      requestId: 'req_2',
      agentType: 'leasing',
      modelId: 'gpt-4',
      status: 'failed',
      tenantId: 'tenant_1',
      inputsHash: 'hash_2',
      prompts: [],
      toolCalls: [],
      policyViolations: [],
      totalTokensIn: 0,
      totalTokensOut: 0,
      totalCostUsd: 0,
      policyVersion: '1.0.0',
      startedAt: new Date(),
    };

    await store.save(run1);
    await store.save(run2);

    const countResult = await store.count({ tenantId: 'tenant_1' });
    expect(countResult.ok).toBe(true);
    if (countResult.ok) {
      expect(countResult.data).toBe(2);
    }

    const statusCountResult = await store.count({
      tenantId: 'tenant_1',
      status: 'completed',
    });
    expect(statusCountResult.ok).toBe(true);
    if (statusCountResult.ok) {
      expect(statusCountResult.data).toBe(1);
    }
  });
});

describe('Redaction', () => {
  describe('detectPII', () => {
    it('should detect SSN patterns', () => {
      const patterns = detectPII('My SSN is 123-45-6789');
      expect(patterns.some((p) => p.type === 'ssn')).toBe(true);
    });

    it('should detect email patterns', () => {
      const patterns = detectPII('Contact me at john@example.com');
      expect(patterns.some((p) => p.type === 'email')).toBe(true);
    });

    it('should detect phone patterns', () => {
      const patterns = detectPII('Call me at 555-123-4567');
      expect(patterns.some((p) => p.type === 'phone')).toBe(true);
    });

    it('should detect credit card patterns', () => {
      const patterns = detectPII('Card: 4111 1111 1111 1111');
      expect(patterns.some((p) => p.type === 'credit_card')).toBe(true);
    });

    it('should return empty array for clean text', () => {
      const patterns = detectPII('Hello, how can I help you today?');
      expect(patterns.length).toBe(0);
    });
  });

  describe('redactAgentRun', () => {
    it('should redact PII from prompts', () => {
      const run: AgentRun = {
        id: 'run_1',
        requestId: 'req_1',
        agentType: 'leasing',
        modelId: 'gpt-4',
        status: 'completed',
        tenantId: 'tenant_1',
        inputsHash: 'hash_1',
        inputs: {},
        prompts: [
          {
            role: 'user',
            content: 'My email is john@example.com and SSN is 123-45-6789',
            redacted: false,
            tokenCount: 20,
          },
        ],
        toolCalls: [],
        policyViolations: [],
        totalTokensIn: 20,
        totalTokensOut: 0,
        totalCostUsd: 0,
        policyVersion: '1.0.0',
        startedAt: new Date(),
      };

      const { redactedRun, report } = redactAgentRun(run, 'admin');

      expect(redactedRun.prompts[0]!.content).not.toContain('john@example.com');
      expect(redactedRun.prompts[0]!.content).not.toContain('123-45-6789');
      expect(redactedRun.prompts[0]!.content).toContain('_REDACTED]');
      expect(redactedRun.prompts[0]!.redacted).toBe(true);

      expect(report.piiTypesFound.length).toBeGreaterThan(0);
      expect(report.redactedBy).toBe('admin');
    });

    it('should redact PII from tool call inputs and outputs', () => {
      const run: AgentRun = {
        id: 'run_1',
        requestId: 'req_1',
        agentType: 'leasing',
        modelId: 'gpt-4',
        status: 'completed',
        tenantId: 'tenant_1',
        inputsHash: 'hash_1',
        inputs: {},
        prompts: [],
        toolCalls: [
          {
            id: 'tc_1',
            toolName: 'lookup_tenant',
            inputs: { email: 'test@example.com' },
            inputsHash: 'hash_tc_1',
            output: { phone: '555-123-4567' },
            status: 'executed',
            costUsd: 0,
          },
        ],
        policyViolations: [],
        totalTokensIn: 0,
        totalTokensOut: 0,
        totalCostUsd: 0,
        policyVersion: '1.0.0',
        startedAt: new Date(),
      };

      const { redactedRun } = redactAgentRun(run, 'admin');

      const toolCall = redactedRun.toolCalls[0]!;
      expect(JSON.stringify(toolCall.inputs)).toContain('_REDACTED]');
      expect(JSON.stringify(toolCall.output)).toContain('_REDACTED]');
    });
  });
});
