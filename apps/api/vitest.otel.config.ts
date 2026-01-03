import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/otel.test.ts'],
    testTimeout: 10000,
    // No setupFiles - these tests need fresh module imports
  },
});
