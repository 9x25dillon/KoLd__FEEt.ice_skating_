# Hand-off — EDGEWORK / native game

## Resume here
**Update, 20 November 2026** · Claude Code, Opus 5.5: #126 landed. `crossPlaceMode` is on in Simulation, Experimental and Dig Gate, behind a per-tick gate (see Decisions). `origin/main` is `57a6907`, CI is green, and no PRs are open. The owner settled the boards snap and the beatcross WIP: both stay as they are. **Next: the COM swaying over a planted blade.**

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

**Decision needed:** none open from 19 Nov (all settled 20 Nov; see Decisions).
**Start with:**
1. `git fetch origin; git log --oneline -5 origin/main; gh pr list`: expect `57a6907` or later.
2. Read `docs/support-signal.md` (the known limit) before touching the COM sway.

## Progress track (newest first)
| Date | Session | Shipped | State after |
|---|---|---|---|
| 2026-11-20 | Opus 5.5 | PR #126 | main `57a6907`; `crossPlaceMode` on in Sim/Exp/DigGate; boards snap and beatcross settled |
| 2026-11-19 | Opus 5.5 `374084d9` + Codex `01a1f564` + Sonnet + agy | PR #114, #118–#124 landed (#115 by owner) | main `cf0ad40`, no open PRs; `crossPlaceMode` built, off |
| 2026-11-18 | Opus 5.5 `43d27f3e` | `59f3e42` on `footprep` | `game/footprep.ts` posed by `skater.gd`; no sim change |
| 2026-11-18 | Claude `2eb8d038` + Codex + Qwen + agy briefs | local branches | beatcross, nationals-pilot, overflight, programclips, stepclips, two-sided-report, boards-gap |
| 2026-11-14–16 | various | PR #107–#113 | venues, kiss-and-cry, costume test, validation tranche, fidelity-ascension; main `4aaf328` |
| 2026-11-14 | Opus 5.5 `2525c6dc` | PR #101–#106 | support signal; weight transfer on in Sim/Exp/DigGate |
| earlier | — | — | `docs/handoff-before-*.md`; previous page: `docs/handoff-before-landing-2026-11-19.md` |

## In flight
- **`crossPlaceMode` on (#126).** With the mode on, 140/140 live under-push ticks cross, counter-clockwise and clockwise, with full clearance. No gameplay test was re-pinned. Not felt on the pad yet: the crossed pose may visibly jump across when the inside foot's push starts.
- **beatcross: unfinished research, kept on main.** `71ffbe8` (Qwen, steps 1–3 of 5) adds `jpse/hold-suppress.ts`, a hold-suppress sweep in `bench/beatcross.ts` and its JSON. Its new entrance stands at 0/57 with the lever off and 3/57 with it on. Nothing in the game uses it. Steps 4–5 (the doc section and a pinned test) are not done.
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
- 2026-11-20 **`crossPlaceMode` on in Simulation, Experimental and Dig Gate; off in Explorer and Repertoire** (owner, #126).
  - Before turning it on, #124's latch was replaced. That latch crossed the feet on any inside-foot push at a 12° lean and held them crossed until the next push, which broke 29 tests (Power's double loop never left the ice).
  - The gate now crosses the feet only during a live inside-foot push, with the outside foot carrying more than half the load (`CROSS_OUTSIDE_SHARE`, authored) and the load asked on the outside foot. It is never on during a move, a jump or a fall.
  - Lesson: before any mode is turned on, run the full suite with it on in the target setups, not only its author's scenario.
- 2026-11-20 **Boards snap stays off everywhere, and the warm-up keeps its 2 mm allowance** (owner, choice (a) in `docs/boardsgap-2026-11.md`). It doesn't unstick First ice (52.8 s stuck off, 41.4 s on), and the remaining gap is a fallen skater, whom the rink deliberately doesn't push back in.
- 2026-11-20 **beatcross WIP stays merged as unfinished research; the music-crossover fix (`beatCrossoverHoldSuppress`) stays off** (owner). The jump stays music-dependent for now (20/57 load timings stand).
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
1. Still open: the rival `BASELINE` (#118 records it as unchanged); nothing new has been felt on the pad (transfer, skates, outfits, venues, free-foot prep).

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
1. The known limit: the COM swaying over a planted blade (`docs/support-signal.md`). The owner gets a plain summary before coding starts.
2. Pad playtest: a crossover and a three-turn on Simulation (the crossed pose at the push's start); the program intro.
3. If the music-dependent jump is revisited: beatcross choice 2 or 3 in `docs/beatcross-2026-11.md`, finishing the WIP's steps 4–5 first.

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
