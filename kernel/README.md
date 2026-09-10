# Geometry Kernel Boundary

This directory is the isolated C++20 geometry-kernel build boundary.

## CLN-008 status

- Language/toolchain policy: `CMakeLists.txt` (C++20)
- Public ABI scaffolding: `include/cadstudio/geometry/`
  - `GeometryBackend.hpp` — opaque mesh view + backend interface
  - `Open3DAdapter.hpp` — MIT Open3D adapter declaration (not linked)
  - `EigenTypes.hpp` — Eigen usage policy (MPL-2.0; do not leak types across ABI)
- Scaffold implementation: `src/adapters/Open3DAdapter.cpp`

Product geometry targets remain gated by a versioned kernel-contract ADR. Until then, Studio uses the TypeScript clinical reference kernel behind `KernelBridge` (`apps/studio/src/geometry-kernel`).

See `docs/architecture/third-party-geometry.md` and `docs/architecture/clinical-geometry.md`.
