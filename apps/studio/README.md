# CAD Studio Host (`apps/studio`)

APP-001 Studio Host Application — the executable desktop CAD application that **composes** certified platform packages.

## Launch

From the repository root:

```bash
pnpm install
pnpm run dev
```

`npm run dev` is also supported (delegates to the Studio package).

On machines with Tauri Linux prerequisites (`webkit2gtk-4.1`, etc.), this opens a **native desktop window**. If those libraries are missing, the launcher starts the Vite shell and opens the browser so the Studio UI remains runnable; install [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for the native host.

Forced modes:

```bash
pnpm --filter @cad-studio/studio dev:tauri   # native only
pnpm --filter @cad-studio/studio dev:web     # Vite only
```

## Role

The host is a **composition root** only. It must not:

- implement geometry or parsers
- own Scene/Viewport/Camera/Selection policy
- implement clinical algorithms (those arrive in CLN-* milestones)

CLN-001 adds the clinical framework under `src/clinical/` (case runtime, tool registry, clinical shell) without geometry workflows.

It binds platform runtimes to DOM/canvas, window chrome, menus, settings, and notifications.

## Packages composed

- `@cad-studio/platform-runtime`
- `@cad-studio/project-runtime`
- `@cad-studio/import-runtime`
- `@cad-studio/scene`
- `@cad-studio/viewport` / `@cad-studio/viewport-runtime`
- `@cad-studio/interaction-runtime`
- `@cad-studio/camera-runtime`
- `@cad-studio/selection-runtime`
- `@cad-studio/tool-runtime`
- `@cad-studio/geometry-services`
- `@cad-studio/kernel-bridge`

## Docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [BOOTSTRAP.md](./BOOTSTRAP.md)
- [APPLICATION.md](./APPLICATION.md)
- [TESTING.md](./TESTING.md)
