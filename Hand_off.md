# Hand-off — EDGEWORK / native game

## Resume here
**Newest close:** 19 November 2026, 13:20 PST · Claude Code, Opus 5.5 · session `374084d9`
**Where things stand:** `origin/main` is `cf0ad40` (#124), and CI was green on the PR head. **No PRs are open.**
- Landed today:
  - #114 free-foot prep;
  - #115 beatcross;
  - #118 Nationals pilot;
  - #122 boards gap;
  - #119 presentation parity, which carried #116 step clips and #117 program intro;
  - #120 over-flight bench;
  - #121 two-sided fidelity report;
  - #123 this hand-off;
  - #124 free-foot part 2 by agy: `crossPlaceMode` (off everywhere), `extended` glide recovery, and the Unreal port. Its report is `docs/reports/footprep2-2026-11-19.md`.
- Nothing is running.

**Corrects the previous hand-off (18 Nov):**
- `gh` is logged in.
- Every brief branch is merged; none is local-only.
- `beatcross` merged at `71ffbe8`, its newest commit (marked WIP).
- `boards-gap` was finished and merged (#122).
- Open questions 1–3 of 18 Nov are answered (see Decisions).

**Decision needed:** which setups get `crossPlaceMode: 1`. agy recommends Simulation, Experimental and Dig Gate (all have weight transfer), and off in Explorer and Repertoire. Turning it on in Experimental moves the 2Lo's L from 24.17 to 23.58, so the pinned `backjump.test.ts` value must be re-measured. Say "turn it on in …".
**Start with:**
1. `git fetch origin; git log --oneline -5 origin/main; gh pr list`: expect `cf0ad40` or later.
2. Read `docs/reports/footprep2-2026-11-19.md` (the off vs on table and the recommendation). Then do the owner's `crossPlaceMode` pick behind a test, re-measuring any pinned value it moves (re-search; never loosen).

## Progress track (newest first)
| Date | Session | Shipped | State after |
|---|---|---|---|
| 2026-11-19 | Opus 5.5 `374084d9` + Codex `01a1f564` + Sonnet + agy | PR #114, #118–#124 landed (#115 by owner) | main `cf0ad40`, no open PRs; `crossPlaceMode` built, off |
| 2026-11-18 | Opus 5.5 `43d27f3e` | `59f3e42` on `footprep` | `game/footprep.ts` posed by `skater.gd`; no sim change |
| 2026-11-18 | Claude `2eb8d038` + Codex + Qwen + agy briefs | local branches | beatcross, nationals-pilot, overflight, programclips, stepclips, two-sided-report, boards-gap |
| 2026-11-14–16 | various | PR #107–#113 | venues, kiss-and-cry, costume test, validation tranche, fidelity-ascension; main `4aaf328` |
| 2026-11-14 | Opus 5.5 `2525c6dc` | PR #101–#106 | support signal; weight transfer on in Sim/Exp/DigGate |
| earlier | — | — | `docs/handoff-before-*.md`; previous page: `docs/handoff-before-landing-2026-11-19.md` |

## In flight
- **Free-foot part 2: landed (#124).** Measured with the mode on: 108 crossed ticks in the footwork passage, 23.3 cm blade clearance, 0 falls, the same speed gain and curve, and pose crossings equal to the sim's (54/54). Not felt on the pad yet.
- **How today's conflicts were landed** (use the same way for future branches):
  - merge `origin/main` into the branch, never rebase;
  - main's root `REPORT.md` is kept, and the branch's report goes to `docs/reports/<branch>-<date>.md`;
  - regenerate what CI checks byte for byte (run the suites with TAP into a scratch dir, then `node status.mjs --logs <dir> --write` and `node validate.mjs --report ../../docs/fidelity-report.md` in `tools/ice-lab`).
- **Owner-facing choices now in docs:**
  - `docs/boardsgap-2026-11.md` ends with the boards-snap choice (the snap is off);
  - `docs/nationals-baseline-2026-11-18.md`;
  - `docs/beatcross-2026-11.md`;
  - `docs/overflight-2026-11.md`.
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
3. **Boards snap.** Turn `boardsSnapInbound` on, and drop the warm-up's 2 mm allowance? The measurements and the choice are in `docs/boardsgap-2026-11.md`.
4. Still open: the rival `BASELINE` (#118 records it as unchanged); nothing new has been felt on the pad (transfer, skates, outfits, venues, free-foot prep).

## State (verified 12:45–13:00 PST)
- `origin/main` `8c2fc0b`; CI success on Native replay foundation, Ice Lab and Ice Lab checks. `gh` logged in as `9x25dillon`.
- Codex `01a1f564` stopped after #119; its brief (`.delivery/conflicts-brief.md`) is finished. The Sonnet boards-gap brief is finished (#122).
- The outer checkout is on `phase17-assurance`, 85 dirty files, owned by another session. Don't touch it.
- Landing worktrees left in place (nothing deleted): `.delivery/land-119`, `land-120`, `land-121`, `handoff-1119`.

## Project health
- On `8c2fc0b`: Ice Lab 1128 tests (1127 pass, 1 todo: the discretisation floor), replay verified, bridge 77/77, Unreal contract 7 pass + 2 skipped in CI (9/9 live on this machine, per Codex).
- The fidelity report regenerates byte-identical on #121's merge.
- The over-flight bench reproduces its committed JSON exactly after the merge.

## Next steps, in order
1. The owner picks `crossPlaceMode`'s setups (Open question 2) from `docs/reports/footprep2-2026-11-19.md`; build that, and re-measure `backjump.test.ts`'s L if Experimental is included.
2. The owner reads the boards-snap choice in `docs/boardsgap-2026-11.md`.
3. Settle Open question 1 (beatcross WIP).
4. Pad playtest: a crossover and a three-turn on Simulation, with and without `crossPlaceMode`; the program intro.
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
- One agent lands PRs at a time. Since 2026-11-19 the owner has handed merges to Claude Code: merge in a stated order, only at a commit you verified (CI green, conflicts resolved by merging main). The repo is PUBLIC.
- Briefs for outside agents (Codex, agy, Qwen) must stand alone: no pointers to Claude's memory.

## Vocabulary so far
word, referent, idempotent, provenance, invariant, presupposition, stipulate, contiguous, fast-forward, confabulation, threat model, reaction torque, confound, regression, acceptance criterion, race condition, negative control, preregistration, stacked PR, attestation, opt-in, monotonic, triage, Goodhart's law, protocol deviation, chirality, Pareto front, squash merge, dangling commit, forward kinematics, contact constraint, false negative, affordance, counterfactual, bake, centre of pressure, knife-edge result, lookahead, latch, superset (Opus 5.5, 2026-11-19), addressee (Opus 5.5, 2026-11-19)

## Opening prompt for next session (edit the brackets)
> Read `Hand_off.md` on `origin/main` (or branch `handoff-2026-11-19` if unmerged) in a fresh worktree and run its one-shot check. Turn crossPlaceMode on in [Simulation, Experimental, Dig Gate | …] and re-measure what it moves; then [the boards-snap choice | …]. Stipulate: live work. When we wrap up: /hanoffed.
