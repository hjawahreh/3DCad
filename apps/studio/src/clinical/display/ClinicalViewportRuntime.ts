/**
 * ClinicalViewportRuntime — clinical viewing façade over Camera + Viewport + Display pipeline.
 */

import type { PresetView } from '@cad-studio/camera-runtime';
import type { ClinicalSession } from '../runtime/session.js';
import { unionBounds } from '../document/ClinicalDocument.js';
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
    const bounds = doc ? unionBounds(doc.objects.filter((o) => o.visible)) : undefined;
    if (bounds === undefined) {
      camera.resetView();
    } else {
      camera.fitAll(
        {
          min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
          max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z }
        },
        0.12
      );
    }
    this.display.setCameraMode('orbit');
    this.diagnostics.recordCameraTransition('Fit all');
    this.metrics.recordCameraFit();
    host.sessions.viewportSession?.invalidate('fit-all');
    this.session.notifyUi();
    return clinicalSuccess(undefined);
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

  public isReady(): boolean {
    return this.session.getHost().sessions.viewportSession !== undefined;
  }
}
