/**
 * CLN-001A — clinical failure report record (no fabricated expected geometry).
 */

export interface ClinicalFailureReport {
  readonly caseId: string;
  readonly stage: string;
  readonly expected: string | null;
  readonly actual: string | null;
  readonly quantitativeError: Record<string, number | string | boolean | null>;
  readonly screenshotPath: string | null;
  readonly geometryFingerprint: string | null;
  readonly modelVersion: string | null;
  readonly reproducibility: 'deterministic' | 'stochastic' | 'unknown';
  readonly notes: string;
}

export const createClinicalFailureReport = (
  input: ClinicalFailureReport
): ClinicalFailureReport => Object.freeze({ ...input });
