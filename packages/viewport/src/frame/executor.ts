import type { GpuBackend } from '../backend/types.js';
import type { RenderPipeline } from '../pipeline/pipeline.js';
import type { GpuResourceManager } from '../resources/manager.js';
import type { ColorRgba, FrameId, RenderResult, Size2D } from '../types.js';
import { asFrameId, renderFailure, renderSuccess } from '../types.js';
import { FrameProfiler, FrameStatsCollector } from './timing.js';

export interface FrameUpdateContext {
  readonly frameId: FrameId;
  readonly deltaMs: number;
  readonly size: Size2D;
}

export interface FrameExecutorOptions {
  readonly enableProfiling: boolean;
  readonly clearColor: ColorRgba;
  readonly size: Size2D;
}

export class FrameExecutor {
  private frameSerial = 0;
  private inFlight = false;
  private size: Size2D;
  private readonly profiler: FrameProfiler;
  private readonly stats: FrameStatsCollector;

  public constructor(
    private readonly backend: GpuBackend,
    private readonly pipeline: RenderPipeline,
    private readonly resources: GpuResourceManager,
    private readonly options: FrameExecutorOptions
  ) {
    this.size = { ...options.size };
    this.profiler = new FrameProfiler();
    this.stats = new FrameStatsCollector(this.profiler);
  }

  public getStats(): FrameStatsCollector {
    return this.stats;
  }

  public getProfiler(): FrameProfiler {
    return this.profiler;
  }

  public resize(size: Size2D): void {
    this.size = { width: Math.max(1, size.width), height: Math.max(1, size.height) };
  }

  public execute(update?: (context: FrameUpdateContext) => void): RenderResult<FrameId> {
    if (this.inFlight) {
      return renderFailure('conflict', 'A frame is already in progress.');
    }
    this.inFlight = true;
    const frameId = asFrameId(++this.frameSerial);
    const profiling = this.options.enableProfiling;

    try {
      if (profiling) this.profiler.begin(Number(frameId));
      if (profiling) this.profiler.record('begin');

      const begin = this.backend.beginFrame(this.options.clearColor);
      if (!begin.ok) return begin;

      if (profiling) this.profiler.record('update');
      if (update !== undefined) {
        update({
          frameId,
          deltaMs: 0,
          size: this.size
        });
      }

      if (profiling) this.profiler.record('pass');
      const passes = this.pipeline.execute({ frameIndex: Number(frameId) });
      if (!passes.ok) {
        this.backend.endFrame();
        return passes;
      }

      if (profiling) this.profiler.record('submit');
      const command = this.backend.beginCommandBuffer('frame-submit');
      if (!command.ok) {
        this.backend.endFrame();
        return command;
      }
      const ended = this.backend.endCommandBuffer(command.value);
      if (!ended.ok) {
        this.backend.endFrame();
        return ended;
      }
      const submit = this.backend.submit([command.value]);
      if (!submit.ok) {
        this.backend.endFrame();
        return submit;
      }

      if (profiling) this.profiler.record('end');
      const end = this.backend.endFrame();
      if (!end.ok) return end;

      this.resources.releaseTransient();
      if (profiling) {
        const sample = this.profiler.end();
        if (sample !== undefined) this.stats.recordSample(sample);
      }
      return renderSuccess(frameId);
    } finally {
      this.inFlight = false;
    }
  }
}
