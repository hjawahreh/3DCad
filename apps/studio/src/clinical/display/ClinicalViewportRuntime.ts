/**
 * ClinicalViewportRuntime — clinical viewing façade over Camera + Viewport + Display pipeline.
 */

import type { PresetView } from '@cad-studio/camera-runtime';
import type { ClinicalSession } from '../runtime/session.js';
import { unionBounds, unionOrientedBounds } from '../document/ClinicalDocument.js';
import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';
import type { ClinicalSceneBuilder } from '../import/ClinicalSceneBuilder.js';
import { ClinicalAppearanceManager } from './ClinicalAppearanceManager.js';
import { ClinicalDisplayManager } from './ClinicalDisplayManager.js';
import { ClinicalDisplayPipeline } from './ClinicalDisplayPipeline.js';
import {
  ClinicalDisplayPreferencesStore,
  type ClinicalDisplayMode
} from './ClinicalDisplayPreferences.js';
import {
  ClinicalDisplayDiagnostics,
  ClinicalDisplayMetrics
} from './ClinicalDisplayObservability.js';
import { ClinicalVisibilityManager } from './ClinicalVisibilityManager.js';
import {
  applyClinicalAnteriorPose,
  computeClinicalFitDistance,
  forceApplyCameraSnapshot,
  shouldPreferClinicalFrame
} from './ClinicalAnteriorCamera.js';
import {
  buildClinicalCornerSnapshot,
  buildClinicalViewSnapshot,
  CANONICAL_CLINICAL_ANTERIOR_FACE,
  clinicalBoundsCenter,
  clinicalCameraBasisFromSnapshot,
  type ClinicalCameraBasis,
  type ClinicalViewCubeFace
} from './ClinicalViewCubeMath.js';
import { clinicalFailure, clinicalSuccess, type ClinicalResult } from '../runtime/types.js';

const PRESETS: readonly PresetView[] = Object.freeze([
  'front',
  'back',
  'left',
  'right',
  'top',
  'bottom',
  'iso'
]);

export class ClinicalViewportRuntime {
  public readonly preferences: ClinicalDisplayPreferencesStore;
  public readonly visibility: ClinicalVisibilityManager;
  public readonly appearance: ClinicalAppearanceManager;
  public readonly display: ClinicalDisplayManager;
  public readonly pipeline: ClinicalDisplayPipeline;
  public readonly diagnostics: ClinicalDisplayDiagnostics;
  public readonly metrics: ClinicalDisplayMetrics;
  private presentationBoundsProvider: (() =>
    | {
        readonly min: { readonly x: number; readonly y: number; readonly z: number };
        readonly max: { readonly x: number; readonly y: number; readonly z: number };
      }
    | undefined) | undefined;

  public constructor(
    private readonly session: ClinicalSession,
    private readonly sceneBuilder: ClinicalSceneBuilder
  ) {
    this.preferences = new ClinicalDisplayPreferencesStore();
    this.visibility = new ClinicalVisibilityManager();
    this.diagnostics = new ClinicalDisplayDiagnostics();
    this.metrics = new ClinicalDisplayMetrics();
    this.appearance = new ClinicalAppearanceManager(this.preferences);
    this.display = new ClinicalDisplayManager(
      this.preferences,
      this.visibility,
      this.diagnostics,
      this.metrics
    );
    this.pipeline = new ClinicalDisplayPipeline(
      this.display,
      this.sceneBuilder,
      this.diagnostics,
      this.metrics
    );
    this.metrics.recordViewportOpen();
  }

  /**
   * Optional bounds source so Orientation preview transforms participate in
   * Auto Orient / View Cube / Home identically (document may still be identity).
   */
  public setPresentationBoundsProvider(
    fn:
      | (() =>
          | {
              readonly min: { readonly x: number; readonly y: number; readonly z: number };
              readonly max: { readonly x: number; readonly y: number; readonly z: number };
            }
          | undefined)
      | undefined
  ): void {
    this.presentationBoundsProvider = fn;
  }

  public setDisplayMode(mode: ClinicalDisplayMode): ClinicalResult<void> {
    this.display.setDisplayMode(mode);
    return this.pipeline.refresh(this.session, this.session.getHost(), 'display-mode');
  }

  public hide(id: ClinicalObjectId): ClinicalResult<void> {
    const result = this.visibility.hide(this.session, id);
    if (!result.ok) {
      return result;
    }
    this.diagnostics.recordVisibilityChange(`Hide ${id}`);
    this.metrics.recordVisibilityOp();
    return this.pipeline.refresh(this.session, this.session.getHost(), 'visibility-hide');
  }

  public show(id: ClinicalObjectId): ClinicalResult<void> {
    const result = this.visibility.show(this.session, id);
    if (!result.ok) {
      return result;
    }
    this.diagnostics.recordVisibilityChange(`Show ${id}`);
    this.metrics.recordVisibilityOp();
    return this.pipeline.refresh(this.session, this.session.getHost(), 'visibility-show');
  }

  public isolate(id: ClinicalObjectId): ClinicalResult<void> {
    const result = this.visibility.isolate(this.session, id);
    if (!result.ok) {
      return result;
    }
    this.diagnostics.recordVisibilityChange(`Isolate ${id}`);
    this.metrics.recordVisibilityOp();
    return this.pipeline.refresh(this.session, this.session.getHost(), 'visibility-isolate');
  }

  public showAll(): ClinicalResult<void> {
    const result = this.visibility.showAll(this.session);
    if (!result.ok) {
      return result;
    }
    this.diagnostics.recordVisibilityChange('Show all');
    this.metrics.recordVisibilityOp();
    return this.pipeline.refresh(this.session, this.session.getHost(), 'visibility-show-all');
  }

  public fitAll(): ClinicalResult<void> {
    const host = this.session.getHost();
    const camera = host.sessions.cameraSession;
    const doc = this.session.getPublicState().activeCase;
    if (camera === undefined) {
      return clinicalFailure('unavailable', 'Camera session not attached');
    }
    const visible = doc ? doc.objects.filter((o) => o.visible) : [];
    const bounds = unionOrientedBounds(visible) ?? unionBounds(visible);
    if (bounds === undefined) {
      camera.resetView();
    } else if (shouldPreferClinicalFrame(doc)) {
      return this.presentCanonicalClinicalView(CANONICAL_CLINICAL_ANTERIOR_FACE, {
        boundsOverride: bounds
      });
    } else {
      camera.fitAll(
        {
          min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
          max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z }
        },
        1.2
      );
    }
    this.display.setCameraMode('orbit');
    this.diagnostics.recordCameraTransition('Fit all');
    this.metrics.recordCameraFit();
    host.sessions.viewportSession?.invalidate('fit-all');
    this.session.notifyUi();
    return clinicalSuccess(undefined);
  }

  public presentClinicalAnteriorView(options?: {
    readonly preferClinicalFrame?: boolean;
    readonly boundsOverride?: {
      readonly min: { readonly x: number; readonly y: number; readonly z: number };
      readonly max: { readonly x: number; readonly y: number; readonly z: number };
    };
  }): ClinicalResult<void> {
    // Single source of truth: View Cube Anterior (Ant) + visible-bounds fit.
    void options?.preferClinicalFrame;
    return this.presentCanonicalClinicalView(CANONICAL_CLINICAL_ANTERIOR_FACE, {
      ...(options?.boundsOverride !== undefined
        ? { boundsOverride: options.boundsOverride }
        : {})
    });
  }

  /**
   * Canonical clinical camera: clinical-frame View Cube face + fit to visible bounds.
   * Auto Orient, Home, and View Cube Ant all use this path.
   */
  public presentCanonicalClinicalView(
    face: ClinicalViewCubeFace,
    options?: {
      readonly boundsOverride?: {
        readonly min: { readonly x: number; readonly y: number; readonly z: number };
        readonly max: { readonly x: number; readonly y: number; readonly z: number };
      };
      readonly animationMs?: number;
    }
  ): ClinicalResult<void> {
    const host = this.session.getHost();
    const camera = host.sessions.cameraSession;
    const doc = this.session.getPublicState().activeCase;
    const visible = doc ? doc.objects.filter((o) => o.visible) : [];
    const bounds =
      options?.boundsOverride ??
      this.presentationBoundsProvider?.() ??
      unionOrientedBounds(visible) ??
      unionBounds(visible);
    if (camera === undefined || bounds === undefined) {
      return clinicalFailure(
        'unavailable',
        'Camera or bounds unavailable for canonical clinical view'
      );
    }
    const distance = computeClinicalFitDistance(bounds, camera.getSnapshot().fovDegrees);
    const target = clinicalBoundsCenter(bounds);
    const snapshot = buildClinicalViewSnapshot(
      camera.getSnapshot(),
      face,
      target,
      distance
    );
    const applied = this.animateClinicalViewSnapshot(
      snapshot,
      options?.animationMs ?? 280,
      face === CANONICAL_CLINICAL_ANTERIOR_FACE
        ? 'Canonical clinical anterior'
        : `Clinical cube ${face}`
    );
    if (!applied.ok && face === CANONICAL_CLINICAL_ANTERIOR_FACE) {
      const ok = applyClinicalAnteriorPose(camera, bounds, {
        preferClinicalFrame: true,
        distanceOverride: distance
      });
      if (!ok) {
        return clinicalFailure('unavailable', 'Canonical clinical view failed to apply');
      }
      this.display.setCameraMode('orbit');
      this.diagnostics.recordCameraTransition('Canonical clinical anterior (fallback)');
      this.metrics.recordCameraFit();
      host.sessions.viewportSession?.invalidate('clinical-canonical');
      this.session.notifyUi();
      return clinicalSuccess(undefined);
    }
    return applied;
  }

  /** Expose numerical camera basis for certification tests. */
  public getClinicalCameraBasis(): ClinicalCameraBasis | undefined {
    const camera = this.session.getHost().sessions.cameraSession;
    if (camera === undefined) {
      return undefined;
    }
    return clinicalCameraBasisFromSnapshot(camera.getSnapshot());
  }

  /** Future-ready: currently falls back to fitAll when selection empty. */
  public fitSelected(): ClinicalResult<void> {
    const host = this.session.getHost();
    const selection = host.sessions.selectionSession?.getSnapshot();
    if (selection === undefined || selection.ids.length === 0) {
      return this.fitAll();
    }
    this.diagnostics.recordCameraTransition('Fit selected (future-ready → fit all bounds)');
    return this.fitAll();
  }

  public resetView(): ClinicalResult<void> {
    // Home = Anterior + visible-bounds fit (same as Auto Orient / View Cube Ant).
    const doc = this.session.getPublicState().activeCase;
    if (doc !== undefined && doc.objects.length > 0) {
      return this.presentCanonicalClinicalView(CANONICAL_CLINICAL_ANTERIOR_FACE);
    }
    const camera = this.session.getHost().sessions.cameraSession;
    if (camera === undefined) {
      return clinicalFailure('unavailable', 'Camera session not attached');
    }
    camera.resetView();
    this.display.setCameraMode('orbit');
    this.diagnostics.recordCameraTransition('Reset view');
    this.session.getHost().sessions.viewportSession?.invalidate('reset-view');
    this.session.notifyUi();
    return clinicalSuccess(undefined);
  }

  public presetView(preset: PresetView): ClinicalResult<void> {
    if (!PRESETS.includes(preset)) {
      return clinicalFailure('validation', `Unknown preset ${preset}`);
    }
    const camera = this.session.getHost().sessions.cameraSession;
    if (camera === undefined) {
      return clinicalFailure('unavailable', 'Camera session not attached');
    }
    const result = camera.presetView(preset);
    if (!result.ok) {
      return clinicalFailure('unavailable', result.error.message);
    }
    this.display.setCameraMode('preset', preset);
    this.diagnostics.recordCameraTransition(`Preset ${preset}`);
    this.session.getHost().sessions.viewportSession?.invalidate(`preset-${preset}`);
    this.session.notifyUi();
    return clinicalSuccess(undefined);
  }

  public listPresets(): readonly PresetView[] {
    return PRESETS;
  }

  /**
   * View Cube face click — clinical-frame basis + fit to visible geometry.
   * Does not use world-axis Camera Runtime presets for clinical faces.
   */
  public presentClinicalCubeView(face: ClinicalViewCubeFace): ClinicalResult<void> {
    return this.presentCanonicalClinicalView(face);
  }

  /** Iso-style corner between two or three adjacent clinical faces. */
  public presentClinicalCubeCorner(faces: readonly ClinicalViewCubeFace[]): ClinicalResult<void> {
    if (faces.length < 2) {
      return clinicalFailure('validation', 'Corner view requires at least two faces');
    }
    const host = this.session.getHost();
    const camera = host.sessions.cameraSession;
    const doc = this.session.getPublicState().activeCase;
    const visible = doc ? doc.objects.filter((o) => o.visible) : [];
    const bounds = unionOrientedBounds(visible) ?? unionBounds(visible);
    if (camera === undefined) {
      return clinicalFailure('unavailable', 'Camera session not attached');
    }
    const current = camera.getSnapshot();
    const target = bounds !== undefined ? clinicalBoundsCenter(bounds) : undefined;
    const radius =
      bounds !== undefined
        ? computeClinicalFitDistance(bounds, current.fovDegrees)
        : undefined;
    const base =
      target !== undefined && radius !== undefined
        ? buildClinicalViewSnapshot(current, faces[0]!, target, radius)
        : current;
    return this.animateClinicalViewSnapshot(
      buildClinicalCornerSnapshot(base, faces, target),
      280,
      'View cube corner'
    );
  }

  private animateClinicalViewSnapshot(
    target: ReturnType<typeof buildClinicalViewSnapshot>,
    durationMs = 280,
    label = 'View cube'
  ): ClinicalResult<void> {
    const host = this.session.getHost();
    const camera = host.sessions.cameraSession;
    if (camera === undefined) {
      return clinicalFailure('unavailable', 'Camera session not attached');
    }
    const started = camera.animateTo(target, durationMs);
    if (!started.ok) {
      if (!forceApplyCameraSnapshot(camera, target)) {
        return clinicalFailure('unavailable', started.error.message);
      }
    } else {
      const deadline = Date.now() + Math.max(50, durationMs + 40);
      let completed = false;
      while (Date.now() <= deadline) {
        const tick = camera.tickAnimation();
        if (tick.ok && tick.value.completed) {
          completed = true;
          break;
        }
      }
      if (!completed) {
        forceApplyCameraSnapshot(camera, target);
      }
    }
    this.display.setCameraMode('orbit');
    this.diagnostics.recordCameraTransition(label);
    this.metrics.recordCameraFit();
    host.sessions.viewportSession?.invalidate('clinical-canonical');
    this.session.notifyUi();
    return clinicalSuccess(undefined);
  }

  public isReady(): boolean {
    return this.session.getHost().sessions.viewportSession !== undefined;
  }
}
