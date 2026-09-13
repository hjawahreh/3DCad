import { useRef, useSyncExternalStore, useState } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import {
  CLINICAL_IMPORT_FORMAT_LABELS,
  CLINICAL_IMPORT_FORMATS,
  type ClinicalArchRole
} from '../import/ClinicalMeshDescriptor.js';
import { ARCH_DISPLAY_NAME, suggestArchRole } from '../import/ClinicalMeshParsers.js';
import type { ClinicalCaseValidationReport } from '../case/ClinicalCaseValidation.js';
import { useClinicalUiRevision } from './useClinicalUi.js';
import { ClinicalCaseValidationPanel } from './ClinicalCaseValidationPanel.js';
import {
  formatScanBytes,
  isLargeScan,
  toClinicalImportError
} from './ClinicalImportPresentation.js';

const ACCEPT = CLINICAL_IMPORT_FORMATS.map((ext) => `.${ext}`).join(',');
const FORMAT_HINT = Object.values(CLINICAL_IMPORT_FORMAT_LABELS).join(' / ');

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

type ImportPhase = 'form' | 'working' | 'result';

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
  const [phase, setPhase] = useState<ImportPhase>('form');
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const [importedCount, setImportedCount] = useState(0);
  const [validation, setValidation] = useState<ClinicalCaseValidationReport | undefined>(
    undefined
  );
  const [replacePrompt, setReplacePrompt] = useState<{
    readonly arch: ClinicalArchRole;
    readonly file: ArchFilePick;
  } | null>(null);

  const doc = workspace.session.getPublicState().activeCase;
  const hasUpper = doc?.objects.some((o) => o.archRole === 'upper') === true;
  const hasLower = doc?.objects.some((o) => o.archRole === 'lower') === true;
  const busy = phase === 'working';

  const assignArch = (arch: ClinicalArchRole, files: FileList | null): void => {
    setLocalError(undefined);
    setReplacePrompt(null);
    const pick = pickFromFiles(files);
    if (pick === null) {
      if (files?.[0] !== undefined) {
        setLocalError(`Unsupported format. Choose ${FORMAT_HINT}.`);
      }
      return;
    }
    if (pick.sizeBytes === 0) {
      setLocalError('Selected file is empty. Choose a dental scan with geometry.');
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
      message: toClinicalImportError(result.error.message),
      conflict: result.error.code === 'conflict'
    };
  };

  const run = async (forceReplace?: ClinicalArchRole): Promise<void> => {
    if (upper === null && lower === null) {
      setLocalError('Choose at least one dental scan.');
      return;
    }
    setPhase('working');
    setLocalError(undefined);
    setReplacePrompt(null);

    const queue: Array<{ arch: ClinicalArchRole; pick: ArchFilePick }> = [];
    if (forceReplace !== undefined) {
      const pick = forceReplace === 'upper' ? upper : lower;
      if (pick === null) {
        setLocalError('Choose a file for the arch to replace.');
        setPhase('form');
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
          setPhase('form');
          return;
        }
        setLocalError(
          item.arch === 'upper'
            ? `Could not import the upper scan. ${outcome.message}`
            : `Could not import the lower scan. ${outcome.message}`
        );
        setValidation(workspace.importCoordinator.getLastCaseValidation());
        setPhase('form');
        return;
      }
      imported += 1;
    }

    const report = workspace.importCoordinator.getLastCaseValidation();
    setValidation(report);
    setImportedCount(imported);
    if (quiet && imported === 2) {
      workspace.session.getHost().notifications.push(
        report?.verdict === 'FAIL' ? 'warning' : 'success',
        'Import',
        report?.verdict === 'WARNING'
          ? 'Upper and lower scans imported with warnings.'
          : 'Upper and lower scans imported successfully.'
      );
    }
    setPhase('result');
  };

  const cancelOrClose = (): void => {
    if (busy) {
      workspace.importController.cancel();
      setPhase('form');
      setLocalError('Import was cancelled.');
      return;
    }
    onClose();
  };

  if (phase === 'result') {
    const canContinue = validation?.verdict !== 'FAIL';
    return (
      <div className="clinical-import-dialog" data-testid="clinical-import-result">
        <p className="clinical-create-case__success-title">
          {importedCount === 1 ? 'Scan imported' : 'Scans imported'}
        </p>
        <p className="muted">Source geometry preserved. Review validation before continuing.</p>
        {validation !== undefined ? (
          <ClinicalCaseValidationPanel report={validation} compact />
        ) : null}
        <div className="overlay-actions" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <button type="button" className="clinical-btn clinical-btn--secondary" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="clinical-btn clinical-btn--primary"
            data-testid="clinical-import-continue-orient"
            disabled={!canContinue}
            onClick={() => {
              onClose();
              void workspace.session.getHost().commands.invoke('clinical.tool.orient');
              workspace.session.notifyUi();
            }}
          >
            Continue to Orientation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="clinical-import-dialog" data-testid="clinical-import-dialog">
      <p className="clinical-import-dialog__intro">
        Add one or both scans to this case ({FORMAT_HINT}).
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
              <span className="muted">
                {' '}
                · {formatScanBytes(upper.sizeBytes)}
                {isLargeScan(upper.sizeBytes) ? ' · large file' : ''}
              </span>
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
              <span className="muted">
                {' '}
                · {formatScanBytes(lower.sizeBytes)}
                {isLargeScan(lower.sizeBytes) ? ' · large file' : ''}
              </span>
            </>
          )}
        </div>
      </div>

      {localError !== undefined ? (
        <p className="clinical-import-dialog__error" data-testid="clinical-import-error">
          {localError}
        </p>
      ) : null}

      {replacePrompt !== null ? (
        <div className="clinical-import-replace" data-testid="clinical-import-replace">
          <p>{ARCH_DISPLAY_NAME[replacePrompt.arch]} already contains a scan.</p>
          <div className="overlay-actions" style={{ paddingLeft: 0, paddingRight: 0 }}>
            <button type="button" disabled={busy} onClick={() => setReplacePrompt(null)}>
              Keep existing
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

      {busy || (progress.phase !== 'idle' && progress.phase !== 'completed') ? (
        <div className="clinical-import-progress" data-testid="clinical-import-progress">
          <div className="clinical-import-progress__bar">
            <div style={{ width: `${String(Math.round(Math.max(progress.ratio, 0.15) * 100))}%` }} />
          </div>
          <div className={progress.phase === 'failed' ? 'clinical-import-dialog__error' : 'muted'}>
            {progress.message || progress.phase}
          </div>
        </div>
      ) : null}

      <div className="overlay-actions" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <button type="button" data-testid="clinical-import-cancel" onClick={cancelOrClose}>
          {busy ? 'Cancel import' : 'Cancel'}
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
