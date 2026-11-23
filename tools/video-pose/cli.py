#!/usr/bin/env python3
"""EDGEWORK offline Video-to-Wireframe CLI (`tools/video-pose/cli.py`).

Commands:
  probe      Inspect local Python packages, FFmpeg, GPU VRAM, and available pose backends.
  calibrate  Fit a metric rink homography from known markings (3.0 m center / 4.5 m faceoff circle).
  extract    Ingest 3D world pose (.npz / GVHMR / WHAM) -> wireframe.json + validation-metrics.json (+ optional .mp4).
  render     Render a math-driven wireframe .mp4 directly from any edgework-wireframe/1 JSON.
  demo       Run an end-to-end synthetic carve/spin/jump extraction, sidecar, and wireframe render.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Support running directly as `python3 tools/video-pose/cli.py ...`
_HERE = Path(__file__).resolve().parent
if str(_HERE.parent) not in sys.path:
    sys.path.insert(0, str(_HERE.parent))

# Package directory contains a hyphen (`video-pose`), so load sibling modules cleanly by path.
import importlib.util


def _load_pkg() -> Any:  # type: ignore[name-defined]
    if "edgework_video_pose" in sys.modules:
        return sys.modules["edgework_video_pose"]
    spec = importlib.util.spec_from_file_location(
        "edgework_video_pose",
        _HERE / "__init__.py",
        submodule_search_locations=[str(_HERE)],
    )
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    sys.modules["edgework_video_pose"] = mod
    spec.loader.exec_module(mod)
    return mod


_load_pkg()
from edgework_video_pose.backends import (  # type: ignore[import-not-found]
    extract_from_gvhmr_or_wham,
    extract_from_npz,
    generate_synthetic_sequence,
    inspect_weights_file,
    probe_environment,
)
from edgework_video_pose.camera import (  # type: ignore[import-not-found]
    RINK_MARKINGS,
    detect_camera_cuts,
    fit_homography,
    load_calibration,
    save_calibration,
)
from edgework_video_pose.kinematics import (  # type: ignore[import-not-found]
    build_validation_metrics,
    flag_spin_blur_and_anomalies,
    write_validation_metrics,
)
from edgework_video_pose.render import render_wireframe_video  # type: ignore[import-not-found]
from edgework_video_pose.schema import validate_sequence, write_wireframe_json  # type: ignore[import-not-found]


def cmd_probe(_args: argparse.Namespace) -> int:
    info = probe_environment()
    print(json.dumps(info, indent=2))
    return 0


def cmd_inspect_weights(args: argparse.Namespace) -> int:
    report = inspect_weights_file(Path(args.file))
    print(json.dumps(report, indent=2))
    return 0 if not report["suspicious"] else 2


def cmd_calibrate(args: argparse.Namespace) -> int:
    marking = RINK_MARKINGS.get(args.marking)
    if marking is None:
        raise SystemExit(f"Unknown marking {args.marking!r}. Choices: {', '.join(RINK_MARKINGS)}")
    pairs = []
    for tok in args.points.split(";"):
        tok = tok.strip()
        if not tok:
            continue
        x_s, y_s = tok.split(",")
        pairs.append([float(x_s), float(y_s)])
    cal = fit_homography(pairs, marking["world_points_m"], marking=args.marking, note=args.note or marking["description"])
    out = Path(args.out)
    save_calibration(cal, out)
    print(f"Saved rink calibration -> {out} (marking={cal.marking}, reprojection RMSE={cal.reprojection_rmse_m:.4f} m)")
    return 0


def cmd_extract(args: argparse.Namespace) -> int:
    src = Path(args.input)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    cal = load_calibration(Path(args.calibration)) if args.calibration else None

    if args.backend == "npz":
        seq = extract_from_npz(
            src,
            seq_id=args.id,
            name=args.name,
            category=args.category,
            layout=args.layout,
            fps=args.fps,
            coord_space=args.coord_space,
            camera_compensated=not args.camera_space,
            style_tag=args.style,
            discipline=args.discipline,
        )
    elif args.backend in ("gvhmr", "wham"):
        seq = extract_from_gvhmr_or_wham(
            src,
            args.backend,
            trust_checkpoint=args.trust_checkpoint,
            seq_id=args.id,
            name=args.name,
            category=args.category,
            layout=args.layout,
            fps=args.fps,
            coord_space=args.coord_space,
            style_tag=args.style,
            discipline=args.discipline,
        )
    else:
        raise SystemExit(f"Unsupported backend {args.backend!r}. Use npz, gvhmr, or wham.")

    cuts: list[int] = []
    if args.source_video:
        cuts = detect_camera_cuts(Path(args.source_video), fps=float(seq["meta"]["fps"]))

    seq = flag_spin_blur_and_anomalies(seq, cut_frames=cuts)
    metrics = build_validation_metrics(seq, calibration=cal)

    stem = seq["id"]
    wf_path = out_dir / f"{stem}.wireframe.json"
    met_path = out_dir / f"{stem}.validation-metrics.json"
    write_wireframe_json(seq, wf_path)
    write_validation_metrics(metrics, met_path)
    print(f"wireframe -> {wf_path} ({len(seq['frames'])} frames)")
    print(f"metrics   -> {met_path}")

    if args.render:
        mp4_path = out_dir / f"{stem}.wireframe.mp4"
        render_wireframe_video(
            seq,
            mp4_path,
            metrics=metrics,
            source_video=Path(args.source_video) if args.source_video else None,
        )
        print(f"preview   -> {mp4_path}")
    return 0


def cmd_render(args: argparse.Namespace) -> int:
    seq = json.loads(Path(args.wireframe_json).read_text(encoding="utf-8"))
    issues = validate_sequence(seq)
    if issues:
        raise SystemExit("Invalid wireframe JSON: " + "; ".join(issues))
    metrics = json.loads(Path(args.metrics).read_text(encoding="utf-8")) if args.metrics else build_validation_metrics(seq)
    out = render_wireframe_video(
        seq,
        Path(args.out),
        metrics=metrics,
        source_video=Path(args.source_video) if args.source_video else None,
    )
    print(f"Rendered wireframe preview -> {out}")
    return 0


def cmd_demo(args: argparse.Namespace) -> int:
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    scenarios = [args.scenario] if args.scenario != "all" else ["carve", "spin", "jump", "showcase"]
    for sc in scenarios:
        seq = flag_spin_blur_and_anomalies(generate_synthetic_sequence(sc, fps=args.fps))
        metrics = build_validation_metrics(seq)
        wf_path = out_dir / f"{seq['id']}.wireframe.json"
        met_path = out_dir / f"{seq['id']}.validation-metrics.json"
        write_wireframe_json(seq, wf_path)
        write_validation_metrics(metrics, met_path)
        obs = metrics["observables"]
        print(
            f"[{sc:8s}] frames={len(seq['frames']):3d} "
            f"O1_lean={obs['O1_carve'].get('median')} deg | "
            f"O2_R={obs['O2_tracing'].get('value')} m | "
            f"O4_decel={obs['O4_glide'].get('value')} m/s^2 | "
            f"O5_air={obs['O5_jump'].get('value')} s | "
            f"O6_spinup={obs['O6_inertia'].get('spin_up_ratio')}x"
        )
        if args.render:
            mp4_path = out_dir / f"{seq['id']}.wireframe.mp4"
            render_wireframe_video(seq, mp4_path, metrics=metrics)
            print(f"           preview -> {mp4_path}")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="video-pose", description="EDGEWORK offline Video-to-Wireframe & Validation CLI")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("probe", help="Check Python packages, FFmpeg, GPU VRAM, and backends")

    insp = sub.add_parser("inspect-weights", help="Statically inspect a .pt/.pth/.ckpt file before loading")
    insp.add_argument("file", help="Path to model weight / checkpoint file")

    cal = sub.add_parser("calibrate", help="Fit metric rink homography from known circle/sheet markings")
    cal.add_argument("--marking", required=True, choices=sorted(RINK_MARKINGS), help="Reference rink marking")
    cal.add_argument("--points", required=True, help="Four semicolon-separated pixel coords: x1,y1;x2,y2;x3,y3;x4,y4")
    cal.add_argument("--out", required=True, help="Output calibration JSON path")
    cal.add_argument("--note", default="", help="Optional calibration note")

    ext = sub.add_parser("extract", help="Convert world-grounded 3D pose output into wireframe JSON + validation sidecar")
    ext.add_argument("input", help="Path to .npz, .json, or GVHMR/WHAM .pt file")
    ext.add_argument("--backend", default="npz", choices=["npz", "gvhmr", "wham"])
    ext.add_argument("--layout", default="smpl24", choices=["smpl24", "coco17", "mp33", "edgework18"])
    ext.add_argument("--coord-space", default="world-zup", choices=["world-zup", "world-yup", "skater-local"])
    ext.add_argument("--camera-space", action="store_true", help="Flag input as uncompensated camera-space (blocks O2/O4 world metrics)")
    ext.add_argument("--fps", type=float, default=None)
    ext.add_argument("--id", default=None)
    ext.add_argument("--name", default=None)
    ext.add_argument("--category", default="expression")
    ext.add_argument("--style", default=None)
    ext.add_argument("--discipline", default=None)
    ext.add_argument("--calibration", default=None, help="Optional rink homography JSON from `calibrate`")
    ext.add_argument("--source-video", default=None, help="Optional source .mp4 for camera-cut detection and side-by-side preview")
    ext.add_argument("--trust-checkpoint", action="store_true", help="Required before loading PyTorch .pt/.pth/.ckpt files")
    ext.add_argument("--render", action="store_true", help="Also render a math-driven wireframe .mp4 preview")
    ext.add_argument("--out", required=True, help="Output directory")

    ren = sub.add_parser("render", help="Render a wireframe .mp4 directly from edgework-wireframe/1 JSON")
    ren.add_argument("wireframe_json")
    ren.add_argument("--out", required=True)
    ren.add_argument("--metrics", default=None)
    ren.add_argument("--source-video", default=None)

    demo = sub.add_parser("demo", help="Run deterministic synthetic carve/spin/jump pipeline verification")
    demo.add_argument("--scenario", default="all", choices=["all", "carve", "spin", "jump", "showcase"])
    demo.add_argument("--fps", type=float, default=30.0)
    demo.add_argument("--render", action="store_true", help="Also render wireframe .mp4 previews")
    demo.add_argument("--out", required=True, help="Output directory")

    args = p.parse_args(argv)
    handlers = {
        "probe": cmd_probe,
        "inspect-weights": cmd_inspect_weights,
        "calibrate": cmd_calibrate,
        "extract": cmd_extract,
        "render": cmd_render,
        "demo": cmd_demo,
    }
    return handlers[args.cmd](args)


if __name__ == "__main__":
    raise SystemExit(main())
