# CAD Studio — Copilot Engineering Instructions

## Project Role

CAD Studio is a professional clinical dental CAD workstation.

You are an implementation agent working inside the existing repository.

Your job is to:
- inspect the existing implementation first
- preserve established architecture
- implement requested milestones completely
- run real validation
- never fabricate evidence
- never silently bypass failures
- leave the repository buildable and reviewable

## Core Architecture — FROZEN

Do NOT redesign or replace these established boundaries:

- platform-runtime
- project-runtime
- scene runtime
- viewport runtime
- interaction runtime
- camera runtime
- selection runtime
- import runtime
- operation runtime
- geometry services
- kernel bridge
- clinical document/session/history
- clinical segmentation runtime

Clinical code belongs under:

apps/studio/src/clinical/

Geometry-editing clinical workflows use the established path:

Operation Runtime
→ Geometry Services
→ Kernel Bridge
→ geometry/kernel implementation

Do not bypass this architecture.

Do not modify platform packages unless an actual architectural defect makes it necessary.

## Clinical Integrity Rules

- Preview operations must remain non-destructive.
- Geometry commits occur only through the established commit mechanism.
- Failed geometry operations must not mutate clinical document state.
- Geometry mutations must update revision/fingerprint state.
- Scene/viewport state must be republished after committed geometry changes.
- Source geometry must remain recoverable.
- Clinical Document must not contain giant mesh buffers/tensors.
- React must not perform heavy geometry, ML, tensor, or inference work.

## Segmentation Architecture

Production segmentation uses the established path:

ProductionModelProvider
→ SegmentationWorkerClient
→ segmentation worker/inference runtime

Do NOT create a second segmentation inference path.

Do NOT move inference into React.

Reference heuristic segmentation is development/reference only.

Never silently fall back from production segmentation to heuristic segmentation.

Never represent heuristic segmentation as clinical production.

Never claim clinical validation without actual validated evidence.

## Production Segmentation Integrity

Production segmentation results must remain bound to:

- geometryFingerprint
- geometryRevision
- arch
- inferenceRunId
- timestamp

Acceptance must re-check the live Clinical Document.

Results that no longer match current geometry are STALE and cannot be accepted.

Geometry mutations such as Trim and Close Base must invalidate affected segmentation results.

## Required Production Lifecycle

Use the established authoritative lifecycle:

NOT_CONFIGURED
INITIALIZING
READY
INFERENCING
COMPLETED
ACCEPTED
REJECTED
FAILED
STALE

Never leave a request permanently stuck in a generic preparing state.

Never convert malformed or empty inference output into success.

## Workflow

The intended clinical workflow is:

Create/Open Case
→ Import
→ Orientation
→ Prepare
→ Trim
→ Base
→ Segmentation
→ Mark Teeth
→ Auto
→ Adjust
→ Verify
→ later UI/UX refinement
→ later Biomechanics

Do not skip workflow stages to make tests pass.

Do not create artificial browser shortcuts.

Do not unlock biomechanics prematurely.

## Mark Teeth Contract

Temporary Mark Teeth interaction state is session-live.

Accepted segmentation metadata is persisted separately.

Do not confuse temporary markers with production segmentation.

## Clinical Status

Engineering success is not clinical validation.

Never claim:
- clinical accuracy
- regulatory approval
- clinical validation
- superiority over competitors

unless the repository contains genuine supporting evidence.

## Testing

Required quality checks must be executed rather than assumed:

pnpm typecheck
pnpm test
pnpm build

Focused tests must also be run when relevant.

Never:
- skip failing tests
- delete tests to make the suite green
- weaken assertions
- replace real runtime behavior with fake success merely to satisfy tests

If an environment/runtime issue causes failures, investigate the root cause.

## Browser Evidence

Browser walkthroughs must use the real guided workflow.

Never:
- jump directly to a later stage
- inject fake clinical state
- fabricate segmentation results
- fabricate screenshots
- mark a step passed without executing it

Report exact PASS/FAIL counts.

## Git / Agent Workflow

For implementation tasks:

1. Inspect the current repository.
2. Read relevant existing code before modifying it.
3. Make the smallest architecture-compliant changes necessary.
4. Run focused tests.
5. Run required global validation.
6. Run browser validation when requested.
7. Update certification documentation.
8. Commit meaningful changes.
9. Push to the working branch when requested.
10. Open a PR when requested.
11. Do not automatically merge unless explicitly instructed.

## Change Discipline

Avoid broad rewrites.

Prefer targeted corrections.

Do not redesign already-certified architecture merely because a local defect exists.

Do not introduce libraries unless they solve a demonstrated requirement and fit existing license/architecture constraints.

## Certification

Certification statuses are:

PASS
PASS WITH OBSERVATIONS
FAIL

Do not report PASS without actual evidence.

Documentation must distinguish:

- implementation evidence
- automated test evidence
- browser evidence
- performance evidence
- clinical validation status
- remaining observations

## Current Project Direction

The immediate path is:

Import
→ Orientation
→ Prepare
→ Trim
→ Base
→ Segmentation COMPLETE
→ CLN-UX-001 World-Class Clinical Workstation UI/UX
→ Biomechanics

The UI/UX milestone comes BEFORE Biomechanics.

The future UI/UX target is a professional viewport-first dental workstation with:

- clean clinical presentation
- strong guided workflow
- progressive disclosure
- direct manipulation
- compact contextual controls
- professional View Cube
- UPPER / BOTH / LOWER controls
- minimal visual clutter
- clear progress/validation states
- world-class clinical workstation feel

Do not implement that UI/UX work inside unrelated milestones unless explicitly requested.
