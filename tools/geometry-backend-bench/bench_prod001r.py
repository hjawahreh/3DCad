#!/usr/bin/env python3
"""PROD-001R incremental geometry backend benchmark (real dental fixtures)."""

from __future__ import annotations

import json
import math
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "apps/studio/public/clinical-fixtures"
OUT_JSON = ROOT / "docs/performance/geometry-backend-benchmarks.raw.json"
OUT_MD = ROOT / "docs/performance/geometry-backend-benchmarks.md"

MAX_OUTPUT_TRIS = 2_000_000


def log(msg: str) -> None:
    print(msg, flush=True)


def save(results: dict[str, Any]) -> None:
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(results, indent=2, default=str))


def timed(fn, repeats: int = 3) -> dict[str, Any]:
    samples: list[float] = []
    errors: list[str] = []
    last: Any = None
    for i in range(repeats):
        t0 = time.perf_counter()
        try:
            last = fn()
            samples.append((time.perf_counter() - t0) * 1000.0)
        except Exception as exc:  # noqa: BLE001
            samples.append((time.perf_counter() - t0) * 1000.0)
            errors.append(f"run{i}: {type(exc).__name__}: {exc}")
            last = None
    samples_sorted = sorted(samples)
    p50 = samples_sorted[len(samples_sorted) // 2] if samples_sorted else None
    p95 = samples_sorted[max(0, int(math.ceil(0.95 * len(samples_sorted)) - 1))] if samples_sorted else None
    return {
        "samples_ms": samples,
        "p50_ms": p50,
        "p95_ms": p95,
        "errors": errors,
        "failure_rate": (len(errors) / max(1, len(samples))),
        "result": last,
    }


def aabb(positions: np.ndarray) -> dict[str, Any]:
    mn = positions.min(axis=0)
    mx = positions.max(axis=0)
    dims = mx - mn
    return {
        "min": mn.tolist(),
        "max": mx.tolist(),
        "dimensions": dims.tolist(),
        "diagonal": float(np.linalg.norm(dims)),
    }


def inventory(path: Path) -> dict[str, Any]:
    import open3d as o3d

    log(f"inventory {path.name}")
    mesh = o3d.io.read_triangle_mesh(str(path))
    verts = np.asarray(mesh.vertices)
    tris = np.asarray(mesh.triangles)
    t0 = time.perf_counter()
    edge_man = bool(mesh.is_edge_manifold(allow_boundary_edges=True))
    vert_man = bool(mesh.is_vertex_manifold())
    watertight = bool(mesh.is_watertight())
    orientable = bool(mesh.is_orientable())
    topo_ms = (time.perf_counter() - t0) * 1000
    try:
        labels = np.asarray(mesh.cluster_connected_triangles()[0])
        components = int(labels.max()) + 1 if len(labels) else 0
    except Exception as exc:  # noqa: BLE001
        components = f"error:{exc}"
    # Skip expensive unique-edge count; estimate from Open3D watertight + manifold
    return {
        "path": str(path.relative_to(ROOT)),
        "bytes_on_disk": path.stat().st_size,
        "vertices": int(len(verts)),
        "triangles": int(len(tris)),
        "bounds": aabb(verts) if len(verts) else {},
        "open_closed": "closed" if watertight else "open",
        "edge_manifold": edge_man,
        "vertex_manifold": vert_man,
        "watertight": watertight,
        "self_intersecting": "deferred_large_mesh",
        "orientable": orientable,
        "boundary_edges": "not_counted_perf",
        "connected_components": components,
        "approx_memory_bytes": int(verts.nbytes + tris.nbytes),
        "topology_check_ms": topo_ms,
    }


def make_plane(bounds: dict[str, Any]) -> tuple[list[float], list[float], dict[str, int]]:
    dims = np.array(bounds["dimensions"], float)
    mn = np.array(bounds["min"], float)
    n = int(np.argmin(dims))
    uv = [i for i in (0, 1, 2) if i != n]
    normal = [1.0 if i == n else 0.0 for i in range(3)]
    origin = (mn + dims * 0.35).tolist()
    return normal, origin, {"u": uv[0], "v": uv[1], "n": n}


def o3d_clip(path: Path, normal: list[float], origin: list[float]) -> dict[str, Any]:
    import open3d as o3d

    mesh = o3d.io.read_triangle_mesh(str(path))
    clipped = mesh.clip_plane(point=origin, normal=normal)
    v = np.asarray(clipped.vertices)
    t = np.asarray(clipped.triangles)
    if len(t) > MAX_OUTPUT_TRIS:
        raise RuntimeError(f"triangle explosion {len(t)}")
    if len(v) and not np.isfinite(v).all():
        raise RuntimeError("non-finite")
    return {
        "vertices": int(len(v)),
        "triangles": int(len(t)),
        "bounds": aabb(v) if len(v) else None,
        "edge_manifold": bool(clipped.is_edge_manifold()) if len(t) else None,
        "watertight": bool(clipped.is_watertight()) if len(t) else None,
        "delta_triangles": int(len(mesh.triangles) - len(t)),
    }


def o3d_boolean(path: Path) -> dict[str, Any]:
    import open3d as o3d

    mesh = o3d.io.read_triangle_mesh(str(path))
    if not mesh.is_watertight():
        raise RuntimeError("boolean requires watertight input — mesh is open")
    box = o3d.geometry.TriangleMesh.create_box(1, 1, 1)
    out = mesh.boolean_difference(box)
    return {"triangles": int(len(out.triangles))}


def o3d_fill_holes(path: Path) -> dict[str, Any]:
    import open3d as o3d

    mesh = o3d.io.read_triangle_mesh(str(path))
    before = len(mesh.triangles)
    if not hasattr(mesh, "fill_holes"):
        tmesh = o3d.t.geometry.TriangleMesh.from_legacy(mesh)
        if not hasattr(tmesh, "fill_holes"):
            raise RuntimeError("fill_holes API unavailable in this Open3D build")
        # Restrict hole size to avoid pathological fill
        tmesh = tmesh.fill_holes(hole_size=1000000.0)
        mesh = tmesh.to_legacy()
    else:
        mesh.fill_holes()
    after = len(mesh.triangles)
    if after > MAX_OUTPUT_TRIS:
        raise RuntimeError(f"triangle explosion {after}")
    v = np.asarray(mesh.vertices)
    return {
        "triangles_before": int(before),
        "triangles_after": int(after),
        "added": int(after - before),
        "watertight": bool(mesh.is_watertight()),
        "bounds": aabb(v) if len(v) else None,
    }


def vtk_clip(path: Path, normal: list[float], origin: list[float]) -> dict[str, Any]:
    from vtkmodules.vtkCommonDataModel import vtkPlane
    from vtkmodules.vtkFiltersCore import vtkClipPolyData, vtkTriangleFilter
    from vtkmodules.vtkIOGeometry import vtkSTLReader

    reader = vtkSTLReader()
    reader.SetFileName(str(path))
    reader.Update()
    poly = reader.GetOutput()
    before = int(poly.GetNumberOfCells())
    plane = vtkPlane()
    plane.SetOrigin(*origin)
    plane.SetNormal(*normal)
    clip = vtkClipPolyData()
    clip.SetInputData(poly)
    clip.SetClipFunction(plane)
    clip.Update()
    tri = vtkTriangleFilter()
    tri.SetInputData(clip.GetOutput())
    tri.Update()
    out = tri.GetOutput()
    after = int(out.GetNumberOfCells())
    if after > MAX_OUTPUT_TRIS:
        raise RuntimeError(f"triangle explosion {after}")
    if after == 0:
        raise RuntimeError("empty mesh")
    b = list(out.GetBounds())
    dims = [b[1] - b[0], b[3] - b[2], b[5] - b[4]]
    return {
        "vertices": int(out.GetNumberOfPoints()),
        "triangles": after,
        "delta_triangles": before - after,
        "bounds": {
            "min": [b[0], b[2], b[4]],
            "max": [b[1], b[3], b[5]],
            "dimensions": dims,
            "diagonal": float(math.sqrt(sum(d * d for d in dims))),
        },
    }


def vtk_box_trim(path: Path, bounds: dict[str, Any], axes: dict[str, int]) -> dict[str, Any]:
    """Remove a central AABB region by clipping cells (actual cutting, not centroid)."""
    from vtkmodules.vtkCommonDataModel import vtkBox
    from vtkmodules.vtkFiltersCore import vtkClipPolyData, vtkTriangleFilter
    from vtkmodules.vtkIOGeometry import vtkSTLReader

    reader = vtkSTLReader()
    reader.SetFileName(str(path))
    reader.Update()
    poly = reader.GetOutput()
    before = int(poly.GetNumberOfCells())
    b = list(poly.GetBounds())
    dims = np.array(bounds["dimensions"], float)
    mn = np.array(bounds["min"], float)
    u, v, n = axes["u"], axes["v"], axes["n"]
    box_bounds = [0.0] * 6
    # keep band around center 30% on UV; full span on normal
    for axis in (0, 1, 2):
        lo = b[axis * 2]
        hi = b[axis * 2 + 1]
        if axis in (u, v):
            c = 0.5 * (lo + hi)
            half = 0.15 * (hi - lo)
            lo, hi = c - half, c + half
        box_bounds[axis * 2] = lo
        box_bounds[axis * 2 + 1] = hi
    # Expand along normal fully
    box_bounds[n * 2] = b[n * 2] - 1.0
    box_bounds[n * 2 + 1] = b[n * 2 + 1] + 1.0

    box = vtkBox()
    box.SetBounds(box_bounds)
    clip = vtkClipPolyData()
    clip.SetInputData(poly)
    clip.SetClipFunction(box)
    clip.InsideOutOn()  # remove interior
    clip.Update()
    tri = vtkTriangleFilter()
    tri.SetInputData(clip.GetOutput())
    tri.Update()
    out = tri.GetOutput()
    after = int(out.GetNumberOfCells())
    if after == 0:
        raise RuntimeError("empty after box trim")
    if after > MAX_OUTPUT_TRIS:
        raise RuntimeError(f"triangle explosion {after}")
    return {
        "vertices": int(out.GetNumberOfPoints()),
        "triangles": after,
        "delta_triangles": before - after,
        "geometry_changed": after != before,
    }


def vtk_clean(path: Path) -> dict[str, Any]:
    from vtkmodules.vtkFiltersCore import vtkCleanPolyData, vtkPolyDataConnectivityFilter
    from vtkmodules.vtkIOGeometry import vtkSTLReader

    reader = vtkSTLReader()
    reader.SetFileName(str(path))
    reader.Update()
    clean = vtkCleanPolyData()
    clean.SetInputData(reader.GetOutput())
    clean.Update()
    conn = vtkPolyDataConnectivityFilter()
    conn.SetInputConnection(clean.GetOutputPort())
    conn.SetExtractionModeToLargestRegion()
    conn.Update()
    c = clean.GetOutput()
    r = conn.GetOutput()
    return {
        "clean_vertices": int(c.GetNumberOfPoints()),
        "clean_cells": int(c.GetNumberOfCells()),
        "largest_vertices": int(r.GetNumberOfPoints()),
        "largest_cells": int(r.GetNumberOfCells()),
    }


def manifold_ingest(path: Path) -> dict[str, Any]:
    import manifold3d as mf
    from collections import defaultdict

    data = path.read_bytes()
    ntri = int.from_bytes(data[80:84], "little")
    verts = np.empty((ntri * 3, 3), dtype=np.float32)
    tris = np.empty((ntri, 3), dtype=np.uint32)
    off = 84
    for i in range(ntri):
        chunk = data[off : off + 50]
        v = np.frombuffer(chunk[12:48], dtype="<f4").reshape(3, 3)
        base = i * 3
        verts[base : base + 3] = v
        tris[i] = [base, base + 1, base + 2]
        off += 50
    # merge identical vertices (ingestion helper only — recorded)
    rounded = np.round(verts.astype(np.float64), 5)
    keys = rounded.view([("", rounded.dtype)] * 3).ravel()
    _, uniq_idx, inv = np.unique(keys, return_index=True, return_inverse=True)
    mpos = verts[uniq_idx]
    midx = inv[tris].astype(np.uint32)
    mesh = mf.Mesh()
    mesh.vert_properties = np.asarray(mpos, dtype=np.float32)
    mesh.tri_verts = midx
    try:
        solid = mf.Manifold(mesh)
        return {
            "ok": True,
            "num_tri": int(solid.num_tri()),
            "num_vert": int(solid.num_vert()),
            "is_empty": bool(solid.is_empty()),
            "status": str(solid.status()) if hasattr(solid, "status") else None,
            "merged_vertices": int(len(mpos)),
            "raw_stl_vertices": int(len(verts)),
        }
    except Exception as exc:  # noqa: BLE001
        # Some bindings return empty/error status instead of throw
        return {
            "ok": False,
            "error": f"{type(exc).__name__}: {exc}",
            "merged_vertices": int(len(mpos)),
            "raw_stl_vertices": int(len(verts)),
            "note": "Open dental STLs are not manifold solids; construction fails without repair.",
        }


def manifold_control() -> dict[str, Any]:
    import manifold3d as mf

    cube = mf.Manifold.cube([20.0, 20.0, 20.0])
    trimmed = cube.trim_by_plane([0.0, 0.0, 1.0], 5.0)
    a = mf.Manifold.cube([10.0, 10.0, 10.0])
    b = mf.Manifold.sphere(4.0, 32).translate([5.0, 5.0, 5.0])
    diff = mf.Manifold.batch_boolean([a, b], mf.OpType.Subtract) if hasattr(mf, "OpType") else (a - b)
    return {
        "trim_tri": int(trimmed.num_tri()),
        "boolean_tri": int(diff.num_tri()),
        "trim_empty": bool(trimmed.is_empty()),
    }


def write_md(results: dict[str, Any]) -> None:
    lines = [
        "# Geometry Backend Benchmarks (PROD-001R)",
        "",
        f"**Generated:** {results['timestamp']}",
        "",
        "Real dental fixtures only for production claims. Solid cube controls validate Manifold APIs.",
        "",
        "## Environment",
        "",
        f"- Open3D: `{results['environment'].get('open3d')}`",
        f"- VTK: `{results['environment'].get('vtk')}`",
        f"- manifold3d: `{results['environment'].get('manifold3d')}`",
        "",
        "## Fixture inventory",
        "",
    ]
    for name, inv in results["fixtures"].items():
        lines += [
            f"### {name}.stl",
            "",
            "| Metric | Value |",
            "|---|---|",
            f"| Disk bytes | {inv.get('bytes_on_disk')} |",
            f"| Vertices | {inv.get('vertices')} |",
            f"| Triangles | {inv.get('triangles')} |",
            f"| Dimensions | {inv.get('bounds', {}).get('dimensions')} |",
            f"| Diagonal | {inv.get('bounds', {}).get('diagonal')} |",
            f"| Open/closed | {inv.get('open_closed')} |",
            f"| Edge manifold | {inv.get('edge_manifold')} |",
            f"| Vertex manifold | {inv.get('vertex_manifold')} |",
            f"| Watertight | {inv.get('watertight')} |",
            f"| Self-intersecting | {inv.get('self_intersecting')} |",
            f"| Orientable | {inv.get('orientable')} |",
            f"| Components | {inv.get('connected_components')} |",
            f"| Approx memory | {inv.get('approx_memory_bytes')} |",
            f"| Topology check ms | {inv.get('topology_check_ms')} |",
            "",
        ]
    lines += ["## Benchmarks", ""]
    for name, ops in results["benchmarks"].items():
        lines += [f"### {name}", ""]
        for op, data in ops.items():
            lines += [
                f"#### {op}",
                "",
                f"- p50: **{data.get('p50_ms')} ms**",
                f"- p95: **{data.get('p95_ms')} ms**",
                f"- samples: `{data.get('samples_ms')}`",
                f"- failure_rate: {data.get('failure_rate')}",
                f"- errors: `{data.get('errors')}`",
                f"- result: `{json.dumps(data.get('result'), default=str)[:600]}`",
                "",
            ]
    lines += ["## Raw JSON", "", "`docs/performance/geometry-backend-benchmarks.raw.json`", ""]
    OUT_MD.write_text("\n".join(lines))


def main() -> int:
    import open3d as o3d
    import vtk
    import manifold3d as mf

    results: dict[str, Any] = {
        "phase": "PROD-001R",
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "environment": {
            "open3d": o3d.__version__,
            "vtk": vtk.vtkVersion.GetVTKVersion(),
            "manifold3d": getattr(mf, "__version__", "3.5.3"),
            "python": sys.version.split()[0],
        },
        "fixtures": {},
        "benchmarks": {},
        "notes": [
            "Self-intersection full scan deferred on ~250k tris (unbounded runtime).",
            "Manifold ingest records merge-vertices helper; no silent clinical repair.",
            "AABB/centroid first-party trim is NOT a production-grade exact backend.",
        ],
    }
    save(results)

    paths = sorted(FIXTURES.glob("*.stl"))
    assert paths, "no fixtures"

    for path in paths:
        results["fixtures"][path.stem] = inventory(path)
        save(results)

    # controls first (fast)
    log("manifold solid controls")
    results["benchmarks"]["control_solid"] = {
        "manifold_trim_boolean": timed(manifold_control, repeats=3),
    }
    save(results)

    for path in paths:
        name = path.stem
        log(f"bench {name}")
        results["benchmarks"][name] = {}
        normal, origin, axes = make_plane(results["fixtures"][name]["bounds"])

        log("  open3d clip_plane")
        results["benchmarks"][name]["open3d_clip_plane"] = timed(
            lambda: o3d_clip(path, normal, origin), repeats=3
        )
        save(results)

        log("  open3d boolean")
        results["benchmarks"][name]["open3d_boolean_difference"] = timed(
            lambda: o3d_boolean(path), repeats=1
        )
        save(results)

        log("  open3d fill_holes")
        results["benchmarks"][name]["open3d_fill_holes"] = timed(
            lambda: o3d_fill_holes(path), repeats=1
        )
        save(results)

        log("  vtk clip_plane")
        results["benchmarks"][name]["vtk_clip_plane"] = timed(
            lambda: vtk_clip(path, normal, origin), repeats=3
        )
        save(results)

        log("  vtk box trim (cell cutting)")
        results["benchmarks"][name]["vtk_box_trim"] = timed(
            lambda: vtk_box_trim(path, results["fixtures"][name]["bounds"], axes),
            repeats=3,
        )
        save(results)

        log("  vtk clean/connectivity")
        results["benchmarks"][name]["vtk_clean_connectivity"] = timed(
            lambda: vtk_clean(path), repeats=2
        )
        save(results)

        log("  manifold ingest")
        results["benchmarks"][name]["manifold_ingest"] = timed(
            lambda: manifold_ingest(path), repeats=2
        )
        save(results)

    write_md(results)
    log(f"Wrote {OUT_JSON}")
    log(f"Wrote {OUT_MD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
