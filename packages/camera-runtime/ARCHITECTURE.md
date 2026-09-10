# Camera Runtime Architecture

```text
Interaction / Host
        ↓
CameraSession (lifecycle)
        ↓
NavigationCoordinator (orbit / pan / zoom / fit / preset)
        ↓
CameraManager → immutable CameraSnapshot
        ↓
Viewport Runtime synchronization (aspect / size)
```

## Principles

- Camera owns pose + projection only.
- Navigation never mutates Scene.
- Fit Selection is an API that accepts caller-supplied bounds (no selection logic).
- Fly-through, VR, stereo, and cinematic animation are **reserved contracts**.

## Thread model

Single-owner per runtime/session. No hidden globals. Deterministic updates on the owning thread.

## Ownership

Caller owns viewport/canvas. Runtime owns session camera state until `dispose()`. Published `CameraSnapshot` values are immutable.
