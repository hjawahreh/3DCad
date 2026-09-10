/**
 * ClinicalDisplayManager — immediate display mode switching + render state.
 */

import type { ClinicalDisplayMode } from './ClinicalDisplayPreferences.js';
import type { ClinicalDisplayPreferencesStore } from './ClinicalDisplayPreferences.js';
import { renderStateFromPreferences, type ClinicalRenderState } from './ClinicalRenderState.js';
import type { ClinicalVisibilityManager } from './ClinicalVisibilityManager.js';
import type { ClinicalDisplayDiagnostics } from './ClinicalDisplayObservability.js';
import type { ClinicalDisplayMetrics } from './ClinicalDisplayObservability.js';
import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';

export class ClinicalDisplayManager {
  private hoveredObjectId: ClinicalObjectId | undefined;
  private cameraMode: ClinicalRenderState['cameraMode'] = 'orbit';
  private lastPreset: string | undefined;
  private cached: ClinicalRenderState;
  private readonly listeners = new Set<() => void>();

  public constructor(
    private readonly prefs: ClinicalDisplayPreferencesStore,
    private readonly visibility: ClinicalVisibilityManager,
    private readonly diagnostics: ClinicalDisplayDiagnostics,
    private readonly metrics: ClinicalDisplayMetrics
  ) {
    this.cached = this.build();
    this.prefs.subscribe(() => this.emit());
  }

  public getRenderState(): ClinicalRenderState {
    return this.cached;
  }

  public setDisplayMode(mode: ClinicalDisplayMode): void {
    this.prefs.update({ displayMode: mode });
    this.diagnostics.recordDisplayModeChange(mode);
    this.metrics.recordDisplayMode(mode);
    // prefs.subscribe already emits; ensure diagnostics path still refreshes cache
    this.emit();
  }

  public setHover(id: ClinicalObjectId | undefined): void {
    this.hoveredObjectId = id;
    this.emit();
  }

  public setCameraMode(mode: ClinicalRenderState['cameraMode'], preset?: string): void {
    this.cameraMode = mode;
    this.lastPreset = preset;
    this.emit();
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private build(): ClinicalRenderState {
    const extras: {
      readonly isolatedObjectId?: ClinicalObjectId;
      readonly hiddenObjectIds?: ReadonlySet<string>;
      readonly hoveredObjectId?: ClinicalObjectId;
      readonly cameraMode?: ClinicalRenderState['cameraMode'];
      readonly lastPreset?: string;
    } = {
      hiddenObjectIds: this.visibility.getHiddenIds(),
      cameraMode: this.cameraMode
    };
    const isolated = this.visibility.getIsolatedId();
    const hovered = this.hoveredObjectId;
    const preset = this.lastPreset;
    return renderStateFromPreferences(this.prefs.get(), {
      ...extras,
      ...(isolated === undefined ? {} : { isolatedObjectId: isolated }),
      ...(hovered === undefined ? {} : { hoveredObjectId: hovered }),
      ...(preset === undefined ? {} : { lastPreset: preset })
    });
  }

  private emit(): void {
    this.cached = this.build();
    for (const listener of this.listeners) {
      listener();
    }
  }
}
