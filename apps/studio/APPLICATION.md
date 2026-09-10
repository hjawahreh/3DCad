# Application Guide

## Shell

- Header with brand, menus (File/Edit/View/Window/Help), project dirty indicator
- Left sidebar (explorer / tools placeholder)
- Center viewport (grid placeholder, camera operational)
- Right sidebar (selection / camera / importers)
- Bottom output panel
- Status bar
- Command palette (`Ctrl/Cmd+Shift+P`)
- Notification, modal, and dialog hosts

## Project

- New / Close / Recent via Project Runtime
- Open Project dialog is a host placeholder (persistence I/O remains host-owned)

## Import

- Import Runtime connected with passthrough importer (no parsers)
- Import dialog shows progress/error notifications

## Settings

Theme, language (future-ready), viewport grid/FPS, autosave — stored in `localStorage`.

## Diagnostics

Loaded package versions, GPU backend, startup metrics, application logs.
