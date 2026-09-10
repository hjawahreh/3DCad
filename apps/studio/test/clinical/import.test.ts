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
import { parseClinicalMeshBytes, suggestArchRole } from '../../src/clinical/import/ClinicalMeshParsers.js';
import {
  asImportRequestId,
  asImportSourceRef,
  asImporterPluginId,
  freezeImportedDocument
} from '@cad-studio/import-runtime';

const importRoot = join(dirname(fileURLToPath(import.meta.url)), '../../src/clinical/import');

/** Minimal binary STL with one triangle (finite, non-empty bounds). */
const makeBinaryStl = (offsetY = 0): ArrayBuffer => {
  const buf = new ArrayBuffer(84 + 50);
  const view = new DataView(buf);
  view.setUint32(80, 1, true);
  let o = 84;
  // normal
  view.setFloat32(o, 0, true);
  o += 4;
  view.setFloat32(o, 0, true);
  o += 4;
  view.setFloat32(o, 1, true);
  o += 4;
  // v0
  view.setFloat32(o, 0, true);
  o += 4;
  view.setFloat32(o, offsetY, true);
  o += 4;
  view.setFloat32(o, 0, true);
  o += 4;
  // v1
  view.setFloat32(o, 10, true);
  o += 4;
  view.setFloat32(o, offsetY, true);
  o += 4;
  view.setFloat32(o, 0, true);
  o += 4;
  // v2
  view.setFloat32(o, 0, true);
  o += 4;
  view.setFloat32(o, offsetY + 10, true);
  o += 4;
  view.setFloat32(o, 0, true);
  o += 4;
  view.setUint16(o, 0, true);
  return buf;
};

const boot = () => {
  const host = new StudioCompositionRoot({
    forceMockViewportBackend: true,
    clock: { now: () => 5000 }
  });
  const clinical = new ClinicalBootstrap().bootstrap(host);
  return { host, clinical };
};

const attach = async (host: StudioCompositionRoot) => {
  expect(
    await host.attachViewport({
      width: 640,
      height: 480,
      clientWidth: 640,
      clientHeight: 480,
      getContext: () => null
    })
  ).toBe(true);
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

  it('assigns stable upper/lower arch identities', () => {
    const doc = createEmptyClinicalDocument({ now: 1, name: 'Case' });
    const request = {
      id: asImportRequestId('req-u'),
      source: asImportSourceRef('file://upper.stl'),
      fileName: 'upper.stl',
      extension: 'stl',
      mimeType: undefined,
      formatHint: undefined,
      projectId: undefined,
      projectSessionId: undefined,
      preferredImporterId: undefined,
      metadata: Object.freeze({ clinicalArch: 'upper' }),
      createdAt: 1
    };
    const imported = freezeImportedDocument({
      documentId: 'doc-u',
      sourceRequestId: request.id,
      importerId: asImporterPluginId('studio-passthrough'),
      entities: [
        Object.freeze({
          id: 'entity',
          kind: 'imported-ref',
          sourceName: 'upper.stl',
          attributes: Object.freeze({ extension: 'stl' })
        })
      ],
      createdAt: 1
    });
    const builder = new ClinicalDocumentBuilder();
    const result = builder.appendToDocument({
      document: doc,
      request,
      imported,
      now: 2,
      archRole: 'upper'
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.objects[0]?.displayName).toBe('Upper Arch');
    expect(result.value.objects[0]?.archRole).toBe('upper');
    expect(String(result.value.objects[0]?.id)).toContain('upper-arch');
  });
});

describe('mesh parsers', () => {
  it('parses binary stl and suggests arch roles', () => {
    const parsed = parseClinicalMeshBytes(makeBinaryStl(), 'stl');
    expect(parsed.faceCount).toBe(1);
    expect(parsed.vertexCount).toBe(3);
    expect(suggestArchRole('upper.stl')).toBe('upper');
    expect(suggestArchRole('lower_mandible.stl')).toBe('lower');
  });
});

describe('clinical import coordinator', () => {
  it('imports stl via Import Runtime and populates clinical document', async () => {
    const { host, clinical } = boot();
    await attach(host);

    const result = await clinical.workspace.importController.importSelectedFile({
      source: 'file://jaw.stl',
      fileName: 'jaw.stl',
      extension: 'stl',
      bytes: makeBinaryStl(),
      archRole: 'upper'
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.objects.length).toBe(1);
    expect(result.value.objects[0]?.archRole).toBe('upper');
    expect(clinical.session.getPublicState().dirty).toBe(true);
    expect(clinical.workspace.importCoordinator.objects.count()).toBeGreaterThan(0);
    expect(clinical.workspace.importCoordinator.metrics.snapshot().successCount).toBe(1);
    expect(clinical.workspace.importCoordinator.notifications.getProgress().phase).toBe('completed');
    expect(host.runtimes.kernel.registry.getByObjectId(result.value.objects[0]!.id as string)).toBeDefined();

    clinical.runtime.dispose();
    host.dispose();
  });

  it('imports upper then lower into one case', async () => {
    const { host, clinical } = boot();
    await attach(host);
    const upper = await clinical.workspace.importController.importSelectedFile({
      source: 'file://upper.stl',
      fileName: 'upper.stl',
      extension: 'stl',
      bytes: makeBinaryStl(0),
      archRole: 'upper'
    });
    expect(upper.ok).toBe(true);
    const lower = await clinical.workspace.importController.importSelectedFile({
      source: 'file://lower.stl',
      fileName: 'lower.stl',
      extension: 'stl',
      bytes: makeBinaryStl(20),
      archRole: 'lower'
    });
    expect(lower.ok).toBe(true);
    if (!lower.ok) return;
    expect(lower.value.objects).toHaveLength(2);
    expect(lower.value.objects.map((o) => o.archRole).sort()).toEqual(['lower', 'upper']);
    for (const obj of lower.value.objects) {
      expect(host.runtimes.kernel.registry.getByObjectId(obj.id as string)).toBeDefined();
    }
    clinical.runtime.dispose();
    host.dispose();
  });

  it('imports lower then upper (reverse order)', async () => {
    const { host, clinical } = boot();
    await attach(host);
    await clinical.workspace.importController.importSelectedFile({
      source: 'file://lower.stl',
      fileName: 'lower.stl',
      extension: 'stl',
      bytes: makeBinaryStl(20),
      archRole: 'lower'
    });
    const result = await clinical.workspace.importController.importSelectedFile({
      source: 'file://upper.stl',
      fileName: 'upper.stl',
      extension: 'stl',
      bytes: makeBinaryStl(0),
      archRole: 'upper'
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.objects).toHaveLength(2);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('rejects duplicate arch without replace', async () => {
    const { host, clinical } = boot();
    await attach(host);
    await clinical.workspace.importController.importSelectedFile({
      source: 'file://upper.stl',
      fileName: 'upper.stl',
      extension: 'stl',
      bytes: makeBinaryStl(),
      archRole: 'upper'
    });
    const dup = await clinical.workspace.importController.importSelectedFile({
      source: 'file://upper2.stl',
      fileName: 'upper2.stl',
      extension: 'stl',
      bytes: makeBinaryStl(1),
      archRole: 'upper'
    });
    expect(dup.ok).toBe(false);
    if (dup.ok) return;
    expect(dup.error.code).toBe('conflict');
    clinical.runtime.dispose();
    host.dispose();
  });

  it('replaces duplicate arch when requested', async () => {
    const { host, clinical } = boot();
    await attach(host);
    await clinical.workspace.importController.importSelectedFile({
      source: 'file://upper.stl',
      fileName: 'upper.stl',
      extension: 'stl',
      bytes: makeBinaryStl(),
      archRole: 'upper'
    });
    const replaced = await clinical.workspace.importController.importSelectedFile({
      source: 'file://upper2.stl',
      fileName: 'upper2.stl',
      extension: 'stl',
      bytes: makeBinaryStl(2),
      archRole: 'upper',
      replaceArch: true
    });
    expect(replaced.ok).toBe(true);
    if (!replaced.ok) return;
    expect(replaced.value.objects).toHaveLength(1);
    expect(replaced.value.objects[0]?.sourceFile).toBe('upper2.stl');
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

  it('rejects invalid geometry bytes', async () => {
    const { host, clinical } = boot();
    await attach(host);
    const result = await clinical.workspace.importController.importSelectedFile({
      source: 'file://bad.stl',
      fileName: 'bad.stl',
      extension: 'stl',
      bytes: new ArrayBuffer(8),
      archRole: 'upper'
    });
    expect(result.ok).toBe(false);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('supports cancellation of an active import session', async () => {
    const { host, clinical } = boot();
    const pending = clinical.workspace.importController.importSelectedFile({
      source: 'file://slow.stl',
      fileName: 'slow.stl',
      extension: 'stl',
      bytes: makeBinaryStl()
    });
    clinical.workspace.importController.cancel();
    const result = await pending;
    expect(result.ok || result.error.code === 'cancelled').toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('scene and camera', () => {
  it('publishes both arches and fits combined bounds', async () => {
    const { host, clinical } = boot();
    await attach(host);
    await clinical.workspace.importController.importSelectedFile({
      source: 'file://upper.stl',
      fileName: 'upper.stl',
      extension: 'stl',
      bytes: makeBinaryStl(0),
      archRole: 'upper'
    });
    const both = await clinical.workspace.importController.importSelectedFile({
      source: 'file://lower.stl',
      fileName: 'lower.stl',
      extension: 'stl',
      bytes: makeBinaryStl(40),
      archRole: 'lower'
    });
    expect(both.ok).toBe(true);
    if (!both.ok) return;
    const fit = clinical.workspace.viewport.fitAll();
    expect(fit.ok).toBe(true);
    const cam = host.sessions.cameraSession?.getSnapshot();
    expect(cam).toBeDefined();
    expect(Number.isFinite(cam!.eye.x)).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });

  it('toggles visibility without dropping registry meshes', async () => {
    const { host, clinical } = boot();
    await attach(host);
    const imported = await clinical.workspace.importController.importSelectedFile({
      source: 'file://upper.stl',
      fileName: 'upper.stl',
      extension: 'stl',
      bytes: makeBinaryStl(),
      archRole: 'upper'
    });
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const id = imported.value.objects[0]!.id;
    expect(clinical.workspace.viewport.hide(id).ok).toBe(true);
    expect(host.runtimes.kernel.registry.getByObjectId(id as string)).toBeDefined();
    expect(clinical.workspace.viewport.show(id).ok).toBe(true);
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('notifications and diagnostics', () => {
  it('records recent imports after success', async () => {
    const { host, clinical } = boot();
    await attach(host);
    await clinical.workspace.importController.importSelectedFile({
      source: 'file://a.obj',
      fileName: 'a.obj',
      extension: 'obj',
      bytes: new TextEncoder().encode('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n').buffer
    });
    const recent = clinical.workspace.importCoordinator.notifications.listRecent();
    expect(recent[0]?.success).toBe(true);
    expect(recent[0]?.format).toBe('obj');
    clinical.runtime.dispose();
    host.dispose();
  });
});

describe('architecture', () => {
  it('keeps clinical formats to stl/obj/ply and studio-owned parsers', () => {
    expect(CLINICAL_IMPORT_FORMATS).toEqual(['stl', 'obj', 'ply']);
    const coordinator = readFileSync(join(importRoot, 'ClinicalImportCoordinator.ts'), 'utf8');
    expect(coordinator.includes('parseClinicalMeshBytes')).toBe(true);
    expect(coordinator.includes('THREE.')).toBe(false);
    const parsers = readFileSync(join(importRoot, 'ClinicalMeshParsers.ts'), 'utf8');
    expect(parsers.includes('parseStl')).toBe(true);
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
