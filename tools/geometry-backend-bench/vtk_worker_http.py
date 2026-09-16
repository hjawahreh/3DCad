#!/usr/bin/env python3
"""GEO-001H — persistent VTK geometry worker + CGF1 + local file delivery.

INIT transfers the full mesh ONCE per (session, fingerprint).
Trim results use CGF1 binary frames; optional result_delivery=file stages
the frame on disk so desktop IPC can avoid Chromium HTTP for large bodies.
"""

from __future__ import annotations

import base64
import json
import struct
import sys
import threading
import time
import traceback
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import vtk_clinical_spike as spike  # noqa: E402

HOST = "127.0.0.1"
PORT = int(__import__("os").environ.get("CAD_VTK_WORKER_PORT", "8765"))

_SESSIONS: dict[str, dict[str, Any]] = {}
_SESSIONS_LOCK = threading.RLock()

CGF_MAGIC = 0x43474631  # 'CGF1'
CGF_VERSION = 1
CGF_HEADER_BYTES = 64
CGF_CONTENT_TYPE = "application/vnd.clinical.geometry-frame"


def _align8(n: int) -> int:
    return (n + 7) & ~7


def encode_cgf_frame(
    positions: np.ndarray,
    indices: np.ndarray,
    meta: dict[str, Any],
) -> bytes:
    """Encode Float32 positions + Uint32 indices + small JSON meta as CGF1."""
    pos = np.asarray(positions, dtype=np.float32).reshape(-1)
    idx = np.asarray(indices, dtype=np.uint32).reshape(-1)
    if pos.size % 3 != 0:
        raise ValueError("positions length must be multiple of 3")
    if idx.size % 3 != 0:
        raise ValueError("indices length must be multiple of 3")
    vertex_count = int(pos.size // 3)
    index_count = int(idx.size)
    meta_bytes = json.dumps(meta, separators=(",", ":"), default=str).encode("utf-8")
    meta_len = len(meta_bytes)
    pos_bytes = int(pos.nbytes)
    idx_bytes = int(idx.nbytes)
    nrm_bytes = 0
    positions_offset = _align8(CGF_HEADER_BYTES + meta_len)
    indices_offset = _align8(positions_offset + pos_bytes)
    normals_offset = indices_offset + idx_bytes
    total = indices_offset + idx_bytes

    header = bytearray(CGF_HEADER_BYTES)
    struct.pack_into(">I", header, 0, CGF_MAGIC)
    struct.pack_into("<H", header, 4, CGF_VERSION)
    struct.pack_into("<H", header, 6, 0)  # flags
    struct.pack_into("<I", header, 8, vertex_count)
    struct.pack_into("<I", header, 12, index_count)
    header[16] = 0  # f32
    header[17] = 1  # u32
    struct.pack_into("<H", header, 18, 0)
    struct.pack_into("<I", header, 20, meta_len)
    struct.pack_into("<I", header, 24, pos_bytes)
    struct.pack_into("<I", header, 28, idx_bytes)
    struct.pack_into("<I", header, 32, nrm_bytes)
    struct.pack_into("<I", header, 36, positions_offset)
    struct.pack_into("<I", header, 40, indices_offset)
    struct.pack_into("<I", header, 44, normals_offset)

    out = bytearray(total)
    out[0:CGF_HEADER_BYTES] = header
    out[CGF_HEADER_BYTES : CGF_HEADER_BYTES + meta_len] = meta_bytes
    out[positions_offset : positions_offset + pos_bytes] = pos.tobytes(order="C")
    out[indices_offset : indices_offset + idx_bytes] = idx.tobytes(order="C")
    return bytes(out)


def wants_binary_result(req: dict) -> bool:
    fmt = str(req.get("result_format") or req.get("response_format") or "").lower()
    return fmt in ("binary", "cgf", "cgf1", "geometry-frame")


def wants_file_delivery(req: dict) -> bool:
    return str(req.get("result_delivery") or "").lower() in ("file", "path", "local-file")


def stage_cgf_file(frame: bytes) -> str:
    import tempfile

    dir_path = Path(tempfile.gettempdir()) / "cad-studio-geometry"
    dir_path.mkdir(parents=True, exist_ok=True)
    path = dir_path / f"frame-{uuid.uuid4().hex[:12]}.cgf1"
    path.write_bytes(frame)
    return str(path)


def b64_to_f32(b64: str) -> np.ndarray:
    raw = base64.b64decode(b64)
    return np.frombuffer(raw, dtype=np.float32).copy()


def b64_to_u32(b64: str) -> np.ndarray:
    raw = base64.b64decode(b64)
    return np.frombuffer(raw, dtype=np.uint32).copy()


def f32_to_b64(arr: np.ndarray) -> str:
    return base64.b64encode(np.asarray(arr, dtype=np.float32).tobytes()).decode("ascii")


def u32_to_b64(arr: np.ndarray) -> str:
    return base64.b64encode(np.asarray(arr, dtype=np.uint32).tobytes()).decode("ascii")


def arrays_to_poly(positions: np.ndarray, indices: np.ndarray):
    """Bulk VTK poly construction (avoids per-triangle Python InsertNextCell)."""
    from vtkmodules.vtkCommonCore import vtkPoints
    from vtkmodules.vtkCommonDataModel import vtkPolyData, vtkCellArray
    from vtkmodules.util.numpy_support import numpy_to_vtk, numpy_to_vtkIdTypeArray

    pos = positions.reshape(-1, 3).astype(np.float64, copy=False)
    idx = indices.reshape(-1, 3).astype(np.int64, copy=False)
    n = int(idx.shape[0])
    pd = vtkPolyData()
    pts = vtkPoints()
    pts.SetData(numpy_to_vtk(pos))
    pd.SetPoints(pts)
    cells_np = np.empty(n * 4, dtype=np.int64)
    cells_np[0::4] = 3
    cells_np[1::4] = idx[:, 0]
    cells_np[2::4] = idx[:, 1]
    cells_np[3::4] = idx[:, 2]
    cells = vtkCellArray()
    cells.SetCells(n, numpy_to_vtkIdTypeArray(cells_np))
    pd.SetPolys(cells)
    return pd


def load_poly_from_buffers(req: dict):
    from vtkmodules.vtkFiltersCore import vtkCleanPolyData

    t0 = time.perf_counter()
    if "mesh_path" in req:
        poly = spike.read_stl(Path(req["mesh_path"]))
        decode_ms = 0.0
        clean = vtkCleanPolyData()
        clean.SetInputData(poly)
        clean.Update()
        out = clean.GetOutput()
        return out, {
            "decode_ms": decode_ms,
            "load_poly_ms": (time.perf_counter() - t0) * 1000,
            "vertex_count": int(out.GetNumberOfPoints()),
            "triangle_count": int(out.GetNumberOfCells()),
        }

    positions = b64_to_f32(req["positions_b64"])
    indices = b64_to_u32(req["indices_b64"])
    decode_ms = (time.perf_counter() - t0) * 1000
    t1 = time.perf_counter()
    poly = arrays_to_poly(positions, indices)
    build_ms = (time.perf_counter() - t1) * 1000
    t2 = time.perf_counter()
    clean = vtkCleanPolyData()
    clean.SetInputData(poly)
    clean.Update()
    out = clean.GetOutput()
    return out, {
        "decode_ms": decode_ms,
        "arrays_to_poly_ms": build_ms,
        "clean_ms": (time.perf_counter() - t2) * 1000,
        "load_poly_ms": (time.perf_counter() - t0) * 1000,
        "vertex_count": int(out.GetNumberOfPoints()),
        "triangle_count": int(out.GetNumberOfCells()),
    }


def _fingerprint_mesh(positions: np.ndarray, indices: np.ndarray) -> str:
    h = hash((positions.tobytes()[:4096], positions.size, indices.tobytes()[:4096], indices.size))
    return f"geo:w{abs(h) & 0xFFFFFFFF:08x}"


def init_geometry(req: dict) -> dict:
    t_all = time.perf_counter()
    fp = req.get("geometry_fingerprint") or req.get("mesh_fingerprint")
    if not fp:
        return {
            "ok": False,
            "error": "geometry_fingerprint required",
            "code": "WORKER_SESSION_INVALID",
        }
    if "positions_b64" not in req or "indices_b64" not in req:
        return {"ok": False, "error": "init_geometry requires positions_b64 and indices_b64"}

    object_id = str(req.get("object_id") or req.get("target_object_id") or "mesh")
    case_id = str(req.get("case_id") or "")
    poly, load_timings = load_poly_from_buffers(req)
    positions = b64_to_f32(req["positions_b64"])
    indices = b64_to_u32(req["indices_b64"])

    worker_session_id = str(req.get("worker_session_id") or f"ws-{uuid.uuid4().hex[:12]}")
    with _SESSIONS_LOCK:
        doomed = [
            k
            for k, v in _SESSIONS.items()
            if v.get("object_id") == object_id and k != worker_session_id
        ]
        for k in doomed:
            _SESSIONS.pop(k, None)
        _SESSIONS[worker_session_id] = {
            "worker_session_id": worker_session_id,
            "case_id": case_id,
            "object_id": object_id,
            "geometry_fingerprint": fp,
            "poly": poly,
            "positions": positions,
            "indices": indices,
            "revision": int(req.get("revision") or 1),
            "previews": {},
            "active_preview_id": None,
            "lock": threading.RLock(),
            "busy": False,
            "init_ms": (time.perf_counter() - t_all) * 1000,
            "load_timings": load_timings,
        }

    return {
        "ok": True,
        "worker_session_id": worker_session_id,
        "geometry_fingerprint": fp,
        "vertex_count": int(load_timings.get("vertex_count") or positions.size // 3),
        "triangle_count": int(load_timings.get("triangle_count") or indices.size // 3),
        "capabilities": ["trim", "preview", "accept_preview", "cancel_preview"],
        "timings_ms": {
            "init_total_ms": (time.perf_counter() - t_all) * 1000,
            **{k: float(v) for k, v in load_timings.items() if isinstance(v, (int, float))},
        },
        "mesh_uploaded": True,
    }


def _resolve_session(req: dict) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    sid = req.get("worker_session_id") or req.get("session_id")
    fp = req.get("geometry_fingerprint") or req.get("mesh_fingerprint")
    with _SESSIONS_LOCK:
        if not sid or sid not in _SESSIONS:
            return None, {
                "ok": False,
                "error": "Worker session missing or expired.",
                "code": "WORKER_SESSION_INVALID",
            }
        sess = _SESSIONS[sid]
        if fp and sess.get("geometry_fingerprint") != fp:
            return None, {
                "ok": False,
                "error": "geometry_fingerprint mismatch for worker session.",
                "code": "WORKER_SESSION_INVALID",
                "expected": sess.get("geometry_fingerprint"),
                "got": fp,
            }
        return sess, None


def handle_trim(req: dict) -> dict:
    t_all = time.perf_counter()
    transport: dict[str, Any] = {
        "mesh_resident": False,
        "upload_bytes": 0,
        "mesh_uploaded": False,
    }

    sess = None
    err = None
    if req.get("worker_session_id") or req.get("session_id"):
        sess, err = _resolve_session(req)
        if err is not None:
            if "positions_b64" in req and "indices_b64" in req:
                init = init_geometry(
                    {
                        **req,
                        "worker_session_id": req.get("worker_session_id")
                        or f"ws-{uuid.uuid4().hex[:12]}",
                    }
                )
                if not init.get("ok"):
                    return err
                sess, err = _resolve_session(
                    {**req, "worker_session_id": init["worker_session_id"]}
                )
                transport["cold_start_recovery"] = True
                transport["mesh_uploaded"] = True
                transport["upload_bytes"] = len(req.get("positions_b64", "")) + len(
                    req.get("indices_b64", "")
                )
            else:
                return err

    load_timings: dict[str, float] = {}
    if sess is not None:
        poly = sess["poly"]
        transport["mesh_resident"] = True
        transport["mesh_uploaded"] = False
        load_timings["session_lookup_ms"] = (time.perf_counter() - t_all) * 1000
        worker_session_id = sess["worker_session_id"]
        base_fp = sess["geometry_fingerprint"]
    else:
        poly, load_timings = load_poly_from_buffers(req)
        transport["mesh_uploaded"] = True
        transport["upload_bytes"] = len(req.get("positions_b64", "")) + len(
            req.get("indices_b64", "")
        )
        worker_session_id = None
        base_fp = req.get("geometry_fingerprint") or req.get("mesh_fingerprint")

    pts = np.array(req["loop"], dtype=np.float64)
    normal = req.get("normal")
    normal_arr = None if normal is None else np.array(normal, dtype=np.float64)
    if normal_arr is None:
        normal_arr = spike.newell_normal(pts)

    lock = sess["lock"] if sess is not None else threading.RLock()
    with lock:
        if sess is not None:
            sess["previews"].clear()
            sess["active_preview_id"] = None
            sess["busy"] = True
        try:
            res = spike.vtk_polygon_trim(
                poly,
                pts,
                normal_arr,
                inside_out=bool(req.get("inside_out", False)),
            )
        finally:
            if sess is not None:
                sess["busy"] = False

    timings = dict(res.get("timings_ms") or {})
    timings.update(load_timings)
    timings["request_total_ms"] = (time.perf_counter() - t_all) * 1000

    preview_id = None
    preview_fp = None
    if res.get("ok") and sess is not None and req.get("store_preview", True):
        preview_id = f"pv-{uuid.uuid4().hex[:10]}"
        positions = np.asarray(res["positions"], dtype=np.float32).reshape(-1).copy()
        indices = np.asarray(res["indices"], dtype=np.uint32).reshape(-1).copy()
        preview_fp = _fingerprint_mesh(positions, indices)
        with lock:
            sess["previews"].clear()
            sess["previews"][preview_id] = {
                "preview_id": preview_id,
                "base_geometry_fingerprint": base_fp,
                "preview_geometry_fingerprint": preview_fp,
                "positions": positions,
                "indices": indices,
                "created_at": time.time(),
            }
            sess["active_preview_id"] = preview_id

    out: dict[str, Any] = {k: v for k, v in res.items() if k not in ("positions", "indices")}
    out["timings_ms"] = timings
    out["transport"] = transport
    if worker_session_id:
        out["worker_session_id"] = worker_session_id
    if base_fp:
        out["base_geometry_fingerprint"] = base_fp
    if preview_id:
        out["preview_id"] = preview_id
        out["preview_geometry_fingerprint"] = preview_fp

    if res.get("ok") and req.get("include_mesh") and "positions" in res:
        t_ser = time.perf_counter()
        positions = np.asarray(res["positions"], dtype=np.float32).reshape(-1)
        indices = np.asarray(res["indices"], dtype=np.uint32).reshape(-1)
        if wants_binary_result(req):
            # GEO-001G: binary frame — no JSON/base64 mesh duplication.
            frame_meta = {
                k: v
                for k, v in out.items()
                if k
                not in (
                    "positions",
                    "indices",
                    "positions_b64",
                    "indices_b64",
                )
            }
            if preview_fp:
                frame_meta["geometryFingerprint"] = preview_fp
                frame_meta["previewGeometryFingerprint"] = preview_fp
            if base_fp:
                frame_meta["baseFingerprint"] = base_fp
                frame_meta["base_geometry_fingerprint"] = base_fp
            if preview_id:
                frame_meta["previewId"] = preview_id
            frame = encode_cgf_frame(positions, indices, frame_meta)
            timings["serialize_result_ms"] = (time.perf_counter() - t_ser) * 1000
            timings["request_total_ms"] = (time.perf_counter() - t_all) * 1000
            transport["download_bytes"] = len(frame)
            transport["result_format"] = "binary"
            transport["json_geometry_bytes"] = 0
            transport["binary_geometry_bytes"] = len(frame)
            transport["meta_bytes"] = len(
                json.dumps(frame_meta, separators=(",", ":"), default=str).encode("utf-8")
            )
            if wants_file_delivery(req):
                # GEO-001H: stage CGF1 on local disk; HTTP returns tiny JSON only.
                path = stage_cgf_file(frame)
                transport["result_delivery"] = "file"
                transport["frame_path"] = path
                transport["download_bytes"] = 0
                return {
                    "ok": True,
                    "frame_path": path,
                    "frame_bytes": len(frame),
                    "preview_id": preview_id,
                    "preview_geometry_fingerprint": preview_fp,
                    "base_geometry_fingerprint": base_fp,
                    "worker_session_id": worker_session_id,
                    "transport": transport,
                    "timings_ms": timings,
                    **{
                        k: v
                        for k, v in frame_meta.items()
                        if k
                        not in (
                            "transport",
                            "timings_ms",
                            "positions_b64",
                            "indices_b64",
                        )
                    },
                }
            return {
                "_binary_frame": frame,
                "_content_type": CGF_CONTENT_TYPE,
                "ok": True,
                "transport": transport,
                "timings_ms": timings,
            }
        out["positions_b64"] = f32_to_b64(positions)
        out["indices_b64"] = u32_to_b64(indices)
        timings["serialize_result_ms"] = (time.perf_counter() - t_ser) * 1000
        transport["download_bytes"] = len(out["positions_b64"]) + len(out["indices_b64"])
        transport["result_format"] = "json_b64"
    elif not req.get("include_mesh"):
        return spike.strip_heavy(out)
    return out


def accept_preview(req: dict) -> dict:
    sess, err = _resolve_session(req)
    if err is not None:
        return err
    assert sess is not None
    preview_id = req.get("preview_id")
    expected_base = req.get("expected_base_fingerprint") or req.get("geometry_fingerprint")
    with sess["lock"]:
        if expected_base and sess.get("geometry_fingerprint") != expected_base:
            return {
                "ok": False,
                "error": "expected_base_fingerprint mismatch",
                "code": "WORKER_SESSION_INVALID",
            }
        preview = sess["previews"].get(preview_id) if preview_id else None
        if preview is None and sess.get("active_preview_id"):
            preview = sess["previews"].get(sess["active_preview_id"])
            preview_id = sess.get("active_preview_id")
        if preview is None:
            return {
                "ok": False,
                "error": "preview not found",
                "code": "WORKER_SESSION_INVALID",
            }

        positions = preview["positions"]
        indices = preview["indices"]
        poly, load_timings = load_poly_from_buffers(
            {
                "positions_b64": f32_to_b64(positions),
                "indices_b64": u32_to_b64(indices),
            }
        )
        new_fp = preview["preview_geometry_fingerprint"]
        if isinstance(req.get("promoted_fingerprint"), str) and req["promoted_fingerprint"]:
            new_fp = req["promoted_fingerprint"]

        old_sid = sess["worker_session_id"]
        new_sid = f"ws-{uuid.uuid4().hex[:12]}"
        new_sess = {
            "worker_session_id": new_sid,
            "case_id": sess.get("case_id"),
            "object_id": sess.get("object_id"),
            "geometry_fingerprint": new_fp,
            "poly": poly,
            "positions": positions,
            "indices": indices,
            "revision": int(sess.get("revision") or 1) + 1,
            "previews": {},
            "active_preview_id": None,
            "lock": threading.RLock(),
            "busy": False,
            "init_ms": 0.0,
            "load_timings": load_timings,
        }
        with _SESSIONS_LOCK:
            _SESSIONS.pop(old_sid, None)
            _SESSIONS[new_sid] = new_sess

    return {
        "ok": True,
        "worker_session_id": new_sid,
        "geometry_fingerprint": new_fp,
        "preview_id": preview_id,
        "vertex_count": int(positions.size // 3),
        "triangle_count": int(indices.size // 3),
        "mesh_uploaded": False,
        "promoted": True,
    }


def cancel_preview(req: dict) -> dict:
    sess, err = _resolve_session(req)
    if err is not None:
        return {"ok": True, "cancelled": False, "code": err.get("code")}
    assert sess is not None
    preview_id = req.get("preview_id")
    with sess["lock"]:
        if preview_id and preview_id in sess["previews"]:
            sess["previews"].pop(preview_id, None)
            if sess.get("active_preview_id") == preview_id:
                sess["active_preview_id"] = None
        else:
            sess["previews"].clear()
            sess["active_preview_id"] = None
    return {
        "ok": True,
        "cancelled": True,
        "worker_session_id": sess["worker_session_id"],
        "geometry_fingerprint": sess["geometry_fingerprint"],
        "mesh_uploaded": False,
    }


def release_session(req: dict) -> dict:
    sid = req.get("worker_session_id") or req.get("session_id")
    with _SESSIONS_LOCK:
        if sid:
            _SESSIONS.pop(sid, None)
        else:
            object_id = req.get("object_id")
            if object_id:
                for k in [k for k, v in _SESSIONS.items() if v.get("object_id") == object_id]:
                    _SESSIONS.pop(k, None)
    return {"ok": True, "released": True}


def handle_request(req: dict) -> dict:
    cmd = req.get("cmd")
    if cmd == "health":
        with _SESSIONS_LOCK:
            n = len(_SESSIONS)
        return {
            "ok": True,
            "backend": "vtk",
            "persistent_sessions": n,
            "version": "GEO-001H",
            "binary_geometry_frame": True,
            "local_file_delivery": True,
        }
    if cmd in ("init_geometry", "put_mesh", "initialize_geometry"):
        return init_geometry(req)
    if cmd == "trim":
        return handle_trim(req)
    if cmd == "accept_preview":
        return accept_preview(req)
    if cmd == "cancel_preview":
        return cancel_preview(req)
    if cmd in ("release_session", "invalidate_session"):
        return release_session(req)
    if cmd == "close_base":
        if "positions_b64" in req or "mesh_path" in req:
            poly, _ = load_poly_from_buffers(req)
        else:
            sess, err = _resolve_session(req)
            if err is not None:
                return err
            assert sess is not None
            poly = sess["poly"]
        direction = np.array(req.get("direction") or [0.0, -1.0, 0.0], dtype=np.float64)
        height = float(req.get("height") or spike.clinical_height(list(poly.GetBounds())))
        res = spike.vtk_close_base(
            poly,
            height=height,
            direction=direction,
            prefer=str(req.get("direction_source") or "clinical"),
        )
        if res.get("ok") and req.get("include_mesh") and "positions" in res:
            positions = np.asarray(res["positions"], dtype=np.float32).reshape(-1)
            indices = np.asarray(res["indices"], dtype=np.uint32).reshape(-1)
            out = {k: v for k, v in res.items() if k not in ("positions", "indices")}
            if wants_binary_result(req):
                frame = encode_cgf_frame(positions, indices, out)
                return {
                    "_binary_frame": frame,
                    "_content_type": CGF_CONTENT_TYPE,
                    "ok": True,
                    "transport": {
                        "result_format": "binary",
                        "download_bytes": len(frame),
                        "json_geometry_bytes": 0,
                        "binary_geometry_bytes": len(frame),
                    },
                }
            out["positions_b64"] = f32_to_b64(positions)
            out["indices_b64"] = u32_to_b64(indices)
            return out
        return spike.strip_heavy(res)
    return {"ok": False, "error": f"unknown cmd {cmd}"}


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, Accept",
        )
        self.send_header(
            "Access-Control-Expose-Headers",
            "Content-Type, X-Clinical-Geometry-Format",
        )

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/health"):
            with _SESSIONS_LOCK:
                n = len(_SESSIONS)
            body = json.dumps(
                {
                    "ok": True,
                    "service": "cad-vtk-worker",
                    "port": PORT,
                    "version": "GEO-001H",
                    "persistent_sessions": n,
                    "binary_geometry_frame": True,
                    "local_file_delivery": True,
                }
            ).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length)
        try:
            req = json.loads(raw.decode("utf-8"))
            accept = (self.headers.get("Accept") or "").lower()
            if "geometry-frame" in accept and not req.get("result_format"):
                req["result_format"] = "binary"
            result = handle_request(req)
            code = 200 if result.get("ok", False) or req.get("cmd") == "health" else 400
            if "error" in result and result.get("ok") is False:
                code = 200

            binary = result.get("_binary_frame")
            if isinstance(binary, (bytes, bytearray)):
                body = bytes(binary)
                self.send_response(code)
                self.send_header("Content-Type", CGF_CONTENT_TYPE)
                self.send_header("X-Clinical-Geometry-Format", "cgf1")
                self._cors()
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            # Strip internal markers before JSON encode.
            safe = {k: v for k, v in result.items() if not str(k).startswith("_")}
            body = json.dumps(safe, default=str).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:  # noqa: BLE001
            traceback.print_exc()
            body = json.dumps({"ok": False, "error": str(exc)}).encode("utf-8")
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self._cors()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    def log_message(self, fmt, *args):
        sys.stderr.write("[vtk-worker] " + (fmt % args) + "\n")


def main() -> int:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"VTK clinical worker (GEO-001H local delivery) on http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
