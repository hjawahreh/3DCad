/**
 * Browser-safe VTK worker client (PROD-001T).
 * Talks to the local HTTP VTK sidecar — never imports VTK into clinical/React.
 */

import { GeometryKernelError } from '../errors.js';
import type { AsyncGeometryBackend } from './AsyncGeometryBackend.js';
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
import {
  normalizeTrimKeepMode,
  type TrimMeshOptions,
  type TrimMeshResult,
  type TrimProjectionAxes
} from '../ops/trimMesh.js';
import { inferTrimProjectionAxes } from '../ops/trimMesh.js';
import type { CloseBaseOptions, CloseBaseResult } from '../ops/closeBaseMesh.js';
import type { DisplayMeshOptions, DisplayMeshResult } from '../ops/displayMesh.js';
import { prepareDisplayMesh } from '../ops/displayMesh.js';

const DEFAULT_URL = 'http://127.0.0.1:8765';

/** Browser-safe env read — bare `process` throws ReferenceError in Vite client. */
const readCadEnv = (key: string): string | undefined => {
  const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const value = proc?.env?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export interface VtkHttpWorkerConfig {
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
}

const float32ToB64 = (data: Float32Array): string => {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    // Avoid spread (...slice) — creates huge arg lists and dominated encode time.
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
};

const uint32ToB64 = (data: Uint32Array): string => {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode.apply(null, slice as unknown as number[]);
  }
  return btoa(binary);
};

const b64ToFloat32 = (b64: string): Float32Array => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
};

const b64ToUint32 = (b64: string): Uint32Array => {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Uint32Array(bytes.buffer);
};

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

export class VtkHttpWorkerBackend implements AsyncGeometryBackend {
  public readonly name = 'vtk-http-worker-v1';
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  /** GEO-001E: avoid re-encoding identical working meshes across preview retries. */
  private readonly encodeCache = new Map<string, { positions_b64: string; indices_b64: string }>();

  public constructor(config: VtkHttpWorkerConfig = {}) {
    this.baseUrl = (config.baseUrl ?? readCadEnv('CAD_VTK_WORKER_URL') ?? DEFAULT_URL).replace(
      /\/$/,
      ''
    );
    this.timeoutMs = config.timeoutMs ?? 180_000;
  }

  public validate(mesh: TriangleMesh): GeometryQualityReport {
    return runGeometryQualityPipeline(mesh);
  }

  public buildSpatialIndex(mesh: TriangleMesh): SpatialIndex {
    return buildSpatialIndex(mesh);
  }

  public trim(_mesh: TriangleMesh, _options: TrimMeshOptions): TrimMeshResult {
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'VtkHttpWorkerBackend requires trimAsync (do not call sync trim on UI thread)'
    );
  }

  public closeBase(_mesh: TriangleMesh, _options: CloseBaseOptions): CloseBaseResult {
    throw new GeometryKernelError(
      'UNSUPPORTED_OPERATION',
      'VtkHttpWorkerBackend requires closeBaseAsync'
    );
  }

  public prepareDisplay(mesh: TriangleMesh, options?: DisplayMeshOptions): DisplayMeshResult {
    return prepareDisplayMesh(mesh, options);
  }

  public async trimAsync(
    mesh: TriangleMesh,
    options: TrimMeshOptions,
    signal?: AbortSignal
  ): Promise<TrimMeshResult> {
    const loop = options.loop3d;
    if (!loop || loop.length < 3) {
      throw new GeometryKernelError(
        'BOUNDARY_INVALID',
        'VTK trim requires explicit loop3d (≥3 surface-picked points)'
      );
    }
    let normal = options.loopNormal ?? null;
    if (!normal) normal = newellNormal(loop);
    if (!normal) {
      throw new GeometryKernelError(
        'BOUNDARY_INVALID',
        'Trim boundary orientation could not be determined.'
      );
    }
    const keepMode = normalizeTrimKeepMode(options.keepMode);
    const insideOut = keepMode === 'KEEP_INSIDE';
    const encodeStart = performance.now();
    let encoded = this.encodeCache.get(mesh.fingerprint);
    let encodeCacheHit = false;
    if (encoded === undefined) {
      encoded = {
        positions_b64: float32ToB64(mesh.positions),
        indices_b64: uint32ToB64(mesh.indices)
      };
      this.encodeCache.clear();
      this.encodeCache.set(mesh.fingerprint, encoded);
    } else {
      encodeCacheHit = true;
    }
    const encodeMs = performance.now() - encodeStart;
    const body = {
      cmd: 'trim',
      mesh_fingerprint: mesh.fingerprint,
      positions_b64: encoded.positions_b64,
      indices_b64: encoded.indices_b64,
      loop: loop.map((p) => [p.x, p.y, p.z]),
      normal: [...normal],
      inside_out: insideOut,
      keep_mode: keepMode,
      include_mesh: true,
      operation_version: 'PROD-002R'
    };
    const postStart = performance.now();
    const parsed = await this.post(body, signal);
    const transferMs = performance.now() - postStart;
    if (!parsed.ok) {
      throw new GeometryKernelError(
        'VALIDATION_FAILED',
        String(parsed.error ?? 'Trim produced an invalid geometry result.')
      );
    }
    const result = this.toTrimResult(mesh, options, parsed, normal);
    return {
      ...result,
      warnings: [
        ...result.warnings,
        `timing:encode=${encodeMs.toFixed(1)}ms`,
        `timing:encodeCache=${encodeCacheHit ? 'hit' : 'miss'}`,
        `timing:httpRoundTrip=${transferMs.toFixed(1)}ms`
      ]
    };
  }

  public async closeBaseAsync(
    mesh: TriangleMesh,
    options: CloseBaseOptions,
    signal?: AbortSignal
  ): Promise<CloseBaseResult> {
    const rawDir =
      options.planeNormal ??
      (options.orientation === 'xz'
        ? ([0, 1, 0] as const)
        : options.orientation === 'yz'
          ? ([1, 0, 0] as const)
          : ([0, 0, 1] as const));
    // Base extrudes opposite the clinical plane normal (inferior / into the base).
    const direction = [-rawDir[0], -rawDir[1], -rawDir[2]] as const;
    const body = {
      cmd: 'close_base',
      positions_b64: float32ToB64(mesh.positions),
      indices_b64: uint32ToB64(mesh.indices),
      height: options.height ?? 3,
      direction: [...direction],
      direction_source: options.preferRequestedOrientation
        ? `clinical:${options.orientation ?? 'xy'}`
        : 'explicit',
      include_mesh: true,
      operation_version: 'PROD-001T'
    };
    const parsed = await this.post(body, signal);
    if (!parsed.ok) {
      throw new GeometryKernelError(
        'VALIDATION_FAILED',
        String(parsed.error ?? 'Base generation could not produce a safe result.')
      );
    }
    if (!parsed.positions_b64 || !parsed.indices_b64) {
      throw new GeometryKernelError(
        'UNSUPPORTED_OPERATION',
        'VTK worker omitted close-base mesh buffers'
      );
    }
    const positions = b64ToFloat32(String(parsed.positions_b64));
    const indices = b64ToUint32(String(parsed.indices_b64));
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
    const added = Number(parsed.added_triangles_est ?? 0);
    if (added <= 0) {
      throw new GeometryKernelError(
        'VALIDATION_FAILED',
        'Base generation could not produce a safe result.'
      );
    }
    return {
      mesh: outMesh,
      quality,
      boundaryLoops: Number(parsed.loop_vertices ?? 1),
      addedTriangles: added,
      warnings: ['PROD-001T VTK HTTP worker close-base'],
      elapsedMs: Number((parsed.timings_ms as { total_ms?: number } | undefined)?.total_ms ?? 0),
      extrudeAxis: 1
    };
  }

  private toTrimResult(
    mesh: TriangleMesh,
    options: TrimMeshOptions,
    parsed: Record<string, unknown>,
    normal: readonly [number, number, number]
  ): TrimMeshResult {
    if (!parsed.positions_b64 || !parsed.indices_b64) {
      throw new GeometryKernelError(
        'UNSUPPORTED_OPERATION',
        'VTK worker omitted trim mesh buffers'
      );
    }
    const positions = b64ToFloat32(String(parsed.positions_b64));
    const indices = b64ToUint32(String(parsed.indices_b64));
    if (![...positions].every((n) => Number.isFinite(n))) {
      throw new GeometryKernelError(
        'VALIDATION_FAILED',
        'Trim produced an invalid geometry result.'
      );
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
    const removed = Number(
      parsed.removed_triangle_count ?? parsed.removed_triangles_est ?? 0
    );
    const kept = Math.floor(outMesh.indices.length / 3);
    const inputFaces = Math.floor(mesh.indices.length / 3);
    const noop = parsed.noop === true;
    const diagnostics = parsed.diagnostics as Record<string, unknown> | undefined;
    const pipeline =
      typeof diagnostics?.pipeline === 'string'
        ? diagnostics.pipeline
        : 'vtkSelectPolyData+vtkClipPolyData';
    const algorithm: TrimMeshResult['algorithm'] = pipeline.includes('SelectPolyData')
      ? 'vtk-select-polydata'
      : 'vtk-implicit-loop';
    if (noop || (removed <= 0 && kept === inputFaces)) {
      throw new GeometryKernelError('VALIDATION_FAILED', 'Trim produced no geometry change.');
    }
    if (kept === 0) {
      throw new GeometryKernelError(
        'VALIDATION_FAILED',
        'Trim produced an invalid geometry result.'
      );
    }
    if (outMesh.fingerprint === mesh.fingerprint) {
      throw new GeometryKernelError('VALIDATION_FAILED', 'Trim produced no geometry change.');
    }
    const axes: TrimProjectionAxes = options.projectionAxes ?? inferTrimProjectionAxes(mesh);
    const keepMode = normalizeTrimKeepMode(options.keepMode);
    const timings = parsed.timings_ms as Record<string, number> | undefined;
    const timingWarnings =
      timings === undefined
        ? []
        : Object.entries(timings)
            .filter(([, v]) => typeof v === 'number' && Number.isFinite(v))
            .map(([k, v]) => `timing:vtk:${k}=${Number(v).toFixed(1)}ms`);
    return {
      mesh: outMesh,
      quality,
      removedTriangles: removed,
      keptTriangles: kept,
      retainedTriangles: kept,
      warnings: [
        'PROD-002R VTK HTTP worker',
        `pipeline=${pipeline}`,
        `keepMode=${keepMode}`,
        `loopNormal=${normal.join(',')}`,
        `outputTriangles=${String(parsed.output_triangle_count ?? kept)}`,
        `vertices=${String(parsed.new_point_count ?? parsed.vertices ?? outMesh.positions.length / 3)}`,
        `surfaceAreaBefore=${String(parsed.surface_area_before ?? 'n/a')}`,
        `surfaceAreaAfter=${String(parsed.surface_area_after ?? 'n/a')}`,
        `selectedRegionTriangles=${String(removed)}`,
        `keepRegionTriangles=${String(kept)}`,
        `removedRegionTriangles=${String(removed)}`,
        ...(diagnostics?.fallback_used === true ? ['fallback=ImplicitSelectionLoop'] : []),
        ...timingWarnings
      ],
      algorithm,
      projectionAxes: axes
    };
  }

  private async post(
    body: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      const res = await fetch(`${this.baseUrl}/v1/geometry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok && json.ok !== true) {
        throw new GeometryKernelError(
          'UNSUPPORTED_OPERATION',
          String(json.error ?? `VTK worker HTTP ${String(res.status)}`)
        );
      }
      return json;
    } catch (err) {
      if (err instanceof GeometryKernelError) throw err;
      if (signal?.aborted || controller.signal.aborted) {
        throw new GeometryKernelError('CANCELLED', 'VTK worker job cancelled');
      }
      throw new GeometryKernelError(
        'UNSUPPORTED_OPERATION',
        `VTK worker unreachable at ${this.baseUrl}: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

export const probeVtkHttpWorker = async (
  baseUrl = DEFAULT_URL
): Promise<boolean> => {
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(1500)
    });
    return res.ok;
  } catch {
    return false;
  }
};
