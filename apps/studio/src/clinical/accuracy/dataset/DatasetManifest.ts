/**
 * CLN-001A — dataset manifest schema (no fabricated labels).
 */

export type ClinicalAccuracySplit = 'TRAIN' | 'VALIDATION' | 'TEST';

export type ClinicalHardCaseTag =
  | 'normal'
  | 'crowding'
  | 'missing-teeth'
  | 'rotated-teeth'
  | 'partially-scanned'
  | 'scan-holes'
  | 'noisy'
  | 'braces-appliances'
  | 'damaged-teeth';

export interface ClinicalAccuracyGroundTruthRefs {
  readonly orientationPresent: boolean;
  readonly orientationPath?: string;
  readonly trimBoundaryPresent: boolean;
  readonly trimBoundaryPath?: string;
  readonly basePresent: boolean;
  readonly basePath?: string;
  readonly segmentationPresent: boolean;
  readonly segmentationPath?: string;
  readonly preparedPresent: boolean;
  readonly preparedPath?: string;
}

export interface ClinicalAccuracyCaseEntry {
  readonly caseId: string;
  readonly patientKey: string;
  readonly archRole: 'upper' | 'lower' | 'both';
  readonly split: ClinicalAccuracySplit;
  readonly sourceMeshPath: string;
  readonly hardCaseTags: readonly ClinicalHardCaseTag[];
  readonly groundTruth: ClinicalAccuracyGroundTruthRefs;
  readonly notes?: string;
}

export interface ClinicalAccuracyDatasetManifest {
  readonly manifestVersion: 'cln-001a-dataset-v1';
  readonly datasetId: string;
  readonly license: {
    readonly id: string;
    readonly cleared: boolean;
    readonly notes: string;
  };
  readonly cases: readonly ClinicalAccuracyCaseEntry[];
}

export const validateDatasetManifest = (
  manifest: ClinicalAccuracyDatasetManifest
): { readonly ok: boolean; readonly errors: readonly string[] } => {
  const errors: string[] = [];
  if (manifest.manifestVersion !== 'cln-001a-dataset-v1') {
    errors.push('unsupported manifestVersion');
  }
  const patientsBySplit = new Map<ClinicalAccuracySplit, Set<string>>();
  for (const split of ['TRAIN', 'VALIDATION', 'TEST'] as const) {
    patientsBySplit.set(split, new Set());
  }
  for (const c of manifest.cases) {
    if (!c.caseId || !c.patientKey) errors.push(`case missing ids: ${c.caseId}`);
    patientsBySplit.get(c.split)?.add(c.patientKey);
  }
  const train = patientsBySplit.get('TRAIN')!;
  const val = patientsBySplit.get('VALIDATION')!;
  const test = patientsBySplit.get('TEST')!;
  for (const p of train) {
    if (val.has(p) || test.has(p)) errors.push(`patient leakage TRAIN↔other: ${p}`);
  }
  for (const p of val) {
    if (test.has(p)) errors.push(`patient leakage VALIDATION↔TEST: ${p}`);
  }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
};

export const parseDatasetManifest = (raw: unknown): ClinicalAccuracyDatasetManifest => {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Dataset manifest must be an object');
  }
  const m = raw as ClinicalAccuracyDatasetManifest;
  const check = validateDatasetManifest(m);
  if (!check.ok) {
    throw new Error(`Invalid dataset manifest: ${check.errors.join('; ')}`);
  }
  return m;
};
