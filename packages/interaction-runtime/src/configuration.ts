export interface InteractionConfiguration {
  readonly maxQueueDepth: number;
  readonly dropWhenFull: boolean;
  readonly trackHover: boolean;
  readonly synthesizeMouseFromPointer: boolean;
  readonly enableReservedGesturePassThrough: boolean;
}

export const DEFAULT_INTERACTION_CONFIGURATION: InteractionConfiguration = Object.freeze({
  maxQueueDepth: 256,
  dropWhenFull: false,
  trackHover: true,
  synthesizeMouseFromPointer: false,
  enableReservedGesturePassThrough: false
});

export const resolveInteractionConfiguration = (
  partial: Partial<InteractionConfiguration> = {}
): InteractionConfiguration =>
  Object.freeze({
    maxQueueDepth: partial.maxQueueDepth ?? DEFAULT_INTERACTION_CONFIGURATION.maxQueueDepth,
    dropWhenFull: partial.dropWhenFull ?? DEFAULT_INTERACTION_CONFIGURATION.dropWhenFull,
    trackHover: partial.trackHover ?? DEFAULT_INTERACTION_CONFIGURATION.trackHover,
    synthesizeMouseFromPointer:
      partial.synthesizeMouseFromPointer ??
      DEFAULT_INTERACTION_CONFIGURATION.synthesizeMouseFromPointer,
    enableReservedGesturePassThrough:
      partial.enableReservedGesturePassThrough ??
      DEFAULT_INTERACTION_CONFIGURATION.enableReservedGesturePassThrough
  });
