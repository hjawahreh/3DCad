import { describe, expect, it } from 'vitest';
import {
  asDocumentRevisionId,
  asDomainEntityId,
  createDocumentEntity,
  createDocumentRevision,
  SceneProjectionEngine
} from '@cad-studio/scene';
import { ViewportRuntime } from '../src/index.js';
import { createFakeCanvas, createManualClock } from './helpers.js';

describe('integration: scene → viewport runtime → graphics', () => {
  it('publishes scene snapshot and presents a frame via mock backend', async () => {
    const clock = createManualClock();
    const runtime = new ViewportRuntime({
      clock,
      forceMockBackend: true,
      defaultConfiguration: { renderMode: 'on-demand', targetFps: 120 }
    });
    const created = runtime.createSession();
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const session = created.value;
    const boot = await runtime.bootstrapSession(session, createFakeCanvas(640, 480));
    expect(boot.ok).toBe(true);
    if (!boot.ok) return;

    const scene = new SceneProjectionEngine({ now: () => clock.now() });
    const projected = scene.project(
      createDocumentRevision(asDocumentRevisionId(1), [
        createDocumentEntity({ id: asDomainEntityId('mesh-a'), kind: 'mesh' })
      ])
    );
    expect(projected.ok).toBe(true);
    if (!projected.ok) return;

    expect(session.publishScene(projected.value.snapshot).ok).toBe(true);
    expect(session.run().ok).toBe(true);

    const frame = session.pumpFrame();
    expect(frame.ok).toBe(true);
    if (!frame.ok) return;
    expect(frame.value.presented).toBe(true);
    expect(frame.value.snapshot?.renderables).toHaveLength(1);
    expect(session.getRendererBridge().getSubmitCount()).toBeGreaterThan(0);

    const metrics = session.getMetrics().snapshot();
    expect(metrics.frameCount).toBeGreaterThan(0);
    const diagnostics = session.getDiagnostics().snapshot();
    expect(diagnostics.backend).toBe('mock');
    expect(diagnostics.renderCount).toBeGreaterThan(0);

    session.dispose();
    scene.dispose();
    runtime.dispose();
  });
});
