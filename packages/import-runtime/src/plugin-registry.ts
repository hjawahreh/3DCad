import type { ImporterPlugin, ImporterPluginInfo } from './plugin.js';
import type { ImportRequest } from './request.js';
import type { ImporterPluginId } from './types.js';
import { importFailure, importSuccess, type ImportResultType } from './types.js';

interface RegisteredPlugin {
  readonly plugin: ImporterPlugin;
  enabled: boolean;
}

/**
 * Registry of importer plug-ins: registration, discovery, enable/disable, priority.
 * No parser logic.
 */
export class ImportPluginRegistry {
  private readonly plugins = new Map<string, RegisteredPlugin>();

  public register(plugin: ImporterPlugin): ImportResultType<void> {
    const id = plugin.info.id as string;
    if (this.plugins.has(id)) {
      return importFailure('conflict', `Importer ${id} already registered`);
    }
    this.plugins.set(id, { plugin, enabled: plugin.info.enabled });
    return importSuccess(undefined);
  }

  public unregister(id: ImporterPluginId): boolean {
    return this.plugins.delete(id as string);
  }

  public get(id: ImporterPluginId): ImporterPlugin | undefined {
    return this.plugins.get(id as string)?.plugin;
  }

  public isEnabled(id: ImporterPluginId): boolean {
    return this.plugins.get(id as string)?.enabled === true;
  }

  public enable(id: ImporterPluginId): ImportResultType<void> {
    const entry = this.plugins.get(id as string);
    if (entry === undefined) {
      return importFailure('not-found', `Importer ${id} not found`);
    }
    entry.enabled = true;
    return importSuccess(undefined);
  }

  public disable(id: ImporterPluginId): ImportResultType<void> {
    const entry = this.plugins.get(id as string);
    if (entry === undefined) {
      return importFailure('not-found', `Importer ${id} not found`);
    }
    entry.enabled = false;
    return importSuccess(undefined);
  }

  public list(): readonly ImporterPluginInfo[] {
    return Object.freeze(
      [...this.plugins.values()].map((e) =>
        Object.freeze({
          ...e.plugin.info,
          enabled: e.enabled
        })
      )
    );
  }

  public listPlugins(): readonly ImporterPlugin[] {
    return Object.freeze([...this.plugins.values()].map((e) => e.plugin));
  }

  /**
   * Resolve best importer by preferred id, then extension/MIME, then priority.
   */
  public resolve(request: ImportRequest): ImportResultType<ImporterPlugin> {
    if (request.preferredImporterId !== undefined) {
      const entry = this.plugins.get(request.preferredImporterId as string);
      if (entry === undefined) {
        return importFailure(
          'not-found',
          `Preferred importer ${request.preferredImporterId} not found`
        );
      }
      if (!entry.enabled) {
        return importFailure(
          'unavailable',
          `Preferred importer ${request.preferredImporterId} is disabled`
        );
      }
      if (!entry.plugin.canHandle(request)) {
        return importFailure(
          'unsupported',
          `Preferred importer ${request.preferredImporterId} cannot handle request`
        );
      }
      return importSuccess(entry.plugin);
    }

    const candidates = [...this.plugins.values()]
      .filter((e) => e.enabled && e.plugin.canHandle(request))
      .map((e) => e.plugin)
      .sort((a, b) => b.info.priority - a.info.priority);

    const best = candidates[0];
    if (best === undefined) {
      return importFailure(
        'unsupported',
        `No importer for extension=${request.extension} mime=${request.mimeType ?? 'none'}`
      );
    }
    return importSuccess(best);
  }

  public clear(): void {
    this.plugins.clear();
  }

  public size(): number {
    return this.plugins.size;
  }
}
