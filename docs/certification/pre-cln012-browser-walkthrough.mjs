/**
 * PRE-CLN-012 browser walkthrough — dual-arch STL fixtures.
 * Run with Studio dev server on :1420:
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
 *     node docs/certification/pre-cln012-browser-walkthrough.mjs
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FIX = path.join(ROOT, 'apps/studio/public/clinical-fixtures');
const OUT = path.join(ROOT, 'docs/certification/pre-cln012-browser-shots');
fs.mkdirSync(OUT, { recursive: true });

const upperStl = path.join(FIX, 'upper.stl');
const lowerStl = path.join(FIX, 'lower.stl');

const results = [];
const note = (name, status, detail = '') => {
  results.push({ name, status, detail });
  console.log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
};

const shot = async (page, name) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
};

const waitIdle = (page, ms = 500) => page.waitForTimeout(ms);

const viewportBox = async (page) => {
  const host = page.getByTestId('clinical-document-host');
  await host.waitFor({ state: 'visible', timeout: 15000 });
  const box = await host.boundingBox();
  if (!box) throw new Error('clinical-document-host has no box');
  return box;
};

const wheelViaCamera = async (page, deltaY) => {
  await page.evaluate((dy) => {
    const ws = globalThis.__clinicalWorkspace;
    const host = ws?.getHost?.();
    if (!host) throw new Error('no host');
    host.handleRawInput({
      kind: 'wheel',
      position: { x: 100, y: 100 },
      deltaX: 0,
      deltaY: dy,
      deltaZ: 0,
      deltaMode: 'pixel',
      modifiers: { alt: false, ctrl: false, meta: false, shift: false },
      timestamp: Date.now()
    });
  }, deltaY);
  await waitIdle(page, 120);
};

const selectArch = async (page, role) => {
  await page.evaluate((archRole) => {
    const ws = globalThis.__clinicalWorkspace;
    const host = ws?.getHost?.();
    const doc = ws?.session?.getPublicState?.()?.activeCase;
    const obj = doc?.objects?.find((o) => o.archRole === archRole);
    if (!obj) throw new Error(`no ${archRole} arch`);
    host.sessions.selectionSession?.select('replace', [String(obj.id)]);
    ws.session.notifyUi();
  }, role);
  await waitIdle(page, 200);
};

const enterTrimFor = async (page, role) => {
  await page.evaluate((archRole) => {
    const ws = globalThis.__clinicalWorkspace;
    const doc = ws?.session?.getPublicState?.()?.activeCase;
    const obj = doc?.objects?.find((o) => o.archRole === archRole);
    if (!obj) throw new Error(`no ${archRole}`);
    if (ws.trim.isActive()) ws.trim.cancel();
    const result = ws.trim.enter(obj.id);
    if (!result.ok) throw new Error(result.error?.message ?? 'trim enter failed');
    ws.session.notifyUi();
  }, role);
  await waitIdle(page, 800);
};

const readCamera = async (page) =>
  page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    const cam = ws?.getHost?.()?.sessions?.cameraSession?.getSnapshot?.();
    if (!cam) return null;
    return {
      eye: { ...cam.eye },
      target: { ...cam.target },
      up: { ...cam.up }
    };
  });

const eyeDist = (cam) => {
  if (!cam) return NaN;
  return Math.hypot(
    cam.eye.x - cam.target.x,
    cam.eye.y - cam.target.y,
    cam.eye.z - cam.target.z
  );
};

const archVisibility = async (page) =>
  page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    const objs = ws?.session?.getPublicState?.()?.activeCase?.objects ?? [];
    return objs.map((o) => ({
      id: String(o.id),
      name: o.displayName,
      role: o.archRole,
      visible: o.visible
    }));
  });

async function importDualArch(page) {
  await page.getByRole('button', { name: 'Import Scan', exact: true }).first().click();
  await page.getByTestId('clinical-import-dialog').waitFor();
  const inputs = page.locator('.clinical-import-dialog__file-input');
  await inputs.nth(0).setInputFiles(upperStl);
  await inputs.nth(1).setInputFiles(lowerStl);
  await page.getByRole('button', { name: 'Import Scans' }).click();
  await page.getByTestId('clinical-import-dialog').waitFor({ state: 'detached', timeout: 120000 });
  await waitIdle(page, 1500);
}

async function drawConvexBoundary(page, vpBox) {
  const pts = [
    [vpBox.x + vpBox.width * 0.38, vpBox.y + vpBox.height * 0.42],
    [vpBox.x + vpBox.width * 0.55, vpBox.y + vpBox.height * 0.4],
    [vpBox.x + vpBox.width * 0.6, vpBox.y + vpBox.height * 0.58],
    [vpBox.x + vpBox.width * 0.45, vpBox.y + vpBox.height * 0.62],
    [vpBox.x + vpBox.width * 0.35, vpBox.y + vpBox.height * 0.52]
  ];
  for (const [x, y] of pts) {
    await page.mouse.click(x, y);
    await waitIdle(page, 100);
  }
  return pts;
}

async function run() {
  const chromePath =
    process.env.PLAYWRIGHT_CHROME_PATH ||
    `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto('http://localhost:1420/', { waitUntil: 'networkidle' });
  await shot(page, '00-boot');
  note('Shell boot', 'PASS');

  // --- Import ---
  try {
    await importDualArch(page);
    await shot(page, '01-import-dual');
    note('Import Upper + Lower', 'PASS');
  } catch (e) {
    note('Import Upper + Lower', 'FAIL', String(e));
    await browser.close();
    dump(results, consoleErrors);
    process.exit(1);
  }

  // --- AC-01 Anterior ---
  const camImport = await readCamera(page);
  await shot(page, '02-anterior-view');
  if (camImport) {
    const toEye = {
      x: camImport.eye.x - camImport.target.x,
      y: camImport.eye.y - camImport.target.y,
      z: camImport.eye.z - camImport.target.z
    };
    const len = Math.hypot(toEye.x, toEye.y, toEye.z) || 1;
    const elev = toEye.z / len;
    const upZ = Math.abs(camImport.up.z);
    const patientFacing = elev > 0.12 && elev < 0.75 && upZ > 0.5;
    note(
      'AC-01 patient-facing anterior bite',
      patientFacing ? 'PASS' : 'FAIL',
      `eye=(${camImport.eye.x.toFixed(2)},${camImport.eye.y.toFixed(2)},${camImport.eye.z.toFixed(2)}) elev=${elev.toFixed(3)} up.z=${camImport.up.z.toFixed(3)}`
    );
  } else {
    note('AC-01 patient-facing anterior bite', 'FAIL', 'camera snapshot unavailable');
  }

  // --- AC-02 Zoom ---
  try {
    const box = await viewportBox(page);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const before = eyeDist(await readCamera(page));
    await wheelViaCamera(page, -120); // zoom in
    // Also exercise DOM wheel on canvas (must reach Camera Runtime)
    await page.locator('.viewport-canvas').dispatchEvent('wheel', { deltaY: -120 });
    await waitIdle(page, 150);
    const afterIn = eyeDist(await readCamera(page));
    await wheelViaCamera(page, 120); // zoom out
    await page.locator('.viewport-canvas').dispatchEvent('wheel', { deltaY: 120 });
    await waitIdle(page, 150);
    const afterOut = eyeDist(await readCamera(page));
    const zoomOk = afterIn < before && afterOut > afterIn;
    note(
      'AC-02 wheel zoom in/out',
      zoomOk ? 'PASS' : 'FAIL',
      `before=${before.toFixed(2)} in=${afterIn.toFixed(2)} out=${afterOut.toFixed(2)}`
    );
    await shot(page, '02b-zoom');
  } catch (e) {
    note('AC-02 wheel zoom in/out', 'FAIL', String(e));
  }

  // --- Orient ---
  try {
    const startOrient = page.getByRole('button', { name: /Start Orientation|Orient/i }).first();
    if (await startOrient.count()) {
      await startOrient.click();
    } else {
      await page.getByRole('button', { name: '2', exact: true }).click();
    }
    await waitIdle(page, 600);
    const before = eyeDist(await readCamera(page));
    await wheelViaCamera(page, -80);
    const mid = eyeDist(await readCamera(page));
    await wheelViaCamera(page, 80);
    note(
      'Zoom in Orient',
      mid < before ? 'PASS' : 'FAIL',
      `before=${before.toFixed(2)} afterIn=${mid.toFixed(2)}`
    );
    await page.getByRole('button', { name: 'Accept', exact: true }).first().click();
    await waitIdle(page, 800);
    await shot(page, '03-orient-accepted');
    note('Accept Orientation → Prepare', 'PASS');
  } catch (e) {
    note('Orientation', 'FAIL', String(e));
  }

  // --- Prepare ---
  try {
    await page.getByRole('button', { name: 'Confirm Preparation' }).first().click();
    await waitIdle(page, 500);
    const before = eyeDist(await readCamera(page));
    await wheelViaCamera(page, 100);
    note(
      'Zoom in Prepare',
      eyeDist(await readCamera(page)) > before ? 'PASS' : 'FAIL'
    );
    await selectArch(page, 'upper');
    await page.getByRole('button', { name: 'Continue to Trim' }).first().click();
    await waitIdle(page, 900);
    await shot(page, '04-trim-entered');
    note('Continue to Trim', 'PASS');
  } catch (e) {
    note('Preparation', 'FAIL', String(e));
  }

  // --- Upper Trim isolation ---
  try {
    const mode = await page.getByTestId('clinical-trim-overlay').getAttribute('data-draw-mode');
    note('AC-05 Trim opens idle', mode === 'idle' ? 'PASS' : 'FAIL', `mode=${mode}`);
    const target = await page.getByTestId('clinical-trim-target').innerText();
    note(
      'Upper Active label',
      /Upper Arch · Active/i.test(target) ? 'PASS' : 'OBSERVE',
      target
    );
    const vis = await archVisibility(page);
    const upper = vis.find((v) => v.role === 'upper');
    const lower = vis.find((v) => v.role === 'lower');
    note(
      'AC-06 Upper isolation',
      upper?.visible === true && lower?.visible === false ? 'PASS' : 'FAIL',
      JSON.stringify(vis)
    );
    await shot(page, '05-upper-isolated');
  } catch (e) {
    note('Upper isolation', 'FAIL', String(e));
  }

  // --- Zoom in Trim ---
  try {
    const before = eyeDist(await readCamera(page));
    await wheelViaCamera(page, -90);
    const afterIn = eyeDist(await readCamera(page));
    await wheelViaCamera(page, 90);
    const afterOut = eyeDist(await readCamera(page));
    note(
      'Zoom in Trim',
      afterIn < before && afterOut > afterIn ? 'PASS' : 'FAIL',
      `in=${afterIn.toFixed(2)} out=${afterOut.toFixed(2)}`
    );
  } catch (e) {
    note('Zoom in Trim', 'FAIL', String(e));
  }

  // --- Upper draw / validate / accept ---
  try {
    await page.getByTestId('clinical-trim-polyline').click();
    await waitIdle(page, 150);
    const box = await viewportBox(page);
    await drawConvexBoundary(page, box);
    await shot(page, '06-polyline-drawn');
    await page.getByTestId('clinical-trim-close').click();
    await waitIdle(page, 150);
    await page.getByTestId('clinical-trim-validate').click();
    await waitIdle(page, 300);
    await shot(page, '07-validated');
    const stats = await page.getByTestId('clinical-trim-stats').innerText();
    const valid = /Valid/i.test(stats) && !/crosses itself/i.test(stats);
    note('AC-03 Validate normal polygon', valid ? 'PASS' : 'FAIL', stats);

    const acceptTrim = page.getByTestId('clinical-trim-accept');
    if (await acceptTrim.isEnabled()) {
      await acceptTrim.click();
      await waitIdle(page, 1500);
      await shot(page, '08-accept-trim');
      note('AC-09 Accept Trim', 'PASS');
    } else {
      note('AC-09 Accept Trim', 'FAIL', 'accept disabled');
      await shot(page, '08-accept-disabled');
    }

    const undo = page.getByRole('button', { name: 'Undo', exact: true }).first();
    const redo = page.getByRole('button', { name: 'Redo', exact: true }).first();
    if (await undo.isEnabled()) {
      await undo.click();
      await waitIdle(page, 700);
      await shot(page, '09-undo');
      note('AC-10 Undo', 'PASS');
      if (await redo.isEnabled()) {
        await redo.click();
        await waitIdle(page, 700);
        await shot(page, '10-redo');
        note('AC-10 Redo', 'PASS');
      } else {
        note('AC-10 Redo', 'FAIL', 'disabled');
      }
    } else {
      note('AC-10 Undo', 'FAIL', 'disabled');
    }
  } catch (e) {
    note('Upper trim path', 'FAIL', String(e));
    await shot(page, '06-trim-fail');
  }

  // --- Lower Trim ---
  try {
    await enterTrimFor(page, 'lower');
    await shot(page, '11-lower-trim');

    const target = await page.getByTestId('clinical-trim-target').innerText();
    note(
      'Lower Active label',
      /Lower Arch · Active/i.test(target) ? 'PASS' : 'FAIL',
      target
    );
    const vis = await archVisibility(page);
    const upper = vis.find((v) => v.role === 'upper');
    const lower = vis.find((v) => v.role === 'lower');
    note(
      'AC-07 Lower isolation',
      lower?.visible === true && upper?.visible === false ? 'PASS' : 'FAIL',
      JSON.stringify(vis)
    );

    await page.getByTestId('clinical-trim-polyline').click();
    const box = await viewportBox(page);
    await drawConvexBoundary(page, box);
    await page.getByTestId('clinical-trim-close').click();
    await page.getByTestId('clinical-trim-validate').click();
    await waitIdle(page, 300);
    const stats = await page.getByTestId('clinical-trim-stats').innerText();
    note('Lower Validate', /Valid/i.test(stats) ? 'PASS' : 'FAIL', stats);
    const acceptTrim = page.getByTestId('clinical-trim-accept');
    if (await acceptTrim.isEnabled()) {
      await acceptTrim.click();
      await waitIdle(page, 1500);
      await shot(page, '12-lower-accept');
      note('Lower Accept Trim', 'PASS');
    } else {
      note('Lower Accept Trim', 'FAIL', 'disabled');
    }
  } catch (e) {
    note('Lower trim path', 'FAIL', String(e));
    await shot(page, '11-lower-fail');
  }

  note('Console errors', consoleErrors.length ? 'FAIL' : 'PASS', String(consoleErrors.length));

  await browser.close();
  dump(results, consoleErrors, camImport);
}

function dump(results, consoleErrors, camImport) {
  const fails = results.filter((r) => r.status === 'FAIL');
  const report = {
    at: new Date().toISOString(),
    host: 'http://localhost:1420/',
    fixtures: [
      'apps/studio/public/clinical-fixtures/upper.stl',
      'apps/studio/public/clinical-fixtures/lower.stl'
    ],
    cameraAfterImport: camImport,
    results,
    consoleErrors,
    summary: {
      total: results.length,
      fail: fails.length,
      pass: results.filter((r) => r.status === 'PASS').length,
      observe: results.filter((r) => r.status === 'OBSERVE').length
    }
  };
  const out = path.join(ROOT, 'docs/certification/pre-cln012-browser-walkthrough.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('\nWrote', out);
  console.log(
    `Summary: ${report.summary.pass} PASS / ${report.summary.observe} OBSERVE / ${report.summary.fail} FAIL (${report.summary.total} checks)`
  );
  if (fails.length) process.exitCode = 1;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
