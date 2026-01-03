/**
 * @realriches/listing-copilot
 *
 * End-to-end Listing Copilot workflow for AI-powered listing optimization
 * and collateral generation.
 */

// Types
export * from './types';

// Configuration
export {
  createCopilotConfigFromEnv,
  defaultCopilotConfig,
  validateConfig,
} from './config/copilot-config';

// Generators
export { CopyGenerator } from './generators/copy-generator';
export { ArtifactOrchestrator } from './generators/artifact-orchestrator';

// Compliance
export { CopilotComplianceGate } from './compliance/copilot-compliance-gate';

// Channels
export { ChannelSimulator } from './channels/channel-simulator';

// Templates
export type { TemplateLoader } from './templates/template-loader';
export { DefaultTemplateLoader } from './templates/template-loader';
export { TemplateSanitizer } from './templates/template-sanitizer';

// Evidence
export { CopilotEvidenceEmitter } from './evidence/copilot-evidence';

// Workflow
export { ListingCopilotWorkflow } from './workflow/listing-copilot-workflow';
