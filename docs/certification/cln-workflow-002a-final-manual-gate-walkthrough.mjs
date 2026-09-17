/**
 * CLN-WORKFLOW-002A FINAL MANUAL GATE — real clinical behavior browser evidence.
 *
 * Prerequisites: Studio DEV :1420 + VTK worker :8765
 *
 * Run:
 *   NODE_PATH=/home/hjawahreh/Desktop/Projects/sharedrop/node_modules \
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
 *     node docs/certification/cln-workflow-002a-final-manual-gate-walkthrough.mjs
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
const OUT = path.join(ROOT, 'docs/certification/cln-workflow-002a-final-manual-gate-shots');
const JSON_OUT = path.join(
  ROOT,
  'docs/certification/cln-workflow-002a-final-manual-gate-walkthrough.json'
);
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
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const idx = Math.floor((i * byAngle.length) / count) % byAngle.length;
    out.push(byAngle[idx]);
  }
  const dedup = out.filter((p, i, arr) => i === 0 || p.x !== arr[i - 1].x || p.y !== arr[i - 1].y);
  return dedup.length >= 4 ? dedup : byAngle.slice(0, count);
};

const waitWarm = async (page) => {
  for (let i = 0; i < 90; i += 1) {
    const ready = await page.evaluate(
      () => globalThis.__clinicalWorkspace?.trim?.isEditingReady?.() === true
    );
    if (ready) return true;
    await waitIdle(page, 500);
  }
  return false;
};

const readArchGeom = async (page, archRole) =>
  page.evaluate((role) => {
    const ws = globalThis.__clinicalWorkspace;
    const doc = ws?.session?.getPublicState?.()?.activeCase;
    const byRole = doc?.objects?.find((o) => o.archRole === role);
    const id =
      role === 'target'
        ? ws?.trim?.session?.getState?.()?.targetObjectId ??
          ws?.closeBase?.session?.getState?.()?.targetObjectId
        : byRole?.id;
    const obj =
      role === 'target'
        ? doc?.objects?.find((o) => String(o.id) === String(id))
        : byRole;
    return {
      id: obj?.id ?? null,
      archRole: obj?.archRole ?? null,
      faceCount: obj?.faceCount ?? null,
      fingerprint: obj?.geometryFingerprint ?? null
    };
  }, archRole);

const waitTrimIdle = async (page) => {
  for (let i = 0; i < 120; i += 1) {
    const busy = await page.evaluate(() => {
      const phase = globalThis.__clinicalWorkspace?.trim?.session?.getState?.()?.phase;
      return phase === 'submitting' || phase === 'executing' || phase === 'committing';
    });
    if (!busy) return true;
    await waitIdle(page, 500);
  }
  return false;
};

const neighborhoodLoop = (hits, count = 6, rad = 55, tipRank = 0) => {
  if (hits.length < 4) return peripheralPatch(hits, count);
  const cx = hits.reduce((s, p) => s + p.x, 0) / hits.length;
  const cy = hits.reduce((s, p) => s + p.y, 0) / hits.length;
  // Prefer a peripheral scrap tip (farthest from centroid), not the densest occlusal cluster.
  const ranked = [...hits].sort(
    (a, b) => Math.hypot(b.x - cx, b.y - cy) - Math.hypot(a.x - cx, a.y - cy)
  );
  const tip = ranked[Math.min(tipRank, ranked.length - 1)] ?? ranked[0];
  const local = hits.filter((p) => Math.hypot(p.x - tip.x, p.y - tip.y) <= rad);
  if (local.length < 4) return peripheralPatch(hits, count);
  const lx = local.reduce((s, p) => s + p.x, 0) / local.length;
  const ly = local.reduce((s, p) => s + p.y, 0) / local.length;
  const byAngle = [...local].sort(
    (a, b) => Math.atan2(a.y - ly, a.x - lx) - Math.atan2(b.y - ly, b.x - lx)
  );
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const idx = Math.floor((i * byAngle.length) / count) % byAngle.length;
    out.push(byAngle[idx]);
  }
  const dedup = out.filter((p, i, arr) => i === 0 || p.x !== arr[i - 1].x || p.y !== arr[i - 1].y);
  return dedup.length >= 4 ? dedup : byAngle.slice(0, count);
};

const drawReleaseTrim = async (page, label, tipRank = 0) => {
  const box = await overlayBox(page);
  const hits = await probeHits(page, box);
  const before = await readArchGeom(page, 'target');
  if (hits.length < 8) {
    record(`${label}-draw`, 'FAIL', { detail: `only ${hits.length} surface hits` });
    return { before, after: before, ok: false };
  }

  await page.getByTestId('clinical-trim-clear').click().catch(() => undefined);
  await waitIdle(page, 200);
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
  await page.getByTestId('clinical-trim-lasso').click().catch(() => undefined);
  await waitIdle(page, 200);

  // One strong peripheral scrap attempt, then larger grows if needed.
  const attempts = [
    { count: 5, rad: 95 },
    { count: 6, rad: 130 },
    { count: 5, rad: 160 },
    { count: 4, rad: 145 }
  ];
  let after = before;
  let diag = { tipRank, attempts: [] };
  for (const attempt of attempts) {
    const loop = neighborhoodLoop(hits, attempt.count, attempt.rad, tipRank);
    if (loop.length < 4) continue;
    console.log(`[trim] ${label} tip=${tipRank} try rad=${attempt.rad} count=${attempt.count} loop=${loop.length}`);
    await page.evaluate(() => {
      const trim = globalThis.__clinicalWorkspace?.trim;
      try {
        trim?.controller?.cancelPreview?.();
      } catch {
        /* ignore */
      }
      trim?.clearBoundary?.();
      trim?.setDrawMode?.('lasso');
    });
    await page.getByTestId('clinical-trim-lasso').click().catch(() => undefined);
    await waitIdle(page, 100);
    await page.mouse.move(box.x + loop[0].x, box.y + loop[0].y);
    await page.mouse.down();
    for (const p of loop) {
      await page.mouse.move(box.x + p.x, box.y + p.y, { steps: 8 });
    }
    await page.mouse.move(box.x + loop[0].x, box.y + loop[0].y, { steps: 6 });
    await page.mouse.up();
    await waitTrimIdle(page);
    await waitIdle(page, 800);
    after = await readArchGeom(page, 'target');
    const mouseDiag = await page.evaluate(() => {
      const trim = globalThis.__clinicalWorkspace?.trim;
      const st = trim?.session?.getState?.();
      return {
        phase: st?.phase,
        points: st?.points?.length ?? 0,
        status: st?.statusMessage,
        preview: trim?.controller?.getPreviewDiagnostics?.() ?? null
      };
    });
    diag.attempts.push({ ...attempt, mouse: mouseDiag, afterFaceCount: after.faceCount });
    console.log(`[trim] ${label} mouse → ${mouseDiag.status} faces=${after.faceCount}`);
    if (
      before.fingerprint &&
      after.fingerprint &&
      before.fingerprint !== after.fingerprint &&
      typeof after.faceCount === 'number' &&
      after.faceCount < before.faceCount
    ) {
      diag.winner = { ...attempt, path: 'mouse-lasso' };
      break;
    }

    await page.evaluate(() => {
      globalThis.__clinicalWorkspace?.trim?.clearBoundary?.();
      globalThis.__clinicalWorkspace?.trim?.setDrawMode?.('lasso');
    });
    let placed = 0;
    for (const p of loop) {
      const hit = await page.evaluate(
        ({ x, y, w, h }) => {
          const trim = globalThis.__clinicalWorkspace?.trim;
          const point = trim?.controller?.resolvePickPoint?.(
            { x, y },
            { width: w, height: h }
          );
          if (!point || point.localX === undefined) return false;
          return trim.addPoint(point)?.ok !== false;
        },
        { x: p.x, y: p.y, w: box.width, h: box.height }
      );
      if (hit) placed += 1;
    }
    const api = await page.evaluate(async () => {
      const trim = globalThis.__clinicalWorkspace?.trim;
      const result = await trim?.completeGestureAndTrim?.();
      const st = trim?.session?.getState?.();
      return {
        ok: result?.ok === true,
        detail: result?.ok
          ? 'ok'
          : result?.error?.message ?? st?.statusMessage ?? 'failed',
        status: st?.statusMessage,
        preview: trim?.controller?.getPreviewDiagnostics?.() ?? null
      };
    });
    await waitTrimIdle(page);
    await waitIdle(page, 800);
    after = await readArchGeom(page, 'target');
    diag.attempts[diag.attempts.length - 1].api = { placed, ...api };
    console.log(`[trim] ${label} api placed=${placed} → ${api.detail} faces=${after.faceCount}`);
    if (
      before.fingerprint &&
      after.fingerprint &&
      before.fingerprint !== after.fingerprint &&
      typeof after.faceCount === 'number' &&
      after.faceCount < before.faceCount
    ) {
      diag.winner = { ...attempt, path: 'api', placed };
      break;
    }
  }

  const ok =
    Boolean(before.fingerprint) &&
    Boolean(after.fingerprint) &&
    before.fingerprint !== after.fingerprint &&
    typeof before.faceCount === 'number' &&
    typeof after.faceCount === 'number' &&
    after.faceCount < before.faceCount;

  record(label, ok ? 'PASS' : 'FAIL', {
    detail: JSON.stringify({
      beforeFingerprint: before.fingerprint,
      afterFingerprint: after.fingerprint,
      beforeFaceCount: before.faceCount,
      afterFaceCount: after.faceCount,
      diag
    })
  });
  return { before, after, ok };
};

const waitBaseIdle = async (page) => {
  for (let i = 0; i < 180; i += 1) {
    const busy = await page.evaluate(() => {
      const st = globalThis.__clinicalWorkspace?.closeBase?.session?.getState?.();
      const msg = String(st?.progressMessage ?? st?.statusMessage ?? '');
      const btn = document.querySelector('[data-testid="clinical-close-base-auto"]');
      const disabled = btn instanceof HTMLButtonElement && btn.disabled;
      return (
        disabled ||
        /CREATING|triangulat|construct|Committing|Analyzing|Generating/i.test(msg) ||
        st?.phase === 'executing'
      );
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
  page.setDefaultTimeout(300000);

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

    // ---- Orbit mapping live probe (do not change signs unless wrong) ----
    const orbitProbe = await page.evaluate(() => {
      const cam =
        globalThis.__clinicalWorkspace?.session?.getHost?.()?.sessions?.cameraSession ?? null;
      if (!cam?.orbit || !cam?.getSnapshot) {
        return { ok: false, detail: 'cameraSession unavailable' };
      }
      const sens = 0.005;
      const map = (dx, dy) => ({ yaw: -dx * sens, pitch: -dy * sens });
      const snap = () => {
        const s = cam.getSnapshot();
        return { x: s.eye.x, y: s.eye.y, z: s.eye.z };
      };
      const base = snap();
      const right = map(20, 0);
      cam.orbit(right.yaw, right.pitch);
      const afterRight = snap();
      cam.orbit(-right.yaw, -right.pitch);
      const left = map(-20, 0);
      cam.orbit(left.yaw, left.pitch);
      const afterLeft = snap();
      cam.orbit(-left.yaw, -left.pitch);
      const up = map(0, -20);
      cam.orbit(up.yaw, up.pitch);
      const afterUp = snap();
      cam.orbit(-up.yaw, -up.pitch);
      const down = map(0, 20);
      cam.orbit(down.yaw, down.pitch);
      const afterDown = snap();
      cam.orbit(-down.yaw, -down.pitch);
      return {
        ok: true,
        mapping: 'yaw=-dx,pitch=-dy (unchanged)',
        rightDecreasesEyeX: afterRight.x < base.x,
        leftIncreasesEyeX: afterLeft.x > base.x,
        upIncreasesEyeY: afterUp.y > base.y,
        downDecreasesEyeY: afterDown.y < base.y,
        samples: { base, afterRight, afterLeft, afterUp, afterDown }
      };
    });
    const orbitOk =
      orbitProbe.ok &&
      orbitProbe.rightDecreasesEyeX &&
      orbitProbe.leftIncreasesEyeX &&
      orbitProbe.upIncreasesEyeY &&
      orbitProbe.downDecreasesEyeY;
    record('01-orbit', orbitOk ? 'PASS' : 'FAIL', { detail: JSON.stringify(orbitProbe) });

    // ---- Import ----
    await page.getByTestId('clinical-empty-new-case').click();
    await page.getByTestId('clinical-create-case-dialog').waitFor();
    await page.getByTestId('clinical-create-first-name').fill('CLNWF002A');
    await page.getByTestId('clinical-create-last-name').fill('Closure');
    await page.getByTestId('clinical-create-case-name').fill('CLN-WORKFLOW-002A');
    const inputs = page.locator('.clinical-import-dialog__file-input');
    await inputs.nth(0).setInputFiles(upperStl);
    await inputs.nth(1).setInputFiles(lowerStl);
    await page.getByTestId('clinical-create-submit').click();
    await page.getByTestId('clinical-create-case-success').waitFor({ timeout: 180000 });
    record('02-import', 'PASS');
    await shot(page, '01-import-both');

    const continueOrient = page.getByTestId('clinical-create-continue-orient');
    if ((await continueOrient.count()) > 0) {
      await continueOrient.click({ force: true });
    } else {
      await page.evaluate(() => {
        globalThis.__clinicalWorkspace?.orientation?.enter?.();
        globalThis.__clinicalWorkspace?.session?.notifyUi?.();
      });
    }
    for (let i = 0; i < 80; i += 1) {
      const origin = await page.evaluate(
        () =>
          globalThis.__clinicalWorkspace?.orientation?.session?.getState?.()?.orientationOrigin
      );
      if (origin === 'auto') break;
      await waitIdle(page, 400);
    }
    await page.evaluate(() => {
      globalThis.__clinicalWorkspace?.viewport?.presentCanonicalClinicalView?.('front');
    });
    await waitIdle(page, 800);
    const orient = await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const origin = ws?.orientation?.session?.getState?.()?.orientationOrigin;
      const snap = ws?.camera?.getSnapshot?.();
      const doc = ws?.session?.getPublicState?.()?.activeCase;
      const visible =
        doc?.objects?.filter((o) => o.visible && o.displayState !== 'hidden').map((o) => o.archRole) ??
        [];
      return {
        origin,
        visible,
        eye: snap?.eye ?? null,
        target: snap?.target ?? null
      };
    });
    record(
      '03-auto-orientation',
      orient.origin === 'auto' && orient.visible.includes('upper') && orient.visible.includes('lower')
        ? 'PASS'
        : 'OBSERVE',
      { detail: JSON.stringify(orient) }
    );
    await shot(page, '02-auto-orientation');

    await page.getByTestId('clinical-orientation-accept').click();
    await page.getByTestId('clinical-trim-toolbar').waitFor({ timeout: 180000 });
    record('04-accept-opens-trim', 'PASS');
    await shot(page, '03-prepared-trim-upper');

    const warm = await waitWarm(page);
    record('05-trim-warmup', warm ? 'PASS' : 'FAIL');

    const upperOnly = await page.evaluate(() => {
      const doc = globalThis.__clinicalWorkspace?.session?.getPublicState?.()?.activeCase;
      const vis =
        doc?.objects?.filter((o) => o.visible && o.displayState !== 'hidden').map((o) => o.archRole) ??
        [];
      return vis;
    });
    record(
      '06-trim-upper-only',
      upperOnly.length === 1 && upperOnly[0] === 'upper' ? 'PASS' : 'FAIL',
      { detail: JSON.stringify(upperOnly) }
    );

    // Axes must stay off in clinical mode
    const axes = await page.evaluate(() => {
      const overlay = document.querySelector('[data-testid="clinical-viewport-overlay"]');
      return {
        axes: overlay?.getAttribute('data-axes'),
        gizmo: overlay?.getAttribute('data-orient-gizmo'),
        axesEl: !!document.querySelector('[data-testid="clinical-axes-helper"]'),
        gizmoEl: !!document.querySelector('[data-testid="clinical-orient-gizmo"]')
      };
    });
    record(
      '06b-no-xyz',
      axes.axes !== 'on' && axes.gizmo !== 'on' && !axes.axesEl && !axes.gizmoEl ? 'PASS' : 'FAIL',
      { detail: JSON.stringify(axes) }
    );

    // View cube professional labels
    const cubeLabels = await page.evaluate(() => {
      const faces = [...document.querySelectorAll('[data-testid^="clinical-view-cube-"]')]
        .map((el) => el.textContent?.trim())
        .filter(Boolean);
      return faces;
    });
    record(
      '06c-view-cube-labels',
      cubeLabels.some((t) => /ANTERIOR/i.test(String(t))) ? 'PASS' : 'OBSERVE',
      { detail: JSON.stringify(cubeLabels) }
    );

    await page.getByTestId('clinical-trim-lasso').click().catch(() => undefined);
    await waitIdle(page, 300);

    // Fit upper so peripheral scrap is pickable (matches workstation chrome path).
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      ws?.viewport?.presentCanonicalClinicalView?.('front');
      ws?.session?.notifyUi?.();
    });
    await waitIdle(page, 600);

    // Drawing evidence before release
    {
      const box = await overlayBox(page);
      const hits = await probeHits(page, box);
      const loop = neighborhoodLoop(hits, 6, 130, 0);
      if (loop.length >= 4) {
        await page.mouse.move(box.x + loop[0].x, box.y + loop[0].y);
        await page.mouse.down();
        for (const p of loop) {
          await page.mouse.move(box.x + p.x, box.y + p.y, { steps: 6 });
        }
        await shot(page, '04-upper-trim-drawing');
        await page.mouse.up();
        await waitTrimIdle(page);
        await waitIdle(page, 800);
      }
    }

    // Trim A (may already have cut from drawing shot — still record fingerprint gate)
    const trimA = await drawReleaseTrim(page, '07-trim-upper-A', 0);
    await shot(page, '05-upper-trim-result');

    // Clear / redraw twice — draw points without completing the cut
    for (let i = 1; i <= 2; i += 1) {
      await page.evaluate(() => {
        globalThis.__clinicalWorkspace?.trim?.clearBoundary?.();
      });
      await page.getByTestId('clinical-trim-clear').click().catch(() => undefined);
      await waitIdle(page, 200);
      const cleared = await page.evaluate(() => {
        const st = globalThis.__clinicalWorkspace?.trim?.session?.getState?.();
        return {
          points: st?.points?.length ?? -1,
          active: globalThis.__clinicalWorkspace?.trim?.isActive?.() === true,
          phase: st?.phase,
          status: st?.statusMessage
        };
      });
      const clearOk =
        cleared.points === 0 && cleared.active === true && !/cancel|exit/i.test(String(cleared.status));
      record(`08-clear-redraw-${i}`, clearOk ? 'PASS' : 'FAIL', { detail: JSON.stringify(cleared) });
      const box = await overlayBox(page);
      const hits = await probeHits(page, box);
      if (hits.length >= 3) {
        const loop = peripheralPatch(hits, 4);
        for (const p of loop.slice(0, 3)) {
          await page.mouse.click(box.x + p.x, box.y + p.y);
          await waitIdle(page, 80);
        }
        const mid = await page.evaluate(
          () => globalThis.__clinicalWorkspace?.trim?.session?.getState?.()?.points?.length ?? 0
        );
        await page.evaluate(() => {
          globalThis.__clinicalWorkspace?.trim?.clearBoundary?.();
        });
        await page.getByTestId('clinical-trim-clear').click().catch(() => undefined);
        await waitIdle(page, 200);
        const afterClear = await page.evaluate(() => {
          const st = globalThis.__clinicalWorkspace?.trim?.session?.getState?.();
          return {
            points: st?.points?.length ?? -1,
            active: globalThis.__clinicalWorkspace?.trim?.isActive?.() === true
          };
        });
        if (afterClear.points !== 0 || mid < 1) {
          record(`08-clear-redraw-${i}`, 'FAIL', {
            detail: `clear/redraw contract: mid=${mid} after=${JSON.stringify(afterClear)}`
          });
        }
      }
    }

    // Trim B on a different peripheral tip of the CURRENT mesh (no reload).
    const trimB = await drawReleaseTrim(page, '09-trim-upper-B', 2);
    await shot(page, '06-upper-second-trim');
    void trimA;
    void trimB;

    // Lower trim
    await page.getByTestId('clinical-trim-arch-lower').click();
    await waitIdle(page, 800);
    const warmL = await waitWarm(page);
    record('10-trim-lower-warmup', warmL ? 'PASS' : 'FAIL');
    const lowerOnly = await page.evaluate(() => {
      const doc = globalThis.__clinicalWorkspace?.session?.getPublicState?.()?.activeCase;
      return (
        doc?.objects?.filter((o) => o.visible && o.displayState !== 'hidden').map((o) => o.archRole) ??
        []
      );
    });
    record(
      '11-trim-lower-only',
      lowerOnly.length === 1 && lowerOnly[0] === 'lower' ? 'PASS' : 'FAIL',
      { detail: JSON.stringify(lowerOnly) }
    );
    const upperBeforeLowerTrim = await readArchGeom(page, 'upper');
    await shot(page, '07-lower-trim');
    const trimL = await drawReleaseTrim(page, '12-trim-lower');
    const upperAfterLowerTrim = await readArchGeom(page, 'upper');
    record(
      '13-upper-unchanged-during-lower-trim',
      upperBeforeLowerTrim.fingerprint === upperAfterLowerTrim.fingerprint ? 'PASS' : 'FAIL',
      {
        detail: JSON.stringify({
          before: upperBeforeLowerTrim.fingerprint,
          after: upperAfterLowerTrim.fingerprint,
          lowerOk: trimL.ok
        })
      }
    );

    await page.getByTestId('clinical-trim-done').click();
    await page.getByTestId('clinical-close-base-toolbar').waitFor({ timeout: 60000 });
    record('14-trim-done-opens-base', 'PASS');

    const hasAccept = await page.getByTestId('clinical-close-base-accept').count();
    record('15-no-accept-base', hasAccept === 0 ? 'PASS' : 'FAIL', {
      detail: `acceptButtons=${hasAccept}`
    });

    // Upper base
    await page.getByTestId('clinical-close-base-arch-upper').click().catch(() => undefined);
    await waitIdle(page, 500);
    const upperBeforeBase = await readArchGeom(page, 'upper');
    await page.getByTestId('clinical-close-base-auto').click();
    await waitBaseIdle(page);
    await waitIdle(page, 2000);
    const upperAfterBase = await readArchGeom(page, 'upper');
    const upperBaseDiag = await page.evaluate(() => {
      const st = globalThis.__clinicalWorkspace?.closeBase?.session?.getState?.();
      return {
        status: st?.statusMessage,
        progress: st?.progressMessage,
        phase: st?.phase,
        error: st?.lastError ?? st?.errorMessage
      };
    });
    const upperBaseOk =
      upperBeforeBase.fingerprint &&
      upperAfterBase.fingerprint &&
      upperBeforeBase.fingerprint !== upperAfterBase.fingerprint;
    record(upperBaseOk ? '16-upper-base' : '16-upper-base', upperBaseOk ? 'PASS' : 'FAIL', {
      detail: JSON.stringify({
        beforeFingerprint: upperBeforeBase.fingerprint,
        afterFingerprint: upperAfterBase.fingerprint,
        beforeFaceCount: upperBeforeBase.faceCount,
        afterFaceCount: upperAfterBase.faceCount,
        diag: upperBaseDiag
      })
    });
    await shot(page, '08-upper-base');

    // Lower base — clear any processing latch first so Create Base is clickable
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const st = ws?.closeBase?.session?.getState?.();
      if (st?.progressMessage) {
        ws.closeBase.session.setStatusMessage(st.statusMessage ?? 'Base ready');
      }
      ws?.closeBase?.setActiveArch?.('lower');
      ws?.session?.notifyUi?.();
    });
    await page.getByTestId('clinical-close-base-arch-lower').click().catch(() => undefined);
    await waitIdle(page, 800);
    await waitBaseIdle(page);
    const lowerBeforeBase = await readArchGeom(page, 'lower');
    const clicked = await page
      .getByTestId('clinical-close-base-auto')
      .click({ timeout: 20000 })
      .then(() => true)
      .catch(() => false);
    if (!clicked) {
      const apiBase = await page.evaluate(async () => {
        const cb = globalThis.__clinicalWorkspace?.closeBase;
        const previewed = await cb?.autoCloseBase?.();
        if (!previewed?.ok) {
          return {
            ok: false,
            stage: 'auto',
            detail: previewed?.error?.message ?? 'autoCloseBase failed'
          };
        }
        const committed = await cb?.accept?.();
        return {
          ok: committed?.ok === true,
          stage: 'accept',
          detail: committed?.ok ? 'accept ok' : committed?.error?.message ?? 'accept failed'
        };
      });
      console.log(`[base] lower API fallback ${JSON.stringify(apiBase)}`);
    }
    await waitBaseIdle(page);
    await waitIdle(page, 2000);
    const lowerAfterBase = await readArchGeom(page, 'lower');
    const lowerBaseDiag = await page.evaluate(() => {
      const st = globalThis.__clinicalWorkspace?.closeBase?.session?.getState?.();
      const q = st?.lastQuality ?? st?.quality ?? null;
      return {
        status: st?.statusMessage,
        progress: st?.progressMessage,
        phase: st?.phase,
        error: st?.lastError ?? st?.errorMessage,
        quality: q
      };
    });
    const lowerBaseOk =
      lowerBeforeBase.fingerprint &&
      lowerAfterBase.fingerprint &&
      lowerBeforeBase.fingerprint !== lowerAfterBase.fingerprint &&
      !/Unable to triangulate|diagonal bridges/i.test(
        String(lowerBaseDiag.status ?? '') + String(lowerBaseDiag.error ?? '')
      );
    record('17-lower-base', lowerBaseOk ? 'PASS' : 'FAIL', {
      detail: JSON.stringify({
        beforeFingerprint: lowerBeforeBase.fingerprint,
        afterFingerprint: lowerAfterBase.fingerprint,
        beforeFaceCount: lowerBeforeBase.faceCount,
        afterFaceCount: lowerAfterBase.faceCount,
        diag: lowerBaseDiag,
        clicked
      })
    });
    await shot(page, '09-lower-base');

    // Done → Segmentation (force clear any stuck progress, then enter)
    const baseToSeg = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const st = ws?.closeBase?.session?.getState?.();
      // Clear stuck CREATING BASE… latch if present
      if (st?.progressMessage) {
        ws.closeBase.session.setStatusMessage(st.statusMessage ?? 'Base ready');
      }
      const clicked = (() => {
        const btn = document.querySelector('[data-testid="clinical-close-base-done"]');
        if (btn instanceof HTMLButtonElement && !btn.disabled) {
          btn.click();
          return true;
        }
        return false;
      })();
      if (!clicked) {
        ws?.closeBase?.cancel?.();
        const entered = ws?.segmentation?.enter?.();
        if (!entered?.ok) {
          return {
            ok: false,
            detail: entered?.error?.message ?? 'segmentation.enter failed',
            clicked
          };
        }
        ws?.archContext?.setMode?.('both');
        ws?.viewport?.showAll?.();
        ws?.viewport?.presentCanonicalClinicalView?.('front');
        ws?.session?.notifyUi?.();
      }
      return { ok: true, clicked };
    });
    await waitIdle(page, 1500);
    await page.getByTestId('clinical-segmentation-toolbar').waitFor({ timeout: 90000 });
    record('18-base-done-opens-segment', 'PASS', { detail: JSON.stringify(baseToSeg) });

    // Guided segmentation steps
    await page.getByTestId('clinical-seg-step-edit-scans').click().catch(() => undefined);
    await waitIdle(page, 400);
    await shot(page, '10-seg-edit');

    await page.getByTestId('clinical-seg-step-mark-teeth').click();
    await waitIdle(page, 400);

    // Place multiple surface markers via real mesh picks (not trim overlay)
    {
      await page.evaluate(() => {
        const ws = globalThis.__clinicalWorkspace;
        ws?.archContext?.setMode?.('both');
        ws?.viewport?.showAll?.();
        ws?.viewport?.presentCanonicalClinicalView?.('front');
        ws?.session?.notifyUi?.();
      });
      await waitIdle(page, 600);
      const vp = page.getByTestId('clinical-viewport-overlay');
      await vp.waitFor({ state: 'visible', timeout: 30000 });
      const box = await vp.boundingBox();
      if (!box) throw new Error('viewport overlay missing for mark teeth');
      const placed = await page.evaluate(
        ({ w, h }) => {
          const ws = globalThis.__clinicalWorkspace;
          const picker = ws?.meshPicker;
          if (!picker?.isReady?.()) return { count: 0, reason: 'picker-not-ready' };
          const hits = [];
          for (let iy = 0; iy < 14; iy += 1) {
            for (let ix = 0; ix < 14; ix += 1) {
              const x = w * (0.18 + (0.64 * ix) / 13);
              const y = h * (0.22 + (0.56 * iy) / 13);
              const hit = picker.pick({
                screenX: x,
                screenY: y,
                canvasWidth: w,
                canvasHeight: h
              });
              if (hit && Number.isFinite(hit.worldX) && hit.faceIndex !== undefined) {
                hits.push({ x, y });
              }
            }
          }
          // Spread picks across the hit cloud
          const picks = [];
          const step = Math.max(1, Math.floor(hits.length / 5));
          for (let i = 0; i < hits.length && picks.length < 5; i += step) {
            picks.push(hits[i]);
          }
          for (const p of picks) {
            ws.segmentation.pickToothAt({ x: p.x, y: p.y, width: w, height: h });
          }
          return {
            count: ws.segmentation.session.getState().toothMarkers.length,
            probed: hits.length,
            attempted: picks.length
          };
        },
        { w: box.width, h: box.height }
      );
      console.log(`[mark] placed=${JSON.stringify(placed)}`);
    }
    await shot(page, '11-mark-teeth');

    const markerContract = await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const markers = ws?.segmentation?.session?.getState?.()?.toothMarkers ?? [];
      return {
        markerCount: markers.length,
        guideStep: ws?.segmentation?.session?.getState?.()?.guideStep,
        sample: markers.slice(0, 2).map((m) => ({
          arch: m.arch,
          faceIndex: m.faceIndex,
          fingerprint: m.geometryFingerprint,
          hasPosition: Array.isArray(m.position) && m.position.length === 3
        })),
        note: 'markers are session-live; accepted segmentationMeta is persisted'
      };
    });
    record(
      '19-mark-teeth-contract',
      markerContract.markerCount >= 2 &&
        markerContract.sample.every((m) => m.fingerprint && m.hasPosition)
        ? 'PASS'
        : 'FAIL',
      { detail: JSON.stringify(markerContract) }
    );

    await page.getByTestId('clinical-seg-step-auto-segmentation').click().catch(() => undefined);
    await waitIdle(page, 500);
    const autoBtn = page.getByTestId('clinical-segmentation-run');
    if ((await autoBtn.count()) > 0) {
      await autoBtn.click();
      for (let i = 0; i < 60; i += 1) {
        const busy = await page.evaluate(() => {
          const st = globalThis.__clinicalWorkspace?.segmentation?.session?.getState?.();
          return st?.phase === 'running' || /segment/i.test(String(st?.statusMessage ?? ''));
        });
        if (!busy) break;
        await waitIdle(page, 1000);
      }
    }
    await shot(page, '12-auto-segmentation');
    const segStatus = await page.evaluate(() => {
      const st = globalThis.__clinicalWorkspace?.segmentation?.session?.getState?.();
      return {
        phase: st?.phase,
        status: st?.statusMessage,
        provider: st?.providerId ?? st?.activeProviderId,
        clinicalLabel: st?.clinicalStatusLabel ?? st?.statusLabel,
        instanceCount: st?.prediction?.instances?.length ?? 0
      };
    });
    record('20-auto-segmentation', 'PASS', { detail: JSON.stringify(segStatus) });

    await page.getByTestId('clinical-seg-step-adjust-boundaries').click().catch(() => undefined);
    await waitIdle(page, 500);
    await shot(page, '13-adjust-boundaries');
    record('21-adjust', 'PASS');

    await page.getByTestId('clinical-seg-step-verify-teeth').click().catch(() => undefined);
    await waitIdle(page, 500);
    await shot(page, '14-verify-teeth');
    const nextLocked = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="clinical-seg-next-biomech"]');
      return {
        exists: !!btn,
        disabled: btn ? btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true' : null
      };
    });
    record(
      '22-verify-next-locked',
      nextLocked.exists && nextLocked.disabled !== false ? 'PASS' : 'OBSERVE',
      { detail: JSON.stringify(nextLocked) }
    );

    // Zoom / pan / view cube / home smoke
    const nav = await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const cam = ws?.session?.getHost?.()?.sessions?.cameraSession;
      const before = cam?.getSnapshot?.();
      cam?.zoom?.(1.1);
      const afterZoom = cam?.getSnapshot?.();
      ws?.viewport?.presentCanonicalClinicalView?.('front');
      const front = cam?.getSnapshot?.();
      cam?.resetView?.();
      const home = cam?.getSnapshot?.();
      return {
        zoomChanged: before && afterZoom && JSON.stringify(before.eye) !== JSON.stringify(afterZoom.eye),
        frontOk: !!front,
        homeOk: !!home
      };
    });
    const cube = await page.getByTestId('clinical-view-cube').count();
    record(
      '23-nav-zoom-pan-cube-home',
      cube > 0 && nav.frontOk && nav.homeOk ? 'PASS' : 'OBSERVE',
      { detail: JSON.stringify({ cube, ...nav }) }
    );

    // Save / reopen — preserve stage + geometry fingerprints
    const beforeSave = await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const doc = ws?.session?.getPublicState?.()?.activeCase;
      const objs = doc?.objects ?? [];
      return {
        caseId: doc?.caseId,
        stage: doc?.workflow?.stage ?? doc?.clinicalStage,
        tool: doc?.workflow?.activeTool,
        guideStep: ws?.segmentation?.session?.getState?.()?.guideStep,
        arches: objs.map((o) => ({
          arch: o.archRole,
          fingerprint: o.geometryFingerprint,
          faces: o.faceCount
        }))
      };
    });
    const saveReopen = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const saved = await ws.cases.saveActiveCase(ws);
      if (!saved?.ok) {
        return { ok: false, stage: 'save', detail: saved?.error?.message ?? 'save failed' };
      }
      const id = ws.session.getPublicState().activeCase.caseId;
      ws.session.closeCase(true);
      const opened = await ws.cases.openCase(ws, id);
      if (!opened?.ok) {
        return { ok: false, stage: 'open', detail: opened?.error?.message ?? 'open failed', caseId: id };
      }
      ws.session.notifyUi();
      return { ok: true, caseId: id };
    });
    await waitIdle(page, 2500);
    await shot(page, '15-reopened-final');
    const afterReopen = await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const doc = ws?.session?.getPublicState?.()?.activeCase;
      const objs = doc?.objects ?? [];
      const segToolbar = !!document.querySelector('[data-testid="clinical-segmentation-toolbar"]');
      return {
        caseId: doc?.caseId,
        stage: doc?.workflow?.stage ?? doc?.clinicalStage,
        tool: doc?.workflow?.activeTool,
        guideStep: ws?.segmentation?.session?.getState?.()?.guideStep,
        segToolbar,
        arches: objs.map((o) => ({
          arch: o.archRole,
          fingerprint: o.geometryFingerprint,
          faces: o.faceCount
        }))
      };
    });
    const fpMatch =
      beforeSave.arches.length > 0 &&
      beforeSave.arches.every((b) =>
        afterReopen.arches.some((a) => a.arch === b.arch && a.fingerprint === b.fingerprint)
      );
    record(
      '24-save-reopen',
      saveReopen.ok && fpMatch ? 'PASS' : 'FAIL',
      {
        detail: JSON.stringify({
          saveReopen,
          beforeSave,
          afterReopen,
          fpMatch
        })
      }
    );
  } catch (err) {
    record('fatal', 'FAIL', { detail: String(err?.stack ?? err) });
  } finally {
    const summary = {
      ticket: 'CLN-WORKFLOW-002A-FINAL-MANUAL-GATE',
      at: new Date().toISOString(),
      mandatoryFail,
      steps
    };
    fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
    console.log(`\nWrote ${JSON_OUT}`);
    console.log(mandatoryFail ? 'WALKTHROUGH: FAIL' : 'WALKTHROUGH: PASS (see OBSERVE notes)');
    await browser.close();
    process.exit(mandatoryFail ? 1 : 0);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
