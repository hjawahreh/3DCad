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
import { NativeReferenceBackend, type GeometryBackend } from './adapters/GeometryBackend.js';
import { runCloseBase, runTrim } from './adapters/AsyncGeometryBackend.js';
import { GeometryKernelError, isGeometryKernelError } from './errors.js';
import type { TrimPoint2D, TrimPoint3D, TrimKeepMode } from './ops/trimMesh.js';
import { normalizeTrimKeepMode } from './ops/trimMesh.js';
import type { CloseBaseOrientation, CloseBaseStrategy } from './ops/closeBaseMesh.js';
import {
  ClinicalGeometryEngine,
  clinicalSurfacePathMessage,
  closeSurfacePath,
  createSurfacePath,
  extractBoundaryLoops,
  validateSurfacePath
} from './engine/index.js';

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

const parseLoop3d = (payload: Readonly<Record<string, unknown>>): TrimPoint3D[] | undefined => {
  const raw = payload.loop3d;
  if (!Array.isArray(raw) || raw.length < 3) return undefined;
  const points: TrimPoint3D[] = [];
  for (const p of raw) {
    if (Array.isArray(p) && p.length >= 3) {
      if (
        typeof p[0] === 'number' &&
        typeof p[1] === 'number' &&
        typeof p[2] === 'number' &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]) &&
        Number.isFinite(p[2])
      ) {
        points.push({ x: p[0], y: p[1], z: p[2] });
      }
      continue;
    }
    if (p !== null && typeof p === 'object') {
      const o = p as Record<string, unknown>;
      if (
        typeof o.x === 'number' &&
        typeof o.y === 'number' &&
        typeof o.z === 'number' &&
        Number.isFinite(o.x) &&
        Number.isFinite(o.y) &&
        Number.isFinite(o.z)
      ) {
        points.push({ x: o.x, y: o.y, z: o.z });
      }
    }
  }
  return points.length >= 3 ? points : undefined;
};

const parseKeepMode = (value: unknown): TrimKeepMode => {
  if (
    value === 'KEEP_INSIDE' ||
    value === 'KEEP_OUTSIDE' ||
    value === 'keep-interior' ||
    value === 'remove-interior'
  ) {
    return value;
  }
  return 'KEEP_OUTSIDE';
};

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
  public readonly backend: GeometryBackend;
  /** GEO-001 clinical geometry engine façade (analyze / path / quality). */
  public readonly geometryEngine: ClinicalGeometryEngine;

  public constructor(
    capabilities: CapabilityNegotiator = CapabilityNegotiator.mockFull(),
    registry: MeshRegistry = new MeshRegistry(),
    cache: GeometryCache = new GeometryCache(),
    backend: GeometryBackend = new NativeReferenceBackend()
  ) {
    this.capabilities = capabilities;
    this.registry = registry;
    this.cache = cache;
    this.backend = backend;
    this.geometryEngine = new ClinicalGeometryEngine({ backend });
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
      const cachedTopology = this.cache.getTopology(
        objectId,
        inputMesh.revision,
        inputMesh.fingerprint
      );
      const topology =
        cachedTopology ?? this.backend.validate(inputMesh);
      if (cachedTopology === undefined) {
        this.cache.putTopology(objectId, inputMesh.revision, inputMesh.fingerprint, topology);
      } else {
        diagnostics.push('meta:topologyCache=hit');
      }
      const preprocessingMs = performance.now() - preprocessStart;
      diagnostics.push(...topology.codes.map((c) => `quality:${c}`));
      warnings.push(...topology.warnings);
      if (cachedTopology !== undefined) {
        warnings.push('timing:topology=cache-hit');
      } else {
        warnings.push(`timing:topology=${preprocessingMs.toFixed(1)}ms`);
      }

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
      let removedTriangles = 0;
      let addedTriangles = 0;
      const inputFingerprint = inputMesh.fingerprint;
      const inputFaceCount = Math.floor(inputMesh.indices.length / 3);
      const inputVertexCount = Math.floor(inputMesh.positions.length / 3);

      const closeBaseOpts = (
        closeStrategy: CloseBaseStrategy
      ): Parameters<NativeReferenceBackend['closeBase']>[1] => {
        const planeNormal = parsePlaneNormal(request.payload.planeNormal);
        return {
          strategy: closeStrategy,
          height: asNumber(request.payload.height, 2),
          thickness: asNumber(request.payload.thickness, 1.5),
          margin: asNumber(request.payload.margin, 0.2),
          orientation: parseOrientation(request.payload.orientation),
          ...(planeNormal !== undefined ? { planeNormal } : {}),
          preferRequestedOrientation: asBool(request.payload.preferRequestedOrientation),
          role: preview ? 'preview' : 'working',
          revision: request.inputRevision + 1,
          id: this.registry.allocateHandle() as number,
          shouldAbort: () => signal.aborted,
          maxElapsedMs: asNumber(request.payload.maxElapsedMs, 8_000)
        };
      };

      if (
        (cap === 'boolean' && (op === 'subtract' || op === 'trim')) ||
        op === 'trim' ||
        (cap === 'boolean' && Array.isArray(request.payload.boundary))
      ) {
        const boundary = parseBoundary(request.payload);
        if (boundary.length < 3) {
          return kernelFailure('validation', 'Trim requires a boundary with ≥ 3 points');
        }
        const viewport = parseViewport(request.payload);
        const loop3d = parseLoop3d(request.payload);
        const loopNormal = parsePlaneNormal(request.payload.loopNormal);
        const keepMode = normalizeTrimKeepMode(parseKeepMode(request.payload.keepMode));
        const algorithmRaw = asString(request.payload.algorithm);
        const algorithmChoice =
          algorithmRaw === 'vtk-implicit-loop' ||
          algorithmRaw === 'vtk-select-polydata' ||
          algorithmRaw === 'exact-edge-clip' ||
          algorithmRaw === 'centroid-polygon'
            ? algorithmRaw
            : loop3d !== undefined
              ? 'vtk-select-polydata'
              : 'exact-edge-clip';

        // GEO-001E: loop3d from Trim UI is already an authoritative, thinned SurfacePath.
        // Re-running geodesic reconstruct:'gaps' here re-paid ~seconds–minutes on dense dental
        // meshes (GEO-001D ~101s). Validate without reconstructing.
        if (loop3d !== undefined) {
          const pathStart = performance.now();
          const built = createSurfacePath(
            inputMesh,
            loop3d.map((p) => ({ point: [p.x, p.y, p.z] as const })),
            { closed: false, reconstruct: 'never', maxProjectDistanceMm: 12 }
          );
          if (!built.ok) {
            return kernelFailure(
              'validation',
              clinicalSurfacePathMessage(built.code, built.message)
            );
          }
          const closedPath = closeSurfacePath(inputMesh, built.path, {
            maxJumpMm: 40,
            maxProjectDistanceMm: 12
          });
          if (!closedPath.ok) {
            return kernelFailure(
              'validation',
              clinicalSurfacePathMessage(closedPath.code, closedPath.message)
            );
          }
          const pathOk = validateSurfacePath(inputMesh, closedPath.path, {
            maxSpacingMm: 40,
            minLengthMm: 0.25
          });
          if (!pathOk.ok) {
            return kernelFailure(
              'validation',
              clinicalSurfacePathMessage(pathOk.code, pathOk.message)
            );
          }
          warnings.push(`timing:surfacePathValidate=${(performance.now() - pathStart).toFixed(1)}ms`);
          diagnostics.push(
            `meta:geo001=surface-path`,
            `meta:surfacePathSamples=${String(closedPath.path.samples.length)}`,
            `meta:surfacePathLength=${closedPath.path.length.toFixed(3)}`,
            `meta:surfacePathReconstruct=never`
          );
        }

        // Preview: skip full analyzeMesh before clip (FAST PREVIEW). Accept path validates below.
        if (!preview) {
          const qualityBefore = this.geometryEngine.analyzeMesh(inputMesh);
          diagnostics.push(
            `meta:meshGate=${qualityBefore.gate}`,
            `meta:components=${String(qualityBefore.connectedComponentCount)}`,
            `meta:boundaryEdges=${String(qualityBefore.boundaryEdgeCount)}`
          );
        } else {
          diagnostics.push('meta:meshGate=preview-deferred');
        }

        const trimmed = await runTrim(
          this.backend,
          inputMesh,
          {
            boundary,
            role: preview ? 'preview' : 'working',
            revision: request.inputRevision + 1,
            id: this.registry.allocateHandle() as number,
            algorithm: algorithmChoice,
            keepMode,
            ...(viewport === undefined ? {} : { viewport }),
            ...(loop3d === undefined ? {} : { loop3d }),
            ...(loopNormal === undefined ? {} : { loopNormal })
          },
          signal
        );
        algorithm = `trim.${trimmed.algorithm}`;
        resultMesh = trimmed.mesh;
        removedTriangles = trimmed.removedTriangles;
        warnings.push(...trimmed.warnings);
        // GEO-001E: never treat identity as success.
        if (
          resultMesh.fingerprint === inputFingerprint ||
          removedTriangles <= 0
        ) {
          return kernelFailure(
            'validation',
            'Trim produced no geometry change. Selected region must remove real dental material.'
          );
        }
        const inputTris = inputFaceCount;
        const outputTris = Math.floor(resultMesh.indices.length / 3);
        const keepTris = Math.max(0, outputTris);
        // Fast gate here; Accept path runs full backend.validate below when !preview.
        const qualityAfter = this.geometryEngine.analyzeMesh(resultMesh);
        validationOk = trimmed.quality.ok && qualityAfter.gate !== 'FAIL';
        validationCodes = [
          ...trimmed.quality.codes,
          ...(qualityAfter.gate === 'FAIL' ? (['VALIDATION_FAILED'] as const) : [])
        ];
        diagnostics.push(
          `meta:removedTriangles=${String(trimmed.removedTriangles)}`,
          `meta:selectedRegionTriangles=${String(trimmed.removedTriangles)}`,
          `meta:keepRegionTriangles=${String(keepTris)}`,
          `meta:removedRegionTriangles=${String(trimmed.removedTriangles)}`,
          `meta:inputFingerprint=${inputFingerprint}`,
          `meta:outputFingerprint=${resultMesh.fingerprint}`,
          `meta:previewFingerprint=${resultMesh.fingerprint}`,
          `meta:keepMode=${keepMode}`,
          `meta:selectedRegion=remove-interior`,
          `meta:keepRegion=exterior`,
          `meta:removedRegion=interior`,
          `meta:projectionAxes=${String(trimmed.projectionAxes.u)},${String(trimmed.projectionAxes.v)},${String(trimmed.projectionAxes.n)}`,
          `meta:outputGate=${qualityAfter.gate}`,
          `meta:inputTriangleCount=${String(inputTris)}`,
          `meta:outputTriangleCount=${String(outputTris)}`,
          ...(loop3d !== undefined ? [`meta:loop3dCount=${String(loop3d.length)}`] : [])
        );
      } else if (
        (cap === 'offset' && op === 'uniform' && strategy === 'offset') ||
        strategy === 'offset'
      ) {
        algorithm = 'closeBase.offset';
        const boundaries = extractBoundaryLoops(inputMesh);
        diagnostics.push(
          `meta:geo001=boundary-extract`,
          `meta:boundaryCandidates=${String(boundaries.length)}`,
          ...(boundaries[0] !== undefined
            ? [
                `meta:primaryBoundaryPerimeter=${boundaries[0].perimeter.toFixed(3)}`,
                `meta:primaryBoundaryScore=${boundaries[0].score.toFixed(3)}`
              ]
            : [])
        );
        if (boundaries.length === 0) {
          return kernelFailure('validation', 'No open boundary loops found for base generation');
        }
        const closed = await runCloseBase(this.backend, inputMesh, closeBaseOpts('offset'), signal);
        resultMesh = closed.mesh;
        addedTriangles = closed.addedTriangles;
        warnings.push(...closed.warnings);
        validationOk =
          closed.quality.ok &&
          (closed.baseQuality === undefined || closed.baseQuality.blockingFailures.length === 0);
        validationCodes = [...closed.quality.codes];
        diagnostics.push(
          `meta:addedTriangles=${String(closed.addedTriangles)}`,
          `meta:extrudeAxis=${String(closed.extrudeAxis)}`,
          `meta:closeBaseElapsedMs=${String(closed.elapsedMs.toFixed(1))}`,
          `meta:geo001d=clinical-base-v2`,
          ...(closed.baseQuality !== undefined
            ? [
                `meta:baseWatertight=${String(closed.baseQuality.watertight)}`,
                `meta:baseSlab=${String(closed.baseQuality.slabDetection.detected)}`,
                `meta:baseBridges=${String(closed.baseQuality.diagonalBridgeDetection.suspiciousFaceCount)}`,
                `meta:baseBoundaryMatch=${String(closed.baseQuality.boundaryMatch.passed)}`
              ]
            : [])
        );
        if (closed.baseQuality !== undefined && closed.baseQuality.blockingFailures.length > 0) {
          return kernelFailure(
            'validation',
            `Base quality gate failed: ${closed.baseQuality.blockingFailures.join(', ')}`
          );
        }
      } else if (
        (cap === 'offset' && op === 'uniform') ||
        (strategy === 'plane' && (op === 'uniform' || op === 'close-base'))
      ) {
        algorithm = 'closeBase.plane';
        const closed = await runCloseBase(this.backend, inputMesh, closeBaseOpts('plane'), signal);
        resultMesh = closed.mesh;
        addedTriangles = closed.addedTriangles;
        warnings.push(...closed.warnings);
        validationOk =
          closed.quality.ok &&
          (closed.baseQuality === undefined || closed.baseQuality.blockingFailures.length === 0);
        validationCodes = [...closed.quality.codes];
        diagnostics.push(
          `meta:addedTriangles=${String(closed.addedTriangles)}`,
          `meta:extrudeAxis=${String(closed.extrudeAxis)}`,
          `meta:closeBaseElapsedMs=${String(closed.elapsedMs.toFixed(1))}`,
          `meta:geo001d=clinical-base-v2`,
          ...(closed.baseQuality !== undefined
            ? [
                `meta:baseWatertight=${String(closed.baseQuality.watertight)}`,
                `meta:baseSlab=${String(closed.baseQuality.slabDetection.detected)}`,
                `meta:baseBridges=${String(closed.baseQuality.diagonalBridgeDetection.suspiciousFaceCount)}`,
                `meta:baseBoundaryMatch=${String(closed.baseQuality.boundaryMatch.passed)}`
              ]
            : [])
        );
        if (closed.baseQuality !== undefined && closed.baseQuality.blockingFailures.length > 0) {
          return kernelFailure(
            'validation',
            `Base quality gate failed: ${closed.baseQuality.blockingFailures.join(', ')}`
          );
        }
      } else if (
        (cap === 'repair' && (op === 'fill-holes' || op === 'heal')) ||
        strategy === 'surface'
      ) {
        algorithm = 'closeBase.surface';
        const closed = await runCloseBase(this.backend, inputMesh, closeBaseOpts('surface'), signal);
        resultMesh = closed.mesh;
        addedTriangles = closed.addedTriangles;
        warnings.push(...closed.warnings);
        validationOk =
          closed.quality.ok &&
          (closed.baseQuality === undefined || closed.baseQuality.blockingFailures.length === 0);
        validationCodes = [...closed.quality.codes];
        diagnostics.push(
          `meta:addedTriangles=${String(closed.addedTriangles)}`,
          `meta:extrudeAxis=${String(closed.extrudeAxis)}`,
          `meta:closeBaseElapsedMs=${String(closed.elapsedMs.toFixed(1))}`,
          `meta:geo001d=clinical-base-v2`,
          ...(closed.baseQuality !== undefined
            ? [
                `meta:baseWatertight=${String(closed.baseQuality.watertight)}`,
                `meta:baseSlab=${String(closed.baseQuality.slabDetection.detected)}`,
                `meta:baseBridges=${String(closed.baseQuality.diagonalBridgeDetection.suspiciousFaceCount)}`,
                `meta:baseBoundaryMatch=${String(closed.baseQuality.boundaryMatch.passed)}`
              ]
            : [])
        );
        if (closed.baseQuality !== undefined && closed.baseQuality.blockingFailures.length > 0) {
          return kernelFailure(
            'validation',
            `Base quality gate failed: ${closed.baseQuality.blockingFailures.join(', ')}`
          );
        }
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
      // GEO-001E: preview uses analyzeMesh only; Accept runs full quality pipeline.
      if (resultMesh !== inputMesh) {
        if (preview) {
          const quick = this.geometryEngine.analyzeMesh(resultMesh);
          validationOk = quick.gate !== 'FAIL' && validationOk;
          if (quick.gate === 'FAIL') {
            validationCodes = [...new Set([...validationCodes, 'VALIDATION_FAILED'])];
          }
          warnings.push(...quick.warnings);
        } else {
          const finalQuality = this.backend.validate(resultMesh);
          validationOk = finalQuality.ok && validationOk;
          validationCodes = [...new Set([...validationCodes, ...finalQuality.codes])];
          warnings.push(...finalQuality.warnings);
        }
      }
      const validationMs = performance.now() - valStart;
      warnings.push(`timing:validation=${validationMs.toFixed(1)}ms`);
      warnings.push(`timing:operation=${operationMs.toFixed(1)}ms`);
      warnings.push(`timing:spatial=${spatialMs.toFixed(1)}ms`);
      warnings.push(`timing:preprocessing=${preprocessingMs.toFixed(1)}ms`);
      warnings.push(`timing:total=${(performance.now() - started).toFixed(1)}ms`);

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

      // Display prep (non-authoritative) — must match committed revision or be cleared.
      try {
        const display = this.backend.prepareDisplay(resultMesh);
        this.registry.setDisplay(objectId, {
          ...display.mesh,
          revision: resultMesh.revision
        });
        this.cache.putDisplay(
          objectId,
          resultMesh.revision,
          resultMesh.fingerprint,
          display.mesh
        );
        warnings.push(...display.warnings);
      } catch {
        this.registry.clearDisplay(objectId);
        warnings.push('Display mesh prep skipped; viewport will use working mesh');
      }

      const stats = meshStats(resultMesh);
      diagnostics.push(
        `meta:vertexCount=${String(stats.vertexCount)}`,
        `meta:faceCount=${String(stats.triangleCount)}`,
        `meta:geometryFingerprint=${resultMesh.fingerprint}`,
        `meta:inputVertexCount=${String(inputVertexCount)}`,
        `meta:inputFaceCount=${String(inputFaceCount)}`,
        `meta:backend=${this.backend.name}`,
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
          removedTriangles,
          addedTriangles,
          inputFaceCount,
          inputVertexCount,
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
