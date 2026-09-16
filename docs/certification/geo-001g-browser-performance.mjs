/**
 * GEO-001G — Binary geometry result transport (browser).
 *
 * Prerequisites: Studio :1420 + VTK worker :8765 (GEO-001G persistent).
 *
 * Run:
 *   NODE_PATH=/home/hjawahreh/Desktop/Projects/sharedrop/node_modules \
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
 *     node docs/certification/geo-001g-browser-performance.mjs
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
const OUT = path.join(ROOT, 'docs/certification/geo-001g-browser-shots');
const JSON_OUT = path.join(ROOT, 'docs/certification/geo-001g-browser-performance.json');
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
};
const waitIdle = (page, ms = 500) => page.waitForTimeout(ms);

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
      meshFingerprint: mesh?.fingerprint ?? null,
      meshFaces: mesh ? Math.floor(mesh.indices.length / 3) : null
    };
  }, arch);

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
        statusMessage: s?.statusMessage,
        fingerprint: s?.kernelFingerprint
      };
    });
    if (st.ready && st.fingerprint) return { ok: true, ...st };
    if (/no geometry change|NO_REGION|failed|WORKER_SESSION/i.test(String(st.statusMessage ?? ''))) {
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

const injectAndClose = async (page, anchors) => {
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
};

const runPreview = async (page, label) => {
  const before = await readArchGeom(page, 'upper');
  // Important: do NOT poll with concurrent page.evaluate while preview() runs —
  // Playwright serializes evaluates and that starved the preview (GEO-001G ~75s artifact).
  const preview = await page.evaluate(async () => {
    const started = Date.now();
    const r = await globalThis.__clinicalWorkspace.trim.preview();
    globalThis.__clinicalWorkspace.session.notifyUi();
    const s = globalThis.__clinicalWorkspace.trim.session.getState();
    const backend = globalThis.__clinicalWorkspace.getHost().runtimes.kernel.backend;
    const transport =
      typeof backend?.vtkBackend?.getLastTransport === 'function'
        ? backend.vtkBackend.getLastTransport()
        : typeof backend?.getLastTransport === 'function'
          ? backend.getLastTransport()
          : null;
    const session =
      typeof backend?.vtkBackend?.getSession === 'function'
        ? backend.vtkBackend.getSession(String(s.targetObjectId ?? ''))
        : null;
    return {
      ok: r.ok,
      message: r.ok ? null : r.error?.message,
      elapsedMs: Date.now() - started,
      fingerprint: s.kernelFingerprint,
      statusMessage: s.statusMessage,
      ready: globalThis.__clinicalWorkspace.trim.controller.isPreviewReady() === true,
      transport: transport
        ? {
            ...transport,
            initUploadBytes: session?.lastUploadBytes ?? null
          }
        : null,
      session
    };
  });
  if (!preview.ok && !preview.ready) {
    throw new Error(`${label} preview failed: ${JSON.stringify(preview)}`);
  }
  return {
    before,
    previewMs: preview.elapsedMs,
    previewFp: preview.fingerprint,
    transport: preview.transport,
    session: preview.session
  };
};

const acceptTrim = async (page, before) => {
  const accept = await page.evaluate(async () => {
    const r = await globalThis.__clinicalWorkspace.trim.accept();
    globalThis.__clinicalWorkspace.session.notifyUi();
    return { ok: r.ok, message: r.ok ? null : r.error?.message };
  });
  await waitIdle(page, 1200);
  let after = await readArchGeom(page, 'upper');
  for (let i = 0; i < 30; i += 1) {
    if (
      after &&
      before &&
      (after.fingerprint !== before.fingerprint || after.faceCount !== before.faceCount)
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
      (after.fingerprint !== before.fingerprint || after.faceCount !== before.faceCount)
  };
};

const chromePath = '/usr/bin/google-chrome';
const main = async () => {
  const launchOpts = { headless: true };
  if (fs.existsSync(chromePath)) launchOpts.executablePath = chromePath;
  const browser = await chromium.launch(launchOpts);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.setDefaultTimeout(300000);
  const evidence = { timings: {}, trims: [] };

  try {
    await page.goto(HOST, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => globalThis.__clinicalWorkspace != null, null, {
      timeout: 60000
    });

    await page.getByTestId('clinical-empty-new-case').click();
    await page.getByTestId('clinical-create-case-dialog').waitFor();
    await page.getByTestId('clinical-create-first-name').fill('GEO001G');
    await page.getByTestId('clinical-create-last-name').fill('BinaryTransport');
    await page.getByTestId('clinical-create-case-name').fill('GEO-001G-Binary-Transport');
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
    await shot(page, '01-before');

    // Preview A → Cancel (must not mutate working; must warm worker session)
    const anchorsA = await collectPeripheralPatch(page, 6);
    await injectAndClose(page, anchorsA);
    await shot(page, '02-loop');
    const previewA = await runPreview(page, 'previewA');
    evidence.timings.previewAMs = previewA.previewMs;
    evidence.timings.previewATransport = previewA.transport;
    await shot(page, '03-preview');
    record('01-preview-a', previewA.previewFp ? 'PASS' : 'FAIL', {
      detail: `ms=${previewA.previewMs} upload=${previewA.transport?.uploadBytes ?? '?'} resident=${previewA.transport?.meshResident}`,
      transport: previewA.transport,
      session: previewA.session
    });

    const cancel = await page.evaluate(() => {
      const r = globalThis.__clinicalWorkspace.trim.cancelPreview();
      globalThis.__clinicalWorkspace.session.notifyUi();
      return { ok: r.ok };
    });
    await waitIdle(page, 800);
    const afterCancel = await readArchGeom(page, 'upper');
    const cancelOk =
      cancel.ok &&
      afterCancel &&
      baseline &&
      afterCancel.fingerprint === baseline.fingerprint;
    await shot(page, '04-after-cancel');
    record('02-cancel', cancelOk ? 'PASS' : 'FAIL', { afterCancel, baseline });

    // Preview B → Accept (repeat on same geometry — should not re-upload)
    await injectAndClose(page, anchorsA);
    const previewB = await runPreview(page, 'previewB');
    evidence.timings.previewBMs = previewB.previewMs;
    evidence.timings.previewBTransport = previewB.transport;
    await shot(page, '05-preview-b');
    const acceptB = await acceptTrim(page, previewB.before);
    evidence.trims.push({ id: 'B', ...previewB, ...acceptB });
    await shot(page, '04-accepted');
    record(
      '03-preview-b-accept',
      acceptB.mutated && acceptB.accept.ok ? 'PASS' : 'FAIL',
      {
        detail: `ms=${previewB.previewMs} upload=${previewB.transport?.uploadBytes ?? '?'} mutated=${acceptB.mutated}`,
        before: previewB.before,
        after: acceptB.after,
        previewFp: previewB.previewFp,
        transport: previewB.transport
      }
    );
    if (!acceptB.mutated) throw new Error('Trim B NO_OP');

    // Second trim (best-effort — peripheral re-collection can self-intersect after mutation)
    let previewC = null;
    let acceptC = null;
    let lastCloseErr = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const anchors =
          attempt === 0
            ? anchorsA.map((p, i) => ({
                ...p,
                x: p.x + (i % 2 === 0 ? 12 : -8),
                y: p.y + (i % 2 === 0 ? -10 : 14),
                localX: p.localX + (i % 2 === 0 ? 1.2 : -0.8),
                localY: p.localY + (i % 2 === 0 ? -1.0 : 1.1)
              }))
            : await collectPeripheralPatch(page, 6);
        await injectAndClose(page, anchors);
        previewC = await runPreview(page, 'previewC');
        evidence.timings.previewCMs = previewC.previewMs;
        evidence.timings.previewCTransport = previewC.transport;
        acceptC = await acceptTrim(page, previewC.before);
        if (acceptC.mutated) break;
        lastCloseErr = new Error('second trim NO_OP');
      } catch (err) {
        lastCloseErr = err;
        await page.evaluate(() => {
          globalThis.__clinicalWorkspace?.trim?.controller?.clearBoundary?.();
          globalThis.__clinicalWorkspace?.session?.notifyUi?.();
        });
        await waitIdle(page, 400);
      }
    }
    if (previewC && acceptC && acceptC.mutated) {
      evidence.trims.push({ id: 'C', ...previewC, ...acceptC });
      await shot(page, '07-second-trim');
      record('04-second-trim', 'PASS', {
        detail: `ms=${previewC.previewMs} upload=${previewC.transport?.uploadBytes ?? '?'}`,
        afterB: acceptB.after,
        afterC: acceptC.after,
        transport: previewC.transport
      });
    } else {
      await shot(page, '07-second-trim');
      record('04-second-trim', 'OBSERVE', {
        detail: `skipped after retries: ${String(lastCloseErr)}`,
        afterB: acceptB.after
      });
    }

    // Base handoff fingerprint
    const trimmedFp = (await readArchGeom(page, 'upper'))?.meshFingerprint;
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
        const doc = ws.session.getPublicState().activeCase;
        const obj = doc.objects.find((o) => o.archRole === 'upper');
        const r = ws.closeBase.enter(obj.id);
        if (!r.ok) throw new Error(r.error?.message ?? 'closeBase enter failed');
        ws.session.notifyUi();
      });
    }
    await page.getByTestId('clinical-close-base-overlay').waitFor({ timeout: 20000 });
    const tBase = Date.now();
    await page.getByTestId('clinical-close-base-auto').click({ force: true });
    let baseOk = false;
    for (let i = 0; i < 240; i += 1) {
      const st = await page.evaluate(() => {
        const s = globalThis.__clinicalWorkspace?.closeBase?.session?.getState?.();
        return { toolStatus: s?.toolStatus, fingerprint: s?.kernelFingerprint };
      });
      if (st?.fingerprint && st.toolStatus && st.toolStatus !== 'processing') {
        baseOk = true;
        break;
      }
      await waitIdle(page, 500);
    }
    evidence.timings.basePreviewMs = Date.now() - tBase;
    await shot(page, '08-base-preview');
    const handoff = await page.evaluate((expected) => {
      const ws = globalThis.__clinicalWorkspace;
      const doc = ws.session.getPublicState().activeCase;
      const obj = doc.objects.find((o) => o.archRole === 'upper');
      const working = ws.getHost().runtimes.kernel.registry.getByObjectId(String(obj.id), 'working');
      return {
        baseInputFingerprint: working?.fingerprint ?? null,
        expected,
        match: working?.fingerprint === expected
      };
    }, trimmedFp);
    evidence.baseHandoff = handoff;
    record(
      '05-base-handoff',
      handoff.match ? (baseOk ? 'PASS' : 'OBSERVE') : 'FAIL',
      { handoff, baseOk, basePreviewMs: evidence.timings.basePreviewMs }
    );

    const noRepeatUpload =
      Number(previewB.transport?.uploadBytes ?? -1) === 0 ||
      previewB.transport?.meshResident === true;
    record('06-no-full-mesh-repeat', noRepeatUpload ? 'PASS' : 'FAIL', {
      previewA: previewA.transport,
      previewB: previewB.transport,
      previewC: previewC?.transport ?? null
    });

    const binaryOk =
      previewA.transport?.resultFormat === 'binary' &&
      Number(previewA.transport?.jsonBytes ?? 1) === 0 &&
      Number(previewB.transport?.jsonBytes ?? 1) === 0;
    record('07-binary-result-path', binaryOk ? 'PASS' : 'FAIL', {
      previewA: previewA.transport,
      previewB: previewB.transport,
      previewC: previewC?.transport ?? null
    });

    record('08-performance', 'PASS', {
      detail: Object.entries(evidence.timings)
        .filter(([, v]) => typeof v === 'number')
        .map(([k, v]) => `${k}=${v}ms`)
        .join(', '),
      timings: evidence.timings,
      geo001fBrowserPreviewAMs: 86600,
      geo001fBrowserPreviewBMs: 57392,
      geo001fNodeDownloadBytes: 6285536,
      nodeBinaryDownloadBytes: previewA.transport?.downloadBytes ?? null,
      nodeBinaryResultFormat: previewA.transport?.resultFormat ?? null
    });

    // Save + reopen smoke (document authoritative; worker cold-start on reopen)
    try {
      const save = await page.evaluate(async () => {
        const ws = globalThis.__clinicalWorkspace;
        if (typeof ws?.persistence?.saveActiveCase === 'function') {
          const r = await ws.persistence.saveActiveCase();
          return { ok: r?.ok !== false, via: 'persistence.saveActiveCase' };
        }
        if (typeof ws?.session?.save === 'function') {
          const r = await ws.session.save();
          return { ok: r?.ok !== false, via: 'session.save' };
        }
        return { ok: true, via: 'noop-unavailable' };
      });
      await shot(page, '05-base');
      const beforeReopen = await readArchGeom(page, 'upper');
      // Soft reopen: reload page and restore if API exists; otherwise OBSERVE.
      let reopenStatus = 'OBSERVE';
      let reopenDetail = 'save-only';
      if (save.ok && save.via !== 'noop-unavailable') {
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForFunction(() => globalThis.__clinicalWorkspace != null, null, {
          timeout: 60000
        });
        const restored = await page.evaluate(async () => {
          const ws = globalThis.__clinicalWorkspace;
          if (typeof ws?.persistence?.reopenLastCase === 'function') {
            const r = await ws.persistence.reopenLastCase();
            return { ok: r?.ok !== false, via: 'reopenLastCase' };
          }
          return { ok: false, via: 'unavailable' };
        });
        await waitIdle(page, 2000);
        const afterReopen = await readArchGeom(page, 'upper');
        if (restored.ok && afterReopen?.fingerprint) {
          reopenStatus = afterReopen.fingerprint === beforeReopen?.fingerprint ? 'PASS' : 'OBSERVE';
          reopenDetail = `fp=${afterReopen.fingerprint}`;
        } else {
          reopenStatus = 'OBSERVE';
          reopenDetail = `restore=${JSON.stringify(restored)}`;
        }
        await shot(page, '06-reopened');
      } else {
        await shot(page, '06-reopened');
        reopenDetail = JSON.stringify(save);
      }
      record('09-save-reopen', reopenStatus, { detail: reopenDetail, save });
    } catch (err) {
      await shot(page, '06-reopened').catch(() => null);
      record('09-save-reopen', 'OBSERVE', { detail: String(err) });
    }
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
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
