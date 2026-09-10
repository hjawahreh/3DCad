# Pipeline

`ClinicalPreparationPipeline` registers orchestration tools (activation only):

| Tool | Stage gate | Group |
|------|------------|-------|
| Trim | Ready For Trim | preparation |
| Close Base | Ready For Close Base | preparation |
| Segmentation | Ready For Segmentation | segmentation |
| Movement | Ready For Movement | treatment |
| Analysis | any | analysis |
| Measurement | any | analysis |
| Manufacturing | Preparation Complete | manufacturing |

`activateTool()` validates compatibility and records orchestration. Geometry implementations are reserved for CLN-006+.

No platform package modifications. No Operation Runtime invocation in CLN-005.
