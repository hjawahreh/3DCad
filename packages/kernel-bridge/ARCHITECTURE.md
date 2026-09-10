# Kernel Integration Layer Architecture

```text
Geometry Services Adapter
        ↓
KernelFamilyPort (boolean | transform | …)
        ↓
ManagedKernelSession (cache, tolerance, cancel, diagnostics)
        ↓
KernelBridge.invoke
        ↓
Mock | Native | WASM adapter
```

## Parts

1. **Bridge** — opaque handles, ABI version, ownership, typed `KernelOperationResult`
2. **Session Manager** — open/current/close; resource + topology caches
3. **Capability Negotiation** — supported families before invoke
4. **Ports** — services never see concrete kernel implementation

## Reserved

`GeometryTransactionReserve` — multi-op atomicity; commit unavailable in COD-006.
