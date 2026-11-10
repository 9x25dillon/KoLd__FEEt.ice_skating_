# JPSE: Jump Path Synthesis Engine

Issue #74. This first slice is what the owner's review comment on that issue asks for:
one jump definition and one canonical entrance. That entrance is generated as four
candidates (canonical, mirror, reverse, mirror+reverse). Each runs through the
unmodified Ice Lab solver, and the result is a deterministic report.

```sh
npm run jpse                                    # summary table
node jpse/cli.ts --out report.json             # the full report (jpse-report/1)
node jpse/cli.ts --replays dir                 # each candidate as an edgework-replay/1 clip
node replay/verify.ts dir/jpse-canonical.replay.json
```

## What it is

- **A candidate is an input program**, the SkatingInput stream the solver is fed.
  Transforms rewrite that stream. Nothing here writes solver state, so Ice Lab alone
  decides what each candidate does.
- **The canonical entrance is measured, not authored.** It is
  `test/backjump.test.ts`'s clean double loop, run once through the game's own pad
  mapping. The solver inputs from that run are kept as an open-loop program.
- **Mirror** reflects the entrance across its entry line: the feet swap and every
  lateral quantity changes sign, including the arms' wind-up. **Reverse** travels the
  same stance the other way: forward where the canonical skated backward. Neither
  claims technique equivalence. Every candidate is held to the jump's own definition,
  mirrored where the mirror applies.
- **The COM and the support blade are separate tracks.** The report also carries the
  edge timeline, the blade-to-travel angle, curvature, and the quasi-steady
  `g tan(phi)/v^2`. That last one is a baseline the solver's curvature is compared to,
  never applied.

## Judgement

The checks are hard gates, each failure with its own reason: finite state, replay
determinism, rotation direction modelled, took off, takeoff edge, takeoff contact (the
solver's own regime at the release), and completed (the solver's own landing call, then
standing through the run-out). There is no aggregate score yet: measure first, then
choose an optimizer.

## Findings from the first run (2026-11-09)

| candidate | takeoff | outcome | rejected for |
| --- | --- | --- | --- |
| canonical | RBO, CARVE | 2Lo, 1.971 rev, clean, stood | accepted |
| mirror | LBO, SKID | no jump, 0.58 rev, fell | cw-not-modelled, takeoff-contact:SKID |
| reverse | RFO swivels to RBO mid-SKID | no rotation | takeoff-contact:SKID |
| mirror+reverse | none: LFO load lapses | stays on the ice | takeoff:none |

Without a sheet, the canonical reproduces backjump.test.ts's 1.994 exactly. The
1.971 is the same entrance on a sheet.

The mirror is exact on the ice wherever the solver is left/right symmetric. Three
sources in the solver are not, and are reported rather than patched (`SOLVER_HANDEDNESS`
in engine.ts):

- **The ice grid's row boundary at y = 0.** y = 0 belongs to the row above it.
- **The fatigue wobble, seeded by tick.** The same push goes the same way for both feet.
- **The two-foot tie.** At equal weight the right foot carries the heading.

## Next

These follow issue #74's order. Each starts once this slice's numbers are agreed:

- Add a second jump and entrance. A toe jump would exercise the toe-pick gate.
- Report candidate-evaluation cost, plus score and constraint distributions, over a
  deterministic bounded sample.
- Only then build an optimizer, with explicit seeds and a replayable candidate order.
  It feeds the lower-difficulty mode and the tutorials.
- Routine synergy stays a game mechanic, outside the physics and outside official
  scoring.
