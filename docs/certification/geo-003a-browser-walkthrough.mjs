/**
 * GEO-003A — View Cube + orbit + clinical axis cleanup screenshots.
 *
 * Prerequisites: Studio :1420
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
const OUT = path.join(ROOT, 'docs/certification/geo-003a-browser-shots');
fs.mkdirSync(OUT, { recursive: true });

const upperStl = path.join(FIX, 'upper.stl');
const lowerStl = path.join(FIX, 'lower.stl');
const HOST = process.env.CAD_STUDIO_URL || 'http://localhost:1420/';
const waitIdle = (page, ms = 500) => page.waitForTimeout(ms);
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  console.log(`[shot] ${name}.png`);
};

const presentView = async (page, face) => {
  await page.evaluate((f) => {
    const ws = globalThis.__clinicalWorkspace;
    ws?.viewport?.presentCanonicalClinicalView?.(f);
    ws?.session?.notifyUi?.();
  }, face);
  await waitIdle(page, 900);
};

const orbitDrag = async (page, dx, dy) => {
  await page.evaluate(
    ({ dx: ddx, dy: ddy }) => {
      const cam = globalThis.__clinicalWorkspace?.getHost?.()?.sessions?.cameraSession;
      cam?.orbit?.(-(ddx) * 0.005, -(ddy) * 0.005);
      globalThis.__clinicalWorkspace?.session?.notifyUi?.();
    },
    { dx, dy }
  );
  await waitIdle(page, 500);
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

  await page.goto(HOST, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => globalThis.__clinicalWorkspace != null, null, {
    timeout: 60000
  });

  await page.getByTestId('clinical-empty-new-case').click();
  await page.getByTestId('clinical-create-case-dialog').waitFor();
  await page.getByTestId('clinical-create-first-name').fill('GEO003A');
  await page.getByTestId('clinical-create-last-name').fill('Viewport');
  await page.getByTestId('clinical-create-case-name').fill('GEO-003A-Viewport');
  const inputs = page.locator('.clinical-import-dialog__file-input');
  await inputs.nth(0).setInputFiles(upperStl);
  await inputs.nth(1).setInputFiles(lowerStl);
  await page.getByTestId('clinical-create-submit').click();
  await page.getByTestId('clinical-create-case-success').waitFor({ timeout: 180000 });
  await page.getByTestId('clinical-create-continue-orient').click();
  for (let i = 0; i < 80; i += 1) {
    const origin = await page.evaluate(
      () => globalThis.__clinicalWorkspace?.orientation?.session?.getState?.()?.orientationOrigin
    );
    if (origin === 'auto') break;
    await waitIdle(page, 500);
  }
  await page.getByTestId('clinical-orientation-accept').click();
  await waitIdle(page, 2500);

  // Prepare if available (triggers GEO-003 warmup; not required for nav shots).
  const prepareBtn = page.getByRole('button', { name: /Prepare/i });
  if ((await prepareBtn.count()) > 0) {
    await prepareBtn.first().click().catch(() => undefined);
    await waitIdle(page, 3000);
  }

  await presentView(page, 'front');

  const axesState = await page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="clinical-viewport-overlay"]');
    return {
      axes: overlay?.getAttribute('data-axes') ?? 'missing',
      origin: overlay?.getAttribute('data-origin') ?? 'missing',
      gizmo: overlay?.getAttribute('data-orient-gizmo') ?? 'missing',
      axesHelper: Boolean(document.querySelector('[data-testid="clinical-axes-helper"]')),
      orientGizmo: Boolean(document.querySelector('[data-testid="clinical-orient-gizmo"]')),
      viewCube: Boolean(document.querySelector('[data-testid="clinical-view-cube"]'))
    };
  });
  console.log('[axes]', JSON.stringify(axesState));
  if (axesState.axesHelper || axesState.orientGizmo) {
    throw new Error('GEO-003A FAIL: clinical XYZ helpers still mounted');
  }
  if (!axesState.viewCube) {
    console.warn('View Cube not mounted yet — continuing for camera poses');
  }

  await shot(page, '01-clinical-clean');
  await presentView(page, 'front');
  await shot(page, '02-viewcube-anterior');
  await presentView(page, 'back');
  await shot(page, '03-viewcube-posterior');
  await presentView(page, 'left');
  await shot(page, '04-viewcube-left');
  await presentView(page, 'right');
  await shot(page, '05-viewcube-right');
  await presentView(page, 'top');
  await shot(page, '06-viewcube-top');
  await presentView(page, 'bottom');
  await shot(page, '07-viewcube-bottom');
  await presentView(page, 'front');
  await shot(page, '08-home');

  await orbitDrag(page, 0, -80);
  await shot(page, '09-orbit-up');
  await presentView(page, 'front');
  await orbitDrag(page, 0, 80);
  await shot(page, '10-orbit-down');
  await presentView(page, 'front');
  await orbitDrag(page, -80, 0);
  await shot(page, '11-orbit-left');
  await presentView(page, 'front');
  await orbitDrag(page, 80, 0);
  await shot(page, '12-orbit-right');

  await browser.close();
  console.log('GEO-003A browser walkthrough complete');
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
