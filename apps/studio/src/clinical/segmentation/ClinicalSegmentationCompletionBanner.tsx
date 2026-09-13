/**
 * Case-level segmentation completion banner (Phase 9 / PROD-002S).
 * Shows real per-arch counts and integrity status — never fabricates clinical readiness.
 */

import type { JSX } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import { summarizeCaseSegmentation } from '../case/ClinicalPipelineStatus.js';
import {
  evaluateCaseMovementReadiness,
  movementReadinessUiLabel
} from './ClinicalSegmentationIntegrity.js';

export const ClinicalSegmentationCompletionBanner = (props: {
  readonly workspace: ClinicalWorkspace;
}): JSX.Element | null => {
  const { workspace } = props;
  useClinicalUiRevision(workspace.session);
  if (workspace.segmentation.isActive()) return null;
  const doc = workspace.session.getPublicState().activeCase;
  if (doc === undefined) return null;
  const summary = summarizeCaseSegmentation(doc);
  if (!summary.arches.some((a) => a.accepted)) return null;

  const stale = summary.arches.some((a) => a.status === 'STALE' || a.status === 'INVALID');
  const readiness = evaluateCaseMovementReadiness(doc);
  const title = stale
    ? 'Segmentation Outdated — Geometry Changed'
    : summary.complete
      ? 'Segmentation Accepted'
      : 'Segmentation In Progress';

  return (
    <div
      className="clinical-segmentation-completion"
      data-testid="clinical-segmentation-completion"
      role="status"
    >
      <strong>{title}</strong>
      {summary.arches.map((arch) => (
        <span key={arch.arch}>
          {arch.arch === 'upper' ? 'Upper Arch' : 'Lower Arch'}
          {' · '}
          {String(arch.toothCount)} teeth
          {' · '}
          {arch.status}
        </span>
      ))}
      <span>
        Needs Review
        {' · '}
        {String(summary.totalNeedsReview)}
      </span>
      <span data-testid="clinical-seg-movement-readiness">
        {movementReadinessUiLabel(readiness.readyForMovement)}
      </span>
    </div>
  );
};
