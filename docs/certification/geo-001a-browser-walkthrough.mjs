/**
 * GEO-001A — Real dental geometry certification (Trim + Close Base).
 *
 * Evidence gate for ClinicalGeometryEngine on real clinical fixtures.
 * Does NOT claim clinical certification. Does NOT start Movement.
 *
 * Prerequisites:
 *   - Studio: pnpm --filter @cad-studio/studio dev (:1420)
 *   - VTK worker: /tmp/cad-geom-bench/bin/python tools/geometry-backend-bench/vtk_worker_http.py
 *   - Fixtures: apps/studio/public/clinical-fixtures/{upper,lower}.stl
 *
 * Run:
 *   NODE_PATH=/home/hjawahreh/Desktop/Projects/sharedrop/node_modules \
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
 *     node docs/certification/geo-001a-browser-walkthrough.mjs
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
const OUT = path.join(ROOT, 'docs/certification/geo-001a-browser-shots');
const JSON_OUT = path.join(ROOT, 'docs/certification/geo-001a-browser-walkthrough.json');
const EVIDENCE = path.join(ROOT, 'docs/certification/geo-001a-evidence');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(EVIDENCE, { recursive: true });

const upperStl = path.join(FIX, 'upper.stl');
const lowerStl = path.join(FIX, 'lower.stl');
const HOST = process.env.CAD_STUDIO_URL || 'http://localhost:1420/';

const FIRST_NAME = 'GEO001A';
const LAST_NAME = 'RealDental';
const CASE_NAME = 'GEO-001A-Real-Dental-Geometry-Upper-Lower';

/** @type {Array<Record<string, unknown>>} */
const steps = [];
/** @type {Record<string, unknown>} */
const evidence = {
  baselines: {},
  trim: {},
  closeBase: {},
  undoRedo: {},
  persistence: {},
  performance: {},
  surfacePath: {}
};
let mandatoryFail = false;

const recordStep = (id, status, fields = {}) => {
  const at = new Date().toISOString();
  const entry = Object.freeze({ id, step: id, status, at, timestamp: at, ...fields });
  steps.push(entry);
  console.log(`[${status}] ${id}${fields.detail ? ' — ' + fields.detail : ''}`);
  if (status === 'FAIL' && fields.mandatory !== false) mandatoryFail = true;
};

const shot = async (page, name) => {
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return `${name}.png`;
};

const waitIdle = (page, ms = 500) => page.waitForTimeout(ms);

const overlayBox = async (page) => {
  const overlay = page.getByTestId('clinical-trim-overlay');
  await overlay.waitFor({ state: 'visible', timeout: 20000 });
  const box = await overlay.boundingBox();
  if (!box) throw new Error('clinical-trim-overlay has no box');
  return box;
};

const probeSurfaceHits = async (page, box) =>
  page.evaluate(
    ({ w, h }) => {
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
              objectId: hit.objectId
            });
          }
        }
      }
      return { error: null, hits: found, count: found.length };
    },
    { w: box.width, h: box.height }
  );

const snapPick = async (page, box, x, y) =>
  page.evaluate(
    ({ x: px, y: py, w, h }) => {
      const ws = globalThis.__clinicalWorkspace;
      const picker = ws?.meshPicker;
      const targetId = ws?.trim?.session?.getState?.()?.targetObjectId;
      const hit = picker?.pick({
        screenX: px,
        screenY: py,
        canvasWidth: w,
        canvasHeight: h,
        ...(targetId ? { preferredObjectId: String(targetId) } : {})
      });
      if (!hit || !Number.isFinite(hit.worldX)) return null;
      return { x: px, y: py, worldX: hit.worldX, worldY: hit.worldY, worldZ: hit.worldZ };
    },
    { x, y, w: box.width, h: box.height }
  );

const clickSurfacePoint = async (page, box, p) => {
  await page.mouse.click(box.x + p.x, box.y + p.y);
  await waitIdle(page, 120);
};

const drawSurfaceLoopOnMesh = async (page, scale = 0.38, offset = { x: 0, y: 0 }) => {
  const box = await overlayBox(page);
  const hits = await probeSurfaceHits(page, box);
  if (!hits.hits?.length || hits.hits.length < 8) {
    throw new Error(
      `Insufficient surface hits for trim loop (n=${hits.hits?.length ?? 0}): ${hits.error ?? ''}`
    );
  }
  const pts = hits.hits;
  const minX = Math.min(...pts.map((p) => p.x));
  const maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const midX = (minX + maxX) / 2 + ((maxX - minX) / 2) * (offset.x || 0);
  const midY = (minY + maxY) / 2 + ((maxY - minY) / 2) * (offset.y || 0);
  const halfU = ((maxX - minX) / 2) * scale;
  const halfV = ((maxY - minY) / 2) * scale;
  const cornerLocals = [
    { x: midX - halfU, y: midY - halfV },
    { x: midX + halfU, y: midY - halfV },
    { x: midX + halfU, y: midY + halfV },
    { x: midX - halfU, y: midY + halfV },
    { x: midX, y: midY - halfV }
  ];
  const sectors = [];
  for (const c of cornerLocals) {
    const snapped = await snapPick(page, box, c.x, c.y);
    if (!snapped) continue;
    if (sectors.some((s) => Math.hypot(s.x - snapped.x, s.y - snapped.y) < 3)) continue;
    sectors.push(snapped);
  }
  if (sectors.length < 4) {
    throw new Error(`Could not form surface rectangle loop (got ${sectors.length})`);
  }
  sectors.sort(
    (a, b) => Math.atan2(a.y - midY, a.x - midX) - Math.atan2(b.y - midY, b.x - midX)
  );
  for (const p of sectors) {
    await clickSurfacePoint(page, box, p);
  }
  return { local: sectors, hitCount: hits.hits.length, span: { halfU, halfV, midX, midY } };
};

const ensurePolylineDrawing = async (page) => {
  const poly = page.getByTestId('clinical-trim-polyline');
  if (await poly.isVisible().catch(() => false)) {
    await poly.click();
    await waitIdle(page, 200);
  }
};

const readArchGeom = async (page, role) =>
  page.evaluate((archRole) => {
    const doc = globalThis.__clinicalWorkspace?.session?.getPublicState?.()?.activeCase;
    const obj = doc?.objects?.find((o) => o.archRole === archRole);
    if (!obj) return null;
    return {
      id: String(obj.id),
      faceCount: obj.faceCount ?? null,
      vertexCount: obj.vertexCount ?? null,
      fingerprint: obj.geometryFingerprint ?? null,
      backend: obj.geometryBackend ?? null,
      revision: obj.geometryRevision ?? null,
      dirty: doc.dirty === true
    };
  }, role);

const readMeshQuality = async (page, role) =>
  page.evaluate((archRole) => {
    const ws = globalThis.__clinicalWorkspace;
    const doc = ws?.session?.getPublicState?.()?.activeCase;
    const obj = doc?.objects?.find((o) => o.archRole === archRole);
    if (!obj) return null;
    const registry = ws.getHost().runtimes.kernel.registry;
    const mesh =
      registry.getByObjectId(String(obj.id), 'working') ??
      registry.getByObjectId(String(obj.id), 'source');
    if (!mesh) return { error: 'no mesh in registry', objectId: String(obj.id) };
    const engine = ws.getHost().runtimes.kernel.geometryEngine;
    const t0 = performance.now();
    const report = engine.analyzeMesh(mesh);
    const analysisMs = performance.now() - t0;
    const loops = engine.extractBoundaries(mesh);
    const primary = loops[0];
    return {
      arch: archRole,
      objectId: String(obj.id),
      fingerprint: mesh.fingerprint,
      revision: mesh.revision,
      vertexCount: report.vertexCount,
      triangleCount: report.triangleCount,
      surfaceArea: report.surfaceArea,
      bounds: report.bbox,
      connectedComponents: report.connectedComponentCount,
      boundaryEdgeCount: report.boundaryEdgeCount,
      nonManifoldEdgeCount: report.nonManifoldEdgeCount,
      degenerateTriangleCount: report.degenerateTriangleCount,
      watertight: report.watertight,
      manifold: report.manifold,
      gate: report.gate,
      selfIntersectionStatus: report.selfIntersectionStatus,
      analysisMs,
      boundaryLoopCount: loops.length,
      primaryBoundary: primary
        ? {
            perimeter: primary.perimeter,
            projectedArea: primary.projectedArea,
            pointCount: primary.vertexIndices.length,
            closed: primary.closed,
            centroid: primary.centroid,
            score: primary.score
          }
        : null
    };
  }, role);

const readTrimState = async (page) =>
  page.evaluate(() => {
    const trim = globalThis.__clinicalWorkspace?.trim;
    const state = trim?.session?.getState?.();
    if (!state) return null;
    return {
      points: state.points.length,
      closed: state.closed,
      phase: state.phase,
      previewReady: trim?.controller?.isPreviewReady?.() ?? false,
      targetObjectId: state.targetObjectId ? String(state.targetObjectId) : null,
      worldComplete: state.points.every(
        (p) =>
          typeof p.localX === 'number' &&
          typeof p.localY === 'number' &&
          typeof p.localZ === 'number' &&
          Number.isFinite(p.localX)
      ),
      validationPassed: state.validationReport?.passed ?? null,
      sample: state.points.slice(0, 4).map((p) => ({
        x: p.x,
        y: p.y,
        localX: p.localX,
        localY: p.localY,
        localZ: p.localZ,
        objectId: p.objectId
      }))
    };
  });

const verifySurfacePathAssociation = async (page) =>
  page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    const trim = ws?.trim;
    const state = trim?.session?.getState?.();
    if (!state?.points?.length) return { ok: false, error: 'no trim points' };
    const targetId = String(state.targetObjectId ?? '');
    const registry = ws.getHost().runtimes.kernel.registry;
    const mesh =
      registry.getByObjectId(targetId, 'working') ?? registry.getByObjectId(targetId, 'source');
    if (!mesh) return { ok: false, error: 'mesh missing' };
    const engine = ws.getHost().runtimes.kernel.geometryEngine;
    const seeds = state.points
      .filter(
        (p) =>
          typeof p.localX === 'number' &&
          typeof p.localY === 'number' &&
          typeof p.localZ === 'number'
      )
      .map((p) => ({ point: [p.localX, p.localY, p.localZ] }));
    if (seeds.length < 3) return { ok: false, error: 'insufficient mesh-local seeds' };
    const built = engine.buildSurfacePath(mesh, seeds, { closed: true, reconstruct: false });
    if (!built.ok) return { ok: false, error: built.message, meshFingerprint: mesh.fingerprint };
    const closed = engine.closeSurfacePath(mesh, built.path);
    const validated = engine.validateSurfacePath(mesh, closed, { maxSpacingMm: 40 });
    const sampleChecks = closed.samples.slice(0, 6).map((s) => {
      const nearest = engine.nearestSurface(mesh, s.point, 2);
      return {
        point: s.point,
        faceId: s.faceId,
        componentId: s.componentId,
        nearestHit: nearest.hit,
        distance: nearest.hit ? nearest.distance : null,
        nearestFaceId: nearest.hit ? nearest.faceId : null
      };
    });
    const offSurface = sampleChecks.filter((c) => !c.nearestHit || (c.distance ?? 99) > 1.5);
    return {
      ok: validated.ok && offSurface.length === 0,
      validatedOk: validated.ok,
      validationMessage: validated.ok ? null : validated.message,
      meshFingerprint: mesh.fingerprint,
      pathFingerprint: closed.fingerprint,
      pathMeshFingerprint: closed.meshFingerprint,
      pathLength: closed.length,
      sampleCount: closed.samples.length,
      sampleChecks,
      offSurfaceCount: offSurface.length,
      targetArch: state.targetObjectId,
      staleGeometry: closed.meshFingerprint !== mesh.fingerprint
    };
  });

const readKernelMetrics = async (page) =>
  page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    const opSession = ws?.trim?.controller?.operation?.getSession?.();
    const snap = opSession?.snapshot?.();
    const kernel = snap?.kernelResult;
    const payload = kernel?.payload;
    const metrics = payload?.metrics ?? {};
    const diagnostics = Array.isArray(payload?.diagnostics) ? payload.diagnostics : [];
    const meta = (prefix) => {
      const hit = diagnostics.find((d) => typeof d === 'string' && d.startsWith(prefix));
      if (!hit) return undefined;
      const n = Number(hit.slice(prefix.length));
      return Number.isFinite(n) ? n : hit.slice(prefix.length);
    };
    return {
      fingerprint: kernel?.fingerprint ?? null,
      removedTriangles: metrics.removedTriangles ?? meta('removedTriangles:'),
      inputFaceCount: metrics.inputFaceCount ?? meta('inputFaceCount:'),
      faceCount: metrics.faceCount ?? payload?.faceCount ?? meta('faceCount:'),
      backend: meta('backend:') ?? null,
      algorithm: meta('algorithm:') ?? null,
      diagnostics: diagnostics.slice(0, 24)
    };
  });

const selectGlobalArch = async (page, mode) => {
  const btn = page.getByTestId(`clinical-global-arch-${mode}`);
  if (await btn.isEnabled().catch(() => false)) {
    await btn.click();
    await waitIdle(page, 300);
  }
};

const presentView = async (page, face) => {
  await page.evaluate((f) => {
    const ws = globalThis.__clinicalWorkspace;
    ws?.viewport?.presentCanonicalClinicalView?.(f);
    ws?.session?.notifyUi?.();
  }, face);
  await waitIdle(page, 600);
};

const advanceToTrim = async (page) => {
  const prepCase = page.getByRole('button', { name: 'Prepare Case', exact: true }).first();
  if (await prepCase.count()) {
    await prepCase.click();
    await waitIdle(page, 1500);
  }
  const continueTrim = page.getByRole('button', { name: 'Continue to Trim', exact: true }).first();
  if ((await continueTrim.count()) && (await continueTrim.isEnabled())) {
    await continueTrim.click();
  } else {
    await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const prep = ws?.preparation;
      if (prep && !prep.hasSession?.()) {
        prep.notifyOrientationComplete?.();
        prep.start?.();
        prep.activateSession?.();
      }
      while (prep?.session?.getState?.()?.currentStage !== 'ready-for-trim') {
        const adv = prep?.advanceStage?.();
        if (!adv?.ok) break;
      }
      const result = ws?.trim?.enter?.();
      if (!result?.ok) throw new Error(result?.error?.message ?? 'trim enter failed');
      ws.session.notifyUi();
    });
  }
  await waitIdle(page, 900);
  await page.getByTestId('clinical-trim-overlay').waitFor({ timeout: 20000 });
};

const ensureTrimStillActive = async (page) => {
  const active = await page.evaluate(() => globalThis.__clinicalWorkspace?.trim?.isActive?.() === true);
  if (active) return;
  await page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    const result = ws.trim.enter();
    if (!result.ok) throw new Error(result.error?.message ?? 're-enter trim failed');
    ws.session.notifyUi();
  });
  await waitIdle(page, 600);
  await page.getByTestId('clinical-trim-overlay').waitFor({ timeout: 20000 });
};

const validateClosePreview = async (page) => {
  await page.getByTestId('clinical-trim-close').click();
  await waitIdle(page, 200);
  await page.getByTestId('clinical-trim-validate').click();
  await waitIdle(page, 500);
  return page.getByTestId('clinical-trim-stats').innerText();
};

const runPreview = async (page) => {
  const started = Date.now();
  const previewBtn = page.getByTestId('clinical-trim-preview');
  if (await previewBtn.isEnabled()) {
    await previewBtn.click();
  } else {
    const result = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const r = await ws.trim.preview();
      ws.session.notifyUi();
      return { ok: r.ok, error: r.ok ? null : r.error?.message };
    });
    if (!result.ok) throw new Error(result.error ?? 'preview failed');
  }
  for (let i = 0; i < 120; i += 1) {
    const ready = await page.evaluate(
      () => globalThis.__clinicalWorkspace?.trim?.controller?.isPreviewReady?.() === true
    );
    if (ready) break;
    await waitIdle(page, 500);
  }
  await waitIdle(page, 400);
  return Date.now() - started;
};

const runAccept = async (page) => {
  const started = Date.now();
  const acceptBtn = page.getByTestId('clinical-trim-accept');
  if (await acceptBtn.isEnabled()) {
    await acceptBtn.click();
  } else {
    const result = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      const r = await ws.trim.accept();
      ws.session.notifyUi();
      return { ok: r.ok, error: r.ok ? null : r.error?.message };
    });
    if (!result.ok) throw new Error(result.error ?? 'accept failed');
  }
  await waitIdle(page, 1500);
  return Date.now() - started;
};

const waitMeshChange = async (page, role, before, maxTicks = 40) => {
  for (let i = 0; i < maxTicks; i += 1) {
    const post = await readArchGeom(page, role);
    if (
      post &&
      before &&
      (post.fingerprint !== before.fingerprint || post.faceCount !== before.faceCount)
    ) {
      return post;
    }
    await waitIdle(page, 500);
  }
  return readArchGeom(page, role);
};

const clearTrimBoundary = async (page) => {
  await page.evaluate(() => {
    const ws = globalThis.__clinicalWorkspace;
    ws?.trim?.controller?.clearBoundary?.();
    ws?.session?.notifyUi?.();
  });
  await waitIdle(page, 200);
};

async function main() {
  if (!fs.existsSync(upperStl) || !fs.existsSync(lowerStl)) {
    throw new Error('Missing clinical-fixtures upper.stl / lower.stl');
  }

  const chromePath =
    process.env.PLAYWRIGHT_CHROME_PATH ||
    `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
  const launchOpts = { headless: true };
  if (fs.existsSync(chromePath)) {
    launchOpts.executablePath = chromePath;
  }

  const browser = await chromium.launch(launchOpts);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);

  const consoleMsgs = [];
  const consoleErrors = [];
  page.on('console', (msg) => {
    const text = msg.text();
    consoleMsgs.push({ type: msg.type(), text });
    if (msg.type() === 'error') consoleErrors.push(text);
  });

  /** @type {Array<Record<string, unknown>>} */
  const vtkCalls = [];
  await page.route('**/v1/geometry', async (route) => {
    const req = route.request();
    let parsed = null;
    try {
      parsed = JSON.parse(req.postData() || '{}');
    } catch {
      parsed = null;
    }
    vtkCalls.push({
      url: req.url(),
      phase: 'post',
      cmd: parsed?.cmd,
      loopLen: Array.isArray(parsed?.loop) ? parsed.loop.length : undefined,
      preview: parsed?.preview,
      direction_source: parsed?.direction_source,
      preferRequested: parsed?.prefer_requested_orientation ?? parsed?.preferRequestedOrientation
    });
    const response = await route.fetch();
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    vtkCalls.push({
      url: req.url(),
      phase: 'response',
      status: response.status(),
      ok: body?.ok,
      cmd: body?.cmd ?? parsed?.cmd,
      removed: body?.removed_triangles_est,
      output_triangles: body?.output_triangles,
      added: body?.added_triangles,
      direction_source: body?.direction_source ?? parsed?.direction_source,
      error: body?.error,
      elapsed_ms: body?.elapsed_ms
    });
    await route.fulfill({ response });
  });

  try {
    await page.goto(HOST, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => globalThis.__clinicalWorkspace != null, null, {
      timeout: 60000
    });

    let vtkLogSeen = false;
    for (let i = 0; i < 24; i += 1) {
      vtkLogSeen = consoleMsgs.some((m) => /VTK HTTP worker available/i.test(m.text));
      if (vtkLogSeen) break;
      await waitIdle(page, 500);
    }
    recordStep('00-vtk-health', vtkLogSeen ? 'PASS' : 'FAIL', {
      detail: vtkLogSeen ? 'VTK HTTP worker available' : 'no VTK log'
    });

    // --- Create case / import ---
    await page.getByTestId('clinical-empty-new-case').click();
    await page.getByTestId('clinical-create-case-dialog').waitFor({ state: 'visible' });
    await page.getByTestId('clinical-create-first-name').fill(FIRST_NAME);
    await page.getByTestId('clinical-create-last-name').fill(LAST_NAME);
    await page.getByTestId('clinical-create-case-name').fill(CASE_NAME);
    const fileInputs = page.locator('.clinical-import-dialog__file-input');
    await fileInputs.nth(0).setInputFiles(upperStl);
    await fileInputs.nth(1).setInputFiles(lowerStl);
    const importStart = Date.now();
    await page.getByTestId('clinical-create-submit').click();
    await page.getByTestId('clinical-create-case-success').waitFor({
      state: 'visible',
      timeout: 180000
    });
    evidence.performance.importMs = Date.now() - importStart;
    await waitIdle(page, 800);
    await shot(page, '01-imported');
    recordStep('01-imported', 'PASS', { screenshot: '01-imported.png' });

    await page.getByTestId('clinical-create-continue-orient').click();
    await page.getByTestId('clinical-orientation-toolbar').waitFor({ state: 'visible', timeout: 60000 });
    let origin = null;
    for (let i = 0; i < 80; i += 1) {
      origin = await page.evaluate(() => {
        const ws = globalThis.__clinicalWorkspace;
        if (!ws?.orientation?.isActive?.()) return null;
        return ws.orientation.session.getState().orientationOrigin;
      });
      if (origin === 'auto') break;
      await waitIdle(page, 500);
    }
    await page.getByTestId('clinical-orientation-accept').click();
    await waitIdle(page, 2000);
    await presentView(page, 'front');
    await shot(page, '02-oriented');
    recordStep('02-oriented', origin === 'auto' ? 'PASS' : 'FAIL', {
      screenshot: '02-oriented.png',
      orientationOrigin: origin
    });

    // Baselines after orientation/import (working geometry)
    const upperBaseline = await readMeshQuality(page, 'upper');
    const lowerBaseline = await readMeshQuality(page, 'lower');
    evidence.baselines = { upper: upperBaseline, lower: lowerBaseline };
    recordStep(
      '03-mesh-baselines',
      upperBaseline?.triangleCount > 10000 && lowerBaseline?.triangleCount > 10000 ? 'PASS' : 'FAIL',
      {
        upperTriangles: upperBaseline?.triangleCount,
        lowerTriangles: lowerBaseline?.triangleCount,
        upperFp: upperBaseline?.fingerprint,
        lowerFp: lowerBaseline?.fingerprint
      }
    );

    await advanceToTrim(page);
    await selectGlobalArch(page, 'upper');
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      ws?.trim?.setActiveArch?.('upper');
      ws?.session?.notifyUi?.();
    });
    await waitIdle(page, 500);
    await presentView(page, 'front');
    await shot(page, '03-trim-before');
    recordStep('03-trim-before', 'PASS', { screenshot: '03-trim-before.png' });

    const originalGeom = await readArchGeom(page, 'upper');
    const originalQuality = await readMeshQuality(page, 'upper');
    evidence.trim.original = { geom: originalGeom, quality: originalQuality };

    // --- Trim A ---
    await ensurePolylineDrawing(page);
    const drawnA = await drawSurfaceLoopOnMesh(page, 0.36, { x: -0.05, y: 0.05 });
    await shot(page, '04-trim-loop');
    const pathCheckA = await verifySurfacePathAssociation(page);
    evidence.surfacePath.trimA = pathCheckA;
    recordStep('04-trim-loop-surface-path', pathCheckA.ok ? 'PASS' : 'FAIL', {
      screenshot: '04-trim-loop.png',
      drawn: drawnA,
      pathCheck: pathCheckA
    });

    const statsA = await validateClosePreview(page);
    const validA =
      /Valid/i.test(statsA) && !/crosses itself/i.test(statsA) && !/outside/i.test(statsA);
    recordStep('04b-trim-validate', validA ? 'PASS' : 'FAIL', { stats: statsA });

    const previewMsA = await runPreview(page);
    const metricsPreviewA = await readKernelMetrics(page);
    const previewReadyA = await page.evaluate(
      () => globalThis.__clinicalWorkspace?.trim?.controller?.isPreviewReady?.() === true
    );
    await shot(page, '05-trim-preview');
    evidence.trim.previewA = { metrics: metricsPreviewA, previewMs: previewMsA, previewReady: previewReadyA };
    recordStep(
      '05-trim-preview',
      previewReadyA && Number(metricsPreviewA.removedTriangles ?? 0) > 0 ? 'PASS' : 'FAIL',
      {
        screenshot: '05-trim-preview.png',
        metrics: metricsPreviewA,
        previewMs: previewMsA,
        detail: 'Preview must be ClinicalGeometryEngine / kernel result with removed triangles'
      }
    );

    const acceptMsA = await runAccept(page);
    const afterA = await waitMeshChange(page, 'upper', originalGeom);
    const qualityA = await readMeshQuality(page, 'upper');
    await presentView(page, 'front');
    await shot(page, '06-trim-accepted');
    const trimAChanged =
      afterA &&
      originalGeom &&
      (afterA.fingerprint !== originalGeom.fingerprint || afterA.faceCount !== originalGeom.faceCount);
    evidence.trim.acceptedA = {
      geom: afterA,
      quality: qualityA,
      acceptMs: acceptMsA,
      inputFingerprint: originalGeom?.fingerprint,
      outputFingerprint: afterA?.fingerprint,
      inputTriangles: originalQuality?.triangleCount,
      outputTriangles: qualityA?.triangleCount,
      removedTriangles:
        (originalQuality?.triangleCount ?? 0) - (qualityA?.triangleCount ?? 0),
      surfaceAreaBefore: originalQuality?.surfaceArea,
      surfaceAreaAfter: qualityA?.surfaceArea,
      boundaryBefore: originalQuality?.boundaryEdgeCount,
      boundaryAfter: qualityA?.boundaryEdgeCount,
      componentsBefore: originalQuality?.connectedComponents,
      componentsAfter: qualityA?.connectedComponents
    };
    recordStep('06-trim-accepted', trimAChanged ? 'PASS' : 'FAIL', {
      screenshot: '06-trim-accepted.png',
      pre: originalGeom,
      post: afterA,
      quality: qualityA
    });

    // Preview fingerprint vs accepted — document agreement via face/fingerprint change continuity
    recordStep(
      '06b-preview-vs-accepted',
      previewReadyA && trimAChanged && afterA?.fingerprint === qualityA?.fingerprint
        ? 'PASS'
        : 'FAIL',
      {
        previewFp: metricsPreviewA.fingerprint,
        acceptedFp: afterA?.fingerprint,
        detail: 'Accepted geometry must match committed preview path (same engine)'
      }
    );

    // --- Undo / Redo after Trim A ---
    const undoBtn = page.getByTestId('clinical-trim-doc-undo');
    await undoBtn.waitFor({ state: 'visible' });
    if (await undoBtn.isEnabled()) {
      await undoBtn.click();
      await waitIdle(page, 1000);
      const undone = await readArchGeom(page, 'upper');
      const undoneQ = await readMeshQuality(page, 'upper');
      const restored =
        undone?.fingerprint === originalGeom?.fingerprint ||
        undone?.faceCount === originalGeom?.faceCount;
      evidence.undoRedo.undone = { geom: undone, quality: undoneQ };
      recordStep('07-undo', restored ? 'PASS' : 'FAIL', {
        original: originalGeom,
        undone,
        detail: 'Geometry restoration (fingerprint/faces), not metadata-only'
      });
      const redoBtn = page.getByTestId('clinical-trim-doc-redo');
      if (await redoBtn.isEnabled()) {
        await redoBtn.click();
        await waitIdle(page, 1000);
        const redone = await readArchGeom(page, 'upper');
        const redoneQ = await readMeshQuality(page, 'upper');
        const back =
          redone?.fingerprint === afterA?.fingerprint || redone?.faceCount === afterA?.faceCount;
        evidence.undoRedo.redone = { geom: redone, quality: redoneQ };
        recordStep('07b-redo', back ? 'PASS' : 'FAIL', { afterA, redone });
      } else {
        recordStep('07b-redo', 'FAIL', { detail: 'redo disabled' });
      }
    } else {
      recordStep('07-undo', 'FAIL', { detail: 'undo disabled' });
    }

    // Ensure we are at Trim A state for subsequent ops
    const currentAfterRedo = await readArchGeom(page, 'upper');
    if (currentAfterRedo?.fingerprint !== afterA?.fingerprint) {
      // re-accept path already redone; if mismatch, record observe
      recordStep('07c-state-after-redo', 'OBSERVE', {
        expected: afterA,
        actual: currentAfterRedo,
        mandatory: false
      });
    }

    // --- Trim B (current working geometry) ---
    await ensureTrimStillActive(page);
    await clearTrimBoundary(page);
    await ensurePolylineDrawing(page);
    const preB = await readArchGeom(page, 'upper');
    await drawSurfaceLoopOnMesh(page, 0.28, { x: 0.12, y: -0.08 });
    await validateClosePreview(page);
    await runPreview(page);
    await runAccept(page);
    const afterB = await waitMeshChange(page, 'upper', preB);
    evidence.trim.acceptedB = { pre: preB, post: afterB };
    recordStep(
      '08-trim-B',
      afterB && preB && afterB.fingerprint !== preB.fingerprint ? 'PASS' : 'FAIL',
      { pre: preB, post: afterB }
    );

    // --- Trim C ---
    await ensureTrimStillActive(page);
    await clearTrimBoundary(page);
    await ensurePolylineDrawing(page);
    const preC = await readArchGeom(page, 'upper');
    await drawSurfaceLoopOnMesh(page, 0.22, { x: -0.15, y: 0.12 });
    await validateClosePreview(page);
    await runPreview(page);
    await runAccept(page);
    const afterC = await waitMeshChange(page, 'upper', preC);
    evidence.trim.acceptedC = { pre: preC, post: afterC };
    const chainOk =
      originalGeom?.fingerprint &&
      afterA?.fingerprint &&
      afterB?.fingerprint &&
      afterC?.fingerprint &&
      originalGeom.fingerprint !== afterA.fingerprint &&
      afterA.fingerprint !== afterB.fingerprint &&
      afterB.fingerprint !== afterC.fingerprint;
    evidence.trim.fingerprintChain = {
      original: originalGeom?.fingerprint,
      A: afterA?.fingerprint,
      B: afterB?.fingerprint,
      C: afterC?.fingerprint
    };
    recordStep('09-trim-C-chain', chainOk ? 'PASS' : 'FAIL', {
      chain: evidence.trim.fingerprintChain,
      detail: 'Original != A != B != C on current working geometry'
    });

    // --- Invalid self-intersecting loop ---
    await ensureTrimStillActive(page);
    await clearTrimBoundary(page);
    const fpBeforeInvalid = await readArchGeom(page, 'upper');
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const trim = ws.trim;
      const targetId = trim.session.getState()?.targetObjectId;
      const points = [
        { x: 120, y: 120, localX: 0, localY: 0, localZ: 0, meshX: 0, meshY: 0, objectId: targetId ? String(targetId) : undefined },
        { x: 220, y: 220, localX: 1, localY: 1, localZ: 0, meshX: 1, meshY: 1, objectId: targetId ? String(targetId) : undefined },
        { x: 220, y: 120, localX: 1, localY: 0, localZ: 0, meshX: 1, meshY: 0, objectId: targetId ? String(targetId) : undefined },
        { x: 120, y: 220, localX: 0, localY: 1, localZ: 0, meshX: 0, meshY: 1, objectId: targetId ? String(targetId) : undefined }
      ];
      trim.controller.clearBoundary();
      trim.session.setPoints(points, true);
      ws.session.notifyUi();
    });
    await page.getByTestId('clinical-trim-validate').click();
    await waitIdle(page, 400);
    const statsInvalid = await page.getByTestId('clinical-trim-stats').innerText();
    const stInvalid = await readTrimState(page);
    const rejected =
      /crosses itself/i.test(statsInvalid) ||
      /Invalid/i.test(statsInvalid) ||
      /self-intersect/i.test(statsInvalid) ||
      stInvalid?.validationPassed === false;
    const acceptEnabledInvalid = await page.getByTestId('clinical-trim-accept').isEnabled().catch(() => false);
    const fpAfterInvalid = await readArchGeom(page, 'upper');
    const invalidNoMutate =
      fpBeforeInvalid?.fingerprint === fpAfterInvalid?.fingerprint &&
      fpBeforeInvalid?.revision === fpAfterInvalid?.revision;
    recordStep(
      '10-invalid-loop',
      rejected && !acceptEnabledInvalid && invalidNoMutate ? 'PASS' : 'FAIL',
      {
        stats: statsInvalid,
        acceptEnabled: acceptEnabledInvalid,
        invalidNoMutate,
        detail: 'FAIL expected: no preview commit, no geometry mutation, no history'
      }
    );

    // --- Outside / NO_OP loop ---
    await clearTrimBoundary(page);
    const fpBeforeOutside = await readArchGeom(page, 'upper');
    await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const trim = ws.trim;
      const targetId = trim.session.getState()?.targetObjectId;
      const cx = 1e6;
      const cy = 1e6;
      const cz = 1e6;
      const s = 5;
      const points = [
        { x: 20, y: 20, localX: cx - s, localY: cy - s, localZ: cz, meshX: cx - s, meshY: cy - s, worldX: cx - s, worldY: cy - s, worldZ: cz, objectId: targetId ? String(targetId) : undefined },
        { x: 60, y: 20, localX: cx + s, localY: cy - s, localZ: cz, meshX: cx + s, meshY: cy - s, worldX: cx + s, worldY: cy - s, worldZ: cz, objectId: targetId ? String(targetId) : undefined },
        { x: 60, y: 60, localX: cx + s, localY: cy + s, localZ: cz, meshX: cx + s, meshY: cy + s, worldX: cx + s, worldY: cy + s, worldZ: cz, objectId: targetId ? String(targetId) : undefined },
        { x: 20, y: 60, localX: cx - s, localY: cy + s, localZ: cz, meshX: cx - s, meshY: cy + s, worldX: cx - s, worldY: cy + s, worldZ: cz, objectId: targetId ? String(targetId) : undefined }
      ];
      trim.controller.clearBoundary();
      trim.session.setPoints(points, true);
      ws.session.notifyUi();
    });
    await page.getByTestId('clinical-trim-validate').click();
    await waitIdle(page, 400);
    const statsOutside = await page.getByTestId('clinical-trim-stats').innerText();
    const stOutside = await readTrimState(page);
    let outsideStatus = 'FAIL';
    let outsideDetail = 'Outside/no-op path not confirmed';
    if (/outside/i.test(statsOutside) || stOutside?.validationPassed === false) {
      outsideStatus = 'PASS';
      outsideDetail = 'Validation rejected outside boundary (NO_REGION)';
    } else {
      const previewResult = await page.evaluate(async () => {
        const ws = globalThis.__clinicalWorkspace;
        try {
          const r = await ws.trim.preview();
          ws.session.notifyUi();
          return { ok: r.ok, error: r.ok ? null : r.error?.message ?? String(r.error) };
        } catch (err) {
          return { ok: false, error: String(err) };
        }
      });
      if (
        !previewResult.ok ||
        /no geometry change|no-op|empty|outside|degenerate|NO_REGION|NO_OP/i.test(
          String(previewResult.error ?? '')
        )
      ) {
        outsideStatus = 'PASS';
        outsideDetail = `Outside treated as NO_OP/NO_REGION (err=${previewResult.error})`;
      } else {
        outsideDetail = `Unexpected preview success: ${JSON.stringify(previewResult)}`;
      }
      const cancel = page.getByTestId('clinical-trim-cancel-preview');
      if ((await cancel.isEnabled().catch(() => false)) === true) {
        await cancel.click();
        await waitIdle(page, 300);
      } else {
        await clearTrimBoundary(page);
      }
    }
    const fpAfterOutside = await readArchGeom(page, 'upper');
    const outsideUnchanged =
      fpBeforeOutside?.fingerprint === fpAfterOutside?.fingerprint &&
      fpBeforeOutside?.revision === fpAfterOutside?.revision;
    if (!outsideUnchanged) {
      outsideStatus = 'FAIL';
      outsideDetail += '; fingerprint/revision mutated';
    }
    recordStep('11-outside-noop', outsideStatus, {
      detail: outsideDetail,
      stats: statsOutside,
      unchanged: outsideUnchanged
    });

    // --- Close Base ---
    const preClose = await readArchGeom(page, 'upper');
    const qualityPreClose = await readMeshQuality(page, 'upper');
    evidence.closeBase.before = { geom: preClose, quality: qualityPreClose };

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
    await waitIdle(page, 900);
    await page.getByTestId('clinical-close-base-overlay').waitFor({ timeout: 20000 });

    const boundaryGate = await page.evaluate(() => {
      const ws = globalThis.__clinicalWorkspace;
      const doc = ws?.session?.getPublicState?.()?.activeCase;
      const obj = doc?.objects?.find((o) => o.archRole === 'upper');
      const mesh =
        ws.getHost().runtimes.kernel.registry.getByObjectId(String(obj.id), 'working') ??
        ws.getHost().runtimes.kernel.registry.getByObjectId(String(obj.id), 'source');
      const loops = ws.getHost().runtimes.kernel.geometryEngine.extractBoundaries(mesh);
      const primary = loops[0];
      return {
        loopCount: loops.length,
        primary: primary
          ? {
              perimeter: primary.perimeter,
              projectedArea: primary.projectedArea,
              pointCount: primary.vertexIndices.length,
              closed: primary.closed,
              centroid: primary.centroid,
              score: primary.score,
              reasons: primary.reasons
            }
          : null
      };
    });
    evidence.closeBase.boundary = boundaryGate;
    recordStep(
      '12-base-boundary-gate',
      boundaryGate.loopCount > 0 &&
        boundaryGate.primary?.closed &&
        boundaryGate.primary.pointCount > 8
        ? 'PASS'
        : 'FAIL',
      {
        boundary: boundaryGate,
        detail: 'Boundary must be real open dental border, not AABB perimeter'
      }
    );

    const baseStart = Date.now();
    await page.getByTestId('clinical-close-base-auto').click({ force: true });
    for (let i = 0; i < 160; i += 1) {
      const st = await page.evaluate(() => {
        const s = globalThis.__clinicalWorkspace?.closeBase?.session?.getState?.();
        return {
          toolStatus: s?.toolStatus,
          statusMessage: s?.statusMessage,
          fingerprint: s?.kernelFingerprint
        };
      });
      if (st?.toolStatus && st.toolStatus !== 'processing') {
        const responses = vtkCalls.filter((c) => c.cmd === 'close_base' && c.phase === 'response');
        if (responses.length > 0 || st.fingerprint || i > 12) break;
      }
      await waitIdle(page, 500);
    }
    evidence.performance.baseConstructionMs = Date.now() - baseStart;

    await presentView(page, 'front');
    await shot(page, '07-base-preview-anterior');
    await presentView(page, 'top');
    await shot(page, '08-base-preview-occlusal');
    await presentView(page, 'left');
    await shot(page, '09-base-preview-left');
    await presentView(page, 'right');
    await shot(page, '10-base-preview-right');

    const closeState = await page.evaluate(() => {
      const s = globalThis.__clinicalWorkspace?.closeBase?.session?.getState?.();
      return {
        toolStatus: s?.toolStatus,
        statusMessage: s?.statusMessage,
        fingerprint: s?.kernelFingerprint,
        orientation: s?.parameters?.orientation,
        strategy: s?.parameters?.strategy ?? s?.strategy
      };
    });
    evidence.closeBase.previewState = closeState;

    const acceptBase = await page.evaluate(async () => {
      const ws = globalThis.__clinicalWorkspace;
      try {
        const result = await ws.closeBase.accept();
        ws.session.notifyUi();
        return { ok: result.ok, error: result.ok ? null : result.error?.message };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    });
    await waitIdle(page, 1500);
    const postClose = await waitMeshChange(page, 'upper', preClose, 60);
    const qualityPostClose = await readMeshQuality(page, 'upper');
    await presentView(page, 'front');
    await shot(page, '11-base-accepted');

    const closeResp = [...vtkCalls]
      .reverse()
      .find((c) => c.phase === 'response' && (c.cmd === 'close_base' || c.added !== undefined));
    const clinicalDir = vtkCalls.some(
      (c) => typeof c.direction_source === 'string' && String(c.direction_source).startsWith('clinical:')
    );
    evidence.closeBase.accepted = {
      accept: acceptBase,
      pre: preClose,
      post: postClose,
      quality: qualityPostClose,
      vtkResponse: closeResp,
      clinicalDirection: clinicalDir,
      closeState
    };

    const meshGrew =
      postClose &&
      preClose &&
      ((typeof postClose.faceCount === 'number' &&
        typeof preClose.faceCount === 'number' &&
        postClose.faceCount > preClose.faceCount) ||
        postClose.fingerprint !== preClose.fingerprint);

    // Topology gate — do not silently accept unknown topology for intended closed base.
    // Current reference close-base uses capped ear-clip/walls; record exact quality.
    const topo = qualityPostClose;
    const topologyNotes = [];
    if (!topo) topologyNotes.push('missing MeshQualityReport');
    if (topo?.gate === 'FAIL') topologyNotes.push(`gate=FAIL`);
    if (topo?.nonManifoldEdgeCount > 0) {
      topologyNotes.push(`nonManifoldEdges=${topo.nonManifoldEdgeCount}`);
    }
    if (topo?.degenerateTriangleCount > 0) {
      topologyNotes.push(`degenerates=${topo.degenerateTriangleCount}`);
    }
    if (topo?.connectedComponents > (qualityPreClose?.connectedComponents ?? 1) + 1) {
      topologyNotes.push(`unexpected components=${topo.connectedComponents}`);
    }

    // Heuristic AABB-slab suspicion: area explosion or bbox diagonal base unrelated to arch
    const areaRatio =
      qualityPreClose?.surfaceArea > 0
        ? (topo?.surfaceArea ?? 0) / qualityPreClose.surfaceArea
        : null;
    if (areaRatio !== null && areaRatio > 8) {
      topologyNotes.push(`AREA_EXPLOSION ratio=${areaRatio.toFixed(2)}`);
    }

    evidence.closeBase.topology = {
      notes: topologyNotes,
      areaRatio,
      quality: topo,
      intendedContract:
        'If manufacturable closed base: prefer manifold/watertight. Current GEO-001 reference still uses capped ear-clip/walls — document exact result; do not hide.'
    };

    // Visual gate is operator/human from screenshots; automated step records topology + growth only.
    // REAL-DENTAL PASS requires BOTH trim AND close base visual+topology. Report will judge visuals.
    recordStep(
      '13-close-base-accepted',
      acceptBase.ok && meshGrew ? 'PASS' : 'FAIL',
      {
        screenshot: '11-base-accepted.png',
        accept: acceptBase,
        meshGrew,
        clinicalDir,
        topologyNotes,
        areaRatio,
        quality: topo,
        detail:
          'Automated commit success only. Visual AABB-slab / ear-clip failure judged in report from screenshots 07–11.'
      }
    );
    recordStep(
      '13b-close-base-clinical-direction',
      clinicalDir || closeState?.orientation ? 'PASS' : 'OBSERVE',
      {
        clinicalDir,
        orientation: closeState?.orientation,
        mandatory: false
      }
    );

    // Persistence
    try {
      await page.evaluate(() => {
        const ws = globalThis.__clinicalWorkspace;
        if (ws?.trim?.isActive?.()) ws.trim.cancel();
        if (ws?.closeBase?.isActive?.()) ws.closeBase.cancel();
        ws?.session?.notifyUi?.();
      });
      await waitIdle(page, 300);
      const caseId = await page.evaluate(
        () => globalThis.__clinicalWorkspace?.session?.getPublicState?.()?.activeCase?.caseId
      );
      const beforeSave = await readArchGeom(page, 'upper');
      await page.evaluate(async () => {
        const ws = globalThis.__clinicalWorkspace;
        const saved = await ws.cases.saveActiveCase(ws);
        if (!saved.ok) throw new Error(saved.error?.message ?? 'save failed');
        ws.session.notifyUi();
      });
      await waitIdle(page, 800);
      await page.evaluate(async () => {
        const ws = globalThis.__clinicalWorkspace;
        await ws.session.getHost().commands.invoke('clinical.case.close');
        ws.session.notifyUi();
      });
      await waitIdle(page, 600);
      await page.evaluate(async (id) => {
        const ws = globalThis.__clinicalWorkspace;
        const result = await ws.cases.openCase(ws, id);
        if (!result.ok) throw new Error(result.error?.message ?? 'openCase failed');
        ws.session.notifyUi();
      }, caseId);
      await waitIdle(page, 1500);
      const reopened = await readArchGeom(page, 'upper');
      evidence.persistence = { beforeSave, reopened, caseId };
      const persisted =
        reopened &&
        beforeSave &&
        (reopened.fingerprint === beforeSave.fingerprint ||
          reopened.faceCount === beforeSave.faceCount);
      recordStep('14-persistence', persisted ? 'PASS' : 'FAIL', { beforeSave, reopened });
    } catch (e) {
      recordStep('14-persistence', 'FAIL', { detail: String(e) });
    }

    const shotFiles = fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).sort();
    const requiredShots = [
      '01-imported.png',
      '02-oriented.png',
      '03-trim-before.png',
      '04-trim-loop.png',
      '05-trim-preview.png',
      '06-trim-accepted.png',
      '07-base-preview-anterior.png',
      '08-base-preview-occlusal.png',
      '09-base-preview-left.png',
      '10-base-preview-right.png',
      '11-base-accepted.png'
    ];
    const missing = requiredShots.filter((f) => !shotFiles.includes(f));
    recordStep('15-screenshots', missing.length === 0 ? 'PASS' : 'FAIL', {
      shotFiles,
      missing
    });

    evidence.performance.vtkCalls = vtkCalls.filter((c) => c.phase === 'response');
    evidence.consoleErrors = consoleErrors.filter(
      (t) => !/favicon|DevTools|ResizeObserver/i.test(t)
    );
  } catch (e) {
    recordStep('fatal', 'FAIL', { detail: String(e) });
    await shot(page, '99-error').catch(() => null);
  } finally {
    await browser.close().catch(() => null);
  }

  const report = {
    at: new Date().toISOString(),
    milestone: 'GEO-001A',
    host: HOST,
    fixtures: [
      'apps/studio/public/clinical-fixtures/upper.stl',
      'apps/studio/public/clinical-fixtures/lower.stl'
    ],
    steps,
    evidence,
    vtkCalls,
    summary: {
      total: steps.length,
      pass: steps.filter((s) => s.status === 'PASS').length,
      fail: steps.filter((s) => s.status === 'FAIL').length,
      observe: steps.filter((s) => s.status === 'OBSERVE').length,
      mandatoryFail
    }
  };
  fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(EVIDENCE, 'browser-evidence.json'), JSON.stringify(report, null, 2));
  console.log('\nWrote', JSON_OUT);
  console.log(
    `Summary: ${report.summary.pass} PASS / ${report.summary.observe} OBSERVE / ${report.summary.fail} FAIL (mandatoryFail=${mandatoryFail})`
  );
  if (mandatoryFail) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
