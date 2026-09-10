import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { asInteractionSessionId } from '@cad-studio/interaction-runtime';
import { asViewportId } from '@cad-studio/viewport-runtime';
import { CameraRuntime, RESERVED_CAMERA_CHANNELS, vec3 } from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('architecture', () => {
  it('depends only on allowed packages', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      '@cad-studio/interaction-runtime',
      '@cad-studio/platform-runtime',
      '@cad-studio/viewport-runtime'
    ]);
  });

  it('does not import scene, graphics viewport, tools, kernel, react, or three', () => {
    const forbidden = [
      '@cad-studio/scene',
      '@cad-studio/viewport',
      '@cad-studio/tool-runtime',
      '@cad-studio/geometry-services',
      '@cad-studio/kernel-bridge',
      'react',
      'three'
    ];
    const importOf = (text: string, name: string): boolean => {
      const patterns = [
        `from '${name}'`,
        `from "${name}"`,
        `from '${name}/`,
        `from "${name}/`
      ];
      return patterns.some((p) => text.includes(p));
    };
    for (const relative of ['src/index.ts', 'src/runtime.ts', 'src/session.ts']) {
      const text = readFileSync(join(root, relative), 'utf8');
      for (const name of forbidden) {
        expect(importOf(text, name)).toBe(false);
      }
    }
  });

  it('reserves fly-through, VR, stereo, cinematic channels', () => {
    expect(RESERVED_CAMERA_CHANNELS).toEqual(
      expect.arrayContaining([
        'fly-through',
        'vr-camera',
        'stereo-camera',
        'cinematic-animation'
      ])
    );
  });

  it('rejects use after dispose', () => {
    const runtime = new CameraRuntime({ clock: { now: () => 0 } });
    runtime.dispose();
    expect(runtime.createSession().ok).toBe(false);
  });
});

describe('integration', () => {
  it('binds viewport and interaction identities without mutating those runtimes', () => {
    const runtime = new CameraRuntime({ clock: { now: () => 1 } });
    const viewportId = asViewportId('vp-cam-1');
    const interactionSessionId = asInteractionSessionId('ix-cam-1');
    const boot = runtime.bootstrapSession({
      viewportId,
      interactionSessionId,
      viewportSize: { width: 640, height: 480 },
      configuration: { eye: vec3(1, 1, 1) }
    });
    expect(boot.ok).toBe(true);
    if (!boot.ok) return;
    expect(runtime.getSessionForViewport(viewportId)?.sessionId).toBe(boot.value.sessionId);
    expect(boot.value.interactionSessionId).toBe(interactionSessionId);
    boot.value.orbit(0.05, 0);
    expect(boot.value.getSnapshot().aspect).toBeCloseTo(640 / 480, 5);
    runtime.dispose();
  });
});
