/**
 * Clinical-facing import / case-validation copy — no internal codes or stack traces.
 */

import type {
  CaseValidationFinding,
  ClinicalCaseValidationReport
} from '../case/ClinicalCaseValidation.js';

const ARCH_LABEL: Readonly<Record<'upper' | 'lower', string>> = Object.freeze({
  upper: 'Upper Arch',
  lower: 'Lower Arch'
});

const CODE_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  EMPTY_MESH: 'Scan has no usable surface geometry.',
  INPUT_INVALID: 'Scan geometry is invalid and cannot be used.',
  TOPOLOGY_INVALID: 'Scan topology is invalid and needs a different file.',
  NON_FINITE: 'Scan contains invalid coordinates.'
});

/** Operator-facing finding text (hides raw quality codes). */
export const clinicalFindingMessage = (finding: CaseValidationFinding): string => {
  if (finding.code !== undefined && CODE_MESSAGES[finding.code] !== undefined) {
    return CODE_MESSAGES[finding.code]!;
  }
  if (/^Geometry quality code:\s*/i.test(finding.message)) {
    const code = finding.message.replace(/^Geometry quality code:\s*/i, '').trim();
    return CODE_MESSAGES[code] ?? 'Scan geometry needs review before continuing.';
  }
  return finding.message;
};

export const clinicalFindingLabel = (finding: CaseValidationFinding): string => {
  const arch =
    finding.archRole !== undefined ? `${ARCH_LABEL[finding.archRole]} · ` : '';
  return `${arch}${finding.severity}`;
};

export const clinicalVerdictSummary = (
  report: ClinicalCaseValidationReport
): string => {
  const errors = report.findings.filter((f) => f.severity === 'ERROR').length;
  const warnings = report.findings.filter((f) => f.severity === 'WARNING').length;
  if (report.verdict === 'PASS') {
    return 'Scans look ready for clinical work.';
  }
  if (report.verdict === 'FAIL') {
    return errors > 0
      ? `${String(errors)} issue(s) must be resolved before continuing.`
      : 'Import validation failed. Choose different scan files.';
  }
  return warnings > 0
    ? `${String(warnings)} warning(s) — review before continuing.`
    : 'Scans imported with notes for review.';
};

/** Map parser / coordinator errors to clinical copy. */
export const toClinicalImportError = (raw: string): string => {
  const m = raw.trim();
  if (/unsupported format/i.test(m)) {
    return 'Unsupported file format. Choose an STL, OBJ, or ASCII PLY scan.';
  }
  if (/only ascii ply/i.test(m)) {
    return 'Binary PLY is not supported. Export an ASCII PLY, or use STL/OBJ.';
  }
  if (/empty|no triangles|no vertices|bounding box is empty/i.test(m)) {
    return 'This file has no usable mesh. Choose a different dental scan.';
  }
  if (/non-finite|nan|invalid coordinates/i.test(m)) {
    return 'This scan contains invalid coordinates and cannot be imported.';
  }
  if (/out-of-range|malformed|incomplete|did not contain/i.test(m)) {
    return 'This file appears damaged or incomplete. Re-export the scan and try again.';
  }
  if (/cancelled/i.test(m)) {
    return 'Import was cancelled.';
  }
  return m.replace(/^Error:\s*/i, '').replace(/\s+/g, ' ');
};

export const formatScanBytes = (sizeBytes: number): string => {
  if (sizeBytes < 1024) return `${String(sizeBytes)} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(0)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const isLargeScan = (sizeBytes: number): boolean => sizeBytes >= 20 * 1024 * 1024;
