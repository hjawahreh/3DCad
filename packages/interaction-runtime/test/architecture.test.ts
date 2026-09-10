import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { asViewportId } from '@cad-studio/viewport-runtime';
import {
  EMPTY_MODIFIERS,
  InteractionRuntime,
  RESERVED_INPUT_CHANNELS
} from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('architecture', () => {
  it('depends only on platform-runtime and viewport-runtime', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      '@cad-studio/platform-runtime',
      '@cad-studio/viewport-runtime'
    ]);
  });

  it('source does not import scene, viewport graphics, tools, kernel, react, or three', () => {
    const forbidden = [
      '@cad-studio/scene',
      '@cad-studio/viewport',
      '@cad-studio/tool-runtime',
      '@cad-studio/geometry-services',
      '@cad-studio/kernel-bridge',
      'react',
      'three'
    ];
    const files = [
      'src/index.ts',
      'src/runtime.ts',
      'src/session.ts',
      'src/routers.ts'
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
    for (const relative of files) {
      const text = readFileSync(join(root, relative), 'utf8');
      for (const name of forbidden) {
        expect(importOf(text, name)).toBe(false);
      }
    }
  });

  it('reserves advanced gesture / pen / VR channels', () => {
    expect(RESERVED_INPUT_CHANNELS).toContain('multi-touch-gesture');
    expect(RESERVED_INPUT_CHANNELS).toContain('pen-pressure-extension');
    expect(RESERVED_INPUT_CHANNELS).toContain('vr-input');
  });

  it('rejects use after dispose', () => {
    const runtime = new InteractionRuntime({ clock: { now: () => 0 } });
    runtime.dispose();
    expect(runtime.createSession().ok).toBe(false);
  });
});

describe('integration with viewport identity', () => {
  it('binds a session to a viewport id without mutating viewport runtime', () => {
    const runtime = new InteractionRuntime({ clock: { now: () => 1 } });
    const viewportId = asViewportId('viewport-test-1');
    const boot = runtime.bootstrapSession({ viewportId });
    expect(boot.ok).toBe(true);
    if (!boot.ok) return;
    expect(runtime.getSessionForViewport(viewportId)?.sessionId).toBe(boot.value.sessionId);
    boot.value.handle({
      kind: 'pointer',
      phase: 'move',
      pointerId: 1,
      pointerType: 'mouse',
      position: { x: 0, y: 0 },
      buttons: 0,
      button: 'none',
      modifiers: EMPTY_MODIFIERS,
      timestamp: 1
    });
    runtime.dispose();
  });
});
