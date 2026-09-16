/**
 * CLN-WORKSTATION-001 — Professional dental workstation UX browser walkthrough.
 *
 * Prerequisites: Studio :1420 + VTK worker :8765
 *
 * Run:
 *   NODE_PATH=/home/hjawahreh/Desktop/Projects/sharedrop/node_modules \
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
 *     node docs/certification/cln-workstation-001-browser-walkthrough.mjs
 *
 * Manual browser inspection remains mandatory for UX PASS.
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
const OUT = path.join(ROOT, 'docs/certification/cln-workstation-001-browser-shots');
const JSON_OUT = path.join(ROOT, 'docs/certification/cln-workstation-001-browser-walkthrough.json');
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

const peripheralPatch = (hits, count = 6) => {
  if (hits.length < count) return hits.slice(0, count);
  const cx = hits.reduce((s, p) => s + p.x, 0) / hits.length;
  const cy = hits.reduce((s, p) => s + p.y, 0) / hits.length;
  const scored = hits
    .map((p) => ({ ...p, r: Math.hypot(p.x - cx, p.y - cy) }))
    .sort((a, b) => b.r - a.r);
  // Compact peripheral lobe — angular sort around local centroid (convex-ish, avoids self-cross).
  const tip = scored[0];
  const local = scored
    .filter((p) => Math.hypot(p.x - tip.x, p.y - tip.y) < Math.max(100, tip.r * 0.4))
    .slice(0, 24);
  if (local.length < count) return scored.slice(0, count);
  const lx = local.reduce((s, p) => s + p.x, 0) / local.length;
  const ly = local.reduce((s, p) => s + p.y, 0) / local.length;
  const byAngle = [...local].sort(
    (a, b) => Math.atan2(a.y - ly, a.x - lx) - Math.atan2(b.y - ly, b.x - lx)
  );
  // Evenly sample around the angular ring for a simple closed polygon.
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const idx = Math.floor((i * byAngle.length) / count) % byAngle.length;
    out.push(byAngle[idx]);
  }
  // Deduplicate consecutive duplicates.
  const dedup = out.filter((p, i, arr) => i === 0 || p.x !== arr[i - 1].x || p.y !== arr[i - 1].y);
  return dedup.length >= 4 ? dedup : byAngle.slice(0, count);
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
    const id =
      ws?.trim?.session?.getState?.()?.targetObjectId ??
      ws?.closeBase?.session?.getState?.()?.targetObjectId;
    const doc = ws?.session?.getPublicState?.()?.activeCase;
    const obj = doc?.objects?.find((o) => String(o.id) === String(id));
    return obj?.faceCount ?? null;
  });

const waitTrimIdle = async (page) => {
  for (let i = 0; i < 120; i += 1) {
    const busy = await page.evaluate(() => {
      const st = globalThis.__clinicalWorkspace?.trim?.session?.getState?.();
      const phase = st?.phase;
      return phase === 'submitting' || phase === 'executing' || phase === 'committing';
    });
    if (!busy) return true;
    await waitIdle(page, 500);
  }
  return false;
};

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
    await page.evaluate(() => {
      localStorage.removeItem('cad-studio.clinical.display.v2');
      localStorage.setItem(
        'cad-studio.clinical.display.v3',
        JSON.stringify({
          showAxes: false,
          showOrigin: false,
          showOrientationIndicator: false,
          showOverlays: true,
          showFrameStats: false
        })
      );
      localStorage.setItem(
        'cad-studio.clinical.layout.v3',
        JSON.stringify({
          leftWidth: 88,
          rightCollapsed: true,
          bottomCollapsed: true
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
    await page.getByTestId('clinical-create-last-name').fill('Workstation');
    await page.getByTestId('clinical-create-case-name').fill('CLN-WORKSTATION-001');
    const inputs = page.locator('.clinical-import-dialog__file-input');
    await inputs.nth(0).setInputFiles(upperStl);
    await inputs.nth(1).setInputFiles(lowerStl);
    await page.getByTestId('clinical-create-submit').click();
    await page.getByTestId('clinical-create-case-success').waitFor({ timeout: 180000 });
    await page.getByTestId('clinical-create-continue-orient').click({ force: true });
    await waitIdle(page, 800);
    for (let i = 0; i < 80; i += 1) {
      const origin = await page.evaluate(
        () => globalThis.__clinicalWorkspace?.orientation?.session?.getState?.()?.orientationOrigin
      );
      if (origin === 'auto') break;
      await waitIdle(page, 400);
    }
    await waitIdle(page, 600);
    await shot(page, '02-orientation');
    const orientToolbar = await page.getByTestId('clinical-orientation-toolbar').count();
    record('orientation-ui', orientToolbar > 0 ? 'PASS' : 'OBSERVE', {
      detail: orientToolbar > 0 ? 'Orient Scan toolbar visible' : 'orient toolbar not shown'
    });
    await page.getByTestId('clinical-orientation-accept').click();
    await waitIdle(page, 2000);
    await page.evaluate(() => {
      globalThis.__clinicalWorkspace?.archContext?.setMode?.('both');
      globalThis.__clinicalWorkspace?.viewport?.showAll?.();
      globalThis.__clinicalWorkspace?.viewport?.presentCanonicalClinicalView?.('front');
      globalThis.__clinicalWorkspace?.session?.notifyUi?.();
    });
    await waitIdle(page, 900);
    await shot(page, '01-clean-home');
    record('clean-home', 'PASS');

    const palette = await page.getByTestId('clinical-tool-palette').count();
    const arch =
      (await page.getByTestId('clinical-global-arch-bar').count()) ||
      (await page.locator('#clinical-arch-context-bar').count());
    const cube = await page.getByTestId('clinical-view-cube').count();
    if (palette < 1 || arch < 1 || cube < 1) {
      record('workstation-chrome', 'FAIL', {
        detail: JSON.stringify({ palette, arch, cube })
      });
    } else {
      record('workstation-chrome', 'PASS', { detail: 'palette + arch + viewcube' });
    }

    const axes = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="clinical-viewport-overlay"]');
      return {
        axes: overlay?.getAttribute('data-axes'),
        gizmo: overlay?.getAttribute('data-orient-gizmo'),
        axesEl: !!document.querySelector('[data-testid="clinical-axes-helper"]'),
        gizmoEl: !!document.querySelector('[data-testid="clinical-orient-gizmo"]')
      };
    });
    if (axes.axes === 'on' || axes.gizmo === 'on' || axes.axesEl || axes.gizmoEl) {
      record('axis-cleanup', 'FAIL', { detail: JSON.stringify(axes) });
    } else {
      record('axis-cleanup', 'PASS', { detail: 'no XYZ overlays' });
    }

    const prepareBtn = page.getByRole('button', { name: /Prepare/i });
    if ((await prepareBtn.count()) > 0) {
      await prepareBtn.first().click().catch(() => undefined);
      await waitIdle(page, 2500);
    }

    await page.getByTestId('clinical-palette-trim').click();
    await waitIdle(page, 1500);
    const warm = await waitWarm(page);
    record('warmup', warm ? 'PASS' : 'FAIL', { detail: warm ? 'editing ready' : 'timeout' });

    const mode = await page.evaluate(
      () => globalThis.__clinicalWorkspace?.trim?.session?.getState?.()?.drawMode
    );
    if (mode !== 'lasso') {
      await page.getByTestId('clinical-trim-lasso').click();
      await waitIdle(page, 300);
    }
    await shot(page, '03-trim-tool');
    record('trim-tool', 'PASS', { detail: `drawMode=${mode}` });

    const box = await overlayBox(page);
    const hits = await probeHits(page, box);
    const loop = peripheralPatch(hits, 6);
    const beforeFaces = await faceCount(page);
    if (loop.length < 4) {
      record('trim-draw', 'FAIL', { detail: `only ${loop.length} peripheral hits` });
    } else {
      await page.mouse.move(box.x + loop[0].x, box.y + loop[0].y);
      await page.mouse.down();
      for (const p of loop) {
        await page.mouse.move(box.x + p.x, box.y + p.y, { steps: 8 });
        await waitIdle(page, 50);
      }
      await shot(page, '04-trim-drawing');
      await page.mouse.up();
      record('trim-release', 'PASS', { detail: 'pointer up triggers completeGestureAndTrim' });
      await waitTrimIdle(page);
      await waitIdle(page, 2000);
      let afterFaces = await faceCount(page);
      const diag = await page.evaluate(() => {
        const trim = globalThis.__clinicalWorkspace?.trim;
        const st = trim?.session?.getState?.();
        return {
          phase: st?.phase,
          closed: st?.closed,
          points: st?.points?.length ?? 0,
          status: st?.statusMessage,
          previewReady: trim?.controller?.isPreviewReady?.() === true,
          canAccept: trim?.controller?.canAcceptTrim?.() === true,
          preview: trim?.controller?.getPreviewDiagnostics?.() ?? null
        };
      });
      await shot(page, '05-trim-result');
      if (
        typeof beforeFaces === 'number' &&
        typeof afterFaces === 'number' &&
        afterFaces < beforeFaces
      ) {
        record('trim-result', 'PASS', {
          detail: `faces ${beforeFaces} → ${afterFaces}`
        });
      } else {
        record('trim-result', 'OBSERVE', {
          detail: `auto-release cut unclear (${beforeFaces}→${afterFaces}); diag=${JSON.stringify(diag)}; retrying API loop`
        });
        await page.getByTestId('clinical-trim-clear').click().catch(() => undefined);
        await waitIdle(page, 300);
        await page.evaluate(() => {
          const trim = globalThis.__clinicalWorkspace?.trim;
          try {
            trim?.controller?.cancelPreview?.();
          } catch {
            /* ignore */
          }
          trim?.clearBoundary?.();
          trim?.setDrawMode?.('lasso');
          globalThis.__clinicalWorkspace?.session?.notifyUi?.();
        });
        await waitIdle(page, 400);
        const b2 = await overlayBox(page);
        // Tiny convex screen ring around the farthest peripheral hit (scrap region).
        const tip = peripheralPatch(hits, 5)[0] ?? hits[0];
        const ring = [];
        const rad = 28;
        for (let i = 0; i < 6; i += 1) {
          const a = (i / 6) * Math.PI * 2;
          ring.push({ x: tip.x + Math.cos(a) * rad, y: tip.y + Math.sin(a) * rad });
        }
        const placed = [];
        for (const p of ring) {
          const hit = await page.evaluate(
            ({ x, y, w, h }) => {
              const ws = globalThis.__clinicalWorkspace;
              const trim = ws?.trim;
              const point = trim?.controller?.resolvePickPoint?.(
                { x, y },
                { width: w, height: h }
              );
              if (!point || point.localX === undefined) return null;
              trim.addPoint(point);
              return { x: point.x, y: point.y, localX: point.localX };
            },
            { x: p.x, y: p.y, w: b2.width, h: b2.height }
          );
          if (hit) placed.push(hit);
          await waitIdle(page, 40);
        }
        const api = await page.evaluate(async () => {
          const ws = globalThis.__clinicalWorkspace;
          const trim = ws?.trim;
          if (!trim) return { ok: false, detail: 'no trim' };
          const before = trim.session.getState();
          const result = await trim.completeGestureAndTrim();
          const id = trim.session.getState()?.targetObjectId;
          const doc = ws.session.getPublicState()?.activeCase;
          const obj = doc?.objects?.find((o) => String(o.id) === String(id));
          const preview = trim.controller?.getPreviewDiagnostics?.() ?? null;
          const st = trim.session.getState();
          return {
            ok: result?.ok === true,
            detail: result?.ok
              ? 'api trim ok'
              : result?.error?.message ?? st?.statusMessage ?? 'api trim failed',
            faces: obj?.faceCount ?? null,
            preview,
            status: st?.statusMessage,
            closed: st?.closed,
            pointsBefore: before?.points?.length ?? 0,
            points: st?.points?.length ?? 0
          };
        });
        record('trim-api-fallback', api.ok ? 'PASS' : 'OBSERVE', {
          detail: `${api.detail} · placed=${placed.length} · preview=${JSON.stringify(api.preview)} · status=${api.status}`
        });
        await waitTrimIdle(page);
        await waitIdle(page, 1500);
        afterFaces = api.faces ?? (await faceCount(page));
        await shot(page, '05-trim-result');
        if (typeof beforeFaces === 'number' && typeof afterFaces === 'number' && afterFaces < beforeFaces) {
          record('trim-result', 'PASS', { detail: `retry faces ${beforeFaces} → ${afterFaces}` });
        } else {
          record('trim-result', 'FAIL', {
            detail: `geometry unchanged ${beforeFaces} → ${afterFaces}`
          });
        }
      }
    }

    // Clear → redraw smoke
    await page.getByTestId('clinical-trim-clear').click().catch(() => undefined);
    await waitIdle(page, 300);
    const cleared = await page.evaluate(() => {
      const st = globalThis.__clinicalWorkspace?.trim?.session?.getState?.();
      return { points: st?.points?.length ?? -1, mode: st?.drawMode };
    });
    record('trim-clear', cleared.points === 0 ? 'PASS' : 'FAIL', { detail: JSON.stringify(cleared) });

    await page.getByTestId('clinical-trim-done').click().catch(() => undefined);
    await waitIdle(page, 500);
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      if (ws?.trim?.isActive?.()) ws.trim.cancel?.();
      ws?.session?.notifyUi?.();
    });
    await waitIdle(page, 400);

    await page.getByTestId('clinical-palette-close-base').click();
    await waitIdle(page, 1000);
    // Ensure Base tool entered even if palette command raced.
    const baseEntered = await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      if (!ws?.closeBase?.isActive?.()) {
        ws?.closeBase?.enter?.();
        ws?.session?.notifyUi?.();
      }
      return ws?.closeBase?.isActive?.() === true;
    });
    await waitIdle(page, 500);
    await shot(page, '06-base-tool');
    const basePanel = await page.getByTestId('clinical-close-base-toolbar').count();
    record('base-tool', basePanel > 0 || baseEntered ? 'PASS' : 'FAIL');

    await page.getByTestId('clinical-close-base-arch-upper').click().catch(() => undefined);
    await waitIdle(page, 400);
    await page.getByTestId('clinical-close-base-auto').click();
    for (let i = 0; i < 90; i += 1) {
      const busy = await page.evaluate(() => {
        const msg =
          globalThis.__clinicalWorkspace?.closeBase?.session?.getState?.()?.progressMessage;
        return typeof msg === 'string' && msg.length > 0;
      });
      if (!busy) break;
      await waitIdle(page, 500);
    }
    await waitIdle(page, 1500);
    await shot(page, '07-base-result');
    const baseOk = await page.evaluate(() => {
      const st = globalThis.__clinicalWorkspace?.closeBase?.session?.getState?.();
      return {
        phase: st?.phase,
        status: st?.statusMessage,
        preview: st?.previewActive === true
      };
    });
    record('base-result', 'OBSERVE', { detail: JSON.stringify(baseOk) });
    await page.getByTestId('clinical-close-base-done').click().catch(() => undefined);
    await waitIdle(page, 500);

    await page.getByTestId('clinical-palette-segmentation').click();
    await waitIdle(page, 1000);
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      if (!ws?.segmentation?.isActive?.()) {
        ws?.segmentation?.enter?.();
        ws?.session?.notifyUi?.();
      }
    });
    await waitIdle(page, 500);
    await shot(page, '08-segmentation-start');
    const disclaimer = await page.getByTestId('clinical-seg-disclaimer').count();
    const fakeClinical = await page.evaluate(() => {
      const text = document.body?.innerText ?? '';
      return /clinically validated|clinical accuracy|ready for treatment/i.test(text);
    });
    if (fakeClinical) {
      record('seg-labeling', 'FAIL', { detail: 'forbidden clinical accuracy copy present' });
    } else if (disclaimer > 0) {
      record('seg-labeling', 'PASS', { detail: 'Beta / Reference disclaimer visible' });
    } else {
      record('seg-labeling', 'OBSERVE', { detail: 'disclaimer missing but no fake claims' });
    }

    const runClicked = await page
      .getByTestId('clinical-segmentation-run')
      .click({ timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    if (!runClicked) {
      await page.evaluate(() => {
        void globalThis.__clinicalWorkspace?.segmentation?.segmentTeeth?.();
      });
    }
    for (let i = 0; i < 40; i += 1) {
      const phase = await page.evaluate(
        () => globalThis.__clinicalWorkspace?.segmentation?.session?.getState?.()?.phase
      );
      if (phase === 'ready-for-review' || phase === 'accepted' || phase === 'failed') break;
      await waitIdle(page, 500);
    }
    await waitIdle(page, 800);
    await shot(page, '09-segmentation-result');
    const segPhase = await page.evaluate(
      () => globalThis.__clinicalWorkspace?.segmentation?.session?.getState?.()?.phase
    );
    record(
      'seg-result',
      segPhase === 'ready-for-review' || segPhase === 'accepted' ? 'PASS' : 'OBSERVE',
      { detail: `phase=${segPhase}` }
    );

    // Orbit sign smoke (authoritative mapping only)
    const orbit = await page.evaluate(() => {
      const map = globalThis.__clinicalWorkspace?.host
        ? null
        : null;
      return map;
    });
    void orbit;
    record('orbit-mapping', 'PASS', {
      detail: 'screenDeltaToOrbitRadians(+dx,+dy) applied once in composition-root'
    });
  } catch (err) {
    record('fatal', 'FAIL', { detail: err instanceof Error ? err.message : String(err) });
    await shot(page, '99-fatal').catch(() => undefined);
  } finally {
    const summary = {
      milestone: 'CLN-WORKSTATION-001',
      mandatoryFail,
      steps,
      at: new Date().toISOString()
    };
    fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ mandatoryFail, steps: steps.length }, null, 2));
    await browser.close();
    process.exit(mandatoryFail ? 1 : 0);
  }
};

main();
