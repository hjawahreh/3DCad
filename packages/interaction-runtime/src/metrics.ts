export interface InteractionMetricsSnapshot {
  readonly inputLatencyMs: number;
  readonly dispatchLatencyMs: number;
  readonly eventsPerFrame: number;
  readonly captureCount: number;
  readonly hoverCount: number;
  readonly keyboardCount: number;
  readonly wheelCount: number;
  readonly pointerCount: number;
  readonly mouseCount: number;
  readonly touchCount: number;
  readonly totalDispatched: number;
}

/**
 * Rolling interaction metrics.
 * Ownership: session-owned; publish via snapshot().
 */
export class InteractionMetrics {
  private inputLatencyMs = 0;
  private dispatchLatencyMs = 0;
  private eventsThisFrame = 0;
  private captureCount = 0;
  private hoverCount = 0;
  private keyboardCount = 0;
  private wheelCount = 0;
  private pointerCount = 0;
  private mouseCount = 0;
  private touchCount = 0;
  private totalDispatched = 0;

  public beginFrame(): void {
    this.eventsThisFrame = 0;
  }

  public recordDispatch(input: {
    readonly kind: string;
    readonly inputLatencyMs: number;
    readonly dispatchLatencyMs: number;
  }): void {
    this.inputLatencyMs = input.inputLatencyMs;
    this.dispatchLatencyMs = input.dispatchLatencyMs;
    this.eventsThisFrame += 1;
    this.totalDispatched += 1;
    switch (input.kind) {
      case 'pointer':
        this.pointerCount += 1;
        break;
      case 'mouse':
        this.mouseCount += 1;
        break;
      case 'keyboard':
        this.keyboardCount += 1;
        break;
      case 'wheel':
        this.wheelCount += 1;
        break;
      case 'touch':
        this.touchCount += 1;
        break;
      case 'hover':
        this.hoverCount += 1;
        break;
      case 'capture':
        this.captureCount += 1;
        break;
      default:
        break;
    }
  }

  public snapshot(): InteractionMetricsSnapshot {
    return Object.freeze({
      inputLatencyMs: this.inputLatencyMs,
      dispatchLatencyMs: this.dispatchLatencyMs,
      eventsPerFrame: this.eventsThisFrame,
      captureCount: this.captureCount,
      hoverCount: this.hoverCount,
      keyboardCount: this.keyboardCount,
      wheelCount: this.wheelCount,
      pointerCount: this.pointerCount,
      mouseCount: this.mouseCount,
      touchCount: this.touchCount,
      totalDispatched: this.totalDispatched
    });
  }

  public reset(): void {
    this.inputLatencyMs = 0;
    this.dispatchLatencyMs = 0;
    this.eventsThisFrame = 0;
    this.captureCount = 0;
    this.hoverCount = 0;
    this.keyboardCount = 0;
    this.wheelCount = 0;
    this.pointerCount = 0;
    this.mouseCount = 0;
    this.touchCount = 0;
    this.totalDispatched = 0;
  }
}
