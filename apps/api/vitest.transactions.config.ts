import { defineConfig } from 'vitest/config';

/**
 * Separate vitest config for transaction wrapper tests.
 * These tests need access to real Prisma types without mocking.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/transactions.test.ts'],
    // No setupFiles - transaction tests need real Prisma exports
    testTimeout: 10000,
  },
});
