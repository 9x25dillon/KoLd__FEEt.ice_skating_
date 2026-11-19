# Hand-off — EDGEWORK / native game

## Resume here
**Newest close:** 19 November 2026, 12:10 PST · Claude Code, Opus 5.5 · session `374084d9`
**Where things stand:** `origin/main` is `d0e5fee` (#115).
- Free-foot preparation (#114) and beatcross (#115) are merged.
- Six PRs are open: #116–#121. Most conflict with main.
- Two outside agents were started at 12:00, each from a brief this session wrote:
  - **Codex** is landing #116–#121 one at a time (`.delivery/conflicts-brief.md`);
  - **agy** is building free-foot part 2 on `footprep2` (`.delivery/footprep2-brief.md`).

**Corrects the previous hand-off (18 Nov):**
- `gh` is logged in again.
- `footprep` is merged, not local.
- All seven brief branches are pushed and have PRs.
- `beatcross` merged at `71ffbe8`, its newest commit, which is marked WIP; the hand-off had said `00b4258`.
- Open questions 1–3 are answered (see Decisions).

**Decision needed:** none to start. Merge each PR when Codex asks, with `! gh pr merge <n> --merge`.
**Start with:**
1. `git fetch origin; git log --oneline -5 origin/main; gh pr list`: see how far Codex got.
2. If Codex finished, check its table against main. If not, let it continue; only one agent should land PRs.
3. When agy's `footprep2` PR opens, merge `origin/main` into it if needed (it touches `engine.mjs`, like #117 and #119), check it, then review its `crossPlaceMode` measurements.

## Progress track (newest first)
| Date | Session | Shipped | State after |
|---|---|---|---|
| 2026-11-19 | Opus 5.5 `374084d9` | PR #114 (+ `907f4d7` README counts); 7 branches pushed; 2 briefs | main `d0e5fee` (#114, #115 merged by owner); #116–#121 open; Codex + agy running |
| 2026-11-18 | Opus 5.5 `43d27f3e` | `59f3e42` on `footprep` | `game/footprep.ts` posed by `skater.gd`; no sim change |
| 2026-11-18 | Claude `2eb8d038` + Codex + Qwen + agy briefs | local branches | beatcross, nationals-pilot, overflight, programclips, stepclips, two-sided-report, boards-gap |
| 2026-11-14–16 | various | PR #107–#113 | venues, kiss-and-cry, costume test, validation tranche, fidelity-ascension; main `4aaf328` |
| 2026-11-14 | Opus 5.5 `2525c6dc` | PR #101–#106 | support signal; weight transfer on in Sim/Exp/DigGate |
| earlier | — | — | `docs/handoff-before-*.md`; previous page: `docs/handoff-before-landing-2026-11-19.md` |

## In flight
- **Landing #116–#121** (Codex, brief `.delivery/conflicts-brief.md`, started 12:00). Conflicts measured with `git merge-tree` against `d0e5fee`:

  | PR | Branch | Conflicts |
  |---|---|---|
  | #118 | `nationals-pilot` | none |
  | #119 | `presentation-parity` (contains `programclips` and `stepclips`) | `REPORT.md`, `engine.mjs` |
  | #117 | `programclips` | `engine.mjs` |
  | #116 | `stepclips` | `REPORT.md`, `engine.mjs` |
  | #120 | `overflight` | `REPORT.md` |
  | #121 | `two-sided-report` | `REPORT.md` |

  - Order: #118 → #119 (which lands #116 and #117) → #120 → #121.
  - Fix: merge main into each branch, no rebase. Main's root `REPORT.md` is kept; each branch's report goes to `docs/reports/<branch>-2026-11-18.md`. `engine.mjs` keeps `footPrep` and the clip fields.
  - The owner runs each merge.
  - Verify: each PR's CI green, and Codex's closing table.
- **Free-foot part 2** (agy, worktree `.delivery/footprep2`, branch `footprep2`, brief `.delivery/footprep2-brief.md`). Three commits, one PR:
  1. `crossPlaceMode` (sim, 0 in every preset): a crossover's outside blade is placed past the skating blade. The pose lab requires pose crossings to equal the sim's crossed contacts.
  2. Glide recovery: `beside` or a new `extended` pose, chosen from present state (presentation only).
  3. Port the blend to Unreal `IceSkater.cpp`.
  - Verify: digests identical with the mode off; the mode on vs off measurement table in its `REPORT.md`.
- **`boards-gap`** (`.delivery/boardsgap`): 6 uncommitted files, no commit, no PR. Untouched.
- Carried: the jump lesson in `.delivery/jumplesson`, uncommitted; the Unreal director camera `b230393` on `unreal-choreo`, local only.

## Decisions (why things are the way they are)
- 2026-11-19 **Crossed placement: build it as a sim change behind a mode** (owner). This reverses 18 Nov's "presentation only" for this one thing.
  - The pose lab's `crossed_frames` rule becomes "the pose crosses only when the sim's contacts cross", not a raised limit.
- 2026-11-19 **Glide recovery uses both poses by situation** (owner). Chosen from present state only, because the sim gives no lookahead.
- 2026-11-19 **Port the free-foot blend to Unreal** (owner).
- 2026-11-19 **Feel: no tuning; keep building** (owner). The `FOOT_PREP` numbers stay authored.
- 2026-11-19 **Land conflicting PRs by merging main into the branch**, never by rebase or force push (delete-nothing rule).
  - #119 is a superset of #116 and #117, so it carries them.
- Earlier, still in force: free-foot prep poses are set while the foot is planted and fade with the share; Godot eases between them; weight transfer on in Sim/Exp/DigGate; re-tune by re-searching, never loosening; rival `BASELINE` unchanged; presentation never moves the sim or a score; replay stays at `/39`.

## Dead ends (don't retry without new information)
- **Committing a report at the repo root on parallel branches.** Every branch's `REPORT.md` conflicted with every other's. Keep reports uncommitted or under `docs/reports/<branch>.md`.
- **Opening a PR without updating the README status block.** CI rewrites the block and fails on the diff even when every test passes ("Process completed with exit code 1", fail 0). Update the counts in the same PR.
- **`"$b:refs/heads/$b"` in zsh.** `:r` is a zsh modifier, so the refspec broke. Write `"${b}:refs/heads/${b}"`.
- **Reading the outer checkout's `Hand_off.md` for status.** It's September's. Read `origin/main:Hand_off.md` and the newest branch's.
- Earlier: `--view=body` for foot poses (use `boots`); `set -- $v` in zsh; pose_lab in a fresh worktree without `--import`.

## Open questions (settle these first)
1. **beatcross WIP.** #115 merged `71ffbe8`, whose subject says "(WIP)". Its mode is prototyped off, so play shouldn't change, but was merging the WIP commit intended?
2. **`crossPlaceMode` setups.** Which setups to turn it on in, after agy's measurements.
3. Still open: the rival `BASELINE` (#118 records it as unchanged); the boards gap; nothing new has been felt on the pad (transfer, skates, outfits, venues, free-foot prep).

## State (verified 12:00–12:10 PST)
- `origin/main` `d0e5fee`. `gh` logged in as `9x25dillon`.
- LIVE at 12:00: Codex `01a1f564` (conflicts brief) and agy (`.delivery/footprep2`).
- The outer checkout is on `phase17-assurance`, 85 dirty files, owned by another session. Don't touch it.
- This hand-off is on branch `handoff-2026-11-19` in `.delivery/handoff-1119`. It was committed, not pushed, while Codex was landing PRs.

## Project health
- #114's CI was green after `907f4d7`: Ice Lab 1105 (1104 pass, 1 todo), bridge 69/69, Unreal contract 7 pass + 2 skipped, native foundation g++/clang++.
- The todo is the discretisation floor test (`test/discretisation.test.ts:332`), the same as before.
- Not checked by this session: #115–#121's content, and CI on `d0e5fee`.

## Next steps, in order
1. Merge each PR as Codex asks, one at a time.
2. Review agy's `footprep2` PR, `crossPlaceMode` numbers first, then decide its setups (Open question 2).
3. Settle Open question 1, then `boards-gap`: commit or park it as `wip/boards-gap`.
4. Pad playtest: a crossover and a three-turn on Simulation, with and without `crossPlaceMode`.
5. Then the known limit: the COM swaying over a planted blade (`docs/support-signal.md`).

## One-shot check
    bash ~/.claude/skills/hanoffed/scripts/scan.sh --root ~/KoLd__FEEt.ice_skating_ --fetch
    (cd tools/ice-lab && node --test test/*.test.ts && node replay/verify.ts test/fixtures/replay-v1.json)
    node games/ice-run-godot/tools/prepare.mjs --engine-only
    node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs
    node --test games/ice-run-unreal/tests/*.test.mjs
    godot4 --headless --path games/ice-run-godot --import && godot4 --headless --path games/ice-run-godot -- --smoke-test

Typecheck: `npm install typescript @types/node` in a scratch directory, then from `tools/ice-lab` run `<scratch>/node_modules/.bin/tsc --noEmit -p . --typeRoots <scratch>/node_modules/@types`.
Conflict test without touching a branch: `git merge-tree --write-tree --name-only origin/main origin/<branch>`.

## Rules that still apply
- No deletes, resets, cleans, force pushes or overwrites. New work goes in a fresh worktree off `origin/main`. Never a broad process kill.
- New physics stays behind a mode; replay stays at `/39`. Presentation never moves the sim or a score.
- Measure before claiming; label authored numbers; re-pin a test only for a deliberate change, with the reason in the test.
- One agent lands PRs at a time. `gh pr merge` needs the owner's `!`. The repo is PUBLIC.
- Briefs for outside agents (Codex, agy, Qwen) must stand alone: no pointers to Claude's memory.

## Vocabulary so far
word, referent, idempotent, provenance, invariant, presupposition, stipulate, contiguous, fast-forward, confabulation, threat model, reaction torque, confound, regression, acceptance criterion, race condition, negative control, preregistration, stacked PR, attestation, opt-in, monotonic, triage, Goodhart's law, protocol deviation, chirality, Pareto front, squash merge, dangling commit, forward kinematics, contact constraint, false negative, affordance, counterfactual, bake, centre of pressure, knife-edge result, lookahead, latch, superset (Opus 5.5, 2026-11-19), addressee (Opus 5.5, 2026-11-19)

## Opening prompt for next session (edit the brackets)
> Read `Hand_off.md` on `origin/main` (or branch `handoff-2026-11-19` if unmerged) in a fresh worktree and run its one-shot check. [Codex finished / stopped at #…]. [agy's footprep2 PR is #… / not open yet.] Then [review footprep2's crossPlaceMode numbers | ship boards-gap | …]. Stipulate: live work. When we wrap up: /hanoffed.
