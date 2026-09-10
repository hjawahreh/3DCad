import type { OperationHandler } from './operation.js';
import {
  opFailure,
  opSuccess,
  RESERVED_OPERATION_KINDS,
  type OperationKind,
  type OperationResult
} from './types.js';

export interface OperationRegistration {
  readonly kind: OperationKind;
  readonly name: string;
  readonly requiresKernel: boolean;
  readonly undoable: boolean;
  readonly handler?: OperationHandler;
}

/**
 * Registry of operation kinds and optional handlers.
 * Clinical packages register handlers; reserved kinds are always listed.
 */
export class OperationRegistry {
  private readonly entries = new Map<OperationKind, OperationRegistration>();

  public constructor() {
    for (const kind of RESERVED_OPERATION_KINDS) {
      this.entries.set(kind, {
        kind,
        name: kind,
        requiresKernel: true,
        undoable: true
      });
    }
  }

  public register(registration: OperationRegistration): OperationResult<void> {
    const existing = this.entries.get(registration.kind);
    if (existing?.handler !== undefined && registration.handler !== undefined) {
      return opFailure('conflict', `Handler for ${registration.kind} already registered`);
    }
    this.entries.set(registration.kind, {
      ...existing,
      ...registration,
      kind: registration.kind
    });
    return opSuccess(undefined);
  }

  public registerHandler(handler: OperationHandler): OperationResult<void> {
    return this.register({
      kind: handler.kind,
      name: handler.kind,
      requiresKernel: true,
      undoable: true,
      handler
    });
  }

  public get(kind: OperationKind): OperationRegistration | undefined {
    return this.entries.get(kind);
  }

  public getHandler(kind: OperationKind): OperationHandler | undefined {
    return this.entries.get(kind)?.handler;
  }

  public list(): readonly OperationRegistration[] {
    return [...this.entries.values()];
  }

  public kinds(): readonly OperationKind[] {
    return [...this.entries.keys()];
  }

  public has(kind: OperationKind): boolean {
    return this.entries.has(kind);
  }
}
