/**
 * PROD-002SC — Canonical Anterior browser certification (real fixtures).
 *
 * Run:
 *   NODE_PATH=/home/hjawahreh/Desktop/Projects/sharedrop/node_modules \
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
 *     node docs/certification/prod-002sc-browser-walkthrough.mjs
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
const OUT = path.join(ROOT, 'docs/certification/prod-002sc-browser-shots');
const JSON_OUT = path.join(ROOT, 'docs/certification/prod-002sc-browser-walkthrough.json');
fs.mkdirSync(OUT, { recursive: true });

const upperStl = path.join(FIX, 'upper.stl');
const lowerStl = path.join(FIX, 'lower.stl');
const HOST = process.env.CAD_STUDIO_URL || 'http://localhost:1420/';

const CASE_NAME = 'Patient-2026-09-13-PROD-002SC-Canonical-Anterior';

/** @type {Array<Record<string, unknown>>} */
const steps = [];
let mandatoryFail = false;

const recordStep = (id, status, fields = {}) => {
  const at = new Date().toISOString();
  steps.push(Object.freeze({ id, step: id, status, at, ...fields }));
  console.log(`[${status}] ${id}${fields.detail ? ' — ' + fields.detail : ''}`);
  if (status === 'FAIL' && fields.mandatory !== false) mandatoryFail = true;
};

const shot = async (page, name) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return `${name}.png`;
};

const waitIdle = (page, ms = 500) => page.waitForTimeout(ms);

const readBasis = (page) =>
  page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    const basis = ws?.viewport?.getClinicalCameraBasis?.();
    const snap = ws?.session?.getHost?.()?.sessions?.cameraSession?.getSnapshot?.();
    return {
      basis,
      archMode: ws?.archContext?.getMode?.() ?? null,
      origin: ws?.orientation?.session?.getState?.()?.orientationOrigin ?? null,
      eye: snap?.eye ?? null,
      up: snap?.up ?? null
    };
  });

const basesEqual = (a, b) => {
  if (!a || !b) return false;
  const forwardDot =
    a.forward.x * b.forward.x + a.forward.y * b.forward.y + a.forward.z * b.forward.z;
  const upDot = a.up.x * b.up.x + a.up.y * b.up.y + a.up.z * b.up.z;
  const targetDist = Math.hypot(
    a.target.x - b.target.x,
    a.target.y - b.target.y,
    a.target.z - b.target.z
  );
  const distRel = Math.abs(a.distance - b.distance) / Math.max(1, a.distance, b.distance);
  return forwardDot >= 0.96 && upDot >= 0.96 && targetDist <= 3 && distRel <= 0.1;
};

async function main() {
  if (!fs.existsSync(upperStl) || !fs.existsSync(lowerStl)) {
    throw new Error('Missing clinical-fixtures');
  }
  const chromePath =
    process.env.PLAYWRIGHT_CHROME_PATH ||
    `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
  const launchOpts = { headless: true };
  if (fs.existsSync(chromePath)) launchOpts.executablePath = chromePath;

  const browser = await chromium.launch(launchOpts);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.setDefaultTimeout(90000);

  try {
    await page.goto(HOST, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => globalThis.__clinicalWorkspace != null, null, {
      timeout: 60000
    });

    await page.getByTestId('clinical-empty-new-case').click();
    await page.getByTestId('clinical-create-case-dialog').waitFor({ state: 'visible' });
    await page.getByTestId('clinical-create-first-name').fill('HosamTest');
    await page.getByTestId('clinical-create-last-name').fill('CanonicalAnt');
    await page.getByTestId('clinical-create-case-name').fill(CASE_NAME);
    const fileInputs = page.locator('.clinical-import-dialog__file-input');
    await fileInputs.nth(0).setInputFiles(upperStl);
    await fileInputs.nth(1).setInputFiles(lowerStl);
    await page.getByTestId('clinical-create-submit').click();
    await page.getByTestId('clinical-create-case-success').waitFor({
      state: 'visible',
      timeout: 180000
    });

    await page.getByTestId('clinical-create-continue-orient').click();
    await page.getByTestId('clinical-orientation-toolbar').waitFor({ state: 'visible', timeout: 60000 });

    let auto = null;
    for (let i = 0; i < 60; i += 1) {
      auto = await readBasis(page);
      if (auto.origin === 'auto' && auto.basis?.closestFace === 'front') break;
      await waitIdle(page, 400);
    }
    const ss01 = await shot(page, '01-auto-orient');
    recordStep('01-auto-orient', auto?.basis?.closestFace === 'front' && auto?.archMode === 'both' ? 'PASS' : 'FAIL', {
      screenshot: ss01,
      ...auto
    });

    await page.getByTestId('clinical-view-cube-front').click({ force: true });
    await waitIdle(page, 800);
    const cube = await readBasis(page);
    const ss02 = await shot(page, '02-view-cube-anterior');
    recordStep('02-view-cube-anterior', basesEqual(auto?.basis, cube?.basis) ? 'PASS' : 'FAIL', {
      screenshot: ss02,
      autoBasis: auto?.basis,
      cubeBasis: cube?.basis
    });

    await page.evaluate(() => {
      globalThis.__clinicalWorkspace?.session?.getHost?.()?.sessions?.cameraSession?.presetView?.(
        'left'
      );
      globalThis.__clinicalWorkspace?.session?.notifyUi?.();
    });
    await waitIdle(page, 300);
    await page.getByTestId('clinical-view-cube-home').click({ force: true });
    await waitIdle(page, 800);
    const home = await readBasis(page);
    const ss03 = await shot(page, '03-home');
    recordStep('03-home', basesEqual(auto?.basis, home?.basis) ? 'PASS' : 'FAIL', {
      screenshot: ss03,
      homeBasis: home?.basis
    });

    // UPPER
    await page.getByTestId('clinical-global-arch-upper').click({ force: true }).catch(async () => {
      await page.evaluate(() => {
        const ws = globalThis.__clinicalWorkspace;
        ws.archContext.setMode('upper');
        const upper = ws.session.getPublicState().activeCase.objects.find((o) => o.archRole === 'upper');
        if (upper) ws.viewport.isolate(upper.id);
        ws.viewport.presentCanonicalClinicalView('front');
        ws.session.notifyUi();
      });
    });
    await waitIdle(page, 600);
    const upper = await readBasis(page);
    const ss04 = await shot(page, '04-upper');
    recordStep('04-upper', upper?.basis?.closestFace === 'front' ? 'PASS' : 'FAIL', {
      screenshot: ss04,
      ...upper
    });

    // LOWER
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      ws.archContext.setMode('lower');
      const lower = ws.session.getPublicState().activeCase.objects.find((o) => o.archRole === 'lower');
      if (lower) ws.viewport.isolate(lower.id);
      ws.viewport.presentCanonicalClinicalView('front');
      ws.session.notifyUi();
    });
    await waitIdle(page, 600);
    const lower = await readBasis(page);
    const ss05 = await shot(page, '05-lower');
    recordStep('05-lower', lower?.basis?.closestFace === 'front' ? 'PASS' : 'FAIL', {
      screenshot: ss05,
      ...lower
    });

    // BOTH
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      ws.archContext.setMode('both');
      ws.viewport.showAll();
      ws.viewport.presentCanonicalClinicalView('front');
      ws.session.notifyUi();
    });
    await waitIdle(page, 600);
    const both = await readBasis(page);
    const ss06 = await shot(page, '06-both');
    recordStep('06-both', both?.archMode === 'both' && both?.basis?.closestFace === 'front' ? 'PASS' : 'FAIL', {
      screenshot: ss06,
      ...both
    });

    // Re-run Auto Orient equivalence
    await page.getByTestId('clinical-orientation-auto').click();
    await waitIdle(page, 1200);
    const rerun = await readBasis(page);
    recordStep('H-rerun', basesEqual(auto?.basis, rerun?.basis) ? 'PASS' : 'FAIL', {
      autoBasis: auto?.basis,
      rerunBasis: rerun?.basis
    });
  } catch (err) {
    const ssErr = await shot(page, '99-error').catch(() => null);
    recordStep('fatal', 'FAIL', {
      detail: err instanceof Error ? err.message : String(err),
      screenshot: ssErr
    });
  } finally {
    const summary = {
      milestone: 'PROD-002SC',
      overall: mandatoryFail || steps.some((s) => s.status === 'FAIL') ? 'FAIL' : 'PASS',
      steps,
      screenshotsDir: 'docs/certification/prod-002sc-browser-shots',
      at: new Date().toISOString()
    };
    fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
    console.log(`\nOverall: ${summary.overall}`);
    await browser.close();
    process.exit(summary.overall === 'PASS' ? 0 : 1);
  }
}

main();
