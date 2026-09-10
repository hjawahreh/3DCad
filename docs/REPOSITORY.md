# Repository Topology

The repository has three build domains: the pnpm/Turbo TypeScript workspace (`apps`, `packages`, `plugins`), the Cargo workspace (`crates`), and the CMake/Ninja C++20 kernel boundary (`kernel`). They communicate only through approved versioned contracts.

| Directory     | Role                                | Creation rule                  |
| ------------- | ----------------------------------- | ------------------------------ |
| `apps`        | Application composition roots       | No product policy              |
| `packages`    | TypeScript bounded modules          | Must meet Package Standard     |
| `crates`      | Trusted Rust native adapters        | Must meet Package Standard     |
| `kernel`      | Replaceable C++20 geometry boundary | ABI/contract ADR required      |
| `plugins`     | Capability-scoped extensions        | Published SDK required         |
| `docs`        | Normative contracts, ADRs, runbooks | Reviewed as code               |
| `integration` | Public-boundary validation          | Versioned fixture corpus       |
| `tests`       | Shared test assets                  | Provenance and safety metadata |
| `tooling`     | Build and policy enforcement        | No product behavior            |
| `.github`     | CI, security and release automation | Protected review path          |

This is intentional staged structure: empty future package folders are not committed. A folder becomes a package only when a real, approved responsibility exists, preventing fake modules and placeholder code while retaining a complete growth map.
