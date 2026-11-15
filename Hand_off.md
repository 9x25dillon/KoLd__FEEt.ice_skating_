# Hand-off — EDGEWORK / native game

## Resume here
**Newest close:** 14 November 2026, 19:20 PST · Claude Code, Opus 5.5 · session `2525c6dc`
**Where things stand:** `main` is `dc51b4b` (PRs #95–#106 all merged today).
- **Weight transfer is on** in Simulation, Experimental and Dig Gate.
  - The blades now hand the load over in about 0.25 s instead of in one tick.
  - One support signal (`sim/support.ts`) is sent with every frame, and Godot and Unreal both pose from it.
  - Every pinned test it moved was re-measured, or its script re-searched with JPSE (#105).
- **New resources:** skates (#102), element telemetry cards (#103), 34 costumes in 10 collections (#104).
- **Ships separately:** venues and the kiss-and-cry fix come from session `fcd73900`.

**Broken on main:** CI "Ice Lab checks" fails at `dc51b4b`. The only failure is `games/ice-run-godot/tests/engine.test.mjs:150`, which expects exactly the four original costumes.
**Corrects the previous hand-off:** the morning hand-off (`5770ba3`, session `50f7edd7`) was never pushed; it's archived as `docs/handoff-before-weight-transfer-2026-11-14.md`. Its kiss-and-cry diagnosis ("large replies time out") was wrong. Session `fcd73900` found the real causes (see Decisions).
**Decision needed:** fix the costume test: `hello.skins.slice(0,4)` at `engine.test.mjs:150`. Say yes and it's a one-line PR.
**Start with:**
1. `git fetch origin; git log --oneline -5 origin/main; gh pr list`: expect `b3e0f8f` or later, and PRs #108 (`venues`) and #109 (`kiss-and-cry-wip`) open or merged.
2. The costume test fix (one line), then check that CI is green.
3. Then the owner's answers to Open questions 1–3.

## Progress track (newest first)
| Date | Session | Shipped | State after |
|---|---|---|---|
| 2026-11-14 eve | Opus 5.5 `2525c6dc` | PR #105, #106 | `weightTransferMode` on in Sim/Exp/DigGate; 2Lo baseline re-searched (load 0.425 s, check 0.45 s); Power's entrance 7.25 m/s |
| 2026-11-14 eve | Sonnet agents for `2525c6dc` | PR #102, #103, #104 | `game/skates.ts`; `game/elementstats.ts` + broadcast cards; 38 skins in collections, sequin fabric |
| 2026-11-14 | Opus 5.5 `2525c6dc` | PR #101 `3c6c554` | `sim/support.ts` signal; Godot/Unreal pose from it; `weightTransferMode` added (off) |
| 2026-11-14 | Opus 5.5 `50f7edd7` | PR #95–#100 | dance per event; Explorer knee 0.6; spin poses; 418 clips; Light/Strong bodies; podium plays |
| 2026-11-11 eve | Opus 5.5 `db93fb4b` | PR #92–#93 | backstories, create-a-skater, Arcade, Exhibition, Creation, demonstration |
| earlier | — | — | `docs/handoff-before-*.md` |

## In flight
- **Venues**: PR #108 (`venues`, head `c2d869c`, MERGEABLE at 19:10), by session `fcd73900`:
  - six rinks, each with its own look around the same ice: `game/venues.ts`, `arena.gd`, Unreal `AIceRink::ApplyVenue`, stills in `docs/presentation/venues/`;
  - I merged main into it as `8eddd7e`, keeping the skates and venues catalogue entries side by side;
  - checked: Ice Lab 1082/1082, Unreal builds and passes 8/8, Godot 66/67 (the costume test);
  - not yet seen: the Unreal TextRender banners in a running game (yaw = bank + 180).
- **Watch, unverified:** a new engine starts a free skate, so the hello frame's venue is the outdoor night rink. The Godot title backdrop will probably show the lakeside rink, not Northlight. The owner should say if that's wanted.
- **Kiss-and-cry**: PR #109 (`kiss-and-cry-wip`, head `f3a7557`), by session `fcd73900`.
  - The smoke failure was the smoke check's fake-idle trick racing in-flight `motionTrack` requests, not the link.
  - #108 and #109 carry the same drain fix, so either can merge second.
- **The Codex session `01a1dc33`** never received a task (its brief was cancelled). It is idle.
- Carried: the jump lesson, uncommitted in `.delivery/jumplesson`; the Unreal director camera `b230393` on `unreal-choreo`, local only.

## Decisions (why things are the way they are)
- 2026-11-14 **The load moves between blades over time** (owner: "go for it", then "turn it on and re-tune them"):
  - critically damped, done in `weightTransferTime` 0.25 s (authored);
  - the stance moves round the centre of pressure, and a blade leaves the ice when its share reaches 0;
  - pivots, spins, Ina Bauers and landings still set the share at once;
  - stored as `loadBias` (right share − 0.5) so the mirror is exact; a share form drifted 1.2e-14 m.
- 2026-11-14 **One support signal, derived, never stored** (`supportSignal(state)`): phase, foot, toward, shares, rates, roles, centre of pressure, and the COM over it. Read-only (tested: no digest changes).
- 2026-11-14 **Re-tune by re-searching, not by loosening.**
  - The 2Lo baseline is the clean double nearest the old script, out of 21 in 720.
  - The tutorial marker's scripted player steers at gain 1.2: 1.4 was the only gain from 0.8 to 2.0 that missed the ring.
  - The one loosening is the warm-up's boards check, 2 mm, because `game/rink.ts` leaves a skater already heading back in where it is.
- 2026-11-14 **Rival `BASELINE` unchanged** until the owner decides; the re-measured values are in `docs/support-signal.md`.
- 2026-11-14 **Resources are cosmetic only.** Skates never touch Params (a test runs 360 ticks per preset and finds byte-identical state). Telemetry cards are display only, and their style thresholds are authored in `STYLE_RULES`.
- 2026-11-14 **Kiss-and-cry smoke** (session `fcd73900`, two causes):
  - the smoke's idle trick wound `link.last_reply` back 20 s while `motionTrack` requests were in flight;
  - `kiss_cry.gd` kept the podium's tracks.
- From the morning (`50f7edd7`):
  - per-event dance is `CareerState.dances`;
  - Explorer's push knee is 0.6;
  - library poses move the body, never the arms, in spins;
  - baked tracks travel on request (`motionTrack`).
- Earlier, still in force: presentation never moves the sim or a score; rivals never decide medals; replay stays at `/39`.

## Dead ends (don't retry without new information)
- **Treating the 2Lo failure as a script problem to tweak.** Power at 7.5 m/s falls in the load whatever the check: the weight is still shared 5 ticks before the release. Find where the weight goes, then re-search.
- **A zsh loop that `set -- $pair` to split pairs.** zsh doesn't word-split, so `$1` was the whole string and every pair "conflicted". Write each pair out.
- **`git cat-file -p "$T:path"` in zsh.** `$T:g` is read as a modifier. Use `"${T}:path"`.
- **Passing two flags in one variable to Godot.** They arrive as one argument; the pose lab's "front" and "side" stills came out identical. Pass each flag as its own argument.
- From the morning: an open-loop replay of the owner's run with one input changed (diverges at tick 1261); `checks.sh` here SKIPs everything; telling whether the game is open with `pgrep`.

## Open questions (settle these first)
1. **The costume test:** apply `slice(0,4)` at `engine.test.mjs:150`? CI is red until then.
2. **Experimental's automatic beat crossovers.** Each puts the weight on both feet, and getting back to one takes up to 0.25 s, so a load just after a beat starts on two feet. Whether a jump stands can depend on the music. Option: no automatic crossover while the standing trigger is held toward a load.
3. **Rival `BASELINE`.** Re-measured on Simulation with the transfer on:
   - club-debut 16.7 → 10.6, regional 16.0 → 14.4, finale 30.9 → 34.0;
   - Nationals had no clean run in 45 tries.

   Adopt the new values, keep the old ones, or re-measure with a better pilot?
4. **The boards gap:** `game/rink.ts` leaves a skater heading back in up to 1.1 mm out. Fixing it could change replays (the owner's First ice was stuck on the boards).
5. Not yet felt on the pad: the transfer, skates, cards, outfits, venues, nor the morning's Explorer 0.6 knee and spin poses.

## State (verified 19:05–19:15 PST)
- `main` `dc51b4b`.
- CI: Ice Lab ✓, Native replay ✓, Ice Lab checks ✗ (the costume test only; green at `915b79b` and earlier).
- Session `fcd73900` was LIVE at this close; it opened #108 and #109 and writes only `~/Hand_off.md`.
- Unpushed and superseded: `5770ba3` on `handoff-2026-11-14`; its content is archived here.
- Worktrees left (no deletes): `.delivery/weight`, `transfer-on`, `skates`, `telemetry`, `outfits` (all merged), `main-1114`, `handoff-1114`, `handoff-1114c`. Scratch merge worktree: `/tmp/claude-1000/…/scratchpad/combo`.

## Project health
- On `dc51b4b`:
  - Ice Lab 1077/1077 · `replay/verify.ts` verified (240 ticks) · typecheck clean (scratch TypeScript 7.0.2);
  - bridge 62/63 (the costume test) · Godot smoke passes (protocol, career, podium, pairs).
- Unreal built clean and passed 8/8 on `venues`, which is main plus venues.
- Fragile:
  - a fresh worktree needs `godot4 --headless --path games/ice-run-godot --import`, and Unreal needs `prepare.mjs --content`;
  - pinned jump scripts sit on knife edges; when one breaks, search (`jpse/search.ts`) before you tweak;
  - `rival_baseline.mjs` takes over 10 minutes; run it in the background.
- Authored, not measured: `weightTransferTime` 0.25 s, the telemetry style thresholds, the skate finishes, costume palettes, venue lighting.

## Next steps, in order
1. The costume test fix, then green CI.
2. Merge #108 and #109 (`! gh pr merge 108 --merge`, then 109). Look at the Unreal banners and the Godot title backdrop in a running game.
3. **The owner plays** (timestamped notes): a stroke and a crossover on Simulation (the transfer); the 2Lo on Experimental; the skates and outfits pages; the cards after a jump; each venue.
4. The owner's answers to Open questions 2–4, then build them.
5. The directive's next phase: edges, crossovers and three-turns read the support signal (roles `taking`/`giving`) for free-foot preparation. The COM swaying over a planted blade is the known limit (`docs/support-signal.md`).
6. Carried from the morning: idle clips before a program; `step.*` clips over step sequences.

## One-shot check
    bash ~/.claude/skills/hanoffed/scripts/scan.sh --root ~/KoLd__FEEt.ice_skating_ --fetch
    (cd tools/ice-lab && node --test test/*.test.ts && node replay/verify.ts test/fixtures/replay-v1.json)
    node games/ice-run-godot/tools/prepare.mjs --engine-only
    node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs
    godot4 --headless --path games/ice-run-godot --import && godot4 --headless --path games/ice-run-godot -- --smoke-test
    node games/ice-run-unreal/tools/prepare.mjs --content && node --test games/ice-run-unreal/tests/*.test.mjs

Typecheck: `npm install typescript @types/node` in a scratch directory, then from `tools/ice-lab` run `<scratch>/node_modules/.bin/tsc --noEmit -p . --typeRoots <scratch>/node_modules/@types`.

Re-tuning tools:
- `node jpse/search-cli.ts [--grid power --style power --mastery 0|1 --windows]`
- `node jpse/cli.ts --out test/fixtures/jpse-loop-v1.json` and `node jpse/conformance.ts --write` (fixtures)
- `node test/setup-script.ts --write`
- `node games/ice-run-godot/tools/rival_baseline.mjs [--from=5 --wide]`

Stills:
- `pose_clip.mjs <clip> --strokes [--transfer] [--skates=<id>]`, then `pose_lab.gd -- --clip=<clip> --shots=<dir> --ticks=… --view=body --around=<rad>` (0 is the front);
- `--capture --capture-telemetry`; `--capture-venues`.

## Rules that still apply
- No deletes, resets, cleans, force pushes or overwrites. New work goes in a fresh worktree off `origin/main`. Never a broad process kill.
- New physics stays behind a mode; replay stays at `/39`. Presentation never moves the sim or a score.
- Measure before claiming; label authored numbers; re-pin a test only for a deliberate change, with the reason in the test.
- Subagents: own worktree, file ownership in the brief, absolute paths. If a subagent's edit is denied, don't make it on its behalf; ask the owner.
- The owner decides gate policy. `gh pr merge` needs the owner's `!`. The repo is PUBLIC.

## Vocabulary so far
word, referent, idempotent, provenance, invariant, presupposition, stipulate, contiguous, fast-forward, confabulation, threat model, reaction torque, confound, regression, acceptance criterion, race condition, negative control, preregistration, stacked PR, attestation, opt-in, monotonic, triage, Goodhart's law, protocol deviation, chirality, Pareto front, squash merge, dangling commit, forward kinematics, contact constraint, false negative, affordance, counterfactual, bake, centre of pressure, knife-edge result

## Opening prompt for next session (edit the brackets)
> Read `Hand_off.md` in a fresh worktree off `origin/main` and run its one-shot check. [Yes, fix the costume test.] [My play notes: … | none yet.] Then [answer the beat-crossover question: … | adopt / keep the rival BASELINE | start the directive's next phase]. Stipulate: live work. When we wrap up: /hanoffed.
