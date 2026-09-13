/**
 * VTK native-worker GeometryBackend (PROD-001S).
 *
 * Spawns the offline Python VTK spike worker. Never imports VTK into React
 * or clinical modules. Suitable for Vitest / Tauri sidecar / DEV spike —
 * not for synchronous browser main-thread use.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GeometryKernelError } from '../errors.js';
import type { GeometryBackend } from './GeometryBackend.js';
import {
  createMesh,
  fingerprintMesh,
  type TriangleMesh
} from '../mesh/TriangleMesh.js';
import {
  runGeometryQualityPipeline,
  type GeometryQualityReport
} from '../quality/GeometryQualityPipeline.js';
import { buildSpatialIndex, type SpatialIndex } from '../spatial/SpatialIndex.js';
import type { TrimMeshOptions, TrimMeshResult, TrimProjectionAxes } from '../ops/trimMesh.js';
import type { CloseBaseOptions, CloseBaseResult } from '../ops/closeBaseMesh.js';
import type { DisplayMeshOptions, DisplayMeshResult } from '../ops/displayMesh.js';
import { prepareDisplayMesh } from '../ops/displayMesh.js';
import { inferTrimProjectionAxes } from '../ops/trimMesh.js';

const repoRootFromHere = (): string => {
  // .../apps/studio/src/geometry-kernel/adapters → repo root (+ trailing space path)
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '../../../../..');
};

export interface VtkWorkerConfig {
  readonly pythonPath?: string;
  readonly scriptPath?: string;
  readonly meshPathHint?: string;
}

const defaultPython = (): string =>
  process.env.CAD_VTK_PYTHON ?? '/tmp/cad-geom-bench/bin/python';

const defaultScript = (root: string): string =>
  join(root, 'tools/geometry-backend-bench/vtk_clinical_spike.py');

const newellNormal = (
  points: readonly { x: number; y: number; z: number }[]
): [number, number, number] | null => {
  if (points.length < 3) return null;
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < points.length; i += 1) {
    const cur = points[i]!;
    const nxt = points[(i + 1) % points.length]!;
    nx += (cur.y - nxt.y) * (cur.z + nxt.z);
    ny += (cur.z - nxt.z) * (cur.x + nxt.x);
    nz += (cur.x - nxt.x) * (cur.y + nxt.y);
  }
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-12) return null;
  return [nx / len, ny / len, nz / len];
};

const writeTempStl = (mesh: TriangleMesh, dir: string): string => {
  // Binary STL from triangle soup (duplicated verts OK for VTK reader)
  const triCount = Math.floor(mesh.indices.length / 3);
  const buf = Buffer.alloc(84 + triCount * 50);
  buf.write('CAD VTK SPIKE', 0, 'ascii');
  buf.writeUInt32LE(triCount, 80);
  let offset = 84;
  for (let t = 0; t < triCount; t += 1) {
    const i0 = mesh.indices[t * 3]!;
    const i1 = mesh.indices[t * 3 + 1]!;
    const i2 = mesh.indices[t * 3 + 2]!;
    const ax = mesh.positions[i0 * 3]!;
    const ay = mesh.positions[i0 * 3 + 1]!;
    const az = mesh.positions[i0 * 3 + 2]!;
    const bx = mesh.positions[i1 * 3]!;
    const by = mesh.positions[i1 * 3 + 1]!;
    const bz = mesh.positions[i1 * 3 + 2]!;
    const cx = mesh.positions[i2 * 3]!;
    const cy = mesh.positions[i2 * 3 + 1]!;
    const cz = mesh.positions[i2 * 3 + 2]!;
    // zero normal — VTK recomputes as needed
    buf.writeFloatLE(0, offset);
    buf.writeFloatLE(0, offset + 4);
    buf.writeFloatLE(0, offset + 8);
    buf.writeFloatLE(ax, offset + 12);
    buf.writeFloatLE(ay, offset + 16);
    buf.writeFloatLE(az, offset + 20);
    buf.writeFloatLE(bx, offset + 24);
    buf.writeFloatLE(by, offset + 28);
    buf.writeFloatLE(bz, offset + 32);
    buf.writeFloatLE(cx, offset + 36);
    buf.writeFloatLE(cy, offset + 40);
    buf.writeFloatLE(cz, offset + 44);
    buf.writeUInt16LE(0, offset + 48);
    offset += 50;
  }
  const path = join(dir, 'input.stl');
  writeFileSync(path, buf);
  return path;
};

export class VtkNativeWorkerBackend implements GeometryBackend {
  public readonly name = 'vtk-native-worker-v1';
  private readonly config: VtkWorkerConfig;

  public constructor(config: VtkWorkerConfig = {}) {
    this.config = config;
  }

  public validate(mesh: TriangleMesh): GeometryQualityReport {
    return runGeometryQualityPipeline(mesh);
  }

  public buildSpatialIndex(mesh: TriangleMesh): SpatialIndex {
    return buildSpatialIndex(mesh);
  }

  public trim(mesh: TriangleMesh, options: TrimMeshOptions): TrimMeshResult {
    const loop =
      options.loop3d ??
      null;
    if (!loop || loop.length < 3) {
      throw new GeometryKernelError(
        'BOUNDARY_INVALID',
        'VTK trim requires explicit loop3d (≥3 surface-picked points)'
      );
    }
    let normal = options.loopNormal ?? null;
    if (!normal) {
      normal = newellNormal(loop);
    }
    if (!normal) {
      throw new GeometryKernelError(
        'BOUNDARY_INVALID',
        'Trim boundary orientation could not be determined.'
      );
    }

    const root = repoRootFromHere();
    const python = this.config.pythonPath ?? defaultPython();
    const script = this.config.scriptPath ?? defaultScript(root);
    if (!existsSync(python) || !existsSync(script)) {
      throw new GeometryKernelError(
        'UNSUPPORTED_OPERATION',
        'VTK native worker python/script not available'
      );
    }

    const tmp = mkdtempSync(join(tmpdir(), 'cad-vtk-'));
    try {
      const meshPath = this.config.meshPathHint ?? writeTempStl(mesh, tmp);
      const insideOut = (options.keepMode ?? 'remove-interior') !== 'remove-interior';
      // EMPIRICAL: remove-interior → InsideOut=False for ImplicitSelectionLoop
      const req = {
        cmd: 'trim',
        mesh_path: meshPath,
        loop: loop.map((p) => [p.x, p.y, p.z]),
        normal: [...normal],
        inside_out: insideOut,
        include_mesh: true
      };
      const spawned = spawnSync(python, [script, '--stdin-json'], {
        input: JSON.stringify(req),
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
        timeout: 90_000
      });
      if (spawned.error) {
        throw new GeometryKernelError(
          'UNSUPPORTED_OPERATION',
          `VTK worker spawn failed: ${spawned.error.message}`
        );
      }
      if (spawned.status !== 0) {
        throw new GeometryKernelError(
          'UNSUPPORTED_OPERATION',
          `VTK worker exit ${String(spawned.status)}: ${spawned.stderr ?? ''}`
        );
      }
      const parsed = JSON.parse(spawned.stdout) as {
        ok?: boolean;
        error?: string;
        noop?: boolean;
        positions?: number[][];
        indices?: number[][];
        removed_triangles_est?: number;
        removed_triangle_count?: number;
        output_triangles?: number;
        output_triangle_count?: number;
        input_triangles?: number;
        new_point_count?: number;
        vertices?: number;
        surface_area_before?: number;
        surface_area_after?: number;
        bounds_before?: number[];
        bounds_after?: number[];
        keep_mode?: string;
        diagnostics?: { pipeline?: string; fallback_used?: boolean };
        quality?: { fingerprint?: string };
      };
      if (!parsed.ok) {
        throw new GeometryKernelError(
          'VALIDATION_FAILED',
          parsed.error ?? 'VTK trim failed'
        );
      }
      if (!parsed.positions || !parsed.indices) {
        throw new GeometryKernelError('UNSUPPORTED_OPERATION', 'VTK worker omitted mesh buffers');
      }
      const positions = new Float32Array(parsed.positions.length * 3);
      for (let i = 0; i < parsed.positions.length; i += 1) {
        const row = parsed.positions[i]!;
        positions[i * 3] = row[0]!;
        positions[i * 3 + 1] = row[1]!;
        positions[i * 3 + 2] = row[2]!;
      }
      const indices = new Uint32Array(parsed.indices.length * 3);
      for (let i = 0; i < parsed.indices.length; i += 1) {
        const row = parsed.indices[i]!;
        indices[i * 3] = row[0]!;
        indices[i * 3 + 1] = row[1]!;
        indices[i * 3 + 2] = row[2]!;
      }
      const outMesh = createMesh({
        id: options.id ?? mesh.id,
        objectId: mesh.objectId,
        role: options.role ?? 'preview',
        revision: options.revision ?? mesh.revision + 1,
        positions,
        indices,
        fingerprint: fingerprintMesh(positions, indices)
      });
      const quality = runGeometryQualityPipeline(outMesh);
      const axes: TrimProjectionAxes = options.projectionAxes ?? inferTrimProjectionAxes(mesh);
      const removed = Number(parsed.removed_triangle_count ?? parsed.removed_triangles_est ?? 0);
      const kept = Math.floor(outMesh.indices.length / 3);
      const inputFaces = Math.floor(mesh.indices.length / 3);
      const pipeline = parsed.diagnostics?.pipeline ?? 'vtkSelectPolyData+vtkClipPolyData';
      const algorithm = pipeline.includes('SelectPolyData')
        ? ('vtk-select-polydata' as const)
        : ('vtk-implicit-loop' as const);
      if (parsed.noop === true || (removed === 0 && kept === inputFaces)) {
        throw new GeometryKernelError(
          'VALIDATION_FAILED',
          'Trim produced no geometry change.'
        );
      }
      return {
        mesh: outMesh,
        quality,
        removedTriangles: removed,
        keptTriangles: kept,
        retainedTriangles: kept,
        warnings: [
          'PROD-002R VTK native worker',
          `pipeline=${pipeline}`,
          `keepMode=${parsed.keep_mode ?? options.keepMode ?? 'remove-interior'}`,
          `outputTriangles=${String(parsed.output_triangle_count ?? kept)}`,
          `vertices=${String(parsed.new_point_count ?? parsed.vertices ?? outMesh.positions.length / 3)}`,
          ...(parsed.diagnostics?.fallback_used ? ['fallback=ImplicitSelectionLoop'] : [])
        ],
        algorithm,
        projectionAxes: axes
      };
    } finally {
      try {
        rmSync(tmp, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  public closeBase(_mesh: TriangleMesh, _options: CloseBaseOptions): CloseBaseResult {
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'VTK Close Base spike is offline-evaluated; worker closeBase not production-wired (see PROD-001S certification)'
    );
  }

  public prepareDisplay(mesh: TriangleMesh, options?: DisplayMeshOptions): DisplayMeshResult {
    return prepareDisplayMesh(mesh, options);
  }
}

/** True when the PROD-001S Python VTK worker is available on this machine. */
export const isVtkNativeWorkerAvailable = (config: VtkWorkerConfig = {}): boolean => {
  const root = repoRootFromHere();
  const python = config.pythonPath ?? defaultPython();
  const script = config.scriptPath ?? defaultScript(root);
  return existsSync(python) && existsSync(script);
};
