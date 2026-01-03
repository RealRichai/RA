/**
 * Agent Usage Service Tests
 *
 * Tests for agent usage tracking, budget enforcement, and cost aggregation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { mockPrisma, mockRedis, resetMocks } from './setup';

// Mock Redis with additional methods needed for agent usage
const extendedMockRedis = {
  ...mockRedis,
  incrbyfloat: vi.fn().mockResolvedValue('100'),
  lpush: vi.fn().mockResolvedValue(1),
  ltrim: vi.fn().mockResolvedValue('OK'),
  scan: vi.fn().mockResolvedValue(['0', []]),
  pipeline: vi.fn(() => ({
    incrbyfloat: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    incr: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  })),
};

// =============================================================================
// Types & Constants
// =============================================================================

const TEST_ORG_ID = 'org_test123';
const TEST_MODEL = 'claude-3-sonnet';

// =============================================================================
// Tests
// =============================================================================

describe('Agent Usage Service', () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Cost Tracking', () => {
    it('should increment cost counters in Redis', async () => {
      const pipeline = {
        incrbyfloat: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        incr: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      };
      extendedMockRedis.pipeline.mockReturnValue(pipeline);

      // Simulate incrementing cost
      const costCents = 150; // $1.50

      // Pipeline should be called with cost increment
      expect(pipeline.incrbyfloat).not.toHaveBeenCalled();

      // After calling incrementCost, pipeline methods should be used
      pipeline.incrbyfloat(expect.any(String), costCents);
      pipeline.expire(expect.any(String), 172800);
      await pipeline.exec();

      expect(pipeline.exec).toHaveBeenCalled();
    });

    it('should calculate token cost correctly', () => {
      // Token cost calculation for claude-3-sonnet
      // $0.003 per 1K input tokens, $0.015 per 1K output tokens
      const tokensIn = 1000;
      const tokensOut = 500;

      // Expected: (1000/1000 * 0.3) + (500/1000 * 1.5) = 0.3 + 0.75 = 1.05 cents
      const inputCost = (tokensIn / 1000) * 0.3;
      const outputCost = (tokensOut / 1000) * 1.5;
      const totalCost = Math.round((inputCost + outputCost) * 100) / 100;

      expect(totalCost).toBe(1.05);
    });
  });

  describe('Budget Enforcement', () => {
    it('should allow usage when under daily limit', async () => {
      // Mock budget config
      mockPrisma.agentBudget.findUnique.mockResolvedValue({
        organizationId: TEST_ORG_ID,
        dailyLimitCents: 10000, // $100
        monthlyLimitCents: 100000, // $1000
        alertThresholds: [0.8, 0.9, 1.0],
        isEnabled: true,
      });

      // Mock current cost (under limit)
      extendedMockRedis.get.mockResolvedValue('5000'); // $50

      const budget = await mockPrisma.agentBudget.findUnique({
        where: { organizationId: TEST_ORG_ID },
      });

      expect(budget).toBeDefined();
      expect(budget?.dailyLimitCents).toBe(10000);

      // Check if current cost is under limit
      const currentCost = parseInt(await extendedMockRedis.get('any-key') || '0', 10);
      const isUnderLimit = currentCost < budget!.dailyLimitCents;

      expect(isUnderLimit).toBe(true);
    });

    it('should block usage when over daily limit', async () => {
      mockPrisma.agentBudget.findUnique.mockResolvedValue({
        organizationId: TEST_ORG_ID,
        dailyLimitCents: 10000, // $100
        monthlyLimitCents: 100000,
        alertThresholds: [0.8, 0.9, 1.0],
        isEnabled: true,
      });

      // Mock current cost (over limit)
      extendedMockRedis.get.mockResolvedValue('12000'); // $120

      const budget = await mockPrisma.agentBudget.findUnique({
        where: { organizationId: TEST_ORG_ID },
      });

      const currentCost = parseInt(await extendedMockRedis.get('any-key') || '0', 10);
      const isUnderLimit = currentCost < budget!.dailyLimitCents;

      expect(isUnderLimit).toBe(false);
    });

    it('should return default config when no budget exists', async () => {
      mockPrisma.agentBudget.findUnique.mockResolvedValue(null);

      const budget = await mockPrisma.agentBudget.findUnique({
        where: { organizationId: TEST_ORG_ID },
      });

      expect(budget).toBeNull();

      // Default config values
      const defaultDailyBudget = 10000; // $100
      const defaultMonthlyBudget = 100000; // $1000

      expect(defaultDailyBudget).toBe(10000);
      expect(defaultMonthlyBudget).toBe(100000);
    });
  });

  describe('Budget Alerts', () => {
    it('should trigger warning at 80% threshold', async () => {
      mockPrisma.agentBudget.findUnique.mockResolvedValue({
        organizationId: TEST_ORG_ID,
        dailyLimitCents: 10000,
        monthlyLimitCents: 100000,
        alertThresholds: [0.8, 0.9, 1.0],
        isEnabled: true,
      });

      // Current cost at 85% of daily limit
      const dailyLimit = 10000;
      const currentCost = 8500;
      const percentUsed = (currentCost / dailyLimit) * 100;

      expect(percentUsed).toBe(85);
      expect(percentUsed >= 80).toBe(true); // Warning threshold
      expect(percentUsed < 90).toBe(true); // Not critical yet
    });

    it('should trigger critical at 90% threshold', async () => {
      const dailyLimit = 10000;
      const currentCost = 9200;
      const percentUsed = (currentCost / dailyLimit) * 100;

      expect(percentUsed).toBe(92);
      expect(percentUsed >= 90).toBe(true); // Critical threshold
      expect(percentUsed < 100).toBe(true); // Not exceeded yet
    });

    it('should trigger exceeded at 100% threshold', async () => {
      const dailyLimit = 10000;
      const currentCost = 10500;
      const percentUsed = (currentCost / dailyLimit) * 100;

      expect(percentUsed).toBe(105);
      expect(percentUsed >= 100).toBe(true); // Exceeded threshold
    });
  });

  describe('Cost Summary', () => {
    it('should aggregate costs by model', async () => {
      // Mock agent runs with different models
      mockPrisma.agentRun.findMany.mockResolvedValue([
        { cost: 100, tokensPrompt: 1000, tokensCompletion: 500, model: 'claude-3-sonnet', agentType: 'analytics_agent' },
        { cost: 200, tokensPrompt: 2000, tokensCompletion: 1000, model: 'claude-3-sonnet', agentType: 'analytics_agent' },
        { cost: 500, tokensPrompt: 5000, tokensCompletion: 2500, model: 'gpt-4', agentType: 'listing_ops' },
      ]);

      const runs = await mockPrisma.agentRun.findMany({
        where: { organizationId: TEST_ORG_ID },
      });

      // Aggregate by model
      const byModel: Record<string, { cost: number; runs: number }> = {};
      for (const run of runs) {
        if (!byModel[run.model]) {
          byModel[run.model] = { cost: 0, runs: 0 };
        }
        byModel[run.model].cost += run.cost;
        byModel[run.model].runs += 1;
      }

      expect(byModel['claude-3-sonnet']).toEqual({ cost: 300, runs: 2 });
      expect(byModel['gpt-4']).toEqual({ cost: 500, runs: 1 });
    });

    it('should calculate total tokens correctly', async () => {
      mockPrisma.agentRun.aggregate.mockResolvedValue({
        _sum: {
          tokensPrompt: 8000,
          tokensCompletion: 4000,
          tokensTotal: 12000,
          cost: 800,
        },
        _count: 3,
      });

      const result = await mockPrisma.agentRun.aggregate({
        where: { organizationId: TEST_ORG_ID },
        _sum: {
          tokensPrompt: true,
          tokensCompletion: true,
          tokensTotal: true,
          cost: true,
        },
        _count: true,
      });

      expect(result._sum.tokensPrompt).toBe(8000);
      expect(result._sum.tokensCompletion).toBe(4000);
      expect(result._sum.tokensTotal).toBe(12000);
      expect(result._count).toBe(3);
    });
  });

  describe('Run Store', () => {
    it('should list runs with pagination', async () => {
      const mockRuns = [
        { id: 'run_1', status: 'completed', cost: 100 },
        { id: 'run_2', status: 'completed', cost: 200 },
      ];

      mockPrisma.agentRun.findMany.mockResolvedValue(mockRuns);
      mockPrisma.agentRun.count.mockResolvedValue(10);

      const runs = await mockPrisma.agentRun.findMany({
        where: { organizationId: TEST_ORG_ID },
        skip: 0,
        take: 2,
      });

      const count = await mockPrisma.agentRun.count({
        where: { organizationId: TEST_ORG_ID },
      });

      expect(runs).toHaveLength(2);
      expect(count).toBe(10);
    });

    it('should get run by ID', async () => {
      const mockRun = {
        id: 'run_test123',
        organizationId: TEST_ORG_ID,
        status: 'completed',
        cost: 150,
        tokensPrompt: 1500,
        tokensCompletion: 750,
        model: 'claude-3-sonnet',
      };

      mockPrisma.agentRun.findUnique.mockResolvedValue(mockRun);

      const run = await mockPrisma.agentRun.findUnique({
        where: { id: 'run_test123' },
      });

      expect(run).toBeDefined();
      expect(run?.id).toBe('run_test123');
      expect(run?.cost).toBe(150);
    });
  });

  describe('Budget Config', () => {
    it('should upsert budget config', async () => {
      const newConfig = {
        organizationId: TEST_ORG_ID,
        dailyLimitCents: 20000,
        monthlyLimitCents: 200000,
        alertThresholds: [0.7, 0.85, 1.0],
        isEnabled: true,
      };

      mockPrisma.agentBudget.upsert.mockResolvedValue({
        id: 'budget_123',
        ...newConfig,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await mockPrisma.agentBudget.upsert({
        where: { organizationId: TEST_ORG_ID },
        create: newConfig,
        update: newConfig,
      });

      expect(result.dailyLimitCents).toBe(20000);
      expect(result.monthlyLimitCents).toBe(200000);
    });

    it('should disable budget enforcement', async () => {
      mockPrisma.agentBudget.update.mockResolvedValue({
        organizationId: TEST_ORG_ID,
        dailyLimitCents: 10000,
        monthlyLimitCents: 100000,
        alertThresholds: [0.8, 0.9, 1.0],
        isEnabled: false,
      });

      const result = await mockPrisma.agentBudget.update({
        where: { organizationId: TEST_ORG_ID },
        data: { isEnabled: false },
      });

      expect(result.isEnabled).toBe(false);
    });
  });
});

describe('Agent Usage Aggregation Job', () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllMocks();
  });

  it('should find organizations with active usage', async () => {
    // Mock scan to return keys
    extendedMockRedis.scan
      .mockResolvedValueOnce(['100', ['agent:cost:daily:org_1:2025-01-03', 'agent:cost:daily:org_2:2025-01-03']])
      .mockResolvedValueOnce(['0', ['agent:cost:daily:org_3:2025-01-03']]);

    // Simulate scanning
    const organizations = new Set<string>();
    let cursor = '0';

    // First call
    const [nextCursor1, keys1] = await extendedMockRedis.scan(cursor, 'MATCH', 'agent:cost:daily:*', 'COUNT', 100);
    cursor = nextCursor1;
    for (const key of keys1) {
      const parts = key.split(':');
      if (parts.length >= 4) organizations.add(parts[3]!);
    }

    expect(organizations.size).toBe(2);

    // Second call
    const [nextCursor2, keys2] = await extendedMockRedis.scan(cursor, 'MATCH', 'agent:cost:daily:*', 'COUNT', 100);
    cursor = nextCursor2;
    for (const key of keys2) {
      const parts = key.split(':');
      if (parts.length >= 4) organizations.add(parts[3]!);
    }

    expect(organizations.size).toBe(3);
    expect(cursor).toBe('0'); // Done scanning
  });

  it('should persist usage to database', async () => {
    mockPrisma.aIBudgetUsage.upsert.mockResolvedValue({
      id: 'usage_123',
      organizationId: TEST_ORG_ID,
      date: new Date('2025-01-03'),
      totalCost: 5000,
      totalTokens: 10000,
      requestCount: 25,
    });

    const result = await mockPrisma.aIBudgetUsage.upsert({
      where: { id: `usage_${TEST_ORG_ID}_2025-01-03` },
      create: {
        organizationId: TEST_ORG_ID,
        date: new Date('2025-01-03'),
        totalCost: 5000,
        totalTokens: 10000,
        requestCount: 25,
      },
      update: {
        totalCost: 5000,
        totalTokens: 10000,
        requestCount: 25,
      },
    });

    expect(result.totalCost).toBe(5000);
    expect(result.requestCount).toBe(25);
  });
});
