"""Camera-cut detection, rink-marking homography calibration, and world-space enforcement.

Broadcast figure-skating footage pans, zooms, and cuts between cameras. This module:
1. Detects hard camera cuts from decoded FFmpeg frames so velocity/spin math never bridges a cut.
2. Fits a metric homography from known ISU/hockey rink markings (3.0 m center circle,
   4.5 m faceoff circles, or custom corner points) so static/overhead shots convert
   pixels -> real metres for O2 (`trace_radius_m`) and O4 (`glide_decel_ms2`).
3. Fits least-squares circle radii to rectified tracings.
"""

from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

# Known standard rink circle radii (metres) for broadcast calibration.
RINK_MARKINGS: dict[str, dict[str, Any]] = {
    "center_circle": {
        "radius_m": 3.0,
        "world_points_m": [[3.0, 0.0], [0.0, 3.0], [-3.0, 0.0], [0.0, -3.0]],
        "description": "ISU / hockey center ice circle (3.0 m radius; pick East, North, West, South points).",
    },
    "faceoff_circle": {
        "radius_m": 4.5,
        "world_points_m": [[4.5, 0.0], [0.0, 4.5], [-4.5, 0.0], [0.0, -4.5]],
        "description": "Standard hockey end-zone faceoff circle (4.5 m radius; pick East, North, West, South points).",
    },
    "isu_sheet_box": {
        "radius_m": None,
        "world_points_m": [[-15.0, -10.0], [15.0, -10.0], [15.0, 10.0], [-15.0, 10.0]],
        "description": "30 m x 20 m interior reference rectangle on an ISU 60 m x 30 m rink.",
    },
}


@dataclass(frozen=True)
class RinkCalibration:
    marking: str
    homography: list[list[float]]  # 3x3 pixel -> world metres (x, y, 1)
    reprojection_rmse_m: float
    pixel_points: list[list[float]]
    world_points_m: list[list[float]]
    note: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "edgework-rink-calibration/1",
            "marking": self.marking,
            "homography": self.homography,
            "reprojection_rmse_m": round(self.reprojection_rmse_m, 6),
            "pixel_points": self.pixel_points,
            "world_points_m": self.world_points_m,
            "note": self.note,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "RinkCalibration":
        return cls(
            marking=str(data["marking"]),
            homography=[[float(v) for v in row] for row in data["homography"]],
            reprojection_rmse_m=float(data.get("reprojection_rmse_m", 0.0)),
            pixel_points=[[float(v) for v in pt] for pt in data.get("pixel_points", [])],
            world_points_m=[[float(v) for v in pt] for pt in data.get("world_points_m", [])],
            note=str(data.get("note", "")),
        )


def fit_homography(
    pixel_points: list[list[float]] | np.ndarray,
    world_points_m: list[list[float]] | np.ndarray,
    marking: str = "custom",
    note: str = "",
) -> RinkCalibration:
    """Fits a planar homography H mapping (u, v, 1) pixels -> (x_m, y_m, 1) rink metres via normalized DLT."""
    px = np.asarray(pixel_points, dtype=np.float64)
    wd = np.asarray(world_points_m, dtype=np.float64)
    if px.ndim != 2 or px.shape[1] != 2 or wd.shape != px.shape or px.shape[0] < 4:
        raise ValueError("Need at least 4 matching (x, y) pixel and world points to fit a homography.")

    def normalize(pts: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        mean = pts.mean(axis=0)
        shifted = pts - mean
        scale = np.sqrt(2.0) / max(float(np.mean(np.hypot(shifted[:, 0], shifted[:, 1]))), 1e-9)
        t = np.array([[scale, 0.0, -scale * mean[0]], [0.0, scale, -scale * mean[1]], [0.0, 0.0, 1.0]])
        hom = np.column_stack([pts, np.ones(len(pts))])
        normed = (t @ hom.T).T
        return normed[:, :2], t

    px_n, t_px = normalize(px)
    wd_n, t_wd = normalize(wd)

    rows = []
    for (u, v), (x, y) in zip(px_n, wd_n):
        rows.append([-u, -v, -1.0, 0.0, 0.0, 0.0, u * x, v * x, x])
        rows.append([0.0, 0.0, 0.0, -u, -v, -1.0, u * y, v * y, y])
    a = np.asarray(rows, dtype=np.float64)
    _, _, vt = np.linalg.svd(a)
    h_norm = vt[-1].reshape(3, 3)
    h = np.linalg.inv(t_wd) @ h_norm @ t_px
    if abs(h[2, 2]) > 1e-12:
        h = h / h[2, 2]

    # Measure reprojection error in metres.
    errs = []
    for (u, v), (wx, wy) in zip(px, wd):
        mx, my = pixel_to_rink(h, u, v)
        errs.append(float(np.hypot(mx - wx, my - wy)))
    rmse = float(np.sqrt(np.mean(np.square(errs))))
    return RinkCalibration(
        marking=marking,
        homography=h.tolist(),
        reprojection_rmse_m=rmse,
        pixel_points=px.tolist(),
        world_points_m=wd.tolist(),
        note=note,
    )


def pixel_to_rink(homography: list[list[float]] | np.ndarray, u: float, v: float) -> tuple[float, float]:
    h = np.asarray(homography, dtype=np.float64)
    out = h @ np.array([u, v, 1.0], dtype=np.float64)
    if abs(out[2]) < 1e-12:
        raise ValueError("Degenerate homography projection (w ~= 0).")
    return float(out[0] / out[2]), float(out[1] / out[2])


def fit_circle_radius(xy_points: list[tuple[float, float]] | np.ndarray) -> dict[str, float] | None:
    """Least-squares circle fit (Kasa algebraic fit) to 2D ice-plane (x, y) points in metres.

    Returns center, radius_m, residual_rmse_m, and arc_angle_deg — or None if points are collinear.
    """
    pts = np.asarray(xy_points, dtype=np.float64)
    if pts.ndim != 2 or pts.shape[1] != 2 or len(pts) < 5:
        return None
    x = pts[:, 0]
    y = pts[:, 1]
    a = np.column_stack([2.0 * x, 2.0 * y, np.ones(len(pts))])
    b = x * x + y * y
    sol, _, rank, _ = np.linalg.lstsq(a, b, rcond=None)
    if rank < 3:
        return None
    cx, cy, c0 = float(sol[0]), float(sol[1]), float(sol[2])
    r2 = c0 + cx * cx + cy * cy
    if r2 <= 1e-9:
        return None
    radius = float(np.sqrt(r2))
    dists = np.hypot(x - cx, y - cy)
    rmse = float(np.sqrt(np.mean((dists - radius) ** 2)))
    angles = np.unwrap(np.arctan2(y - cy, x - cx))
    arc_deg = float(np.degrees(abs(angles[-1] - angles[0])))
    return {
        "cx_m": round(cx, 4),
        "cy_m": round(cy, 4),
        "radius_m": round(radius, 4),
        "residual_rmse_m": round(rmse, 4),
        "arc_angle_deg": round(arc_deg, 2),
    }


def detect_camera_cuts(
    video_path: Path,
    fps: float = 30.0,
    threshold: float = 28.0,
    thumb_w: int = 96,
    thumb_h: int = 54,
) -> list[int]:
    """Decodes tiny grayscale thumbnails via FFmpeg and returns frame indices where hard camera cuts occur."""
    cmd = [
        "ffmpeg", "-v", "error", "-i", str(video_path),
        "-vf", f"fps={fps},scale={thumb_w}:{thumb_h},format=gray",
        "-f", "rawvideo", "pipe:1",
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg cut detection failed: {proc.stderr.decode('utf-8', 'replace').strip()}")
    frame_bytes = thumb_w * thumb_h
    raw = proc.stdout
    n_frames = len(raw) // frame_bytes
    if n_frames < 2:
        return []
    frames = np.frombuffer(raw[: n_frames * frame_bytes], dtype=np.uint8).reshape(n_frames, frame_bytes).astype(np.float32)
    cuts: list[int] = []
    for i in range(1, n_frames):
        mad = float(np.mean(np.abs(frames[i] - frames[i - 1])))
        if mad >= threshold:
            cuts.append(i)
    return cuts


def load_calibration(path: Path) -> RinkCalibration:
    return RinkCalibration.from_dict(json.loads(path.read_text(encoding="utf-8")))


def save_calibration(cal: RinkCalibration, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cal.to_dict(), indent=2) + "\n", encoding="utf-8")
