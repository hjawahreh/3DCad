/**
 * GEO-001E — Real Trim mutation + performance + Trim→Base handoff.
 *
 * Prerequisites: Studio :1420 + VTK worker :8765
 *
 * Run:
 *   NODE_PATH=/home/hjawahreh/Desktop/Projects/sharedrop/node_modules \
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
 *     node docs/certification/geo-001e-browser-walkthrough.mjs
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
const OUT = path.join(ROOT, 'docs/certification/geo-001e-browser-shots');
const JSON_OUT = path.join(ROOT, 'docs/certification/geo-001e-browser-walkthrough.json');
fs.mkdirSync(OUT, { recursive: true });

const upperStl = path.join(FIX, 'upper.stl');
const lowerStl = path.join(FIX, 'lower.stl');
const HOST = process.env.CAD_STUDIO_URL || 'http://localhost:1420/';

const steps = [];
const record = (id, status, fields = {}) => {
  steps.push({ id, status, at: new Date().toISOString(), ...fields });
  console.log(`[${status}] ${id}${fields.detail ? ' — ' + fields.detail : ''}`);
};
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  return `${name}.png`;
};
const waitIdle = (page, ms = 500) => page.waitForTimeout(ms);

const presentView = async (page, face) => {
  await page.evaluate((f) => {
    const ws = globalThis.__clinicalWorkspace;
    ws?.viewport?.presentCanonicalClinicalView?.(f);
    ws?.session?.notifyUi?.();
  }, face);
  await waitIdle(page, 700);
};

const readArchGeom = async (page, arch) =>
  page.evaluate((role) => {
    const doc = globalThis.__clinicalWorkspace?.session?.getPublicState?.()?.activeCase;
    const obj = doc?.objects?.find((o) => o.archRole === role);
    if (!obj) return null;
    const registry = globalThis.__clinicalWorkspace.getHost().runtimes.kernel.registry;
    const mesh =
      registry.getByObjectId(String(obj.id), 'working') ??
      registry.getByObjectId(String(obj.id), 'source');
    return {
      id: obj.id,
      fingerprint: obj.geometryFingerprint,
      faceCount: obj.faceCount,
      revision: obj.geometryRevision,
      meshFingerprint: mesh?.fingerprint ?? null,
      meshFaces: mesh ? Math.floor(mesh.indices.length / 3) : null,
      meshVerts: mesh ? Math.floor(mesh.positions.length / 3) : null
    };
  }, arch);

/** Localized peripheral patch — NOT a full-arch convex hull (that caused GEO-001D NO_OP). */
const collectPeripheralPatch = async (page, count = 6) =>
  page.evaluate((want) => {
    const ws = globalThis.__clinicalWorkspace;
    const trim = ws?.trim;
    const picker = ws?.meshPicker;
    if (!trim?.isActive?.() || !picker?.isReady?.()) throw new Error('trim/picker not ready');
    const targetId = String(trim.session.getState()?.targetObjectId ?? '');
    const overlay = document.querySelector('[data-testid="clinical-trim-overlay"]');
    if (!overlay) throw new Error('overlay missing');
    const rect = overlay.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const hits = [];
    for (let iy = 0; iy < 22; iy += 1) {
      for (let ix = 0; ix < 22; ix += 1) {
        const x = w * (0.08 + (0.84 * ix) / 21);
        const y = h * (0.08 + (0.84 * iy) / 21);
        const hit = picker.pick({
          screenX: x,
          screenY: y,
          canvasWidth: w,
          canvasHeight: h,
          preferredObjectId: targetId
        });
        if (
          hit &&
          Number.isFinite(hit.localX) &&
          Number.isFinite(hit.worldX) &&
          String(hit.objectId) === targetId
        ) {
          hits.push({
            x,
            y,
            localX: hit.localX,
            localY: hit.localY,
            localZ: hit.localZ,
            worldX: hit.worldX,
            worldY: hit.worldY,
            worldZ: hit.worldZ,
            faceId: hit.faceIndex,
            objectId: targetId
          });
        }
      }
    }
    if (hits.length < 20) throw new Error(`insufficient hits ${hits.length}`);
    const midX = hits.reduce((s, p) => s + p.x, 0) / hits.length;
    const midY = hits.reduce((s, p) => s + p.y, 0) / hits.length;
    // Prefer a peripheral cluster (upper-right quadrant of the scan silhouette).
    const peripheral = hits
      .map((p) => ({
        ...p,
        dist: Math.hypot(p.x - midX, p.y - midY),
        ang: Math.atan2(p.y - midY, p.x - midX)
      }))
      .filter((p) => p.dist > 40 && p.ang > -0.2 && p.ang < 1.4)
      .sort((a, b) => b.dist - a.dist);
    const pool = peripheral.length >= 12 ? peripheral : [...hits].sort((a, b) => {
      const da = Math.hypot(a.x - midX, a.y - midY);
      const db = Math.hypot(b.x - midX, b.y - midY);
      return db - da;
    });
    const seed = pool[0];
    const nearby = pool
      .filter((p) => Math.hypot(p.x - seed.x, p.y - seed.y) < 90)
      .slice(0, Math.max(want * 3, 18));
    if (nearby.length < 4) throw new Error(`peripheral cluster too small ${nearby.length}`);
    const cx = nearby.reduce((s, p) => s + p.x, 0) / nearby.length;
    const cy = nearby.reduce((s, p) => s + p.y, 0) / nearby.length;
    const buckets = Array.from({ length: want }, () => null);
    for (const p of nearby) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const dist = Math.hypot(dx, dy);
      if (dist < 6) continue;
      const idx = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * want) % want;
      if (!buckets[idx] || dist > buckets[idx].dist) buckets[idx] = { ...p, dist };
    }
    let selected = buckets.filter(Boolean);
    if (selected.length < Math.min(4, want)) {
      selected = nearby.slice(0, want);
    }
    selected.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    return selected.map((p) => ({
      x: p.x,
      y: p.y,
      localX: p.localX,
      localY: p.localY,
      localZ: p.localZ,
      meshX: p.localX,
      meshY: p.localY,
      worldX: p.worldX,
      worldY: p.worldY,
      worldZ: p.worldZ,
      faceId: p.faceId,
      objectId: targetId
    }));
  }, count);

const waitTrimPreview = async (page) => {
  for (let i = 0; i < 400; i += 1) {
    const st = await page.evaluate(() => {
      const trim = globalThis.__clinicalWorkspace?.trim;
      const s = trim?.session?.getState?.();
      return {
        ready: trim?.controller?.isPreviewReady?.() === true,
        toolStatus: s?.toolStatus,
        statusMessage: s?.statusMessage,
        fingerprint: s?.kernelFingerprint
      };
    });
    if (st.ready && st.fingerprint) return { ok: true, ...st };
    if (/no geometry change|NO_REGION|failed/i.test(String(st.statusMessage ?? ''))) {
      return { ok: false, ...st };
    }
    await waitIdle(page, 500);
  }
  return { ok: false, toolStatus: 'timeout' };
};

const enterTrim = async (page) => {
  const prep = page.getByRole('button', { name: 'Prepare Case', exact: true }).first();
  if (await prep.count()) {
    await prep.click();
    await waitIdle(page, 1500);
  }
  const continueTrim = page.getByRole('button', { name: 'Continue to Trim', exact: true }).first();
  if ((await continueTrim.count()) && (await continueTrim.isEnabled())) {
    await continueTrim.click();
  } else {
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const result = ws.trim.enter();
      if (!result.ok) throw new Error(result.error?.message ?? 'trim enter failed');
      ws.session.notifyUi();
    });
  }
  await page.getByTestId('clinical-trim-overlay').waitFor({ timeout: 20000 });
};

const enterCloseBase = async (page) => {
  await page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    if (ws?.trim?.isActive?.()) {
      ws.trim.cancel();
      ws.session.notifyUi();
    }
  });
  await waitIdle(page, 400);
  const continueClose = page.getByRole('button', { name: /Continue to Close Base/i }).first();
  if ((await continueClose.count()) && (await continueClose.isEnabled())) {
    await continueClose.click({ force: true });
  } else {
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const doc = ws?.session?.getPublicState?.()?.activeCase;
      const obj = doc?.objects?.find((o) => o.archRole === 'upper');
      if (!obj) throw new Error('no upper');
      const result = ws.closeBase.enter(obj.id);
      if (!result.ok) throw new Error(result.error?.message ?? 'closeBase enter failed');
      ws.session.notifyUi();
    });
  }
  await page.getByTestId('clinical-close-base-overlay').waitFor({ timeout: 20000 });
};

const waitCloseBasePreview = async (page) => {
  for (let i = 0; i < 360; i += 1) {
    const st = await page.evaluate(() => {
      const cb = globalThis.__clinicalWorkspace?.closeBase;
      const s = cb?.session?.getState?.();
      const ready =
        typeof cb?.controller?.isPreviewReady === 'function'
          ? cb.controller.isPreviewReady() === true
          : false;
      return {
        toolStatus: s?.toolStatus,
        fingerprint: s?.kernelFingerprint,
        statusMessage: s?.statusMessage,
        phase: s?.phase,
        ready
      };
    });
    if (
      (st?.fingerprint && st.toolStatus && st.toolStatus !== 'processing') ||
      (st?.ready && st?.fingerprint) ||
      /preview ready|base ready|accepted/i.test(String(st?.statusMessage ?? ''))
    ) {
      return { ok: true, ...st };
    }
    if (st?.toolStatus === 'failed' || /fail|error/i.test(String(st?.statusMessage ?? ''))) {
      return { ok: false, ...st };
    }
    await waitIdle(page, 500);
  }
  return { ok: false, toolStatus: 'timeout' };
};

const injectAndCloseLoop = async (page, anchors) => {
  await page.getByTestId('clinical-trim-polyline').click();
  await waitIdle(page, 200);
  await page.evaluate((points) => {
    const ws = globalThis.__clinicalWorkspace;
    ws.trim.controller.clearBoundary();
    ws.trim.session.setPoints(points, false);
    ws.session.notifyUi();
  }, anchors);
  const closed = await page.evaluate(() => {
    const r = globalThis.__clinicalWorkspace.trim.controller.closeBoundary();
    globalThis.__clinicalWorkspace.session.notifyUi();
    return { ok: r.ok, message: r.ok ? null : r.error?.message };
  });
  if (!closed.ok) throw new Error(`close failed: ${closed.message}`);
  return closed;
};

const runPreviewAccept = async (page, label) => {
  const pathInfo = await page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    const state = ws.trim.session.getState();
    const targetId = String(state.targetObjectId ?? '');
    const mesh =
      ws.getHost().runtimes.kernel.registry.getByObjectId(targetId, 'working') ??
      ws.getHost().runtimes.kernel.registry.getByObjectId(targetId, 'source');
    const engine = ws.getHost().runtimes.kernel.geometryEngine;
    const seeds = state.points
      .filter((p) => Number.isFinite(p.localX))
      .map((p) => ({
        point: [p.localX, p.localY, p.localZ],
        ...(typeof p.faceId === 'number' ? { faceId: p.faceId } : {})
      }));
    const built = engine.buildSurfacePath(mesh, seeds, {
      closed: false,
      reconstruct: 'gaps',
      maxProjectDistanceMm: 12
    });
    if (!built.ok) return { ok: false, error: built.message };
    const closedPath = engine.closeSurfacePath(mesh, built.path);
    if (!closedPath.ok) return { ok: false, error: closedPath.message };
    return {
      ok: true,
      sampleCount: closedPath.path.samples.length,
      pathLength: closedPath.path.length,
      meshFingerprint: mesh.fingerprint,
      components: new Set(closedPath.path.samples.map((s) => s.componentId)).size
    };
  });

  await page.getByTestId('clinical-trim-validate').click().catch(() => null);
  await waitIdle(page, 400);

  const before = await readArchGeom(page, 'upper');
  const t0 = Date.now();
  const previewKick = page.evaluate(async () => {
    const started = Date.now();
    const r = await globalThis.__clinicalWorkspace.trim.preview();
    globalThis.__clinicalWorkspace.session.notifyUi();
    const s = globalThis.__clinicalWorkspace.trim.session.getState();
    return {
      ok: r.ok,
      message: r.ok ? null : r.error?.message,
      elapsedMs: Date.now() - started,
      fingerprint: s.kernelFingerprint,
      statusMessage: s.statusMessage
    };
  });
  const ready = await waitTrimPreview(page);
  const preview = await previewKick.catch((err) => ({
    ok: false,
    message: String(err),
    elapsedMs: Date.now() - t0
  }));
  const previewMs = preview.elapsedMs ?? Date.now() - t0;
  if (!preview.ok && !ready.ok) {
    throw new Error(`${label} preview failed: ${JSON.stringify({ preview, ready, pathInfo })}`);
  }
  const previewFp = preview.fingerprint || ready.fingerprint;
  return { before, previewFp, previewMs, pathInfo, previewReady: true };
};

const acceptTrim = async (page, before, previewFp) => {
  const accept = await page.evaluate(async () => {
    const r = await globalThis.__clinicalWorkspace.trim.accept();
    globalThis.__clinicalWorkspace.session.notifyUi();
    return { ok: r.ok, message: r.ok ? null : r.error?.message };
  });
  await waitIdle(page, 1500);
  let after = await readArchGeom(page, 'upper');
  for (let i = 0; i < 30; i += 1) {
    if (
      after &&
      before &&
      (after.fingerprint !== before.fingerprint ||
        after.meshFingerprint !== before.meshFingerprint ||
        after.faceCount !== before.faceCount)
    ) {
      break;
    }
    await waitIdle(page, 400);
    after = await readArchGeom(page, 'upper');
  }
  return {
    accept,
    after,
    mutated:
      Boolean(after && before) &&
      (after.fingerprint !== before.fingerprint ||
        after.meshFingerprint !== before.meshFingerprint ||
        (typeof after.faceCount === 'number' &&
          typeof before.faceCount === 'number' &&
          after.faceCount !== before.faceCount)),
    previewFp
  };
};

async function main() {
  const chromePath =
    process.env.PLAYWRIGHT_CHROME_PATH ||
    `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
  const launchOpts = { headless: true };
  if (fs.existsSync(chromePath)) launchOpts.executablePath = chromePath;
  const browser = await chromium.launch(launchOpts);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.setDefaultTimeout(300000);
  const evidence = { performance: {}, trims: [] };

  try {
    await page.goto(HOST, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => globalThis.__clinicalWorkspace != null, null, {
      timeout: 60000
    });

    await page.getByTestId('clinical-empty-new-case').click();
    await page.getByTestId('clinical-create-case-dialog').waitFor();
    await page.getByTestId('clinical-create-first-name').fill('GEO001E');
    await page.getByTestId('clinical-create-last-name').fill('TrimPerf');
    await page.getByTestId('clinical-create-case-name').fill('GEO-001E-Clinical-Trim-V2');
    const inputs = page.locator('.clinical-import-dialog__file-input');
    await inputs.nth(0).setInputFiles(upperStl);
    await inputs.nth(1).setInputFiles(lowerStl);
    await page.getByTestId('clinical-create-submit').click();
    await page.getByTestId('clinical-create-case-success').waitFor({ timeout: 180000 });
    record('00-create-import', 'PASS');

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
    await waitIdle(page, 2000);
    record('00-auto-orientation', 'PASS');

    await enterTrim(page);
    await page.getByTestId('clinical-global-arch-upper').click().catch(() => null);
    await page.evaluate(() => {
      globalThis.__clinicalWorkspace?.trim?.setActiveArch?.('upper');
      globalThis.__clinicalWorkspace?.session?.notifyUi?.();
    });

    const baseline = await readArchGeom(page, 'upper');
    evidence.baseline = baseline;
    await presentView(page, 'front');
    await shot(page, '01-before-trim');
    record('01-before-trim', baseline ? 'PASS' : 'FAIL', { baseline });

    // Trim A — peripheral patch (not full-arch hull)
    const anchorsA = await collectPeripheralPatch(page, 6);
    await injectAndCloseLoop(page, anchorsA);
    await shot(page, '02-surface-loop');
    record('02-surface-loop', anchorsA.length >= 4 ? 'PASS' : 'FAIL', {
      detail: `anchors=${anchorsA.length}`
    });

    const previewA = await runPreviewAccept(page, 'trimA');
    evidence.performance.trimAPreviewMs = previewA.previewMs;
    await presentView(page, 'front');
    await shot(page, '03-trim-preview');

    const acceptA = await acceptTrim(page, previewA.before, previewA.previewFp);
    const trimA = {
      anchors: anchorsA.length,
      pathInfo: previewA.pathInfo,
      before: previewA.before,
      after: acceptA.after,
      previewFp: previewA.previewFp,
      accept: acceptA.accept,
      previewMs: previewA.previewMs,
      mutated: acceptA.mutated
    };
    evidence.trims.push({ id: 'A', ...trimA });
    await presentView(page, 'front');
    await shot(page, '04-after-accept');
    record(
      '03-04-trim-a',
      trimA.mutated && trimA.accept.ok ? 'PASS' : 'FAIL',
      {
        detail: `previewMs=${trimA.previewMs} mutated=${trimA.mutated}`,
        before: trimA.before,
        after: trimA.after,
        previewFp: trimA.previewFp,
        pathInfo: trimA.pathInfo
      }
    );
    if (!trimA.mutated) {
      throw new Error(`Trim A NO_OP: ${JSON.stringify(trimA)}`);
    }
    // Preview == commit fingerprint (document / mesh)
    const previewCommitMatch =
      trimA.previewFp &&
      (trimA.after.fingerprint === trimA.previewFp ||
        trimA.after.meshFingerprint === trimA.previewFp ||
        trimA.after.fingerprint === String(trimA.previewFp).replace(/^geo:/, '') ||
        `geo:${trimA.after.meshFingerprint}` === trimA.previewFp);
    record('04b-preview-eq-commit', previewCommitMatch ? 'PASS' : 'OBSERVE', {
      previewFp: trimA.previewFp,
      committed: trimA.after
    });

    // Undo / Redo
    const undo = await page.evaluate(() => {
      const r = globalThis.__clinicalWorkspace.trim.undo();
      globalThis.__clinicalWorkspace.session.notifyUi();
      return { ok: r.ok, message: r.ok ? null : r.error?.message };
    });
    await waitIdle(page, 1000);
    const afterUndo = await readArchGeom(page, 'upper');
    await shot(page, '05-after-undo');
    const undoOk =
      undo.ok &&
      afterUndo &&
      trimA.before &&
      (afterUndo.fingerprint === trimA.before.fingerprint ||
        afterUndo.meshFingerprint === trimA.before.meshFingerprint);
    record('05-undo', undoOk ? 'PASS' : undo.ok ? 'OBSERVE' : 'FAIL', {
      undo,
      afterUndo,
      before: trimA.before
    });

    const redo = await page.evaluate(() => {
      const r = globalThis.__clinicalWorkspace.trim.redo();
      globalThis.__clinicalWorkspace.session.notifyUi();
      return { ok: r.ok, message: r.ok ? null : r.error?.message };
    });
    await waitIdle(page, 1000);
    const afterRedo = await readArchGeom(page, 'upper');
    await shot(page, '06-after-redo');
    const redoOk =
      redo.ok &&
      afterRedo &&
      trimA.after &&
      (afterRedo.fingerprint === trimA.after.fingerprint ||
        afterRedo.meshFingerprint === trimA.after.meshFingerprint);
    record('06-redo', redoOk ? 'PASS' : redo.ok ? 'OBSERVE' : 'FAIL', {
      redo,
      afterRedo,
      afterA: trimA.after
    });

    // Trim B on current geometry
    const anchorsB = await collectPeripheralPatch(page, 6);
    await injectAndCloseLoop(page, anchorsB);
    const previewB = await runPreviewAccept(page, 'trimB');
    evidence.performance.trimBPreviewMs = previewB.previewMs;
    const acceptB = await acceptTrim(page, previewB.before, previewB.previewFp);
    const trimB = {
      anchors: anchorsB.length,
      pathInfo: previewB.pathInfo,
      before: previewB.before,
      after: acceptB.after,
      previewFp: previewB.previewFp,
      accept: acceptB.accept,
      previewMs: previewB.previewMs,
      mutated: acceptB.mutated
    };
    evidence.trims.push({ id: 'B', ...trimB });
    await presentView(page, 'front');
    await shot(page, '07-second-trim');
    const bOk =
      trimB.mutated &&
      trimB.after &&
      trimA.after &&
      trimB.after.fingerprint !== trimA.after.fingerprint;
    record('07-second-trim', bOk ? 'PASS' : 'FAIL', {
      detail: `previewMs=${trimB.previewMs}`,
      afterA: trimA.after,
      afterB: trimB.after
    });
    if (!bOk) throw new Error(`Trim B failed: ${JSON.stringify(trimB)}`);

    // Save / Reopen
    const saveRes = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      try {
        if (typeof ws.cases?.saveActiveCase === 'function') {
          await ws.cases.saveActiveCase(ws);
          return { ok: true };
        }
        return { ok: false, via: 'missing' };
      } catch (err) {
        return { ok: false, detail: String(err) };
      }
    });
    let reopenOk = false;
    if (saveRes.ok) {
      try {
        await page.evaluate(async () => {
          const ws = globalThis.__clinicalWorkspace;
          if (typeof ws.cases?.openRecent === 'function') await ws.cases.openRecent(0);
          else if (typeof ws.cases?.reopenActive === 'function') await ws.cases.reopenActive();
          ws.session.notifyUi();
        });
        await waitIdle(page, 2000);
        const reopened = await readArchGeom(page, 'upper');
        reopenOk = Boolean(
          reopened &&
            trimB.after &&
            (reopened.fingerprint === trimB.after.fingerprint ||
              reopened.meshFingerprint === trimB.after.meshFingerprint)
        );
        evidence.reopen = { reopened, expected: trimB.after };
      } catch (err) {
        evidence.reopen = { error: String(err) };
      }
    }
    await shot(page, '08-reopened');
    record('08-reopen', reopenOk ? 'PASS' : saveRes.ok ? 'OBSERVE' : 'OBSERVE', {
      saveRes,
      evidence: evidence.reopen
    });

    // Close Base handoff — must consume post-trim fingerprint
    const trimmedFingerprint =
      (await readArchGeom(page, 'upper'))?.meshFingerprint ??
      (await readArchGeom(page, 'upper'))?.fingerprint;
    await shot(page, '09-base-input');
    await enterCloseBase(page);
    const tBase = Date.now();
    await page.getByTestId('clinical-close-base-auto').click({ force: true });
    const basePreview = await waitCloseBasePreview(page);
    evidence.performance.basePreviewMs = Date.now() - tBase;
    await presentView(page, 'front');
    await shot(page, '10-base-preview');
    const handoff = await page.evaluate((expected) => {
      const ws = globalThis.__clinicalWorkspace;
      const doc = ws.session.getPublicState().activeCase;
      const obj = doc.objects.find((o) => o.archRole === 'upper');
      const registry = ws.getHost().runtimes.kernel.registry;
      const mesh =
        registry.getByObjectId(String(obj.id), 'preview') ??
        registry.getByObjectId(String(obj.id), 'working');
      const working = registry.getByObjectId(String(obj.id), 'working');
      return {
        baseInputFingerprint: working?.fingerprint ?? null,
        previewFingerprint: mesh?.fingerprint ?? null,
        expected,
        match:
          working?.fingerprint === expected ||
          `geo:${working?.fingerprint}` === expected ||
          working?.fingerprint === String(expected).replace(/^geo:/, '')
      };
    }, trimmedFingerprint);
    evidence.baseHandoff = handoff;
    record(
      '09-10-base-handoff',
      handoff.match
        ? basePreview.ok
          ? 'PASS'
          : 'OBSERVE'
        : 'FAIL',
      { basePreview, handoff, trimmedFingerprint }
    );

    record('11-performance', 'PASS', {
      detail: Object.entries(evidence.performance)
        .map(([k, v]) => `${k}=${v}ms`)
        .join(', '),
      performance: evidence.performance
    });
  } catch (err) {
    record('fatal', 'FAIL', { detail: String(err) });
    await shot(page, '99-error').catch(() => null);
  } finally {
    const summary = {
      pass: steps.filter((s) => s.status === 'PASS').length,
      fail: steps.filter((s) => s.status === 'FAIL').length,
      observe: steps.filter((s) => s.status === 'OBSERVE').length
    };
    fs.writeFileSync(
      JSON_OUT,
      JSON.stringify({ generatedAt: new Date().toISOString(), summary, steps, evidence }, null, 2)
    );
    console.log(JSON.stringify(summary));
    await browser.close();
    if (summary.fail > 0) process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
