import { describe, expect, it } from 'vitest';
import {
  CanvasHost,
  FrameInvalidation,
  ViewportDiagnostics,
  ViewportMetrics,
  ViewportResizeManager,
  ViewportRuntime
} from '../src/index.js';
import { createFakeCanvas, createManualClock } from './helpers.js';

describe('resize', () => {
  it('coalesces resize and applies HiDPI buffer size', () => {
    const host = new CanvasHost();
    host.configure({ respectDevicePixelRatio: true });
    host.attach(createFakeCanvas(100, 50));
    host.setDevicePixelRatio(2);
    const manager = new ViewportResizeManager(host);
    manager.requestResize({ width: 200, height: 100 });
    manager.requestResize({ width: 400, height: 200 });
    const info = manager.process();
    expect(info?.cssWidth).toBe(400);
    expect(info?.bufferWidth).toBe(800);
    expect(manager.getResizeCount()).toBe(1);
  });
});

describe('diagnostics and metrics', () => {
  it('records frame and invalidation stats', async () => {
    const clock = createManualClock();
    const runtime = new ViewportRuntime({ clock, forceMockBackend: true });
    const created = runtime.createSession();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await runtime.bootstrapSession(created.value, createFakeCanvas());
    created.value.invalidate('test');
    created.value.run();
    created.value.pumpFrame();
    const metrics = created.value.getMetrics().snapshot();
    const diagnostics = created.value.getDiagnostics().snapshot();
    expect(diagnostics.invalidationCount).toBeGreaterThan(0);
    expect(metrics.frameCount).toBeGreaterThan(0);
    created.value.dispose();
    runtime.dispose();
  });

  it('ViewportMetrics tracks worst/best frames', () => {
    const metrics = new ViewportMetrics();
    metrics.recordFrame({
      frameMs: 4,
      cpuMs: 3,
      presentationLatencyMs: 1,
      now: 100,
      dropped: false
    });
    metrics.recordFrame({
      frameMs: 12,
      cpuMs: 10,
      presentationLatencyMs: 2,
      now: 700,
      dropped: true
    });
    const snap = metrics.snapshot();
    expect(snap.bestFrameMs).toBe(4);
    expect(snap.worstFrameMs).toBe(12);
    expect(snap.droppedFrames).toBe(1);
    expect(snap.fps).toBeGreaterThan(0);
  });

  it('ViewportDiagnostics journals errors', () => {
    const diagnostics = new ViewportDiagnostics(2);
    diagnostics.error('x', 'one', 1);
    diagnostics.error('y', 'two', 2);
    diagnostics.error('z', 'three', 3);
    expect(diagnostics.snapshot().errors).toHaveLength(2);
  });
});

describe('FrameInvalidation', () => {
  it('coalesces reasons until consumed', () => {
    const inv = new FrameInvalidation();
    inv.invalidate('a');
    inv.invalidate('b');
    expect(inv.isPending()).toBe(true);
    const reasons = inv.consume();
    expect(reasons).toContain('a');
    expect(reasons).toContain('b');
    expect(inv.isPending()).toBe(false);
  });
});
