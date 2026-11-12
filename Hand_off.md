# Hand-off — EDGEWORK / native game

## Resume here
**Newest close:** 11 November 2026, 18:30 PST · Claude Code, Opus 5.5 · session `db93fb4b`
**Where things stand:** Everything is on `main` (`e3ac913`, PRs #92 and #93). Career is still the main game, and four things now sit beside it:
- **Backstories** for every rival and seven **origins** for your own skater; each sets stats, style and dance.
- **Create-a-skater** for a new career.
- **Arcade**, **Exhibition & Free skate**, and **Creation**. Creation's showcase has the computer skate your program.
- **Watch a demonstration**, with an opaque on-screen controller.

All of it is in Godot and Unreal. The owner **played it once** (birthday): First ice on Blade Explorer, with no momentum and stuck on the boards. They also watched the demonstration and asked for a new closing pose, which is done.
**Corrects the previous hand-off:** none of its claims went false. Its next steps 2 and 3 (dance style per career event, spin positions during spins) were **not** done today; they carry forward.
**Decision needed:** Blade Explorer's push power is the knee, which on a pad is RT, and nothing says so (see Open questions). Pick: a tutorial cue, a default knee bend, or both.
**Start with:**
1. `git fetch origin; git log --oneline -3 origin/main`: expect `e3ac913` or later.
2. Make a fresh worktree off `origin/main` and run the One-shot check below.
3. Then the owner's answer on RT, or next step 2.

## Progress track (newest first)
| Date | Session | Shipped | State after |
|---|---|---|---|
| 2026-11-11 eve | Opus 5.5 `db93fb4b` | PR #93 `bce82fa` | Watch a demonstration + `pad_overlay.gd`; new closing pose (Godot, Unreal); `--capture-pose` |
| 2026-11-11 eve | Opus 5.5 `db93fb4b` | PR #92 `8b4c2db` | backstories, create-a-skater, Arcade, Exhibition, Creation + showcase pilot; native career applies styles; Unreal menus with per-mode accents |
| 2026-11-11 | Opus 5.5 `73e1dc5d` | PR #84–#91 | season two, rival models, warm-up, podium, motion library, dance-style arms |
| 2026-11-10 | Opus 5.5 `33ad` | PR #81–#83 | Unreal to main; Power's entrance search |
| 2026-11-09 | Opus 5.5 `cd5d8f8d` | PR #75–#80 | JPSE, clockwise jumps, career styles, free-leg raise, custom style |
| earlier | — | — | `docs/handoff-before-modes-2026-11-11.md` and older archives |

## What's where (new today)
- `tools/ice-lab/game/backstories.ts`:
  - `RIVAL_BACKSTORIES`: each rival's stats sit at overall 50 + 20 × (level − 1).
  - `ORIGINS`: overall 50–50.3. `rivalProfile()`, `massFor()`.
- `tools/ice-lab/game/creator.ts`:
  - `SkaterSheet`, `tradePoint` (stats 40–60, overall 49.7–50.3), `parseSheet`.
  - `Studio`: 8 skaters, 8 programs, 8 dances.
  - `CareerState.fromSheet` and the career's `skater` field are in `career.ts`.
- `tools/ice-lab/game/modes.ts`:
  - `MODES` (career first); `ArcadeRun`/`ArcadeBoard`. The ladder is events 0–4 + 8, targets come from `rivalScore`, 3 lives.
  - `exhibitionEvent`; `characterParams`.
- `tools/ice-lab/game/pilot.ts`:
  - `ProgramPilot`, which is `rival_baseline.mjs`'s pad in TS, plus `doing` captions.
  - It skates glide/edge/crossover/jump/spin/pose only; `showcaseProgram()` drops the rest.
- Bridge (`engine.mjs`):
  - modes `arcade`/`exhibition`/`showcase`;
  - ops `sheet`, `studio`, `careerStyle`, `arcade`, `newCareer`;
  - snapshot fields `pilotPad`, `who`, `runDance`.
- Host saves: `studio-v1.json`, `arcade-v1.json`. Before `newCareer` it copies the save to `career-v1-before-<ISO>.json`.
- Godot:
  - `main.gd` `show_mode_page()`;
  - `scripts/pad_overlay.gd`;
  - the low pose in `skater.gd`.
- Unreal:
  - `Source/IceRun/IceRunModes.cpp`;
  - `FMenuPage.Kicker/Accent` and `FMenuItem.Meter` (drawn in `IceRunHUD.cpp`);
  - the low pose in `IceSkater.cpp`.

## In flight
- Nothing from today: everything is merged.
- Worktrees left under no-deletes: `.delivery/modes` (merged), `.delivery/main-check` (detached `origin/main`, used to replay the owner's run), `.delivery/handoff-1111b`.
- Carried over:
  - **Jump lesson** uncommitted in `.delivery/jumplesson`; it needs the owner's word.
  - **Unreal director camera** `b230393` on `unreal-choreo`, local only; the repo is PUBLIC.

## Decisions (why things are the way they are)
- 2026-11-11 **An origin is a shape, not a head start** (my call, inside the owner's ask):
  - Its stats trade points and its overall stays at 50–50.3, under Club debut's floor of 50.5, so every origin meets the same training gates.
  - The origin's style starts one week drilled and is the custom style's default nudge.
- 2026-11-11 **Rival backstory stats never decide medals.** Career scores stay measured `BASELINE` × level. The stats only give a rival a body where the computer skates them.
- 2026-11-11 **A created skater's stats may start under 50.** `restore` accepts 40 only when the save carries a valid sheet; a bare save under 50 is still treated as tampered.
- 2026-11-11 **A new career never overwrites the old one.** The host copies it to a dated file first.
- 2026-11-11 **Arcade targets are the career's own**: `rivalScore` at that event, programs skated full time. No XP, wear or rust.
- 2026-11-11 **The native career applies `career.activeStyle`**; it was browser-only before. With no style chosen the params are identical (tested).
- 2026-11-11 **The showcase is a real run with the pilot's hands**, through Simulation's mapping, unaided by coach or steadying hand. It falls when the sim says so.
- 2026-11-12 **The closing pose is drawn, not simulated** (owner: the old crouch was "nightmare fuel"):
  - soft knee, tall trunk, fourth en haut;
  - the sim still skates the cantilever (knee 0.65) underneath; presentation only.
- 2026-11-11 **Unreal has no text entry.** Names come from a curated list of invented names (decision D6); kept programs are named "Program N".
- Earlier, still in force: styles are measured Params multipliers; rivals never decide medals; replay stays at `/39`; presentation never moves the sim or a score.

## Dead ends (don't retry without new information)
- **Checking the game is running with `pgrep -f "godot4 --path"`.** With the wired Elite connected, the game relaunches itself for the paddles. The real game runs as `~/.local/share/godot/versions/4.7.2/godot` and the original exits 0. I told the owner three times that it had closed when it hadn't.
- **Launching the game from a background tool call.** Use `setsid -f bash -c 'npm start > log 2>&1'`, then look for that path.
- **Replaying a native run with `ReplayPlayer` alone.** It diverges at the boards (no rink collision). Use the bridge: `new IceEngine().replay(json)` and `advance()`.
- **TypeScript parameter properties** (`constructor(readonly x)`). Node's type stripping rejects them; write plain fields.
- **Sampling `Choreography` with `low = false` in a test.** The pose element reads `mapped.cantilever`.
- From earlier: a jump straight out of a crossover in a pilot program; pilot elements after a spin without turning forward; `-IceShots` all after the end; mirroring a symmetric fall; `Math.hypot(...) || 1`; Python `str.replace` on twice-occurring lines.

## Open questions (settle these first)
- **Blade Explorer and RT.** The owner's First ice (replay of 17:55, 75 s): 5 falls, a mean speed of 0.64 m/s, and stuck on the boards from 8 s to 56 s.
  - Their pushes had knee 0.00.
  - Measured from a standstill over 6 s: straight legs give 0.93 m/s; RT at 80% gives 3.05 m/s.
  - The run replays bit-identically on pre-#92 `main`, so this is existing behaviour, not a regression.
  - Options: a tutorial or HUD cue, a default knee bend under a push on Explorer, a way off the boards, or all three. Owner's call.
- **Untested on the pad:** create-a-skater, Arcade, Exhibition, the showcase. The demonstration was only watched.
- **Lio Tarrant:** the backstory names no pronoun; still the owner's call.
- **All backstory and arcade numbers are authored** (stats, lives, points), not measured.
- **The demonstration teaches Simulation**, while the owner plays Explorer. A pilot per setup would teach their own controls.
- Carried over: warm-up falls cost wear? warm-up length? the Championship baseline on today's engine; Autumn Trophy's thin baseline; motion shapes authored by eye.

## State (verified 18:28 PST)
- `main` `e3ac913`.
- Open PRs: none in this repo (the `astro_caster` Dependabot PRs belong to another project).
- Outer checkout `phase17-assurance`: old dirty work. Never sweep it.
- No game instance left open by me.

## Project health
- Ice Lab 1018/1018 · Godot bridge 57/57 · typecheck clean · Godot smoke passes · Unreal builds clean and 8/8. All run on `bce82fa`'s tree.
- Fragile:
  - A fresh worktree needs `godot4 --headless --path games/ice-run-godot --import` (class cache).
  - Unreal tests need `node games/ice-run-unreal/tools/prepare.mjs --content` first; without it the menu walk fails at stage 9, "face does not move".
  - Unreal's menu walk finds home items by label prefix: "The Season", "The Composer", "Wardrobe", "Settings", "Pairs". Keep those prefixes.
  - This machine's `nodejs` broke on 2026-11-11 after a partial upgrade (`libsimdjson.so.34`). `pacman -S extra/nodejs` (26.13.1) fixed it.

## Next steps, in order
1. **The RT answer** (Open questions), then build it.
2. **Owner plays the new modes on the pad**: make a skater, climb Arcade, watch a rival in the showcase. Write timestamped notes.
3. **A dance style per career event** (carried over):
   - a `styles` array on `CareerState`;
   - a briefing row;
   - `suggestStyles()`;
   - `MotionPlayer` prefers the event's style.
4. **Spin positions and spirals play their library poses** (carried over; see `docs/handoff-before-modes-2026-11-11.md`, step 3).
5. **Measured pads for spiral, step and combo**, so season two and the showcase can use them.

## One-shot check
    bash ~/.claude/skills/hanoffed/scripts/scan.sh --root ~/KoLd__FEEt.ice_skating_ --fetch
    (cd tools/ice-lab && node --test test/*.test.ts)
    node games/ice-run-godot/tools/prepare.mjs --engine-only
    node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs
    godot4 --headless --path games/ice-run-godot --import && godot4 --headless --path games/ice-run-godot -- --smoke-test
    node games/ice-run-unreal/tools/prepare.mjs --content && node --test games/ice-run-unreal/tests/*.test.mjs

Typecheck: `npm install typescript @types/node` in a scratch directory, then from `tools/ice-lab` run `<scratch>/node_modules/.bin/tsc --noEmit -p . --typeRoots <scratch>/node_modules/@types`.
Unreal C++ alone: `~/UnrealEngine/Linux_Unreal_Engine_5.8.4/Engine/Build/BatchFiles/Linux/Build.sh IceRunEditor Linux Development -Project=$PWD/games/ice-run-unreal/IceRun.uproject -WaitMutex`.
Stills:
- Godot: `godot4 --path games/ice-run-godot -- --capture --capture-pose`, which writes `/tmp/edgework-godot-pose-*.png`.
- Unreal: `-RenderOffscreen -IceShots=3 -IceShotDir=<dir> -IceOpenMenu=<arcade|create|cast|creation|…>`.

## Rules that still apply
- No deletes, resets, cleans, force pushes or overwrites. Additive only.
- New work goes in a fresh worktree off `origin/main`. Never do a broad process kill; kill only a PID you launched.
- New physics stays behind a mode or optional input, so off is byte-identical. Replay stays at `/39`.
- Measure before claiming. Re-pin a test only for a deliberate change. Authored numbers say so.
- The owner decides gate policy. `gh pr merge` needs the owner's `!`. Every pushed commit must be in a PR. **Check that a PR is still open before pushing to its branch**: #92 was merged while I was still working, and the next commit needed #93.
- Browser checks in Firefox or Brave, never Chromium.
- Presentation (motion clips, podium, warm-up, the closing pose) never moves the sim or a score.

## Vocabulary so far
word, referent, idempotent, provenance, invariant, presupposition, stipulate, contiguous, fast-forward, confabulation, threat model, reaction torque, confound, regression, acceptance criterion, race condition, negative control, preregistration, stacked PR, attestation, opt-in, monotonic, triage, Goodhart's law, protocol deviation, chirality, Pareto front, squash merge, dangling commit, forward kinematics, contact constraint, false negative, affordance

## Opening prompt for next session (edit the brackets)
> Read `Hand_off.md` in a fresh worktree off `origin/main` and run its one-shot check. RT on Blade Explorer: [add a cue | default knee bend under a push | both | leave it]. Then [here are my play notes: … | build the per-event dance style | spin positions during spins]. Stipulate: live work. When we wrap up: /hanoffed.
