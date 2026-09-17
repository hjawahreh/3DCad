import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const port = process.env.CAD_VTK_WORKER_PORT ?? '8765';
const python = process.env.CAD_VTK_PYTHON ?? 'python3';

const waitForHealth = async (url: string): Promise<boolean> => {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch {
      // retry while worker boots
    }
    await delay(250);
  }
  return false;
};

let child: ChildProcess | undefined;

export default async function setup() {
  const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const scriptPath = fileURLToPath(
    new URL('../../../tools/geometry-backend-bench/vtk_worker_http.py', import.meta.url)
  );

  if (!existsSync(scriptPath)) {
    throw new Error(`VTK worker script missing: ${scriptPath}`);
  }

  if (!(await waitForHealth(`http://127.0.0.1:${port}/health`))) {
    child = spawn(python, [scriptPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        CAD_VTK_WORKER_PORT: port,
        CAD_VTK_PYTHON: python
      },
      stdio: 'inherit'
    });

    const ok = await waitForHealth(`http://127.0.0.1:${port}/health`);
    if (!ok) {
      throw new Error(`VTK worker did not become healthy on http://127.0.0.1:${port}/health`);
    }
  }

  return teardown;
}

export const teardown = async () => {
  if (!child) return;
  child.kill('SIGTERM');
  await delay(500);
};
