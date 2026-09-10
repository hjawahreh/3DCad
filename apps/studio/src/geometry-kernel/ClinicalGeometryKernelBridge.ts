/**
 * ClinicalGeometryKernelBridge — studio-owned KernelBridge with real mesh ops.
 * Fingerprints use `geo:` prefix (never `mock:`).
 */

import type { ProgressReporter } from '@cad-studio/platform-runtime';
import {
  CapabilityNegotiator,
  asOpaqueGeometryHandle,
  kernelFailure,
  kernelSuccess,
  type KernelBridge,
  type KernelInvokeRequest,
  type KernelOperationResult,
  type KernelResult,
  type OpaqueGeometryHandle
} from '@cad-studio/kernel-bridge';
import { GeometryCache } from './cache/GeometryCache.js';
import { MeshRegistry } from './mesh/MeshRegistry.js';
import { meshStats, type TriangleMesh } from './mesh/TriangleMesh.js';
import { NativeReferenceBackend } from './adapters/GeometryBackend.js';
import { GeometryKernelError, isGeometryKernelError } from './errors.js';
import type { TrimPoint2D } from './ops/trimMesh.js';
import type { CloseBaseOrientation, CloseBaseStrategy } from './ops/closeBaseMesh.js';

const BACKEND = 'clinical-reference-v1';

const reportProgress = (
  report: ProgressReporter,
  completed: number,
  total: number,
  message: string
): void => {
  report({ completed, total, message });
};

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const asBool = (value: unknown): boolean => value === true;

const parseBoundary = (payload: Readonly<Record<string, unknown>>): TrimPoint2D[] => {
  const raw = payload.boundary ?? payload.stroke;
  if (!Array.isArray(raw)) {
    return [];
  }
  const points: TrimPoint2D[] = [];
  for (const p of raw) {
    if (Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number') {
      points.push({ x: p[0], y: p[1] });
      continue;
    }
    if (p !== null && typeof p === 'object') {
      const o = p as Record<string, unknown>;
      if (typeof o.x === 'number' && typeof o.y === 'number') {
        points.push({ x: o.x, y: o.y });
      }
    }
  }
  return points;
};

const parseViewport = (
  payload: Readonly<Record<string, unknown>>
): { readonly width: number; readonly height: number } | undefined => {
  const raw = payload.viewport;
  if (raw === null || typeof raw !== 'object') {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  if (
    typeof o.width === 'number' &&
    Number.isFinite(o.width) &&
    o.width > 0 &&
    typeof o.height === 'number' &&
    Number.isFinite(o.height) &&
    o.height > 0
  ) {
    return { width: o.width, height: o.height };
  }
  return undefined;
};

const parseOrientation = (value: unknown): CloseBaseOrientation =>
  value === 'xz' || value === 'yz' ? value : 'xy';

const parsePlaneNormal = (
  value: unknown
): readonly [number, number, number] | undefined => {
  if (!Array.isArray(value) || value.length < 3) {
    return undefined;
  }
  if (
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    typeof value[2] === 'number'
  ) {
    return [value[0], value[1], value[2]];
  }
  return undefined;
};

const peakMemoryEstimate = (mesh: TriangleMesh): number =>
  mesh.positions.byteLength + mesh.indices.byteLength + (mesh.normals?.byteLength ?? 0);

export interface MeshStatsSnapshot {
  readonly objectId: string;
  readonly role: string;
  readonly revision: number;
  readonly fingerprint: string;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly handle: number;
}

/** Helper for managers — read current mesh stats from the registry. */
export const readMeshStatsForManagers = (
  registry: MeshRegistry,
  objectId: string,
  role: 'source' | 'working' | 'preview' | 'display' = 'working'
): MeshStatsSnapshot | undefined => {
  const mesh = registry.getByObjectId(objectId, role);
  if (mesh === undefined) {
    return undefined;
  }
  const stats = meshStats(mesh);
  return {
    objectId,
    role: stats.role,
    revision: stats.revision,
    fingerprint: stats.fingerprint,
    vertexCount: stats.vertexCount,
    triangleCount: stats.triangleCount,
    handle: mesh.id
  };
};

export class ClinicalGeometryKernelBridge implements KernelBridge {
  public readonly capabilities: CapabilityNegotiator;
  public calls: KernelInvokeRequest[] = [];
  public failNext: KernelResult<KernelOperationResult> | undefined;
  public readonly registry: MeshRegistry;
  public readonly cache: GeometryCache;
  public readonly backend: NativeReferenceBackend;

  public constructor(
    capabilities: CapabilityNegotiator = CapabilityNegotiator.mockFull(),
    registry: MeshRegistry = new MeshRegistry(),
    cache: GeometryCache = new GeometryCache()
  ) {
    this.capabilities = capabilities;
    this.registry = registry;
    this.cache = cache;
    this.backend = new NativeReferenceBackend();
  }

  public async invoke(
    request: KernelInvokeRequest,
    signal: AbortSignal,
    report: ProgressReporter
  ): Promise<KernelResult<KernelOperationResult>> {
    this.calls.push(request);
    const started = performance.now();
    const diagnostics: string[] = [];
    const warnings: string[] = [];

    const required = this.capabilities.require(request.capability);
    if (!required.ok) {
      return required;
    }
    if (signal.aborted) {
      return kernelFailure('cancelled', 'Clinical geometry kernel cancelled');
    }
    if (this.failNext !== undefined) {
      const next = this.failNext;
      this.failNext = undefined;
      return next;
    }

    try {
      reportProgress(report, 0, 6, 'Preparing mesh…');
      const objectId =
        asString(request.payload.targetObjectId) ??
        asString(request.payload.objectId) ??
        `obj-${String(request.sessionId)}`;
      const preview = asBool(request.payload.preview);
      const source = this.registry.ensureSourceMesh(objectId);
      const working =
        this.registry.getByObjectId(objectId, 'working') ??
        this.registry.cloneForMutation(objectId, 'source')!;
      void source;

      if (signal.aborted) {
        return kernelFailure('cancelled', 'Clinical geometry kernel cancelled');
      }

      reportProgress(report, 1, 6, 'Analyzing topology…');
      const preprocessStart = performance.now();
      let inputMesh =
        this.registry.cloneForMutation(objectId, 'working') ??
        this.registry.cloneForMutation(objectId, 'source')!;
      const topology = this.backend.validate(inputMesh);
      this.cache.putTopology(objectId, inputMesh.revision, inputMesh.fingerprint, topology);
      const preprocessingMs = performance.now() - preprocessStart;
      diagnostics.push(...topology.codes.map((c) => `quality:${c}`));
      warnings.push(...topology.warnings);

      if (signal.aborted) {
        return kernelFailure('cancelled', 'Clinical geometry kernel cancelled');
      }

      reportProgress(report, 2, 6, 'Building spatial index…');
      const spatialStart = performance.now();
      let spatialMs = 0;
      try {
        const cached = this.cache.getSpatial(
          objectId,
          inputMesh.revision,
          inputMesh.fingerprint
        );
        const spatial = cached ?? this.backend.buildSpatialIndex(inputMesh);
        if (cached === undefined) {
          this.cache.putSpatial(objectId, inputMesh.revision, inputMesh.fingerprint, spatial);
        }
        spatialMs = performance.now() - spatialStart;
        diagnostics.push(`meta:spatialTriangles=${String(spatial.triangleCount)}`);
      } catch (err) {
        spatialMs = performance.now() - spatialStart;
        warnings.push(
          err instanceof Error ? err.message : 'Spatial index build failed (non-fatal)'
        );
      }

      if (signal.aborted) {
        return kernelFailure('cancelled', 'Clinical geometry kernel cancelled');
      }

      reportProgress(report, 3, 6, 'Generating preview…');
      const opStart = performance.now();
      let resultMesh: TriangleMesh = inputMesh;
      let algorithm = `${request.capability}.${request.operation}`;
      let validationCodes: string[] = [];
      let validationOk = true;

      const cap = request.capability;
      const op = request.operation;
      const strategy = asString(request.payload.strategy);

      if (
        (cap === 'boolean' && (op === 'subtract' || op === 'trim')) ||
        op === 'trim' ||
        (cap === 'boolean' && Array.isArray(request.payload.boundary))
      ) {
        algorithm = 'trim.centroid-polygon';
        const boundary = parseBoundary(request.payload);
        if (boundary.length < 3) {
          return kernelFailure('validation', 'Trim requires a boundary with ≥ 3 points');
        }
        const viewport = parseViewport(request.payload);
        const trimmed = this.backend.trim(inputMesh, {
          boundary,
          role: preview ? 'preview' : 'working',
          revision: request.inputRevision + 1,
          id: this.registry.allocateHandle() as number,
          ...(viewport === undefined ? {} : { viewport })
        });
        resultMesh = trimmed.mesh;
        warnings.push(...trimmed.warnings);
        validationOk = trimmed.quality.ok;
        validationCodes = [...trimmed.quality.codes];
      } else if (
        (cap === 'offset' && op === 'uniform') ||
        (strategy === 'plane' && (op === 'uniform' || op === 'close-base'))
      ) {
        algorithm = 'closeBase.plane';
        const planeNormal = parsePlaneNormal(request.payload.planeNormal);
        const closed = this.backend.closeBase(inputMesh, {
          strategy: 'plane',
          height: asNumber(request.payload.height, 2),
          thickness: asNumber(request.payload.thickness, 1.5),
          margin: asNumber(request.payload.margin, 0.2),
          orientation: parseOrientation(request.payload.orientation),
          ...(planeNormal !== undefined ? { planeNormal } : {}),
          role: preview ? 'preview' : 'working',
          revision: request.inputRevision + 1,
          id: this.registry.allocateHandle() as number
        });
        resultMesh = closed.mesh;
        warnings.push(...closed.warnings);
        validationOk = closed.quality.ok;
        validationCodes = [...closed.quality.codes];
      } else if (
        (cap === 'repair' && (op === 'fill-holes' || op === 'heal')) ||
        strategy === 'surface'
      ) {
        algorithm = 'closeBase.surface';
        const planeNormal = parsePlaneNormal(request.payload.planeNormal);
        const closed = this.backend.closeBase(inputMesh, {
          strategy: 'surface' as CloseBaseStrategy,
          height: asNumber(request.payload.height, 2),
          thickness: asNumber(request.payload.thickness, 1.5),
          margin: asNumber(request.payload.margin, 0.2),
          orientation: parseOrientation(request.payload.orientation),
          ...(planeNormal !== undefined ? { planeNormal } : {}),
          role: preview ? 'preview' : 'working',
          revision: request.inputRevision + 1,
          id: this.registry.allocateHandle() as number
        });
        resultMesh = closed.mesh;
        warnings.push(...closed.warnings);
        validationOk = closed.quality.ok;
        validationCodes = [...closed.quality.codes];
      } else if (cap === 'validation') {
        algorithm = `validation.${op}`;
        const reportQ = this.backend.validate(inputMesh);
        resultMesh = inputMesh;
        validationOk = reportQ.ok;
        validationCodes = [...reportQ.codes];
        warnings.push(...reportQ.warnings);
      } else if (cap === 'topology') {
        algorithm = `topology.${op}`;
        const reportQ = this.backend.validate(inputMesh);
        resultMesh = inputMesh;
        diagnostics.push(
          `meta:boundaryEdges=${String(reportQ.stats.boundaryEdges)}`,
          `meta:components=${String(reportQ.stats.components)}`
        );
        validationOk = reportQ.ok;
        validationCodes = [...reportQ.codes];
        warnings.push(...reportQ.warnings);
        if (op === 'components') {
          diagnostics.push(`topology:components=${String(reportQ.stats.components)}`);
        }
        if (op === 'boundaries') {
          diagnostics.push(`topology:boundaries=${String(reportQ.stats.boundaryEdges)}`);
        }
      } else if (cap === 'remesh') {
        algorithm = `remesh.${op}`;
        resultMesh = inputMesh;
        warnings.push(
          'Remesh: boundary-aware local remesh not applied; full-model remesh skipped (CLN-008)'
        );
        validationOk = true;
      } else {
        // Passthrough / unsupported family ops — return validated working mesh
        algorithm = `${cap}.${op}`;
        warnings.push(`Operation ${cap}/${op} routed as identity on working mesh`);
        const reportQ = this.backend.validate(inputMesh);
        validationOk = reportQ.ok;
        validationCodes = [...reportQ.codes];
      }

      const operationMs = performance.now() - opStart;

      if (signal.aborted) {
        this.registry.cancelPreviews(objectId);
        return kernelFailure('cancelled', 'Clinical geometry kernel cancelled');
      }

      reportProgress(report, 4, 6, 'Validating geometry…');
      const valStart = performance.now();
      const finalQuality =
        resultMesh === inputMesh
          ? topology
          : this.backend.validate(resultMesh);
      if (resultMesh !== inputMesh) {
        validationOk = finalQuality.ok && validationOk;
        validationCodes = [...new Set([...validationCodes, ...finalQuality.codes])];
        warnings.push(...finalQuality.warnings);
      }
      const validationMs = performance.now() - valStart;

      reportProgress(report, 5, 6, 'Committing…');
      const revision = request.inputRevision + 1;
      let handle: OpaqueGeometryHandle;

      if (preview) {
        const previewMesh = this.registry.setPreview(objectId, {
          ...resultMesh,
          role: 'preview',
          revision
        });
        this.cache.putPreview(objectId, previewMesh);
        handle = asOpaqueGeometryHandle(previewMesh.id);
        diagnostics.push('mode:preview');
      } else {
        this.cache.assertCommitFresh(objectId, request.inputRevision, inputMesh.fingerprint);
        const committed = this.registry.commitWorking(objectId, {
          ...resultMesh,
          role: 'working',
          revision
        });
        this.cache.ensureEntry(objectId, committed.revision, committed.fingerprint);
        this.cache.putBounds(
          objectId,
          committed.revision,
          committed.fingerprint,
          this.cache.boundsFromMesh(committed)
        );
        this.registry.clearPreview(objectId);
        this.cache.clearPreview(objectId);
        handle = asOpaqueGeometryHandle(committed.id);
        resultMesh = committed;
        diagnostics.push('mode:commit');
      }

      // Display prep (non-authoritative)
      try {
        const display = this.backend.prepareDisplay(resultMesh);
        this.registry.setDisplay(objectId, display.mesh);
        this.cache.putDisplay(
          objectId,
          resultMesh.revision,
          resultMesh.fingerprint,
          display.mesh
        );
        warnings.push(...display.warnings);
      } catch {
        warnings.push('Display mesh prep skipped');
      }

      const stats = meshStats(resultMesh);
      diagnostics.push(
        `meta:vertexCount=${String(stats.vertexCount)}`,
        `meta:faceCount=${String(stats.triangleCount)}`,
        `meta:geometryFingerprint=${resultMesh.fingerprint}`,
        `meta:backend=${BACKEND}`,
        `meta:algorithm=${algorithm}`
      );

      reportProgress(report, 6, 6, 'Committing…');
      const timingMs = performance.now() - started;
      void working;

      return kernelSuccess({
        revision,
        fingerprint: resultMesh.fingerprint.startsWith('geo:')
          ? resultMesh.fingerprint
          : `geo:${resultMesh.fingerprint}`,
        diagnostics,
        timingMs,
        warnings: [...new Set(warnings)],
        geometryHandles: [handle],
        metrics: {
          vertexCount: stats.vertexCount,
          triangleCount: stats.triangleCount,
          faceCount: stats.triangleCount,
          preprocessingMs,
          validationMs,
          operationMs,
          spatialIndexMs: spatialMs,
          peakMemoryEstimate: peakMemoryEstimate(resultMesh),
          invokeCount: this.calls.length
        },
        validation: {
          ok: validationOk,
          codes: validationCodes
        }
      });
    } catch (err) {
      if (isGeometryKernelError(err)) {
        const code =
          err.code === 'CANCELLED'
            ? 'cancelled'
            : err.code === 'UNSUPPORTED_OPERATION'
              ? 'unsupported'
              : err.code === 'VALIDATION_FAILED' ||
                  err.code === 'BOUNDARY_INVALID' ||
                  err.code === 'INPUT_INVALID' ||
                  err.code === 'TOPOLOGY_INVALID'
                ? 'validation'
                : 'unexpected';
        return kernelFailure(code, err.message, err);
      }
      if (err instanceof GeometryKernelError) {
        return kernelFailure('unexpected', err.message, err);
      }
      const message = err instanceof Error ? err.message : 'Clinical geometry kernel failed';
      return kernelFailure('unexpected', message, err);
    }
  }
}
