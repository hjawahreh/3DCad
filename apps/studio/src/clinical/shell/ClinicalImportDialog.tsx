import { useRef, useSyncExternalStore, useState } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { CLINICAL_IMPORT_FORMATS } from '../import/ClinicalMeshDescriptor.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

const ACCEPT = CLINICAL_IMPORT_FORMATS.map((ext) => `.${ext}`).join(',');

export const ClinicalImportDialog = ({
  workspace,
  onClose
}: {
  readonly workspace: ClinicalWorkspace;
  readonly onClose: () => void;
}): React.JSX.Element => {
  useClinicalUiRevision(workspace.session);
  const coordinator = workspace.importCoordinator;
  const progress = useSyncExternalStore(
    (onChange) => coordinator.notifications.subscribe(onChange),
    () => coordinator.notifications.getProgress(),
    () => coordinator.notifications.getProgress()
  );
  const recent = coordinator.notifications.listRecent();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selected, setSelected] = useState<{
    readonly fileName: string;
    readonly extension: string;
    readonly sizeBytes: number;
    readonly source: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>(undefined);

  const onPickFiles = (files: FileList | null): void => {
    setLocalError(undefined);
    const file = files?.[0];
    if (file === undefined) {
      setSelected(null);
      return;
    }
    const ext = file.name.includes('.')
      ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
      : '';
    if (!(CLINICAL_IMPORT_FORMATS as readonly string[]).includes(ext)) {
      setSelected(null);
      setLocalError(`Unsupported format ".${ext || '?'}". Choose STL, OBJ, or PLY.`);
      return;
    }
    // Unique source ref per pick so Import Runtime duplicate-source checks never block re-imports.
    const source = `file://${file.name}?t=${String(Date.now())}&size=${String(file.size)}`;
    setSelected({
      fileName: file.name,
      extension: ext,
      sizeBytes: file.size,
      source
    });
  };

  const run = async (): Promise<void> => {
    if (selected === null) {
      setLocalError('Choose a mesh file first.');
      fileInputRef.current?.click();
      return;
    }
    setBusy(true);
    setLocalError(undefined);
    const result = await workspace.importController.importSelectedFile({
      source: selected.source,
      fileName: selected.fileName,
      extension: selected.extension
    });
    setBusy(false);
    if (result.ok) {
      onClose();
      return;
    }
    setLocalError(result.error.message);
  };

  return (
    <div className="clinical-import-dialog">
      <p>
        Choose an STL, OBJ, or PLY file. Import Runtime validates and resolves the plug-in; CLN-002 creates immutable
        clinical mesh descriptors (no mesh editing).
      </p>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        className="clinical-import-dialog__file-input"
        disabled={busy}
        onChange={(event) => onPickFiles(event.target.files)}
      />

      <div className="clinical-import-dialog__picker">
        <button
          type="button"
          className="primary"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          Choose file…
        </button>
        <div className="clinical-import-dialog__selection">
          {selected === null ? (
            <span className="muted">No file selected</span>
          ) : (
            <>
              <strong>{selected.fileName}</strong>
              <span className="muted">
                {' '}
                · {selected.extension.toUpperCase()} · {(selected.sizeBytes / 1024).toFixed(1)} KB
              </span>
            </>
          )}
        </div>
      </div>

      <p className="muted">Supported: {CLINICAL_IMPORT_FORMATS.join(', ').toUpperCase()}</p>

      {localError !== undefined ? <p className="clinical-import-dialog__error">{localError}</p> : null}

      {progress.phase !== 'idle' && progress.phase !== 'completed' ? (
        <div className="clinical-import-progress">
          <div className="clinical-import-progress__bar">
            <div style={{ width: `${String(Math.round(progress.ratio * 100))}%` }} />
          </div>
          <div className={progress.phase === 'failed' ? 'clinical-import-dialog__error' : 'muted'}>
            {progress.phase} · {progress.message}
          </div>
        </div>
      ) : null}

      <div className="overlay-actions" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <button type="button" disabled={!busy} onClick={() => workspace.importController.cancel()}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={busy} onClick={() => void run()}>
          {busy ? 'Importing…' : 'Import'}
        </button>
      </div>

      <h3>Recent imports</h3>
      <ul className="clinical-list">
        {recent.length === 0 ? <li className="muted">No imports yet</li> : null}
        {recent.map((entry, index) => (
          <li key={`${entry.fileName}-${String(entry.importedAt)}-${String(index)}`}>
            {entry.success ? '✓' : '✗'} {entry.fileName}{' '}
            <span className="muted">
              · {entry.format} · {entry.objectCount} obj
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
