import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClinicalApplication } from '../../src/clinical/ClinicalApplication.js';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import {
  createEmptyClinicalDocument,
  withClinicalObjects
} from '../../src/clinical/document/ClinicalDocument.js';
import {
  asClinicalObjectId,
  DEFAULT_MESH_BOUNDS,
  IDENTITY_CLINICAL_TRANSFORM,
  type ClinicalMeshDescriptor
} from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import {
  ClinicalDisplayPreferencesStore,
  DEFAULT_CLINICAL_DISPLAY_PREFERENCES,
  DISPLAY_MODES
} from '../../src/clinical/display/ClinicalDisplayPreferences.js';
import { ClinicalDisplayDiagnostics, ClinicalDisplayMetrics } from '../../src/clinical/display/ClinicalDisplayObservability.js';

const displayRoot = join(dirname(fileURLToPath(import.meta.url)), '../../src/clinical/display');
const packagesRoot = join(dirname(fileURLToPath(import.meta.url)), '../../../../packages');

const boot = async () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 9000 }
  });
  const clinical = new ClinicalBootstrap().bootstrap(host);
  await host.attachViewport({
    width: 640,
    height: 480,
    clientWidth: 640,
    clientHeight: 480,
    getContext: () => null
  });
  const created = clinical.session.newCase({ name: 'Display Case' });
  expect(created.ok).toBe(true);
  return { host, clinical };
};

const mesh = (id: string, name: string): ClinicalMeshDescriptor =>
  Object.freeze({
    id: asClinicalObjectId(id),
    displayName: name,
    sourceFile: `${name}.stl`,
    format: 'stl',
    units: 'mm',
    bounds: DEFAULT_MESH_BOUNDS,
    vertexCount: 100,
    faceCount: 200,
    importedAt: 1,
    visible: true,
    selectable: true,
    hierarchyParentId: undefined,
    importerId: 'studio-passthrough',
    sourceEntityId: id,
    displayState: 'default',
    transform: IDENTITY_CLINICAL_TRANSFORM
  });

const seedObjects = (
  clinical: ReturnType<ClinicalBootstrap['bootstrap']>,
  objects: readonly ClinicalMeshDescriptor[]
) => {
  const doc = clinical.session.getPublicState().activeCase;
  expect(doc).toBeDefined();
  if (doc === undefined) return;
  const next = withClinicalObjects(doc, objects, 9001);
  const applied = clinical.session.applyDocument(next, true);
  expect(applied.ok).toBe(true);
};

describe('display modes', () => {
  it('lists all required modes and switches immediately', async () => {
    const { host, clinical } = await boot();
    expect([...DISPLAY_MODES]).toEqual([
      'solid',
      'wireframe',
      'solid-wireframe',
      'xray',
      'hidden-edge',
      'flat',
      'smooth'
    ]);
    for (const mode of DISPLAY_MODES) {
      const result = clinical.workspace.viewport.setDisplayMode(mode);
      expect(result.ok).toBe(true);
      expect(clinical.workspace.viewport.preferences.get().displayMode).toBe(mode);
      expect(clinical.workspace.viewport.display.getRenderState().displayMode).toBe(mode);
    }
    expect(clinical.workspace.viewport.metrics.snapshot().displayModeUsage['xray']).toBe(1);
    expect(clinical.workspace.viewport.diagnostics.snapshot().displayModeChanges).toBe(
      DISPLAY_MODES.length
    );
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('camera', () => {
  it('supports fit all, reset, and standard presets', async () => {
    const { host, clinical } = await boot();
    seedObjects(clinical, [mesh('o1', 'jaw')]);
    expect(clinical.workspace.viewport.fitAll().ok).toBe(true);
    expect(clinical.workspace.viewport.resetView().ok).toBe(true);
    for (const preset of clinical.workspace.viewport.listPresets()) {
      expect(clinical.workspace.viewport.presetView(preset).ok).toBe(true);
    }
    expect(clinical.workspace.viewport.display.getRenderState().cameraMode).toBe('preset');
    expect(clinical.workspace.viewport.display.getRenderState().lastPreset).toBe('iso');
    expect(clinical.workspace.viewport.metrics.snapshot().cameraFits).toBeGreaterThanOrEqual(1);
    expect(clinical.workspace.viewport.diagnostics.snapshot().cameraTransitions).toBeGreaterThan(0);
    expect(clinical.workspace.viewport.fitSelected().ok).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('overlay and HUD preferences', () => {
  it('toggles overlay and HUD visibility flags', async () => {
    const { host, clinical } = await boot();
    const prefs = clinical.workspace.viewport.preferences;
    expect(prefs.get().showHud).toBe(true);
    expect(prefs.get().showOverlays).toBe(true);
    prefs.update({ showHud: false, showOverlays: false, showOrientationIndicator: false });
    expect(prefs.get().showHud).toBe(false);
    expect(prefs.get().showOverlays).toBe(false);
    expect(prefs.get().showOrientationIndicator).toBe(false);
    clinical.workspace.viewport.appearance.setBackground('clinical-blue');
    clinical.workspace.viewport.appearance.setLighting('high-contrast');
    clinical.workspace.viewport.appearance.setGrid(false);
    expect(prefs.get().background).toBe('clinical-blue');
    expect(prefs.get().lighting).toBe('high-contrast');
    expect(prefs.get().showGrid).toBe(false);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('visibility', () => {
  it('hides, isolates, and restores objects', async () => {
    const { host, clinical } = await boot();
    seedObjects(clinical, [mesh('a', 'A'), mesh('b', 'B')]);
    const idA = asClinicalObjectId('a');
    const idB = asClinicalObjectId('b');
    expect(clinical.workspace.viewport.hide(idA).ok).toBe(true);
    expect(
      clinical.session.getPublicState().activeCase?.objects.find((o) => o.id === idA)?.visible
    ).toBe(false);
    expect(clinical.workspace.viewport.isolate(idB).ok).toBe(true);
    const afterIsolate = clinical.session.getPublicState().activeCase?.objects ?? [];
    expect(afterIsolate.find((o) => o.id === idB)?.visible).toBe(true);
    expect(afterIsolate.find((o) => o.id === idA)?.visible).toBe(false);
    expect(clinical.workspace.viewport.showAll().ok).toBe(true);
    expect(
      clinical.session.getPublicState().activeCase?.objects.every((o) => o.visible)
    ).toBe(true);
    expect(clinical.workspace.viewport.metrics.snapshot().visibilityOps).toBeGreaterThanOrEqual(3);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('preferences', () => {
  it('merges defaults and persists updates in memory store', () => {
    const store = new ClinicalDisplayPreferencesStore({ displayMode: 'flat' });
    expect(store.get().displayMode).toBe('flat');
    expect(store.get().showGrid).toBe(DEFAULT_CLINICAL_DISPLAY_PREFERENCES.showGrid);
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    store.update({ showBoundingBox: true, displayMode: 'wireframe' });
    expect(notified).toBe(1);
    expect(store.get().showBoundingBox).toBe(true);
    expect(store.get().displayMode).toBe('wireframe');
  });
});

describe('diagnostics', () => {
  it('records frame and overlay-related diagnostics', () => {
    const diag = new ClinicalDisplayDiagnostics();
    const metrics = new ClinicalDisplayMetrics();
    diag.recordDisplayModeChange('solid');
    diag.recordVisibilityChange('Hide x');
    diag.recordCameraTransition('Fit all');
    diag.recordFrame(4.5, 4.5);
    metrics.recordViewportOpen();
    metrics.recordCameraFit();
    metrics.recordDisplayMode('solid');
    metrics.recordVisibilityOp();
    metrics.recordFrameTime(4.5);
    expect(diag.snapshot().displayModeChanges).toBe(1);
    expect(diag.snapshot().visibilityChanges).toBe(1);
    expect(diag.snapshot().cameraTransitions).toBe(1);
    expect(diag.snapshot().lastRefreshMs).toBe(4.5);
    expect(metrics.snapshot().viewportOpens).toBe(1);
    expect(metrics.snapshot().averageFrameTimeMs).toBe(4.5);
  });
});

describe('architecture', () => {
  it('does not implement mesh algorithms and stays clinical-only', () => {
    const files = readdirSync(displayRoot).filter((f) => f.endsWith('.ts'));
    for (const file of files) {
      const src = readFileSync(join(displayRoot, file), 'utf8');
      expect(src.includes('parseStl') || src.includes('THREE.') || src.includes('trimMesh')).toBe(
        false
      );
    }
    const platformTouched = ['viewport', 'camera-runtime', 'scene'].every((pkg) => {
      // Ensure we only *import* platform — clinical display sources must not live under packages/
      return !readdirSync(join(packagesRoot, pkg, 'src')).some((f) =>
        f.toLowerCase().includes('clinicaldisplay')
      );
    });
    expect(platformTouched).toBe(true);
  });

  it('exports frozen display API surface', () => {
    expect(Object.isFrozen(DISPLAY_MODES)).toBe(true);
    expect(Object.isFrozen(DEFAULT_CLINICAL_DISPLAY_PREFERENCES)).toBe(true);
  });
});

describe('smoke', () => {
  it('boots with viewport display commands registered', async () => {
    const app = new ClinicalApplication();
    const started = app.start({ forceMockViewportBackend: true, clock: { now: () => 11 } });
    expect(started.host.commands.get('clinical.viewport.fitAll')?.enabled).toBe(true);
    expect(started.host.commands.get('clinical.viewport.preset.front')?.enabled).toBe(true);
    expect(started.host.commands.get('clinical.display.cycleMode')?.enabled).toBe(true);
    expect(started.workspace.viewport.metrics.snapshot().viewportOpens).toBe(1);
    expect(createEmptyClinicalDocument({ now: 1 }).objects).toHaveLength(0);
    await app.shutdown();
  });
});
