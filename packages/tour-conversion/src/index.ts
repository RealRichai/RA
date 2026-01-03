// Types
export * from './types';

// Checksum utilities
export {
  computeFileChecksum,
  computeBufferChecksum,
  getFileSize,
  computeFileMetadata,
  verifyChecksum,
} from './checksum';

// Splat transform CLI wrapper
export {
  getSplatTransformVersion,
  runSplatTransform,
  mockSplatTransform,
  convertPlyToSog,
} from './splat-transform';

// QA system
export {
  computePHash,
  pHashDistance,
  computeSSIM,
  renderFrame,
  runQA,
  meetsQualityThreshold,
} from './qa';

// WebP validation
export {
  validateWebP,
  validateWebPFile,
  enforceLosslessWebP,
  convertToLosslessWebP,
  type WebPCompressionType,
  type WebPValidationResult,
} from './webp-validation';

// Conversion service
export {
  TourConversionService,
  getTourConversionService,
  resetTourConversionService,
} from './service';

// Provenance service
export {
  AssetProvenanceService,
  getAssetProvenanceService,
  createAssetProvenanceService,
  resetAssetProvenanceService,
  verifyFileIntegrity,
  type AssetProvenance,
  type ProvenanceRecord,
  type IntegrityCheckResult,
  type ProvenanceVerificationResult,
  type ProvenanceEmitter,
} from './provenance';

// Quality regression harness
export {
  QualityRegressionHarness,
  getQualityRegressionHarness,
  createQualityRegressionHarness,
  resetQualityRegressionHarness,
  runCIRegressionTest,
  DEFAULT_REGRESSION_CONFIG,
  type QualityBaseline,
  type RegressionCheckResult,
  type RegressionConfig,
} from './quality-regression';

// Worker
export {
  getConversionQueue,
  enqueueConversionJob,
  startWorker,
  stopWorker,
  getWorkerStats,
  getBackpressureStatus,
} from './worker';
