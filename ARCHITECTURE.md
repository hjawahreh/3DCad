# CAD Studio Engineering Constitution

**Status:** Frozen — Constitution · Architecture · Governance (ADR-0005). Implementation active.  
**Scope:** Binding policy. No new layers or governance processes without ADR. Clinical work requires PC-001 then CLN-* programme.

## 1. Purpose and non-negotiable outcomes

CAD Studio is a desktop orthodontic CAD platform built for deterministic, high-performance medical and engineering workflows. It is a local-first application whose UI is React, whose interactive viewport is an imperative Three.js subsystem, whose native orchestration is Rust, and whose replaceable geometry kernel is C++20.

The architecture must preserve these properties:

- The viewport is independent of React reconciliation and renders through Three.js directly.
- Domain state is immutable, serializable, deterministic, and independent of rendering state.
- Geometry is accessed only through stable kernel interfaces; no product package depends on a kernel implementation.
- Long-running, CPU-intensive, I/O-heavy, and native tasks cannot block the UI thread.
- Dependencies point inward toward stable domain contracts. Circular dependencies, hidden globals, service locators, and ambient singletons are prohibited.
- Every command is validated, attributable, reversible when declared reversible, and represented in durable history.
- Project data remains recoverable, versioned, and resilient to partial writes.

This constitution takes precedence over package-local preferences. Any exception requires an architecture decision record (ADR), explicit owner, rollback plan, and test plan.

**Architecture freeze (ADR-0003 / ADR-0004 / ADR-0005):** Platform layering is frozen. **Governance is frozen.** Architecture or governance process changes require an ADR. New milestones implement existing contracts rather than redesigning them or inventing new processes. Prefer existing subsystems over new ones. Clinical/orthodontic modules begin only after **Platform Certification (PC-001)**.

**Frozen layers:** (1) Engineering Constitution · (2) Platform Architecture · (3) Governance · (4) Implementation ← active.

## 2. Repository and monorepo layout

The repository uses one source-controlled monorepo. JavaScript/TypeScript packages use workspace tooling; Rust uses a Cargo workspace; C++ uses a dedicated build graph. Generated outputs, downloaded dependencies, local projects, credentials, and machine-specific build products are never committed.

```text
.
├── ARCHITECTURE.md                 # This constitution
├── README.md                       # Product-neutral developer entry point
├── docs/
│   ├── adr/                        # Immutable architecture decisions
│   ├── contracts/                  # Versioned IPC, file, plugin and kernel contracts
│   ├── diagrams/                   # Source-controlled diagrams
│   └── runbooks/                   # Operational and release procedures
├── apps/
│   └── desktop/                    # Tauri v2 shell and composition root only
├── packages/
│   ├── app-domain/                 # Pure domain model, commands, reducers, policies
│   ├── app-application/            # Use cases and orchestration ports
│   ├── app-ui/                     # React 19 UI, view models, accessibility
│   ├── viewport/                   # Imperative Three.js/WebGPU/WebGL renderer
│   ├── scene/                      # Scene projection, spatial indices, selection adapters
│   ├── tool-runtime/               # Operation Runtime (ADR-0001)
│   ├── geometry-services/          # Geometry policy → kernel ports (ADR-0002)
│   ├── kernel-bridge/              # Kernel Integration Layer contracts (ADR-0003 / COD-006)
│   ├── platform-contracts/          # Typed Rust IPC contracts and shared schemas
│   ├── project-format/              # Project manifest and document serialization contracts
│   ├── plugin-sdk/                 # Public plugin API and capability contracts
│   ├── observability/               # Structured event/logging contracts and sinks
│   └── test-support/                # Fixtures, generators, deterministic test helpers
├── crates/
│   ├── desktop-host/                # Tauri bootstrap and Rust composition root
│   ├── platform-core/               # Filesystem, process, IPC, jobs, compression, network ports
│   ├── project-store/               # Atomic project persistence and migrations
│   ├── import-export/               # Native import/export orchestration
│   ├── job-runtime/                 # Worker scheduling, cancellation and progress
│   ├── licensing/                   # Licensing infrastructure behind a port
│   ├── plugin-host/                 # Plugin discovery, validation, sandbox boundary
│   ├── kernel-bridge/               # FFI boundary; no geometry policy
│   └── native-contracts/            # Rust protocol types generated/validated from schemas
├── kernel/
│   ├── include/                     # Stable C++20 public kernel ABI/API headers
│   ├── src/                         # Kernel implementation(s), isolated by adapter
│   ├── wasm/                        # WASM build boundary and bindings
│   ├── tests/                       # Kernel conformance and property tests
│   └── benchmarks/                  # Kernel performance baselines
├── plugins/
│   └── first-party/                 # Optional separately-versioned plugins only
├── integration/
│   ├── contracts/                   # Cross-language compatibility tests
│   ├── e2e/                         # Desktop black-box tests
│   └── performance/                 # Reproducible benchmark scenarios
├── tooling/                         # Build, lint, codegen and release tooling
└── .github/                         # CI, security and release automation
```

`apps/desktop` composes packages but contains no domain behavior. Each directory above has one owning team or named technical owner. Shared ownership is prohibited; contributions from another team require review by the owner.

## 3. Package ownership and dependency rules

| Boundary             | Owns                                                               | Must not own or import                            |
| -------------------- | ------------------------------------------------------------------ | ------------------------------------------------- |
| `app-domain`         | entities, value objects, command intent, invariants, pure reducers | UI, Three.js, Tauri, filesystem, FFI              |
| `app-application`    | use cases, ports, authorization and transaction policies           | framework adapters, rendering internals           |
| `app-ui`             | React UI, view models, UI state, accessibility                     | Three.js objects, kernel handles, direct IPC      |
| `viewport`           | render loop, GPU resources, camera, frame scheduling               | React components, domain mutation                 |
| `scene`              | immutable document-to-render projection, BVH/spatial indices       | UI state, persistence                             |
| `tool-runtime`       | Operation Runtime: op lifecycle, preview, validation, commit tokens, workflow gate | document mutation, React, renderer, geometric algorithm policy, kernel implementation |
| `geometry-services`  | geometric policy: algorithm selection, batching, result shaping; adapters over kernel ports | document mutation, React, renderer, clinical workflow, native FFI |
| `kernel-bridge`      | Kernel Integration Layer: ABI contracts, session manager, capabilities, mock/native adapters | document mutation, React, geometric policy, clinical workflow |
| `platform-contracts` | schemas and typed messages                                         | host implementation or feature policy             |
| native crates        | trusted platform adapters and job execution                        | TypeScript domain rules or UI policy              |
| `kernel`             | geometry representation and algorithms                             | Tauri, React, project semantics, plugins          |
| `plugin-sdk`         | stable extension interfaces and capability declarations            | plugin-host implementation                        |

Only the composition roots (`apps/desktop`, `crates/desktop-host`) may bind interfaces to implementations. A package may depend only on packages in a lower layer or on contract-only packages. Dependency changes are checked in CI by a repository dependency graph and cycle detector.

```text
UI / Viewport / Native adapters / Plugins
                ↓
        Application use cases
                ↓
        Operation Runtime (tool-runtime)
                ↓
        Geometry Services (geometry-services)
                ↓
 Domain model, commands, policies, ports   ← only after op commit → command
                ↓
 Contracts, value types, kernel interfaces
```

The scene and viewport consume read-only projections of the domain. The domain never imports outward layers. The domain never invokes the geometry kernel or Geometry Services. Cross-language calls use versioned schema contracts; C++ FFI is limited to `kernel-bridge`. Geometry mutations enter the document only through Operation Runtime commit → command recording (ADR-0001). Geometric policy lives in Geometry Services (ADR-0002), not in Operation Runtime.

## 4. Layered and runtime architecture

The desktop process consists of a WebView UI runtime and a Rust host. The WebView hosts React UI and the imperative viewport. Rust owns privileged platform operations and worker coordination. C++ kernel work runs behind Rust-managed worker boundaries. WASM kernel builds may run in web workers for portable, bounded tasks, using the same semantic contracts.

Commercial CAD geometry work does not flow from UI intent straight into the command dispatcher. It flows through the Operation Runtime (ADR-0001):

```text
React UI → Application → Interaction Runtime (reserved) → Tool Runtime
        → Operation Runtime → Task Planner → Execution Scheduler → Workers
        → Geometry Services → Kernel Session → Kernel Bridge → C++ Kernel
        → Validated Result → Commit → Command Dispatcher
        → Immutable Domain → History → Scene → Graphics Engine
```

```text
React UI ── intents ──> Application ──> Operation Runtime ──> kernel (via jobs)
   ↑                         │                    │
   │ view models             │ ports              ├─> validated commit → command dispatcher
   └─────────────────────────┘                    │
                                                  └─> preview descriptors (transient)
        immutable document store <── commands only after successful op commit
                   │
                   ├─> history / events
                   └─> scene projection → Imperative Three.js viewport

Rust host <── versioned IPC ── application adapters ──> job runtime ──> kernel bridge/workers
   │                              │                         │
   ├─ project store               ├─ import/export          └─ progress/cancel events
   ├─ filesystem/compression      ├─ licensing/network
   └─ plugin host                 └─ structured telemetry
```

The UI process has no authority to read arbitrary paths, spawn workers, perform network requests, or access credentials. It requests explicitly scoped host capabilities. The host treats all UI and plugin input as untrusted at the boundary.

## 5. Rendering, viewport, and scene graph

### Rendering architecture

`viewport` owns a single imperative renderer instance per active viewport, a canvas, camera controller, render loop, render-resource cache, and GPU capability negotiation. React mounts a canvas host and subscribes to presentation state only; it never creates, updates, or disposes Three.js scene objects.

WebGPU is the preferred backend. WebGL is a capability-driven fallback with documented feature/performance parity expectations. Backend selection is performed once per viewport session, recorded in diagnostics, and does not alter document semantics. Rendering is a pure projection: it may cache and derive GPU resources but must never mutate domain state.

The render loop is demand-driven with continuous mode only during interaction, animation, or active preview. It coalesces invalidations, processes camera input before scene work, and enforces a frame budget. GPU resource creation/destruction is centralized in the viewport and occurs on its owning thread.

### Scene graph architecture

The persistent document graph is not a Three.js graph. It contains stable entity IDs, typed relationships, transforms, geometry references, display attributes, and revision metadata. `scene` turns an immutable document revision into a render snapshot containing renderable instances, material descriptors, bounds, selection proxies, and stable picking IDs.

The Three.js scene graph is a disposable projection keyed by stable entity IDs. It has three layers:

1. **World layer:** imported/model geometry and transforms.
2. **Interaction layer:** selection highlights, previews, guides, and tool overlays.
3. **Presentation layer:** camera-relative helpers and diagnostics.

Only the world layer represents persisted entities. Interaction and presentation layers are transient and cannot be serialized or included in history. Projection updates are incremental by revision diff; full rebuilds are reserved for recovery, backend reset, or explicit document replacement.

## 6. Geometry architecture

### Geometry Services (ADR-0002)

`geometry-services` is the permanent platform package between Operation Runtime and the Kernel Bridge. It owns:

- translating Operation Runtime requests into versioned kernel calls
- algorithm selection and batching
- cancellation propagation for geometric work
- validating and shaping kernel results for the Operation Runtime
- abstracting kernel implementation details
- **Kernel Session** lifecycle (resource cache, topology cache, shared acceleration structures)

It must not own document state, clinical workflow, React, or renderer objects. Operation Runtime remains orchestration and commit gating only; it does not embed geometric policy.

Reserved service families include boolean, transform, repair, remesh, offset, collision, measurement, validation, and topology.

### Kernel Session

Kernel invocations are session-scoped rather than purely stateless:

```text
Kernel Session → Operation → Resource Cache → Topology Cache → Result
```

A session binds opaque handles and caches for a bounded lifetime (viewport case, import job, or operation batch). Sessions are cancelable, revision-aware, and disposed explicitly. They enable shared acceleration structures across operations without leaking kernel handles into Domain or UI.

### Geometry Kernel

The geometry kernel is reached only through the **Kernel Integration Layer** (`kernel-bridge`, COD-006 / ADR-0003): opaque ABI, session manager, capability negotiation, and family ports. The kernel exposes a narrow, stable, language-neutral contract: opaque geometry handles, typed input/output value objects, capabilities, operation descriptors, cancellation, progress, deterministic error categories, and explicit memory ownership. Domain and UI never call the kernel.

Kernel implementations are replaceable adapters. Product code depends on semantic operations, never on a concrete mesh/B-rep implementation, memory layout, or third-party type. Kernel results include an operation fingerprint, source input revisions, kernel version, tolerance policy, and diagnostics. A result built against stale inputs is discarded by Geometry Services / Operation Runtime.

Native and WASM kernels must pass the same conformance corpus for supported operations. Capability negotiation makes unsupported WASM operations explicit; no silent algorithm substitution is permitted. Numerical policy is centralized: coordinates use declared units, tolerances are operation-specific and versioned, and comparisons never rely on incidental floating-point equality.

## 7. Native platform architecture

Rust is the trusted platform layer. It owns project filesystem access, persistence, import/export orchestration, compression, worker lifecycle, IPC dispatch, background jobs, networking, licensing infrastructure, and plugin hosting. It exposes narrowly scoped asynchronous commands and event streams through `platform-contracts`.

Every IPC request includes a protocol version, request ID, caller context, validated payload, cancellation semantics where applicable, and a typed result. IPC messages do not expose filesystem paths or native handles unless a contract explicitly permits a scoped opaque token. Rust validates schema, authorization, size limits, and project context before dispatch.

Native adapters implement application ports. They do not decide clinical/product workflow, edit document state directly, or embed UI behavior.

## 8. Plugin architecture

Plugins are optional, separately packaged extensions. A plugin declares an identifier, semantic version, compatible SDK range, requested capabilities, signed publisher identity, and contribution points. Supported contribution points are explicitly enumerated by the SDK; plugins cannot patch internal modules, access ambient globals, or reach private IPC commands.

The host grants least-privilege capabilities per installed plugin and records all grants in project-independent settings. Plugins run outside trusted core boundaries; execution isolation and permission enforcement are host responsibilities. Plugins interact with documents only through commands, read models, and declared extension APIs. They may add transient viewport overlays only through the tool/scene contracts.

The plugin API is semantically versioned and supported for a published deprecation window. Plugin failures are isolated, logged with correlation IDs, surfaced as non-fatal diagnostics, and never corrupt the active document. A plugin's persisted data resides in a namespaced, versioned extension section and must define migration and removal behavior.

## 9. Commands, history, tools, operations, selection, and events

### Command system

A command is an immutable, serializable **record of a successfully completed operation** (or a non-geometry administrative act explicitly exempted by ADR). It has a type, schema version, command ID, actor/source, timestamp, preconditions, payload, and deterministic execution policy. Commands are validated before execution. A command handler produces either a new immutable document revision plus domain events, or a typed failure; it never partially mutates state.

**Geometry mutations never originate from Commands.** Commands only record successfully completed Operations. The Operation Runtime is the only subsystem authorized to translate kernel results into document-bound command intents. Domain reducers apply those commands; they do not call the geometry kernel.

Only the command dispatcher can commit document changes. UI, tools, plugins, importers, and background jobs submit geometry-affecting commands only after Operation Runtime commit (commit token / command intent). Commands are idempotent by command ID within a project session and must declare whether they are undoable, mergeable, or irreversible. Background outputs commit only after input-revision validation. A failed operation must never create a history entry or a new document revision.

### History architecture

History is an append-only command log with periodic immutable snapshots. The active document is reconstructed from a verified snapshot and subsequent commands. Undo/redo is modeled as explicit history navigation or compensating commands according to the command policy; it is never an ad hoc inverse UI action.

History records provenance, kernel fingerprints, schema versions, result summaries, and parent revision IDs. Branches are explicit when supported; no implicit overwriting of prior revisions occurs. A command may be compacted only after its result is protected by a verified snapshot and audit requirements are retained.

### Tool lifecycle and Operation Runtime

A **tool** is a finite-state interaction controller that consumes **normalized interaction events** from the Interaction Runtime (reserved; COD-009). An **operation** is the CAD execution unit owned by `tool-runtime` (Operation Runtime). Tool lifecycle: `registered → activated → primed → previewing → committing | cancelling → deactivated → disposed`. Operation lifecycle: `created → active → previewing → executing → validating → ready-to-commit → committed` (or `failed` / `cancelled`).

Tools do not own raw pointer/keyboard/touch devices. They receive normalized input and read-only application/scene queries, own only transient interaction state, and publish preview descriptors through the Operation Runtime. They do not invent domain commands from raw UI events. All geometry mutations must pass through Operation Runtime → Geometry Services → Kernel Session: preconditions → kernel → geometry/result validation → commit decision → command intent. Workflow progression depends on successful operation commits, not user intent alone.

Tools and operations must release captures, previews, subscriptions, and worker requests on every terminal transition. Transitions are explicit and testable. A new tool or operation cannot activate until the active one accepts deactivation or is forcibly cancelled by defined application policy. See ADR-0001 and ADR-0002.

### Selection architecture

Selection is a presentation-domain bridge, not a mutation mechanism. It stores stable entity/sub-element references plus document revision and selection mode. Picking uses a GPU ID pass or equivalent accelerated path; detailed refinement uses the scene spatial index or background geometry query. Selection results from stale revisions are rejected.

Hover is ephemeral, rate-limited, and never added to history. Persistent selection is application state and is invalidated/remapped by declared document-change policies. The selection service exposes explicit query and change events; it does not expose Three.js objects.

### Event system

Domain events announce completed facts and are emitted only after a successful document transition. Application events report orchestration state; platform events report host/job lifecycle; telemetry events are observational. These streams are distinct and typed.

Events have namespaced names, schema versions, correlation/causation IDs, timestamp, source, and payload-size limits. Delivery order is preserved per stream and correlation, but handlers must be idempotent. Events do not invoke hidden cross-feature behavior: subscriptions are registered at composition boundaries and declared in package documentation. Events cannot be used to bypass command validation.

## 10. Project files, import/export, and persistence

A project is a directory package with an atomic manifest, immutable document/history data, content-addressed geometry assets, extension namespaces, and optional cache data. The manifest declares format version, project ID, unit system, creation/modification metadata, required plugin data, snapshot index, integrity hashes, and compatibility state. Caches are reproducible and safely deletable.

Writes use a transactional staging area, fsync-equivalent durability appropriate to the platform, integrity verification, and atomic rename/commit. A journal permits crash recovery. The project store never overwrites a known-good project state in place. Migration is explicit, one-way, tested with fixtures, backed up when needed, and produces an auditable migration record.

Imports follow: source acquisition → format/security validation → isolated parse → normalization to declared units/coordinate conventions → optional background geometry conversion → reviewable result → command commit. Exports follow: immutable revision snapshot → validation → conversion → isolated write → verification → atomic destination commit. Parsers and exporters have resource limits, cancellation, provenance records, and typed diagnostics. Import/export formats are adapters, not domain dependencies.

## 11. Threading, ownership, and memory

The UI thread is reserved for input handling, React commits, lightweight state projection, and render submission. It performs no synchronous filesystem, parsing, compression, kernel, or large-scene construction work. The render context is owned by the viewport thread/runtime and receives immutable snapshots only.

Rust's job runtime schedules bounded worker pools by class: I/O, CPU, kernel, and network. Pools are sized from measured hardware-aware defaults and enforce back-pressure; unbounded task spawning is prohibited. Jobs require cancellation tokens, deadlines when user-visible, progress reporting, input revision IDs, and resource estimates. C++ kernel calls run off the UI thread. WASM work runs in dedicated workers when it can exceed a small interaction budget.

Ownership is explicit across all boundaries:

- TypeScript domain values are immutable and structurally shared; mutable renderer caches remain private to `viewport`.
- Rust owns native resources through RAII and exposes opaque, scoped IDs rather than borrowed pointers.
- C++ owns objects behind opaque handles. Each contract defines create, retain/clone if allowed, release, and result-buffer ownership. No allocation crosses an ABI boundary without an explicit matching release function.
- Async requests own their input snapshot for their lifetime; cancellation never transfers ownership ambiguously.
- Large geometry uses reference-counted immutable assets or memory-mapped/read-only buffers where appropriate; copies across process/language boundaries require size accounting.

## 12. Performance budgets and observability

Performance is a product requirement. Benchmarks run on defined reference hardware and record input corpus, backend, build mode, and percentile distributions.

| Area                              |                                                                 Budget |
| --------------------------------- | ---------------------------------------------------------------------: |
| Interactive viewport              |                   120 FPS target (8.33 ms frame) on reference hardware |
| Camera input to render submission |                                                             < 2 ms p95 |
| Primary selection result          |                                   < 5 ms p95 for indexed visible scene |
| Transient preview update          |                                  < 8 ms p95; degrade rather than block |
| React/UI work during interaction  |                                            ≤ 1 ms typical frame budget |
| Main/UI-thread synchronous work   |                           ≤ 2 ms per task; split or offload above this |
| Heavy geometry                    |                    background only; cancellable and progress-reporting |
| Large meshes                      | millions of triangles via culling, LOD/proxies, batching and streaming |

Budgets are measured, not assumed. Frame timings include input, scene update, submission, and backend diagnostics. Memory budgets are established per supported hardware tier before feature work; every large allocation has attribution. Regression thresholds in CI use representative scenes and allow only reviewed baseline updates.

Structured logs use levels (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) and contain timestamp, component, project/session-safe correlation IDs, request/job IDs, error category, and relevant performance fields. No patient data, raw geometry, paths, tokens, or license secrets may be emitted unless explicitly redacted and authorized by the data policy. Logs are asynchronous, bounded, rotating, and resilient to sink failure. Metrics and traces are observational only and cannot affect behavior.

## 13. Errors, resilience, and security boundaries

Errors are typed and categorized: validation, precondition, conflict/stale revision, cancellation, resource limit, unsupported capability, I/O, format, kernel, plugin, network, license, and internal defect. Public contracts return actionable categories plus safe context; internal causes remain chained for diagnostics. Errors are never represented by unstructured strings alone.

Expected failures are returned values. Unexpected failures are caught at process, job, plugin, IPC, and renderer boundaries, logged, converted to safe diagnostics, and isolated where possible. The active project must remain valid after any failed command, job, plugin, import, or render-resource operation. Retrying is explicit and limited to operations declared idempotent.

All external content is untrusted: project files, imports, plugins, IPC payloads, network responses, and kernel outputs. Validate sizes, schemas, counts, paths, decompression ratios, and resource budgets before processing. Privileged operations remain in Rust. Trust and authorization are capability-based, never inferred from caller identity alone.

## 14. Testing and quality gates

Testing follows the architectural boundaries:

- Domain: exhaustive unit, property, reducer, command precondition, determinism, and history replay tests.
- Application: port-contract tests, orchestration, cancellation, stale-result, and error-path tests.
- Viewport/scene: deterministic projection tests, picking/selection tests, GPU smoke tests, visual regression suites, and resource lifecycle tests.
- Native: Rust unit/integration tests, atomic persistence crash-recovery tests, IPC schema tests, and job scheduling tests.
- Kernel: conformance corpus, numerical robustness, differential/property tests, native/WASM parity, fuzzing, and benchmarks.
- Plugins: SDK contract compatibility, permission denial, isolation, migration, and failure containment tests.
- End-to-end: packaged desktop workflows through public contracts only.

Every defect receives a regression test at the lowest meaningful layer. CI gates formatting, linting, type checking, dependency-rule enforcement, unit/integration suites, contract compatibility, security scanning, deterministic replay, and performance regression checks. Tests must not rely on wall-clock timing, network availability, unordered iteration, or machine-local paths unless explicitly classified as integration tests.

## 15. Versioning and compatibility

The product, project format, IPC protocol, kernel contract, plugin SDK, and each package version independently using semantic versioning. Breaking changes require a major contract version or an explicit migration path. Contract schemas are additive by default; fields have documented required/optional behavior and unknown-field handling.

Project format readers state their supported range. Writers do not silently downgrade. A project whose required plugin or format capabilities are unavailable opens in an explicit compatibility state, preserving data without destructive edits. Kernel algorithm changes that can affect deterministic outputs increment an algorithm/tolerance version recorded in history.

ADRs are required for externally observable contract changes, new cross-layer dependencies, new privileged capability, new persistence structure, render backend behavior differences, and changes to performance budgets.

## 16. Coding, naming, and folder conventions

TypeScript uses strict mode with no unchecked boundary data, no `any` in production code, immutable public values, explicit return types on public APIs, and discriminated unions for result/error states. Rust follows idiomatic ownership and denies unsafe code unless a reviewed, narrowly scoped FFI module requires it. C++20 uses RAII, value semantics where practical, `std::span`/views with explicit lifetime rules, no exceptions across ABI boundaries, and no raw owning pointers.

Names use business-neutral, precise nouns and verbs. TypeScript: `PascalCase` types/components, `camelCase` values/functions, `kebab-case` files. Rust: standard `snake_case` modules/functions and `PascalCase` types. C++: `PascalCase` types and `snake_case` values/functions unless the kernel public contract establishes a different documented convention. Acronyms are treated as words (`IpcMessage`, `GpuResource`). Avoid vague names such as `Manager`, `Helper`, `Util`, `Common`, `Base`, or `Data` unless their constrained role is obvious.

Folders represent one bounded responsibility. Public APIs live at a package's explicit entry point; internal modules are not imported across package boundaries. Tests mirror the source structure. Generated code is placed only in designated generated directories and is never hand-edited. Every package declares its owner, purpose, public API, allowed dependencies, and test command in package-local documentation.

## 17. Engineering constitution

1. Correctness, recoverability, and deterministic behavior precede convenience.
2. Render state is disposable; document state is authoritative. Operation state is transient.
3. React owns UI, never the viewport or geometry lifecycle.
4. All durable changes are commands; all commands are validated before commit. Geometry-affecting commands may only be created from validated operation results (ADR-0001).
5. Every cross-process, cross-language, and plugin boundary has a versioned contract.
6. Privilege is explicit, minimal, and enforced in the Rust host.
7. CPU-heavy and unbounded work is cancelable and off the UI thread.
8. Dependencies flow inward; composition roots are the only implementation-binding locations.
9. APIs expose ownership, threading, failure, and version semantics explicitly.
10. Measurements, tests, and reproducible evidence decide performance claims.
11. No architecture exception is implicit. It requires an ADR and owner approval.
12. A change that violates this document cannot merge until this document is amended and approved.
13. All geometry mutations must pass through the Operation Runtime.
14. The Domain never invokes the Geometry Kernel or Geometry Services directly.
15. A failed operation must never create a history entry or a new document revision.
16. Workflow progression depends on successful operation commits, not user intent alone.
17. The Operation Runtime is the only subsystem authorized to translate kernel results into document mutations.
18. Geometry mutations never originate from Commands. Commands only record successfully completed Operations.
19. Geometric policy lives in Geometry Services; Operation Runtime orchestrates and commits (ADR-0002).

## 17a. Architectural laws

These laws are immutable summaries of the constitution. Use them in design reviews.

1. **The document is the only source of truth.**
2. **Rendering is always a projection.**
3. **Geometry never mutates the document directly.**
4. **Operations create geometry** (via Geometry Services / Kernel).
5. **Commands record successful operations.**
6. **History records commands.**
7. **Scene projects immutable revisions.**
8. **Graphics never modifies domain state.**
9. **React never owns viewport objects.**
10. **Every expensive task is asynchronous.**

## 18. Reserved platform subsystems

The following subsystems are permanent architectural reservations. They define future boundaries only and authorize no product implementation until their COD milestone.

### Enterprise modules

The enterprise CAD platform is the shared foundation below independently deployable Clinical, Manufacturing, and AI modules. These modules depend on platform contracts and application ports; they do not depend on one another. Clinical policy is separate from geometry, manufacturing policy is separate from clinical policy, and AI consumes/produces versioned domain contracts through an explicit runtime port. No module may acquire privileged access, renderer internals, or kernel implementation access merely by being first-party.

### Interaction Runtime

Reserved package boundary for normalized input: pointer, keyboard, touch, tablet, gesture, input capture, focus, cursor, and hit testing. Tool Runtime consumes these events; it does not own raw device drivers or DOM listeners at the platform boundary.

### Constraint Runtime

Reserved for future orthodontic / appliance constraint solving: rules, dependencies, solver, and validation (movement limits, appliance constraints, treatment rules). It produces proposals that still require Operation Runtime → commit → command for any document mutation.

### Geometry Transaction

Reserved for coordinating multiple kernel operations atomically under one user action:

```text
Operation → Geometry Transaction → Kernel Session → Kernel → Validated Result
```

A transaction groups kernel calls with shared cancellation, revision checks, and all-or-nothing validation before Operation Runtime commit. Not implemented in COD-006; contracts may reserve types only.

### Render graph and GPU resources

The viewport renderer is internally organized as a declarative render graph compiled by the active backend into ordered passes and resource lifetimes. The graph owns explicit dependencies, attachment formats, resource states, pass inputs/outputs, and profiling labels. Its public boundary remains the renderer abstraction described above; Three.js objects and backend-specific state never escape it.

Reserved pass categories are geometry, selection, picking, overlay, transparency, post-processing, and diagnostics. A pass is optional, backend-capability-aware, independently testable, and cannot mutate document state. Pass registration is explicit at the renderer composition root.

GPU resource management is separated from render policy. Shader, texture, material, mesh, buffer, and pipeline managers own keyed caches, lifetimes, memory accounting, eviction, device-loss recovery, and backend validation. Resource keys include source revision and backend-relevant options. They expose immutable descriptors and opaque resource references, not ambient registries.

### ECS scene projection

The transient render-scene projection uses a data-oriented entity-component-system (ECS). It is not the persistent document model. ECS entities map to stable document entity IDs; components are plain, bounded data; systems perform explicit transformations over component sets. Systems are scheduled by declared read/write access and may not directly commit commands.

Reserved component families include transform, mesh, material, visibility, selection, clinical metadata, attachments, and measurements. Components that represent durable product data remain domain-owned and are projected into the ECS; components that are cache, render, or interaction data remain transient. Entity identity, revision mapping, and component ownership are documented before any new component family is introduced.

### Asset and memory management

An asset manager is the sole coordinator for content-addressed asset identity, streaming, compression, decoded-cache lifecycle, memory accounting, and eviction policy. It is independent of project semantics and render policy. Assets are immutable after publication, verified before use, and accessed through scoped references. Cache eviction must never make a durable project invalid; assets are reloadable from an authoritative store.

### Task planner and execution scheduler

The job runtime separates **planning** from **execution**:

```text
Task Planner → Task Graph → Execution Scheduler → Worker Pools
```

The planner builds a dependency graph (inputs, outputs, priority, resource class, cancellation, progress, deadline, result revision). The execution scheduler admits ready work to worker pools under capacity and back-pressure. Dependency failure, cancellation, stale inputs, and resource exhaustion are terminal typed states. Task priority cannot override ownership, validation, or UI responsiveness rules. Competing geometry operations share this graph rather than ad hoc threads.

### AI runtime reservation

AI is reserved behind an `AI runtime` application port. Future providers are capability-negotiated, cancellable, observable, versioned, and prohibited from direct document mutation. AI outputs are untrusted proposals requiring validation and normal command commit. Training, inference, model acquisition, patient-data policy, and networking are out of scope until separately approved by ADR.

## 19. Platform roadmap

**Phase:** Architecture and governance are frozen (ADR-0005). Active work is **implementation** and **Release Certification**. Do not invent new architectural layers or governance processes.

| Milestone | Focus | Lifecycle status |
| --------- | ----- | ---------------- |
| COD-001 | Engineering Constitution | Frozen |
| COD-002 | Engineering Foundation | Frozen |
| COD-003 | Platform Runtime | Certified / Stable path |
| COD-004 | Graphics Engine | Implementation |
| COD-005 | Geometry Services | Feature Complete (contracts) |
| COD-006 | Kernel Integration Layer | Implementation |
| COD-007 | Scene Projection implementation | Verification |
| COD-008 | Viewport Runtime implementation | Verification |
| COD-009 | Interaction Runtime implementation | Verification |
| COD-010 | Camera Runtime implementation | Verification |
| COD-011 | Selection Runtime implementation | Verification |
| COD-012 | Project Runtime implementation | Verification |
| COD-013 | Import Runtime implementation | Verification |
| APP-001 | Studio Host Application (`apps/studio`) | Verification |
| CLN-001 | Clinical Application Bootstrap | Verification |
| CLN-002 | Clinical Mesh Import & Document Creation | Verification |
| **PC-001** | **Platform Certification** | **Gate before clinical work** |

Milestone states: Draft → Implementation → Feature Complete → Verification → Certified → Frozen. See [MILESTONE_LIFECYCLE.md](docs/engineering/MILESTONE_LIFECYCLE.md). A milestone is not complete without a PASS [Certification Report](docs/templates/CERTIFICATION_REPORT.md).

Import (COD-013) follows Project Runtime (COD-012) so imports commit through authoritative versioning, lifecycle, persistence, and recovery contracts.

### COD-006 Kernel Integration Layer (no production algorithms)

```text
Kernel Integration Layer
├── Kernel Bridge          — opaque ABI, ownership, lifetimes, errors
├── Kernel Session Manager — context, caches, tolerance, cancel, diagnostics
├── Capability Negotiation — what this kernel build supports
└── Geometry Service Adapters — services → abstract ports → bridge → kernel
```

Deliverables are contracts, mocks, and capability discovery. Native/WASM algorithm bodies arrive behind the same ports later.

### COD-007–013 implementation milestones

These are **not** architectural milestones. They implement already-defined constitutional contracts:

| Milestone | Goal |
| --------- | ---- |
| COD-007 | Scene Projection implementation |
| COD-008 | Viewport Runtime implementation |
| COD-009 | Interaction Runtime implementation |
| COD-010 | Camera Runtime implementation |
| COD-011 | Selection Runtime implementation |
| COD-012 | Project Runtime implementation |
| COD-013 | Import Runtime implementation |

### COD-007+ milestone rules

Each production subsystem milestone must:

1. Pass the [Implementation Readiness Checklist](docs/engineering/IMPLEMENTATION_READINESS.md)  
2. Declare contract stability (**Experimental** / **Stable** / **Frozen**) in `API.md`  
3. Ship architecture docs, public API docs, unit + integration tests, performance expectations, ownership  
4. Answer yes to: constitution conformance · milestone acceptance · no architectural surface expansion  

No constitutional edits. No new architectural layers unless an ADR proves the work cannot fit an existing boundary.

### Platform Certification (PC-001)

PC-001 is an **aggregate certification**, not “just another COD milestone.” When COD-013 is complete, produce a single [PC-001 Platform Certification Report](docs/templates/PC001_PLATFORM_CERTIFICATION.md) that rolls up COD-001…013 evidence into **Platform v1.0 Certified** (or FAIL with reasons). That document is the baseline for every future clinical module.

Measurable checklists (Architecture · Contracts · Quality · Runtime · Governance) remain as below and must all be true.

**Architecture**

- [ ] All constitutional rules enforced  
- [ ] No ADRs pending acceptance  
- [ ] Dependency graph acyclic  

**Contracts**

- [ ] All public platform contracts versioned  
- [ ] Cross-language compatibility verified  
- [ ] API documentation complete  
- [ ] Stability levels declared (Experimental / Stable / Frozen)  

**Quality**

- [ ] Unit tests passing  
- [ ] Integration tests passing  
- [ ] Architecture tests passing  
- [ ] Performance baselines recorded  

**Runtime**

- [ ] Platform boots successfully  
- [ ] Project lifecycle operational  
- [ ] Viewport runtime operational  
- [ ] Kernel bridge operational  
- [ ] No architectural TODOs remaining  

**Governance**

- [ ] Ownership defined for every package  
- [ ] Coding standards enforced  
- [ ] CI quality gates green  

Only after PC-001 may orthodontic features begin — under the **Clinical programme**, not COD numbering.

### Release Certification

Release Certification defines **production-ready** for a subsystem without changing how implementation is done. Every COD-007+ milestone (and every later CLN milestone) ends with a Certification Report:

Overview · Architecture · Quality · Performance · Documentation · Known Limitations → **PASS** or **FAIL**

Template: [CERTIFICATION_REPORT.md](docs/templates/CERTIFICATION_REPORT.md). Ongoing reviews use [REVIEW_PROTOCOL.md](docs/engineering/REVIEW_PROTOCOL.md): criteria order is correctness → constitution → tests → performance → code quality. Architectural novelty is not a success criterion.

### Clinical programme (post-PC-001)

After PC-001, stop COD milestones for product work. Start:

| Milestone | Focus |
| --------- | ----- |
| CLN-001 | Case Runtime |
| CLN-002 | Scan Import |
| CLN-003 | Orientation |
| CLN-004 | Segmentation |
| CLN-005 | Trim |
| CLN-006 | Close Base |
| CLN-007 | Tooth Movement |
| CLN-008 | IPR |
| CLN-009 | Attachments |

Clinical milestones use the same readiness checklist, lifecycle states, and certification reports. They must not expand platform architecture.
