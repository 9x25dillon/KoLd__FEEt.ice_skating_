# Hand-off — EDGEWORK / native game

## Resume here
**Newest close:** 14 November 2026, 14:05 PST · Claude Code, Opus 5.5 · session `50f7edd7`
**Where things stand:** `main` is `15933b2` (PRs #95–#100, all merged, CI green). Today:
- a dance style per career event;
- Blade Explorer's default knee bend under a push (0.6), and words that say RT is the push;
- spins, spirals and the Ina Bauer play their library poses (arms stay the sim's);
- 68 new clips (kiss-and-cry, bows, podium, warm-up, footwork), and the upright spin pose fixed;
- Light and Strong bodies for create-a-skater builds;
- the podium plays its clips in Godot and Unreal.

**Unfinished:** the kiss-and-cry, on local branch `kiss-and-cry-wip` (`7ae6341`), not pushed. Godot's smoke test fails on it (see In flight).
**Corrects the previous hand-off:** its "RT decision" was answered: "both" (#96). Its next steps 3 and 4 (per-event dance, spin positions) are done.
**Decision needed:** none to start. Play-test notes would steer step 2.
**Start with:**
1. `git fetch origin; git log --oneline -3 origin/main`: expect `15933b2` or later. Another session (`2525c6dc`, weight transfer, `.delivery/weight`) was live at this close; check what it merged.
2. `cd .delivery/scenes && git log --oneline -2`: the kiss-and-cry WIP.
3. Then In flight's first item.

## Progress track (newest first)
| Date | Session | Shipped | State after |
|---|---|---|---|
| 2026-11-14 | Opus 5.5 `50f7edd7` | PR #100 `7c2764f` | podium plays `podium.wave` / `podium.flowers.mirror` / `podium.medal`; bridge op `motionTrack` bakes a clip at 30 fps |
| 2026-11-14 | Opus 5.5 `50f7edd7` | PR #99 `0028699` | `skater-build-light/strong.glb`; created skaters wear their build in arcade, exhibition, showcase |
| 2026-11-14 | Opus 5.5 `50f7edd7` | PR #98 `71e49f8` | 418 clips: new categories `ceremony` 29, `idle` 20, `step` 19; `SP_Upright_Basic` free blade at the knee |
| 2026-11-14 | Opus 5.5 `50f7edd7` | PR #97 `381465b` | motion layer `body`: spin, spiral and Ina Bauer poses; arms stay the sim's |
| 2026-11-14 | Opus 5.5 `50f7edd7` | PR #96 `0257be6` | Explorer: knee at least 0.6 under a push; RT words in glide, crossover and push lesson |
| 2026-11-14 | Opus 5.5 `50f7edd7` | PR #95 `0c0f7df` | `CareerState.dances`; Dance row on the briefing (Godot, Unreal) |
| 2026-11-11 eve | Opus 5.5 `db93fb4b` | PR #92–#93 | backstories, create-a-skater, Arcade, Exhibition, Creation, demonstration |
| earlier | — | — | `docs/handoff-before-ceremony-2026-11-14.md` and older archives |

## In flight
- **Kiss-and-cry** on `kiss-and-cry-wip` (local only, `.delivery/scenes`, `7ae6341`).
  - Done:
    - `game/kisscry.ts`: `reactionTo`, `kissAndCry`, with `test/kisscry.test.ts`;
    - the bridge's `result.kissAndCry` (career only);
    - Godot `scripts/kiss_cry.gd` (bench and board where the podium stands), `main.gd` (bench first, `present_podium()` after), and a smoke stage.
  - **Broken:** the Godot smoke test fails. "Ice Lab did not respond to [motionTrack, motionTrack, configure]" after 10 s (`engine_link.gd` 10 s rule). Track replies are 60–83 KB (`kc.wait` 83,503 B; the podium's were 27–42 KB and worked).
  - Unconfirmed cause. Try:
    - shrink tracks: round numbers to 3 decimals, 15 fps;
    - or request them one at a time;
    - then re-run `godot4 --headless --path games/ice-run-godot -- --smoke-test`.
  - Left: the fix, then Unreal (spawn a seated skater, step through the sequence), then a PR.
  - Untracked noise in that worktree from the smoke run: `games/ice-run-godot/{arcade-v1,career-v1}.json`. Don't commit them.
- Carried:
  - jump lesson uncommitted in `.delivery/jumplesson`;
  - Unreal director camera `b230393` on `unreal-choreo`, local only. The repo is PUBLIC.

## Decisions (why things are the way they are)
- 2026-11-14 **Per-event dance is `CareerState.dances`, not `styles`**: `style` already means Power, Finesse and so on. null = the Settings style. A test pins the sim state identical with and without one.
- 2026-11-14 **Explorer's default push knee is 0.6** (owner: "both", cue and bend).
  - Measured from a standstill, tapping A every 50 ticks (the owner's median): 3 m/s at 4.7 s; never without the bend.
  - 0.7 is `jumpLoadKnee`: a push loads a hop and she falls. So the bend is clamped to load − 0.05.
  - Cost: the steadying hand's scripted novice falls more (jerky 7/4/2 → 10/8/5, calm 6/2/0 → 11/6/6). 0.5 was no better.
  - Replays record the mapped input, so none move.
- 2026-11-14 **In spins and formal moves the library poses the body, not the arms**: the arms' reach is the spin's inertia (physics). The clip is mirrored to the sim's support foot. Spirals with Experimental's free-leg raise keep the sim's leg.
- 2026-11-14 **Athletic is the athlete's body.** Builds change only shape (same rig, skin, hair, height). Career runs still wear the Settings character.
- 2026-11-14 **Baked tracks travel on request** (`motionTrack`), never inside frames: a frame carrying the podium's tracks would be about 100 KB.
- 2026-11-14 **Kiss-and-cry reactions** (authored):
  - joy = first place, or a personal best (a first completion isn't one);
  - relief = on the podium;
  - disappointed = otherwise, or the program unfinished.
- Earlier, still in force: presentation never moves the sim or a score; rivals never decide medals; replay stays at `/39`.

## Dead ends (don't retry without new information)
- **An open-loop replay of the owner's run with one input changed.** My standalone step loop diverged at tick 1261 even with nothing changed (no rink collision; the same as the old `ReplayPlayer` dead end). Measure changes with controlled sweeps instead.
- **`hanoffed checks.sh` here**: it SKIPs everything (no npm deps installed). Run the project's commands (One-shot check).
- **Telling whether the game is open with `pgrep` patterns.** Read `~/.local/share/godot/app_userdata/EDGEWORK · Ice Run/logs/godot.log` and the launch log instead. Today's launch ran 13:48:45–13:53:01; whether the owner closed it is unknown.
- From earlier: `pgrep -f "godot4 --path"`; launching the game from a background call; TS parameter properties; `Choreography` with `low = false`.

## Open questions (settle these first)
- Does 0.6 on Explorer feel right on the pad, or are the extra falls too many? (Owner plays First ice.)
- Why does the engine link time out on several large replies: size, or something else?
- Download male MakeHuman sources (men's skater, coach, judges)? Lio Tarrant's pronoun? Should career runs wear the sheet's build?
- None of today's work has been seen on the pad: Explorer, spin poses, the Light and Strong bodies in a game, the podium in a real career.
- Carried: warm-up falls cost wear? warm-up length? the Championship baseline.

## State (verified 13:54–14:00 PST)
- `main` `15933b2`, CI green (Ice Lab checks, Native replay). No open PRs in this repo.
- Session `2525c6dc` was LIVE on `weight-transfer` (`.delivery/weight`, 5 dirty files).
- Worktrees left (no deletes): `.delivery/eventstyle`, `explorerknee`, `spinposes`, `clips2`, `bodies` (all merged), `scenes` (the WIP), `main-1114` (detached `main`; the game was launched from it), `handoff-1114`.

## Project health
- On `15933b2`: Ice Lab 1045/1045 · bridge 61/61 · typecheck clean · `replay/verify.ts` verified (240 ticks) · the fidelity report unchanged.
- Tested on branches today, not on `main`: Unreal builds, 8/8 (#100); Godot smoke passes (#100).
- Fragile:
  - a fresh worktree needs `godot4 --headless --path games/ice-run-godot --import`;
  - Unreal needs `node games/ice-run-unreal/tools/prepare.mjs --content`;
  - the first `npm start` in a worktree spends about 3 minutes converting music.
- All clip shapes, the build bodies' shape weights, and the kiss-and-cry timings are drawn by eye.

## Next steps, in order
1. **Owner plays** (timestamped notes):
   - First ice on Blade Explorer, RT released, then with RT;
   - a spin;
   - a created Light and a Strong skater in Exhibition;
   - a career program to its podium.
2. **Finish the kiss-and-cry** (In flight), then Unreal, then a PR.
3. **Put more new clips on screen**:
   - `idle.*` for the player before a program starts;
   - `step.*` over step sequences (needs the sim's step state).
4. Carried: spin variations beyond basic, attitude and I (layback, Biellmann) need sim state; measured pads for spiral, step and combo.

## One-shot check
    bash ~/.claude/skills/hanoffed/scripts/scan.sh --root ~/KoLd__FEEt.ice_skating_ --fetch
    (cd tools/ice-lab && node --test test/*.test.ts && node replay/verify.ts test/fixtures/replay-v1.json)
    node games/ice-run-godot/tools/prepare.mjs --engine-only
    node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs
    godot4 --headless --path games/ice-run-godot --import && godot4 --headless --path games/ice-run-godot -- --smoke-test
    node games/ice-run-unreal/tools/prepare.mjs --content && node --test games/ice-run-unreal/tests/*.test.mjs

Typecheck: `npm install typescript @types/node` in a scratch directory, then from `tools/ice-lab` run `<scratch>/node_modules/.bin/tsc --noEmit -p . --typeRoots <scratch>/node_modules/@types`.

Unreal C++: `~/UnrealEngine/Linux_Unreal_Engine_5.8.4/Engine/Build/BatchFiles/Linux/Build.sh IceRunEditor Linux Development -Project=$PWD/games/ice-run-unreal/IceRun.uproject -WaitMutex`.

Stills:
- Godot pose lab: `node games/ice-run-godot/tools/pose_clip.mjs <clip.json> --motion`, then `godot4 --path games/ice-run-godot --script res://tools/pose_lab.gd -- --clip=<clip.json> --check` (add `--shots=<dir> --ticks=…` for stills).
- Godot podium: `-- --capture --capture-podium`.
- Unreal podium: `-RenderOffscreen -IcePodiumPreview -IceShots=5 -IceShotDir=<dir>`.
- Clip contact sheets: `motion_dump.mjs <category>` → `render_motion.py` → `montage`. Compress with `magick -colors 256`.
- New bodies: `blender --background --python games/ice-run-godot/tools/build_athlete.py -- --build=<id>`.

Launch for the owner: from a worktree on `main`, run `setsid -f bash -c 'npm start > log 2>&1'`, then read the Godot log.

## Rules that still apply
- No deletes, resets, cleans, force pushes or overwrites. Additive only. New work goes in a fresh worktree off `origin/main`. Never a broad process kill.
- New physics stays behind a mode or optional input; replay stays at `/39`. Presentation never moves the sim or a score.
- Measure before claiming; label authored numbers; re-pin a test only for a deliberate change, with the reason in the test.
- The owner decides gate policy. `gh pr merge` needs the owner's `!`. Every pushed commit goes in a PR. Check that a PR is still open before pushing to it. The repo is PUBLIC: unfinished work stays local.
- Browser checks in Firefox or Brave, never Chromium.

## Vocabulary so far
word, referent, idempotent, provenance, invariant, presupposition, stipulate, contiguous, fast-forward, confabulation, threat model, reaction torque, confound, regression, acceptance criterion, race condition, negative control, preregistration, stacked PR, attestation, opt-in, monotonic, triage, Goodhart's law, protocol deviation, chirality, Pareto front, squash merge, dangling commit, forward kinematics, contact constraint, false negative, affordance, counterfactual, bake

## Opening prompt for next session (edit the brackets)
> Read `Hand_off.md` in a fresh worktree off `origin/main` and run its one-shot check. [My play notes: … | no notes yet.] Then [fix the kiss-and-cry on `kiss-and-cry-wip` | put idle clips before a program | …]. Stipulate: live work. When we wrap up: /hanoffed.
