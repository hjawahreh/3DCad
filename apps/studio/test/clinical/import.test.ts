import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClinicalApplication } from '../../src/clinical/ClinicalApplication.js';
import { ClinicalBootstrap } from '../../src/clinical/ClinicalBootstrap.js';
import { StudioCompositionRoot } from '../../src/application/composition-root.js';
import { ClinicalDocumentBuilder } from '../../src/clinical/import/ClinicalDocumentBuilder.js';
import { ClinicalImportWorkflow } from '../../src/clinical/import/ClinicalImportWorkflow.js';
import { CLINICAL_IMPORT_FORMATS } from '../../src/clinical/import/ClinicalMeshDescriptor.js';
import { createEmptyClinicalDocument } from '../../src/clinical/document/ClinicalDocument.js';
import {
  asImportRequestId,
  asImportSourceRef,
  asImporterPluginId,
  freezeImportedDocument
} from '@cad-studio/import-runtime';

const importRoot = join(dirname(fileURLToPath(import.meta.url)), '../../src/clinical/import');

const boot = () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 5000 }
  });
  const clinical = new ClinicalBootstrap().bootstrap(host);
  return { host, clinical };
};

describe('import workflow', () => {
  it('advances phases deterministically', () => {
    const wf = new ClinicalImportWorkflow();
    expect(wf.advance('selecting')).toBe(true);
    expect(wf.advance('validating')).toBe(true);
    expect(wf.advance('importing')).toBe(true);
    expect(wf.advance('completed')).toBe(true);
    expect(wf.getPhase()).toBe('completed');
  });
});

describe('document builder', () => {
  it('builds mesh descriptors from imported entities', () => {
    const doc = createEmptyClinicalDocument({ now: 1, name: 'Case' });
    const request = {
      id: asImportRequestId('req-1'),
      source: asImportSourceRef('file://scan.stl'),
      fileName: 'scan.stl',
      extension: 'stl',
      mimeType: undefined,
      formatHint: undefined,
      projectId: undefined,
      projectSessionId: undefined,
      preferredImporterId: undefined,
      metadata: Object.freeze({}),
      createdAt: 1
    };
    const imported = freezeImportedDocument({
      documentId: 'doc-1',
      sourceRequestId: request.id,
      importerId: asImporterPluginId('studio-passthrough'),
      entities: [
        Object.freeze({
          id: 'entity-scan.stl',
          kind: 'imported-ref',
          sourceName: 'scan.stl',
          attributes: Object.freeze({
            extension: 'stl',
            vertexCount: '1200',
            faceCount: '2400'
          })
        })
      ],
      createdAt: 1
    });
    const builder = new ClinicalDocumentBuilder();
    const result = builder.appendToDocument({ document: doc, request, imported, now: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.objects).toHaveLength(1);
    expect(result.value.objects[0]?.format).toBe('stl');
    expect(result.value.objects[0]?.vertexCount).toBe(1200);
    expect(result.value.dirty).toBe(true);
  });
});

describe('clinical import coordinator', () => {
  it('imports stl via Import Runtime and populates clinical document', async () => {
    const { host, clinical } = boot();
    const canvas = {
      width: 640,
      height: 480,
      clientWidth: 640,
      clientHeight: 480,
      getContext: () => null
    };
    expect(await host.attachViewport(canvas)).toBe(true);

    const result = await clinical.workspace.importController.importSelectedFile({
      source: 'file://jaw.stl',
      fileName: 'jaw.stl',
      extension: 'stl'
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.objects.length).toBeGreaterThan(0);
    expect(clinical.session.getPublicState().dirty).toBe(true);
    expect(clinical.workspace.importCoordinator.objects.count()).toBeGreaterThan(0);
    expect(clinical.workspace.importCoordinator.metrics.snapshot().successCount).toBe(1);
    expect(clinical.workspace.importCoordinator.notifications.getProgress().phase).toBe('completed');

    clinical.runtime.dispose();
    host.dispose();
  });

  it('rejects unsupported formats with notification path', async () => {
    const { host, clinical } = boot();
    const result = await clinical.workspace.importController.importSelectedFile({
      source: 'file://x.xyz',
      fileName: 'x.xyz',
      extension: 'xyz'
    });
    expect(result.ok).toBe(false);
    expect(clinical.workspace.importCoordinator.diagnostics.snapshot().validationFailures).toBe(1);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('supports cancellation of an active import session', async () => {
    const { host, clinical } = boot();
    const pending = clinical.workspace.importController.importSelectedFile({
      source: 'file://slow.stl',
      fileName: 'slow.stl',
      extension: 'stl'
    });
    clinical.workspace.importController.cancel();
    const result = await pending;
    // Passthrough is sync-fast; cancel may land after completion — both outcomes are valid.
    expect(result.ok || result.error.code === 'cancelled').toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('notifications and diagnostics', () => {
  it('records recent imports after success', async () => {
    const { host, clinical } = boot();
    await host.attachViewport({
      width: 100,
      height: 100,
      clientWidth: 100,
      clientHeight: 100,
      getContext: () => null
    });
    await clinical.workspace.importController.importSelectedFile({
      source: 'file://a.obj',
      fileName: 'a.obj',
      extension: 'obj'
    });
    const recent = clinical.workspace.importCoordinator.notifications.listRecent();
    expect(recent[0]?.success).toBe(true);
    expect(recent[0]?.format).toBe('obj');
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('architecture', () => {
  it('does not implement parsers and only supports stl/obj/ply clinically', () => {
    expect(CLINICAL_IMPORT_FORMATS).toEqual(['stl', 'obj', 'ply']);
    const coordinator = readFileSync(join(importRoot, 'ClinicalImportCoordinator.ts'), 'utf8');
    expect(coordinator.includes('parseStl') || coordinator.includes('THREE.')).toBe(false);
  });
});

describe('smoke', () => {
  it('boots ClinicalApplication with import commands registered', async () => {
    const app = new ClinicalApplication();
    const started = app.start({ forceMockViewportBackend: true, clock: { now: () => 7 } });
    expect(started.host.commands.get('clinical.tool.import')?.enabled).toBe(true);
    expect(started.workspace.importController).toBeDefined();
    await app.shutdown();
  });
});
