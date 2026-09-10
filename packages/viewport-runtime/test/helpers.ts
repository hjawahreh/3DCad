import type { FrameClock, ViewportCanvasElement } from '../src/index.js';

export const createManualClock = (): FrameClock & {
  readonly advance: (ms: number) => void;
  readonly flush: () => void;
} => {
  let now = 0;
  const queue: Array<{ readonly handle: number; readonly cb: (t: number) => void }> = [];
  let nextHandle = 1;
  return {
    now: () => now,
    requestFrame: (cb) => {
      const handle = nextHandle;
      nextHandle += 1;
      queue.push({ handle, cb });
      return handle;
    },
    cancelFrame: (handle) => {
      const index = queue.findIndex((item) => item.handle === handle);
      if (index >= 0) {
        queue.splice(index, 1);
      }
    },
    advance: (ms) => {
      now += ms;
    },
    flush: () => {
      const pending = queue.splice(0, queue.length);
      for (const item of pending) {
        item.cb(now);
      }
    }
  };
};

export const createFakeCanvas = (
  width = 800,
  height = 600
): ViewportCanvasElement => ({
  width,
  height,
  clientWidth: width,
  clientHeight: height,
  getContext: () => null
});
