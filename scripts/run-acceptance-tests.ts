#!/usr/bin/env npx tsx
/**
 * Acceptance Test Runner
 *
 * Executes acceptance tests and generates machine-readable report.
 * Usage: npx tsx scripts/run-acceptance-tests.ts
 *
 * Output: apps/api/reports/acceptance-report.json
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const API_DIR = join(__dirname, '../apps/api');
const REPORTS_DIR = join(API_DIR, 'reports');
const REPORT_PATH = join(REPORTS_DIR, 'acceptance-report.json');

async function runAcceptanceTests(): Promise<number> {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║        PRODUCTION READINESS ACCEPTANCE TESTS               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  // Ensure reports directory exists
  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }

  // Run vitest with acceptance config
  const vitest = spawn(
    'npx',
    ['vitest', 'run', '-c', 'vitest.acceptance.config.ts'],
    {
      cwd: API_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
      },
    }
  );

  return new Promise((resolve) => {
    vitest.on('close', (code) => {
      console.log();

      // Check if report was generated
      if (existsSync(REPORT_PATH)) {
        try {
          const report = JSON.parse(readFileSync(REPORT_PATH, 'utf-8'));
          printReportSummary(report);
        } catch (err) {
          console.error('Failed to parse acceptance report:', err);
        }
      } else {
        console.error('Warning: Acceptance report not found at', REPORT_PATH);
      }

      resolve(code ?? 1);
    });

    vitest.on('error', (err) => {
      console.error('Failed to run acceptance tests:', err);
      resolve(1);
    });
  });
}

interface AcceptanceReport {
  version: string;
  timestamp: string;
  overall: {
    pass: boolean;
    passCount: number;
    failCount: number;
    duration: number;
  };
  categories: Record<string, { passed: boolean; passCount: number; failCount: number }>;
  checks: Array<{
    id: string;
    category: string;
    name: string;
    passed: boolean;
    severity: string;
  }>;
  metadata: {
    gitCommit?: string;
    gitBranch?: string;
    nodeVersion: string;
  };
}

function printReportSummary(report: AcceptanceReport): void {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                    ACCEPTANCE REPORT                       ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log();

  const statusIcon = report.overall.pass ? '✓' : '✗';
  const statusText = report.overall.pass ? 'PASS' : 'FAIL';
  const statusColor = report.overall.pass ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';

  console.log(`  Overall Status: ${statusColor}${statusIcon} ${statusText}${reset}`);
  console.log(`  Tests Passed:   ${report.overall.passCount}/${report.overall.passCount + report.overall.failCount}`);
  console.log(`  Duration:       ${report.overall.duration}ms`);
  console.log(`  Generated:      ${report.timestamp}`);
  console.log();

  console.log('  Categories:');
  console.log('  ────────────────────────────────────────────────────────────');

  for (const [category, summary] of Object.entries(report.categories)) {
    const catIcon = summary.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    const total = summary.passCount + summary.failCount;
    console.log(`    ${catIcon} ${category.padEnd(25)} ${summary.passCount}/${total}`);
  }

  // Show failed checks if any
  const failedChecks = report.checks.filter((c) => !c.passed);
  if (failedChecks.length > 0) {
    console.log();
    console.log('  \x1b[31mFailed Checks:\x1b[0m');
    console.log('  ────────────────────────────────────────────────────────────');
    for (const check of failedChecks) {
      console.log(`    ✗ [${check.id}] ${check.name}`);
      console.log(`      Category: ${check.category}, Severity: ${check.severity}`);
    }
  }

  console.log();
  console.log('  ────────────────────────────────────────────────────────────');
  console.log(`  Report: ${REPORT_PATH}`);
  console.log();

  // Print metadata
  if (report.metadata.gitCommit || report.metadata.gitBranch) {
    console.log('  Metadata:');
    if (report.metadata.gitCommit) {
      console.log(`    Git Commit: ${report.metadata.gitCommit.slice(0, 8)}`);
    }
    if (report.metadata.gitBranch) {
      console.log(`    Git Branch: ${report.metadata.gitBranch}`);
    }
    console.log(`    Node:       ${report.metadata.nodeVersion}`);
    console.log();
  }
}

// Run
runAcceptanceTests()
  .then((code) => {
    process.exit(code);
  })
  .catch((err) => {
    console.error('Unexpected error:', err);
    process.exit(1);
  });
