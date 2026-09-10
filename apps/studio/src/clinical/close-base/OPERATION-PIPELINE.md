# Operation Pipeline

```
ClinicalCloseBaseController.accept()
  → validate (immutable report)
  → ClinicalCloseBaseOperation.start({ kind: 'close-base' })
  → setPreview(mesh-overlay descriptor)   // never in history
  → OperationSession.runKernel()
      → ClinicalCloseBaseHandler.buildKernelRequest()
      → GeometryServicesKernelPort.execute()
      → GeometryServices.execute({ family, operation })
      → KernelFamilyPort → ManagedKernelSession → KernelBridge
  → validate kernel fingerprint
  → commit() → CommandIntent `close-base.commit` + CommitToken
  → applyCloseBaseCommit() (document revision)
  → WorkflowGate.advance('ready-for-close-base', token)
  → ClinicalSceneBuilder.buildAndPublish({ fitCamera: false })
```

Invariant: no CommitToken → no command → no document revision → no workflow advancement.
