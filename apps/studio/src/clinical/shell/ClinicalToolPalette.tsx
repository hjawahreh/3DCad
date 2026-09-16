/**
 * CLN-WORKSTATION-001 — compact clinical tool palette (left rail).
 * Progressive disclosure: only active tools look active. Future tools stay inert.
 */

import { useClinicalUiRevision } from './useClinicalUi.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { buildClinicalWorkflowPresentation } from './ClinicalWorkflowPresentation.js';

type PaletteToolId = 'trim' | 'close-base' | 'segmentation' | 'movement' | 'attachments' | 'measurement';

const ACTIVE_TOOLS: readonly {
  readonly id: PaletteToolId;
  readonly label: string;
  readonly commandId: string;
  readonly testId: string;
}[] = Object.freeze([
  Object.freeze({
    id: 'trim' as const,
    label: 'Trim',
    commandId: 'clinical.tool.trim',
    testId: 'clinical-palette-trim'
  }),
  Object.freeze({
    id: 'close-base' as const,
    label: 'Base',
    commandId: 'clinical.tool.closeBase',
    testId: 'clinical-palette-close-base'
  }),
  Object.freeze({
    id: 'segmentation' as const,
    label: 'Segment',
    commandId: 'clinical.tool.segmentation',
    testId: 'clinical-palette-segmentation'
  })
]);

const FUTURE_TOOLS: readonly {
  readonly id: PaletteToolId;
  readonly label: string;
}[] = Object.freeze([
  Object.freeze({ id: 'movement' as const, label: 'Move' }),
  Object.freeze({ id: 'attachments' as const, label: 'Attach' }),
  Object.freeze({ id: 'measurement' as const, label: 'Measure' })
]);

export const ClinicalToolPalette = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const presentation = buildClinicalWorkflowPresentation(workspace);
  const host = session.getHost();

  const trimming = workspace.trim.isActive();
  const basing = workspace.closeBase.isActive();
  const segmenting = workspace.segmentation.isActive();
  const orienting = workspace.orientation.isActive();

  const activeId: PaletteToolId | 'orient' | undefined = trimming
    ? 'trim'
    : basing
      ? 'close-base'
      : segmenting
        ? 'segmentation'
        : orienting
          ? 'orient'
          : undefined;

  const invoke = (commandId: string): void => {
    void host.commands.invoke(commandId);
    session.notifyUi();
  };

  const canEdit =
    presentation.steps.find((s) => s.id === 'trim')?.status === 'available' ||
    presentation.steps.find((s) => s.id === 'trim')?.status === 'current' ||
    presentation.steps.find((s) => s.id === 'trim')?.status === 'completed' ||
    trimming ||
    basing ||
    segmenting;

  return (
    <nav className="clinical-tool-palette" data-testid="clinical-tool-palette" aria-label="Clinical tools">
      <button
        type="button"
        className={
          activeId === 'orient'
            ? 'clinical-tool-palette__btn clinical-tool-palette__btn--active'
            : 'clinical-tool-palette__btn'
        }
        data-testid="clinical-palette-orient"
        title="Orient Scan"
        onClick={() => invoke('clinical.tool.orient')}
      >
        <span className="clinical-tool-palette__icon" aria-hidden="true">
          ⌖
        </span>
        <span className="clinical-tool-palette__label">Orient</span>
      </button>

      {ACTIVE_TOOLS.map((tool) => {
        const locked = !canEdit && tool.id !== 'trim';
        const trimLocked =
          tool.id === 'trim' &&
          presentation.steps.find((s) => s.id === 'trim')?.status === 'locked' &&
          !trimming;
        const disabled = locked || trimLocked;
        return (
          <button
            key={tool.id}
            type="button"
            className={
              activeId === tool.id
                ? 'clinical-tool-palette__btn clinical-tool-palette__btn--active'
                : 'clinical-tool-palette__btn'
            }
            data-testid={tool.testId}
            title={tool.label}
            disabled={disabled}
            onClick={() => invoke(tool.commandId)}
          >
            <span className="clinical-tool-palette__icon" aria-hidden="true">
              {tool.id === 'trim' ? '✂' : tool.id === 'close-base' ? '▢' : '⊞'}
            </span>
            <span className="clinical-tool-palette__label">{tool.label}</span>
          </button>
        );
      })}

      <div className="clinical-tool-palette__divider" aria-hidden="true" />

      {FUTURE_TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className="clinical-tool-palette__btn clinical-tool-palette__btn--future"
          title={`${tool.label} — coming later`}
          disabled
          aria-disabled="true"
        >
          <span className="clinical-tool-palette__icon" aria-hidden="true">
            ·
          </span>
          <span className="clinical-tool-palette__label">{tool.label}</span>
        </button>
      ))}
    </nav>
  );
};
