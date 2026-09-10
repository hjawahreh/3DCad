import { describe, expect, it } from 'vitest';
import {
  RendererRegistry,
  asShaderId,
  createRenderer,
  renderSuccess
} from '../src/index.js';

describe('renderer', () => {
  it('exposes session info for an active renderer', async () => {
    const created = await createRenderer({
      id: 'renderer-info',
      forceBackend: 'mock',
      preferredBackend: 'mock',
      canvasSize: { width: 128, height: 96 }
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const info = created.value.sessionInfo();
    expect(info.id).toBe(created.value.id);
    expect(info.backend).toBe('mock');
    expect(info.size).toEqual({ width: 128, height: 96 });
    expect(info.disposed).toBe(false);
    created.value.dispose();
    expect(created.value.sessionInfo().disposed).toBe(true);
  });

  it('exposes inspector and debug services', async () => {
    const created = await createRenderer({
      id: 'renderer-debug',
      forceBackend: 'mock',
      preferredBackend: 'mock'
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const mesh = created.value.resources.createMeshBuffer({
      key: 'inspect-mesh',
      vertexByteLength: 48
    });
    expect(mesh.ok).toBe(true);
    expect(created.value.inspector.list().some((entry) => entry.key === 'inspect-mesh')).toBe(
      true
    );

    const debug = created.value.debug.setState({ wireframe: true, showBounds: true });
    expect(debug.wireframe).toBe(true);
    expect(debug.showBounds).toBe(true);
    created.value.debug.reset();
    expect(created.value.debug.getState().wireframe).toBe(false);
    created.value.dispose();
  });

  it('owns material and shader registries on the renderer', async () => {
    const created = await createRenderer({
      id: 'renderer-assets',
      forceBackend: 'mock',
      preferredBackend: 'mock'
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const material = created.value.materials.create('pbr');
    expect(material.ok).toBe(true);

    const shader = created.value.shaders.register(
      `@vertex fn vs() -> @builtin(position) vec4f { return vec4f(0.0); }`,
      { id: asShaderId('renderer-shader') }
    );
    expect(shader.ok).toBe(true);
    expect(created.value.materials.list()).toHaveLength(1);
    expect(created.value.shaders.list()).toHaveLength(1);
    created.value.dispose();
  });

  it('rejects duplicate renderer registry entries', async () => {
    const registry = new RendererRegistry();
    const first = await createRenderer({
      id: 'dup-renderer',
      forceBackend: 'mock',
      preferredBackend: 'mock',
      registry
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const duplicate = registry.register({
      id: first.value.id,
      dispose: () => undefined,
      sessionInfo: () => first.value.sessionInfo()
    });
    expect(duplicate.ok).toBe(false);
    if (duplicate.ok) return;
    expect(duplicate.error.code).toBe('conflict');
    expect(renderSuccess(true).ok).toBe(true);
    first.value.dispose();
  });
});
