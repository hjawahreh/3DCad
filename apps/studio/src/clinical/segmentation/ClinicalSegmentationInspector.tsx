/**
 * Tooth inspector for active segmentation review (Phase 8).
 */

import type { JSX } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import { toothInspectorModel } from './display/ClinicalSegmentationPresentation.js';
import type { FdiNumber } from './fdi/FdiNumbering.js';

export const ClinicalSegmentationInspector = (props: {
  readonly workspace: ClinicalWorkspace;
}): JSX.Element | null => {
  const { workspace } = props;
  useClinicalUiRevision(workspace.session);
  const runtime = workspace.segmentation;
  if (!runtime.isActive()) return null;
  const state = runtime.session.getState();
  const pred = state.prediction;
  if (pred === undefined || state.selectedInstanceId === undefined) {
    return (
      <div className="clinical-workspace-card clinical-segmentation-inspector" data-testid="clinical-segmentation-inspector">
        <h3>Tooth</h3>
        <p className="muted">Select a tooth instance to inspect identity and confidence.</p>
      </div>
    );
  }
  const inst = pred.instances.find((i) => i.instanceId === state.selectedInstanceId);
  if (inst === undefined) return null;
  const doc = workspace.session.getPublicState().activeCase;
  const target = doc?.objects.find((o) => o.id === state.targetObjectId);
  const arch =
    target?.archRole === 'upper' || target?.archRole === 'lower' ? target.archRole : undefined;
  const model = toothInspectorModel(inst, arch);

  return (
    <div className="clinical-workspace-card clinical-segmentation-inspector" data-testid="clinical-segmentation-inspector">
      <h3>{model.title}</h3>
      <dl className="kv">
        <dt>Identity</dt>
        <dd>{model.identity}</dd>
        <dt>Confidence</dt>
        <dd>{model.confidenceLabel}</dd>
        <dt>Arch</dt>
        <dd>{model.archLabel}</dd>
        <dt>Review</dt>
        <dd>{model.reviewState}</dd>
      </dl>
      <div className="clinical-segmentation-overlay__actions">
        <label>
          Relabel
          <select
            value={inst.identification.fdi ?? ''}
            onChange={(e) => {
              const raw = e.target.value;
              const fdi = raw === '' ? undefined : (Number(raw) as FdiNumber);
              runtime.relabelFdi(inst.instanceId, fdi);
            }}
          >
            <option value="">—</option>
            {[11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28, 31, 32, 33, 34, 35, 36, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48].map(
              (n) => (
                <option key={n} value={n}>
                  {String(n)}
                </option>
              )
            )}
          </select>
        </label>
        <button
          type="button"
          className="clinical-btn clinical-btn--secondary"
          onClick={() => runtime.markUnknown(inst.instanceId)}
        >
          Mark Unknown
        </button>
        <button
          type="button"
          className="clinical-btn clinical-btn--tertiary"
          onClick={() => runtime.setViewMode('review')}
        >
          Review
        </button>
      </div>
    </div>
  );
};
