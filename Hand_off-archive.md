# Hand-off archive

Superseded checkpoints and the fifteenth session's §0, moved out of `Hand_off.md` at the close of the
2026-09-21 (sixteenth) session so the live file starts with what is true now. Nothing here was edited;
read it for history and the reasoning behind decisions, never as current state.

The seventeenth session's §0 (2026-09-23) was moved here, unedited, at the close of the eighteenth.
The nineteenth session's §0 (2026-09-24) was moved here, unedited, at the close of the twentieth (2026-09-25).

## 0 (seventeenth) · Start here (written at the close of 2026-09-23, seventeenth session)

**Check first.** Another agent session shares this checkout (Phase 17/18 work). Run
`git status --short --branch`, `git fetch`, `git log --oneline -1 origin/main`. This session's work is
on **`phase17-assurance`**, merged with `origin/main` at `3812255` (PR #25 and everything before), pushed,
PR opened — see §0.6 for its merge. Uncommitted **and not this session's** (the other session's Phase 17
work — touch none without asking): `games/ice-run-godot/{README.md,bridge/engine.mjs,scripts/main.gd,
tests/engine.test.mjs,tests/host.test.mjs}`, `tools/ice-lab/test/turns.test.ts`, untracked
`docs/phase17-*.md` and `tools/ice-lab/test/phase17-replay.test.ts` (this session only moved that test's
contract pins, `/22`→`/35`, with the operator's leave). Operator data, untracked on purpose:
`E_W_replays_sessions_eng_bld/`, `Ice Lab — KoLd__FEEt edgework.html`, `session-notes/`.

At close: **609/609** browser/sim tests, **20/20** Godot bridge, typecheck clean (scratch TypeScript —
see memory `ice-lab-typecheck-toolchain`), native reference check, build. Replay contract
**`ice-lab-f64/35`** (from `/22` this morning; every bump rebased the fixture with digests unchanged —
the history is in `sim/replay.ts`). Fidelity gate: 8 pass / 0 fail, first external passes (glide 1,
jump 1, from the merged Phase 18 work) — gate still not met.

### 0.1 · The idea this session followed

The operator's direction, now in memory (`blades-parallel-tricks-from-physics`,
`owner-likes-emergent-mechanics`): **every move through the blades.** Buttons may *ask*; the physics
performs or refuses. New physics is **off by default** behind a mode param, measured before it is
switched on anywhere, and each setup opts in. Nothing old moves: every mode-off path is the previous
arithmetic, proven by the fixture digests at each bump.

### 0.2 · What exists now (all under `tools/ice-lab/`)

| Stage | Mode param | What it does | On in |
| --- | --- | --- | --- |
| A · two-blade | inputs `pitchSplit`, `kneeSplit` (optional) | per-blade turn mirror (`app/schemes.ts` `latchBlades`), heel/toe and knee per blade | Simulation, Experimental |
| B1 · slip | `slipMode` | blades and travel separate; the scrape follows the grip curve (`scrapeRefTilt`), the wrong edge catches (a trip); the dig (`bladeLength`) winds the body | Simulation, Explorer, Experimental |
| B2 · feet | `footMode` | feet turn in the hips (`turnout`, `hipInternal`); per-blade slip solve: snowplow, T-stop, spread eagle | Simulation, Experimental |
| C1/C2 · trunk | `torqueMode` | upper/lower body; wind-up twists the trunk; pivot grip from the rut (load- and edge-dependent since /34); momentum carried when unweighted; wind-up and free leg feed the takeoff | Simulation, Explorer, Experimental |
| free leg | `freeLegMode` | the unweighted leg as a third body (16.1% mass, Dempster/Winter) | Experimental |
| fore-aft pendulum | `pitchMode` | the body tips toward toe/heel over the support blade; the ankle's contact (half a blade) is its only authority; a sudden stop past it pitches the skater down (`FALL.Pitched`) — PR #27, switched on in PR #28 | Simulation, Experimental |
| speed→spin | `speedSpinMode` | the takeoff block as r × Δp — **measured, left OFF everywhere** (it opposes the curve except for the lutz) | none |

**Setups** (`game/setups.ts`): Simulation, Blade Explorer, **Experimental** (the operator's — keep it;
memory `four-setups-kept`), Full Repertoire (unchanged). Experimental: triggers are the legs (pump
= push, deeper and quicker stronger; load + release = jump), sticks are feet and blades (a bottom-to-top
thumb stroke pushes, by accuracy), X/B weight and arms, L3/R3 toe picks, A turn family / Y rotation
family with bumpers as the alteration, D-pad the feet, automatic back crossovers on the beat, the free
leg on the unweighted leg's trigger. Feet layouts (all setups with feet): D-pad nudges (default),
stick up/down, modifier + left stick — picked in `/game/controller.html`. Full docs:
`docs/controller-scheme.md`. Every authored constant: `docs/open-constants.md`.

**Tests that play skills from the pad or the solver** (read these to see what the physics can do):
`test/hockeystop.test.ts` (the hockey stop, bot-held square), `test/backjump.test.ts` (backward
double loop, landed by a timed check), `test/hook.test.ts`, `test/slip.test.ts`, `test/feet.test.ts`,
`test/torque.test.ts`, `test/freeleg.test.ts`, `test/speedspin.test.ts`, `test/two-blade.test.ts`,
and the Experimental block in `test/setups.test.ts`.

### 0.3 · The queue, next (operator's order where given)

1. **[operator] Play Experimental on the Xbox pad**, then export replays to `E_W_replays_sessions_eng_bld/`.
   Check: (a) the pump and thumb-stroke thresholds (60%/20%, 0.25 s, `SNAP_TICKS`) — every number in
   `docs/controller-scheme.md`'s Experimental table is authored; (b) **which stick direction reads as
   "knees in" on screen** — in the model's frame, sticks *apart* put both blades on their inside edges
   (the controlled snowplow), *together* on their outside edges (they catch); (c) both knees deep with
   shared weight crosses the jump load (0.7) — it will feel like pumping stalls.
2. **Elite Series 2 paddles** (plan, memory `controller-hardware-roadmap`): first add a raw-button
   readout to the workshop and have the operator press each paddle — the browser Gamepad API often does
   not expose them; Godot 4's SDL mapping has `JoyButton.PADDLE1–4`. Proposed: P2/P4 feet turn
   anticlockwise/clockwise (thumbs never leave the sticks mid-hockey-stop), P1/P3 free leg; trigger stops
   at full travel; profile switch = one setup per profile.
3. **Fore-aft pendulum** — the body has none: a snowplow with both edges caught stops dead upright.
4. **Arms' whip vs physics.** `jump.ts`'s whip (`jumpWhip` × carriage, ~38 of a ~40 takeoff L) is an
   injection that does not pass through the ice; everything built today does (the edge's grip × time
   is the real budget: wind-up +4, free leg +1.5). Deciding whether to rebalance is the operator's call.
5. **Tutorial** (memory `tutorial-balance-then-release`): balance → edges → scrape/dig → air.
6. **Combining the four setups into three** — when the operator asks; bring options built from their parts.
7. **SIXAXIS / motion for the console build** — later; research the engine's sensor support then.

### 0.4 · Key decisions (the operator's, this session)

- Every move through the blades; physics-caused behaviour is intended; buttons only ask.
- Simulation keeps parallel-blade feel with physics tricks; the engine must still give complete per-blade
  control (the feet) so every skill is performable.
- The scrape is a skill: edge-dependent, the grip curve encouraged, **tripping kept**.
- Setups: Simulation gets everything, Explorer parallel blades + slip + trunk, Repertoire unchanged,
  plus the operator's Experimental; all four stay.
- The dig feeds the jump; the trick is read off the takeoff (foot, direction, edge, pick).
- Crossovers automatic when skating backward on a deep enough curve; the bible's beat rule kept (off the
  beat is chopped to 45% — the automatic ones land on the beat).
- Speed-to-spin: built, measured, **left off** (it opposes the curve for every jump but the lutz).
- "YOU TOUCH WHAT YOU WANT TO" — edit what's needed; the **delete-nothing** rule still holds.

### 0.5 · Unresolved assumptions (authored or simplified — see `docs/open-constants.md`)

- `scrapeRefTilt` 0.6 rad (the edge that scrapes at μ_skid); `bladeLength` 0.28 m.
- Trunk: `lowerBodyInertia` 0.4, `twistMax` 0.8, `twistTorqueMax` 60, stiffness 600, damping 60.
- Contact: the rut's cross-section (0.18 × 4.16 mm at 77 kg, LEVER 2022) scaling with load at constant
  indentation pressure — the paper itself cautions (p. 340); a hockey blade, not a figure blade.
- Engagement smoothstep 0.3–0.8 g; the carve's turning is the legs' (not charged to the ice) — a
  momentum-true alternative could not carve at any contact depth up to 2 mm (measured).
- Free leg reach 0.4 m, arc 1.2 rad, hip PD 150/20/100 — only its mass (16.1%) is sourced.
- `turnout` 0.5 for the reference skater; `hipInternal` 0.6; `footTurnRate` 6.
- Experimental's gesture thresholds and the automatic crossover's 1.5 m/s floor.
- The pad's stick-x sign against the screen (see §0.3 item 1b).

### 0.6 · Git and the merge

`phase17-assurance` is pushed with a PR to `main`. Memory `keep-going-and-merging`: `gh pr merge` is
classifier-blocked for the agent — ask the operator to run it with `!`. Before merging a later branch,
`git fetch` and merge `origin/main` in: this session found the Phase 17 mapping script's two bugs only
because of that merge (the golden `test/fixtures/setup-mapping-v1.json` is re-recorded with
`node test/setup-script.ts --write` after an intended mapping change — say why in its header).

### 0.7 · Things that tripped this session (add to §5)

- **Measure before pinning.** Several "MEASURED" numbers were first guessed and failed; every pinned
  value now comes from a run. Probe with `--test-name-pattern` or a scratch copy of a test with its
  asserts turned into logs.
- **Scripted inputs lie.** Many "physics failures" were the test script: a stick deflection doubling as
  a wind-up, a weight left on one foot, an instant jump in an asked swing (a velocity step spikes a PD).
  Check the script before the physics.
- **Explicit damping on light coupled bodies overshoots** — the trunk is solved implicitly for that reason.
- **Every new param bumps the replay contract**: `node tools/ice-lab/replay/rebase-fixture.ts`, then the
  pins in `docs/controller-scheme.md` and `test/phase17-replay.test.ts`, then
  `node tools/ice-lab/validate.mjs --report docs/fidelity-report.md`, then `node test/setup-script.ts --write`
  if mappings moved. Godot: `node games/ice-run-godot/tools/prepare.mjs --engine-only` before its tests.


## Current checkpoint — 2026-09-21, sixteenth session: controls pushed, grade-4 gate, the choctaw

On `ue-replay-01-foundation`, pushed (`b1a42fd` controls, `e4fa7de` grade-4 gate, then the choctaw).
Not merged to `main`. Operator's asks: "keep building", "commit and start item 10", "push it and keep
going" — items 9, 11 and 12 need the operator, so the session went on to item 13.

- **Queue item 10 done** — see the queue.
- **Queue item 13, the choctaw, done.** Mohawk foot change with `flipFrame` skipped at the cusp: the
  kept tilt on the new foot is the opposite edge, travel reverses, the lobe reverses (RFI>LBO). Gesture
  = mohawk weight shift + rocker reversal (`turn` held through the cusp, stick against the entry
  curve); Full repertoire binds it to L3 + D-pad right / G, and a saved v1 controller profile without
  the new binding is upgraded, not discarded. `choctawScrub` 1.65 (−0.55 m/s at 6 m/s, data). Replay
  **`/21`** — the gesture was a mohawk under `/20`; fixture re-recorded, digests unchanged. Ten step
  types now; grade 4 needs one STEPS mechanic more. Full account: `tools/ice-lab/README.md`, "The
  choctaw, and grade 4's rotational gate".
- **The replay-bump recipe is a script now**: `node tools/ice-lab/replay/rebase-fixture.ts [rev]`.
- **Verified**: 483 tests (468 browser/sim + 15 Godot bridge), typecheck clean, fidelity report
  regenerated (solver line only), live Playwright run in Full repertoire showed CHOCTAW then BACKWARD
  GLIDE with no page errors, both Godot `--smoke-test` paths passed.
- **Godot costume parity (§0 item 12) done**: `build_skater.py` gives the skirt and the legs their own
  material slots (default colours unchanged; glb rebuilt with Blender 5.2.2, same nodes and vertex
  count), the bridge catalog carries `SKINS`, `skater.gd` recolours seven slots by material name, and
  Settings → Costume picks one (saved). Godot's default Violet now wears the browser's Violet colours
  rather than the old authored midnight plum. Not honoured: `bun` (hair is one joined mesh). Verified
  by `--capture --costume=0..2` screenshots and a smoke-test surface count (negative-checked).
- **PR #16** (items 8, 10, 13, Godot costumes) merged to `main` by the operator (`f56177e`).
- **Jump combinations, new, after the queue ran out of solo items**: `sim/combo.ts` recognises a jump
  taken straight off the last one's landing edge (data-defined: takeoff = `landing_edge`, link broken
  by fall/step-out/foot change/move/stroke/going forward; no time limit). Physics already allowed it —
  3T+2T, 3T+2Lo, three-jump chains. Browser toast, Godot `snapshot().combo` + HUD, a `combo` element
  for the Composer (fixed routines untouched, item 11). Scoring unchanged (per-jump already sums base
  values; no data for a combined GOE); jump sequences not recognised. Godot's saved-Composer check now
  also accepts `spiral` (it silently dropped it). Not yet seen live from real play: a scripted keyboard
  run could not land one (Cruise's pushes); tests and the Godot bridge drive it from real physics.
- **Protocol sheet, new**: `sim/sheet.ts` — career programs group jumps into elements (combinations as
  one), apply bible §2.7's repetition rule (`*`, zero), charge the data's fall deductions, and print
  TES + PCS − deductions = segment total on both result screens. Medals unchanged (fall-based), XP
  formula unchanged. PR #17 (combinations) was merged by the operator (`fb8b912`).
- **Considered and not done**: an eleventh step type would have to be invented (the toe pick does
  nothing outside a jump), and the native C++ track is pinned to `/5` against `/21` — re-pin or not is
  the operator's architecture call.
- **Still the operator's**: item 9 (real pad — now including the choctaw gesture), item 11 (career
  routine content), item 12 (watch a beginner).

## Previous checkpoint — 2026-09-21: Full repertoire controls and controller workshop

Implemented locally on `ue-replay-01-foundation`; not committed or published in this
session. The user's explicit next task was “full controller scheme and tuning rig.”
The previous 2026-09-18 checkpoint below describes the last merged work.

- **Queue item 8 is implemented.** Full repertoire is game scheme 3 (replay label D)
  in both browser and Godot. `game/full-controls.ts` holds the shared raw-input
  mapping, profile validation and per-turn input gestures. The blind lab A/B/C
  schemes are unchanged. No new solver move or scoring behavior was introduced.
- **Workshop:** `game/controller.html` / `controller-rig.ts`, served at
  `http://localhost:8123/game/controller.html`. Raw and mapped inputs, live skating
  and trace, forward/backward starts, virtual pad, sensitivity sliders, button
  remapping with conflict swaps, local save, profile import/export and replay export.
  Godot has a tuning/settings page and validates imported profiles through the same
  JS parser. The [controller guide](docs/controller-scheme.md) lists the full layout.
- **Entry-frame bug caught and fixed:** backward Loop could initially feed the
  reversal accumulator the wrong sign and become Rocker. Direct turn gestures now
  account for the physical curve on their very first input tick. Tests cover both
  travel directions. Modifier banks stay latched until the move button is released;
  holding Push through a fall cannot silently recover the skater.
- **Replay:** still `ice-lab-f64/20`; D is additional mapping metadata only. The
  fixture was not regenerated. Raw hardware, profiles and mapping state are outside
  the recorded solver inputs. Older builds reject D clips; current A/B/C clips
  still verify. Godot can replay D without supplying any live hardware.
- **Verification:** 474 browser/simulation and Godot bridge/host tests passed;
  TypeScript checking and browser/runtime builds passed. Real served-browser checks
  performed a virtual-pad Rocker, saved a profile, selected Full repertoire, and
  observed a keyboard Loop on the game HUD with no page errors. Godot's regular and
  `--smoke-test --full-controls` paths both completed a three-element career routine.
- **Queue item 10 done** (committed after item 8): grade 4's both-rotational-directions gate is
  checked now; see the queue. 479 tests pass (464 browser/sim + 15 Godot bridge); typecheck clean.
- **Still open:** human play on a real controller (queue item 9), tuning calibration,
  Choctaw and unsupported pose variants. Default lean sensitivity 0.7, modifier L3,
  retained-foot behavior and extra-move chord layout are authored design choices
  awaiting the user's hands-on feedback. Dedicated bindings use existing physics
  gestures; they do not guarantee entry or manufacture speed/edges.


## Previous checkpoint — 2026-09-18, fifteenth session: flow's lobes, HUD parity, and data-driven costumes — merged to `main`

**`main` is fully current as of this checkpoint** (PR #14, merged after this file's own three
commits below plus a documentation commit closing this entry — the operator's own explicit "commit
push merge" instruction, all three treated as one authorized sequence for this session). A future
session opening on `main` sees everything here; `ue-replay-01-foundation` is not ahead of it. This
session opened on the operator's own two-part ask: log a standing decision (Choctaw's own new-foot
edge-change mechanism is wanted, eventually, not hedged as "if" anymore — §0 item 0.5 below) and then
work the queue in order, starting from its own top item — "keep going, update the hud" and then "keep
going, and why not a wardrobe system..." each continued straight into the queue's next item with no
fresh round of clarifying questions needed.

**In order:**

0.5. **Logged, not built**: the operator confirmed wanting a new-foot edge-change mechanism
   (Choctaw's own blocker) — see §0 item 0.5 and queue item 13, both updated to say "confirmed,
   eventually" instead of "if the operator ever wants to." No code changed by this.
1. **Flow's "alternating lobes" / "repeated lobes in the same direction"** (design-bible.md §2.6),
   the queue's own top item and the last of flow's three bullets this file had called unmodelled since
   the twelfth session — one signal, not two, per every prior session's own note: a per-tick
   curvature-direction tracker (does the current curve's sign hold long enough to call it a lobe, and
   did the one before it match or oppose it).

   **The design that made it tractable**: `SkaterState.tiltCmd`'s own sign is already the signed
   curvature direction every tick (no new physics needed) — what was missing was purely the lobe
   *bookkeeping*. Three states, not two: `lobeDir` (the currently active lobe, ±1, or 0 during a
   sustained gap — a flat blade or a skid), and `lobeLastDir` (the most recently ENDED lobe's
   direction, kept across the gap on purpose). Without a third "currently in a gap" state, every
   established transition is, by construction, an alternation — there are only two signs, so a
   "repeat" can only exist by comparing against a direction that has been allowed to lapse and be
   remembered separately, not against whatever is currently active. `lobeCandDir`/`lobeCandT` debounce
   a fresh sign for a new `flowLobeMinHoldTime` (0.35 s, authored) before it can change either state.
   A flat `flowLobeAlternateGain`/`flowLobeRepeatLoss` (authored placeholders, no calibration data
   exists for either, the same honesty `musicBeatWindow`'s own comment holds itself to) applies once
   per established transition; the very first lobe of a session scores neither way.

   **The same signal reaches PCS's Composition score for the first time too** (`sim/pcs.ts`):
   `lobeVariety` — the share of a program's established transitions that alternated — joins
   `IceGrid.coverage()` as the second of Composition's four bible-named bullets. `SkaterState` gained
   `lobeAlternations`/`lobeRepeats`, cumulative like `flips`, read by `game/career.ts`'s `finalizePcs`
   the same baseline-and-delta way `musicCredit` already was.

   **A real test-authoring trap, found and worked around, not papered over**: holding a fresh lean from
   rest swings `tiltCmd`'s sign the WRONG way for the first ~0.25 s (a balance-loop transient) before
   settling — under `flowLobeMinHoldTime`, so it never falsely establishes on its own, but it makes
   naively constructing an "alternate vs. repeat" comparison test by driving real inputs from a
   standing start fragile: the transient briefly reads as a candidate direction that can confound a
   test authored without accounting for it. Worked around by seeding `lobeDir`/`lobeLastDir` directly
   in the two comparison tests (isolating the classification logic from the transient) while a separate
   test still exercises the real, undisturbed physical path end to end.

   Replay contract bumped **`ice-lab-f64/19` → `/20`** — three new `Params` levers, six new
   `SkaterState` fields, checked the same direct way `/15`'s dead-air bump was (the committed fixture
   has `flowMode` 0, so §14 never executes for it; the regenerated fixture's own frame count, every
   `scheme`, and every `input` matched the previous commit's exactly, confirming identical kinematics
   — only `solver` and `initial.params`'s key set differ, which is what the recipe's own diff step
   checks, not raw digest equality, which does change and is expected to, once new fields exist for the
   digest's own JSON serialization to hash).

   **Verified live, not only in tests**: built and served the actual browser game
   (`node app/build.mjs && node app/serve.mjs`), drove it headlessly with Playwright (holding `d` to
   carve), and watched the HUD's own `EDGE` readout climb to 100 with zero console errors — the same
   discipline the fourteenth session's own review named as having paid off twice, kept up a third time.
   `docs/fidelity-report.md` regenerated (solver string only; gate unchanged: 6 pass, 0 fail, 26
   unsourced, 0 unmodelled, still not met). The Godot bridge (`games/ice-run-godot/`) needed no source
   change — it imports the runtime mirror `tools/prepare.mjs` regenerates from this same tree — but was
   still rebuilt and its own 10-test suite re-run to confirm. `e6edfbd`.
2. **HUD parity between Godot and the browser** (queue item 6). Checked what the browser's own
   free-skate HUD already showed and what the Godot bridge's `snapshot()` actually exposed, rather
   than trusting the fourteenth session's own checkpoint note that named the gap — one of the three it
   named turned out to already be closed:

   - **Turn kind — a real gap, fixed.** The browser has always broken a held turn down by `TURN_KIND`
     (three-turn, mohawk, bracket, loop, rocker, counter); the bridge's `snapshot().move` said the bare
     `'Turn'` for all six, because `scripts/main.gd`'s `hud_move` reads `frame.move` as a plain string
     generically. Fixed at the source — `engine.mjs`'s `snapshot()` now runs the same ternary the
     browser's HUD does — so the GDScript needed no change at all, the exact "fix it where the reader
     is already generic" pattern the thirteenth session used for `spinLevel`.
   - **The foot change mid-spin — a real gap, fixed.** `SpinState.changeCompletedTick` had never been
     read by any UI code in either engine. Both now flash a toast ("Foot change!" / `footChange` in the
     snapshot) the tick it advances, the same decaying-flash idiom each engine's own toast already uses
     (`flash` in `game/main.ts`, the new `footChangeFlash` mirroring it in `engine.mjs`).
   - **PCS's score — a real gap, fixed.** Wired into `game/career.ts` since the fourteenth session but
     never displayed anywhere. Both engines now show the total (the browser also breaks out all three
     components) when a routine finishes, silently absent rather than a misleading "0.00" whenever
     `finalizePcs` left it null.
   - **The Spiral — NOT a real gap, the fourteenth session's own checkpoint note was already stale by
     the time it was written.** Both `game/main.ts` and `engine.mjs` already label `MOVE.Spiral` —
     added in the very same commit that built the Spiral itself (`1374333`), confirmed by `git log -S`
     before touching anything. Worth remembering: a hand-off's own claims are a snapshot, not a
     standing fact, and are worth checking against the actual code before building on them — the same
     lesson the fourteenth session's own rocker/counter re-examination already drew, now cutting the
     other way (finding a claimed gap was already closed, not that a claimed wall was not one).

   **Two more stale README passages fixed on the way**, found the same way: the spin-level section
   still listed the foot-change features as needing "a mechanic this rig does not have" (built two
   sessions ago) and the PCS section still said "not yet wired into `game/career.ts`" (also already
   done). Neither was touched by this session's own code changes — both were just never updated when
   the work that made them stale actually shipped.

   **Verified live, not only in tests**: three new `games/ice-run-godot/tests/engine.test.mjs` cases
   (12 Godot bridge tests, up from 10) — turn-kind labels checked by direct state (isolating the label
   map from turn-entry physics `tools/ice-lab/test/turn.test.ts` already covers), a real driven foot
   change reaching `snapshot().footChange` as a flash that decays, and a finished career routine's
   `snapshot().routine.pcsScore`/`result.detail` both carrying a real total. The browser side verified
   in the actual running game: built and served it, drove it headlessly with Playwright (hold `d` to
   carve, `q`+`y` to spin at zero weight, hold `f` mid-spin for the change — the exact recipe
   `test/spin.test.ts`'s own `change_foot_by_jump` case uses), and watched `#hint` read "Foot change!"
   then decay to the next toast, zero console errors both times. `5c6cc5d`.
3. **Costumes** (queue item 7), on the operator's own explicit follow-up ask: *"why not a wardrobe
   system. i dont want the players to have to design thier own costumes, but make sure theres plent
   of space for new costume updates in the future."* Checked the actual code before answering rather
   than repeating the queue's own framing (a scoring deduction, "not a wardrobe/customization
   system") — that framing was already wrong: `game/appearance.ts`'s `SKINS` array, a browser
   wardrobe dialog, and a persisted picker (`localStorage`) all already existed, preset-only,
   matching exactly what the operator said they wanted. The real gap, found by reading
   `game/index.html`: the picker's two buttons were hand-authored HTML with a hand-drawn SVG preview
   each, so `main.ts`'s own generic `SKINS` loop would crash on `el()`'s non-null assertion the
   moment a third entry existed with no matching button — "plenty of space" was not actually true.

   **Fixed at the actual gap**: `appearance.ts`'s new `skinPreviewSvg(skin)` builds the preview bust
   from a `Skin`'s own ten colour fields and its `bun` flag (the only field that changes the drawn
   silhouette, a ponytail path vs. a bun-and-pin one) — nothing else about a costume affects the
   preview or the in-game figure, both already read every field generically. `game/main.ts` now
   builds all three wardrobe buttons at load from `SKINS` alone; `index.html` keeps an empty
   container. **Solstice**, an amber-and-garnet third costume, is the proof this actually works — one
   `SKINS` entry, zero other files touched to make it appear correctly in both the picker and on ice.

   **A real bug found while writing the generator**: the two hand-drawn previews it replaces both
   hard-coded Violet's own hair hex for the head-hair path — Aurora's own markup included, alongside
   its own correct hair colour everywhere else — because nothing had ever generated the second
   preview from its own data to catch the copy-paste. Now structurally impossible: `skinPreviewSvg`
   reads `skin.hair` in both places, for every skin.

   **Deliberately not attempted, and said so rather than faked**: Godot costume parity (the skater
   there is a rigged, baked-material Blender export with no per-costume colour hook — real, separate
   work, either authored material variants or a runtime shader override) and any connection to
   `data/calls-and-deductions.csv`'s "Costume or prop" deduction (a judged rule-violation category
   with no trigger condition any data file here defines — not a description of this preset system at
   all, and inventing one would be authoring a competition rule, not wiring an existing one).

   **Verified**: a new `test/appearance.test.ts` (6 tests, pure — no DOM), including a direct
   regression test for the hair-colour bug just found. 458 Ice Lab tests total (up from 452), `tsc`
   clean. Live in the actual browser game: built, served, opened the wardrobe with Playwright,
   confirmed all three costumes render distinct generated previews, selected Solstice, confirmed it
   persisted to `localStorage` — zero console errors. `d1798d5`.

**All five commits pushed, then merged: PR #14** (`ice-lab: flow's lobes, Godot/browser HUD parity,
and data-driven costumes`) **opened and merged into `main`**, on the operator's own explicit
instruction ("commit push merge"). Note for next time: **PR #13 (fourteenth session's own work) had
already been merged by the operator between sessions**, found only when this session went to act on
"merge" — the version of this file this session opened on still said PR #13 was open, which was
already stale by then. `ue-replay-01-foundation` had no open PR of its own when this session's first
commit landed on it; PR #14 covers only this session's five commits, opened after item 1's own commit
and kept open (CI polled to green, four checks) until this final entry was ready, then merged whole.

---

## Previous checkpoint — 2026-09-18, fourteenth session: PCS wired live, a real foot change, the Spiral, and the loop/rocker/counter turns

Still on **`ue-replay-01-foundation`**, four commits, each tested and verified live before the next
began — the browser Ice Lab, Godot, native reference, or all three, every time; see each item. This
session opened on the operator's own explicit ordered list — PCS, then the foot-change mechanic, then
"reverse one footed leg extended," then three more step/turn types — and closed having built every item
on it, plus a real fix to a documented, previously-abandoned gap the operator asked to have re-attempted
anyway.

**In order:**

1. **PCS wired into career play**, closing the queue's oldest item (§0, thirteenth session).
   `game/career.ts`'s `CareerEvent` gained a `discipline`/`segment` key (`data/segment-rules.csv`'s own
   two axes) — an authored content decision, "women" throughout (no discipline switch exists in this
   rig) and "short" for every event but the closing `finale`, which reads as this ladder's own "free"
   given its longer duration and fuller element count. `Choreography` runs its own `SessionMeter`/
   `PcsMeter` across a routine and scores once at the end (`sim/pcs.ts`'s own post-hoc contract),
   feeding a new `PCS_XP_PER_POINT` bonus alongside the existing technical/spin/step ones.
   `app/build.mjs`'s hand-curated data-file copy list gained `segment-rules.csv` — the exact 404 class
   the thirteenth session's own `step-features.json` bug was, caught this time by the existing
   regression test before it ever shipped. `7f1d5ce`.
2. **A real foot change mid-spin** (`sim/moves.ts`'s `spinTick`): a fresh toe press (`input.toe`,
   otherwise unused during a spin) starts a brief airborne transfer to the other foot — angular
   momentum conserved but for one transfer cost paid once, blade unloaded, `SpinState.foot` toggled on
   landing. Unlocks the three `spinLevel.ts` features the thirteenth session's own §0 named as needing
   "a combination spin with a foot change mid-element": `change_foot_by_jump`,
   `difficult_change_of_foot`, `all_three_positions_second_foot`. `spinLevel`'s honest ceiling reaches
   the ISU's own level-4 clamp (six of ten features now scored, capped at four regardless).
   `SpinLevelTracker` splits a segment on a foot change too, not only position/direction. `7f1d5ce`.
3. **The Spiral** (`data/motion-primitives.json`'s own "spiral" — declared since the repo's first
   commit, never built): one blade down, the free leg extended, any direction. Reached through the
   *same button* as the Ina Bauer (`solver.ts`'s `HELD.InaBauer`) — the free foot's own load already
   goes to zero through the ordinary carve's `[1 - weightR, weightR]` split the moment a skater stands
   on one blade, so weight shared near evenly still reaches the two-footed Ina Bauer and weight clearly
   committed to one foot reaches the Spiral instead. No new input field. Answers the operator's own ask
   for a backward/reverse spiral for free — the data never restricted direction the way the Ina Bauer's
   own entry does. **Found and fixed a real conflict on the way**: a gamepad's LB+RB alone each commit
   weight to one foot, but held *together* they are also the shared trigger button, so the instant both
   are down `weightR` collapsed to 0.5 before the Spiral/Ina-Bauer branch ever read it — a controller
   could never reach a Spiral at all. `app/pad.ts` now remembers the weight from the tick before the
   combo engages. `1374333`.
4. **Three more step/turn types — the operator's own explicit ask, all three built.** Loop
   (`TURN_KIND.Loop`, `e78be47`): hold `turn` through the ordinary cusp instead of releasing — the same
   pivot run to a second cusp instead of one, landing back on the entry edge and foot. Rocker and
   Counter (`7075485`) are the real finding: `sim/types.ts`'s own prior comment called them "a third,
   different mechanic... not built either," and that was wrong. `travelSense` does not track rotation
   swept; `endPivot` builds the exit frame from current velocity, signed, so its only job is "does the
   exit face WITH the skater's own continuing momentum or AGAINST it." A rocker/counter needed one more
   case: `flipFrame` still runs exactly once (the edge character changes, same as a three-turn's own
   flip), but `travelSense` stays pinned to `entryDir` regardless of cusp parity, because the whole
   point is that the exit still faces the way the momentum was already going. One more special case in
   one function, not a new mechanic — re-examined only because the operator asked to have it attempted
   anyway despite the documented prior write-off; see the review below.
   **All five ISU "difficult" turn types are now real** (bracket, twizzle, loop, rocker, counter).
   `sim/stepLevel.ts`'s honest ceiling moves from grade 1 to **grade 3** — nine distinct types, five
   difficult, clears `VARIETY_LADDER`'s own grade-3 bar exactly, given a routine that actually spreads
   its difficult turns across both feet.

**Two real bugs found only by testing live, not by reasoning about the physics:**

- `rockerCounterStick`, copied at `spinReverseStick`'s own value (0.6), was **unreachable by keyboard
  in the real game** — `game/controls.ts` scales digital lean by 0.35 for every scheme but B, and
  scheme B's own assisted-steering lean is a computed command, not a raw passthrough. Found only by
  driving the actual browser build with Playwright and getting `LOOP` every time a `ROCKER` was
  expected. Lowered to 0.2, comfortably under the 0.35 floor, and `TurnState` gained `reverseHeld`, a
  running max of the reversal push sampled every tick from entry to the cusp rather than a single-tick
  read — a real stick will not reliably peak on the exact tick the cusp happens to land on.
- The reversal check's own sign was wrong for a `bracket`-entered pivot specifically: it compared the
  stick against `T.dir` directly, but `against` already inverts `T.dir` from the physical curve once,
  at entry — so a bracket's own *unchanged* entry stick always read as "reversing," which a test caught
  the instant the threshold was lowered enough to expose it (a bracket held with no reversal at all
  started coming out `Counter`). Fixed with a `curveSense` (`T.against ? -T.dir : T.dir`) that undoes
  the inversion before comparing, so "push the other way" means the same thing whether the pivot
  started from `turn` or `bracket`.

**Deliberately not built, and why:** the ISU's six STEPS-category types (chassé, toe step, cross roll,
running step, cross behind/in front) have **zero entries anywhere in `data/motion-primitives.json`** —
building them would mean inventing physics from nothing, unlike everything above, which all had real
declared data behind it. Kerrigan/inverted spiral variants, likewise: no data entry distinguishes them
from the plain spiral, and this rig has no pose data to tell them apart physically. Choctaw remains the
one genuinely unbuilt "difficult"-adjacent gap — a real edge-character change on a *new* foot, which
still needs the mechanism `sim/types.ts`'s own comment describes, not the rocker/counter fix (a
different axis entirely: rocker/counter change nothing about which foot lands the exit).

**Verified at every step in the actual running app** — browser (Playwright, driving real keyboard
input against the served build, not synthetic `step()` calls, for every mechanic above), Godot (bridge
test suite, runtime regenerated from the current tree each time), native reference oracle — never only
in the unit tests, though those too: 441 Ice Lab tests (up from 408), 10 Godot bridge tests, 6 native
reference tests, `tsc` clean throughout. Replay contract bumped `ice-lab-f64/15` → **`/19`** across the
session (new `SkaterState`/`TurnState`/`Params` fields each time); every bump's fixture was regenerated
from its own recorded inputs and confirmed identical in frame count, schemes and inputs — `movesMode 0`
throughout the fixture, so a pivot never actually runs there regardless.

**A second real, meaningful gate-report change**: the two `data/validation/` stub cases
(`rocker-turn-unmodelled`, `counter-unmodelled`) now correctly read **unsourced** instead of
**unmodelled** — the solver models both; no external footage has been cited for either yet, the same
honest gap 24 other cases already carried before today. `validate.mjs`'s `FEATURES` set and
`data/validation/README.md` updated together, and a stale "bracket" example in that same README
paragraph (bracket has been a real feature for a while) fixed on the way. Gate result itself unchanged:
6 pass, 0 fail, 26 unsourced (up from 24), **0 unmodelled** (down from 2), still not met.

**Committed and pushed** (`7f1d5ce`, `1374333`, `e78be47`, `7075485`), **PR #13 opened**
(`ice-lab: PCS, foot-change spins, the Spiral, and the loop/rocker/counter turns`) against `main`,
matching PR #7–#12's own pattern. **Not yet merged** — `gh pr merge` was blocked by the session's own
auto-mode permission classifier as a genuinely high-stakes action on a shared repo's default branch.
**The operator needs to merge PR #13 themselves** (`gh pr merge 13 --merge`, or the GitHub UI) before
`main` reflects this session's own work — a future session opening on `main` rather than
`ue-replay-01-foundation` will not see any of it until that happens.

The operator's root play-data folder, the saved HTML page, and `session-notes/` remain untracked on
purpose — left alone, per the note further down.

---

**Last session: 2026-09-17, thirteenth session — a designed curve for the Slalom, a second Godot skater, spinLevel to 3, PCS, and step sequences.**

Still on **`ue-replay-01-foundation`**, seven commits, each tested and verified live before the next
began — the browser Ice Lab, Godot, or both, every time; see each item. This session opened on
"keep cooking" with no stated priority (see the review below) and closed having cleared the queue's
oldest item, the operator's own explicit two-part ask, and two smaller loose ends the queue had
flagged.

**In order:**

1. **The oldest open thread in this file, closed.** The tenth session's queue asked for "a designed
   curve for a real course" beyond the Figure Eight; the Slalom (`app/edges.ts`) had a guide line
   (`guideY`) but scored only discrete gate pass/fail. It now also scores RMS deviation from that same
   line — a live "off the line" readout, `accuracy` folded into the score — the exact pattern
   `figure8.ts`'s own `deviation()` already proved. Paired with it: `app/draw.ts`'s point-trace was
   capped at ~4,000 points (~30 s); `sim/ice.ts`'s `IceGrid` now also backs a second, uncapped picture
   — a canvas painted incrementally from `condition()` at each blade's own contact cell, one pixel per
   grid cell, gated on `iceGridMode` so tuning work with it off is unaffected. New Ice panel group in
   the Lab turns it on; `IceGrid` gained `cellAt()` and `coverage()` (the latter used again in item 6).
   `ef91292`.
2. **The Black Berserker**, on the operator's own ask ("any way we can use this on our character?"),
   asked which of three integration depths and told to add it as a second, selectable character. Built
   on `build_skater.py`'s *exact* armature — not the operator's own draft script's bone names or its
   rigid bone-parenting — because `scripts/skater.gd` poses eleven bones by exact string match; a
   mismatched rig would simply stand inert, never error. `scripts/main.gd` gained a Settings → Skater
   picker; `.gitignore`'s allowlist extended. Verified: a standalone Blender render, a clean Godot
   import, and a full career routine completed headless with the Berserker selected. `a55e8f4`.
3. **The Godot HUD had no surface for a spin's level at all** (flagged by the twelfth session's own
   §0) — `bridge/engine.mjs` now tracks it live the same way `game/main.ts`'s own free-skate HUD
   already does (`SpinLevelTracker`, scored the moment a spin ends), exposed as `spinLevel` in the
   snapshot; `scripts/main.gd` shows it beside the jump TES total `engine.mjs` already computed but
   never displayed either. Verified with a real driven spin through `engine.tick()` directly. `0cb796e`.
4. **Mid-spin direction reversal** — `data/spin-features.json`'s own note on `both_directions`:
   *"killing all angular momentum and regenerating it in the opposite sense... the simulation gets this
   almost for free: the sign of L flips."* `sim/moves.ts`'s `spinTick` does close to exactly that: held
   lean opposite `Sp.dir`, past a stick threshold, checks the spin; near zero, it flips and
   regenerates. **The one real bug, found by measurement, not assumed away**: the ordinary "too slow,
   check out" exit fired *during* the deliberate near-zero dip a check is, ending the spin instead of
   reversing it — held off for exactly as long as an active check is in progress. `spinLevel`'s honest
   ceiling moves from 2 to **3** of 10. Replay `/14` — the first bump not guarded by a brand-new Mode
   flag at 0 (it lives under `movesMode`, already 1 in live play), so fixture safety was checked
   directly against the committed clip rather than assumed. Verified live in the browser: the HUD's
   direction arrow visibly flips mid-spin. `832e62a`.
5. **Flow's "dead air between elements"** — one of the bible's three bullets this file has called
   unmodelled since the twelfth session; the clearest-defined of the three (the other two, "alternating
   lobes" and "repeated lobes in the same direction", are one signal with no per-tick curvature tracker
   and no calibration basis — still open, see the queue). Once an element has finished once, a grace
   period past it with nothing new under way costs flow. Replay `/15`, checked the same direct way as
   item 4. `6c574c5`.
6. **Program Component Score** (`sim/pcs.ts`) — TES has existed since the jump work; this is the PCS
   half. The formula and the component factor are transcribed (`data/segment-rules.csv`, unread by
   anything until now, matches `ScoreCalculator.cs`'s own inline comment exactly). **The mapping from
   physics to a 0..10 score is not transcribed, and the file's own header says so in those words** — no
   data file gives PCS the ISU-precise thresholds `spin-features.json` gives a spin. `IceGrid` gained
   `coverage()` for Composition's own "ice-coverage map" bullet. Standalone and tested, the same stage
   `sim/spinLevel.ts` was in before this session — **not yet wired into `game/career.ts` or either live
   game.** `9b895d3`.
7. **Step sequences**, the operator's own explicit second half of one message: *"lets program the
   [components] score and then build the step sequence mechanic... execute the choreographed routines
   that will hopefully sync with the music engine."* `sim/stepLevel.ts` scores
   `data/step-features.json`'s variety ladder; a new `step` element in `game/career.ts`'s `ELEMENTS`
   makes it real and Composer-authorable, picked up generically by both `bridge/engine.mjs` and
   `scripts/main.gd` (one hardcoded whitelist in the latter's own preference loader was the exception,
   fixed alongside). Music sync is inherited for free from the existing beat-grid credit on turns — no
   new mechanic needed for that half of the ask. **This rig's own honest ceiling is grade 1 of 4,
   exactly**: six observable footwork types (bracket, twizzle "difficult"; three-turn, mohawk "simple";
   change-of-edge; crossover, not in the ISU's own taxonomy but counted as a seventh rig-specific type)
   against a ladder whose grade 2 needs seven, full stop. **Found and fixed a real production bug on
   the way**: `data/step-features.json` was fetched by `game/main.ts` but never in `app/build.mjs`'s
   data-file copy list, so the actual served build 404'd on it, invisible to every test that imports
   the module rather than fetching it — caught with Playwright against the real served build, not a
   unit test, and now guarded by a new regression test in `test/app-loads.test.ts`. `f82c400`.

**Not wired in, on purpose:** "step" is Composer-authorable in Godot but not in any of the five fixed
`CAREER_EVENTS` routines — a content decision about an existing difficulty progression, left for the
operator. PCS is not called from anywhere in play yet.

**Verified at every step in the actual running app** — browser (Playwright, the Ice Lab and the game
both), Godot (a headless `--smoke-test` after every physics-affecting change, plus one standalone
Blender render) — never only in tests. 408 Ice Lab tests (up from 374), 10 Godot bridge tests, `tsc`
clean throughout. Replay contract `ice-lab-f64/15`.

**One real miss, caught only by CI, not before pushing PR #12:** `docs/fidelity-report.md`'s own header
names the solver string verbatim (`Solver \`ice-lab-f64/13\``), and CI regenerates the report on every
push and fails if it differs — this session's own reasoning ("nothing touches the fidelity gate's own
solver *corpus*, so the report is untouched") checked the right thing for the gate's PASS/FAIL result
and the wrong thing for the report's own text. Fixed by actually running
`node tools/ice-lab/validate.mjs --report docs/fidelity-report.md` (§5 item 33 says so for next time) —
a one-line diff, gate result unchanged (6 pass, 0 fail, 24 unsourced, 2 unmodelled, still not met).
`fc19e47`.

The operator's root play-data folder, the saved HTML page, and `session-notes/` remain untracked on
purpose — left alone, per the note further down.

---

**Last session: 2026-09-17, twelfth session — the whole 2026-09-14 queue closed, plus three loops back.**

Still on **`ue-replay-01-foundation`**, seven commits today, each verified and merged to `main`
individually (PRs #7–#10, all green). This is the session that finally cleared **every item** the
tenth session's queue (below, now historical) left open — the carve question, the career module, the
stat-balance link, the stamina pools — and then kept finding the same shape of gap twice more after
that.

**In order:**

1. **The carve question, asked first, as the old §0 said to.** The operator chose **a designed curve**
   over a replay ghost. `sim/ice.ts`: a 12 cm damage/snow grid, read back into friction (`muLong`,
   `biteCapacity`) and deposited by every blade pass, 0 in every preset (`iceGridMode`). Passed into
   `step()` as an explicit optional argument — never a hidden global — the same way `SkaterState`
   itself is. Replay `/10`. `0bb3a53`.
2. **The career module already existed** (`game/career.ts`, built 2026-09-15 and not yet visible in
   this file's own queue below — the tenth session's queue was already one session stale when this one
   opened). What was missing was the operator's chosen link: **stat balance tied to the competitive
   scoring**. `CareerState` now tracks `medalCap` (the old sequential unlock) and `statCap` (the
   highest of `profile.ts`'s `TIERS` `overall()` clears) separately; `unlocked` is the lower of the
   two — a clean program can no longer outrun the training behind it.
3. **Stamina** (bible §2.8): `Wind`/`Legs`, draining from time/speed/pushes/jumps/sit-spins/deep edges,
   recovering slowly (`Legs` gated by `Wind`). Feeds jump height, pull-in tightness, edge depth, and a
   new deterministic balance-loop noise term. `staminaLegsPerPush` is the one number that survives from
   `src/reference/SkateSolver.cpp`'s otherwise-undefined `UpdateStamina`/`StaminaGain`. Replay `/11`.
   `68f6088`.
4. **Hype** — the operator's own bridge, quoted below at the tenth session's own entry, finally built:
   builds from clean landing streaks, reads `musicMode`'s accent credit as an input, feeds back into
   control assist on top of stamina's own fatigue blend. **Found a real, silent, pre-existing bug
   while wiring it**: a landing resolves inside `jumpAir`, on `step()`'s early-return path, which had
   *always* skipped music credit for a landing — only a turn's cusp ever reached it, since nothing had
   ever driven a jump with `musicMode` on and checked `musicCredit` itself. Fixed by factoring the
   event scan into a shared `landingAndTurnCredit`, called from both places. Replay `/12`. `8686590`.
5. **Flow** (bible §2.6), the last of the three the operator's own brief named. Only the
   physics-observable half of the bible's rises/falls table is modelled — no pose data, and a spin's
   blade tilt *is* its rotation direction here, so `change_of_edge` would double-count `both_directions`.
   Feeds Wind's own drain rate. Replay `/13`. `4635e92`.
6. **Wired all four into the actual game.** Discovery: none of the above had ever been turned on for a
   real player — `GAME_PARAMS` never set any of their `Mode` flags. Turned them on, gave `game/main.ts`
   a real `IceGrid`, added HUD readouts (`Wind NN% · Legs NN%`, `Hype NN%`, and an **EDGE** bar — *not*
   called "flow" on purpose, see below). **Found the same shape of bug as item 4, in a different
   place**: `ReplayPlayer` never owned an ice grid either, so a live session recorded with one would
   silently diverge on replay — and `games/ice-run-godot/bridge/engine.mjs`, a hand-maintained mirror
   of the same host logic, had the identical bug twice over (its live engine, and its own test's
   reference solver call). All three fixed the same way: give the reference path its own grid. `a9ecac4`.
7. **Two more rounds of the exact same gap, found by asking "what else is computed and shown but never
   scored."** Hype/flow reached career XP (averaged over a routine, bonus gated the same anti-farming
   way the medal XP already was). Then **a spin's ISU level, for the first time** (`sim/spinLevel.ts`):
   went through all ten features in `docs/level-features.md` and found eight genuinely out of reach —
   three need pose/joint data this reduced-order rig does not have, five need a combination-spin or
   direction-reversal mechanic it does not have either — documented feature by feature in the file's
   own header rather than faked. The remaining two score from `data/spin-features.json`, never
   hardcoded, capping honestly at level 2. Then the real jump TES and that spin level *also* reached
   career scoring, the same gap closed a third time. `c0ce9e8`, `fbb7eee`.

**The EDGE-vs-FLOW naming collision, caught before it shipped**: `game/index.html` already had an
unrelated `FLOW` bar (`playground.flow`, a free-skate speed/style meter, nothing to do with bible
§2.6). The new scalar reads as **EDGE** in the HUD instead, its own colour, beside the original.

**Verified at every step in the actual browser, not only in tests**: built, served
(`node app/build.mjs && node app/serve.mjs`), and driven headlessly with **Playwright**, found already
installed (with its Chromium binary) under a *different* local project's `node_modules`
(`/home/kill/astro-aae/frontend/node_modules/playwright`) — a much better tool for this than the raw
CDP scripting the tenth session's toolchain notes describe; see the updated notes below. Pushing to
speed and holding a carve took EDGE from 0 to 97%; a held spin, arms pulled in mid-hold, scored a real
level 2; career mode opened and played with no console errors. No `puppeteer`/`playwright` is a
project dependency — it was borrowed, read-only, from a sibling checkout each time.

374 Ice Lab tests (up from 322), 8 Godot bridge tests, `tsc` clean, `docs/fidelity-report.md`
byte-identical throughout (the gate's own configuration never touches any of the new `Mode` flags).

The operator's root play-data folder, the saved HTML page, and `session-notes/` remain untracked on
purpose — left alone, per the note further down.

---

**Last session: 2026-09-15, origin/main merged into `ue-replay-01-foundation`.**

Still on **`ue-replay-01-foundation`**. This closes the branch-divergence reconciliation
`## 0 · Start here` below had flagged as open for three sessions running (its old item 1,
now marked resolved). The operator asked to find the latest interrupted session — a merge
of `origin/main` into this branch, conflicts already hand-resolved in the working tree but
nothing staged, committed, or pushed — and finish it.

- All 13 conflicted files (`.github/workflows/ice-lab-checks.yml`, `README.md`,
  `tools/ice-lab/README.md`, `app/pad.ts`, `app/schemes.ts`, `sim/params.ts`, `sim/replay.ts`,
  `sim/solver.ts`, `sim/types.ts`, `test/fixtures/replay-v1.json`, `test/padview.test.ts`,
  `test/rink.test.ts`, `test/schemes.test.ts`) had already been resolved with no leftover
  conflict markers — verified rather than trusted, file by file.
- The `test/rink.test.ts` naming collision is resolved as prescribed: this branch's
  game-boundary test kept the name; main's ice-surface-curvature test moved to
  `test/rink-relief.test.ts`. Both suites pass.
- `REPLAY_SOLVER` renumbered to **`ice-lab-f64/9`** (this branch's music/bracket and main's
  rink-relief/wind-up had each independently reached `/8`); `test/fixtures/replay-v1.json`
  regenerated for the union.
- The **U**-key collision (this branch's low pose/cantilever vs. main's jump wind-up) is
  resolved: **U** stays low pose; wind-up now arms on comma; a low pose disarms wind-up
  (`game/controls.ts`, `game/main.ts`).
- `docs/fidelity-report.md` regenerated against the merged solver so CI's byte-identical
  check passes; the bracket case moves from unmodelled to unsourced now that the turn
  exists on this branch.
- Found and fixed one real bug on the way, unrelated to the merge itself: `test/game-effects.test.ts`
  had `assert.equal(effects.landing, null)` — `assert.strict`'s `strictEqual<T>(actual, expected):
  asserts actual is T` — pinning the mutable `landing` property to `null` clear across a later
  method call, a `tsc` failure (`test/game-effects.test.ts(44,64)` etc., "Property does not exist
  on type 'never'"). Fixed by asserting the boolean (`effects.landing === null`) instead of the
  property directly.
- Verified clean before committing: 322 Ice Lab tests, 8 Godot bridge/host tests, `tsc --noEmit`,
  `app/build.mjs`, `replay/verify.ts` (240 ticks), and `validate.mjs` — fidelity gate still **not
  met**, deliberately: no case in the corpus is externally sourced yet, only the derived ones pass.
- Committed as `32f6d3c` and pushed to `origin/ue-replay-01-foundation`.

The operator's root play-data folder, the saved HTML page, and `session-notes/` remain
untracked on purpose — left alone, per the note below.

---

**Last session: 2026-09-15 (career/Godot resume), on `ue-replay-01-foundation`.** Recovered another
interrupted session's career and Godot work, on the operator's ask to continue and commit/push it:
browser Ice Run gained five career events, ordered choreography, medals, unlocks, XP training and
local saves (`game/career.ts`); `games/ice-run-godot/` became a playable Godot project whose Node
pipe host runs the unchanged Ice Lab simulation and renders a rigged Blender skater, rink/traces,
cameras, music, career and a simple ordered Composer editor — **not yet a native GDScript/C++
physics port**. 296 Ice Lab tests and 8 Godot bridge/host tests passed; both the editor runtime and
the Linux export completed a full career routine, and a rendered capture caught washed-out lighting
that was corrected. Explicitly did not touch `main` or attempt the branch-divergence merge below —
that fell to the next session, above.

---

**Before that: 2026-09-14 (tenth), on `ue-replay-01-foundation`, three commits. Repo state: everything
the ninth session left, plus a standalone game (Free Skate, a guided Rookie course, a 90-second light
run) on the same solver; a rhythm layer (beat-timed crossover pushes, musical credit) with five of the
operator's own tracks actually playing; a new turn, the bracket; a skirt and a ponytail on the skater;
and a rink boundary the skater bounces off of or crashes into. `main` has moved separately and further,
on a different feature set — see item 1 below before assuming a merge is simple.**

Read this before touching anything. It covers what exists, what is decided, the conventions that
hold the document set together, and the things most likely to trip you up.

> **This line changed.** Until 2026-09-08 this file said *"zero implementation."* That is no longer
> true: `tools/ice-lab/` is real, runs, and has 249 passing tests, including replay capture and a
> verifier that replays a clip recorded in one JavaScript engine in another.

## 0 · Start here (written at the close of 2026-09-18, fifteenth session)

### First, before anything else

1. **`main` is current.** PR #13 (fourteenth session) and PR #14 (fifteenth) are both merged; `main`
   and `ue-replay-01-foundation` point at the same commit as of this checkpoint. A session opening
   fresh can start on `main` directly — there is no reason left to prefer the feature branch, though
   nothing stops a future session from branching again the same way if it wants its own PR. **Do not
   assume this stays true without checking** (`git log --oneline origin/main -1` vs. this file's own
   top commit hash) — this exact assumption (that a named PR was still open) was wrong at the start of
   this session, see the fifteenth session's own §8 review for what that cost.
2. **`sim/spinLevel.ts` scores 6 of the 10 ISU spin features, not 3.** The foot-change family
   (`change_foot_by_jump`, `difficult_change_of_foot`, `all_three_positions_second_foot`) is real now.
   Honest ceiling is the ISU's own level-4 clamp — `jump_within_spin` (needs the jump and spin systems
   to compose, which they still do not) and the three **declared** features needing pose data this rig
   does not have are the only ones left, and stay left unless a session is explicitly about pose
   fidelity or jump/spin composition.
3. **`sim/stepLevel.ts` scores grade 3 of the step-sequence ladder's 4, not grade 1.** Nine distinct
   types, five of them difficult (all five ISU "difficult" turns are real now: bracket, twizzle, loop,
   rocker, counter). Grade 4 needs 11 types — the STEPS category (chassé, toe step, cross roll, running
   step, cross behind/in front — **zero data backing anywhere in `data/motion-primitives.json`**, would
   mean authoring new data from nothing) or choctaw (still genuinely unbuilt — see item 5). **Grade 4
   has a second, separate gap**: its own `difficult_turns_in_both_rotational_directions` requirement is
   not parsed or checked by `StepGrade`/`scoreStepLevel` at all — reaching 11 types alone would not be
   enough. Fix that before assuming grade 4 is "just" a type-count problem.
4. **`sim/pcs.ts` is wired into `game/career.ts` now, not standalone.** `CareerEvent.discipline`/
   `segment` is an authored placeholder — "women" for every event (no gender/discipline switch exists
   anywhere in this rig; if one is ever added, revisit this), "short" for four of five events and
   "free" for the closing `finale`. Not put to the operator as the content decision it actually is.
0.5. **Confirmed, 2026-09-18: the operator wants a new-foot edge-change mechanism built — eventually,
    not this session.** This is Choctaw's own blocker (item 5 just below), no longer hedged as "if the
    operator ever wants to spend real design time on it" (the old queue's own wording) — they do. Queue
    position is unchanged (still item 13, still behind the operator's own stated order); this note only
    upgrades the decision from conditional to confirmed so a future session does not have to re-ask.
5. **(Closed 2026-09-21 — the choctaw is built; see the current checkpoint.)** Choctaw was the one real remaining "difficult-turn-adjacent" gap. It is NOT the rocker/counter
   fix applied elsewhere — rocker/counter change nothing about which foot lands the exit; choctaw needs
   a genuine edge-character change on a *new* foot, which `sim/types.ts`'s `TURN_KIND` comment still
   correctly describes as unbuilt. Do not assume this session's own rocker/counter insight
   (`travelSense` pinned to `entryDir`) transfers — it was checked and it does not, by construction:
   choctaw's own axis is which foot the edge-change lands on, not which way the exit faces.
6. **`rockerCounterStick` (0.2) is verified by keyboard only, not by a real gamepad's analog stick.**
   `app/pad.ts`'s gamepad path reads raw `gp.axes` directly (no `0.35` digital scale-down — that is
   `game/controls.ts`'s own keyboard-specific "manageable shallow edge" logic), so a controller's own
   reachable range is genuinely different from what was measured. Check it live on a pad before trusting
   the threshold holds there too.
7. **`BEGINNER_PARAMS` still inherits every system via spreading `GAME_PARAMS`, unexamined** — carried
   over unresolved since the twelfth session, now also true of every mechanic this session added
   (Spiral, Loop, Rocker, Counter, PCS). Still nobody has watched a beginner feel any of it.
8. **Flow is fully modelled now — all three of the bible's own §2.6 bullets, not two.** "Alternating
   lobes" / "repeated lobes in the same direction" (fifteenth session, `e6edfbd`) closes it: see the
   fifteenth session's own checkpoint entry above for the mechanism (`lobeDir`/`lobeLastDir`, a
   three-state tracker, not two — that third state is what makes a genuine "repeat" possible at all).
   Still no calibration data exists for `flowLobeAlternateGain`/`flowLobeRepeatLoss` — both are authored
   placeholders, playtest them.
9. **The operator wants a real, dedicated control scheme for the full move list eventually** — their
   own words, mid-session: "theres enough buttons on controllers these days i dont see why we cant
   perform the entire moves list through our controls and engine... develop a tuning rig for and
   alternate control schemes." This session kept reusing existing buttons (Spiral on Ina Bauer's own
   button, distinguished by weight; Loop/Rocker/Counter on `turn`/`bracket`, distinguished by hold
   duration and stick reversal) specifically to avoid touching input plumbing mid-mechanic — a
   deliberate, stated tradeoff, not an oversight. A dedicated fourth scheme with one button per move,
   plus its own tuning rig, is real, wanted, unscoped future work — see the queue.
10. **Replay contract is `ice-lab-f64/20`.** Five bumps across the fourteenth and fifteenth sessions
    (`/16`–`/20`), each for a new `SkaterState`/`TurnState`/`Params` field, none guarded by a brand-new
    Mode flag at 0 the way early bumps could rely on. Every one was regenerated from its own recorded
    inputs and diffed against the previous commit's fixture (frame count, schemes, every input) to
    confirm only the solver string and the new field names changed — `tools/ice-lab/test/fixtures/
    replay-v1.json`'s own params object, diffed with `python3 -c "import json; ..."`, is the fast way to
    check this. **Per-frame digests are NOT part of that check and are expected to differ** once new
    `SkaterState` fields exist at all — `replayDigest` hashes the whole state object, so adding any
    field (even at its inert default) changes the JSON being hashed; verified against `7f1d5ce`'s own
    fixture bump, which also changed every digest. The invariant is frame count / scheme / input, never
    the digest number itself. See the toolchain notes below for the exact regeneration recipe, worth
    keeping as a reusable script next time — nobody has yet.
11. **A second Godot skater exists** (`scripts/main.gd`, Settings → Skater) — Violet stays default.
    `tools/build_berserker.py` regenerates it; both build scripts must keep constructing the *identical*
    armature (`Hips, Spine, Head, Thigh/Shin/Foot L/R, Arm/Forearm L/R`) or `skater.gd` silently stops
    posing whatever changed. Unchanged this session, carried forward because it is still true.
12. **(Closed 2026-09-21 — see the current checkpoint.)** **Godot has no costume system at all** — the browser's three-costume `SKINS` wardrobe (fifteenth
    session) has no Godot equivalent; the closest thing, the second-skater picker (item 11 above), is a
    whole separate rigged model, not a recolour, and does not read `SKINS` or anything like it. Giving
    Godot real costume parity needs either authored material variants in the `.blend` source or a
    runtime shader/material override on the imported glTF — real, scoped work, not started.
13. **HUD parity between Godot and the browser is done for turn kind, the foot-change toast, and PCS's
    score** (fifteenth session) — `games/ice-run-godot/bridge/engine.mjs`'s `snapshot()` now matches
    what `game/main.ts` already showed for all three. **Check what a hand-off claims against the actual
    code before scoping work to fix it**: the same session's own checkpoint entry found that a fourth
    named gap (the Spiral) had already been closed, in the very commit that built it, and the note
    calling it a gap was already wrong when written. Don't repeat that specific claim.

**Untracked on purpose, at the repo root:** `E_W_replays_sessions_eng_bld/` (the operator's play data),
`Ice Lab — KoLd__FEEt edgework.html` (a browser save page), and `session-notes/`. Use only the play
data that is there; commit or delete none of the three without asking.

### The queue, next

The operator's own stated order, not a technical re-ranking — items 1-4 were the fourteenth session's
own; item 5 is the fifteenth's:

1. ~~**Wire PCS into `game/career.ts`.**~~ **Done**, fourteenth session. `7f1d5ce`.
2. ~~**A foot change mid-spin.**~~ **Done**, fourteenth session. `7f1d5ce`.
3. ~~**A backward/reverse one-footed leg-extended move (the Spiral).**~~ **Done**, fourteenth session,
   and reaches Kerrigan/inverted variants' own direction-agnostic ask for free — the *style* variants
   themselves (Kerrigan vs. plain vs. inverted leg extension) remain undone, no data backing exists for
   them, see §0 item above. `1374333`.
4. ~~**Three more step/turn types.**~~ **Done**, fourteenth session: Loop, Rocker, Counter. `e78be47`,
   `7075485`.
5. ~~**Alternating / repeated lobes** (flow's last unmodelled bullet).~~ **Done**, fifteenth session:
   `SkaterState.tiltCmd`'s own sign, held long enough (`flowLobeMinHoldTime`) and compared against the
   last ended lobe's own direction (`lobeLastDir`, kept across the gap on purpose — see §0 item 1
   below). Also reached `sim/pcs.ts`'s Composition "lobe variety" bullet (`lobeVariety`), one of its
   four bible-named ones — **not** `stepLevel.ts`, on reflection: that ceiling scores discrete turn/
   footwork *types*, and ordinary curvature variety between them has no natural hook there the way it
   does in Composition. `e6edfbd`.
6. ~~**Update the HUD.**~~ **Done**, fifteenth session: turn kind and the foot change were real gaps
   in Godot, fixed; PCS was a real gap in both engines, fixed in both; the Spiral turned out to already
   be covered in both (the checkpoint note above was already stale when it named it as a gap — checked
   with `git log -S` before touching anything, see the fifteenth session's own checkpoint entry).
   `5c6cc5d`.
7. ~~**Costume design.**~~ **Done in the browser**, fifteenth session: the "not a wardrobe system"
   framing this line used to carry was already wrong (a preset picker already existed) — the real fix
   was making it genuinely data-driven (`skinPreviewSvg`, `test/appearance.test.ts`); Solstice is the
   third costume. **Godot costume parity is a new, real, separate open item — see §0 item 12.**
   `data/calls-and-deductions.csv`'s "Costume or prop" deduction remains deliberately untouched: a
   judged rule-violation category, not a description of this preset system, with no trigger data.
8. **Full control scheme and tuning rig — implemented locally, 2026-09-21.** See the
   current checkpoint and `docs/controller-scheme.md`; physical-pad playtesting remains open.
9. **Verify `rockerCounterStick` (and, while at it, every other reversal-style stick threshold) on a
   real gamepad**, not only keyboard (§0 item above).
10. ~~**`stepLevel.ts`'s grade-4 `difficult_turns_in_both_rotational_directions` requirement.**~~
    **Done**, 2026-09-21: parsed from `data/step-features.json`, checked in `scoreStepLevel`. Each
    `StepEvent` carries `dir` (+1 anticlockwise, −1 clockwise), read by `game/career.ts` from
    `s.turn.dir` on the tick the turn or twizzle finishes (no new solver state, replay still `/20`).
    Grade 4 needs difficult turns in both senses; crossovers and changes of edge carry none. The
    11-type count is now grade 4's only blocker (choctaw or a STEPS mechanic).
11. **Decide whether `step`, `spiral`, `loop`/`rocker`/`counter` belong in any fixed `CAREER_EVENTS`
    routine**, and if so which and where — an operator content call, not a technical one, carried
    forward since the thirteenth session and now applying to four elements instead of one.
12. **`BEGINNER_PARAMS`'s blanket inheritance** (§0 item 7) — still open, still needs the operator
    watching a fresh player before assuming it is fine either way.
13. ~~**Choctaw.**~~ **Done**, 2026-09-21 — see the current checkpoint. It turned out to be one more
    special case after all, but not rocker/counter's: the missing mechanism was *not* flipping the lean
    frame on a foot change, which the data's own `post` for a choctaw spells out.

**The native track, in its report's order** (unchanged, still not touched): a strict native JSON
importer from `native/reference/wire-manifest.json`; transcribe `createState`, the blade and
classification, and the ground solver from the pinned `/5` source; a runner with oracle comparison and
first-difference diagnostics; only then an Unreal module and commandlet on a pinned UE installation.

### Working with this operator — what held up on 2026-09-18 (fourteenth session)

The full review — key decisions, unresolved assumptions, three places each side could have moved
faster, and vocabulary to study — is in §8 below, under "The fourteenth session's shape," in the same
depth every prior session's own review has kept. The short version, for a session in a hurry:

- **A large, itemized, multi-part ask ("wire in PCS then build the foot change mechanic and reverse one
  footed leg extened and then add 3...") needed two full clarifying-question round trips before any code
  was written** — what "reverse one footed leg extended" actually named, and how the "equip" mechanic
  should work. Both were resolved by asking rather than guessing, and both answers shaped real design
  decisions once known. A one-time numbered breakdown of a bundled ask, stated up front, removes the
  round trip — the twelfth and thirteenth sessions' own reviews already named this same pattern; it
  recurred again today in a new shape (a wishlist-style paragraph rather than a single dense sentence).
- **A mid-session design-philosophy note ("theres enough buttons on controllers these days...") arrived
  after Spiral's own button-reuse design was already built and Loop's was underway** — useful, correctly
  logged for a future dedicated control scheme (§0 item 9), but stating a standing input-design
  preference before a session that reuses buttons begins would let it shape the first mechanic instead
  of only the ones built afterward.
- **Asking to "attempt" a documented, previously-abandoned gap (rocker/counter) paid off completely** —
  the prior write-off ("a third, different mechanic... not built either") was wrong, and re-examining it
  with fresh eyes rather than trusting the old note found the actual, buildable insight. Worth naming as
  a habit worth repeating: a hand-off's own "not possible" claims are a snapshot of one session's
  understanding, not a permanent verdict, and are worth re-checking when there is a specific reason to
  (an operator ask, new information, more time) rather than treated as closed forever.
- **Verify in the actual running app, every time, kept paying off again, twice over** — both real bugs
  this session (the LB+RB weight-collapse on Spiral's gamepad path; `rockerCounterStick` unreachable
  through the real keyboard's own 0.35 scale-down) were found only by driving the served build with
  Playwright and getting a different HUD readout than the sim-level tests predicted. Neither would have
  been caught by the (extensive, passing) unit test suite alone, since those tests call `step()`
  directly and bypass `game/controls.ts`'s own input-mapping layer entirely.

**Toolchain reminders, updated:** `npm run typecheck` still fails (no `tsc` on the box); scratch-install
`typescript`+`@types/node` and run `tsc --noEmit -p . --typeRoots <scratch>/node_modules/@types` from
`tools/ice-lab/` — clean at every commit this session too. **For a real browser check, prefer
Playwright** from `/home/kill/astro-aae/frontend/node_modules/playwright` (still there, still not a
dependency of this repo — read-only borrowed each time) over raw CDP scripting. The native build
commands are in `tools/ice-lab/native/README.md`. `app/build.mjs`'s data-file copy list is still
curated by hand, not a glob of `data/` — a new `fetch("../data/whatever.json")` in `game/main.ts` needs
a matching entry there too, or the served build 404s silently; `test/app-loads.test.ts` still catches
this specifically. **New this session — a reusable replay-contract-bump recipe**, used four times
running: (1) bump `REPLAY_SOLVER` in `sim/replay.ts`; (2) run a small script that reads the *previous
commit's* `test/fixtures/replay-v1.json`, merges its `initial.params` onto the *current* `DEFAULT_PARAMS`
(picking up any new field's default), replays every recorded frame's own `input` through the *current*
`step()` with a fresh `ReplayRecorder`, and writes the result back over the fixture; (3) diff the new
fixture against the previous commit's with Python (`frames.length`, every `scheme`, every `input` —
must all match; only `solver` and `initial.params`'s key set may differ) to confirm kinematics did not
silently change; (4) regenerate `docs/fidelity-report.md` (`node tools/ice-lab/validate.mjs --report
docs/fidelity-report.md`) — its header names the solver string verbatim, so this is needed even when
the gate's own PASS/FAIL result does not move, the thirteenth session's own §5 item 33 lesson, still
true. Used a fifth time, fifteenth session, confirming it generalizes — still not saved as an actual
script anywhere, written fresh each time; worth doing that next time rather than retyping it again.
The README's test count is 452.

---


## Recovered checkpoint — 2026-09-13, tenth session (fidelity track), from `fidelity-00-repo-correction`

Its code reached `main` in PR #5, but its closing hand-off (`b4c06fc`) was committed only on
`fidelity-00-repo-correction` and never reached `main`'s `Hand_off.md`. Added here on 2026-09-22 so it
lives on `main`. The blocks below are that commit's new text, copied verbatim from
`git show b4c06fc:Hand_off.md`; only heading levels were lowered by one to nest under this section.
Paths, counts, replay versions and "open" items are as of 2026-09-13 — history, not current state.

**Last session: Sunday 2026-09-13 (tenth, the third session that day). Repo state: complete
specification, a running Ice Lab (moves, jumps, profiles, replay), and — new today — the fidelity
track: a written fidelity gate, an open-constants register, a rink-ice literature digest, a validation
case corpus, a headless validator run in CI on every push, and a generated fidelity report. Also new in
the engine: rink surface shape and the wind-up jump assist.**

### 0 · Start here (written 2026-09-13, tenth session)

**Two checkouts. Check which one you are in first.**

| Path | Branch | What is there |
| --- | --- | --- |
| `/home/kill/KoLd__FEEt.fidelity` | `fidelity-00-repo-correction`, **pushed**, 14 commits ahead of `origin/main`, CI green (run 34799870011, Node 24 and 26) | All of today's work. **This file.** No PR opened yet. |
| `/home/kill/KoLd__FEEt.ice_skating_` | `ue-replay-01-foundation` | Another session's branch. Its `Hand_off.md` has **uncommitted edits from that session**: do not overwrite them. It also holds the operator's play data (`E_W_replays_sessions_eng_bld/`, untracked) and a saved-page HTML, both not to be committed. |

Run `git worktree list` and `git status --short --branch` before editing anything. **Local `main` in
the main checkout is behind `origin/main`**, so branch from `origin/main`, never from local `main`.
This file is uncommitted in the worktree. Commit it with the next piece of work, or on its own if the
operator asks.

**What the session was.** The operator handed over **"Edgework — Fidelity Track Brief"**. The project is
built by one person with no funding. The near-term gate is **fidelity**, not fun: does the blade–ice model
reproduce measurable skating within stated tolerances? UE5 is deferred indefinitely, and the $11.9M phase
plans are kept as a funded long-horizon scenario. The brief's non-goals are:
- no UE5 work;
- no making `src/reference/` compile;
- no progression, scoring loops or game wrapper;
- no Steam or Tauri;
- no revising the phase plans.

Its working agreement is small commits, one task per commit, and stopping to ask on licensing, scope or
public framing.

**Brief tasks, with status:**

| Task | Commit | State |
| --- | --- | --- |
| 0.1 Licence `tools/` | `bd68a80` | **Apache-2.0**, operator's choice (option A); recorded as **D7** because D6 was taken. `tools/ice-lab/LICENSE`. |
| 0.2 README status | `93ac92c` | Rewritten against the repo. It had said 97 tests, never mentioned the live Pages build or `native/`, and still framed the "is carving fun" gate as near-term. |
| 0.3 `docs/fidelity-gate.md` | `472ec39` | The specification: evidence levels L0–L3, source types, configuration under test, observables O1–O7, bands, verdicts, pass condition, what a failure obligates. |
| 1.1 `docs/open-constants.md` | `9a6f191` | Every chosen number in `sim/`, each with value, where used, level, range and what would measure it. |
| 1.2 `data/validation/` | `c926f39` | Case format with the **rink record**. 32 cases: 6 derived, 2 literature stubs, 21 footage/protocol stubs, 3 unmodelled turns. |
| 1.3 `tools/ice-lab/validate.mjs` | `c8312e4` | Headless, zero dependencies, `--json`, `--cases`, `--clips`, `--report`. |
| 1.4 CI | `316de0b` | `ice-lab-checks.yml` on every push to any branch: tests, build, fixture, validator, report freshness. |
| 1.5 `docs/fidelity-report.md` | `5e6308e` | Generated and deterministic. CI fails if the committed report is stale. |
| 2.1 Pages | — | **Already existed** before the brief (`pages.yml`, deploys `main`). |
| 2.2, 2.3 | — | Not started. The brief gates Phase 2 on "a non-trivial number of passing sourced cases". Today there are **zero** external ones. |

**Beyond the brief, on the operator's direction:**

- **`docs/ice-literature.md`** (`2e50485`, `6ca236f`) covers Lever et al. 2022 (J. Glaciology,
  doi:10.1017/jog.2021.97) and Hutchins, Wang & Impellizzeri 2026 (Sports Eng., doi:10.1007/s12283-025-00538-z).
  Both were read in full. Every number is marked measured, modelled or secondary.
  - **Kinetic skate friction:** 0.0046–0.0071, via de Koning 1992 and Federolf 2008. `muGlide` 0.006 sits
    inside that range, and the range is now recorded.
  - **Hutchins's friction figure is a static index** (about 3× kinetic), so only its relative trends transfer.
  - **The sign of the temperature–friction relation is contested** between the sources. Do not add it yet.
  - **IIHF air temperature (9–11 °C) implies about 1.25 kg/m³.** The model's `airDensity` of 1.29 is 0 °C
    air. Recorded, **not changed**.
  - **Lever's pressure-melting point at −5 °C reads 60 MPa on p. 342 and 90 MPa in the conclusions.**
    Neither is used.
- **Rink surface shape** (`1778d8f`, replay `/7`). `rinkRelief` is centre ice minus the boards: a crown on
  a public rink, a bowl in an old thin-slab barn. **O** cycles flat, public (+4.5 mm) and barn (−9 mm).
  All of it is L3, sized to be "barely perceivable". It is applied along the travel only, and every preset
  is flat.
- **Gate §4.4 settle time** (`72df915`, operator's decision). The first validator run failed
  `carve-residual-fast-deep` at −0.63°. Measurement was checked first: the validator's lateral
  acceleration matched `latAccel` to 0.03%. The cause was the arms' authority still washing out
  (τ 1.5 s) inside a window that began at 2 s. The steady window now settles for **5 s where
  `internalWashout` > 0** (`responsive`, `assisted`) and 2 s where it is 0 (`spec`). The operator: *"i like
  that we get emerging mechanics from the physics interactions thats intended"*.
- **The wind-up jump assist** (`c98fea7`, replay `/8`).
  - **Input:** `SkatingInput.windup`. **U**, or the right stick thrown right in schemes A and B.
  - **Arming:** a flick against the rotation within 0.6 s of the release. A flick the other way cancels it.
  - **Effect:** scaled by `jumpAssist` (spec 0.25, responsive 0.5, assisted 0.8). The whip gets a floor, and
    in the air `assistedCarriage` bisects over `rotationToLand`, a tick-for-tick rollout of the rest of the
    flight, to land the nearest reachable revolution.
  - **Bound:** it moves only I. Angular momentum is conserved and air time is untouched.
  - **Measured:** responsive 3T 3.041 → 3.000 rev; assisted half-whip 2T< and a fall → clean 2T.
- **Watching scripted play:** `node tools/ice-lab/demo.mjs` writes `build/demos/`. Each demo is a replay
  clip plus a `.txt` input timeline: a carve figure, and the toe loop manual, wound, wound the wrong way,
  and flick-only on assisted. The operator asked to study bot inputs; this is the answer. Open a clip with
  **import replay**.

**Validator today:** 6 pass, 0 fail, 23 unsourced, 3 unmodelled. **The gate is not met.** No observable
class has external evidence.

**Open, in the operator's hands:**

1. **Measurements.** Fill stubs from footage or papers. The two literature stubs need their **primaries**
   read (Federolf 2008; de Koning 1992) before they count.
2. **Whether to open a PR / merge** `fidelity-00-repo-correction`. Merging moves the public Pages build to
   replay `/8`; older clips then verify only against older commits.
3. **`airDensity` 1.29 → about 1.25.** Physically sourced, but it changes solver arithmetic, so it needs its
   own commit and replay bump.
4. **The spec baseline.** `spec`'s `jumpAssist` is 0.25 on the operator's word, which departs from "spec =
   the package". Only relevant with jumps on and a wind-up.
5. **Earlier asks still open** (see 0.1 below): the carve as a feature (ghost line: a replay's tracing or a
   designed curve?), the career module, stat balance tied to scoring, stamina pools.

**Toolchain reminders.**
- **Typecheck:** there is no tsc on the box. Scratch-install `typescript @types/node` and run
  `tsc --noEmit -p . --typeRoots <scratch>/node_modules/@types` from `tools/ice-lab/`. It was clean at
  every commit today.
- **Replay bumps:** snapshot the old `sim/` with `git archive HEAD tools/ice-lab/sim | tar -x -C <scratch>`.
  Compare old and new on the fixture plus the operator's clips in
  `/home/kill/KoLd__FEEt.ice_skating_/E_W_replays_sessions_eng_bld/` (`d0dfddc5` is `/6` with two jumps;
  `4b7568b7`, `6f5c711f` and `a5a66c98` are `/4`), every state field and event every tick. Then re-record
  the fixture from its own inputs, keeping **exactly** the current `DEFAULT_PARAMS` keys.
- **Report:** after changing any case or anything the validator reads, regenerate with
  `node tools/ice-lab/validate.mjs --report docs/fidelity-report.md` or CI fails.
- **Tests:** 272.

---

### From §5 · Things that will trip you up (items 29–35)

29. **The fidelity gate forbids moving its own goalposts silently.** A tolerance or window may change
   after a result is seen only in a commit that changes nothing else and cites a reason
   (`fidelity-gate.md` §5). §4.4's settle time was changed that way, on the operator's decision. Do not
   widen a band, edit a case, or retune a constant to turn a validator failure green. Follow §7: first
   the measurement, then permitted L2/L3 moves, and structural failures are never tuned away.

30. **A derived case checks the implementation, not reality.** The 6 passing cases are all derived, so
   the gate stays unmet until footage, protocol or **primary-checked** literature cases pass. Never
   invent an `expected` value. A null stub is correct.

31. **The validator reads `BOOT_PRESET` from `sim/params.ts`** (moved there from `app/lab.ts` today). Its
   `BANDS` table must match `fidelity-gate.md` §5.1. A case whose band or √(u_m² + b²) tolerance disagrees
   fails as invalid.

32. **A flat lean is not a balanced body.** On `responsive` and `assisted` the arms' authority holds a
   lean for several seconds after it looks settled (`internalWashout` 1.5 s). Any new steady-state
   measurement has to wait it out, which is why §4.4 settles for 5 s there.

33. **Replay `/8` input has `windup`**, and `parseReplay` requires every input key. Any hand-built
   `SkatingInput` must spread `NEUTRAL_INPUT`. A flick arms only within `windupWindow` of the release and
   only with `jumpMode` 2. Cases never wind up, so the assist cannot move a gate observable.

34. **Rink shape needs a start position, and replays have none.** `rinkRelief` is 0 at centre ice, and
   clips always start at the origin, so a shaped-rink glide case cannot yet place the skater away from
   centre. A replay `initial.pos` would be a contract change (`/9`).

35. **`python3` edit batches that assert before writing leave nothing half-applied**, but a batch that
   fails part-way skips every later file. Re-grep version strings (`git grep "f64/"`) after every replay
   bump: the Ice Lab README's contract paragraph sat at `/6` through `/7` until it was caught.

---

### From §6 · Where to go next

In descending order of value, **for the fidelity track** (the operator's current plan, 2026-09-13):

1. **Get external evidence into the corpus.** Fill the stubs in `data/validation/cases/`, one observable
   at a time, starting where effort does not enter the measurement: `spin_decay_per_s`, `pull_in_ratio`
   and `air_time_s` from broadcast frame counts; `glide_decel_ms2` from paired opposite-direction runs.
   Read Federolf 2008 and de Koning 1992 in the primary before their stubs get values. Regenerate the
   report after each.
2. **Decide the PR / merge** of `fidelity-00-repo-correction` with the operator. It moves the public
   build to replay `/8`.
3. **Phase 2 (2.2 landing copy for skaters, 2.3 `wrong-edge.yml` intake)** once the report shows
   non-trivial sourced passes. Phase 3 stays gated.
4. **The `airDensity` correction** (about 1.25), as its own replay-bumping commit.


### From §7 · The one thing that matters most

**Near term (since 2026-09-13): whether the model is *right*.** The fidelity gate in
[docs/fidelity-gate.md](docs/fidelity-gate.md) asks whether the blade–ice model reproduces measurable
skating within tolerances stated in advance. It can be answered by one person, offline, for nothing.
Today it is not met: every passing case is derived, and every external case is a stub.

If a future session is asked to make it pass by editing a case, widening a band after seeing a result,
or retuning a constant without the §7 procedure, **push back**. The gate is only evidence if its
goalposts move in the open, with a reason, in a commit of their own. A validator failure is information:
diagnose the measurement first, as §7.1 says, then put the choice to the operator.

**Long term, for the funded scenario:** everything is still downstream of one unproven claim, **that analog
lean plus analog knee pressure is a good primary verb.** No shipped game has used it. The studio plan's
week-16 kill gate — *"is carving fun with no jumps, no score and no art?"* — keeps its pre-committed
thresholds, a decision-maker who is **not** the scheme's inventor, and the authority to stop the project.
The same push-back applies to softening it.

### From §8 · Session log

| date | what happened |
| --- | --- |
| 2026-09-13 (tenth, worktree `/home/kill/KoLd__FEEt.fidelity`) | The **Fidelity Track Brief**, Tasks 0.1–1.5: `tools/` Apache-2.0 as D7; README reframed to the fidelity gate; `docs/fidelity-gate.md`; `docs/open-constants.md`; `data/validation/` with rink records (32 cases); `validate.mjs`; CI on every push; generated `docs/fidelity-report.md`. Also `docs/ice-literature.md` (Lever 2022, Hutchins 2026, read in full); rink surface shape (replay `/7`); gate §4.4 settle 5 s on washout presets after the first validator run caught the arms' transient; the wind-up jump assist with a flight-rollout controller (replay `/8`); `demo.mjs` clips to watch. Both replay bumps proven identical on the fixture and four operator clips, 49,539 ticks. 272 tests, tsc 7.0.2 clean, pushed, CI green on Node 24 and 26. Validator: 6 pass, 0 fail, 23 unsourced, 3 unmodelled; gate not met. |

The tenth session's shape: **specify, then implement, then let the first run argue back.** A brief with
numbered tasks and an explicit stop point ran cleanly as one task per commit. The licence was put as a
tradeoff and not picked, and stale facts in the brief (D6 taken, 97 tests, Pages already live) were
flagged in one line each. The most useful moment was a failure: the validator's first run failed a case
that the spec's own window definition had been written to pass. Tracing it — measurement verified first,
then the arms' washout — turned a red build into a decision the operator made. What cost time: §4.4's
"chosen so the controller has settled" was written without measuring it. The first wind-up assist was
built through five files before a probe showed it made clean jumps worse, which meant a rewrite and a
second fixture re-record that briefly kept a deleted parameter key. The rule is the ninth session's
again: **measure, then write.**

---

*Moved here unedited at the close of 2026-09-24 (nineteenth session): the eighteenth session's §0.*

## 0 · Start here (written at the close of 2026-09-23, eighteenth session)

**Check first.** Another agent session shares the main checkout (`/home/kill/KoLd__FEEt.ice_skating_`,
on `phase17-assurance`, with that session's uncommitted Phase 17 work: `games/ice-run-godot/{README.md,
bridge/engine.mjs,scripts/main.gd,tests/engine.test.mjs,tests/host.test.mjs}`,
`tools/ice-lab/test/turns.test.ts`, untracked `docs/phase17-*.md` and
`tools/ice-lab/test/phase17-replay.test.ts` — touch none without asking). Operator data, untracked on
purpose: `E_W_replays_sessions_eng_bld/`, `Ice Lab — KoLd__FEEt edgework.html`, `session-notes/`.

**This session worked in a worktree** so it never switched the shared checkout's branch:
`/home/kill/KoLd__FEEt.pendulum`. Do the same — `git fetch && git worktree add -b <branch>
../KoLd__FEEt.<name> origin/main` — then `git worktree list` shows every live one.

`main` is at the merge of this hand-off (after `3b3e290`, PR #28). PRs this session: **#26** (the
seventeenth session's work), **#27** the fore-aft pendulum, **#28** it switched on — all merged.

At close: **596/596** browser/sim tests, **20/20** Godot bridge, typecheck clean (scratch TypeScript —
memory `ice-lab-typecheck-toolchain`), native reference check, build. Replay contract
**`ice-lab-f64/36`**. Fidelity gate: 8 pass / 0 fail, gate not met (unchanged).

**One loose end, not ours:** the other session's untracked `tools/ice-lab/test/phase17-replay.test.ts`
still pins `ice-lab-f64/35` — a one-line change to `/36` (plus its fixture pins, if any), with the
operator's leave, as the seventeenth session did for `/22`→`/35`.

### 0.1 · What exists now: the fore-aft pendulum (`pitchMode`)

`tools/ice-lab/sim/solver.ts` `pitchTick`; `big_reffg.txt` §3.5 is the spec (the lateral pendulum's
mirror). **On in Simulation and Experimental** (`game/setups.ts`, operator's choice), 0 in Blade
Explorer and Full Repertoire; `DEFAULT_PARAMS.pitchMode` is 0, so mode-0 arithmetic is bit-identical
(fixture digests unchanged at `/36`).

- **Axis:** the support blade's tangent — not the body's heading. Across the blade the edge holds the
  body; along it only the ankle can.
- **Authority:** the contact `c` along the blade, clamped to half of `bladeLength` (0.14 m) — projected
  over the loaded blades. `contactS` for the tick uses last tick's `c` (one-tick lag); `pitchSplit` still
  splits the blades around it.
- **Dynamics:** `L φ'' = g (sin φ − c/L) − aFwd cos φ`.
- **Control:** capture point `ξ = L sin φ − (aFwd L/g) cos φ + L cos φ · φ'/√(g/L)`;
  `c = clamp(ξ + pitchGain (ξ − asked))`, `asked = input.pitch × bladeLength/2` — so with no
  acceleration the body settles over pitchMode 0's `contactS = 0.5 + 0.5 × pitch`.
- **Fall:** `|ξ| > reach` held for `fallErrorTime` (0.35 s) → `FALL.Pitched` (6, "PITCHED").
- **Which forces pitch the body** (the heart of it): only what the ice does *along the blade*. Excluded:
  the stroke (section 5b: through the leg into the hips), drag and the rink's slope (on the body), the
  carve's velocity rotation (the edge's force is square to the blade), and in section 5 everything but
  glide friction (`muSkid` 0.35 g, the scrub, the brake, the Ina Bauer's trailing foot — across the blade).
  The slip solve's scrape (slipMode 1) already has its real direction and is kept.
- **Not modelled:** pivots and spins keep direct placement (`pitchOn = pitchMode === 1 && !turning`);
  no hip strategy or arm authority fore-aft; no toe-pick trip.
- **Measured** (`test/pitch.test.ts`): glides and strokes hold the contact within 1.5 cm; pitch 0.5
  settles at contactS 0.75; the full inside snowplow from 5 m/s stops upright, leaning back 0.069 rad;
  both outside edges caught from 2–5 m/s → pitched forward, down at 0.39 s.
- **With it on in the setups** (re-pinned): hockey stop scrapes to 1 m/s in 1.47 s (1.60 without);
  pad snowplow on outside edges pitches forward 0.35 s after the edges set; Experimental takeoffs
  lose 1–2% spin (backward loop L 38.7 → 37.2, still clean); with `speedSpinMode` the lutz's block 2.26 → 1.08.
- **Test bases:** `torque`, `slip`, `feet`, `pitch` strip stages B/C *and* the pendulum (`pitchMode: 0`) so
  each measures only what it switches on — keep that pattern for every new mode.
- **Hockey stop test** now pins `scraped` (first below 1 m/s). The old 0.3 m/s "standstill" was the
  bot's glide: below ~1 m/s the bot stops holding the blades square in both modes.

### 0.2 · How the design got there (four wrong turns — don't repeat them)

1. Pitch along the body's heading → the spread eagle and hockey stop fell (feet turned 90° off the body
   left no reach). → the support blade's tangent.
2. A PD on the asked lean against true vertical saturated under any steady braking; aiming it at the
   balancing lean made every stroke's acceleration step a target step. → capture-point control.
3. Every velocity change pitched the body → strokes drove the contact end to end. → push, drag, slope and
   the carve excluded.
4. The lumped `muSkid` along the travel pitched a blunt blade's skid into falls. → only glide friction
   counts along the blade.

The lesson, for the next mode: **before coding a new body, list where each existing force is applied
(which point, which direction) in `step`.** All four turns were that question answered late.

### 0.3 · The queue, next (operator's order where given)

1. **[operator] Play Simulation and Experimental on the Xbox pad**, export replays to
   `E_W_replays_sessions_eng_bld/`. New to check: a hard snowplow, a hockey stop, deliberately catching
   both outside edges (does the forward pitch at ~0.4 s feel fair?), and whether heel/toe on the stick
   now feels laggy — the stick asks for a lean, the contact follows it (leaning toward the toe first
   moves the contact toward the heel). Still open from before: (a) the pump and thumb-stroke thresholds
   (60%/20%, 0.25 s, `SNAP_TICKS`); (b) which stick direction reads "knees in"; (c) both knees deep with
   shared weight crossing the jump load (0.7).
2. **The dig under the pendulum** — the dig (`test/torque.test.ts`) needs the contact at the toe or heel
   *at once*; with the pendulum on it winds the body far less (tested with it forced on: toe dig L 1.01 → 0).
   Options to measure and bring: accept it (the skater must lean early); a faster ankle (`pitchGain` > 1);
   or the dig reading the asked contact. Operator's call.
3. **Toe-pick trip** — `FALL.ToePickTrip` exists and nothing raises it; §3.5 specifies it (contact at
   the pick with speed → trip). Braking can now run the contact to the toe, so it is reachable.
4. **Fore-aft authority beyond the ankle** — the lateral pendulum has arms and the free leg
   (`internalMax`); fore-aft has none, and pivots/spins bypass the pendulum.
5. **Elite Series 2 paddles** (memory `controller-hardware-roadmap`): raw-button readout first.
6. **Arms' whip vs physics** (`jump.ts` `jumpWhip`, ~38 of ~40 takeoff L, not through the ice) — operator's call.
7. Tutorial (memory `tutorial-balance-then-release`); combining four setups into three (when asked);
   SIXAXIS later.

### 0.4 · Key decisions (this session)

- **Operator:** the pendulum is on in Simulation and Experimental; Blade Explorer and Full Repertoire keep
  pitchMode 0. Standing decisions from before still hold (every move through the blades; buttons ask;
  four setups kept; delete nothing).
- **Agent, reported, open to revision:** capture-point ankle over a PD; the support blade as the axis;
  `fallErrorTime` reused for the pitch fall; the hockey-stop test's metric moved to the 1 m/s scrape.

### 0.5 · Unresolved assumptions (all in `docs/open-constants.md` under `pitchMode`)

- `pitchGain` 1 — authored.
- Reach = half `bladeLength` (0.14 m) both ways: the ankle at the blade's centre. A real boot's ankle
  sits behind centre — the heel side is shorter.
- `fallErrorTime` 0.35 s, the lateral timeout's, reused.
- The contact's torque linearised (`g c / L`); `aFwd` a raw per-tick difference, unfiltered; one-tick lag.
- The push acts through the centre of mass (a real push leg's line of action is not exactly through it).
- In slipMode 0, the skid's friction taken as all across the blade.
- Fixed by: centre-of-pressure traces from instrumented skates (braking, stroking, snowplow).

### 0.6 · Things that tripped this session (add to §5)

- **Force a mode on to see its reach:** set `pitchMode: 1` in `DEFAULT_PARAMS` temporarily, run the whole
  suite, restore (`grep -n "^  pitchMode" sim/params.ts`). It lists every test the mode touches.
- **Fall reasons without editing tests:** a one-line hook in the solver's fall block,
  `(globalThis as any).__probe?.(s, reason); // PROBE-TEMP`, plus `node --import <hook.mjs> --test …`
  where the hook sets `globalThis.__probe`. Delete every `PROBE-TEMP` line before committing.
- **Measuring a pinned test:** copy it to `test/_m_x.test.ts`, append a `MEASURE` test that logs, run
  with `--test-name-pattern MEASURE`, delete the copy.
- **Bot thresholds can measure the bot**, not the physics (the hockey stop's 0.3 m/s tail).
- `sim/` must not call `Math.asin` etc. (`test/boundary.test.ts`) — use `sim/math.ts` (`asinClamped`,
  `atan2`); `Math.sqrt` is allowed.
- The fall-retry (`Object.assign(s, createState(p), …)`) does not clear optional state fields — a
  mode's fields must be in `createState` or a retry inherits them (the pendulum re-fell at once).
- `game/setups.ts` exports `SETUPS` (objects with `id`), not a list of ids.
- The contract-bump checklist (§0.7 of the archived seventeenth §0) still holds: `rebase-fixture.ts`,
  pins in `docs/controller-scheme.md`, `validate.mjs --report`, `setup-script.ts --write` (say why in
  `test/setup-mapping.test.ts`'s header), Godot `prepare.mjs --engine-only`.

## 0 (nineteenth) · Start here (written at the close of 2026-09-24, nineteenth session)

**Check first.** `git fetch`, `git log --oneline -1 origin/main` (this was written at `324da81`, PR #43),
`git worktree list`. Another agent session shares the main checkout (`/home/kill/KoLd__FEEt.ice_skating_`,
on `phase17-assurance`, uncommitted work in `games/ice-run-godot/…`, `tools/ice-lab/{app/draw.ts,
game/full-controls.ts, game/setups.ts, sim/*}` and untracked `docs/phase17-*.md`) — **touch none of it**.
Work in a worktree off `origin/main` (`git worktree add -b <branch> ../KoLd__FEEt.<name> origin/main`).
Operator data, untracked on purpose: `E_W_replays_sessions_eng_bld/` (today's four session cards were
copied in as `2026-09-24-*.json`), `Ice Lab — KoLd__FEEt edgework.html`, `session-notes/`.

At close: `main` **703/703** tests, Godot bridge 20/20, typecheck clean (scratch TypeScript — memory
`ice-lab-typecheck-toolchain`), replay contract **`ice-lab-f64/39`**. PRs merged today: #30–#43.

**The operator plays at `http://localhost:8130/game/`** (the Ice Lab at `/app/`, the controller workshop
at `/game/controller.html`). It is served from the worktree `/home/kill/KoLd__FEEt.play`, detached at
`origin/main`; the server was a background task of this session and dies with it. To bring it back:
`cd /home/kill/KoLd__FEEt.play && git fetch && git checkout --detach origin/main && cd tools/ice-lab &&
PORT=8130 npm run serve` (in the background). After every merge the operator plays, move `play` to the new
main and restart. The operator said of today's build: "it feels like im really on the ice".

### 0.1 · In flight — pick this up first (waiting on three operator decisions)

**The arms' whip, grip-limited** — built but UNCOMMITTED in `/home/kill/KoLd__FEEt.whipgrip` (branch
`arms-whip-grip`, merged up to main `d277613`). The agent stopped before committing, as instructed,
because the showcase double loop cannot be made to land reliably from the Experimental pad.

Built (uncommitted): `armsWhipMode` (the arms' torque inside the trunk solve, grip-limited; an over-hard
whip pivots the feet; `armsWhipTorque` 60 = `twistTorqueMax`, authored) with the **sign fix** (arms wound
against the jump take spin away); a new **`jumpInertiaTucked`** (the tuck in the AIR only, 0.5 in the trunk
setups, 0.95 default) — because lowering `inertiaTucked` itself to 0.5 broke skating (the trunk's upper
body at arms-in became 0.1 kg m²: the hockey stop fell, ball-of-foot pivots stopped, 13 tests moved);
X/B move only the arms while a jump loads (Experimental / Dig Gate). Suite: 686 pass, 7 fail — backjump
(2), the ghost's loop, the tutorial's "Turn in the air" (Simulation, Experimental, and its duration
test), the replay fixture (awaiting `/40`). The lab's scheme C arms tests did not move.

Measured: direct inputs land a clean 2Lo (6 m/s, lean 0.8, arms 0.75, 1.91 rev at tuck 0.5), but a
search of 432 Experimental pad scripts found at best a double called a quarter short (8 m/s, both
sticks full, B from the start, RT at 1.5 s for 0.3 s, X from 1.7 s: L 15.2); most hop or fall. Why: the
arms' request follows Experimental's eased pose (3/s), not the swing, so a B→X swing crosses zero during
a 0.3 s load; deep edges don't hold on the Experimental pad (the automatic crossover beat puts both feet
down and breaks the load; the tilt oscillates); the edge's grip dips while the knee loads (41 → 24 N m).
The tutorial's air step jumps from a straight glide — nothing through the ice can turn that.

**The operator must decide:** (1) confirm the air-only tuck (`jumpInertiaTucked`) instead of lowering
`inertiaTucked`; (2) how Experimental's arms ask for the whip — a swing during the load asks the full
whip whatever the eased pose, and/or suppress the automatic crossover beat while a jump loads so a deep
held edge is possible (both are controls, not physics); or (3) accept singles as the Experimental
showcase under this mode. Then finish: re-script backjump, the ghost's loop (`game/ghost.ts`) and the
tutorial's air step onto an edge; the contract-bump pattern (`/39 → /40` with a history note in
`sim/replay.ts`, `node replay/rebase-fixture.ts` (digests unchanged), pins in `docs/controller-scheme.md`,
`validate.mjs --report`, `node test/setup-script.ts --write` with a header note, Godot
`prepare.mjs --engine-only`, the native reference); `docs/open-constants.md` entries. Probe scripts in
the session scratchpad (`…/scratchpad/whip/`) die with the session; the worktree's diff is the record.

### 0.2 · What exists now (all under `tools/ice-lab/`; details in `docs/controller-scheme.md`)

**Five setups** (`game/setups.ts`; memory `four-setups-kept`): Simulation, Blade Explorer, Experimental,
**Dig Gate** (new: Experimental + a phase-gated dig on LB+RB), Full Repertoire. The operator will combine
them into three later — bring options from all of them when asked.

| Today | What it does | Where |
| --- | --- | --- |
| Toe-pick trip | `toePickMode`; built, then **off in every setup** — the operator: "not working at all", "makes pumping completely useless". Keep off unless asked. | `sim/solver.ts` `toePickCatch`, `test/toepick.test.ts` |
| Dig under the pendulum | lean early (operator); asked vs actual contact as telemetry (`contactAsked`, `digL`, CSV columns, lab overlay); `digOracle` test-only; `pitchGain` sweep + fingerprint test | `test/dig.test.ts`, `test/pitch-gain-sweep.ts`, `test/pendulum-fingerprint.test.ts` |
| Arms fore-aft | `pitchInternalMode` (on with the pendulum), `pitchAnkleTau` 0.16 s (1 Hz ankle/hip crossover, authored) | `test/arms.test.ts` |
| Strokes | a push is the standing leg's, both blades down through it, then across; **below 3.5 m/s it lands on both feet** (`ONE_FOOT_SPEED`), next push still the other leg's; below 1 m/s a snap is always a push (`STANDSTILL_SPEED`); thumb strokes push from a full bend (`STROKE_KNEE`), forgiving accuracy (`STROKE_*`); the free leg's trigger waits out a 0.25 s snap before swinging | `game/full-controls.ts`, `test/setups.test.ts` |
| Standing-leg pushes on A | Simulation / Explorer / Repertoire (`standingPush`) | same |
| AI ghost | a second skater on the same solver playing a virtual pad through the same mapping; skates into its tricks from the player's stride; strokes, dig, double loop, snowplow, spin, three-turn; `/` toggles | `game/ghost.ts`, `test/ghost.test.ts` |
| Tutorial | "Tutorial · trust the ice" (title screen, or Y): Balance → Edges → Scrape & dig → Air, 10 steps read only from solver state, a fall resets the step, the ghost demonstrates | `game/tutorial.ts`, `test/tutorial.test.ts` |
| Elite Series 2 paddles | Firefox exposes them as buttons **18–21**; bindable paddle layer with presets (Skating/stops, Weight shift, Toe picks); Experimental and Simulation only; D-pad still works | `game/full-controls.ts`, `test/paddles.test.ts`, probe card `game/pad-probe.ts` |
| Lab scheme C | L3 + right stick = arms (the right blade holds); L3 no longer switches courses (G does); hop hints on the HUD | `app/schemes.ts`, `app/hophint.ts` |
| Compact HUD | panels ~70%; `` ` `` hides it | `game/index.html` |

### 0.3 · The queue, next (operator's order where given)

1. **Finish the arms' whip** (§0.1) — three operator decisions first.
2. **Which paddle is which**: the paddle defaults assume b18 = top-right, b19 = bottom-right, b20 =
   top-left, b21 = bottom-left (Linux xpad order). The operator should press each on the probe card and
   say; then fix the defaults.
3. **[operator] Play the tutorial and Dig Gate on the pad**; export replays into
   `E_W_replays_sessions_eng_bld/` (never analyse `~/Downloads` — memory `play-data-provenance`). Today's
   four cards were the Ice Lab on scheme C with the `spec` preset — none of the game setups' features.
4. Tutorial loose ends: never run as one continuous skate with the boards; keyboard wording unverified;
   Explorer/Repertoire wording only partly checked.
5. Dig Gate forward digs fall (10/10) — the gate waits for backward travel; a forward dig is open.
6. The ghost's lutz was dropped (skated in, 7–13/30 land); a dig can't feed a double (L ~6.5 vs ~37).
7. The game's old "Two-foot control" scheme got L3 arms as a side effect of the lab change (harmless).
8. Combining setups into three (when asked); SIXAXIS motion for the console build (later).
9. The other session's untracked `tools/ice-lab/test/phase17-replay.test.ts` still pins an old contract
   (`/35`); main is at `/39` (and `/40` after the whip). A one-line change, with the operator's leave.

### 0.4 · Key decisions today (the operator's unless marked)

- Toe-pick trip: built, on for a morning, **off everywhere** by the operator's word.
- The dig: **lean early** (no physics change); from the other options keep only telemetry, a test
  oracle, the gain sweep and a fingerprint.
- Experimental: the thumb-stroke trip kept as a skill with forgiving accuracy (moot since the trip went
  off); strokes switch feet; a snap is a push at a standstill; at a crawl land on both feet.
- Standing-leg pushes extended to Simulation, Explorer and Repertoire.
- Dig Gate as a **fifth setup** on LB+RB; kept from the pasted design: intent buffer, phase gate, gating
  on the actual contact, telemetry; left out: controller-applied impulses/torques, a separate ankle gain,
  0.1–0.2 s windows. Backward only (forward digs fell 10/10).
- Arms in the fore-aft pendulum (`pitchInternalMode`) on with the pendulum; `pitchAnkleTau` 0.16 (agent,
  measured sweep).
- Lab scheme C: arms on L3, physics frozen, hop hints HUD-only.
- Paddles bindable with presets; Experimental + Simulation; never arms on the paddles.
- The ghost: skates into its tricks; the tutorial uses it.
- Arms' whip: (b) + a tuck of 0.5 + X/B arms-only while loading, trunk setups only (§0.1) — built, not
  committed; the pad can't land the showcase double yet, three decisions open.

### 0.5 · Unresolved assumptions (authored or unmeasured — `docs/open-constants.md` has each)

- `ONE_FOOT_SPEED` 3.5 and `STANDSTILL_SPEED` 1 m/s — measured with scripted inputs, not play.
- `pitchAnkleTau` 0.16 s — the 1 Hz crossover is authored; the ankle still moves the contact in one tick.
- `STROKE_KNEE` 1, `STROKE_EDGE` 0.5, `STROKE_FULL` 1.2, `STROKE_WOBBLE` 0.2, `STROKE_SNAP_TICKS` 12 — authored.
- Dig Gate `DIG_*` (0.4 toe, 0.5 s ease in, 1.5 s timeout, 0.5 s dig, 1 s ease out) — measured on scripts.
- Paddle index → position (xpad order), unconfirmed.
- `armsWhipTorque` 60 and `inertiaTucked` 0.5 (§0.1); the air's open inertia 4.0 is still the bible's.
- The toe pick's `toePickEngage` 0.11 / `toePickTripSpeed` 1.5 (big_reffg.txt's, authored) — mode off.
- At low speed on one foot the model has no balance authority (steering ∝ v², no stance on one blade,
  the arms wash out): the controls now avoid it; the physics hasn't changed.

### 0.6 · How this session worked, and what tripped it (add to §5)

- **Subagents in parallel worked** when each brief carried: its own worktree off `origin/main`, the hard
  rules (delete nothing, never the shared checkout, never port 8130, don't merge), **file ownership**
  (which files other agents are changing), measure-before-pinning, and the exact verify commands. Verify
  every agent PR yourself (merge-tree against main and the other open PRs, run the suite) before relaying.
- **Agents hit the usage limit mid-work**; resume them with SendMessage (context intact) and tell them to
  check their worktree's `git status`/`git diff` first. One said it had never actually stopped.
- **Never `pkill -f` a pattern**: an agent stopped its own server with `pkill -f "node app/serve.mjs"` and
  took the operator's 8130 server with it. Put "never stop servers you didn't start" in every brief.
- **`!` runs a command only at the very start of the operator's message**; mid-text it's just text.
- **Stacked PRs**: merging the upper PR merges into its base branch, not main; GitHub retargets only
  when the base branch is deleted — otherwise `gh pr edit <n> --base main`. Prefer unstacked PRs.
- **A physics estimate from a ledger is not the physics**: the whip's first "(b) lands a double" came
  from a cap bolted on at takeoff; built inside the trunk solve, the knee's load dip took the grip away and
  no double was reachable. Build it in the dynamics before asking the operator to choose.
- **Switching a mode on needs everyday inputs measured, not just its showcase**: the toe pick passed its
  own tests and still broke releasing a lean and pumping. Sweep release, pump, stroke, snowplow, rock-back
  with the mode forced on before proposing it for a setup.
- **Pin heading, not only speed**, in stroke tests: the free-leg snap spun the skater right round while
  the speed checks passed.
- Keyboard keys: check `game/full-controls.ts` ACTIONS keys and `app/pad.ts` before binding one (G was
  Choctaw and the lab's game toggle; H is Mohawk).
- The setup-mapping golden's encoding now writes a field that disappears as `null` (a push's `pushFoot`).
- `experiment()` in `test/setups.test.ts` reads `input.pushPower!` — an automatic crossover's push has none.
- Headless Firefox screenshots fail while the operator's Firefox is open; agents used headless Chromium on
  another port.
