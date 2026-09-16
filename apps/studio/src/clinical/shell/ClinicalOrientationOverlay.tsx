import { useSyncExternalStore } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import type { OrientationHandle } from '../orientation/ClinicalOrientationState.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

/**
 * Interactive orientation gizmo overlay — integrates drag with Interaction Runtime via controller.
 */
export const ClinicalOrientationOverlay = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element | null => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const state = useSyncExternalStore(
    (cb) => workspace.orientation.session.subscribe(cb),
    () => workspace.orientation.session.getState(),
    () => workspace.orientation.session.getState()
  );

  if (!workspace.orientation.isActive()) {
    return null;
  }

  const onPointerDown = (handle: OrientationHandle, event: React.PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    workspace.orientation.controller.beginHandleDrag(
      handle,
      event.pointerId,
      event.clientX,
      event.clientY
    );
  };

  const onPointerMove = (event: React.PointerEvent): void => {
    if (workspace.orientation.gizmo.getDrag() === undefined) {
      return;
    }
    event.preventDefault();
    workspace.orientation.controller.moveHandleDrag(event.clientX, event.clientY);
  };

  const onPointerUp = (event: React.PointerEvent): void => {
    if (workspace.orientation.gizmo.getDrag() === undefined) {
      return;
    }
    event.preventDefault();
    workspace.orientation.controller.endHandleDrag();
  };

  const handleClass = (handle: OrientationHandle): string => {
    const parts = [`clinical-orient-handle`, `clinical-orient-handle--${handle}`];
    if (state.hoveredHandle === handle) {
      parts.push('clinical-orient-handle--hover');
    }
    if (state.activeHandle === handle) {
      parts.push('clinical-orient-handle--active');
    }
    return parts.join(' ');
  };

  return (
    <div
      className={`clinical-orientation-overlay${state.snapPreview ? ' clinical-orientation-overlay--snap' : ''}${state.dirtyPreview ? ' clinical-orientation-overlay--preview' : ''}`}
      data-testid="clinical-orientation-overlay"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="clinical-orient-pivot" aria-label="Visual pivot" />
      {/* CLN-WORKSTATION-001: no XYZ gizmo / axis labels in clinical mode.
          Orient Scan toolbar provides camera nudges; free handle remains for drag refine. */}
      <div className="clinical-orient-gizmo-3d" aria-label="Orientation refine" data-xyz-guides="off">
        <button
          type="button"
          className={handleClass('free')}
          aria-label="Free rotate"
          data-testid="clinical-orient-free-handle"
          onPointerDown={(e) => onPointerDown('free', e)}
          onPointerEnter={() => workspace.orientation.controller.hoverHandle('free')}
          onPointerLeave={() => workspace.orientation.controller.hoverHandle(undefined)}
        >
          ⟳
        </button>
      </div>
      <div className="clinical-orient-status">{state.statusMessage}</div>
    </div>
  );
};
