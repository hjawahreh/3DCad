/**
 * Clinical render / display state snapshot.
 */

import type {
  ClinicalBackgroundTheme,
  ClinicalDisplayMode,
  ClinicalDisplayPreferences,
  ClinicalLightingPreset
} from './ClinicalDisplayPreferences.js';
import type { ClinicalObjectId } from '../import/ClinicalMeshDescriptor.js';

export interface ClinicalRenderState {
  readonly displayMode: ClinicalDisplayMode;
  readonly background: ClinicalBackgroundTheme;
  readonly lighting: ClinicalLightingPreset;
  readonly showGrid: boolean;
  readonly showAxes: boolean;
  readonly showOrigin: boolean;
  readonly showBoundingBox: boolean;
  readonly showModelEdges: boolean;
  readonly showFaceOrientation: boolean;
  readonly backfaceCulling: boolean;
  readonly isolatedObjectId: ClinicalObjectId | undefined;
  readonly hiddenObjectIds: ReadonlySet<string>;
  readonly hoveredObjectId: ClinicalObjectId | undefined;
  readonly cameraMode: 'orbit' | 'pan' | 'zoom' | 'preset';
  readonly lastPreset: string | undefined;
}

export const renderStateFromPreferences = (
  prefs: ClinicalDisplayPreferences,
  extras?: {
    readonly isolatedObjectId?: ClinicalObjectId;
    readonly hiddenObjectIds?: ReadonlySet<string>;
    readonly hoveredObjectId?: ClinicalObjectId;
    readonly cameraMode?: ClinicalRenderState['cameraMode'];
    readonly lastPreset?: string;
  }
): ClinicalRenderState =>
  Object.freeze({
    displayMode: prefs.displayMode,
    background: prefs.background,
    lighting: prefs.lighting,
    showGrid: prefs.showGrid,
    showAxes: prefs.showAxes,
    showOrigin: prefs.showOrigin,
    showBoundingBox: prefs.showBoundingBox,
    showModelEdges: prefs.showModelEdges,
    showFaceOrientation: prefs.showFaceOrientation,
    backfaceCulling: prefs.backfaceCulling,
    isolatedObjectId: extras?.isolatedObjectId,
    hiddenObjectIds: extras?.hiddenObjectIds ?? new Set<string>(),
    hoveredObjectId: extras?.hoveredObjectId,
    cameraMode: extras?.cameraMode ?? 'orbit',
    lastPreset: extras?.lastPreset
  });
