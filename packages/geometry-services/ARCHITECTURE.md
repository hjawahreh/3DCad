# Geometry Services Architecture

```text
Operation Runtime
        ↓
GeometryServices (family adapters)
        ↓
KernelFamilyPort (abstract)
        ↓
ManagedKernelSession
        ↓
KernelBridge (mock | native | wasm)
```

## Invariants

1. No document mutation.
2. Services depend only on abstract ports — never on concrete kernel impl.
3. Kernel Session opened/closed explicitly.
4. Adapters require fingerprints + validation.ok from `KernelOperationResult`.
