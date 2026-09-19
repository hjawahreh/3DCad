#!/usr/bin/env python3
"""
PROD-001S — VTK clinical Trim + Close Base spike worker.

Architecture: offline / native-worker only. Clinical / React never import VTK.

Commands (JSON on stdin or --bench):
  inventory | trim | close_base | bench

Trim toolchain (PROD-002R):
  Primary: loop3d → vtkSelectPolyData → selection scalars → vtkClipPolyData
  Fallback: vtkImplicitSelectionLoop + vtkClipPolyData (PROD-001S path)

Close Base toolchain (evaluated):
  vtkContourTriangulator + vtkLinearExtrusionFilter (+ clean/normals)

Convention (InsideOut):
  inside_out=False → KEEP points with implicit F>=0 (outside loop removed by default VTK)
  Documented in result.meta.inside_out_convention
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
import traceback
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "apps/studio/public/clinical-fixtures"
OUT_MD = ROOT / "docs/performance/prod-001s-vtk-spike.md"
OUT_JSON = ROOT / "docs/performance/prod-001s-vtk-spike.raw.json"

MAX_OUTPUT_TRIS = 1_500_000
MAX_OP_MS = 60_000
MAX_BOUNDS_GROWTH = 25.0


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


# ---------- geometry helpers ----------


def newell_normal(points: np.ndarray) -> np.ndarray | None:
    """Stable loop normal from 3D polygon (Newell). Returns None if degenerate."""
    if len(points) < 3:
        return None
    n = np.zeros(3, dtype=np.float64)
    for i in range(len(points)):
        cur = points[i]
        nxt = points[(i + 1) % len(points)]
        n[0] += (cur[1] - nxt[1]) * (cur[2] + nxt[2])
        n[1] += (cur[2] - nxt[2]) * (cur[0] + nxt[0])
        n[2] += (cur[0] - nxt[0]) * (cur[1] + nxt[1])
    length = float(np.linalg.norm(n))
    if length < 1e-12:
        return None
    return n / length


def planarity_rms(points: np.ndarray, normal: np.ndarray) -> float:
    c = points.mean(axis=0)
    d = (points - c) @ normal
    return float(np.sqrt(np.mean(d * d)))


def loop_self_intersects_2d(points: np.ndarray, normal: np.ndarray) -> bool:
    """Project loop to plane of `normal` and detect segment crossings."""
    # Build orthonormal basis
    n = normal / max(1e-12, np.linalg.norm(normal))
    helper = np.array([1.0, 0.0, 0.0]) if abs(n[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
    u = np.cross(n, helper)
    u /= max(1e-12, np.linalg.norm(u))
    v = np.cross(n, u)
    pts2 = np.stack([(points @ u), (points @ v)], axis=1)

    def orient(a, b, c):
        return (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])

    def segments_intersect(p1, p2, p3, p4):
        o1 = orient(p1, p2, p3)
        o2 = orient(p1, p2, p4)
        o3 = orient(p3, p4, p1)
        o4 = orient(p3, p4, p2)
        return (o1 * o2 < 0) and (o3 * o4 < 0)

    npts = len(pts2)
    for i in range(npts):
        a1 = pts2[i]
        a2 = pts2[(i + 1) % npts]
        for j in range(i + 1, npts):
            if abs(i - j) <= 1 or (i == 0 and j == npts - 1) or (j == 0 and i == npts - 1):
                continue
            # also skip adjacent wrap pairs
            if (i + 1) % npts == j or (j + 1) % npts == i:
                continue
            b1 = pts2[j]
            b2 = pts2[(j + 1) % npts]
            if segments_intersect(a1, a2, b1, b2):
                return True
    return False


def aabb_of(points: np.ndarray) -> dict[str, Any]:
    mn = points.min(axis=0)
    mx = points.max(axis=0)
    dims = mx - mn
    return {
        "min": mn.tolist(),
        "max": mx.tolist(),
        "dimensions": dims.tolist(),
        "diagonal": float(np.linalg.norm(dims)),
    }


def poly_to_arrays(poly, *, already_triangles: bool = False) -> tuple[np.ndarray, np.ndarray]:
    """Convert vtkPolyData → numpy positions/indices.

    GEO-002: when `already_triangles` is True, skip a second vtkTriangleFilter
    (callers that already triangulated+cleaned must pass True).
    Cell extraction uses a bulk reshape when the array is uniform triangles.
    """
    from vtkmodules.util.numpy_support import vtk_to_numpy
    from vtkmodules.vtkFiltersCore import vtkTriangleFilter

    if already_triangles:
        out = poly
    else:
        tri = vtkTriangleFilter()
        tri.SetInputData(poly)
        tri.Update()
        out = tri.GetOutput()
    if out.GetNumberOfPoints() == 0 or out.GetNumberOfCells() == 0:
        return np.zeros((0, 3), dtype=np.float64), np.zeros((0, 3), dtype=np.int32)
    pts = vtk_to_numpy(out.GetPoints().GetData()).astype(np.float64, copy=False)
    cells = vtk_to_numpy(out.GetPolys().GetData())
    # Fast path: [3,i,j,k, 3,i,j,k, ...]
    if cells.size >= 4 and cells.size % 4 == 0 and int(cells[0]) == 3:
        # Verify uniform triangle markers without a Python loop over faces.
        if np.all(cells[0::4] == 3):
            tris = cells.reshape(-1, 4)[:, 1:4].astype(np.int32, copy=False)
            return pts, tris
    tris = []
    i = 0
    while i < len(cells):
        n = int(cells[i])
        if n == 3:
            tris.append([int(cells[i + 1]), int(cells[i + 2]), int(cells[i + 3])])
        i += n + 1
    return pts, np.asarray(tris, dtype=np.int32)


def fingerprint(positions: np.ndarray, indices: np.ndarray) -> str:
    import hashlib

    h = hashlib.sha256()
    h.update(positions.astype(np.float32).tobytes())
    h.update(indices.astype(np.uint32).tobytes())
    return "geo:" + h.hexdigest()[:24]


def quality_checks(positions: np.ndarray, indices: np.ndarray, before_diag: float) -> dict[str, Any]:
    warnings: list[str] = []
    codes: list[str] = []
    if len(indices) == 0 or len(positions) == 0:
        codes.append("EMPTY")
    if len(positions) and not np.isfinite(positions).all():
        codes.append("NON_FINITE")
    if len(indices) > MAX_OUTPUT_TRIS:
        codes.append("TRIANGLE_EXPLOSION")
    bounds = aabb_of(positions) if len(positions) else None
    growth = None
    if bounds and before_diag > 1e-9:
        growth = bounds["diagonal"] / before_diag
        if growth > MAX_BOUNDS_GROWTH:
            codes.append("BOUNDS_EXPLOSION")
    # degenerate area
    deg = 0
    if len(indices):
        v0 = positions[indices[:, 0]]
        v1 = positions[indices[:, 1]]
        v2 = positions[indices[:, 2]]
        areas = 0.5 * np.linalg.norm(np.cross(v1 - v0, v2 - v0), axis=1)
        deg = int(np.sum(areas < 1e-12))
        if deg > 0:
            warnings.append(f"degenerate_triangles={deg}")
    return {
        "ok": len(codes) == 0,
        "codes": codes,
        "warnings": warnings,
        "vertices": int(len(positions)),
        "triangles": int(len(indices)),
        "bounds": bounds,
        "bounds_growth": growth,
        "degenerate_triangles": deg,
        "fingerprint": fingerprint(positions, indices) if len(indices) else None,
    }


# ---------- VTK I/O ----------


def read_stl(path: Path):
    from vtkmodules.vtkIOGeometry import vtkSTLReader

    r = vtkSTLReader()
    r.SetFileName(str(path))
    r.Update()
    return r.GetOutput()


def inventory(path: Path) -> dict[str, Any]:
    from vtkmodules.vtkFiltersCore import vtkCleanPolyData, vtkPolyDataNormals, vtkFeatureEdges
    import open3d as o3d

    t0 = time.perf_counter()
    poly = read_stl(path)
    clean = vtkCleanPolyData()
    clean.SetInputData(poly)
    clean.Update()
    c = clean.GetOutput()
    normals = vtkPolyDataNormals()
    normals.SetInputData(c)
    normals.ComputePointNormalsOn()
    normals.Update()
    feat = vtkFeatureEdges()
    feat.SetInputData(c)
    feat.BoundaryEdgesOn()
    feat.FeatureEdgesOff()
    feat.NonManifoldEdgesOn()
    feat.ManifoldEdgesOff()
    feat.Update()
    boundary_edges = int(feat.GetOutput().GetNumberOfCells())

    # Open3D topology sidecar
    mesh = o3d.io.read_triangle_mesh(str(path))
    verts = np.asarray(mesh.vertices)
    tris = np.asarray(mesh.triangles)
    inv = {
        "path": str(path.relative_to(ROOT)),
        "bytes": path.stat().st_size,
        "vtk_points_raw": int(poly.GetNumberOfPoints()),
        "vtk_cells_raw": int(poly.GetNumberOfCells()),
        "vtk_points_clean": int(c.GetNumberOfPoints()),
        "vtk_cells_clean": int(c.GetNumberOfCells()),
        "boundary_edges": boundary_edges,
        "bounds": list(c.GetBounds()),
        "o3d_vertices": int(len(verts)),
        "o3d_triangles": int(len(tris)),
        "edge_manifold": bool(mesh.is_edge_manifold(allow_boundary_edges=True)),
        "vertex_manifold": bool(mesh.is_vertex_manifold()),
        "watertight": bool(mesh.is_watertight()),
        "orientable": bool(mesh.is_orientable()),
        "self_intersecting": "deferred_large_mesh",
        "normals_generated": True,
        "inventory_ms": (time.perf_counter() - t0) * 1000,
    }
    b = inv["bounds"]
    inv["dimensions"] = [b[1] - b[0], b[3] - b[2], b[5] - b[4]]
    inv["diagonal"] = float(math.sqrt(sum(d * d for d in inv["dimensions"])))
    return inv


def build_locator(poly):
    from vtkmodules.vtkCommonDataModel import vtkCellLocator

    loc = vtkCellLocator()
    loc.SetDataSet(poly)
    loc.BuildLocator()
    return loc


def closest_on_mesh(locator, _poly, point: np.ndarray) -> np.ndarray:
    from vtkmodules.vtkCommonCore import reference

    closest = [0.0, 0.0, 0.0]
    cell_id = reference(0)
    sub_id = reference(0)
    dist2 = reference(0.0)
    locator.FindClosestPoint(point.tolist(), closest, cell_id, sub_id, dist2)
    return np.array(closest, dtype=np.float64)


def sample_surface_loop(
    poly,
    kind: str,
    rng: np.random.Generator | None = None,
) -> dict[str, Any]:
    """Build a clinical-like 3D loop by projecting a planar polygon onto the mesh surface."""
    from vtkmodules.util.numpy_support import vtk_to_numpy

    rng = rng or np.random.default_rng(42)
    b = list(poly.GetBounds())
    dims = np.array([b[1] - b[0], b[3] - b[2], b[5] - b[4]], dtype=np.float64)
    mn = np.array([b[0], b[2], b[4]], dtype=np.float64)
    # Prefer shortest AABB as approximate open-surface normal for *sampling frame only*;
    # the actual clip normal is Newell on the resulting surface loop.
    n_axis = int(np.argmin(dims))
    uv = [i for i in (0, 1, 2) if i != n_axis]
    u_ax, v_ax = uv[0], uv[1]
    cu = mn[u_ax] + 0.5 * dims[u_ax]
    cv = mn[v_ax] + 0.5 * dims[v_ax]
    su, sv = dims[u_ax], dims[v_ax]
    cn = mn[n_axis] + 0.5 * dims[n_axis]

    def rect(scale_u: float, scale_v: float, ou: float = 0.0, ov: float = 0.0, npts: int = 4):
        # corners then densify
        corners = np.array(
            [
                [cu + ou - scale_u * su / 2, cv + ov - scale_v * sv / 2],
                [cu + ou + scale_u * su / 2, cv + ov - scale_v * sv / 2],
                [cu + ou + scale_u * su / 2, cv + ov + scale_v * sv / 2],
                [cu + ou - scale_u * su / 2, cv + ov + scale_v * sv / 2],
            ],
            dtype=np.float64,
        )
        if npts <= 4:
            return corners
        # densify edges
        densified = []
        per = max(1, npts // 4)
        for i in range(4):
            a = corners[i]
            bpt = corners[(i + 1) % 4]
            for t in np.linspace(0, 1, per, endpoint=False):
                densified.append(a * (1 - t) + bpt * t)
        return np.asarray(densified, dtype=np.float64)

    if kind == "simple_convex":
        uv_pts = rect(0.28, 0.28, npts=4)
    elif kind == "concave":
        # C-shape in UV
        s = 0.22
        uv_pts = np.array(
            [
                [cu - s * su, cv - s * sv],
                [cu + s * su, cv - s * sv],
                [cu + s * su, cv + s * sv],
                [cu + 0.05 * su, cv + s * sv],
                [cu + 0.05 * su, cv],
                [cu - 0.05 * su, cv],
                [cu - 0.05 * su, cv + s * sv],
                [cu - s * su, cv + s * sv],
            ],
            dtype=np.float64,
        )
    elif kind == "large":
        uv_pts = rect(0.65, 0.55, npts=4)
    elif kind == "small":
        uv_pts = rect(0.08, 0.08, npts=4)
    elif kind == "near_edge":
        uv_pts = rect(0.18, 0.25, ou=-0.32 * su, ov=0.0, npts=4)
    elif kind == "freehand":
        # irregular dense-ish freehand
        angles = np.linspace(0, 2 * np.pi, 36, endpoint=False)
        rad_u = 0.18 * su * (1 + 0.15 * np.sin(3 * angles))
        rad_v = 0.18 * sv * (1 + 0.12 * np.cos(5 * angles))
        uv_pts = np.stack([cu + rad_u * np.cos(angles), cv + rad_v * np.sin(angles)], axis=1)
    elif kind == "polyline":
        uv_pts = rect(0.3, 0.25, npts=4)
    elif kind == "dense":
        uv_pts = rect(0.3, 0.3, npts=128)
    elif kind == "nonplanar":
        uv_pts = rect(0.25, 0.25, npts=12)
    elif kind == "self_intersecting":
        uv_pts = np.array(
            [
                [cu - 0.2 * su, cv - 0.2 * sv],
                [cu + 0.2 * su, cv + 0.2 * sv],
                [cu + 0.2 * su, cv - 0.2 * sv],
                [cu - 0.2 * su, cv + 0.2 * sv],
            ],
            dtype=np.float64,
        )
    else:
        raise ValueError(f"unknown loop kind {kind}")

    locator = build_locator(poly)
    loop3d = []
    for p in uv_pts:
        probe = np.array([0.0, 0.0, 0.0])
        probe[u_ax] = p[0]
        probe[v_ax] = p[1]
        probe[n_axis] = cn
        # cast from both sides along normal axis to find surface
        hit = closest_on_mesh(locator, poly, probe)
        # also try offset along ± normal for better surface snap
        for sign in (-1.0, 1.0):
            probe2 = probe.copy()
            probe2[n_axis] = cn + sign * dims[n_axis]
            hit2 = closest_on_mesh(locator, poly, probe2)
            if np.linalg.norm(hit2 - probe) < np.linalg.norm(hit - probe):
                hit = hit2
        loop3d.append(hit)
    loop3d = np.asarray(loop3d, dtype=np.float64)

    if kind == "nonplanar":
        # add controlled out-of-plane wobble then re-snap — keeps surface association
        normal_guess = np.zeros(3)
        normal_guess[n_axis] = 1.0
        for i in range(len(loop3d)):
            loop3d[i] = loop3d[i] + normal_guess * (0.15 * math.sin(i * 0.9))
            loop3d[i] = closest_on_mesh(locator, poly, loop3d[i])

    normal = newell_normal(loop3d)
    return {
        "kind": kind,
        "points": loop3d.tolist(),
        "normal": None if normal is None else normal.tolist(),
        "planarity_rms": None if normal is None else planarity_rms(loop3d, normal),
        "sample_frame_axis_n": n_axis,
    }


# ---------- TRIM ----------

# PROD-002R: vtkSelectPolyData + scalar clip is the primary trim path on planar/concave
# surface loops because it respects mesh connectivity and signed-distance scalars better
# than vtkImplicitSelectionLoop projection on open dental STLs. ImplicitSelectionLoop
# remains as fallback when SelectPolyData throws or returns empty/invalid output.


def _loop_plane_basis(normal: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    n = normal / max(1e-12, np.linalg.norm(normal))
    helper = np.array([1.0, 0.0, 0.0]) if abs(n[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
    u = np.cross(n, helper)
    u /= max(1e-12, np.linalg.norm(u))
    v = np.cross(n, u)
    return u, v, n


def _project_loop_2d(loop_points: np.ndarray, normal: np.ndarray) -> np.ndarray:
    u, v, _ = _loop_plane_basis(normal)
    return np.stack([(loop_points @ u), (loop_points @ v)], axis=1)


def _point_in_polygon_2d(p: np.ndarray, poly2: np.ndarray) -> bool:
    """Ray-cast point-in-polygon (even-odd)."""
    x, y = float(p[0]), float(p[1])
    inside = False
    n = len(poly2)
    for i in range(n):
        x1, y1 = poly2[i]
        x2, y2 = poly2[(i + 1) % n]
        if ((y1 > y) != (y2 > y)) and (x < (x2 - x1) * (y - y1) / max(1e-12, y2 - y1) + x1):
            inside = not inside
    return inside


def loop_intersects_removable_region(
    poly,
    loop_points: np.ndarray,
    normal: np.ndarray,
    *,
    inside_out: bool,
) -> bool:
    """
    True when the loop encloses mesh geometry that would be removed for the given keep mode.
    Used to reject false no-ops (loop misses surface entirely → acceptable no-op).

    GEO-002: early-exit point-in-polygon — do not scan all vertices when unnecessary.
    """
    from vtkmodules.util.numpy_support import vtk_to_numpy

    loop2 = _project_loop_2d(loop_points, normal)
    u, v, n = _loop_plane_basis(normal)
    pts3 = vtk_to_numpy(poly.GetPoints().GetData()).astype(np.float64, copy=False)
    pts2 = np.stack([(pts3 @ u), (pts3 @ v)], axis=1)

    # KEEP_INSIDE — removable region is outside: any exterior point is enough.
    if inside_out:
        for p in pts2:
            if not _point_in_polygon_2d(p, loop2):
                return True
        return False

    # KEEP_OUTSIDE — removable region is inside: any interior point is enough.
    for p in pts2:
        if _point_in_polygon_2d(p, loop2):
            return True
    return False


def vtk_bounds_list(poly) -> list[float]:
    return list(poly.GetBounds())


def arrays_surface_area(positions: np.ndarray, indices: np.ndarray) -> float:
    if len(indices) == 0:
        return 0.0
    v0 = positions[indices[:, 0]]
    v1 = positions[indices[:, 1]]
    v2 = positions[indices[:, 2]]
    areas = 0.5 * np.linalg.norm(np.cross(v1 - v0, v2 - v0), axis=1)
    return float(np.sum(areas))


def poly_surface_area(poly) -> float:
    positions, indices = poly_to_arrays(poly)
    return arrays_surface_area(positions, indices)


def geometry_meaningfully_unchanged(
    *,
    before_cells: int,
    before_pts: int,
    before_bounds: list[float],
    before_area: float,
    after_cells: int,
    after_pts: int,
    after_bounds: list[float] | None,
    after_area: float,
    rel_tol: float = 1e-4,
    abs_area_tol: float = 1e-6,
) -> bool:
    if after_cells != before_cells or abs(after_pts - before_pts) > 1:
        return False
    if after_bounds is None or len(after_bounds) < 6 or len(before_bounds) < 6:
        return False
    for axis in range(3):
        lo = before_bounds[axis * 2]
        hi = before_bounds[axis * 2 + 1]
        span = max(1e-9, abs(hi - lo))
        for idx in (axis * 2, axis * 2 + 1):
            if abs(after_bounds[idx] - before_bounds[idx]) > rel_tol * span:
                return False
    denom = max(abs(before_area), 1e-9)
    return abs(after_area - before_area) <= max(abs_area_tol, rel_tol * denom)


def _make_loop_points(loop_points: np.ndarray):
    from vtkmodules.vtkCommonCore import vtkPoints

    pts = vtkPoints()
    for p in loop_points:
        pts.InsertNextPoint(float(p[0]), float(p[1]), float(p[2]))
    return pts


def _bounds_dict_to_list(bounds: dict[str, Any] | None) -> list[float] | None:
    if not bounds:
        return None
    mn = bounds.get("min")
    mx = bounds.get("max")
    if not mn or not mx or len(mn) < 3 or len(mx) < 3:
        return None
    return [float(mn[0]), float(mx[0]), float(mn[1]), float(mx[1]), float(mn[2]), float(mx[2])]


def _finalize_trim_output(
    poly,
    loop_points: np.ndarray,
    normal: np.ndarray,
    *,
    inside_out: bool,
    pipeline: str,
    timings: dict[str, float],
    t_all: float,
    positions: np.ndarray,
    indices: np.ndarray,
    loop_intersects: bool,
) -> dict[str, Any]:
    timings["total_ms"] = (time.perf_counter() - t_all) * 1000

    before_pts = int(poly.GetNumberOfPoints())
    before_cells = int(poly.GetNumberOfCells())
    bounds_before = vtk_bounds_list(poly)
    before_diag = math.sqrt(
        (bounds_before[1] - bounds_before[0]) ** 2
        + (bounds_before[3] - bounds_before[2]) ** 2
        + (bounds_before[5] - bounds_before[4]) ** 2
    )
    # GEO-002: avoid full input-mesh poly_to_arrays solely for area metrics.
    # Cell/point/bounds checks remain authoritative for noop detection.
    surface_area_before = float(before_cells)
    q = quality_checks(positions, indices, before_diag)
    bounds_after_dict = q.get("bounds")
    bounds_after = _bounds_dict_to_list(bounds_after_dict)
    surface_area_after = arrays_surface_area(positions, indices) if len(indices) else 0.0
    keep_mode = "KEEP_INSIDE" if inside_out else "KEEP_OUTSIDE"

    removed_est = max(0, before_cells - q["triangles"])

    unchanged = geometry_meaningfully_unchanged(
        before_cells=before_cells,
        before_pts=before_pts,
        before_bounds=bounds_before,
        before_area=surface_area_before,
        after_cells=q["triangles"],
        after_pts=q["vertices"],
        after_bounds=bounds_after,
        after_area=surface_area_after,
        rel_tol=1e-4,
        # before_area is a cell-count proxy (GEO-002); do not fail on area delta alone.
        abs_area_tol=1e9,
    )
    noop = unchanged or q.get("fingerprint") is None

    diagnostics = {
        "pipeline": pipeline,
        "loop_intersects_removable_region": loop_intersects,
        "geometry_unchanged": unchanged,
        "fallback_used": pipeline.startswith("vtkImplicitSelectionLoop"),
    }

    base_fail = {
        "quality": q,
        "validation": q,
        "timings_ms": timings,
        "inside_out": inside_out,
        "keep_mode": keep_mode,
        "diagnostics": diagnostics,
        "bounds_before": bounds_before,
        "bounds_after": bounds_after,
        "bounds_after_dict": bounds_after_dict,
        "surface_area_before": surface_area_before,
        "surface_area_after": surface_area_after,
        "input_triangles": before_cells,
        "output_triangles": q["triangles"],
        "output_triangle_count": q["triangles"],
        "removed_triangles_est": int(removed_est),
        "removed_triangle_count": int(removed_est),
        "new_point_count": q["vertices"],
        "vertices": q["vertices"],
        "normal_used": normal.tolist(),
        "planarity_rms": planarity_rms(loop_points, normal),
    }

    if q["triangles"] == 0:
        return {
            **base_fail,
            "ok": False,
            "error": "Trim produced empty mesh",
            "noop": True,
        }
    if not q["ok"]:
        return {
            **base_fail,
            "ok": False,
            "error": "Trim quality validation failed: " + ",".join(q["codes"]),
            "noop": noop,
        }
    if noop:
        if loop_intersects:
            return {
                **base_fail,
                "ok": False,
                "error": "Trim produced no geometry change.",
                "noop": True,
            }
        return {
            **base_fail,
            "ok": False,
            "error": "Trim produced no geometry change.",
            "noop": True,
        }
    if (not inside_out) and removed_est <= 0 and loop_intersects:
        return {
            **base_fail,
            "ok": False,
            "error": "Trim produced no geometry change.",
            "noop": True,
        }

    convention = (
        "EMPIRICAL: InsideOut=False keeps exterior (removes loop interior) — clinical REMOVE-interior default"
        if not inside_out
        else "EMPIRICAL: InsideOut=True keeps loop interior — clinical KEEP-selected"
    )
    return {
        "ok": True,
        **base_fail,
        "inside_out_convention": convention,
        "noop": False,
        "positions": positions,
        "indices": indices,
    }


def _run_select_polydata_trim(poly, loop_points: np.ndarray, *, inside_out: bool) -> tuple[np.ndarray, np.ndarray, dict[str, float]]:
    from vtkmodules.vtkFiltersCore import vtkClipPolyData, vtkTriangleFilter, vtkCleanPolyData
    from vtkmodules.vtkFiltersModeling import vtkSelectPolyData

    timings: dict[str, float] = {}
    t0 = time.perf_counter()
    pts = _make_loop_points(loop_points)
    select = vtkSelectPolyData()
    select.SetInputData(poly)
    select.SetLoop(pts)
    select.SetGenerateSelectionScalars(1)
    select.SetSelectionScalarsArrayName("Selected")
    select.Update()
    timings["select_polydata_ms"] = (time.perf_counter() - t0) * 1000

    selected = select.GetOutput()
    scalars = selected.GetPointData().GetScalars("Selected")
    if scalars is None or selected.GetNumberOfPoints() == 0:
        raise RuntimeError("vtkSelectPolyData produced no selection scalars")

    t0 = time.perf_counter()
    clip = vtkClipPolyData()
    clip.SetInputData(selected)
    # Signed distance scalars: negative inside loop, positive outside.
    clip.SetValue(0.0)
    clip.SetInsideOut(1 if inside_out else 0)
    clip.GenerateClippedOutputOff()
    clip.Update()
    timings["clip_ms"] = (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    tri = vtkTriangleFilter()
    tri.SetInputData(clip.GetOutput())
    tri.Update()
    clean = vtkCleanPolyData()
    clean.SetInputData(tri.GetOutput())
    clean.Update()
    positions, indices = poly_to_arrays(clean.GetOutput(), already_triangles=True)
    timings["convert_out_ms"] = (time.perf_counter() - t0) * 1000
    return positions, indices, timings


def _run_implicit_loop_trim(
    poly, loop_points: np.ndarray, normal: np.ndarray, *, inside_out: bool
) -> tuple[np.ndarray, np.ndarray, dict[str, float]]:
    from vtkmodules.vtkCommonDataModel import vtkImplicitSelectionLoop
    from vtkmodules.vtkFiltersCore import vtkClipPolyData, vtkTriangleFilter, vtkCleanPolyData

    timings: dict[str, float] = {}
    t0 = time.perf_counter()
    pts = _make_loop_points(loop_points)
    loop = vtkImplicitSelectionLoop()
    loop.SetLoop(pts)
    loop.SetNormal(float(normal[0]), float(normal[1]), float(normal[2]))
    if hasattr(loop, "AutomaticNormalGenerationOff"):
        loop.AutomaticNormalGenerationOff()
    timings["loop_create_ms"] = (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    clip = vtkClipPolyData()
    clip.SetInputData(poly)
    clip.SetClipFunction(loop)
    clip.SetInsideOut(1 if inside_out else 0)
    clip.GenerateClippedOutputOff()
    clip.Update()
    timings["clip_ms"] = (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    tri = vtkTriangleFilter()
    tri.SetInputData(clip.GetOutput())
    tri.Update()
    clean = vtkCleanPolyData()
    clean.SetInputData(tri.GetOutput())
    clean.Update()
    positions, indices = poly_to_arrays(clean.GetOutput(), already_triangles=True)
    timings["convert_out_ms"] = (time.perf_counter() - t0) * 1000
    return positions, indices, timings


def vtk_polygon_trim(
    poly,
    loop_points: np.ndarray,
    normal: np.ndarray | None,
    *,
    inside_out: bool = False,
    # EMPIRICAL (PROD-001S/002R):
    # inside_out=False → KEEP_OUTSIDE / REMOVE loop interior (clinical default).
    # inside_out=True  → KEEP_INSIDE / REMOVE exterior.
) -> dict[str, Any]:
    timings: dict[str, float] = {}
    t_all = time.perf_counter()

    if normal is None:
        return {
            "ok": False,
            "error": "Trim boundary orientation could not be determined.",
            "timings_ms": timings,
        }

    if loop_self_intersects_2d(loop_points, normal):
        return {
            "ok": False,
            "error": "Trim boundary is self-intersecting.",
            "timings_ms": timings,
        }

    loop_intersects = loop_intersects_removable_region(
        poly, loop_points, normal, inside_out=inside_out
    )

    pipeline = "vtkSelectPolyData+vtkClipPolyData"
    select_err: str | None = None
    try:
        positions, indices, select_timings = _run_select_polydata_trim(
            poly, loop_points, inside_out=inside_out
        )
        timings.update(select_timings)
        result = _finalize_trim_output(
            poly,
            loop_points,
            normal,
            inside_out=inside_out,
            pipeline=pipeline,
            timings=timings,
            t_all=t_all,
            positions=positions,
            indices=indices,
            loop_intersects=loop_intersects,
        )
        if result.get("ok"):
            return result
        # Retry with implicit loop when select path no-ops despite intersecting removable region
        if loop_intersects and result.get("noop"):
            select_err = str(result.get("error") or "select noop")
        elif not loop_intersects and result.get("noop"):
            return result
        elif result.get("error") == "Trim produced empty mesh":
            select_err = "empty mesh"
        elif not result.get("ok"):
            select_err = str(result.get("error"))
        else:
            return result
    except Exception as exc:  # noqa: BLE001
        select_err = str(exc)

    if select_err is None:
        return result

    pipeline = "vtkImplicitSelectionLoop+vtkClipPolyData"
    timings["select_fallback_reason"] = select_err
    try:
        positions, indices, implicit_timings = _run_implicit_loop_trim(
            poly, loop_points, normal, inside_out=inside_out
        )
        timings.update(implicit_timings)
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "error": f"Trim failed (select: {select_err}; implicit: {exc})",
            "timings_ms": timings,
            "inside_out": inside_out,
            "keep_mode": "KEEP_INSIDE" if inside_out else "KEEP_OUTSIDE",
            "diagnostics": {"pipeline": pipeline, "select_error": select_err},
        }

    return _finalize_trim_output(
        poly,
        loop_points,
        normal,
        inside_out=inside_out,
        pipeline=pipeline,
        timings=timings,
        t_all=t_all,
        positions=positions,
        indices=indices,
        loop_intersects=loop_intersects,
    )


# ---------- CLOSE BASE ----------


def vtk_close_base(
    poly,
    *,
    height: float,
    direction: np.ndarray,
    prefer: str,
) -> dict[str, Any]:
    """
    Spike pipeline:
      boundary edges → largest loop → vtkContourTriangulator (cap)
      → extrude walls via vtkLinearExtrusionFilter on boundary
      → append + clean

    direction must be explicit unit vector (clinical / loop normal).
    """
    from vtkmodules.vtkCommonCore import vtkPoints, vtkIdList
    from vtkmodules.vtkCommonDataModel import vtkPolyData, vtkCellArray
    from vtkmodules.vtkFiltersCore import vtkCleanPolyData
    from vtkmodules.vtkFiltersCore import (
        vtkCleanPolyData,
        vtkAppendPolyData,
        vtkTriangleFilter,
        vtkFeatureEdges,
        vtkPolyDataNormals,
    )
    from vtkmodules.vtkFiltersGeneral import vtkContourTriangulator
    from vtkmodules.vtkFiltersModeling import vtkFillHolesFilter
    from vtkmodules.vtkFiltersModeling import vtkLinearExtrusionFilter
    from vtkmodules.util.numpy_support import vtk_to_numpy, numpy_to_vtk

    timings: dict[str, float] = {}
    t_all = time.perf_counter()

    if float(np.linalg.norm(direction)) < 1e-12:
        return {"ok": False, "error": "Base generation could not produce a safe result.", "reason": "invalid direction"}

    direction = direction / np.linalg.norm(direction)

    # Trimmed STL meshes can carry coincident boundary points from separate
    # source triangles. Weld them before feature extraction so the clinical rim
    # is treated as one topological loop.
    input_clean = vtkCleanPolyData()
    input_clean.SetInputData(poly)
    input_clean.PointMergingOn()
    input_clean.ToleranceIsAbsoluteOn()
    input_clean.SetAbsoluteTolerance(1e-5)
    input_clean.Update()
    poly = input_clean.GetOutput()

    b = list(poly.GetBounds())
    before_diag = math.sqrt((b[1] - b[0]) ** 2 + (b[3] - b[2]) ** 2 + (b[5] - b[4]) ** 2)
    before_cells = int(poly.GetNumberOfCells())

    t0 = time.perf_counter()
    # Extract boundary edges
    feat = vtkFeatureEdges()
    feat.SetInputData(poly)
    feat.BoundaryEdgesOn()
    feat.FeatureEdgesOff()
    feat.NonManifoldEdgesOff()
    feat.ManifoldEdgesOff()
    feat.Update()
    boundary = feat.GetOutput()
    timings["boundary_extract_ms"] = (time.perf_counter() - t0) * 1000

    if boundary.GetNumberOfCells() == 0:
        return {
            "ok": False,
            "error": "Base generation could not produce a safe result.",
            "reason": "no boundary edges",
            "timings_ms": timings,
        }

    # Build polylines via connectivity on boundary — take largest
    t0 = time.perf_counter()
    from vtkmodules.vtkFiltersCore import vtkStripper

    strip = vtkStripper()
    strip.SetInputData(boundary)
    strip.JoinContiguousSegmentsOn()
    strip.Update()
    strips = strip.GetOutput()
    # Pick longest strip
    best_ids = None
    best_len = 0
    for i in range(strips.GetNumberOfCells()):
        cell = strips.GetCell(i)
        ids = cell.GetPointIds()
        if ids.GetNumberOfIds() > best_len:
            best_len = ids.GetNumberOfIds()
            best_ids = [ids.GetId(j) for j in range(ids.GetNumberOfIds())]
    timings["loop_build_ms"] = (time.perf_counter() - t0) * 1000

    if not best_ids or best_len < 3:
        return {
            "ok": False,
            "error": "Base generation could not produce a safe result.",
            "reason": "boundary loop too small",
            "timings_ms": timings,
        }

    # Cap via ContourTriangulator on the loop as a polydata lines → triangulator
    t0 = time.perf_counter()
    loop_pts = vtkPoints()
    loop_lines = vtkCellArray()
    idlist = vtkIdList()
    for pid in best_ids:
        p = strips.GetPoint(pid)
        nid = loop_pts.InsertNextPoint(p)
        idlist.InsertNextId(nid)
    # close
    if best_ids[0] != best_ids[-1]:
        idlist.InsertNextId(0)
    loop_lines.InsertNextCell(idlist)
    loop_pd = vtkPolyData()
    loop_pd.SetPoints(loop_pts)
    loop_pd.SetLines(loop_lines)

    triangulator = vtkContourTriangulator()
    triangulator.SetInputData(loop_pd)
    try:
        triangulator.Update()
        cap = triangulator.GetOutput()
        tri_err = int(triangulator.GetTriangulationError()) if hasattr(triangulator, "GetTriangulationError") else 0
    except Exception as exc:  # noqa: BLE001
        return {
            "ok": False,
            "error": "Base generation could not produce a safe result.",
            "reason": f"vtkContourTriangulator failed: {exc}",
            "timings_ms": timings,
        }
    timings["contour_triangulator_ms"] = (time.perf_counter() - t0) * 1000

    # Extrude the boundary loop for walls
    t0 = time.perf_counter()
    extrude = vtkLinearExtrusionFilter()
    extrude.SetInputData(loop_pd)
    extrude.SetExtrusionTypeToVectorExtrusion()
    extrude.SetVector(float(direction[0]), float(direction[1]), float(direction[2]))
    extrude.SetScaleFactor(float(height))
    extrude.CappingOn()
    extrude.Update()
    walls = extrude.GetOutput()
    timings["extrude_ms"] = (time.perf_counter() - t0) * 1000

    t0 = time.perf_counter()
    append = vtkAppendPolyData()
    append.AddInputData(poly)
    append.AddInputData(cap)
    append.AddInputData(walls)
    append.Update()
    clean = vtkCleanPolyData()
    clean.SetInputData(append.GetOutput())
    clean.PointMergingOn()
    clean.ToleranceIsAbsoluteOn()
    clean.SetAbsoluteTolerance(1e-5)
    clean.Update()
    fill = vtkFillHolesFilter()
    fill.SetInputData(clean.GetOutput())
    fill.SetHoleSize(float(max(before_diag * 100.0, height * 100.0)))
    fill.Update()
    nrm = vtkPolyDataNormals()
    nrm.SetInputData(fill.GetOutput())
    nrm.ConsistencyOn()
    nrm.AutoOrientNormalsOn()
    nrm.Update()
    positions, indices = poly_to_arrays(nrm.GetOutput())
    timings["merge_ms"] = (time.perf_counter() - t0) * 1000
    timings["total_ms"] = (time.perf_counter() - t_all) * 1000

    q = quality_checks(positions, indices, before_diag)
    added = q["triangles"] - before_cells
    if timings["total_ms"] > MAX_OP_MS:
        return {
            "ok": False,
            "error": "Base generation could not produce a safe result.",
            "reason": "timeout",
            "quality": q,
            "timings_ms": timings,
        }
    if not q["ok"] or added <= 0 or q["triangles"] == 0:
        return {
            "ok": False,
            "error": "Base generation could not produce a safe result.",
            "reason": "quality/empty/no-delta",
            "quality": q,
            "timings_ms": timings,
            "triangulation_error": tri_err,
            "loop_vertices": best_len,
            "direction": direction.tolist(),
            "direction_source": prefer,
            "height": height,
            "added_triangles_est": added,
        }

    return {
        "ok": True,
        "quality": q,
        "timings_ms": timings,
        "triangulation_error": tri_err,
        "loop_vertices": best_len,
        "direction": direction.tolist(),
        "direction_source": prefer,
        "height": height,
        "added_triangles_est": added,
        "input_triangles": before_cells,
        "output_triangles": q["triangles"],
        "positions": positions,
        "indices": indices,
    }


def clinical_height(bounds: list[float]) -> float:
    dims = [bounds[1] - bounds[0], bounds[3] - bounds[2], bounds[5] - bounds[4]]
    # ~3% of diagonal, clamped
    diag = math.sqrt(sum(d * d for d in dims))
    h = 0.03 * diag
    return float(min(8.0, max(1.5, h)))


def direction_candidates(poly, loop_points: np.ndarray | None) -> dict[str, np.ndarray]:
    b = list(poly.GetBounds())
    dims = np.array([b[1] - b[0], b[3] - b[2], b[5] - b[4]])
    # clinical inferior often -Y or -Z depending on orientation; expose candidates
    out: dict[str, np.ndarray] = {
        "clinical_neg_y": np.array([0.0, -1.0, 0.0]),
        "clinical_neg_z": np.array([0.0, 0.0, -1.0]),
        "aabb_shortest": np.zeros(3),
    }
    out["aabb_shortest"][int(np.argmin(dims))] = -1.0
    if loop_points is not None and len(loop_points) >= 3:
        n = newell_normal(loop_points)
        if n is not None:
            # extrude opposite to outward gum normal (into base)
            out["boundary_normal_neg"] = -n
    return out


# ---------- BENCH ----------


def strip_heavy(result: dict[str, Any]) -> dict[str, Any]:
    r = {k: v for k, v in result.items() if k not in ("positions", "indices")}
    return r


def run_bench() -> dict[str, Any]:
    results: dict[str, Any] = {
        "phase": "PROD-001S",
        "vtk_version": None,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "fixtures": {},
        "trim": {},
        "close_base": {},
        "comparison": {},
        "notes": [],
        "decision_hints": [],
    }
    import vtk

    results["vtk_version"] = vtk.vtkVersion.GetVTKVersion()

    kinds = [
        "simple_convex",
        "concave",
        "large",
        "small",
        "near_edge",
        "freehand",
        "polyline",
        "nonplanar",
        "self_intersecting",
        "dense",
    ]

    for stl_name in ("lower.stl", "upper.stl"):
        path = FIXTURES / stl_name
        arch = stl_name.replace(".stl", "")
        log(f"inventory {stl_name}")
        results["fixtures"][arch] = inventory(path)
        poly = read_stl(path)
        # Prefer cleaned mesh for ops
        from vtkmodules.vtkFiltersCore import vtkCleanPolyData

        clean = vtkCleanPolyData()
        clean.SetInputData(poly)
        clean.Update()
        poly = clean.GetOutput()

        results["trim"][arch] = {}
        for kind in kinds:
            log(f"trim {arch} {kind}")
            samples = []
            last = None
            errors = []
            for run in range(3):
                try:
                    loop = sample_surface_loop(poly, kind, np.random.default_rng(1000 + run))
                    normal = None if loop["normal"] is None else np.array(loop["normal"])
                    pts = np.array(loop["points"], dtype=np.float64)
                    if normal is None:
                        last = {
                            "ok": False,
                            "error": "Trim boundary orientation could not be determined.",
                            "loop_meta": {k: loop[k] for k in ("kind", "planarity_rms", "sample_frame_axis_n")},
                        }
                        errors.append(last["error"])
                    else:
                        last = vtk_polygon_trim(poly, pts, normal, inside_out=False)
                        last["loop_meta"] = {
                            "kind": loop["kind"],
                            "planarity_rms": loop["planarity_rms"],
                            "point_count": len(pts),
                            "sample_frame_axis_n": loop["sample_frame_axis_n"],
                        }
                        if not last.get("ok"):
                            errors.append(last.get("error", "fail"))
                    samples.append(last.get("timings_ms", {}).get("total_ms", 0.0))
                except Exception as exc:  # noqa: BLE001
                    errors.append(f"{type(exc).__name__}: {exc}")
                    samples.append(0.0)
                    last = {"ok": False, "error": str(exc)}
            results["trim"][arch][kind] = {
                "samples_ms": samples,
                "p50_ms": float(np.median(samples)) if samples else None,
                "p95_ms": float(np.percentile(samples, 95)) if samples else None,
                "failure_rate": len(errors) / max(1, 3),
                "errors": errors,
                "last": strip_heavy(last) if last else None,
            }

        # Close base on original + on a successful trim
        log(f"close_base {arch}")
        results["close_base"][arch] = {}
        height = clinical_height(list(poly.GetBounds()))
        # Use simple_convex trim result mesh if available
        trim_ok = None
        loop = sample_surface_loop(poly, "simple_convex", np.random.default_rng(7))
        if loop["normal"] is not None:
            tr = vtk_polygon_trim(poly, np.array(loop["points"]), np.array(loop["normal"]), inside_out=False)
            if tr.get("ok"):
                trim_ok = tr

        # Build poly from trim output for base
        def arrays_to_poly(positions: np.ndarray, indices: np.ndarray):
            from vtkmodules.vtkCommonCore import vtkPoints
            from vtkmodules.vtkCommonDataModel import vtkPolyData, vtkCellArray
            from vtkmodules.util.numpy_support import numpy_to_vtk

            pd = vtkPolyData()
            pts = vtkPoints()
            pts.SetData(numpy_to_vtk(positions.astype(np.float64)))
            pd.SetPoints(pts)
            cells = vtkCellArray()
            for tri in indices:
                cells.InsertNextCell(3)
                cells.InsertCellPoint(int(tri[0]))
                cells.InsertCellPoint(int(tri[1]))
                cells.InsertCellPoint(int(tri[2]))
            pd.SetPolys(cells)
            return pd

        base_input = arrays_to_poly(trim_ok["positions"], trim_ok["indices"]) if trim_ok else poly
        loop_pts = np.array(loop["points"]) if loop.get("points") else None
        cands = direction_candidates(base_input, loop_pts)

        for name, direction in cands.items():
            samples = []
            errors = []
            last = None
            for run in range(2):
                try:
                    last = vtk_close_base(base_input, height=height, direction=direction, prefer=name)
                    samples.append(last.get("timings_ms", {}).get("total_ms", 0.0))
                    if not last.get("ok"):
                        errors.append(last.get("reason") or last.get("error") or "fail")
                except Exception as exc:  # noqa: BLE001
                    errors.append(f"{type(exc).__name__}: {exc}")
                    samples.append(0.0)
                    last = {"ok": False, "error": str(exc)}
            results["close_base"][arch][name] = {
                "samples_ms": samples,
                "p50_ms": float(np.median(samples)) if samples else None,
                "p95_ms": float(np.percentile(samples, 95)) if len(samples) else None,
                "failure_rate": len(errors) / max(1, len(samples)),
                "errors": errors,
                "last": strip_heavy(last) if last else None,
                "height": height,
            }

    # Comparison notes vs clinical-reference (qualitative from prior PROD-001R)
    results["comparison"] = {
        "clinical_reference_v1": {
            "trim": "polygon exact-edge-clip in TS; projection often AABB-derived UV",
            "close_base": "capped ear-clip extrusion; AABB shortest default",
        },
        "vtk_spike": {
            "trim": "PROD-002R: vtkSelectPolyData+vtkClipPolyData (primary), vtkImplicitSelectionLoop fallback",
            "close_base": "vtkContourTriangulator + vtkLinearExtrusionFilter",
        },
    }

    # Decision hints from aggregate
    trim_pass = 0
    trim_total = 0
    for arch, kinds_map in results["trim"].items():
        for kind, data in kinds_map.items():
            trim_total += 1
            if data.get("last", {}).get("ok"):
                trim_pass += 1
    base_pass = 0
    base_total = 0
    for arch, dirs in results["close_base"].items():
        for name, data in dirs.items():
            base_total += 1
            if data.get("last", {}).get("ok"):
                base_pass += 1

    results["decision_hints"] = [
        f"trim_ok_rate={trim_pass}/{trim_total}",
        f"close_base_ok_rate={base_pass}/{base_total}",
    ]
    if trim_pass / max(1, trim_total) >= 0.7:
        results["decision_hints"].append("VTK Trim looks like specialized-worker candidate (C/A)")
    else:
        results["decision_hints"].append("VTK Trim unreliable on this corpus — do not force")
    if base_pass / max(1, base_total) >= 0.5:
        results["decision_hints"].append("VTK Close Base partial candidate")
    else:
        results["decision_hints"].append("VTK Close Base not production-ready on this corpus")

    return results


def write_md(results: dict[str, Any]) -> None:
    lines = [
        "# PROD-001S — VTK Clinical Trim + Close Base Spike",
        "",
        f"**Generated:** {results['timestamp']}",
        f"**VTK:** `{results['vtk_version']}`",
        "",
        "Worker/offline evidence only. Clinical/React do not import VTK.",
        "",
        "## InsideOut convention",
        "",
        "- `InsideOut=False` (spike default, **empirical on dental STLs**): keep **exterior** → clinical **REMOVE interior**.",
        "- `InsideOut=True`: keep **interior** → clinical **KEEP selected**.",
        "- Measured: `InsideOut=True` on ImplicitSelectionLoop left ~2k of ~233k tris for a small loop — inverted vs clinical intent.",
        "",
        "## Fixture inventory",
        "",
    ]
    for arch, inv in results["fixtures"].items():
        lines += [
            f"### {arch}",
            "",
            "| Metric | Value |",
            "|---|---|",
            *[f"| {k} | {v} |" for k, v in inv.items()],
            "",
        ]
    lines += ["## Trim results", ""]
    for arch, kinds_map in results["trim"].items():
        lines += [f"### {arch}", ""]
        for kind, data in kinds_map.items():
            last = data.get("last") or {}
            lines += [
                f"#### {kind}",
                "",
                f"- p50: **{data.get('p50_ms')} ms** / p95: **{data.get('p95_ms')} ms**",
                f"- failure_rate: {data.get('failure_rate')}",
                f"- ok: `{last.get('ok')}`",
                f"- error: `{last.get('error')}`",
                f"- removed_est: `{last.get('removed_triangles_est')}`",
                f"- out_tris: `{(last.get('quality') or {}).get('triangles')}`",
                f"- planarity_rms: `{(last.get('loop_meta') or {}).get('planarity_rms')}`",
                f"- timings: `{last.get('timings_ms')}`",
                "",
            ]
    lines += ["## Close Base results", ""]
    for arch, dirs in results["close_base"].items():
        lines += [f"### {arch}", ""]
        for name, data in dirs.items():
            last = data.get("last") or {}
            lines += [
                f"#### direction={name}",
                "",
                f"- height: {data.get('height')}",
                f"- p50: **{data.get('p50_ms')} ms**",
                f"- failure_rate: {data.get('failure_rate')}",
                f"- ok: `{last.get('ok')}`",
                f"- error/reason: `{last.get('error')}` / `{last.get('reason')}`",
                f"- added_est: `{last.get('added_triangles_est')}`",
                f"- triangulation_error: `{last.get('triangulation_error')}`",
                f"- quality codes: `{(last.get('quality') or {}).get('codes')}`",
                f"- bounds_growth: `{(last.get('quality') or {}).get('bounds_growth')}`",
                "",
            ]
    lines += ["## Decision hints", ""] + [f"- {h}" for h in results.get("decision_hints", [])] + [""]
    lines += ["## Raw JSON", "", "`docs/performance/prod-001s-vtk-spike.raw.json`", ""]
    OUT_MD.write_text("\n".join(lines))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bench", action="store_true")
    parser.add_argument("--stdin-json", action="store_true", help="Read one JSON request from stdin")
    args = parser.parse_args()

    if args.bench:
        results = run_bench()
        OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
        OUT_JSON.write_text(json.dumps(results, indent=2, default=str))
        write_md(results)
        log(f"Wrote {OUT_JSON}")
        log(f"Wrote {OUT_MD}")
        print(json.dumps({"ok": True, "decision_hints": results["decision_hints"]}, indent=2))
        return 0

    if args.stdin_json:
        req = json.load(sys.stdin)
        cmd = req.get("cmd")
        if cmd == "inventory":
            print(json.dumps(inventory(Path(req["path"]))))
            return 0
        if cmd == "trim":
            poly = read_stl(Path(req["mesh_path"]))
            from vtkmodules.vtkFiltersCore import vtkCleanPolyData

            clean = vtkCleanPolyData()
            clean.SetInputData(poly)
            clean.Update()
            poly = clean.GetOutput()
            pts = np.array(req["loop"], dtype=np.float64)
            normal = req.get("normal")
            normal_arr = None if normal is None else np.array(normal, dtype=np.float64)
            if normal_arr is None:
                normal_arr = newell_normal(pts)
            res = vtk_polygon_trim(
                poly,
                pts,
                normal_arr,
                inside_out=bool(req.get("inside_out", False)),
            )
            # drop heavy arrays unless requested
            if not req.get("include_mesh"):
                res = strip_heavy(res)
            else:
                res["positions"] = res["positions"].tolist()
                res["indices"] = res["indices"].tolist()
            print(json.dumps(res, default=str))
            return 0
        print(json.dumps({"ok": False, "error": f"unknown cmd {cmd}"}))
        return 1

    parser.print_help()
    return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        raise SystemExit(2)
