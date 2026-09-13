/**
 * ClinicalMeshViewport — studio-owned mesh presenter over MeshRegistry.
 * Syncs Camera Runtime pose; does not bypass ViewportHost input / camera.
 * Platform WebGL2 backend remains clear-only; this draws clinical geometry.
 */

import { useEffect, useRef } from 'react';
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  FrontSide,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer
} from 'three';
import type { Mat4 } from '@cad-studio/scene';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import type { ClinicalMeshDescriptor } from '../import/ClinicalMeshDescriptor.js';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import type { ClinicalMeshPickHit } from './ClinicalMeshPicker.js';
import {
  buildSegmentationFaceColors,
  expandFaceColorsToVertexColors
} from '../segmentation/display/ClinicalSegmentationColors.js';
import { instanceWorldCentroid } from '../segmentation/display/ClinicalSegmentationPresentation.js';
import { inferTrimProjectionAxes } from '../../geometry-kernel/ops/trimMesh.js';
import { recordClinicalGeometryDevDiag } from '../diagnostics/ClinicalGeometryDevDiagnostics.js';

const BG: Readonly<Record<string, number>> = Object.freeze({
  dark: 0x0f1419,
  neutral: 0x1a1f26,
  'clinical-blue': 0x0c1520,
  light: 0xd8dee6
});

const applyMat4 = (mesh: Mesh, transform: Mat4): void => {
  mesh.matrix.fromArray(transform.elements as unknown as number[]);
  mesh.matrixAutoUpdate = false;
  mesh.matrixWorldNeedsUpdate = true;
};

/**
 * While Orientation is active, committed document transforms may still be identity.
 * The scene preview and camera fit use the orientation preview Mat4 — the mesh
 * presenter must use the same source of truth (PROD-002SC).
 */
const resolveDisplayTransform = (
  obj: ClinicalMeshDescriptor,
  workspace: ClinicalWorkspace
): Mat4 => {
  if (!workspace.orientation.isActive()) {
    return obj.transform;
  }
  const orientState = workspace.orientation.session.getState();
  if (orientState.caseLevel === true) {
    return orientState.preview;
  }
  if (orientState.targetObjectId !== undefined && orientState.targetObjectId === obj.id) {
    return orientState.preview;
  }
  return obj.transform;
};

const buildGeometry = (positions: Float32Array, indices: Uint32Array): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions.slice(), 3));
  geometry.setIndex(new BufferAttribute(indices.slice(), 1));
  geometry.computeVertexNormals();
  return geometry;
};

/** Non-indexed display geometry with per-face-corner colors (derived; source mesh untouched). */
const buildNonIndexedColoredGeometry = (
  positions: Float32Array,
  indices: Uint32Array,
  vertexColors: Float32Array
): BufferGeometry => {
  const faceCount = Math.floor(indices.length / 3);
  const pos = new Float32Array(faceCount * 9);
  for (let f = 0; f < faceCount; f += 1) {
    const i0 = indices[f * 3]!;
    const i1 = indices[f * 3 + 1]!;
    const i2 = indices[f * 3 + 2]!;
    const o = f * 9;
    pos[o] = positions[i0 * 3]!;
    pos[o + 1] = positions[i0 * 3 + 1]!;
    pos[o + 2] = positions[i0 * 3 + 2]!;
    pos[o + 3] = positions[i1 * 3]!;
    pos[o + 4] = positions[i1 * 3 + 1]!;
    pos[o + 5] = positions[i1 * 3 + 2]!;
    pos[o + 6] = positions[i2 * 3]!;
    pos[o + 7] = positions[i2 * 3 + 1]!;
    pos[o + 8] = positions[i2 * 3 + 2]!;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('color', new BufferAttribute(vertexColors.slice(), 3));
  geometry.computeVertexNormals();
  return geometry;
};

export const ClinicalMeshViewport = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const session = workspace.session;
  useClinicalUiRevision(session);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }

    const renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.autoClear = true;

    const scene = new Scene();
    const camera = new PerspectiveCamera(45, 1, 0.1, 10000);
    const root = new Group();
    scene.add(root);

    const ambient = new AmbientLight(0xffffff, 0.35);
    const key = new DirectionalLight(0xffffff, 0.85);
    key.position.set(2.2, 3.4, 1.6);
    const fill = new DirectionalLight(0xdbe4f0, 0.35);
    fill.position.set(-2.4, 1.2, -1.8);
    const rim = new DirectionalLight(0xc7d2e0, 0.25);
    rim.position.set(0.4, -1.5, -2.5);
    scene.add(ambient, key, fill, rim);

    const meshCache = new Map<
      string,
      {
        mesh: Mesh;
        fingerprint: string;
        material: MeshStandardMaterial;
        vizKey: string;
        labelRoot: Group;
      }
    >();

    // GEO-001C — authoritative SurfacePath visualization (mesh-local, not screen SVG).
    const trimOverlay = new Group();
    trimOverlay.matrixAutoUpdate = false;
    root.add(trimOverlay);

    const trimPathGeom = new BufferGeometry();
    const trimPathMat = new LineBasicMaterial({
      color: 0xfb923c,
      depthTest: true,
      transparent: true,
      opacity: 0.95
    });
    const trimPathLine = new Line(trimPathGeom, trimPathMat);
    trimPathLine.frustumCulled = false;
    trimPathLine.visible = false;
    trimPathLine.renderOrder = 10;
    trimOverlay.add(trimPathLine);

    const trimCursorGeom = new SphereGeometry(0.35, 12, 12);
    const trimCursorMat = new MeshStandardMaterial({
      color: 0x22c55e,
      emissive: 0x14532d,
      emissiveIntensity: 0.35,
      depthTest: true
    });
    const trimCursor = new Mesh(trimCursorGeom, trimCursorMat);
    trimCursor.visible = false;
    trimCursor.renderOrder = 11;
    trimOverlay.add(trimCursor);

    const syncTrimSurfacePath = (): void => {
      const trim = workspace.trim;
      if (!trim.isActive()) {
        trimPathLine.visible = false;
        trimCursor.visible = false;
        return;
      }
      const trimState = trim.session.getState();
      const targetId = trimState.targetObjectId as string | undefined;
      const entry = targetId !== undefined ? meshCache.get(targetId) : undefined;
      if (entry !== undefined) {
        trimOverlay.matrix.copy(entry.mesh.matrix);
        trimOverlay.matrixWorldNeedsUpdate = true;
      }

      const surfacePoints = trimState.points.filter(
        (p) =>
          typeof p.localX === 'number' &&
          typeof p.localY === 'number' &&
          typeof p.localZ === 'number' &&
          Number.isFinite(p.localX) &&
          Number.isFinite(p.localY) &&
          Number.isFinite(p.localZ)
      );
      if (surfacePoints.length >= 2) {
        const closed = trimState.closed && surfacePoints.length >= 3;
        const count = surfacePoints.length + (closed ? 1 : 0);
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < surfacePoints.length; i += 1) {
          const p = surfacePoints[i]!;
          positions[i * 3] = p.localX!;
          positions[i * 3 + 1] = p.localY!;
          positions[i * 3 + 2] = p.localZ!;
        }
        if (closed) {
          const p0 = surfacePoints[0]!;
          positions[(count - 1) * 3] = p0.localX!;
          positions[(count - 1) * 3 + 1] = p0.localY!;
          positions[(count - 1) * 3 + 2] = p0.localZ!;
        }
        trimPathGeom.setAttribute('position', new BufferAttribute(positions, 3));
        trimPathGeom.computeBoundingSphere();
        trimPathLine.visible = true;
      } else {
        trimPathLine.visible = false;
      }

      const cursor = trimState.previewCursor;
      if (
        cursor !== undefined &&
        typeof cursor.localX === 'number' &&
        typeof cursor.localY === 'number' &&
        typeof cursor.localZ === 'number'
      ) {
        trimCursor.position.set(cursor.localX, cursor.localY, cursor.localZ);
        trimCursor.visible = true;
      } else {
        trimCursor.visible = false;
      }
    };

    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const localHit = new Vector3();

    let disposed = false;
    let frame = 0;

    const clearLabels = (entry: { labelRoot: Group }): void => {
      while (entry.labelRoot.children.length > 0) {
        const child = entry.labelRoot.children[0] as Sprite;
        entry.labelRoot.remove(child);
        const mat = child.material as SpriteMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    };

    const makeFdiSprite = (text: string, warn: boolean): Sprite => {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (ctx !== null) {
        ctx.clearRect(0, 0, 128, 64);
        ctx.fillStyle = warn ? 'rgba(120, 72, 48, 0.88)' : 'rgba(28, 34, 44, 0.82)';
        ctx.fillRect(24, 12, 80, 40);
        ctx.fillStyle = '#f3efe8';
        ctx.font = '600 28px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 64, 34);
      }
      const map = new CanvasTexture(canvas);
      const material = new SpriteMaterial({
        map,
        depthTest: false,
        transparent: true,
        sizeAttenuation: true
      });
      const sprite = new Sprite(material);
      sprite.scale.set(4.5, 2.25, 1);
      return sprite;
    };

    const unregisterPick = workspace.meshPicker.register((input) => {
      if (disposed) return undefined;
      const w = Math.max(1, input.canvasWidth);
      const h = Math.max(1, input.canvasHeight);
      ndc.x = (input.screenX / w) * 2 - 1;
      ndc.y = -((input.screenY / h) * 2 - 1);
      raycaster.setFromCamera(ndc, camera);

      const preferredOnly =
        input.preferredObjectId !== undefined
          ? [...meshCache.entries()]
              .filter(([id, entry]) => id === input.preferredObjectId && entry.mesh.visible)
              .map(([, entry]) => entry.mesh)
          : undefined;

      const allVisible = [...meshCache.values()]
        .filter((entry) => entry.mesh.visible)
        .map((entry) => entry.mesh);

      const targets = preferredOnly !== undefined && preferredOnly.length > 0 ? preferredOnly : allVisible;
      const hits = raycaster.intersectObjects(targets, false);
      const hit = hits[0];
      if (hit === undefined) return undefined;
      const mesh = hit.object as Mesh;
      let objectId: string | undefined;
      for (const [id, entry] of meshCache) {
        if (entry.mesh === mesh) {
          objectId = id;
          break;
        }
      }
      if (objectId === undefined) return undefined;
      localHit.copy(hit.point);
      mesh.worldToLocal(localHit);
      const registry = session.getHost().runtimes.kernel.registry;
      const authoritative =
        registry.getByObjectId(objectId, 'working') ??
        registry.getByObjectId(objectId, 'source') ??
        registry.getByObjectId(objectId, 'display');
      const axes =
        authoritative !== undefined
          ? inferTrimProjectionAxes(authoritative)
          : ({ u: 0, v: 1, n: 2 } as const);
      const local = [localHit.x, localHit.y, localHit.z] as const;
      const result: ClinicalMeshPickHit = Object.freeze({
        objectId,
        screenX: input.screenX,
        screenY: input.screenY,
        worldX: hit.point.x,
        worldY: hit.point.y,
        worldZ: hit.point.z,
        localX: localHit.x,
        localY: localHit.y,
        localZ: localHit.z,
        meshX: local[axes.u]!,
        meshY: local[axes.v]!,
        faceIndex: hit.faceIndex ?? undefined
      });
      return result;
    });

    const syncSize = (): void => {
      const parent = canvas.parentElement;
      if (parent === null) return;
      const w = Math.max(1, Math.floor(parent.clientWidth));
      const h = Math.max(1, Math.floor(parent.clientHeight));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const rebuild = (): void => {
      const host = session.getHost();
      const doc = session.getPublicState().activeCase;
      const prefs = workspace.viewport.preferences.get();
      const selection = new Set<string>(
        (host.sessions.selectionSession?.getSnapshot().ids ?? []).map((id) => id as string)
      );
      const registry = host.runtimes.kernel.registry;
      const bg = BG[prefs.background] ?? 0x0f1419;
      scene.background = new Color(bg);
      renderer.setClearColor(bg, 1);

      const seg = workspace.segmentation;
      const segActive = seg.isActive();
      const segState = segActive ? seg.session.getState() : undefined;
      const prediction = segState?.prediction;
      const showSegViz =
        segActive &&
        prediction !== undefined &&
        segState !== undefined &&
        (segState.presentation === 'review' ||
          segState.presentation === 'rebuilding' ||
          segState.phase === 'ready-for-review');

      const visibleIds = new Set(
        (doc?.objects ?? [])
          .filter((o) => o.visible && o.displayState !== 'hidden')
          .map((o) => o.id as string)
      );

      for (const [id, entry] of meshCache) {
        if (!visibleIds.has(id)) {
          root.remove(entry.mesh);
          root.remove(entry.labelRoot);
          clearLabels(entry);
          entry.mesh.geometry.dispose();
          entry.material.dispose();
          meshCache.delete(id);
        }
      }

      for (const obj of doc?.objects ?? []) {
        if (!obj.visible || obj.displayState === 'hidden') continue;
        const id = obj.id as string;
        const working =
          registry.getByObjectId(id, 'working') ?? registry.getByObjectId(id, 'source');
        const display = registry.getByObjectId(id, 'display');
        // PROD-001: never prefer a stale display mesh over a newer working commit.
        const triangle =
          display !== undefined &&
          working !== undefined &&
          display.revision === working.revision
            ? display
            : (working ?? display);
        if (triangle === undefined) continue;

        const fingerprint = `${triangle.fingerprint}:${String(triangle.revision)}:${String(triangle.positions.length)}`;
        if (import.meta.env.DEV) {
          recordClinicalGeometryDevDiag({
            operation: 'viewport-bind',
            objectId: id,
            revision: triangle.revision,
            geometryRef: String(triangle.id),
            fingerprint: triangle.fingerprint,
            faces: Math.floor(triangle.indices.length / 3),
            vertices: Math.floor(triangle.positions.length / 3),
            role: triangle.role,
            sceneGeometryRef: String(triangle.id),
            viewportGeometryRef: String(triangle.id)
          });
        }
        const isSegTarget =
          showSegViz &&
          prediction !== undefined &&
          segState !== undefined &&
          (segState.targetObjectId as string | undefined) === id;
        const vizKey =
          isSegTarget && prediction !== undefined && segState !== undefined
            ? `${prediction.predictionId}:${segState.viewMode}:${segState.selectedInstanceId ?? ''}:${String(prediction.instances.length)}`
            : 'plain';

        let entry = meshCache.get(id);
        if (entry === undefined || entry.fingerprint !== fingerprint) {
          if (entry !== undefined) {
            root.remove(entry.mesh);
            root.remove(entry.labelRoot);
            clearLabels(entry);
            entry.mesh.geometry.dispose();
            entry.material.dispose();
          }
          const geometry = buildGeometry(triangle.positions, triangle.indices);
          const material = new MeshStandardMaterial({
            color: 0xd9cfc4,
            roughness: 0.62,
            metalness: 0.04,
            flatShading: prefs.displayMode === 'flat',
            wireframe: prefs.displayMode === 'wireframe',
            transparent: prefs.displayMode === 'xray',
            opacity: prefs.displayMode === 'xray' ? 0.45 : 1,
            side: prefs.backfaceCulling ? FrontSide : DoubleSide,
            vertexColors: false
          });
          const mesh = new Mesh(geometry, material);
          const labelRoot = new Group();
          root.add(mesh);
          root.add(labelRoot);
          entry = { mesh, fingerprint, material, vizKey: 'plain', labelRoot };
          meshCache.set(id, entry);
        }

        if (entry.vizKey !== vizKey) {
          clearLabels(entry);
          entry.mesh.geometry.dispose();
          if (isSegTarget && prediction !== undefined && segState !== undefined) {
            const faceCount = Math.floor(triangle.indices.length / 3);
            const faceColors = buildSegmentationFaceColors({
              prediction,
              viewMode: segState.viewMode,
              selectedInstanceId: segState.selectedInstanceId,
              faceCount
            });
            const vertexColors = expandFaceColorsToVertexColors(faceColors);
            entry.mesh.geometry = buildNonIndexedColoredGeometry(
              triangle.positions,
              triangle.indices,
              vertexColors
            );
            entry.material.vertexColors = true;
            entry.material.color.setHex(0xffffff);
            entry.material.emissive.setHex(0x000000);
            entry.material.emissiveIntensity = 0;

            if (segState.viewMode === 'fdi' || segState.viewMode === 'review') {
              for (const inst of prediction.instances) {
                const fdi = inst.identification.fdi;
                if (fdi === undefined && segState.viewMode === 'fdi') continue;
                const label =
                  fdi !== undefined
                    ? String(fdi)
                    : inst.identification.status === 'UNKNOWN'
                      ? '?'
                      : '·';
                const warn =
                  inst.identification.status === 'UNCERTAIN' ||
                  inst.identification.status === 'UNKNOWN' ||
                  inst.confidence < 0.5;
                const sprite = makeFdiSprite(label, warn);
                const c = instanceWorldCentroid(inst, triangle.positions, triangle.indices);
                sprite.position.set(c[0], c[1] + 1.2, c[2]);
                entry.labelRoot.add(sprite);
              }
            }
          } else {
            entry.mesh.geometry = buildGeometry(triangle.positions, triangle.indices);
            entry.material.vertexColors = false;
            applyAppearance(entry.material, obj, prefs.displayMode, selection.has(id), prefs.lighting);
          }
          entry.vizKey = vizKey;
        } else if (!isSegTarget) {
          applyAppearance(entry.material, obj, prefs.displayMode, selection.has(id), prefs.lighting);
        }

        const displayTransform = resolveDisplayTransform(obj, workspace);
        applyMat4(entry.mesh, displayTransform);
        applyMat4(entry.labelRoot as unknown as Mesh, displayTransform);
        entry.mesh.visible = true;
        entry.labelRoot.visible = true;
      }
    };

    const tick = (): void => {
      if (disposed) return;
      frame = requestAnimationFrame(tick);
      syncSize();
      rebuild();

      const cam = session.getHost().sessions.cameraSession?.getSnapshot();
      if (cam !== undefined) {
        camera.position.set(cam.eye.x, cam.eye.y, cam.eye.z);
        camera.up.set(cam.up.x, cam.up.y, cam.up.z);
        camera.near = Math.max(0.001, cam.near);
        camera.far = Math.max(camera.near + 1, cam.far);
        camera.fov = cam.fovDegrees;
        camera.aspect =
          cam.viewportSize.height > 0
            ? cam.viewportSize.width / cam.viewportSize.height
            : camera.aspect;
        camera.updateProjectionMatrix();
        camera.lookAt(cam.target.x, cam.target.y, cam.target.z);
      }

      const light = workspace.viewport.preferences.get().lighting;
      ambient.intensity = light === 'flat' ? 0.75 : light === 'soft' ? 0.45 : light === 'high-contrast' ? 0.22 : 0.35;
      key.intensity = light === 'flat' ? 0.2 : light === 'soft' ? 0.55 : light === 'high-contrast' ? 1.15 : 0.85;
      fill.intensity = light === 'flat' ? 0.15 : 0.35;

      syncTrimSurfacePath();
      renderer.render(scene, camera);
    };

    syncSize();
    tick();

    const onPointerUp = (event: PointerEvent): void => {
      if (!workspace.segmentation.isActive()) return;
      const state = workspace.segmentation.session.getState();
      if (state.phase !== 'ready-for-review' || state.prediction === undefined) return;
      const rect = canvas.getBoundingClientRect();
      workspace.segmentation.pickToothAt({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        width: rect.width,
        height: rect.height
      });
    };
    canvas.addEventListener('pointerup', onPointerUp);

    return () => {
      disposed = true;
      canvas.removeEventListener('pointerup', onPointerUp);
      unregisterPick();
      cancelAnimationFrame(frame);
      for (const entry of meshCache.values()) {
        clearLabels(entry);
        entry.mesh.geometry.dispose();
        entry.material.dispose();
      }
      meshCache.clear();
      trimPathGeom.dispose();
      trimPathMat.dispose();
      trimCursorGeom.dispose();
      trimCursorMat.dispose();
      renderer.dispose();
    };
  }, [session, workspace]);

  return (
    <canvas
      ref={canvasRef}
      className="clinical-mesh-viewport"
      data-testid="clinical-mesh-viewport"
      aria-hidden="true"
    />
  );
};

const applyAppearance = (
  material: MeshStandardMaterial,
  obj: ClinicalMeshDescriptor,
  mode: string,
  selected: boolean,
  lighting: string
): void => {
  const base = obj.archRole === 'lower' ? 0xcfc6bb : 0xe2d8cc;
  material.color.setHex(selected ? 0xb8d4ef : base);
  material.emissive.setHex(selected ? 0x1a3a5c : 0x000000);
  material.emissiveIntensity = selected ? 0.22 : 0;
  material.wireframe = mode === 'wireframe' || mode === 'solid-wireframe';
  material.flatShading = mode === 'flat';
  material.transparent = mode === 'xray';
  material.opacity = mode === 'xray' ? 0.42 : 1;
  material.roughness = lighting === 'high-contrast' ? 0.45 : 0.62;
  material.needsUpdate = true;
};
