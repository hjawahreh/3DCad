# Orientation History

Clinical-host undo stack for **transform operations only**.

## Entry shape

```ts
{
  kind: 'orientation-transform',
  objectId,
  previous: ClinicalDocumentSnapshot,
  next: ClinicalDocumentSnapshot,
  label: 'Orient model'
}
```

## Commands

- `clinical.orientation.undo` (Mod+Z)
- `clinical.orientation.redo` (Mod+Shift+Z)

Header Undo/Redo buttons bind to these commands when history depth allows.

Does not modify platform packages; does not own global application history.
