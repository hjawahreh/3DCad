/**
 * PROD-002D — preprocessing / orientation production flow tests.
 * Preserves PROD-001T local-over-world loop3d; does not redesign Trim/Close Base.
 */

import { describe, expect, it } from 'vitest';
import { IDENTITY_MAT4 } from '@cad-studio/scene';
import {
  invertMat4,
  multiplyMat4,
  rotateYMat4,
  rotateZMat4,
  transformPoint3,
  translateMat4,
  uniformScaleMat4,
  worldToLocalPoint3,
  isIdentityTransform
} from '../../src/clinical/orientation/ClinicalTransformMath.js';
import {
  inferClinicalAxes,
  resolveAnteriorAxes,
  shouldPreferClinicalFrame
} from '../../src/clinical/display/ClinicalAnteriorCamera.js';
import { buildClinicalTrimLoop3d } from '../../src/clinical/trim/ClinicalTrimLoop3d.js';
import { asClinicalCaseId, asClinicalRevision } from '../../src/clinical/runtime/types.js';
import { asClinicalObjectId } from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import type { ClinicalDocumentSnapshot } from '../../src/clinical/document/ClinicalDocument.js';
import { fingerprintMesh, createMesh, cloneMesh } from '../../src/geometry-kernel/mesh/TriangleMesh.js';
import { preprocessSegmentationMesh } from '../../src/clinical/segmentation/preprocess/SegmentationPreprocess.js';

const nearlyI = (m: { readonly elements: readonly number[] }, eps = 1e-5): void => {
  for (let i = 0; i < 16; i += 1) {
    expect(m.elements[i]).toBeCloseTo(IDENTITY_MAT4.elements[i]!, eps);
  }
};

const docWith = (partial: {
  readonly acceptedAt?: number;
  readonly transform?: typeof IDENTITY_MAT4;
}): ClinicalDocumentSnapshot => {
  const now = 1_700_000_000_000;
  return Object.freeze({
    caseId: asClinicalCaseId('case-prod002d'),
    revision: asClinicalRevision(1),
    patient: Object.freeze({
      patientId: 'p',
      displayName: 'Prod',
      chartNumber: undefined,
      notes: undefined
    }),
    caseMeta: Object.freeze({
      caseId: asClinicalCaseId('case-prod002d'),
      name: 'PROD-002D',
      createdAt: now,
      updatedAt: now,
      clinician: undefined,
      practice: undefined,
      tags: Object.freeze([])
    }),
    units: 'mm',
    coordinateSystem: 'rhs-y-up',
    display: Object.freeze({
      showGrid: true,
      showOrigin: true,
      showAxes: true,
      background: 'dark'
    }),
    objects: Object.freeze([
      Object.freeze({
        id: asClinicalObjectId('upper'),
        displayName: 'Upper Arch',
        sourceFile: 'upper.stl',
        format: 'stl' as const,
        units: 'mm' as const,
        bounds: Object.freeze({
          min: Object.freeze({ x: 0, y: 0, z: 0 }),
          max: Object.freeze({ x: 40, y: 10, z: 20 })
        }),
        vertexCount: 8,
        faceCount: 12,
        importedAt: now,
        visible: true,
        selectable: true,
        hierarchyParentId: undefined,
        importerId: 'clinical-import',
        sourceEntityId: 'upper',
        displayState: 'default' as const,
        archRole: 'upper' as const,
        transform: partial.transform ?? IDENTITY_MAT4
      })
    ]),
    orientationMeta:
      partial.acceptedAt === undefined
        ? undefined
        : Object.freeze({
            algorithmVersion: 'clinical-auto-orient-v1',
            confidence: 'high' as const,
            source: 'auto' as const,
            method: 'pca',
            hasUpper: true,
            hasLower: false,
            warnings: Object.freeze([] as string[]),
            estimatedAt: partial.acceptedAt - 1,
            acceptedAt: partial.acceptedAt
          }),
    preparationMeta: undefined,
    dirty: false,
    createdAt: now,
    updatedAt: now
  });
};

describe('PROD-002D transform math', () => {
  it('rotation invert round-trips to identity', () => {
    const r = rotateYMat4(42);
    const inv = invertMat4(r);
    expect(inv).toBeDefined();
    nearlyI(multiplyMat4(inv!, r));
  });

  it('translation invert round-trips points', () => {
    const t = translateMat4(10, -3, 7);
    const inv = invertMat4(t);
    expect(inv).toBeDefined();
    const p = [1, 2, 3] as const;
    const world = transformPoint3(t, p);
    expect(world).toEqual([11, -1, 10]);
    const back = transformPoint3(inv!, world);
    expect(back[0]).toBeCloseTo(1, 8);
    expect(back[1]).toBeCloseTo(2, 8);
    expect(back[2]).toBeCloseTo(3, 8);
  });

  it('uniform scale invert round-trips points', () => {
    const s = uniformScaleMat4(2.5);
    const inv = invertMat4(s);
    expect(inv).toBeDefined();
    const p = [4, -2, 8] as const;
    const scaled = transformPoint3(s, p);
    expect(scaled).toEqual([10, -5, 20]);
    const back = transformPoint3(inv!, scaled);
    expect(back[0]).toBeCloseTo(4, 8);
    expect(back[1]).toBeCloseTo(-2, 8);
    expect(back[2]).toBeCloseTo(8, 8);
  });

  it('composed orientation (R*T) world/local round-trips', () => {
    const composed = multiplyMat4(rotateZMat4(30), translateMat4(5, 0, -2));
    const pLocal = [3, 1, 4] as const;
    const pWorld = transformPoint3(composed, pLocal);
    const recovered = worldToLocalPoint3(composed, pWorld);
    expect(recovered).toBeDefined();
    expect(recovered![0]).toBeCloseTo(3, 6);
    expect(recovered![1]).toBeCloseTo(1, 6);
    expect(recovered![2]).toBeCloseTo(4, 6);
    nearlyI(multiplyMat4(invertMat4(composed)!, composed), 1e-5);
  });
});

describe('PROD-002D clinical frame vs AABB', () => {
  it('does not use AABB axes when clinical orientation is preferred', () => {
    // Ambiguous AABB where shortest span is Z — AABB would pick Z as superior.
    const bounds = Object.freeze({
      min: Object.freeze({ x: 0, y: 0, z: 0 }),
      max: Object.freeze({ x: 40, y: 30, z: 5 })
    });
    const aabb = inferClinicalAxes(bounds);
    expect(aabb.superior).toBe('z');
    const clinical = resolveAnteriorAxes(bounds, true);
    expect(clinical.superior).toBe('y');
    expect(clinical.anterior).toBe('z');
  });

  it('shouldPreferClinicalFrame trusts accepted orientationMeta', () => {
    const accepted = docWith({ acceptedAt: 100 });
    expect(shouldPreferClinicalFrame(accepted)).toBe(true);
    expect(shouldPreferClinicalFrame(accepted, { preferClinicalFrame: false })).toBe(false);
    expect(shouldPreferClinicalFrame(docWith({}))).toBe(false);
  });

  it('shouldPreferClinicalFrame trusts non-identity transforms', () => {
    const rotated = docWith({ transform: rotateYMat4(15) });
    expect(isIdentityTransform(rotated.objects[0]!.transform)).toBe(false);
    expect(shouldPreferClinicalFrame(rotated)).toBe(true);
  });
});

describe('PROD-002D PROD-001T loop3d regression (unchanged)', () => {
  it('prefers local over divergent world coordinates', () => {
    const built = buildClinicalTrimLoop3d(
      [
        { x: 0, y: 0, worldX: 100, worldY: 100, worldZ: 100, localX: 0, localY: 0, localZ: 0 },
        { x: 1, y: 0, worldX: 110, worldY: 100, worldZ: 100, localX: 10, localY: 0, localZ: 0 },
        { x: 1, y: 1, worldX: 110, worldY: 110, worldZ: 100, localX: 10, localY: 10, localZ: 0 },
        { x: 0, y: 1, worldX: 100, worldY: 110, worldZ: 100, localX: 0, localY: 10, localZ: 0 }
      ],
      'KEEP_OUTSIDE'
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.points[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(built.value.points[1]).toEqual({ x: 10, y: 0, z: 0 });
  });
});

describe('PROD-002D preprocessing immutability', () => {
  it('keeps source mesh buffers immutable while building working features', async () => {
    const positions = new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 10]);
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);
    const mesh = createMesh({
      id: 1,
      objectId: 'arch',
      revision: 0,
      positions,
      indices,
      role: 'source'
    });
    const before = fingerprintMesh(mesh.positions, mesh.indices);
    const beforePos = Float32Array.from(mesh.positions);
    await preprocessSegmentationMesh(mesh);
    expect(fingerprintMesh(mesh.positions, mesh.indices)).toBe(before);
    expect([...mesh.positions]).toEqual([...beforePos]);
    const working = cloneMesh(mesh);
    working.positions[0] = 42;
    expect(mesh.positions[0]).toBe(0);
  });
});
