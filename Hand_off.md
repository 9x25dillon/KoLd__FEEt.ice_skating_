# Hand-off — EDGEWORK / native game

## Resume here
**Newest close:** 20 November 2026, 14:40 PST · Claude Code, Opus 5.5 · session `42712937`

**Where things stand:**
- `origin/main` is `f10b12d` (#127).
- `crossPlaceMode` is **on** in Simulation, Experimental and Dig Gate (#126). It's behind a per-tick gate that crosses the feet only during a real under-push.
- The boards snap and the beatcross WIP are settled; both stay as they are.
- **#129, `comSwayMode`** (the body sways over planted blades): built, off everywhere, CI green, **not merged yet**.
- Codex `01a1faea` has two open PRs, #128 (jump lesson port) and #130 (Unreal director camera). Both fail CI only on the README status block.

**Corrects the previous hand-off:** it said "no PRs are open". Three are open now: #128, #129 and #130.

**Decision needed:** the merge order. Recommended: **#129 first** (green). Then #128 and #130 each merge main in and rewrite the README block (`node tools/ice-lab/status.mjs --logs <dir> --write`). One agent lands at a time.

**Start with:**
1. `git fetch origin; git log --oneline -5 origin/main; gh pr list`: expect `f10b12d`, or later if #129 landed.
2. Read `docs/reports/comsway-2026-11-20.md` (the numbers, and what blocks turning it on).
3. The owner tries the 0.35 s sway transfer on the pad (Simulation, `comSwayMode: 1` by hand). Only then run the JPSE jump re-search.

## Progress track (newest first)
| Date | Session | Shipped | State after |
|---|---|---|---|
| 2026-11-20 | Opus 5.5 `42712937` | #126 `57a6907`, #127 `f10b12d`; #129 `7e1d4be` open | `crossPlaceMode` on in Sim/Exp/DigGate; `comSwayMode` built, off; decisions recorded |
| 2026-11-20 | Codex `01a1faea` | #128, #130 open (README block failing) | jump lesson port; Unreal director camera |
| 2026-11-19 | Opus 5.5 `374084d9` + Codex `01a1f564` + Sonnet + agy | PR #114, #118–#124 landed (#115 by owner) | main `cf0ad40`; `crossPlaceMode` built, off |
| 2026-11-18 | Opus 5.5 `43d27f3e` | `59f3e42` on `footprep` | `game/footprep.ts` posed by `skater.gd`; no sim change |
| 2026-11-18 | Claude `2eb8d038` + Codex + Qwen + agy briefs | local branches | beatcross, nationals-pilot, overflight, programclips, stepclips, two-sided-report, boards-gap |
| 2026-11-14–16 | various | PR #107–#113 | venues, kiss-and-cry, costume test, validation tranche, fidelity-ascension; main `4aaf328` |
| 2026-11-14 | Opus 5.5 `2525c6dc` | PR #101–#106 | support signal; weight transfer on in Sim/Exp/DigGate |
| earlier | — | — | `docs/handoff-before-*.md`; previous page: `docs/handoff-before-comsway-2026-11-20.md` |

## In flight
- **`comSwayMode`**, #129 on `com-sway` (worktree `.delivery/comsway`), pushed, CI green.
  - Done: the mode, 5 tests (`test/comsway.test.ts`), the report and the README count (1140).
  - Left: merge it. Then, before turning it on:
    1. pad feel for 0.35 s;
    2. a JPSE re-search of the jump entrances (with the mode on, the 2Lo's L goes 24.17 → 21.17 and lands short, and Power falls);
    3. the `crossPlaceMode` gate, which crosses fewer ticks under the slower transfer;
    4. Katya Vell, 2.4 mm out against the 2 mm boards allowance.
  - Verify: `cd tools/ice-lab && node --test test/comsway.test.ts`.
- **Codex `01a1faea`** (was live at 14:21):
  - #128 `jump-lesson-port`;
  - #130 Unreal director camera (the carried `b230393` item).
  - Both fail only on "README status block is current". Codex should update the block. Don't land them over its head.
- Carried: the jump lesson in `.delivery/jumplesson` is uncommitted (#128 may supersede it; check before reusing). beatcross `71ffbe8` is unfinished research (doc marked).

## Decisions (why things are the way they are)
- 2026-11-20 **`comSwayMode`: physical first, then visible.** Godot and Unreal are untouched; it shows through `s.pos` only when the mode is on.
- 2026-11-20 **The sway goes through a minimum-jerk load plan over `comSwayTransferTime`** (0.35 s, authored). Peak 0.58 g for half the load and 1.15 g for all of it. The critically damped start would need 10.8–21.6 g.
  - Rejected: a third-order filter, which peaks around 4 g at the same settle time.
- 2026-11-20 **The legs' push is capped at each blade's remaining bite** (`swayHeadroom`, by the slip solve's own rule), and the held force is kept out of the lean equation.
  - Rejected: an uncapped grip charge. Shallow edges skidded, the sim's skids don't recover, and 93 tests failed.
  - Rejected: rewriting the skid model, which is too big for this.
- 2026-11-20 **`comSwayMode` stays off everywhere until the pad feel and the JPSE re-search.** Turning it on moves 67 tests.
- 2026-11-20 **`crossPlaceMode` is on in Simulation, Experimental and Dig Gate; off in Explorer and Repertoire** (owner, #126).
  - The old latch broke 29 tests: it crossed any inside-foot push at a 12° lean and held until the next push.
  - The gate: a live inside-foot push, outside share > 0.5 (`CROSS_OUTSIDE_SHARE`, authored), load asked outside, no move, jump or fall.
- 2026-11-20 **Boards snap stays off and the warm-up keeps its 2 mm allowance** (owner, choice a).
- 2026-11-20 **beatcross WIP is kept as unfinished research; `beatCrossoverHoldSuppress` stays 0** (owner). The jump stays music-dependent (20/57).
- Earlier, still in force:
  - weight transfer on in Sim/Exp/DigGate; re-tune by re-searching, never loosening;
  - free-foot prep poses are set while the foot is planted;
  - presentation never moves the sim or a score; replay stays at `/39`;
  - land conflicting PRs by merging main in, never by rebase.

## Dead ends (don't retry without new information)
- **Turning a mode on from its author's scenario alone.** agy's #124 report measured one footwork script and missed 29 breakages. Run the full suite with the mode on in the target setups first.
- **Charging the sway's full push to grip.** Skids on shallow edges never recover, and the lean runs away. Cap it at the bite.
- **Letting a held internal force reach `latAccel`.** It's counted twice, as a shove at the pendulum's base.
- **An exact clockwise/counter-clockwise mirror test on a glide script.** The solver isn't mirror-exact there even with the modes off: it parts at tick 21, 5 mm by the end. Use the JPSE transforms for mirror claims.
- **Opening a PR without updating the README status block.** CI fails with "exit code 1" and fail 0. It caught #128 and #130 today.
- **Committing a report at the repo root on parallel branches.** Use `docs/reports/<branch>-<date>.md`.
- **`"$b:refs/heads/$b"` in zsh** (`:r` is a modifier); write `"${b}:refs/heads/${b}"`.
- **Reading the outer checkout's `Hand_off.md`.** It's September's; read `origin/main:Hand_off.md`.

## Open questions (settle these first)
1. **The merge order for #128, #129 and #130.** Recommended: #129 first, then Codex refreshes its README blocks.
2. **Is 0.35 s right for the sway transfer?** Only the pad can say. The jumps are chaotic in it (L 23.8 / fall / 16.6 / 21.2 at 0.15 / 0.20 / 0.25 / 0.35 s).
3. **Flat blades cap the sway at 12–15 cm of 24.** The sim's flat-blade sideways bite is small. Does that match the feel, or is the flat bite too low?
4. **`crossPlaceMode` with a pad crossover:** the crossed pose may visibly jump across when the inside push starts. Not felt yet.
5. Still open: the rival `BASELINE`; nothing new has been felt on the pad since 14 Nov (transfer, crossed feet, skates, venues, free-foot prep).

## State (verified 14:27–14:40 PST)
- `origin/main` `f10b12d`. CI is green on #126's merge; #127 was docs only, so no CI ran.
- Open: #129 (green, mergeable), #128 and #130 (Codex; README block failing). `gh` is logged in as `9x25dillon`; the repo is PUBLIC.
- Worktrees made today (nothing deleted): `.delivery/crossplace`, `.delivery/decisions`, `.delivery/comsway`, `.delivery/handoff-1120`.
- The outer checkout is on `phase17-assurance`, 85 dirty files, owned by another session. Don't touch it.

## Project health
- On `com-sway` at 14:18: Ice Lab 1140 tests (1139 pass, 1 todo: the discretisation floor), replay verified, bridge 77/77, Unreal 8 pass + 2 skipped, tsc clean, fidelity report unchanged.
- On main `f10b12d`: Ice Lab 1135 (1134 pass, 1 todo).
- Fragile spots:
  - The scripted jump entrances are knife-edge search results; any transfer change re-shuffles them.
  - The sim's skid never recovers once the carve is lost.

## Next steps, in order
1. Land #129 (`! gh pr merge 129 --merge`). Then Codex merges main into #128 and #130 and rewrites the README block.
2. Pad feel: Simulation with `comSwayMode: 1` and a few crossovers (also checks the `crossPlaceMode` pose). The owner judges 0.35 s.
3. JPSE re-search of the jump entrances with `comSwayMode` on (as for weight transfer, 2026-11-14). Then the three interactions in the report, then the owner picks the setups.
4. The other known limits in `docs/support-signal.md`: set-down, `copMax` by share, the authored transfer shape.

## One-shot check
    bash ~/.claude/skills/hanoffed/scripts/scan.sh --root ~/KoLd__FEEt.ice_skating_ --fetch
    (cd tools/ice-lab && node --test test/*.test.ts && node replay/verify.ts test/fixtures/replay-v1.json)
    node games/ice-run-godot/tools/prepare.mjs --engine-only
    node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs
    node --test games/ice-run-unreal/tests/*.test.mjs

Typecheck: `npm install typescript @types/node` in a scratch directory, then from `tools/ice-lab` run `<scratch>/node_modules/.bin/tsc --noEmit -p . --typeRoots <scratch>/node_modules/@types`.

README block: run the three suites with `--test-reporter=tap` into a dir as `ice-lab.tap`, `godot.tap` and `unreal.tap`, then run `node tools/ice-lab/status.mjs --logs <dir> --write`.

New param: `node tools/ice-lab/replay/rebase-fixture.ts` (must say `digestsUnchanged: true`).

## Rules that still apply
- No deletes, resets, cleans, force pushes or overwrites. New work goes in a fresh worktree off `origin/main`. Never a broad process kill.
- New physics stays behind a mode, off by default; replay stays at `/39`. Presentation never moves the sim or a score.
- Before turning a mode on: run the full suite with it on in the target setups, and report every failure in plain words before re-pinning.
- Measure before claiming; label authored numbers; re-pin a test only for a deliberate change, with the reason in the test.
- One agent lands PRs at a time. `gh pr merge` is blocked for Claude Code, so the owner runs `! gh pr merge <n> --merge`. The repo is PUBLIC.
- Briefs for outside agents (Codex, agy, Qwen) must stand alone.

## Vocabulary so far
word, referent, idempotent, provenance, invariant, presupposition, stipulate, contiguous, fast-forward, confabulation, threat model, reaction torque, confound, regression, acceptance criterion, race condition, negative control, preregistration, stacked PR, attestation, opt-in, monotonic, triage, Goodhart's law, protocol deviation, chirality, Pareto front, squash merge, dangling commit, forward kinematics, contact constraint, false negative, affordance, counterfactual, bake, centre of pressure, knife-edge result, lookahead, latch, superset, addressee, seam, test double, headroom (Opus 5.5, 2026-11-20), jerk (Opus 5.5, 2026-11-20)

## Opening prompt for next session (edit the brackets)
> Read `Hand_off.md` on `origin/main` (or branch `handoff-2026-11-20` if unmerged) in a fresh worktree, and run its one-shot check. #129 is [merged / not merged]. I tried `comSwayMode` on the pad: [feel notes, or "not yet"]. Then [next step 2 or 3]. Stipulate: live work; report every full-suite failure before re-pinning. When we wrap up: /hanoffed.
