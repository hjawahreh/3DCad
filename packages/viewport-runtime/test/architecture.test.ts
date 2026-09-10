import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BackendSelection, DeviceCapabilityRegistry, ViewportRuntime } from '../src/index.js';
import { createFakeCanvas, createManualClock } from './helpers.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('architecture', () => {
  it('package.json depends only on allowed packages', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      '@cad-studio/platform-runtime',
      '@cad-studio/scene',
      '@cad-studio/viewport'
    ]);
  });

  it('source does not import React, Three, kernel, or clinical packages', () => {
    const forbidden = [
      'react',
      'three',
      '@cad-studio/tool-runtime',
      '@cad-studio/geometry-services',
      '@cad-studio/kernel-bridge'
    ];
    const srcFiles = ['src/index.ts', 'src/runtime.ts', 'src/session.ts', 'src/renderer-bridge.ts'];
    for (const relative of srcFiles) {
      const text = readFileSync(join(root, relative), 'utf8');
      for (const name of forbidden) {
        expect(text.includes(`from '${name}`) || text.includes(`from "${name}`)).toBe(false);
      }
    }
  });

  it('rejects use after dispose', async () => {
    const runtime = new ViewportRuntime({
      clock: createManualClock(),
      forceMockBackend: true
    });
    const created = runtime.createSession();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await runtime.bootstrapSession(created.value, createFakeCanvas());
    runtime.dispose();
    const again = runtime.createSession();
    expect(again.ok).toBe(false);
  });
});

describe('BackendSelection', () => {
  it('selects webgpu when available', () => {
    const selection = new BackendSelection().select({
      capabilities: {
        preferredBackend: 'webgpu',
        availableBackends: ['webgpu', 'webgl2'],
        features: {
          compute: true,
          storageBuffers: true,
          float32Filterable: true,
          timestampQuery: true,
          multipleRenderTargets: true,
          depthTexture: true,
          anisotropicFiltering: true,
          instancing: true,
          textureCompression: true
        },
        limits: {
          maxTextureSize: 8192,
          maxCubeMapSize: 4096,
          maxBufferSize: 1,
          maxColorAttachments: 8,
          maxAnisotropy: 16,
          maxVertexAttributes: 16,
          maxUniformBufferBindingSize: 65536,
          maxComputeWorkgroupSizeX: 256
        },
        deviceName: 'test',
        vendor: 'test',
        renderer: 'test',
        isSoftwareRasterizer: false
      },
      preferred: 'webgpu',
      allowFallback: true,
      allowMock: true
    });
    expect(selection.ok).toBe(true);
    if (!selection.ok) return;
    expect(selection.value.selected).toBe('webgpu');
  });

  it('fails when mock disallowed and only mock available', () => {
    const registry = new DeviceCapabilityRegistry();
    const probe = registry.probe({ forceMock: true, now: 0 });
    const selection = new BackendSelection().select({
      capabilities: probe.capabilities,
      preferred: 'webgpu',
      allowFallback: true,
      allowMock: false
    });
    expect(selection.ok).toBe(false);
  });
});
