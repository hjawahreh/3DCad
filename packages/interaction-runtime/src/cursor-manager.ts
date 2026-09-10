import type { CursorId, InteractionTargetId } from './types.js';
import { asCursorId } from './types.js';
import { interactionFailure, interactionSuccess, type InteractionResult } from './types.js';

export interface CursorRegistration {
  readonly id: CursorId;
  readonly name: string;
}

/**
 * Cursor registration / switching / ownership / lifecycle.
 * No UI styling — only opaque cursor ids for host adapters.
 */
export class CursorManager {
  private readonly registry = new Map<string, CursorRegistration>();
  private active: CursorId | undefined;
  private owner: InteractionTargetId | undefined;

  public register(name: string, id?: string): InteractionResult<CursorRegistration> {
    const cursorId = asCursorId(id ?? name);
    if (this.registry.has(cursorId as string)) {
      return interactionFailure('conflict', `Cursor ${cursorId} already registered`);
    }
    const entry = Object.freeze({ id: cursorId, name });
    this.registry.set(cursorId as string, entry);
    return interactionSuccess(entry);
  }

  public setCursor(
    cursorId: CursorId | string,
    owner?: InteractionTargetId
  ): InteractionResult<{
    readonly previous: CursorId | undefined;
    readonly current: CursorId;
    readonly owner: InteractionTargetId | undefined;
  }> {
    const id = typeof cursorId === 'string' ? asCursorId(cursorId) : cursorId;
    if (!this.registry.has(id as string)) {
      return interactionFailure('not-found', `Cursor ${id} is not registered`);
    }
    if (
      this.owner !== undefined &&
      owner !== undefined &&
      this.owner !== owner &&
      this.active !== undefined
    ) {
      return interactionFailure(
        'conflict',
        `Cursor owned by ${this.owner}; ${owner} cannot switch`
      );
    }
    const previous = this.active;
    this.active = id;
    if (owner !== undefined) {
      this.owner = owner;
    }
    return interactionSuccess({
      previous,
      current: id,
      owner: this.owner
    });
  }

  public release(owner: InteractionTargetId): InteractionResult<void> {
    if (this.owner !== undefined && this.owner !== owner) {
      return interactionFailure('conflict', `Cursor release denied for ${owner}`);
    }
    this.owner = undefined;
    return interactionSuccess(undefined);
  }

  public getActive(): CursorId | undefined {
    return this.active;
  }

  public getOwner(): InteractionTargetId | undefined {
    return this.owner;
  }

  public list(): readonly CursorRegistration[] {
    return Object.freeze([...this.registry.values()]);
  }

  public clear(): void {
    this.registry.clear();
    this.active = undefined;
    this.owner = undefined;
  }
}
