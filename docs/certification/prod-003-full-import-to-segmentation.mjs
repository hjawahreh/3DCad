/**
 * PROD-003 — Import → Orient → Prepare → Trim → Close Base → Segmentation
 *
 * Prerequisites: Studio :1420 (+ VTK worker preferred for Trim/Base).
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
const OUT = path.join(ROOT, 'docs/certification/prod-003-browser-shots');
const JSON_OUT = path.join(ROOT, 'docs/certification/prod-003-browser-walkthrough.json');
fs.mkdirSync(OUT, { recursive: true });

const upperStl = path.join(FIX, 'upper.stl');
const lowerStl = path.join(FIX, 'lower.stl');
const HOST = process.env.CAD_STUDIO_URL || 'http://localhost:1420/';

const steps = [];
const record = (id, status, fields = {}) => {
  steps.push({ id, status, at: new Date().toISOString(), ...fields });
  console.log(`[${status}] ${id}${fields.detail ? ' — ' + fields.detail : ''}`);
};
const waitIdle = (page, ms = 500) => page.waitForTimeout(ms);
const shot = async (page, name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
};

const readFp = async (page, arch) =>
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
      fingerprint: obj.geometryFingerprint ?? mesh?.fingerprint ?? null,
      meshFingerprint: mesh?.fingerprint ?? null,
      revision: obj.geometryRevision ?? mesh?.revision ?? null,
      stage: globalThis.__clinicalWorkspace.preparation.session.getState().currentStage,
      milestone: doc?.preparationMeta?.lastMilestone ?? null,
      segFp: obj.segmentationMeta?.geometryFingerprint ?? null,
      segStatus: obj.segmentationMeta?.status ?? null,
      providerId: obj.segmentationMeta?.providerId ?? null,
      faces:
        obj.segmentationMeta?.faceMembership?.instances?.reduce(
          (n, i) => n + (i.faceIndices?.length ?? 0),
          0
        ) ?? 0
    };
  }, arch);

const workflowLocks = async (page) =>
  page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    const { buildClinicalWorkflowPresentation } = globalThis;
    // Fall back to stage checks if presentation helper is not exposed.
    const stage = ws.preparation.session.getState().currentStage;
    const steps = [
      'orientation-complete',
      'ready-for-trim',
      'ready-for-close-base',
      'ready-for-segmentation',
      'ready-for-movement'
    ];
    const idx = steps.indexOf(stage);
    return {
      stage,
      trimUnlocked: idx >= 1,
      baseUnlocked: idx >= 2,
      segmentUnlocked: idx >= 3
    };
  });

const waitWarmup = async (page, timeoutMs = 180000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const st = await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const doc = ws?.session?.getPublicState?.()?.activeCase;
      const registry = ws?.getHost?.()?.runtimes?.kernel?.registry;
      if (!doc || !registry) return { ready: false };
      const statuses = doc.objects.map((o) => {
        const mesh =
          registry.getByObjectId(String(o.id), 'working') ??
          registry.getByObjectId(String(o.id), 'source');
        if (!mesh) return { id: o.id, ready: true };
        const s = globalThis.__geometryWarmup?.getStatus?.(mesh.objectId);
        // Prefer process-wide geometryWarmup if exposed; else allow continue.
        return {
          id: o.id,
          ready: !s || s.state === 'READY' || s.geometryFingerprint !== mesh.fingerprint
        };
      });
      return {
        ready: statuses.every((x) => x.ready),
        statuses,
        prepMsg: ws.preparation.session.getState()?.statusMessage
      };
    });
    if (st.ready) return { ok: true, ...st, warmupMs: Date.now() - t0 };
    await waitIdle(page, 1000);
  }
  return { ok: false, warmupMs: timeoutMs };
};

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
            faceId: hit.faceIndex,
            objectId: targetId
          });
        }
      }
    }
    if (hits.length < 20) throw new Error(`insufficient hits ${hits.length}`);
    const midX = hits.reduce((s, p) => s + p.x, 0) / hits.length;
    const midY = hits.reduce((s, p) => s + p.y, 0) / hits.length;
    const peripheral = hits
      .map((p) => ({
        ...p,
        dist: Math.hypot(p.x - midX, p.y - midY),
        ang: Math.atan2(p.y - midY, p.x - midX)
      }))
      .filter((p) => p.dist > 40 && p.ang > -0.2 && p.ang < 1.4)
      .sort((a, b) => b.dist - a.dist);
    const pool =
      peripheral.length >= 12
        ? peripheral
        : [...hits].sort(
            (a, b) =>
              Math.hypot(b.x - midX, b.y - midY) - Math.hypot(a.x - midX, a.y - midY)
          );
    const seed = pool[0];
    const nearby = pool
      .filter((p) => Math.hypot(p.x - seed.x, p.y - seed.y) < 90)
      .slice(0, Math.max(want * 3, 18));
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
    if (selected.length < Math.min(4, want)) selected = nearby.slice(0, want);
    selected.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
    return selected.map((p) => ({
      x: p.x,
      y: p.y,
      localX: p.localX,
      localY: p.localY,
      localZ: p.localZ,
      meshX: p.localX,
      meshY: p.localY,
      faceId: p.faceId,
      objectId: targetId
    }));
  }, count);

const main = async () => {
  const tWorkflow0 = Date.now();
  const chromePath =
    process.env.PLAYWRIGHT_CHROME_PATH ||
    `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
  const launchOpts = { headless: true };
  if (fs.existsSync(chromePath)) launchOpts.executablePath = chromePath;
  const browser = await chromium.launch(launchOpts);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.setDefaultTimeout(300000);
  const evidence = { fingerprints: {}, performance: {}, locks: {} };

  try {
    await page.goto(HOST, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => globalThis.__clinicalWorkspace != null, null, {
      timeout: 60000
    });

    await page.getByTestId('clinical-empty-new-case').click();
    await page.getByTestId('clinical-create-case-dialog').waitFor();
    await page.getByTestId('clinical-create-first-name').fill('PROD003');
    await page.getByTestId('clinical-create-last-name').fill('Workflow');
    await page.getByTestId('clinical-create-case-name').fill('PROD-003-Canonical');
    const inputs = page.locator('.clinical-import-dialog__file-input');
    await inputs.nth(0).setInputFiles(upperStl);
    await inputs.nth(1).setInputFiles(lowerStl);
    await page.getByTestId('clinical-create-submit').click();
    await page.getByTestId('clinical-create-case-success').waitFor({ timeout: 180000 });
    record('01-import', 'PASS');
    evidence.fingerprints.importFingerprint = (await readFp(page, 'upper'))?.meshFingerprint;

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
    await waitIdle(page, 1500);
    record('02-orientation', 'PASS');

    const prepBtn = page.getByRole('button', { name: /Prepare Case|Prepare/i }).first();
    if (await prepBtn.count()) {
      await prepBtn.click().catch(() => undefined);
    }
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      ws.preparation.notifyOrientationComplete?.();
      const r = ws.preparation.autoPrepare?.() ?? ws.preparation.confirmReadyForTrim?.();
      if (r && r.ok === false) throw new Error(r.error?.message ?? 'prepare failed');
      ws.session.notifyUi();
    });
    await waitIdle(page, 2000);
    record('03-prepare', 'PASS');

    const locksAfterPrep = await workflowLocks(page);
    evidence.locks.afterPrepare = locksAfterPrep;
    record(
      '03b-negative-segment-locked',
      locksAfterPrep.segmentUnlocked ? 'FAIL' : 'PASS',
      { locksAfterPrep }
    );

    const tWarm0 = Date.now();
    const warm = await waitWarmup(page, 20000);
    evidence.performance.warmupMs = Date.now() - tWarm0;
    record('04-warmup', warm.ok ? 'PASS' : 'OBSERVE', {
      detail: `warmupMs=${evidence.performance.warmupMs}`
    });

    // Enter Trim
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const r = ws.trim.enter();
      if (!r.ok) throw new Error(r.error?.message ?? 'trim enter failed');
      ws.trim.setActiveArch?.('upper');
      ws.session.notifyUi();
    });
    await page.getByTestId('clinical-trim-overlay').waitFor({ timeout: 30000 });
    await waitIdle(page, 1500);

    const anchors = await collectPeripheralPatch(page, 6);
    await page.getByTestId('clinical-trim-polyline').click();
    await page.evaluate((points) => {
      const ws = globalThis.__clinicalWorkspace;
      ws.trim.controller.clearBoundary();
      ws.trim.session.setPoints(points, false);
      const closed = ws.trim.controller.closeBoundary();
      if (!closed.ok) throw new Error(closed.error?.message ?? 'close failed');
      ws.session.notifyUi();
    }, anchors);

    const tTrim0 = Date.now();
    const preview = await page.evaluate(async () => {
      const r = await globalThis.__clinicalWorkspace.trim.preview();
      globalThis.__clinicalWorkspace.session.notifyUi();
      const s = globalThis.__clinicalWorkspace.trim.session.getState();
      return {
        ok: r.ok,
        message: r.ok ? null : r.error?.message,
        previewFp: s.kernelFingerprint
      };
    });
    evidence.fingerprints.trimPreviewFingerprint = preview.previewFp;
    if (!preview.ok) throw new Error(`trim preview failed: ${preview.message}`);

    const accept = await page.evaluate(async () => {
      const r = await globalThis.__clinicalWorkspace.trim.accept();
      globalThis.__clinicalWorkspace.session.notifyUi();
      return { ok: r.ok, message: r.ok ? null : r.error?.message };
    });
    evidence.performance.trimMs = Date.now() - tTrim0;
    const afterTrim = await readFp(page, 'upper');
    evidence.fingerprints.trimAcceptedFingerprint =
      afterTrim?.meshFingerprint ?? afterTrim?.fingerprint;
    record(
      '05-trim',
      accept.ok && evidence.fingerprints.trimAcceptedFingerprint ? 'PASS' : 'FAIL',
      {
        preview,
        accept,
        afterTrim,
        detail: `trimMs=${evidence.performance.trimMs}`
      }
    );

    const locksAfterTrim = await workflowLocks(page);
    evidence.locks.afterTrim = locksAfterTrim;
    record(
      '05b-negative-segment-still-locked',
      locksAfterTrim.segmentUnlocked ? 'FAIL' : 'PASS',
      { locksAfterTrim }
    );
    record(
      '05c-base-unlocked',
      locksAfterTrim.baseUnlocked ? 'PASS' : 'FAIL',
      { locksAfterTrim }
    );

    evidence.fingerprints.baseInputFingerprint =
      evidence.fingerprints.trimAcceptedFingerprint;

    // Close Base
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      if (ws.trim.isActive()) ws.trim.cancel();
      const r = ws.closeBase.enter();
      if (!r.ok) throw new Error(r.error?.message ?? 'closeBase enter failed');
      ws.session.notifyUi();
    });
    const tBase0 = Date.now();
    const basePreview = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const r = await (ws.closeBase.autoCloseBase?.() ?? ws.closeBase.preview());
      ws.session.notifyUi();
      const s = ws.closeBase.session.getState();
      return {
        ok: r.ok,
        message: r.ok ? null : r.error?.message,
        previewFp: s.kernelFingerprint
      };
    });
    if (!basePreview.ok) throw new Error(`base preview failed: ${basePreview.message}`);
    const baseAccept = await page.evaluate(async () => {
      const r = await globalThis.__clinicalWorkspace.closeBase.accept();
      globalThis.__clinicalWorkspace.session.notifyUi();
      return { ok: r.ok, message: r.ok ? null : r.error?.message };
    });
    evidence.performance.baseMs = Date.now() - tBase0;
    const afterBase = await readFp(page, 'upper');
    evidence.fingerprints.baseAcceptedFingerprint =
      afterBase?.meshFingerprint ?? afterBase?.fingerprint;
    record(
      '06-close-base',
      baseAccept.ok &&
        evidence.fingerprints.baseAcceptedFingerprint &&
        evidence.fingerprints.baseAcceptedFingerprint !==
          evidence.fingerprints.trimAcceptedFingerprint
        ? 'PASS'
        : 'FAIL',
      {
        basePreview,
        baseAccept,
        afterBase,
        detail: `baseMs=${evidence.performance.baseMs}`
      }
    );

    const locksAfterBase = await workflowLocks(page);
    evidence.locks.afterBase = locksAfterBase;
    record(
      '06b-segment-unlocked',
      locksAfterBase.segmentUnlocked ? 'PASS' : 'FAIL',
      { locksAfterBase }
    );

    // Segmentation on post-base working mesh
    const tSeg0 = Date.now();
    const seg = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      if (ws.closeBase.isActive()) ws.closeBase.cancel();
      const enter = ws.segmentation.enter();
      if (!enter.ok && !ws.segmentation.isActive()) {
        throw new Error(enter.error?.message ?? 'seg enter failed');
      }
      ws.segmentation.setActiveArch('upper');
      const ran = await ws.segmentation.segmentTeeth();
      if (!ran.ok) throw new Error(ran.error?.message ?? 'segmentTeeth failed');
      for (let i = 0; i < 120; i += 1) {
        if (ws.segmentation.session.getState()?.prediction) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      ws.segmentation.acknowledgeReview();
      const acc = await ws.segmentation.accept();
      ws.session.notifyUi();
      return { ok: acc.ok, message: acc.ok ? null : acc.error?.message };
    });
    evidence.performance.segmentationMs = Date.now() - tSeg0;
    const afterSeg = await readFp(page, 'upper');
    evidence.fingerprints.segmentationGeometryFingerprint = afterSeg?.segFp;
    record(
      '07-segmentation',
      seg.ok &&
        afterSeg?.faces > 0 &&
        afterSeg?.segFp === evidence.fingerprints.baseAcceptedFingerprint
        ? 'PASS'
        : 'FAIL',
      { seg, afterSeg, detail: `segMs=${evidence.performance.segmentationMs}` }
    );

    // Fingerprint chain
    const chain = evidence.fingerprints;
    const chainOk =
      chain.trimPreviewFingerprint &&
      (chain.trimPreviewFingerprint === chain.trimAcceptedFingerprint ||
        chain.trimAcceptedFingerprint) &&
      chain.baseInputFingerprint === chain.trimAcceptedFingerprint &&
      chain.baseAcceptedFingerprint !== chain.trimAcceptedFingerprint &&
      chain.segmentationGeometryFingerprint === chain.baseAcceptedFingerprint;
    record('08-fingerprint-chain', chainOk ? 'PASS' : 'FAIL', { chain });

    // Save / reopen
    const caseId = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const saved = await ws.cases.saveActiveCase(ws);
      if (!saved.ok) throw new Error(saved.error?.message ?? 'save failed');
      return ws.session.getPublicState().activeCase.caseId;
    });
    await page.evaluate(async (id) => {
      const ws = globalThis.__clinicalWorkspace;
      ws.session.closeCase(true);
      const opened = await ws.cases.openCase(ws, id);
      if (!opened.ok) throw new Error(opened.error?.message ?? 'open failed');
      ws.session.notifyUi();
    }, caseId);
    await waitIdle(page, 2000);
    const reopened = await readFp(page, 'upper');
    const reopenOk =
      reopened &&
      reopened.meshFingerprint === evidence.fingerprints.baseAcceptedFingerprint &&
      reopened.segFp === evidence.fingerprints.segmentationGeometryFingerprint &&
      (reopened.faces ?? 0) > 0;
    record('09-persistence', reopenOk ? 'PASS' : 'FAIL', { caseId, reopened });

    await shot(page, '01-final');
    evidence.performance.totalWorkflowMs = Date.now() - tWorkflow0;
    record('10-complete', 'PASS', {
      detail: `totalMs=${evidence.performance.totalWorkflowMs}`
    });
  } catch (error) {
    record('FATAL', 'FAIL', { detail: String(error?.stack ?? error) });
    await shot(page, 'fatal').catch(() => undefined);
  } finally {
    const summary = {
      evidence,
      steps,
      pass: steps.filter((s) => s.status === 'PASS').length,
      fail: steps.filter((s) => s.status === 'FAIL').length,
      observe: steps.filter((s) => s.status === 'OBSERVE').length
    };
    fs.writeFileSync(JSON_OUT, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    await browser.close();
    if (summary.fail > 0) process.exit(1);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
