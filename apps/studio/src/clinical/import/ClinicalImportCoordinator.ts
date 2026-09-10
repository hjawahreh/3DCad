/**
 * ClinicalImportCoordinator — end-to-end clinical import orchestration.
 */

import type { ClinicalSession } from '../runtime/session.js';
import { ClinicalDocumentBuilder } from './ClinicalDocumentBuilder.js';
import { ClinicalImportSession } from './ClinicalImportSession.js';
import {
  ClinicalImportDiagnostics,
  ClinicalImportMetrics,
  ClinicalImportNotifications
} from './ClinicalImportObservability.js';
import { ClinicalObjectRegistry } from './ClinicalObjectRegistry.js';
import { ClinicalSceneBuilder } from './ClinicalSceneBuilder.js';
import { CLINICAL_IMPORT_FORMATS, inferMeshFormat } from './ClinicalMeshDescriptor.js';
import { clinicalFailure, clinicalSuccess, type ClinicalResult } from '../runtime/types.js';
import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';

export interface ClinicalImportFileSelection {
  readonly source: string;
  readonly fileName: string;
  readonly extension?: string;
}

export class ClinicalImportCoordinator {
  public readonly diagnostics = new ClinicalImportDiagnostics();
  public readonly metrics = new ClinicalImportMetrics();
  public readonly notifications = new ClinicalImportNotifications();
  public readonly objects = new ClinicalObjectRegistry();
  public readonly sceneBuilder = new ClinicalSceneBuilder();
  public readonly documentBuilder = new ClinicalDocumentBuilder();

  private active: ClinicalImportSession | undefined;

  public constructor(private readonly session: ClinicalSession) {}

  public getActiveSession(): ClinicalImportSession | undefined {
    return this.active;
  }

  public cancelActive(): void {
    this.active?.cancel();
    this.diagnostics.recordCancelled('Import cancelled by user');
    this.notifications.setProgress({
      phase: 'cancelled',
      ratio: 0,
      message: 'Import cancelled',
      updatedAt: Date.now()
    });
    this.session.getHost().notifications.push('warning', 'Import', 'Import cancelled');
    this.session.notifyUi();
  }

  public async importFile(
    selection: ClinicalImportFileSelection
  ): Promise<ClinicalResult<ClinicalDocumentSnapshot>> {
    const host = this.session.getHost();
    const started = Date.now();
    this.metrics.recordAttempt();

    let document = this.session.getPublicState().activeCase;
    if (document === undefined) {
      const created = this.session.newCase({
        name: `Case · ${selection.fileName}`,
        patientName: 'Unassigned Patient'
      });
      if (!created.ok) {
        this.fail(started, created.error.message, 'document');
        return created;
      }
      document = created.value;
    }

    const extension =
      selection.extension ??
      (selection.fileName.includes('.')
        ? selection.fileName.slice(selection.fileName.lastIndexOf('.') + 1)
        : '');
    const format = inferMeshFormat(extension);
    if (!(CLINICAL_IMPORT_FORMATS as readonly string[]).includes(format)) {
      const message = `Unsupported format ".${extension || '?'}". Supported: STL, OBJ, PLY.`;
      this.diagnostics.recordValidationFailure(message);
      this.metrics.recordFailure(Date.now() - started);
      this.notifications.setProgress({
        phase: 'failed',
        ratio: 0,
        message,
        updatedAt: Date.now()
      });
      host.notifications.push('error', 'Unsupported format', message);
      this.notifications.addRecent({
        fileName: selection.fileName,
        format: extension || 'unknown',
        importedAt: Date.now(),
        objectCount: 0,
        success: false
      });
      this.session.notifyUi();
      return clinicalFailure('validation', message);
    }

    this.active?.dispose();
    const clinicalImport = new ClinicalImportSession();
    this.active = clinicalImport;

    this.notifications.setProgress({
      phase: 'selecting',
      ratio: 0.05,
      message: `Selected ${selection.fileName}`,
      updatedAt: Date.now()
    });
    clinicalImport.workflow.advance('selecting');

    const request = host.runtimes.import.createRequest({
      source: selection.source,
      fileName: selection.fileName,
      extension,
      ...(host.sessions.projectSession !== undefined
        ? { projectSessionId: host.sessions.projectSession.sessionId }
        : {}),
      metadata: {
        clinicalCaseId: document.caseId as string,
        clinicalSessionId: this.session.sessionId as string
      }
    });

    this.notifications.setProgress({
      phase: 'validating',
      ratio: 0.15,
      message: 'Validating import request…',
      updatedAt: Date.now()
    });
    clinicalImport.workflow.advance('validating');

    const importSessionResult = host.runtimes.import.createSession({
      ...(host.sessions.projectSession !== undefined
        ? { projectSessionId: host.sessions.projectSession.sessionId }
        : {})
    });
    if (!importSessionResult.ok) {
      this.fail(started, importSessionResult.error.message, 'validation');
      return clinicalFailure('unavailable', importSessionResult.error.message);
    }

    clinicalImport.begin(request, importSessionResult.value);
    clinicalImport.subscribeProgress((progress) => {
      this.notifications.setProgress(progress);
      this.session.notifyUi();
    });

    this.notifications.setProgress({
      phase: 'resolving',
      ratio: 0.25,
      message: 'Resolving importer plug-in…',
      updatedAt: Date.now()
    });
    clinicalImport.workflow.advance('resolving');

    this.notifications.setProgress({
      phase: 'importing',
      ratio: 0.35,
      message: 'Running Import Runtime…',
      updatedAt: Date.now()
    });
    clinicalImport.workflow.advance('importing');

    const importResult = await importSessionResult.value.run(
      request,
      clinicalImport.getAbortSignal()
    );

    if (!importResult.ok) {
      if (importResult.error.code === 'cancelled') {
        clinicalImport.workflow.cancel();
        this.diagnostics.recordCancelled(importResult.error.message);
        this.metrics.recordFailure(Date.now() - started);
        this.notifications.setProgress({
          phase: 'cancelled',
          ratio: 0,
          message: importResult.error.message,
          updatedAt: Date.now()
        });
        host.notifications.push('warning', 'Import cancelled', importResult.error.message);
        this.session.notifyUi();
        return clinicalFailure('cancelled', importResult.error.message);
      }
      this.fail(started, importResult.error.message, 'validation');
      return clinicalFailure('unavailable', importResult.error.message);
    }

    const outcome = importResult.value.outcome;
    if (outcome === undefined || !outcome.ok) {
      const message =
        outcome !== undefined && !outcome.ok ? outcome.message : 'Import produced no document';
      this.fail(started, message, 'document');
      return clinicalFailure('unavailable', message);
    }

    const importerId = outcome.document.importerId as string;
    this.diagnostics.recordImporter(importerId, Date.now() - started);

    this.notifications.setProgress({
      phase: 'building-document',
      ratio: 0.7,
      message: 'Building clinical document…',
      updatedAt: Date.now()
    });
    clinicalImport.workflow.advance('building-document');

    const built = this.documentBuilder.appendToDocument({
      document,
      request,
      imported: outcome.document,
      now: Date.now()
    });
    if (!built.ok) {
      this.diagnostics.recordDocumentFailure(built.error.message);
      this.fail(started, built.error.message, 'document');
      return built;
    }

    const applied = this.session.applyDocument(built.value, true);
    if (!applied.ok) {
      this.diagnostics.recordDocumentFailure(applied.error.message);
      this.fail(started, applied.error.message, 'document');
      return applied;
    }

    this.objects.replaceAll(built.value.objects);

    this.notifications.setProgress({
      phase: 'populating-scene',
      ratio: 0.85,
      message: 'Populating scene…',
      updatedAt: Date.now()
    });
    clinicalImport.workflow.advance('populating-scene');

    const sceneResult = this.sceneBuilder.buildAndPublish(host, built.value);
    if (!sceneResult.ok) {
      this.diagnostics.recordSceneFailure(sceneResult.error.message);
      this.fail(started, sceneResult.error.message, 'scene');
      return clinicalFailure(sceneResult.error.code, sceneResult.error.message);
    }

    this.notifications.setProgress({
      phase: 'refreshing-viewport',
      ratio: 0.95,
      message: 'Refreshing viewport…',
      updatedAt: Date.now()
    });
    clinicalImport.workflow.advance('refreshing-viewport');

    const durationMs = Date.now() - started;
    const verts = built.value.objects.reduce((n, o) => n + (o.vertexCount ?? 0), 0);
    const faces = built.value.objects.reduce((n, o) => n + (o.faceCount ?? 0), 0);
    this.metrics.recordSuccess(durationMs, verts || undefined, faces || undefined);
    this.metrics.setActiveDocumentCount(1);

    clinicalImport.workflow.advance('completed');
    this.notifications.setProgress({
      phase: 'completed',
      ratio: 1,
      message: `Imported ${selection.fileName}`,
      updatedAt: Date.now()
    });
    this.notifications.addRecent({
      fileName: selection.fileName,
      format,
      importedAt: Date.now(),
      objectCount: built.value.objects.length,
      success: true
    });
    this.diagnostics.record(
      'info',
      `Import completed via ${importerId} in ${String(Math.round(durationMs))}ms`
    );
    host.notifications.push(
      'success',
      'Import complete',
      `${selection.fileName} · ${String(built.value.objects.length)} object(s)`
    );
    this.session.notifyUi();
    return clinicalSuccess(built.value);
  }

  private fail(
    started: number,
    message: string,
    kind: 'validation' | 'document' | 'scene'
  ): void {
    this.active?.workflow.fail();
    this.metrics.recordFailure(Date.now() - started);
    if (kind === 'validation') {
      this.diagnostics.recordValidationFailure(message);
    } else if (kind === 'document') {
      this.diagnostics.recordDocumentFailure(message);
    } else {
      this.diagnostics.recordSceneFailure(message);
    }
    this.notifications.setProgress({
      phase: 'failed',
      ratio: 0,
      message,
      updatedAt: Date.now()
    });
    this.session.getHost().notifications.push('error', 'Import failed', message);
    this.session.notifyUi();
  }
}
