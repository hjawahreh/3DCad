import type { ProjectId, ProjectSessionId } from '@cad-studio/project-runtime';
import type {
  ImportRequestId,
  ImportSourceRef,
  ImporterPluginId,
  ReservedImportFormat
} from './types.js';

/**
 * Immutable import request created by the host.
 * Ownership: caller retains the request; runtime reads only.
 */
export interface ImportRequest {
  readonly id: ImportRequestId;
  readonly source: ImportSourceRef;
  readonly fileName: string;
  readonly extension: string;
  readonly mimeType: string | undefined;
  readonly formatHint: ReservedImportFormat | undefined;
  readonly projectId: ProjectId | undefined;
  readonly projectSessionId: ProjectSessionId | undefined;
  readonly preferredImporterId: ImporterPluginId | undefined;
  readonly metadata: Readonly<Record<string, string>>;
  readonly createdAt: number;
}

export const createImportRequest = (input: {
  readonly id: ImportRequestId;
  readonly source: ImportSourceRef;
  readonly fileName: string;
  readonly extension?: string;
  readonly mimeType?: string;
  readonly formatHint?: ReservedImportFormat;
  readonly projectId?: ProjectId;
  readonly projectSessionId?: ProjectSessionId;
  readonly preferredImporterId?: ImporterPluginId;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly createdAt: number;
}): ImportRequest => {
  const ext =
    input.extension ??
    (input.fileName.includes('.')
      ? input.fileName.slice(input.fileName.lastIndexOf('.') + 1).toLowerCase()
      : '');
  return Object.freeze({
    id: input.id,
    source: input.source,
    fileName: input.fileName,
    extension: ext.toLowerCase(),
    mimeType: input.mimeType,
    formatHint: input.formatHint,
    projectId: input.projectId,
    projectSessionId: input.projectSessionId,
    preferredImporterId: input.preferredImporterId,
    metadata: Object.freeze({ ...(input.metadata ?? {}) }),
    createdAt: input.createdAt
  });
};
