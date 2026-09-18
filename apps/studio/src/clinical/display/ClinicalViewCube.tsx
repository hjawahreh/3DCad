/**
 * ClinicalViewCube — screen-space orientation widget for the clinical viewport.
 */

import { useCallback, useSyncExternalStore } from 'react';
import type { CameraSnapshot } from '@cad-studio/camera-runtime';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import {
  computeViewCubeRotationDeg,
  resolveClosestClinicalFace,
  type ClinicalViewCubeFace
} from './ClinicalViewCubeMath.js';

const FACE_LABELS: Readonly<Record<ClinicalViewCubeFace, string>> = Object.freeze({
  front: 'ANTERIOR',
  back: 'POSTERIOR',
  left: 'LEFT',
  right: 'RIGHT',
  top: 'UPPER',
  bottom: 'LOWER'
});

const FACE_TITLES: Readonly<Record<ClinicalViewCubeFace, string>> = Object.freeze({
  front: 'Anterior / Facial',
  back: 'Posterior',
  left: 'Left',
  right: 'Right',
  top: 'Upper arch',
  bottom: 'Lower'
});

const CORNERS: ReadonlyArray<{
  readonly id: string;
  readonly faces: readonly ClinicalViewCubeFace[];
  readonly className: string;
  readonly title: string;
}> = Object.freeze([
  { id: 'ftl', faces: ['front', 'top', 'left'], className: 'clinical-view-cube__corner--ftl', title: 'Anterior occlusal left' },
  { id: 'ftr', faces: ['front', 'top', 'right'], className: 'clinical-view-cube__corner--ftr', title: 'Anterior occlusal right' },
  { id: 'fbl', faces: ['front', 'bottom', 'left'], className: 'clinical-view-cube__corner--fbl', title: 'Anterior inferior left' },
  { id: 'fbr', faces: ['front', 'bottom', 'right'], className: 'clinical-view-cube__corner--fbr', title: 'Anterior inferior right' },
  { id: 'btl', faces: ['back', 'top', 'left'], className: 'clinical-view-cube__corner--btl', title: 'Posterior occlusal left' },
  { id: 'btr', faces: ['back', 'top', 'right'], className: 'clinical-view-cube__corner--btr', title: 'Posterior occlusal right' },
  { id: 'bbl', faces: ['back', 'bottom', 'left'], className: 'clinical-view-cube__corner--bbl', title: 'Posterior inferior left' },
  { id: 'bbr', faces: ['back', 'bottom', 'right'], className: 'clinical-view-cube__corner--bbr', title: 'Posterior inferior right' }
]);

const EDGES: ReadonlyArray<{
  readonly id: string;
  readonly faces: readonly [ClinicalViewCubeFace, ClinicalViewCubeFace];
  readonly className: string;
  readonly title: string;
}> = Object.freeze([
  { id: 'front-top', faces: ['front', 'top'], className: 'clinical-view-cube__edge--front-top', title: 'Anterior occlusal' },
  { id: 'front-bottom', faces: ['front', 'bottom'], className: 'clinical-view-cube__edge--front-bottom', title: 'Anterior inferior' },
  { id: 'back-top', faces: ['back', 'top'], className: 'clinical-view-cube__edge--back-top', title: 'Posterior occlusal' },
  { id: 'back-bottom', faces: ['back', 'bottom'], className: 'clinical-view-cube__edge--back-bottom', title: 'Posterior inferior' },
  { id: 'left-top', faces: ['left', 'top'], className: 'clinical-view-cube__edge--left-top', title: 'Left occlusal' },
  { id: 'right-top', faces: ['right', 'top'], className: 'clinical-view-cube__edge--right-top', title: 'Right occlusal' },
  { id: 'left-bottom', faces: ['left', 'bottom'], className: 'clinical-view-cube__edge--left-bottom', title: 'Left inferior' },
  { id: 'right-bottom', faces: ['right', 'bottom'], className: 'clinical-view-cube__edge--right-bottom', title: 'Right inferior' },
  { id: 'front-left', faces: ['front', 'left'], className: 'clinical-view-cube__edge--front-left', title: 'Anterior left' },
  { id: 'front-right', faces: ['front', 'right'], className: 'clinical-view-cube__edge--front-right', title: 'Anterior right' },
  { id: 'back-left', faces: ['back', 'left'], className: 'clinical-view-cube__edge--back-left', title: 'Posterior left' },
  { id: 'back-right', faces: ['back', 'right'], className: 'clinical-view-cube__edge--back-right', title: 'Posterior right' }
]);

const useCameraSnapshot = (workspace: ClinicalWorkspace): CameraSnapshot | undefined => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  return useSyncExternalStore(
    (onChange) => {
      const camera = session.getHost().sessions.cameraSession;
      if (camera === undefined) {
        return () => undefined;
      }
      return camera.getEvents().subscribe((event) => {
        if (
          event.type === 'navigate' ||
          event.type === 'animation' ||
          event.type === 'sync'
        ) {
          onChange();
        }
      });
    },
    () => session.getHost().sessions.cameraSession?.getSnapshot(),
    () => session.getHost().sessions.cameraSession?.getSnapshot()
  );
};

const isolatePointer = (event: React.SyntheticEvent): void => {
  event.stopPropagation();
};

export const ClinicalViewCube = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element | null => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const snapshot = useCameraSnapshot(workspace);
  const doc = session.getPublicState().activeCase;

  const onFace = useCallback(
    (face: ClinicalViewCubeFace) => {
      workspace.viewport.presentClinicalCubeView(face);
    },
    [workspace]
  );

  const onCorner = useCallback(
    (faces: readonly ClinicalViewCubeFace[]) => {
      workspace.viewport.presentClinicalCubeCorner(faces);
    },
    [workspace]
  );

  const onHome = useCallback(() => {
    // Home ≡ View Cube Anterior (Ant) + clinical fit.
    workspace.viewport.presentClinicalCubeView('front');
  }, [workspace]);

  if (doc === undefined || snapshot === undefined || !workspace.viewport.isReady()) {
    return null;
  }

  const activeFace = resolveClosestClinicalFace(snapshot);
  const rotation = computeViewCubeRotationDeg(snapshot);
  const transform = `rotateX(${rotation.x.toFixed(2)}deg) rotateY(${rotation.y.toFixed(2)}deg) rotateZ(${rotation.z.toFixed(2)}deg)`;

  return (
    <div
      className="clinical-view-cube"
      data-testid="clinical-view-cube"
      aria-label="View orientation"
      onPointerDown={isolatePointer}
      onPointerUp={isolatePointer}
      onPointerMove={isolatePointer}
      onClick={isolatePointer}
      onWheel={isolatePointer}
    >
      <button
        type="button"
        className="clinical-view-cube__home"
        data-testid="clinical-view-cube-home"
        title="Clinical default (anterior)"
        onClick={onHome}
      >
        Home
      </button>
      <div className="clinical-view-cube__stage">
        <div className="clinical-view-cube__cube" style={{ transform }}>
          {(Object.keys(FACE_LABELS) as ClinicalViewCubeFace[]).map((face) => (
            <button
              key={face}
              type="button"
              className={`clinical-view-cube__face clinical-view-cube__face--${face}${activeFace === face ? ' clinical-view-cube__face--active' : ''}`}
              data-testid={`clinical-view-cube-${face}`}
              data-clinical-face={face}
              title={FACE_TITLES[face]}
              aria-label={FACE_TITLES[face]}
              aria-pressed={activeFace === face}
              onClick={() => onFace(face)}
            >
              {FACE_LABELS[face]}
            </button>
          ))}
          {EDGES.map((edge) => (
            <button
              key={edge.id}
              type="button"
              className={`clinical-view-cube__edge ${edge.className}`}
              title={edge.title}
              aria-label={edge.title}
              onClick={() => onCorner(edge.faces)}
            />
          ))}
          {CORNERS.map((corner) => (
            <button
              key={corner.id}
              type="button"
              className={`clinical-view-cube__corner ${corner.className}`}
              title={corner.title}
              aria-label={corner.title}
              onClick={() => onCorner(corner.faces)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
