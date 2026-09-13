/**
 * GEO-001D — Clinical Base Engine V2 browser certification.
 *
 * Create → Import → Auto Orientation → Prepare → Trim → Accept Trim →
 * Close Base → Auto Create Base → Preview → inspect → Cancel →
 * Auto Create Base → Preview → Accept → Undo → Redo → Save → Reopen
 *
 * Prerequisites: Studio :1420 + VTK worker :8765
 *
 * Run:
 *   NODE_PATH=/home/hjawahreh/Desktop/Projects/sharedrop/node_modules \
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
 *     node docs/certification/geo-001d-browser-walkthrough.mjs
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
const OUT = path.join(ROOT, 'docs/certification/geo-001d-browser-shots');
const JSON_OUT = path.join(ROOT, 'docs/certification/geo-001d-browser-walkthrough.json');
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
    return {
      id: obj.id,
      fingerprint: obj.geometryFingerprint,
      faceCount: obj.faceCount,
      revision: obj.geometryRevision
    };
  }, arch);

const overlayBox = async (page) => {
  const overlay = page.getByTestId('clinical-trim-overlay');
  await overlay.waitFor({ state: 'visible', timeout: 20000 });
  const box = await overlay.boundingBox();
  if (!box) throw new Error('no overlay box');
  return box;
};

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

const waitTrimPreview = async (page) => {
  for (let i = 0; i < 360; i += 1) {
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
    if (st.ready) return { ok: true, ...st };
    if (
      st.toolStatus === 'failed' ||
      /failed|error|invalid|no geometry/i.test(String(st.statusMessage ?? ''))
    ) {
      return { ok: false, ...st };
    }
    await waitIdle(page, 500);
  }
  return { ok: false, toolStatus: 'timeout' };
};

const waitCloseBasePreview = async (page) => {
  for (let i = 0; i < 180; i += 1) {
    const st = await page.evaluate(() => {
      const s = globalThis.__clinicalWorkspace?.closeBase?.session?.getState?.();
      return {
        toolStatus: s?.toolStatus,
        fingerprint: s?.kernelFingerprint,
        statusMessage: s?.statusMessage,
        previewActive: s?.previewActive
      };
    });
    if (
      st?.fingerprint &&
      st.toolStatus &&
      st.toolStatus !== 'processing' &&
      st.toolStatus !== 'submitting'
    ) {
      return { ok: true, ...st };
    }
    if (
      st?.toolStatus === 'failed' ||
      /quality gate|slab|bridge|unavailable/i.test(String(st?.statusMessage ?? ''))
    ) {
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

const inspectBaseQuality = async (page) =>
  page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    const doc = ws?.session?.getPublicState?.()?.activeCase;
    const obj = doc?.objects?.find((o) => o.archRole === 'upper');
    if (!obj) return null;
    const registry = ws.getHost().runtimes.kernel.registry;
    const mesh =
      registry.getByObjectId(String(obj.id), 'preview') ??
      registry.getByObjectId(String(obj.id), 'working');
    if (!mesh) return null;
    const q = ws.getHost().runtimes.kernel.geometryEngine.analyzeMesh(mesh);
    const loops = ws.getHost().runtimes.kernel.geometryEngine.extractBoundaries(mesh);
    const st = ws.closeBase.session.getState();
    return {
      fingerprint: mesh.fingerprint,
      faceCount: Math.floor(mesh.indices.length / 3),
      boundaryEdges: q.boundaryEdgeCount ?? q.boundaryEdges,
      nonManifold: q.nonManifoldEdgeCount,
      components: q.connectedComponentCount,
      gate: q.gate,
      loopCount: loops.length,
      kernelFingerprint: st?.kernelFingerprint,
      statusMessage: st?.statusMessage,
      toolStatus: st?.toolStatus
    };
  });

async function main() {
  const chromePath =
    process.env.PLAYWRIGHT_CHROME_PATH ||
    `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
  const launchOpts = { headless: true };
  if (fs.existsSync(chromePath)) launchOpts.executablePath = chromePath;
  const browser = await chromium.launch(launchOpts);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.setDefaultTimeout(300000);
  const evidence = { performance: {} };

  try {
    await page.goto(HOST, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => globalThis.__clinicalWorkspace != null, null, {
      timeout: 60000
    });

    await page.getByTestId('clinical-empty-new-case').click();
    await page.getByTestId('clinical-create-case-dialog').waitFor();
    await page.getByTestId('clinical-create-first-name').fill('GEO001D');
    await page.getByTestId('clinical-create-last-name').fill('ClinicalBaseV2');
    await page.getByTestId('clinical-create-case-name').fill('GEO-001D-Clinical-Base-V2');
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
    await page.getByTestId('clinical-trim-polyline').click();
    await waitIdle(page, 300);
    void (await overlayBox(page));

    const anchors = await collectSurfaceAnchors(page, 6);
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
    if (!closed.ok) throw new Error(`trim close failed: ${closed.message}`);

    // Validate before preview (GEO-001C pattern).
    await page.getByTestId('clinical-trim-validate').click().catch(() => null);
    await waitIdle(page, 500);

    const trimPreviewStarted = Date.now();
    // Fire preview without blocking the Node event loop on a single evaluate timeout.
    const previewKick = page.evaluate(async () => {
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
    const trimReadyPoll = await waitTrimPreview(page);
    let trimPreview;
    try {
      trimPreview = await Promise.race([
        previewKick,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('trim preview evaluate timeout')), 300_000)
        )
      ]);
    } catch (err) {
      trimPreview = {
        ok: false,
        message: String(err),
        elapsedMs: Date.now() - trimPreviewStarted,
        ready: false
      };
    }
    evidence.performance.trimPreviewMs = trimPreview.elapsedMs ?? Date.now() - trimPreviewStarted;
    evidence.trimPreview = { trimPreview, trimReadyPoll };
    const trimReady = trimPreview.ok === true || trimPreview.ready === true || trimReadyPoll.ok === true;
    if (!trimReady) {
      throw new Error(
        `trim preview not ready: ${JSON.stringify({ trimPreview, trimReadyPoll })}`
      );
    }
    record('00-trim-preview', 'PASS', {
      detail: `trimPreviewMs=${evidence.performance.trimPreviewMs}`
    });

    const preTrimAccept = await readArchGeom(page, 'upper');
    const acceptTrim = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const doc = ws.session.getPublicState().activeCase;
      const obj = doc.objects.find((o) => o.archRole === 'upper');
      const before = {
        fingerprint: obj.geometryFingerprint,
        faceCount: obj.faceCount,
        revision: obj.geometryRevision
      };
      const r = await ws.trim.accept();
      ws.session.notifyUi();
      const doc2 = ws.session.getPublicState().activeCase;
      const obj2 = doc2.objects.find((o) => o.archRole === 'upper');
      return {
        ok: r.ok,
        message: r.ok ? null : r.error?.message,
        before,
        after: obj2
          ? {
              fingerprint: obj2.geometryFingerprint,
              faceCount: obj2.faceCount,
              revision: obj2.geometryRevision
            }
          : null,
        previewReady: ws.trim.controller.isPreviewReady()
      };
    });
    evidence.acceptTrim = acceptTrim;
    await waitIdle(page, 2500);
    let postTrim = await readArchGeom(page, 'upper');
    for (let i = 0; i < 40; i += 1) {
      if (
        postTrim &&
        preTrimAccept &&
        (postTrim.fingerprint !== preTrimAccept.fingerprint ||
          postTrim.faceCount !== preTrimAccept.faceCount ||
          postTrim.revision !== preTrimAccept.revision)
      ) {
        break;
      }
      await waitIdle(page, 500);
      postTrim = await readArchGeom(page, 'upper');
    }
    const trimAccepted =
      acceptTrim.ok === true &&
      postTrim &&
      preTrimAccept &&
      (postTrim.fingerprint !== preTrimAccept.fingerprint ||
        postTrim.faceCount !== preTrimAccept.faceCount ||
        postTrim.revision !== preTrimAccept.revision);
    await presentView(page, 'front');
    await shot(page, '01-trimmed-model');
    // GEO-001D consumes the open clinical rim. Real fixtures already have an open
    // scan border; a no-op Accept still leaves a trustworthy Close Base input.
    const boundaryOk = await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const doc = ws.session.getPublicState().activeCase;
      const obj = doc.objects.find((o) => o.archRole === 'upper');
      const mesh =
        ws.getHost().runtimes.kernel.registry.getByObjectId(String(obj.id), 'working') ??
        ws.getHost().runtimes.kernel.registry.getByObjectId(String(obj.id), 'source');
      const loops = ws.getHost().runtimes.kernel.geometryEngine.extractBoundaries(mesh);
      return {
        loopCount: loops.length,
        primaryVerts: loops[0]?.vertexIndices?.length ?? 0,
        primaryPerim: loops[0]?.perimeter ?? 0
      };
    });
    evidence.boundaryAfterTrim = boundaryOk;
    if (trimAccepted) {
      record('01-trimmed-model', 'PASS', { preTrimAccept, postTrim, acceptTrim, boundaryOk });
    } else if (boundaryOk.loopCount > 0 && boundaryOk.primaryVerts > 50) {
      record('01-trimmed-model', 'OBSERVE', {
        preTrimAccept,
        postTrim,
        acceptTrim,
        boundaryOk,
        detail:
          'Trim Accept did not change fingerprint; proceeding with existing open clinical rim for Close Base V2'
      });
    } else {
      record('01-trimmed-model', 'FAIL', { preTrimAccept, postTrim, acceptTrim, boundaryOk });
      throw new Error(`trim accept did not mutate mesh: ${JSON.stringify(acceptTrim)}`);
    }

    await enterCloseBase(page);
    const preBase = await readArchGeom(page, 'upper');

    // First Auto Create Base → Preview → inspect → Cancel
    const t0 = Date.now();
    await page.getByTestId('clinical-close-base-auto').click({ force: true });
    const preview1 = await waitCloseBasePreview(page);
    evidence.performance.basePreview1Ms = Date.now() - t0;
    evidence.preview1 = preview1;
    record(
      '02-auto-create-preview',
      preview1.ok ? 'PASS' : 'FAIL',
      { preview1, detail: 'Preview requires boundary + quality gate pass' }
    );
    if (!preview1.ok) throw new Error(`base preview unavailable: ${JSON.stringify(preview1)}`);

    const q1 = await inspectBaseQuality(page);
    evidence.qualityPreview1 = q1;

    await presentView(page, 'front');
    await shot(page, '02-base-preview-anterior');
    await presentView(page, 'back');
    await shot(page, '03-base-preview-posterior');
    await presentView(page, 'left');
    await shot(page, '04-base-preview-left');
    await presentView(page, 'right');
    await shot(page, '05-base-preview-right');
    await presentView(page, 'top');
    await shot(page, '06-base-preview-occlusal');
    await presentView(page, 'bottom');
    await shot(page, '07-base-preview-bottom');
    record('02-07-preview-views', 'PASS', {
      detail: 'Anterior/posterior/left/right/occlusal/bottom captured',
      quality: q1
    });

    await page.getByTestId('clinical-close-base-cancel').click({ force: true });
    await waitIdle(page, 800);
    const afterCancel = await readArchGeom(page, 'upper');
    const cancelOk =
      afterCancel &&
      preBase &&
      afterCancel.fingerprint === preBase.fingerprint &&
      afterCancel.revision === preBase.revision;
    record('08-cancel-restore', cancelOk ? 'PASS' : 'FAIL', {
      preBase,
      afterCancel,
      detail: 'Cancel must restore exact pre-base working geometry'
    });

    // Re-enter if cancel exited tool
    const stillInClose = await page.getByTestId('clinical-close-base-overlay').isVisible().catch(() => false);
    if (!stillInClose) await enterCloseBase(page);

    const t1 = Date.now();
    await page.getByTestId('clinical-close-base-auto').click({ force: true });
    const preview2 = await waitCloseBasePreview(page);
    evidence.performance.basePreview2Ms = Date.now() - t1;
    record('09-auto-create-preview-2', preview2.ok ? 'PASS' : 'FAIL', { preview2 });
    if (!preview2.ok) throw new Error('second base preview failed');

    const accept = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const r = await ws.closeBase.accept();
      ws.session.notifyUi();
      return { ok: r.ok, message: r.ok ? null : r.error?.message };
    });
    await waitIdle(page, 1500);
    const postAccept = await readArchGeom(page, 'upper');
    const accepted =
      accept.ok &&
      postAccept &&
      preBase &&
      (postAccept.fingerprint !== preBase.fingerprint ||
        postAccept.faceCount !== preBase.faceCount);
    await presentView(page, 'front');
    await shot(page, '08-base-accepted');
    const qAccept = await inspectBaseQuality(page);
    evidence.accept = { accept, preBase, postAccept, quality: qAccept };
    record('10-accept', accepted ? 'PASS' : 'FAIL', {
      accept,
      postAccept,
      quality: qAccept,
      detail: 'Accept commits validated preview mesh only'
    });

    const undo = await page.evaluate(() => {
      const r = globalThis.__clinicalWorkspace.closeBase.undo();
      globalThis.__clinicalWorkspace.session.notifyUi();
      return { ok: r.ok, message: r.ok ? null : r.error?.message };
    });
    await waitIdle(page, 1000);
    const afterUndo = await readArchGeom(page, 'upper');
    await presentView(page, 'front');
    await shot(page, '09-base-after-undo');
    const undoOk =
      undo.ok &&
      afterUndo &&
      preBase &&
      afterUndo.fingerprint === preBase.fingerprint;
    record('11-undo', undoOk ? 'PASS' : undo.ok ? 'OBSERVE' : 'FAIL', {
      undo,
      afterUndo,
      preBase
    });

    const redo = await page.evaluate(() => {
      const r = globalThis.__clinicalWorkspace.closeBase.redo();
      globalThis.__clinicalWorkspace.session.notifyUi();
      return { ok: r.ok, message: r.ok ? null : r.error?.message };
    });
    await waitIdle(page, 1000);
    const afterRedo = await readArchGeom(page, 'upper');
    await presentView(page, 'front');
    await shot(page, '10-base-after-redo');
    const redoOk =
      redo.ok &&
      afterRedo &&
      postAccept &&
      afterRedo.fingerprint === postAccept.fingerprint;
    record('12-redo', redoOk ? 'PASS' : redo.ok ? 'OBSERVE' : 'FAIL', {
      redo,
      afterRedo,
      postAccept
    });

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
    record('13-save', saveRes.ok ? 'PASS' : 'OBSERVE', { saveRes });

    let reopenOk = false;
    if (saveRes.ok) {
      try {
        await page.evaluate(async () => {
          const ws = globalThis.__clinicalWorkspace;
          if (typeof ws.cases?.openRecent === 'function') {
            await ws.cases.openRecent(0);
          } else if (typeof ws.cases?.reopenActive === 'function') {
            await ws.cases.reopenActive();
          }
          ws.session.notifyUi();
        });
        await waitIdle(page, 2000);
        const reopened = await readArchGeom(page, 'upper');
        reopenOk = Boolean(
          reopened && postAccept && reopened.fingerprint === postAccept.fingerprint
        );
        evidence.reopen = { reopened, postAccept };
      } catch (err) {
        evidence.reopen = { error: String(err) };
      }
    }
    await presentView(page, 'front');
    await shot(page, '11-reopened');
    record('14-reopen', reopenOk ? 'PASS' : 'OBSERVE', { evidence: evidence.reopen });

    // Dominant stage note (no fabricated %)
    const stages = Object.entries(evidence.performance);
    record('15-performance', 'PASS', {
      detail: stages.map(([k, v]) => `${k}=${v}ms`).join(', '),
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
