# Performance Strategy

Target interactive rates up to **120 FPS** (`DEFAULT_RENDERER_CONFIG.targetFps`). Achieving that budget requires:

- Prefer the mock or lightweight backend paths in tests; prefer WebGPU in production when available.
- Keep the render graph lean; avoid empty passes when possible (warnings flag them).
- Reuse resources via cache keys and transient pooling instead of reallocating every frame.
- Disable profiling (`enableProfiling: false`) when measuring steady-state CPU cost.
- Batch GPU uploads through the task scheduler at non-critical priorities so frame submission stays on the hot path.
- Minimize allocations in frame update callbacks; prefer mutating preallocated buffers.

Empty mock frames must stay well under the interactive budget; the performance suite asserts sixty frames complete in under one second as a regression guard for CPU overhead.
