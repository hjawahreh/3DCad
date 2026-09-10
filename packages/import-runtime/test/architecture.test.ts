import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { asProjectSessionId } from '@cad-studio/project-runtime';
import {
  ImportRuntime,
  RESERVED_IMPORT_FORMATS,
  RESERVED_PARSER_CONTRACTS
} from '../src/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('architecture', () => {
  it('depends only on platform-runtime and project-runtime', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      '@cad-studio/platform-runtime',
      '@cad-studio/project-runtime'
    ]);
  });

  it('does not import scene, viewport, camera, selection, graphics, geometry, tools, kernel', () => {
    const forbidden = [
      '@cad-studio/scene',
      '@cad-studio/viewport',
      '@cad-studio/viewport-runtime',
      '@cad-studio/camera-runtime',
      '@cad-studio/selection-runtime',
      '@cad-studio/interaction-runtime',
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
    for (const relative of ['src/index.ts', 'src/runtime.ts', 'src/pipeline.ts', 'src/plugin.ts']) {
      const text = readFileSync(join(root, relative), 'utf8');
      for (const name of forbidden) {
        expect(importOf(text, name)).toBe(false);
      }
    }
  });

  it('reserves parser contracts without implementing parsers', () => {
    expect(RESERVED_IMPORT_FORMATS).toEqual(
      expect.arrayContaining(['stl', 'obj', 'ply', 'off', '3mf', 'gltf', 'step', 'iges'])
    );
    expect(RESERVED_PARSER_CONTRACTS.map((c) => c.format)).toEqual(
      expect.arrayContaining(['STL', 'OBJ', 'PLY', 'OFF', '3MF', 'GLTF', 'STEP', 'IGES'])
    );
    const pluginSrc = readFileSync(join(root, 'src/plugin.ts'), 'utf8');
    expect(pluginSrc.includes('parseStl') || pluginSrc.includes('THREE.')).toBe(false);
  });

  it('rejects use after dispose', () => {
    const runtime = new ImportRuntime({ clock: { now: () => 0 } });
    runtime.dispose();
    expect(runtime.createSession().ok).toBe(false);
  });
});

describe('integration', () => {
  it('binds project session identity and completes import via plug-in', async () => {
    const runtime = new ImportRuntime({ clock: { now: () => 2 } });
    runtime.getFactory().registerPassthrough(runtime.getPlugins(), {
      id: 'int-stl',
      name: 'Integration STL',
      extensions: ['stl']
    });
    const projectSessionId = asProjectSessionId('proj-session-1');
    const request = runtime.createRequest({
      source: 'file://scan.stl',
      fileName: 'scan.stl',
      projectSessionId
    });
    const session = runtime.createSession({ projectSessionId });
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const result = await session.value.run(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(session.value.projectSessionId).toBe(projectSessionId);
    expect(result.value.outcome?.ok).toBe(true);
    runtime.dispose();
  });
});
