/**
 * GEO-001B — topology normalization (exact weld) unit + real dental regression.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseClinicalMeshBytes } from '../../../src/clinical/import/ClinicalMeshParsers.js';
import { registerParsedClinicalMeshWithReport } from '../../../src/clinical/import/ClinicalMeshRegistration.js';
import {
  ClinicalGeometryEngine,
  MeshRegistry,
  analyzeMesh,
  createMesh,
  createSurfacePath,
  closeSurfacePath,
  extractBoundaryLoops,
  fingerprintMesh,
  normalizeMeshTopology,
  projectPointToSurface,
  validateSurfacePath
} from '../../../src/geometry-kernel/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const upperStl = join(root, 'apps/studio/public/clinical-fixtures/upper.stl');
const lowerStl = join(root, 'apps/studio/public/clinical-fixtures/lower.stl');
const evidenceDir = join(root, 'docs/certification/geo-001b-evidence');

const meshFrom = (
  positions: Float32Array,
  indices: Uint32Array,
  objectId: string,
  id = 1
) =>
  createMesh({
    id,
    objectId,
    role: 'working',
    revision: 1,
    positions,
    indices,
    fingerprint: fingerprintMesh(positions, indices)
  });

/** Two triangles that share coordinates but not indices (classic STL soup). */
const twoTriangleSoup = () => {
  const positions = new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 1, 0, // tri0
    1, 0, 0, 1, 1, 0, 0, 1, 0 // tri1 — shares physical verts with tri0
  ]);
  const indices = new Uint32Array([0, 1, 2, 3, 4, 5]);
  return meshFrom(positions, indices, 'soup-two');
};

const triangleFanSoup = (n = 6) => {
  const positions: number[] = [];
  const indices: number[] = [];
  const center = [0, 0, 0] as const;
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    const p1 = [Math.cos(a0), Math.sin(a0), 0] as const;
    const p2 = [Math.cos(a1), Math.sin(a1), 0] as const;
    const base = positions.length / 3;
    positions.push(center[0], center[1], center[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    indices.push(base, base + 1, base + 2);
  }
  return meshFrom(new Float32Array(positions), new Uint32Array(indices), 'fan-soup');
};

describe('GEO-001B normalizeMeshTopology', () => {
  it('1. single triangle remains one triangle', () => {
    const mesh = meshFrom(
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      new Uint32Array([0, 1, 2]),
      'single'
    );
    const { mesh: out, report } = normalizeMeshTopology(mesh);
    expect(out.indices.length).toBe(3);
    expect(report.normalizedVertexCount).toBe(3);
    expect(report.connectedComponentsAfter).toBe(1);
  });

  it('2. two triangles sharing coordinates weld to one component', () => {
    const mesh = twoTriangleSoup();
    const before = analyzeMesh(mesh);
    expect(before.connectedComponentCount).toBe(2);
    const { mesh: out, report } = normalizeMeshTopology(mesh);
    const after = analyzeMesh(out);
    expect(report.connectedComponentsBefore).toBe(2);
    expect(after.connectedComponentCount).toBe(1);
    expect(report.normalizedVertexCount).toBe(4);
    expect(report.exactDuplicatesRemoved).toBe(2);
    expect(report.geometryFingerprintAfter).not.toBe(report.geometryFingerprintBefore);
  });

  it('3. triangle-fan soup collapses shared center/ring verts', () => {
    const mesh = triangleFanSoup(8);
    const { report } = normalizeMeshTopology(mesh);
    expect(report.rawVertexCount).toBe(24);
    expect(report.normalizedVertexCount).toBeLessThan(report.rawVertexCount);
    expect(report.connectedComponentsAfter).toBe(1);
  });

  it('4. duplicated vertices are exact-welded', () => {
    const mesh = meshFrom(
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0]),
      new Uint32Array([0, 1, 2, 3, 4, 5]),
      'dups'
    );
    const { report } = normalizeMeshTopology(mesh);
    expect(report.exactDuplicatesRemoved).toBe(3);
    expect(report.normalizedVertexCount).toBe(3);
    expect(report.duplicateTrianglesRemoved).toBe(1);
  });

  it('5. duplicate triangles are removed', () => {
    const mesh = meshFrom(
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      new Uint32Array([0, 1, 2, 0, 1, 2]),
      'dup-tris'
    );
    const { report } = normalizeMeshTopology(mesh);
    expect(report.duplicateTrianglesRemoved).toBe(1);
    expect(report.normalizedTriangleCount).toBe(1);
  });

  it('6. degenerate triangle after merge is dropped', () => {
    // Second "triangle" collapses to a line once verts weld.
    const mesh = meshFrom(
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]),
      new Uint32Array([0, 1, 2, 3, 4, 5]),
      'degen'
    );
    const { report } = normalizeMeshTopology(mesh);
    expect(report.degenerateTrianglesRemoved).toBeGreaterThan(0);
    expect(report.normalizedTriangleCount).toBe(1);
  });

  it('7. already welded mesh is effectively a no-op', () => {
    const mesh = meshFrom(
      new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
      new Uint32Array([0, 1, 2, 0, 2, 3]),
      'indexed'
    );
    const { mesh: out, report } = normalizeMeshTopology(mesh);
    expect(report.alreadyIndexed).toBe(true);
    expect(report.exactDuplicatesRemoved).toBe(0);
    expect(out.fingerprint).toBe(mesh.fingerprint);
  });

  it('8. genuinely disconnected meshes stay disconnected', () => {
    const mesh = meshFrom(
      new Float32Array([
        0, 0, 0, 1, 0, 0, 0, 1, 0, // island A
        10, 0, 0, 11, 0, 0, 10, 1, 0 // island B
      ]),
      new Uint32Array([0, 1, 2, 3, 4, 5]),
      'two-islands'
    );
    const { report } = normalizeMeshTopology(mesh);
    expect(report.connectedComponentsAfter).toBe(2);
  });

  it('9–10. real upper/lower STL: components collapse; boundary is not a single triangle', () => {
    expect(existsSync(upperStl)).toBe(true);
    expect(existsSync(lowerStl)).toBe(true);
    mkdirSync(evidenceDir, { recursive: true });

    const load = (path: string, arch: string) => {
      const buf = readFileSync(path);
      const parsed = parseClinicalMeshBytes(
        buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        'stl'
      );
      return meshFrom(parsed.positions, parsed.indices, arch);
    };

    const upper = load(upperStl, 'upper');
    const lower = load(lowerStl, 'lower');
    const beforeU = analyzeMesh(upper);
    const beforeL = analyzeMesh(lower);
    expect(beforeU.connectedComponentCount).toBe(beforeU.triangleCount);

    const normU = normalizeMeshTopology(upper);
    const normL = normalizeMeshTopology(lower);
    const afterU = analyzeMesh(normU.mesh);
    const afterL = analyzeMesh(normL.mesh);

    expect(normU.report.normalizedVertexCount).toBeLessThan(normU.report.rawVertexCount / 2);
    expect(normL.report.normalizedVertexCount).toBeLessThan(normL.report.rawVertexCount / 2);
    expect(afterU.connectedComponentCount).toBeLessThan(1000);
    expect(afterL.connectedComponentCount).toBeLessThan(1000);
    expect(afterU.connectedComponentCount).not.toBe(afterU.triangleCount);
    expect(afterL.connectedComponentCount).not.toBe(afterL.triangleCount);

    const loopsU = extractBoundaryLoops(normU.mesh);
    expect(loopsU.length).toBeGreaterThan(0);
    expect(loopsU[0]!.vertexIndices.length).toBeGreaterThan(8);
    expect(loopsU[0]!.perimeter).toBeGreaterThan(10);

    const evidence = {
      at: new Date().toISOString(),
      upper: {
        before: {
          triangleCount: beforeU.triangleCount,
          vertexCount: beforeU.vertexCount,
          componentCount: beforeU.connectedComponentCount,
          boundaryEdges: beforeU.boundaryEdgeCount,
          nonManifoldEdges: beforeU.nonManifoldEdgeCount,
          fingerprint: beforeU.fingerprint
        },
        after: {
          triangleCount: afterU.triangleCount,
          vertexCount: afterU.vertexCount,
          componentCount: afterU.connectedComponentCount,
          boundaryEdges: normU.report.boundaryEdges,
          nonManifoldEdges: normU.report.nonManifoldEdges,
          fingerprint: afterU.fingerprint,
          primaryBoundary: {
            pointCount: loopsU[0]!.vertexIndices.length,
            perimeter: loopsU[0]!.perimeter,
            projectedArea: loopsU[0]!.projectedArea
          }
        },
        report: normU.report
      },
      lower: {
        before: {
          triangleCount: beforeL.triangleCount,
          vertexCount: beforeL.vertexCount,
          componentCount: beforeL.connectedComponentCount,
          boundaryEdges: beforeL.boundaryEdgeCount,
          nonManifoldEdges: beforeL.nonManifoldEdgeCount,
          fingerprint: beforeL.fingerprint
        },
        after: {
          triangleCount: afterL.triangleCount,
          vertexCount: afterL.vertexCount,
          componentCount: afterL.connectedComponentCount,
          boundaryEdges: normL.report.boundaryEdges,
          nonManifoldEdges: normL.report.nonManifoldEdges,
          fingerprint: afterL.fingerprint
        },
        report: normL.report
      }
    };
    writeFileSync(join(evidenceDir, 'normalization.json'), JSON.stringify(evidence, null, 2));
  }, 180_000);

  it('deterministic fingerprints for repeated normalize', () => {
    const mesh = twoTriangleSoup();
    const a = normalizeMeshTopology(mesh);
    const b = normalizeMeshTopology(mesh);
    expect(a.mesh.fingerprint).toBe(b.mesh.fingerprint);
    expect(a.report.geometryFingerprintAfter).toBe(b.report.geometryFingerprintAfter);
  });

  it('GEO-001A surface-path regression: welded real upper allows multi-face path', () => {
    const buf = readFileSync(upperStl);
    const parsed = parseClinicalMeshBytes(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      'stl'
    );
    const raw = meshFrom(parsed.positions, parsed.indices, 'upper-path');
    expect(analyzeMesh(raw).connectedComponentCount).toBe(raw.indices.length / 3);

    // Reproduce GEO-001A failure mode on RAW soup: multi-face seeds look disconnected.
    const engineRaw = new ClinicalGeometryEngine({ vtkHealthy: false });
    engineRaw.buildSpatialIndex(raw);
    const rawBox = analyzeMesh(raw).bbox;
    const rcx = (rawBox.min[0]! + rawBox.max[0]!) / 2;
    const rcy = (rawBox.min[1]! + rawBox.max[1]!) / 2;
    const rcz = (rawBox.min[2]! + rawBox.max[2]!) / 2;
    const rawBuilt = createSurfacePath(
      raw,
      [
        { point: [rcx - 2, rcy - 1.5, rcz + 8] },
        { point: [rcx + 2, rcy - 1.5, rcz + 8] },
        { point: [rcx + 2, rcy + 1.5, rcz + 8] },
        { point: [rcx - 2, rcy + 1.5, rcz + 8] }
      ],
      { closed: true, reconstruct: false, maxProjectDistanceMm: 40 }
    );
    if (rawBuilt.ok) {
      const rawClosedResult = closeSurfacePath(raw, rawBuilt.path);
      expect(rawClosedResult.ok).toBe(true);
      if (!rawClosedResult.ok) return;
      const rawClosed = rawClosedResult.path;
      const rawValidated = validateSurfacePath(raw, rawClosed, { maxSpacingMm: 40 });
      expect(rawValidated.ok).toBe(false);
      if (!rawValidated.ok) {
        expect(rawValidated.message).toMatch(/disconnected scan surfaces/i);
      }
    }

    const { mesh } = normalizeMeshTopology(raw);
    const after = analyzeMesh(mesh);
    expect(after.connectedComponentCount).toBeLessThan(1000);
    expect(after.connectedComponentCount).not.toBe(after.triangleCount);

    const engine = new ClinicalGeometryEngine({ vtkHealthy: false });
    engine.buildSpatialIndex(mesh);
    const b = after.bbox;
    const cx = (b.min[0]! + b.max[0]!) / 2;
    const cy = (b.min[1]! + b.max[1]!) / 2;
    const cz = (b.min[2]! + b.max[2]!) / 2;
    const rawSeeds = [
      [cx - 2, cy - 1.5, cz + 8],
      [cx + 2, cy - 1.5, cz + 8],
      [cx + 2, cy + 1.5, cz + 8],
      [cx - 2, cy + 1.5, cz + 8]
    ] as const;
    const seeds = [];
    for (const p of rawSeeds) {
      const hit = projectPointToSurface(mesh, p, undefined, 40);
      expect(hit.hit).toBe(true);
      if (!hit.hit) return;
      seeds.push({ point: hit.point, faceId: hit.faceId });
    }
    // reconstruct:false keeps a simple chordal loop (avoids geodesic self-cross noise).
    const built = createSurfacePath(mesh, seeds, {
      closed: true,
      reconstruct: false,
      maxProjectDistanceMm: 25
    });
    expect(built.ok).toBe(true);
    if (!built.ok) {
      throw new Error(built.message);
    }
    const closedResult = closeSurfacePath(mesh, built.path);
    expect(closedResult.ok).toBe(true);
    if (!closedResult.ok) return;
    const closed = closedResult.path;
    const validated = validateSurfacePath(mesh, closed, { maxSpacingMm: 40 });
    // Must not fail with the GEO-001A disconnected-component error.
    if (!validated.ok) {
      expect(validated.message).not.toMatch(/disconnected scan surfaces/i);
      throw new Error(validated.message);
    }
    const componentIds = new Set(closed.samples.map((s) => s.componentId));
    expect(componentIds.size).toBe(1);
    expect(closed.samples.length).toBeGreaterThanOrEqual(4);
  }, 180_000);

  it('import registration keeps SOURCE raw and WORKING normalized', () => {
    const soup = twoTriangleSoup();
    const registry = new MeshRegistry();
    const registered = registerParsedClinicalMeshWithReport(registry, 'reg-soup', {
      positions: soup.positions,
      indices: soup.indices,
      bounds: { min: [0, 0, 0], max: [1, 1, 0] },
      vertexCount: 6,
      faceCount: 2,
      unitsHint: undefined,
      warnings: Object.freeze([])
    });
    expect(registered.source.positions.length).toBe(18);
    expect(registered.working.positions.length).toBe(12);
    expect(registered.normalization.connectedComponentsAfter).toBe(1);
    expect(registry.getByObjectId('reg-soup', 'source')!.fingerprint).toBe(
      registered.source.fingerprint
    );
    expect(registry.getByObjectId('reg-soup', 'working')!.fingerprint).toBe(
      registered.working.fingerprint
    );
  });
});
