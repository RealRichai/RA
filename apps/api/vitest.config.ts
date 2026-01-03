import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    // Exclude tests that need separate configs (no mocks or isolated mocks)
    exclude: [
      'tests/persistence-guard.test.ts',
      'tests/transactions.test.ts',
      'tests/transactions-integration.test.ts',
      'tests/metrics.test.ts',
      'tests/otel.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      exclude: ['node_modules', 'dist', 'tests'],
    },
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10000,
  },
});
