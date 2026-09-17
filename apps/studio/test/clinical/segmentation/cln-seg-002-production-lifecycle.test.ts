/**
 * CLN-SEG-002 — production lifecycle, worker validation, honesty gates.
 */
import { describe, expect, it } from 'vitest';
import {
  ProductionSegmentationLifecycle,
  PRODUCTION_INFERENCE_WATCHDOG_MS,
  productionLifecycleToReviewKind,
  productionLifecycleUiLabel,
  resolveProductionLifecycleBootstrap,
  validateWorkerInferRequest,
  validateWorkerInferResult,
  isNonClinicalSegmentationProvider,
  evaluateCaseMovementReadiness
} from '../../../src/clinical/segmentation/index.js';
import { SegmentationError } from '../../../src/clinical/segmentation/errors.js';
import type { ClinicalDocumentSnapshot } from '../../../src/clinical/document/ClinicalDocument.js';
import { asClinicalObjectId } from '../../../src/clinical/import/ClinicalMeshDescriptor.js';

describe('CLN-SEG-002 production lifecycle state machine', () => {
  it('transitions NOT_CONFIGURED → INITIALIZING → READY → INFERENCING → COMPLETED → ACCEPTED', () => {
    const life = new ProductionSegmentationLifecycle();
    expect(life.getState()).toBe('NOT_CONFIGURED');
    expect(life.transition('INITIALIZING')).toBe(true);
    expect(life.transition('READY')).toBe(true);
    expect(life.transition('INFERENCING')).toBe(true);
    expect(life.transition('COMPLETED')).toBe(true);
    expect(life.transition('ACCEPTED')).toBe(true);
    expect(productionLifecycleToReviewKind('ACCEPTED')).toBe('accepted');
  });

  it('supports REJECTED / FAILED / STALE paths', () => {
    const life = new ProductionSegmentationLifecycle();
    life.force('INFERENCING');
    expect(life.transition('FAILED')).toBe(true);
    expect(life.transition('READY')).toBe(true);
    life.force('COMPLETED');
    expect(life.transition('REJECTED')).toBe(true);
    life.force('ACCEPTED');
    expect(life.transition('STALE')).toBe(true);
    expect(productionLifecycleUiLabel('STALE')).toMatch(/outdated/i);
  });

  it('watchdog fails stuck INFERENCING (no permanent preparing)', () => {
    const life = new ProductionSegmentationLifecycle();
    life.force('INFERENCING');
    const started = life.getInferStartedAt()!;
    expect(life.checkWatchdog(started + PRODUCTION_INFERENCE_WATCHDOG_MS - 1)).toBe(false);
    expect(life.checkWatchdog(started + PRODUCTION_INFERENCE_WATCHDOG_MS + 1)).toBe(true);
    expect(life.getState()).toBe('FAILED');
  });

  it('bootstrap keeps heuristic at NOT_CONFIGURED (never fake production READY)', () => {
    expect(
      resolveProductionLifecycleBootstrap({
        providerId: 'reference-heuristic',
        productionConfigured: true,
        productionOperational: true,
        isHeuristicProvider: true
      })
    ).toBe('NOT_CONFIGURED');
  });

  it('bootstrap maps document STALE', () => {
    expect(
      resolveProductionLifecycleBootstrap({
        providerId: 'production-clinical-model',
        productionConfigured: true,
        productionOperational: true,
        documentStatus: 'STALE',
        isHeuristicProvider: false
      })
    ).toBe('STALE');
  });
});

describe('CLN-SEG-002 worker request/response validation', () => {
  it('rejects incomplete infer request', () => {
    expect(() =>
      validateWorkerInferRequest({
        geometryFingerprint: '',
        sourceRevision: 1,
        objectId: 'o',
        positions: new Float32Array(9),
        indices: new Uint32Array(3)
      })
    ).toThrow(SegmentationError);
  });

  it('rejects fingerprint mismatch / missing toothInstances', () => {
    expect(() =>
      validateWorkerInferResult({
        result: {
          segmentationGeometryFingerprint: 'geo:other',
          geometryRevision: 1,
          arch: 'unknown',
          inferenceRunId: 'seg-00000001',
          inferenceTimestamp: 1,
          FDILabel: [0, 0, 0],
          confidence: [0.5, 0.5, 0.5],
          toothInstances: [],
          runtimeMs: 1,
          modelMetadata: {},
          sampleToSource: { sampleCount: 1, vertexIndex: [0], faceIndex: [0] },
          preprocessing: { inputVertexCount: 3, inputTriangleCount: 1 }
        },
        expectedFingerprint: 'geo:mine',
        expectedRevision: 1,
        expectedArch: 'unknown',
        faceCount: 3
      })
    ).toThrow(/fingerprint mismatch/i);
  });

  it('accepts a minimal valid worker payload and extracts checkpoint fingerprint', () => {
    const validated = validateWorkerInferResult({
      result: {
        segmentationGeometryFingerprint: 'geo:mine',
        geometryRevision: 2,
        arch: 'upper',
        inferenceRunId: 'seg-00000002',
        inferenceTimestamp: 2,
        FDILabel: [11, 0, 0],
        confidence: [0.9, 0.5, 0.5],
        toothInstances: [],
        runtimeMs: 12,
        modelMetadata: { checkpointSha256: 'abc123', modelName: 'tsegformer' },
        sampleToSource: { sampleCount: 1, vertexIndex: [0], faceIndex: [0] },
        preprocessing: {
          inputVertexCount: 3,
          inputTriangleCount: 1,
          sampleCount: 1,
          normalization: 'unit',
          scaleUnit: 'mm',
          runtime: 'cpu'
        },
        vertexLabel: [],
        instanceLabel: [],
        gingivaLabel: 0,
        missingCandidates: [],
        stages: { inferenceMs: 10 },
        device: 'CPU'
      },
      expectedFingerprint: 'geo:mine',
      expectedRevision: 2,
      expectedArch: 'upper',
      faceCount: 3
    });
    expect(validated.checkpointFingerprint).toBe('abc123');
  });

  it.each([
    ['geometry revision', { geometryRevision: 7 }, /revision mismatch/i],
    ['arch', { arch: 'lower' }, /arch mismatch/i],
    ['run id', { inferenceRunId: '' }, /inferenceRunId/i],
    ['timestamp', { inferenceTimestamp: Number.NaN }, /inferenceTimestamp/i]
  ])('rejects invalid worker %s binding', (_name, override, message) => {
    const result = {
      segmentationGeometryFingerprint: 'geo:mine',
      geometryRevision: 2,
      arch: 'upper',
      inferenceRunId: 'seg-00000003',
      inferenceTimestamp: 3,
      FDILabel: [11],
      confidence: [0.9],
      toothInstances: [],
      runtimeMs: 12,
      modelMetadata: {},
      sampleToSource: { sampleCount: 1, vertexIndex: [0], faceIndex: [0] },
      preprocessing: { inputVertexCount: 3, inputTriangleCount: 1 },
      vertexLabel: [],
      instanceLabel: [],
      gingivaLabel: 0,
      missingCandidates: [],
      stages: {},
      device: 'CPU',
      ...override
    };
    expect(() =>
      validateWorkerInferResult({
        result,
        expectedFingerprint: 'geo:mine',
        expectedRevision: 2,
        expectedArch: 'upper',
        faceCount: 1
      })
    ).toThrow(message);
  });
});

describe('CLN-SEG-002 biomechanics honesty', () => {
  it('heuristic provider never counts as clinical', () => {
    expect(isNonClinicalSegmentationProvider('reference-heuristic')).toBe(true);
    expect(isNonClinicalSegmentationProvider('production-clinical-model')).toBe(false);
  });

  it('evaluateCaseMovementReadiness stays false for heuristic CURRENT meta', () => {
    const doc = {
      caseId: 'c1',
      revision: 1,
      objects: [
        {
          id: asClinicalObjectId('u'),
          displayName: 'upper',
          sourceFile: 'u.stl',
          format: 'stl' as const,
          units: 'mm' as const,
          bounds: {
            min: { x: 0, y: 0, z: 0 },
            max: { x: 1, y: 1, z: 1 }
          },
          vertexCount: 3,
          faceCount: 1,
          importedAt: 0,
          visible: true,
          selectable: true,
          hierarchyParentId: undefined,
          importerId: 't',
          sourceEntityId: 'e',
          displayState: 'default' as const,
          archRole: 'upper' as const,
          transform: Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
          geometryFingerprint: 'geo:u',
          geometryRevision: 1,
          segmentationMeta: {
            predictionId: 'p1',
            providerId: 'reference-heuristic',
            modelId: 'ref',
            modelVersion: '1',
            instanceCount: 1,
            caseBand: 'moderate',
            geometryFingerprint: 'geo:u',
            sourceRevision: 1,
            status: 'CURRENT' as const,
            validationVerdict: 'PASS' as const,
            needsReviewCount: 0,
            faceMembership: {
              version: 'face-membership-v1' as const,
              meshFaceCount: 1,
              instances: [{ instanceId: 't1', faceIndices: [0] }],
              membershipFingerprint: 'mem:1'
            },
            teeth: [
              {
                instanceId: 't1',
                fdi: 11,
                status: 'IDENTIFIED',
                confidence: 0.9,
                needsReview: false
              }
            ]
          }
        }
      ]
    } as unknown as ClinicalDocumentSnapshot;

    const readiness = evaluateCaseMovementReadiness(doc);
    expect(readiness.readyForMovement).toBe(false);
    expect(readiness.arches[0]?.isHeuristicProvider).toBe(true);
  });
});
