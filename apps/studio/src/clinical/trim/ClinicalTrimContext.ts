/**
 * ClinicalTrimContext — read-only trim environment snapshot.
 */

import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalPreparationRuntime } from '../preparation/ClinicalPreparationRuntime.js';
import type { ClinicalTrimState } from './ClinicalTrimState.js';

export interface ClinicalTrimContext {
  readonly session: ClinicalSession;
  readonly preparation: ClinicalPreparationRuntime;
  readonly state: ClinicalTrimState;
  readonly now: number;
}

export const buildTrimContext = (input: {
  readonly session: ClinicalSession;
  readonly preparation: ClinicalPreparationRuntime;
  readonly state: ClinicalTrimState;
  readonly now: number;
}): ClinicalTrimContext =>
  Object.freeze({
    session: input.session,
    preparation: input.preparation,
    state: input.state,
    now: input.now
  });
