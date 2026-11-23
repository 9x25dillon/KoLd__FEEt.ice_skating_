"""`edgework-video metrics` — Evidence lane O5 & O6 extraction to `edgework-evidence/1`.

Computes camera-visible, two-annotator observables directly from container PTS
timelines (`probe/frames.json`) and human event annotations (`annotations/*.csv`),
never from 3D pose-model trajectories or invented `frame / fps` timestamps.

Implemented observables (fidelity-gate.md §4.3 & Blueprint §7):
  - O5: `air_time_s`, `revolutions_turned`
  - O6: `spin_rate_rps`, `pull_in_ratio`, `spin_decay_per_s`

Observables requiring unprovided inputs (e.g. O1 perpendicular 2D, O2/O3/O4/O7
calibrated ice-plane homography) are reported honestly as `status: "unavailable"`
with an explicit reason.
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

from . import EXIT_BACKEND_FAILURE, EXIT_INVALID_INPUT, EdgeworkVideoError
from .annotate import _validate_safe_id, load_shot_annotations
from .calibrate import _solve_linear, project_image_to_ice
from .intake import _deterministic_json_bytes, sha256_bytes, sha256_file, verify_take
from .schemas import validate_evidence_sidecar

ALL_OBSERVABLES = ("O1", "O2", "O3", "O4", "O5", "O6", "O7")
O5_AIR_TIME_BAND_S = 0.05
O5_REV_BAND = 0.125
# ±22.5° (±1/16 rev) orientation reading resolution on takeoff/landing frames (authored).
ORIENTATION_RES_REV = 0.0625


def _frame_step_sec(frames_doc: dict[str, Any]) -> float:
    med = frames_doc.get("medianDurationSec")
    if isinstance(med, (int, float)) and med > 0:
        return float(med)
    return 1.0 / float(frames_doc["nominalFps"])


def _events_of(rows: list[dict[str, Any]], event: str, phase: str | None = None) -> list[dict[str, Any]]:
    out = [r for r in rows if r["event"] == event]
    if phase is not None:
        out = [r for r in out if r["phase"] == phase]
    return out


def _timing_blocked_reason(manifest: dict[str, Any]) -> str | None:
    playback = manifest.get("playback", "unknown")
    if playback != "live":
        return (
            f"playback is '{playback}' with unknown real-time scale factor; "
            "timing metrics are unavailable"
        )
    return None


def _compute_o5_air_time(
    manifest: dict[str, Any],
    frames_doc: dict[str, Any],
    annotations: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    blocked = _timing_blocked_reason(manifest)
    if blocked:
        return {
            "name": "air_time_s",
            "observable": "O5",
            "status": "unavailable",
            "reason": blocked,
        }

    per_ann: dict[str, dict[str, Any]] = {}
    for ann, rows in annotations.items():
        offs = _events_of(rows, "blade_off")
        touches = _events_of(rows, "touchdown")
        if len(offs) == 1 and len(touches) == 1 and touches[0]["frame_index"] > offs[0]["frame_index"]:
            off_ev, touch_ev = offs[0], touches[0]
            air_s = round(touch_ev["t_sec"] - off_ev["t_sec"], 6)
            per_ann[ann] = {
                "off": off_ev["frame_index"],
                "touch": touch_ev["frame_index"],
                "offPts": off_ev["pts"],
                "touchPts": touch_ev["pts"],
                "air_s": air_s,
            }

    if len(per_ann) < 2:
        return {
            "name": "air_time_s",
            "observable": "O5",
            "status": "unavailable",
            "reason": f"requires at least 2 independent annotators with blade_off and touchdown (found {len(per_ann)})",
        }

    off_indices = [v["off"] for v in per_ann.values()]
    touch_indices = [v["touch"] for v in per_ann.values()]
    off_spread_frames = max(off_indices) - min(off_indices)
    touch_spread_frames = max(touch_indices) - min(touch_indices)
    if off_spread_frames > 1 or touch_spread_frames > 1:
        return {
            "name": "air_time_s",
            "observable": "O5",
            "status": "unavailable",
            "reason": (
                f"annotators disagree by >1 frame "
                f"(blade_off spread {off_spread_frames}, touchdown spread {touch_spread_frames})"
            ),
            "raw": per_ann,
        }

    air_vals = [v["air_s"] for v in per_ann.values()]
    mean_air = round(statistics.mean(air_vals), 6)
    step_s = _frame_step_sec(frames_doc)
    # Worst-case ±1 frame at each event = 2 * step_s, combined in quadrature with half annotator spread.
    res_half = 2.0 * step_s
    ann_half = (max(air_vals) - min(air_vals)) / 2.0
    um = round(math.hypot(res_half, ann_half), 6)

    promotable = um <= O5_AIR_TIME_BAND_S
    validity = "one jump; fields not split"
    if not promotable:
        validity += (
            f"; frame rate ({frames_doc['nominalFps']:.2f} fps) yields um={um:.4f}s > "
            f"O5 ±{O5_AIR_TIME_BAND_S}s band"
        )

    return {
        "name": "air_time_s",
        "observable": "O5",
        "status": "observed",
        "value": mean_air,
        "unit": "s",
        "definition": "last frame with blade contact to first frame with blade contact (fidelity-gate §4.3 O5)",
        "method": {
            "id": "event-frames/1",
            "rule": "mean of annotators when blade_off and touchdown each agree within 1 frame",
        },
        "raw": per_ann,
        "uncertainty": {
            "kind": "resolution+annotator",
            "halfWidth_s": um,
            "derivation": f"RSS(±1 frame at each event = {res_half:.6f} s, half annotator spread = {ann_half:.6f} s)",
        },
        "assumptions": ["shot is real time, not slow motion"],
        "validity": validity,
        "promotable": promotable,
    }


def _compute_o5_revolutions(
    manifest: dict[str, Any],
    annotations: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    per_ann: dict[str, dict[str, Any]] = {}
    for ann, rows in annotations.items():
        to_h = _events_of(rows, "takeoff_heading_deg")
        la_h = _events_of(rows, "landing_heading_deg")
        passes = _events_of(rows, "rev_pass", phase="jump")
        if len(to_h) == 1 and len(la_h) == 1:
            start_deg = float(to_h[0]["value"]) % 360.0
            end_deg = float(la_h[0]["value"]) % 360.0
            frac_rev = ((end_deg - start_deg) % 360.0) / 360.0
            total_rev = round(len(passes) + frac_rev, 4)
            per_ann[ann] = {
                "passes": len(passes),
                "takeoffHeadingDeg": start_deg,
                "landingHeadingDeg": end_deg,
                "revolutions": total_rev,
            }

    if len(per_ann) < 2:
        return {
            "name": "revolutions_turned",
            "observable": "O5",
            "status": "unavailable",
            "reason": (
                "requires at least 2 annotators with takeoff_heading_deg and landing_heading_deg "
                f"(found {len(per_ann)})"
            ),
        }

    pass_counts = {v["passes"] for v in per_ann.values()}
    if len(pass_counts) > 1:
        return {
            "name": "revolutions_turned",
            "observable": "O5",
            "status": "unavailable",
            "reason": f"annotators disagree on integer revolution pass count ({sorted(pass_counts)})",
            "raw": per_ann,
        }

    revs = [v["revolutions"] for v in per_ann.values()]
    spread = max(revs) - min(revs)
    if spread > O5_REV_BAND:
        return {
            "name": "revolutions_turned",
            "observable": "O5",
            "status": "unavailable",
            "reason": f"annotator fractional revolution spread ({spread:.3f} rev) exceeds ±{O5_REV_BAND} rev",
            "raw": per_ann,
        }

    mean_rev = round(statistics.mean(revs), 4)
    ann_half = spread / 2.0
    um = round(math.hypot(ORIENTATION_RES_REV, ann_half), 4)
    assumptions = ["revolutions counted from takeoff/landing orientations plus integer passes"]
    if manifest.get("mirrored") == "unknown":
        assumptions.append("mirrored=unknown: rotation magnitude only; CW/CCW direction unavailable")

    return {
        "name": "revolutions_turned",
        "observable": "O5",
        "status": "observed",
        "value": mean_rev,
        "unit": "rev",
        "definition": "revolutions turned between takeoff and landing orientations plus counted passes (fidelity-gate §4.3 O5)",
        "method": {
            "id": "orientation-passes/1",
            "rule": "integer rev_pass(phase=jump) count must match across annotators and fraction within ±0.125 rev",
        },
        "raw": per_ann,
        "uncertainty": {
            "kind": "orientation+annotator",
            "halfWidth_rev": um,
            "derivation": f"RSS(orientation resolution {ORIENTATION_RES_REV} rev, half annotator spread {ann_half:.4f} rev)",
        },
        "assumptions": assumptions,
        "validity": "one jump; orientation-based (never integrated yaw rate)",
        "promotable": um <= O5_REV_BAND,
    }


def _agreed_rev_passes(
    annotations: dict[str, list[dict[str, Any]]],
    phase: str,
) -> tuple[dict[str, list[dict[str, Any]]] | None, str | None]:
    """Return per-annotator rev_pass lists for `phase` if >=2 annotators agree within ±1 frame."""
    by_ann: dict[str, list[dict[str, Any]]] = {}
    for ann, rows in annotations.items():
        passes = _events_of(rows, "rev_pass", phase=phase)
        if len(passes) >= 2:
            by_ann[ann] = passes
    if len(by_ann) < 2:
        return None, f"requires at least 2 annotators with >=2 rev_pass events in phase '{phase}' (found {len(by_ann)})"

    lengths = {len(v) for v in by_ann.values()}
    if len(lengths) > 1:
        return None, f"annotators disagree on rev_pass count in phase '{phase}' ({sorted(lengths)})"

    n = next(iter(lengths))
    for k in range(n):
        idxs = [v[k]["frame_index"] for v in by_ann.values()]
        if max(idxs) - min(idxs) > 1:
            return None, f"annotators disagree by >1 frame on rev_pass #{k + 1} in phase '{phase}'"

    return by_ann, None


def _phase_rate_rps(
    by_ann: dict[str, list[dict[str, Any]]],
    step_s: float,
) -> tuple[float, float, dict[str, Any]]:
    """Compute mean spin rate (rev/s) and uncertainty from agreed revolution passes."""
    rates: list[float] = []
    spans: list[float] = []
    raw: dict[str, Any] = {}
    for ann, passes in by_ann.items():
        n_revs = len(passes) - 1
        dt = passes[-1]["t_sec"] - passes[0]["t_sec"]
        rate = n_revs / dt
        rates.append(rate)
        spans.append(dt)
        raw[ann] = {
            "passFrames": [p["frame_index"] for p in passes],
            "revs": n_revs,
            "span_s": round(dt, 6),
            "rate_rps": round(rate, 5),
        }

    mean_rate = statistics.mean(rates)
    mean_span = statistics.mean(spans)
    # ±1 frame at start and end boundaries -> relative timing error 2*step_s / span
    res_half = mean_rate * (2.0 * step_s / mean_span)
    ann_half = (max(rates) - min(rates)) / 2.0
    um = math.hypot(res_half, ann_half)
    return round(mean_rate, 5), round(um, 5), raw


def _compute_o6_metrics(
    manifest: dict[str, Any],
    frames_doc: dict[str, Any],
    annotations: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    step_s = _frame_step_sec(frames_doc)
    timing_blocked = _timing_blocked_reason(manifest)

    # 1. spin_rate_rps: prefer phase='spin', else 'tucked', else 'open'
    chosen_phase: str | None = None
    chosen_passes: dict[str, list[dict[str, Any]]] | None = None
    last_err = "no spin revolution passes annotated"
    for cand in ("spin", "tucked", "open"):
        agreed, err = _agreed_rev_passes(annotations, cand)
        if agreed is not None:
            chosen_phase = cand
            chosen_passes = agreed
            break
        if err:
            last_err = err

    if timing_blocked:
        out.append({
            "name": "spin_rate_rps",
            "observable": "O6",
            "status": "unavailable",
            "reason": timing_blocked,
        })
    elif chosen_passes is None or chosen_phase is None:
        out.append({
            "name": "spin_rate_rps",
            "observable": "O6",
            "status": "unavailable",
            "reason": last_err,
        })
    else:
        rate, um, raw = _phase_rate_rps(chosen_passes, step_s)
        out.append({
            "name": "spin_rate_rps",
            "observable": "O6",
            "status": "observed",
            "value": rate,
            "unit": "rev/s",
            "definition": f"revolutions per second over whole revolutions in phase '{chosen_phase}' (fidelity-gate §4.3 O6)",
            "method": {"id": "rev-periods/1", "rule": "whole revolutions from two annotators agreeing within ±1 frame"},
            "raw": raw,
            "uncertainty": {
                "kind": "resolution+annotator",
                "halfWidth_rps": um,
                "derivation": "RSS(±1 frame boundary resolution over total span, half annotator spread)",
            },
            "assumptions": ["shot is real time, not slow motion", "centred spin with steady camera framing"],
            "validity": f"phase={chosen_phase}",
            "promotable": True,
        })

    # 2. pull_in_ratio = omega_tucked / omega_open (dimensionless ratio of periods; L0 inertia ratio)
    open_passes, open_err = _agreed_rev_passes(annotations, "open")
    tucked_passes, tucked_err = _agreed_rev_passes(annotations, "tucked")
    if manifest.get("playback") in {"mixed", "unknown"}:
        out.append({
            "name": "pull_in_ratio",
            "observable": "O6",
            "status": "unavailable",
            "reason": f"playback is '{manifest.get('playback')}': cannot assume constant frame rate across open and tucked windows",
        })
    elif open_passes is None or tucked_passes is None:
        reasons = [r for r in (open_err, tucked_err) if r]
        out.append({
            "name": "pull_in_ratio",
            "observable": "O6",
            "status": "unavailable",
            "reason": "; ".join(reasons),
        })
    else:
        w_open, u_open, raw_open = _phase_rate_rps(open_passes, step_s)
        w_tucked, u_tucked, raw_tucked = _phase_rate_rps(tucked_passes, step_s)
        ratio = round(w_tucked / w_open, 5)
        rel_u = math.hypot(u_open / w_open, u_tucked / w_tucked)
        um = round(ratio * rel_u, 5)
        out.append({
            "name": "pull_in_ratio",
            "observable": "O6",
            "status": "observed",
            "value": ratio,
            "unit": "1",
            "definition": "omega_tucked / omega_open from revolution periods before and after pull-in (fidelity-gate §4.3 O6; never wrist spread)",
            "method": {"id": "rev-period-ratio/1", "rule": "ratio of whole-revolution rates from two agreeing annotators"},
            "raw": {"open": raw_open, "tucked": raw_tucked},
            "uncertainty": {
                "kind": "propagated-resolution+annotator",
                "halfWidth": um,
                "derivation": "first-order RSS propagation of u(omega_open)/omega_open and u(omega_tucked)/omega_tucked",
            },
            "assumptions": ["angular momentum approximately conserved across short pull-in window"],
            "validity": "uncorrected for blade friction decay; keep open/tucked windows short",
            "promotable": True,
        })

    # 3. spin_decay_per_s: fractional loss of omega per second over >= 2 successive revolutions
    decay_passes: dict[str, list[dict[str, Any]]] | None = None
    decay_phase: str | None = None
    for cand in ("spin", "tucked", "open"):
        agreed, _ = _agreed_rev_passes(annotations, cand)
        if agreed is not None and len(next(iter(agreed.values()))) >= 3:
            decay_passes = agreed
            decay_phase = cand
            break

    if timing_blocked:
        out.append({
            "name": "spin_decay_per_s",
            "observable": "O6",
            "status": "unavailable",
            "reason": timing_blocked,
        })
    elif decay_passes is None or decay_phase is None:
        out.append({
            "name": "spin_decay_per_s",
            "observable": "O6",
            "status": "unavailable",
            "reason": "requires >=3 agreed rev_pass events (>=2 successive revolutions) in a constant-position phase",
        })
    else:
        decays: list[float] = []
        raw_decay: dict[str, Any] = {}
        first_dt_list: list[float] = []
        last_dt_list: list[float] = []
        mid_span_list: list[float] = []
        for ann, passes in decay_passes.items():
            dt_first = passes[1]["t_sec"] - passes[0]["t_sec"]
            dt_last = passes[-1]["t_sec"] - passes[-2]["t_sec"]
            t_mid_first = 0.5 * (passes[0]["t_sec"] + passes[1]["t_sec"])
            t_mid_last = 0.5 * (passes[-2]["t_sec"] + passes[-1]["t_sec"])
            span = t_mid_last - t_mid_first
            w_first = 1.0 / dt_first
            w_last = 1.0 / dt_last
            decay = -(math.log(w_last) - math.log(w_first)) / span
            decays.append(decay)
            first_dt_list.append(dt_first)
            last_dt_list.append(dt_last)
            mid_span_list.append(span)
            raw_decay[ann] = {
                "omegaFirst_rps": round(w_first, 5),
                "omegaLast_rps": round(w_last, 5),
                "midSpan_s": round(span, 6),
                "decay_per_s": round(decay, 5),
            }
        mean_decay = round(statistics.mean(decays), 5)
        mean_span = statistics.mean(mid_span_list)
        rel_first = 2.0 * step_s / statistics.mean(first_dt_list)
        rel_last = 2.0 * step_s / statistics.mean(last_dt_list)
        res_half = math.hypot(rel_first, rel_last) / mean_span
        ann_half = (max(decays) - min(decays)) / 2.0
        um = round(math.hypot(res_half, ann_half), 5)
        out.append({
            "name": "spin_decay_per_s",
            "observable": "O6",
            "status": "observed",
            "value": mean_decay,
            "unit": "1/s",
            "definition": "fractional loss of omega per second over successive revolutions in a constant-position spin (fidelity-gate §4.3 O6)",
            "method": {"id": "rev-decay/1", "rule": "-ln(omega_last / omega_first) / mid_span from two agreeing annotators"},
            "raw": raw_decay,
            "uncertainty": {
                "kind": "propagated-resolution+annotator",
                "halfWidth_per_s": um,
                "derivation": "RSS(boundary frame resolution on first and last revolution periods / mid_span, half annotator spread)",
            },
            "assumptions": ["constant spin position (no arm or leg change)", "shot is real time, not slow motion"],
            "validity": f"phase={decay_phase}",
            "promotable": True,
        })

    return out


def _extract_rejected_intervals(annotations: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    intervals: list[dict[str, Any]] = []
    seen: set[tuple[float, float, str, str]] = set()
    for rows in annotations.values():
        starts = _events_of(rows, "reject_start")
        ends = _events_of(rows, "reject_end")
        for st, en in zip(starts, ends):
            if en["t_sec"] >= st["t_sec"]:
                reason = st["value"] or "operator-rejected"
                detail = st["note"] or en["note"] or ""
                key = (st["t_sec"], en["t_sec"], reason, detail)
                if key not in seen:
                    seen.add(key)
                    entry: dict[str, Any] = {
                        "ptsStart": st["t_sec"],
                        "ptsEnd": en["t_sec"],
                        "reason": reason,
                    }
                    if detail:
                        entry["detail"] = detail
                    intervals.append(entry)
    intervals.sort(key=lambda x: (x["ptsStart"], x["ptsEnd"], x["reason"]))
    return intervals


def _unavailable_plane_metrics(obs: str) -> list[dict[str, Any]]:
    mapping = {
        "O1": [("carve_lean_deg", "no perpendicular 2D blade/body-line keypoints or camera roll calibration")],
        "O2": [("trace_radius_m", "scale unknown; no surveyed ice-plane homography")],
        "O3": [("turn_entry_angle_deg", "scale unknown; no surveyed ice-plane homography")],
        "O4": [("glide_decel_ms2", "scale unknown; no surveyed distance markers or homography")],
        "O7": [("stroke_gain_ms", "scale unknown; no surveyed ice-plane homography")],
    }
    return [
        {"name": name, "observable": obs, "status": "unavailable", "reason": reason}
        for name, reason in mapping[obs]
    ]


def _load_accepted_calibration(take_dir: Path, shot_id: str) -> dict[str, Any] | None:
    calib_path = take_dir / "shots" / shot_id / "calib" / "camera.json"
    if not calib_path.is_file():
        return None
    try:
        doc = json.loads(calib_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if isinstance(doc, dict) and doc.get("status") == "accepted" and isinstance(doc.get("homographyImageToIce"), list):
        return doc
    return None


def _projected_contacts(
    annotations: dict[str, list[dict[str, Any]]],
    phase: str,
    h_mat: list[list[float]],
) -> dict[str, list[tuple[float, float, float]]]:
    """Return per-annotator list of (t_sec, x_m, z_m) projected from blade_contact events."""
    out: dict[str, list[tuple[float, float, float]]] = {}
    for ann, rows in annotations.items():
        pts: list[tuple[float, float, float]] = []
        for r in _events_of(rows, "blade_contact", phase=phase):
            u_s, v_s = r["value"].split(",", 1)
            x, z = project_image_to_ice(h_mat, float(u_s), float(v_s))
            pts.append((r["t_sec"], x, z))
        if pts:
            out[ann] = pts
    return out


def _fit_circle_2d(pts: list[tuple[float, float]]) -> tuple[float, float, float, float, float]:
    """Kasa algebraic circle fit -> (cx, cz, radius_m, rms_residual_m, arc_sweep_deg)."""
    # Solve 2*cx*x + 2*cz*z + c = x^2 + z^2
    ata = [[0.0] * 3 for _ in range(3)]
    atb = [0.0] * 3
    for x, z in pts:
        row = (2.0 * x, 2.0 * z, 1.0)
        rhs = x * x + z * z
        for i in range(3):
            atb[i] += row[i] * rhs
            for j in range(3):
                ata[i][j] += row[i] * row[j]
    cx, cz, c = _solve_linear(ata, atb)
    r_sq = c + cx * cx + cz * cz
    radius = math.sqrt(max(1e-9, r_sq))
    res = [abs(math.hypot(x - cx, z - cz) - radius) for x, z in pts]
    rms = math.sqrt(sum(e * e for e in res) / len(res))

    # Unwrapped arc sweep along ordered blade-contact sequence
    angles = [math.atan2(z - cz, x - cx) for x, z in pts]
    unwrapped = [angles[0]]
    for a in angles[1:]:
        da = math.atan2(math.sin(a - unwrapped[-1]), math.cos(a - unwrapped[-1]))
        unwrapped.append(unwrapped[-1] + da)
    sweep_deg = math.degrees(max(unwrapped) - min(unwrapped))
    return cx, cz, radius, rms, sweep_deg


def _compute_o2_trace_radius(
    calib: dict[str, Any] | None,
    annotations: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    if calib is None:
        return {"name": "trace_radius_m", "observable": "O2", "status": "unavailable", "reason": "scale unknown; no surveyed ice-plane homography"}
    proj = _projected_contacts(annotations, "carve", calib["homographyImageToIce"])
    valid = {ann: pts for ann, pts in proj.items() if len(pts) >= 4}
    if len(valid) < 2:
        return {
            "name": "trace_radius_m",
            "observable": "O2",
            "status": "unavailable",
            "reason": f"requires >=2 annotators with >=4 blade_contact(phase=carve) points (found {len(valid)})",
        }

    radii: list[float] = []
    fit_rms_list: list[float] = []
    sweeps: list[float] = []
    raw: dict[str, Any] = {}
    for ann, pts in valid.items():
        cx, cz, rad, rms, sweep_deg = _fit_circle_2d([(x, z) for _, x, z in pts])
        radii.append(rad)
        fit_rms_list.append(rms)
        sweeps.append(sweep_deg)
        raw[ann] = {
            "pointCount": len(pts),
            "centerM": [round(cx, 4), round(cz, 4)],
            "radiusM": round(rad, 4),
            "fitRmsM": round(rms, 5),
            "arcSweepDeg": round(sweep_deg, 2),
        }

    if min(sweeps) < 90.0:
        return {
            "name": "trace_radius_m",
            "observable": "O2",
            "status": "unavailable",
            "reason": f"carve arc sweep ({min(sweeps):.1f}°) is below the 90° minimum (Blueprint §7 O2)",
            "raw": raw,
        }

    mean_r = round(statistics.mean(radii), 4)
    ann_half = (max(radii) - min(radii)) / 2.0
    fit_rms = max(fit_rms_list)
    h_rmse = float(calib["holdoutRmseM"])
    um = round(math.sqrt(h_rmse * h_rmse + fit_rms * fit_rms + ann_half * ann_half), 4)
    return {
        "name": "trace_radius_m",
        "observable": "O2",
        "status": "reconstructed",
        "value": mean_r,
        "unit": "m",
        "definition": "circle fit to support blade contact on calibrated ice plane over >=90° arc (fidelity-gate §4.3 O2; blade radius r_b, never pelvis path)",
        "method": {"id": "ice-plane-circle-fit/1", "rule": "Kasa circle fit on H-rectified blade_contact(phase=carve) from >=2 annotators"},
        "raw": raw,
        "uncertainty": {
            "kind": "homography+fit+annotator",
            "halfWidth_m": um,
            "derivation": f"RSS(holdoutRmse={h_rmse:.4f}m, fitRms={fit_rms:.4f}m, annotatorHalf={ann_half:.4f}m)",
        },
        "assumptions": ["blade contact points lie on the surveyed Y=0 ice plane", "steady carve window"],
        "validity": f"arc_sweep>={min(sweeps):.1f}deg",
        "promotable": True,
    }


def _ols_slope(xs: list[float], ys: list[float]) -> float:
    mx = statistics.mean(xs)
    my = statistics.mean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = sum((x - mx) ** 2 for x in xs)
    if den < 1e-12:
        return 0.0
    return num / den


def _compute_o4_glide_decay(
    manifest: dict[str, Any],
    calib: dict[str, Any] | None,
    annotations: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    blocked = _timing_blocked_reason(manifest)
    if blocked:
        return [
            {"name": "glide_decel_ms2", "observable": "O4", "status": "unavailable", "reason": blocked},
            {"name": "glide_loss_per_m", "observable": "O4", "status": "unavailable", "reason": blocked},
        ]
    if calib is None:
        return [
            {"name": "glide_decel_ms2", "observable": "O4", "status": "unavailable", "reason": "scale unknown; no surveyed ice-plane homography"},
            {"name": "glide_loss_per_m", "observable": "O4", "status": "unavailable", "reason": "scale unknown; no surveyed ice-plane homography"},
        ]

    proj = _projected_contacts(annotations, "glide", calib["homographyImageToIce"])
    valid = {ann: pts for ann, pts in proj.items() if len(pts) >= 3 and (pts[-1][0] - pts[0][0]) >= 0.5}
    if len(valid) < 2:
        reason = f"requires >=2 annotators with >=3 blade_contact(phase=glide) points over >=0.5s (found {len(valid)})"
        return [
            {"name": "glide_decel_ms2", "observable": "O4", "status": "unavailable", "reason": reason},
            {"name": "glide_loss_per_m", "observable": "O4", "status": "unavailable", "reason": reason},
        ]

    decels: list[float] = []
    losses: list[float] = []
    raw: dict[str, Any] = {}
    spans_t: list[float] = []
    spans_s: list[float] = []
    for ann, pts in valid.items():
        t_mids: list[float] = []
        s_mids: list[float] = []
        speeds: list[float] = []
        cum_s = 0.0
        for i in range(len(pts) - 1):
            t0, x0, z0 = pts[i]
            t1, x1, z1 = pts[i + 1]
            dt = t1 - t0
            if dt <= 0:
                continue
            ds = math.hypot(x1 - x0, z1 - z0)
            speeds.append(ds / dt)
            t_mids.append(0.5 * (t0 + t1))
            s_mids.append(cum_s + 0.5 * ds)
            cum_s += ds
        decel = -_ols_slope(t_mids, speeds)
        loss = -_ols_slope(s_mids, speeds)
        decels.append(decel)
        losses.append(loss)
        spans_t.append(pts[-1][0] - pts[0][0])
        spans_s.append(max(1e-6, cum_s))
        raw[ann] = {
            "pointCount": len(pts),
            "span_s": round(pts[-1][0] - pts[0][0], 4),
            "distance_m": round(cum_s, 4),
            "glide_decel_ms2": round(decel, 5),
            "glide_loss_per_m": round(loss, 5),
        }

    h_rmse = float(calib["holdoutRmseM"])
    mean_span_t = statistics.mean(spans_t)
    mean_span_s = statistics.mean(spans_s)
    um_decel = round(math.hypot(2.0 * h_rmse / (mean_span_t ** 2), (max(decels) - min(decels)) / 2.0), 5)
    um_loss = round(math.hypot(2.0 * h_rmse / (mean_span_t * mean_span_s), (max(losses) - min(losses)) / 2.0), 5)

    return [
        {
            "name": "glide_decel_ms2",
            "observable": "O4",
            "status": "reconstructed",
            "value": round(statistics.mean(decels), 5),
            "unit": "m/s^2",
            "definition": "-dv/dt on a held edge with no push over calibrated ice-plane contacts (fidelity-gate §4.3 O4)",
            "method": {"id": "ice-plane-glide-ols/1", "rule": "OLS slope of interval speeds from H-rectified blade_contact(phase=glide)"},
            "raw": raw,
            "uncertainty": {"kind": "homography+annotator", "halfWidth_ms2": um_decel, "derivation": "RSS(2*holdoutRmse/span_t^2, annotatorHalf)"},
            "assumptions": ["no push during glide window", "shot is real time"],
            "validity": "calibrated ice plane; ice state should be recorded with case",
            "promotable": True,
        },
        {
            "name": "glide_loss_per_m",
            "observable": "O4",
            "status": "reconstructed",
            "value": round(statistics.mean(losses), 5),
            "unit": "1/s",
            "definition": "-dv/dx on a held edge with no push over calibrated ice-plane contacts (fidelity-gate §4.3 O4)",
            "method": {"id": "ice-plane-glide-ols/1", "rule": "OLS slope of interval speeds vs arc distance"},
            "raw": raw,
            "uncertainty": {"kind": "homography+annotator", "halfWidth_per_s": um_loss, "derivation": "RSS(2*holdoutRmse/(span_t*span_s), annotatorHalf)"},
            "assumptions": ["no push during glide window", "shot is real time"],
            "validity": "calibrated ice plane",
            "promotable": True,
        },
    ]


def _compute_o7_stroke_gain(
    manifest: dict[str, Any],
    calib: dict[str, Any] | None,
    annotations: dict[str, list[dict[str, Any]]],
) -> dict[str, Any]:
    blocked = _timing_blocked_reason(manifest)
    if blocked:
        return {"name": "stroke_gain_ms", "observable": "O7", "status": "unavailable", "reason": blocked}
    if calib is None:
        return {"name": "stroke_gain_ms", "observable": "O7", "status": "unavailable", "reason": "scale unknown; no surveyed ice-plane homography"}

    before = _projected_contacts(annotations, "stroke_before", calib["homographyImageToIce"])
    after = _projected_contacts(annotations, "stroke_after", calib["homographyImageToIce"])
    common = sorted(ann for ann in before if ann in after and len(before[ann]) >= 2 and len(after[ann]) >= 2)
    if len(common) < 2:
        return {
            "name": "stroke_gain_ms",
            "observable": "O7",
            "status": "unavailable",
            "reason": f"requires >=2 annotators with >=2 blade_contact points in both stroke_before and stroke_after (found {len(common)})",
        }

    gains: list[float] = []
    raw: dict[str, Any] = {}
    u_pos_terms: list[float] = []
    h_rmse = float(calib["holdoutRmseM"])
    for ann in common:
        b_pts = before[ann]
        a_pts = after[ann]
        dt_b = b_pts[-1][0] - b_pts[0][0]
        dt_a = a_pts[-1][0] - a_pts[0][0]
        if dt_b <= 0 or dt_a <= 0:
            continue
        v_b = math.hypot(b_pts[-1][1] - b_pts[0][1], b_pts[-1][2] - b_pts[0][2]) / dt_b
        v_a = math.hypot(a_pts[-1][1] - a_pts[0][1], a_pts[-1][2] - a_pts[0][2]) / dt_a
        gain = v_a - v_b
        gains.append(gain)
        u_pos_terms.append(math.hypot(math.sqrt(2.0) * h_rmse / dt_b, math.sqrt(2.0) * h_rmse / dt_a))
        raw[ann] = {
            "vBefore_ms": round(v_b, 4),
            "vAfter_ms": round(v_a, 4),
            "strokeGain_ms": round(gain, 4),
        }

    if len(gains) < 2:
        return {"name": "stroke_gain_ms", "observable": "O7", "status": "unavailable", "reason": "invalid non-positive stroke window durations"}

    um = round(math.hypot(max(u_pos_terms), (max(gains) - min(gains)) / 2.0), 4)
    return {
        "name": "stroke_gain_ms",
        "observable": "O7",
        "status": "reconstructed",
        "value": round(statistics.mean(gains), 4),
        "unit": "m/s",
        "definition": "ice-plane speed after minus speed before one stroke (fidelity-gate §4.3 O7; speed gain, never blade force)",
        "method": {"id": "ice-plane-stroke-delta/1", "rule": "v_after - v_before from H-rectified blade_contact windows"},
        "raw": raw,
        "uncertainty": {"kind": "homography+annotator", "halfWidth_ms": um, "derivation": "RSS(propagated holdoutRmse/dt, annotatorHalf)"},
        "assumptions": ["shot is real time", "push effort unknown (one-sided propulsion_reachable for own footage)"],
        "validity": "calibrated ice plane",
        "promotable": True,
    }


def run_metrics(
    take_dir: Path,
    shot_id: str,
    observables: list[str],
    clip_id: str | None = None,
) -> Path:
    """Compute requested evidence-lane observables and write `edgework-evidence/1`."""
    t0 = time.monotonic()
    _validate_safe_id(shot_id, "shot")
    for obs in observables:
        if obs not in ALL_OBSERVABLES:
            raise EdgeworkVideoError(
                f"Unknown observable '{obs}' (expected comma-separated subset of {', '.join(ALL_OBSERVABLES)}).",
                EXIT_INVALID_INPUT,
            )
    verify_take(take_dir)

    manifest_path = take_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    frames_doc = json.loads((take_dir / "probe/frames.json").read_text(encoding="utf-8"))
    annotations = load_shot_annotations(take_dir, shot_id)
    calib = _load_accepted_calibration(take_dir, shot_id)

    resolved_clip = clip_id or f"{manifest['takeId']}-{shot_id}"
    _validate_safe_id(resolved_clip, "clip")

    metrics_list: list[dict[str, Any]] = []
    for obs in observables:
        if obs == "O5":
            metrics_list.append(_compute_o5_air_time(manifest, frames_doc, annotations))
            metrics_list.append(_compute_o5_revolutions(manifest, annotations))
        elif obs == "O6":
            metrics_list.extend(_compute_o6_metrics(manifest, frames_doc, annotations))
        elif obs == "O2":
            metrics_list.append(_compute_o2_trace_radius(calib, annotations))
        elif obs == "O4":
            metrics_list.extend(_compute_o4_glide_decay(manifest, calib, annotations))
        elif obs == "O7":
            metrics_list.append(_compute_o7_stroke_gain(manifest, calib, annotations))
        else:
            metrics_list.extend(_unavailable_plane_metrics(obs))

    event_time_status = "assumed-live" if manifest["playback"] == "live" else f"unverified-{manifest['playback']}"
    checks_performed = ["schema", "pts-monotonic"]
    if len(annotations) >= 2:
        checks_performed.append("annotator-agreement")
    if calib is not None:
        checks_performed.append("homography-holdout")

    frames_block: dict[str, Any] = (
        {
            "image": "I",
            "plane": "P",
            "scale": {
                "status": calib["scaleStatus"],
                "source": calib["scaleSource"],
                "holdoutRmseM": calib["holdoutRmseM"],
            },
        }
        if calib is not None
        else {
            "image": "I",
            "plane": None,
            "scale": {"status": "unknown", "reason": "no surveyed landmarks in view"},
        }
    )

    sidecar: dict[str, Any] = {
        "schema": "edgework-evidence/1",
        "take": manifest["takeId"],
        "shot": shot_id,
        "clip": resolved_clip,
        "inputs": {
            "manifestSha256": sha256_file(manifest_path),
            "sourceSha256": manifest["source"]["sha256"],
            "exportSha256": None,
            "annotations": sorted(annotations.keys()),
        },
        "time": {
            "base": "source pts, seconds",
            "fps": frames_doc["nominalFps"],
            "playback": manifest["playback"],
            "eventTimeStatus": event_time_status,
        },
        "frames": frames_block,
        "metrics": metrics_list,
        "rejectedIntervals": _extract_rejected_intervals(annotations),
        "checks": {
            "performed": checks_performed,
            "planned": ["reference-camera-240fps"],
        },
        "review": {"status": "unreviewed"},
    }

    errors = validate_evidence_sidecar(sidecar)
    if errors:
        raise EdgeworkVideoError(
            f"Derived evidence sidecar failed schema validation: {'; '.join(errors)}",
            EXIT_BACKEND_FAILURE,
        )

    out_bytes = _deterministic_json_bytes(sidecar)
    ev_dir = take_dir / "shots" / shot_id / "evidence"
    logs_dir = take_dir / "logs"
    ev_dir.mkdir(parents=True, exist_ok=True)
    logs_dir.mkdir(parents=True, exist_ok=True)

    out_path = ev_dir / f"{resolved_clip}.evidence.json"
    out_path.write_bytes(out_bytes)

    elapsed_ms = round((time.monotonic() - t0) * 1000.0, 2)
    utc_now = _dt.datetime.now(_dt.timezone.utc)
    run_id = f"metrics-{utc_now.strftime('%Y%m%dT%H%M%SZ')}-{os.getpid()}"
    run_log = {
        "runId": run_id,
        "command": "metrics",
        "utc": utc_now.isoformat(),
        "elapsedMs": elapsed_ms,
        "shot": shot_id,
        "clip": resolved_clip,
        "observables": observables,
        "outputSha256": sha256_bytes(out_bytes),
    }
    (logs_dir / f"{run_id}.json").write_bytes(_deterministic_json_bytes(run_log))

    return out_path
