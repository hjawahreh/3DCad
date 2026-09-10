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
      <div className="clinical-orient-guides" aria-hidden="true">
        <span className="clinical-orient-guide clinical-orient-guide--x" />
        <span className="clinical-orient-guide clinical-orient-guide--y" />
        <span className="clinical-orient-guide clinical-orient-guide--z" />
      </div>
      <div className="clinical-orient-gizmo-3d" aria-label="Orientation gizmo">
        {(['x', 'y', 'z', 'free'] as const).map((handle) => (
          <button
            key={handle}
            type="button"
            className={handleClass(handle)}
            aria-label={`Rotate ${handle}`}
            onPointerDown={(e) => onPointerDown(handle, e)}
            onPointerEnter={() => workspace.orientation.controller.hoverHandle(handle)}
            onPointerLeave={() => workspace.orientation.controller.hoverHandle(undefined)}
          >
            {handle === 'free' ? '⟳' : handle.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="clinical-orient-axis-labels" aria-hidden="true">
        <span className="label-x">X</span>
        <span className="label-y">Y</span>
        <span className="label-z">Z</span>
      </div>
      <div className="clinical-orient-status">{state.statusMessage}</div>
    </div>
  );
};
