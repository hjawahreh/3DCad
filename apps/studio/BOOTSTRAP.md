# Bootstrap

## Sequence

1. `StudioApplication.start()`
2. `StudioBootstrap.bootstrap()`
3. Construct `StudioCompositionRoot` (platform DI + runtimes + commands/hotkeys)
4. Apply theme from settings
5. Crash-recovery detection
6. Record startup metrics/diagnostics
7. React mounts `StudioShell`
8. `ViewportHost` attaches canvas → `attachViewport()`
9. Interaction / Camera / Selection sessions bootstrapped against viewport id
10. Empty scene snapshot published; viewport `run()` starts frame loop

## Failure modes

| Failure | Host response |
| -------- | ------------- |
| Viewport attach fails | Diagnostic + UI error banner |
| Missing importer | Import dialog notification |
| Dirty project close | Project runtime enforces save/force |
| Unclean prior shutdown | Warning notification |

## Shutdown

`StudioApplication.shutdown()` disposes sessions/runtimes and clears the unclean-shutdown marker.
