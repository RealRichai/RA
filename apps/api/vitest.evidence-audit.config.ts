import { defineConfig } from 'vitest/config';

/**
 * Minimal vitest config for evidence-audit unit tests.
 *
 * This config runs only the pure unit tests without loading setup.ts,
 * which would trigger database initialization even with mocks.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/evidence-audit.test.ts'],
    // No setupFiles - these are pure unit tests
    testTimeout: 10000,
  },
});
