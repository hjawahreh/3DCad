/**
 * DEV-only clinical geometry diagnostics (PROD-001).
 * Hidden from normal clinical users — gated on import.meta.env.DEV.
 */

export interface ClinicalGeometryDevDiagEvent {
  readonly operation: string;
  readonly objectId?: string;
  readonly revision?: number;
  readonly geometryRef?: string;
  readonly fingerprint?: string;
  readonly faces?: number;
  readonly vertices?: number;
  readonly role?: string;
  readonly sceneGeometryRef?: string;
  readonly viewportGeometryRef?: string;
  readonly inputFingerprint?: string;
  readonly outputFingerprint?: string;
  readonly removedTriangles?: number;
  readonly addedTriangles?: number;
  readonly elapsedMs?: number;
  readonly warning?: string;
  /** PROD-002: geometry backend id when known (hybrid / vtk / reference). */
  readonly backend?: string;
  /** PROD-002: clinical frame policy marker (transform-only vs baked). */
  readonly framePolicy?: 'transform-only' | 'baked';
  readonly caseValidationVerdict?: 'PASS' | 'WARNING' | 'FAIL';
  readonly segmentationValidationVerdict?: 'PASS' | 'WARNING' | 'FAIL';
}

const MAX_EVENTS = 64;
const events: ClinicalGeometryDevDiagEvent[] = [];

export const recordClinicalGeometryDevDiag = (event: ClinicalGeometryDevDiagEvent): void => {
  if (!import.meta.env.DEV) {
    return;
  }
  events.push(event);
  if (events.length > MAX_EVENTS) {
    events.shift();
  }
  // Compact console breadcrumb for browser debugging — not shown in clinical UI.
  // eslint-disable-next-line no-console
  console.debug('[clinical-geo-dev]', event);
};

export const getClinicalGeometryDevDiagEvents = (): readonly ClinicalGeometryDevDiagEvent[] =>
  [...events];

export const clearClinicalGeometryDevDiagEvents = (): void => {
  events.length = 0;
};
