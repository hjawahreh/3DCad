/**
 * CLN-SEG-001 — legal / reproducibility gate for ProductionModelProvider.
 *
 * A research repo being MIT-licensed does NOT authorize silent clinical use
 * of unpublished checkpoints or private training data.
 */

export type ProductionModelAvailability =
  | 'unavailable'
  | 'configured'
  | 'operational';

export interface ProductionModelReproducibilityRecord {
  readonly modelName: string;
  readonly repository: string;
  readonly commitOrTag: string;
  readonly license: string;
  readonly checkpointSource: string;
  readonly checkpointLicense: string;
  readonly trainingDataset: string;
  readonly datasetLicense: string;
  readonly modelVersion: string;
  readonly runtimeVersion: string;
  readonly checkpointClearedForProduct: boolean;
  readonly datasetClearedForProduct: boolean;
  readonly availability: ProductionModelAvailability;
  readonly unavailableReason: string;
}

/**
 * TSegFormer (MICCAI 2023) — evaluated candidate.
 *
 * Code: MIT (https://github.com/huiminxiong/TSegFormer).
 * Checkpoint: not published for download in upstream README; training produces
 * `best_model.t7` locally. Dataset: private IOS corpus referenced by paper —
 * not redistributed here.
 *
 * Until a product-cleared checkpoint path is configured via env
 * (`CAD_SEG_CHECKPOINT` + optional `CAD_TSEGFORMER_ROOT`), Production remains
 * explicitly unavailable. Never substitute the reference heuristic as Production.
 */
export const TSEGFORMER_REPRODUCIBILITY: ProductionModelReproducibilityRecord = Object.freeze({
  modelName: 'TSegFormer',
  repository: 'https://github.com/huiminxiong/TSegFormer',
  commitOrTag: '7784e0c9c5a4 (main @ review)',
  license: 'MIT (code)',
  checkpointSource:
    'Upstream does not publish a redistributable pretrained URL; training saves ./outputs/exp/models/best_model.t7',
  checkpointLicense: 'Not cleared — weights terms / redistribution not verified for product bundling',
  trainingDataset: 'Private intraoral-scan corpus (paper); local ./data JSON features in upstream',
  datasetLicense: 'Not available / not cleared for redistribution',
  modelVersion: 'miccai-2023-paper',
  runtimeVersion: 'isolated-python-worker-v1 (not React)',
  checkpointClearedForProduct: false,
  datasetClearedForProduct: false,
  availability: 'unavailable',
  unavailableReason:
    'Production model not configured. TSegFormer code is MIT, but no product-cleared checkpoint or dataset license is registered.'
});

export const PRODUCTION_MODEL_NOT_CONFIGURED =
  'Production model not configured — inference unavailable until a cleared checkpoint is registered.';

const readCadEnv = (key: string): string | undefined => {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const value = proc?.env?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

/**
 * Resolve gate from environment. Does not invent clearance —
 * only flips to configured when an operator supplies a checkpoint path.
 * Cleared-for-product remains false until governance docs are updated.
 */
export const resolveProductionModelGate = (
  overrides?: Partial<ProductionModelReproducibilityRecord>
): ProductionModelReproducibilityRecord => {
  const checkpoint = readCadEnv('CAD_SEG_CHECKPOINT');
  const root = readCadEnv('CAD_TSEGFORMER_ROOT');
  const hasCheckpoint = checkpoint !== undefined;
  const base = { ...TSEGFORMER_REPRODUCIBILITY, ...overrides };

  if (!hasCheckpoint) {
    return Object.freeze({
      ...base,
      availability: 'unavailable',
      unavailableReason: PRODUCTION_MODEL_NOT_CONFIGURED,
      checkpointSource: base.checkpointSource
    });
  }

  return Object.freeze({
    ...base,
    checkpointSource: checkpoint!,
    modelVersion: readCadEnv('CAD_SEG_MODEL_VERSION') ?? base.modelVersion,
    availability: 'configured',
    unavailableReason:
      root === undefined
        ? 'Checkpoint path set; TSegFormer source root (CAD_TSEGFORMER_ROOT) still required for real inference.'
        : 'Checkpoint configured — worker must load successfully before operational.',
    // Explicit: env path alone does not grant product clearance.
    checkpointClearedForProduct: false,
    datasetClearedForProduct: false
  });
};

export const isProductionModelOperational = (
  gate: ProductionModelReproducibilityRecord,
  workerHealthy: boolean
): boolean =>
  gate.availability !== 'unavailable' &&
  workerHealthy &&
  gate.checkpointSource.length > 0 &&
  !gate.checkpointSource.toLowerCase().includes('not publish');
