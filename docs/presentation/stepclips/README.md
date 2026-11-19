# Step-sequence arms

`00120.png` shows the real Godot skater at tick 120 of a composer `['step']` run, playing the swing-roll arm clip selected from its simulated stroke foot. Legs and blades remain the renderer's sim-driven pose. This is authored presentation, not evidence that the solver executed a swing roll.

Recreate the recording:

```sh
node games/ice-run-godot/tools/prepare.mjs --engine-only
node docs/presentation/stepclips/record.mjs /tmp/codex-stepclips-pose.json
```

Then use `games/ice-run-godot/tools/pose_lab.gd`, passing `--clip=/tmp/codex-stepclips-pose.json`, `--shots=<absolute-output-directory>`, `--ticks=120`, `--view=body`, and `--around=0` as separate arguments after `--`. The existing Godot headless mode measures poses but does not render PNGs; this still used a rendering window with `--rendering-method gl_compatibility`. Full commands and validation limits are in the worktree's `REPORT.md`.
