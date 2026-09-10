import type { Revision } from './contracts.js';

export interface StateSnapshot<T> {
  readonly revision: Revision;
  readonly value: Readonly<T>;
}

export type StateListener<T> = (snapshot: StateSnapshot<T>) => void;

export class ImmutableStateStore<T extends object> {
  private snapshot: StateSnapshot<T>;
  private readonly listeners = new Set<StateListener<T>>();

  public constructor(initial: T) {
    this.snapshot = Object.freeze({
      revision: 0 as Revision,
      value: deepFreeze(structuredClone(initial))
    });
  }

  public read(): StateSnapshot<T> {
    return this.snapshot;
  }

  public update(reducer: (current: Readonly<T>) => T): StateSnapshot<T> {
    const next = deepFreeze(structuredClone(reducer(this.snapshot.value)));
    this.snapshot = Object.freeze({
      revision: (this.snapshot.revision + 1) as Revision,
      value: next
    });
    for (const listener of this.listeners) listener(this.snapshot);
    return this.snapshot;
  }

  public subscribe(listener: StateListener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const deepFreeze = <T>(value: T): Readonly<T> => {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
  }
  return value;
};
