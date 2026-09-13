/**
 * Resume clinical pipeline session state from a persisted document (Phase 9).
 * Restores preparation stage / orientation flag without mutating geometry.
 *
 * Preparation lifecycle sessions are ephemeral: we restore UI readiness from
 * document.preparationMeta / orientationMeta. A full preparation session is
 * re-created on Prepare Case when needed (PROD-002SD).
 */

import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { inferPreparationStageFromDocument } from './ClinicalPipelineStatus.js';

export const hydrateClinicalPipelineFromDocument = (
  workspace: ClinicalWorkspace,
  doc: ClinicalDocumentSnapshot
): void => {
  const prep = workspace.preparation;
  prep.controller.hydrateFromDocument(doc);

  const stage = inferPreparationStageFromDocument(doc);
  const order = [
    'orientation-complete',
    'ready-for-trim',
    'ready-for-close-base',
    'ready-for-segmentation',
    'ready-for-movement'
  ] as const;
  for (const s of order) {
    prep.session.setStage(s);
    if (s === stage) break;
  }
};
