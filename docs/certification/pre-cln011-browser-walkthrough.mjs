/**
 * Pre-CLN-011 browser walkthrough — dual-arch STL fixtures.
 * Run: PLAYWRIGHT_BROWSERS_PATH=... node pre-cln011-browser-walkthrough.mjs
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const FIX = path.join(ROOT, 'apps/studio/public/clinical-fixtures');
const OUT = path.join(ROOT, 'docs/certification/pre-cln011-browser-shots');
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

async function readCamera(page) {
  return page.evaluate(() => {
    const g = globalThis;
    const host = g.__studioHost ?? g.__CAD_STUDIO_HOST__;
    // Fall back: look for composition root on window from diagnostics
    const roots = Object.keys(g).filter((k) => k.toLowerCase().includes('studio'));
    return {
      roots,
      hasHost: host != null,
      // Try three.js camera from canvas scene if exposed
      cam: g.__clinicalCameraSnapshot ?? null
    };
  });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
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
    const caseText = await page.locator('body').innerText();
    const hasUpper = /upper/i.test(caseText);
    const hasLower = /lower/i.test(caseText);
    note('Import Upper + Lower', hasUpper && hasLower ? 'PASS' : 'FAIL', `upper=${hasUpper} lower=${hasLower}`);
  } catch (e) {
    note('Import Upper + Lower', 'FAIL', String(e));
    await shot(page, '01-import-fail');
    await browser.close();
    dump(results, consoleErrors);
    process.exit(1);
  }

  // Camera visual — patient-facing anterior
  await shot(page, '02-anterior-view');
  note(
    'Initial camera (visual)',
    'OBSERVE',
    'Screenshot 02-anterior-view.png — verify patient-facing bite (not occlusal top-down)'
  );

  // Wait and re-shot to detect camera reset
  await waitIdle(page, 2000);
  await shot(page, '02b-anterior-stable');
  note('Camera stability after import', 'OBSERVE', 'Compare 02 vs 02b');

  // --- Orientation ---
  try {
    const startOrient = page.getByRole('button', { name: /Start Orientation|Orient/i }).first();
    if (await startOrient.count()) {
      await startOrient.click();
    } else {
      // Workflow step 2 button
      await page.getByRole('button', { name: '2', exact: true }).click();
    }
    await waitIdle(page, 800);
    await shot(page, '03-orient-entered');
    note('Enter Orientation', 'PASS');

    const accept = page.getByRole('button', { name: 'Accept', exact: true }).first();
    await accept.click();
    await waitIdle(page, 800);
    await shot(page, '04-orient-accepted');
    const body = await page.locator('body').innerText();
    const dupToast = /already active/i.test(body);
    const prepCurrent = /Confirm Preparation|Awaiting confirmation|Prepare/i.test(body);
    note('Accept Orientation → Prepare', prepCurrent && !dupToast ? 'PASS' : 'FAIL', `dupToast=${dupToast}`);
  } catch (e) {
    note('Orientation', 'FAIL', String(e));
    await shot(page, '04-orient-fail');
  }

  // --- Preparation ---
  try {
    const confirm = page.getByRole('button', { name: 'Confirm Preparation' }).first();
    await confirm.click();
    await waitIdle(page, 600);
    await shot(page, '05-prep-confirmed');
    const continueBtn = page.getByRole('button', { name: 'Continue to Trim' }).first();
    const enabled = await continueBtn.isEnabled();
    note('Preparation confirm → Continue to Trim enabled', enabled ? 'PASS' : 'FAIL');
    await continueBtn.click();
    await waitIdle(page, 800);
    await shot(page, '06-trim-entered');
  } catch (e) {
    note('Preparation', 'FAIL', String(e));
  }

  // --- Trim idle ---
  try {
    const overlay = page.getByTestId('clinical-trim-toolbar');
    await overlay.waitFor();
    const mode = await page.getByTestId('clinical-trim-overlay').getAttribute('data-draw-mode');
    note('Trim opens idle', mode === 'idle' ? 'PASS' : 'FAIL', `mode=${mode}`);

    // Toolbar clickable while selecting modes
    await page.getByTestId('clinical-trim-polyline').click();
    await waitIdle(page, 200);
    let mode2 = await page.getByTestId('clinical-trim-overlay').getAttribute('data-draw-mode');
    note('Polyline selectable', mode2 === 'polyline' ? 'PASS' : 'FAIL', `mode=${mode2}`);

    // Draw polyline points in viewport
    const vp = page.getByRole('generic', { name: 'Viewport' }).first();
    const box = await vp.boundingBox();
    if (!box) throw new Error('no viewport box');
    const pts = [
      [box.x + box.width * 0.4, box.y + box.height * 0.45],
      [box.x + box.width * 0.55, box.y + box.height * 0.42],
      [box.x + box.width * 0.58, box.y + box.height * 0.58],
      [box.x + box.width * 0.42, box.y + box.height * 0.6]
    ];
    for (const [x, y] of pts) {
      await page.mouse.click(x, y);
      await waitIdle(page, 120);
    }
    await shot(page, '07-polyline-drawn');

    // Toolbar while drawing mode active
    await page.getByTestId('clinical-trim-undo-point').click();
    await waitIdle(page, 150);
    note('Undo Pt clickable during polyline', 'PASS');
    await page.getByTestId('clinical-trim-clear').click();
    await waitIdle(page, 150);
    note('Clear clickable during polyline', 'PASS');

    // Redraw
    for (const [x, y] of pts) {
      await page.mouse.click(x, y);
      await waitIdle(page, 100);
    }
    await page.getByTestId('clinical-trim-close').click();
    await waitIdle(page, 150);
    note('Close clickable', 'PASS');
    await page.getByTestId('clinical-trim-validate').click();
    await waitIdle(page, 300);
    await shot(page, '08-polyline-validated');
    note('Validate clickable', 'PASS');

    const acceptTrim = page.getByTestId('clinical-trim-accept');
    if (await acceptTrim.isEnabled()) {
      await acceptTrim.click();
      await waitIdle(page, 1500);
      await shot(page, '09-accept-trim');
      note('Accept Trim', 'PASS');
    } else {
      note('Accept Trim', 'FAIL', 'button disabled after validate');
      await shot(page, '09-accept-disabled');
    }

    // Undo / Redo
    const undo = page.getByRole('button', { name: 'Undo', exact: true }).first();
    const redo = page.getByRole('button', { name: 'Redo', exact: true }).first();
    if (await undo.isEnabled()) {
      await undo.click();
      await waitIdle(page, 800);
      await shot(page, '10-undo');
      note('Undo after Accept', 'PASS');
      if (await redo.isEnabled()) {
        await redo.click();
        await waitIdle(page, 800);
        await shot(page, '11-redo');
        note('Redo after Undo', 'PASS');
      } else {
        note('Redo after Undo', 'FAIL', 'redo disabled');
      }
    } else {
      note('Undo after Accept', 'FAIL', 'undo disabled');
    }
  } catch (e) {
    note('Trim polyline path', 'FAIL', String(e));
    await shot(page, '07-trim-fail');
  }

  // Freehand path — re-enter trim if needed
  try {
    // If trim exited after accept, Continue to Trim / enter again
    const trimTb = page.getByTestId('clinical-trim-toolbar');
    if (!(await trimTb.count()) || !(await trimTb.isVisible())) {
      const enter = page.getByRole('button', { name: /Trim|Continue to Trim/i }).first();
      if (await enter.count()) await enter.click();
      await waitIdle(page, 600);
    }
    await page.getByTestId('clinical-trim-freehand').click();
    await waitIdle(page, 200);
    const mode = await page.getByTestId('clinical-trim-overlay').getAttribute('data-draw-mode');
    note('Freehand selectable', mode === 'freehand' ? 'PASS' : 'FAIL', `mode=${mode}`);

    const vp = page.getByRole('generic', { name: 'Viewport' }).first();
    const box = await vp.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.45);
      await page.mouse.down();
      for (let i = 0; i <= 20; i++) {
        const t = i / 20;
        const x = box.x + box.width * (0.4 + 0.2 * Math.sin(t * Math.PI * 2));
        const y = box.y + box.height * (0.45 + 0.15 * Math.cos(t * Math.PI * 2));
        await page.mouse.move(x, y);
        await waitIdle(page, 20);
      }
      await page.mouse.up();
      await waitIdle(page, 200);
      await shot(page, '12-freehand-drawn');
      note('Freehand draw', 'PASS');

      await page.getByTestId('clinical-trim-close').click();
      await page.getByTestId('clinical-trim-validate').click();
      await waitIdle(page, 300);
      note('Freehand close+validate toolbar', 'PASS');
    }
  } catch (e) {
    note('Freehand path', 'FAIL', String(e));
  }

  // Reset / Cancel non-destructive
  try {
    await page.getByTestId('clinical-trim-reset').click();
    await waitIdle(page, 200);
    note('Reset clickable', 'PASS');
    await page.getByTestId('clinical-trim-cancel').click();
    await waitIdle(page, 400);
    await shot(page, '13-cancel');
    note('Cancel clickable', 'PASS');
  } catch (e) {
    note('Reset/Cancel', 'FAIL', String(e));
  }

  // Viewport resize picking smoke
  try {
    await page.setViewportSize({ width: 1100, height: 700 });
    await waitIdle(page, 400);
    await shot(page, '14-viewport-smaller');
    await page.setViewportSize({ width: 1600, height: 1000 });
    await waitIdle(page, 400);
    await shot(page, '15-viewport-larger');
    note('Viewport resize screenshots', 'PASS');
  } catch (e) {
    note('Viewport resize', 'FAIL', String(e));
  }

  note('Console errors', consoleErrors.length ? 'FAIL' : 'PASS', String(consoleErrors.length));

  await browser.close();
  dump(results, consoleErrors);
}

function dump(results, consoleErrors) {
  const report = {
    at: new Date().toISOString(),
    results,
    consoleErrors
  };
  const out = path.join(ROOT, 'docs/certification/pre-cln011-browser-walkthrough.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('\nWrote', out);
  const fails = results.filter((r) => r.status === 'FAIL');
  console.log(`Summary: ${results.length - fails.length} non-fail / ${results.length} checks, ${fails.length} FAIL`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
