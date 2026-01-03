/**
 * FaultInjector - Controlled, deterministic fault injection for chaos engineering
 *
 * SAFETY GUARANTEES:
 * - SAFE-BY-DEFAULT: Disabled unless explicitly enabled via CHAOS_ENABLED=true
 * - PRODUCTION-BLOCKED: Hard fail at boot if NODE_ENV=production and CHAOS_ENABLED=true
 * - SCOPED: Only affects shadow_write operations by default
 * - DETERMINISTIC: Optional seed for reproducible test runs
 */

import seedrandom from 'seedrandom';

/**
 * Supported fault injection scopes
 */
export type FaultScope = 'shadow_write_only' | 'all_writes' | 'reads';

/**
 * Configuration for the FaultInjector
 */
export interface FaultInjectorConfig {
  /** Whether chaos engineering is enabled (default: false) */
  enabled: boolean;
  /** Probability of failure 0..1 (default: 0) */
  failRate: number;
  /** Optional seed for deterministic failures */
  seed?: string;
  /** Scope of fault injection (default: shadow_write_only) */
  scope: FaultScope;
}

/**
 * Result of a fault check
 */
export interface FaultCheckResult {
  shouldFail: boolean;
  faultId: string;
  reason: string;
}

/**
 * Error thrown when chaos is incorrectly enabled in production
 */
export class ChaosProductionError extends Error {
  constructor() {
    super(
      'FATAL: CHAOS_ENABLED=true is forbidden in production. ' +
        'Chaos engineering must NEVER run in NODE_ENV=production. ' +
        'This is a safety violation. Aborting boot.'
    );
    this.name = 'ChaosProductionError';
  }
}

/**
 * Error thrown when fault injection triggers a failure
 */
export class InjectedFaultError extends Error {
  public readonly faultId: string;
  public readonly scope: FaultScope;

  constructor(faultId: string, scope: FaultScope, operation: string) {
    super(`Injected fault [${faultId}] in ${scope} scope for operation: ${operation}`);
    this.name = 'InjectedFaultError';
    this.faultId = faultId;
    this.scope = scope;
  }
}

/**
 * Load configuration from environment variables with safe defaults
 */
export function loadConfigFromEnv(): FaultInjectorConfig {
  const enabled = process.env.CHAOS_ENABLED === 'true';
  const failRateStr = process.env.CHAOS_FAIL_RATE;
  const seed = process.env.CHAOS_SEED;
  const scopeStr = process.env.CHAOS_SCOPE as FaultScope | undefined;

  // Parse fail rate with validation
  let failRate = 0;
  if (failRateStr) {
    const parsed = parseFloat(failRateStr);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
      failRate = parsed;
    }
  }

  // Validate scope
  const validScopes: FaultScope[] = ['shadow_write_only', 'all_writes', 'reads'];
  const scope: FaultScope = validScopes.includes(scopeStr as FaultScope)
    ? (scopeStr as FaultScope)
    : 'shadow_write_only';

  return {
    enabled,
    failRate,
    seed,
    scope,
  };
}

/**
 * FaultInjector - Main class for controlled fault injection
 *
 * @example
 * ```typescript
 * const injector = FaultInjector.create();
 *
 * // Check if a shadow write should fail
 * const result = injector.check('shadow_write_only', 'listing_shadow_write');
 * if (result.shouldFail) {
 *   throw new InjectedFaultError(result.faultId, 'shadow_write_only', 'listing_shadow_write');
 * }
 * ```
 */
export class FaultInjector {
  private readonly config: FaultInjectorConfig;
  private readonly rng: seedrandom.PRNG;
  private faultCounter: number = 0;
  private checkCounter: number = 0;

  private constructor(config: FaultInjectorConfig) {
    this.config = config;
    // Create seeded RNG for deterministic behavior
    this.rng = seedrandom(config.seed ?? Math.random().toString());
  }

  /**
   * Create a FaultInjector instance with production safety checks
   *
   * @throws {ChaosProductionError} If CHAOS_ENABLED=true in production
   */
  static create(config?: Partial<FaultInjectorConfig>): FaultInjector {
    const envConfig = loadConfigFromEnv();
    const finalConfig: FaultInjectorConfig = {
      enabled: config?.enabled ?? envConfig.enabled,
      failRate: config?.failRate ?? envConfig.failRate,
      seed: config?.seed ?? envConfig.seed,
      scope: config?.scope ?? envConfig.scope,
    };

    // HARD SAFETY GUARD: Never allow chaos in production
    if (process.env.NODE_ENV === 'production' && finalConfig.enabled) {
      throw new ChaosProductionError();
    }

    return new FaultInjector(finalConfig);
  }

  /**
   * Create a FaultInjector for testing with explicit config (bypasses env)
   * Only use in test suites!
   */
  static createForTest(config: FaultInjectorConfig): FaultInjector {
    // Still block production even in test mode
    if (process.env.NODE_ENV === 'production' && config.enabled) {
      throw new ChaosProductionError();
    }
    return new FaultInjector(config);
  }

  /**
   * Check if a fault should be injected for the given scope and operation
   *
   * @param targetScope - The scope being checked
   * @param operation - Description of the operation (for logging)
   * @returns FaultCheckResult indicating whether to fail
   */
  check(targetScope: FaultScope, operation: string): FaultCheckResult {
    this.checkCounter++;

    // If disabled, never fail
    if (!this.config.enabled) {
      return {
        shouldFail: false,
        faultId: '',
        reason: 'chaos_disabled',
      };
    }

    // If scope doesn't match, don't fail
    if (!this.scopeMatches(targetScope)) {
      return {
        shouldFail: false,
        faultId: '',
        reason: `scope_mismatch:${this.config.scope}`,
      };
    }

    // Check against fail rate using seeded RNG
    const roll = this.rng();
    const shouldFail = roll < this.config.failRate;

    if (shouldFail) {
      this.faultCounter++;
      const faultId = this.generateFaultId();
      return {
        shouldFail: true,
        faultId,
        reason: `fault_injected:rate=${this.config.failRate}:roll=${roll.toFixed(4)}`,
      };
    }

    return {
      shouldFail: false,
      faultId: '',
      reason: `passed:rate=${this.config.failRate}:roll=${roll.toFixed(4)}`,
    };
  }

  /**
   * Check and throw if fault should be injected
   *
   * @throws {InjectedFaultError} If fault injection triggers
   */
  maybeInjectFault(targetScope: FaultScope, operation: string): void {
    const result = this.check(targetScope, operation);
    if (result.shouldFail) {
      throw new InjectedFaultError(result.faultId, targetScope, operation);
    }
  }

  /**
   * Wrap an async operation with fault injection
   *
   * @param targetScope - The scope for this operation
   * @param operation - Description of the operation
   * @param fn - The async function to wrap
   * @returns The result of fn, or throws InjectedFaultError
   */
  async wrapAsync<T>(
    targetScope: FaultScope,
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    this.maybeInjectFault(targetScope, operation);
    return fn();
  }

  /**
   * Wrap a sync operation with fault injection
   */
  wrapSync<T>(targetScope: FaultScope, operation: string, fn: () => T): T {
    this.maybeInjectFault(targetScope, operation);
    return fn();
  }

  /**
   * Check if the target scope matches the configured scope
   */
  private scopeMatches(targetScope: FaultScope): boolean {
    // shadow_write_only only matches shadow_write_only
    if (this.config.scope === 'shadow_write_only') {
      return targetScope === 'shadow_write_only';
    }
    // all_writes matches shadow_write_only and all_writes
    if (this.config.scope === 'all_writes') {
      return targetScope === 'shadow_write_only' || targetScope === 'all_writes';
    }
    // reads matches everything
    return true;
  }

  /**
   * Generate a unique fault ID for tracking
   */
  private generateFaultId(): string {
    const timestamp = Date.now().toString(36);
    const counter = this.faultCounter.toString(36).padStart(4, '0');
    const random = Math.random().toString(36).substring(2, 6);
    return `fault_${timestamp}_${counter}_${random}`;
  }

  /**
   * Get current configuration (readonly)
   */
  getConfig(): Readonly<FaultInjectorConfig> {
    return { ...this.config };
  }

  /**
   * Get statistics about fault injection
   */
  getStats(): { checks: number; faults: number; faultRate: number } {
    return {
      checks: this.checkCounter,
      faults: this.faultCounter,
      faultRate: this.checkCounter > 0 ? this.faultCounter / this.checkCounter : 0,
    };
  }

  /**
   * Reset statistics (useful for tests)
   */
  resetStats(): void {
    this.checkCounter = 0;
    this.faultCounter = 0;
  }

  /**
   * Check if chaos engineering is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

// Singleton instance for application-wide use
let globalInjector: FaultInjector | null = null;

/**
 * Get or create the global FaultInjector instance
 *
 * @throws {ChaosProductionError} If CHAOS_ENABLED=true in production
 */
export function getFaultInjector(): FaultInjector {
  if (!globalInjector) {
    globalInjector = FaultInjector.create();
  }
  return globalInjector;
}

/**
 * Reset the global FaultInjector (for testing)
 */
export function resetFaultInjector(): void {
  globalInjector = null;
}

/**
 * Convenience function to check for shadow write fault
 */
export function checkShadowWriteFault(operation: string): FaultCheckResult {
  return getFaultInjector().check('shadow_write_only', operation);
}

/**
 * Convenience function to maybe inject shadow write fault
 *
 * @throws {InjectedFaultError} If fault injection triggers
 */
export function maybeFaultShadowWrite(operation: string): void {
  getFaultInjector().maybeInjectFault('shadow_write_only', operation);
}
