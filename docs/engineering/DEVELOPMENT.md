# Development Environment and Build Policy

## Supported baseline

Node.js 22 LTS, pnpm 10, Rust 1.85 or newer, a C++20 compiler, CMake/Ninja, and platform prerequisites required by Tauri v2 are required. Tool versions are pinned by CI and must be reproduced locally before release work.

## Build modes

| Mode        | Purpose                      | Policy                                                        |
| ----------- | ---------------------------- | ------------------------------------------------------------- |
| development | Fast local feedback          | Incremental, diagnostic-rich, non-reproducible caches allowed |
| test        | Unit and contract validation | Deterministic fixtures and isolated temporary state           |
| benchmark   | Performance measurement      | Release-like build, fixed corpus and recorded hardware        |
| profiling   | Diagnostics                  | Symbols retained; result is not distributable                 |
| production  | Candidate artifact           | Reproducible, optimized, signed only in trusted CI            |
| nightly     | Continuous integration       | Broad compatibility and non-blocking trend checks             |

Turbo coordinates JavaScript workspace tasks. Cargo coordinates native crates. CMake/Ninja coordinates the kernel. They are independently cacheable and converge only at documented contract and packaging boundaries. Build scripts must declare inputs and outputs; ambient machine state is forbidden.

## Local quality commands

`pnpm check` is the TypeScript workspace gate. Native work additionally runs `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, CMake formatting checks, and CTest. Artifact packaging is performed only by CI release jobs.
