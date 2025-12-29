/**
 * Test Setup
 *
 * Global test configuration and mocks
 */

import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// Mock environment variables for tests
process.env['NODE_ENV'] = 'test';
process.env['JWT_SECRET'] = 'test-jwt-secret-for-testing-min-32-chars-required';
process.env['ENCRYPTION_KEY'] = 'test-encryption-key-32-bytes-xx';
process.env['DATABASE_URL'] = 'postgresql://test:test@localhost:5432/test';
process.env['REDIS_URL'] = 'redis://localhost:6379';

// Clean up after tests
afterEach(() => {
  vi.clearAllMocks();
});

beforeAll(() => {
  // Any global setup
});

afterAll(() => {
  // Any global cleanup
});
