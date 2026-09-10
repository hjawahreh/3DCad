# Testing

## Levels

- Lifecycle, navigation, projection, constraints, animation
- Resize synchronization
- Diagnostics / metrics
- Architecture (deps, reserved channels, dispose)
- Integration (viewport + interaction identity binding)

## Performance expectations

- Deterministic pose updates
- Smoothstep camera interpolation
- Minimal allocations (frozen snapshots)
- No blocking I/O or Scene/GPU work
- Camera input→pose update path designed for < 2 ms contribution toward the constitution budget

## Commands

`pnpm --filter @cad-studio/camera-runtime test`

## Known limitations

- Fly-through / VR / stereo / cinematic reserved only
- Fit Selection requires host-supplied AABB
- Does not push matrices into Graphics Engine (Viewport / later binding)
