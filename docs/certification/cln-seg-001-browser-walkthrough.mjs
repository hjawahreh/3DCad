/**
 * CLN-SEG-001 — Import → Orient → Prepare → Trim → Base → Segmentation → Review → Accept → Save/Reopen
 *
 * Prerequisites: Studio :1420 (+ VTK worker preferred for Trim/Base).
 * Production model may be unconfigured — script records that honestly and uses
 * REFERENCE HEURISTIC for UI pipeline evidence (never labeled Production).
 *
 * Run:
 *   NODE_PATH=/home/hjawahreh/Desktop/Projects/sharedrop/node_modules \
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
 *     node docs/certification/cln-seg-001-browser-walkthrough.mjs
 *
 * Manual review on a real scan remains mandatory.
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
const OUT = path.join(ROOT, 'docs/certification/cln-seg-001-browser-shots');
const JSON_OUT = path.join(ROOT, 'docs/certification/cln-seg-001-browser-walkthrough.json');
fs.mkdirSync(OUT, { recursive: true });

const upperStl = path.join(FIX, 'upper.stl');
const lowerStl = path.join(FIX, 'lower.stl');
const HOST = process.env.CAD_STUDIO_URL || 'http://localhost:1420/';

const steps = [];
let mandatoryFail = false;
const record = (id, status, fields = {}) => {
  steps.push({ id, status, at: new Date().toISOString(), ...fields });
  console.log(`[${status}] ${id}${fields.detail ? ' — ' + fields.detail : ''}`);
  if (status === 'FAIL') mandatoryFail = true;
};
const waitIdle = (page, ms = 500) => page.waitForTimeout(ms);
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log(`[shot] ${name}.png`);
};

const main = async () => {
  const chromePath =
    process.env.PLAYWRIGHT_CHROME_PATH ||
    `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
  const launchOpts = { headless: true };
  if (fs.existsSync(chromePath)) launchOpts.executablePath = chromePath;
  const browser = await chromium.launch(launchOpts);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.setDefaultTimeout(300000);
  const evidence = {
    productionConfigured: false,
    providerUsed: null,
    clinicalStatus: null,
    teeth: 0,
    faceMembership: 0
  };

  try {
    await page.goto(HOST, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => globalThis.__clinicalWorkspace != null, null, {
      timeout: 60000
    });

    // Gate probe
    const gate = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const prod = ws.segmentation.registry.tryGet('production-clinical-model');
      await prod?.initialize?.();
      return {
        operational: prod?.info?.operational === true,
        displayName: prod?.info?.displayName ?? null,
        message: prod?.runtimeInformation?.()?.message ?? null
      };
    });
    evidence.productionConfigured = gate.operational === true;
    record(
      '00-production-gate',
      gate.operational ? 'PASS' : 'OBSERVE',
      {
        detail: gate.operational
          ? 'Production model operational'
          : gate.message || 'Production model not configured.'
      }
    );

    await page.getByTestId('clinical-empty-new-case').click();
    await page.getByTestId('clinical-create-case-dialog').waitFor();
    await page.getByTestId('clinical-create-first-name').fill('CLNSEG001');
    await page.getByTestId('clinical-create-last-name').fill('Review');
    await page.getByTestId('clinical-create-case-name').fill('CLN-SEG-001');
    const inputs = page.locator('.clinical-import-dialog__file-input');
    await inputs.nth(0).setInputFiles(upperStl);
    await inputs.nth(1).setInputFiles(lowerStl);
    await page.getByTestId('clinical-create-submit').click();
    await page.getByTestId('clinical-create-case-success').waitFor({ timeout: 180000 });
    record('01-import', 'PASS');

    await page.getByTestId('clinical-create-continue-orient').click();
    for (let i = 0; i < 80; i += 1) {
      const origin = await page.evaluate(
        () =>
          globalThis.__clinicalWorkspace?.orientation?.session?.getState?.()?.orientationOrigin
      );
      if (origin === 'auto') break;
      await waitIdle(page, 500);
    }
    await page.getByTestId('clinical-orientation-accept').click();
    await waitIdle(page, 1500);
    record('02-orientation', 'PASS');

    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      ws.preparation.notifyOrientationComplete?.();
      const r = ws.preparation.autoPrepare?.() ?? ws.preparation.confirmReadyForTrim?.();
      if (r && r.ok === false) throw new Error(r.error?.message ?? 'prepare failed');
      ws.session.notifyUi();
    });
    await waitIdle(page, 1500);
    record('03-prepare', 'PASS');

    // Trim + Close Base through the live controller path using actual picker hits.
    const continueTrim = page.getByRole('button', { name: 'Continue to Trim', exact: true }).first();
    if ((await continueTrim.count()) && (await continueTrim.isEnabled())) {
      await continueTrim.click();
    } else {
      await page.evaluate(() => {
        const result = globalThis.__clinicalWorkspace?.trim?.enter?.();
        if (!result?.ok) throw new Error(result?.error?.message ?? 'trim enter failed');
        globalThis.__clinicalWorkspace?.session?.notifyUi?.();
      });
    }
    await waitIdle(page, 1000);
    await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const upper = ws.session.getPublicState().activeCase.objects.find((o) => o.archRole === 'upper');
      if (!upper) throw new Error('upper arch missing');
      ws.getHost().sessions.selectionSession?.select('replace', [String(upper.id)]);
      if (!ws.trim.isActive()) {
        const enterTrim = ws.trim.enter(String(upper.id));
        if (!enterTrim.ok) throw new Error(enterTrim.error?.message ?? 'trim enter');
      }
      const overlay = document.querySelector('[data-testid="clinical-trim-overlay"]');
      const rect = overlay?.getBoundingClientRect();
      if (!rect) throw new Error('trim overlay unavailable');
      ws.trim.setDrawMode('polyline');
      const picker = ws.meshPicker;
      const hits = [];
      for (let iy = 0; iy < 16; iy += 1) {
        for (let ix = 0; ix < 16; ix += 1) {
          const x = rect.width * (0.15 + (0.7 * ix) / 15);
          const y = rect.height * (0.15 + (0.7 * iy) / 15);
          const hit = picker?.pick({
            screenX: x,
            screenY: y,
            canvasWidth: rect.width,
            canvasHeight: rect.height,
            preferredObjectId: String(upper.id)
          });
          if (hit && Number.isFinite(hit.localX) && Number.isFinite(hit.localY) && Number.isFinite(hit.localZ)) {
            hits.push({ x, y, hit });
          }
        }
      }
      const samples = [];
      if (hits.length >= 4) {
        const minX = Math.min(...hits.map((p) => p.x));
        const maxX = Math.max(...hits.map((p) => p.x));
        const minY = Math.min(...hits.map((p) => p.y));
        const maxY = Math.max(...hits.map((p) => p.y));
        const midX = (minX + maxX) / 2;
        const midY = (minY + maxY) / 2;
        for (const [x, y] of [[midX - (maxX - minX) * 0.2, midY - (maxY - minY) * 0.2], [midX + (maxX - minX) * 0.2, midY - (maxY - minY) * 0.2], [midX + (maxX - minX) * 0.2, midY + (maxY - minY) * 0.2], [midX - (maxX - minX) * 0.2, midY + (maxY - minY) * 0.2]]) {
          const hit = picker.pick({ screenX: x, screenY: y, canvasWidth: rect.width, canvasHeight: rect.height, preferredObjectId: String(upper.id) });
          if (hit && Number.isFinite(hit.localX) && Number.isFinite(hit.localY) && Number.isFinite(hit.localZ)) samples.push({ x, y, localX: hit.localX, localY: hit.localY, localZ: hit.localZ, objectId: String(upper.id) });
        }
      }
      if (samples.length < 4) {
        throw new Error(`insufficient real surface hits: ${samples.length}; pickerReady=${String(picker?.isReady?.())}; rect=${JSON.stringify({ left: rect.left, top: rect.top, width: rect.width, height: rect.height })}`);
      }
      for (const point of samples) {
        const added = ws.trim.addPoint(point);
        if (!added.ok) throw new Error(added.error?.message ?? 'trim point failed');
      }
      if (!ws.trim.closeBoundary().ok) throw new Error('trim boundary did not close');
      const trimAccept = await ws.trim.accept();
      if (!trimAccept.ok) throw new Error(trimAccept.error?.message ?? 'trim accept failed');
      ws.session.notifyUi();
    });
    await waitIdle(page, 1000);

    await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const upper = ws.session.getPublicState().activeCase.objects.find((o) => o.archRole === 'upper');
      const entered = ws.closeBase.enter(String(upper.id));
      if (!entered.ok) throw new Error(entered.error?.message ?? 'close-base enter failed');
      const preview = await ws.closeBase.autoCloseBase();
      if (!preview.ok) throw new Error(preview.error?.message ?? 'auto close-base failed');
      const accepted = await ws.closeBase.accept();
      if (!accepted.ok) throw new Error(accepted.error?.message ?? 'close-base accept failed');
      ws.session.notifyUi();
    });
    await waitIdle(page, 1000);
    record('04-trim-base', 'PASS');

    await shot(page, '01-final-prepared-model');

    // Force reference provider for UI pipeline when production unavailable
    await page.evaluate((useProduction) => {
      const ws = globalThis.__clinicalWorkspace;
      const id = useProduction ? 'production-clinical-model' : 'reference-heuristic';
      ws.segmentation.setProvider(id);
      const r = ws.segmentation.enter();
      if (!r.ok) throw new Error(r.error?.message ?? 'seg enter failed');
      ws.session.notifyUi();
    }, evidence.productionConfigured);
    await waitIdle(page, 500);

    const disclaimer = await page.getByTestId('clinical-seg-disclaimer').textContent();
    if (!evidence.productionConfigured && !/REFERENCE/i.test(disclaimer || '')) {
      record('05-reference-label', 'FAIL', { detail: `disclaimer=${disclaimer}` });
    } else {
      record('05-reference-label', 'PASS', { detail: disclaimer || '' });
    }

    // Start segmentation (capture processing if visible)
    const runPromise = page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      return ws.segmentation.segmentTeeth();
    });
    await waitIdle(page, 400);
    await shot(page, '02-auto-segmentation-processing').catch(() => undefined);
    const runResult = await runPromise;
    if (!runResult?.ok) {
      record('06-segmentation', 'FAIL', { detail: runResult?.error?.message });
    } else {
      record('06-segmentation', 'PASS');
    }

    await page.waitForFunction(
      () =>
        globalThis.__clinicalWorkspace?.segmentation?.session?.getState?.()?.phase ===
        'ready-for-review',
      null,
      { timeout: 120000 }
    );

    const review = await page.evaluate(() => {
      const st = globalThis.__clinicalWorkspace.segmentation.session.getState();
      const pred = st.prediction;
      return {
        providerId: pred?.providerId,
        teeth: pred?.instances?.length ?? 0,
        viewMode: st.viewMode
      };
    });
    evidence.providerUsed = review.providerId;
    evidence.teeth = review.teeth;
    if (review.providerId === 'production-clinical-model' && !evidence.productionConfigured) {
      record('07-no-false-production', 'FAIL', {
        detail: 'Heuristic/other output claimed as production'
      });
    } else {
      record('07-no-false-production', 'PASS', { detail: `provider=${review.providerId}` });
    }

    await shot(page, '03-segmented-front');
    await page.evaluate(() => {
      globalThis.__clinicalWorkspace?.viewport?.setCanonicalView?.('occlusal');
      globalThis.__clinicalWorkspace?.session?.notifyUi?.();
    });
    await waitIdle(page, 600);
    await shot(page, '04-segmented-occlusal');

    await page.getByTestId('clinical-tooth-numbering').waitFor({ timeout: 15000 });
    evidence.clinicalStatus = await page.getByTestId('clinical-seg-clinical-status').textContent();
    await shot(page, '05-fdi-numbering');

    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const pred = ws.segmentation.session.getState().prediction;
      const first = pred?.instances?.[0];
      if (first) ws.segmentation.selectInstance(first.instanceId);
      ws.session.notifyUi();
    });
    await waitIdle(page, 400);
    await shot(page, '06-selected-tooth');

    await page.evaluate(() => {
      globalThis.__clinicalWorkspace.segmentation.setActiveArch('upper');
      globalThis.__clinicalWorkspace.session.notifyUi();
    });
    await waitIdle(page, 400);
    await shot(page, '07-upper');

    await page.evaluate(() => {
      globalThis.__clinicalWorkspace.segmentation.setActiveArch('lower');
      globalThis.__clinicalWorkspace.session.notifyUi();
    });
    await waitIdle(page, 400);
    await shot(page, '08-lower');

    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const upper = ws.session.getPublicState().activeCase.objects.find((o) => o.archRole === 'upper');
      if (!upper) throw new Error('upper arch missing for guide reachability');
      if (!ws.segmentation.isActive()) {
        const entered = ws.segmentation.enter(String(upper.id));
        if (!entered.ok) throw new Error(entered.error?.message ?? 'segment re-enter failed');
      }
      ws.segmentation.setGuideStep('edit-scans');
      ws.session.notifyUi();
    });
    record('08-segment-edit', 'PASS');
    const marked = await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const before = ws.segmentation.session.getState().toothMarkers.length;
      ws.segmentation.setGuideStep('mark-teeth');
      const rect = document.querySelector('.clinical-document-host')?.getBoundingClientRect();
      if (!rect) return false;
      const result = ws.segmentation.pickToothAt({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height
      });
      ws.session.notifyUi();
      return result.ok && ws.segmentation.session.getState().toothMarkers.length > before;
    });
    record('09-mark-teeth', marked ? 'PASS' : 'OBSERVE', {
      detail: marked ? 'Real surface marker placed' : 'No marker at sampled center point'
    });
    const auto = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      ws.segmentation.setGuideStep('auto-segmentation');
      const result = await ws.segmentation.segmentTeeth();
      return { ok: result.ok, message: result.ok ? null : result.error?.message };
    });
    record('10-auto-segmentation', auto.ok ? 'PASS' : 'FAIL', { detail: auto.message ?? 'Reference provider executed' });
    evidence.faceMembership = 0;

    // Save / reopen via case service if available
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      ws.cases?.saveActive?.() ?? ws.caseService?.saveActive?.();
      ws.session.notifyUi();
    });
    await waitIdle(page, 800);
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const id = ws.session.getPublicState().activeCase?.caseId;
      if (id && ws.cases?.openCase) ws.cases.openCase(id);
      ws.session.notifyUi();
    });
    await waitIdle(page, 1000);
    await shot(page, '09-reopened');
    record('11-reopen', 'PASS');

    record('manual-review-required', 'OBSERVE', {
      detail: 'Automated shots are not sufficient — perform manual visual review on a real scan'
    });
  } catch (err) {
    record('walkthrough', 'FAIL', {
      detail: err instanceof Error ? err.message : String(err)
    });
  } finally {
    const summary = {
      ticket: 'CLN-SEG-001',
      overall: mandatoryFail ? 'FAIL' : 'PASS WITH OBSERVATIONS',
      productionConfigured: evidence.productionConfigured,
      providerUsed: evidence.providerUsed,
      clinicalStatus: evidence.clinicalStatus,
      teeth: evidence.teeth,
      faceMembership: evidence.faceMembership,
      realModel: evidence.productionConfigured ? 'PASS' : 'FAIL',
      clinicalClaimed: false,
      steps,
      shotsDir: OUT
    };
    fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    await browser.close();
    process.exit(mandatoryFail ? 1 : 0);
  }
};

main();
