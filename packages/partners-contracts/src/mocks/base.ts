import type { ResultMetadata } from '../types/result';

/**
 * Simple deterministic hash function for seeding mock data
 * Uses djb2 algorithm for string hashing
 */
export function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash >>> 0; // Convert to unsigned 32-bit integer
}

/**
 * Seeded random number generator for deterministic mock data
 */
export class SeededRandom {
  private seed: number;

  constructor(seed: string | number) {
    this.seed = typeof seed === 'string' ? hashString(seed) : seed;
  }

  /**
   * Generate next random number between 0 and 1
   */
  next(): number {
    // Linear congruential generator
    this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
    return this.seed / 4294967296;
  }

  /**
   * Generate random integer between min and max (inclusive)
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Generate random float between min and max
   */
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /**
   * Pick random element from array
   */
  pick<T>(array: readonly T[]): T {
    if (array.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    return array[this.nextInt(0, array.length - 1)] as T;
  }

  /**
   * Generate a mock ID
   */
  nextId(prefix: string): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = prefix + '_';
    for (let i = 0; i < 12; i++) {
      id += chars[this.nextInt(0, chars.length - 1)];
    }
    return id;
  }

  /**
   * Generate a confirmation number
   */
  nextConfirmation(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars[this.nextInt(0, chars.length - 1)];
    }
    return code;
  }
}

/**
 * Create a seed from request data for deterministic outputs
 */
export function createSeed(data: unknown): string {
  return JSON.stringify(data);
}

/**
 * Create mock metadata for a provider response
 */
export function createMockMetadata(
  providerId: string,
  providerName: string,
  seed: string,
  startTime: number
): ResultMetadata {
  return {
    providerId,
    providerName,
    requestId: `mock_${hashString(seed + Date.now()).toString(16)}`,
    timestamp: new Date(),
    durationMs: Date.now() - startTime + Math.random() * 10, // Simulate some variance
    isMock: true,
    mockSeed: seed,
  };
}

/**
 * Simulate network latency for more realistic mock behavior
 */
export async function simulateLatency(minMs = 50, maxMs = 200): Promise<void> {
  const delay = Math.random() * (maxMs - minMs) + minMs;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Base class for mock providers
 */
export abstract class BaseMockProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly isMock = true;

  protected simulateLatency: boolean;
  protected latencyRange: [number, number];

  constructor(
    providerId: string,
    providerName: string,
    options?: {
      simulateLatency?: boolean;
      latencyRange?: [number, number];
    }
  ) {
    this.providerId = providerId;
    this.providerName = providerName;
    this.simulateLatency = options?.simulateLatency ?? false;
    this.latencyRange = options?.latencyRange ?? [50, 200];
  }

  healthCheck(): Promise<boolean> {
    return Promise.resolve(true);
  }

  protected async maybeDelay(): Promise<void> {
    if (this.simulateLatency) {
      await simulateLatency(this.latencyRange[0], this.latencyRange[1]);
    }
  }

  protected createMetadata(seed: string, startTime: number): ResultMetadata {
    return createMockMetadata(
      this.providerId,
      this.providerName,
      seed,
      startTime
    );
  }
}
