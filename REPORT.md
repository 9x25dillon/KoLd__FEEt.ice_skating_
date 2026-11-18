# Step clips — implementation ready, verification pending

Worktree `.delivery/stepclips`, branch `stepclips`, baseline `4aaf3280c01b7392d2f8442d1c43f24d820d7a45` (clean at start). The owner requested this task next, so the brief's boards-gap ordering was not followed.

## Changes

- `tools/ice-lab/game/motion/stepclips.ts:13`: a pure selector for routine element `step`. The simulated stroke foot chooses `step.swing-roll` or its mirror; the simulation tick samples the clip. Only four arm segments are returned, no pelvis, trunk, legs, blades, or head. This mapping is authored decoration, not a new step recognized by scoring.
- `tools/ice-lab/game/motion/stepclips.ts:24`: browser overlay on fresh render elbows/hands, with an authored 0.2-second fade using simulation time. Resets at a new run. No solver state is written.
- Browser hooks: `tools/ice-lab/game/main.ts:1,415`; `tools/ice-lab/game/scene.ts:1,30,31,41,216–218`. Ghosts do not receive the player's overlay. Existing low-pose and fall presentation remain in charge.
- Bridge hooks: `games/ice-run-godot/bridge/engine.mjs:1,470,474`. The base motion player still observes every snapshot. Eligible step arms take precedence over dance arms; fall/spin/formal-move behavior stays with the existing player. Godot already blends motion out, and Unreal receives the same frame. No baked tracks added.
- Tests authored: three Ice Lab tests (deterministic choice, release conditions, browser geometry/fade) and two bridge tests (composer `['step']` state digest and score equality at every tick with presentation snapshots versus without, repeated frame determinism, release/priority). **Not executed yet.**
- `docs/presentation/stepclips/record.mjs` records a real composer step-element run for the existing pose lab. `00120.png` is its inspected Godot still.

## Commands and observed results

- `pwd`, `git status -sb`, `git rev-parse HEAD`: correct clean assigned worktree before editing.
- `node games/ice-run-godot/tools/prepare.mjs --engine-only`: 95 modules prepared.
- `node docs/presentation/stepclips/record.mjs`: 240 frames, all 240 carry step arm motion; default output `/tmp/codex-stepclips-pose.json`.
- `godot4 --headless --path games/ice-run-godot --import`: completed; first sandboxed invocation reported blocked sockets/settings, then escalated import completed successfully.
- Headless pose lab, separate arguments: `godot4 --headless --path games/ice-run-godot --script res://tools/pose_lab.gd --quit-after 240 -- --clip=/tmp/codex-stepclips-pose.json --shots=<absolute-worktree>/docs/presentation/stepclips --ticks=120 --view=body --around=0`. 120 rendered-pose samples over 240 simulation ticks, 0 crossed frames, foot-off-line 0.0 m, hip residual 0.0 m; headless produced no PNG (no rendering), and sandbox blocked its user log.
- PNG fallback, approved rendering window: `godot4 --path games/ice-run-godot --rendering-method gl_compatibility --script res://tools/pose_lab.gd -- --clip=/tmp/codex-stepclips-pose.json --shots=<absolute-worktree>/docs/presentation/stepclips --ticks=120 --view=body --around=0`. Same pose-lab metrics; `00120.png` saved and visually inspected. Expected Compatibility warnings for unavailable SSIL, subsurface scattering, volumetric fog. This PNG is **not headless output**.
- `node --check` on selector, bridge, and both new test files: passed. `git diff --check`: passed.

## Still pending

The owner explicitly authorized committing this implementation on 2026-11-18. Test-suite authorization was not included, so baseline/full-suite counts, the five authored tests, replay `/39` verification, typecheck, and Godot `--smoke-test` remain **unverified**. No push or PR is authorized. No packages installed. No sim source, scoring, case, gate, or replay contract changed.

When checks are requested, run the brief's suites/replay, typecheck (scratch dependency installation also needs approval if no compiler is available), and Godot smoke; fix findings and update this report.
