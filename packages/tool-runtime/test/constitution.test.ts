import { describe, expect, it } from 'vitest';
import {
  MockKernelPort,
  OperationHost,
  asDocumentRevision,
  asWorkflowStepId
} from '../src/index.js';

describe('constitutional invariants', () => {
  it('failed operations never yield commit tokens or command intents', async () => {
    const kernel = new MockKernelPort();
    kernel.failNext = { ok: false, error: { code: 'kernel', message: 'nope' } };
    const host = new OperationHost({ kernel });
    const started = host.start({
      kind: 'trim',
      baseRevision: asDocumentRevision(1),
      workflowStepId: asWorkflowStepId('trim')
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect((await started.value.runKernel()).ok).toBe(false);
    expect(started.value.commit().ok).toBe(false);
    expect(host.workflowGate.canAdvance(asWorkflowStepId('trim'), undefined).ok).toBe(false);
  });

  it('commands are only created after validated commit', async () => {
    const host = new OperationHost({ kernel: new MockKernelPort() });
    const started = host.start({
      kind: 'close-base',
      baseRevision: asDocumentRevision(4),
      workflowStepId: asWorkflowStepId('close-base')
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.value.commit().ok).toBe(false);
    expect((await started.value.runKernel()).ok).toBe(true);
    const receipt = started.value.commit();
    expect(receipt.ok).toBe(true);
    if (!receipt.ok) return;
    expect(receipt.value.commandIntent.name).toBe('close-base.commit');
    expect(receipt.value.commandIntent.kernelFingerprint).toBeDefined();
  });

  it('workflow advance requires successful operation commit, not intent', async () => {
    const host = new OperationHost({ kernel: new MockKernelPort() });
    const step = asWorkflowStepId('segmentation');
    expect(host.workflowGate.advance(step, undefined).ok).toBe(false);

    const started = host.start({
      kind: 'segmentation',
      baseRevision: asDocumentRevision(1),
      workflowStepId: step
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect((await started.value.runKernel()).ok).toBe(true);
    const committed = started.value.commit();
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    expect(host.workflowGate.advance(step, committed.value.token.id).ok).toBe(true);
  });
});
