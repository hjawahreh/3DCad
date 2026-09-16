import { useSyncExternalStore } from 'react';
import type { PresetView } from '@cad-studio/camera-runtime';
import type { ClinicalRightTab } from '../workspace/ClinicalLayout.js';
import type { ClinicalWorkspace } from '../workspace/ClinicalWorkspace.js';
import {
  DISPLAY_MODES,
  type ClinicalBackgroundTheme,
  type ClinicalDisplayMode,
  type ClinicalLightingPreset
} from '../display/ClinicalDisplayPreferences.js';
import { useClinicalLayout } from './useClinicalLayout.js';
import { useClinicalUiRevision } from './useClinicalUi.js';
import { ClinicalSegmentationInspector } from '../segmentation/ClinicalSegmentationInspector.js';
import {
  evaluateSegmentationIntegrity,
  movementReadinessUiLabel,
  segmentationIntegrityUiLabel
} from '../segmentation/ClinicalSegmentationIntegrity.js';

const TABS: readonly ClinicalRightTab[] = Object.freeze([
  'inspector',
  'properties',
  'selection',
  'camera',
  'display',
  'tool'
]);

const BACKGROUNDS: readonly ClinicalBackgroundTheme[] = Object.freeze([
  'dark',
  'neutral',
  'clinical-blue',
  'light'
]);

const LIGHTING: readonly ClinicalLightingPreset[] = Object.freeze([
  'studio',
  'soft',
  'high-contrast',
  'flat'
]);

const TAB_LABELS: Readonly<Record<ClinicalRightTab, string>> = Object.freeze({
  inspector: 'Inspector',
  properties: 'Properties',
  selection: 'Selection',
  camera: 'Camera',
  display: 'Display',
  tool: 'Tool'
});

export const ClinicalRightPanel = ({
  workspace
}: {
  readonly workspace: ClinicalWorkspace;
}): React.JSX.Element => {
  const session = workspace.session;
  useClinicalUiRevision(session);
  const layout = useClinicalLayout(workspace.layout);
  const prefs = useSyncExternalStore(
    (cb) => workspace.viewport.preferences.subscribe(cb),
    () => workspace.viewport.preferences.get(),
    () => workspace.viewport.preferences.get()
  );
  const host = session.getHost();
  const doc = session.getPublicState().activeCase;
  const selection = host.sessions.selectionSession?.getSnapshot();
  const camera = host.sessions.cameraSession?.getSnapshot();
  const activeTool = session.getTools().getActive();
  const presets = workspace.viewport.listPresets();
  const prep = workspace.preparation.session.getState();

  return (
    <aside className="clinical-right" data-testid="clinical-right-panel">
      <div className="clinical-tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={layout.rightTab === tab ? 'clinical-tab clinical-tab--active' : 'clinical-tab'}
            onClick={() => workspace.layout.update({ rightTab: tab })}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>
      <div className="clinical-right__body">
        {layout.rightTab === 'inspector' || layout.rightTab === 'properties' ? (
          doc === undefined ? (
            <div className="clinical-workspace-card">
              <h3>Workspace</h3>
              <p className="muted">No case loaded. Import a scan to begin.</p>
            </div>
          ) : (
            <>
              <div className="clinical-workspace-card">
                <h3>Workspace</h3>
                <dl className="kv">
                  <dt>Case</dt>
                  <dd>{doc.caseMeta.name}</dd>
                  <dt>Save</dt>
                  <dd>{doc.dirty ? 'Unsaved changes' : 'Saved'}</dd>
                  <dt>Step</dt>
                  <dd>{prep.currentStage.replace(/-/g, ' ')}</dd>
                  <dt>Units</dt>
                  <dd>{doc.units}</dd>
                  <dt>Models</dt>
                  <dd>{String(doc.objects.length)}</dd>
                </dl>
              </div>
              <h3>Objects</h3>
              <ul className="clinical-list">
                {doc.objects.length === 0 ? <li className="muted">No objects</li> : null}
                {doc.objects.map((obj) => (
                  <li key={obj.id}>
                    <button
                      type="button"
                      className="clinical-link"
                      onClick={() => {
                        if (obj.visible) {
                          workspace.viewport.hide(obj.id);
                        } else {
                          workspace.viewport.show(obj.id);
                        }
                        session.notifyUi();
                      }}
                    >
                      {obj.visible ? 'Hide' : 'Show'}
                    </button>{' '}
                    <button
                      type="button"
                      className="clinical-link"
                      onClick={() => {
                        workspace.viewport.isolate(obj.id);
                        session.notifyUi();
                      }}
                    >
                      Isolate
                    </button>{' '}
                    <button
                      type="button"
                      className="clinical-link"
                      onClick={() => {
                        host.sessions.selectionSession?.select('replace', [obj.id as string]);
                        session.notifyUi();
                      }}
                    >
                      Select
                    </button>{' '}
                    <strong>{obj.displayName}</strong>
                    <span className="muted">
                      {' '}
                      · {obj.visible ? '● Visible' : '○ Hidden'}
                    </span>
                  </li>
                ))}
              </ul>
              {(() => {
                const selectedId = selection?.ids[0];
                const selectedObj =
                  selectedId === undefined
                    ? undefined
                    : doc.objects.find((o) => (o.id as string) === selectedId);
                if (selectedObj === undefined) {
                  return <p className="muted">Select an arch to inspect.</p>;
                }
                return (
                  <div className="clinical-workspace-card" data-testid="clinical-object-inspector">
                    <h3>{selectedObj.displayName}</h3>
                    <dl className="kv">
                      <dt>Format</dt>
                      <dd>{selectedObj.format.toUpperCase()}</dd>
                      <dt>Vertices</dt>
                      <dd>{selectedObj.vertexCount ?? '—'}</dd>
                      <dt>Triangles</dt>
                      <dd>{selectedObj.faceCount ?? '—'}</dd>
                      <dt>Units</dt>
                      <dd>{selectedObj.units}</dd>
                      <dt>Import</dt>
                      <dd>Imported</dd>
                      <dt>Source</dt>
                      <dd>{selectedObj.sourceFile}</dd>
                      {selectedObj.segmentationMeta !== undefined ? (
                        <>
                          <dt>Segmentation</dt>
                          <dd data-testid="clinical-seg-integrity-label">
                            {(() => {
                              const snap = evaluateSegmentationIntegrity(selectedObj);
                              return `${segmentationIntegrityUiLabel(snap)} · ${String(selectedObj.segmentationMeta.instanceCount)} teeth · ${selectedObj.segmentationMeta.caseBand} · ${selectedObj.segmentationMeta.validationVerdict ?? '—'} · ${movementReadinessUiLabel(snap.isClinicallyReadyForMovement)}`;
                            })()}
                          </dd>
                        </>
                      ) : null}
                    </dl>
                  </div>
                );
              })()}
              {workspace.segmentation.isActive() ? (
                <ClinicalSegmentationInspector workspace={workspace} />
              ) : null}
              {doc.objects.length > 0 ? (
                <button
                  type="button"
                  className="clinical-btn clinical-btn--secondary"
                  onClick={() => {
                    workspace.viewport.showAll();
                    session.notifyUi();
                  }}
                >
                  Show All
                </button>
              ) : null}
            </>
          )
        ) : null}

        {layout.rightTab === 'selection' ? (
          <p className="muted">
            {selection === undefined
              ? 'Nothing selected'
              : selection.ids.length === 0
                ? 'No selection'
                : `${String(selection.ids.length)} selected`}
          </p>
        ) : null}

        {layout.rightTab === 'camera' ? (
          <div className="clinical-display-form">
            {camera === undefined ? (
              <p className="muted">Camera not ready</p>
            ) : (
              <dl className="kv">
                <dt>Eye</dt>
                <dd>
                  {camera.eye.x.toFixed(2)}, {camera.eye.y.toFixed(2)}, {camera.eye.z.toFixed(2)}
                </dd>
                <dt>Up</dt>
                <dd>
                  {camera.up.x.toFixed(2)}, {camera.up.y.toFixed(2)}, {camera.up.z.toFixed(2)}
                </dd>
                <dt>Target</dt>
                <dd>
                  {camera.target.x.toFixed(2)}, {camera.target.y.toFixed(2)},{' '}
                  {camera.target.z.toFixed(2)}
                </dd>
                <dt>Projection</dt>
                <dd>{camera.projection}</dd>
              </dl>
            )}
            <div className="clinical-camera-actions">
              <button type="button" onClick={() => workspace.viewport.fitAll()}>
                Fit All
              </button>
              <button type="button" onClick={() => workspace.viewport.fitSelected()}>
                Fit Selected
              </button>
              <button type="button" onClick={() => workspace.viewport.resetView()}>
                Reset View
              </button>
            </div>
            <h3>Standard views</h3>
            <div className="clinical-preset-grid">
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => workspace.viewport.presetView(preset as PresetView)}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {layout.rightTab === 'display' ? (
          <div className="clinical-display-form">
            <label>
              Display mode
              <select
                value={prefs.displayMode}
                onChange={(e) => {
                  workspace.viewport.setDisplayMode(e.target.value as ClinicalDisplayMode);
                  session.notifyUi();
                }}
              >
                {DISPLAY_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Background
              <select
                value={prefs.background}
                onChange={(e) => {
                  workspace.viewport.appearance.setBackground(e.target.value as ClinicalBackgroundTheme);
                  session.notifyUi();
                }}
              >
                {BACKGROUNDS.map((bg) => (
                  <option key={bg} value={bg}>
                    {bg}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Lighting
              <select
                value={prefs.lighting}
                onChange={(e) => {
                  workspace.viewport.appearance.setLighting(e.target.value as ClinicalLightingPreset);
                  session.notifyUi();
                }}
              >
                {LIGHTING.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ['showGrid', 'Grid', () => workspace.viewport.appearance.setGrid(!prefs.showGrid)],
                [
                  'showAxes',
                  'Axes (diagnostics)',
                  () => workspace.viewport.appearance.setAxes(!prefs.showAxes)
                ],
                [
                  'showOrigin',
                  'Origin (diagnostics)',
                  () => workspace.viewport.appearance.setOrigin(!prefs.showOrigin)
                ],
                [
                  'showOrientationIndicator',
                  'XYZ badge (diagnostics)',
                  () =>
                    workspace.viewport.appearance.setOrientationIndicator(
                      !prefs.showOrientationIndicator
                    )
                ],
                [
                  'showBoundingBox',
                  'Bounding box',
                  () => workspace.viewport.appearance.setBoundingBox(!prefs.showBoundingBox)
                ],
                [
                  'showModelEdges',
                  'Model edges',
                  () => workspace.viewport.appearance.setModelEdges(!prefs.showModelEdges)
                ],
                [
                  'showFaceOrientation',
                  'Face orientation',
                  () => workspace.viewport.appearance.setFaceOrientation(!prefs.showFaceOrientation)
                ],
                [
                  'backfaceCulling',
                  'Backface culling',
                  () => workspace.viewport.appearance.setBackfaceCulling(!prefs.backfaceCulling)
                ],
                [
                  'showHud',
                  'HUD',
                  () => workspace.viewport.preferences.update({ showHud: !prefs.showHud })
                ],
                [
                  'showOverlays',
                  'Overlays',
                  () => workspace.viewport.preferences.update({ showOverlays: !prefs.showOverlays })
                ]
              ] as const
            ).map(([key, label, onToggle]) => (
              <label key={key} className="checkbox">
                <input
                  type="checkbox"
                  checked={prefs[key]}
                  onChange={() => {
                    onToggle();
                    session.notifyUi();
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        ) : null}

        {layout.rightTab === 'tool' ? (
          <p className="muted">
            {activeTool === undefined
              ? 'No tool active. Import is available from the toolbar.'
              : `${activeTool.title} — ${activeTool.tooltip}`}
          </p>
        ) : null}
      </div>
    </aside>
  );
};
