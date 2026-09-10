import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { ClinicalApplication } from '../../src/clinical/ClinicalApplication.js';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { CaseManager } from '../../src/clinical/case/CaseManager.js';
import { createEmptyClinicalDocument } from '../../src/clinical/document/ClinicalDocument.js';
import { ClinicalRuntime } from '../../src/clinical/runtime/ClinicalRuntime.js';
import { ClinicalLifecycle } from '../../src/clinical/runtime/lifecycle.js';
import { asClinicalToolId } from '../../src/clinical/runtime/types.js';
import { CLINICAL_TOOL_DEFINITIONS } from '../../src/clinical/tools/ClinicalToolRegistry.js';
import { DEFAULT_CLINICAL_LAYOUT } from '../../src/clinical/workspace/ClinicalLayout.js';

const clinicalRoot = join(dirname(fileURLToPath(import.meta.url)), '../../src/clinical');

const host = () =>
  new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 1000 }
  });

describe('clinical runtime', () => {
  it('bootstraps a ready session over the studio host', () => {
    const h = host();
    const boot = new ClinicalBootstrap().bootstrap(h);
    expect(boot.session.getPublicState().phase).toBe('ready');
    expect(boot.durationMs).toBeGreaterThanOrEqual(0);
    boot.runtime.dispose();
    h.dispose();
  });
});

describe('case lifecycle', () => {
  it('creates, dirtes, saves, and closes a case', () => {
    const h = host();
    const runtime = new ClinicalRuntime({ host: h, clock: { now: () => 2000 } });
    const session = runtime.createSession();
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const cases = new CaseManager(session.value);
    const created = cases.newCase({ name: 'Case A', patientName: 'Patient A' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.caseMeta.name).toBe('Case A');
    expect(cases.markDirty().ok).toBe(true);
    expect(session.value.getPublicState().dirty).toBe(true);
    expect(cases.save().ok).toBe(true);
    expect(session.value.getPublicState().dirty).toBe(false);
    expect(cases.closeCase().ok).toBe(true);
    expect(session.value.getPublicState().activeCase).toBeUndefined();
    runtime.dispose();
    h.dispose();
  });

  it('rejects second case while dirty', () => {
    const h = host();
    const boot = new ClinicalBootstrap().bootstrap(h);
    expect(boot.session.newCase().ok).toBe(true);
    expect(boot.session.markDirty().ok).toBe(true);
    expect(boot.session.newCase().ok).toBe(false);
    boot.runtime.dispose();
    h.dispose();
  });
});

describe('tool registry', () => {
  it('registers clinical tools with Import, Orientation, Trim, and Close Base enabled', () => {
    const h = host();
    const boot = new ClinicalBootstrap().bootstrap(h);
    const tools = boot.session.getTools().list();
    expect(tools.length).toBe(CLINICAL_TOOL_DEFINITIONS.length);
    expect(tools.filter((t) => t.enabled).map((t) => t.title)).toEqual([
      'Import Scan',
      'Orient',
      'Trim',
      'Close Base',
      'Segment Teeth',
      'Measure',
      'Analysis'
    ]);
    expect(boot.session.activateTool(asClinicalToolId('import')).ok).toBe(true);
    expect(boot.session.activateTool(asClinicalToolId('orient')).ok).toBe(true);
    expect(boot.session.activateTool(asClinicalToolId('trim')).ok).toBe(true);
    expect(boot.session.activateTool(asClinicalToolId('close-base')).ok).toBe(true);
    boot.runtime.dispose();
    h.dispose();
  });
});

describe('layout', () => {
  it('persists clinical layout updates', () => {
    const h = host();
    const boot = new ClinicalBootstrap().bootstrap(h);
    expect(boot.workspace.layout.get().leftWidth).toBe(DEFAULT_CLINICAL_LAYOUT.leftWidth);
    boot.workspace.layout.update({ leftCollapsed: true, bottomTab: 'diagnostics' });
    expect(boot.workspace.layout.get().leftCollapsed).toBe(true);
    expect(boot.workspace.layout.get().bottomTab).toBe('diagnostics');
    boot.runtime.dispose();
    h.dispose();
  });
});

describe('diagnostics', () => {
  it('records clinical diagnostics and tool stats', () => {
    const h = host();
    const boot = new ClinicalBootstrap().bootstrap(h);
    const snap = boot.session.getDiagnostics().snapshot();
    expect(snap.toolCount).toBeGreaterThan(0);
    expect(snap.enabledToolCount).toBe(7);
    expect(snap.logs.length).toBeGreaterThan(0);
    boot.runtime.dispose();
    h.dispose();
  });
});

describe('workspace / smoke', () => {
  it('starts ClinicalApplication end-to-end', async () => {
    const app = new ClinicalApplication();
    const started = app.start({ forceMockViewportBackend: true, clock: { now: () => 9 } });
    expect(started.workspace.session.getPublicState().phase).toBe('ready');
    expect(started.host.commands.get('clinical.case.new')?.enabled).toBe(true);
    await app.shutdown();
  });
});

describe('lifecycle machine', () => {
  it('allows created → bootstrapping → ready', () => {
    const life = new ClinicalLifecycle();
    expect(life.transition('bootstrapping')).toBe(true);
    expect(life.transition('ready')).toBe(true);
    expect(life.transition('case-active')).toBe(true);
  });
});

describe('architecture', () => {
  it('keeps clinical module free of mesh/parser algorithms', () => {
    const sessionSrc = readFileSync(join(clinicalRoot, 'runtime/session.ts'), 'utf8');
    expect(sessionSrc.includes('parseStl') || sessionSrc.includes('THREE.')).toBe(false);
    const doc = createEmptyClinicalDocument({ now: 1 });
    expect(Object.isFrozen(doc)).toBe(true);
  });
});
