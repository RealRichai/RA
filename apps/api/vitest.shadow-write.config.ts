import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/shadow-write.test.ts'],
    // No setupFiles - shadow-write tests have their own mocks
    testTimeout: 10000,
  },
});
