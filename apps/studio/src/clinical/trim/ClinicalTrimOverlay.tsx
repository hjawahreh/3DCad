/**
 * ClinicalTrimOverlay — live drawing feedback in overlay-local CSS pixels.
 * Uses the same coordinate space as the clinical document host / mesh viewport.
 */

import { useRef, useSyncExternalStore } from 'react';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';

const localPoint = (
  event: React.PointerEvent,
  el: HTMLElement
): { readonly x: number; readonly y: number } => {
  const rect = el.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
};

export const ClinicalTrimOverlay = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element | null => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const trim = workspace.trim;
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const state = useSyncExternalStore(
    (cb) => trim.session.subscribe(cb),
    () => trim.session.getState(),
    () => trim.session.getState()
  );

  if (!trim.isActive()) {
    return null;
  }

  const resolve = (event: React.PointerEvent): { readonly x: number; readonly y: number } => {
    const el = overlayRef.current ?? (event.currentTarget as HTMLElement);
    return localPoint(event, el);
  };

  const onPointerDown = (event: React.PointerEvent): void => {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const point = resolve(event);
    trim.controller.beginDraw(event.pointerId);
    trim.controller.addPoint(point);
  };

  const onPointerMove = (event: React.PointerEvent): void => {
    if (state.drawMode !== 'freehand') {
      return;
    }
    if (trim.controller.isDrawing() === false) {
      return;
    }
    trim.controller.addPoint(resolve(event));
  };

  const onPointerUp = (event: React.PointerEvent): void => {
    // Polyline: points are added on pointer down only. Freehand ends the stroke here.
    trim.controller.endDraw();
    void event;
  };

  const pointsAttr = state.points.map((p) => `${String(p.x)},${String(p.y)}`).join(' ');

  return (
    <div
      ref={overlayRef}
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
