/**
 * GEO-001C — SurfacePath + Trim boundary robustness browser certification.
 *
 * Prerequisites: Studio :1420 + VTK worker :8765
 *
 * Run:
 *   NODE_PATH=/home/hjawahreh/Desktop/Projects/sharedrop/node_modules \
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
 *     node docs/certification/geo-001c-browser-walkthrough.mjs
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
const OUT = path.join(ROOT, 'docs/certification/geo-001c-browser-shots');
const JSON_OUT = path.join(ROOT, 'docs/certification/geo-001c-browser-walkthrough.json');
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

const overlayBox = async (page) => {
  const overlay = page.getByTestId('clinical-trim-overlay');
  await overlay.waitFor({ state: 'visible', timeout: 20000 });
  const box = await overlay.boundingBox();
  if (!box) throw new Error('no overlay box');
  return box;
};

/** Sample surface hits on the active trim target and return ordered convex anchors. */
const collectSurfaceAnchors = async (page, count = 6) =>
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
    for (let iy = 0; iy < 18; iy += 1) {
      for (let ix = 0; ix < 18; ix += 1) {
        const x = w * (0.22 + (0.56 * ix) / 17);
        const y = h * (0.22 + (0.56 * iy) / 17);
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
    if (hits.length < 12) throw new Error(`insufficient hits ${hits.length}`);
    const midX = hits.reduce((s, p) => s + p.x, 0) / hits.length;
    const midY = hits.reduce((s, p) => s + p.y, 0) / hits.length;
    const buckets = Array.from({ length: want }, () => null);
    for (const h of hits) {
      const dx = h.x - midX;
      const dy = h.y - midY;
      const dist = Math.hypot(dx, dy);
      if (dist < 10) continue;
      const idx = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * want) % want;
      if (!buckets[idx] || dist > buckets[idx].dist) buckets[idx] = { ...h, dist };
    }
    const selected = buckets.filter(Boolean);
    if (selected.length < Math.min(4, want)) {
      throw new Error(`convex loop incomplete ${selected.length}`);
    }
    selected.sort(
      (a, b) => Math.atan2(a.y - midY, a.x - midX) - Math.atan2(b.y - midY, b.x - midX)
    );
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

const injectPolyline = async (page, anchors) =>
  page.evaluate((points) => {
    const ws = globalThis.__clinicalWorkspace;
    ws.trim.controller.clearBoundary();
    ws.trim.session.setPoints(points, false);
    ws.session.notifyUi();
    return { count: points.length };
  }, anchors);

const injectFreehandCurve = async (page) =>
  page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    const trim = ws.trim;
    const picker = ws.meshPicker;
    const targetId = String(trim.session.getState()?.targetObjectId ?? '');
    const overlay = document.querySelector('[data-testid="clinical-trim-overlay"]');
    const rect = overlay.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const hits = [];
    for (let iy = 0; iy < 20; iy += 1) {
      for (let ix = 0; ix < 20; ix += 1) {
        const x = w * (0.28 + (0.44 * ix) / 19);
        const y = h * (0.3 + (0.4 * iy) / 19);
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
    if (hits.length < 16) throw new Error(`freehand insufficient hits ${hits.length}`);
    const midX = hits.reduce((s, p) => s + p.x, 0) / hits.length;
    const midY = hits.reduce((s, p) => s + p.y, 0) / hits.length;
    const want = 14;
    const buckets = Array.from({ length: want }, () => null);
    for (const h of hits) {
      const dx = h.x - midX;
      const dy = h.y - midY;
      const dist = Math.hypot(dx, dy);
      if (dist < 12) continue;
      const idx = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * want) % want;
      if (!buckets[idx] || Math.abs(dist - 40) < Math.abs(buckets[idx].dist - 40)) {
        buckets[idx] = { ...h, dist };
      }
    }
    const selected = buckets.filter(Boolean);
    if (selected.length < 8) throw new Error(`freehand loop incomplete ${selected.length}`);
    selected.sort(
      (a, b) => Math.atan2(a.y - midY, a.x - midX) - Math.atan2(b.y - midY, b.x - midX)
    );
    const points = selected.map((p) => ({
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
    trim.controller.clearBoundary();
    trim.session.setPoints(points, false);
    ws.session.notifyUi();
    return { count: points.length };
  });

const validateAuthoritativePath = async (page) =>
  page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    const state = ws.trim.session.getState();
    const targetId = String(state.targetObjectId ?? '');
    const mesh = ws.getHost().runtimes.kernel.registry.getByObjectId(targetId, 'working');
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
    if (!built.ok) {
      return {
        ok: false,
        error: built.message,
        code: built.code,
        meshComponents: engine.analyzeMesh(mesh).connectedComponentCount,
        disconnectedFailure: /disconnected scan surfaces/i.test(built.message)
      };
    }
    const closed = engine.closeSurfacePath(mesh, built.path);
    if (!closed.ok) {
      return {
        ok: false,
        error: closed.message,
        code: closed.code,
        meshComponents: engine.analyzeMesh(mesh).connectedComponentCount,
        disconnectedFailure: /disconnected scan surfaces/i.test(closed.message),
        sampleCount: built.path.samples.length
      };
    }
    const validated = engine.validateSurfacePath(mesh, closed.path, { maxSpacingMm: 40 });
    return {
      ok: validated.ok,
      error: validated.ok ? null : validated.message,
      code: validated.ok ? null : validated.code,
      components: new Set(closed.path.samples.map((s) => s.componentId)).size,
      sampleCount: closed.path.samples.length,
      pathLength: closed.path.length,
      meshComponents: engine.analyzeMesh(mesh).connectedComponentCount,
      disconnectedFailure: /disconnected scan surfaces/i.test(
        String(validated.ok ? '' : validated.message)
      )
    };
  });

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

const setArch = async (page, role) => {
  await page.getByTestId(`clinical-global-arch-${role}`).click().catch(() => null);
  await page.evaluate((arch) => {
    globalThis.__clinicalWorkspace?.trim?.setActiveArch?.(arch);
    globalThis.__clinicalWorkspace?.session?.notifyUi?.();
  }, role);
  await waitIdle(page, 400);
};

const waitPreview = async (page) => {
  for (let i = 0; i < 240; i += 1) {
    const ready = await page.evaluate(
      () => globalThis.__clinicalWorkspace?.trim?.controller?.isPreviewReady?.() === true
    );
    if (ready) return true;
    await waitIdle(page, 500);
  }
  return false;
};

const runPreviewAccept = async (page) => {
  const closeRes = await page.evaluate(() => {
    const r = globalThis.__clinicalWorkspace.trim.controller.closeBoundary();
    globalThis.__clinicalWorkspace.session.notifyUi();
    return { ok: r.ok, message: r.ok ? null : r.error?.message };
  });
  if (!closeRes.ok) {
    return { ok: false, stage: 'close', message: closeRes.message };
  }
  const previewRes = await page.evaluate(async () => {
    const started = Date.now();
    const r = await globalThis.__clinicalWorkspace.trim.preview();
    globalThis.__clinicalWorkspace.session.notifyUi();
    return {
      ok: r.ok,
      message: r.ok ? null : r.error?.message,
      elapsedMs: Date.now() - started,
      ready: globalThis.__clinicalWorkspace.trim.controller.isPreviewReady() === true
    };
  });
  if (!previewRes.ok) {
    return { ok: false, stage: 'preview', message: previewRes.message, previewRes };
  }
  if (!previewRes.ready) {
    const ready = await waitPreview(page);
    if (!ready) return { ok: false, stage: 'preview', message: 'preview not ready', previewRes };
  }
  return { ok: true, previewRes };
};

async function main() {
  const chromePath =
    process.env.PLAYWRIGHT_CHROME_PATH ||
    `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
  const launchOpts = { headless: true };
  if (fs.existsSync(chromePath)) launchOpts.executablePath = chromePath;
  const browser = await chromium.launch(launchOpts);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.setDefaultTimeout(120000);
  const evidence = {};

  try {
    await page.goto(HOST, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => globalThis.__clinicalWorkspace != null, null, {
      timeout: 60000
    });

    await page.getByTestId('clinical-empty-new-case').click();
    await page.getByTestId('clinical-create-case-dialog').waitFor();
    await page.getByTestId('clinical-create-first-name').fill('GEO001C');
    await page.getByTestId('clinical-create-last-name').fill('SurfacePath');
    await page.getByTestId('clinical-create-case-name').fill('GEO-001C-Surface-Path-Trim');
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
    await setArch(page, 'upper');
    await page.getByTestId('clinical-trim-polyline').click();
    await waitIdle(page, 300);

    // 01 surface hover — dispatch pointermove so overlay updates surface cursor.
    const box = await overlayBox(page);
    await page.evaluate(({ x, y }) => {
      const el = document.querySelector('[data-testid="clinical-trim-overlay"]');
      if (!el) throw new Error('overlay missing');
      el.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: 'mouse'
        })
      );
    }, { x: box.x + box.width * 0.5, y: box.y + box.height * 0.45 });
    await waitIdle(page, 400);
    const hover = await page.evaluate(() => {
      const st = globalThis.__clinicalWorkspace.trim.session.getState();
      const c = st.previewCursor;
      return {
        hasCursor: c !== undefined && Number.isFinite(c?.localX),
        summary: st.lastHitSummary ?? null
      };
    });
    await shot(page, '01-surface-hover');
    record('01-surface-hover', hover.hasCursor ? 'PASS' : 'OBSERVE', { hover });

    // UPPER polyline ≥5 anchors
    const polyAnchors = await collectSurfaceAnchors(page, 6);
    await injectPolyline(page, polyAnchors);
    await waitIdle(page, 400);
    await shot(page, '02-polyline-surface-path');
    evidence.polylineAnchors = polyAnchors.length;
    record('02-polyline-surface-path', polyAnchors.length >= 5 ? 'PASS' : 'FAIL', {
      detail: `anchors=${polyAnchors.length}`
    });

    const polyClose = await page.evaluate(() => {
      const r = globalThis.__clinicalWorkspace.trim.controller.closeBoundary();
      globalThis.__clinicalWorkspace.session.notifyUi();
      return { ok: r.ok, message: r.ok ? null : r.error?.message };
    });
    await waitIdle(page, 400);
    await shot(page, '03-polyline-closed');
    const polyPath = await validateAuthoritativePath(page);
    evidence.polylinePath = polyPath;
    record(
      '03-polyline-closed',
      polyClose.ok && polyPath.ok && !polyPath.disconnectedFailure ? 'PASS' : 'FAIL',
      { polyClose, polyPath }
    );

    let polyPreviewOk = false;
    let polyPreviewErr = null;
    if (polyClose.ok && polyPath.ok) {
      try {
        const previewRes = await page.evaluate(async () => {
          const started = Date.now();
          const r = await globalThis.__clinicalWorkspace.trim.preview();
          globalThis.__clinicalWorkspace.session.notifyUi();
          return {
            ok: r.ok,
            message: r.ok ? null : r.error?.message,
            elapsedMs: Date.now() - started,
            status: globalThis.__clinicalWorkspace.trim.session.getState().statusMessage
          };
        });
        if (!previewRes.ok) polyPreviewErr = previewRes.message || previewRes.status;
        else polyPreviewOk = await waitPreview(page);
        evidence.polyPreview = previewRes;
      } catch (err) {
        polyPreviewErr = String(err);
      }
    }
    await shot(page, '04-polyline-preview');
    record('04-polyline-preview', polyPreviewOk ? 'PASS' : 'FAIL', {
      polyPreviewOk,
      polyPreviewErr,
      evidence: evidence.polyPreview
    });

    // Freehand curved draw on UPPER (clear previous first)
    await page.evaluate(() => {
      globalThis.__clinicalWorkspace.trim.controller.clearBoundary();
      globalThis.__clinicalWorkspace.session.notifyUi();
    });
    await page.getByTestId('clinical-trim-freehand').click();
    const freehand = await injectFreehandCurve(page);
    await waitIdle(page, 400);
    await shot(page, '05-freehand-surface-path');
    record('05-freehand-surface-path', freehand.count >= 8 ? 'PASS' : 'FAIL', { freehand });

    const fhClose = await page.evaluate(() => {
      const r = globalThis.__clinicalWorkspace.trim.controller.closeBoundary();
      globalThis.__clinicalWorkspace.session.notifyUi();
      return { ok: r.ok, message: r.ok ? null : r.error?.message };
    });
    const fhPath = await validateAuthoritativePath(page);
    evidence.freehandPath = fhPath;
    let fhPreviewOk = false;
    let fhPreviewErr = null;
    if (fhClose.ok && fhPath.ok) {
      try {
        const previewRes = await page.evaluate(async () => {
          const started = Date.now();
          const r = await globalThis.__clinicalWorkspace.trim.preview();
          globalThis.__clinicalWorkspace.session.notifyUi();
          return {
            ok: r.ok,
            message: r.ok ? null : r.error?.message,
            elapsedMs: Date.now() - started,
            status: globalThis.__clinicalWorkspace.trim.session.getState().statusMessage
          };
        });
        if (!previewRes.ok) fhPreviewErr = previewRes.message || previewRes.status;
        else fhPreviewOk = await waitPreview(page);
        evidence.freehandPreview = previewRes;
      } catch (err) {
        fhPreviewErr = String(err);
      }
    }
    await shot(page, '06-freehand-preview');
    record(
      '06-freehand-preview',
      fhClose.ok && fhPath.ok && fhPreviewOk && !fhPath.disconnectedFailure ? 'PASS' : 'FAIL',
      { fhClose, fhPath, fhPreviewOk, fhPreviewErr, evidence: evidence.freehandPreview }
    );

    // Accept one valid trim
    const preAccept = await page.evaluate(() => {
      const doc = globalThis.__clinicalWorkspace.session.getPublicState().activeCase;
      const obj = doc.objects.find((o) => o.archRole === 'upper');
      return { fingerprint: obj.geometryFingerprint, faceCount: obj.faceCount };
    });
    let accepted = false;
    if (fhPreviewOk || polyPreviewOk) {
      await page.evaluate(async () => {
        const r = await globalThis.__clinicalWorkspace.trim.accept();
        globalThis.__clinicalWorkspace.session.notifyUi();
        if (!r.ok) throw new Error(r.error?.message ?? 'accept failed');
      });
      await waitIdle(page, 2000);
      for (let i = 0; i < 40; i += 1) {
        const post = await page.evaluate(() => {
          const doc = globalThis.__clinicalWorkspace.session.getPublicState().activeCase;
          const obj = doc.objects.find((o) => o.archRole === 'upper');
          return { fingerprint: obj.geometryFingerprint, faceCount: obj.faceCount };
        });
        if (post.fingerprint !== preAccept.fingerprint || post.faceCount !== preAccept.faceCount) {
          accepted = true;
          evidence.accept = { pre: preAccept, post };
          break;
        }
        await waitIdle(page, 500);
      }
    }
    await shot(page, '07-accepted');
    record('07-accepted', accepted ? 'PASS' : 'FAIL', { accepted });

    // Undo / Redo
    const undoRes = await page.evaluate(() => {
      const r = globalThis.__clinicalWorkspace.trim.undo();
      globalThis.__clinicalWorkspace.session.notifyUi();
      return { ok: r.ok, message: r.ok ? null : r.error?.message };
    });
    await waitIdle(page, 800);
    await shot(page, '08-undo');
    const afterUndo = await page.evaluate(() => {
      const doc = globalThis.__clinicalWorkspace.session.getPublicState().activeCase;
      const obj = doc.objects.find((o) => o.archRole === 'upper');
      return { fingerprint: obj.geometryFingerprint, faceCount: obj.faceCount };
    });
    record('08-undo', undoRes.ok ? 'PASS' : 'OBSERVE', { undoRes, afterUndo, preAccept });

    const redoRes = await page.evaluate(() => {
      const r = globalThis.__clinicalWorkspace.trim.redo();
      globalThis.__clinicalWorkspace.session.notifyUi();
      return { ok: r.ok, message: r.ok ? null : r.error?.message };
    });
    await waitIdle(page, 800);
    await shot(page, '09-redo');
    record('09-redo', redoRes.ok ? 'PASS' : 'OBSERVE', { redoRes });

    // LOWER surface trim
    await setArch(page, 'lower');
    await page.getByTestId('clinical-trim-polyline').click();
    const lowerAnchors = await collectSurfaceAnchors(page, 5);
    await injectPolyline(page, lowerAnchors);
    const lowerRun = await runPreviewAccept(page);
    await shot(page, '10-lower');
    evidence.lower = lowerRun;
    record('10-lower', lowerRun.ok ? 'PASS' : 'FAIL', { lowerRun });

    // Save → Reopen
    const saveRes = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      try {
        if (typeof ws.cases?.saveActiveCase === 'function') {
          await ws.cases.saveActiveCase(ws);
          return { ok: true, via: 'cases.saveActiveCase' };
        }
        return { ok: false, via: 'missing' };
      } catch (err) {
        return { ok: false, via: 'error', detail: String(err) };
      }
    });
    let reopenOk = false;
    if (saveRes.ok) {
      const caseId = await page.evaluate(() => {
        const doc = globalThis.__clinicalWorkspace.session.getPublicState().activeCase;
        return doc?.id ?? null;
      });
      if (caseId) {
        const reopen = await page.evaluate(async (id) => {
          const ws = globalThis.__clinicalWorkspace;
          try {
            // Mark clean so openCase is allowed.
            ws.session.applyDocument?.(
              { ...ws.session.getPublicState().activeCase, dirty: false },
              false
            );
            const r = await ws.cases.openCase(ws, id);
            return {
              ok: r.ok === true,
              message: r.ok ? null : r.error?.message,
              fingerprint: ws.session.getPublicState().activeCase?.objects?.[0]?.geometryFingerprint
            };
          } catch (err) {
            return { ok: false, detail: String(err) };
          }
        }, caseId);
        reopenOk = reopen.ok === true;
        evidence.reopen = reopen;
      }
    }
    record('11-save-reopen', saveRes.ok && reopenOk ? 'PASS' : saveRes.ok ? 'OBSERVE' : 'FAIL', {
      saveRes,
      reopenOk,
      reopen: evidence.reopen
    });
  } catch (e) {
    record('fatal', 'FAIL', { detail: String(e?.stack || e) });
    await shot(page, '99-error').catch(() => null);
  } finally {
    await browser.close().catch(() => null);
  }

  const report = {
    at: new Date().toISOString(),
    milestone: 'GEO-001C',
    steps,
    evidence,
    summary: {
      pass: steps.filter((s) => s.status === 'PASS').length,
      fail: steps.filter((s) => s.status === 'FAIL').length,
      observe: steps.filter((s) => s.status === 'OBSERVE').length
    }
  };
  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  console.log('Wrote', JSON_OUT, report.summary);
  if (report.summary.fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
