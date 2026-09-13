#!/usr/bin/env python3
"""PROD-001T — local HTTP VTK geometry worker (browser-safe sidecar)."""

from __future__ import annotations

import base64
import json
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

import vtk_clinical_spike as spike  # noqa: E402

HOST = "127.0.0.1"
PORT = int(__import__("os").environ.get("CAD_VTK_WORKER_PORT", "8765"))


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
    from vtkmodules.vtkCommonCore import vtkPoints
    from vtkmodules.vtkCommonDataModel import vtkPolyData, vtkCellArray
    from vtkmodules.util.numpy_support import numpy_to_vtk

    pos = positions.reshape(-1, 3).astype(np.float64)
    idx = indices.reshape(-1, 3).astype(np.int64)
    pd = vtkPolyData()
    pts = vtkPoints()
    pts.SetData(numpy_to_vtk(pos))
    pd.SetPoints(pts)
    cells = vtkCellArray()
    for tri in idx:
        cells.InsertNextCell(3)
        cells.InsertCellPoint(int(tri[0]))
        cells.InsertCellPoint(int(tri[1]))
        cells.InsertCellPoint(int(tri[2]))
    pd.SetPolys(cells)
    return pd


def load_poly(req: dict):
    from vtkmodules.vtkFiltersCore import vtkCleanPolyData

    if "mesh_path" in req:
        poly = spike.read_stl(Path(req["mesh_path"]))
    else:
        positions = b64_to_f32(req["positions_b64"])
        indices = b64_to_u32(req["indices_b64"])
        poly = arrays_to_poly(positions, indices)
    clean = vtkCleanPolyData()
    clean.SetInputData(poly)
    clean.Update()
    return clean.GetOutput()


def handle_request(req: dict) -> dict:
    cmd = req.get("cmd")
    if cmd == "health":
        return {"ok": True, "backend": "vtk", "version": spike.__dict__.get("results", {})}
    if cmd == "trim":
        poly = load_poly(req)
        pts = np.array(req["loop"], dtype=np.float64)
        normal = req.get("normal")
        normal_arr = None if normal is None else np.array(normal, dtype=np.float64)
        if normal_arr is None:
            normal_arr = spike.newell_normal(pts)
        res = spike.vtk_polygon_trim(
            poly,
            pts,
            normal_arr,
            inside_out=bool(req.get("inside_out", False)),
        )
        if res.get("ok") and req.get("include_mesh") and "positions" in res:
            res["positions_b64"] = f32_to_b64(res["positions"].reshape(-1))
            res["indices_b64"] = u32_to_b64(res["indices"].reshape(-1))
            del res["positions"]
            del res["indices"]
        return spike.strip_heavy(res) if not req.get("include_mesh") else {
            k: v for k, v in res.items() if k not in ("positions", "indices")
        }
    if cmd == "close_base":
        poly = load_poly(req)
        direction = np.array(req.get("direction") or [0.0, -1.0, 0.0], dtype=np.float64)
        height = float(req.get("height") or spike.clinical_height(list(poly.GetBounds())))
        res = spike.vtk_close_base(
            poly,
            height=height,
            direction=direction,
            prefer=str(req.get("direction_source") or "clinical"),
        )
        if res.get("ok") and req.get("include_mesh") and "positions" in res:
            out = {k: v for k, v in res.items() if k not in ("positions", "indices")}
            out["positions_b64"] = f32_to_b64(res["positions"].reshape(-1))
            out["indices_b64"] = u32_to_b64(res["indices"].reshape(-1))
            return out
        return spike.strip_heavy(res)
    return {"ok": False, "error": f"unknown cmd {cmd}"}


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.startswith("/health"):
            body = json.dumps({"ok": True, "service": "cad-vtk-worker", "port": PORT}).encode()
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
            result = handle_request(req)
            code = 200 if result.get("ok", False) or req.get("cmd") == "health" else 400
            # still 200 for structured validation failures so client can read error
            if "error" in result and result.get("ok") is False:
                code = 200
            body = json.dumps(result, default=str).encode("utf-8")
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
    print(f"VTK clinical worker listening on http://{HOST}:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
