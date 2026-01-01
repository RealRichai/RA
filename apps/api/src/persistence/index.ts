/**
 * Persistence Composition Root
 *
 * Single point of construction for all repositories and stores.
 * Production environments use Prisma/PostgreSQL + Redis.
 * In-memory implementations are ONLY available in test/dev mode.
 *
 * SECURITY: Production bootstrap MUST NOT wire any InMemory* implementations.
 * This is enforced by:
 * 1. Runtime checks in this file
 * 2. CI safety test (apps/api/tests/persistence-guard.test.ts)
 * 3. ESLint rule blocking InMemory* imports from production paths
 *
 * @see docs/architecture/persistence.md
 */

import { getConfig } from '@realriches/config';
import { prisma } from '@realriches/database';
import {
  AttributionService,
  type AttributionStore,
} from '@realriches/revenue-engine';
import {
  type MeteringService,
  DatabaseMeteringService,
} from '@realriches/tour-delivery';
import { logger } from '@realriches/utils';

import { PrismaAttributionStore } from './stores/attribution';

// =============================================================================
// Environment Detection
// =============================================================================

export type PersistenceEnvironment = 'production' | 'development' | 'test';

function detectEnvironment(): PersistenceEnvironment {
  const config = getConfig();
  const nodeEnv = config.nodeEnv || process.env.NODE_ENV || 'development';

  if (nodeEnv === 'production') return 'production';
  if (nodeEnv === 'test') return 'test';
  return 'development';
}

// =============================================================================
// Store Registry
// =============================================================================

interface StoreRegistry {
  attribution: AttributionStore;
  metering: MeteringService;
}

let storeRegistry: StoreRegistry | null = null;
let registryEnvironment: PersistenceEnvironment | null = null;

/**
 * Registered store names for runtime validation
 */
const STORE_NAMES = ['attribution', 'metering'] as const;

// =============================================================================
// Production Store Factory
// =============================================================================

function createProductionStores(): StoreRegistry {
  logger.info('Initializing production persistence stores (Prisma/PostgreSQL)');

  return {
    attribution: new PrismaAttributionStore(),
    metering: new DatabaseMeteringService(prisma),
  };
}

// =============================================================================
// Development Store Factory
// =============================================================================

function createDevelopmentStores(): StoreRegistry {
  // Development uses the same stores as production for consistency
  // In-memory stores are only used when explicitly requested for unit tests
  logger.info('Initializing development persistence stores (Prisma/PostgreSQL)');

  return {
    attribution: new PrismaAttributionStore(),
    metering: new DatabaseMeteringService(prisma),
  };
}

// =============================================================================
// Test Store Factory (In-Memory allowed)
// =============================================================================

function createTestStores(): StoreRegistry {
  // For unit tests that don't need database, we allow in-memory stores
  // These are imported dynamically to prevent production code from depending on them
  logger.info('Initializing test persistence stores (In-Memory)');

  // Dynamic imports to avoid bundling in production
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { InMemoryAttributionStore } = require('@realriches/revenue-engine') as {
    InMemoryAttributionStore: new () => AttributionStore;
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { InMemoryMeteringService } = require('@realriches/tour-delivery') as {
    InMemoryMeteringService: new () => MeteringService;
  };

  return {
    attribution: new InMemoryAttributionStore(),
    metering: new InMemoryMeteringService(),
  };
}

// =============================================================================
// Composition Root
// =============================================================================

/**
 * Initialize the persistence layer based on environment.
 *
 * MUST be called before any store access.
 * MUST be called only once per process.
 *
 * @param forceEnv - Override environment detection (for testing only)
 */
export function initializePersistence(forceEnv?: PersistenceEnvironment): void {
  if (storeRegistry !== null) {
    throw new Error(
      `Persistence already initialized for environment: ${registryEnvironment}. ` +
      'Cannot reinitialize. Use resetPersistence() in tests.'
    );
  }

  const env = forceEnv ?? detectEnvironment();
  registryEnvironment = env;

  switch (env) {
    case 'production':
      storeRegistry = createProductionStores();
      break;
    case 'development':
      storeRegistry = createDevelopmentStores();
      break;
    case 'test':
      storeRegistry = createTestStores();
      break;
  }

  // Runtime validation for production
  if (env === 'production') {
    validateProductionStores(storeRegistry);
  }

  logger.info({ environment: env }, 'Persistence layer initialized');
}

/**
 * Validate that production stores are not in-memory implementations.
 * Throws if any InMemory* store is detected.
 */
function validateProductionStores(registry: StoreRegistry): void {
  const violations: string[] = [];

  for (const storeName of STORE_NAMES) {
    const store = registry[storeName];
    const constructorName = store.constructor.name;

    if (constructorName.startsWith('InMemory')) {
      violations.push(`${storeName}: ${constructorName}`);
    }
  }

  if (violations.length > 0) {
    const msg = `CRITICAL: Production persistence contains in-memory stores!\n` +
      `Violations:\n${violations.map(v => `  - ${v}`).join('\n')}\n` +
      `Production MUST use durable storage (Prisma/PostgreSQL + Redis).`;

    logger.error({ violations }, msg);
    throw new Error(msg);
  }

  logger.info('Production persistence validation passed: no in-memory stores');
}

/**
 * Reset persistence layer (for tests only).
 */
export function resetPersistence(): void {
  if (detectEnvironment() === 'production') {
    throw new Error('Cannot reset persistence in production environment');
  }

  storeRegistry = null;
  registryEnvironment = null;
}

// =============================================================================
// Store Accessors
// =============================================================================

function ensureInitialized(): StoreRegistry {
  if (storeRegistry === null) {
    throw new Error(
      'Persistence not initialized. Call initializePersistence() first.'
    );
  }
  return storeRegistry;
}

/**
 * Get the attribution store instance.
 */
export function getAttributionStore(): AttributionStore {
  return ensureInitialized().attribution;
}

/**
 * Get the metering service instance.
 */
export function getMeteringService(): MeteringService {
  return ensureInitialized().metering;
}

/**
 * Get the current persistence environment.
 */
export function getPersistenceEnvironment(): PersistenceEnvironment | null {
  return registryEnvironment;
}

/**
 * Check if persistence is using in-memory stores (test mode only).
 */
export function isUsingInMemoryStores(): boolean {
  if (!storeRegistry) return false;

  for (const storeName of STORE_NAMES) {
    const store = storeRegistry[storeName];
    if (store.constructor.name.startsWith('InMemory')) {
      return true;
    }
  }

  return false;
}

// =============================================================================
// Service Factories (using stores from composition root)
// =============================================================================

let attributionServiceInstance: AttributionService | null = null;

/**
 * Get the AttributionService configured with the correct store.
 */
export function getAttributionService(): AttributionService {
  if (!attributionServiceInstance) {
    attributionServiceInstance = new AttributionService({
      store: getAttributionStore(),
    });
  }
  return attributionServiceInstance;
}

/**
 * Reset service instances (for tests only).
 */
export function resetServices(): void {
  if (detectEnvironment() === 'production') {
    throw new Error('Cannot reset services in production environment');
  }

  attributionServiceInstance = null;
}
