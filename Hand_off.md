# Hand-off — EDGEWORK / native game

## Resume here
**Newest close:** 20 November 2026, 20:05 PST · Claude Code, Opus 5.5 · session `67eeee86`

**Where things stand:**
- `origin/main` is `4b05863` (#128). Everything the 14:40 hand-off listed as open has landed: #129 `comSwayMode` (`38c5146`, still off everywhere), #131 that hand-off, #130 Unreal director camera (`49849f2`), #128 jump lesson port (`4b05863`).
- This session wrote a read-only **video-to-motion blueprint**, published as a private claude.ai page: https://claude.ai/artifact/NBrnkF1c36Nu3MYBZuDWaF. No code changed. This hand-off is the only repo change.
- `edgework-wireframe/1`, `tools/video-pose/` and `data/competition-formats.json` exist only as **uncommitted drafts** in `.delivery/tiers-and-blueprint`. agy (antigravity-client-6536) holds the claim and was still editing them at 19:49. The review found real defects (In flight).

**Corrects the previous hand-off:** it said `origin/main` was `f10b12d` and that #128, #129 and #130 were open. All three merged between 14:30 and 16:29, so its "merge order" decision is settled.

**Decision needed:** what happens to agy's draft. Options:
- (a) agy fixes the defects and commits on its branch;
- (b) a fresh worktree rebuilds it per the blueprint;
- (c) park it.

Also: research-only or shippable licensing for the 3D pose models.

**Start with:**
1. `git fetch origin; git log --oneline -3 origin/main; gh pr list`. Expect `4b05863`, or #132's merge commit once this hand-off has landed.
2. Read blueprint §11–§12 (link above). If you can't open claude.ai, the In flight entry below has the essentials.
3. After the owner decides, build `edgework-video intake` (In flight) in a fresh worktree off `origin/main`. On the sway track, wait for the owner's pad test instead.

## Progress track (newest first)
| Date | Session | Shipped | State after |
|---|---|---|---|
| 2026-11-20 eve | Opus 5.5 `67eeee86` | this hand-off (`handoff-2026-11-20-blueprint`); blueprint page; porter note 931 | Video pipeline planned, nothing built; owner decisions pending |
| 2026-11-20 | Codex `01a1faea` | #130 `49849f2` (14:38), #128 `4b05863` (16:29) | Unreal director camera; jump lesson port. README block: Ice Lab 1148 (1147 pass, 1 todo), bridge 78/78, Unreal 9 + 2 skipped |
| 2026-11-20 | Opus 5.5 `42712937` | #126 `57a6907`, #127 `f10b12d`, #129 `38c5146`, #131 `1d7ca40` | `crossPlaceMode` on in Sim/Exp/DigGate; `comSwayMode` merged, off |
| 2026-11-19 | Opus 5.5 `374084d9` + Codex `01a1f564` + Sonnet + agy | PR #114, #118–#124 landed (#115 by owner) | main `cf0ad40`; `crossPlaceMode` built, off |
| 2026-11-18 | Opus 5.5 `43d27f3e` | `59f3e42` on `footprep` | `game/footprep.ts` posed by `skater.gd`; no sim change |
| 2026-11-18 | Claude `2eb8d038` + Codex + Qwen + agy briefs | local branches | beatcross, nationals-pilot, overflight, programclips, stepclips, two-sided-report, boards-gap |
| 2026-11-14–16 | various | PR #107–#113 | venues, kiss-and-cry, costume test, validation tranche, fidelity-ascension; main `4aaf328` |
| 2026-11-14 | Opus 5.5 `2525c6dc` | PR #101–#106 | support signal; weight transfer on in Sim/Exp/DigGate |
| earlier | — | — | `docs/handoff-before-*.md`; previous page: `docs/handoff-before-video-blueprint-2026-11-20.md` |

## In flight
- **Video-to-motion pipeline**: planned, not started. Blueprint: link above.
  - Proposal, not adopted: two lanes on one source timeline.
    - Evidence lane: 2D keypoints, a surveyed ice plane, frame counts and two annotators feed `edgework-evidence/1`. After human review, values can become footage cases.
    - Animation lane: 3D pose recovery feeds `edgework-wireframe/1`, then Pose, Clip and Track.
    - Nothing on main changes: Pose/Clip/Track, `MotionPlayer`, `sim/`, `/39` and the case format all stay.
  - First task, `edgework-video intake`, uses Python's standard library and `ffprobe` (n9.1 is installed). It:
    - writes `manifest.json` (`edgework-take/1`: source sha256, authorization, subject id, `mirrored`, playback) and `frames.json` (integer PTS with time base, VFR flag, interlace, rotation);
    - exits 3 with no authorization record;
    - never copies video or writes inside the repo;
    - has tests that generate fixtures with `ffmpeg testsrc`.
- **agy's draft** in `.delivery/tiers-and-blueprint` (`feat/tiers-and-blueprint` at `49849f2`, all untracked, claimed): `wireframe.ts`, `competition.ts`, `competition-formats.json`, `tools/video-pose/`, `docs/blueprint-tiers-and-video-motion.md`. Defects as of the 19:24 hashes (porter note 931; the draft changed after):
  - `camera.py:22–38`: a 3.0 m "centre circle" (IIHF: 4.50 m) and an invented "30 × 20 m ISU sheet box";
  - `kinematics.py:162`: the homography is never applied, and `--calibration` only unlocks O2/O4;
  - `backends.py:107`: `t = i/fps`, so source PTS are lost;
  - a missing confidence reads as 1.0 (`wireframe.ts:154`);
  - sidecar definitions differ from `docs/fidelity-gate.md` §4.3: O2 fits the pelvis path (the gate uses blade contact), O6 uses wrist spread (the gate uses the ω ratio from revolution periods), and the draft doc calls O7 forces (the gate uses speed gained per stroke);
  - the `upper-body` mask writes trunk and twist, which are physics;
  - no detector, tracker or pose model runs at all.
- **Other uncommitted work, not this session's** (owner unknown, probably agy): `.delivery/presentation-showcase` (`showcase.mjs`, `tools/ice-lab/showcase/`, `package.json`, `app/build.mjs`, `app/serve.mjs`; edited until 19:58) and `.delivery/readme-refresh` (`README.md`, 19:44). Don't touch them. A README change must keep the CI-checked status block current.
- **`comSwayMode`**: merged (#129), off everywhere. Before turning it on:
  1. pad feel at 0.35 s;
  2. a JPSE re-search;
  3. the `crossPlaceMode` gate interaction;
  4. Katya Vell, 2.4 mm out against the 2 mm boards allowance.

  Verify: `cd tools/ice-lab && node --test test/comsway.test.ts`.
- Carried: the jump lesson in `.delivery/jumplesson` is uncommitted (#128 probably supersedes it; check before reusing). beatcross `71ffbe8` is unfinished research.

## Decisions (why things are the way they are)
- 2026-11-20 **Cosmetic video motion may own only arms and head**, the existing `arms` layer (`player.ts:131`). This follows from "presentation never moves the sim". Rejected: the draft's `upper-body` mask, because trunk lean and `SpinState.twist` are physics.
- 2026-11-20 **Proposal, pending the owner: evidence never comes from a 3D pose model's trajectory** until that model is measured on skating.
  - GVHMR moves the body so joints it predicts are stationary stay fixed.
  - WHAM subtracts contact-foot velocity from the root.
  - A gliding blade is in contact and moving, so both may pull speed toward zero.
- 2026-11-20 **`comSwayMode`: physical first, then visible.** It goes through a minimum-jerk load plan over `comSwayTransferTime` (0.35 s, authored), with the legs' push capped at each blade's remaining bite. It stays off everywhere until the pad test and the JPSE re-search (turning it on moves 67 tests).
- 2026-11-20 **`crossPlaceMode` is on in Simulation, Experimental and Dig Gate; off in Explorer and Repertoire** (owner, #126). Boards snap stays off with the 2 mm allowance. `beatCrossoverHoldSuppress` stays 0.
- Earlier, still in force:
  - weight transfer is on in Sim/Exp/DigGate; re-tune by re-searching, never by loosening;
  - presentation never moves the sim or a score; replay stays at `/39`;
  - land conflicting PRs by merging main in, never by rebase.

## Dead ends (don't retry without new information)
- **Copying numbers from the draft video tool into `data/validation/cases`.** Its calibration is unapplied, its timestamps are invented, and its O2/O6 definitions are not the gate's.
- **A 3.0 m centre circle, or any rink constant, as calibration.** IIHF 2023/24 gives 4.50 m for the centre and face-off circles. Many figure skating sheets show no hockey lines, so survey the venue or leave scale unknown.
- **The draft's synthetic generator as evidence.** It encodes the expected answers, so it is good for contract tests only.
- **Turning a mode on from its author's scenario alone.** Run the full suite with it on in the target setups first (#124 missed 29 breakages).
- **Charging the sway's full push to grip**, or letting a held internal force reach `latAccel`.
- **An exact clockwise/counter-clockwise mirror test on a glide script.** The solver parts at tick 21. Use the JPSE transforms.
- **Opening a PR without updating the README status block.** CI fails with "exit code 1" and fail 0.
- **Committing a report at the repo root on parallel branches.** Use `docs/reports/<branch>-<date>.md`.
- **`"$b:refs/heads/$b"` in zsh** (`:r` is a modifier). Write `"${b}:refs/heads/${b}"`.
- **Reading the outer checkout's `Hand_off.md`.** It's September's. Read `origin/main:Hand_off.md`.

## Open questions (settle these first)
1. **agy's draft:** (a), (b) or (c) above? Re-hash its files against blueprint Appendix A before acting, because they changed after the review.
2. **Licensing.**
   - GVHMR's code is non-commercial.
   - SMPL/SMPL-X are non-commercial unless licensed through Meshcapade.
   - Both backends call Ultralytics YOLOv8, which is AGPL-3.0.
   - Research-only tooling, or a path that can ship?
3. **Footage.** Own or hired skaters with consent, or broadcast for internal measurement only? D6 keeps the game to original skaters, and choreography may be protected.
4. **Feasibility on the RTX 2080 SUPER** (8 GB, shared with ollama) is unmeasured. Run the bounded benchmark in blueprint §4.7, which needs install authorization.
5. **The narrow landing window.**
   - JPSE double-loop check windows are 1–8 ticks, mostly 3–4 (`docs/jpse/power-search-2026-11-10.md` §3).
   - The landing-quality rule in `sim/jump.ts:645–668` alone tolerates about 99–164° of rotation error.
   - So the limit is probably after touchdown. Run the sweep in blueprint §9 before any assist or damping.
6. Carried:
   - Is 0.35 s right for the sway (only the pad can say)?
   - Flat blades cap the sway at 12–15 cm of 24.
   - The `crossPlaceMode` pose may jump during a pad crossover.
   - The rival `BASELINE`.
   - Nothing has been felt on the pad since 14 November.

## State (verified 19:58–20:05 PST)
- `origin/main` `4b05863`. No open PRs in this repo except #132 (this hand-off). `gh` is logged in as `9x25dillon`, and the repo is PUBLIC.
- O1–O7 corpus at `49849f2`, read from the files, not a validator run: 38 cases, 25 unsourced. O2, O3, O6 and O7 have no sourced external case. The committed report says "Gate not met".
- Worktree made this session: `.delivery/handoff-1120-blueprint`. Nothing deleted.
- The outer checkout is on `phase17-assurance`, with 85 dirty files and `e94d0d9` unpushed (14 Nov). Another session owns it. Don't touch it.

## Project health
- This session ran no checks: docs only, and suites run on the owner's request. The README block at `4b05863` records Ice Lab 1148 (1147 pass, 1 todo), bridge 78/78 and Unreal 9 + 2 skipped (CI-generated, not re-run here).
- Fragile spots (carried): the scripted jump entrances are knife-edge search results; the sim's skid never recovers once the carve is lost.

## Next steps, in order
1. Merge this hand-off: `! gh pr merge 132 --merge`. It's docs only, so no CI runs, and GitHub reports it mergeable.
2. The owner answers Open questions 1 and 2, one line each.
3. Video track: build `edgework-video intake` (blueprint §11), then the M0 schemas: `edgework-take/1`, the wireframe/1 export profile and `edgework-evidence/1`.
4. Sway track, independent of the video track:
   1. The owner runs `comSwayMode: 1` on the pad at 0.35 s.
   2. JPSE re-search with the mode on.
   3. The three interactions in `docs/reports/comsway-2026-11-20.md`.
5. To keep the blueprint in the repo, say "land the blueprint as `docs/reports/video-motion-blueprint-2026-11-20.md`".

## One-shot check
    bash ~/.claude/skills/hanoffed/scripts/scan.sh --root ~/KoLd__FEEt.ice_skating_ --fetch
    (cd tools/ice-lab && node --test test/*.test.ts && node replay/verify.ts test/fixtures/replay-v1.json)
    node games/ice-run-godot/tools/prepare.mjs --engine-only
    node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs
    node --test games/ice-run-unreal/tests/*.test.mjs

Typecheck: `npm install typescript @types/node` in a scratch directory, then from `tools/ice-lab` run `<scratch>/node_modules/.bin/tsc --noEmit -p . --typeRoots <scratch>/node_modules/@types`.

README block: run the three suites with `--test-reporter=tap` into a directory as `ice-lab.tap`, `godot.tap` and `unreal.tap`, then run `node tools/ice-lab/status.mjs --logs <dir> --write`.

## Rules that still apply
- No deletes, resets, cleans, force pushes or overwrites. New work goes in a fresh worktree off `origin/main`. Never a broad process kill.
- New physics stays behind a mode, off by default; replay stays at `/39`. Presentation never moves the sim or a score.
- Before turning a mode on, run the full suite with it on in the target setups, and report every failure in plain words before re-pinning.
- Measure before claiming; label authored numbers; re-pin a test only for a deliberate change, with the reason in the test.
- Video: source footage never enters the repo. Only reviewed, derived JSON does. Evidence enters `data/validation/cases` only after human review (fidelity gate §6.1).
- One agent lands PRs at a time. `gh pr merge` is blocked for Claude Code, so the owner runs `! gh pr merge <n> --merge`. Don't edit another agent's claimed worktree.
- Briefs for outside agents (Codex, agy, Qwen) must stand alone. agy and Codex can't open claude.ai pages, so copy what they need into the brief.

## Vocabulary so far
word, referent, idempotent, provenance, invariant, presupposition, stipulate, contiguous, fast-forward, confabulation, threat model, reaction torque, confound, regression, acceptance criterion, race condition, negative control, preregistration, stacked PR, attestation, opt-in, monotonic, triage, Goodhart's law, protocol deviation, chirality, Pareto front, squash merge, dangling commit, forward kinematics, contact constraint, false negative, affordance, counterfactual, bake, centre of pressure, knife-edge result, lookahead, latch, superset, addressee, seam, test double, headroom, jerk, pseudoreplication (Opus 5.5, 2026-11-20), homography (Opus 5.5, 2026-11-20)

## Opening prompt for next session (edit the brackets)
> Read `Hand_off.md` on `origin/main` (or branch `handoff-2026-11-20-blueprint` if #132 is unmerged) in a fresh worktree, and run its one-shot check. On agy's draft I choose [a / b / c]; licensing is [research-only / shippable]. Then [build `edgework-video intake` per blueprint §11 | comSway pad notes: …]. Stipulate: live work; run only the new tests unless I ask for the full suite; commit on the branch, push, open a PR, don't merge. When we wrap up: /hanoffed.
