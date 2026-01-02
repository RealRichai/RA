import { defineConfig } from 'vitest/config';

/**
 * Separate vitest config for persistence-guard tests.
 * These tests use static file analysis and don't need database mocks.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/persistence-guard.test.ts'],
    // No setupFiles - persistence guard tests are standalone
    testTimeout: 10000,
  },
});
