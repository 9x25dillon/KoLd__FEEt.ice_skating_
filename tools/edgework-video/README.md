# edgework-video

Offline video-to-motion and evidence intake pipeline for **EDGEWORK**, built from `EDGEWORK Video Motion Blueprint.md` (20 Nov 2026).

## Design posture (owner-approved 2026-11-23)
- **Two lanes on one source timeline:**
  - **Evidence lane (`edgework-evidence/1`):** 2D keypoints, two-annotator events, frame counts, and surveyed ice-plane homography. Never inherits 3D pose-model contact assumptions.
  - **Animation lane (`edgework-wireframe/1`):** 3D pose recovery feeding cosmetic `arms` layer cues and full-body showcase Tracks. Never produces fidelity evidence.
- **Licensing posture:** `research-only` for 3D pose backends (GVHMR / WHAM / SMPL / YOLOv8) until legal review. The `intake`, `annotate`, `metrics`, and `verify` stages use **Python's standard library + `ffprobe`** only (no GPU, no external packages, no network).
- **Repo boundary:** Source video **never** enters the repository. `--takes-root` must live outside any git worktree.

## Quick usage

```sh
# 1. Intake an authorized clip (from tools/edgework-video/)
python3 -m edgework_video intake /path/to/clip.mp4 \
  --manifest /path/to/take-input.json \
  --takes-root /tmp/edgework-takes

# 2. Record two independent annotators' event CSVs for shot S01
python3 -m edgework_video annotate /tmp/edgework-takes/take-0001 \
  --shot S01 --events /path/to/a1.csv --annotator A1
python3 -m edgework_video annotate /tmp/edgework-takes/take-0001 \
  --shot S01 --events /path/to/a2.csv --annotator A2

# 3. Extract O5 / O6 evidence sidecar (edgework-evidence/1)
python3 -m edgework_video metrics /tmp/edgework-takes/take-0001 \
  --shot S01 --observables O5,O6 --clip take-0001-s01-jump

# 4. Verify schemas, file hashes, and PTS monotonicity
python3 -m edgework_video verify /tmp/edgework-takes/take-0001
```

### Annotation CSV format
Required columns: `event`, `frame_index`. Optional: `phase`, `value`, `note`.
- `blade_off`, `touchdown` — O5 jump air time (last / first blade contact frame)
- `takeoff_heading_deg`, `landing_heading_deg` (`value` = degrees) + `rev_pass` (`phase=jump`) — O5 `revolutions_turned`
- `rev_pass` (`phase=open`, `phase=tucked`, or `phase=spin`) — O6 `spin_rate_rps`, `pull_in_ratio` (`ω_tucked / ω_open`), `spin_decay_per_s`
- `reject_start`, `reject_end` (`value` = reason code, `note` = detail) — carried into `rejectedIntervals`

## Exit codes
- `0` — OK (all requested outputs written)
- `2` — Invalid input (missing file, bad JSON/CSV, out-of-range `frame_index`, unsafe id)
- `3` — Precondition unmet (missing `authorization.basis`, `--takes-root` inside a git worktree)
- `4` — Backend / probe failure (`ffprobe` error, missing video stream, unreadable or non-monotonic PTS)

## Tests (run on request)
```sh
python3 -m unittest discover -s tools/edgework-video/tests -v
```
