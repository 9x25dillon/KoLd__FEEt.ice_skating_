"""edgework-wireframe/1 schema, joint mappers (SMPL-24 / COCO-17 / MediaPipe-33), and validation.

Matches `tools/ice-lab/game/motion/wireframe.ts` joint names and bone edges byte-for-byte.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

from .constants import WIREFRAME_BONES, WIREFRAME_JOINTS, WIREFRAME_SCHEMA

# Standard 24-joint SMPL skeleton indices (used by GVHMR, WHAM, 4D-Humans / HMR2.0).
SMPL24_MAP: dict[str, int] = {
    "pelvis": 0,
    "hipL": 1,
    "hipR": 2,
    "kneeL": 4,
    "kneeR": 5,
    "ankleL": 7,
    "ankleR": 8,
    "chest": 9,
    "toeL": 10,
    "toeR": 11,
    "neck": 12,
    "crown": 15,
    "shoulderL": 16,
    "shoulderR": 17,
    "elbowL": 18,
    "elbowR": 19,
    "wristL": 20,
    "wristR": 21,
}

# Standard 17-joint COCO keypoints (ViTPose / RTMPose). Pelvis/chest/neck are derived midpoints.
COCO17_DIRECT: dict[str, int] = {
    "crown": 0,      # nose proxy (shifted slightly up when chest/neck exist)
    "shoulderL": 5,
    "shoulderR": 6,
    "elbowL": 7,
    "elbowR": 8,
    "wristL": 9,
    "wristR": 10,
    "hipL": 11,
    "hipR": 12,
    "kneeL": 13,
    "kneeR": 14,
    "ankleL": 15,
    "ankleR": 16,
}

# MediaPipe Pose 33-landmark indices.
MEDIAPIPE33_DIRECT: dict[str, int] = {
    "crown": 0,
    "shoulderL": 11,
    "shoulderR": 12,
    "elbowL": 13,
    "elbowR": 14,
    "wristL": 15,
    "wristR": 16,
    "hipL": 23,
    "hipR": 24,
    "kneeL": 25,
    "kneeR": 26,
    "ankleL": 27,
    "ankleR": 28,
    "toeL": 31,
    "toeR": 32,
}


def _pt(arr: np.ndarray, idx: int) -> list[float]:
    v = arr[idx]
    return [round(float(v[0]), 6), round(float(v[1]), 6), round(float(v[2]), 6)]


def _mid(a: list[float], b: list[float]) -> list[float]:
    return [round((a[0] + b[0]) * 0.5, 6), round((a[1] + b[1]) * 0.5, 6), round((a[2] + b[2]) * 0.5, 6)]


def map_joints_frame(
    xyz: np.ndarray,
    layout: str,
    conf: np.ndarray | None = None,
) -> tuple[dict[str, list[float]], dict[str, float]]:
    """Maps one frame of (N, 3) 3D joints into EDGEWORK's 18-joint dictionary + confidence map."""
    joints: dict[str, list[float]] = {}
    scores: dict[str, float] = {}

    def score_of(idx: int) -> float:
        if conf is None or idx >= len(conf):
            return 1.0
        val = float(conf[idx])
        return max(0.0, min(1.0, val)) if np.isfinite(val) else 0.0

    if layout == "edgework18":
        if xyz.shape[0] < len(WIREFRAME_JOINTS):
            raise ValueError(f"edgework18 needs >=18 joints, got {xyz.shape[0]}")
        for i, name in enumerate(WIREFRAME_JOINTS):
            if np.all(np.isfinite(xyz[i])):
                joints[name] = _pt(xyz, i)
                scores[name] = round(score_of(i), 4)
        return joints, scores

    if layout == "smpl24":
        if xyz.shape[0] < 22:
            raise ValueError(f"smpl24 needs >=22 joints, got {xyz.shape[0]}")
        for name, idx in SMPL24_MAP.items():
            if np.all(np.isfinite(xyz[idx])):
                joints[name] = _pt(xyz, idx)
                scores[name] = round(score_of(idx), 4)
        return joints, scores

    if layout in ("coco17", "mp33"):
        table = COCO17_DIRECT if layout == "coco17" else MEDIAPIPE33_DIRECT
        for name, idx in table.items():
            if idx < xyz.shape[0] and np.all(np.isfinite(xyz[idx])):
                joints[name] = _pt(xyz, idx)
                scores[name] = round(score_of(idx), 4)
        if "hipL" in joints and "hipR" in joints:
            joints["pelvis"] = _mid(joints["hipL"], joints["hipR"])
            scores["pelvis"] = round(min(scores["hipL"], scores["hipR"]), 4)
        if "shoulderL" in joints and "shoulderR" in joints:
            sh_mid = _mid(joints["shoulderL"], joints["shoulderR"])
            joints["neck"] = sh_mid
            scores["neck"] = round(min(scores["shoulderL"], scores["shoulderR"]), 4)
            if "pelvis" in joints:
                # Chest sits 80% of the way from pelvis to shoulder midpoint.
                p = joints["pelvis"]
                joints["chest"] = [
                    round(p[0] + 0.8 * (sh_mid[0] - p[0]), 6),
                    round(p[1] + 0.8 * (sh_mid[1] - p[1]), 6),
                    round(p[2] + 0.8 * (sh_mid[2] - p[2]), 6),
                ]
                scores["chest"] = round(min(scores["pelvis"], scores["neck"]), 4)
        return joints, scores

    raise ValueError(f"Unknown skeleton layout: {layout!r} (expected edgework18, smpl24, coco17, or mp33)")


def to_yup(vec: list[float] | np.ndarray, coord_space: str) -> np.ndarray:
    """Converts world-zup to EDGEWORK/Godot right-handed Y-up; matches wireframe.ts toYUp()."""
    x, y, z = float(vec[0]), float(vec[1]), float(vec[2])
    if coord_space == "world-zup":
        return np.array([x, z, -y], dtype=np.float64)
    return np.array([x, y, z], dtype=np.float64)


def validate_sequence(seq: dict[str, Any]) -> list[str]:
    """Structural check matching tools/ice-lab/game/motion/wireframe.ts validateWireframeSequence."""
    issues: list[str] = []
    if seq.get("schema") != WIREFRAME_SCHEMA:
        issues.append(f"expected schema {WIREFRAME_SCHEMA}")
    if not seq.get("id"):
        issues.append("missing sequence id")
    meta = seq.get("meta")
    if not isinstance(meta, dict) or not (isinstance(meta.get("fps"), (int, float)) and meta["fps"] > 0):
        issues.append("meta.fps must be positive")
    elif meta.get("coordSpace") not in ("skater-local", "world-yup", "world-zup"):
        issues.append(f"invalid meta.coordSpace: {meta.get('coordSpace')!r}")
    frames = seq.get("frames")
    if not isinstance(frames, list) or len(frames) == 0:
        issues.append("frames must be non-empty")
    else:
        prev_t = -1e18
        for i, f in enumerate(frames):
            t = f.get("t")
            if not isinstance(t, (int, float)) or t <= prev_t:
                issues.append(f"frame {i} timestamp {t!r} not strictly increasing")
                break
            prev_t = float(t)
    return issues


def write_wireframe_json(seq: dict[str, Any], path: Path) -> None:
    issues = validate_sequence(seq)
    if issues:
        raise ValueError("Cannot write invalid wireframe sequence: " + "; ".join(issues))
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(seq, indent=2) + "\n", encoding="utf-8")
