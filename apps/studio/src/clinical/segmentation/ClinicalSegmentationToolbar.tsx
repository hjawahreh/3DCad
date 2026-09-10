/**
 * Segmentation toolbar — provider, run, review actions.
 */

import type { JSX } from 'react';
import type { ClinicalSegmentationRuntime } from './ClinicalSegmentationRuntime.js';

export const ClinicalSegmentationToolbar = (props: {
  readonly runtime: ClinicalSegmentationRuntime;
}): JSX.Element | null => {
  const { runtime } = props;
  if (!runtime.isActive()) {
    return null;
  }
  const state = runtime.session.getState();
  const providers = runtime.registry.list();
  return (
    <div className="clinical-segmentation-toolbar" role="toolbar" aria-label="Segmentation">
      <span className="clinical-segmentation-toolbar__label">Segment Teeth</span>
      <button type="button" className="clinical-btn clinical-btn--primary" onClick={() => void runtime.runInference()}>
        Run Segmentation
      </button>
      <button
        type="button"
        className="clinical-btn clinical-btn--primary"
        disabled={state.phase !== 'ready-for-review'}
        onClick={() => void runtime.accept()}
      >
        Accept Segmentation
      </button>
      <button type="button" className="clinical-btn clinical-btn--secondary" onClick={() => runtime.reject()}>
        Reject
      </button>
      <button type="button" className="clinical-btn clinical-btn--tertiary" onClick={() => runtime.setViewMode('semantic')}>
        Semantic
      </button>
      <button type="button" className="clinical-btn clinical-btn--tertiary" onClick={() => runtime.setViewMode('instance')}>
        Instance
      </button>
      <button type="button" className="clinical-btn clinical-btn--tertiary" onClick={() => runtime.setViewMode('fdi')}>
        FDI
      </button>
      <button type="button" className="clinical-btn clinical-btn--tertiary" onClick={() => runtime.setViewMode('confidence')}>
        Confidence
      </button>
      <details className="clinical-advanced clinical-advanced--inline">
        <summary>Provider</summary>
        <label>
          Provider
          <select
            value={state.providerId}
            onChange={(e) => runtime.setProvider(e.target.value)}
          >
            {providers.map((p) => (
              <option key={p.info.id} value={p.info.id} disabled={!p.info.operational}>
                {p.info.displayName}
                {!p.info.operational ? ' (unavailable)' : ''}
              </option>
            ))}
          </select>
        </label>
      </details>
    </div>
  );
};
