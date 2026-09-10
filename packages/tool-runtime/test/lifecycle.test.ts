import { describe, expect, it } from 'vitest';
import {
  MockKernelPort,
  OperationHost,
  asDocumentRevision,
  asWorkflowStepId,
  createPreviewDescriptor,
  opFailure
} from '../src/index.js';

describe('operation lifecycle', () => {
  it('runs preview → kernel → validate → commit', async () => {
    const kernel = new MockKernelPort();
    const host = new OperationHost({ kernel });
    const started = host.start({
      kind: 'trim',
      baseRevision: asDocumentRevision(1),
      workflowStepId: asWorkflowStepId('trim-step'),
      params: { stroke: [[0, 0], [1, 1]] }
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const session = started.value;
    expect(session.setPreview(
      createPreviewDescriptor({
        id: 'p1',
        kind: 'stroke',
        operationId: session.id,
        revision: 1,
        payload: { points: 2 }
      })
    ).ok).toBe(true);
    expect(session.snapshot().phase).toBe('previewing');

    const ran = await session.runKernel();
    expect(ran.ok).toBe(true);
    if (!ran.ok) return;
    expect(ran.value.phase).toBe('ready-to-commit');
    expect(kernel.calls).toHaveLength(1);

    const committed = session.commit();
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    expect(committed.value.commandIntent.name).toBe('trim.commit');
    expect(committed.value.token.workflowStepId).toBe('trim-step');
    expect(session.snapshot().phase).toBe('committed');
  });

  it('denies commit before validation', () => {
    const host = new OperationHost({ kernel: new MockKernelPort() });
    const started = host.start({
      kind: 'close-base',
      baseRevision: asDocumentRevision(0),
      params: { height: 2 }
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const committed = started.value.commit();
    expect(committed.ok).toBe(false);
    if (!committed.ok) {
      expect(committed.error.code).toBe('forbidden');
    }
  });

  it('failed kernel produces no commit token', async () => {
    const kernel = new MockKernelPort();
    kernel.failNext = opFailure('kernel', 'generator failed');
    const host = new OperationHost({ kernel });
    const started = host.start({
      kind: 'close-base',
      baseRevision: asDocumentRevision(3)
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const ran = await started.value.runKernel();
    expect(ran.ok).toBe(false);
    expect(started.value.snapshot().phase).toBe('failed');
    expect(started.value.commit().ok).toBe(false);
    expect(host.commitGate).toBeDefined();
  });

  it('cancel aborts without document intent', async () => {
    const kernel = new MockKernelPort();
    kernel.delayMs = 20;
    const host = new OperationHost({ kernel });
    const started = host.start({
      kind: 'segmentation',
      baseRevision: asDocumentRevision(1)
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    const running = started.value.runKernel();
    const cancelled = started.value.cancel();
    expect(cancelled.ok).toBe(true);
    await running;
    expect(started.value.snapshot().phase).toBe('cancelled');
    expect(started.value.commit().ok).toBe(false);
  });

  it('update after ready-to-commit invalidates prior kernel result', async () => {
    const host = new OperationHost({ kernel: new MockKernelPort() });
    const started = host.start({
      kind: 'movement',
      baseRevision: asDocumentRevision(1),
      params: { dx: 0 }
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect((await started.value.runKernel()).ok).toBe(true);
    expect(started.value.update({ dx: 1 }).ok).toBe(true);
    expect(started.value.snapshot().phase).toBe('active');
    expect(started.value.snapshot().kernelResult).toBeUndefined();
    expect(started.value.commit().ok).toBe(false);
  });
});
