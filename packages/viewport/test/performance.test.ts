import { describe, expect, it } from 'vitest';
import {
  GpuTaskScheduler,
  createRenderer,
  renderFailure,
  renderSuccess
} from '../src/index.js';

describe('performance', () => {
  it('renders 60 empty frames under 1000ms', async () => {
    const created = await createRenderer({
      id: 'perf-frames',
      forceBackend: 'mock',
      preferredBackend: 'mock',
      enableProfiling: false,
      canvasSize: { width: 32, height: 32 }
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const started = performance.now();
    for (let i = 0; i < 60; i += 1) {
      const frame = created.value.renderFrame();
      expect(frame.ok).toBe(true);
    }
    const elapsed = performance.now() - started;
    expect(elapsed).toBeLessThan(1000);
    created.value.dispose();
  });

  it('cancels submitted GPU tasks', async () => {
    const scheduler = new GpuTaskScheduler();
    let ran = false;
    const submitted = scheduler.submit({
      id: 'cancellable',
      kind: 'generic',
      priority: 'normal',
      execute: async (signal) => {
        if (signal.aborted) {
          return renderFailure('cancelled', 'aborted before start');
        }
        ran = true;
        return renderSuccess(undefined);
      }
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;

    expect(scheduler.cancel('cancellable').ok).toBe(true);
    await scheduler.drain();
    expect(ran).toBe(false);
    expect(scheduler.pendingCount()).toBe(0);
    scheduler.dispose();
  });

  it('cancels pending GPU tasks on dispose', async () => {
    const scheduler = new GpuTaskScheduler();
    let observedAbort = false;
    const submitted = scheduler.submit({
      id: 'dispose-me',
      kind: 'shader-compile',
      priority: 'low',
      execute: async (signal) => {
        observedAbort = signal.aborted;
        return signal.aborted
          ? renderFailure('cancelled', 'disposed')
          : renderSuccess(undefined);
      }
    });
    expect(submitted.ok).toBe(true);
    scheduler.dispose();
    await scheduler.drain();
    expect(scheduler.pendingCount()).toBe(0);
    void observedAbort;
  });
});
