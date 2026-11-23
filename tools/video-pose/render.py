"""Math-driven 3D wireframe renderer (Pillow + FFmpeg).

Draws the 17-bone wireframe, confidence-colored joints, ice-plane tracing ribbon,
and live kinematic telemetry HUD directly from `edgework-wireframe/1` coordinates so
the visual wireframe and the mathematical data can never disagree.
"""

from __future__ import annotations

import math
import subprocess
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .schema import WIREFRAME_BONES, WIREFRAME_JOINTS, to_yup


def _confidence_color(conf: float) -> tuple[int, int, int]:
    if conf >= 0.75:
        return (72, 230, 255)   # high confidence: crisp ice cyan
    if conf >= 0.35:
        return (245, 194, 82)   # medium confidence: amber
    return (240, 86, 86)        # masked (<0.35): red warning


def _project_3d(
    pt: np.ndarray,
    cam_pos: np.ndarray,
    cam_target: np.ndarray,
    width: int,
    height: int,
    fov_deg: float = 42.0,
) -> tuple[float, float, float] | None:
    fwd = cam_target - cam_pos
    fn = float(np.linalg.norm(fwd))
    if fn < 1e-6:
        return None
    fwd = fwd / fn
    up_hint = np.array([0.0, 1.0, 0.0], dtype=np.float64)
    right = np.cross(fwd, up_hint)
    rn = float(np.linalg.norm(right))
    if rn < 1e-6:
        return None
    right = right / rn
    up = np.cross(right, fwd)

    rel = pt - cam_pos
    depth = float(np.dot(rel, fwd))
    if depth <= 0.15:
        return None
    f = (0.5 * height) / math.tan(math.radians(fov_deg * 0.5))
    sx = 0.5 * width + (float(np.dot(rel, right)) / depth) * f
    sy = 0.5 * height - (float(np.dot(rel, up)) / depth) * f
    return sx, sy, depth


def render_wireframe_video(
    seq: dict[str, Any],
    out_mp4: Path,
    *,
    metrics: dict[str, Any] | None = None,
    width: int = 960,
    height: int = 540,
    source_video: Path | None = None,
) -> Path:
    """Renders an MP4 wireframe visualization directly from `edgework-wireframe/1` JSON via FFmpeg."""
    frames = seq["frames"]
    meta = seq["meta"]
    space = str(meta["coordSpace"])
    fps = float(meta["fps"])
    out_mp4.parent.mkdir(parents=True, exist_ok=True)

    # Pre-collect world pelvis positions for smooth camera framing + ground trail.
    pelvis_pts: list[np.ndarray] = []
    min_y = 0.0
    for f in frames:
        pel = f.get("joints", {}).get("pelvis")
        p = to_yup(pel, space) if pel is not None else np.array([0.0, 0.9, 0.0])
        pelvis_pts.append(p)
        for j in ("ankleL", "ankleR"):
            if j in f.get("joints", {}):
                ay = float(to_yup(f["joints"][j], space)[1])
                if ay < min_y:
                    min_y = ay

    target_mp4 = out_mp4 if source_video is None else out_mp4.with_suffix(".wireframe-only.mp4")
    cmd = [
        "ffmpeg", "-y", "-v", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24",
        "-s", f"{width}x{height}", "-r", f"{fps:.3f}",
        "-i", "pipe:0",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
        str(target_mp4),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    assert proc.stdin is not None
    font = ImageFont.load_default()

    trail_world: list[np.ndarray] = []
    cam_smooth = pelvis_pts[0].copy()
    prev_yaw: float | None = None
    prev_t: float | None = None

    for idx, f in enumerate(frames):
        img = Image.new("RGB", (width, height), (12, 18, 28))
        draw = ImageDraw.Draw(img)

        pel = pelvis_pts[idx]
        cam_smooth = cam_smooth * 0.85 + pel * 0.15
        cam_target = np.array([cam_smooth[0], max(0.85, cam_smooth[1] * 0.9), cam_smooth[2]])
        cam_pos = cam_target + np.array([2.4, 1.35, 3.8])

        # Draw subtle 1 m ice-sheet grid centered near the skater.
        gx0 = int(math.floor(cam_target[0])) - 5
        gz0 = int(math.floor(cam_target[2])) - 5
        for gx in range(gx0, gx0 + 11):
            p1 = _project_3d(np.array([float(gx), min_y, float(gz0)]), cam_pos, cam_target, width, height)
            p2 = _project_3d(np.array([float(gx), min_y, float(gz0 + 10)]), cam_pos, cam_target, width, height)
            if p1 and p2:
                draw.line([(p1[0], p1[1]), (p2[0], p2[1])], fill=(26, 40, 58), width=1)
        for gz in range(gz0, gz0 + 11):
            p1 = _project_3d(np.array([float(gx0), min_y, float(gz)]), cam_pos, cam_target, width, height)
            p2 = _project_3d(np.array([float(gx0 + 10), min_y, float(gz)]), cam_pos, cam_target, width, height)
            if p1 and p2:
                draw.line([(p1[0], p1[1]), (p2[0], p2[1])], fill=(26, 40, 58), width=1)

        # Ground blade tracing trail (projected pelvis footprint on ice).
        trail_world.append(np.array([pel[0], min_y + 0.01, pel[2]]))
        if len(trail_world) >= 2:
            prev_2d = None
            for tp in trail_world[-180:]:
                cur_2d = _project_3d(tp, cam_pos, cam_target, width, height)
                if prev_2d and cur_2d:
                    draw.line([(prev_2d[0], prev_2d[1]), (cur_2d[0], cur_2d[1])], fill=(90, 175, 220), width=2)
                prev_2d = cur_2d

        # Project all 18 joints and draw 17 wireframe bones.
        pts_3d: dict[str, np.ndarray] = {}
        pts_2d: dict[str, tuple[float, float]] = {}
        confs: dict[str, float] = {}
        for j in WIREFRAME_JOINTS:
            raw = f.get("joints", {}).get(j)
            if raw is None:
                continue
            v = to_yup(raw, space)
            pts_3d[j] = v
            confs[j] = float(f.get("confidence", {}).get(j, 1.0))
            pr = _project_3d(v, cam_pos, cam_target, width, height)
            if pr:
                pts_2d[j] = (pr[0], pr[1])

        for a, b in WIREFRAME_BONES:
            if a in pts_2d and b in pts_2d:
                c = min(confs.get(a, 1.0), confs.get(b, 1.0))
                draw.line([pts_2d[a], pts_2d[b]], fill=_confidence_color(c), width=3)

        for j, (sx, sy) in pts_2d.items():
            col = _confidence_color(confs.get(j, 1.0))
            r = 4 if j in ("pelvis", "chest", "crown") else 3
            draw.ellipse([sx - r, sy - r, sx + r, sy + r], fill=col, outline=(10, 14, 22))

        # Per-frame math HUD overlay.
        t = float(f["t"])
        spread = float(np.linalg.norm(pts_3d["wristR"] - pts_3d["wristL"])) if ("wristL" in pts_3d and "wristR" in pts_3d) else 0.0
        lean_deg = 0.0
        if "pelvis" in pts_3d and "chest" in pts_3d:
            tr = pts_3d["chest"] - pts_3d["pelvis"]
            tn = float(np.linalg.norm(tr))
            if tn > 1e-4:
                lean_deg = math.degrees(math.acos(max(-1.0, min(1.0, float(tr[1]) / tn))))

        yaw = f.get("rootYawRad")
        omega = 0.0
        if yaw is not None and prev_yaw is not None and prev_t is not None and t > prev_t:
            dy = float(yaw) - prev_yaw
            while dy > math.pi:
                dy -= 2.0 * math.pi
            while dy < -math.pi:
                dy += 2.0 * math.pi
            omega = abs(dy / (t - prev_t))
        if yaw is not None:
            prev_yaw = float(yaw)
            prev_t = t

        airborne = ("ankleL" in pts_3d and "ankleR" in pts_3d and (pts_3d["ankleL"][1] - min_y > 0.04) and (pts_3d["ankleR"][1] - min_y > 0.04))
        mean_c = float(np.mean(list(confs.values()))) if confs else 0.0
        flags = f.get("flags", [])

        draw.rectangle([14, 14, 370, 162], fill=(16, 25, 38), outline=(55, 84, 114))
        hud_lines = [
            f"EDGEWORK WIREFRAME  [{seq['id']}]",
            f"t = {t:5.2f} s   frame {idx + 1}/{len(frames)}   fps {fps:.0f}",
            f"space: {space}   world-grounded: {'YES' if meta.get('cameraCompensated') else 'NO (camera)'}",
            f"trunk lean: {lean_deg:5.1f} deg   arm spread: {spread:4.2f} m",
            f"yaw rate:   {omega:5.1f} rad/s   conf: {mean_c:4.2f}",
            f"state: {'AIRBORNE' if airborne else 'ON ICE'}" + (f"   FLAGS: {','.join(flags)}" if flags else ""),
        ]
        for li, line in enumerate(hud_lines):
            col = (245, 194, 82) if (li == 5 and (airborne or flags)) else (218, 232, 245)
            draw.text((24, 24 + li * 21), line, fill=col, font=font)

        if metrics:
            obs = metrics.get("observables", {})
            draw.rectangle([width - 300, 14, width - 14, 140], fill=(16, 25, 38), outline=(55, 84, 114))
            o1 = obs.get("O1_carve", {}).get("median")
            o2 = obs.get("O2_tracing", {}).get("value")
            o5 = obs.get("O5_jump", {}).get("value")
            o6 = obs.get("O6_inertia", {}).get("spin_up_ratio")
            side_lines = [
                "VALIDATION SIDECAR (CANDIDATE)",
                f"O1 carve lean: {o1} deg" if o1 is not None else "O1 carve lean: --",
                f"O2 trace radius: {o2} m" if o2 is not None else "O2 trace radius: --",
                f"O5 jump air time: {o5} s" if o5 is not None else "O5 jump air time: --",
                f"O6 spin-up ratio: {o6}x" if o6 is not None else "O6 spin-up ratio: --",
            ]
            for li, line in enumerate(side_lines):
                draw.text((width - 288, 24 + li * 21), line, fill=(160, 218, 240) if li == 0 else (218, 232, 245), font=font)

        proc.stdin.write(img.tobytes())

    proc.stdin.close()
    err = proc.stderr.read().decode("utf-8", "replace") if proc.stderr else ""
    if proc.wait() != 0:
        raise RuntimeError(f"ffmpeg wireframe render failed: {err.strip()}")

    if source_video is not None:
        # Side-by-side composite: original source video (left) | math-driven wireframe (right).
        comp = subprocess.run(
            [
                "ffmpeg", "-y", "-v", "error",
                "-i", str(source_video), "-i", str(target_mp4),
                "-filter_complex",
                f"[0:v]scale=-2:{height},setsar=1[left];[1:v]setsar=1[right];[left][right]hstack=inputs=2[v]",
                "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-shortest",
                str(out_mp4),
            ],
            stderr=subprocess.PIPE, check=False,
        )
        if comp.returncode != 0:
            raise RuntimeError(f"ffmpeg side-by-side composite failed: {comp.stderr.decode('utf-8', 'replace').strip()}")
        target_mp4.unlink(missing_ok=True)

    return out_mp4
