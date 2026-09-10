# Synchronization

Frame execution is single-flight per renderer: `FrameExecutor` sets an in-flight flag for the duration of begin → update → pass → submit → end and returns `conflict` if another frame starts concurrently (including from an update callback).

GPU task work uses `AbortSignal`. `GpuTaskScheduler.cancel` aborts the signal; pending tasks are removed without running. Dispose aborts every queued task.

Backend submit is ordered after pass execution within the same frame. Cross-frame resource hazards are avoided by releasing unreferenced transient resources at frame end and by requiring exclusive frame ownership for submission.
