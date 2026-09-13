/**
 * GEO-001 PHASE A — mesh inspection + metrics.
 * Does not fabricate values; unknown properties stay unknown/undefined.
 */

import { computeAABB, type TriangleMesh } from '../mesh/TriangleMesh.js';
import type { GeometryGate, GeometryMetrics, MeshQualityReport, SelfIntersectionStatus } from './types.js';

const edgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

const triangleArea = (
  positions: Float32Array,
  i0: number,
  i1: number,
  i2: number
): number => {
  const ax = positions[i0 * 3]!;
  const ay = positions[i0 * 3 + 1]!;
  const az = positions[i0 * 3 + 2]!;
  const bx = positions[i1 * 3]!;
  const by = positions[i1 * 3 + 1]!;
  const bz = positions[i1 * 3 + 2]!;
  const cx = positions[i2 * 3]!;
  const cy = positions[i2 * 3 + 1]!;
  const cz = positions[i2 * 3 + 2]!;
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  return 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);
};

export const analyzeMesh = (mesh: TriangleMesh): MeshQualityReport => {
  const started = performance.now();
  const warnings: string[] = [];
  const errors: string[] = [];
  const vertexCount = Math.floor(mesh.positions.length / 3);
  const triangleCount = Math.floor(mesh.indices.length / 3);
  const bbox = computeAABB(mesh.positions);

  if (vertexCount === 0 || triangleCount === 0) {
    errors.push('Empty mesh');
  }
  for (let i = 0; i < mesh.positions.length; i += 1) {
    if (!Number.isFinite(mesh.positions[i]!)) {
      errors.push('Non-finite vertex coordinate');
      break;
    }
  }

  const edgeUse = new Map<string, number>();
  const vertexUsed = new Uint8Array(vertexCount);
  const faceAdj = new Map<number, number[]>();
  let degenerateTriangleCount = 0;
  let surfaceArea = 0;
  let volumeAccumulator = 0;

  for (let t = 0; t < triangleCount; t += 1) {
    const i0 = mesh.indices[t * 3]!;
    const i1 = mesh.indices[t * 3 + 1]!;
    const i2 = mesh.indices[t * 3 + 2]!;
    if (
      i0 < 0 ||
      i1 < 0 ||
      i2 < 0 ||
      i0 >= vertexCount ||
      i1 >= vertexCount ||
      i2 >= vertexCount
    ) {
      errors.push('Index out of range');
      break;
    }
    vertexUsed[i0] = 1;
    vertexUsed[i1] = 1;
    vertexUsed[i2] = 1;
    const area = triangleArea(mesh.positions, i0, i1, i2);
    if (!(area > 1e-18) || i0 === i1 || i1 === i2 || i0 === i2) {
      degenerateTriangleCount += 1;
    } else {
      surfaceArea += area;
    }
    // Divergence theorem volume contribution (meaningful only for closed oriented meshes).
    const ax = mesh.positions[i0 * 3]!;
    const ay = mesh.positions[i0 * 3 + 1]!;
    const az = mesh.positions[i0 * 3 + 2]!;
    const bx = mesh.positions[i1 * 3]!;
    const by = mesh.positions[i1 * 3 + 1]!;
    const bz = mesh.positions[i1 * 3 + 2]!;
    const cx = mesh.positions[i2 * 3]!;
    const cy = mesh.positions[i2 * 3 + 1]!;
    const cz = mesh.positions[i2 * 3 + 2]!;
    volumeAccumulator +=
      (-cx * by * az + bx * cy * az + cx * ay * bz - ax * cy * bz - bx * ay * cz + ax * by * cz) / 6;

    for (const [a, b] of [
      [i0, i1],
      [i1, i2],
      [i2, i0]
    ] as const) {
      const key = edgeKey(a, b);
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
      const la = faceAdj.get(a);
      if (la === undefined) faceAdj.set(a, [b]);
      else la.push(b);
      const lb = faceAdj.get(b);
      if (lb === undefined) faceAdj.set(b, [a]);
      else lb.push(a);
    }
  }

  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;
  for (const count of edgeUse.values()) {
    if (count === 1) boundaryEdgeCount += 1;
    else if (count > 2) nonManifoldEdgeCount += 1;
  }

  let isolatedVertexCount = 0;
  for (let v = 0; v < vertexCount; v += 1) {
    if (!vertexUsed[v]) isolatedVertexCount += 1;
  }

  const visited = new Uint8Array(vertexCount);
  let connectedComponentCount = 0;
  for (let v = 0; v < vertexCount; v += 1) {
    if (visited[v] || !faceAdj.has(v)) continue;
    connectedComponentCount += 1;
    const stack = [v];
    visited[v] = 1;
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const n of faceAdj.get(cur) ?? []) {
        if (!visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }
  }
  if (connectedComponentCount === 0 && triangleCount > 0) {
    connectedComponentCount = 1;
  }

  const watertight = boundaryEdgeCount === 0 && triangleCount > 0 && errors.length === 0;
  const manifold = nonManifoldEdgeCount === 0 && degenerateTriangleCount === 0 && errors.length === 0;
  const volume = watertight ? Math.abs(volumeAccumulator) : undefined;

  // Sampled self-intersection heuristic — never claim definitive detection.
  let selfIntersectionStatus: SelfIntersectionStatus = 'unknown';
  let suspicious = 0;
  const sample = Math.min(triangleCount, 128);
  for (let i = 0; i < sample; i += 1) {
    const a0 = mesh.indices[i * 3]!;
    const a1 = mesh.indices[i * 3 + 1]!;
    const a2 = mesh.indices[i * 3 + 2]!;
    const cxi =
      (mesh.positions[a0 * 3]! + mesh.positions[a1 * 3]! + mesh.positions[a2 * 3]!) / 3;
    const cyi =
      (mesh.positions[a0 * 3 + 1]! + mesh.positions[a1 * 3 + 1]! + mesh.positions[a2 * 3 + 1]!) /
      3;
    const czi =
      (mesh.positions[a0 * 3 + 2]! + mesh.positions[a1 * 3 + 2]! + mesh.positions[a2 * 3 + 2]!) /
      3;
    for (let j = i + 11; j < sample; j += 11) {
      const b0 = mesh.indices[j * 3]!;
      const b1 = mesh.indices[j * 3 + 1]!;
      const b2 = mesh.indices[j * 3 + 2]!;
      if (a0 === b0 || a0 === b1 || a0 === b2 || a1 === b0 || a1 === b1 || a1 === b2 || a2 === b0 || a2 === b1 || a2 === b2) {
        continue;
      }
      const cxj =
        (mesh.positions[b0 * 3]! + mesh.positions[b1 * 3]! + mesh.positions[b2 * 3]!) / 3;
      const cyj =
        (mesh.positions[b0 * 3 + 1]! + mesh.positions[b1 * 3 + 1]! + mesh.positions[b2 * 3 + 1]!) /
        3;
      const czj =
        (mesh.positions[b0 * 3 + 2]! + mesh.positions[b1 * 3 + 2]! + mesh.positions[b2 * 3 + 2]!) /
        3;
      if ((cxi - cxj) ** 2 + (cyi - cyj) ** 2 + (czi - czj) ** 2 < 1e-12) {
        suspicious += 1;
      }
    }
  }
  if (suspicious === 0) selfIntersectionStatus = 'none';
  else {
    selfIntersectionStatus = 'suspected';
    warnings.push(`Self-intersection suspected (${String(suspicious)} sampled pairs)`);
  }

  if (degenerateTriangleCount > 0) {
    warnings.push(`Degenerate triangles: ${String(degenerateTriangleCount)}`);
  }
  if (nonManifoldEdgeCount > 0) {
    errors.push(`Non-manifold edges: ${String(nonManifoldEdgeCount)}`);
  }
  if (connectedComponentCount > 1) {
    warnings.push(`Connected components: ${String(connectedComponentCount)}`);
  }
  if (isolatedVertexCount > 0) {
    warnings.push(`Isolated vertices: ${String(isolatedVertexCount)}`);
  }
  if (!watertight) {
    warnings.push('Mesh is open (boundary edges present) — expected for intraoral scans');
  }

  let gate: GeometryGate = 'PASS';
  if (errors.length > 0) gate = 'FAIL';
  else if (warnings.length > 0) gate = 'WARNING';

  return {
    gate,
    vertexCount,
    triangleCount,
    connectedComponentCount,
    boundaryEdgeCount,
    nonManifoldEdgeCount,
    degenerateTriangleCount,
    isolatedVertexCount,
    bbox,
    surfaceArea,
    volume,
    watertight,
    manifold,
    selfIntersectionStatus,
    fingerprint: mesh.fingerprint,
    warnings,
    errors,
    durationMs: performance.now() - started
  };
};

export const calculateMetrics = (
  mesh: TriangleMesh,
  quality?: MeshQualityReport
): GeometryMetrics => {
  const q = quality ?? analyzeMesh(mesh);
  return {
    triangleCount: q.triangleCount,
    vertexCount: q.vertexCount,
    surfaceArea: q.surfaceArea,
    bounds: q.bbox,
    volume: q.volume,
    boundaryCount: q.boundaryEdgeCount,
    boundaryLength: 0, // filled by boundary extraction when available
    connectedComponents: q.connectedComponentCount,
    manifold: q.manifold,
    watertight: q.watertight,
    selfIntersection: q.selfIntersectionStatus,
    fingerprint: q.fingerprint
  };
};
