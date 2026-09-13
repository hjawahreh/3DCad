# Case Model

Immutable `ClinicalDocumentSnapshot` owns:

- Case + patient metadata (`PatientMetadata`, `CaseMetadata`)
- Revision, units (`mm`), coordinate system (`rhs-y-up`)
- Display settings (grid/origin/axes)
- Dirty flag
- Mesh object descriptors (no mesh payloads in the snapshot)

Patient fields: `patientId`, `displayName`, optional `chartNumber`, optional `notes`.  
Create helpers accept first/last name and optional patient ID; display name is derived.

## Operations

- **New Case** — opens Create Case dialog (patient + case + Upper/Lower Arch import)
- **Open Case** — lists persisted cases; restores document + mesh buffers via `CasePersistenceContract`
- **Close Case** — clears active case + scene/registry
- **Save** — persists document + mesh geometry through host `ClinicalCaseService`
- **Recent Cases** — localStorage MRU index; openable when a matching persisted case exists

## Persistence

Host-owned `CasePersistenceContract` (`ClinicalCasePersistence.ts`):

- IndexedDB in browser (`cad-studio.clinical.cases.v1`)
- In-memory adapter for tests / no-IDB environments

Workflow status for recent cards is derived (`ClinicalCaseWorkflowStatus`) — not invented Orient/Prep completion.
