/**
 * PROD-002G — production segmentation validation gate.
 */

import { describe, expect, it } from 'vitest';
import {
  isSegmentationAcceptBlocked,
  validateSegmentationPrediction,
  SEGMENTATION_VALIDATION_VERSION
} from '../../src/clinical/segmentation/ClinicalSegmentationValidation.js';
import {
  SEGMENTATION_MANUAL_EDIT_CAPABILITIES,
  mergeInstances,
  splitInstance,
  relabelInstanceFdi,
  markInstanceMissing,
  markSemanticFaces
} from '../../src/clinical/segmentation/review/ClinicalSegmentationReview.js';
import type { SegmentationPrediction } from '../../src/clinical/segmentation/prediction/types.js';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { withClinicalObjects } from '../../src/clinical/document/ClinicalDocument.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../src/clinical/import/ClinicalMeshDescriptor.js';

const basePrediction = (
  overrides?: Partial<SegmentationPrediction>
): SegmentationPrediction =>
  Object.freeze({
    predictionId: 'pred-g',
    sourceObjectId: 'upper',
    sourceRevision: 0,
    geometryFingerprint: 'geo:g',
    providerId: 'reference-heuristic',
    modelId: 'ref',
    modelVersion: '1',
    preprocessingVersion: 'seg-pre-1.0.0',
    postprocessingVersion: 'seg-post-1.1.0',
    identificationVersion: 'seg-id-1.1.0',
    createdAt: 1,
    faceLabels: Object.freeze([
      Object.freeze({ faceIndex: 0, label: 'TOOTH' as const, confidence: 0.8 }),
      Object.freeze({ faceIndex: 1, label: 'TOOTH' as const, confidence: 0.8 })
    ]),
    instances: Object.freeze([
      Object.freeze({
        instanceId: 'inst-001',
        faceIndices: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7]),
        vertexIndices: Object.freeze([0, 1, 2]),
        confidence: 0.8,
        centroid: Object.freeze([0, 0, 2] as const),
        bounds: Object.freeze({
          min: Object.freeze([-1, -1, 0] as const),
          max: Object.freeze([1, 1, 4] as const)
        }),
        faceCount: 8,
        presence: 'PRESENT' as const,
        identification: Object.freeze({
          status: 'IDENTIFIED' as const,
          fdi: 11 as const,
          confidence: 0.7,
          candidates: Object.freeze([{ fdi: 11 as const, score: 0.7 }])
        }),
        neighbors: Object.freeze({
          archPreviousId: undefined,
          archNextId: 'inst-002',
          confidence: 'low' as const,
          basis: 'arch-x-order' as const
        })
      }),
      Object.freeze({
        instanceId: 'inst-002',
        faceIndices: Object.freeze([8, 9, 10, 11, 12, 13, 14, 15]),
        vertexIndices: Object.freeze([3, 4, 5]),
        confidence: 0.8,
        centroid: Object.freeze([3, 0, 2] as const),
        bounds: Object.freeze({
          min: Object.freeze([2, -1, 0] as const),
          max: Object.freeze([4, 1, 4] as const)
        }),
        faceCount: 8,
        presence: 'PRESENT' as const,
        identification: Object.freeze({
          status: 'IDENTIFIED' as const,
          fdi: 21 as const,
          confidence: 0.7,
          candidates: Object.freeze([{ fdi: 21 as const, score: 0.7 }])
        }),
        neighbors: Object.freeze({
          archPreviousId: 'inst-001',
          archNextId: undefined,
          confidence: 'low' as const,
          basis: 'arch-x-order' as const
        })
      })
    ]),
    missingSlots: Object.freeze([]),
    confidence: Object.freeze({
      faceMean: 0.8,
      instanceMean: 0.8,
      identificationMean: 0.7,
      caseBand: 'moderate' as const,
      needsReviewCount: 0
    }),
    warnings: Object.freeze([] as string[]),
    metrics: Object.freeze({}),
    ...overrides
  });

describe('PROD-002G validation coverage', () => {
  it('emits v2 reports covering required clinical check categories', () => {
    const report = validateSegmentationPrediction(basePrediction(), {
      meshFaceCount: 32,
      archRole: 'upper'
    });
    expect(report.version).toBe(SEGMENTATION_VALIDATION_VERSION);
    expect(report.version).toBe('clinical-seg-validation-v2');
    const ids = new Set(report.checks.map((c) => c.id));
    for (const required of [
      'tooth-count',
      'stable-ids',
      'fdi-unique',
      'overlap',
      'empty-instances',
      'finite-geometry',
      'topology-face-list',
      'disconnected-fragments',
      'boundary-quality',
      'merged-teeth',
      'missing-slots',
      'confidence',
      'identification',
      'arch-consistency',
      'fdi-arch-bank',
      'anatomical-position',
      'neighbors',
      'face-index-bounds'
    ]) {
      expect(ids.has(required)).toBe(true);
    }
    expect(report.verdict === 'PASS' || report.verdict === 'WARNING').toBe(true);
    expect(isSegmentationAcceptBlocked(report)).toBe(false);
  });

  it('FAILs overlap, duplicate FDI, empty, non-finite, mixed arch, broken neighbors', () => {
    const base = basePrediction();
    const overlap = validateSegmentationPrediction({
      ...base,
      instances: [
        base.instances[0]!,
        { ...base.instances[1]!, faceIndices: [0, 1, 2, 3, 4, 5, 6, 7] }
      ]
    } as SegmentationPrediction);
    expect(overlap.verdict).toBe('FAIL');
    expect(overlap.fatalCheckIds).toContain('overlap');
    expect(isSegmentationAcceptBlocked(overlap)).toBe(true);

    const dupFdi = validateSegmentationPrediction({
      ...base,
      instances: [
        base.instances[0]!,
        {
          ...base.instances[1]!,
          identification: {
            ...base.instances[1]!.identification,
            fdi: 11 as const
          }
        }
      ]
    } as SegmentationPrediction);
    expect(dupFdi.fatalCheckIds).toContain('fdi-unique');

    const empty = validateSegmentationPrediction({
      ...base,
      instances: [
        { ...base.instances[0]!, faceIndices: [], faceCount: 0 },
        base.instances[1]!
      ]
    } as SegmentationPrediction);
    expect(empty.fatalCheckIds).toContain('empty-instances');

    const nonFinite = validateSegmentationPrediction({
      ...base,
      instances: [
        {
          ...base.instances[0]!,
          centroid: [Number.NaN, 0, 0] as [number, number, number]
        },
        base.instances[1]!
      ]
    } as SegmentationPrediction);
    expect(nonFinite.fatalCheckIds).toContain('finite-geometry');

    const mixedArch = validateSegmentationPrediction({
      ...base,
      instances: [
        base.instances[0]!,
        {
          ...base.instances[1]!,
          identification: {
            ...base.instances[1]!.identification,
            fdi: 41 as const
          }
        }
      ]
    } as SegmentationPrediction);
    expect(mixedArch.fatalCheckIds).toContain('arch-consistency');

    const brokenNeighbors = validateSegmentationPrediction({
      ...base,
      instances: [
        {
          ...base.instances[0]!,
          neighbors: {
            archPreviousId: undefined,
            archNextId: 'missing-id',
            confidence: 'low',
            basis: 'arch-x-order'
          }
        },
        base.instances[1]!
      ]
    } as SegmentationPrediction);
    expect(brokenNeighbors.fatalCheckIds).toContain('neighbors');
  });

  it('WARNINGs for missing teeth, fragments, and heuristic neighbors remain reviewable', () => {
    const base = basePrediction();
    const missing = validateSegmentationPrediction({
      ...base,
      missingSlots: Object.freeze([{ fdi: 16 as const, presence: 'MISSING' as const }])
    });
    expect(missing.checks.some((c) => c.id === 'missing-slots' && c.verdict === 'WARNING')).toBe(
      true
    );
    expect(isSegmentationAcceptBlocked(missing)).toBe(false);

    const fragment = validateSegmentationPrediction({
      ...base,
      instances: [
        { ...base.instances[0]!, faceIndices: [0, 1, 2], faceCount: 3 },
        base.instances[1]!
      ]
    } as SegmentationPrediction);
    expect(
      fragment.checks.some((c) => c.id === 'disconnected-fragments' && c.verdict === 'WARNING')
    ).toBe(true);

    expect(
      validateSegmentationPrediction(base).checks.some(
        (c) => c.id === 'neighbors' && c.verdict === 'WARNING'
      )
    ).toBe(true);
  });

  it('FAILs face-index OOB against meshFaceCount', () => {
    const report = validateSegmentationPrediction(basePrediction(), { meshFaceCount: 5 });
    expect(report.verdict).toBe('FAIL');
    expect(report.fatalCheckIds).toContain('face-index-bounds');
  });
});

describe('PROD-002G manual edit domain (no fake UI)', () => {
  it('declares split/merge/reassign/boundary/missing capabilities', () => {
    const ids = SEGMENTATION_MANUAL_EDIT_CAPABILITIES.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining(['split', 'merge', 'reassign', 'boundary-correction', 'mark-missing'])
    );
  });

  it('merge/split/relabel/markMissing keep neighbor integrity for revalidation', () => {
    const base = basePrediction();
    const merged = mergeInstances(base, 'inst-001', 'inst-002');
    expect(merged.meta.type).toBe('merge');
    expect(merged.prediction.instances).toHaveLength(1);
    expect(merged.prediction.instances[0]?.neighbors).toBeDefined();

    const split = splitInstance(base, 'inst-001', [0, 1, 2, 3]);
    expect(split.meta.type).toBe('split');
    expect(split.prediction.instances.length).toBe(3);
    const splitReport = validateSegmentationPrediction(split.prediction, {
      meshFaceCount: 32,
      archRole: 'upper'
    });
    expect(splitReport.fatalCheckIds.includes('neighbors')).toBe(false);

    const relabel = relabelInstanceFdi(base, 'inst-001', 12);
    expect(relabel.meta.type).toBe('relabel-fdi');
    expect(relabel.prediction.instances.find((i) => i.instanceId === 'inst-001')?.identification.fdi).toBe(
      12
    );

    const missing = markInstanceMissing(base, 'inst-002');
    expect(missing.meta.type).toBe('mark-missing');
    expect(
      missing.prediction.instances.find((i) => i.instanceId === 'inst-002')?.presence
    ).toBe('MISSING');

    const boundary = markSemanticFaces(base, [0, 1], 'GINGIVA', 'boundary-paint');
    expect(boundary.meta.type).toBe('boundary-correct');
  });
});

describe('PROD-002G accept blocking + review acknowledgement', () => {
  const boot = async () => {
    const host = new StudioCompositionRoot({
      forceMockViewportBackend: true,
      clock: { now: () => 92000 }
    });
    const clinical = new ClinicalBootstrap().bootstrap(host);
    await host.attachViewport({
      width: 640,
      height: 480,
      clientWidth: 640,
      clientHeight: 480,
      getContext: () => null
    });
    expect(clinical.session.newCase({ name: 'PROD-002G' }).ok).toBe(true);
    return { host, clinical };
  };

  const meshDesc = (id: string): ClinicalMeshDescriptor =>
    Object.freeze({
      id: asClinicalObjectId(id),
      displayName: id,
      sourceFile: `${id}.stl`,
      format: 'stl' as const,
      units: 'mm' as const,
      bounds: DEFAULT_MESH_BOUNDS,
      vertexCount: 100,
      faceCount: 200,
      importedAt: 1,
      visible: true,
      selectable: true,
      hierarchyParentId: undefined,
      importerId: 'studio-passthrough',
      sourceEntityId: id,
      displayState: 'default' as const,
      transform: IDENTITY_CLINICAL_TRANSFORM,
      archRole: 'upper' as const
    });

  it('blocks accept on FAIL and allows WARNING after review acknowledgement', async () => {
    const { host, clinical } = await boot();
    const doc = clinical.session.getPublicState().activeCase!;
    expect(
      clinical.session.applyDocument(withClinicalObjects(doc, [meshDesc('upper')], 92001), true).ok
    ).toBe(true);
    host.runtimes.kernel.registry.ensureSourceMesh('upper', { gridResolution: 10 });

    expect(clinical.workspace.orientation.enter().ok).toBe(true);
    expect(clinical.workspace.orientation.accept().ok).toBe(true);
    clinical.workspace.preparation.notifyOrientationComplete();
    expect(clinical.workspace.preparation.start().ok).toBe(true);
    expect(clinical.workspace.preparation.activateSession().ok).toBe(true);
    expect(clinical.workspace.preparation.advanceStage().ok).toBe(true);
    expect(clinical.workspace.preparation.advanceStage().ok).toBe(true);
    expect(clinical.workspace.preparation.advanceStage().ok).toBe(true);

    const infer = await clinical.workspace.segmentation.segmentTeeth();
    expect(infer.ok).toBe(true);
    const state = clinical.workspace.segmentation.session.getState();
    expect(state.phase).toBe('ready-for-review');
    expect(state.validationReport).toBeDefined();

    // Inject FAIL via overlapping faces, then revalidate through merge path / setPrediction+accept
    const pred = state.prediction!;
    const first = pred.instances[0];
    const second = pred.instances[1];
    if (first !== undefined && second !== undefined) {
      const broken = {
        ...pred,
        instances: Object.freeze([
          first,
          Object.freeze({
            ...second,
            faceIndices: first.faceIndices
          })
        ])
      } as SegmentationPrediction;
      clinical.workspace.segmentation.session.setPrediction(broken);
      clinical.workspace.segmentation.session.setValidationReport(
        validateSegmentationPrediction(broken, {
          meshFaceCount: Math.floor(
            (host.runtimes.kernel.registry.getByObjectId('upper', 'source')?.indices.length ?? 0) / 3
          ),
          archRole: 'upper'
        })
      );
      clinical.workspace.segmentation.session.setReviewAcknowledged(true);
      const blocked = await clinical.workspace.segmentation.accept();
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) {
        expect(blocked.error.message).toMatch(/FAIL/i);
      }
    }

    // Restore a valid inference and verify WARNING path needs acknowledgement when needed
    const reinfer = await clinical.workspace.segmentation.runInference();
    expect(reinfer.ok).toBe(true);
    const after = clinical.workspace.segmentation.session.getState();
    expect(after.validationReport?.verdict).not.toBe('FAIL');
    if ((after.prediction?.confidence.needsReviewCount ?? 0) > 0) {
      const noAck = await clinical.workspace.segmentation.accept();
      expect(noAck.ok).toBe(false);
      expect(clinical.workspace.segmentation.acknowledgeReview().ok).toBe(true);
    }
    // Accept must not silently commit FAIL; WARNING is reviewable after ack
    if (after.validationReport?.verdict !== 'FAIL') {
      const accepted = await clinical.workspace.segmentation.accept();
      expect(accepted.ok).toBe(true);
    }
  });
});
