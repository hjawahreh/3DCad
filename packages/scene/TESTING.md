# Testing

## Levels

- Unit: diff, cache, identity, picking
- Integration: full pipeline
- Architecture: no GPU/React/kernel surface; SpatialIndex reserved; immutability; dispose

## Performance expectations

- Incremental updates preferred over full rebuild
- Deterministic entity order (sorted domain ids)
- Designed to support 120 FPS viewport consumption (projection itself should stay well under frame budget for typical entity counts; measure in COD-008)
- Minimal allocations via projection cache fingerprints

## Commands

`pnpm --filter @cad-studio/scene test`

## Known limitations

- No BVH / spatial query implementation (reserved contract)
- Document views are scene-facing contracts until `app-domain` exists
- No worker-thread pool (pure sync projection; async only via AbortSignal)
