/**
 * Derive operator-facing workflow status from a clinical document.
 * Includes Import → Segmentation pipeline progress when metadata exists.
 */

import type { ClinicalDocumentSnapshot } from '../document/ClinicalDocument.js';
import {
  inferPreparationStageFromDocument,
  summarizeCaseSegmentation
} from './ClinicalPipelineStatus.js';

export type ClinicalCasePhase =
  | 'case-created'
  | 'importing'
  | 'import-complete'
  | 'orientation-ready'
  | 'segmentation-complete';

export const deriveClinicalCasePhase = (
  doc: ClinicalDocumentSnapshot | undefined
): ClinicalCasePhase => {
  if (doc === undefined) {
    return 'case-created';
  }
  if (summarizeCaseSegmentation(doc).complete) {
    return 'segmentation-complete';
  }
  const hasUpper = doc.objects.some((o) => o.archRole === 'upper');
  const hasLower = doc.objects.some((o) => o.archRole === 'lower');
  const hasAny = doc.objects.length > 0;
  if (!hasAny) {
    return 'case-created';
  }
  if (hasUpper && hasLower) {
    return 'orientation-ready';
  }
  if (hasUpper || hasLower) {
    return 'importing';
  }
  return 'import-complete';
};

export const deriveClinicalCaseWorkflowStatus = (
  doc: ClinicalDocumentSnapshot | undefined
): string => {
  if (doc === undefined) {
    return 'No case';
  }
  const seg = summarizeCaseSegmentation(doc);
  if (seg.complete) {
    return `Segmentation complete · ${String(seg.totalTeeth)} teeth`;
  }
  if (seg.arches.some((a) => a.accepted)) {
    const pending = seg.pendingArches.join(', ');
    return `Segmentation in progress · pending ${pending || 'review'}`;
  }
  const stage = inferPreparationStageFromDocument(doc);
  if (stage === 'ready-for-segmentation') {
    return 'Ready for Segmentation';
  }
  if (stage === 'ready-for-close-base') {
    return 'Ready for Close Base';
  }
  if (stage === 'ready-for-trim') {
    return 'Ready for Trim';
  }
  const hasUpper = doc.objects.some((o) => o.archRole === 'upper');
  const hasLower = doc.objects.some((o) => o.archRole === 'lower');
  if (!hasUpper && !hasLower) {
    return doc.objects.length === 0
      ? 'Case created · Ready for Import'
      : 'Scans imported · Ready for Orientation';
  }
  if (doc.orientationMeta?.acceptedAt !== undefined) {
    return 'Oriented · Ready for Preparation';
  }
  if (hasUpper && hasLower) {
    return 'Upper + Lower imported · Ready for Orientation';
  }
  if (hasUpper) {
    return 'Upper Arch imported · Lower Arch pending';
  }
  return 'Lower Arch imported · Upper Arch pending';
};
