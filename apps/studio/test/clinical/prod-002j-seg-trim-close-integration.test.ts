/**
 * PROD-002J — segmented clinical case → certified Trim / Close Base integration contract.
 * Does not re-implement Trim/Close Base; asserts handoff readiness + PROD-001T loop3d locals.
 */

import { describe, expect, it } from 'vitest';
import {
  buildClinicalHandoffSnapshot,
  CLINICAL_HANDOFF_CONSUMERS,
  CLINICAL_HANDOFF_VERSION
} from '../../src/clinical/handoff/ClinicalHandoffSnapshot.js';
import {
  createEmptyClinicalDocument,
  withClinicalObjects,
  type ClinicalDocumentSnapshot
} from '../../src/clinical/document/ClinicalDocument.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import { buildClinicalTrimLoop3d } from '../../src/clinical/trim/ClinicalTrimLoop3d.js';

const segmentedArch = (id: string, arch: 'upper' | 'lower'): ClinicalMeshDescriptor =>
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
    archRole: arch,
    geometryFingerprint: `geo:${id}`,
    geometryRevision: 3,
    segmentationMeta: Object.freeze({
      predictionId: `pred-${id}`,
      providerId: 'reference-heuristic',
      modelId: 'clinical-reference-seg',
      modelVersion: '1.1.0',
      instanceCount: 1,
      caseBand: 'moderate',
      geometryFingerprint: `geo:${id}`,
      sourceRevision: 3,
      needsReviewCount: 0,
      validationVerdict: 'WARNING' as const,
      teeth: Object.freeze([
        Object.freeze({
          instanceId: 'inst-001',
          fdi: arch === 'upper' ? 11 : 41,
          status: 'IDENTIFIED',
          confidence: 0.72,
          needsReview: false,
          faceCount: 40,
          centroid: Object.freeze([1, 2, 3] as const),
          localFrame: Object.freeze({
            origin: Object.freeze([1, 2, 3] as const),
            xAxis: Object.freeze([1, 0, 0] as const),
            yAxis: Object.freeze([0, 1, 0] as const),
            zAxis: Object.freeze([0, 0, 1] as const),
            confidence: 'low'
          }),
          neighbors: Object.freeze({
            archPreviousId: undefined,
            archNextId: undefined,
            confidence: 'low',
            basis: 'arch-x-order'
          })
        })
      ])
    })
  });

const segmentedDoc = (): ClinicalDocumentSnapshot => {
  const empty = createEmptyClinicalDocument({
    now: 100_000,
    name: 'PROD-002J Case',
    patientName: 'PROD002J Patient',
    patientId: 'P-002J'
  });
  const withObjs = withClinicalObjects(
    empty,
    [segmentedArch('upper', 'upper'), segmentedArch('lower', 'lower')],
    100_001
  );
  return Object.freeze({
    ...withObjs,
    orientationMeta: Object.freeze({
      algorithmVersion: 'clinical-auto-orient-v1',
      confidence: 'high' as const,
      source: 'auto' as const,
      method: 'pca',
      hasUpper: true,
      hasLower: true,
      warnings: Object.freeze([] as string[]),
      estimatedAt: 1,
      acceptedAt: 2
    }),
    preparationMeta: Object.freeze({
      algorithmVersion: 'prep-1',
      uiState: 'ready' as const,
      sourceFingerprint: 'geo:1',
      warningCount: 0,
      archCount: 2,
      preparedAt: 3,
      timingMs: 1,
      message: 'ok'
    })
  });
};

describe('PROD-002J segmented case → Trim/Close Base handoff', () => {
  it('exposes trim and close-base consumers with orientation and tooth local frames', () => {
    const snap = buildClinicalHandoffSnapshot({ document: segmentedDoc() });
    expect(snap.version).toBe(CLINICAL_HANDOFF_VERSION);
    expect(snap.orientation.accepted).toBe(true);
    expect(snap.intendedConsumers).toEqual(
      expect.arrayContaining(['trim', 'close-base'])
    );
    expect([...CLINICAL_HANDOFF_CONSUMERS]).toEqual(
      expect.arrayContaining(['trim', 'close-base', 'tooth-movement', 'manufacturing'])
    );
    expect(snap.arches).toHaveLength(2);
    for (const arch of snap.arches) {
      expect(arch.toothCount).toBeGreaterThan(0);
      expect(arch.teeth[0]?.localFrame?.origin).toEqual([1, 2, 3]);
      expect(arch.transform).toBeDefined();
    }
    expect(JSON.stringify(snap)).not.toMatch(/geometryBackend|vtk-http-worker|vtk-native-worker/i);
  });
});

describe('PROD-002J PROD-001T loop3d / localXYZ regression', () => {
  it('prefers mesh-local loop3d so oriented registry buffers stay consistent', () => {
    const built = buildClinicalTrimLoop3d(
      [
        {
          x: 0,
          y: 0,
          worldX: 100,
          worldY: 200,
          worldZ: 300,
          localX: 0,
          localY: 0,
          localZ: 0
        },
        {
          x: 1,
          y: 0,
          worldX: 110,
          worldY: 200,
          worldZ: 300,
          localX: 5,
          localY: 0,
          localZ: 0
        },
        {
          x: 1,
          y: 1,
          worldX: 110,
          worldY: 210,
          worldZ: 300,
          localX: 5,
          localY: 5,
          localZ: 0
        },
        {
          x: 0,
          y: 1,
          worldX: 100,
          worldY: 210,
          worldZ: 300,
          localX: 0,
          localY: 5,
          localZ: 0
        }
      ],
      'KEEP_OUTSIDE'
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.points[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(built.value.points[1]).toEqual({ x: 5, y: 0, z: 0 });
    expect(built.value.normal[2]).toBeCloseTo(1, 5);
  });
});
