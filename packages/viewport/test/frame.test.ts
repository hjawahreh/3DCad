import { describe, expect, it } from 'vitest';
import { createDefaultGraph, createRenderer } from '../src/index.js';

const createMockRenderer = async (id: string) => {
  const result = await createRenderer({
    id,
    forceBackend: 'mock',
    preferredBackend: 'mock',
    canvasSize: { width: 64, height: 64 }
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
};

describe('frame pipeline', () => {
  it('runs a full frame with the default graph', async () => {
    const renderer = await createMockRenderer('frame-default');
    expect(renderer.getGraph().schedule.map(String)).toEqual(
      createDefaultGraph().schedule.map(String)
    );

    let updated = false;
    const frame = renderer.renderFrame(() => {
      updated = true;
    });
    expect(frame.ok).toBe(true);
    expect(updated).toBe(true);
    expect(renderer.metrics.snapshot().frameStats.frameCount).toBeGreaterThanOrEqual(0);
    renderer.dispose();
  });

  it('rejects overlapping frames', async () => {
    const renderer = await createMockRenderer('frame-overlap');
    let nestedCode: string | undefined;
    const outer = renderer.renderFrame(() => {
      const nested = renderer.renderFrame();
      expect(nested.ok).toBe(false);
      if (!nested.ok) nestedCode = nested.error.code;
    });
    expect(outer.ok).toBe(true);
    expect(nestedCode).toBe('conflict');
    renderer.dispose();
  });

  it('captures screenshots through the screenshot service', async () => {
    const renderer = await createMockRenderer('frame-shot');
    expect(renderer.renderFrame().ok).toBe(true);
    const shot = await renderer.screenshots.capture({
      width: 16,
      height: 16
    });
    expect(shot.ok).toBe(true);
    if (!shot.ok) return;
    expect(shot.value).toBeInstanceOf(Uint8ClampedArray);
    expect(shot.value.byteLength).toBeGreaterThan(0);
    renderer.dispose();
  });
});
