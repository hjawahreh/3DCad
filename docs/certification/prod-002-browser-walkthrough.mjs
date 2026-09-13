/**
 * PROD-002I / PROD-002J interactive browser certification —
 * Import → Validation → Preprocess → Orientation → Anatomy → Segmentation →
 * Handoff → Trim → Close Base on the segmented clinical case.
 *
 * PROD-002J adds post-seg Trim undo/redo, mesh-local pick / loop3d / clinical
 * direction_source assertions (PROD-001T regression), and orientation preservation.
 *
 * Prerequisites:
 *   - Studio: npm run dev (:1420)
 *   - VTK worker: /tmp/cad-geom-bench/bin/python tools/geometry-backend-bench/vtk_worker_http.py
 *
 * Run:
 *   NODE_PATH=/home/hjawahreh/Desktop/Projects/sharedrop/node_modules \
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
 *     node docs/certification/prod-002-browser-walkthrough.mjs
 *
 * PROD-002J evidence dirs:
 *   CERT_SHOTS_DIR=prod-002j-browser-shots \
 *   CERT_REPORT_JSON=prod-002j-browser-walkthrough.json \
 *     node docs/certification/prod-002-browser-walkthrough.mjs
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
const OUT = path.join(
  ROOT,
  'docs/certification',
  process.env.CERT_SHOTS_DIR || 'prod-002-browser-shots'
);
fs.mkdirSync(OUT, { recursive: true });
const REPORT_JSON = path.join(
  ROOT,
  'docs/certification',
  process.env.CERT_REPORT_JSON || 'prod-002-browser-walkthrough.json'
);

const upperStl = path.join(FIX, 'upper.stl');
const lowerStl = path.join(FIX, 'lower.stl');
const HOST = process.env.CAD_STUDIO_URL || 'http://localhost:1420/';

const results = [];
const note = (name, status, detail = '') => {
  results.push({ name, status, detail });
  console.log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
};

const shot = async (page, name) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
};

const waitIdle = (page, ms = 500) => page.waitForTimeout(ms);

const selectArch = async (page, role) => {
  await page.evaluate((archRole) => {
    const ws = globalThis.__clinicalWorkspace;
    const host = ws?.getHost?.();
    const doc = ws?.session?.getPublicState?.()?.activeCase;
    const obj = doc?.objects?.find((o) => o.archRole === archRole);
    if (!obj) throw new Error(`no ${archRole} arch`);
    host.sessions.selectionSession?.select('replace', [String(obj.id)]);
    ws.session.notifyUi();
  }, role);
  await waitIdle(page, 200);
};

const readArchGeom = async (page, role) =>
  page.evaluate((archRole) => {
    const doc = globalThis.__clinicalWorkspace?.session?.getPublicState?.()?.activeCase;
    const obj = doc?.objects?.find((o) => o.archRole === archRole);
    if (!obj) return null;
    return {
      id: String(obj.id),
      faceCount: obj.faceCount ?? null,
      fingerprint: obj.geometryFingerprint ?? null,
      backend: obj.geometryBackend ?? null,
      segTeeth: obj.segmentationMeta?.instanceCount ?? null,
      segProvider: obj.segmentationMeta?.providerId ?? null,
      dirty: doc.dirty === true
    };
  }, role);

const overlayBox = async (page) => {
  const overlay = page.getByTestId('clinical-trim-overlay');
  await overlay.waitFor({ state: 'visible', timeout: 20000 });
  const box = await overlay.boundingBox();
  if (!box) throw new Error('clinical-trim-overlay has no box');
  return box;
};

const drawSurfaceLoopOnMesh = async (page) => {
  const box = await overlayBox(page);
  const hits = await page.evaluate(({ w, h }) => {
    const ws = globalThis.__clinicalWorkspace;
    const picker = ws?.meshPicker;
    const targetId = ws?.trim?.session?.getState?.()?.targetObjectId;
    if (!picker?.isReady?.()) return { error: 'picker not ready', hits: [] };
    const found = [];
    for (let iy = 0; iy < 16; iy += 1) {
      for (let ix = 0; ix < 16; ix += 1) {
        const x = w * (0.15 + (0.7 * ix) / 15);
        const y = h * (0.15 + (0.7 * iy) / 15);
        const hit = picker.pick({
          screenX: x,
          screenY: y,
          canvasWidth: w,
          canvasHeight: h,
          ...(targetId ? { preferredObjectId: String(targetId) } : {})
        });
        if (
          hit &&
          Number.isFinite(hit.worldX) &&
          (!targetId || String(hit.objectId) === String(targetId))
        ) {
          found.push({
            x,
            y,
            worldX: hit.worldX,
            worldY: hit.worldY,
            worldZ: hit.worldZ,
            localX: hit.localX,
            localY: hit.localY,
            localZ: hit.localZ
          });
        }
      }
    }
    return { error: null, hits: found, count: found.length };
  }, { w: box.width, h: box.height });

  if (!hits.hits?.length || hits.hits.length < 8) {
    throw new Error(`Insufficient surface hits (n=${hits.hits?.length ?? 0})`);
  }

  const pts = hits.hits;
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const halfU = ((maxX - minX) / 2) * 0.42;
  const halfV = ((maxY - minY) / 2) * 0.42;
  const cornerLocals = [
    { x: midX - halfU, y: midY - halfV },
    { x: midX + halfU, y: midY - halfV },
    { x: midX + halfU, y: midY + halfV },
    { x: midX - halfU, y: midY + halfV },
    { x: midX, y: midY - halfV }
  ];

  const sectors = [];
  for (const c of cornerLocals) {
    const snapped = await page.evaluate(
      ({ x, y, w, h }) => {
        const ws = globalThis.__clinicalWorkspace;
        const picker = ws?.meshPicker;
        const targetId = ws?.trim?.session?.getState?.()?.targetObjectId;
        const hit = picker?.pick({
          screenX: x,
          screenY: y,
          canvasWidth: w,
          canvasHeight: h,
          ...(targetId ? { preferredObjectId: String(targetId) } : {})
        });
        if (!hit || !Number.isFinite(hit.worldX)) return null;
        return { x, y, worldX: hit.worldX, worldY: hit.worldY, worldZ: hit.worldZ };
      },
      { x: c.x, y: c.y, w: box.width, h: box.height }
    );
    if (!snapped) continue;
    if (sectors.some((s) => Math.hypot(s.x - snapped.x, s.y - snapped.y) < 3)) continue;
    sectors.push(snapped);
  }
  if (sectors.length < 4) {
    // Fallback: angular sample from all surface hits (post-seg / cold camera).
    const all = [...pts].sort(
      (a, b) => Math.atan2(a.y - midY, a.x - midX) - Math.atan2(b.y - midY, b.x - midX)
    );
    const step = Math.max(1, Math.floor(all.length / 4));
    sectors.length = 0;
    for (let i = 0; i < 4; i += 1) {
      const p = all[Math.min(all.length - 1, i * step)];
      if (p && !sectors.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 3)) {
        sectors.push(p);
      }
    }
  }
  if (sectors.length < 4) throw new Error(`Could not form loop (got ${sectors.length})`);
  sectors.sort(
    (a, b) => Math.atan2(a.y - midY, a.x - midX) - Math.atan2(b.y - midY, b.x - midX)
  );
  for (const p of sectors) {
    await page.mouse.click(box.x + p.x, box.y + p.y);
    await waitIdle(page, 120);
  }
  const withLocal = pts.filter(
    (p) =>
      Number.isFinite(p.localX) && Number.isFinite(p.localY) && Number.isFinite(p.localZ)
  );
  return {
    hitCount: hits.hits.length,
    sectorCount: sectors.length,
    localHitCount: withLocal.length,
    sampleLocal: withLocal[0]
      ? { x: withLocal[0].localX, y: withLocal[0].localY, z: withLocal[0].localZ }
      : null
  };
};

async function createCaseImport(page) {
  const newCase = page.getByTestId('clinical-empty-new-case');
  if (await newCase.count()) await newCase.click();
  else await page.getByRole('button', { name: /New Case/i }).first().click();
  await page.getByTestId('clinical-create-case-dialog').waitFor({ timeout: 15000 });
  await page.getByTestId('clinical-create-first-name').fill('PROD002');
  await page.getByTestId('clinical-create-last-name').fill('BrowserCert');
  await page.getByTestId('clinical-create-case-name').fill('PROD-002 Import-Seg');
  const inputs = page.locator('.clinical-import-dialog__file-input');
  await inputs.nth(0).setInputFiles(upperStl);
  await inputs.nth(1).setInputFiles(lowerStl);
  await page.getByTestId('clinical-create-submit').click();
  await page.getByTestId('clinical-create-case-success').waitFor({ timeout: 180000 });
  await waitIdle(page, 800);
  await page.getByTestId('clinical-create-continue-orient').click();
  await waitIdle(page, 900);
}

async function segmentCurrentArch(page) {
  const st0 = await page.evaluate(() => {
    const st = globalThis.__clinicalWorkspace?.segmentation?.session?.getState?.();
    return {
      active: globalThis.__clinicalWorkspace?.segmentation?.isActive?.() === true,
      presentation: st?.presentation,
      phase: st?.phase,
      teeth: st?.prediction?.instances?.length ?? 0,
      progress: st?.progress,
      target: st?.targetObjectId
    };
  });
  if (st0.presentation === 'review' || st0.teeth > 0) return st0;

  // enter() sets presentation=segmenting before inference — only skip start when
  // we already have progress / preparing+ phases from a live run.
  const alreadyRunning =
    (st0.presentation === 'segmenting' || st0.presentation === 'rebuilding') &&
    (st0.progress !== undefined ||
      st0.phase === 'preparing' ||
      st0.phase === 'inferencing' ||
      st0.phase === 'postprocessing' ||
      st0.phase === 'validating');
  if (!alreadyRunning) {
    if (!st0.active) {
      const entered = await page.evaluate(() => {
        const ws = globalThis.__clinicalWorkspace;
        const host = ws.getHost?.();
        const ids = host?.sessions?.selectionSession?.getSelected?.() ?? [];
        const doc = ws.session.getPublicState().activeCase;
        const sel = doc.objects.find((o) => ids.includes(String(o.id)));
        const fallback = doc.objects.find((o) => o.archRole === 'upper' || o.archRole === 'lower');
        const target = sel ?? fallback;
        const r = ws.segmentation.enter(target?.id);
        ws.session.notifyUi();
        return { ok: r.ok, error: r.ok ? null : r.error?.message };
      });
      if (!entered.ok) throw new Error(entered.error ?? 'seg enter failed');
    }
    // Fire-and-forget — full-arch heuristic can exceed Playwright evaluate timeout.
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const st = ws.segmentation.session.getState();
      const id = st.targetObjectId;
      const reg = ws.getHost().runtimes.kernel.registry;
      const mesh =
        (id ? reg.getByObjectId(String(id), 'working') : undefined) ??
        (id ? reg.getByObjectId(String(id), 'source') : undefined);
      globalThis.__prod002SegDiag = {
        target: id,
        faces: mesh ? Math.floor(mesh.indices.length / 3) : null,
        fp: mesh?.fingerprint ?? null
      };
      globalThis.__prod002SegPromise = ws.segmentation.segmentTeeth().then((r) => ({
        ok: r.ok,
        error: r.ok ? null : r.error?.message,
        presentation: ws.segmentation.session.getState().presentation,
        teeth: ws.segmentation.session.getState().prediction?.instances?.length ?? 0
      }));
    });
    const diag = await page.evaluate(() => globalThis.__prod002SegDiag);
    console.log('  seg start', JSON.stringify(diag));
  }

  // Full-arch heuristic on ~250k faces can take several minutes in headless Chromium.
  for (let i = 0; i < 600; i += 1) {
    const ready = await page.evaluate(() => {
      const st = globalThis.__clinicalWorkspace?.segmentation?.session?.getState?.();
      return {
        presentation: st?.presentation,
        phase: st?.phase,
        teeth: st?.prediction?.instances?.length ?? 0,
        needs: st?.prediction?.confidence?.needsReviewCount ?? 0,
        runtime: st?.runtimeMessage,
        progress: st?.progress,
        error: st?.errorMessage
      };
    });
    if (ready.presentation === 'review' || ready.teeth > 0) return ready;
    if (ready.presentation === 'failed') {
      const settled = await page.evaluate(async () => {
        try {
          return await globalThis.__prod002SegPromise;
        } catch (e) {
          return { ok: false, error: String(e) };
        }
      });
      throw new Error(`segment failed: ${ready.runtime || ready.error || JSON.stringify(settled)}`);
    }
    if (i > 0 && i % 30 === 0) {
      console.log(
        `  …seg wait ${i}s presentation=${ready.presentation} phase=${ready.phase} progress=${JSON.stringify(ready.progress)}`
      );
    }
    await waitIdle(page, 1000);
  }
  const settled = await page.evaluate(async () => {
    try {
      return await globalThis.__prod002SegPromise;
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });
  throw new Error(`segmentation timed out; settled=${JSON.stringify(settled)}`);
}

async function acceptSegmentation(page) {
  const ack = page.getByTestId('clinical-segmentation-acknowledge-review');
  if ((await ack.count()) && (await ack.isEnabled())) {
    await ack.click({ force: true });
    await waitIdle(page, 300);
  }
  // Overlay acknowledge button may exist without test id on primary ack
  const overlayAck = page.getByRole('button', { name: /Acknowledge/i }).first();
  if ((await overlayAck.count()) && (await overlayAck.isVisible())) {
    await overlayAck.click({ force: true }).catch(() => {});
    await waitIdle(page, 200);
  }
  await page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    const needs =
      ws.segmentation.session.getState().prediction?.confidence?.needsReviewCount ?? 0;
    if (needs > 0) ws.segmentation.acknowledgeReview();
  });
  await waitIdle(page, 200);
  const accept = page.getByTestId('clinical-segmentation-accept');
  if (await accept.isEnabled()) {
    await accept.click({ force: true });
  } else {
    const result = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const r = await ws.segmentation.accept();
      ws.session.notifyUi();
      return { ok: r.ok, error: r.ok ? null : r.error?.message };
    });
    if (!result.ok) throw new Error(result.error ?? 'accept failed');
  }
  await waitIdle(page, 800);
}

async function run() {
  const chromePath =
    process.env.PLAYWRIGHT_CHROME_PATH ||
    `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(90000);

  const consoleErrors = [];
  const vtkCalls = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  await page.route('**/v1/geometry', async (route) => {
    let parsed = null;
    try {
      parsed = JSON.parse(route.request().postData() || '{}');
    } catch {
      parsed = null;
    }
    const response = await route.fetch();
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    vtkCalls.push({
      cmd: parsed?.cmd ?? body?.cmd,
      ok: body?.ok,
      phase: 'response',
      removed: body?.removed_triangles_est,
      direction_source: body?.direction_source ?? parsed?.direction_source,
      // Wire format uses `loop` (mapped from clinical loop3d in VtkHttpWorkerBackend).
      hasLoop:
        (Array.isArray(parsed?.loop) && parsed.loop.length >= 3) ||
        (Array.isArray(parsed?.loop3d) && parsed.loop3d.length >= 3),
      loopLen: Array.isArray(parsed?.loop)
        ? parsed.loop.length
        : Array.isArray(parsed?.loop3d)
          ? parsed.loop3d.length
          : 0,
      sampleLoopPoint: Array.isArray(parsed?.loop)
        ? parsed.loop[0]
        : Array.isArray(parsed?.loop3d)
          ? parsed.loop3d[0]
          : null,
      operation_version: parsed?.operation_version ?? body?.operation_version,
      keep_mode: parsed?.keep_mode,
      hasNormal: Array.isArray(parsed?.normal) && parsed.normal.length === 3
    });
    await route.fulfill({ response });
  });

  await page.goto(`${HOST}?prod002=${Date.now()}`, { waitUntil: 'networkidle' });
  await shot(page, '00-boot');
  note('Shell boot', 'PASS');

  let vtkLog = false;
  for (let i = 0; i < 20; i += 1) {
    vtkLog = await page.evaluate(() => true);
    // composition logs asynchronously — wait briefly
    await waitIdle(page, 400);
    const msgs = [];
    // rely on health probe via evaluate hybrid if exposed; also check worker
    break;
  }
  const health = await page.evaluate(async () => {
    try {
      const r = await fetch('http://127.0.0.1:8765/health');
      return await r.json();
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });
  note('Worker health', health?.ok ? 'PASS' : 'FAIL', JSON.stringify(health));
  void vtkLog;

  // --- Import ---
  try {
    await createCaseImport(page);
    await shot(page, '01-import-dual');
    const objs = await page.evaluate(() => {
      const doc = globalThis.__clinicalWorkspace?.session?.getPublicState?.()?.activeCase;
      return (doc?.objects ?? []).map((o) => ({
        role: o.archRole,
        faces: o.faceCount,
        name: o.displayName
      }));
    });
    const ok =
      objs.some((o) => o.role === 'upper' && (o.faces ?? 0) > 1000) &&
      objs.some((o) => o.role === 'lower' && (o.faces ?? 0) > 1000);
    note('Import representative meshes', ok ? 'PASS' : 'FAIL', JSON.stringify(objs));
  } catch (e) {
    note('Import representative meshes', 'FAIL', String(e));
    await shot(page, '01-import-fail');
    await browser.close();
    dump(results, consoleErrors, vtkCalls);
    process.exit(1);
  }

  // --- Case validation ---
  try {
    const report = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const doc = ws.session.getPublicState().activeCase;
      const { validateClinicalCase } = await import(
        '/src/clinical/case/ClinicalCaseValidation.ts'
      );
      const meshes = new Map();
      const registry = ws.getHost().runtimes.kernel.registry;
      for (const obj of doc.objects) {
        const mesh =
          registry.getByObjectId(String(obj.id), 'working') ??
          registry.getByObjectId(String(obj.id), 'source');
        if (mesh) meshes.set(String(obj.id), mesh);
      }
      return validateClinicalCase({ document: doc, meshes, requireDualArch: true });
    });
    note(
      'Case validation surfaced',
      report.verdict === 'FAIL' ? 'FAIL' : 'PASS',
      `verdict=${report.verdict} findings=${report.findings.length} errors=${report.findings.filter((f) => f.severity === 'ERROR').length}`
    );
    await shot(page, '02-case-validation');
  } catch (e) {
    note('Case validation surfaced', 'FAIL', String(e));
  }

  // --- Orient ---
  try {
    const acceptOrient = page.getByTestId('clinical-orientation-accept');
    if (await acceptOrient.count()) await acceptOrient.click();
    else
      await page.getByRole('button', { name: /Accept Orientation|Review & Accept/i }).first().click();
    await waitIdle(page, 1200);
    const orient = await page.evaluate(() => {
      const meta = globalThis.__clinicalWorkspace?.session?.getPublicState?.()?.activeCase
        ?.orientationMeta;
      return {
        accepted: meta?.acceptedAt !== undefined,
        confidence: meta?.confidence,
        source: meta?.source,
        algorithm: meta?.algorithmVersion
      };
    });
    note(
      'Clinical orientation',
      orient.accepted ? 'PASS' : 'FAIL',
      JSON.stringify(orient)
    );
    await shot(page, '03-orient-accepted');
  } catch (e) {
    note('Clinical orientation', 'FAIL', String(e));
  }

  // --- Preprocessing (Prepare) ---
  try {
    const prepareCase = page.getByRole('button', { name: 'Prepare Case', exact: true }).first();
    if (await prepareCase.count()) {
      await prepareCase.click();
      await waitIdle(page, 2000);
    } else {
      await page.evaluate(async () => {
        await globalThis.__clinicalWorkspace.session
          .getHost()
          .commands.invoke('clinical.preparation.start');
        globalThis.__clinicalWorkspace.session.notifyUi();
      });
      await waitIdle(page, 2000);
    }
    const prep = await page.evaluate(() => {
      const meta = globalThis.__clinicalWorkspace?.session?.getPublicState?.()?.activeCase
        ?.preparationMeta;
      const ready = globalThis.__clinicalWorkspace?.preparation?.isReadyForGeometry?.();
      return {
        ready: ready === true,
        algorithm: meta?.algorithmVersion,
        fingerprint: meta?.sourceFingerprint,
        warnings: meta?.warningCount,
        uiState: meta?.uiState
      };
    });
    note(
      'Preprocessing',
      prep.ready || prep.algorithm ? 'PASS' : 'FAIL',
      JSON.stringify(prep)
    );
    await shot(page, '04-preprocessing');
  } catch (e) {
    note('Preprocessing', 'FAIL', String(e));
  }

  // --- Arch / anatomy analysis ---
  try {
    const anatomy = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const doc = ws.session.getPublicState().activeCase;
      const upper = doc.objects.find((o) => o.archRole === 'upper');
      const { analyzeClinicalArchAnatomy } = await import(
        '/src/clinical/anatomy/ClinicalArchAnatomyAnalysis.ts'
      );
      const registry = ws.getHost().runtimes.kernel.registry;
      const mesh =
        registry.getByObjectId(String(upper.id), 'working') ??
        registry.getByObjectId(String(upper.id), 'source');
      return analyzeClinicalArchAnatomy({
        objectId: String(upper.id),
        archRole: 'upper',
        mesh
      });
    });
    note(
      'Arch/anatomy analysis',
      anatomy.archRegion?.archRole === 'upper' && anatomy.frame?.confidence !== 'unavailable'
        ? 'PASS'
        : 'FAIL',
      `region=${anatomy.archRegion?.archRole}/${anatomy.archRegion?.confidence} frame=${anatomy.frame?.confidence} candidates=${anatomy.toothRegionCandidates?.length}`
    );
    await shot(page, '05-anatomy-analysis');
  } catch (e) {
    note('Arch/anatomy analysis', 'FAIL', String(e));
  }

  // --- Trim (required before Close Base / Segment in real workflow) ---
  const preTrim = await readArchGeom(page, 'upper');
  try {
    await selectArch(page, 'upper');
    const continueTrim = page.getByRole('button', { name: 'Continue to Trim', exact: true }).first();
    if ((await continueTrim.count()) && (await continueTrim.isEnabled())) {
      await continueTrim.click();
    } else {
      await page.evaluate(async () => {
        await globalThis.__clinicalWorkspace.session
          .getHost()
          .commands.invoke('clinical.tool.trim');
        globalThis.__clinicalWorkspace.session.notifyUi();
      });
    }
    await waitIdle(page, 1000);
    await page.getByTestId('clinical-trim-polyline').click();
    await drawSurfaceLoopOnMesh(page);
    await page.getByTestId('clinical-trim-close').click();
    await page.getByTestId('clinical-trim-validate').click();
    await waitIdle(page, 300);
    const acceptResult = await page.evaluate(async () => {
      const r = await globalThis.__clinicalWorkspace.trim.accept();
      globalThis.__clinicalWorkspace.session.notifyUi();
      return { ok: r.ok, error: r.ok ? null : r.error?.message };
    });
    await waitIdle(page, 2000);
    const post = await readArchGeom(page, 'upper');
    const vtkTrim = vtkCalls.filter((c) => c.cmd === 'trim' && c.ok === true);
    note(
      'Trim on clinical path (pre-seg)',
      acceptResult.ok && post?.faceCount !== preTrim?.faceCount ? 'PASS' : 'FAIL',
      `accept=${JSON.stringify(acceptResult)} vtkOk=${vtkTrim.length} pre=${preTrim?.faceCount} post=${post?.faceCount}`
    );
    await shot(page, '06-trim-committed');
  } catch (e) {
    note('Trim on clinical path (pre-seg)', 'FAIL', String(e));
    await shot(page, '06-trim-fail');
  }

  // --- Close Base ---
  const preClose = await readArchGeom(page, 'upper');
  try {
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      if (ws?.trim?.isActive?.()) ws.trim.cancel();
      ws?.session?.notifyUi?.();
    });
    await waitIdle(page, 300);
    const continueClose = page.getByRole('button', { name: /Continue to Close Base/i }).first();
    if ((await continueClose.count()) && (await continueClose.isEnabled())) {
      await continueClose.click({ force: true });
    } else {
      await page.evaluate(() => {
        const ws = globalThis.__clinicalWorkspace;
        const obj = ws.session.getPublicState().activeCase.objects.find((o) => o.archRole === 'upper');
        const r = ws.closeBase.enter(obj.id);
        if (!r.ok) throw new Error(r.error?.message ?? 'closeBase enter failed');
        ws.session.notifyUi();
      });
    }
    await waitIdle(page, 800);
    await page.getByTestId('clinical-close-base-overlay').waitFor({ timeout: 15000 });
    await page.getByTestId('clinical-close-base-auto').click({ force: true });
    // Wait for Auto Close Base preview to settle (VTK HTTP can take >30s on full arch).
    const vtkCloseBefore = vtkCalls.filter((c) => c.cmd === 'close_base').length;
    for (let i = 0; i < 120; i += 1) {
      const st = await page.evaluate(() => {
        const s = globalThis.__clinicalWorkspace?.closeBase?.session?.getState?.();
        return {
          toolStatus: s?.toolStatus,
          statusMessage: s?.statusMessage,
          fingerprint: s?.kernelFingerprint
        };
      });
      const responses = vtkCalls.filter((c) => c.cmd === 'close_base').length;
      if (
        st?.toolStatus &&
        st.toolStatus !== 'processing' &&
        (responses > vtkCloseBefore || st.fingerprint || i > 8)
      ) {
        break;
      }
      await waitIdle(page, 500);
    }
    const closeAccept = await page.evaluate(async () => {
      const r = await globalThis.__clinicalWorkspace.closeBase.accept();
      globalThis.__clinicalWorkspace.session.notifyUi();
      return { ok: r.ok, error: r.ok ? null : r.error?.message };
    });
    await waitIdle(page, 1500);
    for (let i = 0; i < 60; i += 1) {
      const g = await readArchGeom(page, 'upper');
      if (
        g &&
        preClose &&
        (g.fingerprint !== preClose.fingerprint || g.faceCount !== preClose.faceCount)
      ) {
        break;
      }
      await waitIdle(page, 500);
    }
    const postClose = await readArchGeom(page, 'upper');
    const vtkClose = vtkCalls.filter((c) => c.cmd === 'close_base');
    const prepStage = await page.evaluate(
      () =>
        globalThis.__clinicalWorkspace?.preparation?.session?.getState?.()?.currentStage ?? null
    );
    note(
      'Close Base on clinical path (pre-seg)',
      closeAccept.ok && postClose?.faceCount !== preClose?.faceCount ? 'PASS' : 'FAIL',
      `accept=${JSON.stringify(closeAccept)} vtk=${vtkClose.length} clinical=${vtkClose.some((c) => String(c.direction_source || '').startsWith('clinical:'))} prepStage=${prepStage} pre=${preClose?.faceCount} post=${postClose?.faceCount}`
    );
    await shot(page, '07-close-base');
  } catch (e) {
    note('Close Base on clinical path (pre-seg)', 'FAIL', String(e));
    await shot(page, '07-close-base-fail');
  }

  // --- Segmentation upper ---
  try {
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      if (ws?.closeBase?.isActive?.()) ws.closeBase.cancel();
      ws?.session?.notifyUi?.();
    });
    await waitIdle(page, 300);
    await selectArch(page, 'upper');
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      if (!ws.segmentation.isActive()) {
        const obj = ws.session.getPublicState().activeCase.objects.find((o) => o.archRole === 'upper');
        const r = ws.segmentation.enter(obj?.id);
        if (!r.ok) throw new Error(r.error?.message ?? 'seg enter failed');
        ws.session.notifyUi();
      }
    });
    await waitIdle(page, 400);
    const seg = await segmentCurrentArch(page);
    await shot(page, '08-segmentation-review');
    note(
      'Tooth segmentation (real instances)',
      seg.teeth > 0 ? 'PASS' : 'FAIL',
      JSON.stringify(seg)
    );

    // Structured validation
    const validation = await page.evaluate(async () => {
      const pred = globalThis.__clinicalWorkspace.segmentation.session.getState().prediction;
      const { validateSegmentationPrediction } = await import(
        '/src/clinical/segmentation/ClinicalSegmentationValidation.ts'
      );
      return validateSegmentationPrediction(pred);
    });
    note(
      'Segmentation validation',
      validation.verdict === 'FAIL' ? 'FAIL' : 'PASS',
      `verdict=${validation.verdict} teeth=${validation.toothCount} needsReview=${validation.needsReviewCount}`
    );
    await shot(page, '09-segmentation-validation');

    await acceptSegmentation(page);
    const upperMeta = await readArchGeom(page, 'upper');
    note(
      'Accept upper segmentation',
      upperMeta?.segTeeth > 0 ? 'PASS' : 'FAIL',
      JSON.stringify(upperMeta)
    );

    // PROD-002I: tooth IDs + confidence/validation state on accepted meta
    const toothIds = await page.evaluate(() => {
      const doc = globalThis.__clinicalWorkspace.session.getPublicState().activeCase;
      const upper = doc.objects.find((o) => o.archRole === 'upper');
      const teeth = upper?.segmentationMeta?.teeth ?? [];
      return {
        count: teeth.length,
        ids: teeth.map((t) => t.instanceId),
        unique: new Set(teeth.map((t) => t.instanceId)).size,
        confidences: teeth.slice(0, 5).map((t) => t.confidence),
        verdict: upper?.segmentationMeta?.validationVerdict,
        caseBand: upper?.segmentationMeta?.caseBand,
        hasCentroid: teeth.every((t) => Array.isArray(t.centroid)),
        hasFrame: teeth.every((t) => t.localFrame !== undefined)
      };
    });
    note(
      'Tooth IDs + confidence state',
      toothIds.count > 0 &&
        toothIds.unique === toothIds.count &&
        toothIds.ids.every((id) => /^inst-\d{3}$/.test(id) || /^merged-/.test(id))
        ? 'PASS'
        : 'FAIL',
      JSON.stringify(toothIds)
    );
  } catch (e) {
    note('Tooth segmentation (real instances)', 'FAIL', String(e));
    await shot(page, '08-seg-fail');
  }

  // --- Segmentation lower ---
  try {
    await selectArch(page, 'lower');
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const obj = ws.session.getPublicState().activeCase.objects.find((o) => o.archRole === 'lower');
      if (ws.segmentation.isActive()) {
        const switched = ws.segmentation.setActiveArch?.('lower');
        if (switched && !switched.ok) {
          ws.segmentation.cancel();
          const r = ws.segmentation.enter(obj.id);
          if (!r.ok) throw new Error(r.error?.message ?? 'lower enter failed');
        }
      } else {
        const r = ws.segmentation.enter(obj.id);
        if (!r.ok) throw new Error(r.error?.message ?? 'lower enter failed');
      }
      ws.session.notifyUi();
    });
    await waitIdle(page, 600);
    const segL = await segmentCurrentArch(page);
    await acceptSegmentation(page);
    const lowerMeta = await readArchGeom(page, 'lower');
    note(
      'Accept lower segmentation',
      segL.teeth > 0 && lowerMeta?.segTeeth > 0 ? 'PASS' : 'FAIL',
      `seg=${JSON.stringify(segL)} meta=${JSON.stringify(lowerMeta)}`
    );
    await shot(page, '10-dual-arch-segmented');
  } catch (e) {
    note('Accept lower segmentation', 'FAIL', String(e));
  }

  // --- Post-seg Trim regression (before save/reopen — warm viewport) ---
  try {
    // Lower is segmented but still open (no Close Base) — same class of mesh as PROD-001T trim.
    await selectArch(page, 'lower');
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      if (ws.segmentation?.isActive?.()) ws.segmentation.cancel();
      if (ws.closeBase?.isActive?.()) ws.closeBase.cancel();
      const obj = ws.session.getPublicState().activeCase.objects.find((o) => o.archRole === 'lower');
      ws.viewport?.showAll?.();
      ws.session.notifyUi();
      const entered = ws.trim.enter(obj.id);
      if (!entered.ok) throw new Error(entered.error?.message ?? 'trim enter failed');
      ws.viewport?.isolate?.(obj.id);
      ws.viewport?.fitAll?.();
      ws.viewport?.presentClinicalAnteriorView?.();
      ws.session.notifyUi();
    });
    await waitIdle(page, 1500);
    await page.getByTestId('clinical-trim-overlay').waitFor({ timeout: 15000 });
    note(
      'Trim accepts segmented geometry',
      'PASS',
      'trim.enter + overlay visible on post-seg lower arch'
    );
    const pre = await readArchGeom(page, 'lower');
    await page.getByTestId('clinical-trim-polyline').click();
    let loopInfo;
    try {
      loopInfo = await drawSurfaceLoopOnMesh(page);
    } catch (firstErr) {
      // Retry with fit + denser wait — headless post-seg camera can be cold.
      await page.evaluate(() => {
        const ws = globalThis.__clinicalWorkspace;
        ws.viewport?.fitAll?.();
        ws.viewport?.presentClinicalAnteriorView?.();
        ws.session.notifyUi();
      });
      await waitIdle(page, 1200);
      try {
        loopInfo = await drawSurfaceLoopOnMesh(page);
      } catch (secondErr) {
        throw new Error(
          `loop failed after retry: first=${String(firstErr)}; second=${String(secondErr)}`
        );
      }
    }
    await page.getByTestId('clinical-trim-close').click();
    await page.getByTestId('clinical-trim-validate').click();
    await waitIdle(page, 400);
    const previewStats = await page.getByTestId('clinical-trim-stats').innerText().catch(() => '');
    const overlayVisible = await page
      .getByTestId('clinical-trim-overlay')
      .isVisible()
      .catch(() => false);
    note(
      'Trim preview after segmentation',
      overlayVisible && /Valid/i.test(previewStats) && !/crosses itself/i.test(previewStats)
        ? 'PASS'
        : 'FAIL',
      `overlay=${overlayVisible} stats=${previewStats}`
    );
    await shot(page, '13b-trim-preview-after-seg');
    const trim2 = await page.evaluate(async () => {
      const r = await globalThis.__clinicalWorkspace.trim.accept();
      globalThis.__clinicalWorkspace.session.notifyUi();
      return { ok: r.ok, error: r.ok ? null : r.error?.message };
    });
    await waitIdle(page, 2500);
    for (let i = 0; i < 40; i += 1) {
      const g = await readArchGeom(page, 'lower');
      if (g && pre && (g.faceCount !== pre.faceCount || g.fingerprint !== pre.fingerprint)) break;
      await waitIdle(page, 500);
    }
    const post = await readArchGeom(page, 'lower');
    const vtkTrimPosts = vtkCalls.filter((c) => c.cmd === 'trim');
    const vtkOk = vtkTrimPosts.filter((c) => c.ok === true).length >= 2;
    const lastTrimReq = [...vtkTrimPosts].reverse().find((c) => c.hasLoop === true) ??
      vtkTrimPosts[vtkTrimPosts.length - 1];
    note(
      'Trim after segmentation (PROD-001T regression)',
      trim2.ok && post?.faceCount !== pre?.faceCount && vtkOk ? 'PASS' : 'FAIL',
      `accept=${JSON.stringify(trim2)} pre=${pre?.faceCount} post=${post?.faceCount} vtkTrimOkCalls=${vtkTrimPosts.filter((c) => c.ok).length} loopHits=${loopInfo?.hitCount ?? '?'}`
    );
    await shot(page, '13-trim-after-seg');

    // PROD-002J — clinical loop3d → VTK `loop` wire + mesh-local picks (PROD-001T)
    const loopPt = lastTrimReq?.sampleLoopPoint;
    const loopNearLocal =
      Array.isArray(loopPt) &&
      loopInfo?.sampleLocal &&
      Math.hypot(
        loopPt[0] - loopInfo.sampleLocal.x,
        loopPt[1] - loopInfo.sampleLocal.y,
        loopPt[2] - loopInfo.sampleLocal.z
      ) < 80;
    note(
      'PROD-001T loop3d + VTK HTTP on segmented case',
      lastTrimReq?.hasLoop === true &&
        lastTrimReq?.ok === true &&
        lastTrimReq?.operation_version === 'PROD-001T' &&
        lastTrimReq?.hasNormal === true &&
        (loopNearLocal || (lastTrimReq?.loopLen ?? 0) >= 3)
        ? 'PASS'
        : 'FAIL',
      JSON.stringify({
        hasLoop: lastTrimReq?.hasLoop,
        loopLen: lastTrimReq?.loopLen,
        operation_version: lastTrimReq?.operation_version,
        keep_mode: lastTrimReq?.keep_mode,
        sampleLoopPoint: loopPt,
        localHitCount: loopInfo?.localHitCount,
        sampleLocal: loopInfo?.sampleLocal,
        loopNearLocal
      })
    );
    note(
      'Mesh-local pick coordinates present',
      (loopInfo?.localHitCount ?? 0) >= 4 && loopInfo?.sampleLocal !== null ? 'PASS' : 'FAIL',
      JSON.stringify({
        localHitCount: loopInfo?.localHitCount,
        sampleLocal: loopInfo?.sampleLocal
      })
    );

    // PROD-002J — undo / redo on post-seg trim
    const orientBeforeUndo = await page.evaluate(() => {
      const meta = globalThis.__clinicalWorkspace?.session?.getPublicState?.()?.activeCase
        ?.orientationMeta;
      return {
        acceptedAt: meta?.acceptedAt,
        confidence: meta?.confidence,
        algorithm: meta?.algorithmVersion
      };
    });
    const undoBtn = page.getByTestId('clinical-trim-doc-undo');
    await undoBtn.waitFor({ state: 'visible', timeout: 10000 });
    if (!(await undoBtn.isEnabled())) {
      note('Trim undo after segmentation', 'FAIL', 'doc undo disabled');
    } else {
      await undoBtn.click();
      await waitIdle(page, 1200);
      await shot(page, '15-trim-undo-after-seg');
      const undone = await readArchGeom(page, 'lower');
      const restored =
        undone &&
        pre &&
        (undone.fingerprint === pre.fingerprint || undone.faceCount === pre.faceCount);
      note(
        'Trim undo after segmentation',
        restored ? 'PASS' : 'FAIL',
        `pre=${JSON.stringify(pre)} undone=${JSON.stringify(undone)}`
      );
      const redoBtn = page.getByTestId('clinical-trim-doc-redo');
      if (!(await redoBtn.isEnabled())) {
        note('Trim redo after segmentation', 'FAIL', 'doc redo disabled');
      } else {
        await redoBtn.click();
        await waitIdle(page, 1200);
        await shot(page, '16-trim-redo-after-seg');
        const redone = await readArchGeom(page, 'lower');
        const matched =
          redone &&
          post &&
          (redone.fingerprint === post.fingerprint || redone.faceCount === post.faceCount);
        note(
          'Trim redo after segmentation',
          matched ? 'PASS' : 'FAIL',
          `post=${JSON.stringify(post)} redone=${JSON.stringify(redone)}`
        );
      }
    }
    const orientAfter = await page.evaluate(() => {
      const meta = globalThis.__clinicalWorkspace?.session?.getPublicState?.()?.activeCase
        ?.orientationMeta;
      return {
        acceptedAt: meta?.acceptedAt,
        confidence: meta?.confidence,
        algorithm: meta?.algorithmVersion
      };
    });
    note(
      'Clinical orientation preserved through Trim undo/redo',
      orientBeforeUndo?.acceptedAt !== undefined &&
        orientAfter?.acceptedAt === orientBeforeUndo.acceptedAt &&
        orientAfter?.algorithm === orientBeforeUndo.algorithm
        ? 'PASS'
        : 'FAIL',
      JSON.stringify({ before: orientBeforeUndo, after: orientAfter })
    );
  } catch (e) {
    note('Trim after segmentation (PROD-001T regression)', 'FAIL', String(e));
    await shot(page, '13-trim-after-seg-fail');
  }

  // --- Post-seg Close Base regression ---
  try {
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      if (ws.trim?.isActive?.()) ws.trim.cancel();
      const obj = ws.session.getPublicState().activeCase.objects.find((o) => o.archRole === 'upper');
      const r = ws.closeBase.enter(obj.id);
      if (!r.ok) throw new Error(r.error?.message ?? 'closeBase enter failed');
      ws.session.notifyUi();
    });
    await waitIdle(page, 800);
    await page.getByTestId('clinical-close-base-overlay').waitFor({ timeout: 15000 });
    const pre = await readArchGeom(page, 'upper');
    const vtkCloseBefore = vtkCalls.filter((c) => c.cmd === 'close_base').length;
    await page.getByTestId('clinical-close-base-auto').click({ force: true });
    for (let i = 0; i < 120; i += 1) {
      const st = await page.evaluate(() => {
        const s = globalThis.__clinicalWorkspace?.closeBase?.session?.getState?.();
        return { toolStatus: s?.toolStatus, fingerprint: s?.kernelFingerprint };
      });
      const responses = vtkCalls.filter((c) => c.cmd === 'close_base').length;
      if (
        st?.toolStatus &&
        st.toolStatus !== 'processing' &&
        (responses > vtkCloseBefore || st.fingerprint || i > 8)
      ) {
        break;
      }
      await waitIdle(page, 500);
    }
    const close2 = await page.evaluate(async () => {
      const r = await globalThis.__clinicalWorkspace.closeBase.accept();
      globalThis.__clinicalWorkspace.session.notifyUi();
      return { ok: r.ok, error: r.ok ? null : r.error?.message };
    });
    await waitIdle(page, 1500);
    for (let i = 0; i < 60; i += 1) {
      const g = await readArchGeom(page, 'upper');
      if (
        g &&
        pre &&
        (g.fingerprint !== pre.fingerprint || g.faceCount !== pre.faceCount)
      ) {
        break;
      }
      await waitIdle(page, 500);
    }
    const post = await readArchGeom(page, 'upper');
    const vtkClose = vtkCalls.filter((c) => c.cmd === 'close_base');
    const clinicalDir = vtkClose.some(
      (c) => typeof c.direction_source === 'string' && String(c.direction_source).startsWith('clinical:')
    );
    note(
      'Close Base after segmentation (PROD-001T regression)',
      close2.ok && post?.faceCount !== pre?.faceCount ? 'PASS' : 'FAIL',
      `accept=${JSON.stringify(close2)} pre=${pre?.faceCount} post=${post?.faceCount}`
    );
    note(
      'Close Base clinical direction_source after segmentation',
      clinicalDir && vtkClose.some((c) => c.ok === true) ? 'PASS' : 'FAIL',
      JSON.stringify(
        vtkClose.map((c) => ({
          ok: c.ok,
          direction_source: c.direction_source,
          operation_version: c.operation_version
        }))
      )
    );
    await shot(page, '14-close-base-after-seg');
  } catch (e) {
    note('Close Base after segmentation (PROD-001T regression)', 'FAIL', String(e));
    await shot(page, '14-close-base-after-seg-fail');
  }

  // --- Handoff snapshot ---
  try {
    const handoff = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const doc = ws.session.getPublicState().activeCase;
      const { buildClinicalHandoffSnapshot } = await import(
        '/src/clinical/handoff/ClinicalHandoffSnapshot.ts'
      );
      return buildClinicalHandoffSnapshot({ document: doc });
    });
    note(
      'ClinicalHandoffSnapshot',
      handoff.version === 'clinical-handoff-v2' &&
        handoff.arches?.length >= 2 &&
        handoff.orientation?.accepted &&
        (handoff.intendedConsumers || []).includes('trim') &&
        (handoff.intendedConsumers || []).includes('close-base') &&
        !JSON.stringify(handoff).includes('geometryBackend') &&
        !/vtk-http-worker|vtk-native-worker/i.test(JSON.stringify(handoff))
        ? 'PASS'
        : 'FAIL',
      `version=${handoff.version} readyForMovement=${handoff.readyForMovement} consumers=${(handoff.intendedConsumers || []).join(',')} arches=${handoff.arches?.map((a) => `${a.archRole}:${a.toothCount}`).join(',')}`
    );
    await shot(page, '11-handoff');
  } catch (e) {
    note('ClinicalHandoffSnapshot', 'FAIL', String(e));
  }

  // --- Save / reopen ---
  let caseId;
  let fpBefore;
  try {
    caseId = await page.evaluate(
      () => globalThis.__clinicalWorkspace?.session?.getPublicState?.()?.activeCase?.caseId
    );
    fpBefore = await page.evaluate(() => {
      const doc = globalThis.__clinicalWorkspace.session.getPublicState().activeCase;
      return doc.objects.map((o) => ({
        role: o.archRole,
        fp: o.geometryFingerprint,
        seg: o.segmentationMeta?.instanceCount,
        provider: o.segmentationMeta?.providerId
      }));
    });
    await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      if (ws.trim?.isActive?.()) ws.trim.cancel();
      if (ws.closeBase?.isActive?.()) ws.closeBase.cancel();
      if (ws.segmentation?.isActive?.()) ws.segmentation.cancel();
      const saved = await ws.cases.saveActiveCase(ws);
      if (!saved.ok) throw new Error(saved.error?.message ?? 'save failed');
      await ws.session.getHost().commands.invoke('clinical.case.close');
      ws.session.notifyUi();
    });
    await waitIdle(page, 800);
    await page.evaluate(async (id) => {
      const ws = globalThis.__clinicalWorkspace;
      const r = await ws.cases.openCase(ws, id);
      if (!r.ok) throw new Error(r.error?.message ?? 'open failed');
      ws.session.notifyUi();
    }, caseId);
    await waitIdle(page, 1500);
    const after = await page.evaluate(() => {
      const doc = globalThis.__clinicalWorkspace.session.getPublicState().activeCase;
      const handoff = globalThis.__clinicalWorkspace.cases.getLastHandoff?.();
      return {
        objects: doc?.objects?.map((o) => ({
          role: o.archRole,
          fp: o.geometryFingerprint,
          seg: o.segmentationMeta?.instanceCount,
          provider: o.segmentationMeta?.providerId,
          toothIds: (o.segmentationMeta?.teeth ?? []).slice(0, 3).map((t) => t.instanceId),
          verdict: o.segmentationMeta?.validationVerdict
        })),
        handoffVersion: handoff?.version,
        readyForMovement: handoff?.readyForMovement
      };
    });
    const persisted =
      after?.objects &&
      fpBefore &&
      after.objects.length === fpBefore.length &&
      after.objects.every((a, i) => a.seg === fpBefore[i].seg && a.fp === fpBefore[i].fp);
    note(
      'Save/reopen',
      persisted && after.handoffVersion === 'clinical-handoff-v2' ? 'PASS' : 'FAIL',
      JSON.stringify({ before: fpBefore, after })
    );
    await shot(page, '12-reopened');
  } catch (e) {
    note('Save/reopen', 'FAIL', String(e));
    await shot(page, '12-reopen-fail');
  }

  const shots = fs.readdirSync(OUT).filter((f) => f.endsWith('.png'));
  note(
    'Evidence screenshots',
    shots.length >= 10 ? 'PASS' : 'FAIL',
    `${shots.length}: ${shots.sort().join(', ')}`
  );

  const serious = consoleErrors.filter(
    (t) => !/favicon|DevTools|ResizeObserver/i.test(t)
  );
  note('Console errors', serious.length === 0 ? 'PASS' : 'OBSERVE', String(serious.length));

  await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
  await browser.close();
  dump(results, consoleErrors, vtkCalls);
}

function dump(results, consoleErrors, vtkCalls) {
  const fails = results.filter((r) => r.status === 'FAIL');
  const report = {
    at: new Date().toISOString(),
    host: HOST,
    fixtures: [
      'apps/studio/public/clinical-fixtures/upper.stl',
      'apps/studio/public/clinical-fixtures/lower.stl'
    ],
    results,
    vtkCalls,
    consoleErrors,
    summary: {
      total: results.length,
      fail: fails.length,
      pass: results.filter((r) => r.status === 'PASS').length,
      observe: results.filter((r) => r.status === 'OBSERVE').length
    }
  };
  const out = REPORT_JSON;
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('\nWrote', out);
  console.log('Shots dir', OUT);
  console.log(
    `Summary: ${report.summary.pass} PASS / ${report.summary.observe} OBSERVE / ${report.summary.fail} FAIL (${report.summary.total} checks)`
  );
  if (fails.length) process.exitCode = 1;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
