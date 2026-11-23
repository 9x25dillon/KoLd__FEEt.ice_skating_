"""`edgework-video annotate` — ingest and validate human event annotations (CSV).

Each annotator supplies a CSV of frame-indexed skating events (blade_off,
touchdown, takeoff_heading_deg, landing_heading_deg, rev_pass, reject_start,
reject_end). Frame indices are validated against `probe/frames.json` so every
annotated event maps to an exact container PTS.
"""

from __future__ import annotations

import csv
import datetime as _dt
import io
import json
import os
from pathlib import Path
import re
import time
from typing import Any

from . import EXIT_INVALID_INPUT, EdgeworkVideoError
from .intake import _deterministic_json_bytes, sha256_bytes, verify_take

SAFE_ID_RE = re.compile(r"^[A-Za-z0-9._-]+$")

VALID_EVENTS = frozenset({
    "blade_off",
    "touchdown",
    "takeoff_heading_deg",
    "landing_heading_deg",
    "rev_pass",
    "blade_contact",
    "reject_start",
    "reject_end",
})

REQUIRED_COLUMNS = ("event", "frame_index")
OUTPUT_COLUMNS = ("event", "frame_index", "pts", "t_sec", "phase", "value", "note")


def _validate_safe_id(value: str, label: str) -> str:
    if not isinstance(value, str) or not SAFE_ID_RE.match(value) or value in {".", ".."}:
        raise EdgeworkVideoError(
            f"{label} must match ^[A-Za-z0-9._-]+$ and cannot be '.' or '..'.",
            EXIT_INVALID_INPUT,
        )
    return value


def parse_events_csv(csv_path: Path, frames_doc: dict[str, Any]) -> list[dict[str, Any]]:
    """Parse and validate an annotator CSV against `probe/frames.json`."""
    if not csv_path.is_file():
        raise EdgeworkVideoError(f"Events CSV not found: {csv_path}", EXIT_INVALID_INPUT)

    frames = frames_doc["frames"]
    frame_count = len(frames)

    try:
        text = csv_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise EdgeworkVideoError(f"Could not read events CSV: {exc}", EXIT_INVALID_INPUT) from exc

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise EdgeworkVideoError("Events CSV has no header row.", EXIT_INVALID_INPUT)

    fields = {name.strip() for name in reader.fieldnames if name}
    for req in REQUIRED_COLUMNS:
        if req not in fields:
            raise EdgeworkVideoError(f"Events CSV missing required column '{req}'.", EXIT_INVALID_INPUT)

    rows: list[dict[str, Any]] = []
    for line_no, raw in enumerate(reader, start=2):
        event = (raw.get("event") or "").strip()
        if not event:
            continue
        if event not in VALID_EVENTS:
            raise EdgeworkVideoError(
                f"Line {line_no}: unknown event '{event}' (expected one of {sorted(VALID_EVENTS)}).",
                EXIT_INVALID_INPUT,
            )

        idx_raw = (raw.get("frame_index") or "").strip()
        try:
            frame_idx = int(idx_raw)
        except ValueError as exc:
            raise EdgeworkVideoError(
                f"Line {line_no}: frame_index '{idx_raw}' must be an integer.",
                EXIT_INVALID_INPUT,
            ) from exc
        if frame_idx < 0 or frame_idx >= frame_count:
            raise EdgeworkVideoError(
                f"Line {line_no}: frame_index {frame_idx} out of range [0, {frame_count - 1}].",
                EXIT_INVALID_INPUT,
            )

        phase = (raw.get("phase") or "").strip()
        value = (raw.get("value") or "").strip()
        note = (raw.get("note") or "").strip()

        if event in {"takeoff_heading_deg", "landing_heading_deg"}:
            try:
                float(value)
            except ValueError as exc:
                raise EdgeworkVideoError(
                    f"Line {line_no}: '{event}' requires a numeric 'value' in degrees.",
                    EXIT_INVALID_INPUT,
                ) from exc
        elif event == "blade_contact":
            parts = [p.strip() for p in value.split(",")]
            if len(parts) != 2:
                raise EdgeworkVideoError(
                    f"Line {line_no}: 'blade_contact' requires value='u,v' image pixel coordinates.",
                    EXIT_INVALID_INPUT,
                )
            try:
                float(parts[0])
                float(parts[1])
            except ValueError as exc:
                raise EdgeworkVideoError(
                    f"Line {line_no}: 'blade_contact' coordinates '{value}' must be numeric 'u,v'.",
                    EXIT_INVALID_INPUT,
                ) from exc

        fr = frames[frame_idx]
        rows.append({
            "event": event,
            "frame_index": frame_idx,
            "pts": fr["pts"],
            "t_sec": fr["tSec"],
            "phase": phase,
            "value": value,
            "note": note,
        })

    if not rows:
        raise EdgeworkVideoError("Events CSV contains no event rows.", EXIT_INVALID_INPUT)

    rows.sort(key=lambda r: (r["frame_index"], r["event"], r["phase"], r["value"]))
    return rows


def run_annotate(
    take_dir: Path,
    shot_id: str,
    events_csv: Path,
    annotator_id: str,
) -> Path:
    """Validate and store normalized annotator events under `shots/<SHOT>/annotations/<ANNOTATOR>.csv`."""
    t0 = time.monotonic()
    _validate_safe_id(shot_id, "shot")
    _validate_safe_id(annotator_id, "annotator")
    verify_take(take_dir)

    frames_doc = json.loads((take_dir / "probe/frames.json").read_text(encoding="utf-8"))
    rows = parse_events_csv(events_csv, frames_doc)

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=OUTPUT_COLUMNS, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    out_bytes = buf.getvalue().encode("utf-8")

    ann_dir = take_dir / "shots" / shot_id / "annotations"
    logs_dir = take_dir / "logs"
    ann_dir.mkdir(parents=True, exist_ok=True)
    logs_dir.mkdir(parents=True, exist_ok=True)

    out_path = ann_dir / f"{annotator_id}.csv"
    out_path.write_bytes(out_bytes)

    elapsed_ms = round((time.monotonic() - t0) * 1000.0, 2)
    utc_now = _dt.datetime.now(_dt.timezone.utc)
    run_id = f"annotate-{utc_now.strftime('%Y%m%dT%H%M%SZ')}-{os.getpid()}"
    run_log = {
        "runId": run_id,
        "command": "annotate",
        "utc": utc_now.isoformat(),
        "elapsedMs": elapsed_ms,
        "shot": shot_id,
        "annotator": annotator_id,
        "eventCount": len(rows),
        "outputSha256": sha256_bytes(out_bytes),
    }
    (logs_dir / f"{run_id}.json").write_bytes(_deterministic_json_bytes(run_log))

    return out_path


def load_shot_annotations(take_dir: Path, shot_id: str) -> dict[str, list[dict[str, Any]]]:
    """Load all normalized annotator CSVs for a shot, keyed by annotator id."""
    ann_dir = take_dir / "shots" / shot_id / "annotations"
    if not ann_dir.is_dir():
        return {}
    result: dict[str, list[dict[str, Any]]] = {}
    for csv_file in sorted(ann_dir.glob("*.csv")):
        annotator = csv_file.stem
        rows: list[dict[str, Any]] = []
        with csv_file.open("r", encoding="utf-8", newline="") as fh:
            for raw in csv.DictReader(fh):
                rows.append({
                    "event": raw["event"],
                    "frame_index": int(raw["frame_index"]),
                    "pts": int(raw["pts"]),
                    "t_sec": float(raw["t_sec"]),
                    "phase": raw.get("phase", ""),
                    "value": raw.get("value", ""),
                    "note": raw.get("note", ""),
                })
        result[annotator] = rows
    return result
