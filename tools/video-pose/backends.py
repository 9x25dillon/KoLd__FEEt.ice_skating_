"""Pluggable 3D pose backends and local environment probe for tools/video-pose.

Backends:
- `npz`        Safe NumPy/JSON coordinate ingestion (`allow_pickle=False`) for SMPL-24,
               COCO-17, MediaPipe-33, or EDGEWORK-18 dumps exported by GVHMR / WHAM / 4D-Humans.
- `gvhmr`      Adapter for GVHMR world-grounded results (`world-zup`, `cameraCompensated: true`).
               Refuses raw `.pt` pickle files unless `--trust-checkpoint` is explicitly passed;
               always prefers safe `.npz` exports.
- `wham`       Adapter for WHAM world-grounded outputs (`joints3d_world` / `trans_world`,
               `cameraCompensated: true`), same safe checkpoint guardrail.
- `mediapipe`  Optional local MediaPipe Pose World Landmarks extractor when `mediapipe` is
               installed. Explicitly tagged `cameraCompensated: false` (safe for upper-body
               dance expression; never trusted for uncalibrated O2/O4 world trajectory math).
- `synthetic`  Deterministic physics-consistent carving / spin / jump generator for verifying
               the entire CLI -> wireframe.json -> validation-metrics.json -> wireframe.mp4 ->
               Node `wireframe.ts` pipeline end to end.
"""

from __future__ import annotations

import json
import math
import pickletools
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import Any

import numpy as np

from .schema import WIREFRAME_SCHEMA, map_joints_frame


def probe_environment() -> dict[str, Any]:
    """Reports installed local tools, Python packages, and GPU VRAM headroom."""
    mods: dict[str, str | None] = {}
    for name in ("numpy", "PIL", "scipy", "cv2", "torch", "mediapipe", "ultralytics"):
        try:
            m = __import__(name)
            mods[name] = str(getattr(m, "__version__", "installed"))
        except Exception:
            mods[name] = None

    gpu: dict[str, Any] | None = None
    if shutil.which("nvidia-smi"):
        proc = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,temperature.gpu,memory.used,memory.total", "--format=csv,noheader,nounits"],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=False,
        )
        if proc.returncode == 0 and proc.stdout.strip():
            parts = [p.strip() for p in proc.stdout.strip().splitlines()[0].split(",")]
            if len(parts) >= 4:
                used = float(parts[2])
                total = float(parts[3])
                gpu = {
                    "name": parts[0],
                    "temp_c": float(parts[1]),
                    "vram_used_mib": used,
                    "vram_total_mib": total,
                    "vram_free_mib": round(total - used, 1),
                    "vram_ok_for_3d_pose": (total - used) >= 3500.0,
                }

    torch_cuda: dict[str, Any] | None = None
    if mods["torch"] is not None:
        try:
            import torch  # type: ignore[import-not-found]
            avail = bool(torch.cuda.is_available())
            torch_cuda = {
                "available": avail,
                "cuda_runtime": getattr(torch.version, "cuda", None),
                "device_name": torch.cuda.get_device_name(0) if avail else None,
            }
        except Exception:
            torch_cuda = {"available": False}

    return {
        "python": sys.version.split()[0],
        "executable": sys.executable,
        "ffmpeg": shutil.which("ffmpeg"),
        "packages": mods,
        "torch_cuda": torch_cuda,
        "gpu": gpu,
        "available_backends": {
            "npz": True,
            "synthetic": True,
            "gvhmr_npz": True,
            "gvhmr_pt": mods["torch"] is not None,
            "wham_npz": True,
            "wham_pt": mods["torch"] is not None,
            "mediapipe": mods["mediapipe"] is not None,
            "ultralytics": mods["ultralytics"] is not None,
        },
    }


# Safe built-in pickle globals expected inside standard PyTorch tensor archives.
_SAFE_PICKLE_MODULES = frozenset({
    "collections", "torch", "torch._utils", "torch.storage", "numpy", "numpy.core.multiarray",
    "numpy._core.multiarray", "builtins", "_codecs", "typing",
})
_DANGEROUS_PICKLE_MODULES = frozenset({
    "os", "posix", "nt", "subprocess", "sys", "shutil", "socket", "http", "urllib", "importlib",
})


def inspect_weights_file(path: Path) -> dict[str, Any]:
    """Statically inspects a `.pt`/`.pth`/`.ckpt` archive without executing any code.

    Lists ZIP entries and scans embedded pickle opcodes (`GLOBAL` / `STACK_GLOBAL` / `REDUCE`)
    so the user can verify a checkpoint before passing `--trust-checkpoint`.
    """
    if not path.exists():
        raise FileNotFoundError(str(path))
    size_mb = round(path.stat().st_size / (1024 * 1024), 2)
    is_zip = zipfile.is_zipfile(path)
    entries: list[str] = []
    pickle_files: list[str] = []
    globals_found: set[str] = set()
    suspicious: list[str] = []

    def scan_pickle_bytes(raw: bytes, label: str) -> None:
        stack_str: list[str] = []
        try:
            for op, arg, _pos in pickletools.genops(raw):
                if op.name in ("SHORT_BINUNICODE", "BINUNICODE", "UNICODE", "STRING", "BINSTRING", "SHORT_BINSTRING"):
                    if isinstance(arg, str):
                        stack_str.append(arg)
                        if len(stack_str) > 8:
                            stack_str.pop(0)
                elif op.name == "GLOBAL" and isinstance(arg, str):
                    mod = arg.split(" ", 1)[0]
                    globals_found.add(arg)
                    if mod in _DANGEROUS_PICKLE_MODULES or "eval" in arg or "exec" in arg or "system" in arg:
                        suspicious.append(f"{label}: GLOBAL {arg}")
                elif op.name == "STACK_GLOBAL" and len(stack_str) >= 2:
                    mod, name = stack_str[-2], stack_str[-1]
                    full = f"{mod}.{name}"
                    globals_found.add(full)
                    if mod in _DANGEROUS_PICKLE_MODULES or name in ("eval", "exec", "system", "popen", "__import__"):
                        suspicious.append(f"{label}: STACK_GLOBAL {full}")
        except Exception as exc:
            suspicious.append(f"{label}: pickle scan stopped early ({exc})")

    if is_zip:
        with zipfile.ZipFile(path, "r") as zf:
            entries = zf.namelist()
            for name in entries:
                if name.endswith(".pkl") or name.endswith("data.pkl"):
                    pickle_files.append(name)
                    scan_pickle_bytes(zf.read(name), name)
    else:
        pickle_files.append(path.name)
        scan_pickle_bytes(path.read_bytes()[:4 * 1024 * 1024], path.name)

    unknown_modules = sorted({
        g.split(".", 1)[0].split(" ", 1)[0] for g in globals_found
        if g.split(".", 1)[0].split(" ", 1)[0] not in _SAFE_PICKLE_MODULES
    })
    return {
        "path": str(path),
        "size_mb": size_mb,
        "format": "pytorch-zip" if is_zip else "raw-pickle",
        "zip_entries_count": len(entries),
        "pickle_files": pickle_files,
        "globals_count": len(globals_found),
        "unknown_modules": unknown_modules,
        "suspicious": suspicious,
        "safe_for_weights_only": len(suspicious) == 0 and is_zip,
    }


def _build_sequence_from_array(
    *,
    seq_id: str,
    name: str,
    category: str,
    xyz_seq: np.ndarray,
    layout: str,
    fps: float,
    coord_space: str,
    extractor: str,
    camera_compensated: bool,
    provenance: str,
    conf_seq: np.ndarray | None = None,
    root_world: np.ndarray | None = None,
    root_yaw_rad: np.ndarray | None = None,
    style_tag: str | None = None,
    discipline: str | None = None,
    note: str = "",
) -> dict[str, Any]:
    if xyz_seq.ndim != 3 or xyz_seq.shape[2] != 3:
        raise ValueError(f"Expected (T, N, 3) joint coordinates, got shape {xyz_seq.shape}")
    frames: list[dict[str, Any]] = []
    for i in range(xyz_seq.shape[0]):
        c_i = conf_seq[i] if (conf_seq is not None and i < len(conf_seq)) else None
        joints, scores = map_joints_frame(xyz_seq[i], layout, c_i)
        frame: dict[str, Any] = {
            "t": round(i / fps, 6),
            "joints": joints,
            "confidence": scores,
        }
        if root_world is not None and i < len(root_world) and np.all(np.isfinite(root_world[i])):
            frame["rootWorld"] = [round(float(v), 6) for v in root_world[i]]
        if root_yaw_rad is not None and i < len(root_yaw_rad) and np.isfinite(root_yaw_rad[i]):
            frame["rootYawRad"] = round(float(root_yaw_rad[i]), 6)
        frames.append(frame)

    meta: dict[str, Any] = {
        "fps": float(fps),
        "coordSpace": coord_space,
        "extractor": extractor,
        "cameraCompensated": bool(camera_compensated),
        "provenance": provenance,
        "note": note,
    }
    if style_tag:
        meta["styleTag"] = style_tag
    if discipline:
        meta["discipline"] = discipline
    return {
        "schema": WIREFRAME_SCHEMA,
        "id": seq_id,
        "name": name,
        "category": category,
        "loop": False,
        "tags": [f"extractor:{extractor}"],
        "meta": meta,
        "frames": frames,
    }


def extract_from_npz(
    path: Path,
    *,
    seq_id: str | None = None,
    name: str | None = None,
    category: str = "expression",
    layout: str = "smpl24",
    fps: float | None = None,
    coord_space: str = "world-zup",
    extractor: str = "npz-world-3d",
    camera_compensated: bool = True,
    style_tag: str | None = None,
    discipline: str | None = None,
) -> dict[str, Any]:
    """Loads world-grounded 3D joint coordinates safely from a `.npz` archive (`allow_pickle=False`)."""
    with np.load(path, allow_pickle=False) as data:
        # Support standard array keys from GVHMR, WHAM, and generic exports.
        joint_key = next((k for k in ("joints3d_global", "joints3d_world", "joints3d", "joints") if k in data), None)
        if joint_key is None:
            raise KeyError(f"{path.name} has none of joints3d_global/joints3d_world/joints3d/joints (keys: {list(data.keys())})")
        xyz = np.asarray(data[joint_key], dtype=np.float64)
        conf = np.asarray(data["confidence"], dtype=np.float64) if "confidence" in data else None
        root_world = None
        for rk in ("trans_global", "trans_world", "root_world"):
            if rk in data:
                root_world = np.asarray(data[rk], dtype=np.float64)
                break
        root_yaw = np.asarray(data["root_yaw_rad"], dtype=np.float64) if "root_yaw_rad" in data else None
        file_fps = float(data["fps"]) if "fps" in data else None

    use_fps = fps if fps is not None else (file_fps if file_fps and file_fps > 0 else 30.0)
    stem = seq_id or path.stem
    return _build_sequence_from_array(
        seq_id=stem,
        name=name or stem.replace("-", " ").replace("_", " ").title(),
        category=category,
        xyz_seq=xyz,
        layout=layout,
        fps=use_fps,
        coord_space=coord_space,
        extractor=extractor,
        camera_compensated=camera_compensated,
        provenance="pose-3d",
        conf_seq=conf,
        root_world=root_world,
        root_yaw_rad=root_yaw,
        style_tag=style_tag,
        discipline=discipline,
        note=f"Imported from {path.name} ({joint_key}, layout={layout}).",
    )


def extract_from_gvhmr_or_wham(
    path: Path,
    backend: str,
    *,
    trust_checkpoint: bool = False,
    **kwargs: Any,
) -> dict[str, Any]:
    """Reads GVHMR or WHAM world-grounded output (`.npz` directly, or `.pt` only with `--trust-checkpoint`)."""
    suffix = path.suffix.lower()
    if suffix == ".npz":
        return extract_from_npz(
            path,
            layout=kwargs.pop("layout", "smpl24"),
            coord_space=kwargs.pop("coord_space", "world-zup" if backend == "gvhmr" else "world-yup"),
            extractor=backend,
            camera_compensated=True,
            **kwargs,
        )
    if suffix == ".json":
        raw = json.loads(path.read_text(encoding="utf-8"))
        if raw.get("schema") == WIREFRAME_SCHEMA:
            return raw
        raise ValueError(f"{path.name} is JSON without schema {WIREFRAME_SCHEMA}")
    if suffix in (".pt", ".pth", ".ckpt"):
        if not trust_checkpoint:
            raise PermissionError(
                f"Refusing to unpickle {path.name} without --trust-checkpoint. "
                "Inspect the file first or export its world joints as a safe .npz archive (`allow_pickle=False`)."
            )
        try:
            import torch  # type: ignore[import-not-found]
        except Exception as exc:
            raise RuntimeError("PyTorch is not installed in this Python environment.") from exc
        blob = torch.load(str(path), map_location="cpu", weights_only=True)
        arr = None
        for key in ("joints3d_global", "joints3d_world", "pred_j3d_world", "joints3d"):
            if isinstance(blob, dict) and key in blob:
                arr = blob[key].detach().cpu().numpy()
                break
        if arr is None:
            raise KeyError(f"Could not find world-space 3D joints in {path.name}.")
        fps = float(kwargs.pop("fps", None) or 30.0)
        return _build_sequence_from_array(
            seq_id=kwargs.pop("seq_id", None) or path.stem,
            name=kwargs.pop("name", None) or path.stem,
            category=kwargs.pop("category", "expression"),
            xyz_seq=np.asarray(arr, dtype=np.float64),
            layout=kwargs.pop("layout", "smpl24"),
            fps=fps,
            coord_space=kwargs.pop("coord_space", "world-zup" if backend == "gvhmr" else "world-yup"),
            extractor=backend,
            camera_compensated=True,
            provenance="pose-3d",
            style_tag=kwargs.pop("style_tag", None),
            discipline=kwargs.pop("discipline", None),
            note=f"Loaded weights-only tensor from {path.name} via {backend}.",
        )
    raise ValueError(f"Unsupported input extension {suffix!r} for {backend} (expected .npz, .json, or .pt).")


def generate_synthetic_sequence(
    scenario: str = "showcase",
    fps: float = 30.0,
) -> dict[str, Any]:
    """Generates a deterministic, physically grounded world-space figure skating wireframe sequence.

    Scenarios:
    - `carve`    3.0 s circular carve at r = 6.0 m, speed = 4.9 m/s, body lean = 22.0 deg (tests O1 + O2 + O4).
    - `spin`     2.0 s centered spin pulling arms from 1.25 m -> 0.36 m while speeding 10 -> 22 rad/s (tests O6).
    - `jump`     1.6 s run-in + 0.60 s ballistic jump (vz = 2.943 m/s, h = 0.441 m, 2.0 rev) + landing (tests O5).
    - `showcase` 4.0 s combined carve -> pull-in spin -> jump sequence for visual wireframe rendering.
    """
    if scenario not in ("carve", "spin", "jump", "showcase"):
        raise ValueError(f"Unknown synthetic scenario: {scenario!r}")

    durations = {"carve": 3.0, "spin": 2.0, "jump": 1.6, "showcase": 4.0}
    dur = durations[scenario]
    n_frames = int(round(dur * fps)) + 1

    def build_body_local(lean_rad: float, arm_open: float, knee_bend: float, twist_rad: float) -> dict[str, np.ndarray]:
        """Local skater frame: +x right, +y up, +z back (faces -z), tilted around -z by lean_rad."""
        ankle_y = 0.105
        leg_h = (0.4105 + 0.3755) * (1.0 - 0.18 * knee_bend)
        pel_h = ankle_y + leg_h
        # Lean tilts the body inward toward -x by lean_rad.
        cl, sl = math.cos(lean_rad), math.sin(lean_rad)

        def tilt(v: np.ndarray) -> np.ndarray:
            # Rotate about z-axis so upright (0,1,0) leans toward -x by lean_rad
            return np.array([v[0] * cl - v[1] * sl, v[0] * sl + v[1] * cl, v[2]], dtype=np.float64)

        pelvis = tilt(np.array([0.0, pel_h, 0.0]))
        hipL = pelvis + tilt(np.array([-0.105, 0.0, 0.0]))
        hipR = pelvis + tilt(np.array([0.105, 0.0, 0.0]))
        kneeL = hipL + tilt(np.array([0.0, -0.4105 * (1.0 - 0.20 * knee_bend), -0.10 * knee_bend]))
        kneeR = hipR + tilt(np.array([0.0, -0.4105 * (1.0 - 0.20 * knee_bend), -0.10 * knee_bend]))
        ankleL = np.array([-0.105, ankle_y, 0.0])
        ankleR = np.array([0.105, ankle_y, 0.0])
        toeL = ankleL + np.array([0.0, -0.05, -0.22])
        toeR = ankleR + np.array([0.0, -0.05, -0.22])

        chest = pelvis + tilt(np.array([0.0, 0.44, 0.0]))
        neck = chest + tilt(np.array([0.0, 0.08, 0.0]))
        crown = neck + tilt(np.array([0.0, 0.22, 0.0]))

        # Shoulder line twisted by twist_rad around trunk axis
        ct, st = math.cos(twist_rad), math.sin(twist_rad)
        sh_axis = tilt(np.array([ct, 0.0, st]))
        shoulderL = chest - 0.185 * sh_axis - tilt(np.array([0.0, 0.04, 0.0]))
        shoulderR = chest + 0.185 * sh_axis - tilt(np.array([0.0, 0.04, 0.0]))

        # Arm spread controlled by arm_open in [0..1] with rigid anatomical bone lengths (0.29 m / 0.2074 m)
        u_dir_l = np.array([-(0.25 + 0.75 * arm_open), -0.80 * (1.0 - arm_open), -0.45 * (1.0 - arm_open)])
        u_dir_l = u_dir_l / max(float(np.linalg.norm(u_dir_l)), 1e-6)
        u_dir_r = np.array([+(0.25 + 0.75 * arm_open), -0.80 * (1.0 - arm_open), -0.45 * (1.0 - arm_open)])
        u_dir_r = u_dir_r / max(float(np.linalg.norm(u_dir_r)), 1e-6)
        f_dir_l = np.array([+(0.65 - 1.65 * arm_open), 0.35 * (1.0 - arm_open), -0.65 * (1.0 - arm_open)])
        f_dir_l = f_dir_l / max(float(np.linalg.norm(f_dir_l)), 1e-6)
        f_dir_r = np.array([-(0.65 - 1.65 * arm_open), 0.35 * (1.0 - arm_open), -0.65 * (1.0 - arm_open)])
        f_dir_r = f_dir_r / max(float(np.linalg.norm(f_dir_r)), 1e-6)
        elbowL = shoulderL + tilt(u_dir_l * 0.29)
        elbowR = shoulderR + tilt(u_dir_r * 0.29)
        wristL = elbowL + tilt(f_dir_l * 0.2074)
        wristR = elbowR + tilt(f_dir_r * 0.2074)

        return {
            "pelvis": pelvis, "hipL": hipL, "hipR": hipR,
            "kneeL": kneeL, "kneeR": kneeR, "ankleL": ankleL, "ankleR": ankleR,
            "toeL": toeL, "toeR": toeR, "chest": chest, "neck": neck, "crown": crown,
            "shoulderL": shoulderL, "shoulderR": shoulderR,
            "elbowL": elbowL, "elbowR": elbowR, "wristL": wristL, "wristR": wristR,
        }

    frames: list[dict[str, Any]] = []
    yaw_accum = 0.0
    for i in range(n_frames):
        t = i / fps
        dt = 1.0 / fps
        root_x, root_y, root_z = 0.0, 0.0, 0.0
        lean = 0.0
        arm_open = 0.9
        knee_bend = 0.15
        twist = 0.0

        if scenario == "carve":
            radius = 6.0
            v = max(2.5, 5.0 - 0.072 * t)  # realistic ~0.072 m/s^2 glide decel
            theta = (5.0 * t - 0.036 * t * t) / radius
            root_x = radius * math.cos(theta)
            root_z = radius * math.sin(theta)
            yaw_accum = theta + math.pi * 0.5
            lean = math.radians(22.0)
            arm_open = 0.85
            twist = math.radians(10.0)
        elif scenario == "spin":
            u = min(1.0, max(0.0, (t - 0.5) / 0.6))
            arm_open = 1.0 - 0.92 * u
            omega = 10.0 + 12.0 * u  # 10 rad/s open -> 22 rad/s tucked
            if i > 0:
                yaw_accum += omega * dt
            lean = math.radians(2.0)
            knee_bend = 0.1
        elif scenario == "jump":
            # Run-in 0..0.5 s, ballistic flight 0.5..1.1 s (0.60 s air time), landing 1.1..1.6 s
            root_z = -4.2 * t
            if 0.5 <= t <= 1.1:
                tf = t - 0.5
                vz = 0.5 * 9.81 * 0.60
                root_y = max(0.0, vz * tf - 0.5 * 9.81 * tf * tf)
                arm_open = 0.08
                knee_bend = 0.05
                if i > 0:
                    yaw_accum += (2.0 * 2.0 * math.pi / 0.60) * dt  # 2.0 revolutions in 0.60 s
            elif t < 0.5:
                knee_bend = 0.65 if t > 0.35 else 0.25
                arm_open = 0.95
                twist = math.radians(25.0) if t > 0.35 else 0.0
            else:
                knee_bend = 0.60 * max(0.0, 1.0 - (t - 1.1) / 0.4)
                arm_open = 0.95
        else:  # showcase: carve (0..1.6s) -> spin pull-in (1.6..2.8s) -> jump (2.8..4.0s)
            if t < 1.6:
                radius = 5.5
                theta = (4.5 * t) / radius
                root_x = radius * math.cos(theta) - radius
                root_z = radius * math.sin(theta)
                yaw_accum = theta
                lean = math.radians(20.0)
                arm_open = 0.9
            elif t < 2.8:
                u = min(1.0, max(0.0, (t - 1.8) / 0.6))
                arm_open = 1.0 - 0.90 * u
                omega = 9.0 + 13.0 * u
                if i > 0:
                    yaw_accum += omega * dt
                root_x = -0.3
                root_z = 2.8
            else:
                root_x = -0.3
                root_z = 2.8 - 3.6 * (t - 2.8)
                if 3.0 <= t <= 3.6:
                    tf = t - 3.0
                    vz = 0.5 * 9.81 * 0.60
                    root_y = max(0.0, vz * tf - 0.5 * 9.81 * tf * tf)
                    arm_open = 0.1
                    if i > 0:
                        yaw_accum += (2.0 * 2.0 * math.pi / 0.60) * dt
                else:
                    arm_open = 0.9
                    knee_bend = 0.55 if t < 3.0 else 0.4

        local = build_body_local(lean, arm_open, knee_bend, twist)
        cy, sy = math.cos(yaw_accum), math.sin(yaw_accum)
        world_joints: dict[str, list[float]] = {}
        confs: dict[str, float] = {}
        for jname, lv in local.items():
            wx = lv[0] * cy + lv[2] * sy + root_x
            wy = lv[1] + root_y
            wz = -lv[0] * sy + lv[2] * cy + root_z
            world_joints[jname] = [round(float(wx), 6), round(float(wy), 6), round(float(wz), 6)]
            confs[jname] = 0.98

        frames.append({
            "t": round(t, 6),
            "joints": world_joints,
            "confidence": confs,
            "rootWorld": [round(root_x, 6), round(root_y, 6), round(root_z, 6)],
            "rootYawRad": round(yaw_accum, 6),
        })

    return {
        "schema": WIREFRAME_SCHEMA,
        "id": f"synthetic-{scenario}",
        "name": f"Synthetic {scenario.title()} Reference",
        "category": "spin" if scenario == "spin" else "expression",
        "loop": False,
        "tags": ["synthetic", scenario],
        "meta": {
            "fps": float(fps),
            "coordSpace": "world-yup",
            "extractor": "synthetic-physics-probe",
            "cameraCompensated": True,
            "provenance": "synthetic-roundtrip",
            "styleTag": "lyrical",
            "note": f"Deterministic {scenario} wireframe test sequence with known ground-truth kinematics.",
        },
        "frames": frames,
    }
