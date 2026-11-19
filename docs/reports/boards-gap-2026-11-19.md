# Boards gap — working notes, 2026-11-19

Branch `boards-gap`. Commits: `6313e19` (Codex's work, preserved as found), then the finish.

## Checks
- Off-path guard: with `game/rink.ts`'s guard temporarily inverted, `test/boardsgap.test.ts` fails 2 of 10 (restored; tree clean).
- Baseline before edits (4aaf328 + Codex's files): Ice Lab 1105 tests, 1104 pass, 0 fail, 1 todo (the discretisation floor); replay verified, 240 ticks; Godot 68/68.
- After merging `origin/main`: Ice Lab 1122 tests, 1121 pass, 0 fail, 1 todo; replay verified, 240 ticks; Godot 69/69; `tsc --noEmit` exit 0.
- Report numbers are identical before and after the merge.

## First ice
The owner's Godot save `ice-run-replay.json` (modified 2026-11-11 18:02) matches the hand-off's First ice on duration (75 s), falls (5) and mean speed (0.64 m/s). It needs the off-mode knob adapter in the bench; all 9000 archived digests match with the param off. Read in place, never modified or copied into the repo.

## Not touched
`bridge/engine.mjs`, `sim/solver.ts`, `game/footprep.ts`, `skater.gd`, `IceSkater.cpp`, any root `REPORT.md`. `params.ts`: only the `boardsSnapInbound` lines.
