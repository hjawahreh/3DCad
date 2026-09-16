/**
 * Geometry quality pipeline — diagnostics only (no automatic destructive repair).
 *
 * INPUT → topology → validity → duplicates → degenerates → normals →
 * boundaries → connected components → self-intersection diagnostics →
 * spatial acceleration ready
 */

import type { GeometryKernelErrorCode } from '../errors.js';
import type { TriangleMesh } from '../mesh/TriangleMesh.js';

export interface GeometryQualityStats {
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly boundaryEdges: number;
  readonly components: number;
  readonly degenerateCount: number;
  readonly duplicateVertexEstimate: number;
}

/** Alias used by some call sites. */
export type QualityStats = GeometryQualityStats;

export interface GeometryQualityReport {
  readonly ok: boolean;
  readonly codes: readonly GeometryKernelErrorCode[];
  readonly warnings: readonly string[];
  readonly stats: GeometryQualityStats;
  readonly timingMs: number;
  readonly spatialReady: boolean;
}

/** Alias used by some call sites. */
export type QualityReport = GeometryQualityReport;

const quantKey = (x: number, y: number, z: number, scale = 1e5): string =>
  `${Math.round(x * scale)}:${Math.round(y * scale)}:${Math.round(z * scale)}`;

const edgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

export type GeometryQualityLevel = 0 | 1 | 2;

export const runGeometryQualityPipeline = (
  mesh: TriangleMesh,
  options?: { readonly buildSpatial?: boolean; readonly level?: GeometryQualityLevel }
): GeometryQualityReport => {
  const level: GeometryQualityLevel = options?.level ?? 2;
  const started = performance.now();
  const codes: GeometryKernelErrorCode[] = [];
  const warnings: string[] = [];

  const vertexCount = Math.floor(mesh.positions.length / 3);
  const triangleCount = Math.floor(mesh.indices.length / 3);

  if (mesh.positions.length % 3 !== 0) {
    codes.push('INPUT_INVALID');
  }
  if (mesh.indices.length % 3 !== 0) {
    codes.push('TOPOLOGY_INVALID');
  }
  if (vertexCount === 0 || triangleCount === 0) {
    codes.push('INPUT_INVALID');
    warnings.push('Empty mesh');
  }

  let invalidIndex = false;
  for (let i = 0; i < mesh.indices.length; i += 1) {
    const idx = mesh.indices[i]!;
    if (idx < 0 || idx >= vertexCount || !Number.isFinite(idx)) {
      invalidIndex = true;
      break;
    }
  }
  if (invalidIndex) {
    codes.push('TOPOLOGY_INVALID');
    warnings.push('Index out of range or non-finite');
  }

  for (let i = 0; i < mesh.positions.length; i += 1) {
    if (!Number.isFinite(mesh.positions[i]!)) {
      codes.push('INPUT_INVALID');
      warnings.push('Non-finite vertex coordinate');
      break;
    }
  }

  // LEVEL 0 — interactive: finite values + counts only.
  if (level === 0) {
    const uniqueCodes = [...new Set(codes)];
    return {
      ok: uniqueCodes.length === 0,
      codes: uniqueCodes,
      warnings: [...warnings, 'meta:qualityLevel=0'],
      stats: {
        vertexCount,
        triangleCount,
        boundaryEdges: 0,
        components: 0,
        degenerateCount: 0,
        duplicateVertexEstimate: 0
      },
      timingMs: performance.now() - started,
      spatialReady: vertexCount > 0 && triangleCount > 0 && !invalidIndex
    };
  }

  const seen = new Set<string>();
  let duplicateVertexEstimate = 0;
  for (let v = 0; v < vertexCount; v += 1) {
    const key = quantKey(
      mesh.positions[v * 3]!,
      mesh.positions[v * 3 + 1]!,
      mesh.positions[v * 3 + 2]!
    );
    if (seen.has(key)) {
      duplicateVertexEstimate += 1;
    } else {
      seen.add(key);
    }
  }
  if (duplicateVertexEstimate > 0) {
    warnings.push(`Duplicate vertex estimate: ${String(duplicateVertexEstimate)}`);
  }

  let degenerateCount = 0;
  for (let t = 0; t < triangleCount; t += 1) {
    const i0 = mesh.indices[t * 3]!;
    const i1 = mesh.indices[t * 3 + 1]!;
    const i2 = mesh.indices[t * 3 + 2]!;
    if (i0 === i1 || i1 === i2 || i0 === i2) {
      degenerateCount += 1;
      continue;
    }
    const ax = mesh.positions[i0 * 3]!;
    const ay = mesh.positions[i0 * 3 + 1]!;
    const az = mesh.positions[i0 * 3 + 2]!;
    const bx = mesh.positions[i1 * 3]!;
    const by = mesh.positions[i1 * 3 + 1]!;
    const bz = mesh.positions[i1 * 3 + 2]!;
    const cx = mesh.positions[i2 * 3]!;
    const cy = mesh.positions[i2 * 3 + 1]!;
    const cz = mesh.positions[i2 * 3 + 2]!;
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    if (nx * nx + ny * ny + nz * nz < 1e-24) {
      degenerateCount += 1;
    }
  }
  if (degenerateCount > 0) {
    warnings.push(`Degenerate triangles: ${String(degenerateCount)}`);
  }

  if (mesh.normals !== undefined && mesh.normals.length !== mesh.positions.length) {
    warnings.push('Normals length mismatch');
    codes.push('VALIDATION_FAILED');
  } else if (mesh.normals === undefined) {
    warnings.push('Normals missing (diagnostics only)');
  }

  const edgeUse = new Map<string, number>();
  const adj = new Map<number, number[]>();
  const addAdj = (a: number, b: number): void => {
    const list = adj.get(a);
    if (list === undefined) {
      adj.set(a, [b]);
    } else {
      list.push(b);
    }
  };
  for (let t = 0; t < triangleCount; t += 1) {
    const i0 = mesh.indices[t * 3]!;
    const i1 = mesh.indices[t * 3 + 1]!;
    const i2 = mesh.indices[t * 3 + 2]!;
    for (const [a, b] of [
      [i0, i1],
      [i1, i2],
      [i2, i0]
    ] as const) {
      const key = edgeKey(a, b);
      edgeUse.set(key, (edgeUse.get(key) ?? 0) + 1);
      addAdj(a, b);
      addAdj(b, a);
    }
  }
  let boundaryEdges = 0;
  for (const count of edgeUse.values()) {
    if (count === 1) {
      boundaryEdges += 1;
    } else if (count > 2) {
      codes.push('TOPOLOGY_INVALID');
      warnings.push('Non-manifold edge detected');
      break;
    }
  }

  const visited = new Uint8Array(vertexCount);
  let components = 0;
  for (let v = 0; v < vertexCount; v += 1) {
    if (visited[v]) continue;
    if (!adj.has(v)) continue;
    components += 1;
    const stack = [v];
    visited[v] = 1;
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const n of adj.get(cur) ?? []) {
        if (!visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }
  }
  if (components === 0 && triangleCount > 0) {
    components = 1;
  }
  if (components > 1) {
    warnings.push(`Connected components: ${String(components)}`);
  }

  // LEVEL 1 — preview: geometry delta / topology basics; skip sampled self-intersection.
  if (level === 1) {
    const uniqueCodes = [...new Set(codes)];
    return {
      ok: uniqueCodes.length === 0,
      codes: uniqueCodes,
      warnings: [...warnings, 'meta:qualityLevel=1'],
      stats: {
        vertexCount,
        triangleCount,
        boundaryEdges,
        components,
        degenerateCount,
        duplicateVertexEstimate
      },
      timingMs: performance.now() - started,
      spatialReady: vertexCount > 0 && triangleCount > 0 && !invalidIndex
    };
  }

  let suspiciousPairs = 0;
  const sampleLimit = Math.min(triangleCount, 256);
  const centroidOf = (t: number): [number, number, number] => {
    const a = mesh.indices[t * 3]!;
    const b = mesh.indices[t * 3 + 1]!;
    const c = mesh.indices[t * 3 + 2]!;
    return [
      (mesh.positions[a * 3]! + mesh.positions[b * 3]! + mesh.positions[c * 3]!) / 3,
      (mesh.positions[a * 3 + 1]! + mesh.positions[b * 3 + 1]! + mesh.positions[c * 3 + 1]!) /
        3,
      (mesh.positions[a * 3 + 2]! + mesh.positions[b * 3 + 2]! + mesh.positions[c * 3 + 2]!) /
        3
    ];
  };
  for (let i = 0; i < sampleLimit; i += 1) {
    const i0 = mesh.indices[i * 3]!;
    const i1 = mesh.indices[i * 3 + 1]!;
    const i2 = mesh.indices[i * 3 + 2]!;
    const [cxi, cyi, czi] = centroidOf(i);
    for (let j = i + 8; j < sampleLimit; j += 8) {
      const j0 = mesh.indices[j * 3]!;
      const j1 = mesh.indices[j * 3 + 1]!;
      const j2 = mesh.indices[j * 3 + 2]!;
      const shared =
        i0 === j0 ||
        i0 === j1 ||
        i0 === j2 ||
        i1 === j0 ||
        i1 === j1 ||
        i1 === j2 ||
        i2 === j0 ||
        i2 === j1 ||
        i2 === j2;
      if (shared) continue;
      const [cxj, cyj, czj] = centroidOf(j);
      if ((cxi - cxj) ** 2 + (cyi - cyj) ** 2 + (czi - czj) ** 2 < 1e-12) {
        suspiciousPairs += 1;
      }
    }
  }
  if (suspiciousPairs > 0) {
    warnings.push(
      `Self-intersection diagnostics: ${String(suspiciousPairs)} suspicious centroid pairs (sampled)`
    );
  }

  const uniqueCodes = [...new Set(codes)];
  const ok = uniqueCodes.length === 0;
  const spatialReady = vertexCount > 0 && triangleCount > 0 && !invalidIndex;

  return {
    ok,
    codes: uniqueCodes,
    warnings: [...warnings, 'meta:qualityLevel=2'],
    stats: {
      vertexCount,
      triangleCount,
      boundaryEdges,
      components,
      degenerateCount,
      duplicateVertexEstimate
    },
    timingMs: performance.now() - started,
    spatialReady
  };
};
