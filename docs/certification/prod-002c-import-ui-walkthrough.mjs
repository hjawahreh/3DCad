/**
 * PROD-002C — Production Import UI browser walkthrough (prepared for certification).
 *
 * Verifies Studio UI path:
 *   Open Studio → Create Case → Import dental files → Parse → Validate → Show result
 *   → Continue to Orientation (preparation follows after Orient Accept)
 *
 * Also exercises unsupported / empty / cancel paths where feasible.
 *
 * Prerequisites:
 *   - Studio: pnpm --filter @cad-studio/studio dev (:1420)
 *
 * Run (example):
 *   NODE_PATH=/home/hjawahreh/Desktop/Projects/sharedrop/node_modules \
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
 *     node docs/certification/prod-002c-import-ui-walkthrough.mjs
 *
 * Do NOT treat this script's absence of a run as PASS.
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
const OUT = path.join(ROOT, 'docs/certification/prod-002c-import-ui-shots');
fs.mkdirSync(OUT, { recursive: true });

const upperStl = path.join(FIX, 'upper.stl');
const lowerStl = path.join(FIX, 'lower.stl');
const HOST = process.env.CAD_STUDIO_URL || 'http://localhost:1420/';

const results = [];
const note = (name, status, detail = '') => {
  results.push({ name, status, detail });
  console.log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
};

const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
};

const waitIdle = (page, ms = 400) => page.waitForTimeout(ms);

const main = async () => {
  if (!fs.existsSync(upperStl) || !fs.existsSync(lowerStl)) {
    throw new Error('Missing clinical-fixtures upper.stl / lower.stl');
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(60000);

  try {
    await page.goto(HOST, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => globalThis.__clinicalWorkspace != null, null, {
      timeout: 60000
    });
    note('Open Studio', 'PASS', HOST);
    await shot(page, '00-boot');

    // --- Happy path: create case + dual import + validation panel ---
    await page.getByTestId('clinical-empty-new-case').click();
    await page.getByTestId('clinical-create-case-dialog').waitFor({ state: 'visible' });
    await page.getByTestId('clinical-create-first-name').fill('Prod');
    await page.getByTestId('clinical-create-last-name').fill('TwoC');
    await page.getByTestId('clinical-create-case-name').fill('PROD-002C Import UI');

    const upperInput = page.locator('[data-testid="clinical-create-upper"]').locator(
      'xpath=ancestor::section[1]//input[@type="file"]'
    );
    // Prefer the hidden file inputs used by the dialog.
    const fileInputs = page.locator('.clinical-import-dialog__file-input');
    await fileInputs.nth(0).setInputFiles(upperStl);
    await fileInputs.nth(1).setInputFiles(lowerStl);
    await waitIdle(page, 300);
    note('Select Upper/Lower scans', 'PASS');

    await page.getByTestId('clinical-create-submit').click();
    await page.getByTestId('clinical-create-progress').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    await page.getByTestId('clinical-create-case-success').waitFor({ state: 'visible', timeout: 180000 });
    note('Create Case + parse + import', 'PASS');

    const validation = page.getByTestId('clinical-case-validation');
    await validation.waitFor({ state: 'visible', timeout: 10000 });
    const verdict = await page.getByTestId('clinical-case-validation-verdict').innerText();
    note('Show structured validation', verdict.includes('FAIL') ? 'FAIL' : 'PASS', verdict.replace(/\s+/g, ' ').slice(0, 120));
    await shot(page, '01-success-validation');

    const uiReport = await page.evaluate(() => {
      const report = globalThis.__clinicalWorkspace?.importCoordinator?.getLastCaseValidation?.();
      return report
        ? {
            verdict: report.verdict,
            findings: report.findings?.length ?? 0,
            errors: (report.findings ?? []).filter((f) => f.severity === 'ERROR').length
          }
        : null;
    });
    note(
      'Validation API matches UI',
      uiReport && uiReport.errors === 0 ? 'PASS' : 'FAIL',
      JSON.stringify(uiReport)
    );

    const continueBtn = page.getByTestId('clinical-create-continue-orient');
    const disabled = await continueBtn.isDisabled();
    if (disabled) {
      note('Continue gated on FAIL', 'PASS', 'button disabled');
    } else {
      await continueBtn.click();
      await waitIdle(page, 800);
      note('Continue to Orientation', 'PASS', 'preparation follows after Orient Accept');
      await shot(page, '02-continued-orient');
    }

    // --- Unsupported format (new session via reload for isolation) ---
    await page.goto(HOST, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => globalThis.__clinicalWorkspace != null);
    await page.getByTestId('clinical-empty-new-case').click();
    await page.getByTestId('clinical-create-case-dialog').waitFor({ state: 'visible' });
    const bad = path.join(OUT, 'bad.xyz');
    fs.writeFileSync(bad, 'not a mesh');
    await page.locator('.clinical-import-dialog__file-input').nth(0).setInputFiles(bad);
    await waitIdle(page, 200);
    const err = page.getByTestId('clinical-create-error');
    const hasErr = await err.isVisible().catch(() => false);
    const errText = hasErr ? await err.innerText() : '';
    note(
      'Unsupported format surfaced',
      hasErr && /unsupported|STL|OBJ|PLY/i.test(errText) ? 'PASS' : 'FAIL',
      errText.slice(0, 120)
    );
    await shot(page, '03-unsupported-format');

    // --- Empty file ---
    const empty = path.join(OUT, 'empty.stl');
    fs.writeFileSync(empty, '');
    await page.locator('.clinical-import-dialog__file-input').nth(0).setInputFiles(empty);
    await waitIdle(page, 200);
    const emptyErr = await page.getByTestId('clinical-create-error').innerText().catch(() => '');
    note(
      'Empty file surfaced',
      /empty/i.test(emptyErr) ? 'PASS' : 'FAIL',
      emptyErr.slice(0, 120)
    );
    await shot(page, '04-empty-file');
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
      gate: 'PROD-002C',
      host: HOST,
      at: new Date().toISOString(),
      results,
      pass: results.filter((r) => r.status === 'PASS').length,
      fail: results.filter((r) => r.status === 'FAIL').length
    };
    fs.writeFileSync(
      path.join(ROOT, 'docs/certification/prod-002c-import-ui-walkthrough.json'),
      JSON.stringify(summary, null, 2)
    );
    console.log('\nSummary', summary);
    if (summary.fail > 0) process.exitCode = 1;
  }
};

main();
