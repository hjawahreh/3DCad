import type { ImportSession } from './session.js';
import type { ImportRequest } from './request.js';
import type { ImmutableImportSnapshot } from './state.js';
import type { ImportResultType } from './types.js';
import { importFailure, importSuccess } from './types.js';

/**
 * Dispatches import requests to sessions / pipeline runners.
 */
export class ImportDispatcher {
  public async dispatch(
    session: ImportSession,
    request: ImportRequest
  ): Promise<ImportResultType<ImmutableImportSnapshot>> {
    return session.run(request);
  }

  public async dispatchMany(
    sessions: readonly ImportSession[],
    requests: readonly ImportRequest[]
  ): Promise<ImportResultType<readonly ImmutableImportSnapshot[]>> {
    if (sessions.length !== requests.length) {
      return importFailure('invalid', 'Sessions and requests length mismatch');
    }
    const results: ImmutableImportSnapshot[] = [];
    for (let i = 0; i < sessions.length; i += 1) {
      const session = sessions[i]!;
      const request = requests[i]!;
      const result = await session.run(request);
      if (!result.ok) {
        return result;
      }
      results.push(result.value);
    }
    return importSuccess(Object.freeze(results));
  }
}
