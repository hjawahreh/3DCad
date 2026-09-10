/**
 * ClinicalAnalysisController — observational analysis orchestration (no mesh mutation).
 */

import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalPreparationRuntime } from '../preparation/ClinicalPreparationRuntime.js';
import type { ClinicalSegmentationRuntime } from '../segmentation/ClinicalSegmentationRuntime.js';
import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import {
  clinicalFailure,
  clinicalSuccess,
  type ClinicalResult
} from '../runtime/types.js';
import type { TriangleMesh } from '../../geometry-kernel/mesh/TriangleMesh.js';
import { ClinicalAnalysisSession, type AnalysisMode } from './ClinicalAnalysisSession.js';
import { ClinicalAnalysisCache, hashParameters } from './ClinicalAnalysisCache.js';
import {
  ClinicalAnalysisDiagnostics,
  ClinicalAnalysisMetrics
} from './ClinicalAnalysisObservability.js';
import { ClinicalAnalysisPreferencesStore } from './ClinicalAnalysisPreferences.js';
import { ClinicalAnalysisHistory } from './ClinicalAnalysisHistory.js';
import { createDefaultAnalysisRegistry } from './registry/createDefaultAnalysisRegistry.js';
import type { ClinicalAnalysisRegistry } from './registry/AnalysisProvider.js';
import type { AnalysisTypeId, AnalysisVec3, ClinicalAnalysisResult } from './types.js';
import { asClinicalToolId } from '../runtime/types.js';

export class ClinicalAnalysisController {
  public readonly session: ClinicalAnalysisSession;
  public readonly diagnostics: ClinicalAnalysisDiagnostics;
  public readonly metrics: ClinicalAnalysisMetrics;
  public readonly preferences: ClinicalAnalysisPreferencesStore;
  public readonly history: ClinicalAnalysisHistory;
  public readonly cache: ClinicalAnalysisCache;
  public readonly registry: ClinicalAnalysisRegistry;

  public constructor(
    private readonly clinicalSession: ClinicalSession,
    _preparation: ClinicalPreparationRuntime,
    private readonly segmentation: ClinicalSegmentationRuntime
  ) {
    this.session = new ClinicalAnalysisSession();
    this.diagnostics = new ClinicalAnalysisDiagnostics();
    this.metrics = new ClinicalAnalysisMetrics();
    this.preferences = new ClinicalAnalysisPreferencesStore();
    this.history = new ClinicalAnalysisHistory();
    this.cache = new ClinicalAnalysisCache();
    this.registry = createDefaultAnalysisRegistry({
      getMesh: (objectId) => this.resolveMesh(objectId),
      getPredictionInstances: () => this.session.getState().toothSnapshot,
      getSecondaryMesh: () => this.resolveSecondaryMesh()
    });
  }

  public enter(preferredId?: ClinicalObjectId): ClinicalResult<void> {
    if (this.isActive()) {
      return clinicalFailure('conflict', 'Analysis session already active');
    }
    const doc = this.clinicalSession.getPublicState().activeCase;
    if (doc === undefined || doc.objects.length === 0) {
      return clinicalFailure('validation', 'Import a scan before analysis');
    }
    const target =
      preferredId ??
      (doc.objects.find((o) => o.visible)?.id as ClinicalObjectId | undefined) ??
      (doc.objects[0]?.id as ClinicalObjectId | undefined);
    if (target === undefined) {
      return clinicalFailure('validation', 'No mesh object available');
    }

    const mesh = this.resolveMesh(target);
    const prediction = this.segmentation.session.getState().prediction;
    const toothSnapshot = prediction?.instances;
    const segmentationRevision = prediction?.sourceRevision;

    this.clinicalSession.activateTool(asClinicalToolId('analyze'));
    const ok = this.session.begin({
      targetObjectId: target,
      sourceRevision: mesh?.revision ?? doc.revision,
      segmentationRevision,
      geometryFingerprint: mesh?.fingerprint ?? doc.objects[0]?.geometryFingerprint,
      toothSnapshot
    });
    if (!ok) {
      return clinicalFailure('conflict', 'Could not start analysis session');
    }
    this.diagnostics.record('info', 'Analysis session started');
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public setMode(mode: AnalysisMode): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('conflict', 'Analysis is not active');
    }
    this.session.setMode(mode);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public pickPoint(point: AnalysisVec3, objectId: string, vertexIndex?: number): ClinicalResult<void> {
    if (!this.isActive()) {
      return clinicalFailure('conflict', 'Analysis is not active');
    }
    this.session.addPick({ point, objectId, vertexIndex });
    const state = this.session.getState();
    if (state.mode === 'distance' && state.picks.length >= 2) {
      const measured = this.runProvider('distance', {
        a: state.picks[0]!.point,
        b: state.picks[1]!.point
      });
      return measured.ok ? clinicalSuccess(undefined) : measured;
    }
    if (state.mode === 'angle' && state.picks.length >= 3) {
      const measured = this.runProvider('angle', {
        a: state.picks[0]!.point,
        vertex: state.picks[1]!.point,
        b: state.picks[2]!.point
      });
      return measured.ok ? clinicalSuccess(undefined) : measured;
    }
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public clearMeasurement(): ClinicalResult<void> {
    this.session.clearPicks();
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public analyzeTooth(instanceId?: string): ClinicalResult<ClinicalAnalysisResult> {
    return this.runProvider('tooth-dimensions', {
      ...(instanceId === undefined ? {} : { instanceId })
    });
  }

  public analyzeArch(): ClinicalResult<ClinicalAnalysisResult> {
    return this.runProvider('arch', {});
  }

  public analyzeSpacing(): ClinicalResult<ClinicalAnalysisResult> {
    return this.runProvider('spacing', {});
  }

  public analyzeCrowding(): ClinicalResult<ClinicalAnalysisResult> {
    return this.runProvider('crowding', {});
  }

  public analyzeOcclusion(): ClinicalResult<ClinicalAnalysisResult> {
    return this.runProvider('occlusion', {});
  }

  public analyzeCollision(): ClinicalResult<ClinicalAnalysisResult> {
    return this.runProvider('collision', {});
  }

  public analyzeBolton(): ClinicalResult<ClinicalAnalysisResult> {
    return this.runProvider('bolton', {});
  }

  public saveResult(): ClinicalResult<void> {
    if (!this.session.saveLastResult()) {
      return clinicalFailure('validation', 'No analysis result to save');
    }
    this.diagnostics.record('info', 'Saved analysis metadata (geometry unchanged)');
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public cancel(): ClinicalResult<void> {
    this.session.cancel();
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public selectInstance(id: string | undefined): ClinicalResult<void> {
    this.session.selectInstance(id);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(undefined);
  }

  public isActive(): boolean {
    return this.session.getWorkflow().isActive();
  }

  public dispose(): void {
    this.cache.clear();
    this.session.resetIdle();
  }

  /** Snapshot fingerprint before/after analysis to prove immutability in tests. */
  public meshFingerprint(objectId: string): string | undefined {
    return this.resolveMesh(objectId)?.fingerprint;
  }

  private runProvider(
    type: AnalysisTypeId,
    params: Readonly<Record<string, unknown>>
  ): ClinicalResult<ClinicalAnalysisResult> {
    if (!this.isActive()) {
      return clinicalFailure('conflict', 'Analysis is not active');
    }
    const state = this.session.getState();
    const provider = this.registry.get(type);
    if (provider === undefined || !provider.operational) {
      return clinicalFailure('unavailable', `Analysis provider ${type} unavailable`);
    }
    const key = {
      analysisType: type,
      sourceRevision: state.sourceRevision,
      segmentationRevision: state.segmentationRevision,
      geometryFingerprint: state.geometryFingerprint,
      algorithmVersion: provider.algorithmVersion,
      parametersHash: hashParameters(params)
    };
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.metrics.recordCacheHit();
      this.session.setResult(cached);
      this.clinicalSession.notifyUi();
      return clinicalSuccess(cached);
    }
    this.metrics.recordCacheMiss();
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const result = provider.run({
      now: Date.now(),
      sourceRevision: state.sourceRevision,
      segmentationRevision: state.segmentationRevision,
      geometryFingerprint: state.geometryFingerprint,
      sourceObjectId: state.targetObjectId ?? '',
      params
    });
    const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.metrics.recordRun(ended - started);
    this.cache.set(key, result);
    this.history.push(result);
    this.session.setResult(result);
    this.diagnostics.record('info', `${type} → ${result.validity}`);
    this.clinicalSession.notifyUi();
    return clinicalSuccess(result);
  }

  private resolveMesh(objectId: string): TriangleMesh | undefined {
    const host = this.clinicalSession.getHost();
    const registry = host.runtimes.kernel.registry;
    registry.ensureSourceMesh(objectId);
    return (
      registry.getByObjectId(objectId, 'working') ??
      registry.getByObjectId(objectId, 'source')
    );
  }

  private resolveSecondaryMesh(): TriangleMesh | undefined {
    const doc = this.clinicalSession.getPublicState().activeCase;
    if (doc === undefined || doc.objects.length < 2) {
      return undefined;
    }
    const primary = this.session.getState().targetObjectId;
    const other = doc.objects.find((o) => o.id !== primary);
    return other === undefined ? undefined : this.resolveMesh(other.id);
  }
}
