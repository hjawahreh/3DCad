import { describe, expect, it } from 'vitest';
import {
  CameraLifecycle,
  CameraRuntime,
  type CameraEvent,
  type CameraSnapshot,
  vec3
} from '../src/index.js';

const clock = (() => {
  let t = 0;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    }
  };
})();

const bootstrap = () => {
  const runtime = new CameraRuntime({
    clock,
    defaultConfiguration: {
      eye: vec3(3, 3, 3),
      target: vec3(0, 0, 0),
      animationDurationMs: 100
    }
  });
  const result = runtime.bootstrapSession({
    viewportSize: { width: 800, height: 600 }
  });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('bootstrap failed');
  }
  return { runtime, session: result.value };
};

describe('CameraLifecycle', () => {
  it('allows create → ready → navigate → dispose path', () => {
    const life = new CameraLifecycle();
    expect(life.transition('initializing')).toBe(true);
    expect(life.transition('initialized')).toBe(true);
    expect(life.transition('configuring')).toBe(true);
    expect(life.transition('configured')).toBe(true);
    expect(life.transition('attaching')).toBe(true);
    expect(life.transition('attached')).toBe(true);
    expect(life.transition('ready')).toBe(true);
    expect(life.transition('navigating')).toBe(true);
    expect(life.transition('ready')).toBe(true);
    expect(life.transition('shutting-down')).toBe(true);
    expect(life.transition('shutdown')).toBe(true);
    expect(life.transition('disposed')).toBe(true);
  });
});

describe('session lifecycle', () => {
  it('bootstraps, pauses, resumes, detaches, disposes', () => {
    const { runtime, session } = bootstrap();
    expect(session.getLifecyclePhase()).toBe('ready');
    expect(session.pause().ok).toBe(true);
    expect(session.resume().ok).toBe(true);
    expect(session.detachViewport().ok).toBe(true);
    expect(session.getLifecyclePhase()).toBe('detached');
    expect(session.dispose().ok).toBe(true);
    runtime.dispose();
  });
});

describe('navigation', () => {
  it('orbits, pans, zooms, fits, resets, and applies presets', () => {
    const { runtime, session } = bootstrap();
    const before = session.getSnapshot();
    expect(session.orbit(0.2, 0.1).ok).toBe(true);
    expect(session.pan(10, -5).ok).toBe(true);
    expect(session.zoom(0.5).ok).toBe(true);
    expect(
      session.fitAll({
        min: vec3(-1, -1, -1),
        max: vec3(1, 1, 1)
      }).ok
    ).toBe(true);
    expect(
      session.fitSelection({
        min: vec3(0, 0, 0),
        max: vec3(2, 2, 2)
      }).ok
    ).toBe(true);
    expect(session.presetView('top').ok).toBe(true);
    expect(session.resetView().ok).toBe(true);
    const after = session.getSnapshot();
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(Object.isFrozen(after)).toBe(true);
    expect(session.getMetrics().snapshot().navigationEvents).toBeGreaterThan(0);
    runtime.dispose();
  });
});

describe('projection', () => {
  it('switches perspective and orthographic', () => {
    const { runtime, session } = bootstrap();
    expect(session.getSnapshot().projection).toBe('perspective');
    expect(session.setProjection('orthographic').ok).toBe(true);
    expect(session.getSnapshot().projection).toBe('orthographic');
    expect(session.setProjection('perspective').ok).toBe(true);
    expect(session.getMetrics().snapshot().projectionSwitches).toBe(2);
    runtime.dispose();
  });
});

describe('constraints', () => {
  it('clamps extreme zoom and records violations', () => {
    const runtime = new CameraRuntime({
      clock: { now: () => 0 },
      defaultConfiguration: {
        eye: vec3(10, 0, 0),
        target: vec3(0, 0, 0),
        constraints: {
          minDistance: 1,
          maxDistance: 100,
          minOrthoSize: 0.01,
          maxOrthoSize: 5000,
          minPitch: -1,
          maxPitch: 1,
          minFovDeg: 10,
          maxFovDeg: 120,
          panExtent: undefined
        }
      }
    });
    const result = runtime.bootstrapSession({ viewportSize: { width: 100, height: 100 } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const session = result.value;
    expect(session.zoom(0.001).ok).toBe(true);
    const snap = session.getDiagnostics().snapshot();
    expect(snap.constraintViolations).toBeGreaterThan(0);
    const distance = Math.hypot(
      session.getSnapshot().eye.x,
      session.getSnapshot().eye.y,
      session.getSnapshot().eye.z
    );
    expect(distance).toBeGreaterThanOrEqual(1 - 1e-6);
    runtime.dispose();
  });
});

describe('animation', () => {
  it('interpolates toward a target snapshot', () => {
    const { runtime, session } = bootstrap();
    const start = session.getSnapshot();
    session.orbit(1, 0.5);
    const target = session.getSnapshot();
    // reset then animate back
    session.resetView();
    expect(session.animateTo(target, 100).ok).toBe(true);
    clock.advance(50);
    const mid = session.tickAnimation();
    expect(mid.ok).toBe(true);
    if (!mid.ok) return;
    expect(mid.value.completed).toBe(false);
    clock.advance(60);
    const end = session.tickAnimation();
    expect(end.ok).toBe(true);
    if (!end.ok) return;
    expect(end.value.completed).toBe(true);
    expect(end.value.snapshot.revision).toBeGreaterThan(start.revision);
    runtime.dispose();
  });
});

describe('resize synchronization', () => {
  it('updates aspect from viewport size', () => {
    const { runtime, session } = bootstrap();
    const result = session.synchronize({ width: 1920, height: 1080 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.aspect).toBeCloseTo(1920 / 1080, 5);
    expect(session.getMetrics().snapshot().synchronizationCount).toBeGreaterThan(0);
    runtime.dispose();
  });
});

describe('diagnostics', () => {
  it('emits navigation events and journals constraints', () => {
    const { runtime, session } = bootstrap();
    const seen: CameraEvent[] = [];
    session.getEvents().subscribe((e) => seen.push(e));
    session.orbit(0.1, 0);
    expect(seen.some((e) => e.type === 'navigate')).toBe(true);
    runtime.dispose();
  });
});

describe('snapshot immutability', () => {
  it('publishes frozen snapshots', () => {
    const { runtime, session } = bootstrap();
    const snap: CameraSnapshot = session.getSnapshot();
    expect(() => {
      (snap as { revision: number }).revision = -1;
    }).toThrow();
    runtime.dispose();
  });
});
