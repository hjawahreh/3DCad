import { describe, expect, it } from 'vitest';
import {
  FrameLimiter,
  FrameScheduler,
  ViewportLifecycle,
  ViewportRuntime
} from '../src/index.js';
import { createFakeCanvas, createManualClock } from './helpers.js';

describe('ViewportLifecycle', () => {
  it('follows create → initialize → configure → attach → run → pause → resume → shutdown → dispose', () => {
    const life = new ViewportLifecycle();
    expect(life.getPhase()).toBe('created');
    expect(life.transition('initializing')).toBe(true);
    expect(life.transition('initialized')).toBe(true);
    expect(life.transition('configuring')).toBe(true);
    expect(life.transition('configured')).toBe(true);
    expect(life.transition('attaching')).toBe(true);
    expect(life.transition('attached')).toBe(true);
    expect(life.transition('session-ready')).toBe(true);
    expect(life.transition('running')).toBe(true);
    expect(life.transition('paused')).toBe(true);
    expect(life.transition('running')).toBe(true);
    expect(life.transition('shutting-down')).toBe(true);
    expect(life.transition('shutdown')).toBe(true);
    expect(life.transition('disposed')).toBe(true);
    expect(life.transition('running')).toBe(false);
  });
});

describe('FrameLimiter / FrameScheduler', () => {
  it('throttles frames to target fps', () => {
    const limiter = new FrameLimiter(120);
    expect(limiter.shouldAccept(0)).toBe(true);
    expect(limiter.shouldAccept(1)).toBe(false);
    expect(limiter.shouldAccept(9)).toBe(true);
  });

  it('schedules on-demand frames without busy looping', () => {
    const clock = createManualClock();
    const scheduler = new FrameScheduler(clock, 120, 30);
    scheduler.setMode('on-demand');
    let ticks = 0;
    scheduler.start(() => {
      ticks += 1;
    });
    clock.flush();
    expect(ticks).toBe(0);
    scheduler.requestFrame();
    clock.advance(10);
    clock.flush();
    expect(ticks).toBe(1);
    scheduler.stop();
  });
});

describe('ViewportSession lifecycle', () => {
  it('bootstraps, runs, pauses, resumes, shuts down', async () => {
    const clock = createManualClock();
    const runtime = new ViewportRuntime({ clock, forceMockBackend: true });
    const created = runtime.createSession({
      configuration: { renderMode: 'on-demand', allowMockBackend: true }
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = created.value;

    const boot = await runtime.bootstrapSession(session, createFakeCanvas());
    expect(boot.ok).toBe(true);
    if (!boot.ok) return;
    expect(session.getLifecyclePhase()).toBe('session-ready');

    expect(session.run().ok).toBe(true);
    expect(session.getLifecyclePhase()).toBe('running');
    expect(session.pause().ok).toBe(true);
    expect(session.getLifecyclePhase()).toBe('paused');
    expect(session.resume().ok).toBe(true);
    expect(session.getLifecyclePhase()).toBe('running');
    expect(session.shutdown().ok).toBe(true);
    expect(session.dispose().ok).toBe(true);
    expect(session.getLifecyclePhase()).toBe('disposed');
    runtime.dispose();
  });
});
