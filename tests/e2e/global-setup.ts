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

  // Wait for API to be ready
  const maxRetries = 30;
  let ready = false;

  for (let i = 0; i < maxRetries && !ready; i++) {
    try {
      const response = await fetch(`${apiUrl}/health`);
      if (response.ok) {
        ready = true;
        console.log('  API health check: OK');
      }
    } catch {
      console.log(`  Waiting for API... (${i + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  if (!ready) {
    throw new Error('API failed to become ready');
  }

  // Initialize test environment
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

  console.log('='.repeat(60));
  console.log('  Setup complete');
  console.log('='.repeat(60));
}

export default globalSetup;
