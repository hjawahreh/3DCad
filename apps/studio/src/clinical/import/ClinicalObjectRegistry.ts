/**
 * ClinicalObjectRegistry — tracks immutable mesh descriptors for the active case.
 */

import type { ClinicalMeshDescriptor, ClinicalObjectId } from './ClinicalMeshDescriptor.js';

export class ClinicalObjectRegistry {
  private readonly byId = new Map<string, ClinicalMeshDescriptor>();

  public clear(): void {
    this.byId.clear();
  }

  public replaceAll(objects: readonly ClinicalMeshDescriptor[]): void {
    this.byId.clear();
    for (const obj of objects) {
      this.byId.set(obj.id, obj);
    }
  }

  public register(object: ClinicalMeshDescriptor): boolean {
    if (this.byId.has(object.id)) {
      return false;
    }
    this.byId.set(object.id, object);
    return true;
  }

  public get(id: ClinicalObjectId): ClinicalMeshDescriptor | undefined {
    return this.byId.get(id);
  }

  public list(): readonly ClinicalMeshDescriptor[] {
    return Object.freeze([...this.byId.values()]);
  }

  public count(): number {
    return this.byId.size;
  }
}
