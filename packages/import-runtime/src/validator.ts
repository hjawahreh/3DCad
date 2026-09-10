import type { ImportConfiguration } from './configuration.js';
import type { ImportRequest } from './request.js';
import { RESERVED_IMPORT_FORMATS } from './reserved.js';
import { importFailure, importSuccess, type ImportResultType } from './types.js';

export interface ValidationReport {
  readonly ok: boolean;
  readonly messages: readonly string[];
}

/**
 * Request validation without reading or parsing file bytes.
 * File existence is a host-supplied contract flag on the request metadata or assumed by host.
 */
export class ImportValidator {
  private readonly seenRequestIds = new Set<string>();
  private readonly seenSources = new Set<string>();

  public constructor(private readonly configuration: ImportConfiguration) {}

  public validate(request: ImportRequest): ImportResultType<ValidationReport> {
    const messages: string[] = [];

    if ((request.id as string).length === 0) {
      return importFailure('validation', 'Import request id is required');
    }
    if ((request.source as string).trim().length === 0) {
      return importFailure('validation', 'Import source ref is required');
    }
    if (request.fileName.trim().length === 0) {
      return importFailure('validation', 'Import fileName is required');
    }
    if (request.extension.trim().length === 0) {
      return importFailure('validation', 'Import extension is missing or invalid');
    }

    // File existence contract: host may set metadata.exists=false
    if (request.metadata['exists'] === 'false') {
      return importFailure('not-found', `Source does not exist: ${request.source as string}`);
    }

    if (!this.configuration.allowDuplicateRequests) {
      if (this.seenRequestIds.has(request.id as string)) {
        return importFailure('conflict', `Duplicate import request id ${request.id as string}`);
      }
      if (this.seenSources.has(request.source as string)) {
        return importFailure(
          'conflict',
          `Duplicate import source ${request.source as string}`
        );
      }
    }

    const known = (RESERVED_IMPORT_FORMATS as readonly string[]).includes(request.extension);
    if (!known && request.formatHint === undefined) {
      messages.push(`Extension .${request.extension} is not a reserved platform format`);
    }

    this.seenRequestIds.add(request.id as string);
    this.seenSources.add(request.source as string);

    return importSuccess(
      Object.freeze({
        ok: true,
        messages: Object.freeze(messages)
      })
    );
  }

  public forget(request: ImportRequest): void {
    this.seenRequestIds.delete(request.id as string);
    this.seenSources.delete(request.source as string);
  }

  public clear(): void {
    this.seenRequestIds.clear();
    this.seenSources.clear();
  }
}
