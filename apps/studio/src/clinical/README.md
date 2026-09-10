# Clinical Module

Production clinical application framework for CAD Studio.

## Milestones

- **CLN-001** — Clinical bootstrap, case runtime, tool registry, workspace shell
- **CLN-002** — Mesh import workflow → clinical document descriptors → scene/viewport
- **CLN-003** — Professional viewport & display pipeline (modes, HUD, overlays, camera)
- **CLN-004** — Clinical orientation workflow (transform-only gizmo + history)
- **CLN-005** — Clinical preparation workflow (orchestration, validation, sessions — no geometry)
- **CLN-006** — Production trim tool (boundary drawing, Operation Runtime commit)
- **CLN-007** — Production close base tool (plane/surface strategies, Operation Runtime commit)

## Launch

`pnpm run dev` boots `ClinicalApplication` with clinical import dialog for STL/OBJ/PLY.
