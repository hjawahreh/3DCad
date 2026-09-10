import { useSyncExternalStore } from 'react';
import type { ClinicalLayout } from '../workspace/ClinicalLayout.js';

export const useClinicalLayout = (layout: ClinicalLayout) =>
  useSyncExternalStore(
    (onChange) => layout.subscribe(onChange),
    () => layout.get(),
    () => layout.get()
  );
