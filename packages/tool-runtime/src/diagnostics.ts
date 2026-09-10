export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';

export interface DiagnosticEvent {
  readonly at: number;
  readonly level: DiagnosticLevel;
  readonly operationId?: string;
  readonly kind?: string;
  readonly code: string;
  readonly message: string;
}

/** Bounded diagnostic ring buffer for operation runtime observability. */
export class OperationDiagnostics {
  private readonly events: DiagnosticEvent[] = [];

  public constructor(private readonly capacity = 256) {}

  public record(event: Omit<DiagnosticEvent, 'at'> & { readonly at?: number }): void {
    const full: DiagnosticEvent = {
      at: event.at ?? Date.now(),
      level: event.level,
      code: event.code,
      message: event.message,
      ...(event.operationId === undefined ? {} : { operationId: event.operationId }),
      ...(event.kind === undefined ? {} : { kind: event.kind })
    };
    this.events.push(full);
    if (this.events.length > this.capacity) {
      this.events.shift();
    }
  }

  public list(): readonly DiagnosticEvent[] {
    return [...this.events];
  }

  public clear(): void {
    this.events.length = 0;
  }
}
