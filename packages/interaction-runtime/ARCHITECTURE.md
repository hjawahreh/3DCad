# Interaction Runtime Architecture

```text
Raw Platform Event
  → InputNormalizer
  → Filtering
  → ModifierState
  → PointerCaptureManager
  → HoverManager
  → FocusManager
  → Routers (pointer/mouse/keyboard/wheel/gesture-touch)
  → EventDispatcher
  → immutable InteractionEvent
  → Consumers (Tool Runtime)
```

## Principles

- Domain/Scene/Graphics are never mutated here.
- Events are immutable after dispatch.
- Target ids are opaque (no picking / scene traversal).
- Advanced multi-touch, pen pressure extensions, and VR are **reserved contracts only**.

## Thread model

Single-owner per `InteractionRuntime` / `InteractionSession`. No hidden globals. Deterministic ordered dispatch on the owning thread.

## Ownership

Caller owns raw platform events and canvas listeners. Runtime owns session routing state until `dispose()`. Published events are immutable values safe to share after dispatch.
