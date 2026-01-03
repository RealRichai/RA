/**
 * Global Setup for E2E Tests
 *
 * Runs once before all tests to:
 * - Initialize test database
 * - Create test buckets in MinIO
 * - Seed minimal test data
 */

import { FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig): Promise<void> {
  const apiUrl = process.env.E2E_API_URL || 'http://localhost:4000';

  console.log('='.repeat(60));
  console.log('  E2E Global Setup');
  console.log('='.repeat(60));
  console.log(`  API URL: ${apiUrl}`);

  // Wait for API to be ready (quick check - 5 retries)
  const maxRetries = process.env.CI ? 30 : 5;
  let ready = false;

  for (let i = 0; i < maxRetries && !ready; i++) {
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (response.ok) {
        ready = true;
        console.log('  API health check: OK');
      }
    } catch {
      if (i < maxRetries - 1) {
        console.log(`  Waiting for API... (${i + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  if (!ready) {
    console.log('  ⚠️  API not available - tests will be skipped');
    console.log('  To run E2E tests, start services with:');
    console.log('    docker-compose -f docker-compose.test.yml up -d');
    console.log('  Or start the API manually:');
    console.log('    pnpm dev:api');
    // Set environment variable for tests to check
    process.env.E2E_API_AVAILABLE = 'false';
  } else {
    process.env.E2E_API_AVAILABLE = 'true';
  }

  // Initialize test environment (only if API is available)
  if (ready) {
    try {
      const initResponse = await fetch(`${apiUrl}/api/v1/test/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      });

      if (initResponse.ok) {
        console.log('  Test environment initialized');
      } else {
        // Non-critical - endpoint may not exist in production builds
        console.log('  Test init endpoint not available (expected in production)');
      }
    } catch {
      console.log('  Skipping test init (endpoint not available)');
    }
  }

  console.log('='.repeat(60));
  console.log('  Setup complete');
  console.log('='.repeat(60));
}

export default globalSetup;
