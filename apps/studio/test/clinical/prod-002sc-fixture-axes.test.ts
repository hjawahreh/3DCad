/**
 * PROD-002SC — real fixture orientation axes sanity.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseClinicalMeshBytes } from '../../src/clinical/import/ClinicalMeshParsers.js';
import { estimateClinicalOrientation } from '../../src/clinical/orientation/ClinicalAutoOrientationEstimator.js';
import { transformPoint3 } from '../../src/clinical/orientation/ClinicalTransformMath.js';

const fix = join(dirname(fileURLToPath(import.meta.url)), '../../public/clinical-fixtures');

describe('PROD-002SC real fixture axes', () => {
  it('dual-arch superior aligns with bite axis; anterior is not occlusal', () => {
    const upperBytes = readFileSync(join(fix, 'upper.stl'));
    const lowerBytes = readFileSync(join(fix, 'lower.stl'));
    const upper = parseClinicalMeshBytes(
      upperBytes.buffer.slice(upperBytes.byteOffset, upperBytes.byteOffset + upperBytes.byteLength),
      'stl'
    );
    const lower = parseClinicalMeshBytes(
      lowerBytes.buffer.slice(lowerBytes.byteOffset, lowerBytes.byteOffset + lowerBytes.byteLength),
      'stl'
    );

    const est = estimateClinicalOrientation([
      {
        objectId: 'u',
        archRole: 'upper',
        positions: upper.positions,
        indices: upper.indices
      },
      {
        objectId: 'l',
        archRole: 'lower',
        positions: lower.positions,
        indices: lower.indices
      }
    ]);
    expect(est.ok).toBe(true);
    const dot =
      est.axes.superior.x * est.axes.anterior.x +
      est.axes.superior.y * est.axes.anterior.y +
      est.axes.superior.z * est.axes.anterior.z;
    expect(Math.abs(dot)).toBeLessThan(0.05);

    const c = est.axes.centroid;
    const S = est.axes.superior;
    const A = est.axes.anterior;
    const origin = transformPoint3(est.transform, [c.x, c.y, c.z]);
    const alongS = transformPoint3(est.transform, [c.x + S.x, c.y + S.y, c.z + S.z]);
    const alongA = transformPoint3(est.transform, [c.x + A.x, c.y + A.y, c.z + A.z]);
    expect(Math.abs(alongS[1]! - origin[1]! - 1)).toBeLessThan(1e-5);
    expect(Math.abs(alongA[2]! - origin[2]! - 1)).toBeLessThan(1e-5);

    const upC = [
      (upper.bounds.min[0]! + upper.bounds.max[0]!) / 2,
      (upper.bounds.min[1]! + upper.bounds.max[1]!) / 2,
      (upper.bounds.min[2]! + upper.bounds.max[2]!) / 2
    ] as const;
    const loC = [
      (lower.bounds.min[0]! + lower.bounds.max[0]!) / 2,
      (lower.bounds.min[1]! + lower.bounds.max[1]!) / 2,
      (lower.bounds.min[2]! + lower.bounds.max[2]!) / 2
    ] as const;
    const upT = transformPoint3(est.transform, upC);
    const loT = transformPoint3(est.transform, loC);
    expect(upT[1]!).toBeGreaterThan(loT[1]!);
  });
});
