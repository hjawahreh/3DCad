# CLN-001A — Clinical Accuracy Gate

**Status: ENGINEERING PASS · BENCHMARK NOT_EVALUATED · NOT YET CLINICALLY VALIDATED**

Do **not** interpret this document as clinical certification.
Do **not** start Movement.
Do **not** present `reference-heuristic` segmentation as clinically accurate.

Canonical workflow under evaluation:

`IMPORT → ORIENTATION → PREPARE → TRIM → CLOSE BASE → SEGMENTATION`

---

## Dataset

| Field | Value |
| --- | --- |
| Manifest | `apps/studio/public/clinical-accuracy/dataset.manifest.json` |
| Dataset id | `cad-studio-clinical-accuracy-v0` |
| License | `internal-fixtures-only` · **cleared=false** |
| Cases | Engineering fixtures (`upper.stl` / `lower.stl`) only |

Public 3DTeethSeg / similar challenge archives are **not** bundled. No fabricated labels.

## Ground Truth

| Stage GT | Present in fixtures? |
| --- | --- |
| Orientation frame | **No** → `NOT_AVAILABLE` |
| Prepared reference | **No** → `ENGINEERING_VALIDATED` + `CLINICAL_REFERENCE_NOT_AVAILABLE` |
| Trim `ReferenceSurfacePath` | **No** → `NOT_AVAILABLE` |
| Base reference | **No** → manufacturing eng checks only |
| Tooth instances / FDI / gingiva | **No** → `NOT_AVAILABLE` |

## Data Split

| Split | Cases | Notes |
| --- | --- | --- |
| TRAIN | `fixture-lower-only` | Process placeholder — **not** for model training without GT |
| VALIDATION | `fixture-upper-only` | |
| TEST (held-out) | `fixture-upper-lower-pair` | Untouched for algorithm tuning |

Patient keys are disjoint across splits (leakage check in harness + unit tests).

## Import Accuracy

Evaluator: surface sample clouds → mean / Hausdorff distance, topology / unit flags.
**Result on fixtures:** `NOT_AVAILABLE` (no paired source↔imported sample clouds recorded in this run).

Exact welding with unchanged positions is not treated as geometric error when distances are computed.

## Orientation Accuracy

Requires reference clinical frame. Metrics defined:

- `superiorAxisErrorDegrees` / `anteriorAxisErrorDegrees` / `lateralAxisErrorDegrees`
- Midline / arch tilt / occlusal-plane hooks reserved for when GT exists

**Result:** `NOT_AVAILABLE`. Thresholds: **UNKNOWN** (no invented clinical bar).

## Preparation Accuracy

Process stage. Without prepared reference: report `ENGINEERING_VALIDATED` + `CLINICAL_REFERENCE_NOT_AVAILABLE` when engineering OK; never invent fidelity scores.

## Trim Accuracy

Requires `ReferenceSurfacePath` clinical boundary GT. Metrics defined for boundary Hausdorff / mean / region precision·recall·F1.
Triangle-count deltas are **not** clinical accuracy.

**Result:** `NOT_AVAILABLE`. Blinded review protocol: `ACCEPT | MINOR_CORRECTION | MAJOR_CORRECTION | FAIL`.

## Base Accuracy

Clinical base GT absent. Manufacturing engineering checks available:

- watertight / manifold / boundaryEdges / nonManifoldEdges / self-intersection

Do **not** call a mesh manufacturing-ready unless those checks pass. Clinical base distance / height / volume remain `NOT_AVAILABLE` without reference geometry.

## Segmentation Model

| Provider | Role | Operational |
| --- | --- | --- |
| `reference-heuristic` | Dev / engineering only | Yes — **not** clinical |
| Research scaffolds (TSegFormer, MeshSegNet, TGNet, DentalMAE, ONNX) | License/weights gated | No |
| `production-clinical-model` (`ProductionModelProvider`) | Clinical slot | **No** — refuses fake NN output |

Inference without a licensed checkpoint throws `MODEL_UNAVAILABLE`.

## TLA / TIR / TSA

Faithful 3DTeethSeg22-compatible definitions implemented in `TeethSeg22Metrics` + isolated `TeethSeg22Adapter`:

| Metric | Definition |
| --- | --- |
| **TLA** | Mean normalized centroid localization error |
| **TIR** | Correct localization **and** correct FDI |
| **TSA** | Mean tooth-instance F1 |

Also: per-tooth F1 / precision / recall, macro / micro F1, gingiva F1, missing / false tooth counts.

**Held-out fixture TLA / TIR / TSA:** **null** (`NOT_AVAILABLE` — no GT).

Synthetic unit tests exercise formulas only; they are not clinical results.

## Per-Tooth Results

No annotated FDI instances in fixtures. Reporting path exists (`perTooth[]` with FDI, F1, precision, recall, centroid error, status). Aggregate molar scores cannot hide missing incisors once GT is present.

## Hard Cases

Stratification tags: `normal`, `crowding`, `missing-teeth`, `rotated-teeth`, `partially-scanned`, `scan-holes`, `noisy`, `braces-appliances`, `damaged-teeth`.

Current fixtures tagged `normal` only.

## Human Review

`createBlindedReview` + `blindedReviewAgreement` — reviewer payload excludes algorithm name, case score, and expected result. No multi-reviewer study executed in this milestone.

## Failures

No quantitative clinical failures recorded (no GT to fail against). Failure report schema: `ClinicalFailureReport` (input stage, expected, actual, quantitative error, screenshot, fingerprint, model version, reproducibility).

## End-to-End Results

| CASE | IMPORT | ORIENTATION | PREPARE | TRIM | BASE | SEGMENTATION | END-TO-END |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fixture-upper-lower-pair (TEST) | NOT_AVAILABLE | NOT_AVAILABLE | ENGINEERING_VALIDATED | NOT_AVAILABLE | ENGINEERING_VALIDATED | NOT_AVAILABLE | UNKNOWN / NOT_AVAILABLE |

`UNKNOWN` is **never** converted to `PASS`.

Error-propagation chain helper records `NOT_AVAILABLE` until paired GT exists at adjacent stages.

## Model / Dataset Governance

See `PRODUCTION_MODEL_GOVERNANCE`:

- Model / checkpoint: **unset**
- Dataset license: fixtures only · **not cleared** for clinical claims
- Split policy: patientKey isolation
- Clinical data must not leave controlled environments without rights / consent

## Threshold Sources

`DEFAULT_CLINICAL_ACCURACY_THRESHOLDS`:

| Threshold | Source |
| --- | --- |
| Import / orientation / trim / TSA / TIR clinical bars | **UNKNOWN** |
| Base watertight | `project-engineering` (GEO manufacturing contract) |

No arbitrary number is labeled “clinical.”

## Limitations

1. No licensed annotated dental GT in-repo.
2. No production checkpoint registered.
3. Benchmark challenge data not redistributed.
4. Unannotated production scans (if any) may be used only for robustness / qualitative review — **not** quantitative clinical accuracy.
5. Status vocabulary: `NOT_EVALUATED` → `ENGINE_VALIDATED` → `BENCHMARK_VALIDATED` → `CLINICAL_REVIEWED` → `CLINICAL_VALIDATED`. Only the last requires governance evidence.

## Certification

| Gate | Result |
| --- | --- |
| Engineering (accuracy infra + tests + honest semantics) | **PASS** |
| Benchmark (licensed eval vs defined criteria) | **NOT_EVALUATED** |
| Clinical validation | **NOT YET CLINICALLY VALIDATED** |

Harness: `docs/certification/cln-001a-full-clinical-accuracy.mjs`  
Artifact: `docs/certification/cln-001a-full-clinical-accuracy.json`

**Forbidden UI / report claims until evidence exists:** “Clinical Accuracy: 98%”, “Clinical Grade”, “Clinically Validated”, “Production Clinical Model”.

Movement: **not started**.
