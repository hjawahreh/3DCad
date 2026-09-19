/**
 * ClinicalTrimOverlay — direct clinical drawing.
 * Lasso/Curve: pointer up → completeGestureAndTrim (close + real cut + auto-accept).
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import {
  deriveTrimInteractionState,
  trimGuidedMessage
} from './ClinicalTrimInteractionState.js';
import { isLassoLikeTrimMode, isStrokeTrimMode } from './ClinicalTrimState.js';

const CLOSE_SNAP_PX = 14;

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
  const completingRef = useRef(false);
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

  const drawingEnabled =
    trim.controller.isEditingReady() &&
    (isStrokeTrimMode(state.drawMode) || state.drawMode === 'plane');
  const interaction = deriveTrimInteractionState({
    state,
    previewReady: trim.controller.isPreviewReady(),
    pointerDrawing: trim.controller.isPointerCaptured()
  });
  const guide = trimGuidedMessage(interaction, state.drawMode);
  const first = state.points[0];
  const nearFirst =
    !state.closed &&
    first !== undefined &&
    state.points.length >= 3 &&
    state.hoveredPointIndex === 0;

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

  const finishStroke = (): void => {
    if (completingRef.current) return;
    const live = trim.session.getState();
    if (!isLassoLikeTrimMode(live.drawMode)) return;
    if (live.points.length < 3) {
      trim.session.patchStatus('Draw a larger loop, then release.');
      session.notifyUi();
      return;
    }
    completingRef.current = true;
    void trim
      .completeGestureAndTrim()
      .finally(() => {
        completingRef.current = false;
        session.notifyUi();
      });
  };

  const onPointerDown = (event: React.PointerEvent): void => {
    if (!drawingEnabled || completingRef.current) {
      return;
    }
    if (
      event.currentTarget !== event.target &&
      !(event.target instanceof Element && event.currentTarget.contains(event.target))
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    const screen = resolve(event);
    const live = trim.session.getState();
    const liveFirst = live.points[0];

    if (
      !live.closed &&
      liveFirst !== undefined &&
      live.points.length >= 3 &&
      Math.hypot(screen.x - liveFirst.x, screen.y - liveFirst.y) <= CLOSE_SNAP_PX
    ) {
      releaseCapturedPointer(el, event.pointerId);
      finishStroke();
      return;
    }

    el.setPointerCapture(event.pointerId);
    capturedPointerRef.current = event.pointerId;
    const point = trim.controller.resolvePickPoint(screen, canvasSize());
    if (point.localX === undefined || point.localY === undefined || point.localZ === undefined) {
      releaseCapturedPointer(el, event.pointerId);
      trim.controller.endDraw();
      trim.session.patchStatus('Aim at the scan surface');
      session.notifyUi();
      return;
    }
    trim.controller.beginDraw(event.pointerId);
    trim.controller.addPoint(point);
    session.notifyUi();
  };

  const onPointerMove = (event: React.PointerEvent): void => {
    if (!drawingEnabled || completingRef.current) {
      return;
    }
    event.stopPropagation();
    const screen = resolve(event);
    const live = trim.session.getState();
    const liveFirst = live.points[0];
    if (!live.closed && liveFirst !== undefined && live.points.length >= 3) {
      const dist = Math.hypot(screen.x - liveFirst.x, screen.y - liveFirst.y);
      const next = dist <= CLOSE_SNAP_PX ? 0 : undefined;
      if (live.hoveredPointIndex !== next) {
        trim.session.setHover(next);
      }
    }
    const point = trim.controller.resolvePickPoint(screen, canvasSize());
    const onSurface =
      point.localX !== undefined &&
      point.localY !== undefined &&
      point.localZ !== undefined &&
      Number.isFinite(point.localX);

    trim.controller.setPreviewCursor(onSurface ? point : undefined);

    if (!isLassoLikeTrimMode(live.drawMode)) {
      return;
    }
    if (!trim.controller.isDrawing() || !trim.controller.isPointerCaptured()) {
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
    const live = trim.session.getState();
    if (isLassoLikeTrimMode(live.drawMode) && live.points.length >= 3) {
      finishStroke();
    } else {
      session.notifyUi();
    }
  };

  const onPointerLeave = (): void => {
    if (!drawingEnabled) return;
    if (!trim.controller.isPointerCaptured()) {
      trim.controller.setPreviewCursor(undefined);
      trim.session.setHover(undefined);
      session.notifyUi();
    }
  };

  const onPointerCancel = onPointerUp;

  const onWheel = (event: React.WheelEvent): void => {
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

  return (
    <div
      ref={overlayRef}
      className={`clinical-trim-overlay${drawingEnabled ? ' clinical-trim-overlay--drawing' : ' clinical-trim-overlay--idle'}${interaction === 'DRAWING' ? ' clinical-trim-overlay--gesture' : ''}${interaction === 'PREVIEWING' || interaction === 'COMMITTING' ? ' clinical-trim-overlay--processing' : ''}`}
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
        {state.closed && state.points.length >= 3 ? (
          <polygon className="clinical-trim-fill" points={pointsAttr} />
        ) : null}
        {/* Workstation: one clean line — no dense point handles */}
        {first !== undefined ? (
          <circle
            className={
              nearFirst
                ? 'clinical-trim-point clinical-trim-point--close-target'
                : 'clinical-trim-point'
            }
            cx={first.x}
            cy={first.y}
            r={nearFirst ? 7 : 3}
          />
        ) : null}
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
      {(interaction === 'PREVIEWING' || interaction === 'COMMITTING' || interaction === 'VALIDATING') && (
        <div className="clinical-trim-processing" data-testid="clinical-trim-processing">
          TRIMMING…
        </div>
      )}
      <div className="clinical-trim-status" data-testid="clinical-trim-interaction-status">
        {nearFirst ? 'Release to close & trim' : guide}
      </div>
    </div>
  );
};
