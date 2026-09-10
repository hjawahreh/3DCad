import { useSyncExternalStore } from 'react';
import { ViewportHost } from '../../hosts/ViewportHost.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { useClinicalUiRevision } from './useClinicalUi.js';
import { ClinicalViewportHUD } from './ClinicalViewportHUD.js';
import { ClinicalViewportOverlay } from './ClinicalViewportOverlay.js';
import { ClinicalOrientationOverlay } from './ClinicalOrientationOverlay.js';
import { ClinicalOrientationToolbar } from './ClinicalOrientationToolbar.js';
import { ClinicalTrimOverlay } from '../trim/ClinicalTrimOverlay.js';
import { ClinicalTrimToolbar } from '../trim/ClinicalTrimToolbar.js';
import { ClinicalCloseBaseOverlay } from '../close-base/ClinicalCloseBaseOverlay.js';
import { ClinicalCloseBaseToolbar } from '../close-base/ClinicalCloseBaseToolbar.js';

/**
 * ClinicalDocumentHost — clinical viewport surface (CLN-003 display + CLN-004 orientation).
 */
export const ClinicalDocumentHost = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const host = session.getHost();
  const prefs = useSyncExternalStore(
    (cb) => workspace.viewport.preferences.subscribe(cb),
    () => workspace.viewport.preferences.get(),
    () => workspace.viewport.preferences.get()
  );
  const render = useSyncExternalStore(
    (cb) => workspace.viewport.display.subscribe(cb),
    () => workspace.viewport.display.getRenderState(),
    () => workspace.viewport.display.getRenderState()
  );

  const showGrid = prefs.showGrid && render.showGrid;
  const bg = prefs.background;
  const orienting = workspace.orientation.isActive();
  const trimming = workspace.trim.isActive();
  const closingBase = workspace.closeBase.isActive();

  return (
    <div
      className={`clinical-document-host clinical-document-host--bg-${bg} clinical-document-host--mode-${render.displayMode} clinical-document-host--light-${prefs.lighting}${prefs.showModelEdges ? ' clinical-document-host--edges' : ''}${prefs.showFaceOrientation ? ' clinical-document-host--face-orient' : ''}${prefs.backfaceCulling ? '' : ' clinical-document-host--no-cull'}${orienting ? ' clinical-document-host--orienting' : ''}${trimming ? ' clinical-document-host--trimming' : ''}${closingBase ? ' clinical-document-host--close-base' : ''}`}
      data-testid="clinical-document-host"
      onContextMenu={(event) => {
        event.preventDefault();
        host.notifications.push(
          'info',
          'Context menu',
          orienting
            ? 'Accept · Cancel · Reset available from Orientation toolbar'
            : 'Fit All · Show All · Display modes available from the Display panel'
        );
      }}
    >
      <ClinicalOrientationToolbar workspace={workspace} />
      <ClinicalTrimToolbar workspace={workspace} />
      <ClinicalCloseBaseToolbar workspace={workspace} />
      <ViewportHost root={host} showGrid={showGrid} />
      <ClinicalViewportOverlay workspace={workspace} />
      <ClinicalOrientationOverlay workspace={workspace} />
      <ClinicalTrimOverlay workspace={workspace} />
      <ClinicalCloseBaseOverlay workspace={workspace} />
      <ClinicalViewportHUD workspace={workspace} />
    </div>
  );
};
