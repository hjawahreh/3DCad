import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ProjectRuntime, RESERVED_PROJECT_CHANNELS } from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('architecture', () => {
  it('depends only on platform-runtime', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies)).toEqual(['@cad-studio/platform-runtime']);
  });

  it('does not import viewport, graphics, camera, selection, scene, tools, geometry, kernel', () => {
    const forbidden = [
      '@cad-studio/viewport',
      '@cad-studio/viewport-runtime',
      '@cad-studio/camera-runtime',
      '@cad-studio/selection-runtime',
      '@cad-studio/interaction-runtime',
      '@cad-studio/scene',
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

  it('reserves cloud sync, collaboration, version server, multi-user channels', () => {
    expect(RESERVED_PROJECT_CHANNELS).toEqual(
      expect.arrayContaining([
        'cloud-sync',
        'collaborative-editing',
        'project-version-server',
        'multi-user-sessions'
      ])
    );
  });

  it('rejects use after dispose', () => {
    const runtime = new ProjectRuntime({ clock: { now: () => 0 } });
    runtime.dispose();
    expect(runtime.createSession().ok).toBe(false);
  });
});

describe('integration', () => {
  it('coordinates create → dirty → save without persistence I/O', () => {
    const runtime = new ProjectRuntime({
      clock: { now: () => 1 },
      scheduler: {
        schedule: () => 1,
        cancel: () => undefined
      },
      defaultConfiguration: { autosaveEnabled: false }
    });
    const session = runtime.createSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    expect(session.value.create({ name: 'Integration' }).ok).toBe(true);
    expect(session.value.modify().ok).toBe(true);
    expect(session.value.save().ok).toBe(true);
    expect(session.value.getHistory().size()).toBeGreaterThan(0);
    expect(runtime.getRecentProjects().size()).toBe(1);
    runtime.dispose();
  });
});
