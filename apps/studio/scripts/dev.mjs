#!/usr/bin/env node
/**
 * Studio host launcher.
 * Prefers Tauri desktop window; falls back to Vite when Linux WebKit deps are missing.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { platform } from 'node:os';

const PORT = 1420;
const DEV_URL = `http://localhost:${String(PORT)}/`;
const isLinux = platform() === 'linux';

const hasWebKit = () => {
  if (!isLinux) {
    return true;
  }
  const check = spawnSync('pkg-config', ['--exists', 'webkit2gtk-4.1'], { encoding: 'utf8' });
  return check.status === 0;
};

const portInUse = (port) =>
  new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close(() => resolve(false));
    });
    server.listen(port, '127.0.0.1');
  });

const waitForPort = async (port, timeoutMs = 60_000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await portInUse(port)) {
      return;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for port ${String(port)}`);
};

const httpOk = async (url) => {
  try {
    const response = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
};

const openBrowser = (url) => {
  const opener =
    platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'cmd' : 'xdg-open';
  const args = platform() === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(opener, args, { stdio: 'ignore', detached: true }).unref();
};

const printPortBusyHelp = () => {
  console.error(
    `[studio] Port ${String(PORT)} is already in use and does not look like a Studio session.\n` +
      `         Free it, then retry:\n` +
      `           fuser -k ${String(PORT)}/tcp\n` +
      `         or:\n` +
      `           ss -tlnp | grep ${String(PORT)}`
  );
};

const main = async () => {
  if (hasWebKit()) {
    console.log('[studio] Launching Tauri desktop host…');
    const child = spawn('pnpm', ['exec', 'tauri', 'dev'], { stdio: 'inherit', shell: false });
    child.on('exit', (code) => process.exit(code ?? 1));
    return;
  }

  console.warn(
    '[studio] webkit2gtk-4.1 not found — launching Vite shell instead of Tauri window.\n' +
      '         Install Linux Tauri prerequisites to open a native desktop window:\n' +
      '         https://v2.tauri.app/start/prerequisites/'
  );

  if (await portInUse(PORT)) {
    if (await httpOk(DEV_URL)) {
      console.log(`[studio] Dev server already running at ${DEV_URL} — opening browser.`);
      openBrowser(DEV_URL);
      process.exit(0);
    }
    printPortBusyHelp();
    process.exit(1);
  }

  const vite = spawn(
    'pnpm',
    ['exec', 'vite', '--port', String(PORT), '--strictPort'],
    { stdio: 'inherit', shell: false }
  );
  try {
    await waitForPort(PORT);
    openBrowser(DEV_URL);
  } catch (err) {
    console.error(err);
  }
  vite.on('exit', (code) => process.exit(code ?? 1));
};

void main();
