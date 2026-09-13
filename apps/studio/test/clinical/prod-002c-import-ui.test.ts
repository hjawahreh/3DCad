/**
 * PROD-002C — clinical import presentation helpers.
 */

import { describe, expect, it } from 'vitest';
import {
  clinicalFindingMessage,
  clinicalVerdictSummary,
  formatScanBytes,
  isLargeScan,
  toClinicalImportError
} from '../../src/clinical/shell/ClinicalImportPresentation.js';
import type {
  CaseValidationFinding,
  ClinicalCaseValidationReport
} from '../../src/clinical/case/ClinicalCaseValidation.js';

const finding = (
  partial: Partial<CaseValidationFinding> & Pick<CaseValidationFinding, 'id' | 'severity' | 'message'>
): CaseValidationFinding => Object.freeze(partial);

describe('PROD-002C import presentation', () => {
  it('maps parser failures to clinical copy', () => {
    expect(toClinicalImportError('Only ASCII PLY is supported in this import path')).toMatch(
      /Binary PLY/i
    );
    expect(toClinicalImportError('Mesh contains no triangles')).toMatch(/no usable mesh/i);
    expect(toClinicalImportError('Mesh contains non-finite coordinates')).toMatch(
      /invalid coordinates/i
    );
    expect(toClinicalImportError('Unsupported format ".xyz"')).toMatch(/Unsupported file format/i);
  });

  it('hides raw geometry quality codes from operators', () => {
    expect(
      clinicalFindingMessage(
        finding({
          id: 'q',
          severity: 'ERROR',
          message: 'Geometry quality code: EMPTY_MESH',
          code: 'EMPTY_MESH'
        })
      )
    ).toMatch(/no usable surface/i);
  });

  it('summarizes verdicts without exposing internals', () => {
    const report: ClinicalCaseValidationReport = Object.freeze({
      version: 'clinical-case-validation-v1',
      verdict: 'WARNING',
      findings: Object.freeze([
        finding({ id: 'w1', severity: 'WARNING', message: 'Open boundary' }),
        finding({ id: 'i1', severity: 'INFO', message: 'note' })
      ]),
      objects: Object.freeze([]),
      hasUpper: true,
      hasLower: true,
      validatedAt: 1,
      timingMs: 1
    });
    expect(clinicalVerdictSummary(report)).toMatch(/warning/i);
  });

  it('formats scan sizes and flags large files', () => {
    expect(formatScanBytes(512)).toBe('512 B');
    expect(isLargeScan(21 * 1024 * 1024)).toBe(true);
    expect(isLargeScan(1024)).toBe(false);
  });
});
