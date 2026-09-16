/**
 * GEO-003 — case/arch geometry warmup + editing readiness.
 *
 * Moves expensive ClinicalGeometryContext initialization (topology, clinical
 * spatial index, backend mesh) out of the first Trim interaction.
 */

import type { TriangleMesh } from '../mesh/TriangleMesh.js';
import {
  buildClinicalSpatialIndex,
  invalidateSpatialCache
} from '../engine/SpatialAcceleration.js';
import { GeometryKernelError } from '../errors.js';
import {
  clinicalGeometryContexts,
  type ClinicalGeometryContext
} from './ClinicalGeometryContext.js';

export type GeometryWarmupState = 'NOT_READY' | 'WARMING' | 'READY' | 'FAILED';

export type GeometryWarmupStage =
  | 'context'
  | 'topology'
  | 'spatial'
  | 'backend'
  | 'complete';

export interface GeometryWarmupTimings {
  readonly warmupStart: number;
  readonly topologyStart?: number;
  readonly topologyEnd?: number;
  readonly spatialStart?: number;
  readonly spatialEnd?: number;
  readonly backendStart?: number;
  readonly backendEnd?: number;
  readonly warmupEnd?: number;
  readonly topologyMs: number;
  readonly spatialIndexMs: number;
  readonly backendMs: number;
  readonly totalWarmupMs: number;
}

export interface GeometryWarmupFailure {
  readonly code: 'GEOMETRY_WARMUP_FAILED';
  readonly arch?: string;
  readonly geometryFingerprint: string;
  readonly failedStage: GeometryWarmupStage;
  readonly diagnostics: string;
  readonly durationMs: number;
}

export interface GeometryWarmupStatus {
  readonly state: GeometryWarmupState;
  readonly objectId: string;
  readonly geometryFingerprint: string;
  readonly arch?: string;
  readonly caseId?: string;
  readonly stage?: GeometryWarmupStage;
  readonly userMessage: string;
  readonly timings: GeometryWarmupTimings;
  readonly failure?: GeometryWarmupFailure;
  readonly updatedAtMs: number;
}

export interface GeometryWarmupBackend {
  ensureVtkGeometry?(
    mesh: TriangleMesh,
    options?: {
      readonly caseId?: string;
      readonly signal?: AbortSignal;
      readonly force?: boolean;
    }
  ): Promise<{ readonly workerSessionId?: string; readonly sessionId?: string } | unknown>;
  ensureGeometry?(
    mesh: TriangleMesh,
    options?: {
      readonly caseId?: string;
      readonly signal?: AbortSignal;
      readonly force?: boolean;
    }
  ): Promise<{ readonly workerSessionId?: string; readonly sessionId?: string } | unknown>;
}

export interface WarmMeshOptions {
  readonly arch?: string;
  readonly caseId?: string;
  readonly backend?: GeometryWarmupBackend;
  readonly signal?: AbortSignal;
  readonly force?: boolean;
  readonly onStage?: (status: GeometryWarmupStatus) => void;
}

const emptyTimings = (start: number): GeometryWarmupTimings =>
  Object.freeze({
    warmupStart: start,
    topologyMs: 0,
    spatialIndexMs: 0,
    backendMs: 0,
    totalWarmupMs: 0
  });

const userMessageFor = (state: GeometryWarmupState, stage?: GeometryWarmupStage): string => {
  if (state === 'READY') return 'Editing ready';
  if (state === 'FAILED') return 'Editing tools could not be prepared.';
  if (state === 'NOT_READY') return 'Preparing editing tools…';
  switch (stage) {
    case 'topology':
      return 'Building surface connectivity…';
    case 'spatial':
      return 'Preparing spatial search…';
    case 'backend':
      return 'Preparing clinical editing…';
    default:
      return 'Preparing scan for editing…';
  }
};

const yieldToUi = (): Promise<void> =>
  new Promise((resolve) => {
    if (typeof setTimeout === 'function') {
      setTimeout(resolve, 0);
    } else {
      resolve();
    }
  });

export class GeometryWarmupService {
  private readonly byObject = new Map<string, GeometryWarmupStatus>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly inFlight = new Map<string, Promise<GeometryWarmupStatus>>();
  private readonly listeners = new Set<() => void>();
  /** Soft bound: keep at most N arch contexts across cases. */
  private readonly maxEntries = 8;

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getStatus(objectId: string): GeometryWarmupStatus | undefined {
    return this.byObject.get(objectId);
  }

  public listStatuses(): readonly GeometryWarmupStatus[] {
    return Object.freeze([...this.byObject.values()]);
  }

  public isReady(objectId: string, fingerprint: string): boolean {
    const status = this.byObject.get(objectId);
    return (
      status !== undefined &&
      status.state === 'READY' &&
      status.geometryFingerprint === fingerprint
    );
  }

  public isWarming(objectId: string, fingerprint?: string): boolean {
    const status = this.byObject.get(objectId);
    if (status === undefined || status.state !== 'WARMING') return false;
    if (fingerprint !== undefined && status.geometryFingerprint !== fingerprint) return false;
    return true;
  }

  public assertReadyForEdit(objectId: string, fingerprint: string): void {
    const status = this.byObject.get(objectId);
    if (status === undefined || status.geometryFingerprint !== fingerprint) {
      throw new GeometryKernelError(
        'GEOMETRY_WARMUP_FAILED',
        'Editing tools are not prepared for this geometry.'
      );
    }
    if (status.state === 'WARMING' || status.state === 'NOT_READY') {
      throw new GeometryKernelError(
        'GEOMETRY_WARMUP_FAILED',
        'Preparing editing tools… Please wait.'
      );
    }
    if (status.state === 'FAILED') {
      throw new GeometryKernelError(
        'GEOMETRY_WARMUP_FAILED',
        status.failure?.diagnostics ?? 'Editing tools could not be prepared.'
      );
    }
  }

  public cancel(objectId: string): void {
    const controller = this.controllers.get(objectId);
    if (controller !== undefined) {
      controller.abort();
      this.controllers.delete(objectId);
    }
    this.inFlight.delete(objectId);
    const existing = this.byObject.get(objectId);
    if (existing !== undefined && existing.state === 'WARMING') {
      this.setStatus({
        state: 'NOT_READY',
        objectId: existing.objectId,
        geometryFingerprint: existing.geometryFingerprint,
        ...(existing.arch !== undefined ? { arch: existing.arch } : {}),
        ...(existing.caseId !== undefined ? { caseId: existing.caseId } : {}),
        userMessage: 'Preparing editing tools…',
        timings: existing.timings,
        updatedAtMs: performance.now()
      });
    }
  }

  public invalidate(objectId: string): void {
    this.cancel(objectId);
    const existing = this.byObject.get(objectId);
    if (existing !== undefined) {
      invalidateSpatialCache(existing.geometryFingerprint);
      clinicalGeometryContexts.invalidate(objectId);
      this.byObject.delete(objectId);
      this.emit();
    }
  }

  public invalidateAll(): void {
    for (const id of [...this.byObject.keys()]) {
      this.cancel(id);
    }
    for (const status of this.byObject.values()) {
      invalidateSpatialCache(status.geometryFingerprint);
    }
    clinicalGeometryContexts.invalidateAll();
    invalidateSpatialCache();
    this.byObject.clear();
    this.inFlight.clear();
    this.controllers.clear();
    this.emit();
  }

  /**
   * Warm reusable structures for one arch mesh.
   * Does not precompute SurfacePath or Trim previews.
   */
  public async warmMesh(
    mesh: TriangleMesh,
    options: WarmMeshOptions = {}
  ): Promise<GeometryWarmupStatus> {
    const existingReady = this.byObject.get(mesh.objectId);
    if (
      options.force !== true &&
      existingReady !== undefined &&
      existingReady.state === 'READY' &&
      existingReady.geometryFingerprint === mesh.fingerprint
    ) {
      return existingReady;
    }

    const inFlight = this.inFlight.get(mesh.objectId);
    if (
      inFlight !== undefined &&
      options.force !== true &&
      existingReady?.geometryFingerprint === mesh.fingerprint &&
      existingReady.state === 'WARMING'
    ) {
      return inFlight;
    }

    this.cancel(mesh.objectId);
    const local = new AbortController();
    this.controllers.set(mesh.objectId, local);
    const signal = options.signal;
    const combined = local.signal;
    const onAbort = (): void => local.abort();
    if (signal !== undefined) {
      if (signal.aborted) local.abort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

    const started = performance.now();
    const base: GeometryWarmupStatus = {
      state: 'WARMING',
      objectId: mesh.objectId,
      geometryFingerprint: mesh.fingerprint,
      ...(options.arch !== undefined ? { arch: options.arch } : {}),
      ...(options.caseId !== undefined ? { caseId: options.caseId } : {}),
      stage: 'context',
      userMessage: userMessageFor('WARMING', 'context'),
      timings: emptyTimings(started),
      updatedAtMs: started
    };
    this.setStatus(base);
    options.onStage?.(base);

    const run = this.runWarmup(mesh, options, combined, started);
    this.inFlight.set(mesh.objectId, run);
    try {
      return await run;
    } finally {
      this.inFlight.delete(mesh.objectId);
      this.controllers.delete(mesh.objectId);
      if (signal !== undefined) {
        signal.removeEventListener('abort', onAbort);
      }
    }
  }

  /** Invalidate prior fingerprint and warm the new working mesh asynchronously. */
  public invalidateAndRewarm(
    mesh: TriangleMesh,
    options: WarmMeshOptions = {}
  ): Promise<GeometryWarmupStatus> {
    const prior = this.byObject.get(mesh.objectId);
    if (prior !== undefined && prior.geometryFingerprint !== mesh.fingerprint) {
      invalidateSpatialCache(prior.geometryFingerprint);
    }
    clinicalGeometryContexts.invalidate(mesh.objectId);
    this.cancel(mesh.objectId);
    return this.warmMesh(mesh, { ...options, force: true });
  }

  private async runWarmup(
    mesh: TriangleMesh,
    options: WarmMeshOptions,
    signal: AbortSignal,
    started: number
  ): Promise<GeometryWarmupStatus> {
    let timings: GeometryWarmupTimings = emptyTimings(started);
    let ctx: ClinicalGeometryContext | undefined;
    let stage: GeometryWarmupStage = 'context';

    const publish = (state: GeometryWarmupState, nextStage?: GeometryWarmupStage): GeometryWarmupStatus => {
      const status: GeometryWarmupStatus = {
        state,
        objectId: mesh.objectId,
        geometryFingerprint: mesh.fingerprint,
        ...(options.arch !== undefined ? { arch: options.arch } : {}),
        ...(options.caseId !== undefined ? { caseId: options.caseId } : {}),
        ...(nextStage !== undefined ? { stage: nextStage } : {}),
        userMessage: userMessageFor(state, nextStage),
        timings,
        updatedAtMs: performance.now()
      };
      this.setStatus(status);
      options.onStage?.(status);
      return status;
    };

    const fail = (failedStage: GeometryWarmupStage, diagnostics: string): GeometryWarmupStatus => {
      const durationMs = performance.now() - started;
      timings = Object.freeze({
        ...timings,
        warmupEnd: performance.now(),
        totalWarmupMs: durationMs
      });
      const failure: GeometryWarmupFailure = {
        code: 'GEOMETRY_WARMUP_FAILED',
        ...(options.arch !== undefined ? { arch: options.arch } : {}),
        geometryFingerprint: mesh.fingerprint,
        failedStage,
        diagnostics,
        durationMs
      };
      const status: GeometryWarmupStatus = {
        state: 'FAILED',
        objectId: mesh.objectId,
        geometryFingerprint: mesh.fingerprint,
        ...(options.arch !== undefined ? { arch: options.arch } : {}),
        ...(options.caseId !== undefined ? { caseId: options.caseId } : {}),
        stage: failedStage,
        userMessage: userMessageFor('FAILED'),
        timings,
        failure,
        updatedAtMs: performance.now()
      };
      this.setStatus(status);
      options.onStage?.(status);
      return status;
    };

    try {
      this.throwIfAborted(signal);
      ctx = clinicalGeometryContexts.getOrCreate(mesh);
      ctx.readyState = 'WARMING';
      await yieldToUi();

      stage = 'topology';
      publish('WARMING', 'topology');
      const topologyStart = performance.now();
      // Clinical spatial builds topology once; reuse it on the context.
      this.throwIfAborted(signal);
      stage = 'spatial';
      publish('WARMING', 'spatial');
      const spatialStart = performance.now();
      const clinicalSpatial = buildClinicalSpatialIndex(mesh);
      const spatialEnd = performance.now();
      ctx.clinicalSpatial = clinicalSpatial;
      ctx.topology = clinicalSpatial.topology;
      const topologyEnd = spatialEnd;
      timings = Object.freeze({
        ...timings,
        topologyStart,
        topologyEnd,
        spatialStart,
        spatialEnd,
        topologyMs: Math.max(0, topologyEnd - topologyStart),
        spatialIndexMs: Math.max(0, spatialEnd - spatialStart)
      });
      await yieldToUi();

      let backendMs = 0;
      if (options.backend !== undefined) {
        stage = 'backend';
        publish('WARMING', 'backend');
        const backendStart = performance.now();
        this.throwIfAborted(signal);
        try {
          const ensure =
            typeof options.backend.ensureVtkGeometry === 'function'
              ? options.backend.ensureVtkGeometry.bind(options.backend)
              : typeof options.backend.ensureGeometry === 'function'
                ? options.backend.ensureGeometry.bind(options.backend)
                : undefined;
          if (ensure === undefined) {
            // No backend ensure API — spatial readiness is still enough.
          } else {
            const session = await ensure(mesh, {
              ...(options.caseId !== undefined ? { caseId: options.caseId } : {}),
              signal,
              force: false
            });
            const sessionId =
              session !== null &&
              typeof session === 'object' &&
              'workerSessionId' in session &&
              typeof (session as { workerSessionId?: unknown }).workerSessionId === 'string'
                ? (session as { workerSessionId: string }).workerSessionId
                : session !== null &&
                    typeof session === 'object' &&
                    'sessionId' in session &&
                    typeof (session as { sessionId?: unknown }).sessionId === 'string'
                  ? (session as { sessionId: string }).sessionId
                  : undefined;
            if (sessionId !== undefined) {
              ctx.workerSessionId = sessionId;
            }
          }
        } catch (error) {
          // Backend warm is best-effort when worker is down; spatial readiness still counts.
          if (error instanceof GeometryKernelError && error.code === 'UNSUPPORTED_OPERATION') {
            // leave workerSessionId unset
          } else if (signal.aborted) {
            return fail('backend', 'Warmup cancelled');
          } else {
            // Prefer READY with spatial over failing the whole editing readiness on backend noise.
            console.warn('[geometry-warmup] backend warm failed:', error);
          }
        }
        const backendEnd = performance.now();
        backendMs = backendEnd - backendStart;
        timings = Object.freeze({
          ...timings,
          backendStart,
          backendEnd,
          backendMs
        });
      }

      this.throwIfAborted(signal);
      const warmupEnd = performance.now();
      timings = Object.freeze({
        ...timings,
        warmupEnd,
        totalWarmupMs: warmupEnd - started
      });
      ctx.readyState = 'READY';
      ctx.warmupTimings = timings;
      clinicalGeometryContexts.record(
        mesh.objectId,
        mesh.fingerprint,
        'HIT',
        'warmup'
      );
      this.evictIfNeeded(mesh.objectId);
      return publish('READY', 'complete');
    } catch (error) {
      if (ctx !== undefined) {
        ctx.readyState = 'FAILED';
      }
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        return fail(stage, 'Warmup cancelled');
      }
      return fail(
        stage,
        error instanceof Error ? error.message : 'Geometry warmup failed'
      );
    }
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      const err = new Error('Warmup cancelled');
      err.name = 'AbortError';
      throw err;
    }
  }

  private setStatus(status: GeometryWarmupStatus): void {
    this.byObject.set(status.objectId, status);
    this.emit();
  }

  private evictIfNeeded(keepObjectId: string): void {
    if (this.byObject.size <= this.maxEntries) return;
    const keys = [...this.byObject.keys()].filter((id) => id !== keepObjectId);
    while (this.byObject.size > this.maxEntries && keys.length > 0) {
      const victim = keys.shift();
      if (victim === undefined) break;
      this.invalidate(victim);
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

/** Process-wide warmup service used by Prepare / Trim / Case lifecycle. */
export const geometryWarmup = new GeometryWarmupService();
