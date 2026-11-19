# Hand-off — EDGEWORK / native game

## Resume here
**Newest close:** 18 November 2026, 15:40 PST · Claude Code, Opus 5.5 · session `43d27f3e`
**Where things stand:** `origin/main` is `4aaf328` (#113). Free-foot preparation (the directive's next phase) is built, presentation only, as commit `59f3e42` on branch `footprep` in `.delivery/footprep`. It is **not pushed**: `gh`'s token is invalid (HTTP 401). Seven other briefs ran today in parallel, each on its own local, unpushed branch (see In flight).
**Corrects the previous hand-off (14 Nov):**
- The costume test is fixed (#111).
- #108 (venues) and #109 (kiss-and-cry) are merged, as are #112 (validation tranche) and #113 (fidelity-ascension).
- Open question 1 is closed. Next step 5 (free-foot preparation) is done, pending merge.

**Decision needed:** run `! gh auth login`, then say "push footprep and open the PR".
**Start with:**
1. `gh auth status; git fetch origin; git log --oneline -3 origin/main`: expect `4aaf328` or later.
2. Look at `docs/presentation/footprep/*.jpg` (before | after, boots view), then read `.delivery/footprep/REPORT.md` (not committed) for the four owner questions.
3. Push `footprep` and open the PR. Then merge with `! gh pr merge <n> --merge`, once CI is green.

## Progress track (newest first)
| Date | Session | Shipped | State after |
|---|---|---|---|
| 2026-11-18 | Opus 5.5 `43d27f3e` | `59f3e42` on `footprep` (local) | `game/footprep.ts` posed by `skater.gd`; no sim change; stills in `docs/presentation/footprep/` |
| 2026-11-18 | Claude `2eb8d038` + Codex + Qwen + agy briefs | local branches (In flight) | beatcross, nationals-pilot, overflight, programclips, stepclips, two-sided-report, boards-gap |
| 2026-11-14–16 | various | PR #107–#113 | venues, kiss-and-cry, costume test, validation tranche, fidelity-ascension merged; main `4aaf328` |
| 2026-11-14 eve | Opus 5.5 `2525c6dc` | PR #105, #106 | `weightTransferMode` on in Sim/Exp/DigGate; 2Lo baseline re-searched |
| 2026-11-14 | Opus 5.5 `2525c6dc` | PR #101–#104 | `sim/support.ts` signal; skates, telemetry cards, costumes |
| earlier | — | — | `docs/handoff-before-*.md`; previous page: `docs/handoff-before-footprep-2026-11-18.md` |

## In flight
- **Free-foot preparation** on `footprep` (local, 1 commit ahead of `4aaf328`).
  - Done:
    - `footPrep(state, signal)` with four poses: `beside` (a straight stroke's recovery), `cross` and `under` (crossovers), `held` (turns).
    - It is sent next to `support` in the bridge, warm-up, pairs, podium and `pose_clip.mjs`.
    - `skater.gd` eases toward it at `PREP_RATE` 10/s.
    - `pose_clip.mjs --footwork [--no-prep]`.
    - `docs/support-signal.md` §4.
  - Left: push and open the PR; the owner's four questions (below).
  - Verify: the one-shot check, plus `pose_clip.mjs <clip> --footwork --transfer`, then `pose_lab.gd -- --clip=<clip> --check`.
- **Other briefs' branches, seen in the scan and not verified by this session.** Each is 1–2 commits on `4aaf328`, local only:
  - `beatcross` `00b4258` (Qwen): beat crossovers against the jump load, the owner's option prototyped off;
  - `nationals-pilot` `9c9487a` (in `.delivery/freefoot`): Nationals keeps borrowing the Northern Cup's baseline;
  - `overflight` `e4aa194` (Codex): jump over-flight by body mass against Koga 2025;
  - `programclips` `be6af6e` (agy): an idle clip before the music;
  - `stepclips` `e60b467` (Codex): arms-only step sequences;
  - `two-sided-report` `3561b51` (agy): report-only fidelity column;
  - `boards-gap` (Codex): 6 files dirty, no commit.

  Their briefs are in `.delivery/briefs/`. The coordinating session `2eb8d038` said "worry about git later" at 11:42.
- Carried: the jump lesson, uncommitted in `.delivery/jumplesson`; the Unreal director camera `b230393` on `unreal-choreo`, local only.

## Decisions (why things are the way they are)
- 2026-11-18 **Free-foot preparation is presentation only** (owner, AskUserQuestion).
  - Rejected: a sim set-down mode. Nothing measured asked for it, and it would change timing (mode + JPSE re-search).
- 2026-11-18 **No preparation goes past the skating foot's line.** The sim's contacts never cross, and the pose lab forbids crossed feet on two blades (`crossed_frames` 0).
  - Rejected: crossing the outside foot over to the far side. It gave 2 crossed frames: a take can't be foreseen, so the foot was still crossed when it touched down.
- 2026-11-18 **Set the pose while the foot is planted; fade it as the share comes on.**
  - Rejected: switching the pose on when the foot lifts. Steps of 11–15 cm in a frame.
  - Rejected: aiming a taking foot at its own contact. It moved toward two places at once.
- 2026-11-18 **Godot eases between preparations** (`PREP_RATE`). A latched crossover flag can hold a pose until a turn replaces it; without the easing that switch jumped 12 cm.
- Earlier, still in force: weight transfer on in Sim/Exp/DigGate; one derived support signal; re-tune by re-searching, never loosening; rival `BASELINE` unchanged; presentation never moves the sim or a score; replay stays at `/39`.

## Dead ends (don't retry without new information)
- **Judging foot poses in the body view.** `--view=body` crops the feet. Use `--view=boots`.
- **`set -- $v` to split flags in zsh** (again, 18 Nov): both runs got the same one argument and gave identical numbers. Write each command out.
- **Running pose_lab in a fresh worktree without `--import`.** You get 900+ "Nil" script errors that look like a broken skeleton.
- Earlier: tweaking the 2Lo script instead of finding where the weight goes; ``git cat-file -p "$T:path"`` in zsh; an open-loop replay with one input changed.

## Open questions (settle these first)
1. **Crossed placement:** is "carried in front" enough? A true crossed placement needs a sim mode.
2. **The recovery look:** after a straight stroke the free foot now stays beside the heel for the whole glide. Do you want it held there, or extended again on long glides?
3. **Unreal:** port the `footPrep` blend to `IceSkater.cpp`, or not?
4. Still open from 14 Nov: Experimental's automatic beat crossovers (see `beatcross`); the rival `BASELINE` (see `nationals-pilot`); the boards gap (see `boards-gap`).
5. Not yet felt on the pad: the transfer, skates, outfits, venues, the free-foot preparation.

## State (verified 15:29–15:40 PST)
- `origin/main` `4aaf328`; local `main` matches. CI on `4aaf328`: unknown, because `gh` is unauthenticated.
- The outer checkout is on `phase17-assurance`, 85 dirty files, and is owned by another session. Its `Hand_off.md` is September's. Don't touch it.

## Project health
- On `footprep`:
  - Ice Lab: 1105 tests, 1104 pass, 1 todo (the discretisation floor, as on main) · replay verified;
  - bridge 69/69 · typecheck clean · Godot smoke all PASS.
- Pose lab, before → after:
  - strokes with the transfer: largest foot step 9.0 → 5.7 cm;
  - footwork: 9.2 → 8.8 cm;
  - crossed frames 0 everywhere; foot-off-line and jerk unchanged.
- `--footwork` reports 2 `wrong_way_frames` with or without the prep. They come from the sim's heading, not from the pose.
- Authored, not measured: everything in `FOOT_PREP`, `RECOVER_TIME` 0.15 s, `HOLD_IN_TIME` 0.25 s, `CROSS_LEAN`, `PREP_RATE` 10/s.
- Minor: the senders compute `supportSignal` twice per frame (`footPrep(s, supportSignal(s))`). It's cheap, but a shared helper would be cleaner.

## Next steps, in order
1. `! gh auth login`. Then push `footprep`, open the PR, and merge once CI is green.
2. The owner looks at the stills and plays a crossover and a three-turn on Simulation. Then answers Open questions 1–3.
3. Review and ship the other briefs' branches one at a time (fetch, rebase onto main, run the one-shot check, open a PR).
4. Then the known limit: the COM swaying over a planted blade (`docs/support-signal.md`).

## One-shot check
    bash ~/.claude/skills/hanoffed/scripts/scan.sh --root ~/KoLd__FEEt.ice_skating_ --fetch
    (cd tools/ice-lab && node --test test/*.test.ts && node replay/verify.ts test/fixtures/replay-v1.json)
    node games/ice-run-godot/tools/prepare.mjs --engine-only
    node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs
    godot4 --headless --path games/ice-run-godot --import && godot4 --headless --path games/ice-run-godot -- --smoke-test

Typecheck: `npm install typescript @types/node` in a scratch directory, then from `tools/ice-lab` run `<scratch>/node_modules/.bin/tsc --noEmit -p . --typeRoots <scratch>/node_modules/@types`.

Stills and pose checks:
- `pose_clip.mjs <clip> --strokes|--footwork [--transfer] [--no-prep]`, then `pose_lab.gd -- --clip=<clip> --check`;
- for stills, add `--shots=<dir> --ticks=… --view=boots|body`. Run without `--headless`; it needs the display.

## Rules that still apply
- No deletes, resets, cleans, force pushes or overwrites. New work goes in a fresh worktree off `origin/main`. Never a broad process kill.
- New physics stays behind a mode; replay stays at `/39`. Presentation never moves the sim or a score.
- Measure before claiming; label authored numbers; re-pin a test only for a deliberate change, with the reason in the test.
- Coordinate through auric porter: check in, claim your worktree, note decisions, check out.
- The owner decides gate policy. `gh pr merge` needs the owner's `!`. The repo is PUBLIC.

## Vocabulary so far
word, referent, idempotent, provenance, invariant, presupposition, stipulate, contiguous, fast-forward, confabulation, threat model, reaction torque, confound, regression, acceptance criterion, race condition, negative control, preregistration, stacked PR, attestation, opt-in, monotonic, triage, Goodhart's law, protocol deviation, chirality, Pareto front, squash merge, dangling commit, forward kinematics, contact constraint, false negative, affordance, counterfactual, bake, centre of pressure, knife-edge result, lookahead (Opus 5.5, 2026-11-18), latch (Opus 5.5, 2026-11-18)

## Opening prompt for next session (edit the brackets)
> Read `Hand_off.md` in a fresh worktree off `origin/main` and run its one-shot check. [gh is logged in again.] Push `footprep` and open its PR. [My answers on the footprep questions: 1 … 2 … 3 …] Then [ship the next brief's branch: … | build …]. Stipulate: live work. When we wrap up: /hanoffed.
