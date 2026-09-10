import { describe, expect, it } from 'vitest';
import {
  MockGpuBackend,
  GpuResourceManager,
  resolveRendererConfig
} from '../src/index.js';

const createManager = (overrides?: {
  readonly maxTransientMemoryBytes?: number;
  readonly maxPersistentMemoryBytes?: number;
}): { readonly manager: GpuResourceManager; readonly backend: MockGpuBackend } => {
  const config = resolveRendererConfig(
    {
      preferredBackend: 'mock',
      ...(overrides?.maxTransientMemoryBytes === undefined
        ? {}
        : { maxTransientMemoryBytes: overrides.maxTransientMemoryBytes }),
      ...(overrides?.maxPersistentMemoryBytes === undefined
        ? {}
        : { maxPersistentMemoryBytes: overrides.maxPersistentMemoryBytes })
    },
    'resources-test'
  );
  const capabilities = {
    preferredBackend: 'mock' as const,
    availableBackends: ['mock'] as const,
    features: {
      compute: false,
      storageBuffers: false,
      float32Filterable: false,
      timestampQuery: false,
      multipleRenderTargets: true,
      depthTexture: true,
      anisotropicFiltering: false,
      instancing: true,
      textureCompression: false
    },
    limits: {
      maxTextureSize: 4096,
      maxCubeMapSize: 2048,
      maxBufferSize: 64 * 1024 * 1024,
      maxColorAttachments: 4,
      maxAnisotropy: 1,
      maxVertexAttributes: 16,
      maxUniformBufferBindingSize: 16384,
      maxComputeWorkgroupSizeX: 0
    },
    deviceName: 'MockGPU',
    vendor: 'cad-studio',
    renderer: 'MockGpuBackend',
    isSoftwareRasterizer: true
  };
  const backend = new MockGpuBackend(capabilities, config);
  return { manager: new GpuResourceManager(backend, config), backend };
};

describe('gpu resources', () => {
  it('reference-counts acquire and release', () => {
    const { manager } = createManager();
    const created = manager.createMeshBuffer({
      key: 'mesh-a',
      vertexByteLength: 96,
      indexByteLength: 24
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.refCount).toBe(1);

    const acquired = manager.acquire(created.value.id);
    expect(acquired.ok).toBe(true);
    expect(manager.get(created.value.id)?.refCount).toBe(2);

    expect(manager.release(created.value.id).ok).toBe(true);
    expect(manager.get(created.value.id)?.refCount).toBe(1);
    manager.dispose();
  });

  it('creates mesh buffers, textures, cubemaps, and render targets', () => {
    const { manager } = createManager();
    const mesh = manager.createMeshBuffer({
      key: 'mesh',
      vertexByteLength: 128,
      indexByteLength: 64,
      label: 'unit-mesh'
    });
    const texture = manager.createTexture({
      key: 'albedo',
      width: 64,
      height: 64
    });
    const cubemap = manager.createCubemap({
      key: 'env',
      width: 32,
      height: 32
    });
    const target = manager.createRenderTarget({
      key: 'rt',
      width: 128,
      height: 128,
      lifetime: 'transient'
    });

    expect(mesh.ok && texture.ok && cubemap.ok && target.ok).toBe(true);
    if (!mesh.ok || !texture.ok || !cubemap.ok || !target.ok) return;
    expect(mesh.value.kind).toBe('mesh-buffer');
    expect(texture.value.kind).toBe('texture');
    expect(cubemap.value.kind).toBe('cubemap');
    expect(target.value.kind).toBe('render-target');
    manager.dispose();
  });

  it('enforces memory budgets', () => {
    const { manager } = createManager({
      maxPersistentMemoryBytes: 1024,
      maxTransientMemoryBytes: 512
    });
    const oversize = manager.createTexture({
      key: 'huge',
      width: 64,
      height: 64,
      lifetime: 'persistent'
    });
    expect(oversize.ok).toBe(false);
    if (oversize.ok) return;
    expect(oversize.error.code).toBe('exhausted');
    manager.dispose();
  });

  it('releases transient resources at frame end', () => {
    const { manager } = createManager();
    const transient = manager.createRenderTarget({
      key: 'frame-rt',
      width: 16,
      height: 16,
      lifetime: 'transient'
    });
    expect(transient.ok).toBe(true);
    if (!transient.ok) return;

    expect(manager.release(transient.value.id).ok).toBe(true);
    expect(manager.budgets().resourceCount).toBe(1);
    manager.releaseTransient();
    expect(manager.get(transient.value.id)).toBeUndefined();
    expect(manager.budgets().transientBytes).toBe(0);
    manager.dispose();
  });

  it('disposes without leaking tracked resources', async () => {
    const { manager, backend } = createManager();
    await backend.initialize(undefined, { width: 8, height: 8 });
    manager.createMeshBuffer({ key: 'a', vertexByteLength: 32 });
    manager.createTexture({ key: 'b', width: 8, height: 8 });
    manager.createRenderTarget({
      key: 'c',
      width: 8,
      height: 8,
      lifetime: 'transient'
    });
    expect(manager.budgets().resourceCount).toBe(3);
    manager.dispose();
    expect(manager.budgets().resourceCount).toBe(0);
    expect(manager.list()).toEqual([]);
    backend.dispose();
  });
});
