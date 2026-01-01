/**
 * Vitest Configuration for Acceptance Tests
 *
 * Separate config for production-readiness acceptance tests.
 * Run with: vitest run -c vitest.acceptance.config.ts
 */

import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/acceptance/**/*.test.ts'],
    exclude: ['tests/acceptance/**/*.skip.ts'],
    reporters: ['default', 'json'],
    outputFile: {
      json: './reports/vitest-acceptance.json',
    },
    testTimeout: 30000,
    hookTimeout: 30000,
    // No setup file - acceptance tests are self-contained
    // and test against actual implementations
    passWithNoTests: false,
    // Fail fast on acceptance tests
    bail: 0,
    // Single thread for deterministic ordering
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      '@realriches/compliance-engine': resolve(__dirname, '../../packages/compliance-engine'),
    },
  },
});
