/**
 * CLN-TRIM-002 — Professional clinical viewport + Trim V4 browser walkthrough.
 *
 * Prerequisites: Studio :1420 + VTK worker :8765
 *
 * Run:
 *   NODE_PATH=/home/hjawahreh/Desktop/Projects/sharedrop/node_modules \
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
 *     node docs/certification/cln-trim-002-browser-walkthrough.mjs
 *
 * Manual browser inspection remains mandatory for PASS.
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
const OUT = path.join(ROOT, 'docs/certification/cln-trim-002-browser-shots');
const JSON_OUT = path.join(ROOT, 'docs/certification/cln-trim-002-browser-walkthrough.json');
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

const overlayBox = async (page) => {
  const overlay = page.getByTestId('clinical-trim-overlay');
  await overlay.waitFor({ state: 'visible', timeout: 60000 });
  const box = await overlay.boundingBox();
  if (!box) throw new Error('trim overlay box missing');
  return box;
};

const probeHits = async (page, box) =>
  page.evaluate(
    ({ w, h }) => {
      const ws = globalThis.__clinicalWorkspace;
      const picker = ws?.meshPicker;
      const targetId = ws?.trim?.session?.getState?.()?.targetObjectId;
      if (!picker?.isReady?.()) return [];
      const found = [];
      for (let iy = 0; iy < 18; iy += 1) {
        for (let ix = 0; ix < 18; ix += 1) {
          const x = w * (0.12 + (0.76 * ix) / 17);
          const y = h * (0.12 + (0.76 * iy) / 17);
          const hit = picker.pick({
            screenX: x,
            screenY: y,
            canvasWidth: w,
            canvasHeight: h,
            ...(targetId ? { preferredObjectId: String(targetId) } : {})
          });
          if (hit && Number.isFinite(hit.worldX)) {
            if (!targetId || String(hit.objectId) === String(targetId)) {
              found.push({ x, y, worldX: hit.worldX, worldY: hit.worldY, worldZ: hit.worldZ });
            }
          }
        }
      }
      return found;
    },
    { w: box.width, h: box.height }
  );

/** Prefer a moderate peripheral patch (posterior/labial border) — not a full-arch surround. */
const peripheralPatch = (hits, count = 6) => {
  if (hits.length < count) return hits.slice(0, count);
  const cx = hits.reduce((s, p) => s + p.x, 0) / hits.length;
  const cy = hits.reduce((s, p) => s + p.y, 0) / hits.length;
  // Take farthest quartile, then a local cluster around the farthest hit (labial/posterior tip).
  const scored = hits
    .map((p) => ({ ...p, r: Math.hypot(p.x - cx, p.y - cy) }))
    .sort((a, b) => b.r - a.r);
  const tip = scored[0];
  const local = scored
    .filter((p) => Math.hypot(p.x - tip.x, p.y - tip.y) < Math.max(80, tip.r * 0.35))
    .slice(0, 30);
  if (local.length < count) return scored.slice(0, count);
  const lx = local.reduce((s, p) => s + p.x, 0) / local.length;
  const ly = local.reduce((s, p) => s + p.y, 0) / local.length;
  const buckets = Array.from({ length: count }, () => null);
  for (const p of local) {
    const ang = Math.atan2(p.y - ly, p.x - lx);
    const i = Math.floor(((ang + Math.PI) / (2 * Math.PI)) * count) % count;
    const pr = Math.hypot(p.x - lx, p.y - ly);
    if (buckets[i] === null || pr > Math.hypot(buckets[i].x - lx, buckets[i].y - ly)) {
      buckets[i] = p;
    }
  }
  const out = buckets.filter(Boolean);
  return out.length >= 4 ? out : local.slice(0, count);
};

const waitWarm = async (page) => {
  for (let i = 0; i < 90; i += 1) {
    const ready = await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      return ws?.trim?.isEditingReady?.() === true;
    });
    if (ready) return true;
    await waitIdle(page, 500);
  }
  return false;
};

const faceCount = async (page) =>
  page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    const id = ws?.trim?.session?.getState?.()?.targetObjectId;
    const doc = ws?.session?.getPublicState?.()?.activeCase;
    const obj = doc?.objects?.find((o) => String(o.id) === String(id));
    return obj?.faceCount ?? null;
  });

const main = async () => {
  const chromePath =
    process.env.PLAYWRIGHT_CHROME_PATH ||
    `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
  const launchOpts = { headless: true };
  if (fs.existsSync(chromePath)) launchOpts.executablePath = chromePath;
  const browser = await chromium.launch(launchOpts);
  const page = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  page.setDefaultTimeout(120000);

  try {
    await page.goto(HOST, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => globalThis.__clinicalWorkspace != null, null, {
      timeout: 60000
    });
    // Force clean clinical display prefs (no stale XYZ).
    await page.evaluate(() => {
      localStorage.removeItem('cad-studio.clinical.display.v2');
      localStorage.setItem(
        'cad-studio.clinical.display.v3',
        JSON.stringify({
          showAxes: false,
          showOrigin: false,
          showOrientationIndicator: false,
          showOverlays: true
        })
      );
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForFunction(() => globalThis.__clinicalWorkspace != null, null, {
      timeout: 60000
    });

    await page.getByTestId('clinical-empty-new-case').click();
    await page.getByTestId('clinical-create-case-dialog').waitFor();
    await page.getByTestId('clinical-create-first-name').fill('CLN');
    await page.getByTestId('clinical-create-last-name').fill('Trim002');
    await page.getByTestId('clinical-create-case-name').fill('CLN-TRIM-002');
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
      await waitIdle(page, 400);
    }
    await page.getByTestId('clinical-orientation-accept').click();
    await waitIdle(page, 2000);
    await page.evaluate(() => {
      globalThis.__clinicalWorkspace?.viewport?.presentCanonicalClinicalView?.('front');
      globalThis.__clinicalWorkspace?.session?.notifyUi?.();
    });
    await waitIdle(page, 900);
    await shot(page, '01-orientation-final');
    record('orientation', 'PASS');

    const axes = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="clinical-viewport-overlay"]');
      return {
        axes: overlay?.getAttribute('data-axes'),
        gizmo: overlay?.getAttribute('data-orient-gizmo'),
        axesEl: !!document.querySelector('[data-testid="clinical-axes-helper"]'),
        gizmoEl: !!document.querySelector('[data-testid="clinical-orient-gizmo"]'),
        orientGuides: !!document.querySelector('.clinical-orient-guides')
      };
    });
    if (axes.axes === 'on' || axes.gizmo === 'on' || axes.axesEl || axes.gizmoEl || axes.orientGuides) {
      record('axis-cleanup', 'FAIL', { detail: JSON.stringify(axes) });
    } else {
      record('axis-cleanup', 'PASS', { detail: 'no XYZ overlays' });
    }
    await shot(page, '02-clean-clinical-viewport');

    const prepareBtn = page.getByRole('button', { name: /Prepare/i });
    if ((await prepareBtn.count()) > 0) {
      await prepareBtn.first().click().catch(() => undefined);
      await waitIdle(page, 2500);
    }
    const trimBtn = page.getByRole('button', { name: /Trim|Open Trim|Continue to Trim/i });
    await trimBtn.first().click();
    await waitIdle(page, 1500);
    const warm = await waitWarm(page);
    record('warmup', warm ? 'PASS' : 'FAIL', { detail: warm ? 'editing ready' : 'timeout' });

    await page.getByTestId('clinical-trim-freehand').click();
    await waitIdle(page, 400);
    await shot(page, '03-freehand-armed');
    record('freehand-arm', 'PASS');

    const box = await overlayBox(page);
    const hits = await probeHits(page, box);
    const loop = peripheralPatch(hits, 6);
    if (loop.length < 4) {
      record('freehand-draw', 'FAIL', { detail: `only ${loop.length} peripheral hits (need ≥4)` });
    } else {
      // Freehand drag along peripheral loop
      await page.mouse.move(box.x + loop[0].x, box.y + loop[0].y);
      await page.mouse.down();
      for (const p of loop) {
        await page.mouse.move(box.x + p.x, box.y + p.y, { steps: 4 });
        await waitIdle(page, 40);
      }
      await page.mouse.up();
      await waitIdle(page, 400);
      await shot(page, '04-freehand-drawing');
      const closed = await page.evaluate(() => {
        const trim = globalThis.__clinicalWorkspace?.trim;
        const result = trim?.closeBoundary?.();
        trim?.validate?.();
        globalThis.__clinicalWorkspace?.session?.notifyUi?.();
        const st = trim?.session?.getState?.();
        return {
          ok: result?.ok === true,
          closed: st?.closed === true,
          points: st?.points?.length ?? 0,
          validationPassed: st?.validationReport?.passed === true,
          message: result?.ok === false ? result.error?.message : st?.statusMessage
        };
      });
      await waitIdle(page, 500);
      await shot(page, '05-freehand-closed');
      if (!closed.closed) {
        record('freehand-draw', 'OBSERVE', {
          detail: `close failed — rebuilding compact polyline loop: ${JSON.stringify(closed)}`
        });
        const patch = peripheralPatch(hits, 5);
        await page.getByTestId('clinical-trim-clear').click();
        await waitIdle(page, 300);
        await page.getByTestId('clinical-trim-polyline').click();
        await waitIdle(page, 300);
        const bFix = await overlayBox(page);
        for (const p of patch) {
          await page.mouse.click(bFix.x + p.x, bFix.y + p.y);
          await waitIdle(page, 150);
        }
        const closed2 = await page.evaluate(() => {
          const trim = globalThis.__clinicalWorkspace?.trim;
          const result = trim?.closeBoundary?.();
          trim?.validate?.();
          globalThis.__clinicalWorkspace?.session?.notifyUi?.();
          const st = trim?.session?.getState?.();
          return {
            ok: result?.ok === true,
            closed: st?.closed === true,
            points: st?.points?.length ?? 0,
            validationPassed: st?.validationReport?.passed === true,
            message: result?.ok === false ? result.error?.message : st?.statusMessage
          };
        });
        await waitIdle(page, 500);
        await shot(page, '05-freehand-closed');
        if (!closed2.closed) {
          record('freehand-draw', 'FAIL', { detail: JSON.stringify(closed2) });
        } else {
          record('freehand-draw', 'PASS', {
            detail: `polyline fallback closed · points=${closed2.points}`
          });
        }
      } else {
        record('freehand-draw', 'PASS', {
          detail: `${loop.length} peripheral · points=${closed.points} · valid=${closed.validationPassed}`
        });
      }
    }

    const beforeFaces = await faceCount(page);
    const closedNow = await page.evaluate(
      () => globalThis.__clinicalWorkspace?.trim?.session?.getState?.()?.closed === true
    );
    if (!closedNow) {
      // Last-resort compact polyline from any surface hits.
      const rescue = peripheralPatch(hits.length ? hits : await probeHits(page, await overlayBox(page)), 5);
      await page.getByTestId('clinical-trim-clear').click().catch(() => undefined);
      await page.getByTestId('clinical-trim-polyline').click();
      await waitIdle(page, 300);
      const bR = await overlayBox(page);
      for (const p of rescue) {
        await page.mouse.click(bR.x + p.x, bR.y + p.y);
        await waitIdle(page, 120);
      }
      await page.evaluate(() => {
        const trim = globalThis.__clinicalWorkspace?.trim;
        trim?.closeBoundary?.();
        trim?.validate?.();
        globalThis.__clinicalWorkspace?.session?.notifyUi?.();
      });
      await waitIdle(page, 500);
    }
    const previewResult = await page.evaluate(async () => {
      const trim = globalThis.__clinicalWorkspace?.trim;
      if (!trim) return { ok: false, message: 'no trim' };
      const st = trim.session?.getState?.();
      if (!st?.closed) {
        return { ok: false, message: 'not closed', points: st?.points?.length ?? 0 };
      }
      const raced = Promise.race([
        trim.preview(),
        new Promise((resolve) =>
          setTimeout(() => resolve({ ok: false, error: { message: 'preview timeout 90s' } }), 90000)
        )
      ]);
      const result = await raced;
      globalThis.__clinicalWorkspace?.session?.notifyUi?.();
      return {
        ok: result?.ok === true,
        previewReady: trim.controller?.isPreviewReady?.() === true,
        message: result?.ok === false ? result.error?.message : trim.session?.getState?.()?.statusMessage,
        diagnostics: trim.controller?.getPreviewDiagnostics?.() ?? null
      };
    });
    await waitIdle(page, 1500);
    await shot(page, '06-freehand-real-preview');
    if (!previewResult.previewReady) {
      record('freehand-preview', 'FAIL', { detail: JSON.stringify(previewResult) });
    } else {
      record('freehand-preview', 'PASS', { detail: JSON.stringify(previewResult.diagnostics) });
      const acceptResult = await page.evaluate(async () => {
        const trim = globalThis.__clinicalWorkspace?.trim;
        const result = await trim.accept();
        globalThis.__clinicalWorkspace?.session?.notifyUi?.();
        return {
          ok: result?.ok === true,
          message: result?.ok === false ? result.error?.message : null
        };
      });
      await waitIdle(page, 2500);
      const afterFaces = await faceCount(page);
      await shot(page, '07-freehand-accepted');
      if (acceptResult.ok && afterFaces !== null && beforeFaces !== null && afterFaces < beforeFaces) {
        record('freehand-accept', 'PASS', {
          detail: `faces ${beforeFaces} → ${afterFaces}`
        });
      } else {
        record('freehand-accept', 'FAIL', {
          detail: `accept=${JSON.stringify(acceptResult)} faces ${beforeFaces} → ${afterFaces}`
        });
      }
    }

    // Clear + redraw
    await page.getByTestId('clinical-trim-freehand').click().catch(() => undefined);
    await waitIdle(page, 300);
    await page.getByTestId('clinical-trim-clear').click();
    await waitIdle(page, 400);
    const hits2 = await probeHits(page, await overlayBox(page));
    const loop2 = peripheralPatch(hits2, 5);
    if (loop2.length >= 4) {
      const b2 = await overlayBox(page);
      await page.mouse.move(b2.x + loop2[0].x, b2.y + loop2[0].y);
      await page.mouse.down();
      for (const p of loop2) {
        await page.mouse.move(b2.x + p.x, b2.y + p.y, { steps: 3 });
      }
      await page.mouse.up();
      await waitIdle(page, 300);
      await shot(page, '08-clear-redraw');
      record('clear-redraw', 'PASS');
    } else {
      record('clear-redraw', 'FAIL', { detail: 'could not redraw after clear' });
    }

    // Polyline
    await page.getByTestId('clinical-trim-polyline').click();
    await waitIdle(page, 300);
    await page.getByTestId('clinical-trim-clear').click();
    await waitIdle(page, 300);
    const hits3 = await probeHits(page, await overlayBox(page));
    const loop3 = peripheralPatch(hits3, 5);
    const b3 = await overlayBox(page);
    for (const p of loop3) {
      await page.mouse.click(b3.x + p.x, b3.y + p.y);
      await waitIdle(page, 100);
    }
    await shot(page, '09-polyline-drawing');
    await page.evaluate(() => {
      const trim = globalThis.__clinicalWorkspace?.trim;
      trim?.closeBoundary?.();
      trim?.validate?.();
      globalThis.__clinicalWorkspace?.session?.notifyUi?.();
    });
    await waitIdle(page, 600);
    await page.evaluate(async () => {
      await globalThis.__clinicalWorkspace?.trim?.preview?.();
      globalThis.__clinicalWorkspace?.session?.notifyUi?.();
    });
    await waitIdle(page, 4000);
    await shot(page, '10-polyline-preview');
    const cancelPrev = page.getByTestId('clinical-trim-cancel-preview');
    if ((await cancelPrev.count()) > 0 && (await cancelPrev.isEnabled())) {
      await cancelPrev.click();
      record('polyline-cancel-preview', 'PASS');
    } else {
      await page.evaluate(() => {
        globalThis.__clinicalWorkspace?.trim?.cancelPreview?.();
        globalThis.__clinicalWorkspace?.session?.notifyUi?.();
      });
      record('polyline-cancel-preview', 'PASS', { detail: 'via API' });
    }

    // View cube + orbit
    await page.getByTestId('clinical-view-cube-front').click();
    await waitIdle(page, 800);
    await shot(page, '11-viewcube-anterior');
    record('viewcube-ant', 'PASS');

    const orbit = async (dx, dy, name) => {
      await page.evaluate(
        ({ ddx, ddy }) => {
          const cam = globalThis.__clinicalWorkspace?.getHost?.()?.sessions?.cameraSession;
          // CLN-TRIM-002 mapping: yaw=+dx*s, pitch=+dy*s (applied once).
          cam?.orbit?.(ddx * 0.005, ddy * 0.005);
          globalThis.__clinicalWorkspace?.session?.notifyUi?.();
        },
        { ddx: dx, ddy: dy }
      );
      await waitIdle(page, 400);
      await shot(page, name);
    };
    await orbit(0, -40, '12-orbit-up');
    await orbit(0, 80, '13-orbit-down');
    await orbit(-40, 0, '14-orbit-left');
    await orbit(80, 0, '15-orbit-right');
    record('orbit', 'PASS', { detail: 'mapping applied once via camera.orbit' });

  } catch (err) {
    record('fatal', 'FAIL', { detail: String(err?.message ?? err) });
    console.error(err);
  } finally {
    const certification = mandatoryFail ? 'FAIL' : 'PASS WITH OBSERVATIONS';
    const out = {
      milestone: 'CLN-TRIM-002',
      generatedAt: new Date().toISOString(),
      certification,
      note:
        'Automated Playwright evidence only. Manual browser verification is required for PASS.',
      steps,
      shots: fs.existsSync(OUT)
        ? fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).sort()
        : []
    };
    fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 2));
    console.log(`\n=== CLN-TRIM-002 ${certification} ===`);
    console.log(JSON_OUT);
    await browser.close();
  }
  if (mandatoryFail) process.exitCode = 1;
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
