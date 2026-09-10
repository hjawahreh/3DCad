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
  Color,
  DirectionalLight,
  DoubleSide,
  FrontSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer
} from 'three';
import type { Mat4 } from '@cad-studio/scene';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import type { ClinicalMeshDescriptor } from '../import/ClinicalMeshDescriptor.js';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';

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

const buildGeometry = (positions: Float32Array, indices: Uint32Array): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions.slice(), 3));
  geometry.setIndex(new BufferAttribute(indices.slice(), 1));
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
      }
    >();

    let disposed = false;
    let frame = 0;

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

      const visibleIds = new Set(
        (doc?.objects ?? [])
          .filter((o) => o.visible && o.displayState !== 'hidden')
          .map((o) => o.id as string)
      );

      for (const [id, entry] of meshCache) {
        if (!visibleIds.has(id)) {
          root.remove(entry.mesh);
          entry.mesh.geometry.dispose();
          entry.material.dispose();
          meshCache.delete(id);
        }
      }

      for (const obj of doc?.objects ?? []) {
        if (!obj.visible || obj.displayState === 'hidden') continue;
        const id = obj.id as string;
        const triangle =
          registry.getByObjectId(id, 'display') ??
          registry.getByObjectId(id, 'working') ??
          registry.getByObjectId(id, 'source');
        if (triangle === undefined) continue;

        const fingerprint = `${triangle.fingerprint}:${String(triangle.revision)}:${String(triangle.positions.length)}`;
        let entry = meshCache.get(id);
        if (entry === undefined || entry.fingerprint !== fingerprint) {
          if (entry !== undefined) {
            root.remove(entry.mesh);
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
            side: prefs.backfaceCulling ? FrontSide : DoubleSide
          });
          const mesh = new Mesh(geometry, material);
          root.add(mesh);
          entry = { mesh, fingerprint, material };
          meshCache.set(id, entry);
        }

        applyAppearance(entry.material, obj, prefs.displayMode, selection.has(id), prefs.lighting);
        applyMat4(entry.mesh, obj.transform);
        entry.mesh.visible = true;
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

      renderer.render(scene, camera);
    };

    syncSize();
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      for (const entry of meshCache.values()) {
        entry.mesh.geometry.dispose();
        entry.material.dispose();
      }
      meshCache.clear();
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
