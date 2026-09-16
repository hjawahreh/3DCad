/**
 * CLN-001A — model / dataset governance record (no silent clinical claims).
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
  modelSource: 'unset — ProductionModelProvider scaffold',
  checkpointSource: 'none',
  modelLicense: 'n/a',
  dataset: 'cad-studio-clinical-accuracy-v0 (fixtures only)',
  datasetLicense: 'internal-fixtures-only · cleared=false',
  splitPolicy: 'TRAIN / VALIDATION / TEST by patientKey · no leakage',
  preprocessing: 'not applicable without production model',
  inputNormalization: 'not applicable without production model',
  hardware: 'n/a',
  inferenceTimeMs: null,
  modelVersion: 'none',
  clearedForClinicalClaims: false
});
