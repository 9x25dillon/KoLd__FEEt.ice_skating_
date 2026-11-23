"""Python `edgework-wireframe/1` reader and Pose / Clip / Track translator.

Implements all six Blueprint §2 & §3.3 fixes with Python's standard library only:
  1. Strict confidence mode: every joint used must have an explicit numeric score
     in `frame.confidence` (missing confidence is rejected, never defaulted to 1.0).
  2. `mirrored` handling: when `mirrored=True`, negates world X and swaps L/R labels
     before basis construction; when `"unknown"`, flags chirality unavailable.
  3. Heading continuity + L/R swap detection (>120° single-frame jump tests swapped
     labelling) + fast-rotation aliasing (>90°/frame rejects frame as `heading-ambiguous`).
  4. Degenerate-basis rule: `|h_perp| < 0.5 * |h|` holds last valid heading for at most
     2 consecutive frames (authored, Blueprint §3.3), then rejects until valid again.
  5. Cosmetic mask isolation: `arms-head` emits ONLY the 5 cosmetic `arms` layer fields
     (`upperArmL`, `forearmL`, `upperArmR`, `forearmR`, `head`). `upper-body` is rejected.
  6. Pelvis-to-leg-length ratio retargeting for Track baking across rigs.
"""

from __future__ import annotations

import datetime as _dt
import json
import math
import os
from pathlib import Path
import statistics
import time
from typing import Any

from . import EXIT_INVALID_INPUT, EdgeworkVideoError
from .intake import _deterministic_json_bytes, sha256_bytes
from .schemas import validate_wireframe_export

Vec3 = tuple[float, float, float]

TWIST_LIMIT_DEG = 60.0
DEFAULT_RIG = {
    "thigh": 0.4105,
    "shin": 0.3755,
    "ankleHeight": 0.105,
}
DEFAULT_LEG_LENGTH = DEFAULT_RIG["thigh"] + DEFAULT_RIG["shin"]  # 0.786 m

ARMS_HEAD_SEGMENTS = frozenset({"upperArmL", "forearmL", "upperArmR", "forearmR", "head"})
VALID_MASKS = frozenset({"arms-head", "full"})
MAX_DEGENERATE_HOLD = 2  # authored, Blueprint §3.3

# Segment parent -> child mapping over the 18 EDGEWORK joints (Blueprint §3.3).
SEGMENT_JOINTS: tuple[tuple[str, str, str], ...] = (
    ("trunk", "pelvis", "chest"),
    ("head", "neck", "crown"),
    ("upperArmL", "shoulderL", "elbowL"),
    ("forearmL", "elbowL", "wristL"),
    ("upperArmR", "shoulderR", "elbowR"),
    ("forearmR", "elbowR", "wristR"),
    ("thighL", "hipL", "kneeL"),
    ("shinL", "kneeL", "ankleL"),
    ("footL", "ankleL", "toeL"),
    ("thighR", "hipR", "kneeR"),
    ("shinR", "kneeR", "ankleR"),
    ("footR", "ankleR", "toeR"),
)

LR_PAIRS: tuple[tuple[str, str], ...] = (
    ("hipL", "hipR"),
    ("kneeL", "kneeR"),
    ("ankleL", "ankleR"),
    ("toeL", "toeR"),
    ("shoulderL", "shoulderR"),
    ("elbowL", "elbowR"),
    ("wristL", "wristR"),
)


def _sub(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _dot(a: Vec3, b: Vec3) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _cross(a: Vec3, b: Vec3) -> Vec3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _norm_len(v: Vec3) -> float:
    return math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])


def _normalize(v: Vec3) -> Vec3 | None:
    length = _norm_len(v)
    if length < 1e-12:
        return None
    return (v[0] / length, v[1] / length, v[2] / length)


def _det3(r: Vec3, u: Vec3, b: Vec3) -> float:
    return _dot(r, _cross(u, b))


def _swap_lr_joints(joints: dict[str, Vec3], conf: dict[str, float]) -> tuple[dict[str, Vec3], dict[str, float]]:
    j_out = dict(joints)
    c_out = dict(conf)
    for left, right in LR_PAIRS:
        has_l, has_r = left in joints, right in joints
        if has_l:
            j_out[right] = joints[left]
            c_out[right] = conf[left]
        else:
            j_out.pop(right, None)
            c_out.pop(right, None)
        if has_r:
            j_out[left] = joints[right]
            c_out[left] = conf[right]
        else:
            j_out.pop(left, None)
            c_out.pop(left, None)
    return j_out, c_out


def _mirror_world_joints(joints: dict[str, Vec3], conf: dict[str, float]) -> tuple[dict[str, Vec3], dict[str, float]]:
    flipped = {k: (-v[0], v[1], v[2]) for k, v in joints.items()}
    return _swap_lr_joints(flipped, conf)


def _build_basis(
    joints: dict[str, Vec3],
    conf: dict[str, float],
    min_conf: float,
) -> tuple[tuple[Vec3, Vec3, Vec3] | None, str, str | None]:
    """Build right-handed skater basis R_ws = (right, up, back) in world +Y up."""
    up: Vec3 = (0.0, 1.0, 0.0)
    source = "hips"
    if (
        "hipL" in joints
        and "hipR" in joints
        and conf.get("hipL", -1.0) >= min_conf
        and conf.get("hipR", -1.0) >= min_conf
    ):
        h = _sub(joints["hipR"], joints["hipL"])
    elif (
        "shoulderL" in joints
        and "shoulderR" in joints
        and conf.get("shoulderL", -1.0) >= min_conf
        and conf.get("shoulderR", -1.0) >= min_conf
    ):
        h = _sub(joints["shoulderR"], joints["shoulderL"])
        source = "shoulders"
    else:
        return None, "missing", "basis-missing"

    h_len = _norm_len(h)
    if h_len < 1e-6:
        return None, source, "basis-degenerate"

    h_dot_up = _dot(h, up)
    h_perp = (h[0] - h_dot_up * up[0], h[1] - h_dot_up * up[1], h[2] - h_dot_up * up[2])
    h_perp_len = _norm_len(h_perp)
    if h_perp_len < 0.5 * h_len:
        return None, source, "basis-degenerate"

    right = (h_perp[0] / h_perp_len, h_perp[1] / h_perp_len, h_perp[2] / h_perp_len)
    back = _cross(right, up)
    det = _det3(right, up, back)
    if abs(det - 1.0) > 1e-6:
        return None, source, "basis-invalid"
    # Orthonormality check
    cols = (right, up, back)
    for i in range(3):
        for j in range(3):
            expected = 1.0 if i == j else 0.0
            if abs(_dot(cols[i], cols[j]) - expected) > 1e-6:
                return None, source, "basis-invalid"

    return (right, up, back), source, None


def _to_local(v: Vec3, basis: tuple[Vec3, Vec3, Vec3]) -> Vec3:
    right, up, back = basis
    return (_dot(v, right), _dot(v, up), _dot(v, back))


def _angle_diff_rad(a: float, b: float) -> float:
    return math.atan2(math.sin(a - b), math.cos(a - b))


def _compute_segment_medians(frames: list[dict[str, Any]], min_conf: float) -> dict[str, float]:
    lengths: dict[str, list[float]] = {seg: [] for seg, _, _ in SEGMENT_JOINTS}
    for fr in frames:
        jmap = fr["joints"]
        cmap = fr["confidence"]
        for seg, parent, child in SEGMENT_JOINTS:
            if (
                parent in jmap
                and child in jmap
                and cmap.get(parent, -1.0) >= min_conf
                and cmap.get(child, -1.0) >= min_conf
            ):
                p = tuple(float(x) for x in jmap[parent])
                c = tuple(float(x) for x in jmap[child])
                d = _norm_len(_sub(c, p))
                if d > 1e-5:
                    lengths[seg].append(d)
    return {seg: statistics.median(vals) for seg, vals in lengths.items() if vals}


def _extract_segments(
    joints: dict[str, Vec3],
    conf: dict[str, float],
    basis: tuple[Vec3, Vec3, Vec3],
    medians: dict[str, float],
    min_conf: float,
    allowed: frozenset[str] | None = None,
) -> tuple[dict[str, list[float]], list[str]]:
    seg_out: dict[str, list[float]] = {}
    dropped: list[str] = []
    for seg, parent, child in SEGMENT_JOINTS:
        if allowed is not None and seg not in allowed:
            continue
        if parent not in joints or child not in joints:
            continue
        if conf.get(parent, -1.0) < min_conf or conf.get(child, -1.0) < min_conf:
            continue
        diff = _sub(joints[child], joints[parent])
        length = _norm_len(diff)
        floor = max(1e-4, 0.1 * medians.get(seg, 0.0))
        if length < floor:
            dropped.append(f"{seg}:zero-length")
            continue
        local = _to_local(diff, basis)
        unit = _normalize(local)
        if unit is not None:
            seg_out[seg] = [round(unit[0], 6), round(unit[1], 6), round(unit[2], 6)]
    return seg_out, dropped


def _segment_distance(a: dict[str, list[float]], b: dict[str, list[float]]) -> float:
    common = [k for k in a if k in b]
    if not common:
        return 0.0
    total = 0.0
    for k in common:
        va, vb = a[k], b[k]
        dot = max(-1.0, min(1.0, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]))
        total += 1.0 - dot
    return total / len(common)


def _compute_twist_deg(
    joints: dict[str, Vec3],
    conf: dict[str, float],
    basis: tuple[Vec3, Vec3, Vec3],
    trunk_local: list[float] | None,
    min_conf: float,
) -> float | None:
    if (
        trunk_local is None
        or "shoulderL" not in joints
        or "shoulderR" not in joints
        or conf.get("shoulderL", -1.0) < min_conf
        or conf.get("shoulderR", -1.0) < min_conf
    ):
        return None
    sh_world = _sub(joints["shoulderR"], joints["shoulderL"])
    sh_local = _to_local(sh_world, basis)
    t: Vec3 = (trunk_local[0], trunk_local[1], trunk_local[2])
    # Project shoulder line and pelvis-right (1, 0, 0) perpendicular to trunk.
    sh_dot_t = _dot(sh_local, t)
    sh_perp = _normalize((sh_local[0] - sh_dot_t * t[0], sh_local[1] - sh_dot_t * t[1], sh_local[2] - sh_dot_t * t[2]))
    r_dot_t = t[0]
    r_perp = _normalize((1.0 - r_dot_t * t[0], -r_dot_t * t[1], -r_dot_t * t[2]))
    if sh_perp is None or r_perp is None:
        return None
    cos_a = max(-1.0, min(1.0, _dot(r_perp, sh_perp)))
    # Positive twist takes right shoulder back (+z), which is negative rotation around +trunk.
    sin_a = -_dot(_cross(r_perp, sh_perp), t)
    deg = math.degrees(math.atan2(sin_a, cos_a))
    return round(max(-TWIST_LIMIT_DEG, min(TWIST_LIMIT_DEG, deg)), 3)


def translate_wireframe(
    wireframe: dict[str, Any],
    *,
    mask: str = "arms-head",
    min_conf: float = 0.5,
    strict_confidence: bool = True,
    target_rig: dict[str, float] | None = None,
) -> dict[str, Any]:
    """Translate a validated `edgework-wireframe/1` document into Clip + Track + QA report."""
    if mask not in VALID_MASKS:
        raise EdgeworkVideoError(
            f"Unsupported mask '{mask}'. Cosmetic video motion allows only 'arms-head' (or 'full' for showcase Track); 'upper-body' is forbidden.",
            EXIT_INVALID_INPUT,
        )

    errors = validate_wireframe_export(wireframe)
    if errors:
        raise EdgeworkVideoError(f"Invalid wireframe export: {'; '.join(errors)}", EXIT_INVALID_INPUT)

    rig = target_rig or DEFAULT_RIG
    target_leg_length = float(rig["thigh"]) + float(rig["shin"])
    target_ankle = float(rig["ankleHeight"])

    ext = wireframe["meta"]["ext"]
    mirrored = ext.get("mirrored", False)
    raw_frames = wireframe["frames"]

    # Pre-check strict confidence & build clean Vec3 maps.
    cleaned: list[tuple[float, dict[str, Vec3], dict[str, float]]] = []
    for i, fr in enumerate(raw_frames):
        jmap: dict[str, Vec3] = {}
        cmap: dict[str, float] = {}
        for jname, coords in fr["joints"].items():
            if jname not in fr["confidence"]:
                if strict_confidence:
                    raise EdgeworkVideoError(
                        f"Frame {i}: joint '{jname}' missing explicit confidence score.",
                        EXIT_INVALID_INPUT,
                    )
                continue
            jmap[jname] = (float(coords[0]), float(coords[1]), float(coords[2]))
            cmap[jname] = float(fr["confidence"][jname])
        if mirrored is True:
            jmap, cmap = _mirror_world_joints(jmap, cmap)
        cleaned.append((float(fr["t"]), jmap, cmap))

    medians = _compute_segment_medians(raw_frames, min_conf)
    source_leg = (
        0.5 * (medians.get("thighL", medians.get("thighR", 0.0)) + medians.get("thighR", medians.get("thighL", 0.0)))
        + 0.5 * (medians.get("shinL", medians.get("shinR", 0.0)) + medians.get("shinR", medians.get("shinL", 0.0)))
    )
    if source_leg < 0.2:
        source_leg = DEFAULT_LEG_LENGTH

    allowed = ARMS_HEAD_SEGMENTS if mask == "arms-head" else None

    keys: list[dict[str, Any]] = []
    frame_flags: list[dict[str, Any]] = []
    pelvis_ratios: list[float] = []

    last_basis: tuple[Vec3, Vec3, Vec3] | None = None
    last_psi: float | None = None
    last_seg: dict[str, list[float]] | None = None
    degenerate_streak = 0
    t0 = cleaned[0][0]

    for idx, (t_pts, jmap, cmap) in enumerate(cleaned):
        basis, basis_src, basis_err = _build_basis(jmap, cmap, min_conf)
        lr_swap_status: str | None = None

        if basis is None:
            if basis_err == "basis-degenerate" and last_basis is not None and degenerate_streak < MAX_DEGENERATE_HOLD:
                degenerate_streak += 1
                basis = last_basis
                basis_src = "held-degenerate"
            else:
                degenerate_streak += 1
                frame_flags.append({"index": idx, "t": t_pts, "rejected": True, "reason": basis_err or "basis-invalid"})
                continue
        else:
            degenerate_streak = 0
            psi = math.atan2(basis[0][2], basis[0][0])
            if last_psi is not None:
                d_psi = abs(_angle_diff_rad(psi, last_psi))
                if d_psi > math.radians(120.0):
                    # Test L/R swap and keep whichever changes segment directions less.
                    swapped_j, swapped_c = _swap_lr_joints(jmap, cmap)
                    sw_basis, sw_src, sw_err = _build_basis(swapped_j, swapped_c, min_conf)
                    if sw_basis is not None and sw_err is None and last_seg is not None:
                        orig_seg, _ = _extract_segments(jmap, cmap, basis, medians, min_conf, allowed)
                        swap_seg, _ = _extract_segments(swapped_j, swapped_c, sw_basis, medians, min_conf, allowed)
                        if _segment_distance(swap_seg, last_seg) < _segment_distance(orig_seg, last_seg):
                            jmap, cmap = swapped_j, swapped_c
                            basis, basis_src = sw_basis, sw_src
                            psi = math.atan2(basis[0][2], basis[0][0])
                            d_psi = abs(_angle_diff_rad(psi, last_psi))
                            lr_swap_status = "corrected"
                        else:
                            lr_swap_status = "suspected"
                    else:
                        lr_swap_status = "suspected"

                if d_psi > math.radians(90.0):
                    frame_flags.append({
                        "index": idx,
                        "t": t_pts,
                        "rejected": True,
                        "reason": "heading-ambiguous",
                        "lrSwap": lr_swap_status,
                    })
                    continue

            last_basis = basis
            last_psi = psi

        seg_out, dropped = _extract_segments(jmap, cmap, basis, medians, min_conf, allowed)
        if not seg_out:
            frame_flags.append({"index": idx, "t": t_pts, "rejected": True, "reason": "no-valid-segments"})
            continue

        pose: dict[str, Any] = {"seg": seg_out}
        if mask == "full":
            if "pelvis" in jmap and cmap.get("pelvis", -1.0) >= min_conf:
                raw_pelvis_y = jmap["pelvis"][1]
                ratio = raw_pelvis_y / source_leg
                pelvis_ratios.append(ratio)
                # Retarget pelvis height to target rig using pelvis/leg-length ratio.
                pose["pelvis"] = round(max(target_ankle, ratio * target_leg_length), 5)
            twist = _compute_twist_deg(jmap, cmap, basis, seg_out.get("trunk"), min_conf)
            if twist is not None:
                pose["twist"] = twist

        last_seg = seg_out
        keys.append({"t": round(t_pts - t0, 6), "pose": pose, "ease": "linear"})
        flag_entry: dict[str, Any] = {"index": idx, "t": t_pts, "rejected": False, "basis": basis_src}
        if lr_swap_status:
            flag_entry["lrSwap"] = lr_swap_status
        if dropped:
            flag_entry["dropped"] = dropped
        frame_flags.append(flag_entry)

    if not keys:
        raise EdgeworkVideoError("No valid frames remained after basis/quality checks.", EXIT_INVALID_INPUT)

    duration = max(0.01, round(keys[-1]["t"], 6))
    tags = list(wireframe.get("tags", []))
    tags.append(f"mask:{mask}")
    if mirrored is True:
        tags.append("mirrored:corrected")
    elif mirrored == "unknown":
        tags.append("chirality:unknown")

    clip_doc: dict[str, Any] = {
        "id": wireframe["id"],
        "name": wireframe["name"],
        "category": wireframe["category"],
        "duration": duration,
        "loop": bool(wireframe["loop"]),
        "keys": keys,
        "tags": tags,
        "note": wireframe["meta"].get("note", "Translated from edgework-wireframe/1."),
        "ext": {
            "sourceSchema": "edgework-wireframe/1",
            "mask": mask,
            "mirrored": mirrored,
            "sourceLegLength_m": round(source_leg, 5),
            "medianPelvisLegRatio": round(statistics.median(pelvis_ratios), 5) if pelvis_ratios else None,
        },
    }

    track_doc: dict[str, Any] = {
        "id": wireframe["id"],
        "fps": wireframe["meta"]["fps"],
        "duration": duration,
        "loop": bool(wireframe["loop"]),
        "poses": [k["pose"] for k in keys],
    }

    return {
        "clip": clip_doc,
        "track": track_doc,
        "qa": {
            "acceptedFrames": len(keys),
            "rejectedFrames": sum(1 for f in frame_flags if f["rejected"]),
            "totalFrames": len(cleaned),
            "frames": frame_flags,
        },
    }


def run_export(
    wireframe_path: Path,
    out_dir: Path,
    mask: str = "arms-head",
    min_conf: float = 0.5,
) -> dict[str, Path]:
    """Read an `edgework-wireframe/1` file and write deterministic `.clip.json`, `.track.json`, and `.qa.json`."""
    t0 = time.monotonic()
    if not wireframe_path.is_file():
        raise EdgeworkVideoError(f"Wireframe file not found: {wireframe_path}", EXIT_INVALID_INPUT)
    try:
        wf = json.loads(wireframe_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise EdgeworkVideoError(f"Could not parse wireframe JSON: {exc}", EXIT_INVALID_INPUT) from exc

    result = translate_wireframe(wf, mask=mask, min_conf=min_conf)
    clip_id = wf["id"]
    out_dir.mkdir(parents=True, exist_ok=True)

    clip_path = out_dir / f"{clip_id}.clip.json"
    track_path = out_dir / f"{clip_id}.track.json"
    qa_path = out_dir / f"{clip_id}.qa.json"

    clip_bytes = _deterministic_json_bytes(result["clip"])
    track_bytes = _deterministic_json_bytes(result["track"])
    qa_bytes = _deterministic_json_bytes(result["qa"])

    clip_path.write_bytes(clip_bytes)
    track_path.write_bytes(track_bytes)
    qa_path.write_bytes(qa_bytes)

    _ = (t0, _dt, os, sha256_bytes(clip_bytes))
    return {"clip": clip_path, "track": track_path, "qa": qa_path}
