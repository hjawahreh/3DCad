import type { ImportPluginRegistry } from './plugin-registry.js';
import type { ImporterPlugin } from './plugin.js';
import { createPassthroughImporter } from './plugin.js';
import type { ImportRequest } from './request.js';
import type { ImporterPluginId } from './types.js';
import { asImporterPluginId, importFailure, importSuccess, type ImportResultType } from './types.js';

/**
 * Factory helpers for constructing importer plug-ins and wiring defaults.
 */
export class ImportFactory {
  public createPassthrough(input: {
    readonly id: string;
    readonly name: string;
    readonly extensions: readonly string[];
    readonly mimeTypes?: readonly string[];
    readonly priority?: number;
  }): ImporterPlugin {
    return createPassthroughImporter({
      id: asImporterPluginId(input.id),
      name: input.name,
      extensions: input.extensions,
      ...(input.mimeTypes === undefined ? {} : { mimeTypes: input.mimeTypes }),
      ...(input.priority === undefined ? {} : { priority: input.priority })
    });
  }

  public registerPassthrough(
    registry: ImportPluginRegistry,
    input: {
      readonly id: string;
      readonly name: string;
      readonly extensions: readonly string[];
      readonly mimeTypes?: readonly string[];
      readonly priority?: number;
    }
  ): ImportResultType<ImporterPlugin> {
    const plugin = this.createPassthrough(input);
    const registered = registry.register(plugin);
    if (!registered.ok) {
      return registered;
    }
    return importSuccess(plugin);
  }

  public requirePlugin(
    registry: ImportPluginRegistry,
    id: ImporterPluginId
  ): ImportResultType<ImporterPlugin> {
    const plugin = registry.get(id);
    if (plugin === undefined) {
      return importFailure('not-found', `Importer ${id} not found`);
    }
    return importSuccess(plugin);
  }

  public peekExtension(request: ImportRequest): string {
    return request.extension;
  }
}
