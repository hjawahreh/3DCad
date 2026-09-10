# Testing

## Levels

- Unit: lifecycle, scheduler, limiter, resize, invalidation, backend selection, diagnostics
- Integration: Scene snapshot → Runtime → Graphics Engine (mock backend)
- Architecture: dependency allowlist, no React/Three/kernel imports, dispose semantics
- Performance: 120 FPS pacing assumptions, startup budget, resource dispose order

## Performance expectations

- Architecture targets 120 FPS (8.33 ms frame budget)
- On-demand mode preferred; continuous only when needed
- No busy loops (FrameClock / rAF)
- HiDPI-ready buffer sizing
- Mock backend used in CI for deterministic Graphics Engine integration

## Commands

`pnpm --filter @cad-studio/viewport-runtime test`

## Known limitations

- RendererBridge submits snapshot revision + requests Graphics Engine frame; it does not resolve `geometryRef` into GPU meshes (Graphics Engine / later milestones)
- Backend switching requires session recreate (contract documented)
- No worker-thread render pump (single-owner UI/viewport thread)
