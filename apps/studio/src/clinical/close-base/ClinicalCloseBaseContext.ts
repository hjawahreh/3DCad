/**
 * ClinicalCloseBaseContext — read-only close-base environment snapshot.
 */

import type { ClinicalPreparationRuntime } from '../preparation/ClinicalPreparationRuntime.js';
import type { ClinicalSession } from '../runtime/session.js';
import type { ClinicalCloseBaseState } from './ClinicalCloseBaseState.js';

export interface ClinicalCloseBaseContext {
  readonly session: ClinicalSession;
  readonly preparation: ClinicalPreparationRuntime;
  readonly state: ClinicalCloseBaseState;
  readonly now: number;
}

export const buildCloseBaseContext = (input: {
  readonly session: ClinicalSession;
  readonly preparation: ClinicalPreparationRuntime;
  readonly state: ClinicalCloseBaseState;
  readonly now: number;
}): ClinicalCloseBaseContext =>
  Object.freeze({
    session: input.session,
    preparation: input.preparation,
    state: input.state,
    now: input.now
  });
