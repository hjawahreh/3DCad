import { useSyncExternalStore } from 'react';
import { ViewportHost } from '../../hosts/ViewportHost.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { useClinicalUiRevision } from './useClinicalUi.js';
import { ClinicalEmptyState } from './ClinicalEmptyState.js';
import { ClinicalViewportHUD } from './ClinicalViewportHUD.js';
import { ClinicalViewportOverlay } from './ClinicalViewportOverlay.js';
import { ClinicalOrientationOverlay } from './ClinicalOrientationOverlay.js';
import { ClinicalOrientationToolbar } from './ClinicalOrientationToolbar.js';
import { ClinicalTrimOverlay } from '../trim/ClinicalTrimOverlay.js';
import { ClinicalTrimToolbar } from '../trim/ClinicalTrimToolbar.js';
import { ClinicalCloseBaseOverlay } from '../close-base/ClinicalCloseBaseOverlay.js';
import { ClinicalCloseBaseToolbar } from '../close-base/ClinicalCloseBaseToolbar.js';
import { ClinicalSegmentationOverlay } from '../segmentation/ClinicalSegmentationOverlay.js';
import { ClinicalSegmentationToolbar } from '../segmentation/ClinicalSegmentationToolbar.js';
import { ClinicalAnalysisOverlay } from '../analysis/ClinicalAnalysisOverlay.js';
import { ClinicalAnalysisToolbar } from '../analysis/ClinicalAnalysisToolbar.js';
import { ClinicalMeshViewport } from '../display/ClinicalMeshViewport.js';

/**
 * ClinicalDocumentHost — clinical viewport surface (display + orientation + geometry tools).
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
  const segmenting = workspace.segmentation.isActive();
  const analyzing = workspace.analysis.isActive();

  return (
    <div
      className={`clinical-document-host clinical-document-host--bg-${bg} clinical-document-host--mode-${render.displayMode} clinical-document-host--light-${prefs.lighting}${prefs.showModelEdges ? ' clinical-document-host--edges' : ''}${prefs.showFaceOrientation ? ' clinical-document-host--face-orient' : ''}${prefs.backfaceCulling ? '' : ' clinical-document-host--no-cull'}${orienting ? ' clinical-document-host--orienting' : ''}${trimming ? ' clinical-document-host--trimming' : ''}${closingBase ? ' clinical-document-host--close-base' : ''}${segmenting ? ' clinical-document-host--segmenting' : ''}${analyzing ? ' clinical-document-host--analyzing' : ''}`}
      data-testid="clinical-document-host"
      onContextMenu={(event) => {
        event.preventDefault();
        host.notifications.push(
          'info',
          'Viewport',
          orienting
            ? 'Accept · Cancel · Reset available from the Orientation toolbar'
            : trimming
              ? 'Draw · Accept · Cancel available from the Trim toolbar'
              : analyzing
                ? 'Measure · Tooth · Arch available from the Analysis toolbar'
                : 'Fit All and display modes are available from the inspector'
        );
      }}
    >
      <ClinicalOrientationToolbar workspace={workspace} />
      <ClinicalTrimToolbar workspace={workspace} />
      <ClinicalCloseBaseToolbar workspace={workspace} />
      <ClinicalSegmentationToolbar runtime={workspace.segmentation} />
      <ClinicalAnalysisToolbar workspace={workspace} />
      <ViewportHost root={host} showGrid={showGrid} />
      <ClinicalMeshViewport workspace={workspace} />
      <ClinicalViewportOverlay workspace={workspace} />
      <ClinicalEmptyState workspace={workspace} />
      <ClinicalOrientationOverlay workspace={workspace} />
      <ClinicalTrimOverlay workspace={workspace} />
      <ClinicalCloseBaseOverlay workspace={workspace} />
      <ClinicalSegmentationOverlay session={workspace.segmentation.session} />
      <ClinicalAnalysisOverlay workspace={workspace} />
      <ClinicalViewportHUD workspace={workspace} />
    </div>
  );
};
