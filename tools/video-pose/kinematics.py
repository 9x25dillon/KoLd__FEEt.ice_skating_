"""Kinematics extraction, fast-spin confidence flagging, and validation-metrics.json sidecars.

Guardrails:
- World-space trajectory observables (O2 trace_radius_m, O4 glide_decel_ms2) are ONLY emitted
  when `meta.cameraCompensated` is True (or rink homography calibration is provided). Otherwise
  they stay `null` with an explicit explanation so uncompensated broadcast panning never leaks
  into `data/validation/` stubs.
- Fast-spin motion blur and bone-length anomalies lower affected joint confidences so
  `tools/ice-lab/game/motion/wireframe.ts` masks them cleanly.
- Every metric is tagged `status: "candidate-unverified"` for human review before promotion.
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any

import numpy as np

from .camera import RinkCalibration, fit_circle_radius
from .schema import WIREFRAME_BONES, WIREFRAME_JOINTS, to_yup

VALIDATION_SIDECAR_SCHEMA = "edgework-validation-sidecar/1"
G = 9.81


def _joint_vec(frame: dict[str, Any], name: str, space: str, min_conf: float) -> np.ndarray | None:
    raw = frame.get("joints", {}).get(name)
    if raw is None:
        return None
    conf = frame.get("confidence", {}).get(name, 1.0)
    if conf < min_conf:
        return None
    v = to_yup(raw, space)
    return v if np.all(np.isfinite(v)) else None


def flag_spin_blur_and_anomalies(
    seq: dict[str, Any],
    cut_frames: list[int] | None = None,
    bone_stretch_tol: float = 0.25,
    spin_nyquist_fraction: float = 0.65,
) -> dict[str, Any]:
    """Returns a copy of `seq` with confidence lowered on bone-stretch / spin-blur / cut frames.

    Does not mutate solver state or invent coordinates; only annotates `confidence` and optional
    `flags` so `wireframe.ts`'s confidence gate masks unreliable joints cleanly.
    """
    frames = seq["frames"]
    space = seq["meta"]["coordSpace"]
    fps = float(seq["meta"]["fps"])
    cut_set = set(cut_frames or [])

    # 1. Measure robust median bone lengths across all frames.
    bone_samples: dict[tuple[str, str], list[float]] = {b: [] for b in WIREFRAME_BONES}
    for f in frames:
        for a, b in WIREFRAME_BONES:
            va = _joint_vec(f, a, space, 0.35)
            vb = _joint_vec(f, b, space, 0.35)
            if va is not None and vb is not None:
                d = float(np.linalg.norm(vb - va))
                if d > 1e-4:
                    bone_samples[(a, b)].append(d)
    median_len: dict[tuple[str, str], float] = {
        bone: float(np.median(vals)) for bone, vals in bone_samples.items() if len(vals) >= 3
    }

    # 2. Check each frame for camera cuts, bone stretch, and rapid spin approaching Nyquist.
    out_frames: list[dict[str, Any]] = []
    prev_yaw: float | None = None
    prev_t: float | None = None
    flagged_counts = {"camera-cut": 0, "bone-stretch": 0, "spin-blur": 0}

    for idx, orig in enumerate(frames):
        f = {
            **orig,
            "joints": dict(orig.get("joints", {})),
            "confidence": {k: float(v) for k, v in orig.get("confidence", {}).items()},
        }
        flags: list[str] = list(orig.get("flags", []))

        if idx in cut_set:
            flags.append("camera-cut")
            flagged_counts["camera-cut"] += 1
            for j in f["joints"]:
                f["confidence"][j] = round(min(f["confidence"].get(j, 1.0), 0.15), 4)

        stretched_joints: set[str] = set()
        for a, b in WIREFRAME_BONES:
            ref = median_len.get((a, b))
            if not ref:
                continue
            va = _joint_vec(orig, a, space, 0.1)
            vb = _joint_vec(orig, b, space, 0.1)
            if va is None or vb is None:
                continue
            ratio = abs(float(np.linalg.norm(vb - va)) - ref) / ref
            if ratio > bone_stretch_tol:
                stretched_joints.add(a)
                stretched_joints.add(b)
        if stretched_joints:
            flags.append("bone-stretch")
            flagged_counts["bone-stretch"] += 1
            for j in stretched_joints:
                f["confidence"][j] = round(min(f["confidence"].get(j, 1.0), 0.25), 4)

        # Estimate per-frame yaw step for fast-spin blur detection.
        yaw = orig.get("rootYawRad")
        if yaw is None:
            hl = _joint_vec(orig, "hipL", space, 0.35)
            hr = _joint_vec(orig, "hipR", space, 0.35)
            if hl is not None and hr is not None:
                d = hr - hl
                if math.hypot(float(d[0]), float(d[2])) > 1e-4:
                    yaw = math.atan2(float(d[2]), float(d[0]))
        t = float(orig["t"])
        if yaw is not None and prev_yaw is not None and prev_t is not None and idx not in cut_set:
            dt = max(t - prev_t, 1.0 / max(fps, 1.0))
            dy = float(yaw) - prev_yaw
            while dy > math.pi:
                dy -= 2.0 * math.pi
            while dy < -math.pi:
                dy += 2.0 * math.pi
            # Fast spin approaching Nyquist aliasing or extreme blur (>22 rad/s at 30 fps)
            if abs(dy) > spin_nyquist_fraction * math.pi or abs(dy / dt) > 26.0:
                flags.append("spin-blur")
                flagged_counts["spin-blur"] += 1
                # Lower distal extremities (wrists/ankles/toes) most susceptible to spin motion blur.
                for j in ("wristL", "wristR", "ankleL", "ankleR", "toeL", "toeR"):
                    if j in f["joints"]:
                        f["confidence"][j] = round(min(f["confidence"].get(j, 1.0), 0.30), 4)
        if yaw is not None:
            prev_yaw = float(yaw)
            prev_t = t

        if flags:
            f["flags"] = sorted(set(flags))
        out_frames.append(f)

    meta = {
        **seq["meta"],
        "qualityReport": {
            "totalFrames": len(out_frames),
            "flagged": flagged_counts,
        },
    }
    return {**seq, "meta": meta, "frames": out_frames}


def build_validation_metrics(
    seq: dict[str, Any],
    calibration: RinkCalibration | None = None,
    min_conf: float = 0.35,
) -> dict[str, Any]:
    """Computes `validation-metrics.json` sidecar aligned to `data/validation/cases/` observables."""
    frames = seq["frames"]
    meta = seq["meta"]
    space = str(meta["coordSpace"])
    fps = float(meta["fps"])
    world_ok = bool(meta.get("cameraCompensated", False)) or (calibration is not None)
    duration = float(frames[-1]["t"]) - float(frames[0]["t"]) if len(frames) > 1 else 0.0

    # Collect per-frame kinematic series.
    lean_degs: list[float] = []
    wrist_spreads: list[float] = []
    yaw_rates: list[tuple[float, float]] = []  # (t, abs_omega_rad_s)
    world_xz: list[tuple[float, float, float]] = []  # (t, x, z)
    ankle_ys: list[tuple[float, float, float]] = []  # (t, yL, yR)

    prev_yaw: float | None = None
    prev_t: float | None = None
    conf_vals: list[float] = []

    for f in frames:
        t = float(f["t"])
        flags = set(f.get("flags", []))
        if "camera-cut" in flags:
            prev_yaw = None
            prev_t = None
            continue

        for j in WIREFRAME_JOINTS:
            if j in f.get("joints", {}):
                conf_vals.append(float(f.get("confidence", {}).get(j, 1.0)))

        # O1 body lean line: lowest support ankle -> midpoint of hips & shoulders (matches carve-lean-footage.json note).
        aL = _joint_vec(f, "ankleL", space, min_conf)
        aR = _joint_vec(f, "ankleR", space, min_conf)
        pel = _joint_vec(f, "pelvis", space, min_conf)
        ch = _joint_vec(f, "chest", space, min_conf)
        if aL is not None and aR is not None:
            ankle_ys.append((t, float(aL[1]), float(aR[1])))
        support_ankle = None
        if aL is not None and aR is not None:
            support_ankle = aL if aL[1] <= aR[1] else aR
        elif aL is not None or aR is not None:
            support_ankle = aL if aL is not None else aR

        if support_ankle is not None and pel is not None and ch is not None:
            upper_mid = 0.5 * (pel + ch)
            body_vec = upper_mid - support_ankle
            n = float(np.linalg.norm(body_vec))
            if n > 0.2:
                cos_phi = max(-1.0, min(1.0, float(body_vec[1]) / n))
                lean_degs.append(math.degrees(math.acos(cos_phi)))

        # O6 arm spread (wrist-to-wrist distance in metres).
        wL = _joint_vec(f, "wristL", space, min_conf)
        wR = _joint_vec(f, "wristR", space, min_conf)
        if wL is not None and wR is not None:
            wrist_spreads.append(float(np.linalg.norm(wR - wL)))

        # Yaw rate (O5/O6).
        yaw = f.get("rootYawRad")
        if yaw is None:
            hl = _joint_vec(f, "hipL", space, min_conf)
            hr = _joint_vec(f, "hipR", space, min_conf)
            if hl is not None and hr is not None:
                d = hr - hl
                if math.hypot(float(d[0]), float(d[2])) > 1e-4:
                    yaw = math.atan2(float(d[2]), float(d[0]))
        if yaw is not None:
            yaw_f = float(yaw)
            if prev_yaw is not None and prev_t is not None and t > prev_t:
                dy = yaw_f - prev_yaw
                while dy > math.pi:
                    dy -= 2.0 * math.pi
                while dy < -math.pi:
                    dy += 2.0 * math.pi
                yaw_rates.append((t, abs(dy / (t - prev_t))))
            prev_yaw = yaw_f
            prev_t = t

        # World-grounded root horizontal path (O2/O4) only when cameraCompensated.
        if world_ok:
            rw = f.get("rootWorld")
            if rw is not None:
                p = to_yup(rw, space)
                world_xz.append((t, float(p[0]), float(p[2])))
            elif pel is not None and space != "skater-local":
                world_xz.append((t, float(pel[0]), float(pel[2])))

    # O1: steady carve lean
    o1_lean: dict[str, Any]
    if lean_degs:
        arr = np.asarray(lean_degs, dtype=np.float64)
        o1_lean = {
            "target_case": "carve-lean-footage",
            "observable": "carve_lean_deg",
            "unit": "deg",
            "median": round(float(np.median(arr)), 3),
            "mean": round(float(np.mean(arr)), 3),
            "peak": round(float(np.max(arr)), 3),
            "std": round(float(np.std(arr)), 3),
            "samples": len(lean_degs),
            "status": "candidate-unverified",
        }
    else:
        o1_lean = {"target_case": "carve-lean-footage", "observable": "carve_lean_deg", "value": None, "reason": "no valid ankle/pelvis/chest frames"}

    # O2: tracing radius (strictly gated on world_ok)
    o2_trace: dict[str, Any]
    if not world_ok:
        o2_trace = {
            "target_case": "trace-radius-overhead-footage",
            "observable": "trace_radius_m",
            "value": None,
            "reason": "blocked: cameraCompensated is false and no rink homography calibration was provided",
        }
    elif len(world_xz) >= 5:
        fit = fit_circle_radius([(x, z) for _, x, z in world_xz])
        if fit is not None:
            o2_trace = {
                "target_case": "trace-radius-overhead-footage",
                "observable": "trace_radius_m",
                "unit": "m",
                "value": fit["radius_m"],
                "measurement_uncertainty": fit["residual_rmse_m"],
                "arc_angle_deg": fit["arc_angle_deg"],
                "status": "candidate-unverified",
            }
        else:
            o2_trace = {"target_case": "trace-radius-overhead-footage", "observable": "trace_radius_m", "value": None, "reason": "trajectory nearly collinear (straight glide)"}
    else:
        o2_trace = {"target_case": "trace-radius-overhead-footage", "observable": "trace_radius_m", "value": None, "reason": "insufficient world trajectory points"}

    # O4: glide speed & deceleration (strictly gated on world_ok)
    o4_glide: dict[str, Any]
    if not world_ok:
        o4_glide = {
            "target_case": "glide-low-speed-rink-pair-a",
            "observable": "glide_decel_ms2",
            "value": None,
            "reason": "blocked: cameraCompensated is false and no rink homography calibration was provided",
        }
    elif len(world_xz) >= 6:
        ts_mid = []
        speeds = []
        for i in range(1, len(world_xz)):
            dt = world_xz[i][0] - world_xz[i - 1][0]
            if dt <= 1e-6:
                continue
            ds = math.hypot(world_xz[i][1] - world_xz[i - 1][1], world_xz[i][2] - world_xz[i - 1][2])
            ts_mid.append(0.5 * (world_xz[i][0] + world_xz[i - 1][0]))
            speeds.append(ds / dt)
        if len(speeds) >= 4:
            slope, _ = np.polyfit(np.asarray(ts_mid), np.asarray(speeds), 1)
            o4_glide = {
                "target_case": "glide-low-speed-rink-pair-a",
                "observable": "glide_decel_ms2",
                "unit": "m/s^2",
                "value": round(float(-slope), 4),
                "entry_speed_ms": round(float(speeds[0]), 3),
                "exit_speed_ms": round(float(speeds[-1]), 3),
                "mean_speed_ms": round(float(np.mean(speeds)), 3),
                "status": "candidate-unverified",
            }
        else:
            o4_glide = {"target_case": "glide-low-speed-rink-pair-a", "observable": "glide_decel_ms2", "value": None, "reason": "insufficient speed samples"}
    else:
        o4_glide = {"target_case": "glide-low-speed-rink-pair-a", "observable": "glide_decel_ms2", "value": None, "reason": "insufficient world trajectory points"}

    # O5: jump flight air time, implied ballistic height/takeoff_vz, and air turns
    o5_jump: dict[str, Any]
    if ankle_ys:
        floor_y = min(min(yL, yR) for _, yL, yR in ankle_ys)
        air_runs: list[list[float]] = []
        cur_run: list[float] = []
        for t, yL, yR in ankle_ys:
            if (yL - floor_y) > 0.04 and (yR - floor_y) > 0.04:
                cur_run.append(t)
            else:
                if cur_run:
                    air_runs.append(cur_run)
                    cur_run = []
        if cur_run:
            air_runs.append(cur_run)
        longest = max(air_runs, key=len) if air_runs else []
        if len(longest) >= 2:
            # One full frame span past last contact to first landing contact.
            air_time = (longest[-1] - longest[0]) + (1.0 / max(fps, 1.0))
            t_start, t_end = longest[0], longest[-1]
            # Integrate angular speed over the flight window for approximate revolutions turned.
            in_air_omega = [w for t, w in yaw_rates if t_start <= t <= t_end]
            revs = (float(np.mean(in_air_omega)) * air_time / (2.0 * math.pi)) if in_air_omega else None
            o5_jump = {
                "target_case": "air-time-footage",
                "observable": "air_time_s",
                "unit": "s",
                "value": round(float(air_time), 4),
                "measurement_uncertainty": round(2.0 / max(fps, 1.0), 4),
                "implied_takeoff_vz_ms": round(float(G * air_time * 0.5), 4),
                "implied_ballistic_height_m": round(float(G * air_time * air_time / 8.0), 4),
                "estimated_revolutions_turned": round(float(revs), 3) if revs is not None else None,
                "flight_window_s": [round(t_start, 3), round(t_end, 3)],
                "airborne_frames": len(longest),
                "status": "candidate-unverified",
            }
        else:
            o5_jump = {"target_case": "air-time-footage", "observable": "air_time_s", "value": None, "reason": "no airborne interval detected (>4 cm clearance on both ankles)"}
    else:
        o5_jump = {"target_case": "air-time-footage", "observable": "air_time_s", "value": None, "reason": "no ankle coordinates"}

    # O6: inertia / spin pull-in ratio and spin rates
    o6_inertia: dict[str, Any]
    if wrist_spreads:
        min_sp = float(min(wrist_spreads))
        max_sp = float(max(wrist_spreads))
        spread_ratio = (min_sp / max_sp) if max_sp > 1e-4 else 1.0
        omegas = [w for _, w in yaw_rates]
        spin_open = None
        spin_tucked = None
        spin_ratio = None
        if len(omegas) >= 6:
            # Compare early 25% vs peak 25% angular speeds when skating spins up.
            q = max(1, len(omegas) // 4)
            early = float(np.median(omegas[:q]))
            peak_q = float(np.median(sorted(omegas)[-q:]))
            if early > 1.0 and peak_q > early * 1.1:
                spin_open = round(early, 3)
                spin_tucked = round(peak_q, 3)
                spin_ratio = round(peak_q / early, 3)
        o6_inertia = {
            "target_case": "pull-in-ratio-spin-footage",
            "observable": "pull_in_ratio",
            "arm_spread_min_m": round(min_sp, 4),
            "arm_spread_max_m": round(max_sp, 4),
            "arm_spread_ratio": round(spread_ratio, 4),
            "spin_rate_open_rads": spin_open,
            "spin_rate_tucked_rads": spin_tucked,
            "spin_up_ratio": spin_ratio,
            "peak_yaw_rate_rads": round(float(max(omegas)), 3) if omegas else 0.0,
            "status": "candidate-unverified",
        }
    else:
        o6_inertia = {"target_case": "pull-in-ratio-spin-footage", "observable": "pull_in_ratio", "value": None, "reason": "no wrist coordinates"}

    return {
        "schema": VALIDATION_SIDECAR_SCHEMA,
        "sequence_id": seq["id"],
        "provenance": {
            "extractor": meta.get("extractor"),
            "source_provenance": meta.get("provenance"),
            "coord_space": space,
            "camera_compensated": bool(meta.get("cameraCompensated", False)),
            "rink_calibrated": calibration is not None,
            "fps": fps,
            "frames": len(frames),
            "duration_s": round(duration, 4),
            "mean_confidence": round(float(np.mean(conf_vals)), 4) if conf_vals else 0.0,
            "quality_report": meta.get("qualityReport"),
        },
        "observables": {
            "O1_carve": o1_lean,
            "O2_tracing": o2_trace,
            "O4_glide": o4_glide,
            "O5_jump": o5_jump,
            "O6_inertia": o6_inertia,
        },
        "review_note": "Candidate measurements only — inspect rendered wireframe preview and verify frame timing before copying any value into data/validation/cases/*.json.",
    }


def write_validation_metrics(metrics: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
