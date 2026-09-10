import { describe, expect, it } from 'vitest';
import {
  ProjectLifecycle,
  ProjectRuntime,
  asProjectId,
  asProjectLocationRef,
  createProjectMetadata,
  type ProjectEvent,
  type ImmutableProjectSnapshot
} from '../src/index.js';

const createManualScheduler = () => {
  const tasks = new Map<number, () => void>();
  let next = 1;
  return {
    schedule: (callback: () => void, _delayMs: number) => {
      const handle = next++;
      tasks.set(handle, callback);
      return handle;
    },
    cancel: (handle: number) => {
      tasks.delete(handle);
    },
    flush: () => {
      const pending = [...tasks.values()];
      tasks.clear();
      for (const cb of pending) {
        cb();
      }
    }
  };
};

const bootstrap = () => {
  const scheduler = createManualScheduler();
  let t = 0;
  const clock = {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    }
  };
  const runtime = new ProjectRuntime({
    clock,
    scheduler,
    defaultConfiguration: { autosaveIntervalMs: 10, autosaveEnabled: true }
  });
  const created = runtime.createSession();
  expect(created.ok).toBe(true);
  if (!created.ok) {
    throw new Error('createSession failed');
  }
  return { runtime, session: created.value, scheduler, clock };
};

describe('ProjectLifecycle', () => {
  it('allows create → open → dirty → save → close path', () => {
    const life = new ProjectLifecycle();
    expect(life.transition('opening')).toBe(true);
    expect(life.transition('loading')).toBe(true);
    expect(life.transition('activating')).toBe(true);
    expect(life.transition('active')).toBe(true);
    expect(life.transition('dirty')).toBe(true);
    expect(life.transition('saving')).toBe(true);
    expect(life.transition('active')).toBe(true);
    expect(life.transition('closing')).toBe(true);
    expect(life.transition('closed')).toBe(true);
    expect(life.transition('disposed')).toBe(true);
  });
});

describe('session lifecycle', () => {
  it('creates, modifies, saves, closes, disposes', () => {
    const { runtime, session } = bootstrap();
    const created = session.create({ name: 'Case A' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(session.getLifecyclePhase()).toBe('active');
    expect(created.value.dirty).toBe(false);

    expect(session.modify().ok).toBe(true);
    expect(session.getLifecyclePhase()).toBe('dirty');
    expect(session.getPublicState().dirty).toBe(true);

    expect(session.save().ok).toBe(true);
    expect(session.getLifecyclePhase()).toBe('active');
    expect(session.getPublicState().dirty).toBe(false);

    expect(session.close().ok).toBe(true);
    expect(session.getLifecyclePhase()).toBe('closed');
    expect(session.dispose().ok).toBe(true);
    runtime.dispose();
  });

  it('opens from metadata without file parsing', () => {
    const { runtime, session, clock } = bootstrap();
    const meta = createProjectMetadata({
      id: asProjectId('p-1'),
      name: 'Imported Descriptor',
      location: asProjectLocationRef('file://project.cad'),
      createdAt: clock.now()
    });
    expect(session.open({ metadata: meta }).ok).toBe(true);
    expect(session.getSnapshot()?.metadata.location).toBe('file://project.cad');
    runtime.dispose();
  });
});

describe('dirty state', () => {
  it('tracks dirty duration and rejects close while dirty', () => {
    const { runtime, session, clock } = bootstrap();
    session.create({ name: 'Dirty' });
    session.modify();
    clock.advance(50);
    expect(session.getPublicState().dirty).toBe(true);
    // Refresh metrics dirty duration from current clock
    session.markDirty();
    expect(session.getMetrics().snapshot(clock.now()).dirtyDurationMs).toBeGreaterThanOrEqual(50);
    expect(session.close().ok).toBe(false);
    expect(session.close(true).ok).toBe(true);
    runtime.dispose();
  });
});

describe('autosave', () => {
  it('schedules and completes autosave when dirty', () => {
    const { runtime, session, scheduler } = bootstrap();
    const seen: ProjectEvent[] = [];
    session.getEvents().subscribe((e) => seen.push(e));
    session.create({ name: 'Auto' });
    session.modify();
    scheduler.flush();
    expect(seen.some((e) => e.type === 'autosave' && e.phase === 'completed')).toBe(true);
    expect(seen.some((e) => e.type === 'save' && e.kind === 'autosave')).toBe(true);
    expect(session.getPublicState().dirty).toBe(false);
    expect(session.getMetrics().snapshot(0).autosaveCount).toBeGreaterThan(0);
    runtime.dispose();
  });

  it('supports suppression', () => {
    const { runtime, session, scheduler } = bootstrap();
    session.create({ name: 'Suppress' });
    session.modify();
    session.suppressAutosave();
    scheduler.flush();
    expect(session.getAutosave().recoveryMetadata().suppressedCount).toBeGreaterThan(0);
    runtime.dispose();
  });
});

describe('recent projects', () => {
  it('registers, orders, suppresses duplicates, and removes', () => {
    const { runtime, session, clock } = bootstrap();
    session.create({ name: 'R1', projectId: asProjectId('r1') });
    session.close(true);
    // reuse same session after close
    session.create({ name: 'R2', projectId: asProjectId('r2') });
    session.close(true);
    session.create({ name: 'R1-again', projectId: asProjectId('r1') });
    const recent = runtime.getRecentProjects().list();
    expect(recent[0]?.metadata.id).toBe('r1');
    expect(recent.map((e) => e.metadata.id as string)).toEqual(['r1', 'r2']);
    runtime.getRecentProjects().remove(asProjectId('r2'));
    expect(runtime.getRecentProjects().list()).toHaveLength(1);
    void clock;
    runtime.dispose();
  });
});

describe('snapshots', () => {
  it('publishes immutable snapshots', () => {
    const { runtime, session } = bootstrap();
    session.create({ name: 'Snap' });
    const snap = session.getSnapshot() as ImmutableProjectSnapshot;
    expect(Object.isFrozen(snap)).toBe(true);
    expect(() => {
      (snap as { dirty: boolean }).dirty = true;
    }).toThrow();
    runtime.dispose();
  });
});

describe('diagnostics', () => {
  it('records failed close while dirty', () => {
    const { runtime, session } = bootstrap();
    session.create({ name: 'Diag' });
    session.modify();
    session.close();
    expect(session.getDiagnostics().snapshot().dirtyInconsistencies).toBeGreaterThan(0);
    runtime.dispose();
  });
});

describe('readonly', () => {
  it('rejects modify on read-only projects', () => {
    const { runtime, session } = bootstrap();
    session.create({ name: 'RO', readOnly: true });
    expect(session.modify().ok).toBe(false);
    runtime.dispose();
  });
});
