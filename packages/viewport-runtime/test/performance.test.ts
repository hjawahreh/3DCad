import { describe, expect, it } from 'vitest';
import { FrameLimiter, ResourceLifecycle, ViewportRuntime } from '../src/index.js';
import { createFakeCanvas, createManualClock } from './helpers.js';

describe('performance assumptions', () => {
  it('120 FPS limiter accepts frames ~8.33ms apart', () => {
    const limiter = new FrameLimiter(120);
    const accepted: number[] = [];
    for (let t = 0; t <= 100; t += 1) {
      if (limiter.shouldAccept(t)) {
        accepted.push(t);
      }
    }
    expect(accepted.length).toBeGreaterThanOrEqual(12);
    expect(accepted.length).toBeLessThanOrEqual(14);
  });

  it('resource lifecycle dispose is idempotent and ordered', async () => {
    const order: string[] = [];
    const life = new ResourceLifecycle();
    life.track({ id: 'a', kind: 'other', dispose: () => order.push('a') });
    life.track({ id: 'b', kind: 'other', dispose: () => order.push('b') });
    life.disposeAll();
    life.disposeAll();
    expect(order).toEqual(['b', 'a']);
    expect(life.isDisposed()).toBe(true);
  });

  it('startup stays under documented budget with mock backend', async () => {
    const clock = createManualClock();
    const runtime = new ViewportRuntime({
      clock,
      forceMockBackend: true,
      defaultConfiguration: { startupBudgetMs: 250 }
    });
    const created = runtime.createSession();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    clock.advance(5);
    const boot = await runtime.bootstrapSession(created.value, createFakeCanvas());
    expect(boot.ok).toBe(true);
    created.value.run();
    const warnings = created.value.getDiagnostics().snapshot().warnings;
    expect(warnings.some((w) => w.code === 'startup-budget')).toBe(false);
    created.value.dispose();
    runtime.dispose();
  });
});
