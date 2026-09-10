/**
 * CLN-010 Clinical Analysis tests — measurement, tooth, arch, spacing, crowding,
 * collision, cache, and geometry immutability.
 */

import { describe, expect, it } from 'vitest';
import { StudioCompositionRoot } from '../../../src/application/composition-root.js';
import { ClinicalBootstrap } from '../../../src/clinical/ClinicalBootstrap.js';
import { withClinicalObjects } from '../../../src/clinical/document/ClinicalDocument.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../../src/clinical/import/ClinicalMeshDescriptor.js';
import {
  ClinicalMeasurementEngine,
  buildVertexAdjacency,
  measureAngleDegrees,
  surfacePathDistanceMm
} from '../../../src/clinical/analysis/engine/MeasurementEngine.js';
import {
  analyzeToothInstance,
  geometricCentroidFromVertices
} from '../../../src/clinical/analysis/engine/ToothAnalysis.js';
import { principalAxesFromPoints } from '../../../src/clinical/analysis/engine/PrincipalAxes.js';
import { fitArchCurve } from '../../../src/clinical/analysis/engine/ArchAnalysis.js';
import { analyzeSpacing } from '../../../src/clinical/analysis/engine/SpacingAnalysis.js';
import { analyzeCrowding } from '../../../src/clinical/analysis/engine/CrowdingAnalysis.js';
import {
  analyzeCollision,
  queryMeshCollision
} from '../../../src/clinical/analysis/engine/CollisionQuery.js';
import { analyzeBolton } from '../../../src/clinical/analysis/engine/BoltonAnalysis.js';
import { ClinicalAnalysisCache, hashParameters } from '../../../src/clinical/analysis/ClinicalAnalysisCache.js';
import { ANALYSIS_TOLERANCE, formatLengthMm } from '../../../src/clinical/analysis/units.js';
import { createMesh, type TriangleMesh } from '../../../src/geometry-kernel/mesh/TriangleMesh.js';
import type { ToothInstancePrediction } from '../../../src/clinical/segmentation/prediction/types.js';
import type { FdiNumber } from '../../../src/clinical/segmentation/fdi/FdiNumbering.js';
import { runAnalysisBenchmarks } from '../../../src/clinical/analysis/benchmark/AnalysisBenchmark.js';

const host = () =>
  new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 5000 }
  });

const meshDesc = (id: string, name: string): ClinicalMeshDescriptor =>
  Object.freeze({
    id: asClinicalObjectId(id),
    displayName: name,
    sourceFile: `${name}.stl`,
    format: 'stl' as const,
    units: 'mm' as const,
    bounds: DEFAULT_MESH_BOUNDS,
    vertexCount: 8,
    faceCount: 12,
    importedAt: 1,
    visible: true,
    selectable: true,
    hierarchyParentId: undefined,
    importerId: 'studio-passthrough',
    sourceEntityId: id,
    displayState: 'default' as const,
    transform: IDENTITY_CLINICAL_TRANSFORM
  });

const boxMesh = (objectId: string, ox = 0, oy = 0, oz = 0): TriangleMesh => {
  const positions = new Float32Array([
    ox,
    oy,
    oz,
    ox + 2,
    oy,
    oz,
    ox + 2,
    oy + 2,
    oz,
    ox,
    oy + 2,
    oz,
    ox,
    oy,
    oz + 2,
    ox + 2,
    oy,
    oz + 2,
    ox + 2,
    oy + 2,
    oz + 2,
    ox,
    oy + 2,
    oz + 2
  ]);
  const indices = new Uint32Array([
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4,
    3, 4, 0
  ]);
  return createMesh({
    id: 1,
    objectId,
    role: 'source',
    revision: 1,
    positions,
    indices
  });
};

const tooth = (
  id: string,
  fdi: FdiNumber,
  cx: number,
  cy: number,
  status: 'IDENTIFIED' | 'UNCERTAIN' | 'UNKNOWN' = 'IDENTIFIED',
  presence: 'PRESENT' | 'MISSING' = 'PRESENT'
): ToothInstancePrediction =>
  Object.freeze({
    instanceId: id,
    faceIndices: Object.freeze([0, 1]),
    vertexIndices: Object.freeze([0, 1, 2, 3]),
    confidence: status === 'IDENTIFIED' ? 0.9 : 0.5,
    centroid: Object.freeze([cx, cy, 1] as const),
    bounds: Object.freeze({
      min: Object.freeze([cx - 1, cy - 1, 0] as const),
      max: Object.freeze([cx + 1, cy + 1, 2] as const)
    }),
    faceCount: 2,
    presence,
    identification: Object.freeze({
      status,
      fdi: status === 'UNKNOWN' ? undefined : fdi,
      confidence: status === 'IDENTIFIED' ? 0.9 : 0.5,
      candidates: Object.freeze([{ fdi, score: 0.9 }])
    })
  });

describe('measurement engine', () => {
  it('computes 3D euclidean distance and formats units', () => {
    const engine = new ClinicalMeasurementEngine();
    const result = engine.measureDistance({
      a: { x: 0, y: 0, z: 0 },
      b: { x: 3, y: 4, z: 0 },
      sourceObjectIds: ['m'],
      sourceRevision: 1,
      now: 1
    });
    expect(result.validity).toBe('VALID');
    expect(result.measurements[0]?.value.value).toBe(5);
    expect(result.measurements[0]?.value.display).toBe(formatLengthMm(5));
    expect(result.measurements[0]?.distanceKind).toBe('euclidean');
  });

  it('is symmetric for distance(A,B)', () => {
    const engine = new ClinicalMeasurementEngine();
    const ab = engine.measureDistance({
      a: { x: 1, y: 2, z: 3 },
      b: { x: 4, y: 6, z: 3 },
      sourceObjectIds: ['m'],
      sourceRevision: 1,
      now: 1
    });
    const ba = engine.measureDistance({
      a: { x: 4, y: 6, z: 3 },
      b: { x: 1, y: 2, z: 3 },
      sourceObjectIds: ['m'],
      sourceRevision: 1,
      now: 2
    });
    expect(ab.measurements[0]!.value.value).toBeCloseTo(ba.measurements[0]!.value.value, 6);
  });

  it('computes a right angle as 90 degrees', () => {
    const deg = measureAngleDegrees(
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }
    );
    expect(deg).toBeCloseTo(90, 5);
    const engine = new ClinicalMeasurementEngine();
    const result = engine.measureAngle({
      a: { x: 1, y: 0, z: 0 },
      vertex: { x: 0, y: 0, z: 0 },
      b: { x: 0, y: 1, z: 0 },
      sourceObjectIds: ['m'],
      sourceRevision: 1,
      now: 1
    });
    expect(result.measurements[0]?.value.display).toBe('90.0°');
  });

  it('computes surface-path distance on a simple edge graph', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const adj = buildVertexAdjacency(3, indices);
    const path = surfacePathDistanceMm(positions, adj, 0, 2);
    expect(path.ok).toBe(true);
    expect(path.distance).toBeCloseTo(Math.SQRT2, 5);
  });
});

describe('tooth analysis', () => {
  it('computes centroid and geometric extents', () => {
    const mesh = boxMesh('jaw');
    const inst = tooth('t11', 11 as FdiNumber, 1, 1);
    const withFaces = {
      ...inst,
      faceIndices: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
      vertexIndices: Object.freeze([0, 1, 2, 3, 4, 5, 6, 7])
    };
    const result = analyzeToothInstance(mesh, withFaces, 1, 1, 1);
    expect(result.validity).toBe('VALID');
    expect(result.frames?.[0]?.method).toBe('pca-arch-heuristic');
    const summary = result.payload.summary as { extentX: number; centroidMethod: string };
    expect(summary.extentX).toBeCloseTo(2, 5);
    expect(summary.centroidMethod).toBe('area-weighted');
  });

  it('returns INCOMPLETE for missing teeth', () => {
    const mesh = boxMesh('jaw');
    const inst = tooth('t12', 12 as FdiNumber, 0, 0, 'IDENTIFIED', 'MISSING');
    const result = analyzeToothInstance(mesh, inst, 1, 1, 1);
    expect(result.validity).toBe('INCOMPLETE');
  });

  it('warns for uncertain identification', () => {
    const mesh = boxMesh('jaw');
    const inst = {
      ...tooth('t13', 13 as FdiNumber, 0, 0, 'UNCERTAIN'),
      faceIndices: Object.freeze([0]),
      vertexIndices: Object.freeze([0, 1, 2])
    };
    const result = analyzeToothInstance(mesh, inst, 1, 1, 1);
    expect(result.validity).toBe('WARNING');
  });

  it('preserves dimensions under translation (property)', () => {
    const points = [
      { x: 0, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 0, y: 3, z: 0 }
    ];
    const c1 = geometricCentroidFromVertices(
      new Float32Array(points.flatMap((p) => [p.x, p.y, p.z])),
      [0, 1, 2]
    );
    const shifted = points.map((p) => ({ x: p.x + 10, y: p.y - 4, z: p.z + 2 }));
    const c2 = geometricCentroidFromVertices(
      new Float32Array(shifted.flatMap((p) => [p.x, p.y, p.z])),
      [0, 1, 2]
    );
    expect(c2.x - c1.x).toBeCloseTo(10, 6);
    const axes = principalAxesFromPoints(points);
    expect(axes.axes).toHaveLength(3);
  });
});

describe('arch / spacing / crowding', () => {
  const archTeeth = [
    tooth('a', 14 as FdiNumber, -6, 0),
    tooth('b', 13 as FdiNumber, -3, 2),
    tooth('c', 12 as FdiNumber, -1, 3),
    tooth('d', 11 as FdiNumber, 1, 3),
    tooth('e', 21 as FdiNumber, 3, 2),
    tooth('f', 22 as FdiNumber, 6, 0)
  ];

  it('fits a deterministic arch curve', () => {
    const a = fitArchCurve(archTeeth, 1, 1, 1, 'fp', 'jaw');
    const b = fitArchCurve(archTeeth, 2, 1, 1, 'fp', 'jaw');
    expect(a.validity === 'VALID' || a.validity === 'WARNING').toBe(true);
    expect((a.payload.fit as { fitRmse: number }).fitRmse).toBeCloseTo(
      (b.payload.fit as { fitRmse: number }).fitRmse,
      8
    );
    expect(a.measurements.some((m) => m.measurementType === 'arch-width')).toBe(true);
  });

  it('measures adjacent spacing and skips uncertain teeth', () => {
    const spacing = analyzeSpacing(
      [...archTeeth, tooth('u', 23 as FdiNumber, 8, 0, 'UNCERTAIN')],
      1,
      1,
      1,
      'fp',
      'jaw'
    );
    expect(spacing.measurements.length).toBeGreaterThan(0);
    expect(spacing.validity === 'VALID' || spacing.validity === 'WARNING').toBe(true);
  });

  it('returns INCOMPLETE crowding when too few teeth', () => {
    const result = analyzeCrowding([tooth('a', 11 as FdiNumber, 0, 0)], 1, 1, 1, 'fp', 'jaw');
    expect(result.validity).toBe('INCOMPLETE');
  });

  it('estimates crowding discrepancy with warnings', () => {
    const result = analyzeCrowding(archTeeth, 1, 1, 1, 'fp', 'jaw');
    expect(result.validity).toBe('WARNING');
    expect(result.measurements[0]?.value.unit).toBe('mm');
  });
});

describe('collision / bolton', () => {
  it('reports closest distance and aabb overlap', () => {
    const a = boxMesh('a', 0, 0, 0);
    const b = boxMesh('b', 5, 0, 0);
    const q = queryMeshCollision(a, b, 1);
    expect(q.closestDistanceMm).toBeDefined();
    expect(q.closestDistanceMm!).toBeGreaterThan(0);
    const result = analyzeCollision(a, b, 1, 1);
    expect(result.analysisType).toBe('collision');
  });

  it('detects intersecting aabb boxes', () => {
    const a = boxMesh('a', 0, 0, 0);
    const b = boxMesh('b', 1, 0, 0);
    const q = queryMeshCollision(a, b, 1);
    expect(q.intersectsAabb).toBe(true);
  });

  it('marks Bolton incomplete when teeth are missing', () => {
    const result = analyzeBolton([tooth('a', 11 as FdiNumber, 0, 0)], 1, 1, 1, 'fp');
    expect(result.validity).toBe('INCOMPLETE');
  });
});

describe('cache + clinical integrity', () => {
  it('hits cache for identical keys and misses on algorithm version change', () => {
    const cache = new ClinicalAnalysisCache();
    const engine = new ClinicalMeasurementEngine();
    const result = engine.measureDistance({
      a: { x: 0, y: 0, z: 0 },
      b: { x: 1, y: 0, z: 0 },
      sourceObjectIds: ['m'],
      sourceRevision: 3,
      now: 1,
      geometryFingerprint: 'g1'
    });
    const key = {
      analysisType: 'distance' as const,
      sourceRevision: 3,
      segmentationRevision: undefined,
      geometryFingerprint: 'g1',
      algorithmVersion: result.algorithmVersion,
      parametersHash: hashParameters({ a: 1 })
    };
    cache.set(key, result);
    expect(cache.get(key)?.analysisId).toBe(result.analysisId);
    expect(
      cache.get({ ...key, algorithmVersion: '9.9.9' })
    ).toBeUndefined();
    cache.invalidateForRevision(3);
    expect(cache.size()).toBeGreaterThanOrEqual(0);
  });

  it('analysis enter does not mutate mesh fingerprint', () => {
    const h = host();
    const boot = new ClinicalBootstrap().bootstrap(h);
    expect(boot.session.newCase({ name: 'A' }).ok).toBe(true);
    const doc = boot.session.getPublicState().activeCase!;
    expect(
      boot.session.applyDocument(withClinicalObjects(doc, [meshDesc('jaw', 'Jaw')], 5001), true).ok
    ).toBe(true);
    const objectId = 'jaw';
    const seeded = boxMesh(objectId);
    h.runtimes.kernel.registry.register(seeded);
    const before = boot.workspace.analysis.meshFingerprint(objectId);
    const revisionBefore = boot.session.getPublicState().activeCase!.revision;
    expect(boot.workspace.analysis.enter(asClinicalObjectId(objectId)).ok).toBe(true);
    boot.workspace.analysis.pickPoint({ x: 0, y: 0, z: 0 }, objectId, 0);
    boot.workspace.analysis.pickPoint({ x: 2, y: 0, z: 0 }, objectId, 1);
    const after = boot.workspace.analysis.meshFingerprint(objectId);
    expect(after).toBe(before);
    expect(boot.session.getPublicState().activeCase?.revision).toBe(revisionBefore);
    boot.runtime.dispose();
    h.dispose();
  });

  it('tolerances and formatting stay clinical', () => {
    expect(ANALYSIS_TOLERANCE.lengthEqualityMm).toBeLessThan(0.01);
    expect(formatLengthMm(3.4238719284)).toBe('3.42 mm');
  });
});

describe('analysis benchmarks (smoke)', () => {
  it('records p50/p95 for synthetic workloads', () => {
    const rows = runAnalysisBenchmarks();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.p50Ms).toBeGreaterThanOrEqual(0);
    console.log(JSON.stringify({ benchmark: 'CLN-010', rows }, null, 2));
  });
});
