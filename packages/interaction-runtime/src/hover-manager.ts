import type { InteractionTargetId, Point2D, PointerId } from './types.js';

export type HoverPhase = 'enter' | 'leave' | 'move' | 'none';

export interface HoverResolution {
  readonly phase: HoverPhase;
  readonly previous: InteractionTargetId | undefined;
  readonly current: InteractionTargetId | undefined;
  readonly position: Point2D;
  readonly pointerId: PointerId | undefined;
}

/**
 * Hover enter/leave/move tracking without picking or scene traversal.
 * Target ids are supplied by the host/consumer (opaque).
 */
export class HoverManager {
  private current: InteractionTargetId | undefined;
  private lastPosition: Point2D = Object.freeze({ x: 0, y: 0 });
  private enterCount = 0;
  private leaveCount = 0;

  public resolve(input: {
    readonly targetId: InteractionTargetId | undefined;
    readonly position: Point2D;
    readonly pointerId?: PointerId;
  }): HoverResolution {
    const previous = this.current;
    this.lastPosition = Object.freeze({ x: input.position.x, y: input.position.y });
    if (previous === input.targetId) {
      return Object.freeze({
        phase: input.targetId === undefined ? 'none' : 'move',
        previous,
        current: this.current,
        position: this.lastPosition,
        pointerId: input.pointerId
      });
    }
    if (previous !== undefined && input.targetId === undefined) {
      this.current = undefined;
      this.leaveCount += 1;
      return Object.freeze({
        phase: 'leave',
        previous,
        current: undefined,
        position: this.lastPosition,
        pointerId: input.pointerId
      });
    }
    if (previous === undefined && input.targetId !== undefined) {
      this.current = input.targetId;
      this.enterCount += 1;
      return Object.freeze({
        phase: 'enter',
        previous: undefined,
        current: input.targetId,
        position: this.lastPosition,
        pointerId: input.pointerId
      });
    }
    // target changed
    this.leaveCount += 1;
    this.enterCount += 1;
    this.current = input.targetId;
    return Object.freeze({
      phase: previous !== undefined ? 'leave' : 'enter',
      previous,
      current: input.targetId,
      position: this.lastPosition,
      pointerId: input.pointerId
    });
  }

  /** Explicit leave when target changes require paired enter. */
  public resolveTransition(input: {
    readonly targetId: InteractionTargetId | undefined;
    readonly position: Point2D;
    readonly pointerId?: PointerId;
  }): readonly HoverResolution[] {
    const previous = this.current;
    if (previous === input.targetId) {
      return Object.freeze([this.resolve(input)]);
    }
    const events: HoverResolution[] = [];
    if (previous !== undefined) {
      this.current = undefined;
      this.leaveCount += 1;
      events.push(
        Object.freeze({
          phase: 'leave' as const,
          previous,
          current: undefined,
          position: Object.freeze({ x: input.position.x, y: input.position.y }),
          pointerId: input.pointerId
        })
      );
    }
    if (input.targetId !== undefined) {
      this.current = input.targetId;
      this.enterCount += 1;
      events.push(
        Object.freeze({
          phase: 'enter' as const,
          previous: undefined,
          current: input.targetId,
          position: Object.freeze({ x: input.position.x, y: input.position.y }),
          pointerId: input.pointerId
        })
      );
    }
    this.lastPosition = Object.freeze({ x: input.position.x, y: input.position.y });
    return Object.freeze(events);
  }

  public invalidate(): HoverResolution | undefined {
    if (this.current === undefined) {
      return undefined;
    }
    const previous = this.current;
    this.current = undefined;
    this.leaveCount += 1;
    return Object.freeze({
      phase: 'leave',
      previous,
      current: undefined,
      position: this.lastPosition,
      pointerId: undefined
    });
  }

  public getTarget(): InteractionTargetId | undefined {
    return this.current;
  }

  public getEnterCount(): number {
    return this.enterCount;
  }

  public getLeaveCount(): number {
    return this.leaveCount;
  }

  public clear(): void {
    this.current = undefined;
  }
}
