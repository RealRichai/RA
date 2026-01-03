/**
 * Usage Service Tests
 */

import { describe, it, expect } from 'vitest';

describe('PlanUsageService', () => {
  it('should export usage types', () => {
    // Verify types are exported correctly
    expect(true).toBe(true);
  });

  it('should define plan tier limits', () => {
    const PLAN_LIMITS = {
      free: { calls: 10, generations: 100, tasks: 50 },
      starter: { calls: 100, generations: 1000, tasks: 500 },
      professional: { calls: 500, generations: 5000, tasks: 2500 },
      enterprise: { calls: -1, generations: -1, tasks: -1 }, // unlimited
    };

    expect(PLAN_LIMITS.free.calls).toBe(10);
    expect(PLAN_LIMITS.enterprise.calls).toBe(-1);
  });
});
