import { useRef, useState, useSyncExternalStore, type DragEvent } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import {
  CLINICAL_IMPORT_FORMAT_LABELS,
  CLINICAL_IMPORT_FORMATS,
  type ClinicalArchRole
} from '../import/ClinicalMeshDescriptor.js';
import { ARCH_DISPLAY_NAME } from '../import/ClinicalMeshParsers.js';
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
  return {
    file,
    fileName: file.name,
    extension: ext,
    sizeBytes: file.size
  };
};

type CreatePhase = 'form' | 'working' | 'success' | 'partial';

/**
 * Professional create-patient + create-case + dual-arch import dialog.
 */
export const ClinicalCreateCaseDialog = ({
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

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [patientId, setPatientId] = useState('');
  const [caseName, setCaseName] = useState('');
  const [notes, setNotes] = useState('');
  const [upper, setUpper] = useState<ArchFilePick | null>(null);
  const [lower, setLower] = useState<ArchFilePick | null>(null);
  const [phase, setPhase] = useState<CreatePhase>('form');
  const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);
  const [localError, setLocalError] = useState<string | undefined>(undefined);
  const [upperOk, setUpperOk] = useState(false);
  const [lowerOk, setLowerOk] = useState(false);
  const [failedArch, setFailedArch] = useState<ClinicalArchRole | undefined>(undefined);
  const [validation, setValidation] = useState<ClinicalCaseValidationReport | undefined>(
    undefined
  );
  const [dragArch, setDragArch] = useState<ClinicalArchRole | undefined>(undefined);

  const assignArch = (arch: ClinicalArchRole, files: FileList | null): void => {
    setLocalError(undefined);
    const pick = pickFromFiles(files);
    if (pick === null) {
      if (files?.[0] !== undefined) {
        setLocalError(
          `${arch === 'upper' ? 'Upper Arch' : 'Lower Arch'}: unsupported format. Choose ${FORMAT_HINT}.`
        );
      }
      return;
    }
    if (pick.sizeBytes === 0) {
      setLocalError(
        `${arch === 'upper' ? 'Upper Arch' : 'Lower Arch'}: file is empty. Choose a dental scan with geometry.`
      );
      return;
    }
    if (arch === 'upper') setUpper(pick);
    else setLower(pick);
  };

  const importArch = async (
    arch: ClinicalArchRole,
    pick: ArchFilePick,
    quiet: boolean
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    const bytes = await pick.file.arrayBuffer();
    const source = `file://${pick.fileName}?t=${String(Date.now())}&size=${String(pick.sizeBytes)}&arch=${arch}`;
    const result = await workspace.importController.importSelectedFile({
      source,
      fileName: pick.fileName,
      extension: pick.extension,
      bytes,
      archRole: arch,
      replaceArch: false,
      quiet
    });
    if (result.ok) return { ok: true };
    return { ok: false, message: toClinicalImportError(result.error.message) };
  };

  const refreshValidation = (): ClinicalCaseValidationReport | undefined => {
    const report = workspace.importCoordinator.getLastCaseValidation();
    setValidation(report);
    return report;
  };

  const continueToPipeline = (): void => {
    onClose();
    // Architecture: Orientation is required before Preparation; prep auto-runs on Orient Accept.
    void workspace.session.getHost().commands.invoke('clinical.tool.orient');
    workspace.session.notifyUi();
  };

  const cancelImportOrClose = (): void => {
    if (phase === 'working') {
      workspace.importController.cancel();
      setPhase(upperOk || lowerOk ? 'partial' : 'form');
      setStatusMessage(undefined);
      setLocalError('Import was cancelled.');
      refreshValidation();
      return;
    }
    onClose();
  };

  const createCase = async (retryOnly?: ClinicalArchRole): Promise<void> => {
    setLocalError(undefined);
    setStatusMessage(undefined);

    if (retryOnly === undefined) {
      const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
      if (displayName.length === 0) {
        setLocalError('Enter the patient first and last name to create a case.');
        return;
      }
      if (upper === null || lower === null) {
        setLocalError(
          'Select both Upper Arch and Lower Arch scans before creating the case.'
        );
        return;
      }
      if (workspace.session.getPublicState().activeCase?.dirty === true) {
        setLocalError('Save or close the current case before creating a new one.');
        return;
      }

      setPhase('working');
      setStatusMessage('Creating case…');
      setUpperOk(false);
      setLowerOk(false);
      setFailedArch(undefined);
      setValidation(undefined);

      // Close any prior case without forcing a dirty conflict (operator chose New Case).
      if (workspace.session.getPublicState().activeCase !== undefined) {
        workspace.session.closeCase(true);
        workspace.importCoordinator.objects.clear();
        workspace.importCoordinator.sceneBuilder.publishEmpty(
          workspace.getHost(),
          workspace.getHost().runtimes.scene
        );
        workspace.getHost().runtimes.kernel.registry.clear();
      }

      const resolvedCaseName =
        caseName.trim().length > 0
          ? caseName.trim()
          : `Case · ${displayName}`;

      const created = workspace.session.newCase({
        name: resolvedCaseName,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(patientId.trim().length > 0
          ? { patientId: patientId.trim(), chartNumber: patientId.trim() }
          : {}),
        ...(notes.trim().length > 0 ? { notes: notes.trim() } : {})
      });
      if (!created.ok) {
        setPhase('form');
        setLocalError(toClinicalImportError(created.error.message));
        return;
      }
    } else {
      setPhase('working');
      setFailedArch(undefined);
    }

    const queue: Array<{ arch: ClinicalArchRole; pick: ArchFilePick }> = [];
    if (retryOnly === 'upper' || retryOnly === undefined) {
      if (upper !== null && (retryOnly === 'upper' || !upperOk)) {
        queue.push({ arch: 'upper', pick: upper });
      }
    }
    if (retryOnly === 'lower' || retryOnly === undefined) {
      if (lower !== null && (retryOnly === 'lower' || !lowerOk)) {
        queue.push({ arch: 'lower', pick: lower });
      }
    }

    let nextUpperOk = upperOk;
    let nextLowerOk = lowerOk;

    for (const item of queue) {
      const large = isLargeScan(item.pick.sizeBytes);
      setStatusMessage(
        item.arch === 'upper'
          ? large
            ? 'Loading scans — Upper (large file)…'
            : 'Loading scans — Upper…'
          : large
            ? 'Loading scans — Lower (large file)…'
            : 'Loading scans — Lower…'
      );
      const outcome = await importArch(item.arch, item.pick, true);
      if (!outcome.ok) {
        setFailedArch(item.arch);
        setUpperOk(nextUpperOk);
        setLowerOk(nextLowerOk);
        setPhase('partial');
        setLocalError(
          item.arch === 'upper'
            ? `Upper Arch could not be imported. ${outcome.message}`
            : `Lower Arch could not be imported. ${outcome.message}`
        );
        refreshValidation();
        // Persist whatever succeeded so the case is not lost.
        await workspace.cases.saveActiveCase(workspace);
        return;
      }
      if (item.arch === 'upper') nextUpperOk = true;
      else nextLowerOk = true;
    }

    setUpperOk(nextUpperOk);
    setLowerOk(nextLowerOk);
    setStatusMessage('Preparing geometry…');
    const report = workspace.importCoordinator.validateCurrentCase() ?? refreshValidation();
    setValidation(report);
    setStatusMessage('Ready');
    const saved = await workspace.cases.saveActiveCase(workspace);
    if (!saved.ok) {
      setPhase('partial');
      setLocalError(
        `Scans imported, but the case could not be saved. ${toClinicalImportError(saved.error.message)} You can retry Save from the header.`
      );
      return;
    }

    setPhase('success');
    setStatusMessage(undefined);
    const warn =
      report?.verdict === 'WARNING'
        ? ' Review warnings before continuing.'
        : report?.verdict === 'FAIL'
          ? ' Resolve validation errors before clinical work.'
          : '';
    workspace.session.getHost().notifications.push(
      report?.verdict === 'FAIL' ? 'warning' : 'success',
      'Case',
      `Case created. Upper Arch and Lower Arch imported.${warn}`
    );
  };

  if (phase === 'success') {
    const canContinue = validation?.verdict !== 'FAIL';
    return (
      <div className="clinical-create-case" data-testid="clinical-create-case-success">
        <div className="clinical-create-case__success">
          <p className="clinical-create-case__success-title">Case created</p>
          <ul className="clinical-create-case__success-list">
            <li>Upper Arch imported{upper ? ` · ${upper.fileName}` : ''}</li>
            <li>Lower Arch imported{lower ? ` · ${lower.fileName}` : ''}</li>
            <li>Source geometry preserved</li>
          </ul>
          {validation !== undefined ? (
            <ClinicalCaseValidationPanel report={validation} compact />
          ) : (
            <p className="muted">Validation report unavailable — re-import if issues appear.</p>
          )}
          <p className="muted">
            Next: Orientation, then automatic preparation. Orientation has not been applied yet.
          </p>
        </div>
        <div className="overlay-actions" style={{ paddingLeft: 0, paddingRight: 0 }}>
          <button type="button" className="clinical-btn clinical-btn--secondary" onClick={onClose}>
            Stay here
          </button>
          <button
            type="button"
            className="clinical-btn clinical-btn--primary"
            data-testid="clinical-create-continue-orient"
            disabled={!canContinue}
            title={
              canContinue
                ? 'Continue to Orientation (preparation follows after accept)'
                : 'Resolve validation errors before continuing'
            }
            onClick={continueToPipeline}
          >
            Continue to Orientation
          </button>
        </div>
        {!canContinue ? (
          <p className="clinical-import-dialog__error" data-testid="clinical-create-blocked">
            Fix validation errors, then re-import or open a corrected scan.
          </p>
        ) : null}
      </div>
    );
  }

  const busy = phase === 'working';
  const dropHandlers = (arch: ClinicalArchRole) => ({
    onDragEnter: (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setDragArch(arch);
    },
    onDragOver: (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setDragArch(arch);
    },
    onDragLeave: () => setDragArch(undefined),
    onDrop: (e: DragEvent<HTMLButtonElement>) => {
      e.preventDefault();
      setDragArch(undefined);
      assignArch(arch, e.dataTransfer.files);
    }
  });

  return (
    <div className="clinical-create-case" data-testid="clinical-create-case-dialog">
      <p className="clinical-import-dialog__intro">
        Create a patient case and import Upper and Lower Arch scans ({FORMAT_HINT}).
      </p>

      <section className="clinical-create-case__section" aria-label="Patient">
        <h3>Patient</h3>
        <div className="clinical-create-case__row">
          <label>
            First Name
            <input
              type="text"
              value={firstName}
              disabled={busy || phase === 'partial'}
              autoComplete="off"
              maxLength={120}
              data-testid="clinical-create-first-name"
              onChange={(e) => setFirstName(e.target.value)}
            />
          </label>
          <label>
            Last Name
            <input
              type="text"
              value={lastName}
              disabled={busy || phase === 'partial'}
              autoComplete="off"
              maxLength={120}
              data-testid="clinical-create-last-name"
              onChange={(e) => setLastName(e.target.value)}
            />
          </label>
        </div>
        <label>
          Patient ID <span className="muted">(optional)</span>
          <input
            type="text"
            value={patientId}
            disabled={busy || phase === 'partial'}
            autoComplete="off"
            data-testid="clinical-create-patient-id"
            onChange={(e) => setPatientId(e.target.value)}
          />
        </label>
      </section>

      <section className="clinical-create-case__section" aria-label="Case">
        <h3>Case</h3>
        <label>
          Case Name <span className="muted">(optional)</span>
          <input
            type="text"
            value={caseName}
            disabled={busy || phase === 'partial'}
            autoComplete="off"
            placeholder="Defaults to Case · Patient Name"
            maxLength={120}
            data-testid="clinical-create-case-name"
            onChange={(e) => setCaseName(e.target.value)}
          />
        </label>
        <label>
          Notes <span className="muted">(optional)</span>
          <input
            type="text"
            value={notes}
            disabled={busy || phase === 'partial'}
            autoComplete="off"
            data-testid="clinical-create-notes"
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      </section>

      <section className="clinical-create-case__section" aria-label="Scans">
        <h3>Scans</h3>
        <input
          ref={upperInputRef}
          type="file"
          accept={ACCEPT}
          className="clinical-import-dialog__file-input"
          disabled={busy}
          onChange={(e) => assignArch('upper', e.target.files)}
        />
        <input
          ref={lowerInputRef}
          type="file"
          accept={ACCEPT}
          className="clinical-import-dialog__file-input"
          disabled={busy}
          onChange={(e) => assignArch('lower', e.target.files)}
        />

        <div className="clinical-create-case__arches">
          <button
            type="button"
            className={
              dragArch === 'upper'
                ? 'clinical-import-dropzone clinical-import-dropzone--active'
                : 'clinical-import-dropzone'
            }
            data-testid="clinical-create-upper"
            disabled={busy}
            onClick={() => upperInputRef.current?.click()}
            {...dropHandlers('upper')}
          >
            <strong>{ARCH_DISPLAY_NAME.upper}</strong>
            <span className="muted">
              {upperOk
                ? '✓ Imported'
                : upper
                  ? `✓ ${upper.fileName} · ${formatScanBytes(upper.sizeBytes)}`
                  : `Drop ${FORMAT_HINT} or Browse`}
            </span>
            {upper !== null && isLargeScan(upper.sizeBytes) && !upperOk ? (
              <span className="muted">Large file — import may take a moment</span>
            ) : null}
          </button>
          <button
            type="button"
            className={
              dragArch === 'lower'
                ? 'clinical-import-dropzone clinical-import-dropzone--active'
                : 'clinical-import-dropzone'
            }
            data-testid="clinical-create-lower"
            disabled={busy}
            onClick={() => lowerInputRef.current?.click()}
            {...dropHandlers('lower')}
          >
            <strong>{ARCH_DISPLAY_NAME.lower}</strong>
            <span className="muted">
              {lowerOk
                ? '✓ Imported'
                : lower
                  ? `✓ ${lower.fileName} · ${formatScanBytes(lower.sizeBytes)}`
                  : `Drop ${FORMAT_HINT} or Browse`}
            </span>
            {lower !== null && isLargeScan(lower.sizeBytes) && !lowerOk ? (
              <span className="muted">Large file — import may take a moment</span>
            ) : null}
          </button>
        </div>
      </section>

      {localError !== undefined ? (
        <p className="clinical-import-dialog__error" data-testid="clinical-create-error">
          {localError}
        </p>
      ) : null}

      {phase === 'partial' && validation !== undefined ? (
        <ClinicalCaseValidationPanel report={validation} compact />
      ) : null}

      {busy || (progress.phase !== 'idle' && progress.phase !== 'completed') ? (
        <div className="clinical-import-progress" data-testid="clinical-create-progress">
          <div className="clinical-import-progress__bar">
            <div
              style={{
                width: `${String(Math.round(Math.max(progress.ratio, busy ? 0.15 : 0) * 100))}%`
              }}
            />
          </div>
          <div
            className={
              progress.phase === 'failed' ? 'clinical-import-dialog__error' : 'muted'
            }
          >
            {statusMessage ?? progress.message ?? 'Working…'}
          </div>
        </div>
      ) : null}

      <div className="overlay-actions" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <button
          type="button"
          data-testid="clinical-create-cancel-import"
          onClick={cancelImportOrClose}
        >
          {busy ? 'Cancel import' : 'Cancel'}
        </button>
        {phase === 'partial' && failedArch !== undefined ? (
          <button
            type="button"
            className="clinical-btn clinical-btn--primary"
            data-testid="clinical-create-retry"
            disabled={busy}
            onClick={() => void createCase(failedArch)}
          >
            {failedArch === 'upper' ? 'Retry Upper Arch' : 'Retry Lower Arch'}
          </button>
        ) : (
          <button
            type="button"
            className="clinical-btn clinical-btn--primary"
            data-testid="clinical-create-submit"
            disabled={busy || upper === null || lower === null}
            onClick={() => void createCase()}
          >
            {busy ? 'Creating…' : 'Create Case'}
          </button>
        )}
      </div>
    </div>
  );
};
