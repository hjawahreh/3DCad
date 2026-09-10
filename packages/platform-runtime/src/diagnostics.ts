import type { Clock } from './contracts.js';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';
export interface HealthCheck {
  readonly id: string;
  check(): Promise<{ readonly status: HealthStatus; readonly detail?: string }>;
}
export interface DiagnosticRecord {
  readonly name: string;
  readonly value: number | string | boolean;
  readonly timestamp: number;
}

export class DiagnosticsRegistry {
  private readonly checks = new Map<string, HealthCheck>();
  private readonly records: DiagnosticRecord[] = [];
  public constructor(
    private readonly clock: Clock,
    private readonly capacity = 1024
  ) {}
  public register(check: HealthCheck): void {
    if (this.checks.has(check.id)) throw new Error('Duplicate health check.');
    this.checks.set(check.id, check);
  }
  public record(name: string, value: number | string | boolean): void {
    this.records.push(Object.freeze({ name, value, timestamp: this.clock.now() }));
    if (this.records.length > this.capacity) this.records.shift();
  }
  public recent(): readonly DiagnosticRecord[] {
    return Object.freeze([...this.records]);
  }
  public async health(): Promise<
    ReadonlyMap<string, { readonly status: HealthStatus; readonly detail?: string }>
  > {
    const result = new Map<string, { readonly status: HealthStatus; readonly detail?: string }>();
    for (const check of this.checks.values())
      result.set(check.id, Object.freeze(await check.check()));
    return result;
  }
}
