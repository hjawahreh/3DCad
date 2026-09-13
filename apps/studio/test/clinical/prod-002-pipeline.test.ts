/**
 * PROD-002 — Import → Segmentation foundation tests.
 */

import { describe, expect, it } from 'vitest';
import {
  cloneMesh,
  createMesh,
  fingerprintMesh
} from '../../src/geometry-kernel/mesh/TriangleMesh.js';
import { validateClinicalCase } from '../../src/clinical/case/ClinicalCaseValidation.js';
import { analyzeClinicalArchAnatomy } from '../../src/clinical/anatomy/ClinicalArchAnatomyAnalysis.js';
import { validateSegmentationPrediction } from '../../src/clinical/segmentation/ClinicalSegmentationValidation.js';
import { computeToothLocalFrame } from '../../src/clinical/segmentation/ClinicalToothLocalFrame.js';
import { buildClinicalHandoffSnapshot } from '../../src/clinical/handoff/ClinicalHandoffSnapshot.js';
import { buildClinicalTrimLoop3d } from '../../src/clinical/trim/ClinicalTrimLoop3d.js';
import { parseClinicalMeshBytes } from '../../src/clinical/import/ClinicalMeshParsers.js';
import { preprocessSegmentationMesh } from '../../src/clinical/segmentation/preprocess/SegmentationPreprocess.js';
import { separateToothInstances } from '../../src/clinical/segmentation/postprocess/InstanceSeparation.js';
import {
  invertMat4,
  multiplyMat4,
  rotateYMat4
} from '../../src/clinical/orientation/ClinicalTransformMath.js';
import {
  asClinicalCaseId,
  asClinicalRevision
} from '../../src/clinical/runtime/types.js';
import { asClinicalObjectId } from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import type { ClinicalDocumentSnapshot } from '../../src/clinical/document/ClinicalDocument.js';
import type { SegmentationPrediction } from '../../src/clinical/segmentation/prediction/types.js';
import { IDENTITY_MAT4 } from '@cad-studio/scene';

const boxMesh = () => {
  // Unit cube as triangles
  const positions = new Float32Array([
    0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10
  ]);
  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7,
    4, 3, 4, 0
  ]);
  return createMesh({
    id: 1,
    objectId: 'mesh',
    revision: 0,
    positions,
    indices,
    role: 'source'
  });
};

const minimalDoc = (objectIds: string[]): ClinicalDocumentSnapshot => {
  const now = 1_700_000_000_000;
  return Object.freeze({
    caseId: asClinicalCaseId('case-prod002'),
    revision: asClinicalRevision(1),
    patient: Object.freeze({
      patientId: 'p1',
      displayName: 'Prod Two',
      chartNumber: undefined,
      notes: undefined
    }),
    caseMeta: Object.freeze({
      caseId: asClinicalCaseId('case-prod002'),
      name: 'PROD-002',
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
    objects: Object.freeze(
      objectIds.map((id, i) =>
        Object.freeze({
          id: asClinicalObjectId(id),
          displayName: i === 0 ? 'Upper Arch' : 'Lower Arch',
          sourceFile: `${id}.stl`,
          format: 'stl' as const,
          units: 'mm' as const,
          bounds: Object.freeze({
            min: Object.freeze({ x: 0, y: 0, z: 0 }),
            max: Object.freeze({ x: 10, y: 10, z: 10 })
          }),
          vertexCount: 8,
          faceCount: 12,
          importedAt: now,
          visible: true,
          selectable: true,
          hierarchyParentId: undefined,
          importerId: 'clinical-import',
          sourceEntityId: id,
          displayState: 'default' as const,
          archRole: (i === 0 ? 'upper' : 'lower') as 'upper' | 'lower',
          transform: IDENTITY_MAT4
        })
      )
    ),
    orientationMeta: undefined,
    preparationMeta: undefined,
    dirty: false,
    createdAt: now,
    updatedAt: now
  });
};

describe('PROD-002 Phase 1 import parsers', () => {
  it('rejects empty / malformed STL and accepts minimal ASCII STL', () => {
    expect(() => parseClinicalMeshBytes(new ArrayBuffer(0), 'stl')).toThrow();
    const ascii = `solid t
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 1 0 0
    vertex 0 1 0
  endloop
endfacet
endsolid t
`;
    const parsed = parseClinicalMeshBytes(new TextEncoder().encode(ascii).buffer, 'stl');
    expect(parsed.positions.length).toBeGreaterThan(0);
    expect(parsed.indices.length).toBe(3);
  });

  it('parses minimal OBJ and rejects empty OBJ', () => {
    expect(() =>
      parseClinicalMeshBytes(new TextEncoder().encode('o empty\n').buffer, 'obj')
    ).toThrow(/triangle/i);
    const obj = `v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n`;
    const parsed = parseClinicalMeshBytes(new TextEncoder().encode(obj).buffer, 'obj');
    expect(Math.floor(parsed.indices.length / 3)).toBe(1);
  });

  it('parses ASCII PLY and rejects binary PLY', () => {
    const asciiPly = `ply
format ascii 1.0
element vertex 3
property float x
property float y
property float z
element face 1
property list uchar int vertex_indices
end_header
0 0 0
1 0 0
0 1 0
3 0 1 2
`;
    const parsed = parseClinicalMeshBytes(new TextEncoder().encode(asciiPly).buffer, 'ply');
    expect(parsed.faceCount).toBe(1);
    const binaryHdr = `ply\nformat binary_little_endian 1.0\nend_header\n`;
    expect(() =>
      parseClinicalMeshBytes(new TextEncoder().encode(binaryHdr).buffer, 'ply')
    ).toThrow(/ASCII PLY/i);
  });

  it('rejects out-of-range OBJ face indices and non-finite vertices', () => {
    expect(() =>
      parseClinicalMeshBytes(
        new TextEncoder().encode('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 99\n').buffer,
        'obj'
      )
    ).toThrow(/out-of-range|index/i);
    expect(() =>
      parseClinicalMeshBytes(
        new TextEncoder().encode('v 0 0 NaN\nv 1 0 0\nv 0 1 0\nf 1 2 3\n').buffer,
        'obj'
      )
    ).toThrow(/non-finite/i);
  });
});

describe('PROD-002 Phase 2 case validation', () => {
  it('PASSes a dual-arch mm-scale mesh case with open-boundary INFO only', () => {
    const mesh = boxMesh();
    const doc = minimalDoc(['upper', 'lower']);
    const report = validateClinicalCase({
      document: doc,
      meshes: new Map([
        ['upper', mesh],
        ['lower', mesh]
      ]),
      requireDualArch: true
    });
    expect(report.verdict === 'PASS' || report.verdict === 'WARNING').toBe(true);
    expect(report.hasUpper).toBe(true);
    expect(report.hasLower).toBe(true);
    expect(report.findings.some((f) => f.severity === 'ERROR')).toBe(false);
  });

  it('FAILs when mesh buffers are missing', () => {
    const doc = minimalDoc(['upper', 'lower']);
    const report = validateClinicalCase({
      document: doc,
      meshes: new Map(),
      requireDualArch: true
    });
    expect(report.verdict).toBe('FAIL');
    expect(report.findings.some((f) => f.id === 'mesh-missing')).toBe(true);
  });
});

describe('PROD-002 Phase 4 mesh-local loop3d regression (PROD-001T)', () => {
  it('prefers localX/Y/Z over divergent world coordinates after orientation', () => {
    const built = buildClinicalTrimLoop3d(
      [
        {
          x: 0,
          y: 0,
          worldX: 100,
          worldY: 100,
          worldZ: 100,
          localX: 0,
          localY: 0,
          localZ: 0
        },
        {
          x: 1,
          y: 0,
          worldX: 110,
          worldY: 100,
          worldZ: 100,
          localX: 10,
          localY: 0,
          localZ: 0
        },
        {
          x: 1,
          y: 1,
          worldX: 110,
          worldY: 110,
          worldZ: 100,
          localX: 10,
          localY: 10,
          localZ: 0
        },
        {
          x: 0,
          y: 1,
          worldX: 100,
          worldY: 110,
          worldZ: 100,
          localX: 0,
          localY: 10,
          localZ: 0
        }
      ],
      'KEEP_OUTSIDE'
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.points[0]).toEqual({ x: 0, y: 0, z: 0 });
    expect(built.value.points[1]).toEqual({ x: 10, y: 0, z: 0 });
    expect(built.value.normal[2]).toBeCloseTo(1, 5);
  });

  it('invertMat4 recovers identity when multiplied with original rotation', () => {
    const r = rotateYMat4(37);
    const inv = invertMat4(r);
    expect(inv).toBeDefined();
    if (inv === undefined) return;
    const product = multiplyMat4(inv, r);
    for (let i = 0; i < 16; i += 1) {
      expect(product.elements[i]).toBeCloseTo(IDENTITY_MAT4.elements[i]!, 5);
    }
  });
});

describe('PROD-002 Phase 3 preprocessing immutability', () => {
  it('does not mutate source mesh buffers and is deterministic', async () => {
    const mesh = boxMesh();
    const beforeFp = fingerprintMesh(mesh.positions, mesh.indices);
    const beforePos = Float32Array.from(mesh.positions);
    const a = await preprocessSegmentationMesh(mesh);
    const b = await preprocessSegmentationMesh(mesh);
    expect(fingerprintMesh(mesh.positions, mesh.indices)).toBe(beforeFp);
    expect([...mesh.positions]).toEqual([...beforePos]);
    expect(a.sourceFingerprint).toBe(b.sourceFingerprint);
    expect(a.faceCount).toBe(b.faceCount);
    expect(a.scale).toBe(b.scale);
    const working = cloneMesh(mesh);
    working.positions[0] = 999;
    expect(mesh.positions[0]).not.toBe(999);
  });
});

describe('PROD-002 Phase 5 arch anatomy analysis', () => {
  it('returns declared arch role with high confidence and deterministic frame', () => {
    const mesh = boxMesh();
    const a = analyzeClinicalArchAnatomy({
      objectId: 'upper',
      archRole: 'upper',
      mesh
    });
    const b = analyzeClinicalArchAnatomy({
      objectId: 'upper',
      archRole: 'upper',
      mesh
    });
    expect(a.archRegion.archRole).toBe('upper');
    expect(a.archRegion.confidence).toBe('high');
    expect(a.frame.centroid).toEqual(b.frame.centroid);
    expect(a.version).toBe('clinical-arch-anatomy-v2');
    expect(a.laterality.confidence).toBeDefined();
    expect(a.anteroposterior.confidence).toBeDefined();
    expect(a.dentalRegions.length).toBeGreaterThan(0);
  });
});

const samplePrediction = (): SegmentationPrediction =>
  Object.freeze({
    predictionId: 'pred-1',
    sourceObjectId: 'upper',
    sourceRevision: 1,
    geometryFingerprint: 'geo:1',
    providerId: 'reference-heuristic',
    modelId: 'ref',
    modelVersion: '1',
    preprocessingVersion: 'seg-pre-1.0.0',
    postprocessingVersion: 'seg-post-1.0.0',
    identificationVersion: 'seg-id-1.0.0',
    createdAt: 1,
    faceLabels: Object.freeze([]),
    instances: Object.freeze([
      Object.freeze({
        instanceId: 't1',
        faceIndices: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
        vertexIndices: Object.freeze([0, 1, 2]),
        confidence: 0.9,
        centroid: Object.freeze([1, 2, 3]) as [number, number, number],
        bounds: Object.freeze({
          min: Object.freeze([0, 0, 0]) as [number, number, number],
          max: Object.freeze([2, 2, 2]) as [number, number, number]
        }),
        faceCount: 10,
        presence: 'PRESENT' as const,
        identification: Object.freeze({
          status: 'IDENTIFIED' as const,
          fdi: 11 as const,
          confidence: 0.9,
          candidates: Object.freeze([{ fdi: 11 as const, score: 0.9 }])
        })
      }),
      Object.freeze({
        instanceId: 't2',
        faceIndices: Object.freeze([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]),
        vertexIndices: Object.freeze([3, 4, 5]),
        confidence: 0.8,
        centroid: Object.freeze([4, 2, 3]) as [number, number, number],
        bounds: Object.freeze({
          min: Object.freeze([3, 0, 0]) as [number, number, number],
          max: Object.freeze([5, 2, 2]) as [number, number, number]
        }),
        faceCount: 10,
        presence: 'PRESENT' as const,
        identification: Object.freeze({
          status: 'IDENTIFIED' as const,
          fdi: 21 as const,
          confidence: 0.8,
          candidates: Object.freeze([{ fdi: 21 as const, score: 0.8 }])
        })
      })
    ]),
    missingSlots: Object.freeze([]),
    confidence: Object.freeze({
      faceMean: 0.85,
      instanceMean: 0.85,
      identificationMean: 0.85,
      caseBand: 'high' as const,
      needsReviewCount: 0
    }),
    warnings: Object.freeze([]),
    metrics: Object.freeze({})
  });

describe('PROD-002 Phase 6–7 segmentation validation + tooth frames', () => {
  it('validates a clean prediction as PASS/WARNING without FAIL', () => {
    const report = validateSegmentationPrediction(samplePrediction());
    expect(report.verdict === 'PASS' || report.verdict === 'WARNING').toBe(true);
    expect(report.toothCount).toBe(2);
    expect(report.checks.some((c) => c.id === 'overlap' && c.verdict === 'PASS')).toBe(true);
  });

  it('FAILs on overlapping face assignments', () => {
    const base = samplePrediction();
    const bad = {
      ...base,
      instances: [
        base.instances[0]!,
        {
          ...base.instances[1]!,
          faceIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
        }
      ]
    } as SegmentationPrediction;
    const report = validateSegmentationPrediction(bad);
    expect(report.verdict).toBe('FAIL');
    expect(report.checks.some((c) => c.id === 'overlap' && c.verdict === 'FAIL')).toBe(true);
  });

  it('builds tooth-local frames deterministically', () => {
    const inst = samplePrediction().instances[0]!;
    const a = computeToothLocalFrame(inst);
    const b = computeToothLocalFrame(inst);
    expect(a.origin).toEqual(b.origin);
    expect(a.xAxis).toEqual(b.xAxis);
    expect(a.instanceId).toBe('t1');
  });
});

describe('PROD-002 Phase 8 clinical handoff', () => {
  it('builds a provider-agnostic handoff snapshot', () => {
    const doc = {
      ...minimalDoc(['upper', 'lower']),
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
      }),
      objects: Object.freeze(
        minimalDoc(['upper', 'lower']).objects.map((o) =>
          Object.freeze({
            ...o,
            segmentationMeta: Object.freeze({
              predictionId: 'p',
              providerId: 'reference-heuristic',
              modelId: 'ref',
              modelVersion: '1',
              instanceCount: 2,
              caseBand: 'high',
              geometryFingerprint: 'geo:1',
              sourceRevision: 1,
              needsReviewCount: 0,
              validationVerdict: 'WARNING' as const,
              status: 'CURRENT' as const,
              faceMembership: Object.freeze({
                version: 'face-membership-v1' as const,
                meshFaceCount: 20,
                membershipFingerprint: 'mem:test',
                instances: Object.freeze([
                  Object.freeze({
                    instanceId: 't1',
                    faceIndices: Object.freeze([0, 1, 2, 3])
                  })
                ])
              }),
              teeth: Object.freeze([
                Object.freeze({
                  instanceId: 't1',
                  fdi: 11,
                  status: 'IDENTIFIED',
                  confidence: 0.9,
                  needsReview: false,
                  faceCount: 42,
                  centroid: Object.freeze([1, 2, 3] as const),
                  localFrame: Object.freeze({
                    origin: Object.freeze([1, 2, 3] as const),
                    xAxis: Object.freeze([1, 0, 0] as const),
                    yAxis: Object.freeze([0, 1, 0] as const),
                    zAxis: Object.freeze([0, 0, 1] as const),
                    confidence: 'moderate'
                  })
                })
              ])
            })
          })
        )
      )
    } as ClinicalDocumentSnapshot;

    const snap = buildClinicalHandoffSnapshot({ document: doc, now: 99 });
    expect(snap.version).toBe('clinical-handoff-v2');
    expect(snap.readyForMovement).toBe(false);
    expect(snap.arches).toHaveLength(2);
    expect(snap.orientation.accepted).toBe(true);
    expect(snap.arches[0]!.teeth[0]!.fdi).toBe(11);
    expect(snap.arches[0]!.teeth[0]!.faceCount).toBe(42);
    expect(snap.arches[0]!.teeth[0]!.centroid).toEqual([1, 2, 3]);
    expect(snap.arches[0]!.teeth[0]!.localFrame).toBeDefined();
    expect(snap.arches[0]!.transform).toHaveLength(16);
    expect(snap.intendedConsumers).toEqual(
      expect.arrayContaining(['trim', 'close-base', 'tooth-movement', 'manufacturing'])
    );
  });
});

describe('PROD-002 Phase 6 instance ID stability', () => {
  it('reassigns position-stable instance IDs after X-sort', () => {
    const positions = new Float32Array([
      // face 0 centroid ~ x=0.33
      0, 0, 0, 1, 0, 0, 0, 1, 0,
      // face 1 centroid ~ x=10.33
      10, 0, 0, 11, 0, 0, 10, 1, 0,
      // face 2 centroid ~ x=5.33
      5, 0, 0, 6, 0, 0, 5, 1, 0
    ]);
    const indices = new Uint32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const mesh = createMesh({
      id: 2,
      objectId: 'sep',
      revision: 0,
      positions,
      indices,
      role: 'source'
    });
    const faceLabels = Object.freeze([
      Object.freeze({ faceIndex: 0, label: 'TOOTH' as const, confidence: 0.9 }),
      Object.freeze({ faceIndex: 1, label: 'TOOTH' as const, confidence: 0.9 }),
      Object.freeze({ faceIndex: 2, label: 'TOOTH' as const, confidence: 0.9 })
    ]);
    const faceCentroids = new Float32Array([0.33, 0.33, 0, 10.33, 0.33, 0, 5.33, 0.33, 0]);
    const a = separateToothInstances({ mesh, faceLabels, faceCentroids });
    const b = separateToothInstances({ mesh, faceLabels, faceCentroids });
    expect(a.instances.map((i) => i.instanceId)).toEqual(['inst-001', 'inst-002', 'inst-003']);
    expect(a.instances.map((i) => i.instanceId)).toEqual(b.instances.map((i) => i.instanceId));
    expect(a.instances[0]!.centroid[0]).toBeLessThan(a.instances[1]!.centroid[0]!);
    expect(a.instances[1]!.centroid[0]).toBeLessThan(a.instances[2]!.centroid[0]!);
  });
});

describe('PROD-002 Phase 7 face-index bounds validation', () => {
  it('FAILs when face indices exceed meshFaceCount', () => {
    const report = validateSegmentationPrediction(samplePrediction(), { meshFaceCount: 5 });
    expect(report.verdict).toBe('FAIL');
    expect(report.checks.some((c) => c.id === 'face-index-bounds' && c.verdict === 'FAIL')).toBe(
      true
    );
  });
});
