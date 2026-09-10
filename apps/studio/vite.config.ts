import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(root, '../..');
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
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
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    ...(host
      ? {
          hmr: {
            protocol: 'ws' as const,
            host,
            port: 1421
          }
        }
      : {}),
    watch: {
      ignored: ['**/src-tauri/**']
    },
    fs: {
      allow: [repoRoot]
    }
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    outDir: 'dist',
    emptyOutDir: true
  }
});
