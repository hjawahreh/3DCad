# Shaders

`ShaderRegistry` manages shader source, caching, reflection, variants, and hot reload.

## Registration

`register` rejects empty sources, hashes source plus sorted keywords (FNV-1a style), and returns a cached descriptor when the hash matches. Optional dependencies must already exist.

## Reflection

A WGSL-oriented regex pass extracts `@vertex` / `@fragment` / `@compute` entry points, `@group`/`@binding` variables, and optional `@workgroup_size`.

## Variants and reload

`createVariant` re-registers the base source with additional keywords and a dependency edge. `hotReload` replaces source, bumps version, updates the hash cache, and recursively reloads dependents.

## Dependencies

`dependencies` returns the declared dependency list. Missing dependency ids fail registration with `not-found`.
