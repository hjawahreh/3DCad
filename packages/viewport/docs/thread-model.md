# Thread Model

The viewport package does not create OS threads. `GpuTaskScheduler` is a cooperative priority queue for asynchronous GPU-related work:

- Kinds: `resource-load`, `shader-compile`, `texture-stream`, `mesh-upload`, `generic`
- Priorities: `critical`, `high`, `normal`, `low`, `idle`
- Admission order is stable for equal priority
- `submit` returns a handle with `cancel`
- `drain` runs pending tasks sequentially
- `dispose` aborts all tasks and clears the queue

Workers or host adapters may invoke `drain` from a background context; the scheduler itself only manages cancellation and ordering. Frame rendering remains on the caller’s thread through `Renderer.renderFrame`.
