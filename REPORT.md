# Presentation Parity Report (Brief 2: Antigravity)

Branch: `presentation-parity` (base `0e9a31d`)  
Worktree: `/home/kill/KoLd__FEEt.ice_skating_/.delivery/parity`

## What Changed

1. **Godot intro HUD (`games/ice-run-godot/scripts/broadcast.gd`, `games/ice-run-godot/scripts/main.gd`)**
   - In `broadcast.gd` `_draw()`, when `data.get("intro") != null`, draws the announcer card in the existing `broadcast.announce` style (`plate(...)` + `GOLD` title + `WHITE` detail + `MUTED` hint, no new fonts): skater's name (`who.name`, fallback `"Your career skater"`), program title (`routine.title`, fallback `"Your program"`), and `"A  Begin"` hint. Both disappear the moment `frame.intro` is `null`.
   - In `main.gd`, suppresses `"TAKE THE ICE"` while `music_waiting` is true at `start`, and clears `broadcast.announce_time = 0.0` when `music_waiting` drops as the intro ends.

2. **Godot capture paths (`games/ice-run-godot/scripts/main.gd`)**
   - Added `--capture-intro` (alongside `--capture`): starts `career` event 0 with `{"warmup": false, "intro": true}`, captures `docs/presentation/intro/mid-intro.png` at ~1.8 s into the intro, waits for `frame.intro == null`, then captures `docs/presentation/intro/program-1s.png` 1.0 s into the program.
   - Added `--capture-stepclips`: starts `composer` with `{"sequence": ["step"], "intro": false}` in the real game, captures `docs/presentation/stepclips/step-swing-roll-1.png` at ~0.6 s and `docs/presentation/stepclips/step-swing-roll-2.png` at ~1.5 s.

3. **Unreal parity (`games/ice-run-unreal/Source/IceRun/{IceRunGameMode.h,IceRunGameMode.cpp,IceRunHUD.cpp}`)**
   - **Intro full-body clip & step clips (`IceSkater.cpp`):** verified existing `ApplyMotion` already poses `MotionLayer == "full"` (full-body intro clip) and the `else` branch for `MotionLayer == "arms"` (`step.swing-roll` / `step.swing-roll.mirror`) without changes.
   - **Intro option & music hold (`IceRunGameMode.h`, `IceRunGameMode.cpp`):** `StartRun()` now sends `intro: true` when `!bSmoke && (ShotTimes.Num() == 0 || -IceIntro)`. Added `bMusicWaiting`: on `start`/`endWarmup`/`arcade` and on `frame`, music is stopped/held while `frame.intro` is non-null and `StartMusic()` fires the moment `frame.intro` becomes `null`. `"TAKE THE ICE"` is suppressed while `bMusicWaiting` is true.
   - **Intro HUD (`IceRunHUD.cpp`):** when `frame.intro` is non-null, draws the same announcer card (`who.name`, `routine.title`, `"A  Begin"`) in the existing `Panel`/`Champagne`/`Ink`/`Soft` broadcast style; disappears immediately when `frame.intro` is `null`.

## What I Saw in Each Still (Honest Notes)

- `docs/presentation/intro/mid-intro.png` (Godot): Skater stands still (`00.0 KM/H`) at her start spot in the full-body idle clip, arms relaxed at her sides, timer at `01:15`. Centered top card shows `Your career skater` / `First ice` / `A Begin` cleanly with no clipping.
- `docs/presentation/intro/program-1s.png` (Godot): Announcer card and `A Begin` hint are completely gone, timer at `01:13`. The skater is already gliding at `17.3 KM/H` (~4.8 m/s) with two blade traces behind her and arms out. Going directly from `00.0 KM/H` standing idle to `17.3 KM/H` at tick 0 is a noticeable instantaneous speed pop (as expected from the sim starting with initial velocity after tick 0 is held; not touched in the sim).
- `docs/presentation/stepclips/step-swing-roll-1.png` & `step-swing-roll-2.png` (Godot): Real-game `composer` `['step']` run (`Step sequence`, `01 / 01 · Your signature program`, `step.swing-roll.mirror`). In `-1.png` (`16.7 KM/H`, `L LF-`), the arms show an asymmetric swing-roll shape (left arm slightly lower/forward, right arm higher/out). In `-2.png` (`17.0 KM/H`, `L LF- R RFI`), the arms have swung to a wider, nearly level arc as the clip advances. (Because `--capture-stepclips` starts without `--capture-intro`, `"TAKE THE ICE"` is visible in those two stills.)
- `docs/presentation/intro/ice-run-unreal-00.png` (Unreal): Skater stands at `0.0 m/s` (`01:15`) in the full-body idle clip; centered card shows `Your career skater` / `First ice` / `A Begin`.
- `docs/presentation/intro/ice-run-unreal-01.png` (Unreal): At 5.2 s (~1.2 s into the program), card and hint are gone, timer at `01:14`, skater gliding at `4.4 m/s` (`Right RF-`) with blade trace and skating arms. Same ~4.4–4.8 m/s pop out of the standstill as Godot.

## Verification & Counts

All commands run in `/home/kill/KoLd__FEEt.ice_skating_/.delivery/parity`:

- **Ice Lab tests:** `(cd tools/ice-lab && node --test test/*.test.ts && node replay/verify.ts test/fixtures/replay-v1.json)`
  - `tests 1098`, `pass 1097`, `fail 0`, `todo 1` (the known `discretisation.test.ts` todo)
  - Replay: `{"verified":true,"ticks":240}`
- **Typecheck:** `tsc --noEmit -p . --typeRoots /tmp/agy-parity-tsc/node_modules/@types` (from `tools/ice-lab`)
  - Exit `0` (clean)
- **Godot prepare & bridge tests:** `node games/ice-run-godot/tools/prepare.mjs --engine-only && node --test --test-isolation=none games/ice-run-godot/tests/*.test.mjs`
  - `Prepared 96 Ice Lab modules`, `tests 76`, `pass 76`, `fail 0`
- **Godot import & smoke test:** `godot4 --headless --path games/ice-run-godot --import && godot4 --headless --path games/ice-run-godot -- --smoke-test`
  - Exit `0`: `GODOT_PLANNING_PASS`, `GODOT_PROTOCOL_PASS`, `GODOT_SMOKE_PASS`, `GODOT_KISSCRY_PASS`, `GODOT_PODIUM_PASS`, `GODOT_PAIRS_PASS`
- **Godot captures:**
  - `godot4 --path games/ice-run-godot -- --capture --capture-intro` → `GODOT_INTRO_CAPTURE`, `GODOT_CAPTURE_PASS`
  - `godot4 --path games/ice-run-godot -- --capture --capture-stepclips` → `GODOT_STEPCLIPS_CAPTURE: step.swing-roll.mirror`, `GODOT_CAPTURE_PASS`
- **Unreal build & prepare:** `node games/ice-run-unreal/tools/prepare.mjs --content`
  - Compiled `IceRunEditor` cleanly (`Success - 0 error(s)`) and `Unreal client prepared.`
- **Unreal tests:** `node --test games/ice-run-unreal/tests/*.test.mjs`
  - `tests 9`, `pass 9`, `fail 0`, `skipped 0` (including both live UnrealEngine tests)
- **Unreal stills:** `bash games/ice-run-unreal/run.sh -IceMode=career -IceIntro -IceShots=1.8,5.2 -IceShotDir=.../docs/presentation/intro -ResX=1280 -ResY=800 -WINDOWED`
  - Saved `ice-run-unreal-00.png` and `ice-run-unreal-01.png`.

## Open Questions for the Owner

- In both Godot and Unreal, the program starts at ~4.5 m/s immediately after the 0.0 m/s standing intro (per the sim's tick-0 initial velocity). Should a future sim/choreography pass blend or push into that opening speed instead of popping from 0 to 4.5 m/s?
