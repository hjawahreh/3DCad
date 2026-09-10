import {
  asKernelSessionId,
  kernelFailure,
  kernelSuccess,
  type KernelResult,
  type KernelSessionId
} from './types.js';
import type { ManagedKernelSession } from './session.js';

export type GeometryTransactionPhase =
  | 'open'
  | 'executing'
  | 'validating'
  | 'committed'
  | 'aborted'
  | 'disposed';

/**
 * Reserved Geometry Transaction (ADR-0003).
 * Coordinates multiple kernel ops atomically under one user action — types only for now.
 */
export interface GeometryTransaction {
  readonly id: string;
  readonly sessionId: KernelSessionId;
  readonly phase: GeometryTransactionPhase;
}

export class GeometryTransactionReserve {
  private phase: GeometryTransactionPhase = 'open';
  readonly id: string;

  public constructor(private readonly session: ManagedKernelSession) {
    this.id = `gtx-${session.id}`;
  }

  public snapshot(): GeometryTransaction {
    return {
      id: this.id,
      sessionId: this.session.id,
      phase: this.phase
    };
  }

  public begin(): KernelResult<GeometryTransaction> {
    if (this.phase !== 'open') {
      return kernelFailure('conflict', `Transaction already ${this.phase}`);
    }
    this.phase = 'executing';
    return kernelSuccess(this.snapshot());
  }

  public abort(): KernelResult<GeometryTransaction> {
    if (this.phase === 'committed' || this.phase === 'disposed') {
      return kernelFailure('invalid', `Cannot abort transaction in ${this.phase}`);
    }
    this.phase = 'aborted';
    return kernelSuccess(this.snapshot());
  }

  /** Commit is reserved — always fails until multi-op atomicity ships. */
  public commit(): KernelResult<never> {
    return kernelFailure(
      'unavailable',
      'Geometry Transaction commit is reserved; not implemented in COD-006'
    );
  }

  public dispose(): void {
    this.phase = 'disposed';
  }
}

/** Helper to show session id branding for reserved APIs. */
export const reservedTransactionSessionId = (raw: string): KernelSessionId =>
  asKernelSessionId(raw);
