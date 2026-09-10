import { describe, expect, it } from 'vitest';
import {
  MockKernelPort,
  OperationHost,
  asDocumentRevision,
  asWorkflowStepId
} from '../src/index.js';

describe('workflow commit gate', () => {
  it('blocks workflow advance without commit token', () => {
    const host = new OperationHost({ kernel: new MockKernelPort() });
    const step = asWorkflowStepId('close-base');
    const result = host.workflowGate.canAdvance(step, undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('forbidden');
    }
  });

  it('allows advance only after successful operation commit', async () => {
    const host = new OperationHost({ kernel: new MockKernelPort() });
    const step = asWorkflowStepId('close-base');
    const started = host.start({
      kind: 'close-base',
      baseRevision: asDocumentRevision(10),
      workflowStepId: step,
      params: { height: 1.5 }
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    expect((await started.value.runKernel()).ok).toBe(true);
    const committed = started.value.commit();
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;

    const advanced = host.workflowGate.advance(step, committed.value.token.id);
    expect(advanced.ok).toBe(true);

    const again = host.workflowGate.advance(step, committed.value.token.id);
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.error.code).toBe('conflict');
    }
  });

  it('rejects token for a different workflow step', async () => {
    const host = new OperationHost({ kernel: new MockKernelPort() });
    const started = host.start({
      kind: 'trim',
      baseRevision: asDocumentRevision(1),
      workflowStepId: asWorkflowStepId('trim-step')
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect((await started.value.runKernel()).ok).toBe(true);
    const committed = started.value.commit();
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;

    const wrong = host.workflowGate.canAdvance(
      asWorkflowStepId('other-step'),
      committed.value.token.id
    );
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) {
      expect(wrong.error.code).toBe('forbidden');
    }
  });
});
