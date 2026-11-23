"""Standard-library argparse CLI for `edgework-video`."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Sequence

from . import EXIT_INVALID_INPUT, EXIT_OK, EdgeworkVideoError, __version__
from .annotate import run_annotate
from .calibrate import DEFAULT_HOLDOUT, DEFAULT_MAX_RESIDUAL_M, run_calibrate
from .intake import run_intake, verify_take
from .metrics import run_metrics
from .preview import run_preview
from .shots import run_shots
from .wireframe import run_export


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="edgework-video",
        description="EDGEWORK offline video intake, shots, annotation, evidence & wireframe export CLI.",
    )
    parser.add_argument("--version", action="version", version=f"edgework-video {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)

    p_intake = sub.add_parser("intake", help="Probe an authorized video and write a take folder.")
    p_intake.add_argument("video", type=Path, help="Path to the source video file (never copied).")
    p_intake.add_argument("--manifest", required=True, type=Path, help="Operator take manifest JSON.")
    p_intake.add_argument("--takes-root", required=True, type=Path, help="Output root outside any git worktree.")
    p_intake.add_argument("--ffprobe", default="ffprobe", help="ffprobe executable (default: ffprobe).")

    p_shots = sub.add_parser("shots", help="Detect scene cuts and partition a take into shots.")
    p_shots.add_argument("take", type=Path, help="Path to a take directory containing manifest.json.")
    p_shots.add_argument("--video", required=True, type=Path, help="Path to the source video file.")
    p_shots.add_argument("--threshold", type=float, default=0.35, help="ffmpeg scene cut threshold in (0,1).")
    p_shots.add_argument("--min-shot-s", type=float, default=2.0, help="Minimum accepted shot duration in seconds.")
    p_shots.add_argument("--ffmpeg", default="ffmpeg", help="ffmpeg executable (default: ffmpeg).")

    p_annotate = sub.add_parser("annotate", help="Validate and record human event annotations CSV for a shot.")
    p_annotate.add_argument("take", type=Path, help="Path to a take directory containing manifest.json.")
    p_annotate.add_argument("--shot", required=True, help="Shot id (e.g. S01).")
    p_annotate.add_argument("--events", required=True, type=Path, help="Path to annotator events CSV.")
    p_annotate.add_argument("--annotator", required=True, help="Annotator id (e.g. A1, A2).")

    p_calib = sub.add_parser("calibrate", help="Fit and hold-out-validate an ice-plane homography.")
    p_calib.add_argument("take", type=Path, help="Path to a take directory containing manifest.json.")
    p_calib.add_argument("--shot", required=True, help="Shot id (e.g. S01).")
    p_calib.add_argument("--venue", required=True, type=Path, help="Surveyed venue landmarks JSON.")
    p_calib.add_argument("--landmarks", required=True, type=Path, help="Image landmark pixel picks JSON.")
    p_calib.add_argument("--holdout", type=int, default=DEFAULT_HOLDOUT, help="Number of held-out landmarks (>=2).")
    p_calib.add_argument("--max-residual-m", type=float, default=DEFAULT_MAX_RESIDUAL_M, help="Gate B max held-out residual in metres (default 0.10).")

    p_metrics = sub.add_parser("metrics", help="Compute evidence-lane observables into edgework-evidence/1.")
    p_metrics.add_argument("take", type=Path, help="Path to a take directory containing manifest.json.")
    p_metrics.add_argument("--shot", required=True, help="Shot id (e.g. S01).")
    p_metrics.add_argument("--observables", required=True, help="Comma-separated observables (e.g. O5,O6).")
    p_metrics.add_argument("--clip", default=None, help="Optional clip id for the evidence filename.")

    p_export = sub.add_parser("export", help="Translate an edgework-wireframe/1 file into Clip, Track & QA JSON.")
    p_export.add_argument("wireframe", type=Path, help="Path to an edgework-wireframe/1 JSON file.")
    p_export.add_argument("--out-dir", required=True, type=Path, help="Output directory for clip/track/qa JSON.")
    p_export.add_argument("--mask", default="arms-head", help="Pose mask: 'arms-head' (cosmetic) or 'full' (showcase Track).")
    p_export.add_argument("--min-conf", type=float, default=0.5, help="Minimum per-joint confidence score.")

    p_preview = sub.add_parser("preview", help="Render an HTML wireframe preview strictly from an export JSON.")
    p_preview.add_argument("wireframe", type=Path, help="Path to an edgework-wireframe/1 JSON file.")
    p_preview.add_argument("--out", required=True, type=Path, help="Output HTML preview path.")

    p_verify = sub.add_parser("verify", help="Verify schemas, hashes, and PTS monotonicity of a take.")
    p_verify.add_argument("take", type=Path, help="Path to a take directory containing manifest.json.")

    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    try:
        args = parser.parse_args(argv)
    except SystemExit as exc:
        code = exc.code if isinstance(exc.code, int) else EXIT_INVALID_INPUT
        return code

    try:
        if args.command == "intake":
            take_dir = run_intake(
                video_path=args.video,
                manifest_path=args.manifest,
                takes_root=args.takes_root,
                ffprobe_bin=args.ffprobe,
            )
            print(json.dumps({"ok": True, "takeDir": str(take_dir)}))
            return EXIT_OK
        if args.command == "shots":
            shots_path = run_shots(
                take_dir=args.take,
                video_path=args.video,
                threshold=args.threshold,
                min_shot_s=args.min_shot_s,
                ffmpeg_bin=args.ffmpeg,
            )
            print(json.dumps({"ok": True, "shotsFile": str(shots_path)}))
            return EXIT_OK
        if args.command == "annotate":
            ann_path = run_annotate(
                take_dir=args.take,
                shot_id=args.shot,
                events_csv=args.events,
                annotator_id=args.annotator,
            )
            print(json.dumps({"ok": True, "annotationsFile": str(ann_path)}))
            return EXIT_OK
        if args.command == "calibrate":
            calib_path = run_calibrate(
                take_dir=args.take,
                shot_id=args.shot,
                venue_path=args.venue,
                landmarks_path=args.landmarks,
                holdout=args.holdout,
                max_residual_m=args.max_residual_m,
            )
            print(json.dumps({"ok": True, "calibrationFile": str(calib_path)}))
            return EXIT_OK
        if args.command == "metrics":
            obs_list = [item.strip() for item in args.observables.split(",") if item.strip()]
            ev_path = run_metrics(
                take_dir=args.take,
                shot_id=args.shot,
                observables=obs_list,
                clip_id=args.clip,
            )
            print(json.dumps({"ok": True, "evidenceFile": str(ev_path)}))
            return EXIT_OK
        if args.command == "export":
            written = run_export(
                wireframe_path=args.wireframe,
                out_dir=args.out_dir,
                mask=args.mask,
                min_conf=args.min_conf,
            )
            print(json.dumps({"ok": True, **{k: str(v) for k, v in written.items()}}))
            return EXIT_OK
        if args.command == "preview":
            info = run_preview(wireframe_path=args.wireframe, out_path=args.out)
            print(json.dumps({"ok": True, **info}))
            return EXIT_OK
        if args.command == "verify":
            summary = verify_take(args.take)
            print(json.dumps({"ok": True, **summary}))
            return EXIT_OK
        raise EdgeworkVideoError(f"Unknown command: {args.command}", EXIT_INVALID_INPUT)
    except EdgeworkVideoError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return exc.exit_code


if __name__ == "__main__":
    raise SystemExit(main())
