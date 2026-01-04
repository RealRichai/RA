/**
 * Vault Components
 *
 * Components for Property Record Vault onboarding.
 */

export { FolderTree } from './FolderTree';
export { MissingDocAlert } from './MissingDocAlert';
export { UpsellCard } from './UpsellCard';
export { EvidenceLog } from './EvidenceLog';
export { VaultOnboardingWizard } from './VaultOnboardingWizard';

export type {
  VaultFolder,
  DocumentCategory,
  VaultStatus,
  OnboardingStep,
  VaultOnboardingState,
  UpsellTrigger,
  VaultDocument,
  EvidenceRecord,
} from './types';

export {
  VAULT_FOLDER_LABELS,
  CATEGORY_LABELS,
  PARTNER_LABELS,
} from './types';
