/**
 * Acceptance Test Types
 *
 * Type definitions for production-readiness acceptance reports.
 */

export type CheckCategory =
  | 'compliance_fare_act'
  | 'compliance_fcha'
  | 'auth_security'
  | 'audit_append_only'
  | 'evidence_soc2';

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface CheckResult {
  id: string;
  category: CheckCategory;
  name: string;
  passed: boolean;
  severity: Severity;
  duration: number;
  evidence?: Record<string, unknown>;
  error?: string;
}

export interface CategorySummary {
  passed: boolean;
  passCount: number;
  failCount: number;
  checks: string[];
}

export interface AcceptanceReport {
  version: string;
  timestamp: string;
  overall: {
    pass: boolean;
    passCount: number;
    failCount: number;
    duration: number;
  };
  categories: Record<CheckCategory, CategorySummary>;
  checks: CheckResult[];
  metadata: {
    gitCommit?: string;
    gitBranch?: string;
    nodeVersion: string;
  };
}

/**
 * Test context for collecting evidence during test execution
 */
export interface TestContext {
  results: CheckResult[];
  startTime: number;
}

/**
 * Create a new test context
 */
export function createTestContext(): TestContext {
  return {
    results: [],
    startTime: Date.now(),
  };
}

/**
 * Record a check result
 */
export function recordCheck(
  context: TestContext,
  check: Omit<CheckResult, 'duration'>,
  startTime: number
): void {
  context.results.push({
    ...check,
    duration: Date.now() - startTime,
  });
}

/**
 * Generate acceptance report from test context
 */
export function generateReport(context: TestContext): AcceptanceReport {
  const categories: Record<CheckCategory, CategorySummary> = {
    compliance_fare_act: { passed: true, passCount: 0, failCount: 0, checks: [] },
    compliance_fcha: { passed: true, passCount: 0, failCount: 0, checks: [] },
    auth_security: { passed: true, passCount: 0, failCount: 0, checks: [] },
    audit_append_only: { passed: true, passCount: 0, failCount: 0, checks: [] },
    evidence_soc2: { passed: true, passCount: 0, failCount: 0, checks: [] },
  };

  for (const check of context.results) {
    const category = categories[check.category];
    category.checks.push(check.id);
    if (check.passed) {
      category.passCount++;
    } else {
      category.failCount++;
      category.passed = false;
    }
  }

  const passCount = context.results.filter((c) => c.passed).length;
  const failCount = context.results.filter((c) => !c.passed).length;

  return {
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    overall: {
      pass: failCount === 0,
      passCount,
      failCount,
      duration: Date.now() - context.startTime,
    },
    categories,
    checks: context.results,
    metadata: {
      gitCommit: process.env.GITHUB_SHA || undefined,
      gitBranch: process.env.GITHUB_REF_NAME || undefined,
      nodeVersion: process.version,
    },
  };
}
