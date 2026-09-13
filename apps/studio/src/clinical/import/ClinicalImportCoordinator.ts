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
import type { ClinicalArchRole } from './ClinicalMeshDescriptor.js';
import { clinicalFailure, clinicalSuccess, type ClinicalResult } from '../runtime/types.js';
import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import {
  parseClinicalMeshBytes
} from './ClinicalMeshParsers.js';
import { registerParsedClinicalMeshWithReport } from './ClinicalMeshRegistration.js';
import type { ParsedClinicalMesh } from './ClinicalMeshParsers.js';
import { validateClinicalCase } from '../case/ClinicalCaseValidation.js';
import type { ClinicalCaseValidationReport } from '../case/ClinicalCaseValidation.js';
import { recordClinicalGeometryDevDiag } from '../diagnostics/ClinicalGeometryDevDiagnostics.js';
import type { TriangleMesh } from '../../geometry-kernel/mesh/TriangleMesh.js';

const importSuccessMessage = (
  archRole: ClinicalArchRole | undefined,
  document: ClinicalDocumentSnapshot
): string => {
  const hasUpper = document.objects.some((o) => o.archRole === 'upper');
  const hasLower = document.objects.some((o) => o.archRole === 'lower');
  if (hasUpper && hasLower) {
    return 'Upper and lower scans imported successfully.';
  }
  if (archRole === 'upper' || (hasUpper && !hasLower)) {
    return 'Upper scan imported.';
  }
  if (archRole === 'lower' || (hasLower && !hasUpper)) {
    return 'Lower scan imported.';
  }
  return 'Scan imported successfully.';
};

export interface ClinicalImportFileSelection {
  readonly source: string;
  readonly fileName: string;
  readonly extension?: string;
  /** Raw file bytes — required for real mesh display. */
  readonly bytes?: ArrayBuffer;
  readonly archRole?: ClinicalArchRole;
  readonly replaceArch?: boolean;
  /** Suppress host success toast (caller aggregates). */
  readonly quiet?: boolean;
}

export class ClinicalImportCoordinator {
  public readonly diagnostics = new ClinicalImportDiagnostics();
  public readonly metrics = new ClinicalImportMetrics();
  public readonly notifications = new ClinicalImportNotifications();
  public readonly objects = new ClinicalObjectRegistry();
  public readonly sceneBuilder = new ClinicalSceneBuilder();
  public readonly documentBuilder = new ClinicalDocumentBuilder();

  private active: ClinicalImportSession | undefined;
  private afterImportPresenter: (() => void) | undefined;
  private lastCaseValidation: ClinicalCaseValidationReport | undefined;

  public constructor(private readonly session: ClinicalSession) {}

  /** Most recent post-import case validation report (if any). */
  public getLastCaseValidation(): ClinicalCaseValidationReport | undefined {
    return this.lastCaseValidation;
  }

  /** Optional clinical camera presentation after successful scene publish. */
  public setAfterImportPresenter(presenter: () => void): void {
    this.afterImportPresenter = presenter;
  }

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
        clinicalSessionId: this.session.sessionId as string,
        ...(selection.archRole === undefined ? {} : { clinicalArch: selection.archRole })
      }
    });

    let parsed: ParsedClinicalMesh | undefined;
    if (selection.bytes !== undefined) {
      try {
        parsed = parseClinicalMeshBytes(selection.bytes, extension);
        this.notifications.setProgress({
          phase: 'validating',
          ratio: 0.2,
          message: `Validated ${selection.fileName} · ${String(parsed.faceCount)} triangles`,
          updatedAt: Date.now()
        });
        for (const warning of parsed.warnings) {
          if (warning.includes('Units could not be determined') && selection.quiet !== true) {
            // Keep units notice out of the toast stack by default — surface once in progress.
            this.diagnostics.record('info', warning);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Mesh parse failed';
        this.fail(started, message, 'validation');
        return clinicalFailure('validation', message);
      }
    }

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
      now: Date.now(),
      ...(selection.archRole === undefined ? {} : { archRole: selection.archRole }),
      ...(selection.replaceArch === true ? { replaceArch: true } : {}),
      ...(parsed === undefined
        ? {}
        : {
            meshStats: {
              bounds: Object.freeze({
                min: Object.freeze({
                  x: parsed.bounds.min[0]!,
                  y: parsed.bounds.min[1]!,
                  z: parsed.bounds.min[2]!
                }),
                max: Object.freeze({
                  x: parsed.bounds.max[0]!,
                  y: parsed.bounds.max[1]!,
                  z: parsed.bounds.max[2]!
                })
              }),
              vertexCount: parsed.vertexCount,
              faceCount: parsed.faceCount
            }
          })
    });
    if (!built.ok) {
      this.diagnostics.recordDocumentFailure(built.error.message);
      this.fail(started, built.error.message, 'document');
      return built;
    }

    let documentAfterImport = built.value;

    if (parsed !== undefined) {
      const registry = host.runtimes.kernel.registry;
      const newlyAdded = documentAfterImport.objects.filter(
        (obj) => !document.objects.some((prev) => prev.id === obj.id)
      );
      // On replace, document may keep same stable id — always rebind latest descriptors from this import.
      const targets =
        newlyAdded.length > 0
          ? newlyAdded
          : documentAfterImport.objects.filter((obj) =>
              selection.archRole !== undefined
                ? obj.archRole === selection.archRole
                : obj.sourceFile === selection.fileName
            );
      const objectPatches = new Map<
        string,
        {
          readonly vertexCount: number;
          readonly faceCount: number;
          readonly geometryFingerprint: string;
          readonly geometryRevision: number;
        }
      >();
      for (const obj of targets) {
        registry.releaseObject(obj.id as string);
        const registered = registerParsedClinicalMeshWithReport(
          registry,
          obj.id as string,
          parsed
        );
        objectPatches.set(String(obj.id), {
          vertexCount: registered.normalization.normalizedVertexCount,
          faceCount: registered.normalization.normalizedTriangleCount,
          geometryFingerprint: registered.working.fingerprint,
          geometryRevision: registered.working.revision
        });
      }
      if (objectPatches.size > 0) {
        documentAfterImport = Object.freeze({
          ...documentAfterImport,
          objects: Object.freeze(
            documentAfterImport.objects.map((obj) => {
              const patch = objectPatches.get(String(obj.id));
              if (patch === undefined) return obj;
              return Object.freeze({
                ...obj,
                vertexCount: patch.vertexCount,
                faceCount: patch.faceCount,
                geometryFingerprint: patch.geometryFingerprint,
                geometryRevision: patch.geometryRevision
              });
            })
          )
        });
      }
    }

    const applied = this.session.applyDocument(documentAfterImport, true);
    if (!applied.ok) {
      this.diagnostics.recordDocumentFailure(applied.error.message);
      this.fail(started, applied.error.message, 'document');
      return applied;
    }

    this.objects.replaceAll(documentAfterImport.objects);

    this.notifications.setProgress({
      phase: 'populating-scene',
      ratio: 0.85,
      message: 'Populating scene…',
      updatedAt: Date.now()
    });
    clinicalImport.workflow.advance('populating-scene');

    const sceneResult = this.sceneBuilder.buildAndPublish(host, documentAfterImport, {
      // Clinical anterior presentation owns the post-import camera (fit + anterior).
      fitCamera: false
    });
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

    // Clinical anterior bite via ClinicalViewportRuntime (Camera Runtime only).
    try {
      this.afterImportPresenter?.();
    } catch {
      // Camera presentation must never fail the import itself.
    }

    this.runPostImportCaseValidation(documentAfterImport);

    const durationMs = Date.now() - started;
    const verts = documentAfterImport.objects.reduce((n, o) => n + (o.vertexCount ?? 0), 0);
    const faces = documentAfterImport.objects.reduce((n, o) => n + (o.faceCount ?? 0), 0);
    this.metrics.recordSuccess(durationMs, verts || undefined, faces || undefined);
    this.metrics.setActiveDocumentCount(1);

    clinicalImport.workflow.advance('completed');
    const successMessage = importSuccessMessage(selection.archRole, documentAfterImport);
    this.notifications.setProgress({
      phase: 'completed',
      ratio: 1,
      message: successMessage,
      updatedAt: Date.now()
    });
    this.notifications.addRecent({
      fileName: selection.fileName,
      format,
      importedAt: Date.now(),
      objectCount: documentAfterImport.objects.length,
      success: true
    });
    this.diagnostics.record(
      'info',
      `Import completed via ${importerId} in ${String(Math.round(durationMs))}ms`
    );
    if (selection.quiet !== true) {
      host.notifications.push('success', 'Import', successMessage);
    }
    this.session.notifyUi();
    return clinicalSuccess(documentAfterImport);
  }

  private runPostImportCaseValidation(document: ClinicalDocumentSnapshot): void {
    const host = this.session.getHost();
    const registry = host.runtimes.kernel.registry;
    const meshes = new Map<string, TriangleMesh>();
    for (const obj of document.objects) {
      const mesh =
        registry.getByObjectId(obj.id as string, 'working') ??
        registry.getByObjectId(obj.id as string, 'source');
      if (mesh !== undefined) {
        meshes.set(obj.id as string, mesh);
      }
    }
    try {
      const report = validateClinicalCase({
        document,
        meshes,
        requireDualArch: false
      });
      this.lastCaseValidation = report;
      const errorCount = report.findings.filter((f) => f.severity === 'ERROR').length;
      const warningCount = report.findings.filter((f) => f.severity === 'WARNING').length;
      this.diagnostics.record(
        report.verdict === 'FAIL' ? 'error' : report.verdict === 'WARNING' ? 'warning' : 'info',
        `Case validation ${report.verdict}: ${String(report.findings.length)} finding(s) (${String(errorCount)} ERROR, ${String(warningCount)} WARNING)`
      );
      recordClinicalGeometryDevDiag({
        operation: 'case-validation',
        caseValidationVerdict: report.verdict
      });
      if (report.verdict === 'FAIL') {
        host.notifications.push(
          'warning',
          'Case validation',
          report.findings.find((f) => f.severity === 'ERROR')?.message ??
            'Case validation reported errors'
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Case validation failed';
      this.diagnostics.record('warning', `Case validation skipped: ${message}`);
    }
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
