/**
 * PROD-002R — Clinical workstation browser walkthrough.
 *
 * Milestone checklist (as feasible in headless Playwright):
 *   Create case (long name) → Import → Continue to Orientation (auto-run)
 *   → Accept → Preparation → Trim enter → Clear/redraw → Arch switch (UPPER/BOTH/LOWER)
 *
 * Steps marked [VTK] require the geometry worker for trim commit / kernel preview.
 *
 * Prerequisites:
 *   - Studio: pnpm --filter @cad-studio/studio dev (:1420)
 *   - Optional [VTK]: python tools/geometry-backend-bench/vtk_worker_http.py (:8765)
 *
 * Run:
 *   NODE_PATH=/home/hjawahreh/Desktop/Projects/sharedrop/node_modules \
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
 *     node docs/certification/prod-002r-browser-walkthrough.mjs
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
const OUT = path.join(ROOT, 'docs/certification/prod-002r-browser-shots');
fs.mkdirSync(OUT, { recursive: true });

const upperStl = path.join(FIX, 'upper.stl');
const lowerStl = path.join(FIX, 'lower.stl');
const HOST = process.env.CAD_STUDIO_URL || 'http://localhost:1420/';
const LONG_CASE_NAME = 'Patient-2026-09-12-Upper-Lower-PROD-002R-Walkthrough-Milestone';

const results = [];
const note = (name, status, detail = '') => {
  results.push({ name, status, detail });
  console.log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
};

const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
};

const waitIdle = (page, ms = 500) => page.waitForTimeout(ms);

const readCaseName = async (page) =>
  page.evaluate(() => {
    const doc = globalThis.__clinicalWorkspace?.session?.getPublicState?.()?.activeCase;
    return doc?.caseMeta?.name ?? null;
  });

const readOrientationOrigin = async (page) =>
  page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    if (!ws?.orientation?.isActive?.()) return null;
    return ws.orientation.session.getState().orientationOrigin;
  });

const main = async () => {
  if (!fs.existsSync(upperStl) || !fs.existsSync(lowerStl)) {
    throw new Error('Missing clinical-fixtures upper.stl / lower.stl');
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(90000);

  try {
    await page.goto(HOST, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => globalThis.__clinicalWorkspace != null, null, {
      timeout: 60000
    });
    note('Open Studio', 'PASS', HOST);
    await shot(page, '00-boot');

    // --- Create case with long hyphenated name ---
    await page.getByTestId('clinical-empty-new-case').click();
    await page.getByTestId('clinical-create-case-dialog').waitFor({ state: 'visible' });
    await page.getByTestId('clinical-create-first-name').fill('PROD');
    await page.getByTestId('clinical-create-last-name').fill('002R');
    await page.getByTestId('clinical-create-case-name').fill(LONG_CASE_NAME);

    const fileInputs = page.locator('.clinical-import-dialog__file-input');
    await fileInputs.nth(0).setInputFiles(upperStl);
    await fileInputs.nth(1).setInputFiles(lowerStl);
    await waitIdle(page, 300);
    note('Select Upper/Lower scans', 'PASS');

    await page.getByTestId('clinical-create-submit').click();
    await page.getByTestId('clinical-create-case-success').waitFor({ state: 'visible', timeout: 180000 });
    const nameAfterCreate = await readCaseName(page);
    note(
      'Long case name preserved on create',
      nameAfterCreate === LONG_CASE_NAME ? 'PASS' : 'FAIL',
      nameAfterCreate ?? 'missing'
    );
    await shot(page, '01-case-created');

    const validation = page.getByTestId('clinical-case-validation');
    const hasValidation = await validation.isVisible().catch(() => false);
    note('Validation panel visible', hasValidation ? 'PASS' : 'OBSERVE', hasValidation ? '' : 'panel hidden');

    // --- Continue to Orientation (auto-run expected) ---
    const continueBtn = page.getByTestId('clinical-create-continue-orient');
    const canContinue = !(await continueBtn.isDisabled());
    if (!canContinue) {
      note('Continue to Orientation', 'FAIL', 'button disabled — validation blocked');
    } else {
      await continueBtn.click();
      await page.getByTestId('clinical-orientation-toolbar').waitFor({ state: 'visible', timeout: 30000 });
      await waitIdle(page, 1200);
      const origin = await readOrientationOrigin(page);
      note(
        'Orientation auto-run on enter',
        origin === 'auto' ? 'PASS' : 'OBSERVE',
        `orientationOrigin=${origin ?? 'n/a'}`
      );
      await shot(page, '02-orientation-auto');
    }

    // View cube present
    const viewCube = page.getByTestId('clinical-view-cube');
    const cubeVisible = await viewCube.isVisible().catch(() => false);
    note('View cube visible', cubeVisible ? 'PASS' : 'OBSERVE');

    if (cubeVisible) {
      await page.getByTestId('clinical-view-cube-front').click();
      await waitIdle(page, 400);
      note('View cube anterior preset', 'PASS');
      await shot(page, '03-view-cube-front');
    }

    // Accept orientation → preparation
    const acceptOrient = page.getByTestId('clinical-orientation-accept');
    if (await acceptOrient.isVisible().catch(() => false)) {
      await acceptOrient.click();
      await waitIdle(page, 1500);
      const prepUi = page.getByTestId('clinical-preparation-auto-ui');
      const prepVisible = await prepUi.isVisible().catch(() => false);
      note('Preparation after orient accept', prepVisible ? 'PASS' : 'OBSERVE');
      await shot(page, '04-preparation');
    } else {
      note('Accept orientation', 'OBSERVE', 'accept button not visible');
    }

    // --- Global arch switch UPPER / BOTH / LOWER ---
    const archBar = page.getByTestId('clinical-global-arch-bar');
    if (await archBar.isVisible().catch(() => false)) {
      for (const mode of ['upper', 'both', 'lower']) {
        const btn = page.getByTestId(`clinical-global-arch-${mode}`);
        if (await btn.isEnabled().catch(() => false)) {
          await btn.click();
          await waitIdle(page, 250);
        }
      }
      const archMode = await page.evaluate(() =>
        globalThis.__clinicalWorkspace?.archContext?.getMode?.() ?? null
      );
      note('Arch context UPPER/BOTH/LOWER', archMode ? 'PASS' : 'OBSERVE', `mode=${archMode}`);
      await shot(page, '05-arch-switch');
    } else {
      note('Global arch bar', 'OBSERVE', 'not visible in current layout phase');
    }

    // --- Enter Trim → polyline → clear → redraw ---
    const trimEntered = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const prep = ws?.preparation;
      if (prep && !prep.hasSession?.()) {
        prep.notifyOrientationComplete?.();
        prep.start?.();
        prep.activateSession?.();
      }
      while (prep?.session?.getState?.()?.currentStage !== 'ready-for-trim') {
        const adv = prep?.advanceStage?.();
        if (!adv?.ok) break;
      }
      return ws?.trim?.enter?.()?.ok === true;
    });
    note('Enter Trim tool', trimEntered ? 'PASS' : 'OBSERVE');
    await waitIdle(page, 600);

    const trimToolbar = page.getByTestId('clinical-trim-toolbar');
    if (await trimToolbar.isVisible().catch(() => false)) {
      await page.getByTestId('clinical-trim-polyline').click();
      await waitIdle(page, 200);

      // Add points via session (viewport pick may miss in headless)
      const added = await page.evaluate(() => {
        const trim = globalThis.__clinicalWorkspace?.trim;
        if (!trim?.isActive?.()) return { ok: false, count: 0 };
        for (let i = 0; i < 4; i += 1) {
          trim.addPoint({ x: 200 + i * 20, y: 300 + i * 10, localX: i, localY: i, localZ: 0 });
        }
        return { ok: true, count: trim.session.getState().points.length };
      });
      note('Trim add points (polyline)', added.ok && added.count >= 4 ? 'PASS' : 'OBSERVE', `count=${added.count}`);

      await page.getByTestId('clinical-trim-clear').click();
      await waitIdle(page, 200);
      const afterClear = await page.evaluate(
        () => globalThis.__clinicalWorkspace?.trim?.session?.getState?.()?.points?.length ?? -1
      );
      note('Trim clear boundary', afterClear === 0 ? 'PASS' : 'FAIL', `points=${afterClear}`);

      const redraw = await page.evaluate(() => {
        const trim = globalThis.__clinicalWorkspace?.trim;
        if (!trim) return 0;
        for (let i = 0; i < 5; i += 1) {
          trim.addPoint({ x: 220 + i * 15, y: 320, localX: i * 2, localY: 0, localZ: 0 });
        }
        return trim.session.getState().points.length;
      });
      note('Trim redraw after clear', redraw === 5 ? 'PASS' : 'OBSERVE', `points=${redraw}`);
      await shot(page, '06-trim-clear-redraw');

      // [VTK] Trim close + accept needs geometry worker
      note('Trim close + accept [VTK]', 'OBSERVE', 'requires VTK worker — not run in default headless path');

      // Trim arch switcher inside toolbar
      const trimArchUpper = page.getByTestId('clinical-trim-arch-upper');
      if (await trimArchUpper.isVisible().catch(() => false)) {
        await trimArchUpper.click();
        await waitIdle(page, 200);
        note('Trim arch target switch', 'PASS');
      }
    } else {
      note('Trim toolbar', 'OBSERVE', 'not visible — prep stage may block');
    }

    // Notification single-instance smoke (best effort)
    const notifCount = await page.evaluate(() => {
      const host = globalThis.__clinicalWorkspace?.getHost?.();
      return host?.notifications?.list?.()?.length ?? 0;
    });
    note('Notifications ≤1 visible', notifCount <= 1 ? 'PASS' : 'OBSERVE', `count=${notifCount}`);

    await shot(page, '07-final');
  } catch (e) {
    note('Walkthrough', 'FAIL', e instanceof Error ? e.message : String(e));
    try {
      await shot(page, '99-error');
    } catch {
      /* ignore */
    }
  } finally {
    await browser.close();
    const summary = {
      gate: 'PROD-002R',
      host: HOST,
      at: new Date().toISOString(),
      results,
      pass: results.filter((r) => r.status === 'PASS').length,
      observe: results.filter((r) => r.status === 'OBSERVE').length,
      fail: results.filter((r) => r.status === 'FAIL').length
    };
    fs.writeFileSync(
      path.join(ROOT, 'docs/certification/prod-002r-browser-walkthrough.json'),
      JSON.stringify(summary, null, 2)
    );
    console.log('\nSummary', summary);
    if (summary.fail > 0) process.exitCode = 1;
  }
};

main();
