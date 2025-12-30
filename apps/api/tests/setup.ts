/**
 * Test Setup
 *
 * Provides mocks and utilities for testing API modules.
 */

import { vi } from 'vitest';

// Mock Redis
export const mockRedis = {
  get: vi.fn(),
  set: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
  ttl: vi.fn(),
  pipeline: vi.fn(() => ({
    setex: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  })),
};

// Mock Prisma
export const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  session: {
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  refreshToken: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
};

// Mock Email Service
export const mockEmailService = {
  send: vi.fn().mockResolvedValue(undefined),
};

// Mock Fastify JWT
export const mockJwt = {
  sign: vi.fn().mockReturnValue('mock-access-token'),
};

// Mock Fastify App
export const createMockApp = () => ({
  redis: mockRedis,
  emailService: mockEmailService,
  jwt: mockJwt,
});

// Reset all mocks between tests
export const resetMocks = () => {
  vi.clearAllMocks();
  mockRedis.get.mockReset();
  mockRedis.set.mockReset();
  mockRedis.setex.mockReset();
  mockRedis.del.mockReset();
  mockRedis.exists.mockReset();
  mockRedis.incr.mockReset();
  mockRedis.expire.mockReset();
  mockRedis.ttl.mockReset();
};

// Mock modules
vi.mock('@realriches/database', () => ({
  prisma: mockPrisma,
}));

vi.mock('@realriches/config', () => ({
  getConfig: () => ({
    jwt: {
      secret: 'test-secret',
      accessExpiresIn: '15m',
      refreshExpiresIn: '7d',
    },
    web: {
      appUrl: 'http://localhost:3000',
    },
  }),
}));

vi.mock('@realriches/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@realriches/utils')>();
  return {
    ...actual,
    generatePrefixedId: vi.fn((prefix: string) => `${prefix}_test123`),
    generateToken: vi.fn(() => 'mock-token-64chars'),
    sha256: vi.fn((input: string) => `sha256_${input}`),
  };
});

vi.mock('argon2', () => ({
  hash: vi.fn().mockResolvedValue('hashed-password'),
  verify: vi.fn(),
}));
