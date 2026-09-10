# Scene Integration

`ClinicalSceneBuilder`:

1. Maps each descriptor → `DocumentEntityView` (`kind: 'mesh'`, bounds, display/metadata)
2. Builds `DocumentRevision` and projects via `SceneProjectionEngine`
3. Publishes snapshot to Viewport Runtime
4. Clears selection and `fitAll` to union bounds

No geometry mutation.
