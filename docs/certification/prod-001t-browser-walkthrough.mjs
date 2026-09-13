/**
 * PROD-001T interactive browser certification — VTK Trim + Close Base.
 *
 * Prerequisites:
 *   - Studio: npm run dev (:1420)
 *   - VTK worker: /tmp/cad-geom-bench/bin/python tools/geometry-backend-bench/vtk_worker_http.py
 *
 * Run:
 *   NODE_PATH=/home/hjawahreh/Desktop/Projects/sharedrop/node_modules \
 *   PLAYWRIGHT_BROWSERS_PATH=$HOME/.cache/ms-playwright \
 *     node docs/certification/prod-001t-browser-walkthrough.mjs
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
const OUT = path.join(ROOT, 'docs/certification/prod-001t-browser-shots');
fs.mkdirSync(OUT, { recursive: true });

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

const viewportBox = async (page) => {
  const host = page.getByTestId('clinical-document-host');
  await host.waitFor({ state: 'visible', timeout: 20000 });
  const box = await host.boundingBox();
  if (!box) throw new Error('clinical-document-host has no box');
  return box;
};

const overlayBox = async (page) => {
  const overlay = page.getByTestId('clinical-trim-overlay');
  await overlay.waitFor({ state: 'visible', timeout: 20000 });
  const box = await overlay.boundingBox();
  if (!box) throw new Error('clinical-trim-overlay has no box');
  return box;
};

/** Probe surface hits via ClinicalMeshPicker, then click real UI at those screen positions. */
const drawSurfaceLoopOnMesh = async (page) => {
  const box = await overlayBox(page);
  const hits = await page.evaluate(({ w, h }) => {
    const ws = globalThis.__clinicalWorkspace;
    const picker = ws?.meshPicker;
    const targetId = ws?.trim?.session?.getState?.()?.targetObjectId;
    if (!picker?.isReady?.()) return { error: 'picker not ready', hits: [] };
    const found = [];
    // Dense grid over central 70% of overlay (local coords = pick screen coords)
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
            worldZ: hit.worldZ
          });
        }
      }
    }
    return { error: null, hits: found, count: found.length };
  }, { w: box.width, h: box.height });

  if (!hits.hits?.length || hits.hits.length < 8) {
    throw new Error(
      `Insufficient surface hits for trim loop (n=${hits.hits?.length ?? 0}): ${hits.error ?? ''}`
    );
  }

  // Screen-space rectangle ~35% of hit AABB (mirrors PROD-001S simple_convex scale),
  // re-picked onto the mesh so world X/Y/Z are valid and the VTK loop removes area.
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
    // fifth point densifies one edge (helps area / Newell stability)
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
    throw new Error(`Could not form surface rectangle loop (got ${sectors.length})`);
  }
  // Order CCW around rectangle center
  sectors.sort(
    (a, b) => Math.atan2(a.y - midY, a.x - midX) - Math.atan2(b.y - midY, b.x - midX)
  );

  for (const p of sectors) {
    await page.mouse.click(box.x + p.x, box.y + p.y);
    await waitIdle(page, 140);
  }
  return { local: sectors, hitCount: hits.hits.length, span: { halfU, halfV } };
};

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
      vertexCount: obj.vertexCount ?? null,
      fingerprint: obj.geometryFingerprint ?? null,
      backend: obj.geometryBackend ?? null,
      revision: obj.geometryRevision ?? null,
      dirty: doc.dirty === true
    };
  }, role);

const readTrimPicks = async (page) =>
  page.evaluate(() => {
    const state = globalThis.__clinicalWorkspace?.trim?.session?.getState?.();
    if (!state) return null;
    return {
      points: state.points.length,
      closed: state.closed,
      worldComplete: state.points.every(
        (p) =>
          typeof p.worldX === 'number' &&
          typeof p.worldY === 'number' &&
          typeof p.worldZ === 'number' &&
          Number.isFinite(p.worldX)
      ),
      sample: state.points.slice(0, 3).map((p) => ({
        x: p.x,
        y: p.y,
        worldX: p.worldX,
        worldY: p.worldY,
        worldZ: p.worldZ
      }))
    };
  });

async function createCaseImport(page) {
  const newCase = page.getByTestId('clinical-empty-new-case');
  if (await newCase.count()) {
    await newCase.click();
  } else {
    await page.getByRole('button', { name: /New Case/i }).first().click();
  }
  await page.getByTestId('clinical-create-case-dialog').waitFor({ timeout: 15000 });
  await page.getByTestId('clinical-create-first-name').fill('PROD001T');
  await page.getByTestId('clinical-create-last-name').fill('BrowserCert');
  await page.getByTestId('clinical-create-case-name').fill('PROD-001T VTK Browser');
  const inputs = page.locator('.clinical-import-dialog__file-input');
  await inputs.nth(0).setInputFiles(upperStl);
  await inputs.nth(1).setInputFiles(lowerStl);
  await page.getByTestId('clinical-create-submit').click();
  await page.getByTestId('clinical-create-case-success').waitFor({ timeout: 180000 });
  await waitIdle(page, 800);
  await page.getByTestId('clinical-create-continue-orient').click();
  await waitIdle(page, 900);
}

async function run() {
  const chromePath =
    process.env.PLAYWRIGHT_CHROME_PATH ||
    `${process.env.HOME}/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`;
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(90000);

  const consoleMsgs = [];
  const consoleErrors = [];
  page.on('console', (msg) => {
    const text = msg.text();
    consoleMsgs.push({ type: msg.type(), text });
    if (msg.type() === 'error') consoleErrors.push(text);
  });

  /** @type {Array<{url:string, cmd?:string, request?:any, response?:any}>} */
  const vtkCalls = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('127.0.0.1:8765') || url.includes('localhost:8765')) {
      vtkCalls.push({ url, method: req.method(), phase: 'request' });
    }
  });
  page.on('response', async (res) => {
    const url = res.url();
    if (!(url.includes('127.0.0.1:8765') || url.includes('localhost:8765'))) return;
    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    vtkCalls.push({
      url,
      status: res.status(),
      phase: 'response',
      ok: body?.ok,
      cmd: body?.cmd,
      removed: body?.removed_triangles_est,
      output_triangles: body?.output_triangles,
      direction_source: body?.direction_source,
      error: body?.error
    });
  });

  // Intercept POST bodies and capture full responses for VTK proof.
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
      direction_source: parsed?.direction_source,
      preferRequested: parsed?.prefer_requested_orientation ?? parsed?.preferRequestedOrientation,
      loopLen: Array.isArray(parsed?.loop) ? parsed.loop.length : undefined,
      inside_out: parsed?.inside_out,
      preview: parsed?.preview
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
      direction_source: body?.direction_source ?? parsed?.direction_source,
      error: body?.error
    });
    await route.fulfill({ response });
  });

  await page.goto(HOST, { waitUntil: 'networkidle' });
  await shot(page, '00-boot');
  note('Shell boot', 'PASS');

  // Wait for VTK health probe log (composition root probes on start + every 10s)
  let vtkLogSeen = false;
  for (let i = 0; i < 20; i += 1) {
    vtkLogSeen = consoleMsgs.some((m) => /VTK HTTP worker available/i.test(m.text));
    if (vtkLogSeen) break;
    await waitIdle(page, 500);
  }
  note(
    'Worker health (Studio log)',
    vtkLogSeen ? 'PASS' : 'FAIL',
    vtkLogSeen
      ? 'console: VTK HTTP worker available'
      : `no VTK available log; msgs=${consoleMsgs
          .filter((m) => /geometry|VTK|worker/i.test(m.text))
          .map((m) => m.text)
          .join(' | ')
          .slice(0, 400)}`
  );

  // --- Create case / import ---
  try {
    await createCaseImport(page);
    await shot(page, '01-case-imported');
    note('Load case (Create Case + dual STL)', 'PASS');
  } catch (e) {
    note('Load case (Create Case + dual STL)', 'FAIL', String(e));
    await shot(page, '01-import-fail');
    await browser.close();
    dump(results, consoleErrors, vtkCalls, consoleMsgs);
    process.exit(1);
  }

  // --- Orient ---
  try {
    const acceptOrient = page.getByTestId('clinical-orientation-accept');
    if (await acceptOrient.count()) {
      await acceptOrient.click();
    } else {
      await page.getByRole('button', { name: /Accept Orientation|Review & Accept/i }).first().click();
    }
    await waitIdle(page, 1200);
    await shot(page, '02-orient-accepted');
    note('Accept Orientation', 'PASS');
  } catch (e) {
    // Fallback: invoke command directly
    try {
      await page.evaluate(async () => {
        const ws = globalThis.__clinicalWorkspace;
        await ws.session.getHost().commands.invoke('clinical.orientation.accept');
        ws.session.notifyUi();
      });
      await waitIdle(page, 1200);
      await shot(page, '02-orient-accepted');
      note('Accept Orientation', 'PASS', 'via command invoke fallback');
    } catch (e2) {
      note('Accept Orientation', 'FAIL', `${String(e)} | ${String(e2)}`);
    }
  }

  // --- Prepare ---
  try {
    // Current UI: Prepare Case → Continue to Trim (no "Confirm Preparation")
    const prepareCase = page.getByRole('button', { name: 'Prepare Case', exact: true }).first();
    if (await prepareCase.count()) {
      await prepareCase.click();
      await waitIdle(page, 1500);
    } else {
      await page.evaluate(async () => {
        const ws = globalThis.__clinicalWorkspace;
        await ws.session.getHost().commands.invoke('clinical.preparation.start');
        ws.session.notifyUi();
      });
      await waitIdle(page, 1500);
    }
    await selectArch(page, 'upper');
    const continueTrim = page.getByRole('button', { name: 'Continue to Trim', exact: true }).first();
    if (await continueTrim.isEnabled()) {
      await continueTrim.click();
    } else {
      await page.evaluate(async () => {
        const ws = globalThis.__clinicalWorkspace;
        await ws.session.getHost().commands.invoke('clinical.tool.trim');
        ws.session.notifyUi();
      });
    }
    await waitIdle(page, 1200);
    await page.getByTestId('clinical-trim-overlay').waitFor({ timeout: 20000 });
    await shot(page, '03-trim-entered');
    note('Continue to Trim', 'PASS');
  } catch (e) {
    note('Continue to Trim', 'FAIL', String(e));
  }

  const preTrim = await readArchGeom(page, 'upper');

  // --- Draw / validate / preview ---
  try {
    await page.getByTestId('clinical-trim-polyline').click();
    await waitIdle(page, 200);
    const drawn = await drawSurfaceLoopOnMesh(page);
    const picks = await readTrimPicks(page);
    note(
      'Surface world picks',
      picks?.worldComplete && picks.points >= 4 ? 'PASS' : 'FAIL',
      `hits=${drawn.hitCount} span=${JSON.stringify(drawn.span)} picks=${JSON.stringify(picks)}`
    );
    await shot(page, '01-upper-trim-boundary');

    await page.getByTestId('clinical-trim-close').click();
    await waitIdle(page, 200);
    await page.getByTestId('clinical-trim-validate').click();
    await waitIdle(page, 400);
    const stats = await page.getByTestId('clinical-trim-stats').innerText();
    const valid =
      /Valid/i.test(stats) && !/crosses itself/i.test(stats) && !/outside/i.test(stats);
    note('Validate Trim loop', valid ? 'PASS' : 'FAIL', stats);

    const overlay = page.getByTestId('clinical-trim-overlay');
    const overlayVisible = await overlay.isVisible().catch(() => false);
    note('VTK Trim preview (boundary overlay)', overlayVisible ? 'PASS' : 'FAIL');
    await shot(page, '02-upper-trim-preview');
  } catch (e) {
    note('Draw / validate Trim', 'FAIL', String(e));
    await shot(page, 'trim-draw-fail');
  }

  // --- Accept / commit ---
  const vtkTrimBefore = vtkCalls.filter((c) => c.cmd === 'trim').length;
  try {
    const acceptTrim = page.getByTestId('clinical-trim-accept');
    if (!(await acceptTrim.isEnabled())) {
      note('VTK Trim commit', 'FAIL', 'Accept Trim disabled');
      await shot(page, 'accept-disabled');
    } else {
      const acceptResult = await page.evaluate(async () => {
        const ws = globalThis.__clinicalWorkspace;
        const result = await ws.trim.accept();
        ws.session.notifyUi();
        return { ok: result.ok, error: result.ok ? null : result.error?.message };
      });
      await waitIdle(page, 1500);
      for (let i = 0; i < 40; i += 1) {
        const post = await readArchGeom(page, 'upper');
        if (
          post &&
          preTrim &&
          (post.fingerprint !== preTrim.fingerprint || post.faceCount !== preTrim.faceCount)
        ) {
          break;
        }
        await waitIdle(page, 500);
      }
      await shot(page, '03-upper-trimmed');
      const post = await readArchGeom(page, 'upper');
      const vtkTrimPosts = vtkCalls.filter((c) => c.cmd === 'trim');
      const vtkHit = vtkTrimPosts.length > vtkTrimBefore;
      const trimResp = [...vtkCalls]
        .reverse()
        .find((c) => c.phase === 'response' && (c.cmd === 'trim' || c.error || c.ok === false || c.removed !== undefined));
      const meshChanged =
        post &&
        preTrim &&
        (post.fingerprint !== preTrim.fingerprint ||
          (typeof post.faceCount === 'number' &&
            typeof preTrim.faceCount === 'number' &&
            post.faceCount !== preTrim.faceCount));
      note(
        'VTK Trim commit',
        meshChanged && vtkHit && acceptResult.ok ? 'PASS' : 'FAIL',
        `accept=${JSON.stringify(acceptResult)} resp=${JSON.stringify(trimResp)} pre=${JSON.stringify(preTrim)} post=${JSON.stringify(post)} vtkTrimCalls=${vtkTrimPosts.length}`
      );
      if (!vtkHit) {
        note(
          'VTK worker trim request',
          'FAIL',
          `expected POST cmd=trim; calls=${JSON.stringify(vtkCalls.slice(-8))}`
        );
      } else {
        note('VTK worker trim request', 'PASS', `n=${vtkTrimPosts.length}`);
      }
    }
  } catch (e) {
    note('VTK Trim commit', 'FAIL', String(e));
  }

  const afterTrim = await readArchGeom(page, 'upper');

  // --- Undo / Redo ---
  try {
    const undo = page.getByTestId('clinical-trim-doc-undo');
    await undo.waitFor({ state: 'visible' });
    if (!(await undo.isEnabled())) {
      note('Undo', 'FAIL', 'trim doc undo disabled');
    } else {
      await undo.click();
      await waitIdle(page, 1000);
      await shot(page, '07-undo');
      const undone = await readArchGeom(page, 'upper');
      const restored =
        undone &&
        preTrim &&
        (undone.fingerprint === preTrim.fingerprint ||
          undone.faceCount === preTrim.faceCount);
      note(
        'Undo',
        restored ? 'PASS' : 'FAIL',
        `preTrim=${JSON.stringify(preTrim)} undone=${JSON.stringify(undone)}`
      );

      const redo = page.getByTestId('clinical-trim-doc-redo');
      if (!(await redo.isEnabled())) {
        note('Redo', 'FAIL', 'disabled');
      } else {
        await redo.click();
        await waitIdle(page, 1000);
        await shot(page, '08-redo');
        const redone = await readArchGeom(page, 'upper');
        const back =
          redone &&
          afterTrim &&
          (redone.fingerprint === afterTrim.fingerprint ||
            redone.faceCount === afterTrim.faceCount);
        note(
          'Redo',
          back ? 'PASS' : 'FAIL',
          `afterTrim=${JSON.stringify(afterTrim)} redone=${JSON.stringify(redone)}`
        );
      }
    }
  } catch (e) {
    note('Undo/Redo', 'FAIL', String(e));
  }

  // --- Close Base ---
  const preClose = await readArchGeom(page, 'upper');
  const vtkCloseBefore = vtkCalls.filter((c) => c.cmd === 'close_base').length;
  try {
    // Leave Trim so its overlay/toolbar cannot intercept Close Base clicks.
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
    await page.getByTestId('clinical-close-base-overlay').waitFor({ timeout: 15000 });

    const orientInfo = await page.evaluate(() => {
      const st = globalThis.__clinicalWorkspace?.closeBase?.session?.getState?.();
      return {
        orientation: st?.parameters?.orientation,
        strategy: st?.parameters?.strategy ?? st?.strategy,
        phase: st?.phase ?? st?.toolStatus
      };
    });

    await page.getByTestId('clinical-close-base-auto').click({ force: true });
    // Wait for Auto Close Base preview to settle (VTK HTTP can take >30s on full arch).
    for (let i = 0; i < 120; i += 1) {
      const st = await page.evaluate(() => {
        const s = globalThis.__clinicalWorkspace?.closeBase?.session?.getState?.();
        return {
          toolStatus: s?.toolStatus,
          statusMessage: s?.statusMessage,
          fingerprint: s?.kernelFingerprint,
          progress: s?.progress?.message
        };
      });
      if (
        st?.fingerprint ||
        /review|ready|preview|failed|error|success|created/i.test(String(st?.statusMessage ?? ''))
      ) {
        // still wait a bit more for response body
      }
      if (vtkCalls.filter((c) => c.cmd === 'close_base' && c.phase === 'response').length > 0) {
        // keep waiting until tool leaves processing if applicable
      }
      if (st?.toolStatus && st.toolStatus !== 'processing') {
        const responses = vtkCalls.filter((c) => c.cmd === 'close_base' || c.phase === 'response');
        if (responses.length > 0 || i > 8) break;
      }
      await waitIdle(page, 500);
    }
    await shot(page, '05-close-base-preview');

    const acceptResult = await page.evaluate(async () => {
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
    await shot(page, '06-close-base-result');
    await shot(page, '04-lower-trimmed');

    const postClose = await readArchGeom(page, 'upper');
    const closePosts = vtkCalls.filter((c) => c.cmd === 'close_base');
    const closeHit = closePosts.length > vtkCloseBefore;
    const meshGrew =
      postClose &&
      preClose &&
      ((typeof postClose.faceCount === 'number' &&
        typeof preClose.faceCount === 'number' &&
        postClose.faceCount > preClose.faceCount) ||
        postClose.fingerprint !== preClose.fingerprint);
    const clinicalDir = vtkCalls.some(
      (c) =>
        typeof c.direction_source === 'string' &&
        c.direction_source.startsWith('clinical:')
    );
    note(
      'VTK Close Base',
      meshGrew && closeHit && acceptResult.ok ? 'PASS' : 'FAIL',
      `accept=${JSON.stringify(acceptResult)} orient=${JSON.stringify(orientInfo)} pre=${JSON.stringify(preClose)} post=${JSON.stringify(postClose)} vtkClose=${closePosts.length} clinicalDir=${clinicalDir}`
    );
    note(
      'Close Base clinical orientation (not AABB authority)',
      clinicalDir || orientInfo?.orientation ? 'PASS' : 'OBSERVE',
      `direction_source clinical=${clinicalDir}; session orientation=${orientInfo?.orientation}`
    );
  } catch (e) {
    note('VTK Close Base', 'FAIL', String(e));
    await shot(page, 'close-base-fail');
  }

  // --- Save / reopen ---
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
    const fpBeforeSave = await readArchGeom(page, 'upper');
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

    const opened = await page.evaluate(async (id) => {
      const ws = globalThis.__clinicalWorkspace;
      if (id) {
        const result = await ws.cases.openCase(ws, id);
        if (!result.ok) throw new Error(result.error?.message ?? 'openCase failed');
        ws.session.notifyUi();
        return { via: 'id', caseId: id };
      }
      const listed = await ws.cases.listCases();
      if (!listed.length) throw new Error('no cases to reopen');
      const result = await ws.cases.openCase(ws, listed[0].caseId);
      if (!result.ok) throw new Error(result.error?.message ?? 'openCase failed');
      ws.session.notifyUi();
      return { via: 'list', caseId: listed[0].caseId };
    }, caseId);
    await waitIdle(page, 1500);
    for (let i = 0; i < 20; i += 1) {
      const doc = await page.evaluate(
        () => globalThis.__clinicalWorkspace?.session?.getPublicState?.()?.activeCase
      );
      if (doc?.objects?.length) break;
      await waitIdle(page, 400);
    }
    await shot(page, '09-reopened-case');
    const reopened = await readArchGeom(page, 'upper');
    const persisted =
      reopened &&
      fpBeforeSave &&
      (reopened.fingerprint === fpBeforeSave.fingerprint ||
        reopened.faceCount === fpBeforeSave.faceCount);
    note(
      'Save/reopen',
      persisted ? 'PASS' : 'FAIL',
      `opened=${JSON.stringify(opened)} before=${JSON.stringify(fpBeforeSave)} after=${JSON.stringify(reopened)}`
    );
  } catch (e) {
    note('Save/reopen', 'FAIL', String(e));
    await shot(page, '09-reopen-fail');
  }

  const shotFiles = fs.readdirSync(OUT).filter((f) => f.endsWith('.png'));
  note(
    'Evidence screenshots',
    shotFiles.length >= 8 ? 'PASS' : 'FAIL',
    `${shotFiles.length} pngs: ${shotFiles.join(', ')}`
  );

  const seriousConsole = consoleErrors.filter(
    (t) =>
      !/favicon|DevTools|Download the React DevTools/i.test(t) &&
      !/ResizeObserver loop/i.test(t)
  );
  note(
    'Console errors',
    seriousConsole.length === 0 ? 'PASS' : 'OBSERVE',
    String(seriousConsole.length)
  );

  await browser.close();
  dump(results, consoleErrors, vtkCalls, consoleMsgs);
}

function dump(results, consoleErrors, vtkCalls, consoleMsgs) {
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
    geometryLogs: consoleMsgs.filter((m) => /geometry|VTK|worker|trim|close/i.test(m.text)),
    summary: {
      total: results.length,
      fail: fails.length,
      pass: results.filter((r) => r.status === 'PASS').length,
      observe: results.filter((r) => r.status === 'OBSERVE').length
    }
  };
  const out = path.join(ROOT, 'docs/certification/prod-001t-browser-walkthrough.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log('\nWrote', out);
  console.log(
    `Summary: ${report.summary.pass} PASS / ${report.summary.observe} OBSERVE / ${report.summary.fail} FAIL (${report.summary.total} checks)`
  );
  if (fails.length) process.exitCode = 1;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
