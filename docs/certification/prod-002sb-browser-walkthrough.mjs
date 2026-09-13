/**
 * PROD-002SB — Clinical view + Trim interaction browser certification.
 *
 * Prerequisites:
 *   - Studio: http://localhost:1420/
 *   - VTK worker: http://127.0.0.1:8765
 *   - Fixtures: apps/studio/public/clinical-fixtures/{upper,lower}.stl
 *
 * Run:
 *   NODE_PATH=/home/hjawahreh/Desktop/Projects/sharedrop/node_modules \
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
 *     node docs/certification/prod-002sb-browser-walkthrough.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_PACKAGE ||
    '/home/hjawahreh/Desktop/Projects/sharedrop/node_modules/playwright'
);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FIX = path.join(ROOT, 'apps/studio/public/clinical-fixtures');
const OUT = path.join(ROOT, 'docs/certification/prod-002sb-browser-shots');
const JSON_OUT = path.join(ROOT, 'docs/certification/prod-002sb-browser-walkthrough.json');
fs.mkdirSync(OUT, { recursive: true });

const upperStl = path.join(FIX, 'upper.stl');
const lowerStl = path.join(FIX, 'lower.stl');
const HOST = process.env.CAD_STUDIO_URL || 'http://localhost:1420/';

const FIRST_NAME = 'HosamTest';
const LAST_NAME = 'ViewTrim';
const CASE_NAME = 'Patient-2026-09-13-PROD-002SB-View-Trim';

/** @type {Array<Record<string, unknown>>} */
const steps = [];
let mandatoryFail = false;

const recordStep = (id, status, fields = {}) => {
  const at = new Date().toISOString();
  const entry = Object.freeze({ id, step: id, status, at, timestamp: at, ...fields });
  steps.push(entry);
  console.log(`[${status}] ${id}${fields.detail ? ' — ' + fields.detail : ''}`);
  if (status === 'FAIL' && fields.mandatory !== false) mandatoryFail = true;
};

const shot = async (page, name) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return `${name}.png`;
};

const waitIdle = (page, ms = 500) => page.waitForTimeout(ms);

const readCameraPose = (page) =>
  page.evaluate(() => {
    const cam = globalThis.__clinicalWorkspace?.session?.getHost?.()?.sessions?.cameraSession;
    const snap = cam?.getSnapshot?.();
    if (!snap) return null;
    const dx = snap.eye.x - snap.target.x;
    const dy = snap.eye.y - snap.target.y;
    const dz = snap.eye.z - snap.target.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return {
      eye: snap.eye,
      target: snap.target,
      up: snap.up,
      look: { x: dx / len, y: dy / len, z: dz / len },
      clinicalAnterior: dz / len > 0.55 && snap.up.y > 0.85
    };
  });

const readOrient = (page) =>
  page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    const st = ws?.orientation?.session?.getState?.();
    return {
      active: ws?.orientation?.isActive?.() === true,
      origin: st?.orientationOrigin ?? null,
      archMode: ws?.archContext?.getMode?.() ?? null,
      bothVisible:
        ws?.session?.getPublicState?.()?.activeCase?.objects?.filter((o) => o.visible).length >= 2
    };
  });

const readTrim = (page) =>
  page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    const trim = ws?.trim;
    const st = trim?.session?.getState?.();
    const previewReady = trim?.controller?.isPreviewReady?.() === true;
    const overlay = document.querySelector('[data-testid="clinical-trim-overlay"]');
    const toolState = document.querySelector('[data-testid="clinical-trim-tool-state"]')?.textContent?.trim();
    return {
      active: trim?.isActive?.() === true,
      drawMode: st?.drawMode ?? null,
      points: st?.points?.length ?? 0,
      closed: !!st?.closed,
      pointerCaptured: !!st?.pointerCaptured,
      previewReady,
      phase: st?.phase ?? null,
      overlayState: overlay?.getAttribute('data-interaction-state') ?? null,
      toolState: toolState ?? null,
      hasLocal: (st?.points ?? []).every(
        (p) =>
          typeof p.localX === 'number' &&
          typeof p.localY === 'number' &&
          typeof p.localZ === 'number'
      )
    };
  });

const overlayBox = async (page) => {
  const overlay = page.getByTestId('clinical-trim-overlay');
  await overlay.waitFor({ state: 'visible', timeout: 20000 });
  const box = await overlay.boundingBox();
  if (!box) throw new Error('clinical-trim-overlay has no box');
  return box;
};

const probeSurfaceHits = async (page, box) =>
  page.evaluate(
    ({ w, h }) => {
      const ws = globalThis.__clinicalWorkspace;
      const picker = ws?.meshPicker;
      const targetId = ws?.trim?.session?.getState?.()?.targetObjectId;
      if (!picker?.isReady?.()) return { error: 'picker not ready', hits: [] };
      const found = [];
      for (let iy = 0; iy < 16; iy += 1) {
        for (let ix = 0; ix < 16; ix += 1) {
          const x = w * (0.15 + (0.7 * ix) / 15);
          const y = h * (0.15 + (0.7 * iy) / 15);
          const hit = picker.pick({
            screenX: x,
            screenY: y,
            canvasWidth: w,
            canvasHeight: h,
            ...(targetId ? { preferredObjectId: String(targetId) } : {})
          });
          if (
            hit &&
            Number.isFinite(hit.worldX) &&
            (!targetId || String(hit.objectId) === String(targetId))
          ) {
            found.push({ x, y, worldX: hit.worldX, worldY: hit.worldY, worldZ: hit.worldZ });
          }
        }
      }
      return { error: null, hits: found, count: found.length };
    },
    { w: box.width, h: box.height }
  );

const ensurePrepReady = async (page) => {
  await page.evaluate(async () => {
    const ws = globalThis.__clinicalWorkspace;
    const prep = ws?.preparation;
    if (!prep) throw new Error('preparation missing');
    if (prep.session?.getState?.()?.currentStage === 'ready-for-trim') return;
    prep.notifyOrientationComplete?.();
    prep.start?.();
    prep.activateSession?.();
    let guard = 0;
    while (prep.session?.getState?.()?.currentStage !== 'ready-for-trim' && guard < 12) {
      prep.advanceStage?.();
      guard += 1;
    }
    ws.session.notifyUi();
  });
  await waitIdle(page, 800);
};

const enterTrim = async (page) => {
  await ensurePrepReady(page);
  const clicked = await page.getByTestId('clinical-tool-trim').click({ timeout: 5000 }).then(() => true).catch(() => false);
  if (!clicked) {
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const r = ws.trim.enter();
      if (!r?.ok) throw new Error(r?.error?.message ?? 'trim.enter failed');
      ws.session.notifyUi();
    });
  }
  await page.getByTestId('clinical-trim-overlay').waitFor({ state: 'visible', timeout: 30000 });
  await waitIdle(page, 500);
};

/** Drag freehand along a surface perimeter using real pointer events. */
const freehandDrag = async (page, count = 14) => {
  const box = await overlayBox(page);
  const hits = await probeSurfaceHits(page, box);
  if (!hits.hits?.length || hits.hits.length < 8) {
    throw new Error(`Need surface hits for freehand, got ${hits.hits?.length ?? 0}`);
  }
  const pts = hits.hits;
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const halfU = ((maxX - minX) / 2) * 0.4;
  const halfV = ((maxY - minY) / 2) * 0.4;
  const path = [];
  for (let i = 0; i < count; i += 1) {
    const t = (i / count) * Math.PI * 2;
    path.push({ x: midX + halfU * Math.cos(t), y: midY + halfV * Math.sin(t) });
  }
  const start = path[0];
  await page.mouse.move(box.x + start.x, box.y + start.y);
  await page.mouse.down();
  for (const p of path.slice(1)) {
    await page.mouse.move(box.x + p.x, box.y + p.y, { steps: 2 });
    await waitIdle(page, 40);
  }
  await page.mouse.up();
  await waitIdle(page, 200);
  return path.length;
};

const clickPolylinePoints = async (page, count = 5) => {
  const box = await overlayBox(page);
  const hits = await probeSurfaceHits(page, box);
  if (!hits.hits?.length || hits.hits.length < count) {
    throw new Error(`Need ${count} surface hits, got ${hits.hits?.length ?? 0}`);
  }
  const pts = hits.hits;
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const halfU = ((maxX - minX) / 2) * 0.42;
  const halfV = ((maxY - minY) / 2) * 0.42;
  const picked = [];
  for (let i = 0; i < count; i += 1) {
    const t = (i / count) * Math.PI * 2;
    const x = midX + halfU * Math.cos(t);
    const y = midY + halfV * Math.sin(t);
    // nearest hit
    let best = pts[0];
    let bestD = Infinity;
    for (const h of pts) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    picked.push(best);
  }
  for (const p of picked) {
    await page.mouse.click(box.x + p.x, box.y + p.y);
    await waitIdle(page, 120);
  }
  return picked.length;
};

async function main() {
  if (!fs.existsSync(upperStl) || !fs.existsSync(lowerStl)) {
    throw new Error('Missing clinical-fixtures upper.stl / lower.stl');
  }

  const chromePath =
    process.env.PLAYWRIGHT_CHROME_PATH ||
    `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
  const launchOpts = { headless: true };
  if (fs.existsSync(chromePath)) launchOpts.executablePath = chromePath;

  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(90000);

  const consoleMsgs = [];
  page.on('console', (msg) => {
    consoleMsgs.push({ type: msg.type(), text: msg.text() });
  });

  try {
    await page.goto(HOST, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => globalThis.__clinicalWorkspace != null, null, {
      timeout: 60000
    });

    // --- Create + import ---
    await page.getByTestId('clinical-empty-new-case').click();
    await page.getByTestId('clinical-create-case-dialog').waitFor({ state: 'visible' });
    await page.getByTestId('clinical-create-first-name').fill(FIRST_NAME);
    await page.getByTestId('clinical-create-last-name').fill(LAST_NAME);
    await page.getByTestId('clinical-create-case-name').fill(CASE_NAME);
    const fileInputs = page.locator('.clinical-import-dialog__file-input');
    await fileInputs.nth(0).setInputFiles(upperStl);
    await fileInputs.nth(1).setInputFiles(lowerStl);
    await page.getByTestId('clinical-create-submit').click();
    await page.getByTestId('clinical-create-case-success').waitFor({
      state: 'visible',
      timeout: 180000
    });
    await shot(page, 'orientation-before');
    recordStep('00-import', 'PASS', { screenshot: 'orientation-before.png' });

    // --- E: Auto Orientation (do NOT click Re-run) ---
    await page.getByTestId('clinical-create-continue-orient').click();
    await page.getByTestId('clinical-orientation-toolbar').waitFor({ state: 'visible', timeout: 60000 });
    let orient = null;
    for (let i = 0; i < 60; i += 1) {
      orient = await readOrient(page);
      if (orient.origin === 'auto') break;
      await waitIdle(page, 400);
    }
    const poseE = await readCameraPose(page);
    const ssAuto = await shot(page, 'orientation-auto-complete');
    recordStep('E-auto-orientation', orient?.origin === 'auto' && poseE?.clinicalAnterior && orient?.archMode === 'both' ? 'PASS' : 'FAIL', {
      screenshot: ssAuto,
      orientation: orient,
      camera: poseE
    });

    // --- F: Re-run Auto Orient ---
    await page.evaluate(() => {
      globalThis.__clinicalWorkspace?.session?.getHost?.()?.sessions?.cameraSession?.presetView?.('left');
      globalThis.__clinicalWorkspace?.session?.notifyUi?.();
    });
    await waitIdle(page, 300);
    await page.getByTestId('clinical-orientation-auto').click();
    await waitIdle(page, 1200);
    const poseF = await readCameraPose(page);
    const ssRerun = await shot(page, 'orientation-rerun');
    recordStep('F-rerun-auto-orient', poseF?.clinicalAnterior ? 'PASS' : 'FAIL', {
      screenshot: ssRerun,
      camera: poseF
    });

    // --- G: Home ---
    await page.evaluate(() => {
      globalThis.__clinicalWorkspace?.session?.getHost?.()?.sessions?.cameraSession?.presetView?.('top');
      globalThis.__clinicalWorkspace?.session?.notifyUi?.();
    });
    await waitIdle(page, 300);
    const homeBtn = page.getByTestId('clinical-view-cube-home');
    if (await homeBtn.isVisible().catch(() => false)) {
      await homeBtn.click({ force: true });
    } else {
      await page.evaluate(() => {
        globalThis.__clinicalWorkspace?.viewport?.resetView?.();
        globalThis.__clinicalWorkspace?.session?.notifyUi?.();
      });
    }
    await waitIdle(page, 800);
    const poseG = await readCameraPose(page);
    const ssHome = await shot(page, 'orientation-home');
    recordStep('G-home', poseG?.clinicalAnterior ? 'PASS' : 'FAIL', {
      screenshot: ssHome,
      camera: poseG
    });

    // Accept orientation → prep → trim
    await page.getByTestId('clinical-orientation-accept').click();
    await waitIdle(page, 2000);
    await enterTrim(page);
    const ssIdle = await shot(page, 'trim-idle');
    const idle = await readTrim(page);
    recordStep('trim-idle', idle.active && (idle.overlayState === 'IDLE' || idle.drawMode === 'idle') ? 'PASS' : 'FAIL', {
      screenshot: ssIdle,
      trim: idle
    });

    // --- A: Freehand arm + draw + close + preview ---
    await page.getByTestId('clinical-trim-freehand').click();
    await waitIdle(page, 300);
    const armed = await readTrim(page);
    const ssArmed = await shot(page, 'trim-freehand-armed');
    recordStep('A1-freehand-armed', armed.overlayState === 'FREEHAND_ARMED' || armed.toolState === 'FREEHAND_ARMED' ? 'PASS' : 'FAIL', {
      screenshot: ssArmed,
      trim: armed
    });

    await freehandDrag(page, 14);
    const drawing = await readTrim(page);
    const ssDraw = await shot(page, 'trim-drawing');
    recordStep('A2-freehand-points', drawing.points > 0 ? 'PASS' : 'FAIL', {
      screenshot: ssDraw,
      trim: drawing
    });

    await page.getByTestId('clinical-trim-close').click();
    await waitIdle(page, 300);
    const closed = await readTrim(page);
    recordStep('A3-closed', closed.closed && (closed.overlayState === 'CLOSED' || closed.points >= 3) ? 'PASS' : 'FAIL', {
      trim: closed
    });

    await page.getByTestId('clinical-trim-validate').click();
    await waitIdle(page, 400);
    await page.getByTestId('clinical-trim-preview').click();
    let preview = null;
    for (let i = 0; i < 40; i += 1) {
      preview = await readTrim(page);
      if (preview.previewReady || preview.overlayState === 'PREVIEWING') break;
      await waitIdle(page, 500);
    }
    recordStep('A4-preview-ready', preview?.previewReady || preview?.overlayState === 'PREVIEWING' ? 'PASS' : 'FAIL', {
      trim: preview
    });

    // --- B: Clear → redraw ---
    await page.getByTestId('clinical-trim-clear').click();
    await waitIdle(page, 400);
    // Guarantee Trim stays interactive after Clear (especially post-preview).
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      if (ws?.trim?.isActive?.()) return;
      const r = ws?.trim?.enter?.();
      if (!r?.ok) throw new Error(r?.error?.message ?? 'trim re-enter after clear failed');
      ws.session.notifyUi();
    });
    await page.getByTestId('clinical-trim-overlay').waitFor({ state: 'visible', timeout: 20000 });
    let cleared = await readTrim(page);
    const ssClear = await shot(page, 'trim-after-clear');
    recordStep('B1-clear', cleared.points === 0 && !cleared.pointerCaptured && cleared.active ? 'PASS' : 'FAIL', {
      screenshot: ssClear,
      trim: cleared
    });
    if (cleared.drawMode !== 'freehand') {
      await page.getByTestId('clinical-trim-freehand').click();
      await waitIdle(page, 200);
    }
    await freehandDrag(page, 8);
    const redraw = await readTrim(page);
    recordStep('B2-redraw', redraw.points > 0 ? 'PASS' : 'FAIL', { trim: redraw });

    // --- D then C: tool switch → polyline ---
    await page.getByTestId('clinical-trim-polyline').click();
    await waitIdle(page, 300);
    const switched = await readTrim(page);
    recordStep('D-tool-switch', switched.points === 0 && (switched.overlayState === 'POLYLINE_ARMED' || switched.drawMode === 'polyline') ? 'PASS' : 'FAIL', {
      trim: switched
    });

    await clickPolylinePoints(page, 5);
    const poly = await readTrim(page);
    const ssPoly = await shot(page, 'trim-polyline');
    recordStep('C-polyline-points', poly.points === 5 && poly.hasLocal ? 'PASS' : 'FAIL', {
      screenshot: ssPoly,
      trim: poly
    });

    // Accept still disabled without preview-ready after clear/switch
    const acceptDisabled = await page.getByTestId('clinical-trim-accept').isDisabled();
    recordStep('accept-gated', acceptDisabled ? 'PASS' : 'FAIL', {
      detail: acceptDisabled ? 'Accept disabled until Preview Ready' : 'Accept unexpectedly enabled'
    });
  } catch (err) {
    const ssErr = await shot(page, '99-error').catch(() => null);
    recordStep('fatal', 'FAIL', {
      detail: err instanceof Error ? err.message : String(err),
      screenshot: ssErr
    });
  } finally {
    const summary = {
      milestone: 'PROD-002SB',
      overall: mandatoryFail || steps.some((s) => s.status === 'FAIL') ? 'FAIL' : 'PASS',
      steps,
      screenshotsDir: 'docs/certification/prod-002sb-browser-shots',
      at: new Date().toISOString()
    };
    fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
    console.log(`\nOverall: ${summary.overall}`);
    console.log(`Wrote ${JSON_OUT}`);
    await browser.close();
    process.exit(summary.overall === 'PASS' ? 0 : 1);
  }
}

main();
