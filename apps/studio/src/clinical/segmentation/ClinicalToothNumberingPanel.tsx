/**
 * CLN-SEG-001 — compact Tooth Numbering review panel (FDI chart).
 */

import type { JSX } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { useClinicalUiRevision } from '../shell/useClinicalUi.js';
import type { FdiNumber } from './fdi/FdiNumbering.js';
import { toothInspectorModel } from './display/ClinicalSegmentationPresentation.js';
import { resolveSegmentationClinicalStatus } from './status/SegmentationClinicalStatus.js';

const UPPER: readonly FdiNumber[] = Object.freeze([
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28
]);
const LOWER: readonly FdiNumber[] = Object.freeze([
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38
]);

const ToothChip = (props: {
  readonly fdi: FdiNumber;
  readonly present: boolean;
  readonly missing: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
}): JSX.Element => {
  const { fdi, present, missing, selected, onSelect } = props;
  const className = [
    'clinical-tooth-numbering__chip',
    present ? 'clinical-tooth-numbering__chip--present' : '',
    missing ? 'clinical-tooth-numbering__chip--missing' : '',
    selected ? 'clinical-tooth-numbering__chip--selected' : '',
    !present && !missing ? 'clinical-tooth-numbering__chip--inactive' : ''
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      className={className}
      disabled={!present && !missing}
      data-testid={`clinical-tooth-chip-${String(fdi)}`}
      data-fdi={String(fdi)}
      onClick={onSelect}
      title={missing ? `FDI ${String(fdi)} — Missing` : `FDI ${String(fdi)}`}
    >
      {String(fdi)}
    </button>
  );
};

export const ClinicalToothNumberingPanel = (props: {
  readonly workspace: ClinicalWorkspace;
}): JSX.Element | null => {
  const { workspace } = props;
  useClinicalUiRevision(workspace.session);
  const runtime = workspace.segmentation;
  if (!runtime.isActive()) return null;
  const state = runtime.session.getState();
  const pred = state.prediction;
  if (pred === undefined) return null;

  const byFdi = new Map<number, string>();
  for (const inst of pred.instances) {
    const fdi = inst.identification.fdi;
    if (fdi !== undefined && inst.presence !== 'MISSING') {
      byFdi.set(fdi, inst.instanceId);
    }
  }
  const missingSet = new Set(pred.missingSlots.map((m) => m.fdi));
  const selected = pred.instances.find((i) => i.instanceId === state.selectedInstanceId);
  const doc = workspace.session.getPublicState().activeCase;
  const target = doc?.objects.find((o) => o.id === state.targetObjectId);
  const arch =
    target?.archRole === 'upper' || target?.archRole === 'lower' ? target.archRole : undefined;
  const status = resolveSegmentationClinicalStatus({
    providerId: pred.providerId,
    needsClinicalReview: pred.confidence.needsReviewCount > 0
  });

  const renderRow = (label: string, row: readonly FdiNumber[]) => (
    <div className="clinical-tooth-numbering__row" data-arch={label.toLowerCase()}>
      <span className="clinical-tooth-numbering__arch">{label}</span>
      <div className="clinical-tooth-numbering__chips">
        {row.map((fdi, idx) => (
          <span key={fdi} className="clinical-tooth-numbering__cell">
            {idx === 8 ? <span className="clinical-tooth-numbering__midline">|</span> : null}
            <ToothChip
              fdi={fdi}
              present={byFdi.has(fdi)}
              missing={missingSet.has(fdi)}
              selected={
                selected?.identification.fdi === fdi ||
                (selected !== undefined && byFdi.get(fdi) === selected.instanceId)
              }
              onSelect={() => {
                const id = byFdi.get(fdi);
                if (id !== undefined) {
                  runtime.selectInstance(id);
                }
              }}
            />
          </span>
        ))}
      </div>
    </div>
  );

  return (
    <div
      className="clinical-tooth-numbering"
      data-testid="clinical-tooth-numbering"
      role="region"
      aria-label="Tooth Numbering"
    >
      <div className="clinical-tooth-numbering__header">
        <strong>Tooth Numbering</strong>
        <span
          className="clinical-tooth-numbering__status"
          data-testid="clinical-seg-clinical-status"
        >
          {status}
        </span>
      </div>
      {renderRow('Upper', UPPER)}
      {renderRow('Lower', LOWER)}
      {selected !== undefined ? (
        <div
          className="clinical-tooth-numbering__selected"
          data-testid="clinical-tooth-numbering-selected"
        >
          {(() => {
            const model = toothInspectorModel(selected, arch);
            return (
              <>
                <span>
                  FDI <b>{model.identity}</b>
                </span>
                <span>Confidence: {model.confidenceLabel}</span>
                <button
                  type="button"
                  className="clinical-btn clinical-btn--tertiary"
                  data-testid="clinical-segmentation-mark-missing"
                  onClick={() => runtime.markMissing(selected.instanceId)}
                >
                  Mark Missing
                </button>
              </>
            );
          })()}
        </div>
      ) : (
        <p className="muted clinical-tooth-numbering__hint">Select a tooth to review FDI and confidence.</p>
      )}
    </div>
  );
};
