export interface FrameTimingSample {
  readonly frameId: number;
  readonly beginMs: number;
  readonly updateMs: number;
  readonly passMs: number;
  readonly submitMs: number;
  readonly endMs: number;
  readonly totalMs: number;
}

export interface FrameStatsSnapshot {
  readonly frameCount: number;
  readonly averageTotalMs: number;
  readonly maxTotalMs: number;
  readonly minTotalMs: number;
  readonly last?: FrameTimingSample;
}

export class FrameProfiler {
  private readonly samples: FrameTimingSample[] = [];
  private current:
    | {
        frameId: number;
        marks: Partial<Record<'begin' | 'update' | 'pass' | 'submit' | 'end', number>>;
        started: number;
      }
    | undefined;

  public begin(frameId: number): void {
    this.current = {
      frameId,
      marks: { begin: performance.now() },
      started: performance.now()
    };
  }

  public record(phase: 'begin' | 'update' | 'pass' | 'submit' | 'end'): void {
    if (this.current === undefined) return;
    this.current.marks[phase] = performance.now();
  }

  public end(): FrameTimingSample | undefined {
    if (this.current === undefined) return undefined;
    const ended = performance.now();
    const marks = this.current.marks;
    const sample: FrameTimingSample = {
      frameId: this.current.frameId,
      beginMs: (marks.begin ?? ended) - this.current.started,
      updateMs: Math.max(0, (marks.update ?? marks.begin ?? ended) - (marks.begin ?? this.current.started)),
      passMs: Math.max(0, (marks.pass ?? marks.update ?? ended) - (marks.update ?? marks.begin ?? this.current.started)),
      submitMs: Math.max(0, (marks.submit ?? marks.pass ?? ended) - (marks.pass ?? marks.update ?? this.current.started)),
      endMs: Math.max(0, ended - (marks.submit ?? marks.pass ?? this.current.started)),
      totalMs: ended - this.current.started
    };
    this.samples.push(sample);
    this.current = undefined;
    return sample;
  }

  public samplesList(): readonly FrameTimingSample[] {
    return Object.freeze([...this.samples]);
  }

  public clear(): void {
    this.samples.length = 0;
    this.current = undefined;
  }
}

export class FrameStatsCollector {
  private readonly profiler: FrameProfiler;

  public constructor(profiler?: FrameProfiler) {
    this.profiler = profiler ?? new FrameProfiler();
  }

  public getProfiler(): FrameProfiler {
    return this.profiler;
  }

  public recordSample(sample: FrameTimingSample): void {
    // Samples are already stored on the profiler when end() is called.
    void sample;
  }

  public snapshot(): FrameStatsSnapshot {
    const samples = this.profiler.samplesList();
    if (samples.length === 0) {
      return {
        frameCount: 0,
        averageTotalMs: 0,
        maxTotalMs: 0,
        minTotalMs: 0
      };
    }
    let total = 0;
    let max = Number.NEGATIVE_INFINITY;
    let min = Number.POSITIVE_INFINITY;
    for (const sample of samples) {
      total += sample.totalMs;
      max = Math.max(max, sample.totalMs);
      min = Math.min(min, sample.totalMs);
    }
    const last = samples[samples.length - 1];
    return {
      frameCount: samples.length,
      averageTotalMs: total / samples.length,
      maxTotalMs: max,
      minTotalMs: min,
      ...(last !== undefined ? { last } : {})
    };
  }

  public clear(): void {
    this.profiler.clear();
  }
}
