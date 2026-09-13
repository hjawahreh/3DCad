import { useSyncExternalStore } from 'react';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';

/**
 * Close Base overlay — status chrome only.
 * GEO-001D: do NOT draw a conceptual AABB/slab rectangle. Preview geometry is the
 * live kernel mesh in the viewport (badge notes "live mesh" when fingerprint set).
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

  const preview = state.previewActive;
  const liveMesh = state.kernelFingerprint !== undefined;

  return (
    <div
      className={`clinical-close-base-overlay${preview ? ' clinical-close-base-overlay--preview' : ''}${state.toolStatus === 'processing' ? ' clinical-close-base-overlay--processing' : ''}${liveMesh ? ' clinical-close-base-overlay--live-mesh' : ''}`}
      data-testid="clinical-close-base-overlay"
      data-status={state.toolStatus}
      data-live-mesh={liveMesh ? 'true' : 'false'}
    >
      <div className="clinical-close-base-badge">
        {state.interactionMode === 'auto' && liveMesh
          ? 'AUTO BASE PREVIEW'
          : preview
            ? 'PREVIEW'
            : 'COMMITTED'}{' '}
        · {state.parameters.strategy}
        {liveMesh ? ' · live mesh' : ''}
      </div>
      <div className="clinical-close-base-status">{state.statusMessage}</div>
    </div>
  );
};
