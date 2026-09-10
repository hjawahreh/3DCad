import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { asInteractionSessionId } from '@cad-studio/interaction-runtime';
import { SelectionRuntime, RESERVED_SELECTION_CHANNELS } from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('architecture', () => {
  it('depends only on platform-runtime and interaction-runtime', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      '@cad-studio/interaction-runtime',
      '@cad-studio/platform-runtime'
    ]);
  });

  it('does not import scene, viewport, camera, tools, kernel, react, or three', () => {
    const forbidden = [
      '@cad-studio/scene',
      '@cad-studio/viewport',
      '@cad-studio/viewport-runtime',
      '@cad-studio/camera-runtime',
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

  it('reserves lasso, paint, smart, AI, GPU picking channels', () => {
    expect(RESERVED_SELECTION_CHANNELS).toEqual(
      expect.arrayContaining(['lasso', 'paint', 'smart', 'ai-assisted', 'gpu-picking'])
    );
  });

  it('rejects use after dispose', () => {
    const runtime = new SelectionRuntime({ clock: { now: () => 0 } });
    runtime.dispose();
    expect(runtime.createSession().ok).toBe(false);
  });
});

describe('integration', () => {
  it('binds interaction session identity without mutation', () => {
    const runtime = new SelectionRuntime({ clock: { now: () => 1 } });
    const interactionSessionId = asInteractionSessionId('ix-sel-1');
    const boot = runtime.bootstrapSession({ interactionSessionId });
    expect(boot.ok).toBe(true);
    if (!boot.ok) return;
    expect(boot.value.interactionSessionId).toBe(interactionSessionId);
    boot.value.select('replace', ['entity-1']);
    expect(boot.value.getSnapshot().count).toBe(1);
    runtime.dispose();
  });
});
