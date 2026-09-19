import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, '../..');

export default defineConfig({
  resolve: {
    alias: {
      '@cad-studio/platform-runtime': path.join(repoRoot, 'packages/platform-runtime/src/index.ts'),
      '@cad-studio/project-runtime': path.join(repoRoot, 'packages/project-runtime/src/index.ts'),
      '@cad-studio/import-runtime': path.join(repoRoot, 'packages/import-runtime/src/index.ts'),
      '@cad-studio/scene': path.join(repoRoot, 'packages/scene/src/index.ts'),
      '@cad-studio/viewport': path.join(repoRoot, 'packages/viewport/src/index.ts'),
      '@cad-studio/viewport-runtime': path.join(repoRoot, 'packages/viewport-runtime/src/index.ts'),
      '@cad-studio/interaction-runtime': path.join(
        repoRoot,
        'packages/interaction-runtime/src/index.ts'
      ),
      '@cad-studio/camera-runtime': path.join(repoRoot, 'packages/camera-runtime/src/index.ts'),
      '@cad-studio/selection-runtime': path.join(repoRoot, 'packages/selection-runtime/src/index.ts'),
      '@cad-studio/tool-runtime': path.join(repoRoot, 'packages/tool-runtime/src/index.ts'),
      '@cad-studio/kernel-bridge': path.join(repoRoot, 'packages/kernel-bridge/src/index.ts'),
      '@cad-studio/geometry-services': path.join(repoRoot, 'packages/geometry-services/src/index.ts')
    }
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: false,
    globalSetup: ['./test/vtk-worker-global-setup.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true
      }
    },
    testTimeout: 180_000
  }
});
