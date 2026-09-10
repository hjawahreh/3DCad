import { describe, expect, it } from 'vitest';
import {
  projectBoundaryToMeshXY,
  type TrimPoint2D
} from '../../src/geometry-kernel/ops/trimMesh.js';
import { createMesh } from '../../src/geometry-kernel/mesh/TriangleMesh.js';
import { NotificationHost } from '../../src/application/notifications.js';

describe('trim live viewport projection', () => {
  it('maps screen-space points using live viewport size, not 640×480', () => {
    const mesh = createMesh({
      id: 1,
      objectId: 'arch',
      role: 'source',
      revision: 1,
      positions: new Float32Array([0, 0, 0, 100, 0, 0, 0, 50, 0]),
      indices: new Uint32Array([0, 1, 2])
    });
    const screen: TrimPoint2D[] = [
      { x: 0, y: 900 },
      { x: 1440, y: 900 },
      { x: 0, y: 0 }
    ];
    const projected = projectBoundaryToMeshXY(screen, mesh, { width: 1440, height: 900 });
    expect(projected[0]?.x).toBeCloseTo(0, 5);
    expect(projected[0]?.y).toBeCloseTo(0, 5);
    expect(projected[1]?.x).toBeCloseTo(100, 5);
    expect(projected[2]?.y).toBeCloseTo(50, 5);
  });
});

describe('notification host', () => {
  it('deduplicates identical toasts and supports dismiss', () => {
    const host = new NotificationHost();
    const a = host.push('success', 'Import', 'Upper scan imported.');
    const b = host.push('success', 'Import', 'Upper scan imported.');
    expect(a.id).toBe(b.id);
    expect(host.list()).toHaveLength(1);
    host.dismiss(a.id);
    expect(host.list()).toHaveLength(0);
  });

  it('returns a stable list snapshot when unchanged (useSyncExternalStore contract)', () => {
    const host = new NotificationHost();
    const a = host.list();
    const b = host.list();
    expect(a).toBe(b);
    host.push('info', 'Case', 'Created');
    const c = host.list();
    expect(c).not.toBe(a);
    expect(host.list()).toBe(c);
  });
});
