import { describe, expect, it } from 'vitest';
import {
  asInteractionTargetId,
  EMPTY_MODIFIERS,
  InteractionLifecycle,
  InteractionRuntime,
  type InteractionEvent,
  type RawPlatformInput
} from '../src/index.js';

const clock = { now: () => 1000 };

const bootstrap = () => {
  const runtime = new InteractionRuntime({ clock });
  const session = runtime.bootstrapSession();
  expect(session.ok).toBe(true);
  if (!session.ok) {
    throw new Error('bootstrap failed');
  }
  return { runtime, session: session.value };
};

describe('InteractionLifecycle', () => {
  it('follows create → ready → active → paused → shutdown → dispose', () => {
    const life = new InteractionLifecycle();
    expect(life.transition('initializing')).toBe(true);
    expect(life.transition('ready')).toBe(true);
    expect(life.transition('active')).toBe(true);
    expect(life.transition('paused')).toBe(true);
    expect(life.transition('active')).toBe(true);
    expect(life.transition('shutting-down')).toBe(true);
    expect(life.transition('shutdown')).toBe(true);
    expect(life.transition('disposed')).toBe(true);
  });
});

describe('session lifecycle', () => {
  it('bootstraps, pauses, resumes, disposes', () => {
    const { runtime, session } = bootstrap();
    expect(session.getLifecyclePhase()).toBe('active');
    expect(session.pause().ok).toBe(true);
    expect(session.getLifecyclePhase()).toBe('paused');
    expect(session.resume().ok).toBe(true);
    expect(session.dispose().ok).toBe(true);
    expect(session.getLifecyclePhase()).toBe('disposed');
    runtime.dispose();
  });
});

describe('event routing', () => {
  it('routes pointer / mouse / keyboard / wheel / touch immutably', () => {
    const { runtime, session } = bootstrap();
    const seen: InteractionEvent[] = [];
    session.subscribe((e) => seen.push(e));

    const inputs: RawPlatformInput[] = [
      {
        kind: 'pointer',
        phase: 'down',
        pointerId: 1,
        pointerType: 'mouse',
        position: { x: 10, y: 20 },
        buttons: 1,
        button: 'primary',
        modifiers: EMPTY_MODIFIERS,
        timestamp: 900,
        targetId: 'surface'
      },
      {
        kind: 'mouse',
        phase: 'move',
        position: { x: 11, y: 21 },
        buttons: 0,
        button: 'none',
        modifiers: EMPTY_MODIFIERS,
        timestamp: 901,
        targetId: 'surface'
      },
      {
        kind: 'keyboard',
        phase: 'down',
        key: 'a',
        code: 'KeyA',
        modifiers: EMPTY_MODIFIERS,
        repeat: false,
        timestamp: 902
      },
      {
        kind: 'wheel',
        position: { x: 11, y: 21 },
        deltaX: 0,
        deltaY: -40,
        deltaZ: 0,
        deltaMode: 'pixel',
        modifiers: EMPTY_MODIFIERS,
        timestamp: 903
      },
      {
        kind: 'touch',
        phase: 'start',
        touches: [{ identifier: 0, position: { x: 1, y: 2 } }],
        modifiers: EMPTY_MODIFIERS,
        timestamp: 904
      }
    ];

    for (const input of inputs) {
      const result = session.handle(input);
      expect(result.ok).toBe(true);
    }

    const kinds = seen.map((e) => e.kind);
    expect(kinds).toContain('pointer');
    expect(kinds).toContain('mouse');
    expect(kinds).toContain('keyboard');
    expect(kinds).toContain('wheel');
    expect(kinds).toContain('touch');
    expect(Object.isFrozen(seen[0])).toBe(true);

    runtime.dispose();
  });
});

describe('pointer capture', () => {
  it('captures, validates ownership, and releases', () => {
    const { runtime, session } = bootstrap();
    const owner = asInteractionTargetId('tool-a');
    const other = asInteractionTargetId('tool-b');
    expect(session.capturePointer(1, owner).ok).toBe(true);
    expect(session.capturePointer(1, other).ok).toBe(false);
    expect(session.releasePointer(1, other).ok).toBe(false);
    expect(session.releasePointer(1, owner).ok).toBe(true);
    runtime.dispose();
  });

  it('emits lost capture on pointer cancel', () => {
    const { runtime, session } = bootstrap();
    const owner = asInteractionTargetId('tool-a');
    session.capturePointer(7, owner);
    const seen: InteractionEvent[] = [];
    session.subscribe((e) => seen.push(e));
    session.handle({
      kind: 'pointer',
      phase: 'cancel',
      pointerId: 7,
      pointerType: 'touch',
      position: { x: 0, y: 0 },
      buttons: 0,
      button: 'none',
      modifiers: EMPTY_MODIFIERS,
      timestamp: 1
    });
    expect(seen.some((e) => e.kind === 'capture' && e.phase === 'lost')).toBe(true);
    runtime.dispose();
  });
});

describe('hover and focus', () => {
  it('emits hover enter/leave without picking', () => {
    const { runtime, session } = bootstrap();
    const seen: InteractionEvent[] = [];
    session.subscribe((e) => seen.push(e));
    session.handle({
      kind: 'pointer',
      phase: 'move',
      pointerId: 1,
      pointerType: 'mouse',
      position: { x: 1, y: 1 },
      buttons: 0,
      button: 'none',
      modifiers: EMPTY_MODIFIERS,
      timestamp: 1,
      targetId: 'a'
    });
    session.handle({
      kind: 'pointer',
      phase: 'move',
      pointerId: 1,
      pointerType: 'mouse',
      position: { x: 2, y: 2 },
      buttons: 0,
      button: 'none',
      modifiers: EMPTY_MODIFIERS,
      timestamp: 2,
      targetId: 'b'
    });
    const hovers = seen.filter((e) => e.kind === 'hover');
    expect(hovers.some((e) => e.phase === 'enter')).toBe(true);
    expect(hovers.some((e) => e.phase === 'leave')).toBe(true);
    expect(session.invalidateHover().ok).toBe(true);
    runtime.dispose();
  });

  it('manages focus and blur', () => {
    const { runtime, session } = bootstrap();
    const owner = asInteractionTargetId('focus-owner');
    expect(session.setFocus(owner).ok).toBe(true);
    expect(session.getFocus().getOwner()).toBe(owner);
    expect(session.blurFocus(owner).ok).toBe(true);
    expect(session.getFocus().getOwner()).toBeUndefined();
    runtime.dispose();
  });
});

describe('keyboard and wheel', () => {
  it('updates modifiers from keyboard and counts wheel', () => {
    const { runtime, session } = bootstrap();
    session.handle({
      kind: 'keyboard',
      phase: 'down',
      key: 'Shift',
      code: 'ShiftLeft',
      modifiers: { ...EMPTY_MODIFIERS, shift: true },
      repeat: false,
      timestamp: 1
    });
    expect(session.getState().modifiers.shift).toBe(true);
    session.handle({
      kind: 'wheel',
      position: { x: 0, y: 0 },
      deltaX: 0,
      deltaY: 1,
      deltaZ: 0,
      deltaMode: 'line',
      modifiers: EMPTY_MODIFIERS,
      timestamp: 2
    });
    expect(session.getMetrics().snapshot().wheelCount).toBe(1);
    expect(session.getMetrics().snapshot().keyboardCount).toBe(1);
    runtime.dispose();
  });
});

describe('diagnostics', () => {
  it('records event counts and capture failures', () => {
    const { runtime, session } = bootstrap();
    session.capturePointer(1, asInteractionTargetId('a'));
    session.capturePointer(1, asInteractionTargetId('b'));
    const snap = session.getDiagnostics().snapshot();
    expect(snap.captureFailures).toBeGreaterThan(0);
    expect(snap.eventCounts.capture).toBeGreaterThan(0);
    runtime.dispose();
  });
});
