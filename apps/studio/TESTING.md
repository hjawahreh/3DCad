# Testing

```bash
pnpm --filter @cad-studio/studio test
pnpm --filter @cad-studio/studio typecheck
```

## Suites

| Suite | Coverage |
| ----- | -------- |
| Bootstrap | Cold start, crash recovery hooks |
| Composition | All required runtimes present |
| Application startup | Start/shutdown |
| Workspace / layout | Panel persistence |
| Window | Window state manager |
| Menu | Menu bar definitions |
| Runtime integration | Project + import registry + mock viewport attach + input |
| Smoke | Command palette hotkey |
| Architecture | Dependency + no-parser boundaries |

## Performance assumptions

- Cold bootstrap budget: 5000ms (composition only; excludes first GPU frame)
- Viewport attach uses mock backend in automated tests
