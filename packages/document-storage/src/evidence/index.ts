/**
 * Vault Evidence Module
 *
 * SOC2-compliant evidence logging for vault access.
 */

export * from './types';
export {
  VaultEvidencePersistence,
  getVaultEvidencePersistence,
  persistVaultEvidence,
  queryVaultEvidence,
} from './persistence';
