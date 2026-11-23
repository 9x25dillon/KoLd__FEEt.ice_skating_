"""edgework-wireframe/1 reader twin (stdlib only) of game/motion/wireframe.ts.

Implements the blueprint's six reader corrections and mirrors the TypeScript
`translateWireframeFrames` state machine byte-for-behavior so the shared parity fixture
(`edgework-wireframe-parity/1`) passes in both languages. Presentation only: never touches sim.

Scope: this module produces the language-neutral frame translation (pose directions, pelvis
ratio, twist, basis source, heading, lrSwap, rejected) used for parity. `onIce` settling and
Clip/Track assembly are TypeScript-only (motion/types.ts, motion/track.ts); requesting
settleOnIce here raises NotImplementedError rather than diverging silently.

Neutral output per frame mirrors TS FrameTranslation:
  {pose:{seg:{name:[x,y,z]}, pelvis?, pelvisRight?, pelvisUp?, twist?},
   basis:"local"|"hips"|"shoulders"|"held", lrSwap:"none"|"corrected"|"suspected",
   heading:float(radians, atan2(right_z,right_x)), rejected?: "basis-degenerate"|"heading-ambiguous"}

CLI: python3 reader.py <wireframe.json> [--mask full|arms-head] [--min-confidence X]
     [--strict] [--mirrored true|false|unknown]  -> prints the translation list as JSON.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

try:  # package import (edgework_video_pose.reader)
    from .constants import (
        WIREFRAME_SCHEMA, WIREFRAME_JOINTS, SEGMENT_ENDPOINTS, SEGMENTS,
        COSMETIC_SEGMENTS, SWAP_TEST_DEG, AMBIGUOUS_STEP_DEG, DEGENERATE_RATIO,
        ORTHO_TOL, DET_TOL, ZERO_LEN_ABS_M, HOLD_MAX_FRAMES, DEFAULT_MIN_CONFIDENCE,
        TWIST_LIMIT_DEG, TWIST_DEADBAND_DEG,
    )
except ImportError:  # script import (python3 reader.py)
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from constants import (  # type: ignore
        WIREFRAME_SCHEMA, WIREFRAME_JOINTS, SEGMENT_ENDPOINTS, SEGMENTS,
        COSMETIC_SEGMENTS, SWAP_TEST_DEG, AMBIGUOUS_STEP_DEG, DEGENERATE_RATIO,
        ORTHO_TOL, DET_TOL, ZERO_LEN_ABS_M, HOLD_MAX_FRAMES, DEFAULT_MIN_CONFIDENCE,
        TWIST_LIMIT_DEG, TWIST_DEADBAND_DEG,
    )

RIGHT = (1.0, 0.0, 0.0)
UP = (0.0, 1.0, 0.0)
DEFAULT_RIG = {"thigh": 0.4105, "shin": 0.3755}
_ENDPOINTS = {seg: (a, b) for seg, a, b in SEGMENT_ENDPOINTS}
_FULL = list(SEGMENTS)
_ARMS_HEAD = ["head", "upperArmL", "forearmL", "upperArmR", "forearmR"]
_LEFT_RIGHT = {
    j: (j[:-1] + "R" if j.endswith("L") else j[:-1] + "L" if j.endswith("R") else j)
    for j in WIREFRAME_JOINTS
}
_MISSING = object()


def _sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def _dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def _len(v): return math.hypot(v[0], v[1], v[2])
def _mid(a, b): return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2)
def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def _norm(v):
    l = math.hypot(v[0], v[1], v[2]) or 1.0
    return (v[0] / l, v[1] / l, v[2] / l)
def _angular_delta(a, b):
    d = a - b
    while d > math.pi: d -= 2 * math.pi
    while d < -math.pi: d += 2 * math.pi
    return d


def to_yup(v, space):
    return (v[0], v[2], -v[1]) if space == "world-zup" else (v[0], v[1], v[2])


def _point(frame, joint, space, min_conf, strict):
    raw = frame.get("joints", {}).get(joint)
    if raw is None:
        return None
    conf = frame.get("confidence") or {}
    has = joint in conf
    score = conf.get(joint)
    if strict and not has:
        raise ValueError(f"joint {joint} has no confidence score")
    if has and (not isinstance(score, (int, float)) or not math.isfinite(score) or score < min_conf):
        return None
    if not all(isinstance(x, (int, float)) and math.isfinite(x) for x in raw):
        return None
    return to_yup(raw, space)


def _corrected_frame(frame, mirrored):
    if mirrored is not True:
        return frame
    joints, conf = {}, {}
    for name in WIREFRAME_JOINTS:
        src = _LEFT_RIGHT[name]
        v = frame.get("joints", {}).get(src)
        if v is not None:
            joints[name] = (-v[0], v[1], v[2])
        s = (frame.get("confidence") or {}).get(src)
        if s is not None:
            conf[name] = s
    out = {**frame, "joints": joints}
    if frame.get("confidence") is not None:
        out["confidence"] = conf
    if frame.get("rootWorld") is not None:
        rw = frame["rootWorld"]
        out["rootWorld"] = (-rw[0], rw[1], rw[2])
    if frame.get("rootYawRad") is not None:
        out["rootYawRad"] = -frame["rootYawRad"]
    return out


def _measured_basis(frame, space, min_conf, strict):
    if space == "skater-local":
        return {"right": RIGHT, "up": UP, "back": (0.0, 0.0, 1.0), "heading": 0.0, "source": "local"}
    get = lambda j: _point(frame, j, space, min_conf, strict)
    hl, hr, sl, sr = get("hipL"), get("hipR"), get("shoulderL"), get("shoulderR")
    line = _sub(hr, hl) if (hl and hr) else (_sub(sr, sl) if (sl and sr) else None)
    source = "hips" if (hl and hr) else "shoulders"
    if line is None:
        return None
    horizontal = (line[0], 0.0, line[2])
    if _len(horizontal) < DEGENERATE_RATIO * _len(line) or _len(horizontal) < 1e-8:
        return None
    right = _norm(horizontal)
    back = _norm(_cross(right, UP))
    det = _dot(right, _cross(UP, back))
    if abs(det - 1) > DET_TOL or abs(_dot(right, UP)) > ORTHO_TOL or abs(_dot(right, back)) > ORTHO_TOL:
        raise ValueError("basis-invalid")
    return {"right": right, "up": UP, "back": back, "heading": math.atan2(right[2], right[0]), "source": source}


def _swapped(frame):
    joints, conf = {}, {}
    for j in WIREFRAME_JOINTS:
        src = _LEFT_RIGHT[j]
        v = frame.get("joints", {}).get(src)
        if v is not None:
            joints[j] = v
        s = (frame.get("confidence") or {}).get(src)
        if s is not None:
            conf[j] = s
    out = {**frame, "joints": joints}
    if frame.get("confidence") is not None:
        out["confidence"] = conf
    return out


def _local(v, basis):
    return (_dot(v, basis["right"]), _dot(v, basis["up"]), _dot(v, basis["back"]))


def _leg_ratio(frame, get, pelvis):
    explicit = (frame.get("ext") or {}).get("pelvisHeightRatio")
    if isinstance(explicit, (int, float)) and math.isfinite(explicit) and explicit > 0:
        return explicit
    lengths = []
    for side in ("L", "R"):
        hip, knee, ankle = get(f"hip{side}"), get(f"knee{side}"), get(f"ankle{side}")
        if hip and knee and ankle:
            lengths.append(_len(_sub(knee, hip)) + _len(_sub(ankle, knee)))
    if not lengths:
        return None
    ankle_y = [get(a)[1] for a in ("ankleL", "ankleR") if get(a) is not None]
    if not ankle_y:
        return None
    return (pelvis[1] - min(ankle_y)) / (sum(lengths) / len(lengths))


def _pose_from(frame, space, basis, opts):
    min_conf = opts.get("minConfidence", DEFAULT_MIN_CONFIDENCE)
    strict = opts.get("strictConfidence", False)
    get = lambda j: _point(frame, j, space, min_conf, strict)
    mask = opts.get("mask", "full")
    if mask == "upper-body":
        raise ValueError("upper-body mask is rejected; the cosmetic mask is arms-head")
    allowed = _ARMS_HEAD if mask == "arms-head" else _FULL
    seg = {}
    for name in allowed:
        a_name, b_name = _ENDPOINTS[name]
        a, b = get(a_name), get(b_name)
        if a is None or b is None:
            continue
        d = _sub(b, a)
        if _len(d) < ZERO_LEN_ABS_M:
            continue
        seg[name] = _norm(_local(d, basis))
    out = {"seg": seg}
    if mask == "full":
        rig = opts.get("rig") or DEFAULT_RIG
        hl, hr, sl, sr = get("hipL"), get("hipR"), get("shoulderL"), get("shoulderR")
        pelvis = get("pelvis") or (_mid(hl, hr) if (hl and hr) else None)
        chest = get("chest")
        if pelvis is not None:
            ratio = _leg_ratio(frame, get, pelvis)
            if ratio is not None:
                out["pelvis"] = ratio * (rig.get("thigh", DEFAULT_RIG["thigh"]) + rig.get("shin", DEFAULT_RIG["shin"]))
            if hl and hr and _len(_sub(hr, hl)) >= ZERO_LEN_ABS_M:
                out["pelvisRight"] = _norm(_local(_sub(hr, hl), basis))
            if chest is not None and _len(_sub(chest, pelvis)) >= ZERO_LEN_ABS_M:
                out["pelvisUp"] = _norm(_local(_sub(chest, pelvis), basis))
        if hl and hr and sl and sr and "trunk" in seg:
            trunk = seg["trunk"]
            def flatten(v):
                along = _dot(v, trunk)
                return (v[0] - trunk[0] * along, v[1] - trunk[1] * along, v[2] - trunk[2] * along)
            hips = flatten(_local(_sub(hr, hl), basis))
            shoulders = flatten(_local(_sub(sr, sl), basis))
            if _len(hips) >= ZERO_LEN_ABS_M and _len(shoulders) >= ZERO_LEN_ABS_M:
                h, s = _norm(hips), _norm(shoulders)
                signed = -_dot(_cross(h, s), trunk)
                degrees = math.atan2(signed, max(-1.0, min(1.0, _dot(h, s)))) * 180 / math.pi
                if abs(degrees) > TWIST_DEADBAND_DEG:
                    out["twist"] = max(-TWIST_LIMIT_DEG, min(TWIST_LIMIT_DEG, degrees))
    if opts.get("settleOnIce") is True:
        raise NotImplementedError("onIce settling is TypeScript-only (motion/types.ts)")
    return out


def _angle(a, b):
    worst = 0.0
    for k in _FULL:
        av, bv = a.get("seg", {}).get(k), b.get("seg", {}).get(k)
        if av and bv:
            worst = max(worst, math.acos(max(-1.0, min(1.0, _dot(_norm(av), _norm(bv))))) * 180 / math.pi)
    return worst


def validate_wireframe_sequence(seq, strict=False):
    issues = []
    if not seq or seq.get("schema") != WIREFRAME_SCHEMA:
        issues.append(f"expected schema {WIREFRAME_SCHEMA}")
    if not seq.get("id"):
        issues.append("missing sequence id")
    meta = seq.get("meta") or {}
    if not (isinstance(meta.get("fps"), (int, float)) and meta["fps"] > 0):
        issues.append("meta.fps must be positive")
    frames = seq.get("frames")
    if not isinstance(frames, list) or not frames:
        issues.append("frames must be non-empty")
        return issues
    for i, f in enumerate(frames):
        if i > 0 and f.get("t") <= frames[i - 1].get("t"):
            issues.append(f"frame {i} timestamp must be strictly increasing")
            break
        if strict:
            for j in WIREFRAME_JOINTS:
                if f.get("joints", {}).get(j) is not None and (f.get("confidence") or {}).get(j) is None:
                    issues.append(f"frame {i} joint {j} has no confidence score")
    return issues


def translate_wireframe_frames(seq, opts=None):
    opts = opts or {}
    strict = opts.get("strictConfidence", False)
    issues = validate_wireframe_sequence(seq, strict)
    if issues:
        raise ValueError("Invalid wireframe sequence: " + "; ".join(issues))
    space = seq["meta"]["coordSpace"]
    min_conf = opts.get("minConfidence", DEFAULT_MIN_CONFIDENCE)
    mirrored = opts.get("mirrored", (seq["meta"].get("ext") or {}).get("mirrored", False))
    previous, previous_pose, held = None, None, 0
    out = []
    for raw in seq["frames"]:
        frame = _corrected_frame(raw, mirrored)
        basis = _measured_basis(frame, space, min_conf, strict)
        lr_swap = "none"
        if basis and previous:
            delta = abs(_angular_delta(basis["heading"], previous["heading"]))
            if delta > SWAP_TEST_DEG * math.pi / 180:
                alt_frame = _swapped(frame)
                alt = _measured_basis(alt_frame, space, min_conf, strict)
                if alt and previous_pose:
                    orig_cost = _angle(previous_pose, _pose_from(frame, space, basis, opts))
                    swap_cost = _angle(previous_pose, _pose_from(alt_frame, space, alt, opts))
                    if swap_cost + 1e-6 < orig_cost:
                        frame, basis, lr_swap = alt_frame, alt, "corrected"
                    else:
                        lr_swap = "suspected"
                else:
                    lr_swap = "suspected"
        if not basis:
            if previous and held < HOLD_MAX_FRAMES:
                held += 1
                basis = {**previous, "source": "held"}
            else:
                out.append({"pose": {"seg": {}}, "basis": "held", "lrSwap": lr_swap,
                            "heading": previous["heading"] if previous else 0.0, "rejected": "basis-degenerate"})
                continue
        else:
            held = 0
        if previous and abs(_angular_delta(basis["heading"], previous["heading"])) > AMBIGUOUS_STEP_DEG * math.pi / 180:
            out.append({"pose": {"seg": {}}, "basis": basis["source"], "lrSwap": lr_swap,
                        "heading": basis["heading"], "rejected": "heading-ambiguous"})
            continue
        pose = _pose_from(frame, space, basis, opts)
        previous, previous_pose = basis, pose
        out.append({"pose": pose, "basis": basis["source"], "lrSwap": lr_swap, "heading": basis["heading"]})
    return out


def wireframe_frame_to_pose(frame, space="world-yup", opts=None):
    opts = opts or {}
    seq = {"schema": WIREFRAME_SCHEMA, "id": "frame", "name": "frame", "category": "expression",
           "meta": {"fps": 1, "coordSpace": space, "extractor": "single-frame", "cameraCompensated": False,
                    "provenance": "synthetic-roundtrip", "note": "single frame",
                    "ext": {"mirrored": opts.get("mirrored", False)}}, "frames": [frame]}
    result = translate_wireframe_frames(seq, opts)[0]
    if result.get("rejected"):
        raise ValueError(result["rejected"])
    return result["pose"]


def read_wireframe(value, strict=True):
    def fail(m): raise ValueError(f"Invalid {WIREFRAME_SCHEMA}: {m}")
    if not isinstance(value, dict):
        fail("root must be an object")
    if value.get("schema") != WIREFRAME_SCHEMA:
        fail(f"expected schema {WIREFRAME_SCHEMA}")
    if not isinstance(value.get("id"), str) or not value["id"]:
        fail("missing sequence id")
    if not isinstance(value.get("name"), str) or not value["name"]:
        fail("missing sequence name")
    cats = {"fall", "expression", "spin", "transition", "leg", "recovery", "step", "ceremony", "idle"}
    if value.get("category") not in cats:
        fail("invalid category")
    meta = value.get("meta")
    if not isinstance(meta, dict):
        fail("meta must be an object")
    if not isinstance(meta.get("fps"), (int, float)) or not math.isfinite(meta["fps"]) or meta["fps"] <= 0:
        fail("meta.fps must be positive")
    if meta.get("coordSpace") not in ("skater-local", "world-yup", "world-zup"):
        fail("invalid meta.coordSpace")
    mirrored = (meta.get("ext") or {}).get("mirrored")
    if mirrored is not None and mirrored not in (True, False, "unknown"):
        fail("meta.ext.mirrored must be true, false, or unknown")
    frames = value.get("frames")
    if not isinstance(frames, list) or not frames:
        fail("frames must be non-empty")
    prev = -math.inf
    for i, frame in enumerate(frames):
        if not isinstance(frame, dict):
            fail(f"frame {i} must be an object")
        t = frame.get("t")
        if not isinstance(t, (int, float)) or not math.isfinite(t) or t <= prev:
            fail(f"frame {i} timestamp must be finite and strictly increasing")
        prev = t
        joints = frame.get("joints")
        if not isinstance(joints, dict):
            fail(f"frame {i} joints must be an object")
        scores = frame.get("confidence")
        if scores is not None and not isinstance(scores, dict):
            fail(f"frame {i} confidence must be an object")
        for joint, pt in joints.items():
            if joint not in WIREFRAME_JOINTS:
                fail(f"frame {i} has unknown joint {joint}")
            if not isinstance(pt, list) or len(pt) != 3 or not all(isinstance(x, (int, float)) and math.isfinite(x) for x in pt):
                fail(f"frame {i} joint {joint} must be a finite vec3")
            score = (scores or {}).get(joint)
            if strict and joint not in (scores or {}):
                fail(f"frame {i} joint {joint} has no confidence score")
            if score is not None and (not isinstance(score, (int, float)) or not math.isfinite(score) or score < 0 or score > 1):
                fail(f"frame {i} joint {joint} has invalid confidence")
    return value


def parse_wireframe_json(text, strict=True):
    try:
        value = json.loads(text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid {WIREFRAME_SCHEMA} JSON: {e}")
    return read_wireframe(value, strict)


def main(argv=None):
    ap = argparse.ArgumentParser(description="edgework-wireframe/1 reader (Python twin)")
    ap.add_argument("file")
    ap.add_argument("--mask", default="full")
    ap.add_argument("--min-confidence", type=float, default=DEFAULT_MIN_CONFIDENCE)
    ap.add_argument("--strict", action="store_true")
    ap.add_argument("--mirrored", default=None, choices=["true", "false", "unknown"])
    args = ap.parse_args(argv)
    try:
        seq = parse_wireframe_json(Path(args.file).read_text(encoding="utf-8"), strict=True)
        opts = {"mask": args.mask, "minConfidence": args.min_confidence, "strictConfidence": args.strict}
        if args.mirrored is not None:
            opts["mirrored"] = {"true": True, "false": False, "unknown": "unknown"}[args.mirrored]
        result = translate_wireframe_frames(seq, opts)
    except (ValueError, NotImplementedError) as e:
        print(str(e), file=sys.stderr)
        return 2
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
