# Operation Pipeline

```
ClinicalTrimController.accept()
  → ClinicalTrimOperation.start({ kind: 'trim' })
  → OperationSession.setPreview(boundary descriptor)
  → OperationSession.runKernel()
      → ClinicalTrimHandler.buildKernelRequest()
      → GeometryServicesKernelPort.execute()
      → GeometryServices.execute({ family: 'boolean', operation: 'subtract' })
      → KernelFamilyPort → ManagedKernelSession → KernelBridge
  → OperationSession.validate()
  → OperationSession.commit() → CommandIntent `trim.commit` + CommitToken
  → ClinicalTrimManager.applyTrimCommit()
  → WorkflowGate.advance('ready-for-trim', token)
  → ClinicalSceneBuilder.buildAndPublish()
```

Platform packages are unmodified. The studio-owned `GeometryServicesKernelPort` adapts Operation Runtime's `KernelPort` to `@cad-studio/geometry-services`.

Previews never enter document history (Operation Runtime invariant).
