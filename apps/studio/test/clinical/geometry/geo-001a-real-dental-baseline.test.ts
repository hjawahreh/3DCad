/**
 * GEO-001A — real dental mesh baselines (upper/lower clinical fixtures).
 * Primary visual certification remains the browser walkthrough; this suite
 * stores MeshQualityReport baselines and offline engine timings on real STLs.
 */

import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseClinicalMeshBytes } from '../../../src/clinical/import/ClinicalMeshParsers.js';
import {
  ClinicalGeometryEngine,
  createMesh,
  fingerprintMesh
} from '../../../src/geometry-kernel/index.js';
import type { MeshQualityReport } from '../../../src/geometry-kernel/engine/types.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const upperStl = join(root, 'apps/studio/public/clinical-fixtures/upper.stl');
const lowerStl = join(root, 'apps/studio/public/clinical-fixtures/lower.stl');
const outDir = join(root, 'docs/certification/geo-001a-evidence');
const outJson = join(outDir, 'mesh-baselines.json');

const loadArch = (path: string, arch: 'UPPER' | 'LOWER', objectId: string) => {
  const buf = readFileSync(path);
  const parsed = parseClinicalMeshBytes(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'stl');
  const fingerprint = fingerprintMesh(parsed.positions, parsed.indices);
  const mesh = createMesh({
    id: arch === 'UPPER' ? 1 : 2,
    objectId,
    role: 'working',
    revision: 1,
    positions: parsed.positions,
    indices: parsed.indices,
    fingerprint
  });
  return { parsed, mesh, fingerprint };
};

const summarize = (arch: string, report: MeshQualityReport, extras: Record<string, unknown> = {}) => ({
  arch,
  geometryFingerprint: report.fingerprint,
  vertexCount: report.vertexCount,
  triangleCount: report.triangleCount,
  surfaceArea: report.surfaceArea,
  bounds: report.bbox,
  connectedComponents: report.connectedComponentCount,
  boundaryEdgeCount: report.boundaryEdgeCount,
  nonManifoldEdgeCount: report.nonManifoldEdgeCount,
  degenerateTriangleCount: report.degenerateTriangleCount,
  watertight: report.watertight,
  manifold: report.manifold,
  gate: report.gate,
  selfIntersectionStatus: report.selfIntersectionStatus,
  analysisDurationMs: report.durationMs,
  ...extras
});

describe('GEO-001A real dental baselines', () => {
  it('records upper + lower MeshQualityReport baselines from clinical fixtures', () => {
    expect(existsSync(upperStl)).toBe(true);
    expect(existsSync(lowerStl)).toBe(true);

    const engine = new ClinicalGeometryEngine({ vtkHealthy: false });
    const upper = loadArch(upperStl, 'UPPER', 'geo001a-upper');
    const lower = loadArch(lowerStl, 'LOWER', 'geo001a-lower');

    const tUpperAnalyze = performance.now();
    const upperReport = engine.analyzeMesh(upper.mesh);
    const upperAnalyzeMs = performance.now() - tUpperAnalyze;

    const tLowerAnalyze = performance.now();
    const lowerReport = engine.analyzeMesh(lower.mesh);
    const lowerAnalyzeMs = performance.now() - tLowerAnalyze;

    const tUpperTopo = performance.now();
    const upperTopo = engine.buildTopology(upper.mesh);
    const upperTopoMs = performance.now() - tUpperTopo;

    const tLowerTopo = performance.now();
    const lowerTopo = engine.buildTopology(lower.mesh);
    const lowerTopoMs = performance.now() - tLowerTopo;

    const tUpperSpatial = performance.now();
    const upperSpatial = engine.buildSpatialIndex(upper.mesh);
    const upperSpatialMs = performance.now() - tUpperSpatial;

    const tLowerSpatial = performance.now();
    const lowerSpatial = engine.buildSpatialIndex(lower.mesh);
    const lowerSpatialMs = performance.now() - tLowerSpatial;

    const upperLoops = engine.extractBoundaries(upper.mesh);
    const lowerLoops = engine.extractBoundaries(lower.mesh);

    expect(upperReport.triangleCount).toBeGreaterThan(10_000);
    expect(lowerReport.triangleCount).toBeGreaterThan(10_000);
    expect(upperReport.watertight).toBe(false);
    expect(lowerReport.watertight).toBe(false);
    expect(upperReport.boundaryEdgeCount).toBeGreaterThan(0);
    expect(lowerReport.boundaryEdgeCount).toBeGreaterThan(0);
    expect(upperTopo.boundaryEdges.length).toBeGreaterThan(0);
    expect(lowerTopo.boundaryEdges.length).toBeGreaterThan(0);
    expect(upperSpatial.bvhRoot).toBeDefined();
    expect(lowerSpatial.bvhRoot).toBeDefined();
    expect(upperLoops.length).toBeGreaterThan(0);
    expect(lowerLoops.length).toBeGreaterThan(0);

    const baselines = {
      at: new Date().toISOString(),
      fixtures: [
        'apps/studio/public/clinical-fixtures/upper.stl',
        'apps/studio/public/clinical-fixtures/lower.stl'
      ],
      note: 'Open dental scans are expected non-watertight. Synthetic meshes are not used as primary evidence.',
      meshes: [
        summarize('UPPER', upperReport, {
          topologyBuildMs: upperTopoMs,
          spatialIndexMs: upperSpatialMs,
          analysisWallMs: upperAnalyzeMs,
          boundaryLoopCount: upperLoops.length,
          primaryBoundary: upperLoops[0]
            ? {
                perimeter: upperLoops[0].perimeter,
                projectedArea: upperLoops[0].projectedArea,
                pointCount: upperLoops[0].vertexIndices.length,
                closed: upperLoops[0].closed,
                score: upperLoops[0].score
              }
            : null
        }),
        summarize('LOWER', lowerReport, {
          topologyBuildMs: lowerTopoMs,
          spatialIndexMs: lowerSpatialMs,
          analysisWallMs: lowerAnalyzeMs,
          boundaryLoopCount: lowerLoops.length,
          primaryBoundary: lowerLoops[0]
            ? {
                perimeter: lowerLoops[0].perimeter,
                projectedArea: lowerLoops[0].projectedArea,
                pointCount: lowerLoops[0].vertexIndices.length,
                closed: lowerLoops[0].closed,
                score: lowerLoops[0].score
              }
            : null
        })
      ],
      performance: {
        upper: {
          analysisMs: upperAnalyzeMs,
          topologyBuildMs: upperTopoMs,
          spatialIndexMs: upperSpatialMs,
          triangleCount: upperReport.triangleCount
        },
        lower: {
          analysisMs: lowerAnalyzeMs,
          topologyBuildMs: lowerTopoMs,
          spatialIndexMs: lowerSpatialMs,
          triangleCount: lowerReport.triangleCount
        }
      }
    };

    mkdirSync(outDir, { recursive: true });
    writeFileSync(outJson, JSON.stringify(baselines, null, 2));
    expect(existsSync(outJson)).toBe(true);
  }, 180_000);

  it('projects representative points onto real upper surface (no fabricated hits)', () => {
    const engine = new ClinicalGeometryEngine({ vtkHealthy: false });
    const upper = loadArch(upperStl, 'UPPER', 'geo001a-upper-proj');
    engine.buildSpatialIndex(upper.mesh);
    const report = engine.analyzeMesh(upper.mesh);
    const b = report.bbox;
    const cx = (b.min[0]! + b.max[0]!) / 2;
    const cy = (b.min[1]! + b.max[1]!) / 2;
    const cz = (b.min[2]! + b.max[2]!) / 2;
    const hit = engine.projectToSurface(upper.mesh, [cx, cy, cz], 50);
    expect(hit.hit).toBe(true);
    if (hit.hit) {
      expect(hit.faceId).toBeGreaterThanOrEqual(0);
      expect(hit.distance).toBeLessThan(50);
    }
    const miss = engine.nearestSurface(upper.mesh, [cx + 1e6, cy + 1e6, cz + 1e6], 2);
    expect(miss.hit).toBe(false);
  }, 120_000);
});
