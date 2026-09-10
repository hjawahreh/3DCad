# ADR-0001: Operation Runtime as a first-class CAD layer

- Status: accepted
- Date: 2026-07-26
- Owners: architecture / platform
- Decision scope: Commercial CAD correctness between Application and Domain; amends the mental model in `ARCHITECTURE.md` §9 (tools/commands) and the system overview
- Implementation: `@cad-studio/tool-runtime` (`packages/tool-runtime`)
- Constitution: `ARCHITECTURE.md` §3–4, §9, §17 (rules 13–18)

## Context

The platform layering (UI → Application → Domain → Scene → Renderer → Rust → Kernel) is sound for enterprise software. Production failures on Trim and Close Base share one pattern:

```text
Operation never reached Commit → workflow advanced anyway
```

That is possible when CAD tools are modeled as:

```text
User action → Command → Document
```

Commercial CAD requires a distinct **Operation** state (transient) separate from **Document** state (durable). Preview strokes, generator heights, brush boundaries, and collision probes must not live in React, Domain, Scene, or Renderer. They belong in an Operation Runtime that may call the kernel and may commit only after validation.

Today’s reserved `tool-runtime` describes an interaction FSM that submits commands. It is necessary but not sufficient: it does not encode the mandatory **kernel → validation → commit → command** gate.

## Decision

Insert **Operation Runtime** between Application and Domain:

```text
Application → Operation Runtime → Domain → Scene → Renderer
```

1. Every CAD tool (Trim, Close Base, Segmentation, Movement, IPR, Collision, …) is an **operation** with transient state.
2. Heavy geometry runs as:

```text
Operation Runtime → Kernel → Validated immutable result → Commit → Command → Domain
```

3. **Production invariant:** Workflow steps that require geometry must not complete unless Commit succeeded. No kernel success + validation ⇒ no command ⇒ no document mutation ⇒ no step advance.
4. Operation Runtime owns: temporary state, preview descriptors, kernel invocation, validation, cancellation, progress, commit. It never owns the document.
5. Renderer remains free of CAD policy. Domain remains free of preview/op state.

Package evolution: `packages/tool-runtime` becomes (or hosts) the Operation Runtime contracts; concrete runtimes may live in clinical/tool packages that depend only on those contracts.

## Consequences

**Positive**

- Trim / Close Base / Segmentation / Movement cannot advance the workflow on metadata alone.
- Matches SolidWorks / CATIA / NX / Fusion / Onshape document-vs-operation practice.
- Clear ownership for cancel/progress and failed kernel paths.

**Negative / cost**

- One more explicit package boundary and lifecycle to implement and test.
- Constitution (`ARCHITECTURE.md`) must be amended after this ADR is accepted (frozen docs require ADR + approval).

## Alternatives considered

| Alternative | Why rejected |
| ----------- | ------------ |
| Keep only Command → Domain | Allows workflow advance without geometric commit (observed failure mode) |
| Put op state in Domain | Pollutes durable history with previews; undo becomes ambiguous |
| Put op state in React | Couples UI to kernel timing; loses testability |
| Put op state in Renderer / Scene | Mixes projection with CAD policy; violates renderer purity |
| Jobs → Command without Operation Runtime | Missing validation/commit ownership and preview lifecycle |

## Compatibility, migration, and rollback

- No production packages implement clinical ops yet; adoption cost is low.
- When ops exist: wrap each tool behind Operation Runtime; deny workflow completion ports unless commit token is present.
- Rollback: keep tool FSM only (pre-ADR) — not recommended once clinical tools ship.

## Validation evidence

Architecture / integration tests must prove:

1. Failed or cancelled kernel work produces no domain revision.
2. Workflow step completion requires a successful operation commit handle.
3. Preview updates do not appear in history.
4. Renderer and Domain packages cannot import operation internals (dependency rules).
