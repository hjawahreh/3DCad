import type { StudioCompositionRoot } from '../application/composition-root.js';

/**
 * ToolHost — reserves the tool dock region; clinical tools arrive in later milestones.
 */
export const ToolHost = ({ root }: { readonly root: StudioCompositionRoot }): React.JSX.Element => {
  const active = root.sessions.selectionSession?.getLifecyclePhase() ?? 'idle';
  return (
    <div className="tool-host" data-selection-phase={active}>
      <div className="tool-host__title">Tools</div>
      <p className="tool-host__hint">Platform tool runtime is composed. Clinical tools are not enabled in APP-001.</p>
    </div>
  );
};
