export interface PluginMetadata {
  readonly id: string;
  readonly version: string;
  readonly sdkRange: string;
  readonly capabilities: readonly string[];
  readonly permissions: readonly string[];
}

export interface ExtensionPoint {
  readonly id: string;
  readonly version: string;
  readonly requiredCapability?: string;
}

export class PluginRegistry {
  private readonly plugins = new Map<string, PluginMetadata>();
  private readonly points = new Map<string, ExtensionPoint>();
  public registerExtensionPoint(point: ExtensionPoint): void {
    if (this.points.has(point.id)) throw new Error('Duplicate extension point.');
    this.points.set(point.id, Object.freeze({ ...point }));
  }
  public registerPlugin(metadata: PluginMetadata): void {
    if (this.plugins.has(metadata.id)) throw new Error('Duplicate plugin.');
    this.plugins.set(
      metadata.id,
      Object.freeze({
        ...metadata,
        capabilities: Object.freeze([...metadata.capabilities]),
        permissions: Object.freeze([...metadata.permissions])
      })
    );
  }
  public canContribute(pluginId: string, pointId: string): boolean {
    const plugin = this.plugins.get(pluginId);
    const point = this.points.get(pointId);
    return (
      plugin !== undefined &&
      point !== undefined &&
      (point.requiredCapability === undefined ||
        plugin.capabilities.includes(point.requiredCapability))
    );
  }
  public metadata(): readonly PluginMetadata[] {
    return Object.freeze([...this.plugins.values()]);
  }
}
