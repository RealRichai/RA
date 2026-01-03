/**
 * @realriches/testing
 *
 * Testing utilities including fault injection for chaos engineering.
 *
 * SAFETY: Chaos engineering is DISABLED by default and BLOCKED in production.
 */

export {
  FaultInjector,
  ChaosProductionError,
  InjectedFaultError,
  loadConfigFromEnv,
  getFaultInjector,
  resetFaultInjector,
  checkShadowWriteFault,
  maybeFaultShadowWrite,
} from './fault-injector.js';

export type {
  FaultScope,
  FaultInjectorConfig,
  FaultCheckResult,
} from './fault-injector.js';

export {
  ShadowWriteHarness,
  createShadowWriteHarness,
} from './shadow-write-harness.js';

export type {
  ShadowWriteResult,
  ShadowWriteConfig,
  ShadowWriteMetrics,
} from './shadow-write-harness.js';
