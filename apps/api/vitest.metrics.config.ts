import { defineConfig } from 'vitest/config';

/**
 * Vitest config for metrics endpoint tests.
 *
 * This config runs metrics tests in isolation without loading
 * the global setup.ts which triggers database initialization.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/metrics.test.ts'],
    // No setupFiles - these tests mock all dependencies
    testTimeout: 10000,
  },
});
