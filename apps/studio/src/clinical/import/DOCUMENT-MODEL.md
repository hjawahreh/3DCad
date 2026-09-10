# Document Model (CLN-002)

`ClinicalDocumentSnapshot.objects` holds immutable `ClinicalMeshDescriptor` entries:

- id, displayName, sourceFile, format (stl|obj|ply)
- units, bounds, vertex/face counts (optional from importer attributes)
- importedAt, visibility, selectable, hierarchyParentId
- importerId, sourceEntityId, displayState

No mutable mesh buffers are stored in the clinical layer.
