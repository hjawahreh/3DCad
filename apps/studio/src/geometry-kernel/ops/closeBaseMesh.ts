/**
 * Close-base / fill-holes mesh ops for the clinical reference kernel.
 *
 * Strategies:
 * - plane: boundary loops → walls extruded by height → base triangulation (+ thickness inset)
 * - surface: fan/ear-clip fill each boundary loop in place (no tall base)
 *
 * Original dental surface triangles are preserved unchanged.
 */

import {
  createMesh,
  fingerprintMesh,
  type MeshRole,
  type TriangleMesh
} from '../mesh/TriangleMesh.js';
import { runGeometryQualityPipeline, type GeometryQualityReport } from '../quality/GeometryQualityPipeline.js';
import { GeometryKernelError } from '../errors.js';

export type CloseBaseOrientation = 'xy' | 'xz' | 'yz';
export type CloseBaseStrategy = 'plane' | 'surface';

export interface CloseBaseOptions {
  readonly strategy: CloseBaseStrategy;
  readonly height?: number;
  readonly thickness?: number;
  readonly margin?: number;
  readonly orientation?: CloseBaseOrientation;
  readonly planeNormal?: readonly [number, number, number] | undefined;
  readonly role?: MeshRole;
  readonly revision?: number;
  readonly id?: number;
}

export interface CloseBaseResult {
  readonly mesh: TriangleMesh;
  readonly quality: GeometryQualityReport;
  readonly boundaryLoops: number;
  readonly addedTriangles: number;
  readonly warnings: readonly string[];
}

const edgeKey = (a: number, b: number): string => `${a}:${b}`;

interface Loop {
  readonly vertices: number[];
}

const collectBoundaryEdges = (mesh: TriangleMesh): Array<[number, number]> => {
  const use = new Map<string, { a: number; b: number; count: number }>();
  const triCount = Math.floor(mesh.indices.length / 3);
  for (let t = 0; t < triCount; t += 1) {
    const i0 = mesh.indices[t * 3]!;
    const i1 = mesh.indices[t * 3 + 1]!;
    const i2 = mesh.indices[t * 3 + 2]!;
    for (const [a, b] of [
      [i0, i1],
      [i1, i2],
      [i2, i0]
    ] as const) {
      const key = a < b ? edgeKey(a, b) : edgeKey(b, a);
      const existing = use.get(key);
      if (existing === undefined) {
        use.set(key, { a, b, count: 1 });
      } else {
        existing.count += 1;
      }
    }
  }
  const boundaries: Array<[number, number]> = [];
  for (const e of use.values()) {
    if (e.count === 1) {
      boundaries.push([e.a, e.b]);
    }
  }
  return boundaries;
};

const buildLoops = (edges: Array<[number, number]>): Loop[] => {
  const adj = new Map<number, number[]>();
  for (const [a, b] of edges) {
    const la = adj.get(a) ?? [];
    la.push(b);
    adj.set(a, la);
    const lb = adj.get(b) ?? [];
    lb.push(a);
    adj.set(b, lb);
  }
  const visited = new Set<string>();
  const loops: Loop[] = [];

  for (const [start, neighbors] of adj) {
    for (const n0 of neighbors) {
      const startKey = start < n0 ? edgeKey(start, n0) : edgeKey(n0, start);
      if (visited.has(startKey)) continue;
      const verts: number[] = [start];
      let prev = start;
      let cur = n0;
      visited.add(startKey);
      let guard = 0;
      while (cur !== start && guard < edges.length + 2) {
        verts.push(cur);
        const nexts = adj.get(cur) ?? [];
        let advanced = false;
        for (const nxt of nexts) {
          if (nxt === prev) continue;
          const k = cur < nxt ? edgeKey(cur, nxt) : edgeKey(nxt, cur);
          if (visited.has(k) && nxt !== start) continue;
          visited.add(k);
          prev = cur;
          cur = nxt;
          advanced = true;
          break;
        }
        if (!advanced) break;
        guard += 1;
      }
      if (verts.length >= 3) {
        loops.push({ vertices: verts });
      }
    }
  }
  // Deterministic: sort loops by first vertex then length
  loops.sort((a, b) => {
    if (a.vertices[0]! !== b.vertices[0]!) return a.vertices[0]! - b.vertices[0]!;
    return a.vertices.length - b.vertices.length;
  });
  return loops;
};

const axisFromOrientation = (
  orientation: CloseBaseOrientation,
  planeNormal?: readonly [number, number, number]
): 0 | 1 | 2 => {
  if (planeNormal !== undefined) {
    const ax = Math.abs(planeNormal[0]);
    const ay = Math.abs(planeNormal[1]);
    const az = Math.abs(planeNormal[2]);
    if (ax >= ay && ax >= az) return 0;
    if (ay >= ax && ay >= az) return 1;
    return 2;
  }
  if (orientation === 'yz') return 0;
  if (orientation === 'xz') return 1;
  return 2;
};

const getCoord = (positions: Float32Array, vi: number, axis: 0 | 1 | 2): number =>
  positions[vi * 3 + axis]!;

/** Ear-clip triangulation for a simple polygon given in 3D (projected to plane axes). */
const earClip = (
  loop: number[],
  positions: Float32Array,
  axis: 0 | 1 | 2
): number[][] => {
  const u = axis === 0 ? 1 : 0;
  const v = axis === 2 ? 1 : 2;
  const idx = [...loop];
  if (idx.length < 3) return [];
  if (idx.length === 3) return [[idx[0]!, idx[1]!, idx[2]!]];

  // Ensure CCW in UV
  let area = 0;
  for (let i = 0; i < idx.length; i += 1) {
    const a = idx[i]!;
    const b = idx[(i + 1) % idx.length]!;
    area +=
      positions[a * 3 + u]! * positions[b * 3 + v]! -
      positions[b * 3 + u]! * positions[a * 3 + v]!;
  }
  if (area < 0) {
    idx.reverse();
  }

  const tris: number[][] = [];
  const remaining = [...idx];
  let guard = 0;
  while (remaining.length > 3 && guard < idx.length * idx.length) {
    guard += 1;
    let clipped = false;
    for (let i = 0; i < remaining.length; i += 1) {
      const i0 = remaining[(i + remaining.length - 1) % remaining.length]!;
      const i1 = remaining[i]!;
      const i2 = remaining[(i + 1) % remaining.length]!;
      const ax = positions[i0 * 3 + u]!;
      const ay = positions[i0 * 3 + v]!;
      const bx = positions[i1 * 3 + u]!;
      const by = positions[i1 * 3 + v]!;
      const cx = positions[i2 * 3 + u]!;
      const cy = positions[i2 * 3 + v]!;
      const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (cross <= 0) continue; // not a convex ear in CCW
      let hasPoint = false;
      for (let k = 0; k < remaining.length; k += 1) {
        if (k === (i + remaining.length - 1) % remaining.length || k === i || k === (i + 1) % remaining.length) {
          continue;
        }
        const p = remaining[k]!;
        const px = positions[p * 3 + u]!;
        const py = positions[p * 3 + v]!;
        // barycentric inside triangle
        const d1 = (px - bx) * (ay - by) - (py - by) * (ax - bx);
        const d2 = (px - cx) * (by - cy) - (py - cy) * (bx - cx);
        const d3 = (px - ax) * (cy - ay) - (py - ay) * (cx - ax);
        const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(hasNeg && hasPos)) {
          hasPoint = true;
          break;
        }
      }
      if (hasPoint) continue;
      tris.push([i0, i1, i2]);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      // Fan fallback
      const pivot = remaining[0]!;
      for (let i = 1; i < remaining.length - 1; i += 1) {
        tris.push([pivot, remaining[i]!, remaining[i + 1]!]);
      }
      remaining.length = 0;
      break;
    }
  }
  if (remaining.length === 3) {
    tris.push([remaining[0]!, remaining[1]!, remaining[2]!]);
  }
  return tris;
};

export const closeBaseMesh = (mesh: TriangleMesh, options: CloseBaseOptions): CloseBaseResult => {
  const height = options.height ?? 2;
  const thickness = options.thickness ?? 1.5;
  const margin = options.margin ?? 0.2;
  const orientation = options.orientation ?? 'xy';
  const axis = axisFromOrientation(orientation, options.planeNormal);
  const warnings: string[] = [];

  const boundaries = collectBoundaryEdges(mesh);
  if (boundaries.length === 0) {
    warnings.push('No open boundary detected; mesh may already be closed');
    const quality = runGeometryQualityPipeline(mesh);
    return {
      mesh: createMesh({
        id: options.id ?? mesh.id,
        objectId: mesh.objectId,
        role: options.role ?? 'working',
        revision: options.revision ?? mesh.revision + 1,
        positions: new Float32Array(mesh.positions),
        indices: new Uint32Array(mesh.indices),
        fingerprint: fingerprintMesh(mesh.positions, mesh.indices)
      }),
      quality,
      boundaryLoops: 0,
      addedTriangles: 0,
      warnings
    };
  }

  const loops = buildLoops(boundaries);
  if (loops.length === 0) {
    throw new GeometryKernelError('TOPOLOGY_INVALID', 'Failed to extract boundary loops');
  }

  const positions = Array.from(mesh.positions);
  const indices = Array.from(mesh.indices);
  let addedTriangles = 0;
  const baseVertexOffset = Math.floor(positions.length / 3);

  if (options.strategy === 'surface') {
    for (const loop of loops) {
      const tris = earClip(loop.vertices, mesh.positions, axis);
      for (const tri of tris) {
        indices.push(tri[0]!, tri[1]!, tri[2]!);
        addedTriangles += 1;
      }
    }
    warnings.push('Surface strategy: in-place hole fill (fan/ear-clip); no extruded base');
  } else {
    // Plane strategy: find lowest plane along orientation axis, extrude walls, add base
    let plane = Number.POSITIVE_INFINITY;
    for (const loop of loops) {
      for (const vi of loop.vertices) {
        const c = getCoord(mesh.positions, vi, axis);
        if (c < plane) plane = c;
      }
    }
    plane -= Math.max(0, height);
    const inset = Math.max(0, thickness) * 0.05 + margin * 0.01;

    for (const loop of loops) {
      const ring: number[] = [];
      // Extrude each boundary vertex down to base plane
      for (const vi of loop.vertices) {
        const x = mesh.positions[vi * 3]!;
        const y = mesh.positions[vi * 3 + 1]!;
        const z = mesh.positions[vi * 3 + 2]!;
        const base = [x, y, z] as [number, number, number];
        base[axis] = plane;
        // slight inset toward centroid for thickness cue
        ring.push(Math.floor(positions.length / 3));
        positions.push(base[0], base[1], base[2]);
      }
      // Wall quads (two tris each)
      for (let i = 0; i < loop.vertices.length; i += 1) {
        const a = loop.vertices[i]!;
        const b = loop.vertices[(i + 1) % loop.vertices.length]!;
        const a2 = ring[i]!;
        const b2 = ring[(i + 1) % ring.length]!;
        indices.push(a, b, b2);
        indices.push(a, b2, a2);
        addedTriangles += 2;
      }
      // Base triangulation on extruded ring (optionally inset in UV)
      if (inset > 0 && ring.length >= 3) {
        let cx = 0;
        let cy = 0;
        let cz = 0;
        for (const vi of ring) {
          cx += positions[vi * 3]!;
          cy += positions[vi * 3 + 1]!;
          cz += positions[vi * 3 + 2]!;
        }
        const n = ring.length;
        cx /= n;
        cy /= n;
        cz /= n;
        const insetRing: number[] = [];
        for (const vi of ring) {
          const px = positions[vi * 3]!;
          const py = positions[vi * 3 + 1]!;
          const pz = positions[vi * 3 + 2]!;
          const ix = px + (cx - px) * Math.min(0.35, inset);
          const iy = py + (cy - py) * Math.min(0.35, inset);
          const iz = pz + (cz - pz) * Math.min(0.35, inset);
          insetRing.push(Math.floor(positions.length / 3));
          positions.push(ix, iy, iz);
        }
        // annulus between ring and inset + fill inset
        for (let i = 0; i < ring.length; i += 1) {
          const a = ring[i]!;
          const b = ring[(i + 1) % ring.length]!;
          const a2 = insetRing[i]!;
          const b2 = insetRing[(i + 1) % insetRing.length]!;
          indices.push(a, b, b2);
          indices.push(a, b2, a2);
          addedTriangles += 2;
        }
        const posView = new Float32Array(positions);
        const tris = earClip(insetRing, posView, axis);
        for (const tri of tris) {
          // Flip winding for outward base normal along -axis
          indices.push(tri[0]!, tri[2]!, tri[1]!);
          addedTriangles += 1;
        }
      } else {
        const posView = new Float32Array(positions);
        const tris = earClip(ring, posView, axis);
        for (const tri of tris) {
          indices.push(tri[0]!, tri[2]!, tri[1]!);
          addedTriangles += 1;
        }
      }
    }
    warnings.push(
      `Plane strategy: extruded walls height=${String(height)}, base at axis=${String(axis)}`
    );
    void baseVertexOffset;
  }

  const posArr = new Float32Array(positions);
  const idxArr = new Uint32Array(indices);
  const result = createMesh({
    id: options.id ?? mesh.id,
    objectId: mesh.objectId,
    role: options.role ?? 'working',
    revision: options.revision ?? mesh.revision + 1,
    positions: posArr,
    indices: idxArr,
    fingerprint: fingerprintMesh(posArr, idxArr)
  });
  const quality = runGeometryQualityPipeline(result);
  return {
    mesh: result,
    quality,
    boundaryLoops: loops.length,
    addedTriangles,
    warnings: [...warnings, ...quality.warnings]
  };
};
