import { useSyncExternalStore } from 'react';
import type { StudioCompositionRoot } from '../application/composition-root.js';

export const ModalHostView = ({ root }: { readonly root: StudioCompositionRoot }): React.JSX.Element | null => {
  const modal = useSyncExternalStore(
    (onChange) => root.modals.subscribe(() => onChange()),
    () => root.modals.get(),
    () => root.modals.get()
  );
  if (modal === undefined) {
    return null;
  }
  return (
    <div className="overlay-backdrop" role="presentation" onClick={() => root.modals.close()}>
      <div className="overlay-card" role="dialog" aria-label={modal.title} onClick={(e) => e.stopPropagation()}>
        <h2>{modal.title}</h2>
        <p>{modal.body}</p>
        <div className="overlay-actions">
          <button type="button" onClick={() => root.modals.close()}>
            {modal.cancelLabel ?? 'Cancel'}
          </button>
          <button type="button" className="primary" onClick={() => root.modals.close()}>
            {modal.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};
