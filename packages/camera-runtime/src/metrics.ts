export interface CameraMetricsSnapshot {
  readonly updateLatencyMs: number;
  readonly navigationEvents: number;
  readonly animationDurationMs: number;
  readonly projectionSwitches: number;
  readonly synchronizationCount: number;
  readonly orbitCount: number;
  readonly panCount: number;
  readonly zoomCount: number;
  readonly fitCount: number;
}

export class CameraMetrics {
  private updateLatencyMs = 0;
  private navigationEvents = 0;
  private animationDurationMs = 0;
  private projectionSwitches = 0;
  private synchronizationCount = 0;
  private orbitCount = 0;
  private panCount = 0;
  private zoomCount = 0;
  private fitCount = 0;

  public recordUpdate(latencyMs: number): void {
    this.updateLatencyMs = latencyMs;
  }

  public recordNavigation(mode: string): void {
    this.navigationEvents += 1;
    if (mode === 'orbit') this.orbitCount += 1;
    if (mode === 'pan') this.panCount += 1;
    if (mode === 'zoom') this.zoomCount += 1;
    if (mode === 'fit' || mode === 'fit-all' || mode === 'fit-selection') this.fitCount += 1;
  }

  public recordAnimation(durationMs: number): void {
    this.animationDurationMs = durationMs;
  }

  public recordProjectionSwitch(): void {
    this.projectionSwitches += 1;
  }

  public recordSync(): void {
    this.synchronizationCount += 1;
  }

  public snapshot(): CameraMetricsSnapshot {
    return Object.freeze({
      updateLatencyMs: this.updateLatencyMs,
      navigationEvents: this.navigationEvents,
      animationDurationMs: this.animationDurationMs,
      projectionSwitches: this.projectionSwitches,
      synchronizationCount: this.synchronizationCount,
      orbitCount: this.orbitCount,
      panCount: this.panCount,
      zoomCount: this.zoomCount,
      fitCount: this.fitCount
    });
  }

  public reset(): void {
    this.updateLatencyMs = 0;
    this.navigationEvents = 0;
    this.animationDurationMs = 0;
    this.projectionSwitches = 0;
    this.synchronizationCount = 0;
    this.orbitCount = 0;
    this.panCount = 0;
    this.zoomCount = 0;
    this.fitCount = 0;
  }
}
