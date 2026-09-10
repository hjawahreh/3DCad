# Validation

`ClinicalPreparationValidator` produces immutable `ClinicalValidationReport` snapshots.

## Checks

| ID | Description |
|----|-------------|
| `case-active` | Clinical session has an active case |
| `valid-document` | Case metadata and revision present |
| `import-completed` | At least one mesh object imported |
| `viewport-active` | Viewport session attached and ready |
| `project-saved` | Case is not dirty (optional via preferences) |
| `orientation-completed` | Orientation accepted or explicitly validated |
| `preparation-readiness` | No conflicting orientation tool session |
| `tool-compatibility` | Selected tool matches current stage (when applicable) |

## Usage

- **Start:** save check deferred (`requireSavedCase: false`)
- **Validate / Complete:** respects `ClinicalPreparationPreferences.requireSavedCase`
- **Stage advance:** validates next stage without save requirement
- **Tool activation:** full validation including tool compatibility

Failed validation never mutates document or geometry state.
