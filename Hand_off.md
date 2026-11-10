# Hand-off — EDGEWORK / native game

## Resume here
**Newest close:** 9 November 2026, 19:10 PST · Claude Code, Opus 5.5 · session `cd5d8f8d`
**Where things stand:** Everything from today is on `main` (`d9aa167`, PRs #75–#80). Issue #74's Jump Path Synthesis Engine (**JPSE**) exists in `tools/ice-lab/jpse/`. It has a language-neutral contract in `docs/jpse/` and its first measured search. Jumps now turn **clockwise or counter-clockwise from the entrance** (`jumpDirMode`, on in every setup). The career has four **styles** (Power, Finesse, Technician, Endurance) plus a **custom style** forged from season one, with a nudge. Finesse's **free leg raise** gives spirals, the attitude and the standing split spin. It's on the Elite paddle, and the split counts in spin levels. None of today's work has been played on the pad.
**Corrects the previous hand-off:** its newest row was 2 November. Since then #70–#73 landed (rivals re-derived, Unreal client, steadying hand), **but PR #73's Unreal work never reached `main`**. It merged into `unreal-bridge-client` after #72 had already merged that branch into `main`, so it sits stranded at `3122266`. "Replay stays at `/39`" still holds: today's new levers are unbumped, per the changelog's policy.
**Decision needed:** should #73's stranded Unreal work come to `main`? Reply "open a PR from unreal-bridge-client to main" if so.
**Start with:**
1. `git fetch origin; git log --oneline -3 origin/main` and `gh run list --branch main --limit 3`: confirm `d9aa167` and green CI. It was still running at close.
2. Fresh worktree off `origin/main`, then `npm start`. Play the career on Experimental with the Elite 2: pick a style, try a spiral (free leg's paddle plus an *eased* trigger), and try a clockwise jump from a left-foot entrance.
3. Open the career board in Firefox or Brave and check the "Your style" rows read right. Never checked visually.

## Progress track (newest first)
| Date | Session | Shipped | State after |
|---|---|---|---|
| 2026-11-09 | Opus 5.5 `cd5d8f8d` | PR #80 `d9aa167` | Raise on the free leg's paddle; standing split scores `spin.difficult_variation`; custom style from the season-one journal, plus nudge |
| 2026-11-09 | Opus 5.5 `cd5d8f8d` | PR #79 `449f6a7` | `freeLegRaise` + `flexibility`; attitude and standing split in `data/spin-positions.json`; spiral credit |
| 2026-11-09 | Opus 5.5 `cd5d8f8d` | PR #77 `25dc47a` | Career styles in `game/styles.ts`, measured by `npm run jpse:styles` |
| 2026-11-09 | Opus 5.5 `cd5d8f8d` | PR #76 `eaa1817`, #78 `98c5597` | `jumpDirMode`: direction from the entrance, mirrored table, LBO landing, symmetric two-foot tie; JPSE-004/007 |
| 2026-11-09 | Opus 5.5 `cd5d8f8d` | PR #75 `7f23413` | JPSE slice (four loop entrances, hard gates) and contract (schemas, conformance files) |
| 2026-11-06 | other session | PR #72; #73 **not on main** | Unreal 5.8 client, steadying hand, Travel stage; #73 stranded on `unreal-bridge-client` |
| 2026-11-03 | other session | PR #70, #71 | 2 Nov hand-off; rival baselines from full-time programs |
| 2026-11-02 | Opus 5.5 `c1239b45` | PR #64–#69 | Season-notes fixes, career rules, Composer, atelier |
| earlier | — | — | `docs/handoff-before-jpse-2026-11-09.md` and older archives |

## In flight
- Nothing from today: all merged. Worktrees left in place under no-deletes: `.delivery/jpse`, `.delivery/cw` (branches `jpse-entrance-slice`, `cw-rotation`, `career-styles`, `finesse-spiral`, `custom-style`), `.delivery/handoff-1109`.
- **Unreal director camera** on `unreal-choreo` (`b230393`, 6 Nov, local only, PUBLIC repo): not this session's. Push only on the owner's word.
- **Grip search** on `grip-search` (`370dcb7`): unchanged since 1 November.

## Decisions (why things are the way they are)
- 2026-11-09 **JPSE in TypeScript, behind a language-neutral contract** (owner, after asking about Rust). The solver only runs in TS; other languages connect by reproducing `tools/ice-lab/test/fixtures/jpse/`. Rejected: Rust plus a bridge, and a Rust solver port.
- 2026-11-09 **No weighted objective yet**: JPSE judges by hard gates and reports Pareto fronts; the weights are the owner's call (open).
- 2026-11-09 **Rotation direction is emergent** (owner: "choose by using the skates"). The load reads the edge's turn (lean × travel, *not* yaw rate, which is exactly 0 on some ticks). The takeoff's direction is the sign of the built spin. Rotation stays signed, so renderers turn the right way unchanged.
- 2026-11-09 **The two-foot tie keeps its foot** under `jumpDirMode`. Without it the mirrored loop fell in its load. Cost: 4 tutorial pass times moved 0.1–0.27 s (re-pinned, all still pass).
- 2026-11-09 **The lutz needs the arms**: an entry with nothing counter-rotating turns with its clockwise edge and reads as a clockwise toe loop. Kept as physics.
- 2026-11-09 **Styles are Params multipliers, measured, never asserted**. Cost in full at the choice, half the benefit, drills for the rest; rust 0.25 per season step when put down.
- 2026-11-09 **The free leg's raise is torque against gravity, stopped at flexibility**. It doesn't move the centre of mass (the body rearranges), so balance isn't asked. The split reads at a raise of 0.85 (0.9 minus the data's 10° pose tolerance).
- 2026-11-09 **Raise binding: free leg's paddle plus an eased trigger; stick back bends the knee** (owner's pick). A snapped trigger stays a push.
- 2026-11-09 **The custom style blends the four by season-one leanings, never past them**; nudge +0.25 to one share (owner liked the nudge). Season two never rewrites season one.
- Earlier, still in force: rust is never a menu lock; rivals never decide medals; replay stays at `/39` until the owner's canonicalisation. Details in the archives.

## Dead ends (don't retry without new information)
- **Instant yaw rate as the load's turn sense**: 25 of 225 mirrored grid points differed.
- **Spin probes with `kneeSplit` = `knee`**: that bends the standing knee to 0.6, the sit threshold, so it's a sit spin.
- **Reading flight height off the run's final state**: a later load overwrites it (fixed in #77).
- **Steady carve as a Finesse measure**: every style holds the same 2.27 m radius (lean-limited). Use the serpentine.
- From earlier: rust on input alone; pressing focused buttons from `_input`; regenerating fixtures to pass tests.

## Open questions (settle these first)
- **#73 stranded**: bring `unreal-bridge-client` (`3122266`) to `main`? Conflicts likely in the bridge (today changed `engine.mjs`).
- **JPSE objective weights**: rotation error vs takeoff vs landing quality. They gate the tutorial optimizer.
- **Style numbers and journal references are authored (L3)**: Power lands none of the grid's double loops (its entrances need their own search); Endurance jumps lower than its 4% cost suggests. Play and measurement decide.
- **Do clockwise jumps and the free-leg raise feel right on the pad?** Unplayed.
- **The fatigue wobble isn't mirrored** (seeded by tick): the last remaining left/right difference. Is that acceptable?
- Carried over: full-time programs, floors, the rust bar, stale tutorial air words, the browser Composer and atelier.

## State (verified 19:00–19:10 PST)
- `main` `d9aa167`; open PRs none (before this hand-off's). CI for #79/#80 was in progress at close.
- Outer checkout `phase17-assurance`: old dirty work. Never sweep it.
- No game instance open.

## Project health
- Ice Lab `node --test test/*.test.ts` 964/964 · Godot bridge 45/45 · typecheck clean (scratch TypeScript 7.0.2) · `npm run build` bundles.
- Fragile: a stale Godot bridge copy fails `engine.test.mjs`'s source-hash test; run `prepare.mjs --engine-only` after any `sim/` change.

## Next steps, in order
1. Decide #73; if yes, open the PR and resolve conflicts in a fresh worktree.
2. Play the merged build (styles, spiral on the paddle, clockwise jumps); write timestamped notes.
3. Set the JPSE weights, then build the easy-mode optimizer for tutorials.
4. Give Power its own entrance search (`npm run jpse:search` with a Power spec).
5. A free-leg tutorial step for the paddle raise, proven by a pad test.

## One-shot check
    bash ~/.claude/skills/hanoffed/scripts/scan.sh --root ~/KoLd__FEEt.ice_skating_ --fetch
    npm test
    node games/ice-run-godot/tools/prepare.mjs --engine-only
    node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs
    (cd tools/ice-lab && npm run jpse && npm run jpse:styles)

Typecheck: `npm install typescript @types/node` in a scratch directory, then from `tools/ice-lab` run `<scratch>/node_modules/.bin/tsc --noEmit -p . --typeRoots <scratch>/node_modules/@types`.

## Rules that still apply
- No deletes, resets, cleans, force pushes or overwrites. Additive only.
- New work in a fresh worktree off `origin/main`. Never a broad process kill.
- New physics stays behind a mode or optional input, so off is byte-identical (rebase the replay fixture; digests must stay unchanged). Replay stays at `/39`.
- Measure before claiming. Re-pin a test only for a deliberate change, keep the old figure, and say why. Authored numbers say so (`docs/open-constants.md`).
- The owner decides gate policy: answer, then build. `gh pr merge` needs the owner's `!`. **Check that every pushed commit is in a PR before it merges** (#75 merged before its third commit; #73 stranded).
- Browser checks in Firefox or Brave, never Chromium.

## Vocabulary so far
word, referent, idempotent, provenance, invariant, presupposition, stipulate, contiguous, fast-forward, confabulation, threat model, reaction torque, confound, regression, acceptance criterion, race condition, negative control, preregistration, stacked PR, attestation, opt-in, monotonic, triage, Goodhart's law, protocol deviation, chirality, Pareto front

## Opening prompt for next session (edit the brackets)
> Read `Hand_off.md` in a fresh worktree off `origin/main` and run its one-shot check. Then [bring #73 to main | here are my play notes: … | set the JPSE weights to …]. Stipulate: live work. When we wrap up: /hanoffed.
