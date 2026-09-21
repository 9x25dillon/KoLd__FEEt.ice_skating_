# Hand-off

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

## 1 · What this is

**Edgework** — a physics-first figure skating simulation. Mostly design specification; the first
code is a tuning rig, not the game. The repo is a complete plan for a 30-month, ~$11.9M production,
plus the machine-readable data and reference implementations that plan depends on, plus a browser
rig for tuning the blade–ice model before it is written in C++.

Owner: [@9x25dillon](https://github.com/9x25dillon). Public repo. Dual-licensed — see
[README](README.md#licensing), and **do not relicense without asking**: the split (docs
CC BY-NC-ND, code/data Apache-2.0) is deliberate and reasoned.

---

## 2 · Current state

| | |
| --- | --- |
| Documents | 8 in `docs/`, all complete |
| Data files | 12 in `data/` — 5 CSV, 6 JSON, 1 README |
| Reference code | 6 files in `src/reference/` — specifications-as-code, do not compile |
| Engineering material | `big_reffg.txt` — 3,711 lines, three concatenated documents, **has known defects, see §2.2** |
| Native foundation | `tools/ice-lab/native/` — C++17 serialization, CRC32 and deterministic math checked against an oracle pinned at replay `/5`; no native solver yet (PR #4) |
| Implementation | `tools/ice-lab/` (developed on `ue-replay-01-foundation`, merged to `main` through PR #14 — both branches level) — 458 tests, zero dependencies, engine-independent replay, camera, three courses with ghosts, jumps and the moves (both off by default) including every ISU "difficult" turn (bracket, twizzle, loop, rocker, counter) plus the Spiral and a real foot change mid-spin, a rhythm layer with real music, career/choreography with PCS (now including a lobe-variety Composition signal) wired in alongside the spin-level and step-sequence bonus, flow fully modelled (all three design-bible §2.6 bullets), HUD parity between the browser and Godot for turn kind/foot-change/PCS, three preset costumes built from data rather than hand-authored HTML, a standalone game (`game/`) with rink-boundary walls, and a Godot presentation (`games/ice-run-godot/`) with a second selectable skater |
| Rendered pages | 5, published as Artifacts **and** mirrored in `docs/web/` |
| Decisions | **4 of 6 closed.** D1 and D5 remain |

### The two open decisions — and they are one conversation

**D1 (budget/team)** and **D5 (disciplines at launch)** are coupled. The plan totals **$11.9M of
development**; D1's envelope quotes **$18–25M**. If that envelope is development-only, there is
~$6M of headroom, and the honest place to spend it is the second discipline D5 asks about. If it
includes marketing and year-one liveops, the plan fits as written. **Resolve them together, with
whoever holds the money in the room.**

### Decisions closed 2026-09-03 (previous session)

| | Decision | Note |
| --- | --- | --- |
| **D2** | Unreal Engine 5.4+ | Cancelled the pre-production bake-off; W1–2 became a single-engine validation spike |
| **D3** | Single-player first | Default; async ghosts + warm-up lobby at launch, pairs year one |
| **D4** | Adaptive tier routing | *Not* either option the register offered — The Patch recommends a tier from its own tracing score |
| **D6** | No athlete licensing | Closed at first writing |

**D2 is closed and stays closed.** It was raised again on 2026-09-09 as "should we build a game
engine" and the answer was no, for the reason the register itself gives: it was the only item with
a hard date, and every week it stayed open cost two engineers half their throughput. If a session
is asked to build an engine, say what D2 says and offer the Ice Lab route instead.

---

## 2.1 · `tools/ice-lab/` — what it is and how to run it

A 120 Hz, deterministic, **inertial** implementation of the blade–ice model with every constant on
a slider. It is EDGE-019's Ice Lab, built early and cheap, so `KoLdSimCore` can be written in C++ as
transcription rather than as discovery. **It is not the game and it is not an engine.**

```sh
cd tools/ice-lab
node --test test/*.test.ts     # 408 pass, ~30 s
node app/serve.mjs             # http://localhost:8123/
```

**Zero dependencies, and keep it that way.** Node 26 strips TypeScript natively and exposes the
stripper as an API (`node:module` → `stripTypeScriptTypes`), which is the entire build step. The
price is **erasable syntax only** — no `enum`, no `namespace`, no constructor parameter properties.
`test/boundary.test.ts` enforces that, and also enforces the rule the UE5 port depends on: `sim/`
never imports `app/`, never touches the DOM, a clock, or `Math.random`.

`tsconfig.json` exists for editors and an optional `tsc --noEmit`. It is the only thing in the rig
that wants anything installed. Tests and build do not need it. **On this machine nothing provides
`tsc`** — see §5 item 13 for the working recipe.

**Falling and getting up (added 2026-09-09, fifth session).** A fallen skater slides until the
tester does something. A *fresh* press of A / Space stands them up where they fell, at rest; the
press is consumed (not a stroke) and a button held through the fall does not count (new state field
`pushHeld`). This makes the plan's time-to-retry — "seconds from fall to next input" — the same
event as the sim's response. `downSeconds` is time on the ice until stand-up or reset. A stroke
also floors the knee at the neutral stance 0.35, because a straight leg cannot push and a pad with
RT released previously had zero push force. Scheme C gained the rocker on both sticks' fore/aft
(mean of the two, with A's sideways-bleed relief). **Schemes A and B were deliberately left as they
were**: a draft that gave both a right-stick weight/rocker channel was reverted, because A is under
test as §2.1 wrote it (three channels, not five) and a blade channel on B hands it a piece of A and
narrows the contrast the down-select measures. The commit message of `fb87c52` has the reasoning.

**Jumps, over the plan's refusal (added 2026-09-10, sixth session).** pre-production-plan §1 refuses
jumps, rotation, scoring and named elements in the prototype, admitting only a rotation-free hop from
W9. The operator was shown that and chose to have full jumps in the rig anyway, alongside the hop,
headless-testable scoring, the Edge Ribbon and the edge tone. **That is their decision; do not reopen
it, and do not loosen the containment either**: `jumpMode` is 0 in every preset, `?playtest=1` forces
it to 0, so no M2 or gate session can contain a jump. `sim/jump.ts` is `JumpResolver.cpp` (no jump
button — release the knee; ballistics fixed at takeoff; carriage the one air lever); `sim/score.ts` is
the jump half of `ScoreCalculator.cs`, reading the CSVs, with the data winning where the two disagree.
Replay contract is now `ice-lab-f64/3`; the fixture was re-recorded from its own inputs after its
kinematics were proven identical to `/2` (§5 item 14's procedure).

**Seeing the controls.** The operator asked for "something to visualize while running the engine" to
learn what each button does. The skater figure is drawn from state (feet on the solver's contacts,
arms from the save, tuck in the air), and the input panel shows hardware beside the mapped
`SkatingInput`. The panel is developer-only (off in playtest); the figure is not.

**The moves, over the same refusal (added 2026-09-13, ninth session).** Crossovers, the three-turn and
mohawk, twizzles, spins, the Ina Bauer, and jumps reached from those entries — the operator's list, in
`sim/moves.ts` and the solver, behind `movesMode` with the same containment as jumps (0 in every
preset, forced 0 in playtest, inert at 0). Two ideas hold it together. **A cusp is a change of frame,
not of physics**: lean and tilt are measured toward the heading's left, so when a turn reverses the
heading they all change sign with the body unchanged, and the edge code flips on the same tick
(`flipFrame`, counted in `s.flips`, which a control scheme reads to keep a held stick on its side of
the ice). **The moves are measured against the project's own data** — `motion-primitives.json` for
costs, `spin-positions.json` for inertia, `entry-templates.json` for entry speeds — with every
calibrated constant labelled a balance lever. The README's "The moves" section has all of it.

Read [`tools/ice-lab/README.md`](tools/ice-lab/README.md) before changing any of it.

### What the rig found

Eight things, each recorded as a test rather than prose, so they fail loudly if reverted.
**Findings 4, 5, 6 and 7 have been fixed in the rig** (2026-09-09); the defects stay reproducible
because `spec` still carries every one of them.

1. **`big_reffg.txt` contains both readings of the handedness.** One half correctly calls `Up × t`
   "the skater's left"; the other calls the identical expression "Right" and derives every edge
   code from it. Mirror images — one names an RFO where the other names an RFI. A takeoff-edge
   validator on the wrong one fails every jump in `data/jump-definitions.csv` while looking
   self-consistent. Settled in `sim/math.ts`; checked against every CSV row in
   `test/classify.test.ts`.
2. **The internal balance authority has its sign backwards.** A positive balance error needs a
   *positive* `a_int` to arrest it. As specified, arms and free leg push the skater further over.
3. **The two-blade lateral solve cannot pass its own acceptance test.** Full body mass per blade,
   applied Gauss-Seidel, so the first blade absorbs everything. Fixed — which surfaces a model
   fact: with capacity linear in load, both blades sit at *identical* demand ratios, so the weight
   split can never decide which lets go without sublinear capacity, which is not in the model.
4. **The specified gains cannot enter a deep edge from upright.** Holding 20° at 4 m/s is stable;
   reaching it is not. Instrumenting which clamp binds separates two different failures: at `spec`
   the **angulation limit** binds for 256 of 317 ticks (a controller limit), at `responsive` it is
   **maxTilt** for 215 of 314 (a physical one). Below ~5 m/s gains move the limit; above it only
   blade geometry does — at 6 m/s tripling the authority damping is worth 1°, sharpening the rocker
   to 1.6 m is worth 7°. Measured, deepest lean reachable from upright:

   | | 3 m/s | 4 m/s | 6 m/s |
   |---|---|---|---|
   | `spec` (Kd 8, angulation 20°, no rate term) | 4° | **11°** | 32° |
   | `spec` + finding 5's rate term, nothing else | 9° | **19°** | 43° |
   | `responsive` (Kd 16, angulation 40°, fixed) | 13° | **25°** | 44° |
   | `assisted` | 13° | **25°** | 44° |

   These are leans **reached**, not merely survived: each preset stays up about 2° deeper than it
   tracks. Quote the tracked number — the other one flatters.

   Two things it is not, both checked rather than assumed: **not an entry transient** (slewing the
   stick at 360 / 180 / 90 / 45 °/s changes the limit by nothing), and **partly the measurement
   horizon** — six seconds with no propulsion means speed decays, and at twenty seconds every
   parameter set collapses to 4–7° for no reason but lost speed. Measure the loop with losses off
   or with a stroke in the sequence.

   The table also carries the best thing the model says about the game: **speed buys depth, as v²**.
   With the controller fixed, `tan φ` tracks κ = g tan φ / v² to three digits — 1.777 measured
   against 1.778 predicted from 3 to 4 m/s.
5. **An assist tier that raises recovery authority makes balance worse.** `internalMax` 1.5 → 2.5
   falls at tick 77 instead of 617, and 2.0 outlasts both — a proportional gain with no damping.
   **Fixed** by `internalRateGain`, the missing rate half of the PD: arms and a free leg are swung,
   and what they are swung against is lean *rate*. 1.5, 2.5 and 3.0 now all skate the reference
   sequence. `validate()` rejects `internalMax > 2` with no rate term under it, so the mistake
   cannot reach a UE5 tuning asset. Cost, stated honestly: a 20° edge settles in 2.9 s under
   `assisted` rather than 1.7 s, because damping is what is being bought.
6. **A save is scored as a fall.** `balanceError` measures lean against the equilibrium the *edge
   alone* supports, and the balance-timeout test credits none of the internal authority — so using
   the arms and free leg **is** the fall condition, and the more authority a tier grants the sooner
   it fires. At `internalMax` 2.5 the reference sequence is declared over at tick 77, at **2.6° of
   lean**, upright, at 4 m/s, mid-recovery. **Fixed** by `fallAuthorityCredit` (0 in `spec`, 1 in
   the presets). It buys no depth at all — the entry envelope with credit alone is identical to
   `spec` — and it does not make the skater unfallable: an unholdable lean still goes down by
   `LEAN EXCEEDED`.
7. **The internal authority has no range limit, and will hold a lean forever.** Found by building
   control scheme B, which could not steer and should have been able to. A skater asked for a 20°
   edge settled at 13°, blade flat, going straight, indefinitely — arms and centre of pressure
   holding a lean the ice was not carrying, while the balance loop steered the other way trying to
   reach the edge it had been asked for. The arithmetic is exact: authority 2.74 m/s² against
   `g·tan(13°)` = 2.26 m/s², so it holds forever. **Fixed** by `internalWashout`, a high-pass on
   the arms term — what is held drains away, what changes still gets through — with the
   centre-of-pressure term deliberately exempt, because a 24 cm stance really can hold ~7°
   indefinitely and that is what standing still is. **This was invisible until finding 6 was
   fixed**: while the fall test credited none of the authority, these states timed out and fell, so
   the model looked honest for the wrong reason. Fixing one thing is how you find the next.
8. **Four mechanisms the package lacks**: variable effective rocker along the blade; lateral
   resistance on a flat blade; a rate-limited knee; and rotating rather than projecting velocity
   under the constraint.

**`DEFAULT_PARAMS` stays faithful to the spec so the defects remain measurable.** Working values
live in `PRESETS.responsive`. Do not "fix" the defaults — that hides the finding. The corollary,
which the second session had to obey twice: **a new parameter's default must reproduce the old
behaviour exactly.** `internalRateGain` and `fallAuthorityCredit` are both 0 in `spec`, so every
previously recorded number still measures the same thing, and both tests that broke when the
presets were fixed were rewritten around the *measured* replacement rather than loosened.

---

## 2.3 · Publishing it, and collecting what it measures

Two pieces, because a static host cannot collect anything and a collector should
not be the front door for contributors.

| | |
| --- | --- |
| **Public build** | `.github/workflows/pages.yml` — tests, builds, deploys to GitHub Pages. The tests gate the deploy. |
| **Collection** | `tools/ice-lab/app/collect.mjs` — serves the rig *and* takes `POST /api/session` into a JSONL file. Zero dependencies, one file, binds loopback. |
| **Deployment** | `tools/ice-lab/deploy/` — hardened systemd unit, a Caddyfile that strips client addresses from the access log, and a twenty-minute runbook. |
| **Contributors** | `CONTRIBUTING.md` and three issue templates. The docs licence needs the grant in it — see below. |

**An Artifact with a database cannot be used for this.** The `db` capability
makes an artifact organization-internal and *unshareable publicly*: every reader
and writer must be a signed-in member of the owner's org. That rules it out for
handing a link to a nephew, which is what it was being considered for. A plain
box with 180 lines of Node does the job with no accounts at all.

**The collector trusts nothing it receives.** Cards are rebuilt field by field
from a fixed schema — numbers coerced and rounded, strings stripped to a safe
alphabet, unknown fields dropped, bodies over 64 KB refused. No accounts, no
cookies, no analytics, **no IP logging**: the payload is numbers about a
simulation and nothing about a person, which is both the privacy position and
what makes two testers' sessions comparable.

**The docs licence blocks doc contributions and always did.** `docs/` is CC
BY-NC-**ND**, and a pull request editing a document is a derivative work.
`CONTRIBUTING.md` now carries a contributor grant (DCO sign-off plus a licence
back to the project for `docs/` changes) so the door is open without touching
the split, which stays as reasoned. It is written to be readable rather than
airtight; if a contribution ever matters commercially, both sides should want a
lawyer to look at it.

---

## 2.2 · `big_reffg.txt` — read this before trusting it

Committed unedited on 2026-09-09 (`1a0fa55`) because it is the source the Ice Lab was built against.
It is **three separate documents concatenated**, not one:

| line | document |
| --- | --- |
| 1 | Edgework Subsystem: Engineering Package v0.1 — `KoldSim`, 48 B blade, 16 B input, balance external |
| 636 | First 50 Engineering Tasks, KOLD-001..050 |
| 2502 | Edgework Build Package, EDGE-000..019 — `KoLdSimCore`, 80 B blade, 8 B input, balance integrated |

Known defects:

- **The first and third are incompatible designs sharing a name** — different modules, struct sizes
  and layouts, input quantization, and disagreeing on whether the solver owns balance or reports it.
- **They disagree on handedness** (see §2.1).
- **The 50-task list contradicts itself**: KOLD-012/013 give 48 B blade + 56 B body while KOLD-014
  asks for 256 B total (the sum is 152), and KOLD-015 says 16 B input where the third package says 8.
- **§6.2's classifier is truncated.** The `.cpp` stops mid-function at line 630, `if (F.bLobeOpen)`,
  and line 631 is prose from the second document. `FKoldEdgeClassifier::Update` has no body.
- **Its "repository unavailable, PENDING AUDIT" premise is stale.** `data/jump-definitions.csv`,
  `data/assist-tiers.json`, `data/step-features.json` and `src/reference/` answer most of its open
  questions directly, and D2 closed the engine question on 2026-09-03.
- **Where its ASSUMPTION values disagree with the design bible and `src/reference/SkateSolver.cpp`,
  the bible wins**: rocker 2.05 not 2.2/2.4, μ_skid 0.35 not 0.03, max lean 1.13 not 1.05/0.96.

---

## 3 · Conventions that hold the set together

Break these and the repo stops being coherent. They are not arbitrary.

### 3.1 Markdown is the source of truth; HTML is the rendering

Every phase and system document exists twice: `docs/*.md` (reviewable, diffable, PR-commentable)
and `docs/web/*.html` (the published Artifact). **Edit the markdown first, then mirror.** They
will drift if you do it the other way round.

### 3.2 Scoring is data, never code

The ISU revises its Scale of Values most seasons. Everything scoring-related lives in `data/` so a
rules change is a data patch shipped in days. **Never inline a base value, a threshold, or a level
feature into code.** See [`data/README.md`](data/README.md).

### 3.3 Every threshold is a balance lever, not a rule

Where the ISU says *"clear increase of speed"*, a human specialist applies judgement and a game
must pick a number. We picked 1.30. **Label these as design decisions wherever they surface** —
`data/spin-features.json` and `step-features.json` both carry this warning in their headers, and
`verified_against_isu: false` is set honestly. Do not quietly flip that flag.

### 3.4 Gate criteria are pre-commitments

Every phase gate has thresholds **signed before the data exists** — that is what stops a gate
becoming theatre. If you add a gate, add its sign-off date too.

### 3.5 Corrections are recorded, not silently applied

Three places the later documents deliberately correct the bible. Preserve these notes:

| Correction | Where |
| --- | --- |
| The Composer searches a **motion-primitive lattice in physics space**, not the motion-matching database | [composer-solver.md §2](docs/composer-solver.md#2--why-this-is-hard) |
| Mocap blocks 1 and 2 moved to the **vertical slice**; production gets a third, smaller block | [production-plan.md §6](docs/production-plan.md#6--mocap-block-3) |
| `spin-step-values.csv` gained the missing **level B** rows | commit `9de53a4` |

---

## 4 · Published Artifacts

Five live pages. **URLs are stable — always update in place, never republish as new.**

| Page | Artifact URL | Repo mirror |
| --- | --- | --- |
| Design bible | `claude.ai/code/artifact/58f6234d-6ece-4f55-8fc5-2b7a7ce86da9` | `docs/web/index.html` |
| Pre-production | `claude.ai/code/artifact/531a5952-fcfd-44bf-966a-ae31ce3562c9` | `docs/web/pre-production.html` |
| Vertical slice | `claude.ai/code/artifact/dde9b2ad-4d31-412f-a15e-6edbb6cc305a` | `docs/web/vertical-slice.html` |
| Production | `claude.ai/code/artifact/6a36f22c-3ed6-4439-828b-cd14759ebaca` | `docs/web/production.html` |
| Beta | `claude.ai/code/artifact/bdd4ebbf-b24e-4b31-bcf3-9afdce6a4e53` | `docs/web/beta.html` |

### To update one from a new session

1. Edit the markdown in `docs/`.
2. Edit the mirror in `docs/web/`.
3. Publish **passing the `url` parameter** from the table above. Without it you create a *second*
   artifact instead of updating the existing one.

The mirrors in `docs/web/` exist precisely so a new session never needs the previous session's
scratchpad — which does not survive.

### Shared visual identity

All five pages use one stylesheet: Bodoni Moda (display) × IBM Plex Sans (body) × IBM Plex Mono
(data), cool grey-white ground, arena-amber accent `#9c6b12` / `#e2a94e`, steel-teal `#2c6773` for
data, double-hairline section rules echoing a blade tracing. **The bible's stylesheet is the
richest** (it has the syntax-highlighting classes); the four plans share a slightly reduced one.
If you add a sixth page, copy the head from `docs/web/production.html`.

---

## 5 · Things that will trip you up

**Documents and shell**

1. **The shell is `fish`.** Heredocs (`cat > f <<'EOF'` and `python3 - <<'PY'`) work fine through
   the Bash tool and were used throughout both sessions. What differs is **globbing**: an unmatched
   glob is a hard error, not a pass-through — `ls LICENSE*` fails with *"no matches found"* rather
   than printing nothing. Quote globs you are not certain match.

2. **Do not write HTML entities into source files.** `src/reference/SpinResolver.cpp` was written
   with `&amp;` and `&lt;` and needed an unescape pass. If you have just been authoring an HTML
   page, consciously switch modes before writing a `.cpp`.

3. **Exact-match edits fail across the md/HTML pair.** The same sentence is line-wrapped
   differently — e.g. `None, no HUD` (markdown) vs `None, no HUD at all` (HTML). **Grep the target
   file for the actual string before constructing the edit.**

**The Ice Lab**

4. **Erasable syntax only.** An `enum`, a `namespace`, or a constructor parameter property compiles
   under an IDE and then fails at `node app/build.mjs`. `test/boundary.test.ts` catches all three —
   run the tests before assuming a change is fine.

5. **A skater with no propulsion always falls, and it looks like a controller bug.** Speed decays
   through friction and drag, the maximum holdable lean falls as `κ = g·tan φ / v²`, and eventually
   any commanded lean is unholdable. Roughly five seconds from 5 m/s. **Before debugging the balance
   loop, check the speed at the moment of the fall** — an afternoon went into gain sweeps that a
   single speed trace would have ended. Test sequences must either stroke (`push: true` every ~90
   ticks) or disable losses.

   **The same trap contaminates measurements, not just debugging.** The entry-envelope numbers are
   partly a function of how long the run is: at six seconds `spec` reaches 11° at 4 m/s, at twenty
   seconds it reaches 4°, and the difference is entirely lost speed. Any number quoted about the
   balance loop needs its horizon quoted with it.

6. **Measure before asserting.** Several tests were written with guessed bounds and had to be
   loosened to the measured value. Print the number first, then write the assertion around it —
   otherwise a passing test is only recording the guess that happened to be generous enough.

7. **Piping a long background command to `tail` hides it.** `npm test | tail` in the background
   produces an empty output file until the command exits, which reads exactly like a hang. Give
   long runs a generous timeout and read the raw output file, not a filtered tail.

8. **Trace once before sweeping anything.** Both of this session's findings came out of two
   diagnostics — print the loop's own variables each tick, then print *which clamp is binding* each
   tick. That took twenty minutes and pointed straight at the mechanism; the parameter sweeps
   afterwards only confirmed sizes. A sweep tells you a number moved. A trace tells you why, and
   the why is what turns out to be wrong.

9. **A fixed defect is how you find the next one.** Finding 7 was invisible while finding 6 stood:
   the states where the arms hold a lean forever used to trip the balance timeout and fall over, so
   the model looked honest for the wrong reason. After every fix, re-measure the things the fix was
   not about — the entry tables moved by 1–3° and nothing in the change touched them.

10. **A "control" parameter set built by subtracting fixes from a preset will rot.** Two tests
    constructed "as the package specifies it" as `{...PRESETS.responsive, someFix: 0}`, so the next
    fix leaked straight into the control case and both tests failed for the wrong reason. Build
    control cases by ADDING to `spec`, which is the baseline by definition.

11. **`python3 - <<PY` patches that do not assert their match will lie to you.** A `.replace()`
    whose pattern is absent is a silent no-op, so a whole import line was never added, the build
    "succeeded" (type stripping checks nothing), and the page died with `ReferenceError` in a
    browser. Every patch in this session that asserted `old in s` was fine; the two that did not
    were the two that broke. **Assert the match, always.**

12. **`sim/` has no type checker in this environment.** `tsc` is not installed and the build only
   strips types, so a slider naming a parameter that does not exist, or a state field never
   initialised, reaches a browser silently. `test/boundary.test.ts` catches the syntax rules; for
   `app/`, `test/app-loads.test.ts` imports every module against a DOM stub **and constructs the
   lab**, which is the part that matters: importing a module only proves its imports resolve, not
   that the code runs. A missing binding used in a class field linked cleanly and threw in the
   browser.

13. **The npx cache holds a decoy `tsc`.** `npx tsc` prints "This is not the tsc command you are
   looking for" and the only real TypeScript on disk is 5.5.4 in Trash, too old for
   `erasableSyntaxOnly`. Working recipe: `npm install typescript @types/node` in a scratch dir,
   then from `tools/ice-lab`: `<scratch>/node_modules/.bin/tsc --noEmit -p . --typeRoots
   <scratch>/node_modules/@types`. TS 7.0.2 checked the tree clean on 2026-09-09.

14. **The replay digest hashes the whole `SkaterState`.** Adding a field, even one with no effect
   on kinematics, moves every digest and fails `test/replay.test.ts` on tick 1. The rule in
   `sim/replay.ts` is: bump `REPLAY_SOLVER`, re-run the fixture from its own recorded inputs, and
   prove whether kinematics changed by replaying through the previous solver
   (`git archive origin/main tools/ice-lab/sim | tar -x -C /tmp/oldsim`, then compare final
   state). Never regenerate just to make CI pass. `/1 → /2` was done this way for `pushHeld`.

15. **Fetch before you push.** The first push of `fb87c52` was rejected because PR #3 had landed
   on `main` mid-session. A clean rebase followed, but the fixture test then failed for the reason
   in item 14. `git fetch && git log HEAD..origin/main` before committing would have surfaced it.

16. **A leading `=` in a shell argument is a command lookup.** `echo =====X` fails with
   "=====X not found". Quote separators or start them with another character.

17. **The balance overlay was mirrored until 2026-09-10.** It drew the COM at
   `base − perpLeft·L·sin(lean)`, outside every turn. Any screenshot or play note about "the purple
   line" from before `7f113ca` described the mirror image. `pendulum()` in `app/draw.ts` now reads
   the COM off `pos`, and `test/draw.test.ts` holds it there.

18. **The Edge Ribbon and edge tone are on in playtest**, because the plan builds them as channels
   under test. Sessions recorded before 2026-09-10 had neither, so they are a different condition —
   do not pool them with later M2 data.

19. **A jump's landing inherits the `EdgeChanged` caveat.** Contact returns as NONE→edge, like a
   stand-up. Irrelevant while jumps are off in playtest; fix it with the other one if that changes.

20. **The canvas stub in `test/app-loads.test.ts` has no `measureText`** and returns `undefined` for
   every call. Anything in `app/` that reads a return value from the 2D context throws there first.

21. **A replay recorded in one JS engine may not verify in another** — see §0 item 2. A divergence
   on a Firefox clip is not evidence of a solver bug until it has been replayed in Firefox.

22. **A pasted clip gets a newline every 10,000 characters.** `replay-4` arrived that way and failed
   `JSON.parse`. The recorder never writes newlines, so stripping every `\n` restores it, and the
   per-tick digests prove the repair was lossless. Repair a copy in the scratchpad; the operator's
   file stays as they left it.

23. **`schema` on a session card is a format version, not a session counter.** One card arrived
   hand-edited to `edgework-session/2`. The collector rebuilds cards and treats the field as the
   format; number sessions in the filename.

24. **The Bash tool's shell is zsh here, not fish or bash.** An unquoted `$var` does not word-split:
   `for cfg in "0 5 0.25"; do node x.ts $cfg` passes one argument and every number reads as NaN — a
   run of all-zero traces that looks like a physics result. Use `${=cfg}`.

25. **After a turn, lean and tilt have the opposite sign for the same body.** Anything reading
   `s.lean` across a turn must follow `s.flips`. A test driver that does not mirror its stick at a
   flip leans the skater out of the circle it was on; every moves test does the mirror by hand, the
   way `latchTurns` does for a player.

26. **Stroking and crossovers top out near 8.7 m/s**, where the pushing blade — at its 20° push edge,
   carving nothing — reports its own skid and friction. Pre-existing, in `spec` too, and a plausible
   ceiling; do not mistake it for drag.

27. **Enter an Ina Bauer with the lean already in.** Pressed while the balance loop is still rolling a
   lean in (the blade first tilts the other way), it starts on inside edges, correctly for the tilt it
   found. Measured runs lean first.

28. **Jump outcomes with the moves on depend on approach speed**, so a jump test copied from
   `test/jump.test.ts` into moves mode comes out lower unless it approaches at the jump's entry speed
   (`ENTRY_SPEED`, from `data/entry-templates.json`). The turns test's salchow had to move from 6.3
   to 7.0 m/s for exactly this reason.

29. **A new `Params` or `SkatingInput` field is not done until three places agree, plus a fixture.**
   `sim/replay.ts`'s `parseReplay` hand-enumerates every allowed key for both, twice over (once as the
   required-fields list, once as the type-checked subset) — separately from the interface in
   `sim/types.ts`/`sim/params.ts` and separately from `DEFAULT_PARAMS`/`NEUTRAL_INPUT`. Miss the
   `replay.ts` list and the *old, already-committed* fixture starts failing with "unknown field" or
   "missing field" on a field that was never touched. Bump `REPLAY_SOLVER` and re-record the fixture
   from its own inputs every time (item 14), for `SkatingInput` changes exactly as much as for `Params`.

30. **State the sign of a dot product in a comment before writing the conditional that uses it.** A
   wall bounce's velocity-dot-outward-normal is positive when *still heading out* and negative when
   *already heading back in* — "into the wall" is the intuitive name for the first case but describes
   the second just as easily in English, and the collision code was written backwards on the first
   pass. A test with a skater already leaving the boundary caught it before anything shipped; it would
   not have been obvious from playtesting alone, since a wrong sign here still looks like *some*
   physical response, just the opposite one.

31. **A new "check near zero, then continue" state can collide with an existing "too slow, exit"
   condition — check the interaction, not just the new state's own floor.** The spin reversal's first
   attempt set `spinReverseFloor` (an angular-momentum floor to flip at) using a plausible-looking
   number against typical entry angular momentum, never checking it against `spinMinOmega` — the
   *pre-existing* "the spin is too slow, check out" exit, which reads `omega = angMomentum / inertia`,
   a DIFFERENT quantity that varies with position (upright vs. camel is a ~9× inertia swing). The
   reversal's own floor was comfortably above zero but still corresponded to an omega already below
   `spinMinOmega` at high inertia, so the pre-existing exit fired first and the spin just ended instead
   of reversing — invisible until a driven probe script actually printed `angMomentum`/`omega` per tick
   and showed the exit firing before the flip. Fixed by exempting the pre-existing exit for exactly as
   long as an active check is in progress, not by re-guessing the floor. The general lesson: before
   picking a threshold for new behaviour that shares a state machine with existing behaviour, trace
   what the OLD conditions evaluate to at the new state's own boundary — a probe script first, a
   constant second, the same order `sim/moves.ts`'s existing findings 4–7 already established for a
   reason.

32. **`app/build.mjs`'s data-file copy list is curated by hand and does not notice a new `fetch()`.**
   `game/main.ts` fetching a new `data/*.json` file works perfectly in every test that imports the
   module (which never fetches anything) and fails silently — a plain 404, no thrown error anywhere —
   in the actual served build, which is the only thing a player or a Playwright check against
   `localhost:8123` ever sees. Caught only because a live browser check was run against the built,
   served output rather than trusted from the test suite being green. `test/app-loads.test.ts` now
   scans `game/main.ts`'s own `fetch("../data/...")` calls against `build.mjs`'s list directly, so this
   specific gap cannot recur silently — but the general shape (a curated file list next to a dynamic
   fetch) can recur elsewhere; check for it deliberately when adding a new fetched asset anywhere.

33. **`docs/fidelity-report.md` is generated but its own header names `REPLAY_SOLVER` verbatim — a
   version bump changes its *text* even when the gate's own PASS/FAIL result does not move at all.**
   "Nothing this session touches the fidelity gate's own solver corpus" is true and is not the same
   question as "is the report's committed text still what the generator would produce right now" —
   CI checks the second one, on every push, via `git diff --exit-code` after regenerating. After ANY
   `REPLAY_SOLVER` bump, actually run `node tools/ice-lab/validate.mjs --report docs/fidelity-report.md`
   and commit whatever it produces, even a one-line diff, rather than reasoning from "the gate result
   can't have changed" to "the file needs nothing." Caught by CI on PR #12, not before pushing it.

---

## 6 · Where to go next

In descending order of value:

1. **Close D1 and D5 together.** Everything else is downstream of the money. Unchanged.
2. ~~**Fix what the Ice Lab found, in the rig, before any C++ is written.**~~ **Done**, 2026-09-09
   (second session): findings 4, 5 and 6 are fixed, `spec` still carries the defects, and every
   number is a test. What is left of this item is the part a keyboard cannot answer — whether the
   fixed loop *feels* like skating, which is item 3.
3. **Take the rig to a skater.** It renders edges, carve circles, force vectors, the equilibrium
   lean and a live tracing, and exports per-tick CSV. The question the whole project is downstream
   of — §7 below — is now answerable by someone who skates, on a laptop, in an afternoon. Record
   the session in `docs/tuning/` and export the parameter set with the panel's **params.json**
   button, which emits only what differs from `spec`.

   **The rig is now set up for the plan's own M2, not for the kill gate.** Read
   [pre-production-plan.md §3, §6 and §7](docs/pre-production-plan.md) before running anyone:

   - **All three schemes exist** — A *Lean & Load* (bible §2.1), B *Steer & Load*, C *Two-Foot* —
     cycled with **M** or **Back**, labelled A/B/C on screen and nowhere identified, because §7
     requires the labels be blind to the testers *and* the observers.
   - **`?playtest=1`** hides the sliders, the preset name and the exports. A tester gets a rink and
     a letter.
   - **The session export** is the five §6 metrics the rig can compute, under that document's
     definitions, plus the scheme and the parameters. No names, no accounts, no free text.
   - **Two pre-existing metric caveats to settle before gate data exists** (found 2026-09-09,
     fifth, left alone on purpose): B's LB/RB pick the foot, and for a given turn direction foot
     choice *is* inside/outside edge choice, so B's stated trade is partly leaky; and
     `EdgeChanged` counts the NONE→edge transitions after every reset and stand-up (~2 per fall).
     Both change what a number means, neither is hard to fix.
   - **W8's M2 is the milestone this serves**: *"eight team members plus eight friendly externals,
     blind A/B/C, ranked. Soft gate: down-select 3 → 2."* Friends and family are friendly
     externals, and their data legitimately chooses a scheme. It can **never** feed the W16 kill
     gate, which excludes *"anyone who knows the team"* — and W13's protocol pilot exists precisely
     so a first run debugs the protocol rather than the game. Its data is discarded by design.

   **Start them on `responsive`, not `spec`.** `spec` cannot enter an edge deeper than 11° at
   stroking pace, which is not a fair test of anything. The two questions worth putting to a skater
   first, because the rig now has an answer to check against: does depth arriving with speed feel
   like a reward or like a lockout, and is 2.9 s to settle a 20° edge under `assisted` help or
   sludge?
4. **Then port `sim/` to `KoLdSimCore`.** It is written to be transcribed: SI throughout, plain
   data, no allocation in `step`, every transcendental through one module, truncating checksums,
   and an edge code whose spelling already matches `data/jump-definitions.csv`. **Started 2026-09-13**
   as UE-REPLAY-01 (`tools/ice-lab/native/`, PR #4): the wire types, serialization and math are
   checked against a pinned `/5` oracle; the solver transcription is next (§0).
5. **Verify the ISU data.** `spin-features.json`, `step-features.json` and `scale-of-values.csv`
   are faithful models, not transcriptions, and all carry `verified_against_isu: false`.
6. **Build the protocol validation corpus** — 50 published elements reconstructed against the level
   detector, target ≥85% agreement. Needs Composer v0, so it belongs to the vertical slice.

### Not in the rig, deliberately

A genuine choctaw is the last remaining ISU "difficult"-turn-adjacent gap — bracket, twizzle, loop,
rocker and counter are all real as of 2026-09-14/2026-09-18; see §0 for why choctaw needs a genuinely
different mechanism from the one that made rocker/counter tractable. The six ISU "step" types (chassé,
toe step, cross roll, running step, cross behind/in front) remain unbuilt with no data behind any of
them at all (`data/motion-primitives.json` has none of the seven) — only change-of-edge and the
rig-specific crossover count toward `sim/stepLevel.ts`'s own ceiling from that category. Jump
combinations and sequences; animation, networking. The stroke is the bible's semi-analytic push, not a
leg model. The profile layer (2026-09-11) exists but nothing moves its stats yet. The moves
(2026-09-13), the bracket (2026-09-14), the Spiral, and the foot-change/loop/rocker/counter family
(2026-09-18) all exist, contained; see §0. A rhythm layer and rink-boundary collision (2026-09-14)
exist in `game/`, both game-layer and both deliberately outside what a replay verifies; see §0. A
dedicated full-move-list control scheme, with its own tuning rig, is wanted but unbuilt (§0 item 9,
2026-09-18).

### Known gaps, all deliberate

Tracked at the foot of [open-decisions.md](docs/open-decisions.md): balance-model tuning constants
(**the Ice Lab is now the instrument for these** — they were "cannot be derived, they come from the
feel prototype"), crowd reaction propagation timing, career economy, and ice temperature as a
career variable.

---

## 7 · The one thing that matters most

Everything in this repo is downstream of a single unproven claim: **that analog lean plus analog
knee pressure is a good primary verb.** No shipped game has used it.

There is a real kill gate at pre-production week 16 — *"is carving fun with no jumps, no score and
no art?"* — with pre-committed thresholds, a decision-maker who is **not** the person who invented
the scheme, and the authority to stop the project.

If a future session is asked to soften that gate, move its thresholds after seeing data, or let the
creative lead vote on it — **push back.** Those three properties are the only reason the gate is
worth having.

---

## 8 · Session log

| date | what happened |
| --- | --- |
| 2026-09-18 (fourteenth, part four) | Rocker and Counter (`sim/moves.ts`'s `TURN_KIND.Rocker`/`Counter`): re-examined a gap `sim/types.ts` had documented as needing "a third, different mechanic" and found it did not — `travelSense` pinned to `entryDir` regardless of cusp parity, one more case in `turnPivot`. Found and fixed two real bugs live: `rockerCounterStick` unreachable by keyboard (game/controls.ts's own 0.35 digital-lean scale-down), and the reversal check's sign was wrong for a bracket entry (`against` already inverts `T.dir`, fixed with `curveSense`). `sim/stepLevel.ts`'s ceiling reaches grade 3 (all five ISU difficult turns real). `7075485`. |
| 2026-09-18 (fourteenth, part three) | The loop turn (`TURN_KIND.Loop`): hold `turn` through the ordinary cusp instead of releasing — the same pivot run to a second cusp, landing back on the entry edge/foot/direction. Found and fixed: `turnEvent` firing on every cusp (harmless with one cusp) fired twice for a loop's two. Measured cost lands almost exactly on the data's own -0.9 m/s with no new tuning. `e78be47`. |
| 2026-09-18 (fourteenth, part two) | The Spiral (`data/motion-primitives.json`'s declared-but-unbuilt move): one blade, free leg extended, any direction, reached through the Ina Bauer's own button and distinguished by weight distribution — no new input field. Found and fixed a real gamepad conflict: LB+RB together collapsed `weightR` to 0.5 before the Spiral/Ina-Bauer branch could read it; `app/pad.ts` now remembers the pre-combo weight. `1374333`. |
| 2026-09-18 (fourteenth, part one) | PCS wired into `game/career.ts` (discipline/segment key on `CareerEvent`, scored once at routine end) and a real foot change mid-spin (`sim/moves.ts`'s `spinTick`, a fresh toe press starts a brief airborne transfer) — unlocks three more `spinLevel.ts` features, honest ceiling reaches the ISU's own level-4 clamp. `7f1d5ce`. |
| 2026-09-17 (thirteenth, part seven) | Step sequences: `sim/stepLevel.ts` scores `data/step-features.json`'s variety ladder (honest ceiling grade 1/4, six observable types against a seven-type bar); a new `step` `ELEMENTS` entry in `game/career.ts`, Composer-authorable in Godot. Found and fixed: `step-features.json` 404'd in the real served build (`app/build.mjs`'s copy list never had it), a new regression test now guards it. `f82c400`. |
| 2026-09-17 (thirteenth, part six) | Program Component Score (`sim/pcs.ts`): the formula and `componentFactor` transcribed from `data/segment-rules.csv`, matched against `ScoreCalculator.cs`'s own comment; the physics-to-0..10 mapping openly authored, not transcribed, and the file says so. `IceGrid` gained `coverage()`. Standalone, tested, not yet wired into `career.ts`. `9b895d3`. |
| 2026-09-17 (thirteenth, part five) | Flow's "dead air between elements" — the clearest of its three remaining unmodelled bullets. Replay `/15`, the second bump this session checked directly against the fixture rather than assumed safe. `6c574c5`. |
| 2026-09-17 (thirteenth, part four) | Mid-spin direction reversal (`both_directions`): a held, opposite stick checks a spin's angular momentum to near zero, then flips and regenerates it — `spinLevel`'s honest ceiling moves from 2 to 3 of 10. Found and fixed a real interaction bug: the pre-existing "too slow" exit fired during the deliberate near-zero dip a check is. Replay `/14`. `832e62a`. |
| 2026-09-17 (thirteenth, part three) | Godot HUD gained a live spin-level readout (`bridge/engine.mjs` tracks it the way `game/main.ts` already did), beside the jump TES total the bridge had computed but never shown either. `0cb796e`. |
| 2026-09-17 (thirteenth, part two) | A second, selectable Godot skater, the Black Berserker, built on `build_skater.py`'s exact armature so `scripts/skater.gd` keeps posing it correctly; Settings → Skater. `a55e8f4`. |
| 2026-09-17 (thirteenth, part one) | The oldest open thread in this file, closed: the Slalom (`app/edges.ts`) scores a real designed curve (RMS off its own `guideY`), the same pattern the Figure Eight already proved. `sim/ice.ts`'s grid now also backs a persistent, uncapped whole-run trace, painted incrementally, gated on `iceGridMode`. `ef91292`. |
| 2026-09-17 (twelfth, part four) | The same gap, found and closed twice more: hype/flow reached career XP (averaged over a routine, same anti-farming gate as the medal), then a career routine's real jump TES and real spin level did too (15 XP/point, 40 XP/level). `c0ce9e8`, `fbb7eee`. |
| 2026-09-17 (twelfth, part three) | A spin's ISU level, for the first time (`sim/spinLevel.ts`) — 2 of the design bible's 10 features, the other 8 named individually as out of reach (pose data; a combination-spin or direction-reversal mechanic this rig does not have). Scored from `data/spin-features.json`, never hardcoded; wired into `game/main.ts`'s HUD. Verified live: a real held spin scored level 2. |
| 2026-09-17 (twelfth, part two) | Wired the ice grid, stamina, hype and flow into the actual game — `GAME_PARAMS` had never turned any of the four on. Found the same replay-determinism bug twice: `ReplayPlayer` and the Godot bridge's `engine.mjs` both never owned an ice grid, so a live-recorded session would have silently diverged on playback. New HUD: Wind/Legs, Hype, and an EDGE bar (not "flow" — a pre-existing, unrelated FLOW meter already existed). Verified live in headless Chromium via a borrowed Playwright install. `a9ecac4`. |
| 2026-09-17 (twelfth, part one) | Closed the entire tenth-session queue: the carve question (designed curve, chosen over a replay ghost — `sim/ice.ts`, replay `/10`), the career module's stat-balance link (`medalCap`/`statCap`), and stamina pools (Wind/Legs, replay `/11`), hype (replay `/12`, and a found-and-fixed bug: landings never reached music credit), and flow (bible §2.6, replay `/13`). `0bb3a53`, `68f6088`, `8686590`, `4635e92`. |
| 2026-09-15 (merge completion) | Found another session's `origin/main` → `ue-replay-01-foundation` merge mid-flight: all 13 conflicts hand-resolved in the working tree, nothing staged or committed. Verified the resolution rather than trusting it — the `test/rink.test.ts` rename, the `/9` replay renumbering, and the **U**-key split were all done correctly — fixed one real `tsc` bug it hadn't caught (a `strictEqual` "asserts" narrowing pinning `IceEffects.landing` to `null` across a later method call in `test/game-effects.test.ts`), regenerated `docs/fidelity-report.md` against the merged solver, and confirmed 322 + 8 tests, build, replay verify and the fidelity validator all clean before committing and pushing. `32f6d3c`. |
| 2026-09-15 (career/Godot resume) | Recovered another interrupted session's in-progress work on the operator's ask to continue and commit/push: a browser career mode (`game/career.ts` — events, choreography, medals, unlocks, XP, local saves) and `games/ice-run-godot/`, a playable Godot project whose Node pipe host runs the unchanged Ice Lab simulation, not yet a native physics port. 296 + 8 tests pass; both the editor and a Linux export completed a full career routine. Did not touch `main`. |
| 2026-09-14 (tenth) | The bracket, a redesigned skater, and rink walls: `sim/moves.ts` gained a same-foot, against-the-curve turn (replay `/8`); `game/scene.ts` gained a skirt and a ponytail; `game/rink.ts` gave the game a rounded-rectangle boundary to bounce off of or crash into, deliberately outside what a replay verifies. A "choctaw" was built and removed the same session when a test showed it wasn't one. 280 tests. `667b3a9`. |
| 2026-09-14 (tenth) | The rhythm layer and real music: `sim/music.ts` (replay `/7`) gives crossover pushes a beat window and turns/landings musical credit near an accent, off in every preset. Five of the operator's own tracks, found in a sibling worktree after some searching, now play for real via `game/audio/`; their tempo is `aubiotrack`'s estimate, halved for a likely octave error. Operator laid out a future stamina/flow/hype bridge to the career module, not built. 271 tests. `3b93279`. |
| 2026-09-14 (tenth) | Took over another session's in-progress game (`game/`): fixed a blank-page crash (missing DOM ids), cleaned up a doubled-up README draft, verified all three modes in headless Chromium. 262 tests. `23e675b`. |
| 2026-09-13 (parallel: UE-REPLAY-01) | A separate session, per its commit and `Kold_Feet_Summary_report.md`: the native replay verification foundation in `tools/ice-lab/native/` — C++ wire types and an oracle generated from Git objects pinned at `8d89af2` (`/5`), canonical serialization, CRC32 and deterministic math checked under GCC and Clang, CI wiring; no native solver, importer, runner or Unreal host. Merged as PR #4 (`a0ffada`); its report is on `ue-replay-01-foundation` (`effc0e5`). |
| 2026-09-13 (ninth, after the merge) | Merged the moves into `main` and pushed. Then finding 9 on the operator's word: the two-footed stance was proportional-only and aimed at the edge's balance, so it pulled against the lean controller and a 20° two-footed entry at 4 m/s fell. `copRateGain` and `copCommandShare`, 0 in `spec`, on in the presets; standing still bit-for-bit unchanged; replay `/6`; `test/stance.test.ts`. 249 tests. |
| 2026-09-13 (ninth) | The moves, on the operator's redirect toward backward skating and "back crossovers right into the jump": crossovers (`8da3a2a`), three-turn and mohawk (`aee316c`), twizzles (`a282cf7`), spins (`e10e6a7`), the Ina Bauer (`33986ce`), edge and toe jumps from their entries with the approach in the lift (`1e38ad0`). All behind `movesMode`, contained as jumps are; calibrated to `motion-primitives.json`, `spin-positions.json` and `entry-templates.json`. Found: the bible's crossover feet are backwards; a stroke on a curve always halved lateral support; two-footed lean commands lock at maxTilt at 4 m/s. Moves-off proven identical to `/4` over 22,184 ticks at every commit; replay `/5`. Driven in headless Chromium with a fake pad. 244 tests, tsc 7.0.2 clean. Branch `ice-lab-moves`, local, unpushed. |
| 2026-09-11 (eighth) | The skater profile layer, on the operator's direction toward a career game: `sim/profile.ts` — body, blade wear, five stats baked over a preset by `applyProfile`, one balance table and curve, XP pricing, `train`/`overall`/`tierOf`/`level`. Reference skater bakes bit-for-bit to every preset. Stamina listed and inert, recorded by a test. K cycles four samples in the lab. 194 tests, tsc 7.0.2 clean. `00ec259`. |
| 2026-09-11 (seventh) | Closed the sixth's three items: edge changes count choices not strokes (`f1cb2b4`), deterministic sin/cos/tan/atan2/asin/log in `sim/math.ts` with a boundary test banning raw `Math.*` transcendentals and `**` in `sim/` (`0b4636b`), session card `/2` with jumps and a clip digest (`87607af`). Then the game layers: debug camera and chase view, the Figure Eight with best-run ghosts, ghost races on any course, the edge course, the jump challenge from `data/`, and all of it on a pad. Every layer reads state and never writes it, tested; all unreachable in `?playtest=1`. |
| 2026-09-10 (sixth, after push) | Served the lab for the operator's first play sessions. Found the stroke-inflated edge-change metric (measured), the Firefox-vs-Node replay divergence (confirmed by verifying in headless Firefox), and a paste-wrapped clip (repaired losslessly in scratch). No code changed after `34fecd8`. |
| 2026-09-10 (sixth) | Reviewed and finished an uncommitted reskin: skater figure rebuilt on the solver's contacts, new input panel, mirrored COM overlay fixed (`7f113ca`). Then, on the operator's explicit choice over pre-production §1: `sim/jump.ts` (hop + full jumps, off by default and in playtest), `sim/score.ts` from `data/`, Edge Ribbon, edge tone, toe pick and carriage inputs. Replay `/3`, fixture re-recorded with kinematics proven identical. `e` given a numeric 0.80 factor in the calls CSV. 131 tests, tsc 7.0.2 clean. |
| 2026-09-09 (fifth) | Review of an unreviewed six-file draft against the kill-gate experiment, not just the tests. Kept and finished: fall recovery (fresh-press, in place, consumed), knee floor on strokes, C's shared rocker. Reverted: right-stick weight/rocker on A and B, for narrowing the A-vs-B contrast. Failing session test kept its assertions; only the stimulus changed. Replay contract bumped to `ice-lab-f64/2` for the new state field, fixture regenerated with kinematics proven identical. 105 tests. `fb87c52`, rebased onto PR #3. |
| 2026-09-10 | Replay milestone: exact mapped inputs, tuning snapshots, full-state/event digests, bounded five-minute capture, browser playback and a headless verifier. Pause/resume fixed. A 240-tick fixture and PR checks cover the regression contract. 97 tests pass locally on Node 24.19; browser visual QA was blocked by the environment's localhost access restriction. C++/UE5 remains the next port, not an implemented runtime. |
| 2026-09-02 → 03 | Specification completed. D2, D3, D4, D6 closed. Five Artifacts published and mirrored. |
| 2026-09-08 → 09 | `big_reffg.txt` reviewed and committed with its defects recorded. `tools/ice-lab/` built, 56 tests. Six defects found in the engineering package, each captured as a test. D2 re-raised and re-closed. Merged as PR #1 (`fbbf83c`). |
| 2026-09-09 (fourth) | Publishing and playtest prep. Pages workflow, a session collector, CONTRIBUTING with a contributor grant, and three issue templates. Control schemes B and C built, labelled A/B/C blind, `?playtest=1` mode, and the plan's §6 session metrics. An eighth finding: the internal authority holds a lean forever, found because B could not steer. 82 tests. |
| 2026-09-09 (fourth, part one) | Publishing and playtest prep. Control schemes B and C built, labelled A/B/C blind, `?playtest=1` mode, and the plan's §6 session metrics. An eighth finding: the internal authority holds a lean forever, found because B could not steer. 78 tests. |
| 2026-09-09 (third) | First play report on a pad. `app/pad.ts` had applied a per-axis deadzone while its own header described a radial one; fixed, plus fore/aft cross-talk suppression and a second control scheme on M / Back. The root URL served a blank rink and now redirects. 68 tests. |
| 2026-09-09 (second) | The controls. Findings 4 and 5 fixed and a seventh found: the fall test scores a save as a fall. Two new parameters, both defaulting to the spec's behaviour; `validate()` now rejects the assist tier written the wrong way. 64 tests. |

### How the 2026-09-09 session ran, for whoever runs the next one

(The ninth session's shape, 2026-09-13, is at the end of this section.)

The shape that worked: **assess first, recommend once, then build.** The session opened as a
review of `big_reffg.txt`, pivoted to "can this other repo become a game engine", and the useful
move was to answer the question that was asked, then say plainly that the obvious next step
collided with a closed decision — rather than either building the wrong thing or refusing.

The second session's shape was different and worth naming too: **trace, then measure, then
assert.** Every claim in §2.1 finding 4 and 6 came from printing the loop's own variables and the
binding clamp per tick, before any parameter was moved. Two hypotheses died that way in the first
twenty minutes — that the entry failure was a step-command transient (slewing the command changes
nothing) and that the tick-77 collapse was an oscillation (it is a detector firing at 2.6° of lean).
Both would have survived a parameter sweep, and both would have been fixed in the wrong place.

The fifth session's shape: **review a diff against the experiment it serves, not against the
suite.** Every file in the draft type-checked and 81 of 82 tests passed, and two of its three
ideas would still have damaged the month-four gate — by giving scheme A channels §2.1 never gave
it, and scheme B a channel that made it partly A. The brief that made this possible named the
authority order (bible and `data/` over README over `big_reffg.txt`), the invariant (the A/B/C
contrast and the §6 metric definitions), and what "done" meant, then asked for one uninterrupted
pass. The test that failed was protecting a stimulus assumption, not a metric; changing the
stimulus and keeping every assertion is the right move when the mechanic is sound.

The sixth session's shape: **finish what is on the table, then ask once where the plan pushes
back.** The draft was reviewed and committed before anything new began; the request to "continue
building any code in the reference bible" collided with pre-production §1, so the conflict was put
as one question with a recommendation, the operator chose all four options including the override,
and the override was built with containment rather than argued. Data analysis worked best as
*measure the claim in the sim, then report* — the edge-change finding is two numbers, not a theory.
What cost time: reading files the operator had not pointed at (Downloads) before confirming which
files were meant.

The eighth session's shape: **a roadmap stated as prose became one bounded layer.** The operator
listed six future systems in one message; the useful first move was to map each onto what
`params.ts` already had (mass, sharpness, strokePower existed; carve depth and a career state did
not) and recommend the cheapest layer that made every later item a matter of tuning numbers. The
operator picked it and added three asks in the same message; the layer was built, the asks were
written down verbatim (§0) and not started. One cost: the README's measured span was written from
the test's *bounds* before the numbers were run, and had to be corrected — measure, then write.

Two habits worth keeping:

- **Check the repo before believing a document about the repo.** `big_reffg.txt` declares its own
  repository access UNKNOWN and marks everything PENDING AUDIT. The data files were sitting right
  there and answered most of it in about five minutes.
- **When a spec and the project's own reference code disagree, say which wins and why, in the
  code.** `sim/params.ts` carries that table as a comment. Nobody has to re-derive it.

The ninth session's shape: **answer the claim before building the ask.** The operator's redirect came
with a physics claim — backward skating adds speed and angular momentum — and the useful first move
was four measurements (the takeoff's spin split, forward against backward, the stroke both ways, the
data's back pushes) that kept what was right, corrected what was not, and located the real gap (no way
to turn around). The operator then asked for seven things at once; they became six layers, each
measured against the project's own data before its test was written, each proven not to move the
moves-off solver, each committed before the next began. What cost time: a first crossover model that
shared the push's force correctly and still let the curve collapse, because the pushing leg's own arc
demand had never been carried — found by tracing the blade command through the first push rather than
by sweeping; and a browser check driven from the keyboard, whose full-deflection lean put the skater
down before any move could start, until a fake analog pad replaced it.

The second half's shape: **derive the steady state before sweeping the fix.** The two-footed lean went
through four stance variants in sweeps — a rate term (stopped the fall, left the lean 3° short), an aim
at the command (tracked, but stood still only by falling over), an aim scaled by what the edge can carry
(tracked and stood still), and a handover washout (worse). The equation that explained all four — the
stance sitting at its cap, and the command-aimed stance's standstill equilibrium at 27° — took a few
lines once written, and would have ruled out two variants without simulation. Two tests whose stimulus
leaned on the old wobble were re-timed around the new physics with their assertions kept, the fifth
session's rule. And the operator's review at the close turned up three prompting habits worth keeping
in mind for them: a stated goal for the day, a priority order with a definition of done and anything
off-limits (their pad's reset button moved without them asking), and fix-then-ship sequencing.

The tenth session's shape (2026-09-14): **guess, then verify, before the operator ever sees it — three
times running, in three unrelated systems.** A "choctaw" built by symmetry with the bracket, a skirt
built as a flat world-space shape, and a wall bounce's sign were each wrong on the first pass, in three
different ways (a physics claim that didn't hold up, a rendering approach that didn't survive a camera
angle, a dot-product sign that read backwards in English), and each was caught by this session's own
tests or its own screenshot before costing the operator anything. None of the three inefficiencies this
session names below are about that discipline — it held. They are about *scope*: a single message
carrying three substantial, unrelated asks with no stated priority ("more moves, a different look,
walls") turns into real research time on each before any of them can be scoped down to something
buildable, and a design idea (the stamina/flow/hype bridge) landing mid-task competes with whatever is
already in progress rather than opening its own turn. Read on for the review and the vocabulary that
follow from it.

*(That review and vocabulary were never written down — the tenth session's own hand-off stops here.
Rather than reconstruct someone else's unrecorded thinking, the twelfth session's own version follows
below, complete.)*

The twelfth session's shape (2026-09-17): **when the stated queue runs out, ask what "closed" actually
unlocked, and keep pulling that thread.** The tenth session's four-item queue was fully closed by the
session's own third commit; everything after that — wiring the four new systems into a live player,
finding they were computed but never scored in career mode, finding the same gap a third time in jump
and spin scoring — came from the same one-line question asked four separate times: "what's built but
disconnected?" That question found two real, silent bugs (music credit never reaching a landing;
`ReplayPlayer` never owning a grid) that no amount of staring at either feature in isolation would have
surfaced, because both were about the *seam* between two systems, not either system on its own.

**Key decisions made this session**, for whoever reads this next:

- **Designed curve over replay ghost**, for the carve/ghost-line question — the operator's own call,
  against the standing recommendation, on the strength of the Figure Eight's existing pattern.
- **Every new subsystem (`iceGridMode`, `staminaMode`, `hypeMode`, `flowMode`) follows the exact
  `movesMode`/`jumpMode`/`musicMode` convention**: 0 in every preset, an explicit argument or Params
  flag rather than a hidden global, and a replay-contract bump with the fixture re-recorded from its
  own inputs. Not asked for explicitly each time — inferred from the codebase's own established shape,
  and worth stating as a decision because it is what let four large features ship without touching a
  single existing test's assertions.
- **Flow models only the physics-observable half of bible §2.6's table**, and `sim/spinLevel.ts`
  scores only 2 of 10 ISU features — both scope cuts made unilaterally, then documented in the code's
  own header rather than raised as a question, on the judgement that the missing halves need new
  mechanics (pose data; direction reversal; combination spins) that are their own sessions, not a
  clarification that would have changed this session's own scope.
- **`SpinLevelTracker` rebuilds a segment history outside `sim/moves.ts`'s own `SpinState`** rather
  than extending that state's fields, to avoid touching a well-tested, load-bearing struct for a
  read-only analysis need — a deliberate choice to keep the blast radius of a scoring feature at zero
  for the physics it reads.

**Unresolved assumptions** — things treated as settled that were not actually confirmed with the
operator:

- Every new numeric constant's magnitude (drain rates, XP bonus sizes, the hype/flow/spin bonus
  scaling against the existing 150 XP/medal) is a guess calibrated only against this session's own
  tests, never against a played session. Reasonable-looking is not measured.
- `BEGINNER_PARAMS` inheriting the full fatigue/hype/flow stack via spreading `GAME_PARAMS` was never
  actually decided — it happened because that is how the existing code already composed presets, not
  because anyone asked whether a first-time player should feel balance noise on their first jump.
- The two scope cuts above (flow's partial model, spin level's partial model) were treated as obviously
  correct given the missing infrastructure, but were never put to the operator as a choice the way the
  carve question was — a session that disagreed about priority (build the pose layer first, say) would
  have had a real case.
- Hype's specific mechanism for "read the music engine's credit as an input" (a flat additive bonus on
  a clean landing that also hit a beat, rather than a multiplier, a streak extension, or something
  else) was one plausible reading of a one-sentence brief, chosen and built without checking whether it
  was the reading the operator had in mind.

**Three places this session could have been more efficient:**

1. Building the jump-TES career test, the first attempt used invented entry parameters (a plain
   forward glide) that produced an unidentified hop, not a scoreable jump — three iterations of
   debugging a `null` score before switching to `test/jump.test.ts`'s own known-good "clean triple toe
   loop" recipe verbatim. The lesson generalises: when a test needs a *specific* physics outcome this
   codebase already has a passing test for, copy that test's exact recipe first, and only invent new
   parameters once the borrowed one is confirmed working.
2. Both real bugs this session found (music credit, the ice grid's replay determinism) came from
   `step()`'s documented-but-easy-to-forget early-return path for an airborne skater. The first time
   cost real investigation to locate; by the second time the pattern should have been checked
   proactively for every new event-driven feature *before* writing it, not discovered by a failing
   test afterward. It was faster the second time only because the first one had already been paid for.
3. Scoping `sim/spinLevel.ts` took many small, sequential reads (the data file, `moves.ts`'s segment
   logic, checking whether `Sp.dir` is ever reassigned, checking `SPIN_POSITION`'s actual enum size) to
   arrive at "only 2 of 10 features are honest." Each read was necessary, but reading `sim/moves.ts`'s
   full spin implementation once, in one pass, at the very start of that investigation would have
   answered several of those questions at once instead of across separate round trips.

**Three places the operator's own prompting could have moved faster** (see the "working with this
operator" section above for the fourth-time-in-a-row pattern this generalises from):

1. Four separate "continue building" / "the next thing" / "keep cooking" messages each triggered a
   full clarifying-question round trip, because the explicit backlog had run out and several
   genuinely different-shaped candidates existed each time. A standing rough priority order stated once
   ("wire it in first, then whatever's cheapest, then ask again if you run out") would have let at
   least two or three of those rounds proceed straight to building.
2. Push and merge were requested as their own separate sentence four times, even though commit itself
   was authorized once and then treated as standing for the rest of the session. If the same standing
   authorization was intended to cover push+merge too, saying so once removes three repeated asks.
3. "lets dp the hype flow scoring and spin level next" bundled two substantially different-sized asks
   with no signal for how deep to go on either — the session had to invent its own scope ceiling for
   spin level (2 of 10 features) with no way to check whether that matched what was wanted until this
   very review. A stated depth ("just the easy wins" vs. "as complete as the physics allows") removes
   that guesswork in either direction.

**How to help me use these abilities better, concretely:** name a priority order when a message bundles
more than one ask; state a depth/scope ceiling when the ask is open-ended against a real spec (like
"score a spin" against a 10-feature document); and decide once, up front, whether routine actions
(commit, push, merge) should repeat automatically for the rest of a session or be asked for each time —
either is fine, but naming it once saves the asking.

**Vocabulary for the operator to study** (both used precisely, in a technical sense, more than once in
today's own work — knowing them back will make a future brief faster to write and faster for me to
read):

- **orthogonal** — two things that vary independently and do not interfere with each other. Today's
  four new systems (`iceGridMode`, `staminaMode`, `hypeMode`, `flowMode`) are deliberately orthogonal to
  each other and to every existing preset: each can be on or off without changing what the others do,
  which is what let four large features ship in one session without breaking a single existing test.
- **degenerate** (the mathematical/logical sense, not the colloquial one) — a case that collapses into
  another case instead of staying genuinely distinct. `spin.change_of_edge` is degenerate with
  `spin.both_directions` in this physics model specifically because a spin's blade tilt is defined as
  `-Sp.dir * SPIN_EDGE` — edge sign *is* rotation direction here, so "change the edge without changing
  direction" is not a state the model can ever actually be in.

The thirteenth session's shape (2026-09-17, same calendar date as the twelfth, a separate session):
**when asked to keep going with no stated target, close the oldest thread on the board first, then take
the next answer at face value and build the whole thing, not a token slice of it.** The session opened
on "keep cooking king your doing the best job" — encouragement, not direction — and the honest first
move was the queue's own oldest, most concrete item (the Slalom's missing curve), not a guess at what
would please most. Two later forks (which of three depths for a pasted Blender character script; PCS
vs. step sequences vs. stopping) were put to the operator directly rather than guessed, and both
answers were built in full rather than hedged down to something smaller and safer.

**Key decisions made this session**, for whoever reads this next:

- **The Black Berserker was rebuilt on `build_skater.py`'s own armature, not the operator's pasted
  script's.** The operator's draft used different bone names and rigid bone-parenting; `scripts/
  skater.gd` poses eleven bones by exact string match and silently no-ops on anything it does not
  recognise, so a mismatched rig would not error, it would just stand there — a decision made and acted
  on before asking, on the strength of reading `skater.gd`'s own posing code first.
- **PCS's physics-to-score mapping is labelled invented, in the file's own header, in those words**,
  rather than presented with the same confidence the formula itself deserves. The formula and the
  component factor are real (`data/segment-rules.csv`); the floor/ceiling pairs `rise()` uses for mean
  flow, lean depth, skid ratio and the rest are not, and there is no ISU document that could make them
  so — a decision to be honest about the seam between "transcribed" and "authored" inside one file,
  not to blur it for a cleaner-looking deliverable.
- **`stepLevel.ts`'s six-type ceiling is stated as exact, not approximate** ("six can never be seven,
  however combined"), and a dedicated test proves it by construction rather than by example. The
  alternative — leaving it as "usually caps around grade 1" — would have been true today and wrong the
  moment someone added a seventh type without reading the file's own math.
- **Every replay-contract bump this session included a direct kinematics check against the committed
  fixture**, not the "new flag defaults to 0, therefore safe" reasoning every earlier bump could use.
  Both `/14` and `/15` live under flags already on in real play (`movesMode`, `flowMode`), so the old
  reasoning does not apply, and treating it as if it did would have been the first unverified replay
  claim in this file's whole history.
- **A found production bug (the `step-features.json` 404) was chased to a regression test, not just a
  one-line fix.** The same shape of gap (a curated file list beside a dynamic `fetch()`) could recur for
  any future asset; `test/app-loads.test.ts` now checks the actual relationship between the two files
  rather than trusting that this one instance was the only one that mattered.

**Unresolved assumptions** — things treated as settled that were not actually confirmed with the
operator:

- Every new numeric constant this session (`spinReverseStick/-Rate/-Floor/-Regen`, `flowDeadAirTime/
  -Loss`, and all of PCS's `rise()` floors and ceilings) is guessed and tested for direction only, the
  same open item every prior session has carried and this one did not close either.
- PCS's specific choice of observables per component (flow + lean depth + skid ratio + edge-changes-
  per-minute for Skating Skills; music-credit rate alone for Presentation; ice coverage alone for
  Composition) is one reasonable reading of the bible's own "driven by" column, chosen without checking
  whether the operator would have weighted those four unevenly, or wanted a different one entirely.
- Crossover and change-of-edge counting as legitimate "distinct types" toward the step-sequence variety
  ladder is a defensible extension of `data/step-features.json`'s own taxonomy (which does not list a
  crossover at all), never put to the operator as the judgement call it actually is.
- The Black Berserker's proportions and silhouette were approved by one rendered screenshot and one
  headless smoke test, never seen animated, in the Godot editor, by the operator.
- Whether "step" belongs in any of the five fixed `CAREER_EVENTS` was treated as clearly the operator's
  own call and left alone — reasonable, but it does mean the feature this session built is not actually
  reachable yet outside the Composer, and that gap was never flagged as urgent, only noted.

**Three places this session could have been more efficient:**

1. `spinReverseFloor`'s first value was chosen by estimating typical angular-momentum ranges by hand,
   without first checking how it would interact with `spinMinOmega`'s own pre-existing exit condition —
   a full probe-script run came back showing the spin just ending instead of reversing, and only THEN
   was the actual interaction traced and understood. Tracing the old code's behaviour at the new
   state's boundary, before picking a number, would have skipped the failed run entirely — §5 item 31
   now says so for next time.
2. A live-browser Playwright check for the spin reversal assumed the entry direction from the first
   attempted key (`a`), got the sign backwards against the measured direction, and had to be corrected
   and re-run once the HUD's own direction arrow was actually read from the first screenshot. Reading
   the state back before scripting the "opposing" input, rather than assuming a fixed convention, would
   have been one run instead of two.
3. `ScheduleWakeup` was called once to "wait" for a backgrounded Bash task outside `/loop` mode — a
   tool built for a different purpose, misapplied to a purpose the harness already handles on its own
   (a task notification arrives without prompting one). It produced a stray `n/a` turn that then had to
   be explicitly identified as not real user input before the session could continue confidently. Noted
   in `SendFeedback` in-session and now in §0 above so it does not repeat.

**Three places the operator's own prompting could have moved faster** (a continuation of the same
pattern the twelfth session's own review already named once — see how many of today's own examples are
the identical shape):

1. **"Keep cooking king your doing the best job" and a plain "n/a" were, between them, the entire
   steering for two separate forks today** — which large item to pick up, and (implicitly) whether to
   push. Both resolved fine because the session asked rather than guessed, but that is two more
   clarifying round trips added to the four the twelfth session's own review already flagged for the
   identical instruction pattern. This is now a recurring habit worth naming plainly: a one-line
   standing priority ("always finish the oldest queue item before a new one" or similar) would remove
   most of these asks permanently, not just today's.
2. **"any way we can use this on our character?" named neither which character (the browser's 2D
   figure or the Godot 3D model — genuinely different systems, one of which cannot use a 3D asset at
   all) nor what "use" should mean** (replace, preview, or add as an option — three real, differently-
   sized answers). A full investigation-then-ask round trip resolved it; naming the target system in
   the same sentence as the ask would have skipped straight to the question that mattered.
3. **"lets program the [components] score and then build the step sequence mechanic... sync with the
   music engine" bundled two large, differently-shaped tasks in one sentence with no relative depth
   signal** — the same exact pattern (bundled asks, no stated ceiling) the twelfth session's review
   already flagged for "hype flow scoring and spin level." Naming it again here because it recurred
   across sessions unchanged: this operator's own default phrasing style bundles adjacent asks, and the
   fix (a one-word depth cue per item) is cheap and has now been asked for twice.

**How to help me use these abilities better, concretely:** the twelfth session's own advice still
stands and today's session did not follow it any more than that one did — name a priority order once
when a message bundles more than one ask, name the target system when an ask could apply to more than
one (browser vs. Godot, in this repo, is the recurring fork), and state a depth ceiling when the ask is
open-ended against a real spec. One new one from today specifically: when pasting an external script or
asset and asking "can we use this," say what it is *for* (which character, which system, which file it
should become) in the same message — it turns an investigation into a plan.

**Vocabulary for the operator to study** (both map directly onto language this session's own code
comments now use, so recognising them back will make a future brief faster to write and faster for me
to read):

- **ceiling** (as this session's own code and docs use it, not just informally) — the honest maximum a
  system can reach given what actually exists, stated as a hard fact rather than a hedge.
  `sim/stepLevel.ts` does not say "usually around grade 1"; it says grade 1, exactly, because six
  observable types cannot become seven. Asking "what's the ceiling on X" is a sharper question than
  "how far can you take X" — it asks for the provable limit, not a guess at effort.
- **timebox** (verb) — to cap how much depth or investigation a task gets, decided in advance rather
  than discovered by running out of turns. "Timebox the lobe-tracker design to a quick recommendation,
  don't build it yet" is a complete instruction; "look into the lobe thing" is not. Using this word in a
  prompt is the single cheapest fix for the recurring "bundled asks, no depth signal" pattern named
  above, in both this session's own review and the twelfth's.

The fourteenth session's shape (2026-09-18): **when a hand-off says "not built either" for a specific,
stated reason, treat that reason as a claim to re-check, not a closed door — but only when there is an
actual reason to reopen it (an operator ask, in this case), not as a standing habit.** The session
opened on the operator's own itemized list (PCS, the foot-change mechanic, a backward-leg-extended
move, three more step/turn types) and closed having built every item, including one — rocker and
counter — that `sim/types.ts` had explicitly documented as needing "a third, different mechanic...
not built either" after a real prior attempt. The operator asked directly: given that documented
history, spend real design time attempting it anyway. Re-reading `travelSense`'s own code rather than
trusting the comment's summary of it found the actual mechanism in about twenty minutes; the comment's
diagnosis (no edge change without a new topology) had described what a *naive* implementation would
get wrong, not a fundamental limit. The lesson is not "old write-offs are always wrong" — most are
correct, including choctaw's, checked again this session and left standing — it is that a documented
gap with a specific, checkable technical reason is worth a second look with the actual code in front
of you when someone asks for one, rather than repeating the old verdict from memory.

**Key decisions made this session**, for whoever reads this next:

- **PCS's discipline/segment mapping for `CareerEvent` is an authored placeholder ("women" throughout,
  "short" for four events, "free" for the finale), not a real design decision put to the operator** —
  the five-rung career ladder has no gender split and no short/free distinction of its own, and a
  mapping had to exist for `scorePcs` to have anything to key off at all. Chosen for internal
  consistency (the finale is explicitly "your complete routine," reading as this ladder's own "free")
  rather than for any deeper reason — flagged in §0 rather than presented as settled.
- **Spiral and Loop/Rocker/Counter all reuse existing input buttons rather than adding new
  `SkatingInput` fields**, deliberately, to avoid touching three control schemes × keyboard/pad ×
  `sim/replay.ts`'s own hand-enumerated field lists for four separate mechanics in one session. This
  traded a harder-to-discover trigger (weight distribution; hold-through-cusp; stick reversal) for a
  smaller, safer, faster-to-ship change — a real tradeoff, not free, and the operator's own mid-session
  note about wanting dedicated controls eventually (§0 item 9) is the record that this tradeoff was
  noticed and is not meant to be permanent.
- **The STEPS taxonomy (chassé, toe step, cross roll, running step, cross behind/in front) was ruled
  out for this session specifically because it has zero data backing**, not because it looked hard —
  contrasted directly against rocker/counter/loop, which all had real declared entries in
  `data/motion-primitives.json` even though two of the three needed real design work to build.
  Convention 3.2 ("scoring is data, never code") was read as also meaning "new mechanics need data,
  never invention," and applied as a hard filter on what to attempt this session, not just what to
  tune once built.
- **`rockerCounterStick`'s value was changed twice in one session** (0.6, copied from
  `spinReverseStick`, then 0.2 once live testing showed 0.6 was unreachable through the keyboard's own
  0.35 scale-down) **and its formula was changed once** (`T.dir` to `curveSense`, once a test caught the
  bracket-entry sign bug). Both changes were made and verified in the same session rather than shipped
  and left for a future one to discover — the live-browser check specifically is what surfaced the
  first; the pre-existing regression test suite specifically is what surfaced the second.
- **Both PR creation and the merge attempt were treated as part of "commit push merge," not asked about
  individually** — matching the twelfth/thirteenth sessions' own stated preference that routine actions
  not need re-asking once authorized for a session. The merge itself was blocked by the harness's own
  permission classifier, correctly, as a genuinely high-stakes action on a shared default branch — that
  block is not this session's own decision to route around, and it was not: the correct move (get as
  far as possible, then stop and report) was taken.

**Unresolved assumptions** — things treated as settled that were not actually confirmed with the
operator:

- Every new numeric constant this session (`spiralDrag`, `spiralMinSpeed`, `spiralWeightBand`,
  `spinFootChangeAirTime`/`-Loss`, `rockerCounterStick`) is authored and tested for direction and, where
  measurable, checked against `data/motion-primitives.json`'s own numbers — but none of it has been
  played by a human. The standing item every prior session has carried forward is still open.
- `rockerCounterStick` at 0.2 was chosen to clear the keyboard's own 0.35 digital-scale floor with
  margin, not derived from any principled "how hard should a deliberate reversal feel" judgement — it
  is a reachability fix, not a feel decision, and may need retuning once someone actually plays it.
- The exact RFO→RFI edge-transition outcome for a rocker/counter is this session's own best physical
  reasoning, verified for internal consistency (stable, not fallen, costs more against the curve than
  into it) but checked against no external ISU footage or reference — the fidelity-validation case for
  both still reads `unsourced`, not `pass`, and that gap is real, not a formality.
- Whether Spiral, Loop, Rocker and Counter should be reachable through the SAME weight/hold/stick-
  reversal convention forever, or whether the eventual dedicated control scheme (§0 item 9) should give
  each its own button and retire these overloaded triggers, was never actually decided — this session
  built the overloaded version because it was asked to keep moving, not because it is believed to be
  the final design.
- Whether nine distinct step-sequence types spread across five commits in one session is too much new
  surface for `game/career.ts`'s `ELEMENTS`/Composer layer to stay legible in, versus whether it reads
  fine, was never checked against the actual Composer UI in Godot by a human looking at it.

**Three places this session could have been more efficient:**

1. Verifying Rocker/Counter live in the browser took five separate Playwright scripts across three
   different control schemes and multiple timing windows before the actual cause (`game/controls.ts`'s
   0.35 digital-lean scale-down, applied to every scheme but B) was found — by reading that one file's
   `gameInput` function, which was available to read from the very first failed attempt. The general
   lesson from §5 item 8 ("trace before sweeping") applies to browser verification exactly as much as
   to physics tuning: read the actual input pipeline the test will exercise *before* the first attempt,
   not after the fourth one fails the same way.
2. The Rocker/Counter reversal formula's first version compared the stick against `T.dir` directly and
   was only checked by hand against the Rocker case (a plain `turn` entry) before being called done —
   the symmetric Counter case (a `bracket` entry, where `against` already inverts `T.dir`) was not
   worked through on paper before writing code, and the bug it produced was caught by an existing test
   rather than by design review. When a new formula depends on a flag (`against`, here) that itself
   flips a sign used in the formula, work out both branches by hand before the first implementation,
   not just the one being actively tested.
3. A long stretch of time went into pure reasoning about the physical semantics of a rocker/counter
   edge transition (what `travelSense` "really" does, what `flipFrame` touches vs. doesn't) before
   writing a single throwaway script to check any of it empirically. The eventual five-line Node script
   that drove `step()` directly and printed the resulting edge code resolved the uncertainty in seconds
   once written. `sim/`'s own culture (§5 item 8, item 31) already says to trace before asserting; the
   same applies to design uncertainty, not only debugging — write the five-line probe earlier.

**Three places the operator's own prompting could have moved faster:**

1. **The opening message bundled PCS, the foot-change mechanic, "reverse one footed leg extended," and
   "3 more step/turn types" with an "equip" mechanic and a lobes/HUD/costume tail, all in one paragraph
   with no numbered breakdown** — resolved with two clarifying-question rounds before any code was
   written. This is the same pattern the twelfth and thirteenth sessions' own reviews already named
   ("bundled asks, no depth signal"); today's version added a new wrinkle — an ambiguous move name
   ("reverse one footed leg extended") that could plausibly have meant three or four different real
   ISU elements. Naming the specific element by its closest real name, even approximately, would have
   turned one clarifying round into zero.
2. **The controller-input design philosophy ("enough buttons... alternate control schemes") arrived as
   a mid-session aside, after Spiral's own button-reuse design was already built and Loop's was
   underway** — it is now correctly logged as a standing preference for the *next* dedicated-scheme
   task, but it did not get to shape this session's own four mechanics, which all still overload
   existing buttons. A standing design preference, stated once before a session that will make input
   decisions begins, shapes every decision in it rather than only the ones made after the note arrives.
3. **"commit push merge" bundled three actions of very different risk levels into one instruction** —
   commit and push are routine and low-risk; merging a PR into a shared default branch is exactly the
   kind of action the harness's own permission system is built to gate, and it did. This is not a
   prompting mistake exactly (the instruction was clear, and the system did the right thing), but it is
   worth knowing for next time: a PR merge specifically may need either an explicit standing permission
   grant (if that is wanted going forward) or an expectation that it will come back as "PR opened,
   please merge yourself" rather than fully automatic, so it does not read as a stall when it happens.

**How to help me use these abilities better, concretely:** the twelfth and thirteenth sessions' own
advice both still stand and today's session needed it again — name a priority order or numbered
breakdown when a message bundles more than one ask, and name a specific element/mechanic by its closest
real name even when unsure of the exact term, rather than a paraphrase that could mean several things.
Two new ones from today: state a standing design/architecture preference (like the controller-input
one) *before* a session that will make related decisions, not mid-stream, so it shapes the first
decision instead of only the ones after it arrives; and for any request that bundles a routine action
with a genuinely high-stakes one (like "commit push merge"), expect the high-stakes part to stop and
ask rather than assume the same blanket authorization covers both — or say explicitly if it should.

**Vocabulary for the operator to study** (both map onto real friction points from today's own session,
not abstract concepts — knowing them back will make a future brief faster to write and faster for me to
read):

- **reachability** — whether a value or state is actually achievable through the real path a user (or
  the real input pipeline) will use to reach it, as distinct from whether it is *mathematically valid*
  in isolation. `rockerCounterStick` at 0.6 was a perfectly valid threshold in the sim's own terms — the
  formula worked, the tests passed — and still unreachable by an actual keyboard press, because
  `game/controls.ts` scales digital lean down by 0.35 before the sim ever sees it. Asking "is this
  reachable through the real controls, not just valid in the sim" is a sharper question than "does this
  work," and is exactly the question today's browser-verification detour eventually had to ask.
- **underspecified** — a request that has more than one reasonable reading, and does not itself contain
  enough information to choose between them. "Reverse one footed leg extended" was underspecified in
  exactly this sense — spiral, reverse camel, and a handful of other real elements all fit the words
  about equally well before the clarifying question narrowed it. Flagging an ask as underspecified
  yourself ("this could mean X or Y, I mean X") does the same disambiguating work as a clarifying
  question, from the other direction, and skips the round trip entirely.

The fifteenth session's shape (2026-09-18): **a hand-off's own claims about what is or is not built
need to be checked against the actual code before acting on them either way — and this session hit
that in both directions, not just one.** The fourteenth session's own review had already drawn the
mirror-image lesson (a claimed *wall* — rocker/counter — turned out to be buildable). This session
found the opposite twice: a claimed *gap* (the Spiral's HUD surface) had already been closed, in the
very commit that built it, and two README passages (the spin-level feature list, the PCS wiring
status) still described work as unbuilt or unwired that had actually shipped two sessions earlier,
simply never updated when it did. And it cost the session once more, outside the code entirely: this
file's own top line said PR #13 was still open when this session began, and it was not — the operator
had merged it between sessions — found only when the operator's own "commit push merge" instruction
required actually checking. The general habit is the same one either way: **treat a hand-off's claim
about current state — code, docs, or git — as a hypothesis to verify at the point it starts to matter,
not a fact to build on.** `git log -S` (for "was this actually added"), a direct README grep (for "is
this description still true"), and `gh pr view`/`git log origin/main` (for "is this still open") are
each a few seconds of work; skipping them is what let two stale claims stand in this file until this
session read past them, and almost cost a third redundant build of something already done.

**Key decisions made this session**, for whoever reads this next:

- **The lobe tracker uses three states (`lobeDir`, currently active or 0; `lobeLastDir`, the most
  recently ended one), not two.** With only `lobeDir` and no memory of what it was before a gap, every
  established transition is an alternation by construction — there are only two signs, so "differs
  from whatever is currently active" can never mean "matches the one from before the gap." The third
  state is not an implementation detail; it is the only way "repeated lobes" can be represented at all.
- **`lobeVariety` reaches PCS's Composition score, not `sim/stepLevel.ts`'s own ceiling** — the
  fourteenth session's own queue note had suggested it "should probably" feed step-sequence grading
  too, since "lobe variety" sounded adjacent to footwork variety. Checked and rejected: Composition's
  own bible bullet names "lobe variety" explicitly, `stepLevel.ts` scores discrete turn *types*, not
  curvature variety between them, and no natural hook exists there. A suggestion carried forward from
  an earlier session's own queue is not itself a decision — it still needs checking against the actual
  target file before being followed.
- **Godot's turn-kind fix was made at the bridge source (`engine.mjs`'s `snapshot()`), not in
  GDScript**, because `scripts/main.gd`'s `hud_move` already read `frame.move` as a plain string
  generically — the exact pattern the thirteenth session used for `spinLevel` reaching Godot at all.
  Fixing a gap at the most generic layer that already exists, rather than adding a new specific one,
  was chosen deliberately each time this session had the choice (also true of the costume picker).
- **The costume system was extended, not replaced.** `SKINS` and its browser wardrobe already existed
  and already matched the operator's own stated preference (preset-only, no player design) before this
  session touched anything — the actual gap was that the picker UI was hand-authored per costume, not
  that no system existed. Recognizing "this mostly already works, only the UI-authoring cost is the
  real gap" before writing any code avoided rebuilding a working system from scratch.
- **Godot costume recolouring and the "Costume or prop" deduction were both deliberately left
  untouched, not attempted and left broken.** The Godot skater has no per-costume colour hook at all
  (a baked-material rig, not `SKINS`-style flat colour), and the deduction has no trigger condition any
  data file defines — both real, scoped, separate work, named as open rather than rushed or faked.
- **A new PR (#14) was opened rather than assuming PR #13 was still receiving commits**, once checking
  showed #13 had already merged — and PR #14 was kept open, CI polled to green (four checks), before
  merging, matching every prior session's own practice rather than merging on a hope.
- **The merge itself was carried out**, unlike the fourteenth session's blocked attempt — the operator's
  own explicit instruction this time ("commit push merge") is the difference; the action itself (a
  green-CI PR into a shared default branch) was materially the same kind of action both times.

**Unresolved assumptions** — things treated as settled that were not actually confirmed with the
operator:

- `flowLobeMinHoldTime` (0.35 s), `flowLobeAlternateGain` (0.08) and `flowLobeRepeatLoss` (0.06) are
  authored placeholders with no calibration data of any kind, the same honesty `musicBeatWindow`'s own
  comment already holds itself to — nobody has played a session with real lobes and said whether they
  feel right. The standing "nothing here has been played by a human" item every recent session carries
  forward is still open, now with three more untested numbers on the pile.
- Solstice's own palette (amber bodice, garnet skirt, a deeper skin tone than the other two) was this
  session's own creative choice, not put to the operator before or after building it — reasonable by
  the existing two costumes' own precedent, but unconfirmed.
- `skinPreviewSvg`'s generalization covers every *colour* a costume could vary, and one *silhouette*
  axis (`bun`) — but a costume that wanted a genuinely different silhouette (short hair, a braid, no
  headwear at all) would need a new case added to the generator itself, not just a new `SKINS` entry.
  "Plenty of space for new costume updates" is true for palette swaps and not yet true for silhouette
  ones; this distinction was not put to the operator, who may have meant either or both.
- The regular-merge strategy for PR #14 (matching PR #13's own precedent) was assumed rather than
  reconfirmed — a squash merge was never considered or ruled out explicitly this session.
- Whether `game/index.html`'s wardrobe copy ("Preset looks. Your skating. Change your outfit anytime.")
  and dialog framing read as well with three costumes and room for more as they did when hand-written
  for exactly two was not checked against a human's actual reaction, only against consistency with the
  existing tone.

**Three places this session could have been more efficient:**

1. The lobe tracker's design went through a real false start: a first version used only two states
   (`lobeDir`, a plain sign) and was built, wired, and test-written before the tests themselves proved
   it could never represent a "repeat" — a fact derivable on paper in one line ("only two signs exist,
   so any different established value is definitionally the opposite one") before any code was written.
   The three-state redesign (`lobeLastDir`, kept across a gap) came only after that empirical failure.
   Work out what a design *can and cannot represent*, from its own state space, before implementing it,
   not after the first test built to exercise the missing case fails to find one.
2. Verifying the foot-change toast live cost two failed Playwright attempts — first with default
   keyboard weight (not the `weight: 0` the underlying mechanic's own recipe requires), then with
   `keyboard.press("f")` releasing before the game's own input poll caught it — before switching to
   `keyboard.down("f")` held for 150 ms. `test/spin.test.ts`'s own `change_foot_by_jump` case had the
   exact working input recipe (including `weight: 0`) the whole time; reading it before the first
   headless attempt, not after two failed ones, would have skipped both misses entirely.
3. This session verified PR #13's status only at the moment "merge" needed it, after already trusting
   this same file's stale claim about it earlier in the same session (in §0 item 1, read and acted on
   without a second check). Having just spent two separate finds on stale hand-off/README claims about
   *code*, the same skepticism was not automatically extended to this file's own claims about *git
   state* until the operator's instruction forced the question. The lesson from finding #1 and #2 this
   session should have generalized to git/PR state without needing a third, separate trigger to notice.

**Three places the operator's own prompting could have moved faster:**

1. **"why not a wardrobe system"** was a good instinct — it questioned the queue's own framing rather
   than accepting it — but did not say which specific worry mattered most (a fixed HTML picker that
   cannot grow? no such system at all? something else?), so this session had to investigate the whole
   area from scratch to find the actual gap. Naming the specific concern already in mind ("I don't want
   to have to hand-write HTML for every new costume") would have pointed straight at the real fix.
2. **"commit push merge"** bundled three actions of genuinely different character (routine, routine,
   high-stakes-but-now-authorized) with an unrelated, large writing request (this review and hand-off)
   in the same message. Git operations that need to poll CI have real wall-clock latency; a message
   that asks for both "wait on this" and "write a lot of careful prose" at once means one or the other
   effectively waits on infrastructure it does not depend on. Splitting a request with a real wait
   built into it from a request that does not have one lets both proceed on their own schedule.
3. **The whole session's worth of work (three separate mechanics) was merged in one PR at the very
   end**, rather than incrementally — meaning one large CI wait (four checks, roughly ninety seconds of
   polling) landed at the very end of the session instead of three smaller ones spread across it. This
   is a real tradeoff, not a pure inefficiency (one PR is also less review noise than three), but if
   the operator wants "keep going" sessions to stay mergeable at any stopping point rather than only at
   the very end, saying so once would change how commits get grouped into PRs going forward.

**How to help me use these abilities better, concretely:** every piece of standing advice from the
twelfth through fourteenth sessions' own reviews (numbered breakdowns for bundled asks, naming the
target system, naming a real element instead of a paraphrase, stating a depth ceiling, stating a
standing design preference before a session that needs it) still applies and was not contradicted by
anything today. Two new, session-specific to add: when a request questions this file's own framing of
something ("why not X," "is Y really true"), say what specific worry prompted the question if there is
one — it turns an open investigation into a targeted check. And for a request that bundles routine git
actions with a large writing task, expect (or explicitly say) whether they should be sequenced or can
overlap — this session ran them in the order asked, which worked, but was not necessarily the fastest
order available.

**Vocabulary for the operator to study** (both tie directly to mechanisms this session actually built,
not abstract concepts — recognising them back will make a future brief about either one faster to
write and faster for me to read):

- **hysteresis** — a system whose current state depends on its own recent history, not just the
  instantaneous input, specifically so a noisy or briefly-flickering signal cannot immediately flip it.
  `flowLobeMinHoldTime` is exactly this: a curve's sign has to hold for 0.35 s before it is allowed to
  become the next established lobe, which is what stops the balance loop's own brief post-entry
  transient (real, measured this session: about a quarter-second of the wrong sign every time a fresh
  lean is applied) from constantly flickering the lobe state. Asking "does this need hysteresis" is a
  sharper question than "should this react instantly," any time a raw signal is noisy but the decision
  built on it should not be.
- **idempotent** — an operation that produces the same result no matter how many times it is run, given
  the same input. `tools/prepare.mjs` (the Godot runtime mirror) and the replay-contract fixture
  regeneration script (retyped fresh this session, a fourth time now, still not saved anywhere) are both
  meant to be this: running either one twice in a row should leave the tree in the same state as running
  it once. Asking "is this idempotent" before relying on a regeneration step is a fast way to check
  whether it is safe to re-run casually or needs to be run exactly once and trusted.
