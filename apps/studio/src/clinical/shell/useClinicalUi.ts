import { useSyncExternalStore } from 'react';
import type { ClinicalSession } from '../runtime/session.js';

export const useClinicalUiRevision = (session: ClinicalSession): number =>
  useSyncExternalStore(
    (onChange) => session.subscribeUi(onChange),
    () => session.getUiRevision(),
    () => session.getUiRevision()
  );
