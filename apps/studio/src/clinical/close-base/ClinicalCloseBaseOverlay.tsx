import { useSyncExternalStore } from 'react';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';

/**
 * Close Base overlay — non-destructive preview of base slab / margin.
 */
export const ClinicalCloseBaseOverlay = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element | null => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const closeBase = workspace.closeBase;
  const state = useSyncExternalStore(
    (cb) => closeBase.session.subscribe(cb),
    () => closeBase.session.getState(),
    () => closeBase.session.getState()
  );

  if (!closeBase.isActive()) {
    return null;
  }

  const heightPct = Math.min(40, Math.max(8, state.parameters.height * 4));
  const marginPct = Math.min(18, state.parameters.margin * 8);
  const preview = state.previewActive;

  return (
    <div
      className={`clinical-close-base-overlay${preview ? ' clinical-close-base-overlay--preview' : ''}${state.toolStatus === 'processing' ? ' clinical-close-base-overlay--processing' : ''}`}
      data-testid="clinical-close-base-overlay"
      data-status={state.toolStatus}
    >
      <div
        className={`clinical-close-base-slab clinical-close-base-slab--${state.parameters.orientation}`}
        style={{ height: `${String(heightPct)}%` }}
        aria-hidden="true"
      >
        <div
          className="clinical-close-base-margin"
          style={{ inset: `${String(marginPct)}px` }}
        />
        <div className="clinical-close-base-thickness" />
      </div>
      <div className="clinical-close-base-badge">
        {preview ? 'PREVIEW' : 'COMMITTED'} · {state.parameters.strategy} ·{' '}
        {state.parameters.orientation.toUpperCase()}
      </div>
      <div className="clinical-close-base-status">{state.statusMessage}</div>
    </div>
  );
};
