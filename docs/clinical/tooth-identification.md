# Tooth Identification (CLN-009)

Identification is **separate** from segmentation.

Pipeline: instance geometry → arch position → neighbor context → FDI candidates → confidence → IDENTIFIED | UNCERTAIN | UNKNOWN.

Centralized FDI utilities: `apps/studio/src/clinical/segmentation/fdi/FdiNumbering.ts` (permanent dentition 11–48).

Never treat a low-confidence “best guess” as clinical truth.
