/**
 * ClinicalPreparationContext — read-only preparation environment snapshot.
 */

import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalOrientationRuntime } from '../orientation/ClinicalOrientationRuntime.js';
import type { ClinicalViewportRuntime } from '../display/ClinicalViewportRuntime.js';
import type { ClinicalPreparationState } from './ClinicalPreparationState.js';

export interface ClinicalPreparationContext {
  readonly session: ClinicalSession;
  readonly orientation: ClinicalOrientationRuntime;
  readonly viewport: ClinicalViewportRuntime;
  readonly state: ClinicalPreparationState;
  readonly now: number;
}

export const buildPreparationContext = (input: {
  readonly session: ClinicalSession;
  readonly orientation: ClinicalOrientationRuntime;
  readonly viewport: ClinicalViewportRuntime;
  readonly state: ClinicalPreparationState;
  readonly now: number;
}): ClinicalPreparationContext =>
  Object.freeze({
    session: input.session,
    orientation: input.orientation,
    viewport: input.viewport,
    state: input.state,
    now: input.now
  });
