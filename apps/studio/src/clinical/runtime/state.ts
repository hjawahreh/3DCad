/**
 * Clinical state + immutable snapshots.
 */

import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import type { ClinicalLifecyclePhase } from './lifecycle.js';
import type { ClinicalSessionId, ClinicalToolId } from './types.js';

export interface ClinicalPublicState {
  readonly phase: ClinicalLifecyclePhase;
  readonly sessionId: ClinicalSessionId;
  readonly activeCase: ClinicalDocumentSnapshot | undefined;
  readonly activeToolId: ClinicalToolId | undefined;
  readonly dirty: boolean;
}

export interface ImmutableClinicalSnapshot {
  readonly sessionId: ClinicalSessionId;
  readonly phase: ClinicalLifecyclePhase;
  readonly document: ClinicalDocumentSnapshot | undefined;
  readonly activeToolId: ClinicalToolId | undefined;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export const freezeClinicalSnapshot = (
  input: ImmutableClinicalSnapshot
): ImmutableClinicalSnapshot => Object.freeze({ ...input });
