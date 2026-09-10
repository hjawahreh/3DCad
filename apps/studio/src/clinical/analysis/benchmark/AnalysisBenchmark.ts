/**
 * Analysis benchmark smoke harness (CLN-010).
 * Timings are machine-dependent — not CI-gated thresholds.
 */

import { ClinicalMeasurementEngine } from '../engine/MeasurementEngine.js';
import { fitArchCurve } from '../engine/ArchAnalysis.js';
import { analyzeCrowding } from '../engine/CrowdingAnalysis.js';
import { queryMeshCollision } from '../engine/CollisionQuery.js';
import { createMesh } from '../../../geometry-kernel/mesh/TriangleMesh.js';
import type { ToothInstancePrediction } from '../../segmentation/prediction/types.js';
import type { FdiNumber } from '../../segmentation/fdi/FdiNumbering.js';

export interface AnalysisBenchmarkRow {
  readonly name: string;
  readonly samples: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
}

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx]!;
};

const time = (fn: () => void, samples = 21): { p50Ms: number; p95Ms: number } => {
  const times: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { p50Ms: percentile(times, 50), p95Ms: percentile(times, 95) };
};

const makeTeeth = (n: number): ToothInstancePrediction[] => {
  const out: ToothInstancePrediction[] = [];
  for (let i = 0; i < n; i += 1) {
    const fdi = (11 + (i % 8)) as FdiNumber;
    const x = -n + i * 2;
    out.push(
      Object.freeze({
        instanceId: `t${String(i)}`,
        faceIndices: Object.freeze([0]),
        vertexIndices: Object.freeze([0, 1, 2]),
        confidence: 0.9,
        centroid: Object.freeze([x, Math.sin(i) * 2, 1] as const),
        bounds: Object.freeze({
          min: Object.freeze([x - 1, -1, 0] as const),
          max: Object.freeze([x + 1, 1, 2] as const)
        }),
        faceCount: 1,
        presence: 'PRESENT',
        identification: Object.freeze({
          status: 'IDENTIFIED',
          fdi,
          confidence: 0.9,
          candidates: Object.freeze([{ fdi, score: 0.9 }])
        })
      })
    );
  }
  return out;
};

const gridMesh = (objectId: string, n: number) => {
  const positions = new Float32Array(n * n * 3);
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const i = (y * n + x) * 3;
      positions[i] = x;
      positions[i + 1] = y;
      positions[i + 2] = 0;
    }
  }
  const indices: number[] = [];
  for (let y = 0; y + 1 < n; y += 1) {
    for (let x = 0; x + 1 < n; x += 1) {
      const i = y * n + x;
      indices.push(i, i + 1, i + n, i + 1, i + n + 1, i + n);
    }
  }
  return createMesh({
    id: 1,
    objectId,
    role: 'source',
    revision: 1,
    positions,
    indices: new Uint32Array(indices)
  });
};

export const runAnalysisBenchmarks = (): readonly AnalysisBenchmarkRow[] => {
  const engine = new ClinicalMeasurementEngine();
  const teeth10 = makeTeeth(10);
  const teeth20 = makeTeeth(20);
  const meshA = gridMesh('a', 24);
  const meshB = gridMesh('b', 24);

  const rows: AnalysisBenchmarkRow[] = [];

  const d = time(() => {
    engine.measureDistance({
      a: { x: 0, y: 0, z: 0 },
      b: { x: 12, y: 5, z: 2 },
      sourceObjectIds: ['a'],
      sourceRevision: 1,
      now: 1
    });
  });
  rows.push(Object.freeze({ name: 'point-distance', samples: 21, ...d }));

  const arch10 = time(() => {
    fitArchCurve(teeth10, 1, 1, 1, 'fp', 'jaw');
  });
  rows.push(Object.freeze({ name: 'arch-10-teeth', samples: 21, ...arch10 }));

  const arch20 = time(() => {
    fitArchCurve(teeth20, 1, 1, 1, 'fp', 'jaw');
  });
  rows.push(Object.freeze({ name: 'arch-20-teeth', samples: 21, ...arch20 }));

  const crowd = time(() => {
    analyzeCrowding(teeth20, 1, 1, 1, 'fp', 'jaw');
  });
  rows.push(Object.freeze({ name: 'crowding-20', samples: 21, ...crowd }));

  const col = time(() => {
    queryMeshCollision(meshA, meshB, 16);
  });
  rows.push(Object.freeze({ name: 'collision-query', samples: 21, ...col }));

  return Object.freeze(rows);
};
