/**
 * ClinicalProcessFeedbackOverlay — non-blocking stage-based process UI.
 */

import { useSyncExternalStore } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';

export const ClinicalProcessFeedbackOverlay = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element | null => {
  const host = workspace.getHost();
  const state = useSyncExternalStore(
    (cb) => host.processFeedback.subscribe(() => cb()),
    () => host.processFeedback.getState(),
    () => host.processFeedback.getState()
  );

  if (!state.active) {
    return null;
  }

  const stageIndex = Math.max(
    0,
    state.stages.findIndex((s) => s.id === state.stageId)
  );

  return (
    <div
      className="clinical-process-feedback"
      data-testid="clinical-process-feedback"
      data-kind={state.kind}
      role="status"
      aria-live="polite"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="clinical-process-feedback__spinner" aria-hidden="true" />
      <div className="clinical-process-feedback__body">
        <div className="clinical-process-feedback__title" data-testid="clinical-process-title">
          {state.title}
        </div>
        <div className="clinical-process-feedback__stage" data-testid="clinical-process-stage">
          {state.stageLabel}
        </div>
        {state.stages.length > 1 ? (
          <ol className="clinical-process-feedback__stages">
            {state.stages.map((stage, index) => (
              <li
                key={stage.id}
                className={
                  index < stageIndex
                    ? 'clinical-process-feedback__stage-item clinical-process-feedback__stage-item--done'
                    : index === stageIndex
                      ? 'clinical-process-feedback__stage-item clinical-process-feedback__stage-item--active'
                      : 'clinical-process-feedback__stage-item'
                }
                data-testid={`clinical-process-stage-${stage.id}`}
              >
                {stage.label}
              </li>
            ))}
          </ol>
        ) : null}
        {state.error !== undefined ? (
          <div className="clinical-process-feedback__error" data-testid="clinical-process-error">
            {state.error}
          </div>
        ) : null}
      </div>
    </div>
  );
};
