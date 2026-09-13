/**
 * ClinicalTrimOverlay — viewport-only drawing surface.
 * When Freehand/Polyline is armed, pointer interaction belongs to Trim (not camera).
 * View Cube remains above and owns its own hits.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { deriveTrimInteractionState } from './ClinicalTrimInteractionState.js';

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
  const capturedPointerRef = useRef<number | undefined>(undefined);
  const state = useSyncExternalStore(
    (cb) => trim.session.subscribe(cb),
    () => trim.session.getState(),
    () => trim.session.getState()
  );

  const releaseCapturedPointer = (el: HTMLElement | null, pointerId?: number): void => {
    const id = pointerId ?? capturedPointerRef.current;
    if (id === undefined || el === null) {
      capturedPointerRef.current = undefined;
      return;
    }
    try {
      if (el.hasPointerCapture(id)) {
        el.releasePointerCapture(id);
      }
    } catch {
      // already released
    }
    capturedPointerRef.current = undefined;
  };

  useEffect(() => {
    return () => {
      releaseCapturedPointer(overlayRef.current);
      trim.controller.endDraw();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount cleanup only
  }, []);

  if (!trim.isActive()) {
    return null;
  }

  const drawingEnabled = state.drawMode === 'polyline' || state.drawMode === 'freehand';
  const interaction = deriveTrimInteractionState({
    state,
    previewReady: trim.controller.isPreviewReady(),
    pointerDrawing: trim.controller.isPointerCaptured()
  });

  const resolve = (event: React.PointerEvent): { readonly x: number; readonly y: number } => {
    const el = overlayRef.current ?? (event.currentTarget as HTMLElement);
    return localPoint(event, el);
  };

  const canvasSize = (): { readonly width: number; readonly height: number } => {
    const el = overlayRef.current;
    if (el === null) {
      return { width: 1, height: 1 };
    }
    const rect = el.getBoundingClientRect();
    return { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
  };

  const onPointerDown = (event: React.PointerEvent): void => {
    if (!drawingEnabled) {
      return;
    }
    // Only capture when the event originates on this overlay (not toolbar/panels/cube).
    if (
      event.currentTarget !== event.target &&
      !(event.target instanceof Element && event.currentTarget.contains(event.target))
    ) {
      return;
    }
    // Trim owns the mesh viewport while armed — block camera orbit/pan.
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    el.setPointerCapture(event.pointerId);
    capturedPointerRef.current = event.pointerId;
    const screen = resolve(event);
    const point = trim.controller.resolvePickPoint(screen, canvasSize());
    // Production contract: only surface hits become trim points.
    if (point.localX === undefined || point.localY === undefined || point.localZ === undefined) {
      releaseCapturedPointer(el, event.pointerId);
      trim.controller.endDraw();
      trim.session.patchStatus('Missed the scan surface — aim at the active arch mesh');
      session.notifyUi();
      return;
    }
    trim.controller.beginDraw(event.pointerId);
    trim.controller.addPoint(point);
    session.notifyUi();
  };

  const onPointerMove = (event: React.PointerEvent): void => {
    if (!drawingEnabled) {
      return;
    }
    // Keep camera from receiving moves while armed over the viewport.
    event.stopPropagation();
    const screen = resolve(event);
    const point = trim.controller.resolvePickPoint(screen, canvasSize());
    const onSurface =
      point.localX !== undefined &&
      point.localY !== undefined &&
      point.localZ !== undefined &&
      Number.isFinite(point.localX) &&
      Number.isFinite(point.localY) &&
      Number.isFinite(point.localZ);

    // Surface cursor: only while the pointer is on the scan (never sticky last-hit).
    trim.controller.setPreviewCursor(onSurface ? point : undefined);

    if (state.drawMode === 'polyline' && !trim.controller.isPointerCaptured()) {
      return;
    }
    if (state.drawMode !== 'freehand') {
      return;
    }
    if (trim.controller.isDrawing() === false || !trim.controller.isPointerCaptured()) {
      return;
    }
    if (!onSurface) {
      return;
    }
    trim.controller.addPoint(point);
  };

  const onPointerUp = (event: React.PointerEvent): void => {
    if (!drawingEnabled) {
      return;
    }
    event.stopPropagation();
    releaseCapturedPointer(event.currentTarget as HTMLElement, event.pointerId);
    trim.controller.endDraw();
    trim.controller.setPreviewCursor(undefined);
    session.notifyUi();
  };

  const onPointerLeave = (): void => {
    if (!drawingEnabled) {
      return;
    }
    if (!trim.controller.isPointerCaptured()) {
      trim.controller.setPreviewCursor(undefined);
      session.notifyUi();
    }
  };

  const onPointerCancel = onPointerUp;

  const onWheel = (event: React.WheelEvent): void => {
    // Drawing overlay must not consume wheel — forward to Camera Runtime via host.
    event.preventDefault();
    event.stopPropagation();
    const host = session.getHost();
    const deltaMode =
      event.deltaMode === 1 ? 'line' : event.deltaMode === 2 ? 'page' : 'pixel';
    const el = overlayRef.current;
    const rect = el?.getBoundingClientRect();
    host.handleRawInput({
      kind: 'wheel',
      position: {
        x: rect !== undefined ? event.clientX - rect.left : event.clientX,
        y: rect !== undefined ? event.clientY - rect.top : event.clientY
      },
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ,
      deltaMode,
      modifiers: {
        alt: event.altKey,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        shift: event.shiftKey
      },
      timestamp: event.timeStamp
    });
  };

  const pointsAttr = state.points.map((p) => `${String(p.x)},${String(p.y)}`).join(' ');
  const previewLine =
    state.drawMode === 'polyline' &&
    state.previewCursor !== undefined &&
    state.points.length > 0
      ? `${String(state.points[state.points.length - 1]!.x)},${String(state.points[state.points.length - 1]!.y)} ${String(state.previewCursor.x)},${String(state.previewCursor.y)}`
      : undefined;

  return (
    <div
      ref={overlayRef}
      className={`clinical-trim-overlay${state.previewActive ? ' clinical-trim-overlay--preview' : ''}${drawingEnabled ? ' clinical-trim-overlay--drawing' : ' clinical-trim-overlay--idle'}${interaction === 'DRAWING' ? ' clinical-trim-overlay--gesture' : ''}`}
      data-testid="clinical-trim-overlay"
      data-draw-mode={state.drawMode}
      data-interaction-state={interaction}
      data-pointer-captured={state.pointerCaptured ? 'true' : 'false'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={onPointerLeave}
      onWheel={onWheel}
    >
      <svg className="clinical-trim-svg" aria-hidden="true">
        {state.points.length > 1 ? (
          <polyline className="clinical-trim-stroke" points={pointsAttr} fill="none" />
        ) : null}
        {previewLine !== undefined ? (
          <polyline className="clinical-trim-stroke clinical-trim-stroke--preview" points={previewLine} fill="none" />
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
        {state.previewCursor !== undefined &&
        state.previewCursor.localX !== undefined &&
        state.previewCursor.localY !== undefined &&
        state.previewCursor.localZ !== undefined ? (
          <circle
            className="clinical-trim-surface-cursor"
            data-testid="clinical-trim-surface-cursor"
            cx={state.previewCursor.x}
            cy={state.previewCursor.y}
            r={6}
          />
        ) : null}
      </svg>
      <div className="clinical-trim-status" data-testid="clinical-trim-interaction-status">
        {state.statusMessage}
      </div>
    </div>
  );
};
