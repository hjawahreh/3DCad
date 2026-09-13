import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('architecture', () => {
  it('depends on platform packages and does not invent domain logic packages', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    const deps = Object.keys(pkg.dependencies);
    expect(deps).toEqual(
      expect.arrayContaining([
        '@cad-studio/platform-runtime',
        '@cad-studio/project-runtime',
        '@cad-studio/import-runtime',
        '@cad-studio/scene',
        '@cad-studio/viewport',
        '@cad-studio/viewport-runtime',
        '@cad-studio/interaction-runtime',
        '@cad-studio/camera-runtime',
        '@cad-studio/selection-runtime',
        '@cad-studio/tool-runtime',
        '@cad-studio/geometry-services',
        '@cad-studio/kernel-bridge',
        'react',
        'react-dom'
      ])
    );
    expect(deps.some((d) => d.includes('clinical'))).toBe(false);
  });

  it('does not contain parser implementations', () => {
    const composition = readFileSync(join(root, 'src/application/composition-root.ts'), 'utf8');
    expect(composition.includes('parseStl') || composition.includes('THREE.')).toBe(false);
  });

  it('documents host ownership boundaries', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    expect(readme.includes('composition')).toBe(true);
    expect(readme.includes('platform')).toBe(true);
  });

  it('clinical trim/close-base/handoff sources do not import VTK', () => {
    const scan = (dir: string) =>
      readdirSync(dir)
        .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))
        .map((f) => readFileSync(join(dir, f), 'utf8'))
        .join('\n');
    const handoffSrc = readFileSync(
      join(root, 'src/clinical/handoff/ClinicalHandoffSnapshot.ts'),
      'utf8'
    );
    const src =
      scan(join(root, 'src/clinical/trim')) +
      '\n' +
      scan(join(root, 'src/clinical/close-base')) +
      '\n' +
      handoffSrc;
    expect(/from ['"]vtk|require\(['"]vtk|vtkmodules/i.test(src)).toBe(false);
    // Handoff contract must not expose geometry-backend fields to clinical consumers.
    expect(/geometryBackend\s*:/.test(handoffSrc)).toBe(false);
  });
});
