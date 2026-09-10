import { readFileSync } from 'node:fs';
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
});
