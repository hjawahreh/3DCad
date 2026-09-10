import type { InteractionTargetId } from './types.js';
import { interactionFailure, interactionSuccess, type InteractionResult } from './types.js';

/**
 * Runtime / session focus ownership (active interaction owner).
 * No DOM focus management beyond opaque target ids.
 */
export class FocusManager {
  private owner: InteractionTargetId | undefined;
  private focusCount = 0;
  private blurCount = 0;

  public focus(owner: InteractionTargetId): InteractionResult<{
    readonly previous: InteractionTargetId | undefined;
    readonly current: InteractionTargetId;
  }> {
    const previous = this.owner;
    if (previous === owner) {
      return interactionSuccess({ previous, current: owner });
    }
    this.owner = owner;
    this.focusCount += 1;
    return interactionSuccess({ previous, current: owner });
  }

  public blur(expected?: InteractionTargetId): InteractionResult<{
    readonly previous: InteractionTargetId | undefined;
  }> {
    if (this.owner === undefined) {
      return interactionSuccess({ previous: undefined });
    }
    if (expected !== undefined && this.owner !== expected) {
      return interactionFailure(
        'conflict',
        `Blur denied: expected ${expected}, active ${this.owner}`
      );
    }
    const previous = this.owner;
    this.owner = undefined;
    this.blurCount += 1;
    return interactionSuccess({ previous });
  }

  public getOwner(): InteractionTargetId | undefined {
    return this.owner;
  }

  public getFocusCount(): number {
    return this.focusCount;
  }

  public getBlurCount(): number {
    return this.blurCount;
  }

  public clear(): void {
    this.owner = undefined;
  }
}
