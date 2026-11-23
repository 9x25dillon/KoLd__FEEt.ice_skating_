"""Standard-library validators for EDGEWORK M0 video-pipeline JSON contracts.

Zero external dependencies: validates the structural invariants of:
  - input take manifest (passed to `edgework-video intake --manifest`)
  - edgework-take/1      (manifest.json)
  - edgework-frames/1    (probe/frames.json)
  - edgework-wireframe/1 (export profile edgework-export/1)
  - edgework-evidence/1  (evidence sidecar)
"""

from __future__ import annotations

import math
import re
from typing import Any

from . import EXIT_INVALID_INPUT, EXIT_PRECONDITION_UNMET, EdgeworkVideoError

TAKE_ID_RE = re.compile(r"^[A-Za-z0-9._-]+$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
RATIONAL_RE = re.compile(r"^[0-9]+/[0-9]+$")

VALID_SCOPES = frozenset({"research-only", "shippable"})
VALID_PLAYBACK = frozenset({"live", "slowmo", "mixed", "unknown"})
VALID_MIRRORED = (True, False, "unknown")
VALID_SCALE_STATUS = frozenset({"surveyed", "rulebook-verified-at-venue", "model", "unknown"})
VALID_OBSERVABLES = frozenset({"O1", "O2", "O3", "O4", "O5", "O6", "O7", None})
VALID_METRIC_STATUS = frozenset({"observed", "reconstructed", "model-derived", "unavailable"})
VALID_REVIEW_STATUS = frozenset({"unreviewed", "approved", "rejected"})


def _is_non_empty_str(value: Any) -> bool:
    return isinstance(value, str) and len(value.strip()) > 0


def _is_real_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def validate_input_manifest(data: Any) -> dict[str, Any]:
    """Validate the operator's intake manifest JSON.

    Missing or empty `authorization.basis` raises EXIT_PRECONDITION_UNMET (3),
    matching Blueprint §11. Structural errors raise EXIT_INVALID_INPUT (2).
    """
    if not isinstance(data, dict):
        raise EdgeworkVideoError("Manifest must be a JSON object.", EXIT_INVALID_INPUT)

    auth = data.get("authorization")
    if not isinstance(auth, dict) or not _is_non_empty_str(auth.get("basis")):
        raise EdgeworkVideoError(
            "Missing authorization.basis: refusing intake without an authorization record.",
            EXIT_PRECONDITION_UNMET,
        )
    if not _is_non_empty_str(auth.get("by")) or not _is_non_empty_str(auth.get("date")):
        raise EdgeworkVideoError(
            "authorization.by and authorization.date must be non-empty strings.",
            EXIT_PRECONDITION_UNMET,
        )
    if auth.get("scope") not in VALID_SCOPES:
        raise EdgeworkVideoError(
            f"authorization.scope must be one of {sorted(VALID_SCOPES)}.",
            EXIT_PRECONDITION_UNMET,
        )

    take_id = data.get("takeId")
    if not isinstance(take_id, str) or not TAKE_ID_RE.match(take_id) or take_id in {".", ".."}:
        raise EdgeworkVideoError(
            "takeId must match ^[A-Za-z0-9._-]+$ and cannot be '.' or '..'.",
            EXIT_INVALID_INPUT,
        )

    subject = data.get("subject")
    if not isinstance(subject, dict) or not _is_non_empty_str(subject.get("id")) or not _is_non_empty_str(subject.get("consent")):
        raise EdgeworkVideoError(
            "subject must be an object with non-empty 'id' and 'consent' strings.",
            EXIT_INVALID_INPUT,
        )

    mirrored = data.get("mirrored")
    if not any(mirrored is allowed or (isinstance(allowed, str) and mirrored == allowed) for allowed in VALID_MIRRORED):
        raise EdgeworkVideoError(
            "mirrored must be true, false, or 'unknown'.",
            EXIT_INVALID_INPUT,
        )

    if data.get("playback") not in VALID_PLAYBACK:
        raise EdgeworkVideoError(
            f"playback must be one of {sorted(VALID_PLAYBACK)}.",
            EXIT_INVALID_INPUT,
        )

    if not _is_non_empty_str(data.get("venue")):
        raise EdgeworkVideoError("venue must be a non-empty string.", EXIT_INVALID_INPUT)

    return data


def validate_take_manifest(data: Any) -> list[str]:
    """Validate an output `edgework-take/1` manifest.json; returns list of errors."""
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["manifest must be a JSON object"]
    if data.get("schema") != "edgework-take/1":
        errors.append("schema must be 'edgework-take/1'")
    try:
        validate_input_manifest(data)
    except EdgeworkVideoError as exc:
        errors.append(str(exc))

    src = data.get("source")
    if not isinstance(src, dict):
        errors.append("source must be an object")
    else:
        if not _is_non_empty_str(src.get("filename")):
            errors.append("source.filename must be a non-empty string")
        if not isinstance(src.get("sha256"), str) or not SHA256_RE.match(src["sha256"]):
            errors.append("source.sha256 must be a 64-char lowercase hex digest")
        if not _is_int(src.get("sizeBytes")) or src["sizeBytes"] < 1:
            errors.append("source.sizeBytes must be a positive integer")

    vid = data.get("video")
    if not isinstance(vid, dict):
        errors.append("video must be an object")
    else:
        if not _is_non_empty_str(vid.get("codec")):
            errors.append("video.codec must be a non-empty string")
        for key in ("width", "height", "frameCount"):
            if not _is_int(vid.get(key)) or vid[key] < 1:
                errors.append(f"video.{key} must be a positive integer")
        if not isinstance(vid.get("timeBase"), str) or not RATIONAL_RE.match(vid["timeBase"]):
            errors.append("video.timeBase must be a rational string like '1/60000'")
        if not _is_real_number(vid.get("nominalFps")) or vid["nominalFps"] <= 0:
            errors.append("video.nominalFps must be a positive finite number")
        if not isinstance(vid.get("vfr"), bool):
            errors.append("video.vfr must be a boolean")
        if not _is_real_number(vid.get("rotationDeg")):
            errors.append("video.rotationDeg must be a finite number")
        if not isinstance(vid.get("fieldOrder"), str):
            errors.append("video.fieldOrder must be a string")
        if not isinstance(vid.get("interlaced"), bool):
            errors.append("video.interlaced must be a boolean")

    probe = data.get("probe")
    if not isinstance(probe, dict):
        errors.append("probe must be an object")
    else:
        if probe.get("streamsFile") != "probe/streams.json":
            errors.append("probe.streamsFile must be 'probe/streams.json'")
        if probe.get("framesFile") != "probe/frames.json":
            errors.append("probe.framesFile must be 'probe/frames.json'")
        for key in ("streamsSha256", "framesSha256"):
            if not isinstance(probe.get(key), str) or not SHA256_RE.match(probe[key]):
                errors.append(f"probe.{key} must be a 64-char hex digest")

    tools = data.get("tools")
    if not isinstance(tools, dict):
        errors.append("tools must be an object")
    else:
        for key in ("edgeworkVideo", "python", "ffprobe"):
            if not _is_non_empty_str(tools.get(key)):
                errors.append(f"tools.{key} must be a non-empty string")

    return errors


def validate_frames_doc(data: Any) -> list[str]:
    """Validate `edgework-frames/1` (probe/frames.json); returns list of errors."""
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["frames document must be a JSON object"]
    if data.get("schema") != "edgework-frames/1":
        errors.append("schema must be 'edgework-frames/1'")
    if not isinstance(data.get("sourceSha256"), str) or not SHA256_RE.match(data["sourceSha256"]):
        errors.append("sourceSha256 must be a 64-char hex digest")
    if not isinstance(data.get("timeBase"), str) or not RATIONAL_RE.match(data["timeBase"]):
        errors.append("timeBase must be a rational string")
    if not _is_real_number(data.get("nominalFps")) or data["nominalFps"] <= 0:
        errors.append("nominalFps must be a positive finite number")
    if not isinstance(data.get("vfr"), bool):
        errors.append("vfr must be a boolean")
    if not isinstance(data.get("interlaced"), bool):
        errors.append("interlaced must be a boolean")

    frames = data.get("frames")
    if not isinstance(frames, list) or len(frames) == 0:
        errors.append("frames must be a non-empty list")
        return errors
    if data.get("frameCount") != len(frames):
        errors.append("frameCount must equal len(frames)")

    prev_pts: int | None = None
    for i, frame in enumerate(frames):
        if not isinstance(frame, dict):
            errors.append(f"frames[{i}] must be an object")
            continue
        if frame.get("index") != i:
            errors.append(f"frames[{i}].index must equal {i}")
        pts = frame.get("pts")
        if not _is_int(pts):
            errors.append(f"frames[{i}].pts must be an integer")
        else:
            if prev_pts is not None and pts <= prev_pts:
                errors.append(f"frames[{i}].pts ({pts}) is not strictly greater than previous ({prev_pts})")
            prev_pts = pts
        if not isinstance(frame.get("timeBase"), str) or not RATIONAL_RE.match(frame["timeBase"]):
            errors.append(f"frames[{i}].timeBase must be a rational string")
        if not _is_non_empty_str(frame.get("tExact")):
            errors.append(f"frames[{i}].tExact must be a non-empty string")
        if not _is_real_number(frame.get("tSec")):
            errors.append(f"frames[{i}].tSec must be a finite number")
        for flag in ("keyFrame", "interlacedFrame", "topFieldFirst"):
            if not isinstance(frame.get(flag), bool):
                errors.append(f"frames[{i}].{flag} must be a boolean")

    return errors


def validate_wireframe_export(data: Any) -> list[str]:
    """Validate `edgework-wireframe/1` under writer profile `edgework-export/1`."""
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["wireframe export must be a JSON object"]
    if data.get("schema") != "edgework-wireframe/1":
        errors.append("schema must be 'edgework-wireframe/1'")
    for key in ("id", "name", "category"):
        if not _is_non_empty_str(data.get(key)):
            errors.append(f"{key} must be a non-empty string")
    if not isinstance(data.get("loop"), bool):
        errors.append("loop must be a boolean")

    meta = data.get("meta")
    if not isinstance(meta, dict):
        errors.append("meta must be an object")
    else:
        if not _is_real_number(meta.get("fps")) or meta["fps"] <= 0:
            errors.append("meta.fps must be positive")
        if meta.get("coordSpace") not in {"world-yup", "skater-local"}:
            errors.append("meta.coordSpace must be 'world-yup' or 'skater-local'")
        if not isinstance(meta.get("cameraCompensated"), bool):
            errors.append("meta.cameraCompensated must be a boolean")
        ext = meta.get("ext")
        if not isinstance(ext, dict):
            errors.append("meta.ext must be an object")
        else:
            if ext.get("profile") != "edgework-export/1":
                errors.append("meta.ext.profile must be 'edgework-export/1'")
            scale = ext.get("scale")
            if not isinstance(scale, dict) or scale.get("status") not in VALID_SCALE_STATUS:
                errors.append("meta.ext.scale.status is invalid")
            if not _is_non_empty_str(ext.get("scoreKind")):
                errors.append("meta.ext.scoreKind must be a non-empty string")
            mirrored = ext.get("mirrored")
            if not any(mirrored is a or (isinstance(a, str) and mirrored == a) for a in VALID_MIRRORED):
                errors.append("meta.ext.mirrored must be true, false, or 'unknown'")
            wg = ext.get("worldGrounding")
            if not isinstance(wg, dict) or not isinstance(wg.get("validated"), bool):
                errors.append("meta.ext.worldGrounding.validated must be a boolean")
            if not _is_non_empty_str(ext.get("sidecar")):
                errors.append("meta.ext.sidecar must be a non-empty string")

    frames = data.get("frames")
    if not isinstance(frames, list) or len(frames) == 0:
        errors.append("frames must be a non-empty list")
        return errors

    prev_t: float | None = None
    for i, frame in enumerate(frames):
        if not isinstance(frame, dict):
            errors.append(f"frames[{i}] must be an object")
            continue
        t = frame.get("t")
        if not _is_real_number(t):
            errors.append(f"frames[{i}].t must be a finite number")
        else:
            if prev_t is not None and t <= prev_t:
                errors.append(f"frames[{i}].t ({t}) must be strictly increasing")
            prev_t = float(t)
        joints = frame.get("joints")
        conf = frame.get("confidence")
        if not isinstance(joints, dict) or not isinstance(conf, dict):
            errors.append(f"frames[{i}].joints and confidence must be objects")
            continue
        for jname, coords in joints.items():
            if not isinstance(coords, list) or len(coords) != 3 or not all(_is_real_number(v) for v in coords):
                errors.append(f"frames[{i}].joints.{jname} must be a 3-number list")
            # Writer rule (§4.3): every written joint must have an explicit confidence score.
            if jname not in conf:
                errors.append(f"frames[{i}].confidence missing score for joint '{jname}'")
            elif not _is_real_number(conf[jname]) or not (0.0 <= float(conf[jname]) <= 1.0):
                errors.append(f"frames[{i}].confidence.{jname} must be in [0, 1]")

    return errors


def validate_evidence_sidecar(data: Any) -> list[str]:
    """Validate `edgework-evidence/1` sidecar document."""
    errors: list[str] = []
    if not isinstance(data, dict):
        return ["evidence sidecar must be a JSON object"]
    if data.get("schema") != "edgework-evidence/1":
        errors.append("schema must be 'edgework-evidence/1'")
    for key in ("take", "shot", "clip"):
        if not _is_non_empty_str(data.get(key)):
            errors.append(f"{key} must be a non-empty string")
    for key in ("inputs", "time", "frames", "checks", "review"):
        if not isinstance(data.get(key), dict):
            errors.append(f"{key} must be an object")

    metrics = data.get("metrics")
    if not isinstance(metrics, list):
        errors.append("metrics must be a list")
    else:
        for i, m in enumerate(metrics):
            if not isinstance(m, dict):
                errors.append(f"metrics[{i}] must be an object")
                continue
            if not _is_non_empty_str(m.get("name")):
                errors.append(f"metrics[{i}].name must be a non-empty string")
            if m.get("observable") not in VALID_OBSERVABLES:
                errors.append(f"metrics[{i}].observable is invalid")
            status = m.get("status")
            if status not in VALID_METRIC_STATUS:
                errors.append(f"metrics[{i}].status is invalid")
            if status == "unavailable" and not _is_non_empty_str(m.get("reason")):
                errors.append(f"metrics[{i}] with status 'unavailable' requires a non-empty reason")
            if status == "model-derived" and m.get("promotable") is True:
                errors.append(f"metrics[{i}] with status 'model-derived' cannot be promotable")

    rejected = data.get("rejectedIntervals")
    if not isinstance(rejected, list):
        errors.append("rejectedIntervals must be a list")
    else:
        for i, interval in enumerate(rejected):
            if not isinstance(interval, dict):
                errors.append(f"rejectedIntervals[{i}] must be an object")
                continue
            if not _is_real_number(interval.get("ptsStart")) or not _is_real_number(interval.get("ptsEnd")):
                errors.append(f"rejectedIntervals[{i}] requires finite ptsStart and ptsEnd")
            if not _is_non_empty_str(interval.get("reason")):
                errors.append(f"rejectedIntervals[{i}].reason must be a non-empty string")

    review = data.get("review")
    if isinstance(review, dict) and review.get("status") not in VALID_REVIEW_STATUS:
        errors.append("review.status must be 'unreviewed', 'approved', or 'rejected'")

    return errors
