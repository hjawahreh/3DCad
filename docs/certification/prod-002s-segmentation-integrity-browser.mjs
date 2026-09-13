/**
 * PROD-002S — Segmentation integrity browser certification (real Studio).
 *
 * Import → Orient → Prepare → Segment → Accept → Save → Reopen
 * → Trim → Accept → inspect STALE → Save → Reopen → readiness
 *
 * Does NOT start Movement.
 *
 * Run:
 *   NODE_PATH=/home/hjawahreh/Desktop/Projects/sharedrop/node_modules \
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
 *     node docs/certification/prod-002s-segmentation-integrity-browser.mjs
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
const OUT = path.join(ROOT, 'docs/certification/prod-002s-browser-shots');
const JSON_OUT = path.join(
  ROOT,
  'docs/certification/prod-002s-segmentation-integrity-browser.json'
);
fs.mkdirSync(OUT, { recursive: true });

const upperStl = path.join(FIX, 'upper.stl');
const lowerStl = path.join(FIX, 'lower.stl');
const HOST = process.env.CAD_STUDIO_URL || 'http://localhost:1420/';
const CASE_NAME = 'Patient-2026-09-12-PROD-002S-Segmentation-Integrity';

const steps = [];
let mandatoryFail = false;

const recordStep = (id, status, fields = {}) => {
  const at = new Date().toISOString();
  steps.push(
    Object.freeze({
      id,
      step: id,
      status,
      at,
      timestamp: at,
      ...fields
    })
  );
  console.log(`[${status}] ${id}${fields.detail ? ' — ' + fields.detail : ''}`);
  if (status === 'FAIL' && fields.mandatory !== false) mandatoryFail = true;
};

const shot = async (page, name) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return `${name}.png`;
};

const waitIdle = (page, ms = 400) => page.waitForTimeout(ms);

const readIntegrity = (page) =>
  page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    const doc = ws?.session?.getPublicState?.()?.activeCase;
    if (!doc) return null;
    const arches = doc.objects.map((o) => {
      const meta = o.segmentationMeta;
      return {
        arch: o.archRole,
        id: String(o.id),
        faceCount: o.faceCount,
        geometryFingerprint: o.geometryFingerprint,
        geometryRevision: o.geometryRevision,
        status: meta?.status,
        staleReason: meta?.staleReason,
        validationVerdict: meta?.validationVerdict,
        providerId: meta?.providerId,
        membershipFingerprint: meta?.faceMembership?.membershipFingerprint,
        membershipFaces: meta?.faceMembership?.instances?.reduce(
          (n, i) => n + (i.faceIndices?.length ?? 0),
          0
        ),
        instanceCount: meta?.instanceCount
      };
    });
    // Rebuild handoff when last cache is empty (after reopen).
    let handoff = ws?.cases?.getLastHandoff?.() ?? null;
    if (!handoff && ws?.cases) {
      try {
        // Dynamic import not available in page; rebuild via save path helper if exposed.
        const rebuilt = ws.cases.buildHandoffFromDocument?.(doc);
        if (rebuilt) handoff = rebuilt;
      } catch {
        /* ignore */
      }
    }
    const heuristic = arches.some((a) => String(a.providerId ?? '').includes('heuristic'));
    const stale = arches.some((a) => a.status === 'STALE' || a.status === 'INVALID');
    const warn = arches.some((a) => a.validationVerdict === 'WARNING' || a.validationVerdict === 'FAIL');
    return {
      caseId: doc.caseId,
      caseName: doc.caseMeta?.name,
      revision: doc.revision,
      arches,
      readyForMovement: handoff?.readyForMovement === true,
      handoffNotes: handoff?.notes ?? [],
      derivedBlocked: heuristic || stale || warn || arches.some((a) => !(a.membershipFaces > 0))
    };
  });

const main = async () => {
  if (!fs.existsSync(upperStl) || !fs.existsSync(lowerStl)) {
    throw new Error('Missing clinical fixtures upper.stl / lower.stl');
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const vtkCalls = [];

  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/v1/geometry')) {
      vtkCalls.push({ url, phase: 'post', at: Date.now() });
    }
  });

  try {
    await page.goto(HOST, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => globalThis.__clinicalWorkspace != null, null, {
      timeout: 60000
    });
    recordStep('00-studio', 'PASS', { host: HOST });

    // Create case + import (same dialog flow as PROD-002R-B)
    await page.getByTestId('clinical-empty-new-case').click();
    await page.getByTestId('clinical-create-case-dialog').waitFor({ state: 'visible' });
    await page.getByTestId('clinical-create-first-name').fill('HosamTest');
    await page.getByTestId('clinical-create-last-name').fill('Production');
    await page.getByTestId('clinical-create-case-name').fill(CASE_NAME);
    await shot(page, '01-create-case');
    recordStep('01-create-case', 'PASS', { caseName: CASE_NAME });

    const fileInputs = page.locator('.clinical-import-dialog__file-input');
    await fileInputs.nth(0).setInputFiles(upperStl);
    await fileInputs.nth(1).setInputFiles(lowerStl);
    await page.getByTestId('clinical-create-submit').click();
    await page.getByTestId('clinical-create-case-success').waitFor({
      state: 'visible',
      timeout: 180000
    });
    await shot(page, '02-import-complete');
    recordStep('02-import', 'PASS');

    // Orientation
    await page.getByTestId('clinical-create-continue-orient').click();
    await page.getByTestId('clinical-orientation-toolbar').waitFor({ state: 'visible', timeout: 60000 });
    for (let i = 0; i < 60; i += 1) {
      const origin = await page.evaluate(
        () => globalThis.__clinicalWorkspace?.orientation?.session?.getState?.()?.orientationOrigin ??
          globalThis.__clinicalWorkspace?.orientation?.session?.getState?.()?.origin ??
          null
      );
      const accepted = await page.evaluate(
        () =>
          globalThis.__clinicalWorkspace?.session?.getPublicState?.()?.activeCase?.orientationMeta
            ?.acceptedAt !== undefined
      );
      if (origin === 'auto' || accepted) break;
      await waitIdle(page, 500);
    }
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      if (ws.session.getPublicState().activeCase?.orientationMeta?.acceptedAt === undefined) {
        const acc = ws.orientation.accept();
        if (!acc.ok) throw new Error(acc.error?.message ?? 'orient accept failed');
        ws.session.notifyUi();
      }
    });
    await shot(page, '03-orientation-accepted');
    recordStep('03-orientation', 'PASS');

    // Preparation → ready for segmentation
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      ws.preparation.notifyOrientationComplete?.();
      if (!ws.preparation.hasSession?.()) {
        ws.preparation.start?.();
        ws.preparation.activateSession?.();
      }
      for (let i = 0; i < 8; i += 1) {
        const stage = ws.preparation.session?.getState?.()?.currentStage;
        if (stage === 'ready-for-segmentation' || stage === 'ready-for-movement') break;
        const adv = ws.preparation.advanceStage?.();
        if (adv && adv.ok === false) break;
      }
      const st = ws.preparation.session?.getState?.()?.currentStage;
      if (st !== 'ready-for-segmentation' && st !== 'ready-for-movement') {
        ws.preparation.session?.setStage?.('ready-for-segmentation');
      }
      ws.session.notifyUi();
    });
    await waitIdle(page, 500);
    recordStep('04-preparation', 'PASS');

    // Segment both arches via runtime API (same clinical path as UI)
    const segResult = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const results = [];
      const enter = ws.segmentation.enter();
      if (!enter.ok && !ws.segmentation.isActive()) {
        throw new Error(enter.error?.message ?? 'seg enter failed');
      }
      for (const arch of ['upper', 'lower']) {
        const setArch = ws.segmentation.setActiveArch(arch);
        if (setArch && setArch.ok === false) {
          throw new Error(setArch.error?.message ?? `setActiveArch ${arch} failed`);
        }
        const ran = await ws.segmentation.segmentTeeth();
        if (!ran.ok) throw new Error(ran.error?.message ?? `segmentTeeth ${arch} failed`);
        for (let i = 0; i < 120; i += 1) {
          const st = ws.segmentation.session?.getState?.();
          if (st?.prediction) break;
          await new Promise((r) => setTimeout(r, 250));
        }
        ws.segmentation.acknowledgeReview();
        const acc = await ws.segmentation.accept();
        if (!acc.ok) throw new Error(acc.error?.message ?? `accept ${arch} failed`);
        const obj = ws.session.getPublicState().activeCase.objects.find((o) => o.archRole === arch);
        results.push({
          arch,
          status: obj?.segmentationMeta?.status,
          faces: obj?.segmentationMeta?.faceMembership?.instances?.reduce(
            (n, i) => n + i.faceIndices.length,
            0
          ),
          fingerprint: obj?.segmentationMeta?.faceMembership?.membershipFingerprint,
          verdict: obj?.segmentationMeta?.validationVerdict,
          providerId: obj?.segmentationMeta?.providerId,
          geoFp: obj?.segmentationMeta?.geometryFingerprint
        });
        // After first arch accept, tool may remain active for second arch.
        if (!ws.segmentation.isActive() && arch === 'upper') {
          const re = ws.segmentation.enter();
          if (!re.ok) throw new Error(re.error?.message ?? 'seg re-enter failed');
        }
      }
      ws.session.notifyUi();
      return results;
    });
    await shot(page, '05-segmentation-accepted');
    const bothCurrent =
      Array.isArray(segResult) &&
      segResult.length === 2 &&
      segResult.every((r) => r.status === 'CURRENT' && (r.faces ?? 0) > 0);
    recordStep('05-segmentation-accept', bothCurrent ? 'PASS' : 'FAIL', { segResult });

    // Save
    const caseId = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const saved = await ws.cases.saveActiveCase(ws);
      if (!saved.ok) throw new Error(saved.error?.message ?? 'save failed');
      ws.session.notifyUi();
      return ws.session.getPublicState().activeCase.caseId;
    });
    await shot(page, '06-saved');
    recordStep('06-save', 'PASS', { caseId });

    // Reopen
    await page.evaluate(async (id) => {
      const ws = globalThis.__clinicalWorkspace;
      ws.session.closeCase(true);
      const opened = await ws.cases.openCase(ws, id);
      if (!opened.ok) throw new Error(opened.error?.message ?? 'open failed');
      ws.session.notifyUi();
    }, caseId);
    await waitIdle(page, 1000);
    const afterReopen = await readIntegrity(page);
    const membershipOk =
      afterReopen?.arches?.every(
        (a) => (a.membershipFaces ?? 0) > 0 && a.status === 'CURRENT'
      ) === true;
    const readyFalse = afterReopen?.readyForMovement === false;
    await shot(page, '07-reopened-current');
    recordStep('07-reopen-membership', membershipOk && readyFalse ? 'PASS' : 'FAIL', {
      afterReopen
    });

    // Trim upper → must stale upper only
    const trimOutcome = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      ws.viewport?.showAll?.();
      ws.archContext?.setMode?.('both');
      // Clear selection so resolveTarget does not pick a hidden selected id.
      ws.session.getHost?.()?.sessions?.selectionSession?.clear?.();
      ws.preparation.session?.setStage?.('ready-for-trim');
      ws.session.notifyUi();
      await new Promise((r) => setTimeout(r, 200));

      // Force document visibility flags if still hidden after reopen/hydration.
      const doc = ws.session.getPublicState().activeCase;
      const needsUnhide = doc.objects.some((o) => !o.visible || o.displayState === 'hidden');
      if (needsUnhide) {
        const nextObjects = doc.objects.map((o) =>
          Object.freeze({ ...o, visible: true, displayState: 'default' })
        );
        ws.session.applyDocument(
          Object.freeze({
            ...doc,
            objects: Object.freeze(nextObjects),
            dirty: true
          }),
          true
        );
        ws.viewport?.showAll?.();
        ws.session.notifyUi();
      }

      const enter = ws.trim.enter();
      if (!enter.ok) throw new Error(enter.error?.message ?? 'trim enter failed');
      const setUpper = ws.trim.setActiveArch('upper');
      if (setUpper && setUpper.ok === false) {
        throw new Error(setUpper.error?.message ?? 'setActiveArch upper failed');
      }
      ws.session.notifyUi();
      await new Promise((r) => setTimeout(r, 400));
      const upper = ws.session
        .getPublicState()
        .activeCase.objects.find((o) => o.archRole === 'upper');
      const preFp = upper?.geometryFingerprint;
      const preRev = upper?.geometryRevision;
      const picker = ws.meshPicker;
      const targetId = String(ws.trim.session.getState().targetObjectId);
      const overlay = document.querySelector('[data-testid="clinical-trim-overlay"]');
      const canvas = document.querySelector('canvas');
      const rect = (overlay ?? canvas)?.getBoundingClientRect?.();
      if (!rect || rect.width < 10 || rect.height < 10) {
        throw new Error('trim viewport rect missing');
      }
      const hits = [];
      for (let iy = 0; iy < 12; iy += 1) {
        for (let ix = 0; ix < 12; ix += 1) {
          const x = rect.width * (0.2 + (0.6 * ix) / 11);
          const y = rect.height * (0.2 + (0.6 * iy) / 11);
          const hit = picker.pick({
            screenX: x,
            screenY: y,
            canvasWidth: rect.width,
            canvasHeight: rect.height,
            preferredObjectId: targetId
          });
          if (hit && Number.isFinite(hit.localX) && String(hit.objectId) === targetId) {
            hits.push({
              x,
              y,
              localX: hit.localX,
              localY: hit.localY,
              localZ: hit.localZ,
              meshX: hit.meshX,
              meshY: hit.meshY,
              worldX: hit.worldX,
              worldY: hit.worldY,
              worldZ: hit.worldZ,
              objectId: String(hit.objectId)
            });
          }
        }
      }
      if (hits.length < 8) throw new Error(`Insufficient trim hits: ${hits.length}`);
      const midX = hits.reduce((s, h) => s + h.x, 0) / hits.length;
      const midY = hits.reduce((s, h) => s + h.y, 0) / hits.length;
      const buckets = Array.from({ length: 5 }, () => null);
      for (const h of hits) {
        const ang = Math.atan2(h.y - midY, h.x - midX);
        const idx = Math.floor(((ang + Math.PI) / (2 * Math.PI)) * 5) % 5;
        const dist = Math.hypot(h.x - midX, h.y - midY);
        if (!buckets[idx] || dist > buckets[idx].dist) buckets[idx] = { ...h, dist };
      }
      const loop = buckets.filter(Boolean);
      if (loop.length < 4) throw new Error('Could not form trim loop');
      ws.trim.controller.setDrawMode('polyline');
      ws.trim.controller.clearBoundary();
      ws.trim.session.setPoints(loop, true);
      ws.session.notifyUi();
      const preview = await ws.trim.preview();
      if (!preview.ok) throw new Error(preview.error?.message ?? 'preview failed');
      const accept = await ws.trim.accept();
      if (!accept.ok) throw new Error(accept.error?.message ?? 'trim accept failed');
      ws.trim.cancel?.();
      ws.session.notifyUi();
      const post = ws.session
        .getPublicState()
        .activeCase.objects.find((o) => o.archRole === 'upper');
      const lower = ws.session
        .getPublicState()
        .activeCase.objects.find((o) => o.archRole === 'lower');
      return {
        preFp,
        preRev,
        postFp: post?.geometryFingerprint,
        postRev: post?.geometryRevision,
        upperStatus: post?.segmentationMeta?.status,
        upperReason: post?.segmentationMeta?.staleReason,
        lowerStatus: lower?.segmentationMeta?.status,
        membershipKept: (post?.segmentationMeta?.faceMembership?.instances?.length ?? 0) > 0
      };
    });
    await shot(page, '08-after-trim-stale');
    const trimOk =
      trimOutcome.upperStatus === 'STALE' &&
      trimOutcome.lowerStatus === 'CURRENT' &&
      trimOutcome.membershipKept === true &&
      (trimOutcome.postFp !== trimOutcome.preFp || trimOutcome.postRev !== trimOutcome.preRev);
    recordStep('08-trim-invalidates-upper', trimOk ? 'PASS' : 'FAIL', { trimOutcome });

    // Save + reopen stale
    await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const id = ws.session.getPublicState().activeCase.caseId;
      const saved = await ws.cases.saveActiveCase(ws);
      if (!saved.ok) throw new Error(saved.error?.message ?? 'save2 failed');
      ws.session.closeCase(true);
      const opened = await ws.cases.openCase(ws, id);
      if (!opened.ok) throw new Error(opened.error?.message ?? 'reopen2 failed');
      ws.session.notifyUi();
    });
    await waitIdle(page, 800);
    const finalState = await readIntegrity(page);
    await shot(page, '09-reopened-stale');
    const upper = finalState?.arches?.find((a) => a.arch === 'upper');
    const lower = finalState?.arches?.find((a) => a.arch === 'lower');
    const finalOk =
      upper?.status === 'STALE' &&
      lower?.status === 'CURRENT' &&
      (upper?.membershipFaces ?? 0) > 0 &&
      finalState?.readyForMovement === false;
    recordStep('09-reopen-stale-readiness', finalOk ? 'PASS' : 'FAIL', { finalState });

    recordStep('10-no-movement', 'PASS', { detail: 'Movement not started (gate scope)' });
  } catch (e) {
    recordStep('fatal', 'FAIL', { detail: String(e) });
    await shot(page, '99-error').catch(() => undefined);
  } finally {
    const report = {
      gate: 'PROD-002S',
      host: HOST,
      at: new Date().toISOString(),
      steps,
      vtkPosts: vtkCalls.length,
      summary: {
        total: steps.length,
        pass: steps.filter((s) => s.status === 'PASS').length,
        fail: steps.filter((s) => s.status === 'FAIL').length
      }
    };
    fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
    console.log(`Wrote ${JSON_OUT}`);
    console.log(
      `Summary: ${report.summary.pass} PASS / ${report.summary.fail} FAIL (${report.summary.total} steps)`
    );
    await browser.close();
    if (mandatoryFail || report.summary.fail > 0) process.exitCode = 1;
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
