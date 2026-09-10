import { useRef, useSyncExternalStore, useState } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import {
  CLINICAL_IMPORT_FORMATS,
  type ClinicalArchRole
} from '../import/ClinicalMeshDescriptor.js';
import { ARCH_DISPLAY_NAME, suggestArchRole } from '../import/ClinicalMeshParsers.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

const ACCEPT = CLINICAL_IMPORT_FORMATS.map((ext) => `.${ext}`).join(',');

interface ArchFilePick {
  readonly file: File;
  readonly fileName: string;
  readonly extension: string;
  readonly sizeBytes: number;
  readonly suggested?: ClinicalArchRole | undefined;
}

const pickFromFiles = (files: FileList | null): ArchFilePick | null => {
  const file = files?.[0];
  if (file === undefined) return null;
  const ext = file.name.includes('.')
    ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
    : '';
  if (!(CLINICAL_IMPORT_FORMATS as readonly string[]).includes(ext)) {
    return null;
  }
  const suggested = suggestArchRole(file.name);
  return {
    file,
    fileName: file.name,
    extension: ext,
    sizeBytes: file.size,
    ...(suggested === undefined ? {} : { suggested })
  };
};

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
  const upperInputRef = useRef<HTMLInputElement | null>(null);
  const lowerInputRef = useRef<HTMLInputElement | null>(null);
  const [upper, setUpper] = useState<ArchFilePick | null>(null);
  const [lower, setLower] = useState<ArchFilePick | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const [replacePrompt, setReplacePrompt] = useState<{
    readonly arch: ClinicalArchRole;
    readonly file: ArchFilePick;
  } | null>(null);

  const doc = workspace.session.getPublicState().activeCase;
  const hasUpper = doc?.objects.some((o) => o.archRole === 'upper') === true;
  const hasLower = doc?.objects.some((o) => o.archRole === 'lower') === true;

  const assignArch = (arch: ClinicalArchRole, files: FileList | null): void => {
    setLocalError(undefined);
    setReplacePrompt(null);
    const pick = pickFromFiles(files);
    if (pick === null) {
      if (files?.[0] !== undefined) {
        setLocalError('Unsupported format. Choose STL, OBJ, or PLY.');
      }
      return;
    }
    if (arch === 'upper') setUpper(pick);
    else setLower(pick);
  };

  const importOne = async (
    arch: ClinicalArchRole,
    pick: ArchFilePick,
    replaceArch: boolean,
    quiet: boolean
  ): Promise<{ ok: true } | { ok: false; message: string; conflict: boolean }> => {
    const bytes = await pick.file.arrayBuffer();
    const source = `file://${pick.fileName}?t=${String(Date.now())}&size=${String(pick.sizeBytes)}&arch=${arch}`;
    const result = await workspace.importController.importSelectedFile({
      source,
      fileName: pick.fileName,
      extension: pick.extension,
      bytes,
      archRole: arch,
      replaceArch,
      quiet
    });
    if (result.ok) return { ok: true };
    return {
      ok: false,
      message: result.error.message,
      conflict: result.error.code === 'conflict'
    };
  };

  const run = async (forceReplace?: ClinicalArchRole): Promise<void> => {
    if (upper === null && lower === null) {
      setLocalError('Choose at least one dental scan.');
      return;
    }
    setBusy(true);
    setLocalError(undefined);
    setReplacePrompt(null);

    const queue: Array<{ arch: ClinicalArchRole; pick: ArchFilePick }> = [];
    if (forceReplace !== undefined) {
      const pick = forceReplace === 'upper' ? upper : lower;
      if (pick === null) {
        setLocalError('Choose a file for the arch to replace.');
        setBusy(false);
        return;
      }
      queue.push({ arch: forceReplace, pick });
    } else {
      if (upper !== null) queue.push({ arch: 'upper', pick: upper });
      if (lower !== null) queue.push({ arch: 'lower', pick: lower });
    }

    const quiet = queue.length > 1;
    let imported = 0;
    for (const item of queue) {
      const outcome = await importOne(item.arch, item.pick, forceReplace === item.arch, quiet);
      if (!outcome.ok) {
        if (outcome.conflict) {
          setReplacePrompt({ arch: item.arch, file: item.pick });
          setLocalError(outcome.message);
          setBusy(false);
          return;
        }
        setLocalError(
          item.arch === 'upper'
            ? `Could not import the upper scan. ${outcome.message}`
            : `Could not import the lower scan. ${outcome.message}`
        );
        setBusy(false);
        return;
      }
      imported += 1;
    }

    if (quiet && imported === 2) {
      workspace.session.getHost().notifications.push(
        'success',
        'Import',
        'Upper and lower scans imported successfully.'
      );
    }

    setBusy(false);
    onClose();
  };

  return (
    <div className="clinical-import-dialog" data-testid="clinical-import-dialog">
      <p className="clinical-import-dialog__intro">
        Add one or both scans to this case.
      </p>

      <input
        ref={upperInputRef}
        type="file"
        accept={ACCEPT}
        className="clinical-import-dialog__file-input"
        disabled={busy}
        onChange={(event) => assignArch('upper', event.target.files)}
      />
      <input
        ref={lowerInputRef}
        type="file"
        accept={ACCEPT}
        className="clinical-import-dialog__file-input"
        disabled={busy}
        onChange={(event) => assignArch('lower', event.target.files)}
      />

      <div className="clinical-import-arch" data-testid="clinical-import-upper">
        <div className="clinical-import-arch__header">
          <strong>{ARCH_DISPLAY_NAME.upper}</strong>
          {hasUpper ? <span className="muted"> · already in case</span> : null}
        </div>
        <button
          type="button"
          className="clinical-btn clinical-btn--secondary"
          disabled={busy}
          onClick={() => upperInputRef.current?.click()}
        >
          Choose Scan
        </button>
        <div className="clinical-import-dialog__selection">
          {upper === null ? (
            <span className="muted">{hasUpper ? '✓ Imported' : '○ Not selected'}</span>
          ) : (
            <>
              <strong>✓ {upper.fileName}</strong>
              <span className="muted"> · Ready</span>
            </>
          )}
        </div>
      </div>

      <div className="clinical-import-arch" data-testid="clinical-import-lower">
        <div className="clinical-import-arch__header">
          <strong>{ARCH_DISPLAY_NAME.lower}</strong>
          {hasLower ? <span className="muted"> · already in case</span> : null}
        </div>
        <button
          type="button"
          className="clinical-btn clinical-btn--secondary"
          disabled={busy}
          onClick={() => lowerInputRef.current?.click()}
        >
          Choose Scan
        </button>
        <div className="clinical-import-dialog__selection">
          {lower === null ? (
            <span className="muted">{hasLower ? '✓ Imported' : '○ Not selected'}</span>
          ) : (
            <>
              <strong>✓ {lower.fileName}</strong>
              <span className="muted"> · Ready</span>
            </>
          )}
        </div>
      </div>

      {localError !== undefined ? <p className="clinical-import-dialog__error">{localError}</p> : null}

      {replacePrompt !== null ? (
        <div className="clinical-import-replace" data-testid="clinical-import-replace">
          <p>{ARCH_DISPLAY_NAME[replacePrompt.arch]} already contains a scan.</p>
          <div className="overlay-actions" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <button type="button" disabled={busy} onClick={() => setReplacePrompt(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="clinical-btn clinical-btn--primary"
              disabled={busy}
              onClick={() => void run(replacePrompt.arch)}
            >
              Replace
            </button>
          </div>
        </div>
      ) : null}

      {progress.phase !== 'idle' && progress.phase !== 'completed' ? (
        <div className="clinical-import-progress">
          <div className="clinical-import-progress__bar">
            <div style={{ width: `${String(Math.round(progress.ratio * 100))}%` }} />
          </div>
          <div className={progress.phase === 'failed' ? 'clinical-import-dialog__error' : 'muted'}>
            {progress.message || progress.phase}
          </div>
        </div>
      ) : null}

      <div className="overlay-actions" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <button type="button" disabled={!busy} onClick={() => workspace.importController.cancel()}>
          Cancel
        </button>
        <button
          type="button"
          className="clinical-btn clinical-btn--primary"
          disabled={busy || (upper === null && lower === null)}
          onClick={() => void run()}
        >
          {busy ? 'Importing…' : 'Import Scans'}
        </button>
      </div>
    </div>
  );
};
