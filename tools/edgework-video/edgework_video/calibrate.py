"""`edgework-video calibrate` — surveyed ice-plane homography (pure Python stdlib).

Blueprint §4.1, §5.2, §5.3 & §6.1 contract:
  - Never hardcodes rink constants (no 3.0 m circle, no invented 30x20 m box).
  - Requires at least 6 surveyed landmarks (`>= 4 + holdout`, default `holdout=2`)
    so held-out residuals are genuine, never zero by construction.
  - Fits H(image -> ice plane P, Y=0) via Hartley-normalized DLT + least-squares
    normal equations solved by Gaussian elimination with partial pivoting.
  - Enforces Gate B held-out residual threshold (default <= 0.10 m); rejects
    calibration with exit 3 if exceeded or if venue scaleStatus is 'unknown'.
"""

from __future__ import annotations

import datetime as _dt
import json
import math
import os
from pathlib import Path
import time
from typing import Any

from . import EXIT_INVALID_INPUT, EXIT_PRECONDITION_UNMET, EdgeworkVideoError
from .annotate import _validate_safe_id
from .intake import _deterministic_json_bytes, sha256_bytes, verify_take

VALID_CALIB_SCALE_STATUS = frozenset({"surveyed", "rulebook-verified-at-venue"})
DEFAULT_HOLDOUT = 2
DEFAULT_MAX_RESIDUAL_M = 0.10


def _solve_linear(a: list[list[float]], b: list[float]) -> list[float]:
    """Solve n x n linear system Ax = b via Gaussian elimination with partial pivoting."""
    n = len(b)
    mat = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(mat[r][col]))
        if abs(mat[pivot][col]) < 1e-12:
            raise EdgeworkVideoError("Singular or ill-conditioned calibration matrix (collinear landmarks?).", EXIT_INVALID_INPUT)
        mat[col], mat[pivot] = mat[pivot], mat[col]
        piv_val = mat[col][col]
        for j in range(col, n + 1):
            mat[col][j] /= piv_val
        for r in range(n):
            if r == col:
                continue
            factor = mat[r][col]
            if factor != 0.0:
                for j in range(col, n + 1):
                    mat[r][j] -= factor * mat[col][j]
    return [mat[i][n] for i in range(n)]


def _normalize_points(pts: list[tuple[float, float]]) -> tuple[list[tuple[float, float]], list[list[float]]]:
    """Hartley isotropic normalization: zero mean, mean distance sqrt(2)."""
    n = len(pts)
    mx = sum(p[0] for p in pts) / n
    my = sum(p[1] for p in pts) / n
    mean_d = sum(math.hypot(p[0] - mx, p[1] - my) for p in pts) / n
    if mean_d < 1e-9:
        raise EdgeworkVideoError("Degenerate landmark set (all points coincide).", EXIT_INVALID_INPUT)
    s = math.sqrt(2.0) / mean_d
    normed = [((p[0] - mx) * s, (p[1] - my) * s) for p in pts]
    t_mat = [
        [s, 0.0, -s * mx],
        [0.0, s, -s * my],
        [0.0, 0.0, 1.0],
    ]
    return normed, t_mat


def _mat3_mul(a: list[list[float]], b: list[list[float]]) -> list[list[float]]:
    return [
        [sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)]
        for i in range(3)
    ]


def _mat3_inv(m: list[list[float]]) -> list[list[float]]:
    a, b, c = m[0]
    d, e, f = m[1]
    g, h, i = m[2]
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    if abs(det) < 1e-12:
        raise EdgeworkVideoError("Non-invertible 3x3 matrix in calibration.", EXIT_INVALID_INPUT)
    return [
        [(e * i - f * h) / det, (c * h - b * i) / det, (b * f - c * e) / det],
        [(f * g - d * i) / det, (a * i - c * g) / det, (c * d - a * f) / det],
        [(d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det],
    ]


def _mat3_det(m: list[list[float]]) -> float:
    a, b, c = m[0]
    d, e, f = m[1]
    g, h, i = m[2]
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)


def fit_homography(
    img_pts: list[tuple[float, float]],
    plane_pts: list[tuple[float, float]],
) -> list[list[float]]:
    """Fit 3x3 homography H mapping image (u, v) -> ice plane (x, z)."""
    if len(img_pts) != len(plane_pts) or len(img_pts) < 4:
        raise EdgeworkVideoError("Homography fit requires at least 4 point pairs.", EXIT_INVALID_INPUT)

    u_norm, t_img = _normalize_points(img_pts)
    x_norm, t_plane = _normalize_points(plane_pts)

    # Normal equations (A^T A) h = A^T b for the 8 unknowns [h0..h7] with h8 = 1.
    ata = [[0.0] * 8 for _ in range(8)]
    atb = [0.0] * 8
    for (u, v), (x, z) in zip(u_norm, x_norm):
        rows = (
            ([u, v, 1.0, 0.0, 0.0, 0.0, -x * u, -x * v], x),
            ([0.0, 0.0, 0.0, u, v, 1.0, -z * u, -z * v], z),
        )
        for row, rhs in rows:
            for i in range(8):
                ri = row[i]
                if ri == 0.0:
                    continue
                atb[i] += ri * rhs
                for j in range(8):
                    ata[i][j] += ri * row[j]

    h = _solve_linear(ata, atb)
    h_norm = [
        [h[0], h[1], h[2]],
        [h[3], h[4], h[5]],
        [h[6], h[7], 1.0],
    ]
    h_world = _mat3_mul(_mat3_mul(_mat3_inv(t_plane), h_norm), t_img)
    scale = h_world[2][2]
    if abs(scale) < 1e-12:
        raise EdgeworkVideoError("Homography degenerate (H[2][2] == 0).", EXIT_INVALID_INPUT)
    return [[round(v / scale, 12) for v in row] for row in h_world]


def project_image_to_ice(h_mat: list[list[float]], u: float, v: float) -> tuple[float, float]:
    """Project an image pixel (u, v) on the ice surface to ice-plane metres (x, z)."""
    w = h_mat[2][0] * u + h_mat[2][1] * v + h_mat[2][2]
    if abs(w) < 1e-9:
        raise EdgeworkVideoError("Image point maps to horizon (w == 0).", EXIT_INVALID_INPUT)
    x = (h_mat[0][0] * u + h_mat[0][1] * v + h_mat[0][2]) / w
    z = (h_mat[1][0] * u + h_mat[1][1] * v + h_mat[1][2]) / w
    return (x, z)


def run_calibrate(
    take_dir: Path,
    shot_id: str,
    venue_path: Path,
    landmarks_path: Path,
    holdout: int = DEFAULT_HOLDOUT,
    max_residual_m: float = DEFAULT_MAX_RESIDUAL_M,
) -> Path:
    """Fit and hold-out-validate an ice-plane homography, writing `shots/<SHOT>/calib/camera.json`."""
    t0 = time.monotonic()
    _validate_safe_id(shot_id, "shot")
    verify_take(take_dir)

    if holdout < 2:
        raise EdgeworkVideoError(
            "holdout must be >= 2 so calibration residuals are independently validated (Blueprint §4.1).",
            EXIT_INVALID_INPUT,
        )

    for p, label in ((venue_path, "Venue"), (landmarks_path, "Landmarks")):
        if not p.is_file():
            raise EdgeworkVideoError(f"{label} file not found: {p}", EXIT_INVALID_INPUT)

    try:
        venue = json.loads(venue_path.read_text(encoding="utf-8"))
        picks_doc = json.loads(landmarks_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise EdgeworkVideoError(f"Could not parse calibration JSON: {exc}", EXIT_INVALID_INPUT) from exc

    scale_status = venue.get("scaleStatus")
    if scale_status not in VALID_CALIB_SCALE_STATUS:
        raise EdgeworkVideoError(
            f"Venue scaleStatus '{scale_status}' is not calibrated (must be 'surveyed' or 'rulebook-verified-at-venue').",
            EXIT_PRECONDITION_UNMET,
        )
    scale_source = str(venue.get("scaleSource") or "").strip()
    if not scale_source:
        raise EdgeworkVideoError("Venue JSON requires a non-empty 'scaleSource'.", EXIT_INVALID_INPUT)

    venue_lm = venue.get("landmarks")
    picks = picks_doc.get("picks")
    if not isinstance(venue_lm, dict) or not isinstance(picks, dict):
        raise EdgeworkVideoError("venue.landmarks and picks.picks must be JSON objects.", EXIT_INVALID_INPUT)

    matched_ids = sorted(k for k in picks if k in venue_lm)
    min_needed = 4 + holdout
    if len(matched_ids) < min_needed:
        raise EdgeworkVideoError(
            f"Calibration requires at least {min_needed} matched landmarks (4 fit + {holdout} holdout; found {len(matched_ids)}).",
            EXIT_PRECONDITION_UNMET,
        )

    explicit_holdout = picks_doc.get("holdoutIds")
    if isinstance(explicit_holdout, list) and len(explicit_holdout) >= holdout:
        holdout_ids = [k for k in explicit_holdout if k in matched_ids]
        if len(holdout_ids) < holdout:
            raise EdgeworkVideoError("holdoutIds did not match enough landmarks.", EXIT_INVALID_INPUT)
    else:
        holdout_ids = matched_ids[-holdout:]
    train_ids = [k for k in matched_ids if k not in holdout_ids]
    if len(train_ids) < 4:
        raise EdgeworkVideoError("Need at least 4 non-holdout landmarks to fit homography.", EXIT_PRECONDITION_UNMET)

    def _pair(lid: str) -> tuple[tuple[float, float], tuple[float, float]]:
        uv = picks[lid]
        xz = venue_lm[lid]
        return ((float(uv[0]), float(uv[1])), (float(xz[0]), float(xz[1])))

    train_img, train_plane = zip(*(_pair(k) for k in train_ids))
    hold_img, hold_plane = zip(*(_pair(k) for k in holdout_ids))

    h_train = fit_homography(list(train_img), list(train_plane))

    holdout_residuals: dict[str, float] = {}
    for lid, (u, v), (x, z) in zip(holdout_ids, hold_img, hold_plane):
        px, pz = project_image_to_ice(h_train, u, v)
        holdout_residuals[lid] = round(math.hypot(px - x, pz - z), 6)

    max_res = max(holdout_residuals.values())
    rmse = round(math.sqrt(sum(r * r for r in holdout_residuals.values()) / len(holdout_residuals)), 6)
    accepted = max_res <= max_residual_m

    # Fit final homography on all matched landmarks once holdout check is computed.
    all_img, all_plane = zip(*(_pair(k) for k in matched_ids))
    h_final = fit_homography(list(all_img), list(all_plane))

    calib_doc: dict[str, Any] = {
        "schema": "edgework-calibration/1",
        "shot": shot_id,
        "venueId": str(venue.get("venueId") or "unknown"),
        "frameIndex": int(picks_doc.get("frameIndex", 0)),
        "scaleStatus": scale_status,
        "scaleSource": scale_source,
        "status": "accepted" if accepted else "rejected",
        "maxResidualThresholdM": max_residual_m,
        "trainLandmarks": train_ids,
        "holdoutLandmarks": holdout_ids,
        "holdoutResidualsM": holdout_residuals,
        "holdoutRmseM": rmse,
        "maxHoldoutResidualM": max_res,
        "homographyImageToIce": h_final,
        "det": round(_mat3_det(h_final), 12),
    }

    out_bytes = _deterministic_json_bytes(calib_doc)
    calib_dir = take_dir / "shots" / shot_id / "calib"
    logs_dir = take_dir / "logs"
    calib_dir.mkdir(parents=True, exist_ok=True)
    logs_dir.mkdir(parents=True, exist_ok=True)

    out_path = calib_dir / "camera.json"
    out_path.write_bytes(out_bytes)

    elapsed_ms = round((time.monotonic() - t0) * 1000.0, 2)
    utc_now = _dt.datetime.now(_dt.timezone.utc)
    run_id = f"calibrate-{utc_now.strftime('%Y%m%dT%H%M%SZ')}-{os.getpid()}"
    run_log = {
        "runId": run_id,
        "command": "calibrate",
        "utc": utc_now.isoformat(),
        "elapsedMs": elapsed_ms,
        "shot": shot_id,
        "status": calib_doc["status"],
        "holdoutRmseM": rmse,
        "maxHoldoutResidualM": max_res,
        "outputSha256": sha256_bytes(out_bytes),
    }
    (logs_dir / f"{run_id}.json").write_bytes(_deterministic_json_bytes(run_log))

    if not accepted:
        raise EdgeworkVideoError(
            f"Calibration rejected: max held-out residual {max_res:.4f} m exceeds Gate B limit {max_residual_m:.4f} m.",
            EXIT_PRECONDITION_UNMET,
        )
    return out_path
