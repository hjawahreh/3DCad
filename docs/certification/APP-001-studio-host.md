# Release Certification Report

**Milestone:** APP-001 — Studio Host Application  
**Package(s):** `@cad-studio/studio` (`apps/studio`)  
**Stability target:** Experimental  
**Author:** platform engineering  
**Date:** 2026-07-26  

---

## Overview

- [x] Scope completed as defined by milestone acceptance criteria  

**Scope summary:** Desktop Studio Host composing certified platform runtimes (Tauri v2 + React 19 + Vite); shell, viewport host, project/import wiring, command palette, settings, diagnostics; no clinical tools or parsers.

## Architecture

- [x] Constitution compliant (host composition only; ADR-0006 for `apps/studio` path)  
- [x] No boundary violations  
- [x] No platform package modifications  

## Quality

- [x] Unit / integration / architecture / smoke tests pass  

**Commands / evidence:** `pnpm --filter @cad-studio/studio test`

## Documentation

- [x] README / ARCHITECTURE / BOOTSTRAP / APPLICATION / TESTING / OWNERS  

## Known Limitations

- Open Project file picker is placeholder
- Import uses passthrough importer (parsers deferred)
- Native menus partially mirrored in HTML menubar; OS menu bar reserved for future polish
- Native Tauri window requires OS WebKit/GTK prerequisites; launcher falls back to Vite shell when missing

## Decision

**PASS** (pending Certification Authority review)

**Rationale:** Acceptance criteria implemented; platform packages unchanged; host launches via `pnpm run dev` / `npm run dev`. On this verification host, `webkit2gtk-4.1` was unavailable without sudo — Tauri project is scaffolded and Vite shell verified; native window path is `dev:tauri` once prerequisites are installed.

**Blocking reasons:** None
