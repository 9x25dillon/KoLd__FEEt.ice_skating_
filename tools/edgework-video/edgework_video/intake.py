"""`edgework-video intake` and `edgework-video verify` implementation.

Blueprint §11 contract:
  - Refuse with exit 3 without `authorization.basis` or if `--takes-root` is inside a git worktree.
  - Stream SHA-256 of the source video without copying the video.
  - Run `ffprobe -show_streams -show_format -show_frames -of json` on the video stream and
    store the stream/format output untouched in `probe/streams.json`.
  - Derive `probe/frames.json` (`edgework-frames/1`): index, integer PTS, time base, exact
    rational & float seconds, duration, keyFrame, interlace flags, rotation side data, and
    VFR flag (any frame duration deviating > 1% from the median).
  - Write deterministic `manifest.json` (`edgework-take/1`) with tool versions and probe hashes.
  - Write a separate run log in `logs/` (excluded from byte-for-byte determinism checks).
"""

from __future__ import annotations

import datetime as _dt
from fractions import Fraction
import hashlib
import json
import os
from pathlib import Path
import platform
import statistics
import subprocess
import time
from typing import Any

from . import (
    EXIT_BACKEND_FAILURE,
    EXIT_INVALID_INPUT,
    EXIT_PRECONDITION_UNMET,
    EdgeworkVideoError,
    __version__,
)
from .schemas import validate_frames_doc, validate_input_manifest, validate_take_manifest

VFR_THRESHOLD_FRACTION = 0.01
HASH_CHUNK_BYTES = 1024 * 1024


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while True:
            chunk = fh.read(HASH_CHUNK_BYTES)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def is_inside_git_worktree(path: Path) -> bool:
    """Return True if `path` or any ancestor contains a `.git` file or directory."""
    resolved = path.resolve()
    for candidate in (resolved, *resolved.parents):
        if (candidate / ".git").exists():
            return True
    return False


def _deterministic_json_bytes(obj: Any) -> bytes:
    return (json.dumps(obj, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode("utf-8")


def _ffprobe_version(ffprobe_bin: str) -> str:
    try:
        proc = subprocess.run(
            [ffprobe_bin, "-version"],
            check=False,
            capture_output=True,
            text=True,
        )
    except OSError as exc:
        raise EdgeworkVideoError(f"Could not run {ffprobe_bin}: {exc}", EXIT_BACKEND_FAILURE) from exc
    if proc.returncode != 0:
        raise EdgeworkVideoError(
            f"{ffprobe_bin} -version failed (exit {proc.returncode}): {proc.stderr.strip()}",
            EXIT_BACKEND_FAILURE,
        )
    first_line = (proc.stdout.splitlines() or ["unknown"])[0].strip()
    return first_line


def _run_ffprobe(video_path: Path, ffprobe_bin: str) -> dict[str, Any]:
    cmd = [
        ffprobe_bin,
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_streams",
        "-show_format",
        "-show_frames",
        "-of",
        "json",
        str(video_path),
    ]
    try:
        proc = subprocess.run(cmd, check=False, capture_output=True, text=True)
    except OSError as exc:
        raise EdgeworkVideoError(f"Could not run {ffprobe_bin}: {exc}", EXIT_BACKEND_FAILURE) from exc
    if proc.returncode != 0:
        raise EdgeworkVideoError(
            f"ffprobe failed (exit {proc.returncode}): {proc.stderr.strip()}",
            EXIT_BACKEND_FAILURE,
        )
    try:
        parsed = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise EdgeworkVideoError(f"ffprobe returned invalid JSON: {exc}", EXIT_BACKEND_FAILURE) from exc
    if not isinstance(parsed, dict):
        raise EdgeworkVideoError("ffprobe output was not a JSON object.", EXIT_BACKEND_FAILURE)
    return parsed


def _parse_rational(raw: str | None, field: str) -> Fraction:
    if not raw or "/" not in raw:
        raise EdgeworkVideoError(f"Unreadable rational '{raw}' for {field}.", EXIT_BACKEND_FAILURE)
    num_s, den_s = raw.split("/", 1)
    try:
        num = int(num_s)
        den = int(den_s)
    except ValueError as exc:
        raise EdgeworkVideoError(f"Invalid rational '{raw}' for {field}.", EXIT_BACKEND_FAILURE) from exc
    if den <= 0:
        raise EdgeworkVideoError(f"Non-positive denominator in '{raw}' for {field}.", EXIT_BACKEND_FAILURE)
    return Fraction(num, den)


def _extract_rotation_deg(stream: dict[str, Any]) -> float:
    for sd in stream.get("side_data_list") or []:
        if isinstance(sd, dict) and "rotation" in sd:
            try:
                return float(sd["rotation"])
            except (TypeError, ValueError):
                pass
    tags = stream.get("tags") or {}
    if isinstance(tags, dict) and "rotate" in tags:
        try:
            return float(tags["rotate"])
        except (TypeError, ValueError):
            pass
    return 0.0


def _extract_nominal_fps(stream: dict[str, Any]) -> float:
    for key in ("avg_frame_rate", "r_frame_rate"):
        raw = stream.get(key)
        if isinstance(raw, str) and "/" in raw:
            try:
                frac = _parse_rational(raw, key)
                if frac > 0:
                    return round(float(frac), 6)
            except EdgeworkVideoError:
                continue
    raise EdgeworkVideoError("Could not determine nominal frame rate from stream.", EXIT_BACKEND_FAILURE)


def _parse_int_field(frame: dict[str, Any], *keys: str) -> int | None:
    for key in keys:
        val = frame.get(key)
        if val is not None and val != "N/A":
            try:
                return int(val)
            except (TypeError, ValueError):
                continue
    return None


def _build_frames_doc(
    stream: dict[str, Any],
    raw_frames: list[dict[str, Any]],
    source_sha256: str,
) -> dict[str, Any]:
    if not raw_frames:
        raise EdgeworkVideoError("Video stream contains no decodable frames.", EXIT_BACKEND_FAILURE)

    tb_str = str(stream.get("time_base") or "")
    tb = _parse_rational(tb_str, "stream.time_base")
    nominal_fps = _extract_nominal_fps(stream)
    rotation_deg = _extract_rotation_deg(stream)
    field_order = str(stream.get("field_order") or "unknown")
    stream_index = int(stream.get("index", 0))

    frames: list[dict[str, Any]] = []
    prev_pts: int | None = None
    any_interlaced = field_order not in {"progressive", "unknown", ""}

    for idx, rf in enumerate(raw_frames):
        if not isinstance(rf, dict):
            raise EdgeworkVideoError(f"Frame {idx} from ffprobe was not an object.", EXIT_BACKEND_FAILURE)
        pts = _parse_int_field(rf, "pts", "best_effort_timestamp")
        if pts is None:
            raise EdgeworkVideoError(
                f"Frame {idx} has unreadable PTS (refusing to invent t = i / fps).",
                EXIT_BACKEND_FAILURE,
            )
        if prev_pts is not None and pts <= prev_pts:
            raise EdgeworkVideoError(
                f"Non-monotonic PTS at frame {idx}: {pts} <= {prev_pts}.",
                EXIT_BACKEND_FAILURE,
            )
        prev_pts = pts

        t_frac = Fraction(pts) * tb
        dur_pts = _parse_int_field(rf, "duration", "pkt_duration")
        dur_sec = round(float(Fraction(dur_pts) * tb), 9) if dur_pts is not None and dur_pts > 0 else None

        interlaced_frame = bool(int(rf.get("interlaced_frame", 0) or 0))
        top_field_first = bool(int(rf.get("top_field_first", 0) or 0))
        key_frame = bool(int(rf.get("key_frame", 0) or 0))
        if interlaced_frame:
            any_interlaced = True

        frames.append(
            {
                "index": idx,
                "pts": pts,
                "timeBase": tb_str,
                "tExact": f"{t_frac.numerator}/{t_frac.denominator}",
                "tSec": round(float(t_frac), 9),
                "durationPts": dur_pts,
                "durationSec": dur_sec,
                "keyFrame": key_frame,
                "interlacedFrame": interlaced_frame,
                "topFieldFirst": top_field_first,
            }
        )

    # Compute VFR from consecutive PTS deltas (most faithful to container presentation timing),
    # falling back to declared frame durations only for single-frame clips.
    deltas_sec: list[float] = []
    if len(frames) >= 2:
        for i in range(len(frames) - 1):
            d_pts = frames[i + 1]["pts"] - frames[i]["pts"]
            deltas_sec.append(float(Fraction(d_pts) * tb))
    elif frames[0]["durationSec"] is not None:
        deltas_sec.append(float(frames[0]["durationSec"]))

    median_dur: float | None = None
    vfr = False
    if deltas_sec:
        median_dur = round(float(statistics.median(deltas_sec)), 9)
        if median_dur > 0:
            vfr = any(abs(d - median_dur) / median_dur > VFR_THRESHOLD_FRACTION for d in deltas_sec)

    return {
        "schema": "edgework-frames/1",
        "sourceSha256": source_sha256,
        "streamIndex": stream_index,
        "timeBase": tb_str,
        "nominalFps": nominal_fps,
        "frameCount": len(frames),
        "vfr": vfr,
        "vfrThresholdFraction": VFR_THRESHOLD_FRACTION,
        "medianDurationSec": median_dur,
        "rotationDeg": rotation_deg,
        "fieldOrder": field_order,
        "interlaced": any_interlaced,
        "frames": frames,
    }


def run_intake(
    video_path: Path,
    manifest_path: Path,
    takes_root: Path,
    ffprobe_bin: str = "ffprobe",
) -> Path:
    """Execute `edgework-video intake` and return the created take directory."""
    t0 = time.monotonic()

    if not video_path.is_file():
        raise EdgeworkVideoError(f"Video file not found: {video_path}", EXIT_INVALID_INPUT)
    if not manifest_path.is_file():
        raise EdgeworkVideoError(f"Manifest file not found: {manifest_path}", EXIT_INVALID_INPUT)

    try:
        input_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise EdgeworkVideoError(f"Could not parse manifest JSON: {exc}", EXIT_INVALID_INPUT) from exc

    # Authorization gate runs before any writes or probing (exit 3 if missing).
    validated = validate_input_manifest(input_manifest)

    # Repo-boundary guard: never write takes inside a git worktree (exit 3).
    if is_inside_git_worktree(takes_root):
        raise EdgeworkVideoError(
            f"Refusing --takes-root inside a git worktree: {takes_root.resolve()}",
            EXIT_PRECONDITION_UNMET,
        )

    take_id = validated["takeId"]
    take_dir = takes_root.resolve() / take_id
    if is_inside_git_worktree(take_dir):
        raise EdgeworkVideoError(
            f"Refusing take directory inside a git worktree: {take_dir}",
            EXIT_PRECONDITION_UNMET,
        )

    ffprobe_ver = _ffprobe_version(ffprobe_bin)
    source_sha256 = sha256_file(video_path)
    source_size = video_path.stat().st_size

    raw_probe = _run_ffprobe(video_path, ffprobe_bin)
    streams = raw_probe.get("streams") or []
    if not streams or not isinstance(streams[0], dict):
        raise EdgeworkVideoError("No video stream found by ffprobe.", EXIT_BACKEND_FAILURE)
    video_stream = streams[0]
    raw_frames = raw_probe.get("frames") or []

    streams_doc = {
        "format": raw_probe.get("format", {}),
        "streams": streams,
    }
    frames_doc = _build_frames_doc(video_stream, raw_frames, source_sha256)

    frame_errors = validate_frames_doc(frames_doc)
    if frame_errors:
        raise EdgeworkVideoError(
            f"Derived frames.json failed schema validation: {'; '.join(frame_errors)}",
            EXIT_BACKEND_FAILURE,
        )

    streams_bytes = _deterministic_json_bytes(streams_doc)
    frames_bytes = _deterministic_json_bytes(frames_doc)
    streams_sha256 = sha256_bytes(streams_bytes)
    frames_sha256 = sha256_bytes(frames_bytes)

    manifest_out: dict[str, Any] = {
        "schema": "edgework-take/1",
        "takeId": take_id,
        "authorization": {
            "basis": validated["authorization"]["basis"],
            "by": validated["authorization"]["by"],
            "date": validated["authorization"]["date"],
            "scope": validated["authorization"]["scope"],
        },
        "subject": {
            "id": validated["subject"]["id"],
            "consent": validated["subject"]["consent"],
        },
        "mirrored": validated["mirrored"],
        "playback": validated["playback"],
        "venue": validated["venue"],
        "source": {
            "filename": video_path.name,
            "sha256": source_sha256,
            "sizeBytes": source_size,
        },
        "video": {
            "codec": str(video_stream.get("codec_name") or "unknown"),
            "width": int(video_stream.get("width") or 0),
            "height": int(video_stream.get("height") or 0),
            "timeBase": frames_doc["timeBase"],
            "nominalFps": frames_doc["nominalFps"],
            "frameCount": frames_doc["frameCount"],
            "vfr": frames_doc["vfr"],
            "rotationDeg": frames_doc["rotationDeg"],
            "fieldOrder": frames_doc["fieldOrder"],
            "interlaced": frames_doc["interlaced"],
        },
        "probe": {
            "streamsFile": "probe/streams.json",
            "streamsSha256": streams_sha256,
            "framesFile": "probe/frames.json",
            "framesSha256": frames_sha256,
        },
        "tools": {
            "edgeworkVideo": __version__,
            "python": platform.python_version(),
            "ffprobe": ffprobe_ver,
        },
    }

    manifest_errors = validate_take_manifest(manifest_out)
    if manifest_errors:
        raise EdgeworkVideoError(
            f"Derived manifest.json failed schema validation: {'; '.join(manifest_errors)}",
            EXIT_BACKEND_FAILURE,
        )

    manifest_bytes = _deterministic_json_bytes(manifest_out)

    # Write take folder (never copying source video).
    probe_dir = take_dir / "probe"
    logs_dir = take_dir / "logs"
    probe_dir.mkdir(parents=True, exist_ok=True)
    logs_dir.mkdir(parents=True, exist_ok=True)

    (probe_dir / "streams.json").write_bytes(streams_bytes)
    (probe_dir / "frames.json").write_bytes(frames_bytes)
    (take_dir / "manifest.json").write_bytes(manifest_bytes)

    elapsed_ms = round((time.monotonic() - t0) * 1000.0, 2)
    utc_now = _dt.datetime.now(_dt.timezone.utc)
    run_id = f"intake-{utc_now.strftime('%Y%m%dT%H%M%SZ')}-{os.getpid()}"
    run_log = {
        "runId": run_id,
        "command": "intake",
        "utc": utc_now.isoformat(),
        "elapsedMs": elapsed_ms,
        "tools": manifest_out["tools"],
        "outputs": {
            "manifestSha256": sha256_bytes(manifest_bytes),
            "streamsSha256": streams_sha256,
            "framesSha256": frames_sha256,
        },
    }
    (logs_dir / f"{run_id}.json").write_bytes(_deterministic_json_bytes(run_log))

    return take_dir


def verify_take(take_dir: Path) -> dict[str, Any]:
    """Verify schemas, probe hashes, and PTS monotonicity for a take folder."""
    manifest_path = take_dir / "manifest.json"
    if not manifest_path.is_file():
        raise EdgeworkVideoError(f"Missing manifest.json in {take_dir}", EXIT_INVALID_INPUT)

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise EdgeworkVideoError(f"Invalid manifest.json: {exc}", EXIT_INVALID_INPUT) from exc

    errors = validate_take_manifest(manifest)
    if errors:
        raise EdgeworkVideoError(f"manifest.json invalid: {'; '.join(errors)}", EXIT_INVALID_INPUT)

    streams_path = take_dir / manifest["probe"]["streamsFile"]
    frames_path = take_dir / manifest["probe"]["framesFile"]
    for p in (streams_path, frames_path):
        if not p.is_file():
            raise EdgeworkVideoError(f"Missing probe file: {p}", EXIT_INVALID_INPUT)

    actual_streams_sha = sha256_file(streams_path)
    actual_frames_sha = sha256_file(frames_path)
    if actual_streams_sha != manifest["probe"]["streamsSha256"]:
        raise EdgeworkVideoError("probe/streams.json sha256 mismatch.", EXIT_INVALID_INPUT)
    if actual_frames_sha != manifest["probe"]["framesSha256"]:
        raise EdgeworkVideoError("probe/frames.json sha256 mismatch.", EXIT_INVALID_INPUT)

    try:
        frames_doc = json.loads(frames_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise EdgeworkVideoError(f"Invalid frames.json: {exc}", EXIT_INVALID_INPUT) from exc

    frame_errors = validate_frames_doc(frames_doc)
    if frame_errors:
        raise EdgeworkVideoError(f"frames.json invalid: {'; '.join(frame_errors)}", EXIT_INVALID_INPUT)

    if frames_doc["sourceSha256"] != manifest["source"]["sha256"]:
        raise EdgeworkVideoError("frames.json sourceSha256 does not match manifest.json.", EXIT_INVALID_INPUT)

    return {
        "takeId": manifest["takeId"],
        "frameCount": frames_doc["frameCount"],
        "vfr": frames_doc["vfr"],
        "verified": True,
    }
