"""`edgework-video shots` — PTS-indexed shot/cut detection (std-lib + ffmpeg).

Detects hard cuts using ffmpeg's `select='gt(scene,THRESHOLD)'` scene score
mapped back onto `probe/frames.json` PTS timestamps, splits the take into
continuous shots, and flags shots shorter than `--min-shot-s` (default 2.0 s,
authored per Blueprint §4.1) as rejected.
"""

from __future__ import annotations

import datetime as _dt
import json
import os
from pathlib import Path
import re
import subprocess
import time
from typing import Any

from . import EXIT_BACKEND_FAILURE, EXIT_INVALID_INPUT, EdgeworkVideoError
from .intake import _deterministic_json_bytes, sha256_bytes, verify_take

PTS_TIME_RE = re.compile(r"pts_time:([0-9.]+)")


def detect_cuts_ffmpeg(video_path: Path, threshold: float, ffmpeg_bin: str = "ffmpeg") -> list[float]:
    """Return sorted scene-cut timestamps (seconds) from ffmpeg's scene filter."""
    if not (0.0 < threshold < 1.0):
        raise EdgeworkVideoError("scene threshold must be in (0, 1).", EXIT_INVALID_INPUT)
    cmd = [
        ffmpeg_bin,
        "-hide_banner",
        "-i",
        str(video_path),
        "-vf",
        f"select='gt(scene,{threshold})',showinfo",
        "-f",
        "null",
        "-",
    ]
    try:
        proc = subprocess.run(cmd, check=False, capture_output=True, text=True)
    except OSError as exc:
        raise EdgeworkVideoError(f"Could not run {ffmpeg_bin}: {exc}", EXIT_BACKEND_FAILURE) from exc
    if proc.returncode != 0:
        raise EdgeworkVideoError(
            f"ffmpeg scene detection failed (exit {proc.returncode}): {proc.stderr.strip()[-300:]}",
            EXIT_BACKEND_FAILURE,
        )
    cuts: list[float] = []
    for match in PTS_TIME_RE.finditer(proc.stderr):
        cuts.append(float(match.group(1)))
    return sorted(set(cuts))


def build_shots_from_cuts(
    frames_doc: dict[str, Any],
    cut_times_sec: list[float],
    min_shot_s: float = 2.0,
    playback: str = "unknown",
) -> dict[str, Any]:
    """Partition `probe/frames.json` into continuous shot intervals at `cut_times_sec`."""
    frames = frames_doc["frames"]
    n = len(frames)
    cut_indices: list[int] = [0]
    for ct in sorted(cut_times_sec):
        # Find nearest frame index whose tSec >= ct (strictly > previous cut).
        for i in range(cut_indices[-1] + 1, n):
            if frames[i]["tSec"] >= ct - 1e-6:
                cut_indices.append(i)
                break
    cut_indices.append(n)

    shots: list[dict[str, Any]] = []
    for s_idx in range(len(cut_indices) - 1):
        start_i = cut_indices[s_idx]
        end_i = cut_indices[s_idx + 1] - 1
        if end_i < start_i:
            continue
        t_start = frames[start_i]["tSec"]
        last_dur = frames[end_i]["durationSec"] or (frames_doc.get("medianDurationSec") or 0.0)
        t_end = round(frames[end_i]["tSec"] + float(last_dur), 6)
        dur_s = round(max(0.0, t_end - t_start), 6)
        accepted = dur_s >= min_shot_s
        shot_entry: dict[str, Any] = {
            "id": f"S{s_idx + 1:02d}",
            "startFrame": start_i,
            "endFrame": end_i,
            "frameCount": end_i - start_i + 1,
            "ptsStart": frames[start_i]["pts"],
            "ptsEnd": frames[end_i]["pts"],
            "tStartSec": t_start,
            "tEndSec": t_end,
            "durationSec": dur_s,
            "kind": playback if playback in {"live", "slowmo"} else "unknown",
            "accepted": accepted,
        }
        if not accepted:
            shot_entry["rejectReason"] = f"duration {dur_s:.3f}s < min_shot_s {min_shot_s:.3f}s"
        shots.append(shot_entry)

    return {
        "schema": "edgework-shots/1",
        "sourceSha256": frames_doc["sourceSha256"],
        "minShotSec": min_shot_s,
        "shotCount": len(shots),
        "shots": shots,
    }


def run_shots(
    take_dir: Path,
    video_path: Path,
    threshold: float = 0.35,
    min_shot_s: float = 2.0,
    ffmpeg_bin: str = "ffmpeg",
) -> Path:
    """Detect cuts on `video_path` and write deterministic `shots/shots.json` inside `take_dir`."""
    t0 = time.monotonic()
    if not video_path.is_file():
        raise EdgeworkVideoError(f"Video file not found: {video_path}", EXIT_INVALID_INPUT)
    verify_take(take_dir)

    manifest = json.loads((take_dir / "manifest.json").read_text(encoding="utf-8"))
    frames_doc = json.loads((take_dir / "probe/frames.json").read_text(encoding="utf-8"))

    cuts = detect_cuts_ffmpeg(video_path, threshold=threshold, ffmpeg_bin=ffmpeg_bin)
    shots_doc = build_shots_from_cuts(
        frames_doc,
        cuts,
        min_shot_s=min_shot_s,
        playback=manifest.get("playback", "unknown"),
    )

    out_bytes = _deterministic_json_bytes(shots_doc)
    shots_dir = take_dir / "shots"
    logs_dir = take_dir / "logs"
    shots_dir.mkdir(parents=True, exist_ok=True)
    logs_dir.mkdir(parents=True, exist_ok=True)

    out_path = shots_dir / "shots.json"
    out_path.write_bytes(out_bytes)

    elapsed_ms = round((time.monotonic() - t0) * 1000.0, 2)
    utc_now = _dt.datetime.now(_dt.timezone.utc)
    run_id = f"shots-{utc_now.strftime('%Y%m%dT%H%M%SZ')}-{os.getpid()}"
    run_log = {
        "runId": run_id,
        "command": "shots",
        "utc": utc_now.isoformat(),
        "elapsedMs": elapsed_ms,
        "threshold": threshold,
        "minShotSec": min_shot_s,
        "shotCount": shots_doc["shotCount"],
        "outputSha256": sha256_bytes(out_bytes),
    }
    (logs_dir / f"{run_id}.json").write_bytes(_deterministic_json_bytes(run_log))
    return out_path
