# `tools/video-pose/` — Offline Video-to-Wireframe & Fidelity Sidecar CLI

An offline Python toolkit that converts 3D figure-skating pose extractions into:

1. **`<id>.wireframe.json` (`edgework-wireframe/1`)** — 18-joint coordinates + per-joint confidence, read directly by [`tools/ice-lab/game/motion/wireframe.ts`](../ice-lab/game/motion/wireframe.ts) to build proportion-independent `Pose`, `Clip`, and `Track` motion assets (with `arms-only`, `upper-body`, or `full-body` masking).
2. **`<id>.validation-metrics.json` (`edgework-validation-sidecar/1`)** — candidate measurements mapped directly to the observable stubs in [`data/validation/cases/`](../../data/validation/cases/) (O1 `carve_lean_deg`, O2 `trace_radius_m`, O4 `glide_decel_ms2`, O5 `air_time_s` / `takeoff_vz`, O6 `pull_in_ratio` / spin rates).
3. **`<id>.wireframe.mp4`** — a math-driven wireframe preview drawn directly from the extracted coordinates (optionally side-by-side with the source video) so you can visually verify tracking quality before trusting any number.

**Completely decoupled from the solver:** Nothing here imports or modifies `tools/ice-lab/sim/` or `/39` replays.

---

## Quick start (zero extra installs needed)

Check your environment, GPU VRAM, and available backends:

```sh
python3 tools/video-pose/cli.py probe
```

Run the deterministic synthetic pipeline (carve + spin + jump + showcase) and render wireframe MP4 previews:

```sh
python3 tools/video-pose/cli.py demo --out /tmp/edgework-wireframe-demo --render
```

Calibrate an overhead/high-angle broadcast rink clip using standard markings (`center_circle` = `3.0 m` radius, `faceoff_circle` = `4.5 m` radius):

```sh
python3 tools/video-pose/cli.py calibrate \
  --marking center_circle \
  --points "640,300;580,260;520,300;580,340" \
  --out /tmp/rink-cal.json
```

Extract from a world-grounded GVHMR / WHAM `.npz` export (`joints3d_global` or `joints3d_world`):

```sh
python3 tools/video-pose/cli.py extract /path/to/clip_world.npz \
  --backend gvhmr \
  --layout smpl24 \
  --coord-space world-zup \
  --source-video /path/to/clip.mp4 \
  --out /tmp/wireframe-out \
  --render
```

---

## Guardrails enforced in code

- **World-space vs. camera-space separation:** Broadcast camera pans and zooms corrupt trajectory math. `O2` (`trace_radius_m`) and `O4` (`glide_decel_ms2`) are emitted **only** when `meta.cameraCompensated` is `true` (from a world-grounded estimator like GVHMR or WHAM) or when a rink homography calibration JSON is supplied. Pass `--camera-space` for uncompensated 2D/3D pose dumps to explicitly block O2/O4 metrics while still generating safe `arms-only` / `upper-body` dance clips.
- **Fast-spin & bone-stretch confidence gating:** `kinematics.py` flags camera cuts, bone lengths that stretch/collapse more than 25% from the clip median, and rapid spins approaching the frame-rate Nyquist limit, lowering affected joint confidences so `wireframe.ts` masks them cleanly.
- **Safe checkpoint hygiene:** `.npz` archives load with `allow_pickle=False`. PyTorch `.pt`/`.pth`/`.ckpt` files are refused unless `--trust-checkpoint` is explicitly passed (and still load with `weights_only=True`).
- **D6 / Copyright hygiene:** Keep third-party broadcast footage in local untracked folders (`private/` or `/tmp`), never committed to the public repo. Only commit anonymized, human-verified measurements or clips.

## Using GVHMR or WHAM locally on an 8 GB RTX 2080 SUPER

1. Check `ollama ps` and `nvidia-smi` so at least ~4 GB VRAM is free before running 3D pose inference.
2. Run GVHMR or WHAM in its own isolated Python virtual environment (keep heavy PyTorch dependencies out of `~/.kgirl/venv` and system Python).
3. Export its world-grounded SMPL-24 joints (`joints3d_global` / `joints3d_world`), root translation (`trans_global`), and `fps` into a `.npz` archive, then run `cli.py extract ... --render`.
4. Visually inspect the side-by-side wireframe MP4 and the `validation-metrics.json` sidecar before transferring verified numbers into `data/validation/cases/*.json`.
