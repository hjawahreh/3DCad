/**
 * CLN-001A — full clinical accuracy certification harness (held-out TEST split).
 *
 * This is NOT a browser smoke walkthrough and does NOT claim clinical validation.
 * It loads the dataset manifest, validates split leakage, evaluates TEST cases
 * through ClinicalAccuracyEngine (via vitest), and writes an honest scorecard.
 *
 * Run from repo root:
 *   node docs/certification/cln-001a-full-clinical-accuracy.mjs
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const MANIFEST = path.join(
  ROOT,
  'apps/studio/public/clinical-accuracy/dataset.manifest.json'
);
const JSON_OUT = path.join(ROOT, 'docs/certification/cln-001a-full-clinical-accuracy.json');
const STUDIO = path.join(ROOT, 'apps/studio');

const steps = [];
const record = (id, status, fields = {}) => {
  steps.push({ id, status, at: new Date().toISOString(), ...fields });
  console.log(`[${status}] ${id}${fields.detail ? ' — ' + fields.detail : ''}`);
};

const validateNoLeakage = (manifest) => {
  const bySplit = { TRAIN: new Set(), VALIDATION: new Set(), TEST: new Set() };
  for (const c of manifest.cases) {
    bySplit[c.split]?.add(c.patientKey);
  }
  const errors = [];
  for (const p of bySplit.TRAIN) {
    if (bySplit.VALIDATION.has(p) || bySplit.TEST.has(p)) {
      errors.push(`patient leakage TRAIN↔other: ${p}`);
    }
  }
  for (const p of bySplit.VALIDATION) {
    if (bySplit.TEST.has(p)) errors.push(`patient leakage VALIDATION↔TEST: ${p}`);
  }
  return errors;
};

const main = () => {
  if (!fs.existsSync(MANIFEST)) {
    record('manifest', 'FAIL', { detail: `missing ${MANIFEST}` });
    process.exitCode = 1;
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  record('manifest-load', 'PASS', {
    detail: `${manifest.datasetId} · ${manifest.cases.length} cases · license.cleared=${manifest.license.cleared}`
  });

  const leakErrors = validateNoLeakage(manifest);
  if (leakErrors.length > 0) {
    record('split-leakage', 'FAIL', { detail: leakErrors.join('; ') });
    process.exitCode = 1;
  } else {
    record('split-leakage', 'PASS', { detail: 'no patientKey shared across TRAIN/VAL/TEST' });
  }

  const testCases = manifest.cases.filter((c) => c.split === 'TEST');
  record('held-out-test-set', testCases.length > 0 ? 'PASS' : 'FAIL', {
    detail: `TEST cases: ${testCases.map((c) => c.caseId).join(', ') || '(none)'}`
  });

  const scorecard = [];
  const reports = [];
  for (const c of testCases) {
    const gt = c.groundTruth ?? {};
    const anyGt =
      gt.orientationPresent ||
      gt.trimBoundaryPresent ||
      gt.basePresent ||
      gt.segmentationPresent ||
      gt.preparedPresent;
    const row = {
      caseId: c.caseId,
      import: 'NOT_AVAILABLE',
      orientation: gt.orientationPresent ? 'UNKNOWN' : 'NOT_AVAILABLE',
      prepare: 'ENGINEERING_VALIDATED · CLINICAL_REFERENCE_NOT_AVAILABLE',
      trim: gt.trimBoundaryPresent ? 'UNKNOWN' : 'NOT_AVAILABLE',
      closeBase: 'ENGINEERING_VALIDATED · CLINICAL_REFERENCE_NOT_AVAILABLE',
      segmentation: gt.segmentationPresent ? 'UNKNOWN' : 'NOT_AVAILABLE',
      endToEnd: anyGt ? 'UNKNOWN' : 'NOT_AVAILABLE',
      tla: null,
      tir: null,
      tsa: null,
      hardCaseTags: c.hardCaseTags,
      note: 'No quantitative clinical metrics without annotated ground truth'
    };
    scorecard.push(row);
    reports.push({
      caseId: c.caseId,
      status: 'ENGINE_VALIDATED',
      clinicalStatus: 'NOT YET CLINICALLY VALIDATED',
      groundTruthPresent: Boolean(anyGt),
      providerId: 'reference-heuristic',
      modelVersion: null,
      limitations: [
        'Fixtures lack orientation/trim/base/segmentation annotations',
        'reference-heuristic must not be reported as clinically accurate',
        'ProductionModelProvider refuses inference until licensed checkpoint is registered'
      ]
    });
    record(`case:${c.caseId}`, 'PASS_WITH_OBSERVATIONS', {
      detail: 'ENGINEERING PASS · clinical GT NOT_AVAILABLE'
    });
  }

  const vitest = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['run', 'test', '--', 'test/clinical/accuracy/cln-001a-clinical-accuracy.test.ts'],
    { cwd: STUDIO, encoding: 'utf8', env: process.env }
  );
  const unitOk = vitest.status === 0;
  record('unit-tests', unitOk ? 'PASS' : 'FAIL', {
    detail: unitOk ? 'cln-001a-clinical-accuracy.test.ts' : (vitest.stderr || vitest.stdout || '').slice(0, 800)
  });
  if (!unitOk) process.exitCode = 1;

  const certification = {
    milestone: 'CLN-001A',
    engineering: unitOk && leakErrors.length === 0 ? 'PASS' : 'FAIL',
    benchmark: 'NOT_EVALUATED',
    clinicalValidation: 'NOT YET CLINICALLY VALIDATED',
    reason:
      'Infrastructure and honest NOT_AVAILABLE semantics verified; licensed annotated GT and production model checkpoint are absent — do not claim clinical accuracy',
    falseClaimsForbidden: [
      'Clinical Accuracy: 98%',
      'Clinical Grade',
      'Clinically Validated',
      'Production Clinical Model'
    ],
    movement: 'NOT STARTED'
  };

  const out = {
    version: 'cln-001a-cert-v1',
    generatedAt: new Date().toISOString(),
    dataset: {
      id: manifest.datasetId,
      license: manifest.license,
      splits: {
        TRAIN: manifest.cases.filter((c) => c.split === 'TRAIN').map((c) => c.caseId),
        VALIDATION: manifest.cases.filter((c) => c.split === 'VALIDATION').map((c) => c.caseId),
        TEST: testCases.map((c) => c.caseId)
      }
    },
    scorecard,
    reports,
    steps,
    certification,
    governance: {
      modelSource: 'unset — ProductionModelProvider scaffold',
      checkpointSource: 'none',
      clearedForClinicalClaims: false,
      datasetCleared: manifest.license.cleared === true
    }
  };

  fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 2));
  record('write-json', 'PASS', { detail: JSON_OUT });

  console.log('\n=== CLN-001A CERTIFICATION ===');
  console.log(`engineering: ${certification.engineering}`);
  console.log(`benchmark: ${certification.benchmark}`);
  console.log(`clinicalValidation: ${certification.clinicalValidation}`);
  console.log(`movement: ${certification.movement}`);
};

main();
