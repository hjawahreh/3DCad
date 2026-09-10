import { useSyncExternalStore } from 'react';
import type { StudioCompositionRoot } from '../application/composition-root.js';

/** Subscribe to host UI revision bumps (project/viewport session changes). */
export const useStudioUiRevision = (root: StudioCompositionRoot): number =>
  useSyncExternalStore(
    (onChange) => root.subscribeUi(onChange),
    () => root.getUiRevision(),
    () => root.getUiRevision()
  );
