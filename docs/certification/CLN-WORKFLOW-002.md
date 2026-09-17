# CLN-WORKFLOW-002

## Import

Create Case progress stages: Creating case / Loading scans / Preparing geometry / Ready. BOTH + anterior after import.

## Orientation

Accept Orientation → prepare pipeline → Trim UPPER. Canonical anterior shared with Home / View Cube FRONT.

## Prepare

Pipeline only — not a destination. Auto-advances to Trim.

## Trim

One-arch isolation, arch switcher on toolbar, release-to-trim, Done → Base.

## Base

Create Base commits immediately. Accept button removed. Done → Segment. Lower triangulation interior-seed + ear-clip retry.

## Segmentation

Guided: Edit → Mark Teeth → Auto → Adjust → Verify → NEXT (Biomech locked). BETA / REFERENCE when heuristic.

## Mark Teeth

Click surface → marker (arch, position, faceIndex). Inputs for later production provider.

## Auto Segmentation

Existing provider path; stages without fake percentages.

## Adjust Boundaries

Review mode + select / mark unknown; merge/split APIs remain available when selected.

## Verify Teeth

Tooth Numbering + Accept. NEXT locks Biomechanics.

## Save/Reopen

Document meta restores prep stage. Manual verification required for full session restore of ephemeral guide step.

## Camera

Stage-aware: BOTH anterior (import/orient/seg), single-arch fit (trim/base).

## View Cube

Face labels UPPER/FRONT/BACK/LOWER/LEFT/RIGHT + HOME. Slightly larger cube stage.

## Performance

Create Case messaging clarified; no validation skipped.

## Browser Evidence

`docs/certification/cln-workflow-002-browser-walkthrough.mjs`

## Manual Evidence

Required checklist A–S in the ticket (orbit feel, one-arch trim, base create, mark teeth, save/reopen).

## Remaining Issues

- Manual orbit / View Cube visual confirmation still required
- Lower base must be re-verified on the real dual-arch case after triangulation harden
- Ephemeral Mark Teeth markers are not yet in case persistence schema (accepted segmentation is)
- Biomechanics remains locked placeholder

## Certification

**PASS WITH OBSERVATIONS**

ENGINEERING workflow shape: guided stages wired.  
REAL-MODEL / CLINICAL accuracy: not claimed (segmentation may remain BETA / REFERENCE).
