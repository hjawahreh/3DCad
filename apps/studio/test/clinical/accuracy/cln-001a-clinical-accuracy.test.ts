/**
 * CLN-001A — clinical accuracy engine + metrics (honest NOT_AVAILABLE without GT).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clinicalAccuracyEngine,
  computeTeethSeg22Metrics,
  createProductionModelProvider,
  DEFAULT_CLINICAL_ACCURACY_THRESHOLDS,
  evaluateTeethSeg22Benchmark,
  hausdorffDistance,
  parseDatasetManifest,
  validateDatasetManifest
} from '../../../src/clinical/accuracy/index.js';

describe('CLN-001A dataset manifest', () => {
  it('loads fixture manifest without patient leakage', () => {
    const root = join(fileURLToPath(new URL('../../..', import.meta.url)));
    const raw = JSON.parse(
      readFileSync(join(root, 'public/clinical-accuracy/dataset.manifest.json'), 'utf8')
    );
    const manifest = parseDatasetManifest(raw);
    expect(manifest.license.cleared).toBe(false);
    expect(manifest.cases.every((c) => !c.groundTruth.segmentationPresent)).toBe(true);
    expect(validateDatasetManifest(manifest).ok).toBe(true);
  });
});

describe('CLN-001A TeethSeg22 metrics (synthetic GT)', () => {
  it('computes TLA / TIR / TSA on matched synthetic instances', () => {
    const reference = [
      {
        fdi: 11,
        centroid: [0, 0, 0] as const,
        faceIndices: new Set([0, 1, 2, 3])
      },
      {
        fdi: 21,
        centroid: [10, 0, 0] as const,
        faceIndices: new Set([10, 11, 12, 13])
      }
    ];
    const predicted = [
      {
        fdi: 11,
        centroid: [0.5, 0, 0] as const,
        faceIndices: new Set([0, 1, 2, 99])
      },
      {
        fdi: 21,
        centroid: [10.2, 0, 0] as const,
        faceIndices: new Set([10, 11, 12, 13])
      }
    ];
    const m = computeTeethSeg22Metrics({
      predicted,
      reference,
      localizationRadiusMm: 5
    });
    expect(m.tla).not.toBeNull();
    expect(m.tir).toBe(1);
    expect(m.tsa).not.toBeNull();
    expect(m.tsa!).toBeGreaterThan(0.5);
    expect(m.perTooth).toHaveLength(2);
    expect(m.missingToothCount).toBe(0);
    expect(m.falseToothCount).toBe(0);
  });

  it('records missing and false-positive teeth', () => {
    const m = computeTeethSeg22Metrics({
      predicted: [
        {
          fdi: 16,
          centroid: [0, 0, 0] as const,
          faceIndices: new Set([1])
        }
      ],
      reference: [
        {
          fdi: 11,
          centroid: [0, 0, 0] as const,
          faceIndices: new Set([1])
        }
      ],
      localizationRadiusMm: 5
    });
    expect(m.missingToothCount).toBe(1);
    expect(m.falseToothCount).toBe(1);
    expect(m.tir).toBe(0);
  });
});

describe('CLN-001A surface distance', () => {
  it('hausdorff is zero for identical clouds', () => {
    const cloud = [
      [0, 0, 0] as const,
      [1, 0, 0] as const,
      [0, 1, 0] as const
    ];
    expect(hausdorffDistance(cloud, cloud)).toBe(0);
  });
});

describe('CLN-001A ClinicalAccuracyEngine', () => {
  it('marks stages NOT_AVAILABLE without ground truth (no fabricated clinical scores)', () => {
    const report = clinicalAccuracyEngine.evaluate({
      datasetId: 'cad-studio-clinical-accuracy-v0',
      caseEntry: {
        caseId: 'fixture-upper-lower-pair',
        patientKey: 'patient-fixture-001',
        archRole: 'both',
        split: 'TEST',
        sourceMeshPath: 'apps/studio/public/clinical-fixtures/upper.stl',
        hardCaseTags: Object.freeze(['normal']),
        groundTruth: Object.freeze({
          orientationPresent: false,
          trimBoundaryPresent: false,
          basePresent: false,
          segmentationPresent: false,
          preparedPresent: false
        })
      },
      prepare: { engineeringOk: true },
      closeBase: {
        watertight: true,
        manifold: true,
        boundaryEdges: 0,
        nonManifoldEdges: 0,
        selfIntersection: false,
        geometryFingerprint: 'geo:test'
      },
      segmentation: { providerId: 'reference-heuristic' }
    });
    expect(report.status).toBe('ENGINE_VALIDATED');
    expect(report.stages.find((s) => s.stage === 'orientation')?.verdict).toBe('NOT_AVAILABLE');
    expect(report.stages.find((s) => s.stage === 'trim')?.verdict).toBe('NOT_AVAILABLE');
    expect(report.stages.find((s) => s.stage === 'segmentation')?.verdict).toBe('NOT_AVAILABLE');
    expect(report.stages.find((s) => s.stage === 'prepare')?.verdict).toBe('ENGINEERING_VALIDATED');
    expect(report.stages.find((s) => s.stage === 'close-base')?.verdict).toBe(
      'ENGINEERING_VALIDATED'
    );
    expect(report.segmentationBenchmark).toBeNull();
    expect(report.limitations.some((l) => /NOT_AVAILABLE|not be reported as clinically/i.test(l))).toBe(
      true
    );
    const row = clinicalAccuracyEngine.toScorecardRow(report);
    expect(row.segmentation).toBe('NOT_AVAILABLE');
    expect(row.endToEnd).toBe('UNKNOWN');
  });

  it('thresholds remain UNKNOWN for clinical bars', () => {
    expect(DEFAULT_CLINICAL_ACCURACY_THRESHOLDS.segmentationMinTsa.source).toBe('UNKNOWN');
    expect(DEFAULT_CLINICAL_ACCURACY_THRESHOLDS.segmentationMinTsa.value).toBeNull();
    expect(DEFAULT_CLINICAL_ACCURACY_THRESHOLDS.baseRequireWatertight.source).toBe(
      'project-engineering'
    );
  });
});

describe('CLN-001A ProductionModelProvider', () => {
  it('refuses fake neural-network inference', async () => {
    const p = createProductionModelProvider();
    expect(p.info.operational).toBe(false);
    await expect(
      p.infer({
        objectId: 'x',
        sourceRevision: 1,
        geometryFingerprint: 'geo:x',
        mesh: null as never,
        preprocess: null as never,
        identificationThreshold: 0.5,
        signal: new AbortController().signal,
        report: () => undefined
      })
    ).rejects.toThrow(/unavailable|not verified/i);
  });
});

describe('CLN-001A TeethSeg22 adapter', () => {
  it('adapts point labels into instances and metrics', () => {
    const points = [
      [0, 0, 0] as const,
      [0.1, 0, 0] as const,
      [10, 0, 0] as const,
      [10.1, 0, 0] as const,
      [5, 0, 0] as const
    ];
    const reference = {
      points,
      labels: [11, 11, 21, 21, 0]
    };
    const predicted = {
      points,
      labels: [11, 11, 21, 21, 0]
    };
    const m = evaluateTeethSeg22Benchmark({ predicted, reference, localizationRadiusMm: 5 });
    expect(m.tsa).toBe(1);
    expect(m.tir).toBe(1);
    expect(m.gingivaF1).toBe(1);
    expect(m.missingToothCount).toBe(0);
  });
});

describe('CLN-001A patient leakage guard', () => {
  it('rejects manifests with shared patientKey across splits', () => {
    expect(() =>
      parseDatasetManifest({
        manifestVersion: 'cln-001a-dataset-v1',
        datasetId: 'leak-test',
        license: { id: 'x', cleared: false, notes: '' },
        cases: [
          {
            caseId: 'a',
            patientKey: 'same',
            archRole: 'upper',
            split: 'TRAIN',
            sourceMeshPath: 'a.stl',
            hardCaseTags: ['normal'],
            groundTruth: {
              orientationPresent: false,
              trimBoundaryPresent: false,
              basePresent: false,
              segmentationPresent: false,
              preparedPresent: false
            }
          },
          {
            caseId: 'b',
            patientKey: 'same',
            archRole: 'lower',
            split: 'TEST',
            sourceMeshPath: 'b.stl',
            hardCaseTags: ['normal'],
            groundTruth: {
              orientationPresent: false,
              trimBoundaryPresent: false,
              basePresent: false,
              segmentationPresent: false,
              preparedPresent: false
            }
          }
        ]
      })
    ).toThrow(/leakage/i);
  });
});
