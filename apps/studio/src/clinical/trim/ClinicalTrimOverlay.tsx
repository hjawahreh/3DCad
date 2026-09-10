import { useSyncExternalStore } from 'react';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';

/**
 * Trim boundary overlay — live drawing feedback (non-destructive).
 */
export const ClinicalTrimOverlay = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element | null => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const trim = workspace.trim;
  const state = useSyncExternalStore(
    (cb) => trim.session.subscribe(cb),
    () => trim.session.getState(),
    () => trim.session.getState()
  );

  if (!trim.isActive()) {
    return null;
  }

  const onPointerDown = (event: React.PointerEvent): void => {
    if (state.drawMode !== 'polyline') {
      trim.controller.beginDraw(event.pointerId);
      trim.controller.addPoint({ x: event.clientX, y: event.clientY });
      return;
    }
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    trim.controller.beginDraw(event.pointerId);
    trim.controller.addPoint({ x: event.clientX, y: event.clientY });
  };

  const onPointerMove = (event: React.PointerEvent): void => {
    if (state.drawMode === 'freehand') {
      trim.controller.addPoint({ x: event.clientX, y: event.clientY });
    }
  };

  const onPointerUp = (event: React.PointerEvent): void => {
    trim.controller.endDraw();
    if (state.drawMode === 'polyline') {
      trim.controller.addPoint({ x: event.clientX, y: event.clientY });
    }
  };

  const pointsAttr = state.points.map((p) => `${String(p.x)},${String(p.y)}`).join(' ');

  return (
    <div
      className={`clinical-trim-overlay${state.previewActive ? ' clinical-trim-overlay--preview' : ''}`}
      data-testid="clinical-trim-overlay"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <svg className="clinical-trim-svg" aria-hidden="true">
        {state.points.length > 1 ? (
          <polyline className="clinical-trim-stroke" points={pointsAttr} fill="none" />
        ) : null}
        {state.closed && state.points.length >= 3 ? (
          <polygon className="clinical-trim-fill" points={pointsAttr} />
        ) : null}
        {state.points.map((p, index) => (
          <circle
            key={`${String(index)}-${String(p.x)}-${String(p.y)}`}
            className={
              state.activePointIndex === index
                ? 'clinical-trim-point clinical-trim-point--active'
                : state.hoveredPointIndex === index
                  ? 'clinical-trim-point clinical-trim-point--hover'
                  : 'clinical-trim-point'
            }
            cx={p.x}
            cy={p.y}
            r={4}
          />
        ))}
      </svg>
      <div className="clinical-trim-status">{state.statusMessage}</div>
    </div>
  );
};
