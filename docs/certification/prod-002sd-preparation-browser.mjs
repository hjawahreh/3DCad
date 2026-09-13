/**
 * PROD-002SD — Preparation session creation browser certification.
 *
 * Prerequisites:
 *   - Studio: http://localhost:1420/
 *   - Fixtures: apps/studio/public/clinical-fixtures/{upper,lower}.stl
 *
 * Run:
 *   NODE_PATH=/home/hjawahreh/Desktop/Projects/sharedrop/node_modules \
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
 *     node docs/certification/prod-002sd-preparation-browser.mjs
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
const OUT = path.join(ROOT, 'docs/certification/prod-002sd-browser-shots');
const JSON_OUT = path.join(ROOT, 'docs/certification/prod-002sd-preparation-browser.json');
fs.mkdirSync(OUT, { recursive: true });

const upperStl = path.join(FIX, 'upper.stl');
const lowerStl = path.join(FIX, 'lower.stl');
const HOST = process.env.CAD_STUDIO_URL || 'http://localhost:1420/';
const CASE_NAME = 'Patient-2026-09-13-PROD-002SD-Preparation';

/** @type {Array<Record<string, unknown>>} */
const steps = [];
let mandatoryFail = false;

const recordStep = (id, status, fields = {}) => {
  steps.push(Object.freeze({ id, step: id, status, at: new Date().toISOString(), ...fields }));
  console.log(`[${status}] ${id}${fields.detail ? ' — ' + fields.detail : ''}`);
  if (status === 'FAIL' && fields.mandatory !== false) mandatoryFail = true;
};

const shot = async (page, name) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return `${name}.png`;
};

const waitIdle = (page, ms = 500) => page.waitForTimeout(ms);

const readPrep = (page) =>
  page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    const st = ws?.preparation?.session?.getState?.();
    return {
      ready: ws?.preparation?.isReadyForGeometry?.() ?? false,
      lifecycle: ws?.preparation?.session?.getLifecycle?.()?.getPhase?.() ?? null,
      workflow: ws?.preparation?.session?.getWorkflow?.()?.getPhase?.() ?? null,
      autoUi: st?.autoUiState ?? null,
      statusMessage: st?.statusMessage ?? null,
      sessionId: st?.sessionId ?? null,
      caseId: st?.caseId ?? null,
      archMode: st?.archMode ?? ws?.archContext?.getMode?.() ?? null,
      geometryRevision: st?.geometryRevision ?? null,
      geometryFingerprint: st?.geometryFingerprint ?? null,
      lastFailure: st?.lastFailure ?? null,
      orientationAccepted:
        ws?.session?.getPublicState?.()?.activeCase?.orientationMeta?.acceptedAt != null,
      docRevision: ws?.session?.getPublicState?.()?.activeCase?.revision ?? null
    };
  });

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
  page.setDefaultTimeout(120000);

  try {
    await page.goto(HOST, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => globalThis.__clinicalWorkspace != null, null, {
      timeout: 60000
    });

    await page.getByTestId('clinical-empty-new-case').click();
    await page.getByTestId('clinical-create-case-dialog').waitFor({ state: 'visible' });
    await page.getByTestId('clinical-create-first-name').fill('HosamTest');
    await page.getByTestId('clinical-create-last-name').fill('PrepSession');
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
    for (let i = 0; i < 60; i += 1) {
      const origin = await page.evaluate(
        () => globalThis.__clinicalWorkspace?.orientation?.session?.getState?.()?.orientationOrigin
      );
      if (origin === 'auto') break;
      await waitIdle(page, 400);
    }

    await page.getByTestId('clinical-orientation-accept').click();
    await waitIdle(page, 2000);
    const afterOrient = await readPrep(page);
    const ss01 = await shot(page, '01-orientation-complete');
    recordStep(
      '01-orientation-complete',
      afterOrient.orientationAccepted ? 'PASS' : 'FAIL',
      { screenshot: ss01, ...afterOrient }
    );

    // Ensure BOTH
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      ws.archContext.setMode('both');
      ws.viewport.showAll();
      ws.session.notifyUi();
    });
    await waitIdle(page, 300);

    const ss02 = await shot(page, '02-prepare-start');
    recordStep('02-prepare-start', 'PASS', { screenshot: ss02 });

    // Explicit Prepare Case (may already be ready from Accept autoPrepare — must stay idempotent)
    await page.evaluate(() => {
      globalThis.__clinicalWorkspace.session.getHost().commands.invoke('clinical.preparation.start');
    });
    await waitIdle(page, 2500);
    const afterPrep = await readPrep(page);
    const ss03 = await shot(page, '03-preparation-session-created');
    const prepOk =
      afterPrep.ready === true &&
      afterPrep.sessionId != null &&
      afterPrep.lastFailure == null &&
      (afterPrep.autoUi === 'ready' || afterPrep.autoUi === 'warning');
    recordStep('03-preparation-session-created', prepOk ? 'PASS' : 'FAIL', {
      screenshot: ss03,
      ...afterPrep
    });

    const ss04 = await shot(page, '04-continue-to-trim');
    const continueVisible = await page.getByRole('button', { name: /Continue to Trim/i }).first().isVisible().catch(() => false);
    recordStep('04-continue-to-trim', continueVisible && afterPrep.ready ? 'PASS' : 'FAIL', {
      screenshot: ss04,
      continueVisible
    });

    await page.evaluate(() => {
      globalThis.__clinicalWorkspace.session.getHost().commands.invoke('clinical.tool.trim');
    });
    await waitIdle(page, 1200);
    const trimActive = await page.evaluate(() => globalThis.__clinicalWorkspace?.trim?.isActive?.() === true);
    const ss05 = await shot(page, '05-trim-opened');
    recordStep('05-trim-opened', trimActive ? 'PASS' : 'FAIL', { screenshot: ss05, trimActive });

    // Save (persistence contract — sessions remain re-creatable after reopen)
    const saved = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const r = await ws.cases.saveActiveCase(ws);
      return { ok: r?.ok === true, message: r?.ok ? undefined : r?.error?.message };
    });
    recordStep('06-save', saved.ok ? 'PASS' : 'FAIL', { ...saved });
  } catch (err) {
    const ssErr = await shot(page, '99-error').catch(() => null);
    recordStep('fatal', 'FAIL', {
      detail: err instanceof Error ? err.message : String(err),
      screenshot: ssErr
    });
  } finally {
    const summary = {
      milestone: 'PROD-002SD',
      overall: mandatoryFail || steps.some((s) => s.status === 'FAIL') ? 'FAIL' : 'PASS',
      steps,
      screenshotsDir: 'docs/certification/prod-002sd-browser-shots',
      at: new Date().toISOString()
    };
    fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
    console.log(`\nOverall: ${summary.overall}`);
    await browser.close();
    process.exit(summary.overall === 'PASS' ? 0 : 1);
  }
}

main();
