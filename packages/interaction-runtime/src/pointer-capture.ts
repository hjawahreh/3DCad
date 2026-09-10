import type { InteractionTargetId, PointerId } from './types.js';
import { asPointerId } from './types.js';
import { interactionFailure, interactionSuccess, type InteractionResult } from './types.js';

interface CaptureRecord {
  readonly pointerId: PointerId;
  readonly owner: InteractionTargetId;
  readonly depth: number;
}

/**
 * Pointer capture ownership with nested safety and lost-capture recovery.
 * No picking / scene traversal — owners are opaque target ids supplied by consumers.
 */
export class PointerCaptureManager {
  private readonly captures = new Map<number, CaptureRecord>();
  private depth = 0;

  public capture(
    pointerId: number | PointerId,
    owner: InteractionTargetId
  ): InteractionResult<CaptureRecord> {
    const id = typeof pointerId === 'number' ? asPointerId(pointerId) : pointerId;
    const existing = this.captures.get(Number(id));
    if (existing !== undefined && existing.owner !== owner) {
      return interactionFailure(
        'capture',
        `Pointer ${String(id)} already captured by ${existing.owner}`
      );
    }
    if (existing !== undefined && existing.owner === owner) {
      return interactionSuccess(existing);
    }
    this.depth += 1;
    const record = Object.freeze({
      pointerId: id,
      owner,
      depth: this.depth
    });
    this.captures.set(Number(id), record);
    return interactionSuccess(record);
  }

  public release(
    pointerId: number | PointerId,
    owner: InteractionTargetId
  ): InteractionResult<CaptureRecord> {
    const id = typeof pointerId === 'number' ? asPointerId(pointerId) : pointerId;
    const existing = this.captures.get(Number(id));
    if (existing === undefined) {
      return interactionFailure('not-found', `Pointer ${String(id)} is not captured`);
    }
    if (existing.owner !== owner) {
      return interactionFailure(
        'capture',
        `Release denied: owner ${owner} does not own pointer ${String(id)}`
      );
    }
    this.captures.delete(Number(id));
    return interactionSuccess(existing);
  }

  public forceRelease(pointerId: number | PointerId): CaptureRecord | undefined {
    const id = Number(typeof pointerId === 'number' ? pointerId : pointerId);
    const existing = this.captures.get(id);
    if (existing === undefined) {
      return undefined;
    }
    this.captures.delete(id);
    return existing;
  }

  public ownerOf(pointerId: number | PointerId): InteractionTargetId | undefined {
    const id = Number(typeof pointerId === 'number' ? pointerId : pointerId);
    return this.captures.get(id)?.owner;
  }

  public resolveTarget(
    pointerId: number | PointerId,
    fallback: InteractionTargetId | undefined
  ): InteractionTargetId | undefined {
    return this.ownerOf(pointerId) ?? fallback;
  }

  public activeOwners(): readonly InteractionTargetId[] {
    const owners = new Set<InteractionTargetId>();
    for (const record of this.captures.values()) {
      owners.add(record.owner);
    }
    return Object.freeze([...owners]);
  }

  public capturedPointers(): readonly PointerId[] {
    return Object.freeze([...this.captures.values()].map((r) => r.pointerId));
  }

  public primaryOwner(): InteractionTargetId | undefined {
    let best: CaptureRecord | undefined;
    for (const record of this.captures.values()) {
      if (best === undefined || record.depth > best.depth) {
        best = record;
      }
    }
    return best?.owner;
  }

  public clear(): readonly CaptureRecord[] {
    const lost = Object.freeze([...this.captures.values()]);
    this.captures.clear();
    this.depth = 0;
    return lost;
  }

  public size(): number {
    return this.captures.size;
  }
}
