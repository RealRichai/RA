/**
 * Global Teardown for E2E Tests
 *
 * Runs once after all tests to:
 * - Clean up test data
 * - Generate final report
 */

import { FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

async function globalTeardown(config: FullConfig): Promise<void> {
  console.log('='.repeat(60));
  console.log('  E2E Global Teardown');
  console.log('='.repeat(60));

  // Ensure reports directory exists
  const reportsDir = path.join(process.cwd(), 'tests/e2e/reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  console.log('  Reports directory: ', reportsDir);
  console.log('='.repeat(60));
  console.log('  Teardown complete');
  console.log('='.repeat(60));
}

export default globalTeardown;
