/**
 * ClinicalGlobalArchBar — shared UPPER / BOTH / LOWER control (default BOTH).
 */

import { useSyncExternalStore } from 'react';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import { ClinicalArchSwitcher } from './ClinicalArchSwitcher.js';
import { useClinicalUiRevision } from './useClinicalUi.js';

export const ClinicalGlobalArchBar = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element | null => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  // Hooks must run unconditionally — do not early-return before useSyncExternalStore.
  const mode = useSyncExternalStore(
    (cb) => workspace.archContext.subscribe(() => cb()),
    () => workspace.archContext.getMode(),
    () => workspace.archContext.getMode()
  );
  const doc = session.getPublicState().activeCase;
  if (doc === undefined || doc.objects.length === 0) {
    return null;
  }
  const hasUpper = doc.objects.some((o) => o.archRole === 'upper');
  const hasLower = doc.objects.some((o) => o.archRole === 'lower');

  const applyMode = (next: 'upper' | 'lower' | 'both'): void => {
    workspace.archContext.setMode(next);
    if (workspace.trim.isActive()) {
      workspace.trim.setArchVisibility(next);
    } else if (next === 'both') {
      workspace.viewport.showAll();
    } else {
      const obj = doc.objects.find((o) => o.archRole === next);
      if (obj !== undefined) {
        workspace.viewport.isolate(obj.id);
      }
    }
    // Recompute clinical framing for visible arches — does not change clinical transform.
    workspace.viewport.presentCanonicalClinicalView('front');
    session.notifyUi();
  };

  return (
    <div
      className="clinical-global-arch-bar"
      data-testid="clinical-global-arch-bar"
      data-arch-context-bar="true"
      id="clinical-arch-context-bar"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="clinical-global-arch-bar__label">Arch</span>
      <ClinicalArchSwitcher
        active={mode}
        hasUpper={hasUpper}
        hasLower={hasLower}
        testId="clinical-global-arch"
        onSelect={applyMode}
      />
    </div>
  );
};
