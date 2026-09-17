/**
 * CLN-001A / CLN-SEG-001 — model / dataset governance record (no silent clinical claims).
 */

export interface ClinicalModelGovernanceRecord {
  readonly modelSource: string;
  readonly checkpointSource: string;
  readonly modelLicense: string;
  readonly dataset: string;
  readonly datasetLicense: string;
  readonly splitPolicy: string;
  readonly preprocessing: string;
  readonly inputNormalization: string;
  readonly hardware: string;
  readonly inferenceTimeMs: number | null;
  readonly modelVersion: string;
  readonly clearedForClinicalClaims: boolean;
}

/** Scaffold until a licensed production checkpoint is registered. */
export const PRODUCTION_MODEL_GOVERNANCE: ClinicalModelGovernanceRecord = Object.freeze({
  modelSource: 'TSegFormer candidate — https://github.com/huiminxiong/TSegFormer (MIT code)',
  checkpointSource:
    'none registered — upstream does not publish a redistributable pretrained URL; local best_model.t7 required via CAD_SEG_CHECKPOINT',
  modelLicense: 'MIT (code) · checkpoint redistribution not cleared',
  dataset: 'Private IOS corpus (paper) — not bundled; fixtures-only for engineering',
  datasetLicense: 'not-available · cleared=false',
  splitPolicy: 'TRAIN / VALIDATION / TEST by patientKey · no leakage (when dataset cleared)',
  preprocessing: 'ClinicalMesh → area-weighted face sample → 7–8ch XYZ/normal/curvature (worker)',
  inputNormalization: 'center + unit-sphere (documented in worker)',
  hardware: 'CUDA GPU when available else CPU — reported by worker, never silently switched in UI claims',
  inferenceTimeMs: null,
  modelVersion: 'none',
  clearedForClinicalClaims: false
});
