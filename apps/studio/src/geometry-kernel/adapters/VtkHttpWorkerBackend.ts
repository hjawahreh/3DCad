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
import {
  CGF_CONTENT_TYPE,
  decodeBinaryGeometryFrame,
  isBinaryGeometryFrame,
  type BinaryGeometryFrameMeta,
  type DecodedBinaryGeometryFrame
} from '../transport/BinaryGeometryFrame.js';
import {
  resolveGeometryDeliveryClient,
  type GeometryDeliveryClient,
  type GeometryDeliveryMode
} from '../transport/GeometryDelivery.js';

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

export interface VtkWorkerSessionInfo {
  readonly workerSessionId: string;
  readonly geometryFingerprint: string;
  readonly objectId: string;
  readonly previewId?: string;
  readonly lastUploadBytes: number;
  readonly meshResident: boolean;
}

export interface VtkTransportMetrics {
  uploadBytes: number;
  downloadBytes: number;
  meshUploaded: boolean;
  meshResident: boolean;
  httpRoundTripMs: number;
  encodeMs: number;
  resultFormat?: 'binary' | 'json_b64' | 'json';
  jsonBytes?: number;
  binaryBytes?: number;
  metaBytes?: number;
  decodeMs?: number;
  arrayBufferMs?: number;
  deliveryMode?: GeometryDeliveryMode;
  httpMs?: number | 'unavailable';
  ipcMs?: number | 'unavailable';
}

interface PreviewCacheEntry {
  readonly previewId: string;
  readonly previewFingerprint: string;
  readonly baseFingerprint: string;
  readonly mesh: TriangleMesh;
  readonly objectId: string;
}

export class VtkHttpWorkerBackend implements AsyncGeometryBackend {
  public readonly name = 'vtk-http-worker-v1';
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  /** GEO-001E: avoid re-encoding identical working meshes across preview retries. */
  private readonly encodeCache = new Map<string, { positions_b64: string; indices_b64: string }>();
  /** GEO-001F: persistent worker sessions keyed by objectId. */
  private readonly sessions = new Map<string, VtkWorkerSessionInfo>();
  /** GEO-001G: decoded preview meshes keyed by previewId. */
  private readonly previewCache = new Map<string, PreviewCacheEntry>();
  /** GEO-002: identical resident previews reuse the already computed result. */
  private readonly trimResultCache = new Map<string, TrimMeshResult>();
  private deliveryClient: GeometryDeliveryClient | null = null;
  private lastTransport: VtkTransportMetrics = {
    uploadBytes: 0,
    downloadBytes: 0,
    meshUploaded: false,
    meshResident: false,
    httpRoundTripMs: 0,
    encodeMs: 0
  };

  public constructor(config: VtkHttpWorkerConfig = {}) {
    this.baseUrl = (config.baseUrl ?? readCadEnv('CAD_VTK_WORKER_URL') ?? DEFAULT_URL).replace(
      /\/$/,
      ''
    );
    this.timeoutMs = config.timeoutMs ?? 180_000;
  }

  public getLastTransport() {
    return this.lastTransport;
  }

  public getSession(objectId: string): VtkWorkerSessionInfo | undefined {
    return this.sessions.get(objectId);
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

  private encodeMesh(mesh: TriangleMesh): {
    positions_b64: string;
    indices_b64: string;
    encodeMs: number;
    cacheHit: boolean;
  } {
    const encodeStart = performance.now();
    let encoded = this.encodeCache.get(mesh.fingerprint);
    let cacheHit = false;
    if (encoded === undefined) {
      encoded = {
        positions_b64: float32ToB64(mesh.positions),
        indices_b64: uint32ToB64(mesh.indices)
      };
      this.encodeCache.clear();
      this.encodeCache.set(mesh.fingerprint, encoded);
    } else {
      cacheHit = true;
    }
    return {
      ...encoded,
      encodeMs: performance.now() - encodeStart,
      cacheHit
    };
  }

  /**
   * GEO-001F: upload full mesh ONCE into the persistent worker session.
   * Subsequent trim previews reference workerSessionId + fingerprint only.
   */
  public async ensureGeometry(
    mesh: TriangleMesh,
    options?: {
      readonly caseId?: string;
      readonly signal?: AbortSignal;
      readonly force?: boolean;
    }
  ): Promise<VtkWorkerSessionInfo> {
    const existing = this.sessions.get(mesh.objectId);
    if (
      !options?.force &&
      existing !== undefined &&
      existing.geometryFingerprint === mesh.fingerprint
    ) {
      return existing;
    }
    const encoded = this.encodeMesh(mesh);
    const body = {
      cmd: 'init_geometry',
      case_id: options?.caseId ?? '',
      object_id: mesh.objectId,
      geometry_fingerprint: mesh.fingerprint,
      mesh_fingerprint: mesh.fingerprint,
      revision: mesh.revision,
      positions_b64: encoded.positions_b64,
      indices_b64: encoded.indices_b64,
      ...(existing !== undefined ? { worker_session_id: existing.workerSessionId } : {})
    };
    const uploadBytes = encoded.positions_b64.length + encoded.indices_b64.length;
    const postStart = performance.now();
    const parsed = await this.post(body, options?.signal);
    const httpMs = performance.now() - postStart;
    if (!parsed.ok) {
      throw new GeometryKernelError(
        'UNSUPPORTED_OPERATION',
        String(parsed.error ?? 'Worker init_geometry failed')
      );
    }
    const info: VtkWorkerSessionInfo = {
      workerSessionId: String(parsed.worker_session_id ?? ''),
      geometryFingerprint: mesh.fingerprint,
      objectId: mesh.objectId,
      lastUploadBytes: uploadBytes,
      meshResident: true
    };
    this.sessions.set(mesh.objectId, info);
    this.lastTransport = {
      uploadBytes,
      downloadBytes: 0,
      meshUploaded: true,
      meshResident: false,
      httpRoundTripMs: httpMs,
      encodeMs: encoded.encodeMs
    };
    return info;
  }

  public async acceptWorkerPreview(input: {
    readonly objectId: string;
    readonly previewId: string;
    readonly expectedBaseFingerprint: string;
    readonly promotedFingerprint: string;
    readonly signal?: AbortSignal;
  }): Promise<VtkWorkerSessionInfo> {
    const existing = this.sessions.get(input.objectId);
    if (existing === undefined) {
      throw new GeometryKernelError('UNSUPPORTED_OPERATION', 'WORKER_SESSION_INVALID');
    }
    const parsed = await this.post(
      {
        cmd: 'accept_preview',
        worker_session_id: existing.workerSessionId,
        geometry_fingerprint: input.expectedBaseFingerprint,
        expected_base_fingerprint: input.expectedBaseFingerprint,
        preview_id: input.previewId,
        promoted_fingerprint: input.promotedFingerprint,
        object_id: input.objectId
      },
      input.signal
    );
    if (!parsed.ok) {
      throw new GeometryKernelError(
        'VALIDATION_FAILED',
        String(parsed.error ?? 'accept_preview failed')
      );
    }
    const next: VtkWorkerSessionInfo = {
      workerSessionId: String(parsed.worker_session_id ?? existing.workerSessionId),
      geometryFingerprint: input.promotedFingerprint,
      objectId: input.objectId,
      lastUploadBytes: 0,
      meshResident: true
    };
    this.sessions.set(input.objectId, next);
    // GEO-001G: drop preview cache after promote — no second mesh download.
    this.previewCache.delete(input.previewId);
    for (const [id, entry] of this.previewCache) {
      if (entry.objectId === input.objectId) this.previewCache.delete(id);
    }
    return next;
  }

  public getCachedPreview(previewId: string): PreviewCacheEntry | undefined {
    return this.previewCache.get(previewId);
  }

  public async cancelWorkerPreview(input: {
    readonly objectId: string;
    readonly previewId?: string;
    readonly signal?: AbortSignal;
  }): Promise<void> {
    const existing = this.sessions.get(input.objectId);
    if (existing === undefined) return;
    await this.post(
      {
        cmd: 'cancel_preview',
        worker_session_id: existing.workerSessionId,
        geometry_fingerprint: existing.geometryFingerprint,
        object_id: input.objectId,
        ...(input.previewId !== undefined ? { preview_id: input.previewId } : {})
      },
      input.signal
    ).catch(() => undefined);
    if (input.previewId !== undefined) {
      this.previewCache.delete(input.previewId);
    } else {
      for (const [id, entry] of this.previewCache) {
        if (entry.objectId === input.objectId) this.previewCache.delete(id);
      }
    }
    this.sessions.set(input.objectId, {
      workerSessionId: existing.workerSessionId,
      geometryFingerprint: existing.geometryFingerprint,
      objectId: existing.objectId,
      lastUploadBytes: existing.lastUploadBytes,
      meshResident: existing.meshResident
    });
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
    const cacheKey = JSON.stringify({
      fingerprint: mesh.fingerprint,
      loop,
      normal,
      keepMode,
      role: options.role,
      algorithm: options.algorithm
    });
    const cached = this.trimResultCache.get(cacheKey);
    if (cached !== undefined) {
      this.lastTransport = {
        uploadBytes: 0,
        downloadBytes: 0,
        meshUploaded: false,
        meshResident: true,
        httpRoundTripMs: 0,
        encodeMs: 0
      };
      return {
        ...cached,
        mesh: { ...cached.mesh, revision: options.revision ?? cached.mesh.revision, id: options.id ?? cached.mesh.id }
      };
    }

    // GEO-001F: ensure resident mesh, then trim WITHOUT re-uploading buffers.
    const session = await this.ensureGeometry(mesh, {
      ...(signal !== undefined ? { signal } : {})
    });
    const body: Record<string, unknown> = {
      cmd: 'trim',
      worker_session_id: session.workerSessionId,
      geometry_fingerprint: mesh.fingerprint,
      mesh_fingerprint: mesh.fingerprint,
      object_id: mesh.objectId,
      loop: loop.map((p) => [p.x, p.y, p.z]),
      normal: [...normal],
      inside_out: insideOut,
      keep_mode: keepMode,
      include_mesh: true,
      store_preview: true,
      result_format: 'binary',
      operation_version: 'GEO-001G'
    };
    const postStart = performance.now();
    const parsed = await this.post(body, signal);
    const transferMs = performance.now() - postStart;
    if (!parsed.ok) {
      const code = String(parsed.code ?? '');
      if (code === 'WORKER_SESSION_INVALID') {
        // Documented cold-start recovery: re-init once with full mesh.
        await this.ensureGeometry(mesh, {
          force: true,
          ...(signal !== undefined ? { signal } : {})
        });
        const retrySession = this.sessions.get(mesh.objectId);
        const retry = await this.post(
          {
            ...body,
            worker_session_id: retrySession?.workerSessionId
          },
          signal
        );
        if (!retry.ok) {
          throw new GeometryKernelError(
            'VALIDATION_FAILED',
            String(retry.error ?? 'Trim produced an invalid geometry result.')
          );
        }
        return this.finishTrim(mesh, options, retry, normal, transferMs, true);
      }
      throw new GeometryKernelError(
        'VALIDATION_FAILED',
        String(parsed.error ?? 'Trim produced an invalid geometry result.')
      );
    }
    const result = this.finishTrim(mesh, options, parsed, normal, transferMs, false);
    this.trimResultCache.set(cacheKey, result);
    if (this.trimResultCache.size > 32) {
      const oldest = this.trimResultCache.keys().next().value;
      if (typeof oldest === 'string') this.trimResultCache.delete(oldest);
    }
    return result;
  }

  private finishTrim(
    mesh: TriangleMesh,
    options: TrimMeshOptions,
    parsed: Record<string, unknown>,
    normal: readonly [number, number, number],
    transferMs: number,
    recovered: boolean
  ): TrimMeshResult {
    const transport = parsed.transport as Record<string, unknown> | undefined;
    const uploadBytes = Number(transport?.upload_bytes ?? 0);
    const downloadBytes = Number(
      transport?.download_bytes ?? parsed._download_bytes ?? 0
    );
    const meshUploaded = transport?.mesh_uploaded === true;
    const meshResident = transport?.mesh_resident === true;
    const clientTimings = parsed._client_timings as Record<string, unknown> | undefined;
    const resultFormat =
      transport?.result_format === 'binary' || parsed._binary_decoded === true
        ? 'binary'
        : transport?.result_format === 'json_b64'
          ? 'json_b64'
          : 'json';
    const deliveryMode =
      (clientTimings?.delivery_mode as GeometryDeliveryMode | undefined) ??
      (transport?.delivery_mode as GeometryDeliveryMode | undefined);
    const httpMs =
      clientTimings?.http_ms !== undefined
        ? (clientTimings.http_ms as number | 'unavailable')
        : undefined;
    const ipcMs =
      clientTimings?.ipc_ms !== undefined
        ? (clientTimings.ipc_ms as number | 'unavailable')
        : undefined;
    this.lastTransport = {
      uploadBytes,
      downloadBytes,
      meshUploaded,
      meshResident,
      httpRoundTripMs: transferMs,
      encodeMs: 0,
      resultFormat,
      jsonBytes: Number(transport?.json_geometry_bytes ?? clientTimings?.json_bytes ?? 0),
      binaryBytes: Number(
        transport?.binary_geometry_bytes ??
          parsed._binary_bytes ??
          (resultFormat === 'binary' ? downloadBytes : 0)
      ),
      metaBytes: Number(transport?.meta_bytes ?? parsed._meta_bytes ?? 0),
      decodeMs: Number(clientTimings?.decode_ms ?? parsed._decode_ms ?? 0),
      arrayBufferMs: Number(clientTimings?.array_buffer_ms ?? 0),
      ...(deliveryMode !== undefined ? { deliveryMode } : {}),
      ...(httpMs !== undefined ? { httpMs } : {}),
      ...(ipcMs !== undefined ? { ipcMs } : {})
    };
    const previewId =
      typeof parsed.preview_id === 'string'
        ? parsed.preview_id
        : typeof (parsed._frame_meta as BinaryGeometryFrameMeta | undefined)?.previewId ===
            'string'
          ? String((parsed._frame_meta as BinaryGeometryFrameMeta).previewId)
          : undefined;
    const sessionId =
      typeof parsed.worker_session_id === 'string'
        ? parsed.worker_session_id
        : this.sessions.get(mesh.objectId)?.workerSessionId;
    if (sessionId !== undefined) {
      this.sessions.set(mesh.objectId, {
        workerSessionId: sessionId,
        geometryFingerprint: mesh.fingerprint,
        objectId: mesh.objectId,
        ...(previewId !== undefined ? { previewId } : {}),
        lastUploadBytes: Math.max(
          uploadBytes,
          this.sessions.get(mesh.objectId)?.lastUploadBytes ?? 0
        ),
        meshResident: meshResident || !meshUploaded
      });
    }
    const result = this.toTrimResult(mesh, options, parsed, normal);
    if (previewId !== undefined) {
      this.previewCache.set(previewId, {
        previewId,
        previewFingerprint: result.mesh.fingerprint,
        baseFingerprint: mesh.fingerprint,
        mesh: result.mesh,
        objectId: mesh.objectId
      });
    }
    return {
      ...result,
      warnings: [
        ...result.warnings,
        `timing:httpRoundTrip=${transferMs.toFixed(1)}ms`,
        `meta:uploadBytes=${String(uploadBytes)}`,
        `meta:downloadBytes=${String(downloadBytes)}`,
        `meta:meshUploaded=${String(meshUploaded)}`,
        `meta:meshResident=${String(meshResident)}`,
        `meta:resultFormat=${resultFormat}`,
        `meta:jsonBytes=${String(this.lastTransport.jsonBytes ?? 0)}`,
        `meta:binaryBytes=${String(this.lastTransport.binaryBytes ?? 0)}`,
        `meta:workerSession=${sessionId ?? 'none'}`,
        ...(previewId !== undefined ? [`meta:previewId=${previewId}`] : []),
        ...(recovered ? ['meta:workerColdStartRecovery=true'] : []),
        ...(clientTimings !== undefined
          ? [
              `timing:fetch=${Number(clientTimings.fetch_ms ?? 0).toFixed(1)}ms`,
              `timing:arrayBuffer=${Number(clientTimings.array_buffer_ms ?? 0).toFixed(1)}ms`,
              `timing:decode=${Number(clientTimings.decode_ms ?? 0).toFixed(1)}ms`,
              `timing:jsonParse=${Number(clientTimings.json_parse_ms ?? 0).toFixed(1)}ms`,
              `meta:requestBodyBytes=${String(clientTimings.request_body_bytes ?? 0)}`,
              `meta:deliveryMode=${String(clientTimings.delivery_mode ?? deliveryMode ?? 'unknown')}`,
              `meta:httpMs=${String(clientTimings.http_ms ?? 'unavailable')}`,
              `meta:ipcMs=${String(clientTimings.ipc_ms ?? 'unavailable')}`
            ]
          : [])
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
      result_format: 'binary',
      operation_version: 'GEO-001G'
    };
    const parsed = await this.post(body, signal);
    if (!parsed.ok) {
      throw new GeometryKernelError(
        'VALIDATION_FAILED',
        String(parsed.error ?? 'Base generation could not produce a safe result.')
      );
    }
    let positions: Float32Array;
    let indices: Uint32Array;
    const frame = parsed._decoded_frame as DecodedBinaryGeometryFrame | undefined;
    if (frame !== undefined) {
      positions = frame.positions.slice();
      indices = frame.indices.slice();
    } else if (parsed.positions_b64 && parsed.indices_b64) {
      positions = b64ToFloat32(String(parsed.positions_b64));
      indices = b64ToUint32(String(parsed.indices_b64));
    } else {
      throw new GeometryKernelError(
        'UNSUPPORTED_OPERATION',
        'VTK worker omitted close-base mesh buffers'
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
    let positions: Float32Array;
    let indices: Uint32Array;
    const frame = parsed._decoded_frame as DecodedBinaryGeometryFrame | undefined;
    if (frame !== undefined) {
      // Own compact typed arrays (one memcpy from binary payload — no JSON/base64).
      positions = frame.positions.slice();
      indices = frame.indices.slice();
    } else if (parsed.positions_b64 && parsed.indices_b64) {
      positions = b64ToFloat32(String(parsed.positions_b64));
      indices = b64ToUint32(String(parsed.indices_b64));
    } else {
      throw new GeometryKernelError(
        'UNSUPPORTED_OPERATION',
        'VTK worker omitted trim mesh buffers'
      );
    }
    for (let i = 0; i < positions.length; i += 1) {
      if (!Number.isFinite(positions[i]!)) {
        throw new GeometryKernelError(
          'VALIDATION_FAILED',
          'Trim produced an invalid geometry result.'
        );
      }
    }
    const outFingerprint = fingerprintMesh(positions, indices);

    const outMesh = createMesh({
      id: options.id ?? mesh.id,
      objectId: mesh.objectId,
      role: options.role ?? 'preview',
      revision: options.revision ?? mesh.revision + 1,
      positions,
      indices,
      fingerprint: outFingerprint
    });
    // GEO-002: preview uses Level-1 quality; Accept / working role keeps Level-2.
    const qualityLevel = options.role === 'preview' ? 1 : 2;
    const quality = runGeometryQualityPipeline(outMesh, { level: qualityLevel });
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
      this.deliveryClient ??= await resolveGeometryDeliveryClient();
      const delivery = this.deliveryClient;
      const payload = JSON.stringify(body);
      const delivered = await delivery.post({
        baseUrl: this.baseUrl,
        bodyJson: payload,
        accept: `${CGF_CONTENT_TYPE}, application/json`,
        ...(signal !== undefined ? { signal: controller.signal } : {})
      });
      const buf = delivered.bytes;
      const contentType = delivered.contentType.toLowerCase();
      const fetchMs =
        typeof delivered.httpMs === 'number' ? delivered.httpMs : delivered.roundTripMs;
      const arrayBufferMs = 0;

      if (buf.byteLength >= 4 && isBinaryGeometryFrame(buf)) {
        const decoded = decodeBinaryGeometryFrame(buf, { copy: false });
        const meta = decoded.meta;
        const merged: Record<string, unknown> = {
          ...meta,
          ok: meta.ok !== false,
          _binary_decoded: true,
          _decoded_frame: decoded,
          _frame_meta: meta,
          _download_bytes: buf.byteLength,
          _binary_bytes: decoded.binaryBytes,
          _meta_bytes: decoded.metaBytes,
          _decode_ms: decoded.decodeMs,
          preview_id: meta.previewId ?? meta.preview_id,
          preview_geometry_fingerprint:
            meta.previewGeometryFingerprint ?? meta.preview_geometry_fingerprint,
          base_geometry_fingerprint:
            meta.baseFingerprint ?? meta.base_geometry_fingerprint,
          worker_session_id: meta.worker_session_id ?? meta.workerSessionId,
          transport: {
            ...(typeof meta.transport === 'object' && meta.transport !== null
              ? (meta.transport as Record<string, unknown>)
              : {}),
            result_format: 'binary',
            download_bytes: buf.byteLength,
            binary_geometry_bytes: decoded.binaryBytes,
            json_geometry_bytes: 0,
            meta_bytes: decoded.metaBytes,
            delivery_mode: delivered.deliveryMode
          },
          timings_ms: meta.timings_ms,
          _client_timings: {
            request_body_bytes: payload.length,
            fetch_ms: fetchMs,
            array_buffer_ms: arrayBufferMs,
            decode_ms: decoded.decodeMs,
            json_parse_ms: 0,
            json_bytes: 0,
            delivery_mode: delivered.deliveryMode,
            round_trip_ms: delivered.roundTripMs,
            http_ms: delivered.httpMs,
            ipc_ms: delivered.ipcMs
          }
        };
        if (delivered.status >= 400 && merged.ok !== true) {
          throw new GeometryKernelError(
            'UNSUPPORTED_OPERATION',
            String(merged.error ?? `VTK worker HTTP ${String(delivered.status)}`)
          );
        }
        return merged;
      }

      // JSON path (accept/cancel/init/errors, or HTTP mis-labeled body).
      const parseStart = performance.now();
      const text = new TextDecoder().decode(buf);
      const json = JSON.parse(text) as Record<string, unknown>;
      const parseMs = performance.now() - parseStart;
      (json as { _client_timings?: Record<string, unknown> })._client_timings = {
        request_body_bytes: payload.length,
        fetch_ms: fetchMs,
        array_buffer_ms: arrayBufferMs,
        json_parse_ms: parseMs,
        json_bytes: buf.byteLength,
        delivery_mode: delivered.deliveryMode,
        round_trip_ms: delivered.roundTripMs,
        http_ms: delivered.httpMs,
        ipc_ms: delivered.ipcMs
      };
      if (contentType.includes('geometry-frame')) {
        // Should have been binary; surface clearly.
        throw new GeometryKernelError(
          'BINARY_GEOMETRY_INVALID',
          'Expected CGF1 frame but received non-frame payload'
        );
      }
      if (delivered.status >= 400 && json.ok !== true) {
        throw new GeometryKernelError(
          'UNSUPPORTED_OPERATION',
          String(json.error ?? `VTK worker HTTP ${String(delivered.status)}`)
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
